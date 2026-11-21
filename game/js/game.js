// game/js/game.js — WILWATIKTA: A Sugeng Story. Logika game open-world 3D.
// Game crime open-world di kota pesisir Jawa Wilwatikta, dibintangi Sugeng.
// Semua orisinal: tidak ada nama, karakter, atau aset dari game komersial.
// Memakai kota dari ./city.js (renderCity + data CITY); semua suara disintesis
// WebAudio (tanpa file audio); tidak ada request jaringan.
//
// Dipakai index.html:
//   import { startGame } from './js/game.js';
//   startGame(document.getElementById('game'));

import { CITY, renderCity, isBlocked, groundHeight, randomSpawnPoint, project, districtAt } from './city.js';

// ---------- util ----------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2d(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function fmtRp(n) { return 'Rp ' + Math.round(n).toLocaleString('id-ID'); }
function fmtClock(mins) {
  const h = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry(20261122);
function rand(a, b) { return a + rng() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

// ---------- audio: semua disintesis WebAudio ----------
const AudioSys = {
  ctx: null, master: null, radioOn: false, radioTimer: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null, sirenStep: 0,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 50;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0; this.engineOsc.connect(this.engineGain); this.engineGain.connect(this.master); this.engineOsc.start();
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'square'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0; this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master); this.sirenOsc.start();
    } catch (e) { this.ctx = null; }
  },
  tone(freq, dur, type, vol, when) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  // gamelan pentatonik (slendro): bonang + saron bergantian
  radioTick(step) {
    if (!this.ctx) return;
    const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
    const n = scale[step % scale.length];
    this.tone(n, 0.9, 'sine', 0.16);
    this.tone(n * 2, 0.5, 'triangle', 0.06);
    if (step % 4 === 0) this.tone(130.8, 1.2, 'sine', 0.12);
    if (step % 8 === 6) { this.tone(392.0, 0.4, 'sine', 0.1, 0); this.tone(523.3, 0.4, 'sine', 0.1, 0.15); }
  },
  setRadio(on) {
    this.radioOn = on;
    if (!this.ctx) return;
    if (on && !this.radioTimer) {
      let s = 0;
      this.radioTimer = setInterval(() => { this.radioTick(s++); }, 340);
    } else if (!on && this.radioTimer) { clearInterval(this.radioTimer); this.radioTimer = null; }
  },
  setEngine(rpm) { if (this.engineGain) this.engineGain.gain.value = clamp(rpm, 0, 1) * 0.05; if (this.engineOsc) this.engineOsc.frequency.value = 45 + rpm * 90; },
  setSiren(on) {
    if (!this.sirenGain) return;
    this.sirenGain.gain.value = on ? 0.035 : 0;
    if (on && this.sirenOsc) this.sirenOsc.frequency.value = (this.sirenStep++ % 2 === 0) ? 700 : 950;
  },
  jingle() { if (!this.ctx) return; [523.3, 659.3, 784.0, 1046.5].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.2, i * 0.13)); },
  thud() { this.tone(70, 0.18, 'sine', 0.3); },
  pickup() { this.tone(880, 0.12, 'sine', 0.15); this.tone(1318.5, 0.15, 'sine', 0.12, 0.08); },
};

// ---------- data misi: 12 misi, dialog Jawa ----------
const MISSIONS = [
  { title: 'Kenalan', brief: 'Sugeng baru sampai di Wilwatikta. Temui Agus di Keraton, Alun-Alun.', who: 'Agus', lines: ['Sugeng: "Akhirnya sampai, Mas Agus."', 'Agus: "Selamat datang di Wilwatikta, Le. Ikut aku, ada kerjaan."'], stages: [{ kind: 'reach', x: 0, z: -315, r: 14, text: 'Pergi ke Keraton, Alun-Alun' }], reward: 50000 },
  { title: 'Antar Paket', brief: 'Antar paket batik ke Pasar Gede sebelum waktu habis.', who: 'Mbak Sari', lines: ['Mbak Sari: "Paket ini harus sampai sebelum jam 10, ya, Le."', 'Sugeng: "Siap, Mbak. Gas!"'], stages: [{ kind: 'reach', x: -385, z: 20, r: 16, text: 'Antar paket ke Pasar Gede', time: 75 }], reward: 75000 },
  { title: 'Taksi Gelap', brief: 'Jemput penumpang di Kauman, antar ke Pelabuhan.', who: 'Wanto', lines: ['Wanto: "Ada penumpang nunggu di Kauman. Jangan telat."', 'Penumpang: "Pelabuhan, Mas. Cepat sedikit."'], stages: [{ kind: 'reach', x: 385, z: -315, r: 12, text: 'Jemput penumpang di Kauman' }, { kind: 'reach', x: 0, z: -470, r: 16, text: 'Antar penumpang ke Pelabuhan' }], reward: 90000 },
  { title: 'Kejar-Kejaran', brief: 'WPD mengejarmu. Hilangkan bintang wanted-mu.', who: 'Agus', lines: ['Agus: "Polisi di belakangmu! Sembunyi sampai mereka pergi."', 'Sugeng: "Tenang, aku hafal jalan tikus."'], stages: [{ kind: 'loseWanted', text: 'Hilangkan wanted level (sembunyi dari polisi)', startWanted: 2 }], reward: 100000 },
  { title: 'Batik Kilat', brief: 'Kumpulkan 5 bundel batik di Kampung Batik.', who: 'Mbak Sari', lines: ['Mbak Sari: "Lima bundel batik tersebar di kampung. Kumpulkan semua."', 'Sugeng: "Batik Laras memang paling dicari."'], stages: [{ kind: 'collect', items: [[-480, -380], [-300, -260], [-420, -220], [-280, -400], [-380, -320]], r: 7, text: 'Kumpulkan bundel batik (0/5)' }], reward: 120000 },
  { title: 'Malam di Malioboro', brief: 'Malam hari, bawa mobil menyusuri Malioboro sampai ujung selatan.', who: 'Wanto', lines: ['Wanto: "Malioboro malam itu cantik, Le. Bawa mobilmu jalan-jalan."', 'Sugeng: "Lampu neon, kopi jos... ini baru hidup."'], stages: [{ kind: 'reach', x: 0, z: 560, r: 16, text: 'Sampai ujung selatan Malioboro (malam)' }], reward: 110000, night: true },
  { title: 'Pelabuhan', brief: 'Ambil peti di dermaga Pelabuhan tanpa ketahuan polisi.', who: 'Agus', lines: ['Agus: "Petinya di dermaga barat. Jangan sampai ketahuan."', 'Sugeng: "Pelan-pelan saja, seperti bayangan."'], stages: [{ kind: 'reach', x: -380, z: -470, r: 10, text: 'Ambil peti di dermaga Pelabuhan' }, { kind: 'reach', x: 0, z: 70, r: 18, text: 'Bawa peti ke Jl. Malioboro' }], reward: 150000 },
  { title: 'Balapan Liar', brief: 'Balapan jalanan: lewati 5 checkpoint secepat mungkin.', who: 'Wanto', lines: ['Wanto: "Lima checkpoint, siapa tercepat dia menang."', 'Sugeng: "Mesin sudah panas. Ayo!"'], stages: [{ kind: 'checkpoint', points: [[0, 70], [-380, 210], [0, 420], [380, 210], [0, -170]], r: 12, text: 'Checkpoint balapan' }], reward: 200000 },
  { title: 'Rampok Mini', brief: 'Rampok toko di Pasar Gede, lalu kabur dari kejaran 3 bintang.', who: 'Agus', lines: ['Agus: "Satu toko saja. Ambil, lalu kabur."', 'Sugeng: "Ini terakhir kalinya, Mas."'], stages: [{ kind: 'reach', x: -385, z: 20, r: 12, text: 'Masuk toko di Pasar Gede' }, { kind: 'loseWanted', text: 'Kabur! Hilangkan wanted level', startWanted: 3 }], reward: 250000 },
  { title: 'Antar Bos', brief: 'Antar Pak Darma, bos besar, keliling kota dengan selamat.', who: 'Pak Darma', lines: ['Pak Darma: "Bawa mobil yang halus, Nak. Aku tidak suka guncangan."', 'Sugeng: "Siap, Pak. Duduk yang nyaman."'], stages: [{ kind: 'reach', x: 385, z: 20, r: 14, text: 'Antar Pak Darma ke Perumahan' }, { kind: 'reach', x: 0, z: -315, r: 14, text: 'Antar Pak Darma kembali ke Keraton' }], reward: 220000 },
  { title: 'Badai', brief: 'Senja berangin: antar obat ke Tugu sebelum gelap.', who: 'Mbak Sari', lines: ['Mbak Sari: "Obat ini untuk Mbah di dekat Tugu. Cepat, Le."', 'Sugeng: "Badai pun tidak bisa menghentikanku."'], stages: [{ kind: 'reach', x: 0, z: -315, r: 12, text: 'Antar obat ke Tugu, Alun-Alun', time: 90 }], reward: 180000, dusk: true },
  { title: 'Legenda Wilwatikta', brief: 'Finale: ambil mahkota batik di Pelabuhan, kabur dari 5 bintang, kembali ke Keraton.', who: 'Agus', lines: ['Agus: "Ini dia, Le. Satu pekerjaan terakhir."', 'Sugeng: "Setelah ini, namaku jadi legenda Wilwatikta."'], stages: [{ kind: 'reach', x: 0, z: -470, r: 12, text: 'Ambil mahkota batik di Pelabuhan' }, { kind: 'loseWanted', text: 'Kabur dari kejaran 5 bintang!', startWanted: 5 }, { kind: 'reach', x: 0, z: -315, r: 14, text: 'Kembali ke Keraton, Alun-Alun' }], reward: 500000 },
];

// ---------- state ----------
const SAVE_KEY = 'wilwatikta-save-v22';
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); return { unlocked: s.unlocked || 0, money: s.money || 100000 }; }
  catch (e) { return { unlocked: 0, money: 100000 }; }
}
function storeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ unlocked: G.missionIndex, money: G.money })); } catch (e) {}
}

const G = {
  canvas: null, ctx: null, W: 1280, H: 720,
  state: 'title', // title | playing | paused | passed | busted | wasted
  time: 0, clock: 8 * 60, // menit sejak 00:00
  timeOfDay: 'day',
  money: 100000, missionIndex: 0, stageIndex: 0, stageTimer: 0, stageT: 0,
  wanted: 0, wantedHeat: 0, hideTimer: 0, bustedTimer: 0,
  health: 100, score: 0,
  keys: {}, camYaw: Math.PI, camPitch: 0.32, camDist: 13, orbit: 0,
  mouseDown: false, lastMX: 0, lastMY: 0,
  subtitle: '', subtitleT: 0, lineIndex: 0, lineT: 0,
  message: '', messageT: 0, passedReward: 0,
  player: null, cars: [], traffic: [], peds: [], police: [], heli: null,
  collectLeft: 0, checkpointIndex: 0,
  cam: { x: 0, y: 8, z: 0, yaw: 0, pitch: 0.32 },
};

function currentMission() { return MISSIONS[G.missionIndex]; }
function currentStage() { const m = currentMission(); return m ? m.stages[G.stageIndex] : null; }

// ---------- input ----------
function setupInput() {
  window.addEventListener('keydown', (e) => {
    G.keys[e.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    AudioSys.init();
    if (e.key === 'Enter') onEnter();
    if (e.key.toLowerCase() === 'p' && G.state === 'playing') { G.state = 'paused'; }
    else if (e.key.toLowerCase() === 'p' && G.state === 'paused') { G.state = 'playing'; }
    if (e.key.toLowerCase() === 'r' && G.state === 'playing') { AudioSys.setRadio(!AudioSys.radioOn); showMessage(AudioSys.radioOn ? 'Radio gamelan: ON' : 'Radio gamelan: OFF'); }
    if (e.key.toLowerCase() === 'e' && G.state === 'playing') tryEnterExitCar();
    if (e.key.toLowerCase() === 'm') { G.money += 0; showMessage('Peta: ' + (districtAt(G.player.x, G.player.z) || 'Wilwatikta')); }
  });
  window.addEventListener('keyup', (e) => { G.keys[e.key.toLowerCase()] = false; });
  G.canvas.addEventListener('mousedown', (e) => { G.mouseDown = true; G.lastMX = e.clientX; G.lastMY = e.clientY; AudioSys.init(); });
  window.addEventListener('mouseup', () => { G.mouseDown = false; });
  window.addEventListener('mousemove', (e) => {
    if (!G.mouseDown) return;
    G.orbit += (e.clientX - G.lastMX) * 0.005;
    G.camPitch = clamp(G.camPitch + (e.clientY - G.lastMY) * 0.003, 0.12, 0.7);
    G.lastMX = e.clientX; G.lastMY = e.clientY;
  });
  G.canvas.addEventListener('wheel', (e) => { e.preventDefault(); G.camDist = clamp(G.camDist + e.deltaY * 0.01, 7, 22); }, { passive: false });
  G.canvas.addEventListener('click', () => { AudioSys.init(); if (G.state === 'title') onEnter(); });
}

function onEnter() {
  if (G.state === 'title') { startMission(G.missionIndex); G.state = 'playing'; AudioSys.setRadio(true); }
  else if (G.state === 'passed') { G.state = 'playing'; }
  else if (G.state === 'busted' || G.state === 'wasted') { respawnPlayer(); G.state = 'playing'; }
}

function showMessage(text, dur) { G.message = text; G.messageT = dur || 3; }
function showSubtitle(text, dur) { G.subtitle = text; G.subtitleT = dur || 4; }

// ---------- spawn dunia ----------
const CAR_MODELS = [
  { name: 'Sedan', color: '#c94f6d', len: 4.4, w: 1.9, top: 24 },
  { name: 'Angkot', color: '#3fa7a0', len: 4.8, w: 2.0, top: 20 },
  { name: 'Pickup', color: '#d9a441', len: 4.6, w: 1.9, top: 18 },
  { name: 'Taksi', color: '#f2e3c6', len: 4.3, w: 1.9, top: 16 },
  { name: 'Sedan', color: '#2b4a7f', len: 4.4, w: 1.9, top: 14 },
  { name: 'Sedan', color: '#8f4a3a', len: 4.2, w: 1.8, top: 12 },
];

function spawnWorld() {
  const sp = randomSpawnPoint();
  G.player = { x: sp.x, z: sp.z, yaw: sp.yaw, speed: 0, inCar: null, hp: 100 };
  G.cars = [];
  for (let i = 0; i < 10; i++) {
    const p = randomSpawnPoint();
    const m = CAR_MODELS[i % CAR_MODELS.length];
    G.cars.push({ x: p.x + rand(-6, 6), z: p.z + rand(-6, 6), yaw: p.yaw + rand(-0.3, 0.3), speed: 0, model: m, parked: true, driver: false });
  }
  G.traffic = [];
  for (let i = 0; i < 12; i++) {
    const p = randomSpawnPoint();
    const m = CAR_MODELS[randi(0, CAR_MODELS.length - 1)];
    G.traffic.push({ x: p.x, z: p.z, yaw: p.yaw, speed: rand(6, 11), model: m, road: null, target: null });
  }
  G.peds = [];
  for (let i = 0; i < 22; i++) {
    const p = randomSpawnPoint();
    G.peds.push({ x: p.x + rand(-8, 8), z: p.z + rand(-8, 8), yaw: rand(0, Math.PI * 2), speed: rand(0.8, 1.6), flee: false, color: pick(['#e8b23e', '#d95f43', '#3fa7a0', '#5b7fb8', '#c94f6d', '#f2e3c6']) });
  }
  G.police = []; G.heli = null; G.wanted = 0; G.wantedHeat = 0; G.hideTimer = 0;
}

function respawnPlayer() {
  const sp = randomSpawnPoint();
  G.player.x = sp.x; G.player.z = sp.z; G.player.yaw = sp.yaw; G.player.inCar = null; G.player.hp = 100;
  G.health = 100; G.wanted = 0; G.police = []; G.heli = null; G.hideTimer = 0;
  showMessage('Sugeng kembali ke jalanan Wilwatikta.');
}

// ---------- mobil pemain ----------
function nearestCar(maxD) {
  let best = null, bd = maxD;
  const all = G.cars.concat(G.traffic);
  for (const c of all) {
    const d = dist2d(G.player.x, G.player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function tryEnterExitCar() {
  const p = G.player;
  if (p.inCar) {
    const c = p.inCar;
    const nx = c.x + Math.sin(c.yaw + Math.PI / 2) * 2.5, nz = c.z + Math.cos(c.yaw + Math.PI / 2) * 2.5;
    if (!isBlocked(nx, nz)) { p.x = nx; p.z = nz; p.yaw = c.yaw; p.inCar = null; showMessage('Sugeng keluar dari mobil.'); }
    return;
  }
  const c = nearestCar(5);
  if (c) {
    p.inCar = c; c.parked = false; c.driver = true;
    const idx = G.traffic.indexOf(c);
    if (idx >= 0) G.traffic.splice(idx, 1);
    if (G.wanted < 1) addWanted(1);
    showMessage('Sugeng mengambil ' + c.model.name + ' — WPD memperhatikan!');
    AudioSys.thud();
  } else {
    showMessage('Tidak ada mobil di dekat sini.');
  }
}

function addWanted(n) {
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.wantedHeat = 100;
  if (G.wanted >= 1 && G.police.length === 0) spawnPolice();
}

function spawnPolice() {
  const n = Math.min(2 + G.wanted, 6);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = rand(40, 70);
    const x = clamp(G.player.x + Math.sin(a) * d, -580, 580), z = clamp(G.player.z + Math.cos(a) * d, -580, 580);
    G.police.push({ x, z, yaw: 0, speed: 0, car: i % 2 === 0, catchT: 0, color: '#f5f0e6' });
  }
  if (G.wanted >= 3 && !G.heli) G.heli = { angle: 0, h: 60 };
  showMessage('WPD mengejar! Bintang wanted: ' + '★'.repeat(G.wanted));
}

// ---------- update pemain & mobil ----------
function moveWithCollision(e, nx, nz) {
  if (!isBlocked(nx, e.z)) e.x = nx;
  if (!isBlocked(e.x, nz)) e.z = nz;
}

function updatePlayer(dt) {
  const p = G.player, k = G.keys;
  const fwd = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
  const turn = (k['a'] || k['arrowleft'] ? 1 : 0) - (k['d'] || k['arrowright'] ? 1 : 0);
  if (p.inCar) {
    const c = p.inCar;
    const accel = fwd * 14, brake = (k[' '] ? 22 : 0);
    c.speed += accel * dt;
    if (brake) c.speed = Math.max(0, c.speed - brake * dt);
    c.speed *= (1 - 0.4 * dt);
    c.speed = clamp(c.speed, -8, 26);
    if (Math.abs(c.speed) > 0.3) c.yaw += turn * 1.5 * dt * Math.sign(c.speed) * clamp(Math.abs(c.speed) / 8, 0.3, 1);
    const nx = c.x + Math.sin(c.yaw) * c.speed * dt, nz = c.z + Math.cos(c.yaw) * c.speed * dt;
    if (isBlocked(nx, nz)) { c.speed *= -0.25; AudioSys.thud(); G.health = Math.max(0, G.health - 1); }
    else { c.x = nx; c.z = nz; }
    p.x = c.x; p.z = c.z; p.yaw = c.yaw;
    AudioSys.setEngine(Math.abs(c.speed) / 26);
    // tabrak pejalan kaki
    for (const pd of G.peds) {
      if (dist2d(c.x, c.z, pd.x, pd.z) < 2.2 && Math.abs(c.speed) > 3) { pd.flee = true; if (G.wanted < 2) addWanted(1); }
    }
  } else {
    const sprint = (k['shift']) ? 1.8 : 1;
    const sp = 5.2 * sprint;
    const camF = G.camYaw;
    let mx = 0, mz = 0;
    if (fwd) { mx += Math.sin(camF) * fwd; mz += Math.cos(camF) * fwd; }
    if (turn) { mx += Math.sin(camF + Math.PI / 2) * turn; mz += Math.cos(camF + Math.PI / 2) * turn; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      p.yaw = angleLerp(p.yaw, Math.atan2(mx, mz), 0.25);
      moveWithCollision(p, p.x + mx * sp * dt, p.z + mz * sp * dt);
    }
    AudioSys.setEngine(0);
  }
}

// ---------- lalu lintas & pejalan kaki ----------
function updateTraffic(dt) {
  for (const t of G.traffic) {
    const ahead = { x: t.x + Math.sin(t.yaw) * 8, z: t.z + Math.cos(t.yaw) * 8 };
    const pd = dist2d(t.x, t.z, G.player.x, G.player.z);
    let target = t.speed;
    if (pd < 10) target = 0; // berhenti untuk pemain
    if (isBlocked(ahead.x, ahead.z)) {
      t.yaw += Math.PI / 2 * (rng() < 0.5 ? 1 : -1); // belok di ujung jalan
      t.x = clamp(t.x, -580, 580); t.z = clamp(t.z, -580, 580);
    }
    t.speed = lerp(t.speed, target, dt);
    t.x += Math.sin(t.yaw) * t.speed * dt;
    t.z += Math.cos(t.yaw) * t.speed * dt;
  }
  for (const pd of G.peds) {
    if (pd.flee) {
      const d = dist2d(pd.x, pd.z, G.player.x, G.player.z);
      if (d < 30) {
        const a = Math.atan2(pd.x - G.player.x, pd.z - G.player.z);
        moveWithCollision(pd, pd.x + Math.sin(a) * 3.2 * dt, pd.z + Math.cos(a) * 3.2 * dt);
        pd.yaw = a;
      } else pd.flee = false;
    } else {
      const nx = pd.x + Math.sin(pd.yaw) * pd.speed * dt, nz = pd.z + Math.cos(pd.yaw) * pd.speed * dt;
      if (isBlocked(nx, nz) || rng() < 0.002) pd.yaw = rand(0, Math.PI * 2);
      else { pd.x = nx; pd.z = nz; }
      if (G.wanted > 0 && dist2d(pd.x, pd.z, G.player.x, G.player.z) < 12) pd.flee = true;
    }
  }
}

// ---------- polisi & helikopter ----------
function updatePolice(dt) {
  if (G.wanted <= 0) {
    if (G.police.length) { G.police = []; G.heli = null; AudioSys.setSiren(false); }
    return;
  }
  AudioSys.setSiren(true);
  const p = G.player;
  // polisi mendekat
  for (const po of G.police) {
    const d = dist2d(po.x, po.z, p.x, p.z);
    const want = Math.atan2(p.x - po.x, p.z - po.z);
    po.yaw = angleLerp(po.yaw, want, 0.06);
    const sp = po.car ? 15 + G.wanted * 1.5 : 5.5;
    const nx = po.x + Math.sin(po.yaw) * sp * dt, nz = po.z + Math.cos(po.yaw) * sp * dt;
    if (!isBlocked(nx, nz)) { po.x = nx; po.z = nz; }
    if (d < 3) {
      po.catchT += dt;
      if (po.catchT > 1.2) { busted(); return; }
      if (po.car && p.inCar) { p.inCar.speed *= (1 - 2 * dt); G.health = Math.max(0, G.health - 4 * dt); }
      if (!p.inCar) G.health = Math.max(0, G.health - 6 * dt);
    } else po.catchT = Math.max(0, po.catchT - dt);
  }
  if (G.wanted >= 3 && !G.heli) G.heli = { angle: 0, h: 60 };
  if (G.heli) {
    G.heli.angle += dt * 0.25;
    G.heli.x = p.x + Math.sin(G.heli.angle) * 26;
    G.heli.z = p.z + Math.cos(G.heli.angle) * 26;
  }
  // wanted mereda saat bersembunyi
  let seen = false;
  for (const po of G.police) if (dist2d(po.x, po.z, p.x, p.z) < 55) { seen = true; break; }
  if (!seen) {
    G.hideTimer += dt;
    if (G.hideTimer > 6) { G.wanted = Math.max(0, G.wanted - 1); G.hideTimer = 0; showMessage('WPD kehilangan jejakmu. Wanted: ' + '★'.repeat(G.wanted)); if (G.wanted === 0) { G.police = []; G.heli = null; } }
  } else G.hideTimer = 0;
  if (G.health <= 0) wasted();
}

function busted() {
  if (G.state !== 'playing') return;
  G.state = 'busted'; G.money = Math.max(0, G.money - 50000);
  AudioSys.setSiren(false); AudioSys.setEngine(0);
  showMessage('BUSTED! Denda Rp 50.000.');
  storeSave();
}
function wasted() {
  if (G.state !== 'playing') return;
  G.state = 'wasted'; G.money = Math.max(0, G.money - 25000);
  AudioSys.setSiren(false); AudioSys.setEngine(0);
  storeSave();
}

// ---------- misi ----------
function startMission(i) {
  const m = MISSIONS[i];
  if (!m) return;
  G.missionIndex = i; G.stageIndex = 0; G.lineIndex = 0; G.lineT = 0;
  G.checkpointIndex = 0; G.collectLeft = 0;
  if (m.night) G.clock = 20 * 60;
  if (m.dusk) G.clock = 17 * 60 + 30;
  setupStage();
  showMessage('Misi ' + (i + 1) + '/12: ' + m.title + ' — ' + m.brief);
  if (m.lines[0]) showSubtitle(m.lines[0], 4);
}

function setupStage() {
  const s = currentStage();
  if (!s) return;
  G.stageTimer = s.time || 0; G.stageT = 0; s.applied = false;
  if (s.kind === 'collect') { G.collectLeft = s.items.length; for (const it of s.items) it.got = false; }
  if (s.kind === 'checkpoint') G.checkpointIndex = 0;
}

function stageTarget() {
  const s = currentStage();
  if (!s) return null;
  if (s.kind === 'reach') return { x: s.x, z: s.z, r: s.r, label: s.text };
  if (s.kind === 'collect') {
    let best = null, bd = 1e9;
    for (const it of s.items) {
      if (it.got) continue;
      const d = dist2d(G.player.x, G.player.z, it[0], it[1]);
      if (d < bd) { bd = d; best = it; }
    }
    return best ? { x: best[0], z: best[1], r: s.r, label: s.text.replace(/\(\d+\/\d+\)/, '(' + (s.items.length - G.collectLeft) + '/' + s.items.length + ')') } : null;
  }
  if (s.kind === 'checkpoint') {
    const pt = s.points[G.checkpointIndex];
    return pt ? { x: pt[0], z: pt[1], r: s.r, label: s.text + ' (' + (G.checkpointIndex + 1) + '/' + s.points.length + ')' } : null;
  }
  return null;
}

function advanceStage() {
  const m = currentMission();
  G.stageIndex++;
  if (G.stageIndex >= m.stages.length) { missionComplete(); return; }
  setupStage();
  const s = currentStage();
  showMessage(s.text || 'Lanjut!');
  AudioSys.pickup();
}

function missionComplete() {
  const m = currentMission();
  G.money += m.reward; G.passedReward = m.reward;
  G.missionIndex++;
  G.state = 'passed';
  AudioSys.jingle();
  storeSave();
  if (G.missionIndex >= MISSIONS.length) showMessage('SEMUA MISI SELESAI — Sugeng jadi Legenda Wilwatikta!');
}

function updateMissions(dt) {
  const m = currentMission();
  if (!m) return;
  const s = currentStage();
  if (!s) return;
  // dialog bergilir
  G.lineT += dt;
  if (G.lineT > 4.5 && m.lines.length > 1) {
    G.lineT = 0; G.lineIndex = (G.lineIndex + 1) % m.lines.length;
    const ln = m.lines[G.lineIndex];
    showSubtitle(ln, 4);
  }
  // timer misi
  if (s.time) {
    G.stageTimer -= dt;
    if (G.stageTimer <= 0) {
      showMessage('Waktu habis! Misi diulang dari awal.');
      G.stageIndex = 0; setupStage();
      return;
    }
  }
  const p = G.player;
  if (s.kind === 'reach') {
    if (dist2d(p.x, p.z, s.x, s.z) < s.r) advanceStage();
  } else if (s.kind === 'collect') {
    for (const it of s.items) {
      if (!it.got && dist2d(p.x, p.z, it[0], it[1]) < s.r) {
        it.got = true; G.collectLeft--; AudioSys.pickup();
        showMessage('Bundel batik didapat! Sisa: ' + G.collectLeft);
      }
    }
    if (G.collectLeft <= 0) advanceStage();
  } else if (s.kind === 'checkpoint') {
    const pt = s.points[G.checkpointIndex];
    if (pt && dist2d(p.x, p.z, pt[0], pt[1]) < s.r) {
      G.checkpointIndex++; AudioSys.pickup();
      if (G.checkpointIndex >= s.points.length) advanceStage();
      else showMessage('Checkpoint ' + G.checkpointIndex + '/' + s.points.length + '!');
    }
  } else if (s.kind === 'loseWanted') {
    if (!s.applied) { s.applied = true; G.wanted = s.startWanted; G.wantedHeat = 100; spawnPolice(); }
    if (G.wanted === 0) advanceStage();
  }
}

// ---------- gambar entitas ----------
function drawBox3D(x, z, w, d, h, yaw, colTop, colSide, colFront) {
  const ctx = G.ctx, cam = G.cam;
  const hw = w / 2, hd = d / 2;
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const corner = (lx, lz) => ({ x: x + lx * cy + lz * sy, z: z - lx * sy + lz * cy });
  const c = [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)];
  const P = (px, py, pz) => project(px, py, pz, cam, G.W, G.H);
  const g = c.map((pt) => P(pt.x, 0, pt.z));
  const t = c.map((pt) => P(pt.x, h, pt.z));
  if (g.some((q) => !q) || t.some((q) => !q)) return;
  const face = (pts, fill) => {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  // sisi yang menghadap kamera: pilih berdasarkan posisi kamera relatif ke kotak
  const dx = cam.x - x, dz = cam.z - z;
  const faces = [];
  if (dz * cy - dx * sy > 0) faces.push([[g[3], g[2], t[2], t[3]], colFront]); else faces.push([[g[1], g[0], t[0], t[1]], colFront]);
  if (dx * cy + dz * sy > 0) faces.push([[g[2], g[1], t[1], t[2]], colSide]); else faces.push([[g[0], g[3], t[3], t[0]], colSide]);
  for (const [pts, fill] of faces) face(pts, fill);
  face(t, colTop);
}

function drawCarShape(car) {
  const m = car.model, police = car.isPolice;
  const body = police ? '#e8e8e8' : m.color;
  const dark = '#22242a';
  drawBox3D(car.x, car.z, m.w, m.len, 0.75, car.yaw, body, shade2(body, 0.7), shade2(body, 0.55));
  drawBox3D(car.x - Math.sin(car.yaw) * 0.2, car.z - Math.cos(car.yaw) * 0.2, m.w * 0.85, m.len * 0.45, 1.25, car.yaw, '#2c3a48', '#1c2733', '#141c26');
  if (police) {
    const ctx = G.ctx;
    const top = project(car.x, 1.6, car.z, G.cam, G.W, G.H);
    if (top) {
      const blink = Math.floor(G.time * 3) % 2 === 0;
      ctx.fillStyle = blink ? '#ff2e4d' : '#2e7bff';
      ctx.beginPath(); ctx.arc(top.x, top.y, Math.max(3, top.s * 0.25), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = 'bold ' + Math.max(9, Math.round(top.s * 0.28)) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('WPD', top.x, top.y - Math.max(6, top.s * 0.4));
    }
  }
  void dark;
}
function shade2(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return 'rgb(' + c((n >> 16) & 255) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
}

function drawPersonShape(x, z, color, yaw, isPlayer) {
  const ctx = G.ctx;
  const base = project(x, 0, z, G.cam, G.W, G.H);
  const head = project(x, 1.75, z, G.cam, G.W, G.H);
  if (!base || !head) return;
  const hPx = base.y - head.y;
  if (hPx < 2 || hPx > 400) return;
  const wPx = hPx * 0.32;
  ctx.fillStyle = isPlayer ? '#ffcf3f' : color;
  ctx.fillRect(base.x - wPx / 2, base.y - hPx * 0.62, wPx, hPx * 0.62); // badan
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath(); ctx.arc(base.x, base.y - hPx * 0.72, hPx * 0.16, 0, Math.PI * 2); ctx.fill(); // kepala
  if (isPlayer) {
    ctx.fillStyle = '#c94f6d';
    ctx.fillRect(base.x - wPx / 2, base.y - hPx * 0.62, wPx, hPx * 0.1); // ikat kepala
  }
}

function drawMarker(x, z, color, label) {
  const ctx = G.ctx;
  const base = project(x, 0, z, G.cam, G.W, G.H);
  const top = project(x, 9, z, G.cam, G.W, G.H);
  if (!base || !top) return;
  const pulse = 0.6 + 0.4 * Math.sin(G.time * 4);
  ctx.strokeStyle = color; ctx.globalAlpha = 0.75 * pulse; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(base.x, base.y - 6, 7 + 3 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(base.x, base.y - 6, 3, 0, Math.PI * 2); ctx.fill();
  if (label) {
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(base.x - 70, top.y - 24, 140, 20);
    ctx.fillStyle = '#fff'; ctx.fillText(label, base.x, top.y - 10);
  }
}

function drawEntities() {
  const cam = G.cam;
  const items = [];
  for (const c of G.cars) items.push({ d: dist2d(cam.x, cam.z, c.x, c.z), fn: () => drawCarShape(c) });
  for (const t of G.traffic) items.push({ d: dist2d(cam.x, cam.z, t.x, t.z), fn: () => drawCarShape(t) });
  for (const po of G.police) {
    if (po.car) items.push({ d: dist2d(cam.x, cam.z, po.x, po.z), fn: () => drawCarShape({ x: po.x, z: po.z, yaw: po.yaw, model: { name: 'WPD', color: '#f5f0e6', len: 4.4, w: 1.9 }, isPolice: true }) });
    else items.push({ d: dist2d(cam.x, cam.z, po.x, po.z), fn: () => drawPersonShape(po.x, po.z, '#1c2f6e', po.yaw, false) });
  }
  for (const pd of G.peds) items.push({ d: dist2d(cam.x, cam.z, pd.x, pd.z), fn: () => drawPersonShape(pd.x, pd.z, pd.color, pd.yaw, false) });
  if (!G.player.inCar) items.push({ d: 0, fn: () => drawPersonShape(G.player.x, G.player.z, '#ffcf3f', G.player.yaw, true) });
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.fn();
  // marker misi + item collect
  const tgt = stageTarget();
  if (tgt && G.state === 'playing') drawMarker(tgt.x, tgt.z, '#ffd23e', tgt.label);
  const s = currentStage();
  if (s && s.kind === 'collect' && G.state === 'playing') {
    for (const it of s.items) if (!it.got) drawMarker(it[0], it[1], '#4de3ff', null);
  }
  // helikopter
  if (G.heli) {
    const hp = project(G.heli.x, G.heli.h, G.heli.z, G.cam, G.W, G.H);
    if (hp) {
      const ctx = G.ctx, r = Math.max(6, hp.s * 1.6);
      ctx.fillStyle = '#2c3a48';
      ctx.beginPath(); ctx.ellipse(hp.x, hp.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
      const rot = G.time * 9;
      ctx.beginPath(); ctx.moveTo(hp.x - Math.cos(rot) * r * 1.8, hp.y - Math.sin(rot) * 3); ctx.lineTo(hp.x + Math.cos(rot) * r * 1.8, hp.y + Math.sin(rot) * 3); ctx.stroke();
      if (G.timeOfDay === 'night') {
        const gp = project(G.player.x, 0, G.player.z, G.cam, G.W, G.H);
        if (gp) {
          ctx.fillStyle = 'rgba(255, 240, 180, 0.18)';
          ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(gp.x - 30, gp.y); ctx.lineTo(gp.x + 30, gp.y); ctx.closePath(); ctx.fill();
        }
      }
    }
  }
}

// ---------- kamera & jam ----------
function updateCamera(dt) {
  const p = G.player;
  G.camYaw = angleLerp(G.camYaw, p.yaw + G.orbit, 1 - Math.pow(0.001, dt));
  const cy = G.camYaw;
  const dist = G.camDist;
  G.cam.x = p.x - Math.sin(cy) * dist;
  G.cam.z = p.z - Math.cos(cy) * dist;
  G.cam.y = 6 + dist * 0.42;
  G.cam.yaw = cy;
  G.cam.pitch = G.camPitch;
  if (G.state === 'title') {
    const a = G.time * 0.05;
    G.cam.x = Math.sin(a) * 320; G.cam.z = -315 + Math.cos(a) * 320; G.cam.y = 90; G.cam.yaw = Math.atan2(-G.cam.x, -315 - G.cam.z); G.cam.pitch = 0.25;
  }
}

function updateClock(dt) {
  G.clock += dt * 1.0; // 1 detik nyata = 1 menit game
  if (G.clock >= 24 * 60) G.clock -= 24 * 60;
  const h = G.clock / 60;
  G.timeOfDay = (h >= 6 && h < 17) ? 'day' : (h >= 17 && h < 19) ? 'dusk' : 'night';
}

// ---------- HUD & minimap ----------
function drawHUD() {
  const ctx = G.ctx;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  // kiri atas: uang + health
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(14, 12, 250, 64);
  ctx.fillStyle = '#7dff6a'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText(fmtRp(G.money), 24, 20);
  ctx.fillStyle = '#333'; ctx.fillRect(24, 50, 180, 12);
  ctx.fillStyle = G.health > 40 ? '#7dff6a' : '#ff2e4d'; ctx.fillRect(24, 50, 180 * (G.health / 100), 12);
  ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('HP ' + Math.round(G.health), 210, 49);
  // kanan atas: wanted + jam + distrik
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(G.W - 264, 12, 250, 64);
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = G.wanted > 0 ? '#ff2e4d' : '#888';
  ctx.fillText('★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted), G.W - 24, 18);
  ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
  ctx.fillText(fmtClock(G.clock) + '  ·  ' + (G.timeOfDay === 'day' ? 'Siang' : G.timeOfDay === 'dusk' ? 'Senja' : 'Malam'), G.W - 24, 50);
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#ffd23e';
  ctx.fillText(districtAt(G.player.x, G.player.z) || 'Wilwatikta', G.W - 24, 68);
  // bawah tengah: objektif misi
  const m = currentMission(), tgt = stageTarget();
  ctx.textAlign = 'center';
  if (m && G.state === 'playing') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const label = (tgt ? tgt.label : (currentStage() ? currentStage().text : '')) || '';
    ctx.fillRect(G.W / 2 - 260, G.H - 78, 520, 34);
    ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Misi ' + (G.missionIndex + 1) + '/12: ' + m.title + '  —  ' + label, G.W / 2, G.H - 70);
    const s = currentStage();
    if (s && s.time) {
      ctx.fillStyle = G.stageTimer < 15 ? '#ff2e4d' : '#fff'; ctx.font = 'bold 16px sans-serif';
      ctx.fillText('⏱ ' + Math.ceil(G.stageTimer) + ' detik', G.W / 2, G.H - 48);
    }
  }
  // subtitle
  if (G.subtitleT > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(G.W / 2 - 320, G.H - 130, 640, 28);
    ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif';
    ctx.fillText(G.subtitle, G.W / 2, G.H - 123);
  }
  // pesan
  if (G.messageT > 0) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(G.message, G.W / 2, 92);
  }
  // kecepatan
  if (G.player.inCar) {
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif';
    ctx.fillText(Math.round(Math.abs(G.player.inCar.speed) * 3.6) + ' km/h', G.W - 24, G.H - 40);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#ffd23e';
    ctx.fillText(G.player.inCar.model.name + '  ·  E untuk keluar', G.W - 24, G.H - 64);
  } else {
    ctx.textAlign = 'right'; ctx.fillStyle = '#ccc'; ctx.font = '12px sans-serif';
    ctx.fillText('WASD jalan · Shift lari · E naik mobil · R radio · P jeda', G.W - 24, G.H - 40);
  }
  drawMinimap();
}

function drawMinimap() {
  const ctx = G.ctx, S = 190, ox = 14, oy = G.H - S - 14;
  const sc = S / 1200;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ox - 4, oy - 4, S + 8, S + 8);
  ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, S, S); ctx.clip();
  ctx.fillStyle = G.timeOfDay === 'night' ? '#10182a' : '#5d7a52';
  ctx.fillRect(ox, oy, S, S);
  // laut di utara
  ctx.fillStyle = '#2f7fb8'; ctx.fillRect(ox, oy, S, 24);
  // distrik
  for (const d of CITY.districts) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(ox + (d.x - d.w / 2 + 600) * sc, oy + (d.z - d.d / 2 + 600) * sc, d.w * sc, d.d * sc);
  }
  // jalan
  ctx.fillStyle = '#3c4148';
  for (const r of CITY.roads) ctx.fillRect(ox + (r.x - r.w / 2 + 600) * sc, oy + (r.z - r.d / 2 + 600) * sc, Math.max(1, r.w * sc), Math.max(1, r.d * sc));
  const dot = (x, z, color, rad) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(ox + (x + 600) * sc, oy + (z + 600) * sc, rad, 0, Math.PI * 2); ctx.fill();
  };
  for (const t of G.traffic) dot(t.x, t.z, '#ddd', 1.5);
  for (const po of G.police) dot(po.x, po.z, '#ff2e4d', 3);
  const tgt = stageTarget();
  if (tgt && G.state === 'playing') {
    const pulse = 3 + 2 * Math.sin(G.time * 5);
    dot(tgt.x, tgt.z, '#ffd23e', pulse);
  }
  // pemain
  const px = ox + (G.player.x + 600) * sc, py = oy + (G.player.z + 600) * sc;
  ctx.save(); ctx.translate(px, py); ctx.rotate(-G.player.yaw + Math.PI);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(ox - 4, oy - 4, S + 8, S + 8);
}

// ---------- layar ----------
function drawScreens() {
  const ctx = G.ctx;
  if (G.state === 'title') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, G.W, G.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 64px sans-serif';
    ctx.fillText('WILWATIKTA', G.W / 2, 190);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif';
    ctx.fillText('— A Sugeng Story —', G.W / 2, 232);
    ctx.font = '17px sans-serif'; ctx.fillStyle = '#eee';
    ctx.fillText('Kota pesisir Jawa. 12 misi. Polisi WPD. Satu legenda.', G.W / 2, 280);
    ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Tekan ENTER untuk bermain', G.W / 2, 340);
    ctx.fillStyle = '#ccc'; ctx.font = '15px sans-serif';
    ctx.fillText('WASD / panah: gerak & nyetir   ·   E: naik/turun mobil   ·   Shift: lari   ·   Space: rem tangan', G.W / 2, 400);
    ctx.fillText('Mouse drag: putar kamera   ·   R: radio gamelan   ·   P: jeda', G.W / 2, 424);
    ctx.fillStyle = '#999'; ctx.font = '13px sans-serif';
    ctx.fillText('Progres tersimpan otomatis (localStorage). Misi terbuka: ' + (G.missionIndex + 1) + '/12', G.W / 2, 470);
  } else if (G.state === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, G.W, G.H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 44px sans-serif';
    ctx.fillText('JEDA', G.W / 2, G.H / 2 - 10);
    ctx.font = '17px sans-serif'; ctx.fillText('Tekan P untuk lanjut', G.W / 2, G.H / 2 + 30);
  } else if (G.state === 'passed') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, G.W, G.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7dff6a'; ctx.font = 'bold 48px sans-serif';
    ctx.fillText('MISSION PASSED', G.W / 2, G.H / 2 - 40);
    ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 26px sans-serif';
    ctx.fillText('+' + fmtRp(G.passedReward), G.W / 2, G.H / 2 + 6);
    ctx.fillStyle = '#fff'; ctx.font = '17px sans-serif';
    if (G.missionIndex >= MISSIONS.length) ctx.fillText('SEMUA MISI SELESAI — Sugeng, Legenda Wilwatikta!  Tekan ENTER untuk free roam.', G.W / 2, G.H / 2 + 44);
    else ctx.fillText('Misi ' + (G.missionIndex + 1) + '/12 terbuka.  Tekan ENTER untuk lanjut.', G.W / 2, G.H / 2 + 44);
  } else if (G.state === 'busted') {
    ctx.fillStyle = 'rgba(20,0,40,0.6)'; ctx.fillRect(0, 0, G.W, G.H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#c9a7ff'; ctx.font = 'bold 56px sans-serif';
    ctx.fillText('BUSTED!', G.W / 2, G.H / 2 - 10);
    ctx.fillStyle = '#fff'; ctx.font = '17px sans-serif';
    ctx.fillText('WPD menangkap Sugeng. Denda Rp 50.000.  Tekan ENTER untuk coba lagi.', G.W / 2, G.H / 2 + 34);
  } else if (G.state === 'wasted') {
    ctx.fillStyle = 'rgba(40,0,0,0.6)'; ctx.fillRect(0, 0, G.W, G.H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ff2e4d'; ctx.font = 'bold 56px sans-serif';
    ctx.fillText('WASTED!', G.W / 2, G.H / 2 - 10);
    ctx.fillStyle = '#fff'; ctx.font = '17px sans-serif';
    ctx.fillText('Sugeng tumbang. Biaya rumah sakit Rp 25.000.  Tekan ENTER untuk coba lagi.', G.W / 2, G.H / 2 + 34);
  }
}

// ---------- loop utama ----------
let rafId = 0, lastT = 0, started = false;

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
  lastT = ts;
  G.time += dt;
  if (G.subtitleT > 0) G.subtitleT -= dt;
  if (G.messageT > 0) G.messageT -= dt;
  if (G.state === 'playing') {
    updateClock(dt);
    updatePlayer(dt);
    updateTraffic(dt);
    updatePolice(dt);
    updateMissions(dt);
    if (G.health <= 0 && G.state === 'playing') wasted();
  }
  updateCamera(dt);
  // gambar
  renderCity(G.ctx, G.cam, G.timeOfDay);
  if (G.state !== 'title') drawEntities();
  if (G.state !== 'title') drawHUD();
  drawScreens();
  void groundHeight;
}

export function startGame(canvas) {
  if (started) return;
  started = true;
  G.canvas = canvas || document.getElementById('game');
  if (!G.canvas) throw new Error('startGame: canvas #game tidak ditemukan');
  G.canvas.width = 1280; G.canvas.height = 720;
  G.W = 1280; G.H = 720;
  G.ctx = G.canvas.getContext('2d');
  const save = loadSave();
  G.missionIndex = Math.min(save.unlocked, MISSIONS.length - 1);
  G.money = save.money;
  spawnWorld();
  setupInput();
  G.state = 'title';
  showMessage('Selamat datang di Wilwatikta.');
  lastT = performance.now();
  rafId = requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!started && document.getElementById('game')) startGame(document.getElementById('game'));
  });
}

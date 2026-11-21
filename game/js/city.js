// game/js/city.js — WILWATIKTA, kota pesisir Jawa untuk game open-world 3D.
// Modul ini membangun tata kota secara deterministik (seeded RNG), mengekspor
// datanya untuk gameplay, dan menggambar kota dengan Canvas 2D + proyeksi 3D.
//
// Dipakai game.js:
//   import { CITY, renderCity, isBlocked, groundHeight, randomSpawnPoint, project, districtAt } from './city.js';
//   renderCity(ctx, cam, timeOfDay) dipanggil tiap frame; cam = { x, y, z, yaw, pitch }.
//   timeOfDay: 'day' | 'dusk' | 'night'.
// Koordinat dunia dalam meter; utara = -z; kota ~1200 x 1200; laut di utara.
// Nama-nama Jawa: Wilwatikta, Alun-Alun, Keraton, Masjid Agung, Pasar Gede,
// Kampung Batik, Pelabuhan, Kauman, Jalan Malioboro, Tugu, Perumahan, Industri.

const SEED = 20261121;

// ---------- RNG deterministik (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = mulberry32(SEED);
function rand(a, b) { return a + R() * (b - a); }
function pick(arr) { return arr[Math.floor(R() * arr.length)]; }
function chance(p) { return R() < p; }

// ---------- palet warna Jawa ----------
const WALL = ['#b65c3a', '#f2e3c6', '#d9a441', '#2e7f7a', '#2b4a7f', '#a33327', '#8f4a3a', '#e0c896', '#c97e4a', '#7a9b6d', '#f5f0e6', '#b8b2a4'];
const ROOF_COLORS = ['#9c4a2f', '#3f6b4f', '#7a3b2e', '#4a5a3a'];
const SHOP_COLORS = ['#e8b23e', '#d95f43', '#3fa7a0', '#5b7fb8', '#c94f6d', '#f2e3c6'];
const TREE_COLORS = ['#3f6b4f', '#4a7a3a', '#5a8a4a', '#2f5a3a'];
const NEON = ['#ff5a7a', '#ffd23e', '#4de3ff', '#7dff6a', '#ff9a3e'];
const SHOP_NAMES = ['WARUNG SEGO', 'BATIK LARAS', 'TOKO OLEH-OLEH', 'ANGKRINGAN', 'KOPI JOS', 'SATE KLATHAK', 'GUDEG YU DJUM', 'BAKPIA PATHOK', 'BENGKEL LAS', 'TOKO KELONTONG', 'ES DAWET', 'NASI LIWET', 'JAMU GENDONG', 'BUBUR AYAM', 'MIE AYAM', 'SOTO AYAM', 'PECEL LELE', 'GORENGAN', 'ES TEH', 'ROTI BAKAR', 'AYAM GEPREK', 'BAKSO', 'SIOMAY', 'RUJAK'];
const BILLBOARDS = ['WILWATIKTA', 'BATIK LARAS', 'KOPI JOS', 'GUDEG YU DJUM', 'SATE KLATHAK', 'PASAR GEDE', 'KERATON', 'PELABUHAN', 'MALIOBORO', 'ES DAWET'];

// ---------- tata kota ----------
const BOUNDS = { minX: -600, maxX: 600, minZ: -600, maxZ: 600 };
const SEA = { x: 0, z: -690, w: 1600, d: 180 };
const DISTRICTS = [
  { name: 'Pelabuhan', x: 0, z: -530, w: 1200, d: 140, note: 'Pelabuhan dan gudang di tepi laut' },
  { name: 'Alun-Alun', x: 0, z: -315, w: 300, d: 270, note: 'Lapangan pusat, Keraton dan Masjid Agung' },
  { name: 'Kampung Batik', x: -385, z: -315, w: 430, d: 270, note: 'Bengkel batik dan rumah warna-warni' },
  { name: 'Kauman', x: 385, z: -315, w: 430, d: 270, note: 'Permukiman tenang di sekitar masjid' },
  { name: 'Pasar Gede', x: -385, z: 20, w: 430, d: 360, note: 'Pasar padat, kios dan los' },
  { name: 'Jalan Malioboro', x: 0, z: 220, w: 300, d: 760, note: 'Avenue belanja utama utara-selatan' },
  { name: 'Perumahan', x: 385, z: 20, w: 430, d: 360, note: 'Blok rumah dan apartemen' },
  { name: 'Kampung Kali', x: -385, z: 410, w: 430, d: 380, note: 'Kampung di tepi kali, rumah rapat' },
  { name: 'Industri', x: 385, z: 410, w: 430, d: 380, note: 'Pabrik dan cerobong' },
];
const ROADS = [
  { name: 'Jl. Malioboro', x: 0, z: 70, w: 24, d: 1060 },
  { name: 'Jl. Pantai', x: 0, z: -470, w: 1200, d: 20 },
  { name: 'Jl. Keraton', x: 0, z: -170, w: 1200, d: 18 },
  { name: 'Jl. Pasar', x: 0, z: 210, w: 1200, d: 16 },
  { name: 'Jl. Batik', x: -160, z: 75, w: 14, d: 1050 },
  { name: 'Jl. Kauman', x: 160, z: 75, w: 14, d: 1050 },
  { name: 'Jl. Pelabuhan Barat', x: -380, z: 75, w: 12, d: 1050 },
  { name: 'Jl. Perumahan Timur', x: 380, z: 75, w: 12, d: 1050 },
  { name: 'Jl. Alun-Alun Utara', x: 0, z: -450, w: 1200, d: 14 },
  { name: 'Jl. Kali Selatan', x: 0, z: 20, w: 1200, d: 14 },
  { name: 'Jl. Industri', x: 0, z: 420, w: 1200, d: 14 },
];
const PLAZAS = [{ x: 0, z: -315, w: 280, d: 250 }];
const PIERS = [
  { x: -220, z: -622, w: 16, d: 44 },
  { x: 0, z: -622, w: 16, d: 44 },
  { x: 220, z: -622, w: 16, d: 44 },
];

const BUILDINGS = [];
const PROPS = []; // { kind: 'tree' | 'lamp' | 'billboard' | 'boat' | 'crane', ... }

function rectsOverlap(ax, az, aw, ad, bx, bz, bw, bd, m) {
  return Math.abs(ax - bx) * 2 < aw + bw + m * 2 && Math.abs(az - bz) * 2 < ad + bd + m * 2;
}
function hitsRoad(x, z, w, d, m) {
  for (const r of ROADS) if (rectsOverlap(x, z, w, d, r.x, r.z, r.w, r.d, m)) return true;
  return false;
}
function hitsBuilding(x, z, w, d, m) {
  for (const b of BUILDINGS) if (rectsOverlap(x, z, w, d, b.x, b.z, b.w, b.d, m)) return true;
  return false;
}
function addBuilding(b) { BUILDINGS.push(b); return b; }

// ---------- bangunan penting (landmark) ----------
addBuilding({ x: -60, z: -330, w: 70, d: 46, h: 18, color: '#b65c3a', roof: 'pitched', roofColor: '#3f6b4f', type: 'palace', name: 'Keraton Wilwatikta' });
addBuilding({ x: 70, z: -330, w: 56, d: 40, h: 16, color: '#f2e3c6', roof: 'dome', roofColor: '#2e7f7a', type: 'mosque', name: 'Masjid Agung', domeR: 12 });
addBuilding({ x: 34, z: -352, w: 6, d: 6, h: 34, color: '#f2e3c6', roof: 'flat', type: 'minaret' });
addBuilding({ x: 106, z: -352, w: 6, d: 6, h: 34, color: '#f2e3c6', roof: 'flat', type: 'minaret' });
addBuilding({ x: 0, z: -240, w: 8, d: 8, h: 26, color: '#e0c896', roof: 'flat', type: 'monument', name: 'Tugu Wilwatikta' });
addBuilding({ x: -110, z: -200, w: 22, d: 14, h: 6, color: '#8f4a3a', roof: 'pitched', roofColor: '#9c4a2f', type: 'pavilion', name: 'Pendopo' });
addBuilding({ x: 110, z: -200, w: 22, d: 14, h: 6, color: '#8f4a3a', roof: 'pitched', roofColor: '#9c4a2f', type: 'pavilion', name: 'Pendopo' });
// gudang pelabuhan
for (const wx of [-480, -380, -280, 180, 280, 380]) {
  addBuilding({ x: wx, z: -530, w: 62, d: 26, h: 11, color: pick(['#8f4a3a', '#2e7f7a', '#b8b2a4', '#a33327']), roof: 'pitched', roofColor: '#5a4632', type: 'warehouse' });
}
// peti kemas di dermaga
for (let i = 0; i < 10; i++) {
  const x = -560 + i * 46 + rand(-8, 8), z = rand(-580, -556);
  if (hitsBuilding(x, z, 13, 6, 2)) continue;
  addBuilding({ x, z, w: 12, d: 5, h: 3, color: pick(['#c8552e', '#2e7f7a', '#d9a441', '#2b4a7f']), roof: 'flat', type: 'container' });
}
// pabrik + cerobong
addBuilding({ x: 250, z: 300, w: 54, d: 36, h: 14, color: '#8f4a3a', roof: 'flat', type: 'factory' });
addBuilding({ x: 360, z: 330, w: 48, d: 32, h: 12, color: '#b8b2a4', roof: 'flat', type: 'factory' });
addBuilding({ x: 470, z: 300, w: 44, d: 30, h: 13, color: '#7a6a55', roof: 'flat', type: 'factory' });
addBuilding({ x: 300, z: 480, w: 58, d: 34, h: 15, color: '#9c4a2f', roof: 'flat', type: 'factory' });
addBuilding({ x: 216, z: 282, w: 5, d: 5, h: 32, color: '#a33327', roof: 'flat', type: 'chimney' });
addBuilding({ x: 388, z: 308, w: 5, d: 5, h: 36, color: '#a33327', roof: 'flat', type: 'chimney' });
addBuilding({ x: 498, z: 278, w: 5, d: 5, h: 30, color: '#a33327', roof: 'flat', type: 'chimney' });
// menara kantor di pusat kota
addBuilding({ x: 60, z: -120, w: 26, d: 26, h: 52, color: '#7fb2c9', roof: 'flat', type: 'office', name: 'Menara Wilwatikta' });
addBuilding({ x: -70, z: -100, w: 24, d: 24, h: 44, color: '#5b8fb8', roof: 'flat', type: 'office' });
addBuilding({ x: 90, z: 40, w: 28, d: 28, h: 64, color: '#7fb2c9', roof: 'flat', type: 'office', name: 'Menara Segara' });
addBuilding({ x: -80, z: 60, w: 22, d: 22, h: 38, color: '#9db8c9', roof: 'flat', type: 'office' });
addBuilding({ x: 50, z: 140, w: 26, d: 26, h: 48, color: '#5b8fb8', roof: 'flat', type: 'office' });

// ---------- isi distrik dengan bangunan ----------
function fillDistrict(dist, cell, opt) {
  const x0 = dist.x - dist.w / 2, x1 = dist.x + dist.w / 2;
  const z0 = dist.z - dist.d / 2, z1 = dist.z + dist.d / 2;
  for (let gx = x0 + cell / 2; gx < x1; gx += cell) {
    for (let gz = z0 + cell / 2; gz < z1; gz += cell) {
      if (!chance(opt.density)) continue;
      const w = cell * rand(opt.wMin, opt.wMax);
      const d = cell * rand(opt.wMin, opt.wMax);
      const x = gx + rand(-cell * 0.12, cell * 0.12);
      const z = gz + rand(-cell * 0.12, cell * 0.12);
      if (hitsRoad(x, z, w, d, 3)) continue;
      if (hitsBuilding(x, z, w, d, 2.5)) continue;
      const type = pick(opt.types);
      let h = rand(opt.hMin, opt.hMax);
      if (type === 'apartment') h = rand(18, 30);
      if (type === 'factory') h = rand(10, 16);
      if (type === 'warehouse') h = rand(9, 13);
      const b = {
        x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
        w: Math.round(w * 10) / 10, d: Math.round(d * 10) / 10,
        h: Math.round(h * 10) / 10,
        color: pick(opt.colors), roof: pick(opt.roofs), type,
      };
      if (b.roof === 'pitched') b.roofColor = pick(ROOF_COLORS);
      if (type === 'shop' && chance(0.55)) {
        b.sign = pick(SHOP_NAMES);
        b.signColor = pick(NEON);
        b.signFace = dist.name === 'Jalan Malioboro' ? (b.x < 0 ? 'east' : 'west') : pick(['south', 'north']);
      }
      BUILDINGS.push(b);
    }
  }
}
const D = {};
for (const d of DISTRICTS) D[d.name] = d;
fillDistrict(D['Kampung Batik'], 34, { density: 0.72, wMin: 0.55, wMax: 0.82, hMin: 6, hMax: 10, types: ['house', 'house', 'house', 'shop'], colors: WALL, roofs: ['pitched', 'pitched', 'flat'] });
fillDistrict(D['Kauman'], 36, { density: 0.66, wMin: 0.55, wMax: 0.8, hMin: 6, hMax: 9, types: ['house', 'house', 'shop'], colors: WALL, roofs: ['pitched', 'pitched', 'flat'] });
fillDistrict(D['Pasar Gede'], 26, { density: 0.62, wMin: 0.5, wMax: 0.8, hMin: 4, hMax: 7, types: ['stall', 'shop', 'shop', 'stall'], colors: SHOP_COLORS, roofs: ['flat', 'flat', 'pitched'] });
fillDistrict(D['Jalan Malioboro'], 30, { density: 0.58, wMin: 0.55, wMax: 0.85, hMin: 8, hMax: 15, types: ['shop', 'shop', 'office', 'house'], colors: SHOP_COLORS, roofs: ['flat', 'flat', 'pitched'] });
fillDistrict(D['Perumahan'], 40, { density: 0.66, wMin: 0.55, wMax: 0.8, hMin: 8, hMax: 16, types: ['house', 'house', 'apartment', 'apartment'], colors: WALL, roofs: ['pitched', 'flat', 'flat'] });
fillDistrict(D['Kampung Kali'], 30, { density: 0.66, wMin: 0.55, wMax: 0.8, hMin: 5, hMax: 8, types: ['house', 'house', 'house', 'shop'], colors: WALL, roofs: ['pitched', 'pitched', 'flat'] });
fillDistrict(D['Industri'], 60, { density: 0.8, wMin: 0.55, wMax: 0.85, hMin: 10, hMax: 16, types: ['factory', 'factory', 'warehouse'], colors: ['#8f4a3a', '#b8b2a4', '#7a6a55', '#9c4a2f'], roofs: ['flat'] });

// ---------- properti: pohon, lampu, papan iklan, kapal, derek ----------
function addTree(x, z) {
  if (hitsRoad(x, z, 2, 2, 0) || hitsBuilding(x, z, 3, 3, 1)) return;
  PROPS.push({ kind: 'tree', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, r: rand(2.2, 3.6), h: rand(4.5, 7), color: pick(TREE_COLORS) });
}
function treesAlongRoad(r, gap) {
  const vertical = r.d > r.w;
  const off = r.w / 2 + 4;
  if (vertical) {
    for (let z = r.z - r.d / 2 + 12; z < r.z + r.d / 2 - 8; z += gap) {
      addTree(r.x - off, z + rand(-4, 4));
      addTree(r.x + off, z + rand(-4, 4));
    }
  } else {
    for (let x = r.x - r.w / 2 + 12; x < r.x + r.w / 2 - 8; x += gap) {
      addTree(x + rand(-4, 4), r.z - off);
      addTree(x + rand(-4, 4), r.z + off);
    }
  }
}
treesAlongRoad(ROADS[0], 46); // Jl. Malioboro
treesAlongRoad(ROADS[1], 52); // Jl. Pantai
treesAlongRoad(ROADS[2], 52); // Jl. Keraton
for (let i = 0; i < 26; i++) addTree(rand(180, 590), rand(-440, -190)); // Kauman
for (let x = -130; x <= 130; x += 24) { addTree(x, -428); addTree(x, -202); } // tepi Alun-Alun

function lampsAlongRoad(r, gap) {
  const vertical = r.d > r.w;
  const off = r.w / 2 + 1.5;
  if (vertical) {
    for (let z = r.z - r.d / 2 + 10; z < r.z + r.d / 2 - 6; z += gap) {
      PROPS.push({ kind: 'lamp', x: r.x - off, z });
      PROPS.push({ kind: 'lamp', x: r.x + off, z: z + gap / 2 });
    }
  } else {
    for (let x = r.x - r.w / 2 + 10; x < r.x + r.w / 2 - 6; x += gap) {
      PROPS.push({ kind: 'lamp', x, z: r.z - off });
      PROPS.push({ kind: 'lamp', x: x + gap / 2, z: r.z + off });
    }
  }
}
lampsAlongRoad(ROADS[0], 42);
lampsAlongRoad(ROADS[1], 52);
lampsAlongRoad(ROADS[2], 52);

for (let i = 0; i < 10; i++) {
  const z = -380 + i * 100 + rand(-12, 12);
  const side = i % 2 === 0 ? -1 : 1;
  PROPS.push({ kind: 'billboard', x: side * 16, z, w: 11, h: 6, y: 7, text: BILLBOARDS[i], color: pick(['#a33327', '#2b4a7f', '#2e7f7a', '#8f4a3a']) });
}
for (let i = 0; i < 8; i++) {
  PROPS.push({ kind: 'boat', x: -520 + i * 140 + rand(-20, 20), z: rand(-668, -636), len: rand(14, 24), beam: rand(5, 6.5), angle: rand(-0.3, 0.3), color: pick(['#f2e3c6', '#2e7f7a', '#a33327', '#d9a441']) });
}
for (const cx of [-320, -110, 110, 320]) PROPS.push({ kind: 'crane', x: cx, z: -596, h: rand(26, 34) });

// bintang untuk langit malam (posisi tetap, deterministik)
const STARS = [];
for (let i = 0; i < 46; i++) STARS.push({ x: R(), y: R() * 0.55, r: rand(0.6, 1.8) });

// ---------- gameplay: tabrakan, spawn, distrik ----------
export function isBlocked(x, z) {
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return true;
  for (const b of BUILDINGS) {
    if (Math.abs(x - b.x) < b.w / 2 + 1.5 && Math.abs(z - b.z) < b.d / 2 + 1.5) return true;
  }
  return false;
}
export function groundHeight(x, z) { return 0; } // kota datar
export function randomSpawnPoint() {
  const r = mulberry32(77);
  const road = ROADS[Math.floor(r() * ROADS.length)];
  const t = r();
  if (road.d > road.w) return { x: road.x + (r() - 0.5) * (road.w - 6), z: road.z - road.d / 2 + t * road.d, yaw: Math.PI };
  return { x: road.x - road.w / 2 + t * road.w, z: road.z + (r() - 0.5) * (road.w - 6), yaw: Math.PI };
}
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (Math.abs(x - d.x) <= d.w / 2 && Math.abs(z - d.z) <= d.d / 2) return d.name;
  }
  return '';
}

// ---------- warna & pencahayaan ----------
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, f, warm) {
  const [r, g, b] = hexRgb(hex);
  const wr = warm ? 1.14 : 1, wb = warm ? 0.82 : 1;
  const c = (v, m) => Math.max(0, Math.min(255, Math.round(v * f * m)));
  return 'rgb(' + c(r, wr) + ',' + c(g, 1) + ',' + c(b, wb) + ')';
}
const SKY = {
  day: { top: '#5fa8d3', mid: '#9fd4e8', bot: '#d8eef5', amb: 1.0, warm: false },
  dusk: { top: '#5a3a78', mid: '#e07a4f', bot: '#f7b267', amb: 0.78, warm: true },
  night: { top: '#060a1e', mid: '#101a3a', bot: '#1e2c52', amb: 0.3, warm: false },
};
const GROUND_C = { day: '#8f9a7d', dusk: '#6f5a4e', night: '#232833' };
const ROAD_C = { day: '#3c4148', dusk: '#2f2a33', night: '#191d26' };
const WALK_C = { day: '#b7b0a0', dusk: '#7d6f63', night: '#2e3340' };
const SEA_C = { day: '#2f7fb8', dusk: '#46587f', night: '#0d2540' };
const PLAZA_C = { day: '#c9bda6', dusk: '#8a7263', night: '#2c2f3a' };
const PIER_C = { day: '#8a6b4a', dusk: '#5f4a38', night: '#26221c' };
const DASH_C = { day: '#e8e4d8', dusk: '#9a8a7a', night: '#4a4f5e' };

// ---------- proyeksi 3D ----------
// yaw 0 = menghadap +z (selatan), yaw PI = menghadap -z (utara); pitch > 0 = menengadah.
function makeProjector(cam, W, H) {
  const focal = H * 0.9;
  const cx = W / 2, cy = H / 2;
  const sy = Math.sin(cam.yaw), cyaw = Math.cos(cam.yaw);
  const sp = Math.sin(cam.pitch || 0), cp = Math.cos(cam.pitch || 0);
  return function projectPt(x, y, z, clamp) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const right = -dx * cyaw + dz * sy;
    const fwd0 = dx * sy + dz * cyaw;
    const up = dy * cp - fwd0 * sp;
    let fwd = dy * sp + fwd0 * cp;
    if (fwd < 0.6) {
      if (!clamp) return null;
      fwd = 0.6;
    }
    return { x: cx + (right / fwd) * focal, y: cy - (up / fwd) * focal, d: fwd, s: focal / fwd };
  };
}
// Proyeksi satu titik untuk dipakai game.js (null bila di belakang kamera).
export function project(x, y, z, cam, width = 1280, height = 720) {
  return makeProjector(cam, width, height)(x, y, z, false);
}

// ---------- gambar ----------
function poly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function groundPoly(ctx, P, x0, z0, x1, z1, y, fill) {
  const a = P(x0, y, z0, true), b = P(x1, y, z0, true), c = P(x1, y, z1, true), d = P(x0, y, z1, true);
  poly(ctx, [a, b, c, d], fill);
}

function drawWindows(ctx, pts, b, tod) {
  // pts: 4 sudut sisi terproyeksi [bawah-A, bawah-B, atas-B, atas-A]
  const wScreen = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const hScreen = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
  if (wScreen < 24 || hScreen < 18) return;
  const cols = Math.max(2, Math.min(8, Math.floor(wScreen / 16)));
  const rows = Math.max(2, Math.min(7, Math.floor(hScreen / 16)));
  const lerpPt = (u, v) => ({
    x: (pts[0].x * (1 - u) + pts[1].x * u) * (1 - v) + (pts[3].x * (1 - u) + pts[2].x * u) * v,
    y: (pts[0].y * (1 - u) + pts[1].y * u) * (1 - v) + (pts[3].y * (1 - u) + pts[2].y * u) * v,
  });
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const u0 = (i + 0.18) / cols, u1 = (i + 0.82) / cols;
      const v0 = (j + 0.22) / rows, v1 = (j + 0.78) / rows;
      const a = lerpPt(u0, v0), c = lerpPt(u1, v0), d = lerpPt(u1, v1), e = lerpPt(u0, v1);
      const hash = (Math.abs(Math.round(b.x)) * 7 + Math.abs(Math.round(b.z)) * 13 + i * 3 + j * 5) % 10;
      let fill;
      if (tod === 'night') fill = hash < 5 ? '#ffd27a' : '#1a2233';
      else if (tod === 'dusk') fill = hash < 3 ? '#ffb45e' : '#3a2c33';
      else fill = hash < 2 ? '#5a7a90' : '#2c3a48';
      poly(ctx, [a, c, d, e], fill);
    }
  }
}

function drawSign(ctx, P, cam, b, tod) {
  let ax = b.x, az = b.z;
  const ay = Math.min(4.5, b.h * 0.55);
  if (b.signFace === 'east') ax = b.x + b.w / 2 + 0.3;
  if (b.signFace === 'west') ax = b.x - b.w / 2 - 0.3;
  if (b.signFace === 'south') az = b.z + b.d / 2 + 0.3;
  if (b.signFace === 'north') az = b.z - b.d / 2 - 0.3;
  const q = P(ax, ay, az, false);
  if (!q) return;
  const dx = ax - cam.x, dz = az - cam.z;
  if (dx * dx + dz * dz > 160 * 160) return;
  ctx.font = 'bold 12px sans-serif';
  const tw = ctx.measureText(b.sign).width;
  ctx.fillStyle = 'rgba(20,16,12,0.78)';
  ctx.fillRect(q.x - tw / 2 - 5, q.y - 10, tw + 10, 17);
  ctx.fillStyle = b.signColor || '#ffe9a8';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.sign, q.x, q.y - 1);
}

function drawBuilding(ctx, P, cam, b, tod) {
  const pal = SKY[tod];
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const h = b.h;
  const faces = [];
  if (cam.x < x0) faces.push({ pts: [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]], f: 0.66 });
  if (cam.x > x1) faces.push({ pts: [[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1]], f: 0.8 });
  if (cam.z < z0) faces.push({ pts: [[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]], f: 0.6 });
  if (cam.z > z1) faces.push({ pts: [[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]], f: 0.85 });
  const rh = Math.min(7, Math.max(3, Math.min(b.w, b.d) * 0.18));
  if (b.roof === 'pitched') {
    const zc = b.z, xc = b.x;
    if (b.w >= b.d) {
      faces.push({ pts: [[x0, h, z0], [x1, h, z0], [x1, h + rh, zc], [x0, h + rh, zc]], f: 0.6, roof: true });
      faces.push({ pts: [[x1, h, z1], [x0, h, z1], [x0, h + rh, zc], [x1, h + rh, zc]], f: 0.85, roof: true });
      if (cam.x < x0) faces.push({ pts: [[x0, h, z0], [x0, h, z1], [x0, h + rh, zc]], f: 0.66, gable: true });
      if (cam.x > x1) faces.push({ pts: [[x1, h, z1], [x1, h, z0], [x1, h + rh, zc]], f: 0.8, gable: true });
    } else {
      faces.push({ pts: [[x0, h, z0], [x0, h, z1], [xc, h + rh, z1], [xc, h + rh, z0]], f: 0.66, roof: true });
      faces.push({ pts: [[x1, h, z1], [x1, h, z0], [xc, h + rh, z0], [xc, h + rh, z1]], f: 0.8, roof: true });
      if (cam.z < z0) faces.push({ pts: [[x1, h, z0], [x0, h, z0], [xc, h + rh, z0]], f: 0.6, gable: true });
      if (cam.z > z1) faces.push({ pts: [[x0, h, z1], [x1, h, z1], [xc, h + rh, z1]], f: 0.85, gable: true });
    }
  } else if (cam.y > h + 1) {
    faces.push({ pts: [[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], f: 1.0, top: true });
  }
  const scored = [];
  for (const f of faces) {
    const pts = [];
    let cx = 0, cz = 0, ok = true;
    for (const [px, py, pz] of f.pts) {
      const q = P(px, py, pz, false);
      if (!q) { ok = false; break; }
      pts.push(q); cx += px; cz += pz;
    }
    if (!ok) continue;
    const n = f.pts.length;
    const dcx = cx / n - cam.x, dcz = cz / n - cam.z;
    scored.push({ pts, d: dcx * dcx + dcz * dcz, f });
  }
  scored.sort((a, b) => b.d - a.d);
  for (const s of scored) {
    const f = s.f;
    let fill;
    if (f.roof) fill = shade(b.roofColor || '#9c4a2f', f.f * pal.amb, pal.warm);
    else if (f.gable) fill = shade(b.color, f.f * pal.amb, pal.warm);
    else if (f.top) fill = shade(b.roofColor || b.color, 0.85 * pal.amb, pal.warm);
    else fill = shade(b.color, f.f * pal.amb, pal.warm);
    poly(ctx, s.pts, fill);
    if (!f.roof && !f.gable && !f.top && b.h >= 8 && (b.type === 'office' || b.type === 'apartment' || b.type === 'shop' || b.type === 'house')) {
      drawWindows(ctx, s.pts, b, tod);
    }
  }
  // kubah Masjid Agung
  if (b.roof === 'dome' && b.domeR) {
    const base = P(b.x, h, b.z, false);
    const top = P(b.x, h + b.domeR * 1.15, b.z, false);
    if (base && top) {
      const r = Math.max(2, base.s * b.domeR);
      ctx.beginPath();
      ctx.arc(base.x, base.y, r, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = shade(b.roofColor || '#2e7f7a', 0.95 * pal.amb, pal.warm);
      ctx.fill();
      ctx.strokeStyle = shade('#d9a441', pal.amb, pal.warm);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(base.x, top.y); ctx.lineTo(base.x, top.y - Math.max(4, r * 0.35)); ctx.stroke();
    }
  }
  // puncak Tugu (piramida kecil)
  if (b.type === 'monument') {
    const apex = P(b.x, h + 6, b.z, false);
    const corners = [[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]].map(([px, py, pz]) => P(px, py, pz, false));
    if (apex && corners.every(Boolean)) {
      for (let i = 0; i < 4; i++) {
        poly(ctx, [corners[i], corners[(i + 1) % 4], apex], shade('#d9a441', 0.9 * pal.amb, pal.warm));
      }
    }
  }
  if (b.sign) drawSign(ctx, P, cam, b, tod);
}

function drawProp(ctx, P, cam, p, tod) {
  const pal = SKY[tod];
  if (p.kind === 'tree') {
    const base = P(p.x, 0, p.z, false);
    const mid = P(p.x, p.h * 0.55, p.z, false);
    const top = P(p.x, p.h, p.z, false);
    if (!base || !mid || !top) return;
    ctx.strokeStyle = shade('#6b4a2f', pal.amb, pal.warm);
    ctx.lineWidth = Math.max(1.5, base.s * 0.25);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(mid.x, mid.y); ctx.stroke();
    const r = Math.max(2, top.s * p.r);
    ctx.fillStyle = shade(p.color, pal.amb, pal.warm);
    ctx.beginPath(); ctx.arc(top.x, top.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(p.color, pal.amb * 0.85, pal.warm);
    ctx.beginPath(); ctx.arc(top.x - r * 0.45, top.y + r * 0.3, r * 0.6, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (p.kind === 'lamp') {
    const base = P(p.x, 0, p.z, false);
    const head = P(p.x, 5, p.z, false);
    if (!base || !head) return;
    ctx.strokeStyle = shade('#3a3f44', pal.amb, pal.warm);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(head.x, head.y); ctx.stroke();
    if (tod === 'night') {
      ctx.fillStyle = 'rgba(255,210,122,0.22)';
      ctx.beginPath(); ctx.arc(head.x, head.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd27a';
    } else if (tod === 'dusk') {
      ctx.fillStyle = '#ffb45e';
    } else {
      ctx.fillStyle = '#c8ccd2';
    }
    ctx.beginPath(); ctx.arc(head.x, head.y, tod === 'night' ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (p.kind === 'billboard') {
    const y0 = p.y, y1 = p.y + p.h;
    const a = P(p.x, y0, p.z - p.w / 2, false), bq = P(p.x, y0, p.z + p.w / 2, false);
    const c = P(p.x, y1, p.z + p.w / 2, false), d = P(p.x, y1, p.z - p.w / 2, false);
    if (!a || !bq || !c || !d) return;
    const post0 = P(p.x, 0, p.z - p.w / 2 + 1, false), post1 = P(p.x, y0, p.z - p.w / 2 + 1, false);
    if (post0 && post1) {
      ctx.strokeStyle = shade('#3a3f44', pal.amb, pal.warm);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(post0.x, post0.y); ctx.lineTo(post1.x, post1.y); ctx.stroke();
    }
    poly(ctx, [a, bq, c, d], shade(p.color, pal.amb, pal.warm));
    const ctr = P(p.x, y0 + p.h / 2, p.z, false);
    if (ctr) {
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#fff8e8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.text, ctr.x, ctr.y);
    }
    return;
  }
  if (p.kind === 'boat') {
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    const corners = [];
    const hl = p.len / 2, hb = p.beam / 2;
    for (const [lx, lz] of [[-hl, -hb], [hl, -hb], [hl, hb], [-hl, hb]]) {
      const q = P(p.x + lx * ca - lz * sa, 0.6, p.z + lx * sa + lz * ca, false);
      if (!q) return;
      corners.push(q);
    }
    poly(ctx, corners, shade(p.color, pal.amb, pal.warm));
    const mast = P(p.x, 5, p.z, false), deck = P(p.x, 0.6, p.z, false);
    if (mast && deck) {
      ctx.strokeStyle = shade('#5a4632', pal.amb, pal.warm); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(deck.x, deck.y); ctx.lineTo(mast.x, mast.y); ctx.stroke();
    }
    return;
  }
  if (p.kind === 'crane') {
    const base = P(p.x, 0, p.z, false), top = P(p.x, p.h, p.z, false);
    const jib = P(p.x + 16, p.h - 2, p.z, false), tail = P(p.x - 7, p.h - 2, p.z, false);
    const hook = P(p.x + 13, p.h - 9, p.z, false);
    if (!base || !top || !jib || !tail || !hook) return;
    ctx.strokeStyle = shade('#c8552e', pal.amb, pal.warm);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y);
    ctx.moveTo(top.x, top.y); ctx.lineTo(jib.x, jib.y);
    ctx.moveTo(top.x, top.y); ctx.lineTo(tail.x, tail.y);
    ctx.moveTo(jib.x, jib.y); ctx.lineTo(hook.x, hook.y);
    ctx.stroke();
  }
}

function drawRoadDashes(ctx, P, tod) {
  for (const r of ROADS) {
    if (r.w < 16) continue;
    const vertical = r.d > r.w;
    const fixed = vertical ? r.x : r.z;
    const from = vertical ? r.z - r.d / 2 + 6 : r.x - r.w / 2 + 6;
    const to = from + (vertical ? r.d : r.w) - 12;
    for (let s = from; s < to; s += 12) {
      let a, b, c, d;
      if (vertical) {
        a = P(fixed - 0.4, 0.06, s, false); b = P(fixed + 0.4, 0.06, s, false);
        c = P(fixed + 0.4, 0.06, s + 5, false); d = P(fixed - 0.4, 0.06, s + 5, false);
      } else {
        a = P(s, 0.06, fixed - 0.4, false); b = P(s + 5, 0.06, fixed - 0.4, false);
        c = P(s + 5, 0.06, fixed + 0.4, false); d = P(s, 0.06, fixed + 0.4, false);
      }
      if (!a || !b || !c || !d) continue;
      poly(ctx, [a, b, c, d], DASH_C[tod]);
    }
  }
}

function drawLabels(ctx, P, cam, tod) {
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const d of DISTRICTS) {
    const q = P(d.x, 2, d.z, false);
    if (!q) continue;
    if (q.x < -40 || q.x > ctx.canvas.width + 40 || q.y < -20 || q.y > ctx.canvas.height + 20) continue;
    const dx = d.x - cam.x, dz = d.z - cam.z;
    if (dx * dx + dz * dz > 480 * 480) continue;
    ctx.fillStyle = tod === 'night' ? 'rgba(230,235,255,0.6)' : 'rgba(30,25,20,0.55)';
    ctx.fillText(d.name.toUpperCase(), q.x, q.y);
  }
}

// ---------- render utama ----------
// Gambar seluruh kota ke ctx. cam = { x, y, z, yaw, pitch }.
// timeOfDay: 'day' | 'dusk' | 'night'.
export function renderCity(ctx, cam, timeOfDay = 'day') {
  const tod = SKY[timeOfDay] ? timeOfDay : 'day';
  const pal = SKY[tod];
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const P = makeProjector(cam, W, H);

  // langit + matahari/bulan/bintang
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, pal.top); sky.addColorStop(0.55, pal.mid); sky.addColorStop(1, pal.bot);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  if (tod === 'day') {
    ctx.fillStyle = 'rgba(255,243,196,0.25)';
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.16, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,243,196,0.9)';
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.16, 26, 0, Math.PI * 2); ctx.fill();
  } else if (tod === 'dusk') {
    ctx.fillStyle = 'rgba(255,154,62,0.25)';
    ctx.beginPath(); ctx.arc(W * 0.68, H * 0.34, 52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,154,62,0.95)';
    ctx.beginPath(); ctx.arc(W * 0.68, H * 0.34, 30, 0, Math.PI * 2); ctx.fill();
  } else {
    for (const s of STARS) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#e8ecf5';
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.18, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8cede';
    ctx.beginPath(); ctx.arc(W * 0.78 - 7, H * 0.18 - 4, 5, 0, Math.PI * 2); ctx.fill();
  }

  // tanah, laut, dermaga, alun-alun
  groundPoly(ctx, P, -900, -900, 900, 900, 0, GROUND_C[tod]);
  groundPoly(ctx, P, SEA.x - SEA.w / 2, SEA.z - SEA.d / 2, SEA.x + SEA.w / 2, SEA.z + SEA.d / 2, 0.02, SEA_C[tod]);
  for (const pier of PIERS) groundPoly(ctx, P, pier.x - pier.w / 2, pier.z - pier.d / 2, pier.x + pier.w / 2, pier.z + pier.d / 2, 0.05, PIER_C[tod]);
  for (const pl of PLAZAS) groundPoly(ctx, P, pl.x - pl.w / 2, pl.z - pl.d / 2, pl.x + pl.w / 2, pl.z + pl.d / 2, 0.03, PLAZA_C[tod]);
  // jalan: trotoar, aspal, garis tengah
  for (const r of ROADS) {
    groundPoly(ctx, P, r.x - r.w / 2 - 3, r.z - r.d / 2 - 3, r.x + r.w / 2 + 3, r.z + r.d / 2 + 3, 0.02, WALK_C[tod]);
    groundPoly(ctx, P, r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2, 0.04, ROAD_C[tod]);
  }
  drawRoadDashes(ctx, P, tod);

  // bangunan + properti, painter's algorithm (jauh -> dekat), culling jarak
  const items = [];
  for (const b of BUILDINGS) {
    const dx = b.x - cam.x, dz = b.z - cam.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 450 * 450) continue;
    items.push({ d: d2, fn: () => drawBuilding(ctx, P, cam, b, tod) });
  }
  for (const p of PROPS) {
    const dx = p.x - cam.x, dz = p.z - cam.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 420 * 420) continue;
    items.push({ d: d2, fn: () => drawProp(ctx, P, cam, p, tod) });
  }
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.fn();

  drawLabels(ctx, P, cam, tod);
}

// ---------- ekspor data kota ----------
export const CITY = {
  name: 'WILWATIKTA',
  seed: SEED,
  bounds: BOUNDS,
  sea: SEA,
  districts: DISTRICTS,
  roads: ROADS,
  plazas: PLAZAS,
  piers: PIERS,
  buildings: BUILDINGS,
  props: PROPS,
};

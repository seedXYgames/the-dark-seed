// Campo altimetrico: funzione pura della WorldSpec. Usato da worldgen, collisioni e rendering.
import { WORLD_HALF, type Poi, type TerrainSpec, type Vec2 } from '../core/contracts';
import { clamp, fbm2, lerp, smoothstep, valueNoise2 } from '../core/rng';

export const GRID_MIN = -800;
export const GRID_MAX = 800;
export const GRID_STEP = 5;
export const GRID_N = (GRID_MAX - GRID_MIN) / GRID_STEP + 1; // 321
/** Limite fisico oltre il quale il giocatore non può andare (dentro il quadrato 1400×1400). */
export const PLAY_LIMIT = WORLD_HALF - 5;

export interface PolyHit { d: number; s: number; tx: number; tz: number; px: number; pz: number }

/** Distanza da una polilinea; s = frazione di lunghezza percorsa. */
export function polylineHit(pts: Vec2[], x: number, z: number, lens?: number[]): PolyHit {
  let best = Infinity;
  let bs = 0, btx = 1, btz = 0, bpx = 0, bpz = 0;
  let acc = 0;
  let total = 0;
  if (lens) total = lens[lens.length - 1];
  else for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, az = pts[i - 1].z;
    const dx = pts[i].x - ax, dz = pts[i].z - az;
    const l2 = dx * dx + dz * dz;
    const l = Math.sqrt(l2);
    const t = l2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1) : 0;
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bs = total > 0 ? (acc + l * t) / total : 0;
      btx = l > 0 ? dx / l : 1;
      btz = l > 0 ? dz / l : 0;
      bpx = px; bpz = pz;
    }
    acc += l;
  }
  return { d: best, s: bs, tx: btx, tz: btz, px: bpx, pz: bpz };
}

export function distToSegment(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1) : 0;
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

export function lakeRadiusAt(lake: NonNullable<TerrainSpec['lake']>, ang: number): number {
  let r = 1;
  for (let k = 0; k < lake.wobble.length; k += 2) r += lake.wobble[k] * Math.sin((k / 2 + 2) * ang + lake.wobble[k + 1]);
  return lake.radius * r;
}

/** Rilievo naturale senza acqua né spianamenti. */
export function rawHeight(t: TerrainSpec, x: number, z: number): number {
  const s = t.salt;
  let h = (fbm2(x / 240 + 31.7, z / 240 - 12.3, s, 4) - 0.5) * 2 * t.amplitude;
  h += (fbm2(x / 620 - 4.1, z / 620 + 9.9, s + 977, 2) - 0.5) * 1.6 * t.amplitude;
  const rx = x * Math.cos(t.ridgeAngle) + z * Math.sin(t.ridgeAngle);
  h += Math.sin(rx / 210 + valueNoise2(x / 300, z / 300, s + 55) * 3) * t.amplitude * 0.22;
  h += (valueNoise2(x / 23, z / 23, s + 313) - 0.5) * 0.9;
  // rilievo di confine: pendii impraticabili attorno all'area giocabile
  const m = Math.max(Math.abs(x), Math.abs(z));
  if (m > 640) {
    let rise = m <= 700 ? ((m - 640) / 60) ** 2 * 30 : 30 + (m - 700) * 1.05;
    rise *= 0.8 + 0.45 * valueNoise2(x / 90, z / 90, s + 71);
    const road = distToSegment(x, z, t.entryRoad.from, t.entryRoad.to);
    rise *= smoothstep(9, 48, road);
    h += rise;
  }
  return h;
}

export function carveWater(t: TerrainSpec, x: number, z: number, h: number, riverLens?: number[]): number {
  if (t.river) {
    const hit = polylineHit(t.river.points, x, z, riverLens);
    if (hit.d < 70) {
      const bed = lerp(t.river.levelStart, t.river.levelEnd, hit.s);
      const hw = t.river.halfWidth;
      const w = smoothstep(62, hw + 2, hit.d);
      h = lerp(h, bed + 0.55, w);
      if (hit.d < hw) h = bed + 0.55 - 2.2 * smoothstep(hw, hw * 0.35, hit.d);
    }
  }
  if (t.lake) {
    const dx = x - t.lake.center.x, dz = z - t.lake.center.z;
    const d = Math.hypot(dx, dz);
    if (d < t.lake.radius * 2.2) {
      const R = lakeRadiusAt(t.lake, Math.atan2(dz, dx));
      const q = d / R;
      if (q < 1.6) {
        h = lerp(h, t.lake.level + 0.45, smoothstep(1.6, 1.02, q));
        if (q < 1) h = t.lake.level + 0.45 - 3.6 * smoothstep(1, 0.72, q);
      }
    }
  }
  return h;
}

export function flattenForPoi(p: Poi, x: number, z: number, h: number): number {
  const d = Math.hypot(x - p.pos.x, z - p.pos.z);
  const w = smoothstep(p.radius + 26, p.radius, d);
  return w > 0 ? lerp(h, p.baseHeight, w) : h;
}

export function polyLens(pts: Vec2[]): number[] {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return lens;
}

/** Griglia delle quote con acqua scavata, senza POI. */
export function buildBaseHeights(t: TerrainSpec): Float32Array {
  const out = new Float32Array(GRID_N * GRID_N);
  const lens = t.river ? polyLens(t.river.points) : undefined;
  for (let j = 0; j < GRID_N; j++) {
    const z = GRID_MIN + j * GRID_STEP;
    for (let i = 0; i < GRID_N; i++) {
      const x = GRID_MIN + i * GRID_STEP;
      out[j * GRID_N + i] = carveWater(t, x, z, rawHeight(t, x, z), lens);
    }
  }
  return out;
}

export function applyPoiFlatten(heights: Float32Array, pois: Poi[]): void {
  for (const p of pois) {
    if (p.type === 'bridge' || p.type === 'lake_dock') continue; // ponti e moli non spianano l'acqua
    const R = p.radius + 28;
    const i0 = Math.max(0, Math.floor((p.pos.x - R - GRID_MIN) / GRID_STEP));
    const i1 = Math.min(GRID_N - 1, Math.ceil((p.pos.x + R - GRID_MIN) / GRID_STEP));
    const j0 = Math.max(0, Math.floor((p.pos.z - R - GRID_MIN) / GRID_STEP));
    const j1 = Math.min(GRID_N - 1, Math.ceil((p.pos.z + R - GRID_MIN) / GRID_STEP));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * GRID_N + i;
        heights[k] = flattenForPoi(p, GRID_MIN + i * GRID_STEP, GRID_MIN + j * GRID_STEP, heights[k]);
      }
  }
}

export function sampleGrid(grid: Float32Array, x: number, z: number): number {
  const fx = clamp((x - GRID_MIN) / GRID_STEP, 0, GRID_N - 1.001);
  const fz = clamp((z - GRID_MIN) / GRID_STEP, 0, GRID_N - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const k = j * GRID_N + i;
  const a = grid[k], b = grid[k + 1], c = grid[k + GRID_N], d = grid[k + GRID_N + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Profondità dell'acqua in un punto data la quota del terreno. */
export function waterDepth(t: TerrainSpec, x: number, z: number, h: number, riverLens?: number[]): number {
  let depth = 0;
  if (t.lake) {
    const dx = x - t.lake.center.x, dz = z - t.lake.center.z;
    const d = Math.hypot(dx, dz);
    if (d < t.lake.radius * 1.7 && d < lakeRadiusAt(t.lake, Math.atan2(dz, dx)) * 1.05) depth = Math.max(depth, t.lake.level - h);
  }
  if (t.river) {
    const hit = polylineHit(t.river.points, x, z, riverLens);
    if (hit.d < t.river.halfWidth + 1) depth = Math.max(depth, lerp(t.river.levelStart, t.river.levelEnd, hit.s) - h);
  }
  return Math.max(0, depth);
}

/** Densità del bosco 0..1 prima delle esclusioni (sentieri, POI, acqua). */
export function forestField(t: TerrainSpec, x: number, z: number): number {
  const a = fbm2(x / 190 + 7.7, z / 190 - 3.1, t.forestSalt, 3);
  const b = valueNoise2(x / 60, z / 60, t.forestSalt + 19);
  const v = a * 0.8 + b * 0.2 + t.forestBias;
  const m = Math.max(Math.abs(x), Math.abs(z));
  const rim = smoothstep(610, 680, m); // vegetazione fitta ai bordi
  return clamp(smoothstep(0.38, 0.62, v) * (1 - rim) + rim, 0, 1);
}

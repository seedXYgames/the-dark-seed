// Generazione della WorldSpec dal seed: geografia → POI → connettività → edifici/oggetti → cielo/meteo.
// Ogni fase usa uno stream PRNG indipendente; nessun Math.random().
import {
  GENERATOR_VERSION, WORLD_SIZE, type BridgeSpec, type PathEdge, type Poi, type PoiType, type PsychZone,
  type SkyInit, type TerrainSpec, type Vec2, type WeatherInit, type WorldSpec,
} from '../core/contracts';
import { Rng, clamp, streamFor } from '../core/rng';
import { layoutPoi } from './layouts';
import { WorldModel, toWorld } from './model';
import { personName, poiName } from './names';
import {
  GRID_MIN, GRID_N, GRID_STEP, applyPoiFlatten, buildBaseHeights, forestField, lakeRadiusAt, polyLens,
  polylineHit, rawHeight, sampleGrid, waterDepth,
} from './terrain';

const RADIUS: Record<PoiType, number> = {
  car_park: 22, cabin: 20, campsite: 22, picnic: 18, town: 72, gas_station: 24, bridge: 8,
  lake_dock: 14, lookout: 13, utility: 14, restroom: 11, roadside: 10, clearing: 16,
};

interface Ctx {
  seed: number;
  attempt: number;
  simple: boolean;
  terrain: TerrainSpec;
  base: Float32Array;
  riverLens?: number[];
  pois: Poi[];
  used: Set<string>;
  nameRng: Rng;
}

const h0 = (c: Ctx, x: number, z: number) => sampleGrid(c.base, x, z);
const wd = (c: Ctx, x: number, z: number) => waterDepth(c.terrain, x, z, h0(c, x, z), c.riverLens);

function siteOk(c: Ctx, pos: Vec2, radius: number, gap: number, opts: { nearWaterOk?: boolean } = {}): boolean {
  if (Math.abs(pos.x) > 570 - radius * 0.3 || Math.abs(pos.z) > 570 - radius * 0.3) return false;
  let min = Infinity, max = -Infinity;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const r = k % 2 ? radius : radius * 0.5;
    const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
    const h = h0(c, x, z);
    min = Math.min(min, h); max = Math.max(max, h);
    if (wd(c, pos.x + Math.cos(a) * (radius + 8), pos.z + Math.sin(a) * (radius + 8)) > 0) return false;
  }
  if (wd(c, pos.x, pos.z) > 0) return false;
  if (max - min > radius * 0.3 + 4) return false;
  if (!opts.nearWaterOk) {
    if (c.terrain.river && polylineHit(c.terrain.river.points, pos.x, pos.z, c.riverLens).d < radius + 34) return false;
    if (c.terrain.lake && Math.hypot(pos.x - c.terrain.lake.center.x, pos.z - c.terrain.lake.center.z) < c.terrain.lake.radius * 1.65 + radius + 8) return false;
  }
  for (const p of c.pois) if (Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < p.radius + radius + gap) return false;
  return true;
}

function addPoi(c: Ctx, type: PoiType, pos: Vec2, rotY = 0): Poi {
  const n = c.pois.filter((p) => p.type === type).length;
  const poi: Poi = {
    id: `${type}${n}`, type, name: poiName(type, c.nameRng.fork(`${type}${n}`), c.used), pos: { x: pos.x, z: pos.z }, rotY,
    radius: RADIUS[type], baseHeight: h0(c, pos.x, pos.z), lit: false, variant: 0,
  };
  c.pois.push(poi);
  return poi;
}

function placePoi(c: Ctx, type: PoiType, rng: Rng, opts: { near?: Vec2; nearMax?: number; nearMin?: number; score?: (p: Vec2) => number; tries?: number; gap?: number } = {}): Poi | null {
  const tries = opts.tries ?? 70;
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    let pos: Vec2;
    if (opts.near) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(opts.nearMin ?? 90, opts.nearMax ?? 240);
      pos = { x: opts.near.x + Math.cos(a) * d, z: opts.near.z + Math.sin(a) * d };
    } else pos = { x: rng.range(-560, 560), z: rng.range(-560, 560) };
    const gap = i < tries * 0.6 ? opts.gap ?? 80 : (opts.gap ?? 80) * 0.6;
    if (!siteOk(c, pos, RADIUS[type], gap)) continue;
    if (!opts.score) { best = pos; break; }
    const s = opts.score(pos);
    if (s > bestScore) { bestScore = s; best = pos; }
  }
  return best ? addPoi(c, type, best) : null;
}

// ---------------------------------------------------------------- A*

const AN = 139; // celle da 10 m su [-690, 690]
const ac = (i: number) => -690 + i * 10;
const ai = (v: number) => clamp(Math.round((v + 690) / 10), 0, AN - 1);

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    let i = this.k.length;
    this.k.push(key); this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.v[p], this.v[i]] = [this.v[i], this.v[p]];
      i = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    const lk = this.k.pop()!, lv = this.v.pop()!;
    if (this.k.length) {
      this.k[0] = lk; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
}

interface NavGrid { h: Float32Array; blocked: Uint8Array; river: Uint8Array; bridge: Uint8Array; onPath: Uint8Array }

function buildNav(c: Ctx, heights: Float32Array): NavGrid {
  const g: NavGrid = { h: new Float32Array(AN * AN), blocked: new Uint8Array(AN * AN), river: new Uint8Array(AN * AN), bridge: new Uint8Array(AN * AN), onPath: new Uint8Array(AN * AN) };
  for (let j = 0; j < AN; j++)
    for (let i = 0; i < AN; i++) {
      const x = ac(i), z = ac(j), k = j * AN + i;
      g.h[k] = sampleGrid(heights, x, z);
      if (Math.max(Math.abs(x), Math.abs(z)) > 655) g.blocked[k] = 1;
      const t = c.terrain;
      if (t.lake) {
        const dx = x - t.lake.center.x, dz = z - t.lake.center.z;
        if (Math.hypot(dx, dz) < lakeRadiusAt(t.lake, Math.atan2(dz, dx)) * 1.08 + 5) g.blocked[k] = 1;
      }
      if (t.river && polylineHit(t.river.points, x, z, c.riverLens).d < t.river.halfWidth + 6) g.river[k] = 1;
      // i sentieri non attraversano l'interno dei POI: vi entrano solo dal varco frontale
      for (const p of c.pois) if (Math.hypot(x - p.pos.x, z - p.pos.z) < p.radius + 4) g.blocked[k] = 1;
    }
  return g;
}

function astar(g: NavGrid, from: Vec2, to: Vec2): number[] | null {
  const s = ai(from.z) * AN + ai(from.x), e = ai(to.z) * AN + ai(to.x);
  const cost = new Float32Array(AN * AN).fill(Infinity);
  const prev = new Int32Array(AN * AN).fill(-1);
  const heap = new Heap();
  cost[s] = 0;
  heap.push(0, s);
  const ex = e % AN, ez = (e - ex) / AN;
  while (heap.size) {
    const k = heap.pop();
    if (k === e) break;
    const i = k % AN, j = (k - i) / AN;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= AN || nj >= AN) continue;
        const nk = nj * AN + ni;
        if (g.blocked[nk] && nk !== e) continue;
        const len = di && dj ? 14.14 : 10;
        const slope = Math.abs(g.h[nk] - g.h[k]) / len;
        let cst = len * (1 + 34 * slope * slope) * (g.onPath[nk] ? 0.42 : 1);
        if (g.river[nk]) cst += g.bridge[nk] ? 0 : 520;
        const nc = cost[k] + cst;
        if (nc < cost[nk]) {
          cost[nk] = nc; prev[nk] = k;
          heap.push(nc + Math.hypot(ni - ex, nj - ez) * 4.2, nk);
        }
      }
  }
  if (prev[e] < 0 && e !== s) return null;
  const out: number[] = [];
  for (let k = e; k >= 0; k = prev[k]) { out.push(k); if (k === s) break; }
  return out.reverse();
}

function chaikin(pts: Vec2[], iters: number): Vec2[] {
  for (let it = 0; it < iters; it++) {
    if (pts.length < 3) return pts;
    const out: Vec2[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

const plen = (pts: Vec2[]) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return l; };

// ---------------------------------------------------------------- generazione

function tryGenerate(seed: number, attempt: number, simple: boolean): { spec: WorldSpec; base: Float32Array } | null {
  const tag = `a${attempt}`;
  const rng = streamFor(seed, 'worldgen').fork(tag);
  const poiRng = streamFor(seed, 'poi').fork(tag);
  const nameRng = streamFor(seed, 'names');

  // 1. parametri del terreno e ingresso
  const side = rng.int(0, 3);
  const u = rng.range(-330, 330);
  const depth = rng.range(215, 370);
  const edge = (uu: number, d: number): Vec2 => side === 0 ? { x: uu, z: -700 + d } : side === 1 ? { x: 700 - d, z: uu } : side === 2 ? { x: uu, z: 700 - d } : { x: -700 + d, z: uu };
  const car = edge(u, depth);
  const uEntry = u + rng.range(-70, 70);
  const entryPos = edge(uEntry, 8);
  const outer = edge(uEntry + (uEntry - u) * 0.3, -110);
  const terrain: TerrainSpec = {
    gridStep: GRID_STEP, chunkSize: 100, amplitude: rng.range(9, 24), salt: rng.int(1, 1e6), ridgeAngle: rng.range(0, Math.PI),
    forestSalt: rng.int(1, 1e6), forestBias: rng.range(-0.07, 0.1), entryRoad: { from: car, to: outer },
  };

  // 2. fiume
  if (!simple && rng.chance(0.52)) {
    const horizontal = rng.chance(0.5);
    let off = rng.range(-380, 380);
    const carLat = horizontal ? car.z : car.x;
    if (Math.abs(off - carLat) < 170) off = carLat + (off >= carLat ? 1 : -1) * rng.range(180, 260);
    off = clamp(off, -470, 470);
    const a1 = rng.range(40, 110), a2 = rng.range(15, 45), p1 = rng.range(0, 6.28), p2 = rng.range(0, 6.28), f1 = rng.range(0.004, 0.008);
    const pts: Vec2[] = [];
    for (let s = -840; s <= 840; s += 60) {
      const lat = off + a1 * Math.sin(s * f1 + p1) + a2 * Math.sin(s * f1 * 2.7 + p2);
      pts.push(horizontal ? { x: s, z: lat } : { x: lat, z: s });
    }
    let minH = Infinity;
    const tmp: TerrainSpec = { ...terrain };
    for (const p of pts) if (Math.abs(p.x) < 600 && Math.abs(p.z) < 600) minH = Math.min(minH, rawHeight(tmp, p.x, p.z));
    terrain.river = { points: pts, halfWidth: rng.range(4, 6.5), levelStart: minH - 0.5, levelEnd: minH - 2.5 };
  }
  const riverLens = terrain.river ? polyLens(terrain.river.points) : undefined;

  // 3. lago
  if (!simple && rng.chance(0.56)) {
    let best: Vec2 | null = null, bh = Infinity;
    const R = rng.range(55, 105);
    for (let i = 0; i < 16; i++) {
      const p = { x: rng.range(-420, 420), z: rng.range(-420, 420) };
      if (Math.hypot(p.x - car.x, p.z - car.z) < R + 150) continue;
      if (terrain.river && polylineHit(terrain.river.points, p.x, p.z, riverLens).d < R * 1.7 + 95) continue;
      const hh = rawHeight(terrain, p.x, p.z);
      if (hh < bh) { bh = hh; best = p; }
    }
    if (best) {
      const wob: number[] = [];
      for (let k = 0; k < 3; k++) wob.push(rng.range(0.04, 0.13), rng.range(0, 6.28));
      terrain.lake = { center: best, radius: R, level: bh - 0.2, wobble: wob };
    }
  }

  const c: Ctx = { seed, attempt, simple, terrain, base: buildBaseHeights(terrain), riverLens, pois: [], used: new Set(), nameRng };

  // 4. POI
  let carPos: Vec2 | null = null;
  for (let i = 0; i < 60 && !carPos; i++) {
    const p = i === 0 ? car : { x: car.x + rng.range(-70, 70), z: car.z + rng.range(-70, 70) };
    if (siteOk(c, p, RADIUS.car_park, 0)) carPos = p;
  }
  if (!carPos) return null;
  terrain.entryRoad.from = carPos;
  const carPoi = addPoi(c, 'car_park', carPos);
  carPoi.rotY = Math.atan2(carPos.x - entryPos.x, carPos.z - entryPos.z);

  const fr = (n: string) => poiRng.fork(n);
  let town: Poi | null = null;
  if (!simple && poiRng.chance(0.46)) town = placePoi(c, 'town', fr('town'), { near: carPos, nearMin: 170, nearMax: 520, tries: 90, gap: 60 });
  const hasGas = poiRng.chance(town ? 0.6 : 0.3);
  if (hasGas) placePoi(c, 'gas_station', fr('gas'), { near: town ? town.pos : carPos, nearMin: town ? 120 : 110, nearMax: town ? 210 : 280, gap: 30 });
  const nCabin = poiRng.int(1, 3);
  for (let i = 0; i < nCabin; i++) placePoi(c, 'cabin', fr('cabin' + i), { tries: i === 0 ? 220 : 70 });
  const nCamp = poiRng.int(1, 2);
  for (let i = 0; i < nCamp; i++) placePoi(c, 'campsite', fr('camp' + i), { tries: i === 0 ? 220 : 70, score: (p) => -Math.abs(forestField(terrain, p.x, p.z) - 0.5) });
  const nPicnic = poiRng.int(0, 2);
  for (let i = 0; i < nPicnic; i++) placePoi(c, 'picnic', fr('picnic' + i), { near: i === 0 ? carPos : undefined, nearMin: 110, nearMax: 330 });
  if (poiRng.chance(0.72)) placePoi(c, 'utility', fr('utility'));
  if (poiRng.chance(0.55)) placePoi(c, 'lookout', fr('lookout'), { tries: 40, score: (p) => h0(c, p.x, p.z) });
  if (poiRng.chance(0.5)) {
    const anchors = c.pois.filter((p) => p.type === 'campsite' || p.type === 'picnic' || p.type === 'car_park');
    placePoi(c, 'restroom', fr('restroom'), { near: fr('restroomA').pick(anchors).pos, nearMin: 60, nearMax: 130, gap: 24 });
  }
  if (poiRng.chance(0.62)) placePoi(c, 'roadside', fr('roadside'), { near: carPos, nearMin: 140, nearMax: 460, gap: 50 });
  const nClear = poiRng.int(1, 2);
  for (let i = 0; i < nClear; i++) placePoi(c, 'clearing', fr('clearing' + i), { score: (p) => -forestField(terrain, p.x, p.z) + h0(c, p.x, p.z) * 0.01 });
  if (terrain.lake && poiRng.chance(0.85)) {
    const lr = fr('dock');
    for (let i = 0; i < 24; i++) {
      const a = lr.range(0, Math.PI * 2);
      const R = lakeRadiusAt(terrain.lake, a) * 1.0 - 1.5;
      const pos = { x: terrain.lake.center.x + Math.cos(a) * R, z: terrain.lake.center.z + Math.sin(a) * R };
      const back = { x: pos.x + Math.cos(a) * 14, z: pos.z + Math.sin(a) * 14 };
      if (Math.abs(back.x) > 560 || Math.abs(back.z) > 560) continue;
      if (c.pois.some((p) => Math.hypot(p.pos.x - back.x, p.pos.z - back.z) < p.radius + 50)) continue;
      // centro del POI a riva, molo verso il centro del lago
      const poi = addPoi(c, 'lake_dock', back, Math.atan2(-Math.cos(a), -Math.sin(a)));
      poi.baseHeight = terrain.lake.level + 0.55;
      break;
    }
  }
  if (c.pois.filter((p) => p.type === 'cabin').length < 1 || c.pois.filter((p) => p.type === 'campsite').length < 1) return null;
  if (c.pois.length < 5) return null;

  // 5. quote definitive
  const heights = new Float32Array(c.base);
  applyPoiFlatten(heights, c.pois);
  const nav = buildNav(c, heights);

  // 6. connettività
  const edges: PathEdge[] = [];
  const bridges: BridgeSpec[] = [];
  const isRoadNode = (p: Poi) => p.type === 'car_park' || p.type === 'town' || p.type === 'gas_station';
  const gate = (p: Poi): Vec2 => toWorld(0, (p.type === 'lake_dock' ? -1 : 1) * (p.radius + 10), p.pos.x, p.pos.z, p.rotY);
  const connect = (a: Poi, b: Poi): boolean => {
    const ga = gate(a), gb = gate(b);
    const cells = astar(nav, ga, gb);
    if (!cells) return false;
    const kind = isRoadNode(a) && isRoadNode(b) ? 'road' : 'trail';
    const width = kind === 'road' ? 5 : 1.9;
    // segmenti separati dai ponti
    let seg: Vec2[] = [a.pos, ga];
    let fromId = a.id;
    const flush = (toId: string, end: Vec2) => {
      seg.push(gb, end);
      const pts = chaikin(seg, 2);
      edges.push({ id: `e${edges.length}`, a: fromId, b: toId, kind, width, points: pts, length: plen(pts) });
    };
    let i = 1;
    while (i < cells.length - 1) {
      const k = cells[i];
      if (nav.river[k] && terrain.river) {
        let j = i;
        while (j < cells.length - 1 && nav.river[cells[j]]) j++;
        const mid = cells[(i + j - 1) >> 1];
        const mx = ac(mid % AN), mz = ac(Math.floor(mid / AN));
        const hit = polylineHit(terrain.river.points, mx, mz, riverLens);
        let br = bridges.find((b2) => Math.hypot((b2.a.x + b2.b.x) / 2 - hit.px, (b2.a.z + b2.b.z) / 2 - hit.pz) < 45);
        const before = cells[i - 1];
        const bx = ac(before % AN), bz = ac(Math.floor(before / AN));
        if (!br) {
          let nx = -hit.tz, nz = hit.tx;
          const ext = terrain.river.halfWidth + 6.5;
          const A = { x: hit.px - nx * ext, z: hit.pz - nz * ext }, B = { x: hit.px + nx * ext, z: hit.pz + nz * ext };
          const deckY = Math.max(sampleGrid(heights, A.x, A.z), sampleGrid(heights, B.x, B.z)) + 0.35;
          const poi = addPoi(c, 'bridge', { x: hit.px, z: hit.pz }, Math.atan2(nx, nz));
          poi.baseHeight = deckY;
          br = { id: `bridge${bridges.length}`, a: A, b: B, width: 2.8, deckY, poiId: poi.id };
          bridges.push(br);
          // le celle attorno al ponte diventano attraversabili a costo normale
          for (let q = 0; q < AN * AN; q++) if (nav.river[q] && Math.hypot(ac(q % AN) - hit.px, ac(Math.floor(q / AN)) - hit.pz) < 22) nav.bridge[q] = 1;
        }
        const nearA = Math.hypot(bx - br.a.x, bz - br.a.z) <= Math.hypot(bx - br.b.x, bz - br.b.z);
        const p1 = nearA ? br.a : br.b, p2 = nearA ? br.b : br.a;
        const mid2 = { x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2 };
        seg.push(p1);
        // tratto fino al centro del ponte (rettilineo, senza smussatura)
        const pts = chaikin(seg.slice(0, -1).concat([p1]), 2);
        pts.push(mid2);
        edges.push({ id: `e${edges.length}`, a: fromId, b: br.poiId, kind, width, points: pts, length: plen(pts) });
        fromId = br.poiId;
        seg = [mid2, p2];
        i = j;
        continue;
      }
      nav.onPath[k] = 1;
      seg.push({ x: ac(k % AN), z: ac(Math.floor(k / AN)) });
      i++;
    }
    flush(b.id, b.pos);
    return true;
  };

  const land = c.pois.filter((p) => p.type !== 'bridge');
  const connected: Poi[] = [carPoi];
  const pending = land.filter((p) => p !== carPoi);
  while (pending.length) {
    let bi = 0, bj = 0, bd = Infinity;
    pending.forEach((p, i) => connected.forEach((q, j) => {
      let d = Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z);
      if (isRoadNode(p) && isRoadNode(q)) d *= 0.7;
      if (d < bd) { bd = d; bi = i; bj = j; }
    }));
    const p = pending.splice(bi, 1)[0];
    const q = connected[bj];
    if (p.type !== 'lake_dock') p.rotY = Math.atan2(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
    if (!connect(q, p)) return null;
    connected.push(p);
  }
  // anelli: evitano una struttura ad albero puramente lineare
  const loopRng = poiRng.fork('loops');
  const model0adj = new Map<string, string[]>();
  for (const e of edges) { (model0adj.get(e.a) ?? model0adj.set(e.a, []).get(e.a)!).push(e.b); (model0adj.get(e.b) ?? model0adj.set(e.b, []).get(e.b)!).push(e.a); }
  let loops = loopRng.int(1, 2);
  const cand: [Poi, Poi, number][] = [];
  for (let i = 0; i < land.length; i++)
    for (let j = i + 1; j < land.length; j++) {
      const d = Math.hypot(land[i].pos.x - land[j].pos.x, land[i].pos.z - land[j].pos.z);
      if (d < 360 && !(model0adj.get(land[i].id) ?? []).includes(land[j].id)) cand.push([land[i], land[j], d]);
    }
  loopRng.shuffle(cand);
  for (const [a, b] of cand) { if (loops <= 0) break; if (connect(a, b)) loops--; }

  // strada d'accesso
  const roadPts = [entryPos, { x: (entryPos.x + carPos.x) / 2, z: (entryPos.z + carPos.z) / 2 }, carPos];
  edges.push({ id: `e${edges.length}`, a: 'entry', b: carPoi.id, kind: 'road', width: 5, points: roadPts, length: plen(roadPts) });

  // 8. edifici e oggetti
  const spec: WorldSpec = {
    seed, generatorVersion: GENERATOR_VERSION, size: WORLD_SIZE, attempt, terrain, pois: c.pois, entry: { id: 'entry', pos: entryPos },
    edges, bridges, buildings: [], objects: [], carSpawn: { pos: carPos, rotY: carPoi.rotY }, playerSpawn: { pos: carPos, yaw: carPoi.rotY },
    scenic: [], zones: [], sky: makeSky(seed), weather: makeWeather(seed), officer: personName(nameRng.fork('officer')),
    colleague: personName(nameRng.fork('colleague')), farLights: [], mysteries: [],
  };
  for (const p of c.pois) layoutPoi(spec, p, streamFor(seed, 'objects').fork(tag + p.id), bridges.find((b) => b.poiId === p.id), (x, z) => sampleGrid(heights, x, z));
  const carObj = spec.objects.find((o) => o.kind === 'police_car')!;
  spec.carSpawn = { pos: carObj.pos, rotY: carObj.rotY };
  const ps = toWorld(-1.9, 0.3, carObj.pos.x, carObj.pos.z, carObj.rotY);
  spec.playerSpawn = { pos: ps, yaw: carObj.rotY };

  // 9. geografia psicologica e scenografia
  const zr = rng.fork('zones');
  const zones: PsychZone[] = [];
  for (let gz = -600; gz <= 600; gz += 150)
    for (let gx = -600; gx <= 600; gx += 150) {
      const x = gx + zr.range(-40, 40), z = gz + zr.range(-40, 40);
      if (wd(c, x, z) > 0) { zones.push({ kind: 'water', pos: { x, z }, radius: 60 }); continue; }
      const f = forestField(terrain, x, z);
      const sl = Math.abs(sampleGrid(heights, x + 15, z) - sampleGrid(heights, x - 15, z)) + Math.abs(sampleGrid(heights, x, z + 15) - sampleGrid(heights, x, z - 15));
      if (sl > 9) zones.push({ kind: 'slope', pos: { x, z }, radius: 60 });
      else if (f > 0.72) zones.push({ kind: 'dense', pos: { x, z }, radius: 70 });
      else if (f < 0.28) zones.push({ kind: 'open', pos: { x, z }, radius: 70 });
    }
  for (const p of c.pois) {
    if (p.lit) zones.push({ kind: 'lit', pos: p.pos, radius: p.radius + 10 });
    if (p.type === 'clearing') zones.push({ kind: 'clearing', pos: p.pos, radius: p.radius });
    const nearest = Math.min(...c.pois.filter((q) => q !== p).map((q) => Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z)));
    if (nearest > 260) zones.push({ kind: 'isolated', pos: p.pos, radius: p.radius + 20 });
  }
  for (const e of edges) {
    if (e.kind !== 'trail') continue;
    const m = e.points[e.points.length >> 1];
    if (forestField(terrain, m.x, m.z) > 0.7) zones.push({ kind: 'narrow', pos: m, radius: 40 });
  }
  spec.zones = zones;
  let hi: Vec2 = { x: 0, z: 0 }, hh = -Infinity;
  for (let i = 0; i < 60; i++) { const x = zr.range(-520, 520), z = zr.range(-520, 520); const v = sampleGrid(heights, x, z); if (v > hh && wd(c, x, z) === 0) { hh = v; hi = { x, z }; } }
  spec.scenic.push({ pos: hi, kind: 'peak' });
  for (const p of c.pois) if (p.type === 'lookout' || p.type === 'lake_dock' || p.type === 'clearing') spec.scenic.push({ pos: p.pos, kind: 'vista' });
  const nl = zr.int(1, 3);
  for (let i = 0; i < nl; i++) spec.farLights.push({ azimuth: zr.range(0, Math.PI * 2), count: zr.int(3, 14) });

  return { spec, base: c.base };
}

export function makeSky(seed: number): SkyInit {
  const r = streamFor(seed, 'sky');
  const u = r.next();
  const startHour = u < 0.32 ? r.range(19.1, 20.6) : u < 0.86 ? r.range(20.6, 27.4) : r.range(27.4, 28.8);
  return {
    startHour, moonPhase: r.next(), moonAzimuth: r.range(0, Math.PI * 2), moonPeakElevation: r.range(-0.25, 1.1),
    starSeed: r.int(1, 99999), sunsetAzimuth: r.range(-0.5, 0.5) + Math.PI * 1.5, tint: r.next(),
  };
}

export function makeWeather(seed: number): WeatherInit {
  const r = streamFor(seed, 'weather');
  const baseCloud = clamp(r.next() * 1.15 - 0.05, 0, 1);
  return {
    salt: r.int(1, 1e6), baseCloud, baseFog: r.next() ** 2.2 * 0.85, basePrecip: baseCloud > 0.5 ? r.next() ** 1.5 * (baseCloud - 0.3) : 0,
    baseWind: r.next() ** 1.4, windDir: r.range(0, Math.PI * 2), temperature: r.range(-7, 19), volatility: r.range(0.15, 1),
  };
}

export interface Validation { ok: boolean; errors: string[] }

/** Invarianti della mappa: dimensione, raggiungibilità di POI e oggetti, connessione del grafo. */
export function validateWorld(spec: WorldSpec, model: WorldModel): Validation {
  const errors: string[] = [];
  if (spec.size !== WORLD_SIZE) errors.push('size');
  const reach = model.reachable(spec.playerSpawn.pos);
  if (model.blockedAt(spec.playerSpawn.pos.x, spec.playerSpawn.pos.z)) errors.push('spawn blocked');
  for (const p of spec.pois) {
    if (Math.abs(p.pos.x) > 690 || Math.abs(p.pos.z) > 690) errors.push(`poi out ${p.id}`);
    if (!reach.at(p.pos.x, p.pos.z)) errors.push(`poi unreachable ${p.id}`);
    if (p.type !== 'car_park' && model.route(spec.pois[0].id, p.id).length === 0) errors.push(`poi disconnected ${p.id}`);
  }
  for (const o of spec.objects) {
    if (Math.abs(o.pos.x) > 690 || Math.abs(o.pos.z) > 690) errors.push(`object out ${o.id}`);
    else if (!reach.at(o.pos.x, o.pos.z)) errors.push(`object unreachable ${o.id}`);
  }
  for (const b of spec.bridges) {
    const mx = (b.a.x + b.b.x) / 2, mz = (b.a.z + b.b.z) / 2;
    if (model.blockedAt(mx, mz)) errors.push(`bridge blocked ${b.id}`);
  }
  if (!spec.objects.some((o) => o.kind === 'police_car')) errors.push('no car');
  return { ok: errors.length === 0, errors };
}

const cache = new Map<number, { spec: WorldSpec; model: WorldModel }>();

/** Genera mondo e modello fisico validati. Ripara ritentando con sotto-stream diversi. */
export function generateWorld(seed: number, postProcess?: (spec: WorldSpec) => void): { spec: WorldSpec; model: WorldModel } {
  const hit = cache.get(seed);
  if (hit && !postProcess) return hit;
  for (let attempt = 0; attempt < 10; attempt++) {
    const simple = attempt >= 7;
    const gen = tryGenerate(seed, attempt, simple);
    if (!gen) continue;
    const spec = gen.spec;
    postProcess?.(spec);
    const model = new WorldModel(spec, gen.base);
    // oggetti aggiunti dal postProcess senza quota: appoggiati al terreno reale
    for (const o of spec.objects) if (Number.isNaN(o.y)) o.y = model.groundAt(o.pos.x, o.pos.z) + 0.03;
    const val = validateWorld(spec, model);
    if (val.ok) {
      if (!postProcess) { if (cache.size > 4) cache.clear(); cache.set(seed, { spec, model }); }
      return { spec, model };
    }
  }
  throw new Error(`worldgen failed for seed ${seed}`);
}

export { GRID_MIN, GRID_N };

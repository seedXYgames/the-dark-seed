// WorldModel: vista fisica derivata deterministicamente dalla WorldSpec.
// Quote, acqua, sentieri, alberi, collisioni, piattaforme, grafo dei percorsi. Nessun Babylon.
import type { IWorldModel, Surface } from '../core/api';
import { WORLD_HALF, type BuildingSpec, type Poi, type Vec2, type WorldObjectSpec, type WorldSpec } from '../core/contracts';
import { clamp, hash2 } from '../core/rng';
import {
  GRID_MAX, GRID_MIN, GRID_N, GRID_STEP, PLAY_LIMIT, applyPoiFlatten, buildBaseHeights, forestField,
  polyLens, sampleGrid, waterDepth,
} from './terrain';

export interface Platform { id: string; cx: number; cz: number; hx: number; hz: number; rot: number; y: number; kind: 'bridge' | 'floor' | 'pier' }
export interface Collider { kind: 'circle' | 'obb'; x: number; z: number; r: number; hx: number; hz: number; rot: number; doorId?: string; objectId?: string }

export const MASK_STEP = 2;
export const MASK_N = (WORLD_HALF * 2) / MASK_STEP + 1; // 701
const HASH = 16;
export const PLAYER_RADIUS = 0.35;

function toLocal(px: number, pz: number, cx: number, cz: number, rot: number): [number, number] {
  const dx = px - cx, dz = pz - cz;
  const c = Math.cos(rot), s = Math.sin(rot);
  // inverso di world = c + lx*(cos,-sin) + lz*(sin,cos)
  return [dx * c - dz * s, dx * s + dz * c];
}
export function toWorld(lx: number, lz: number, cx: number, cz: number, rot: number): Vec2 {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
}

/** Collisori dei muri di un edificio; le porte hanno doorId e si ignorano quando aperte. */
export function buildingColliders(b: BuildingSpec): Collider[] {
  const out: Collider[] = [];
  const mk = (lx: number, lz: number, hx: number, hz: number, doorId?: string) => {
    const p = toWorld(lx, lz, b.pos.x, b.pos.z, b.rotY);
    out.push({ kind: 'obb', x: p.x, z: p.z, r: 0, hx, hz, rot: b.rotY, doorId });
  };
  if (b.kind === 'canopy') {
    for (const sx of [-1, 1]) {
      const p = toWorld(sx * (b.w / 2 - 0.4), 0, b.pos.x, b.pos.z, b.rotY);
      out.push({ kind: 'circle', x: p.x, z: p.z, r: 0.3, hx: 0, hz: 0, rot: 0 });
    }
    return out;
  }
  if (!b.enterable) {
    mk(0, 0, b.w / 2, b.d / 2);
    return out;
  }
  const T = 0.18;
  const hw = b.w / 2, hd = b.d / 2;
  const gap = 0.62; // semi-apertura della porta
  mk(0, -hd, hw, T); // retro
  mk(-hw, 0, T, hd);
  mk(hw, 0, T, hd);
  const left = b.doorOffset - gap, right = b.doorOffset + gap;
  if (left > -hw) mk((-hw + left) / 2, hd, (left + hw) / 2, T);
  if (right < hw) mk((hw + right) / 2, hd, (hw - right) / 2, T);
  if (b.doorId) mk(b.doorOffset, hd, gap, T * 0.8, b.doorId);
  return out;
}

const SOLID: Partial<Record<WorldObjectSpec['kind'], { r?: number; hx?: number; hz?: number }>> = {
  vehicle: { hx: 0.95, hz: 2.2 }, police_car: { hx: 0.95, hz: 2.3 }, tent: { r: 1.25 }, table: { hx: 0.95, hz: 0.75 },
  generator: { r: 0.65 }, woodpile: { hx: 1.0, hz: 0.45 }, pump: { r: 0.4 }, lamp_post: { r: 0.14 }, sign: { r: 0.12 },
  bench: { hx: 0.8, hz: 0.3 }, logbox: { r: 0.2 }, panel: { r: 0.0 },
};

export class WorldModel implements IWorldModel {
  readonly heights: Float32Array;
  readonly water: Float32Array;
  readonly pathMask: Uint8Array;
  readonly pathKind: Uint8Array;
  readonly trees: Float32Array;
  readonly rocks: Float32Array;
  readonly platforms: Platform[] = [];
  private hash = new Map<number, Collider[]>();
  private treeHash = new Map<number, number[]>();
  private poiMap = new Map<string, Poi>();
  private adj = new Map<string, { to: string; edge: number; len: number }[]>();
  readonly nodePos = new Map<string, Vec2>();
  readonly buildingById = new Map<string, BuildingSpec>();

  constructor(readonly spec: WorldSpec, baseHeights?: Float32Array) {
    const t = spec.terrain;
    this.heights = baseHeights ? new Float32Array(baseHeights) : buildBaseHeights(t);
    applyPoiFlatten(this.heights, spec.pois);
    for (const p of spec.pois) this.poiMap.set(p.id, p);
    // acqua
    this.water = new Float32Array(GRID_N * GRID_N);
    if (t.lake || t.river) {
      const lens = t.river ? polyLens(t.river.points) : undefined;
      for (let j = 0; j < GRID_N; j++)
        for (let i = 0; i < GRID_N; i++) {
          const k = j * GRID_N + i;
          this.water[k] = waterDepth(t, GRID_MIN + i * GRID_STEP, GRID_MIN + j * GRID_STEP, this.heights[k], lens);
        }
    }
    // piattaforme
    for (const br of spec.bridges) {
      const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z;
      const len = Math.hypot(dx, dz);
      this.platforms.push({ id: br.id, cx: (br.a.x + br.b.x) / 2, cz: (br.a.z + br.b.z) / 2, hx: br.width / 2, hz: len / 2, rot: Math.atan2(dx, dz), y: br.deckY, kind: 'bridge' });
    }
    for (const b of spec.buildings) {
      this.buildingById.set(b.id, b);
      if (b.enterable) this.platforms.push({ id: b.id, cx: b.pos.x, cz: b.pos.z, hx: b.w / 2, hz: b.d / 2, rot: b.rotY, y: b.floorY, kind: 'floor' });
    }
    for (const p of spec.pois) {
      if (p.type !== 'lake_dock') continue;
      const c = toWorld(0, 14, p.pos.x, p.pos.z, p.rotY);
      this.platforms.push({ id: p.id + '.pier', cx: c.x, cz: c.z, hx: 1.2, hz: 10, rot: p.rotY, y: p.baseHeight + 0.35, kind: 'pier' });
    }
    // sentieri
    this.pathMask = new Uint8Array(MASK_N * MASK_N);
    this.pathKind = new Uint8Array(MASK_N * MASK_N);
    for (const e of spec.edges) this.stampPath(e.points, e.width, e.kind === 'road' ? 2 : 1);
    for (const p of spec.pois) {
      if (p.type === 'car_park' || p.type === 'gas_station') this.stampDisc(p.pos.x, p.pos.z, p.radius * 0.8, 2);
      if (p.type === 'town') this.stampPath([toWorld(-58, 0, p.pos.x, p.pos.z, p.rotY), toWorld(58, 0, p.pos.x, p.pos.z, p.rotY)], 6, 2);
    }
    // collisori statici
    for (const b of spec.buildings) for (const c of buildingColliders(b)) this.addCollider(c);
    for (const o of spec.objects) {
      const s = SOLID[o.kind];
      if (!s || o.containerId) continue;
      if (s.r !== undefined) { if (s.r > 0) this.addCollider({ kind: 'circle', x: o.pos.x, z: o.pos.z, r: s.r, hx: 0, hz: 0, rot: 0, objectId: o.id }); }
      else this.addCollider({ kind: 'obb', x: o.pos.x, z: o.pos.z, r: 0, hx: s.hx!, hz: s.hz!, rot: o.rotY, objectId: o.id });
    }
    // grafo
    for (const p of spec.pois) this.nodePos.set(p.id, p.pos);
    this.nodePos.set(spec.entry.id, spec.entry.pos);
    spec.edges.forEach((e, idx) => {
      if (!this.adj.has(e.a)) this.adj.set(e.a, []);
      if (!this.adj.has(e.b)) this.adj.set(e.b, []);
      this.adj.get(e.a)!.push({ to: e.b, edge: idx, len: e.length });
      this.adj.get(e.b)!.push({ to: e.a, edge: idx, len: e.length });
    });
    // flora
    const { trees, rocks } = this.generateFlora();
    this.trees = trees;
    this.rocks = rocks;
    for (let n = 0; n < trees.length / 5; n++) {
      const x = trees[n * 5], z = trees[n * 5 + 1];
      if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) continue;
      const key = this.hkey(x, z, 8);
      let arr = this.treeHash.get(key);
      if (!arr) this.treeHash.set(key, (arr = []));
      arr.push(n);
    }
    for (let n = 0; n < rocks.length / 4; n++) {
      const sc = rocks[n * 4 + 2];
      if (sc > 1.1) this.addCollider({ kind: 'circle', x: rocks[n * 4], z: rocks[n * 4 + 1], r: 0.55 * sc, hx: 0, hz: 0, rot: 0 });
    }
  }

  private hkey(x: number, z: number, cell = HASH): number {
    return (Math.floor((x + 1000) / cell) << 12) | Math.floor((z + 1000) / cell);
  }
  private addCollider(c: Collider) {
    const ext = c.kind === 'circle' ? c.r : Math.hypot(c.hx, c.hz);
    const i0 = Math.floor((c.x - ext + 1000) / HASH), i1 = Math.floor((c.x + ext + 1000) / HASH);
    const j0 = Math.floor((c.z - ext + 1000) / HASH), j1 = Math.floor((c.z + ext + 1000) / HASH);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const key = (i << 12) | j;
        let arr = this.hash.get(key);
        if (!arr) this.hash.set(key, (arr = []));
        arr.push(c);
      }
  }
  private stampDisc(x: number, z: number, r: number, kind: number) {
    const i0 = Math.max(0, Math.floor((x - r + WORLD_HALF) / MASK_STEP)), i1 = Math.min(MASK_N - 1, Math.ceil((x + r + WORLD_HALF) / MASK_STEP));
    const j0 = Math.max(0, Math.floor((z - r + WORLD_HALF) / MASK_STEP)), j1 = Math.min(MASK_N - 1, Math.ceil((z + r + WORLD_HALF) / MASK_STEP));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * MASK_STEP - WORLD_HALF - x, j * MASK_STEP - WORLD_HALF - z);
        if (d > r) continue;
        const v = Math.round(255 * clamp((r - d) / Math.max(1, r * 0.45), 0.25, 1));
        const k = j * MASK_N + i;
        if (v > this.pathMask[k]) this.pathMask[k] = v;
        if (kind > this.pathKind[k]) this.pathKind[k] = kind;
      }
  }
  private stampPath(pts: Vec2[], width: number, kind: number) {
    const r = width / 2 + 1.2;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(l / 1.5));
      for (let s = 0; s <= n; s++) this.stampDisc(a.x + ((b.x - a.x) * s) / n, a.z + ((b.z - a.z) * s) / n, r, kind);
    }
  }

  private generateFlora() {
    const t = this.spec.terrain;
    const CELL = 7;
    const n = Math.floor((GRID_MAX - GRID_MIN) / CELL);
    const trees: number[] = [];
    const rocks: number[] = [];
    const salt = t.forestSalt;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const r0 = hash2(i, j, salt + 1);
        const x = GRID_MIN + (i + 0.17 + 0.66 * hash2(i, j, salt + 2)) * CELL;
        const z = GRID_MIN + (j + 0.17 + 0.66 * hash2(i, j, salt + 3)) * CELL;
        const inside = Math.abs(x) < WORLD_HALF && Math.abs(z) < WORLD_HALF;
        const dens = forestField(t, x, z);
        const wd = this.waterDepthAt(x, z);
        if (wd > 0.02) continue;
        if (inside && this.pathMaskAt(x, z) > 0) continue;
        if (this.inPoiClear(x, z)) continue;
        if (this.platformAt(x, z)) continue;
        const nearWater = this.waterDepthAt(x + 14, z) + this.waterDepthAt(x - 14, z) + this.waterDepthAt(x, z + 14) + this.waterDepthAt(x, z - 14) > 0;
        if (r0 < dens * 0.86) {
          const v = hash2(i, j, salt + 4);
          let variant = Math.floor(hash2(i, j, salt + 5) * 4); // 0..3 conifere
          if (nearWater && v < 0.55) variant = 4; // latifoglia
          else if (v < 0.035) variant = 5; // albero morto
          else if (v > 0.93) variant = 4;
          const scale = 0.75 + hash2(i, j, salt + 6) * 0.75 + (dens > 0.8 ? 0.15 : 0);
          trees.push(x, z, scale, variant, hash2(i, j, salt + 7) * Math.PI * 2);
        } else if (hash2(i, j, salt + 8) < 0.022 + (nearWater ? 0.05 : 0)) {
          rocks.push(x, z, 0.5 + hash2(i, j, salt + 9) * 1.4, hash2(i, j, salt + 10) * Math.PI * 2);
        }
      }
    return { trees: new Float32Array(trees), rocks: new Float32Array(rocks) };
  }

  private inPoiClear(x: number, z: number): boolean {
    for (const p of this.spec.pois) {
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      if (p.type === 'bridge') { if (d < 5) return true; continue; }
      if (d < p.radius * (p.type === 'clearing' ? 1.0 : 0.95)) return true;
    }
    return false;
  }

  poi(id: string): Poi | undefined { return this.poiMap.get(id); }
  heightAt(x: number, z: number): number { return sampleGrid(this.heights, x, z); }
  waterDepthAt(x: number, z: number): number {
    return Math.max(0, sampleGrid(this.water, x, z));
  }
  platformAt(x: number, z: number): Platform | undefined {
    for (const p of this.platforms) {
      if (Math.abs(x - p.cx) > p.hx + p.hz || Math.abs(z - p.cz) > p.hx + p.hz) continue;
      const [lx, lz] = toLocal(x, z, p.cx, p.cz, p.rot);
      if (Math.abs(lx) <= p.hx && Math.abs(lz) <= p.hz) return p;
    }
    return undefined;
  }
  groundAt(x: number, z: number): number {
    const p = this.platformAt(x, z);
    const h = this.heightAt(x, z);
    return p ? Math.max(p.y, p.kind === 'floor' ? p.y : h) : h;
  }
  indoorsAt(x: number, z: number): boolean {
    const p = this.platformAt(x, z);
    return !!p && p.kind === 'floor';
  }
  forestDensityAt(x: number, z: number): number {
    if (Math.abs(x) < WORLD_HALF && Math.abs(z) < WORLD_HALF && this.pathMaskAt(x, z) > 0.3) return 0.15 * forestField(this.spec.terrain, x, z);
    if (this.inPoiClear(x, z)) return 0.05;
    return forestField(this.spec.terrain, x, z);
  }
  private maskIdx(x: number, z: number): number {
    const i = clamp(Math.round((x + WORLD_HALF) / MASK_STEP), 0, MASK_N - 1);
    const j = clamp(Math.round((z + WORLD_HALF) / MASK_STEP), 0, MASK_N - 1);
    return j * MASK_N + i;
  }
  pathMaskAt(x: number, z: number): number {
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return 0;
    return this.pathMask[this.maskIdx(x, z)] / 255;
  }
  pathKindAt(x: number, z: number): 0 | 1 | 2 {
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return 0;
    return this.pathKind[this.maskIdx(x, z)] as 0 | 1 | 2;
  }
  surfaceAt(x: number, z: number): Surface {
    const p = this.platformAt(x, z);
    if (p) return p.kind === 'floor' ? 'floor' : 'wood';
    if (this.pathMaskAt(x, z) > 0.3) return this.pathKindAt(x, z) === 2 ? 'road' : 'dirt';
    return 'grass';
  }
  slopeAt(x: number, z: number): number {
    const e = 2.5;
    return Math.hypot(this.heightAt(x + e, z) - this.heightAt(x - e, z), this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
  }

  /** Vero se il punto non è calpestabile (acqua profonda, confine). */
  blockedAt(x: number, z: number): boolean {
    if (Math.abs(x) > PLAY_LIMIT || Math.abs(z) > PLAY_LIMIT) return true;
    if (this.platformAt(x, z)) return false;
    if (this.waterDepthAt(x, z) > 0.45) return true;
    return false;
  }

  /** Spinge fuori un cerchio dai collisori (muri, oggetti, tronchi, rocce). */
  resolve(x: number, z: number, radius: number, doorOpen: (doorId: string) => boolean): Vec2 {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const i0 = Math.floor((x - radius + 1000) / HASH), i1 = Math.floor((x + radius + 1000) / HASH);
      const j0 = Math.floor((z - radius + 1000) / HASH), j1 = Math.floor((z + radius + 1000) / HASH);
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const arr = this.hash.get((i << 12) | j);
          if (!arr) continue;
          for (const c of arr) {
            if (c.doorId && doorOpen(c.doorId)) continue;
            if (c.kind === 'circle') {
              const dx = x - c.x, dz = z - c.z;
              const d = Math.hypot(dx, dz), min = c.r + radius;
              if (d < min) {
                if (d < 1e-4) { x += min; } else { x = c.x + (dx / d) * min; z = c.z + (dz / d) * min; }
                moved = true;
              }
            } else {
              const [lx, lz] = toLocal(x, z, c.x, c.z, c.rot);
              const ex = c.hx + radius, ez = c.hz + radius;
              if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
                const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
                let nlx = lx, nlz = lz;
                if (px < pz) nlx = lx >= 0 ? ex : -ex; else nlz = lz >= 0 ? ez : -ez;
                const w = toWorld(nlx, nlz, c.x, c.z, c.rot);
                x = w.x; z = w.z; moved = true;
              }
            }
          }
        }
      // tronchi
      const ti0 = Math.floor((x - 1.2 + 1000) / 8), ti1 = Math.floor((x + 1.2 + 1000) / 8);
      const tj0 = Math.floor((z - 1.2 + 1000) / 8), tj1 = Math.floor((z + 1.2 + 1000) / 8);
      for (let i = ti0; i <= ti1; i++)
        for (let j = tj0; j <= tj1; j++) {
          const arr = this.treeHash.get((i << 12) | j);
          if (!arr) continue;
          for (const n of arr) {
            const tx = this.trees[n * 5], tz = this.trees[n * 5 + 1];
            const min = 0.24 * this.trees[n * 5 + 2] + radius;
            const dx = x - tx, dz = z - tz;
            const d = Math.hypot(dx, dz);
            if (d < min && d > 1e-4) { x = tx + (dx / d) * min; z = tz + (dz / d) * min; moved = true; }
          }
        }
      if (!moved) break;
    }
    return { x, z };
  }

  /** Movimento con scorrimento lungo ostacoli. Restituisce la nuova posizione valida. */
  move(pos: Vec2, dx: number, dz: number, doorOpen: (doorId: string) => boolean, radius = PLAYER_RADIUS): Vec2 {
    const step = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(step / 0.3));
    let x = pos.x, z = pos.z;
    for (let s = 0; s < n; s++) {
      const sx = dx / n, sz = dz / n;
      let nx = x + sx, nz = z + sz;
      if (this.blockedAt(nx, nz)) {
        if (!this.blockedAt(x + sx, z)) nz = z;
        else if (!this.blockedAt(x, z + sz)) nx = x;
        else break;
      }
      const r = this.resolve(nx, nz, radius, doorOpen);
      if (this.blockedAt(r.x, r.z)) break;
      x = r.x; z = r.z;
    }
    return { x, z };
  }

  // ---------------------------------------------------------------- grafo

  /** Percorso lungo sentieri tra due nodi (POI o ingresso). */
  route(from: string, to: string): Vec2[] {
    if (from === to) return [this.nodePos.get(from)!];
    const dist = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, { node: string; edge: number }>();
    const open = new Set<string>([from]);
    while (open.size) {
      let cur = '';
      let best = Infinity;
      for (const n of open) { const d = dist.get(n)!; if (d < best) { best = d; cur = n; } }
      open.delete(cur);
      if (cur === to) break;
      for (const a of this.adj.get(cur) ?? []) {
        const nd = best + a.len;
        if (nd < (dist.get(a.to) ?? Infinity)) { dist.set(a.to, nd); prev.set(a.to, { node: cur, edge: a.edge }); open.add(a.to); }
      }
    }
    if (!prev.has(to)) return [];
    const segs: Vec2[][] = [];
    let cur = to;
    while (cur !== from) {
      const p = prev.get(cur)!;
      const e = this.spec.edges[p.edge];
      segs.push(e.a === p.node ? e.points : [...e.points].reverse());
      cur = p.node;
    }
    segs.reverse();
    const out: Vec2[] = [];
    for (const s of segs) for (let i = out.length ? 1 : 0; i < s.length; i++) out.push(s[i]);
    return out;
  }
  routeLength(pts: Vec2[]): number {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return l;
  }
  neighbors(node: string): string[] { return (this.adj.get(node) ?? []).map((a) => a.to); }
  nearestPoi(pos: Vec2): { poi: Poi; dist: number } {
    let best = this.spec.pois[0], bd = Infinity;
    for (const p of this.spec.pois) { const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (d < bd) { bd = d; best = p; } }
    return { poi: best, dist: bd };
  }
  poiAt(pos: Vec2): Poi | undefined {
    const n = this.nearestPoi(pos);
    return n.dist < n.poi.radius + 8 ? n.poi : undefined;
  }
  waterDistance(pos: Vec2): number {
    const t = this.spec.terrain;
    let d = Infinity;
    if (t.lake) d = Math.min(d, Math.max(0, Math.hypot(pos.x - t.lake.center.x, pos.z - t.lake.center.z) - t.lake.radius));
    if (t.river) for (let i = 1; i < t.river.points.length; i++) {
      const a = t.river.points[i - 1], b = t.river.points[i];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const q = clamp(((pos.x - a.x) * dx + (pos.z - a.z) * dz) / l2, 0, 1);
      d = Math.min(d, Math.hypot(pos.x - a.x - dx * q, pos.z - a.z - dz * q));
    }
    return d;
  }

  /** Celle raggiungibili a piedi dalla posizione data (griglia 5 m sull'area giocabile). */
  reachable(from: Vec2): { grid: Uint8Array; n: number; at(x: number, z: number): boolean } {
    const n = (WORLD_HALF * 2) / 5 + 1;
    const grid = new Uint8Array(n * n);
    const blocked = (i: number, j: number) => {
      const x = -WORLD_HALF + i * 5, z = -WORLD_HALF + j * 5;
      if (this.blockedAt(x, z)) {
        // la griglia a 5 m è più larga di un ponte: il corridoio del ponte conta come attraversabile
        let onBridge = false;
        for (const br of this.spec.bridges) if (distSeg(x, z, br.a, br.b) < 3.6) onBridge = true;
        if (!onBridge || Math.abs(x) > PLAY_LIMIT || Math.abs(z) > PLAY_LIMIT) return true;
      }
      for (const b of this.spec.buildings) {
        if (b.enterable || b.kind === 'canopy') continue;
        const [lx, lz] = toLocal(x, z, b.pos.x, b.pos.z, b.rotY);
        if (Math.abs(lx) < b.w / 2 + 0.3 && Math.abs(lz) < b.d / 2 + 0.3) return true;
      }
      return false;
    };
    const si = clamp(Math.round((from.x + WORLD_HALF) / 5), 0, n - 1), sj = clamp(Math.round((from.z + WORLD_HALF) / 5), 0, n - 1);
    const stack = [sj * n + si];
    grid[sj * n + si] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % n, j = (k - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (grid[nk] || blocked(ni, nj)) continue;
        grid[nk] = 1;
        stack.push(nk);
      }
    }
    const at = (x: number, z: number) => {
      const ci = Math.round((x + WORLD_HALF) / 5), cj = Math.round((z + WORLD_HALF) / 5);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ni = ci + di, nj = cj + dj;
          if (ni >= 0 && nj >= 0 && ni < n && nj < n && grid[nj * n + ni]) return true;
        }
      return false;
    };
    return { grid, n, at };
  }
}

function distSeg(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1) : 0;
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

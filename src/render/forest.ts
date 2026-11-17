// Bosco: mesh low-poly procedurali per variante, thin instances per chunk con due LOD, massi, sottobosco vicino.
import { WORLD_HALF } from '../core/contracts';
import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Rng } from '../core/rng';
import type { WorldModel } from '../world/model';
import { CHUNK_N, CHUNK_SIZE, chunkCenter, chunkDistance, chunkIndex, groupByChunk, hash3, lodFor, mix, sstep, type QualityParams } from './envMath';
import { makeEnvMaterial, sampleField, type TerrainFields } from './terrainMesh';

type C3 = [number, number, number];

/** Costruttore di mesh con orientamento automatico dei triangoli verso l'esterno e normali lisce. */
class Builder {
  pos: number[] = []; col: number[] = []; idx: number[] = []; nor: number[] = [];
  v(x: number, y: number, z: number, c: C3, k = 1): number {
    this.pos.push(x, y, z); this.col.push(c[0] * k, c[1] * k, c[2] * k, 1); this.nor.push(0, 0, 0);
    return this.pos.length / 3 - 1;
  }
  /** Triangolo rivolto in direzione opposta al punto di riferimento (rx, ry, rz). */
  tri(a: number, b: number, c: number, rx: number, ry: number, rz: number): void {
    const p = this.pos;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
    const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ox = (ax + p[b * 3] + p[c * 3]) / 3 - rx, oy = (ay + p[b * 3 + 1] + p[c * 3 + 1]) / 3 - ry, oz = (az + p[b * 3 + 2] + p[c * 3 + 2]) / 3 - rz;
    // convenzione Babylon (left-handed): faccia frontale ⇔ (b-a)×(c-a) punta verso l'interno
    if (nx * ox + ny * oy + nz * oz > 0) { this.idx.push(a, c, b); } else { this.idx.push(a, b, c); nx = -nx; ny = -ny; nz = -nz; }
    for (const q of [a, b, c]) { this.nor[q * 3] += nx; this.nor[q * 3 + 1] += ny; this.nor[q * 3 + 2] += nz; }
  }
  data(upBias = 0): VertexData {
    const n = this.nor;
    for (let i = 0; i < n.length; i += 3) {
      n[i + 1] += upBias * Math.hypot(n[i], n[i + 1], n[i + 2]);
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    const vd = new VertexData();
    vd.positions = new Float32Array(this.pos); vd.normals = new Float32Array(n); vd.colors = new Float32Array(this.col); vd.indices = new Uint32Array(this.idx);
    return vd;
  }
  get tris(): number { return this.idx.length / 3; }
}

function trunk(b: Builder, r: Rng, y0: number, y1: number, r0: number, r1: number, c: C3, sides = 5, lean = 0): void {
  const lo: number[] = [], hi: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    lo.push(b.v(Math.cos(a) * r0, y0, Math.sin(a) * r0, c, 0.75 + 0.2 * r.next()));
    hi.push(b.v(Math.cos(a) * r1 + lean, y1, Math.sin(a) * r1, c, 0.9 + 0.25 * r.next()));
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, ym = (y0 + y1) / 2;
    b.tri(lo[i], lo[j], hi[i], lean / 2, ym, 0);
    b.tri(lo[j], hi[j], hi[i], lean / 2, ym, 0);
  }
}

/** Palco di rami: cono irregolare con bordo frastagliato e fondo chiuso. */
function tier(b: Builder, r: Rng, y: number, h: number, rad: number, droop: number, cLow: C3, cHigh: C3, K = 7, ox = 0, oz = 0): void {
  const ring: number[] = [];
  const ph = r.next() * 6.28;
  for (let i = 0; i < K; i++) {
    const a = ph + ((i + (r.next() - 0.5) * 0.5) / K) * Math.PI * 2;
    const rr = rad * (i % 2 === 0 ? 1.08 : 0.8) * (0.86 + 0.28 * r.next());
    ring.push(b.v(ox + Math.cos(a) * rr, y - droop * rad * (0.6 + 0.8 * r.next()), oz + Math.sin(a) * rr, cLow, 0.72 + 0.4 * r.next()));
  }
  const apex = b.v(ox + (r.next() - 0.5) * rad * 0.12, y + h, oz + (r.next() - 0.5) * rad * 0.12, cHigh, 0.95 + 0.25 * r.next());
  const under = b.v(ox, y + h * 0.22, oz, cLow, 0.4);
  for (let i = 0; i < K; i++) {
    const j = (i + 1) % K;
    b.tri(ring[i], ring[j], apex, ox, y + h * 0.3, oz);
    b.tri(ring[i], ring[j], under, ox, y + h * 0.9, oz);
  }
}

function blob(b: Builder, r: Rng, cx: number, cy: number, cz: number, rx: number, ry: number, cLow: C3, cHigh: C3, seg = 6): void {
  const top = b.v(cx, cy + ry, cz, cHigh, 1 + 0.15 * r.next());
  const bot = b.v(cx, cy - ry * 0.8, cz, cLow, 0.5);
  const rings: number[][] = [];
  for (const lat of [0.42, -0.35]) {
    const ring: number[] = [];
    for (let i = 0; i < seg; i++) {
      const a = ((i + (lat > 0 ? 0 : 0.5)) / seg) * Math.PI * 2;
      const k = 0.82 + 0.36 * r.next(), cl = Math.cos(lat);
      ring.push(b.v(cx + Math.cos(a) * rx * cl * k, cy + Math.sin(lat) * ry * (0.85 + 0.3 * r.next()), cz + Math.sin(a) * rx * cl * k, lat > 0 ? cHigh : cLow, 0.7 + 0.4 * r.next()));
    }
    rings.push(ring);
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    b.tri(top, rings[0][i], rings[0][j], cx, cy, cz);
    b.tri(rings[0][i], rings[0][j], rings[1][i], cx, cy, cz);
    b.tri(rings[0][j], rings[1][j], rings[1][i], cx, cy, cz);
    b.tri(bot, rings[1][i], rings[1][j], cx, cy, cz);
  }
}

const BARK: C3 = [0.20, 0.145, 0.10];
/** Altezza e raggio di chioma nominali per variante (scala 1) e colore medio per il LOD lontano. */
export const VARIANTS: { h: number; r: number; col: C3 }[] = [
  { h: 13.5, r: 2.3, col: [0.075, 0.150, 0.110] }, // abete rosso: stretto, rami cadenti
  { h: 11.0, r: 3.0, col: [0.090, 0.185, 0.095] }, // abete bianco: pieno
  { h: 12.5, r: 2.6, col: [0.115, 0.175, 0.085] }, // pino: tronco nudo, chioma alta
  { h: 12.0, r: 2.2, col: [0.200, 0.215, 0.085] }, // larice: rado, giallo-verde
  { h: 9.0, r: 2.6, col: [0.170, 0.250, 0.095] }, // latifoglia/betulla
  { h: 8.0, r: 0.5, col: [0.160, 0.140, 0.120] }, // albero morto
];

function buildTree(variant: number): VertexData {
  const r = new Rng('tds.tree.' + variant);
  const b = new Builder();
  const V = VARIANTS[variant], c = V.col;
  const lo: C3 = [c[0] * 0.7, c[1] * 0.7, c[2] * 0.75], hi: C3 = [c[0] * 1.3, c[1] * 1.3, c[2] * 1.15];
  if (variant === 0) {
    trunk(b, r, -0.6, V.h * 0.8, 0.24, 0.05, BARK);
    const n = 6;
    for (let i = 0; i < n; i++) { const f = i / n; tier(b, r, mix(2.0, V.h - 2.6, f), mix(3.6, 2.7, f), V.r * Math.pow(1 - f * 0.88, 0.9), 0.42, lo, hi); }
  } else if (variant === 1) {
    trunk(b, r, -0.6, V.h * 0.75, 0.26, 0.06, BARK);
    const n = 5;
    for (let i = 0; i < n; i++) { const f = i / n; tier(b, r, mix(1.3, V.h - 2.8, f), mix(3.8, 2.9, f), V.r * (1 - f * 0.84), 0.16, lo, hi, 8); }
  } else if (variant === 2) {
    const tc: C3 = [0.23, 0.15, 0.10];
    trunk(b, r, -0.6, V.h * 0.86, 0.23, 0.10, tc, 5, 0.5);
    tier(b, r, V.h * 0.60, 2.4, V.r * 0.95, 0.05, lo, hi, 7, 0.4, 0.2);
    tier(b, r, V.h * 0.72, 2.6, V.r * 0.8, 0.02, lo, hi, 7, 0.1, -0.3);
    blob(b, r, 0.5, V.h * 0.93, 0, V.r * 0.62, 1.2, lo, hi);
    // ramo secco basso
    const p = b.v(0.15, V.h * 0.42, 0, tc), q = b.v(0.15, V.h * 0.44, 0.1, tc), s = b.v(1.6, V.h * 0.5, 0.3, tc, 0.8);
    b.tri(p, q, s, 0.8, V.h * 0.3, 0); b.tri(p, q, s, 0.8, V.h * 0.7, 0);
  } else if (variant === 3) {
    trunk(b, r, -0.6, V.h * 0.97, 0.21, 0.04, [0.23, 0.17, 0.12]);
    const n = 5;
    for (let i = 0; i < n; i++) { const f = i / n; tier(b, r, mix(2.6, V.h - 2.0, f), 1.9, V.r * (1 - f * 0.8), 0.3, lo, hi, 6); }
  } else if (variant === 4) {
    const tc: C3 = [0.40, 0.40, 0.36];
    trunk(b, r, -0.6, V.h * 0.5, 0.2, 0.13, tc, 5, 0.25);
    trunk(b, r, V.h * 0.5, V.h * 0.82, 0.13, 0.05, [0.3, 0.3, 0.27], 4, 0.1);
    blob(b, r, 0.2, V.h * 0.62, 0.1, V.r * 0.95, 1.9, lo, hi);
    blob(b, r, -0.7, V.h * 0.8, -0.5, V.r * 0.7, 1.5, lo, hi);
    blob(b, r, 0.8, V.h * 0.88, 0.5, V.r * 0.62, 1.4, lo, hi);
  } else {
    const tc: C3 = [0.26, 0.23, 0.2];
    trunk(b, r, -0.6, V.h * 0.6, 0.24, 0.13, tc, 5, 0.3);
    trunk(b, r, V.h * 0.6, V.h, 0.13, 0.02, tc, 4, 0.15);
    for (let i = 0; i < 6; i++) {
      const a = r.next() * 6.28, y = V.h * (0.35 + 0.1 * i), len = 1.1 + r.next() * 1.6, w = 0.07;
      const bx = 0.2, ca = Math.cos(a), sa = Math.sin(a);
      const p0 = b.v(bx - sa * w, y - w, ca * w, tc, 0.8), p1 = b.v(bx + sa * w, y - w, -ca * w, tc, 0.8), p2 = b.v(bx, y + w * 1.4, 0, tc);
      const tip = b.v(bx + ca * len, y + len * (0.35 + 0.5 * r.next()), sa * len, tc, 1.1);
      const mx = bx + ca * len * 0.4, my = y + len * 0.2, mz = sa * len * 0.4;
      b.tri(p0, p1, tip, mx, my, mz); b.tri(p1, p2, tip, mx, my, mz); b.tri(p2, p0, tip, mx, my, mz);
    }
  }
  return b.data(variant === 5 ? 0 : 0.35);
}

/** LOD lontano delle conifere: due coni a quattro lati, altezza e raggio unitari, grigio (colore dall'istanza). */
function buildFarConifer(): VertexData {
  const b = new Builder(), r = new Rng('tds.far.c');
  const g = (k: number): C3 => [k, k, k];
  for (const [y, h, rad] of [[0.12, 0.6, 1], [0.5, 0.5, 0.62]] as const) {
    const ring: number[] = [];
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + y * 3; ring.push(b.v(Math.cos(a) * rad, y, Math.sin(a) * rad, g(0.62 + 0.25 * r.next()))); }
    const apex = b.v(0, y + h, 0, g(1.15));
    for (let i = 0; i < 4; i++) b.tri(ring[i], ring[(i + 1) % 4], apex, 0, y + 0.1, 0);
  }
  const a = b.v(-0.07, 0, 0, g(0.5)), c = b.v(0.07, 0, 0, g(0.5)), d = b.v(0, 0.3, 0.07, g(0.5));
  b.tri(a, c, d, 0, 0.1, 5); b.tri(a, c, d, 0, 0.1, -5);
  return b.data(0.35);
}
function buildFarBroadleaf(): VertexData {
  const b = new Builder(), r = new Rng('tds.far.b');
  const g = (k: number): C3 => [k, k, k];
  const top = b.v(0, 1, 0, g(1.15)), bot = b.v(0, 0.32, 0, g(0.5));
  const ring: number[] = [];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283; ring.push(b.v(Math.cos(a), 0.62 + 0.1 * r.next(), Math.sin(a), g(0.7 + 0.2 * r.next()))); }
  for (let i = 0; i < 4; i++) { b.tri(ring[i], ring[(i + 1) % 4], top, 0, 0.65, 0); b.tri(ring[i], ring[(i + 1) % 4], bot, 0, 0.65, 0); }
  const a = b.v(-0.08, 0, 0, g(0.9)), c = b.v(0.08, 0, 0, g(0.9)), d = b.v(0, 0.45, 0.05, g(0.9));
  b.tri(a, c, d, 0, 0.1, 5); b.tri(a, c, d, 0, 0.1, -5);
  return b.data(0.35);
}

function buildRock(seed: number): VertexData {
  const b = new Builder(), r = new Rng('tds.rock.' + seed);
  const c: C3 = [0.27, 0.27, 0.26], d: C3 = [0.17, 0.18, 0.16];
  blob(b, r, 0, 0.28, 0, 0.95, 0.62, d, c, 6);
  return b.data(0.1);
}

/** Cespuglio alto (nocciolo, rovo, ginepro): masse di fogliame su fusti sottili. Altezza nominale ~1,4 m. */
function buildBush(kind: number): VertexData {
  const b = new Builder(), r = new Rng('tds.bush.' + kind);
  const lo: C3 = kind === 0 ? [0.05, 0.10, 0.05] : kind === 1 ? [0.07, 0.09, 0.04] : [0.04, 0.08, 0.06];
  const hi: C3 = kind === 0 ? [0.10, 0.17, 0.07] : kind === 1 ? [0.14, 0.15, 0.06] : [0.07, 0.13, 0.09];
  const stem: C3 = [0.16, 0.12, 0.09];
  const n = kind === 2 ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + r.next(), d = i === 0 ? 0.05 : 0.3 + 0.35 * r.next(), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const cy = (kind === 2 ? 0.5 : i === 0 ? 1.0 : 0.5) + 0.35 * r.next(), rx = 0.3 + 0.2 * r.next(), ry = (kind === 2 ? 0.5 : 0.3) + 0.18 * r.next();
    const p = b.v(x * 0.3 - 0.03, 0, z * 0.3, stem, 0.8), q = b.v(x * 0.3 + 0.03, 0, z * 0.3, stem, 0.8), t = b.v(x, cy, z, stem);
    b.tri(p, q, t, x, 0.3, z + 5); b.tri(p, q, t, x, 0.3, z - 5);
    blob(b, r, x, cy, z, rx, ry, lo, hi, 5);
  }
  return b.data(0.3);
}
const NBUSH = 3;
const BUSH_CELL = 6.5;

function buildCover(kind: number): VertexData {
  const b = new Builder(), r = new Rng('tds.cover.' + kind);
  if (kind === 0) { // ciuffo d'erba: lame triangolari
    const c: C3 = [0.16, 0.26, 0.10];
    for (let i = 0; i < 7; i++) {
      const a = r.next() * 6.28, d = r.next() * 0.22, w = 0.035, h = 0.28 + 0.3 * r.next(), bend = 0.1 + 0.2 * r.next();
      const x = Math.cos(a) * d, z = Math.sin(a) * d, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      const p0 = b.v(x - px, 0, z - pz, c, 0.55), p1 = b.v(x + px, 0, z + pz, c, 0.55), p2 = b.v(x + Math.cos(a) * bend, h, z + Math.sin(a) * bend, c, 1.1 + 0.3 * r.next());
      b.tri(p0, p1, p2, x, -5, z);
    }
  } else if (kind === 1) { // felce: fronde arcuate
    const c: C3 = [0.11, 0.22, 0.09];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 + r.next() * 0.5, len = 0.5 + 0.3 * r.next(), w = 0.13;
      const ca = Math.cos(a), sa = Math.sin(a);
      const p0 = b.v(0, 0.02, 0, c, 0.5);
      const p1 = b.v(ca * len * 0.5 - sa * w, 0.3, sa * len * 0.5 + ca * w, c, 0.9), p2 = b.v(ca * len * 0.5 + sa * w, 0.3, sa * len * 0.5 - ca * w, c, 0.9);
      const p3 = b.v(ca * len, 0.2 + 0.1 * r.next(), sa * len, c, 1.25);
      b.tri(p0, p1, p2, 0, -5, 0); b.tri(p1, p2, p3, 0, -5, 0);
    }
  } else { // cespuglio basso
    blob(b, r, 0, 0.22, 0, 0.4, 0.3, [0.05, 0.09, 0.05], [0.085, 0.13, 0.065], 5);
    blob(b, r, 0.3, 0.16, 0.18, 0.27, 0.2, [0.05, 0.09, 0.05], [0.09, 0.13, 0.06], 5);
  }
  return b.data(kind === 2 ? 0.3 : 1.5);
}

function writeMatrix(m: Float32Array, o: number, x: number, y: number, z: number, rot: number, sx: number, sy: number, sz: number): void {
  const c = Math.cos(rot), s = Math.sin(rot);
  m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -s * sx; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = s * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
}

export interface ForestChunk {
  index: number; x: number; y: number; z: number;
  near: Mesh[]; far: Mesh[]; rocks: Mesh | null; bushes: Mesh[];
  lod: number; rocksOn: boolean;
}

const NCOVER = 3;

export class ForestRenderer {
  readonly chunks: ForestChunk[] = [];
  readonly treeMaterial: StandardMaterial;
  readonly rockMaterial: StandardMaterial;
  readonly coverMaterial: StandardMaterial;
  readonly bushMaterial: StandardMaterial;
  bushCount = 0;
  /** Chunk dettagliati attualmente visibili (candidati a proiettare ombre). */
  readonly nearActive: Mesh[] = [];
  private cover: Mesh[] = [];
  private coverBuf: Float32Array[] = [];
  private coverCap = 0;
  private coverX = 1e9; private coverZ = 1e9;
  private lodX = 1e9; private lodZ = 1e9; private lodTimer = 0; private lodDirty = true;
  treeCount = 0;

  constructor(private scene: Scene, private model: WorldModel, private fields: TerrainFields, private q: QualityParams, private drawDistance: number) {
    this.treeMaterial = makeEnvMaterial('tds.tree', scene, 0.25, 0.0085);
    this.rockMaterial = makeEnvMaterial('tds.rock', scene, 0.3);
    this.coverMaterial = makeEnvMaterial('tds.cover', scene, 0.6, 0.2);
    this.coverMaterial.backFaceCulling = false;
    this.bushMaterial = makeEnvMaterial('tds.bush', scene, 0.4, 0.075);
    this.bushMaterial.backFaceCulling = false;
    const bushSrc = [0, 1, 2].map((k) => ({ vd: buildBush(k), material: this.bushMaterial }));
    // cespugli alti: griglia deterministica su tutto il mondo, fuori da sentieri, acqua, radure curate e pendii ripidi
    const bGroups: number[][] = [];
    for (let i = 0; i < CHUNK_N * CHUNK_N; i++) bGroups.push([]);
    const bush: number[] = []; // x, y, z, scala, rotazione, tipo
    const salt = (model.spec.terrain.salt | 0) + 9100, bn = Math.floor((WORLD_HALF + 60) / BUSH_CELL);
    for (let j = -bn; j < bn; j++)
      for (let i = -bn; i < bn; i++) {
        const h = hash3(i, j, salt);
        if (h > 0.36) continue;
        const x = (i + 0.1 + 0.8 * hash3(i, j, salt + 1)) * BUSH_CELL, z = (j + 0.1 + 0.8 * hash3(i, j, salt + 2)) * BUSH_CELL;
        const fd = sampleField(fields.forest, x, z);
        if (fd < 0.12 || (fd > 0.8 && h > 0.2)) continue; // più fitti ai margini del bosco che nel folto
        if (sampleField(fields.slope, x, z) > 0.75 || model.pathMaskAt(x, z) > 0.02 || model.waterDepthAt(x, z) > 0 || model.nearBuildingAt(x, z, 2)) continue;
        bGroups[chunkIndex(x, z)].push(bush.length / 6);
        bush.push(x, model.heightAt(x, z), z, 0.7 + 0.9 * hash3(i, j, salt + 3), hash3(i, j, salt + 4) * 6.28, Math.floor(hash3(i, j, salt + 5) * NBUSH));
      }
    this.bushCount = bush.length / 6;
    // Nota: la geometria NON è condivisa tra i chunk, perché i buffer delle thin instances vivono sulla geometria.
    type Src = { vd: VertexData; material: StandardMaterial };
    const nearSrc: Src[] = VARIANTS.map((_, v) => ({ vd: buildTree(v), material: this.treeMaterial }));
    const farC: Src = { vd: buildFarConifer(), material: this.treeMaterial };
    const farB: Src = { vd: buildFarBroadleaf(), material: this.treeMaterial };
    const rockSrc: Src = { vd: buildRock(1), material: this.rockMaterial };

    const trees = model.trees, rocks = model.rocks;
    this.treeCount = trees.length / 5;
    const tGroups = groupByChunk(trees, 5), rGroups = groupByChunk(rocks, 4);
    const instance = (name: string, source: Src, mats: Float32Array, cols: Float32Array | null, ch: ForestChunk, ext: number, ymin: number, ymax: number): Mesh => {
      const m = new Mesh(name, scene);
      source.vd.applyToMesh(m, false);
      m.material = source.material; m.isPickable = false;
      m.thinInstanceSetBuffer('matrix', mats, 16, true);
      if (cols) m.thinInstanceSetBuffer('color', cols, 4, true);
      m.position.set(ch.x, ch.y, ch.z);
      const hs = CHUNK_SIZE / 2 + ext;
      m.setBoundingInfo(new BoundingInfo(new Vector3(-hs, ymin - ch.y - 1, -hs), new Vector3(hs, ymax - ch.y, hs)));
      m.alwaysSelectAsActiveMesh = false;
      m.freezeWorldMatrix();
      m.setEnabled(false);
      return m;
    };
    for (let ci = 0; ci < CHUNK_N * CHUNK_N; ci++) {
      const tl = tGroups[ci], rl = rGroups[ci];
      const bl = bGroups[ci];
      if (!tl.length && !rl.length && !bl.length) continue;
      const c = chunkCenter(ci);
      let ymin = Infinity, ymax = -Infinity;
      const ys: number[] = [];
      for (const k of tl) { const y = model.heightAt(trees[k * 5], trees[k * 5 + 1]); ys.push(y); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
      const rys: number[] = [];
      for (const k of rl) { const y = model.heightAt(rocks[k * 4], rocks[k * 4 + 1]); rys.push(y); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
      for (const k of bl) { const y = bush[k * 6 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
      const ch: ForestChunk = { index: ci, x: c.x, y: (ymin + ymax) / 2, z: c.z, near: [], far: [], rocks: null, bushes: [], lod: 2, rocksOn: false };
      // vicino: una mesh per variante
      for (let v = 0; v < VARIANTS.length; v++) {
        let n = 0;
        for (const k of tl) if (trees[k * 5 + 3] === v) n++;
        if (!n) continue;
        const mats = new Float32Array(n * 16), cols = new Float32Array(n * 4);
        let o = 0;
        tl.forEach((k, li) => {
          if (trees[k * 5 + 3] !== v) return;
          const s = trees[k * 5 + 2];
          const hsc = s * (0.9 + 0.25 * hash3(k, 3, 17));
          writeMatrix(mats, o * 16, trees[k * 5] - ch.x, ys[li] - ch.y, trees[k * 5 + 1] - ch.z, trees[k * 5 + 4], s, hsc, s);
          const t = 0.8 + 0.4 * hash3(k, 1, 17), w = (hash3(k, 2, 17) - 0.5) * 0.16;
          cols[o * 4] = t * (1 + w); cols[o * 4 + 1] = t; cols[o * 4 + 2] = t * (1 - w); cols[o * 4 + 3] = 1;
          o++;
        });
        ch.near.push(instance(`tds.trees.n${v}.${ci}`, nearSrc[v], mats, cols, ch, 6, ymin, ymax + 26));
      }
      // lontano: conifere + morti in una mesh, latifoglie in un'altra
      for (const grp of [0, 1]) {
        let n = 0;
        for (const k of tl) if ((trees[k * 5 + 3] === 4) === (grp === 1)) n++;
        if (!n) continue;
        const mats = new Float32Array(n * 16), cols = new Float32Array(n * 4);
        let o = 0;
        tl.forEach((k, li) => {
          const v = trees[k * 5 + 3];
          if ((v === 4) !== (grp === 1)) return;
          const V = VARIANTS[v], s = trees[k * 5 + 2];
          const hsc = s * (0.9 + 0.25 * hash3(k, 3, 17));
          writeMatrix(mats, o * 16, trees[k * 5] - ch.x, ys[li] - ch.y, trees[k * 5 + 1] - ch.z, trees[k * 5 + 4], V.r * s * 0.92, V.h * hsc, V.r * s * 0.92);
          const t = 0.8 + 0.4 * hash3(k, 1, 17), w = (hash3(k, 2, 17) - 0.5) * 0.16;
          cols[o * 4] = V.col[0] * t * (1 + w); cols[o * 4 + 1] = V.col[1] * t; cols[o * 4 + 2] = V.col[2] * t * (1 - w); cols[o * 4 + 3] = 1;
          o++;
        });
        ch.far.push(instance(`tds.trees.f${grp}.${ci}`, grp ? farB : farC, mats, cols, ch, 4, ymin, ymax + 26));
      }
      if (rl.length) {
        const mats = new Float32Array(rl.length * 16);
        rl.forEach((k, li) => {
          const s = rocks[k * 4 + 2];
          writeMatrix(mats, li * 16, rocks[k * 4] - ch.x, rys[li] - ch.y - 0.05 * s, rocks[k * 4 + 1] - ch.z, rocks[k * 4 + 3], s * (0.8 + 0.5 * hash3(k, 5, 3)), s * (0.7 + 0.6 * hash3(k, 6, 3)), s);
        });
        ch.rocks = instance(`tds.rocks.${ci}`, rockSrc, mats, null, ch, 2, ymin, ymax + 3);
      }
      for (let t = 0; t < NBUSH; t++) {
        const sel = bl.filter((k) => bush[k * 6 + 5] === t);
        if (!sel.length) continue;
        const mats = new Float32Array(sel.length * 16), cols = new Float32Array(sel.length * 4);
        sel.forEach((k, li) => {
          const sc = bush[k * 6 + 3];
          writeMatrix(mats, li * 16, bush[k * 6] - ch.x, bush[k * 6 + 1] - ch.y - 0.05, bush[k * 6 + 2] - ch.z, bush[k * 6 + 4], sc * (0.85 + 0.3 * hash3(k, 4, 9)), sc, sc * (0.85 + 0.3 * hash3(k, 5, 9)));
          const tn = 0.8 + 0.45 * hash3(k, 1, 9), w = (hash3(k, 2, 9) - 0.5) * 0.2;
          cols[li * 4] = tn * (1 + w); cols[li * 4 + 1] = tn; cols[li * 4 + 2] = tn * (1 - w); cols[li * 4 + 3] = 1;
        });
        ch.bushes.push(instance(`tds.bush.${t}.${ci}`, bushSrc[t], mats, cols, ch, 2, ymin, ymax + 4));
      }
      this.chunks.push(ch);
    }
    this.buildCover();
  }

  private buildCover(): void {
    for (const m of this.cover) m.dispose();
    this.cover.length = 0; this.coverBuf.length = 0;
    const side = Math.ceil((this.q.coverRadius * 2) / this.q.coverCell) + 2;
    this.coverCap = side * side;
    for (let k = 0; k < NCOVER; k++) {
      const m = new Mesh('tds.cover.' + k, this.scene);
      buildCover(k).applyToMesh(m, false);
      m.material = this.coverMaterial; m.isPickable = false;
      const buf = new Float32Array(this.coverCap * 16);
      m.thinInstanceSetBuffer('matrix', buf, 16, false);
      m.thinInstanceCount = 0;
      m.alwaysSelectAsActiveMesh = true;
      this.cover.push(m); this.coverBuf.push(buf);
    }
    this.coverX = 1e9;
  }

  setQuality(q: QualityParams, drawDistance: number): void {
    const rebuild = q.coverRadius !== this.q.coverRadius;
    this.q = q; this.drawDistance = drawDistance; this.lodDirty = true;
    if (rebuild) this.buildCover();
  }

  private refreshCover(cx: number, cz: number): void {
    const cell = this.q.coverCell, R = this.q.coverRadius, model = this.model;
    const counts = [0, 0, 0];
    const i0 = Math.floor((cx - R) / cell), i1 = Math.floor((cx + R) / cell), j0 = Math.floor((cz - R) / cell), j1 = Math.floor((cz + R) / cell);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const h = hash3(i, j, 7001);
        if (h > 0.62) continue;
        const x = (i + 0.15 + 0.7 * hash3(i, j, 7002)) * cell, z = (j + 0.15 + 0.7 * hash3(i, j, 7003)) * cell;
        const d = Math.hypot(x - cx, z - cz);
        if (d > R || Math.abs(x) > 760 || Math.abs(z) > 760) continue;
        if (model.pathMaskAt(x, z) > 0.02 || model.waterDepthAt(x, z) > 0 || model.nearBuildingAt(x, z)) continue;
        const fd = sampleField(this.fields.forest, x, z);
        if (fd < 0.1 && hash3(i, j, 7006) > 0.25) continue; // POI e radure curate: quasi nulla
        if (sampleField(this.fields.slope, x, z) > 0.8) continue;
        const kind = fd > 0.5 ? (h < 0.24 ? 1 : h < 0.44 ? 2 : 0) : (h < 0.4 ? 0 : h < 0.55 ? 2 : 1);
        const n = counts[kind];
        if (n >= this.coverCap) continue;
        // dimensione fissa: ogni ciuffo è sempre lo stesso nello stesso punto e non cresce avvicinandosi;
        // il raggio è così ampio che il bordo resta nel buio e nella nebbia
        const s = 0.75 + 0.7 * hash3(i, j, 7004);
        writeMatrix(this.coverBuf[kind], n * 16, x, model.heightAt(x, z) - 0.03, z, hash3(i, j, 7005) * 6.28, s, s, s);
        counts[kind] = n + 1;
      }
    for (let k = 0; k < NCOVER; k++) {
      this.cover[k].thinInstanceCount = counts[k];
      this.cover[k].thinInstanceBufferUpdated('matrix');
    }
  }

  /** Aggiorna LOD dei chunk (a intervalli) e sottobosco. Restituisce true se l'insieme dei chunk vicini è cambiato. */
  update(dt: number, cx: number, cz: number): boolean {
    if (Math.hypot(cx - this.coverX, cz - this.coverZ) > 2.5) { this.coverX = cx; this.coverZ = cz; this.refreshCover(cx, cz); }
    this.lodTimer -= dt;
    if (!this.lodDirty && (this.lodTimer > 0 || Math.hypot(cx - this.lodX, cz - this.lodZ) < 4)) return false;
    this.lodTimer = this.q.lodInterval; this.lodX = cx; this.lodZ = cz; this.lodDirty = false;
    let changed = false;
    this.nearActive.length = 0;
    for (const ch of this.chunks) {
      const d = chunkDistance(ch.index, cx, cz);
      const lod = lodFor(d, this.q.nearDist, this.drawDistance);
      if (lod !== ch.lod) {
        ch.lod = lod; changed = true;
        for (const m of ch.near) m.setEnabled(lod === 0);
        for (const m of ch.far) m.setEnabled(lod === 1);
      }
      const rocksOn = true; // massi e cespugli restano sempre nella mappa, a qualsiasi distanza
      if (rocksOn !== ch.rocksOn) { ch.rocksOn = rocksOn; ch.rocks?.setEnabled(rocksOn); for (const m of ch.bushes) m.setEnabled(rocksOn); }
      if (lod === 0) for (const m of ch.near) this.nearActive.push(m);
    }
    return changed;
  }

  setWet(wet: number): void {
    const s = mix(0.02, 0.16, wet);
    this.treeMaterial.specularColor.set(s, s, s);
    this.bushMaterial.specularColor.set(s, s, s);
    this.rockMaterial.specularColor.set(s * 1.6, s * 1.6, s * 1.7);
    this.rockMaterial.specularPower = mix(20, 48, wet);
  }

  dispose(): void {
    for (const ch of this.chunks) { for (const m of ch.near) m.dispose(); for (const m of ch.far) m.dispose(); for (const m of ch.bushes) m.dispose(); ch.rocks?.dispose(); }
    this.chunks.length = 0; this.nearActive.length = 0;
    for (const m of this.cover) m.dispose();
    this.treeMaterial.dispose(); this.rockMaterial.dispose(); this.coverMaterial.dispose(); this.bushMaterial.dispose();
  }
}

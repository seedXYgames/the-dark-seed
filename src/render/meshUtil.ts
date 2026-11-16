// Costruzione procedurale di geometria (colori per vertice, flat shading), materiali condivisi e alone luminoso.
import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { GraphicsSettings } from '../core/contracts';

export type V3 = [number, number, number];
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function rgb(hex: number): V3 { return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; }
export function mixHex(a: number, b: number, t: number): number {
  const A = rgb(a), Bc = rgb(b);
  const f = (i: number) => Math.round((A[i] + (Bc[i] - A[i]) * t) * 255);
  return (f(0) << 16) | (f(1) << 8) | f(2);
}

/** Accumulatore di geometria: ogni primitiva è trasformata dalla matrice corrente e orientata verso l'esterno. */
export class Geo {
  pos: number[] = []; nor: number[] = []; col: number[] = []; idx: number[] = [];
  /** Variazione di luminosità per primitiva (aspetto vissuto). */
  jit = 0.06;
  segs = 8;
  private m: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  private st: number[][] = [];
  private s = 9781;

  constructor(seed = 1) { this.s = (seed | 0) || 1; }
  get empty(): boolean { return this.idx.length === 0; }
  private rnd(): number { this.s = (Math.imul(this.s, 1103515245) + 12345) | 0; return ((this.s >>> 8) & 0xffff) / 65536; }
  private mul(o: number[], tx = 0, ty = 0, tz = 0): this {
    const m = this.m, r = new Array<number>(12);
    for (let i = 0; i < 3; i++) {
      const a = m[i * 3], b = m[i * 3 + 1], c = m[i * 3 + 2];
      r[i * 3] = a * o[0] + b * o[3] + c * o[6]; r[i * 3 + 1] = a * o[1] + b * o[4] + c * o[7]; r[i * 3 + 2] = a * o[2] + b * o[5] + c * o[8];
      r[9 + i] = a * tx + b * ty + c * tz + m[9 + i];
    }
    this.m = r; return this;
  }
  push(): this { this.st.push(this.m.slice()); return this; }
  pop(): this { this.m = this.st.pop()!; return this; }
  tr(x: number, y: number, z: number): this { return this.mul(ID, x, y, z); }
  ry(a: number): this { const c = Math.cos(a), s = Math.sin(a); return this.mul([c, 0, s, 0, 1, 0, -s, 0, c]); }
  rx(a: number): this { const c = Math.cos(a), s = Math.sin(a); return this.mul([1, 0, 0, 0, c, -s, 0, s, c]); }
  rz(a: number): this { const c = Math.cos(a), s = Math.sin(a); return this.mul([c, -s, 0, s, c, 0, 0, 0, 1]); }
  sc(x: number, y: number, z: number): this { return this.mul([x, 0, 0, 0, y, 0, 0, 0, z]); }

  private c3(hex: number): V3 {
    const c = rgb(hex), k = 1 + (this.rnd() - 0.5) * 2 * this.jit;
    return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  }
  private P(p: V3): V3 {
    const m = this.m;
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[9], m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + m[10], m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + m[11]];
  }
  private D(p: V3): V3 {
    const m = this.m;
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
  }
  /** Poligono di 3 o 4 vertici (coordinate locali) con direzione esterna indicativa `hint` (locale). */
  private poly(pts: V3[], c: V3, hint?: V3): void {
    let w = pts.map((p) => this.P(p));
    const a = w[0], b = w[1], d = w[w.length - 1];
    const ux = d[0] - a[0], uy = d[1] - a[1], uz = d[2] - a[2], vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (hint) {
      const h = this.D(hint);
      if (nx * h[0] + ny * h[1] + nz * h[2] < 0) { w = w.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    }
    const base = this.pos.length / 3;
    for (const p of w) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(c[0], c[1], c[2], 1); }
    this.idx.push(base, base + 1, base + 2);
    if (w.length === 4) this.idx.push(base, base + 2, base + 3);
  }
  quad(a: V3, b: V3, c: V3, d: V3, hex: number, hint?: V3): this { this.poly([a, b, c, d], this.c3(hex), hint); return this; }
  tri(a: V3, b: V3, c: V3, hex: number, hint?: V3): this { this.poly([a, b, c], this.c3(hex), hint); return this; }

  private hull8(p: V3[], c: V3, skip = 0): void {
    // p: 0..3 base (-x-z, +x-z, +x+z, -x+z), 4..7 cima nello stesso ordine
    const f: [number, number, number, number, V3][] = [
      [0, 1, 2, 3, [0, -1, 0]], [4, 5, 6, 7, [0, 1, 0]], [0, 1, 5, 4, [0, 0, -1]], [3, 2, 6, 7, [0, 0, 1]], [0, 3, 7, 4, [-1, 0, 0]], [1, 2, 6, 5, [1, 0, 0]],
    ];
    for (let i = 0; i < 6; i++) if (!(skip & (1 << i))) this.poly([p[f[i][0]], p[f[i][1]], p[f[i][2]], p[f[i][3]]], c, f[i][4]);
  }
  /** Parallelepipedo centrato. `skip`: maschera di facce da omettere (1 sotto, 2 sopra, 4 -z, 8 +z, 16 -x, 32 +x). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, hex: number, skip = 0): this {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.hull8([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], this.c3(hex), skip);
    return this;
  }
  /** Tronco di piramide: base (w0×d0) a y0 centrata in (cx,cz), cima (w1×d1) a y1 spostata di (ox,oz). */
  frustum(cx: number, cz: number, y0: number, w0: number, d0: number, y1: number, w1: number, d1: number, hex: number, ox = 0, oz = 0, skip = 0): this {
    const a = cx + ox, b = cz + oz;
    this.hull8([[cx - w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz + d0 / 2], [cx - w0 / 2, y0, cz + d0 / 2],
      [a - w1 / 2, y1, b - d1 / 2], [a + w1 / 2, y1, b - d1 / 2], [a + w1 / 2, y1, b + d1 / 2], [a - w1 / 2, y1, b + d1 / 2]], this.c3(hex), skip);
    return this;
  }
  /** Cilindro/cono lungo `axis`, centrato. r0 = raggio all'estremo negativo, r1 al positivo. */
  cyl(cx: number, cy: number, cz: number, r0: number, r1: number, h: number, hex: number, axis: 'x' | 'y' | 'z' = 'y', segs = this.segs, caps = true): this {
    this.push().tr(cx, cy, cz);
    if (axis === 'x') this.rz(-Math.PI / 2); else if (axis === 'z') this.rx(Math.PI / 2);
    const c = this.c3(hex), y0 = -h / 2, y1 = h / 2;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const hint: V3 = [Math.cos(am), 0, Math.sin(am)];
      if (r1 <= 1e-5) this.poly([[c0 * r0, y0, s0 * r0], [c1 * r0, y0, s1 * r0], [0, y1, 0]], c, hint);
      else if (r0 <= 1e-5) this.poly([[0, y0, 0], [c1 * r1, y1, s1 * r1], [c0 * r1, y1, s0 * r1]], c, hint);
      else this.poly([[c0 * r0, y0, s0 * r0], [c1 * r0, y0, s1 * r0], [c1 * r1, y1, s1 * r1], [c0 * r1, y1, s0 * r1]], c, hint);
      if (caps && r0 > 1e-5) this.poly([[0, y0, 0], [c0 * r0, y0, s0 * r0], [c1 * r0, y0, s1 * r0]], c, [0, -1, 0]);
      if (caps && r1 > 1e-5) this.poly([[0, y1, 0], [c0 * r1, y1, s0 * r1], [c1 * r1, y1, s1 * r1]], c, [0, 1, 0]);
    }
    return this.pop();
  }
  /** Ellissoide a bassa risoluzione. */
  sphere(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, hex: number, segs = 7, rings = 5): this {
    const c = this.c3(hex);
    const pt = (i: number, j: number): V3 => {
      const th = (i / segs) * Math.PI * 2, ph = (j / rings) * Math.PI, sp = Math.sin(ph);
      return [cx + Math.cos(th) * sp * rx, cy + Math.cos(ph) * ry, cz + Math.sin(th) * sp * rz];
    };
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < segs; i++) {
        const th = ((i + 0.5) / segs) * Math.PI * 2, ph = ((j + 0.5) / rings) * Math.PI;
        const hint: V3 = [Math.cos(th) * Math.sin(ph) / rx, Math.cos(ph) / ry, Math.sin(th) * Math.sin(ph) / rz];
        if (j === 0) this.poly([pt(i, 0), pt(i, 1), pt(i + 1, 1)], c, hint);
        else if (j === rings - 1) this.poly([pt(i, j), pt(i + 1, j), pt(i, j + 1)], c, hint);
        else this.poly([pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)], c, hint);
      }
    return this;
  }
  /** Trave a sezione rettangolare (w × h) tra due punti. */
  beam(a: V3, b: V3, w: number, hex: number, h = w): this {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) return this;
    dx /= l; dy /= l; dz /= l;
    const up: V3 = Math.abs(dy) > 0.97 ? [1, 0, 0] : [0, 1, 0];
    let sx = up[1] * dz - up[2] * dy, sy = up[2] * dx - up[0] * dz, sz = up[0] * dy - up[1] * dx;
    const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
    const ux = dy * sz - dz * sy, uy = dz * sx - dx * sz, uz = dx * sy - dy * sx;
    const c = this.c3(hex), hw = w / 2, hh = h / 2;
    const k = (p: V3, i: number, j: number): V3 => [p[0] + sx * hw * i + ux * hh * j, p[1] + sy * hw * i + uy * hh * j, p[2] + sz * hw * i + uz * hh * j];
    const A = [k(a, -1, -1), k(a, 1, -1), k(a, 1, 1), k(a, -1, 1)], Bq = [k(b, -1, -1), k(b, 1, -1), k(b, 1, 1), k(b, -1, 1)];
    this.poly([A[0], A[1], A[2], A[3]], c, [-dx, -dy, -dz]);
    this.poly([Bq[0], Bq[1], Bq[2], Bq[3]], c, [dx, dy, dz]);
    this.poly([A[0], A[1], Bq[1], Bq[0]], c, [-ux, -uy, -uz]);
    this.poly([A[3], A[2], Bq[2], Bq[3]], c, [ux, uy, uz]);
    this.poly([A[0], A[3], Bq[3], Bq[0]], c, [-sx, -sy, -sz]);
    this.poly([A[1], A[2], Bq[2], Bq[1]], c, [sx, sy, sz]);
    return this;
  }
  /** Anello di travi (toro approssimato) nel piano xy locale. */
  ring(cx: number, cy: number, cz: number, r: number, th: number, hex: number, n = 10, from = 0, to = Math.PI * 2): this {
    for (let i = 0; i < n; i++) {
      const a0 = from + ((to - from) * i) / n, a1 = from + ((to - from) * (i + 1)) / n;
      this.beam([cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz], th, hex);
    }
    return this;
  }
  /** Centra la geometria e la scala entro una sfera di raggio dato; `ground` appoggia la base su y = 0. */
  fit(radius: number, ground = false): this {
    const p = this.pos; if (!p.length) return this;
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < p.length; i++) { const a = i % 3; if (p[i] < mn[a]) mn[a] = p[i]; if (p[i] > mx[a]) mx[a] = p[i]; }
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    let r = 0;
    for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot(p[i] - c[0], p[i + 1] - c[1], p[i + 2] - c[2]));
    const k = radius / (r || 1);
    for (let i = 0; i < p.length; i++) p[i] = (p[i] - c[i % 3]) * k;
    if (ground) { const dy = ((mx[1] - mn[1]) / 2) * k; for (let i = 1; i < p.length; i += 3) p[i] += dy; }
    return this;
  }
  /** Ruota tutta la geometria già emessa attorno a x (per adagiare gli oggetti piatti). */
  layFlat(): this {
    const p = this.pos, n = this.nor;
    for (let i = 0; i < p.length; i += 3) { const y = p[i + 1], z = p[i + 2]; p[i + 1] = -z; p[i + 2] = y; const ny = n[i + 1], nz = n[i + 2]; n[i + 1] = -nz; n[i + 2] = ny; }
    return this;
  }
  build(name: string, scene: Scene, mat: StandardMaterial, parent?: TransformNode | null): Mesh {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.pos; vd.normals = this.nor; vd.colors = this.col; vd.indices = this.idx;
    vd.applyToMesh(mesh);
    mesh.material = mat; mesh.isPickable = false; mesh.hasVertexAlpha = false;
    if (parent) mesh.parent = parent;
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
    return mesh;
  }
}

/** Piano texturizzato rivolto verso +z locale (il testo si legge da +z). */
export function texPlane(scene: Scene, name: string, w: number, h: number, mat: StandardMaterial, parent?: TransformNode | null): Mesh {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = [w / 2, -h / 2, 0, -w / 2, -h / 2, 0, -w / 2, h / 2, 0, w / 2, h / 2, 0];
  vd.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  vd.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  vd.indices = [0, 1, 2, 0, 2, 3];
  vd.applyToMesh(mesh);
  mesh.material = mat; mesh.isPickable = false;
  if (parent) mesh.parent = parent;
  return mesh;
}

export function makeCanvasTexture(scene: Scene, name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  draw(tex.getContext() as unknown as CanvasRenderingContext2D, w, h);
  tex.update();
  return tex;
}

export interface MatOpts { unlit?: boolean; twoSided?: boolean; alpha?: number; spec?: number }
/** Registro dei materiali: consente la fase «strip» (tutto bianco piatto) e il ripristino esatto. */
export class Mats {
  private list: { m: StandardMaterial; d: Color3; e: Color3 }[] = [];
  private stripNow = 0;
  readonly vc: StandardMaterial; readonly vc2: StandardMaterial; readonly black: StandardMaterial;
  readonly bulbOn: StandardMaterial; readonly bulbOff: StandardMaterial; readonly winLit: StandardMaterial; readonly winDark: StandardMaterial;
  readonly headOn: StandardMaterial; readonly amberOn: StandardMaterial; readonly redOn: StandardMaterial; readonly greenOn: StandardMaterial;
  readonly ember: StandardMaterial; readonly flame: StandardMaterial; readonly faint: StandardMaterial; readonly eye: StandardMaterial;

  constructor(readonly scene: Scene) {
    this.vc = this.make('obj.vc', 0xffffff);
    this.vc2 = this.make('obj.vc2', 0xffffff, 0, { twoSided: true });
    this.black = this.make('obj.black', 0x020203, 0, { unlit: true });
    this.bulbOn = this.make('obj.bulbOn', 0xffe2a8, 0xffc978, { unlit: true });
    this.bulbOff = this.make('obj.bulbOff', 0x8d8a78);
    this.winLit = this.make('obj.winLit', 0xffc070, 0xf2a851, { unlit: true });
    this.winDark = this.make('obj.winDark', 0x141b20, 0x04070a, { spec: 0.35 });
    this.headOn = this.make('obj.headOn', 0xffffff, 0xf4f1dc, { unlit: true });
    this.amberOn = this.make('obj.amberOn', 0xffa020, 0xff9a1c, { unlit: true });
    this.redOn = this.make('obj.redOn', 0xff2010, 0xd81a10, { unlit: true });
    this.greenOn = this.make('obj.greenOn', 0x40ff60, 0x35d455, { unlit: true });
    this.ember = this.make('obj.ember', 0x3a0c04, 0xa3260a);
    this.flame = this.make('obj.flame', 0xff8a20, 0xff9a30, { unlit: true, alpha: 0.85 });
    this.flame.alphaMode = Constants.ALPHA_ADD; this.flame.disableDepthWrite = true;
    this.faint = this.make('obj.faint', 0xb7c08a, 0x2c3314);
    this.eye = this.make('obj.eye', 0xd8c860, 0x8f8030, { unlit: true });
  }
  make(name: string, diffuse: number, emissive = 0, o: MatOpts = {}): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    const d = rgb(diffuse), e = rgb(emissive), sp = o.spec ?? 0.03;
    m.diffuseColor = new Color3(d[0], d[1], d[2]);
    m.emissiveColor = new Color3(e[0], e[1], e[2]);
    m.specularColor = new Color3(sp, sp, sp);
    m.maxSimultaneousLights = 8;
    m.useEmissiveAsIllumination = true;
    if (o.unlit) m.disableLighting = true;
    if (o.twoSided) { m.backFaceCulling = false; m.twoSidedLighting = true; }
    if (o.alpha !== undefined) m.alpha = o.alpha;
    this.register(m);
    return m;
  }
  register(m: StandardMaterial): void {
    this.list.push({ m, d: m.diffuseColor.clone(), e: m.emissiveColor.clone() });
    if (this.stripNow > 0) this.applyOne(this.list[this.list.length - 1], this.stripNow);
  }
  unregister(m: StandardMaterial): void {
    const i = this.list.findIndex((r) => r.m === m);
    if (i >= 0) this.list.splice(i, 1);
  }
  private applyOne(r: { m: StandardMaterial; d: Color3; e: Color3 }, s: number): void {
    if (s <= 0) { r.m.diffuseColor.copyFrom(r.d); r.m.emissiveColor.copyFrom(r.e); return; }
    r.m.diffuseColor.set(r.d.r * (1 - s), r.d.g * (1 - s), r.d.b * (1 - s));
    r.m.emissiveColor.set(r.e.r + (1 - r.e.r) * s, r.e.g + (1 - r.e.g) * s, r.e.b + (1 - r.e.b) * s);
  }
  /** s = 0 ripristina esattamente i colori d'origine. */
  strip(s: number): void {
    if (s === this.stripNow) return;
    this.stripNow = s;
    for (const r of this.list) this.applyOne(r, s);
  }
  dispose(): void {
    for (const r of this.list) { r.m.diffuseTexture?.dispose(); r.m.dispose(); }
    this.list.length = 0;
  }
}

export type GlowKind = 'warm' | 'amber' | 'red' | 'white' | 'fire';
const GLOW_TINT: Record<GlowKind, number> = { warm: 0xffb060, amber: 0xff9020, red: 0xc02810, white: 0xe8ecff, fire: 0xff7a22 };
/** Aloni additivi a billboard (istanze: una draw call per colore). */
export class GlowPool {
  private src = new Map<GlowKind, Mesh>();
  private free = new Map<GlowKind, InstancedMesh[]>();
  private mats: StandardMaterial[] = [];
  private tex: DynamicTexture;
  private n = 0;
  max = 64;
  constructor(private scene: Scene) {
    this.tex = makeCanvasTexture(scene, 'obj.glowTex', 64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(210,210,210,1)'); g.addColorStop(0.35, 'rgba(70,70,70,1)');
      g.addColorStop(0.7, 'rgba(14,14,14,1)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    for (const k of Object.keys(GLOW_TINT) as GlowKind[]) {
      const m = new StandardMaterial('obj.glow.' + k, scene);
      const t = rgb(GLOW_TINT[k]);
      m.diffuseTexture = this.tex; m.diffuseColor = new Color3(0, 0, 0); m.specularColor = new Color3(0, 0, 0);
      m.emissiveColor = new Color3(t[0], t[1], t[2]);
      m.disableLighting = true; m.alpha = 0.99; m.alphaMode = Constants.ALPHA_ADD; m.disableDepthWrite = true; m.fogEnabled = false; m.backFaceCulling = false;
      const mesh = texPlane(scene, 'obj.glowSrc.' + k, 1, 1, m);
      mesh.isVisible = false;
      this.mats.push(m); this.src.set(k, mesh); this.free.set(k, []);
    }
  }
  get(kind: GlowKind): InstancedMesh | null {
    const f = this.free.get(kind)!;
    let inst = f.pop();
    if (!inst) {
      if (this.n >= this.max) return null;
      inst = this.src.get(kind)!.createInstance('glow');
      inst.billboardMode = 7; inst.isPickable = false;
      (inst as unknown as { __k: GlowKind }).__k = kind;
      this.n++;
    }
    inst.setEnabled(true);
    return inst;
  }
  release(inst: InstancedMesh): void {
    inst.setEnabled(false);
    this.free.get((inst as unknown as { __k: GlowKind }).__k)!.push(inst);
  }
  dispose(): void {
    for (const m of this.src.values()) m.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}

/** Contesto condiviso dai costruttori di mesh. */
export interface Ctx {
  scene: Scene;
  mats: Mats;
  glow: GlowPool;
  gfx: GraphicsSettings;
  shadow: (m: AbstractMesh) => void;
  heightAt: (x: number, z: number) => number;
  seed: number;
}
export function segsFor(gfx: GraphicsSettings): number { return gfx.quality === 'low' ? 6 : gfx.quality === 'high' ? 10 : 8; }

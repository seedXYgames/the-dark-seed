// Oggetti interattivi e arredi: una visuale per ObjectKind, con animazioni morbide dei cambi di stato.
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { BuildingSpec, Lang, ObjState, WorldObjectSpec } from '../core/contracts';
import { Geo, type Ctx, type V3, makeCanvasTexture, mixHex, texPlane } from './meshUtil';
import { doorAngle, DOOR_GAP, DOOR_H, hashStr, wrapText } from './objMath';
import { PAL_DOOR, PAL_ROOF } from './buildings';
import { buildCar, buildTrunkLid } from './vehicles';
import { buildWorldItem } from './items';

export interface PropVis {
  meshes: Mesh[];
  nodes: TransformNode[];
  own: StandardMaterial[];
  set(st: ObjState, lit: boolean, instant: boolean): void;
  /** Avanza le animazioni; true finché serve un altro passo. */
  tick(dt: number, t: number): boolean;
}
export interface PropEnv { b?: BuildingSpec; lang: Lang; wf: number; gy: (lx: number, lz: number) => number }

export const TENT_COLORS = [0x8a4a2a, 0x3f5a4a, 0x3a5068, 0x8a7a3a, 0x6e3a3a, 0x6a6e70];
const WOOD = 0x6f5d47, DKWOOD = 0x4a3d30, STEEL = 0x2a2e2c, GREEN = 0x26332c, PALE = 0xd8d2c0, CONC = 0x8c8a80;

/** Chiave delle proprietà che richiedono la ricostruzione della mesh (non animabili). */
export function structKey(o: WorldObjectSpec, st: ObjState, lang: Lang): string {
  switch (o.kind) {
    case 'sign': return `${lang}|${st.textIt}|${st.textEn}|${st.board}`;
    case 'tent': return `${st.color}|${st.content}`;
    case 'vehicle': return `${st.body}|${st.color}|${st.plate}|${st.windows}`;
    case 'bridge_plate': return String(st.state);
    case 'panel': return String(st.breaker);
    case 'campfire': return String(st.grill);
    case 'table': return String(st.picnic);
    case 'lamp': case 'trace': return String(st.type);
    case 'bin': return String(st.content);
    default: return '';
  }
}

class An {
  v = 0; private t = 0; private sp = 1;
  constructor(private apply: (v: number) => void, private dur = 0.45) {}
  set(target: number, instant: boolean): void {
    this.t = target;
    if (instant) { this.v = target; this.apply(target); } else this.sp = Math.max(1e-4, Math.abs(target - this.v)) / this.dur;
  }
  step(dt: number): boolean {
    if (this.v === this.t) return false;
    const d = this.t - this.v, m = this.sp * dt;
    this.v = Math.abs(d) <= m ? this.t : this.v + Math.sign(d) * m;
    this.apply(this.v);
    return this.v !== this.t;
  }
}

function drawSign(x: CanvasRenderingContext2D, w: number, h: number, text: string, board: boolean): void {
  if (board) {
    x.fillStyle = '#d6cfba'; x.fillRect(0, 0, w, h); x.fillStyle = '#2f4a3a'; x.fillRect(0, 0, w, 46); x.fillRect(0, h - 14, w, 14);
    x.strokeStyle = '#2f4a3a'; x.lineWidth = 5; x.strokeRect(2, 2, w - 4, h - 4);
  } else {
    x.fillStyle = '#6a5238'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,240,200,0.05)'; x.fillRect(0, (i * h) / 4, w, h / 4 - 3); }
    x.strokeStyle = 'rgba(30,20,10,0.55)'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
  }
  const top = board ? 56 : 14, availH = h - top - (board ? 24 : 14), availW = w - 48;
  let fs = 76, lines: string[] = [];
  for (; fs >= 16; fs -= 4) {
    x.font = `bold ${fs}px Georgia, "Times New Roman", serif`;
    lines = wrapText(text, availW, (s) => x.measureText(s).width);
    if (lines.length * fs * 1.16 <= availH && lines.every((l) => x.measureText(l).width <= availW)) break;
  }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const y0 = top + availH / 2 - ((lines.length - 1) * fs * 1.16) / 2;
  lines.forEach((l, i) => {
    if (!board) { x.fillStyle = 'rgba(20,12,6,0.6)'; x.fillText(l, w / 2 + 2, y0 + i * fs * 1.16 + 3); }
    x.fillStyle = board ? '#23221c' : '#e9dfc4'; x.fillText(l, w / 2, y0 + i * fs * 1.16);
  });
}

export function buildProp(c: Ctx, o: WorldObjectSpec, st: ObjState, drift: TransformNode, env: PropEnv): PropVis {
  const sc = c.scene, M = c.mats, hs = Math.abs(hashStr(o.id, 17));
  const g = new Geo(hs);
  const meshes: Mesh[] = [], nodes: TransformNode[] = [], own: StandardMaterial[] = [], anims: An[] = [];
  let onSet: (st: ObjState, lit: boolean, instant: boolean) => void = () => {};
  let onTick: ((dt: number, t: number) => boolean) | null = null;
  const node = (x = 0, y = 0, z = 0, parent: TransformNode = drift): TransformNode => { const n = new TransformNode('p', sc); n.parent = parent; n.position.set(x, y, z); nodes.push(n); return n; };
  const out = (q: Geo, mat: StandardMaterial = M.vc, parent: TransformNode = drift, shadow = false): Mesh => { const m = q.build('o.' + o.id, sc, mat, parent); meshes.push(m); if (shadow) c.shadow(m); return m; };
  const an = (apply: (v: number) => void, dur?: number): An => { const a = new An(apply, dur); anims.push(a); return a; };
  const wf = env.wf;

  switch (o.kind) {
    case 'door': {
      const col = PAL_DOOR[(env.b?.palette ?? 0) % 6], dk = mixHex(col, 0, 0.3), z0 = env.b?.enterable ? 0 : 0.04;
      const hinge = node(-DOOR_GAP, 0, z0);
      g.box(DOOR_GAP, DOOR_H / 2, 0, DOOR_GAP * 2 - 0.02, DOOR_H - 0.02, 0.06, col);
      for (const s of [-1, 1]) {
        g.box(DOOR_GAP, 1.5, s * 0.032, 0.86, 0.72, 0.012, dk).box(DOOR_GAP, 0.55, s * 0.032, 0.86, 0.72, 0.012, dk);
        g.box(1.1, 1.02, s * 0.05, 0.06, 0.16, 0.02, 0x8d8a78).cyl(1.1, 1.0, s * 0.085, 0.035, 0.035, 0.05, 0xa58a4a, 'z', 7);
      }
      for (const y of [0.3, 1.75]) g.box(0.02, y, 0.04, 0.05, 0.12, 0.03, 0x2a2a2a);
      out(g, M.vc, hinge);
      const a = an((v) => { hinge.rotation.y = -v; }, 0.55);
      onSet = (s, _l, i) => a.set(doorAngle(s.state), i);
      break;
    }
    case 'switch': {
      g.box(0, 0, wf + 0.012, 0.09, 0.13, 0.022, PALE).box(0, -0.4, wf + 0.01, 0.025, 0.7, 0.02, 0x6a6a66);
      out(g);
      const tg = node(0, 0, wf + 0.024), q = new Geo(1);
      q.box(0, 0, 0.012, 0.026, 0.05, 0.03, 0xf2eee2);
      out(q, M.vc, tg);
      const a = an((v) => { tg.rotation.x = 0.5 - v; }, 0.12);
      onSet = (s, _l, i) => a.set(s.on ? 1 : 0, i);
      break;
    }
    case 'lamp': {
      const q = new Geo(1); q.jit = 0;
      if (st.type === 'ceiling') {
        g.beam([0, 0.4, 0], [0, 0.05, 0], 0.02, 0x1a1a1a).frustum(0, 0, -0.1, 0.42, 0.42, 0.06, 0.08, 0.08, GREEN);
        q.sphere(0, -0.12, 0, 0.06, 0.075, 0.06, 0xffffff);
      } else if (st.type === 'lantern') {
        g.cyl(0, 0.03, 0, 0.09, 0.08, 0.06, 0x7a2f25).cyl(0, 0.25, 0, 0.08, 0.05, 0.06, 0x7a2f25).ring(0, 0.27, 0, 0.1, 0.012, 0x222222, 6, 0, Math.PI);
        for (let i = 0; i < 3; i++) g.beam([Math.cos(i * 2.1) * 0.075, 0.06, Math.sin(i * 2.1) * 0.075], [Math.cos(i * 2.1) * 0.075, 0.22, Math.sin(i * 2.1) * 0.075], 0.01, 0x222222);
        q.cyl(0, 0.14, 0, 0.06, 0.06, 0.16, 0xffffff);
      } else if (st.type === 'canopy') {
        for (const x of [-2.4, 0, 2.4]) { g.box(x, -0.03, 0, 1.7, 0.05, 0.5, 0xb4b0a4); q.box(x, -0.062, 0, 1.5, 0.02, 0.36, 0xffffff); }
      } else {
        g.beam([0, 0.12, wf], [0, 0.12, 0], 0.03, STEEL).box(0, 0.1, wf + 0.012, 0.12, 0.2, 0.024, STEEL).frustum(0, 0, -0.02, 0.3, 0.3, 0.15, 0.1, 0.1, GREEN);
        q.sphere(0, -0.07, 0, 0.065, 0.08, 0.065, 0xffffff);
      }
      out(g);
      const bulb = out(q, M.bulbOff);
      onSet = (_s, lit) => { bulb.material = lit ? M.bulbOn : M.bulbOff; };
      break;
    }
    case 'lamp_post': {
      g.cyl(0, 2.1, 0, 0.075, 0.05, 4.2, GREEN).cyl(0, 0.16, 0, 0.13, 0.1, 0.32, GREEN).beam([0, 4.1, 0], [0, 4.2, 0.62], 0.05, GREEN).box(0, 4.14, 0.62, 0.32, 0.12, 0.48, 0x1c2420);
      out(g, M.vc, drift, true);
      const q = new Geo(1); q.jit = 0; q.box(0, 4.07, 0.62, 0.25, 0.03, 0.4, 0xffffff);
      const bulb = out(q, M.bulbOff);
      onSet = (_s, lit) => { bulb.material = lit ? M.bulbOn : M.bulbOff; };
      break;
    }
    case 'generator': {
      const vib = node();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.42, 0.33, sz * 0.27, 0.035, 0.66, 0.035, STEEL);
      for (const sz of [-1, 1]) g.box(0, 0.66, sz * 0.27, 0.88, 0.035, 0.035, STEEL).box(0, 0.06, sz * 0.27, 0.95, 0.04, 0.06, STEEL);
      for (const sx of [-1, 1]) g.box(sx * 0.42, 0.66, 0, 0.035, 0.035, 0.54, STEEL);
      g.box(-0.1, 0.28, 0, 0.42, 0.36, 0.4, 0x555a58).box(0, 0.56, 0, 0.7, 0.14, 0.44, 0x7a2f25).cyl(0, 0.645, 0.1, 0.05, 0.05, 0.03, 0x1a1a1a);
      g.cyl(0.26, 0.28, 0, 0.17, 0.17, 0.3, 0x35506e, 'x').cyl(-0.38, 0.4, -0.12, 0.05, 0.05, 0.22, 0x3a3a3a, 'x').box(0.05, 0.3, 0.215, 0.36, 0.26, 0.03, 0x1c1f1d);
      g.box(-0.02, 0.26, 0.235, 0.07, 0.07, 0.01, PALE).box(0.1, 0.26, 0.235, 0.07, 0.07, 0.01, PALE).beam([-0.25, 0.42, 0.21], [-0.25, 0.42, 0.3], 0.03, 0x111111);
      out(g, M.vc, vib, true);
      const q = new Geo(1); q.jit = 0; q.box(0.16, 0.39, 0.235, 0.035, 0.035, 0.012, 0xffffff);
      const led = out(q, M.bulbOff, vib);
      let run = false;
      onSet = (s) => { run = !!s.running; led.material = run ? M.greenOn : M.bulbOff; if (!run) { vib.position.set(0, 0, 0); vib.rotation.z = 0; } };
      onTick = (_dt, t) => { if (!run) return false; vib.position.y = Math.sin(t * 61) * 0.004; vib.position.x = Math.sin(t * 47) * 0.003; vib.rotation.z = Math.sin(t * 53) * 0.006; return true; };
      break;
    }
    case 'drawer': {
      const sl = node();
      g.box(0, 0.07, 0.11, 0.62, 0.15, 0.02, WOOD).box(0, 0.07, -0.37, 0.58, 0.12, 0.015, DKWOOD).box(0, 0.015, -0.13, 0.58, 0.012, 0.48, DKWOOD);
      for (const s of [-1, 1]) g.box(s * 0.29, 0.07, -0.13, 0.015, 0.12, 0.48, DKWOOD);
      g.cyl(0, 0.07, 0.135, 0.02, 0.025, 0.03, 0xa58a4a, 'z', 6);
      out(g, M.vc, sl);
      const a = an((v) => { sl.position.z = -0.45 * (1 - v); }, 0.4);
      onSet = (s, _l, i) => a.set(s.open ? 1 : 0, i);
      break;
    }
    case 'tent': {
      const col = TENT_COLORS[Number(st.color ?? 0) % 6], inn = mixHex(col, 0, 0.72), hw = 1.1, L = 1.2, H = 1.4;
      for (const s of [-1, 1]) {
        g.quad([s * hw, 0, -L], [s * hw, 0, L], [0, H, L], [0, H, -L], col, [s, 0.6, 0]);
        g.quad([s * hw * 0.98, 0, -L * 0.99], [s * hw * 0.98, 0, L * 0.99], [0, H * 0.98, L * 0.99], [0, H * 0.98, -L * 0.99], inn, [-s, -0.6, 0]);
        g.quad([s * hw, 0, -L], [s * hw, 0, L], [s * hw * 0.8, H * 0.2, L], [s * hw * 0.8, H * 0.2, -L], mixHex(col, 0, 0.25), [s, 0.6, 0]);
        for (const e of [-1, 1]) g.beam([s * hw, 0.02, e * L], [s * (hw + 0.5), 0, e * (L + 0.3)], 0.012, PALE).box(s * (hw + 0.5), 0.04, e * (L + 0.3), 0.03, 0.1, 0.03, 0x8d8a78);
      }
      g.tri([-hw, 0, -L], [hw, 0, -L], [0, H, -L], mixHex(col, 0, 0.1), [0, 0, -1]).tri([-hw, 0, -L * 0.99], [hw, 0, -L * 0.99], [0, H, -L * 0.99], inn, [0, 0, 1]);
      g.quad([-hw, 0.02, -L], [hw, 0.02, -L], [hw, 0.02, L], [-hw, 0.02, L], 0x15140f, [0, 1, 0]);
      g.tri([-hw, 0, L], [0, 0, L], [0, H, L], mixHex(col, 0, 0.08), [0, 0, 1]).beam([0, 0, L + 0.006], [0, H, L + 0.006], 0.025, mixHex(col, 0xffffff, 0.35));
      for (const e of [-1, 1]) g.beam([0, H, e * L], [0, 0, e * (L + 0.9)], 0.012, PALE).box(0, H + 0.03, e * L, 0.04, 0.08, 0.04, 0x8d8a78);
      out(g, M.vc, drift, true);
      // lembo mobile: il vertice centrale in basso scorre verso il bordo inclinato
      const flap = new Mesh('o.flap.' + o.id, sc), cc = [col >> 16 & 255, col >> 8 & 255, col & 255].map((v) => (v / 255) * 0.92);
      const pos = [0, 0, L, hw, 0, L, 0, H, L], vd = new VertexData();
      vd.positions = pos; vd.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1]; vd.indices = [0, 1, 2]; vd.colors = [...cc, 1, ...cc, 1, ...cc, 1];
      vd.applyToMesh(flap, true);
      flap.material = M.vc2; flap.parent = drift; flap.isPickable = false; meshes.push(flap);
      const q = new Geo(hs);
      switch (st.content) {
        case 'sleeping_bag': q.sphere(-0.45, 0.13, -0.1, 0.3, 0.12, 0.85, 0x5a3a6a).box(-0.45, 0.1, -0.95, 0.4, 0.1, 0.25, PALE); break;
        case 'gear': q.box(-0.5, 0.3, -0.5, 0.4, 0.6, 0.3, 0x4a5a3a).box(-0.5, 0.5, -0.33, 0.3, 0.18, 0.06, 0x35402a).cyl(0.45, 0.1, -0.3, 0.1, 0.1, 0.6, 0x35506e, 'z').box(0.4, 0.08, 0.3, 0.3, 0.14, 0.2, 0x8a3a2a); break;
        case 'boots': for (const s of [0, 1]) q.box(-0.4 + s * 0.22, 0.07, 0.5, 0.12, 0.1, 0.3, 0x4a3524).box(-0.4 + s * 0.22, 0.2, 0.58 - s * 0.02, 0.12, 0.2, 0.13, 0x4a3524); break;
        case 'food': q.box(-0.5, 0.15, -0.2, 0.45, 0.28, 0.3, 0x7a2f25).cyl(0.3, 0.07, 0.2, 0.05, 0.05, 0.12, 0xb4b8ba).cyl(0.42, 0.07, 0.3, 0.05, 0.05, 0.12, 0x8a7a3a).box(0.3, 0.03, -0.3, 0.25, 0.04, 0.18, PALE); break;
      }
      const cont = q.empty ? null : out(q);
      const a = an((v) => {
        pos[0] = hw * 0.47 * v; pos[1] = H * 0.42 * v;
        flap.updateVerticesData('position', pos);
        cont?.setEnabled(v > 0.25);
      }, 0.6);
      onSet = (s, _l, i) => a.set(s.flap === 'open' ? 1 : 0, i);
      break;
    }
    case 'panel': {
      const zc = wf + 0.07, grey = 0x7d8380;
      g.box(0, 0, zc, 0.5, 0.6, 0.14, grey, 8).box(0, 0, wf + 0.02, 0.46, 0.56, 0.01, 0x2a2e2c).box(0, 0.42, wf + 0.03, 0.04, 0.3, 0.04, 0x6a6a66);
      for (let i = 0; i < 4; i++) {
        const x = -0.15 + i * 0.1, down = i === 1 && st.breaker === 'tripped';
        g.box(x, 0.05, wf + 0.045, 0.07, 0.16, 0.05, 0x161616).box(x, down ? 0.02 : 0.08, wf + 0.08, 0.03, 0.05, 0.03, down ? 0xb02a1a : PALE);
        if (down) g.box(x, -0.09, wf + 0.075, 0.05, 0.07, 0.006, 0xc0281c);
      }
      g.box(0, -0.18, wf + 0.03, 0.36, 0.08, 0.012, PALE);
      out(g);
      const hinge = node(-0.25, 0, wf + 0.14), q = new Geo(2);
      q.box(0.25, 0, 0.008, 0.5, 0.6, 0.016, grey).box(0.44, 0, 0.022, 0.03, 0.1, 0.014, 0x2a2a2a).box(0.25, 0.12, 0.018, 0.16, 0.14, 0.004, 0xc9a23a).beam([0.27, 0.17, 0.021], [0.23, 0.08, 0.021], 0.02, 0x1a1a1a, 0.003);
      out(q, M.vc, hinge);
      const a = an((v) => { hinge.rotation.y = -v * 1.95; }, 0.5);
      onSet = (s, _l, i) => a.set(s.open ? 1 : 0, i);
      break;
    }
    case 'vehicle': case 'police_car': {
      const police = o.kind === 'police_car';
      const car = buildCar(c, drift, {
        body: police ? 'sedan' : String(st.body ?? 'sedan'), color: Number(st.color ?? 0), fogged: st.windows === 'fogged', police,
        plate: police ? `PD ${100 + (c.seed % 900)}` : String(st.plate ?? ''), unit: `UNIT ${10 + (c.seed % 89)}`,
      });
      meshes.push(...car.meshes); own.push(...car.own);
      let beacon = false;
      const redOff = car.beacons?.red.material, blueOff = car.beacons?.blue.material;
      onSet = (s) => {
        car.head.material = (police ? s.headlights : s.lights) ? M.headOn : M.bulbOff;
        if (car.amber) car.amber.material = s.beacon ? M.amberOn : M.bulbOff;
        beacon = !!s.beacon;
        if (car.beacons && !beacon) { car.beacons.red.material = redOff!; car.beacons.blue.material = blueOff!; }
      };
      if (car.beacons) onTick = (_dt, t) => {
        const phase = (t % 0.9) / 0.9;
        car.beacons!.red.material = beacon && (phase < 0.12 || (phase > 0.2 && phase < 0.32)) ? M.redOn : redOff!;
        car.beacons!.blue.material = beacon && ((phase > 0.5 && phase < 0.62) || (phase > 0.7 && phase < 0.82)) ? M.blueOn : blueOff!;
        return beacon;
      };
      break;
    }
    case 'car_trunk': {
      const hinge = node(0, 0.2, 1.25);
      meshes.push(buildTrunkLid(c, hinge));
      const a = an((v) => { hinge.rotation.x = v * 1.2; }, 0.6);
      onSet = (s, _l, i) => a.set(s.open ? 1 : 0, i);
      break;
    }
    case 'sign': {
      const tilt = node(), board = !!st.board, text = String((env.lang === 'it' ? st.textIt : st.textEn) ?? '');
      const bw = board ? 1.6 : 1.0, bh = board ? 1.1 : 0.55, by = board ? 1.45 : 1.25;
      if (board) {
        for (const s of [-1, 1]) g.box(s * 0.72, 1.05, -0.05, 0.11, 2.1, 0.11, DKWOOD);
        g.beam([0, 2.22, -0.05], [0, 2.08, 0.22], 1.9, PAL_ROOF[hs % 6], 0.05).beam([0, 2.22, -0.05], [0, 2.08, -0.32], 1.9, PAL_ROOF[hs % 6], 0.05);
      } else g.box(0, 0.8, -0.05, 0.1, 1.6, 0.1, DKWOOD).box(0, 1.62, -0.05, 0.13, 0.04, 0.13, 0x3a3026);
      g.box(0, by, 0, bw + 0.04, bh + 0.04, 0.04, board ? DKWOOD : 0x5a452f);
      out(g, M.vc, tilt, true);
      const m = M.make('sign.' + o.id, 0xffffff);
      m.diffuseTexture = makeCanvasTexture(sc, 'sign.t', 512, board ? 352 : 288, (x, w, h) => drawSign(x, w, h, text, board));
      own.push(m);
      const f = texPlane(sc, 'o.signF', bw, bh, m, tilt); f.position.set(0, by, 0.0215);
      meshes.push(f);
      if (!board) { const bk = texPlane(sc, 'o.signB', bw, bh, m, tilt); bk.position.set(0, by, -0.0215); bk.rotation.y = Math.PI; meshes.push(bk); }
      const a = an((v) => { tilt.rotation.z = v; }, 0.5);
      onSet = (s, _l, i) => a.set(Number(s.tilt ?? 0), i);
      break;
    }
    case 'bin': {
      const piv = node(0.37, 0, 0), bc = 0x3d4a40;
      g.push().tr(-0.37, 0, 0);
      g.box(0, 0.03, 0, 0.62, 0.06, 0.52, 0x1c2420).box(0, 0.53, 0, 0.72, 0.94, 0.62, bc).frustum(0, 0, 1.0, 0.76, 0.66, 1.16, 0.5, 0.4, 0x2f3a33);
      g.box(0, 0.8, 0.315, 0.5, 0.22, 0.02, 0x2f3a33).box(0, 0.74, 0.335, 0.3, 0.03, 0.03, 0x8d8a78).box(0, 0.45, 0.313, 0.3, 0.2, 0.008, PALE);
      g.pop();
      out(g, M.vc, piv, true);
      const q = new Geo(hs);
      if (st.content !== 'empty') {
        const cols = [0xb0483a, PALE, 0x35506e, 0x8a7a3a, 0xc9cdd0];
        for (let i = 0; i < 6; i++) q.push().tr(1.25 + (i % 3) * 0.22, 0.04, -0.3 + i * 0.12).ry(i * 1.3).box(0, 0, 0, 0.1 + (i % 2) * 0.06, 0.05, 0.12, cols[i % 5]).pop();
        if (st.content === 'food') q.sphere(1.5, 0.05, 0.3, 0.07, 0.05, 0.07, 0x7a5a3a).cyl(1.2, 0.05, 0.25, 0.04, 0.04, 0.12, 0xb4b8ba, 'x', 6);
      }
      const lit = q.empty ? null : out(q);
      const a = an((v) => { piv.rotation.z = -v * Math.PI / 2; lit?.setEnabled(v > 0.7); }, 0.5);
      onSet = (s, _l, i) => a.set(s.tipped ? 1 : 0, i);
      break;
    }
    case 'table': {
      if (st.picnic) {
        g.jit = 0.1;
        for (const z of [-0.26, 0, 0.26]) g.box(0, 0.745, z, 1.9, 0.05, 0.24, WOOD);
        for (const s of [-1, 1]) g.box(0, 0.45, s * 0.72, 1.9, 0.05, 0.27, WOOD);
        for (const x of [-0.7, 0.7]) {
          for (const s of [-1, 1]) g.beam([x, 0, s * 0.8], [x, 0.72, s * 0.24], 0.09, DKWOOD, 0.05);
          g.box(x, 0.4, 0, 0.05, 0.09, 1.72, DKWOOD).box(x, 0.7, 0, 0.05, 0.07, 0.74, DKWOOD);
        }
        g.beam([-0.68, 0.4, 0], [0, 0.71, 0], 0.05, DKWOOD).beam([0.68, 0.4, 0], [0, 0.71, 0], 0.05, DKWOOD);
      } else {
        g.box(0, 0.745, 0, 1.4, 0.05, 0.8, WOOD);
        for (const sx of [-1, 1]) { for (const sz of [-1, 1]) g.box(sx * 0.62, 0.36, sz * 0.32, 0.07, 0.72, 0.07, DKWOOD); g.box(sx * 0.62, 0.67, 0, 0.03, 0.09, 0.6, DKWOOD).box(sx * 0.49, 0.67, 0.34, 0.3, 0.09, 0.03, DKWOOD); }
        g.box(0, 0.67, -0.34, 1.2, 0.09, 0.03, DKWOOD);
      }
      out(g, M.vc, drift, true);
      break;
    }
    case 'campfire': {
      const grill = !!st.grill, fy = grill ? 0.84 : 0.06, q = new Geo(hs), f = new Geo(1);
      f.jit = 0;
      if (grill) {
        g.cyl(0, 0.35, 0, 0.06, 0.05, 0.7, STEEL).box(0, 0.8, 0, 0.62, 0.26, 0.46, 0x242424, 2).box(0, 0.69, 0, 0.56, 0.02, 0.4, 0x151515);
        for (let i = 0; i < 6; i++) g.box(-0.25 + i * 0.1, 0.93, 0, 0.012, 0.012, 0.46, 0x3a3a3a);
        q.box(0, 0.74, 0, 0.44, 0.06, 0.3, 0xffffff);
      } else {
        g.jit = 0.14;
        for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; g.sphere(Math.cos(a) * 0.55, 0.07, Math.sin(a) * 0.55, 0.15 + (i % 3) * 0.02, 0.1 + (i % 2) * 0.03, 0.13, 0x6e6c64, 6, 4); }
        g.cyl(0, 0.015, 0, 0.47, 0.47, 0.03, 0x2a2826, 'y', 9);
        for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; g.beam([Math.cos(a) * 0.36, 0.05, Math.sin(a) * 0.36], [-Math.cos(a) * 0.08, 0.32, -Math.sin(a) * 0.08], 0.09, 0x2a2019); }
        q.cyl(0, 0.045, 0, 0.26, 0.3, 0.03, 0xffffff, 'y', 7);
        for (let i = 0; i < 5; i++) q.box(Math.cos(i * 2.2) * 0.18, 0.08, Math.sin(i * 2.2) * 0.18, 0.08, 0.05, 0.07, 0xffffff);
      }
      out(g, M.vc, drift, true);
      const emb = out(q, M.ember), fl = node(0, fy);
      const k = grill ? 0.55 : 1;
      for (let i = 0; i < 3; i++) f.cyl(Math.cos(i * 2.1) * 0.09 * k, 0.3 * k, Math.sin(i * 2.1) * 0.09 * k, (0.15 - i * 0.02) * k, 0, (0.6 + i * 0.12) * k, 0xffffff, 'y', 5, false);
      const flm = out(f, M.flame, fl);
      let burning = false;
      onSet = (s) => { burning = s.state === 'burning'; emb.setEnabled(s.state === 'embers' || burning); flm.setEnabled(burning); };
      onTick = (_dt, t) => {
        if (!burning) return false;
        fl.scaling.y = 1 + 0.22 * Math.sin(t * 9.1 + hs) + 0.12 * Math.sin(t * 23.3); fl.scaling.x = fl.scaling.z = 1 + 0.1 * Math.sin(t * 13.7);
        fl.rotation.y = t * 1.7;
        return true;
      };
      break;
    }
    case 'chair': {
      const fab = [0x35506e, 0x6e2a25, 0x3f5a4a, 0x8a7a3a][hs % 4];
      for (const s of [-1, 1]) {
        g.beam([s * 0.26, 0, 0.24], [s * 0.26, 0.9, -0.3], 0.03, STEEL).beam([s * 0.26, 0, -0.26], [s * 0.26, 0.46, 0.26], 0.03, STEEL);
        g.beam([s * 0.27, 0.62, -0.24], [s * 0.27, 0.6, 0.26], 0.045, 0x1c1c1c, 0.02).beam([s * 0.26, 0.46, 0.26], [s * 0.27, 0.6, 0.26], 0.025, STEEL);
      }
      g.box(0, 0.44, 0, 0.5, 0.02, 0.48, fab).push().tr(0, 0.74, -0.26).rx(-0.3).box(0, 0, 0, 0.5, 0.3, 0.02, fab).pop();
      g.beam([-0.26, 0.02, 0.24], [0.26, 0.02, 0.24], 0.025, STEEL).beam([-0.26, 0.02, -0.26], [0.26, 0.02, -0.26], 0.025, STEEL);
      out(g, M.vc, drift, true);
      break;
    }
    case 'item': meshes.push(buildWorldItem(c, o.item?.kind ?? 'note', o.id, drift)); break;
    case 'battery': meshes.push(buildWorldItem(c, 'battery', o.id, drift)); break;
    case 'bridge_plate': {
      const s = st.state, base = s === 'intact' ? 0x70757a : mixHex(0x70757a, 0x7a4a30, s === 'damaged' ? 0.75 : 0.45);
      g.box(0, 0.02, -0.02, 0.1, 0.34, 0.05, DKWOOD);
      g.push();
      if (s === 'loose') g.tr(-0.13, 0.08, 0).rz(-0.62).tr(0.13, -0.08, 0);
      g.box(0, 0, 0.012, 0.3, 0.2, 0.012, base).box(0, 0.03, 0.02, 0.2, 0.025, 0.004, 0x3a3d40).box(0, -0.03, 0.02, 0.14, 0.02, 0.004, 0x3a3d40);
      const riv: [number, number][] = s === 'loose' ? [[-0.13, 0.08]] : [[-0.13, 0.08], [0.13, 0.08], [-0.13, -0.08], [0.13, -0.08]];
      for (const [x, y] of riv) g.cyl(x, y, 0.02, 0.012, 0.012, 0.01, 0x2a2a2a, 'z', 6);
      if (s === 'damaged') g.box(0.06, -0.04, 0.02, 0.12, 0.07, 0.003, 0x3a2418).beam([-0.12, -0.07, 0.021], [0.02, 0.06, 0.021], 0.012, 0x2a1a12, 0.003);
      g.pop();
      out(g);
      break;
    }
    case 'logbox': {
      g.box(0, 0.5, 0, 0.1, 1.0, 0.1, DKWOOD).box(0, 1.13, 0, 0.4, 0.26, 0.32, 0x5c6657).box(0, 1.14, 0.162, 0.26, 0.1, 0.006, PALE);
      out(g, M.vc, drift, true);
      const hinge = node(0, 1.265, -0.17), q = new Geo(3), pen = new Geo(1);
      q.box(0, 0.02, 0.18, 0.46, 0.035, 0.42, 0x3b3a36).box(0, 0.0, 0.385, 0.1, 0.03, 0.02, 0x8d8a78);
      out(q, M.vc, hinge);
      pen.beam([0.1, 1.275, 0.1], [0.24, 1.3, 0.2], 0.014, 0x1c2a44);
      const pm = out(pen);
      const a = an((v) => { hinge.rotation.x = 0.16 - v * 0.42; pm.setEnabled(v > 0.5); }, 0.4);
      onSet = (s, _l, i) => a.set(s.signed ? 1 : 0, i);
      break;
    }
    case 'pump': {
      g.box(0, 0.03, 0, 0.72, 0.1, 0.52, CONC).box(0, 0.78, 0, 0.6, 1.45, 0.4, 0xb4b0a4).box(0, 1.25, 0, 0.62, 0.3, 0.42, 0x8a3a2a).box(0, 1.58, 0, 0.66, 0.14, 0.44, 0x8a3a2a);
      for (const s of [-1, 1]) g.box(0, 0.98, s * 0.205, 0.4, 0.2, 0.01, 0x1a1f1a).box(0, 0.6, s * 0.205, 0.44, 0.3, 0.008, 0x9a968a);
      g.beam([0.31, 1.1, 0], [0.47, 0.5, 0], 0.035, 0x151515).beam([0.47, 0.5, 0], [0.36, 0.88, 0.08], 0.035, 0x151515).box(0.33, 0.93, 0.08, 0.06, 0.16, 0.06, 0x2a2a2a);
      out(g, M.vc, drift, true);
      break;
    }
    case 'cooler': {
      const cc = [0x35506e, 0x7a2f25, 0x3f5a4a][hs % 3];
      g.box(0, 0.16, 0, 0.6, 0.32, 0.36, cc, 2).box(0, 0.05, 0, 0.56, 0.02, 0.32, PALE);
      for (const s of [-1, 1]) g.box(s * 0.31, 0.22, 0, 0.02, 0.04, 0.16, 0x1c1c1c);
      out(g, M.vc, drift, true);
      const hinge = node(0, 0.32, -0.18), q = new Geo(1);
      q.box(0, 0.03, 0.18, 0.62, 0.06, 0.38, PALE).box(0, 0.03, 0.375, 0.12, 0.03, 0.02, 0x1c1c1c);
      out(q, M.vc, hinge);
      const a = an((v) => { hinge.rotation.x = -v * 1.35; }, 0.4);
      onSet = (s, _l, i) => a.set(s.open ? 1 : 0, i);
      break;
    }
    case 'woodpile': {
      g.jit = 0.14;
      for (const s of [-1, 1]) g.box(s * 0.97, 0.4, 0, 0.07, 0.8, 0.07, DKWOOD);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 8 - r; i++) {
        const x = -0.8 + i * 0.225 + r * 0.11, y = 0.11 + r * 0.19, len = 0.74 + ((i * 7 + r * 3) % 4) * 0.04;
        g.cyl(x, y, 0, 0.1, 0.1, len, 0x4a3a2a, 'z', 6, false).cyl(x, y, len / 2, 0.085, 0.085, 0.01, 0xb09468, 'z', 6).cyl(x, y, -len / 2, 0.085, 0.085, 0.01, 0xb09468, 'z', 6);
      }
      out(g, M.vc, drift, true);
      break;
    }
    case 'bench': {
      g.box(0, 0.45, 0.02, 1.6, 0.05, 0.4, WOOD).box(0, 0.74, -0.2, 1.6, 0.12, 0.035, WOOD).box(0, 0.93, -0.225, 1.6, 0.12, 0.035, WOOD);
      for (const s of [-1, 1]) g.box(s * 0.7, 0.22, 0.02, 0.07, 0.44, 0.38, 0x2a2e2c).beam([s * 0.7, 0.45, -0.17], [s * 0.7, 1.0, -0.25], 0.06, 0x2a2e2c);
      out(g, M.vc, drift, true);
      break;
    }
    case 'fence': {
      for (const x of [-1.5, 0, 1.5]) g.box(x, 0.55, 0, 0.1, 1.1, 0.1, DKWOOD);
      for (const y of [0.45, 0.9]) g.box(0, y, 0.03, 3.1, 0.09, 0.04, WOOD);
      out(g, M.vc, drift, true);
      break;
    }
    case 'trace': {
      const age = Number(st.age ?? 0), soil = mixHex(0x221d18, 0x4a4436, age * 0.6), e = 0.025;
      g.jit = 0.12;
      const seg = (x: number, z: number, w: number, l: number, col: number) => g.box(x, env.gy(x, z) + e, z, w, 0.012, l, col);
      switch (st.type) {
        case 'tire': for (const s of [-1, 1]) for (let i = 0; i < 9; i++) seg(s * 0.72 + Math.sin(i * 0.5) * 0.05, -1.6 + i * 0.4, 0.2, 0.34, soil); break;
        case 'drag': for (let i = 0; i < 8; i++) seg(Math.sin(i * 0.7) * 0.08, -1.2 + i * 0.32, 0.36 - (i % 3) * 0.05, 0.34, soil); break;
        case 'tracks_deer': for (let i = 0; i < 7; i++) for (const s of [-1, 1]) seg((i % 2 ? 0.1 : -0.1) + s * 0.022, -1.5 + i * 0.5, 0.032, 0.085, soil); break;
        case 'boot': for (let i = 0; i < 6; i++) { const x = i % 2 ? 0.13 : -0.13, z = -1.5 + i * 0.6; seg(x, z, 0.1, 0.18, soil); seg(x, z - 0.14, 0.085, 0.07, soil); } break;
        case 'feathers': for (let i = 0; i < 7; i++) g.push().tr(Math.cos(i * 2.4) * 0.3 * (1 + i * 0.15), e + 0.01, Math.sin(i * 2.4) * 0.3 * (1 + i * 0.15)).ry(i * 1.9).rz(0.15).box(0, 0, 0, 0.035, 0.004, 0.13, i % 3 ? 0x9a968c : 0x3a3a3c).pop(); break;
        case 'ash': g.cyl(0, e, 0, 0.42, 0.45, 0.02, 0x55534e, 'y', 9); for (let i = 0; i < 6; i++) g.box(Math.cos(i * 2.2) * 0.2, e + 0.02, Math.sin(i * 2.2) * 0.2, 0.07, 0.03, 0.05, 0x1a1816); break;
        case 'litter': case 'wrapper': {
          const cols = st.type === 'wrapper' ? [0xc9cdd0, 0xb0483a] : [0xb0483a, PALE, 0x35506e, 0xc9cdd0];
          cols.forEach((col, i) => g.push().tr(i * 0.16 - 0.15, e + 0.02, Math.sin(i * 2) * 0.14).ry(i * 1.4).rz(0.3).box(0, 0, 0, 0.11, 0.035, 0.08, col).pop());
          break;
        }
        case 'branch': {
          const bk = 0x3d3226, P: V3[] = [[-0.85, 0.05, 0], [-0.1, 0.09, 0.08], [0.8, 0.05, -0.06]];
          g.beam(P[0], P[1], 0.09, bk).beam(P[1], P[2], 0.065, bk).beam(P[1], [0.25, 0.2, 0.5], 0.035, bk).beam([0.4, 0.07, 0], [0.75, 0.18, -0.4], 0.03, bk).beam([-0.5, 0.07, 0.03], [-0.35, 0.22, -0.3], 0.03, bk);
          break;
        }
        case 'scratch': for (let i = 0; i < 3; i++) g.beam([-0.35 + i * 0.07, e, -0.4], [-0.2 + i * 0.07, e, 0.45], 0.022, 0x9a8a6a, 0.008); break;
        default: seg(0, 0, 0.3, 0.3, soil);
      }
      out(g);
      break;
    }
  }
  return {
    meshes, nodes, own,
    set: (s, lit, instant) => onSet(s, lit, instant),
    tick: (dt, t) => { let more = false; for (const a of anims) if (a.step(dt)) more = true; if (onTick && onTick(dt, t)) more = true; return more; },
  };
}

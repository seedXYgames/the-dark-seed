// Attori: persone articolate, fauna, sagome anomale e illusioni. Nessuno è solido.
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ActorView } from '../core/api';
import { Geo, type Ctx } from './meshUtil';
import { hashStr } from './objMath';
import { FaunaMaterialPlugin } from './faunaMaterial';

interface AV {
  root: TransformNode; meshes: Mesh[]; seen: number; glow: InstancedMesh | null;
  upd(a: ActorView, dt: number, t: number): void;
  /** Opacità effettiva per mesh (alcune hanno dissolvenze incrociate). */
  fade(alpha: number, a: ActorView): void;
}

const JACKET = [0xa8842c, 0x2f5f66, 0x8a3f2f, 0x55603a, 0x2a3a52, 0x6a6e70], PANTS = [0x2a3040, 0x6f6448, 0x303032], SKIN = [0xd2a986, 0xb98a66, 0x8a6244, 0xe0bfa0];

export class ActorsRenderer {
  private map = new Map<string, AV>();
  private hidden = new Set<string>();
  private frame = 0;
  private faunaMat: StandardMaterial;
  private faunaPlugin: FaunaMaterialPlugin;
  constructor(private c: Ctx, private root: TransformNode) {
    this.faunaMat = c.mats.make('actor.fauna', 0xffffff, 0, { spec: 0 });
    this.faunaPlugin = new FaunaMaterialPlugin(this.faunaMat);
  }

  setHidden(id: string, hidden: boolean): void { if (hidden) this.hidden.add(id); else this.hidden.delete(id); const v = this.map.get(id); if (v && hidden) { v.root.setEnabled(false); if (v.glow) { this.c.glow.release(v.glow); v.glow = null; } } }

  sync(actors: ActorView[], dt: number, t: number, ambient = 0.1): void {
    this.faunaPlugin.night = Math.max(0, Math.min(1, (0.42 - ambient) / 0.24));
    this.frame++;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      let v = this.map.get(a.id);
      if (!v) { const nv = this.create(a); if (!nv) continue; v = nv; this.map.set(a.id, v); }
      v.seen = this.frame;
      const on = a.visible && a.alpha > 0.004 && !this.hidden.has(a.id);
      if (v.root.isEnabled() !== on) v.root.setEnabled(on);
      const wantGlow = on && a.lightOn && a.kind === 'npc';
      if (wantGlow && !v.glow) v.glow = this.c.glow.get('white');
      else if (!wantGlow && v.glow) { this.c.glow.release(v.glow); v.glow = null; }
      if (!on) continue;
      v.root.position.set(a.pos.x, a.pos.y, a.pos.z);
      v.root.rotation.y = a.heading;
      v.upd(a, dt, t);
      v.fade(a.alpha, a);
      if (v.glow) {
        const s = Math.sin(a.heading), co = Math.cos(a.heading);
        v.glow.position.set(a.pos.x + 0.25 * co + 0.55 * s, a.pos.y + 1.22, a.pos.z - 0.25 * s + 0.55 * co);
        v.glow.scaling.setAll(0.55 * a.alpha);
      }
    }
    if (this.map.size > actors.length || this.frame % 30 === 0)
      for (const [id, v] of this.map) if (v.seen !== this.frame) { this.kill(v); this.map.delete(id); }
  }
  private kill(v: AV): void { if (v.glow) this.c.glow.release(v.glow); for (const m of v.meshes) m.dispose(); v.root.dispose(); }
  dispose(): void { for (const v of this.map.values()) this.kill(v); this.map.clear(); }

  private create(a: ActorView): AV | null {
    if (a.kind === 'phenomenon' || (a.kind === 'anomaly' && a.archetype === 'light')) return null;
    const c = this.c, M = c.mats, hs = Math.abs(hashStr(a.id, 29));
    const root = new TransformNode('actor.' + a.id, c.scene);
    root.parent = this.root;
    const meshes: Mesh[] = [];
    const out = (g: Geo, parent: TransformNode = root, mat: StandardMaterial = a.kind === 'fauna' ? this.faunaMat : M.vc): Mesh => { const m = g.build('actor', c.scene, mat, parent); meshes.push(m); return m; };
    const piv = (x: number, y: number, z: number, parent: TransformNode = root): TransformNode => { const n = new TransformNode('ap', c.scene); n.parent = parent; n.position.set(x, y, z); return n; };
    const plain = (al: number) => { for (const m of meshes) m.visibility = al; };
    let phase = (hs % 100) / 16, sw = 0;
    const g = new Geo(hs);

    if (a.kind === 'encounter') {
      const ar = a.archetype;
      if (ar === 'watcher') {
        // Piccolo uomo in cappotto e cappello: nessun bagliore o segnale luminoso.
        g.frustum(0, 0, 0.22, 0.42, 0.29, 1.04, 0.35, 0.21, 0x111318)
          .cyl(0, 1.1, 0, 0.045, 0.045, 0.12, 0x796d5b, 'y', 6)
          .sphere(0, 1.21, 0, 0.11, 0.145, 0.105, 0x8b806c)
          .box(0, 1.25, 0.092, 0.16, 0.04, 0.025, 0x101015)
          .cyl(0, 1.34, 0, 0.21, 0.21, 0.035, 0x13151a, 'y', 10)
          .cyl(0, 1.4, 0, 0.125, 0.105, 0.13, 0x17191e, 'y', 8);
        for (const s of [-1, 1]) g.beam([s * 0.2, 1, 0], [s * 0.23, 0.42, 0], 0.09, 0x111318)
          .box(s * 0.085, 0.17, 0, 0.1, 0.32, 0.12, 0x101114).box(s * 0.085, 0.04, 0.04, 0.12, 0.08, 0.22, 0x090a0c);
        out(g);
        return { root, meshes, seen: 0, glow: null, fade: plain, upd: (v, dt, t) => {
          if (v.moving) phase += dt * 6;
          root.position.y += v.moving ? Math.abs(Math.sin(phase)) * 0.025 : Math.sin(t * 0.8 + hs) * 0.003;
        } };
      }
      if (ar === 'ufo_wreck') {
        const hull = piv(0, 0.7, 0); hull.rotation.z = 0.19; hull.rotation.x = -0.12;
        g.sphere(0, 0, 0, 4.8, 0.55, 3.7, 0x484c50, 16, 4)
          .sphere(0.15, 0.45, -0.15, 1.8, 0.85, 1.55, 0x25343a, 12, 5)
          .cyl(0, -0.35, 0, 2.5, 3.5, 0.4, 0x222629, 'y', 14);
        out(g, hull);
        const tear = new Geo(hs); tear.box(1.6, 0.25, 2.45, 1.8, 0.15, 1.1, 0x080a0c)
          .beam([1, 0.3, 2], [1.8, 1.2, 3.2], 0.16, 0x687477)
          .beam([2.1, 0.2, 2], [2.8, 0.8, 2.6], 0.12, 0x687477);
        out(tear, hull);
        for (let i = 0; i < 7; i++) {
          const d = new Geo(hs + i), angle = i * 2.4, r = 4.8 + i * 0.25;
          d.push().tr(Math.sin(angle) * r, 0.08, Math.cos(angle) * r).ry(angle).box(0, 0, 0, 0.6, 0.08, 0.9, 0x383e40).pop(); out(d);
        }
        const lamps = new Geo(1);
        for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; lamps.box(Math.sin(an) * 4.4, 0, Math.cos(an) * 3.4, 0.18, 0.08, 0.16, 0x66b6a8); }
        const lens = out(lamps, hull, M.greenOn);
        return { root, meshes, seen: 0, glow: null, fade: plain, upd: (_a, _dt, t) => { lens.visibility = 0.15 + 0.6 * Math.max(0, Math.sin(t * 1.7 + hs)); } };
      }
      if (ar === 'alien_tents') {
        for (const s of [-1, 1]) {
          g.push().tr(s * 2.4, 0, 0).ry(s * 0.3);
          g.tri([-1.3, 0, -1.7], [1.3, 0, -1.7], [0, 1.7, -1.7], 0x292e23)
            .tri([-1.3, 0, 1.7], [0, 1.7, 1.7], [1.3, 0, 1.7], 0x151811)
            .quad([-1.3, 0, -1.7], [0, 1.7, -1.7], [0, 1.7, 1.7], [-1.3, 0, 1.7], 0x424b35)
            .quad([0, 1.7, -1.7], [1.3, 0, -1.7], [1.3, 0, 1.7], [0, 1.7, 1.7], 0x353c2b).pop();
        }
        g.box(0, 0.32, 0.5, 1.2, 0.64, 0.8, 0x363c40).box(0, 0.68, 0.5, 0.75, 0.08, 0.5, 0x111b18); out(g);
        const device = new Geo(1); device.box(0, 0.74, 0.5, 0.36, 0.04, 0.24, 0x77bbaa); out(device, root, M.greenOn);
        return { root, meshes, seen: 0, glow: null, fade: plain, upd: () => {} };
      }
      if (ar === 'ritual_site') {
        // Un rito inventato: pietre, corde e candele, senza simboli di religioni reali.
        g.box(0, 0.4, 0, 1.2, 0.8, 0.8, 0x30302c).box(0, 0.82, 0, 1.5, 0.08, 1, 0x4d171b);
        for (let i = 0; i < 9; i++) {
          const angle = i * Math.PI * 2 / 9, next = (i + 1) * Math.PI * 2 / 9, x = Math.sin(angle) * 3, z = Math.cos(angle) * 3;
          g.sphere(x, 0.12, z, 0.3, 0.15, 0.25, 0x53514a).cyl(x, 0.35, z, 0.05, 0.045, 0.4, 0xb29c70, 'y', 6)
            .beam([x, 0.04, z], [Math.sin(next) * 3, 0.04, Math.cos(next) * 3], 0.025, 0x8a7060);
          const f = new Geo(i); f.sphere(x, 0.61, z, 0.035, 0.09, 0.035, 0xffc075, 5, 3); out(f, root, M.flame);
        }
        out(g); return { root, meshes, seen: 0, glow: null, fade: plain, upd: () => {} };
      }
      const big = ar === 'bigfoot', cult = ar === 'cultist', skin = big ? 0x29221b : cult ? 0x17121b : ar === 'alien_green' ? 0x557b44 : 0x777e7d;
      if (big) {
        g.sphere(0, 1.48, 0, 0.58, 0.75, 0.34, skin).sphere(0, 2.04, 0, 0.59, 0.3, 0.37, skin)
          .sphere(0, 2.38, 0.04, 0.25, 0.34, 0.25, skin).sphere(0, 2.35, 0.23, 0.18, 0.18, 0.09, 0x3c3025)
          .box(0, 2.45, 0.24, 0.34, 0.07, 0.08, 0x1c1611);
      } else if (cult) {
        g.frustum(0, 0, 0.12, 0.8, 0.55, 1.45, 0.4, 0.28, skin)
          .sphere(0, 1.69, 0, 0.2, 0.28, 0.2, 0x241b27)
          .sphere(0, 1.7, 0.16, 0.115, 0.14, 0.04, 0x080609)
          .box(0, 1.1, 0.18, 0.07, 0.68, 0.04, 0x5e2429);
      } else {
        g.sphere(0, 1.05, 0, 0.17, 0.37, 0.12, skin).sphere(0, 1.68, 0, 0.24, 0.31, 0.2, skin)
          .sphere(-0.1, 1.7, 0.17, 0.085, 0.11, 0.035, 0x060909).sphere(0.1, 1.7, 0.17, 0.085, 0.11, 0.035, 0x060909)
          .box(0, 1.52, 0.18, 0.07, 0.008, 0.01, 0x252d26);
      }
      out(g);
      const limbs: TransformNode[] = [];
      for (const side of [-1, 1]) for (const leg of [true, false]) {
        const p = piv(side * (leg ? big ? 0.24 : 0.1 : big ? 0.61 : cult ? 0.28 : 0.22), leg ? big ? 1 : 0.82 : big ? 2 : 1.35, 0);
        const q = new Geo(hs), len = leg ? big ? 1 : 0.8 : big ? 1.5 : 0.75, w = big ? leg ? 0.27 : 0.24 : cult ? 0.17 : 0.065;
        q.beam([0, 0, 0], [side * (leg ? 0 : 0.06), -len, 0], w, skin, w * 0.9);
        q.sphere(0, -len, leg ? 0.1 : 0, w * 0.6, w * 0.35, leg ? w : w * 0.6, skin);
        out(q, p); limbs.push(p);
      }
      return { root, meshes, seen: 0, glow: null, fade: plain, upd: (v, dt, t) => {
        if (v.moving) phase += dt * (v.archetype === 'bigfoot' ? 6 : 8);
        sw += ((v.moving ? 1 : 0) - sw) * Math.min(1, dt * 7);
        for (let i = 0; i < limbs.length; i++) limbs[i].rotation.x = Math.sin(phase + (i < 2 ? 0 : Math.PI)) * (i % 2 === 0 ? 0.6 : -0.5) * sw;
        if (!big && !v.moving) {
          limbs[1].rotation.x = -0.65 + Math.sin(t * 0.9 + hs) * 0.2;
          limbs[3].rotation.x = -0.65 + Math.sin(t * 0.9 + hs + 0.4) * 0.2;
        }
        root.position.y += Math.abs(Math.cos(phase)) * (big ? 0.06 : 0.025) * sw;
      } };
    }

    if (a.kind === 'npc') {
      const jk = JACKET[hs % 6], pt = PANTS[(hs >> 3) % 3], sk = SKIN[(hs >> 5) % 4], hat = JACKET[(hs >> 7) % 6], ar = a.archetype;
      g.box(0, 0.97, 0, 0.34, 0.2, 0.2, pt).box(0, 1.27, 0, 0.4, 0.46, 0.23, jk).box(0, 1.47, 0, 0.44, 0.08, 0.22, jk).cyl(0, 1.53, 0, 0.05, 0.05, 0.08, sk, 'y', 6);
      g.sphere(0, 1.64, 0, 0.1, 0.125, 0.11, sk).box(0, 1.63, 0.105, 0.03, 0.04, 0.03, sk);
      if (ar === 'hiker') g.sphere(0, 1.7, -0.01, 0.108, 0.075, 0.118, hat).box(0, 1.69, 0.12, 0.16, 0.015, 0.1, hat).box(0, 1.25, -0.22, 0.34, 0.52, 0.22, 0x4a5a3a).cyl(0, 1.56, -0.22, 0.08, 0.08, 0.4, 0x35506e, 'x', 7).box(0, 1.1, -0.34, 0.24, 0.2, 0.05, 0x35402a);
      else if (ar === 'camper') g.sphere(0, 1.7, -0.01, 0.11, 0.09, 0.12, hat).box(0, 1.1, 0, 0.42, 0.14, 0.25, jk);
      else if (ar === 'resident') g.sphere(0, 1.71, -0.02, 0.105, 0.06, 0.115, 0x3a3a3c).box(0, 1.7, 0.11, 0.15, 0.015, 0.09, 0x3a3a3c).box(0, 1.2, 0.118, 0.03, 0.4, 0.01, mixDark(jk));
      else g.sphere(0, 1.7, -0.02, 0.104, 0.07, 0.112, 0x2a2018);
      out(g);
      const limb = (x: number, y: number, leg: boolean, right: boolean): TransformNode => {
        const p = piv(x, y, 0), q = new Geo(hs + (right ? 1 : 2));
        if (leg) q.box(0, -0.44, 0, 0.15, 0.88, 0.17, pt).box(0, -0.84, 0.04, 0.16, 0.1, 0.27, 0x1c1a18);
        else { q.box(0, -0.29, 0, 0.11, 0.6, 0.12, jk).sphere(0, -0.63, 0, 0.05, 0.06, 0.05, sk); if (right) q.cyl(0, -0.66, 0.07, 0.022, 0.03, 0.16, 0x1a1a1a, 'z', 6); }
        out(q, p);
        return p;
      };
      const lL = limb(-0.1, 0.9, true, false), lR = limb(0.1, 0.9, true, true), aL = limb(-0.26, 1.48, false, false), aR = limb(0.26, 1.48, false, true);
      const tq = new Geo(1); tq.jit = 0; tq.cyl(0, -0.66, 0.155, 0.03, 0.03, 0.012, 0xffffff, 'z', 6);
      const lens = out(tq, aR, M.headOn);
      return { root, meshes, seen: 0, glow: null, fade: plain, upd: (v, dt, t) => {
        if (v.moving) phase += dt * 7.2;
        sw += ((v.moving ? 1 : 0) - sw) * Math.min(1, dt * 6);
        const s = Math.sin(phase) * 0.62 * sw, idle = Math.sin(t * 1.3 + hs) * 0.03;
        lL.rotation.x = s; lR.rotation.x = -s; aL.rotation.x = -s * 0.7 + idle;
        aR.rotation.x = v.lightOn ? -0.95 + idle : s * 0.7 - idle;
        root.position.y += Math.abs(Math.cos(phase)) * 0.025 * sw;
        lens.setEnabled(v.lightOn);
      } };
    }

    if (a.kind === 'fauna') {
      if (a.archetype === 'owl' || a.archetype === 'nightbird') {
        const nb = a.archetype === 'nightbird';
        if (nb) g.sphere(0, 0.15, -0.02, 0.085, 0.13, 0.15, 0x2a2622).sphere(0, 0.31, 0.06, 0.075, 0.07, 0.08, 0x342e28).box(0, 0.1, -0.2, 0.09, 0.012, 0.16, 0x1e1b18);
        else g.sphere(0, 0.17, 0, 0.11, 0.17, 0.1, 0x5a4a3a).sphere(0, 0.37, 0.01, 0.1, 0.09, 0.09, 0x6a5a48).sphere(0, 0.15, 0.06, 0.08, 0.12, 0.06, 0x8a7a62, 6, 4);
        for (const s of [-1, 1]) { if (!nb) g.cyl(s * 0.06, 0.47, 0, 0.025, 0, 0.07, 0x4a3a2c, 'y', 4); g.box(s * 0.04, 0.0, 0.04, 0.03, 0.03, 0.06, 0x8a7a3a); }
        g.cyl(0, 0.34, 0.1, 0.015, 0, 0.03, 0x3a3020, 'z', 4);
        out(g);
        const e = new Geo(1); e.jit = 0;
        for (const s of [-1, 1]) e.cyl(s * 0.042, 0.385, 0.088, 0.02, 0.02, 0.006, 0xffffff, 'z', 6);
        out(e); // occhi riflettenti solo quando illuminati, nessuna emissione nel buio
        return { root, meshes, seen: 0, glow: null, fade: plain, upd: (_v, _dt, t) => { root.rotation.y += Math.sin(t * 0.37 + hs) * 0.5; } };
      }
      if (a.archetype === 'crows') {
        const bg = new Geo(1), wg = new Geo(2), birds: { n: TransformNode; wl: TransformNode; wr: TransformNode }[] = [];
        bg.sphere(0, 0, 0, 0.05, 0.045, 0.12, 0x0c0c10, 6, 4).sphere(0, 0.03, 0.12, 0.035, 0.035, 0.04, 0x0c0c10, 6, 4).cyl(0, 0.025, 0.17, 0.012, 0, 0.05, 0x1a1a1a, 'z', 4).box(0, 0, -0.15, 0.06, 0.008, 0.1, 0x0c0c10);
        wg.box(0.12, 0, 0, 0.24, 0.008, 0.11, 0x0e0e12).box(0.27, 0, -0.02, 0.1, 0.006, 0.07, 0x0e0e12);
        const b0 = out(bg), w0 = out(wg);
        b0.setEnabled(false); w0.setEnabled(false);
        for (let i = 0; i < 5; i++) {
          const n = piv(0, 0, 0), wl = piv(0, 0.01, 0, n), wr = piv(0, 0.01, 0, n);
          wr.scaling.x = -1;
          const b = b0.clone('crow', n), l = w0.clone('crowW', wr), r = w0.clone('crowW', wl);
          for (const m of [b, l, r]) { m.setEnabled(true); m.isPickable = false; meshes.push(m); }
          birds.push({ n, wl, wr });
        }
        return { root, meshes, seen: 0, glow: null, fade: plain, upd: (v, _dt, t) => {
          root.rotation.y = 0;
          for (let i = 0; i < 5; i++) {
            const b = birds[i], ph = t * (0.8 + i * 0.07) + i * 1.3 + hs;
            if (v.moving) {
              const r = 1.6 + i * 0.5;
              b.n.position.set(Math.cos(ph) * r, 1.6 + i * 0.35 + Math.sin(ph * 1.7) * 0.4, Math.sin(ph) * r);
              b.n.rotation.set(0, -ph, 0);
              const f = Math.sin(t * 13 + i * 2) * 0.85;
              b.wl.rotation.z = f; b.wr.rotation.z = -f;
            } else {
              b.n.position.set(Math.cos(i * 1.9 + hs) * (0.5 + i * 0.3), 0.06, Math.sin(i * 1.9 + hs) * (0.5 + i * 0.3));
              b.n.rotation.set(Math.max(0, Math.sin(t * 2.2 + i * 2)) * 0.6, i * 1.4 + hs, 0);
              b.wl.rotation.z = -1.35; b.wr.rotation.z = 1.35;
            }
          }
        } };
      }
      // quadrupedi
      const P = a.archetype === 'deer' ? { len: 1.2, bh: 0.42, bw: 0.34, leg: 0.8, nu: 0.5, nf: 0.2, hl: 0.3, col: 0x6b5138 }
        : a.archetype === 'raccoon' ? { len: 0.46, bh: 0.24, bw: 0.24, leg: 0.13, nu: 0.06, nf: 0.07, hl: 0.16, col: 0x6a6a66 }
        : a.archetype === 'rabbit' ? { len: 0.3, bh: 0.17, bw: 0.15, leg: 0.07, nu: 0.07, nf: 0.03, hl: 0.12, col: hs % 3 ? 0x8a7558 : 0x6e6258 }
        : { len: 0.62, bh: 0.2, bw: 0.17, leg: 0.27, nu: 0.12, nf: 0.1, hl: 0.19, col: 0xa5552a };
      const body = piv(0, 0, 0), y = P.leg + P.bh / 2, hz = P.len / 2 + P.nf, hy = y + P.nu + P.bh * 0.2, dk = mixDark(P.col);
      g.sphere(0, y, 0, P.bw / 2, P.bh / 2, P.len / 2, P.col).beam([0, y + P.bh * 0.15, P.len * 0.38], [0, hy, hz], P.bw * 0.5, P.col);
      g.sphere(0, hy + 0.02, hz + P.hl * 0.25, P.bw * 0.36, P.hl * 0.36, P.hl * 0.5, P.col, 6, 4).box(0, hy - 0.01, hz + P.hl * 0.72, P.bw * 0.26, P.hl * 0.24, P.hl * 0.4, a.archetype === 'raccoon' ? 0x1c1c1c : dk);
      for (const s of [-1, 1]) g.cyl(s * P.bw * 0.26, hy + P.hl * 0.42, hz + P.hl * 0.05, P.hl * 0.14, 0, P.hl * 0.42, dk, 'y', 4);
      if (a.archetype === 'deer') {
        g.sphere(0, y + 0.1, -P.len / 2 - 0.02, 0.06, 0.08, 0.05, 0xd8d2c0, 5, 3);
        if (hs % 2) for (const s of [-1, 1]) g.beam([s * 0.06, hy + 0.12, hz], [s * 0.2, hy + 0.48, hz - 0.08], 0.025, 0x8a7a62).beam([s * 0.14, hy + 0.3, hz - 0.04], [s * 0.24, hy + 0.36, hz + 0.1], 0.02, 0x8a7a62);
      } else if (a.archetype === 'raccoon') {
        g.box(0, hy + 0.03, hz + P.hl * 0.42, P.bw * 0.6, 0.035, 0.03, 0x1c1c1c);
        for (let i = 0; i < 5; i++) g.cyl(0, y + 0.02 - i * 0.01, -P.len / 2 - 0.04 - i * 0.055, 0.05 - i * 0.004, 0.05 - i * 0.004, 0.055, i % 2 ? 0x1c1c1c : 0x8a8a84, 'z', 6);
      } else if (a.archetype === 'rabbit') {
        for (const s of [-1, 1]) g.beam([s * 0.03, hy + 0.04, hz], [s * 0.045, hy + 0.2, hz - 0.05], 0.03, dk);
        g.sphere(0, y + 0.03, -P.len / 2 - 0.02, 0.045, 0.045, 0.04, 0xe8e4da, 5, 3).sphere(0, y - 0.02, -P.len * 0.22, P.bw * 0.56, P.bh * 0.56, P.len * 0.3, P.col, 6, 4);
      } else g.sphere(0, y + 0.02, -P.len / 2 - 0.2, 0.075, 0.075, 0.24, P.col, 6, 4).sphere(0, y + 0.02, -P.len / 2 - 0.42, 0.05, 0.05, 0.07, 0xe6e2d6, 5, 3);
      out(g, body);
      const pair = (k: number): TransformNode => {
        const p = piv(0, P.leg + P.bh * 0.2, 0, body), q = new Geo(hs + k), lw = Math.max(0.035, P.bw * 0.2);
        q.box(k * P.bw * 0.3, -(P.leg + P.bh * 0.2) / 2, P.len * 0.36, lw, P.leg + P.bh * 0.2, lw, dk).box(-k * P.bw * 0.3, -(P.leg + P.bh * 0.2) / 2, -P.len * 0.36, lw, P.leg + P.bh * 0.2, lw, dk);
        out(q, p);
        return p;
      };
      const pa = pair(1), pb = pair(-1);
      return { root, meshes, seen: 0, glow: null, fade: plain, upd: (v, dt) => {
        const rabbit = a.archetype === 'rabbit';
        if (v.moving) phase += dt * (a.archetype === 'deer' ? 7 : rabbit ? 15 : 12);
        sw += ((v.moving ? 1 : 0) - sw) * Math.min(1, dt * 6);
        const s = Math.sin(phase) * 0.5 * sw;
        if (rabbit) { // salti: le due coppie di zampe spingono insieme e il corpo si alza
          pa.rotation.x = s; pb.rotation.x = s;
          body.position.y = Math.abs(Math.sin(phase * 0.5)) * 0.2 * sw;
          body.rotation.x = -Math.cos(phase) * 0.22 * sw;
          return;
        }
        pa.rotation.x = s; pb.rotation.x = -s;
        body.position.y = Math.abs(Math.sin(phase)) * 0.035 * sw * (P.leg + 0.3);
      } };
    }

    if (a.kind === 'illusion') {
      g.jit = 0;
      g.cyl(0, 0.7, 0, 0.21, 0.17, 1.4, 0, 'y', 8).sphere(0, 1.37, 0, 0.27, 0.11, 0.15, 0).sphere(0, 1.6, 0, 0.11, 0.13, 0.11, 0).beam([0.24, 1.32, 0], [0.27, 0.72, 0.02], 0.09, 0);
      const dark = out(g, root, M.black);
      const s = new Geo(hs), bark = 0x4a3d2e;
      s.jit = 0.14;
      s.cyl(0, 0.62, 0, 0.26, 0.17, 1.24, bark, 'y', 8).cyl(0, 0.08, 0, 0.36, 0.26, 0.16, bark, 'y', 8);
      s.cyl(0, 1.45, 0, 0.11, 0.02, 0.45, 0x8a7352, 'y', 5).cyl(-0.09, 1.33, 0.04, 0.07, 0, 0.26, 0x8a7352, 'y', 4).cyl(0.08, 1.3, -0.05, 0.06, 0, 0.2, 0x7a6548, 'y', 4);
      s.beam([0.18, 1.2, 0], [0.42, 1.38, 0.05], 0.08, bark).beam([0.42, 1.38, 0.05], [0.5, 1.3, 0.2], 0.03, bark);
      s.sphere(0.26, 0.95, 0.03, 0.16, 0.3, 0.16, 0x3f5236, 6, 4).sphere(-0.22, 0.3, 0.1, 0.24, 0.22, 0.22, 0x36482f, 6, 4).sphere(0.25, 0.22, -0.15, 0.2, 0.18, 0.2, 0x3f5236, 6, 4).sphere(-0.1, 1.02, -0.12, 0.1, 0.06, 0.1, 0x55643a, 5, 3);
      const stump = out(s);
      return { root, meshes, seen: 0, glow: null, upd: () => {}, fade: (al, v) => {
        const r = v.reveal < 0 ? 0 : v.reveal > 1 ? 1 : v.reveal;
        dark.visibility = al * (1 - r); stump.visibility = al * r;
        dark.setEnabled(r < 0.995); stump.setEnabled(r > 0.005);
      } };
    }

    // anomalie: figura o massa indistinta
    g.jit = 0;
    if (a.archetype === 'figure') {
      for (const s of [-1, 1]) g.beam([s * 0.075, 0, 0], [s * 0.085, 1.32, 0], 0.09, 0).beam([s * 0.27, 2.0, 0], [s * 0.31, 0.82, 0.02], 0.06, 0);
      g.beam([0, 1.3, 0], [0, 2.02, 0], 0.26, 0, 0.14).box(0, 2.0, 0, 0.54, 0.08, 0.14, 0).cyl(0, 2.12, 0, 0.035, 0.035, 0.18, 0, 'y', 6).sphere(0, 2.31, 0, 0.085, 0.135, 0.09, 0);
      out(g, root, M.black);
      return { root, meshes, seen: 0, glow: null, fade: plain, upd: (_v, _dt, t) => { root.rotation.z = Math.sin(t * 0.4 + hs) * 0.012; } };
    }
    g.sphere(0, 0.5, 0, 0.8, 0.5, 0.6, 0).sphere(0.3, 0.8, 0.1, 0.4, 0.4, 0.4, 0).sphere(-0.4, 0.62, -0.1, 0.5, 0.45, 0.5, 0).sphere(0, 1.02, 0, 0.3, 0.35, 0.3, 0);
    out(g, root, M.black);
    return { root, meshes, seen: 0, glow: null, fade: plain, upd: (_v, _dt, t) => { const k = 1 + Math.sin(t * 0.8 + hs) * 0.04; root.scaling.set(k, 2 - k, k); } };
  }
}

function mixDark(hex: number): number {
  return ((((hex >> 16) & 255) * 0.62) << 16) | ((((hex >> 8) & 255) * 0.62) << 8) | ((hex & 255) * 0.62);
}

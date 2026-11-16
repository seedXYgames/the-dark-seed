// Renderer di strutture, oggetti interattivi e attori. Terreno, cielo, acqua e meteo sono di un altro modulo.
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { BuildingSpec, GraphicsSettings, Lang, ObjState, SessionState, WorldObjectSpec } from '../core/contracts';
import type { ActorView, ExtremeRenderState, IWorldObjectsRenderer, SkyState, Vec3Like } from '../core/api';
import type { WorldModel } from '../world/model';
import { isLampLit, isObjectAvailable, objectPose } from '../sim/objects';
import { type Ctx, type GlowKind, GlowPool, Mats } from './meshUtil';
import {
  cabinWallSegments, choosePick, DOOR_H, driftOffset, hashNum, hashState, hashStr, type LightCand, type Obb, type PickHit,
  pickProxyLocal, rayObb, selectNearestLit, wallFaceZ,
} from './objMath';
import { type Built, buildBuilding, buildPlatform } from './buildings';
import { buildProp, type PropVis, structKey } from './props';
import { buildInspect } from './items';
import { ActorsRenderer } from './actors';

interface GlowDef { kind: GlowKind; lx: number; ly: number; lz: number; size: number; mode: number; amp: number }
interface Drifter { n: TransformNode; h: number }
interface Occ { box: Obb; door: Rec | null }
interface Group {
  node: TransformNode; cx: number; cz: number; r: number; built: boolean; active: boolean; always: boolean;
  recs: Rec[]; blds: BuildingSpec[]; plats: number[]; parts: Built[]; drifters: Drifter[]; occ: Occ[];
}
interface Rec {
  o: WorldObjectSpec; grp: Group; idx: number; hid: number; h: number; sk: string; dyn: boolean; glowCap: boolean;
  vis: PropVis | null; root: TransformNode | null; drift: TransformNode | null;
  avail: boolean; lit: boolean; doorOpen: boolean; ticking: boolean; placed: boolean;
  x: number; z: number; rot: number; tx: number; tz: number; trot: number;
  box: Obb | null; prio: number; b?: BuildingSpec; wf: number;
  defs: GlowDef[]; glows: (InstancedMesh | null)[]; flick: number;
  cand: LightCand | null; lInt: number; lCol: number;
}

const D = (kind: GlowKind, lx: number, ly: number, lz: number, size: number, mode = 0, amp = 0): GlowDef => ({ kind, lx, ly, lz, size, mode, amp });
const NO_DEFS: GlowDef[] = [];
const LIGHT_COLS: [number, number, number][] = [[1, 0.74, 0.44], [1, 0.55, 0.25], [0.92, 0.94, 1]];

export class WorldObjectsRenderer implements IWorldObjectsRenderer {
  private c: Ctx;
  private rootNode: TransformNode;
  private groups: Group[] = [];
  private grpById = new Map<string, Group>();
  private misc: Group;
  private recs: Rec[] = [];
  private recById = new Map<string, Rec>();
  private bldBuilt = new Map<string, Built>();
  private ticking: Rec[] = [];
  private glowRecs: Rec[] = [];
  private lightRecs: Rec[] = [];
  private lights: PointLight[] = [];
  private lightKeys: string[] = [];
  private lightOf: (Rec | null)[] = [null, null, null, null];
  private lightTimer = 0; private grpTimer = 0; private time = 0;
  private lang: Lang = 'it';
  private dynCount = 0; private dynLast = '';
  private inspecting: string | null = null;
  private actors: ActorsRenderer;
  private hits: PickHit[] = [];
  private nHits = 0;
  private extremeOn = false; private decomp = 0; private exT = 0; private exSeed = 0;
  private tmp = [0, 0, 0, 0, 0, 0];
  private state: SessionState | null = null;
  private byId = (id: string): WorldObjectSpec | undefined => this.recById.get(id)?.o;

  constructor(scene: Scene, private model: WorldModel, gfx: GraphicsSettings, addShadowCaster?: (mesh: AbstractMesh) => void) {
    const spec = model.spec;
    const glow = new GlowPool(scene);
    this.c = { scene, mats: new Mats(scene), glow, gfx, shadow: (m) => { if (addShadowCaster) addShadowCaster(m); }, heightAt: (x, z) => model.heightAt(x, z), seed: spec.seed };
    this.rootNode = new TransformNode('worldObjects', scene);
    const mk = (id: string, cx: number, cz: number, always: boolean): Group => {
      const node = new TransformNode('grp.' + id, scene);
      node.parent = this.rootNode; node.setEnabled(always);
      const g: Group = { node, cx, cz, r: 12, built: false, active: always, always, recs: [], blds: [], plats: [], parts: [], drifters: [], occ: [] };
      this.groups.push(g); this.grpById.set(id, g);
      return g;
    };
    this.misc = mk('~misc', 0, 0, true);
    for (const p of spec.pois) mk(p.id, p.pos.x, p.pos.z, false).r = Math.max(12, p.radius);
    const grow = (g: Group, x: number, z: number, ext: number) => { if (!g.always) g.r = Math.max(g.r, Math.hypot(x - g.cx, z - g.cz) + ext); };
    for (const b of spec.buildings) {
      const g = this.grpById.get(b.poiId) ?? this.misc;
      g.blds.push(b); grow(g, b.pos.x, b.pos.z, Math.hypot(b.w, b.d) / 2 + 2);
      const cy = b.floorY + b.h / 2 - 0.2, hy = b.h / 2 + 0.25;
      for (const s of cabinWallSegments(b)) {
        const cs = Math.cos(b.rotY), sn = Math.sin(b.rotY);
        g.occ.push({ box: { cx: b.pos.x + s.lx * cs + s.lz * sn, cy, cz: b.pos.z - s.lx * sn + s.lz * cs, hx: s.hx, hy, hz: s.hz, rot: b.rotY }, door: s.door ? ({ id: b.doorId } as unknown as Rec) : null });
        if (s.door) g.occ.push({ box: { cx: b.pos.x + s.lx * cs + s.lz * sn, cy: b.floorY + (DOOR_H + b.h) / 2, cz: b.pos.z - s.lx * sn + s.lz * cs, hx: s.hx, hy: (b.h - DOOR_H) / 2, hz: s.hz, rot: b.rotY }, door: null });
      }
    }
    model.platforms.forEach((p, i) => {
      if (p.kind === 'floor') return;
      const poiId = p.kind === 'bridge' ? spec.bridges.find((b) => b.id === p.id)?.poiId : p.id.replace(/\.pier$/, '');
      const g = (poiId && this.grpById.get(poiId)) || this.misc;
      g.plats.push(i); grow(g, p.cx, p.cz, Math.hypot(p.hx, p.hz) + 2);
    });
    for (const o of spec.objects) this.addRec(o, false);
    // collega i collisori-porta al relativo oggetto
    for (const g of this.groups) for (const oc of g.occ) if (oc.door) oc.door = this.recById.get((oc.door as unknown as { id: string }).id) ?? null;
    for (let i = 0; i < 4; i++) {
      const l = new PointLight('obj.light' + i, new Vector3(0, -1000, 0), scene);
      l.range = 16; l.intensity = 0; l.setEnabled(false);
      l.specular.set(0.1, 0.1, 0.1);
      this.lights.push(l); this.lightKeys.push('');
    }
    this.actors = new ActorsRenderer(this.c, this.rootNode);
    this.applySettings(gfx);
  }

  private addRec(o: WorldObjectSpec, dyn: boolean): Rec {
    const grp = this.grpById.get(o.poiId) ?? this.misc;
    const b = o.buildingId ? this.model.buildingById.get(o.buildingId) : undefined;
    const k = o.kind;
    const r: Rec = {
      o, grp, idx: this.recs.length, hid: hashStr(o.id, 5), h: NaN, sk: '', dyn, glowCap: k === 'lamp' || k === 'lamp_post' || k === 'campfire' || k === 'vehicle' || k === 'police_car',
      vis: null, root: null, drift: null, avail: false, lit: false, doorOpen: false, ticking: false, placed: false,
      x: o.pos.x, z: o.pos.z, rot: o.rotY, tx: o.pos.x, tz: o.pos.z, trot: o.rotY, box: null, prio: 0, b,
      wf: b && (k === 'switch' || k === 'panel' || k === 'lamp') ? wallFaceZ(o.pos.x, o.pos.z, b) : 0,
      defs: NO_DEFS, glows: [], flick: 0, cand: null, lInt: 0, lCol: 0,
    };
    this.recs.push(r); this.recById.set(o.id, r); grp.recs.push(r);
    if (!grp.always) grp.r = Math.max(grp.r, Math.hypot(o.pos.x - grp.cx, o.pos.z - grp.cz) + 4);
    return r;
  }
  private dropVis(r: Rec): void {
    if (r.vis) {
      for (const m of r.vis.meshes) m.dispose();
      for (const n of r.vis.nodes) n.dispose();
      for (const m of r.vis.own) { this.c.mats.unregister(m); m.diffuseTexture?.dispose(); m.dispose(); }
      r.vis = null;
    }
  }
  private removeRec(r: Rec): void {
    this.dropVis(r);
    if (r.drift) { const i = r.grp.drifters.findIndex((d) => d.n === r.drift); if (i >= 0) r.grp.drifters.splice(i, 1); }
    r.root?.dispose(); r.root = null; r.drift = null;
    this.setGlows(r, NO_DEFS);
    r.cand = null; r.avail = false; r.box = null;
    this.recById.delete(r.o.id);
    r.grp.recs.splice(r.grp.recs.indexOf(r), 1);
    const i = this.recs.indexOf(r);
    this.recs.splice(i, 1);
    for (let j = i; j < this.recs.length; j++) this.recs[j].idx = j;
    let k = this.ticking.indexOf(r); if (k >= 0) this.ticking.splice(k, 1);
    k = this.lightRecs.indexOf(r); if (k >= 0) this.lightRecs.splice(k, 1);
  }

  private buildGroup(g: Group): void {
    g.built = true;
    for (const b of g.blds) {
      const bt = buildBuilding(this.c, b, g.node);
      g.parts.push(bt); g.drifters.push({ n: bt.drift, h: hashStr(b.id, 9) });
      this.bldBuilt.set(b.id, bt);
      if (bt.win && b.litWindows) bt.win.material = this.c.mats.winLit;
    }
    for (const i of g.plats) {
      const p = this.model.platforms[i], bt = buildPlatform(this.c, p, g.node);
      g.parts.push(bt); g.drifters.push({ n: bt.drift, h: hashStr(p.id, 9) });
    }
    for (const r of g.recs) r.h = NaN;
  }

  private setGlows(r: Rec, defs: GlowDef[]): void {
    const had = r.glows.length > 0;
    for (const gl of r.glows) if (gl) this.c.glow.release(gl);
    r.glows.length = 0;
    r.defs = defs;
    for (const d of defs) r.glows.push(this.c.glow.get(d.kind));
    if (defs.length && !had) this.glowRecs.push(r);
    else if (!defs.length && had) this.glowRecs.splice(this.glowRecs.indexOf(r), 1);
    this.placeGlows(r, 1);
  }
  private placeGlows(r: Rec, k: number): void {
    const cs = Math.cos(r.rot), sn = Math.sin(r.rot);
    for (let i = 0; i < r.defs.length; i++) {
      const gl = r.glows[i], d = r.defs[i];
      if (!gl) continue;
      gl.position.set(r.x + d.lx * cs + d.lz * sn, r.o.y + d.ly, r.z - d.lx * sn + d.lz * cs);
      gl.scaling.setAll(d.size * k);
    }
  }

  /** Aloni e sorgente luminosa candidata per lo stato corrente. */
  private lightState(r: Rec, st: ObjState | undefined): void {
    let defs = NO_DEFS, li = 0, lc = 0, lx = 0, ly = 0, lz = 0;
    const low = this.c.gfx.quality === 'low';
    if (st && r.avail) {
      switch (r.o.kind) {
        case 'lamp': if (r.lit) {
          const fm = Number(st.flicker ?? 0) > 0 ? 1 : 0, fa = Number(st.flicker ?? 0);
          if (st.type === 'ceiling') { defs = [D('warm', 0, -0.12, 0, 1.5, fm, fa)]; li = 1.1; ly = -0.3; }
          else if (st.type === 'lantern') { defs = [D('warm', 0, 0.14, 0, 1.1, fm, fa)]; li = 0.8; ly = 0.3; }
          else if (st.type === 'canopy') { defs = low ? [D('white', 0, -0.1, 0, 2.2, fm, fa)] : [D('white', -2.4, -0.1, 0, 1.7, fm, fa), D('white', 0, -0.1, 0, 1.7, fm, fa), D('white', 2.4, -0.1, 0, 1.7, fm, fa)]; li = 1.4; lc = 2; ly = -0.5; }
          else { defs = [D('warm', 0, -0.07, 0, 1.4, fm, fa)]; li = 0.95; ly = -0.2; lz = 0.15; }
        } break;
        case 'lamp_post': if (r.lit) { defs = [D('warm', 0, 4.03, 0.62, 2.1, Number(st.flicker ?? 0) > 0 ? 1 : 0, Number(st.flicker ?? 0))]; li = 1.3; ly = 3.8; lz = 0.62; } break;
        case 'campfire': {
          const fy = st.grill ? 0.9 : 0.15;
          if (st.state === 'burning') { defs = [D('fire', 0, fy + 0.25, 0, 2.6, 3)]; li = 1.2; lc = 1; ly = fy + 0.5; }
          else if (st.state === 'embers') defs = [D('red', 0, fy, 0, 0.75, 2, 0.12)];
          break;
        }
        case 'vehicle': if (st.lights) defs = [D('white', -0.62, 0.66, 2.26, 1.2), D('white', 0.62, 0.66, 2.26, 1.2)]; break;
        case 'police_car': {
          const d: GlowDef[] = [];
          if (st.headlights) { d.push(D('white', -0.62, 0.66, 2.26, 1.3), D('white', 0.62, 0.66, 2.26, 1.3)); li = 1.1; lc = 2; ly = 0.9; lz = 3.6; }
          if (st.beacon) { d.push(D('amber', -0.6, 1.58, -0.25, 0.55, 2, 0.22)); if (!low) d.push(D('amber', 0.6, 1.58, -0.25, 0.55, 2, 0.22)); }
          if (d.length) defs = d;
          break;
        }
      }
    }
    r.flick = st ? Number(st.flicker ?? 0) : 0;
    this.setGlows(r, defs);
    const had = !!r.cand;
    if (li > 0) {
      const cs = Math.cos(r.rot), sn = Math.sin(r.rot);
      if (!r.cand) r.cand = { key: r.o.id, x: 0, y: 0, z: 0 };
      r.cand.x = r.x + lx * cs + lz * sn; r.cand.y = r.o.y + ly; r.cand.z = r.z - lx * sn + lz * cs;
      r.lInt = li; r.lCol = lc;
      if (!had) this.lightRecs.push(r);
    } else if (had) { r.cand = null; this.lightRecs.splice(this.lightRecs.indexOf(r), 1); }
  }

  private poseTarget(r: Rec, state: SessionState): void {
    const o = r.o;
    if (o.id in state.objectPos) { const p = objectPose(state, o); r.tx = p.x; r.tz = p.z; r.trot = p.rotY; }
    else { r.tx = o.pos.x; r.tz = o.pos.z; r.trot = o.rotY; }
    if (o.containerId) { // nel bagagliaio l'oggetto sta sul fondo del vano, più avanti del punto logico
      const cr = this.recById.get(o.containerId);
      if (cr && cr.o.kind === 'car_trunk') { r.tx += Math.sin(cr.trot) * 0.8; r.tz += Math.cos(cr.trot) * 0.8; }
    }
  }

  private refresh(r: Rec, state: SessionState, st: ObjState | undefined): void {
    const o = r.o;
    r.avail = !!st && this.inspecting !== o.id && isObjectAvailable(state, o, this.byId);
    r.lit = (o.kind === 'lamp' || o.kind === 'lamp_post') && isLampLit(state, o);
    r.doorOpen = !!st && st.state === 'open';
    this.poseTarget(r, state);
    const far = Math.hypot(r.tx - r.x, r.tz - r.z) > 6;
    if (!r.placed || !r.grp.active || far || !r.avail) { r.x = r.tx; r.z = r.tz; r.rot = r.trot; r.placed = true; }
    const lb = st ? pickProxyLocal(o.kind, st, r.wf) : null;
    if (lb && r.avail) {
      const cs = Math.cos(r.trot), sn = Math.sin(r.trot);
      if (!r.box) r.box = { cx: 0, cy: 0, cz: 0, hx: 0, hy: 0, hz: 0, rot: 0 };
      r.box.cx = r.tx + lb.ox * cs + lb.oz * sn; r.box.cz = r.tz - lb.ox * sn + lb.oz * cs; r.box.cy = o.y + lb.oy;
      r.box.hx = lb.hx; r.box.hy = lb.hy; r.box.hz = lb.hz; r.box.rot = r.trot; r.prio = lb.prio;
    } else r.box = null;
    this.lightState(r, st);
    if (o.kind === 'lamp' && o.buildingId && st && st.type === 'ceiling') {
      const bt = this.bldBuilt.get(o.buildingId);
      if (bt?.win) bt.win.material = r.lit ? this.c.mats.winLit : this.c.mats.winDark;
    }
    if (!r.grp.built || !st) { r.root?.setEnabled(false); return; }
    if (!r.root) {
      r.root = new TransformNode('obj.' + o.id, this.c.scene); r.root.parent = r.grp.node;
      r.drift = new TransformNode('objd', this.c.scene); r.drift.parent = r.root;
      r.grp.drifters.push({ n: r.drift, h: r.hid });
    }
    const sk = structKey(o, st, this.lang);
    if (!r.vis || sk !== r.sk) {
      this.dropVis(r);
      r.sk = sk;
      const ox = o.pos.x, oz = o.pos.z, oy = o.y, rot = o.rotY, cs = Math.cos(rot), sn = Math.sin(rot);
      r.vis = buildProp(this.c, o, st, r.drift!, { b: r.b, lang: this.lang, wf: r.wf, gy: (lx, lz) => this.model.heightAt(ox + lx * cs + lz * sn, oz - lx * sn + lz * cs) - oy });
      r.vis.set(st, r.lit, true);
    } else r.vis.set(st, r.lit, false);
    r.root.setEnabled(r.avail);
    r.root.position.set(r.x, o.y, r.z); r.root.rotation.y = r.rot;
    if (!r.ticking) { r.ticking = true; this.ticking.push(r); }
  }

  sync(state: SessionState, actors: ActorView[], camPos: Vec3Like, dt: number, _sky: SkyState): void {
    this.state = state;
    this.time += dt;
    if (state.lang !== this.lang) { this.lang = state.lang; for (const r of this.recs) if (r.o.kind === 'sign') r.h = NaN; }
    // oggetti creati o rimossi durante il turno
    const dy = state.dynamicObjects, last = dy.length ? dy[dy.length - 1].id : '';
    if (dy.length !== this.dynCount || last !== this.dynLast) {
      this.dynCount = dy.length; this.dynLast = last;
      const ids = new Set<string>();
      for (const o of dy) { ids.add(o.id); if (!this.recById.has(o.id)) this.addRec(o, true); }
      for (let i = this.recs.length - 1; i >= 0; i--) if (this.recs[i].dyn && !ids.has(this.recs[i].o.id)) this.removeRec(this.recs[i]);
    }
    // gruppi per POI entro la distanza di disegno
    this.grpTimer -= dt;
    if (this.grpTimer <= 0) {
      this.grpTimer = 0.2;
      const dd = this.c.gfx.drawDistance;
      for (const g of this.groups) {
        if (g.always) { if (!g.built) this.buildGroup(g); continue; }
        const act = Math.hypot(camPos.x - g.cx, camPos.z - g.cz) - g.r < dd * (g.active ? 1.08 : 1);
        if (act !== g.active) { g.active = act; g.node.setEnabled(act); }
        if (act && !g.built) this.buildGroup(g);
      }
    }
    const objs = state.objects, pos = state.objectPos;
    for (let i = 0; i < this.recs.length; i++) {
      const r = this.recs[i];
      if (!r.grp.active && !r.glowCap) continue;
      const o = r.o, st = objs[o.id];
      let h = hashState(st);
      if (st) {
        if (o.kind === 'lamp' || o.kind === 'lamp_post') h = Math.imul(h, 31) + (isLampLit(state, o) ? 1 : 2);
        if (o.containerId || st.taken !== undefined) h = Math.imul(h, 31) + (isObjectAvailable(state, o, this.byId) ? 3 : 4);
        const p = pos[o.id];
        if (p) h = hashNum(p.rotY, hashNum(p.z, hashNum(p.x, h)));
        if (r.grp.active) h = Math.imul(h, 31) + 7;
      }
      if (h !== r.h) { r.h = h; this.refresh(r, state, st); }
    }
    // animazioni e spostamenti in corso
    for (let i = this.ticking.length - 1; i >= 0; i--) {
      const r = this.ticking[i];
      let more = r.vis && r.grp.active ? r.vis.tick(dt, this.time) : false;
      if (r.x !== r.tx || r.z !== r.tz || r.rot !== r.trot) {
        const k = Math.min(1, dt * 5);
        let dr = r.trot - r.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.rot += dr * k;
        if (Math.abs(r.tx - r.x) + Math.abs(r.tz - r.z) + Math.abs(dr) < 0.004) { r.x = r.tx; r.z = r.tz; r.rot = r.trot; } else more = true;
        if (r.root) { r.root.position.set(r.x, r.o.y, r.z); r.root.rotation.y = r.rot; }
        this.placeGlows(r, 1);
      }
      if (!more) { r.ticking = false; this.ticking[i] = this.ticking[this.ticking.length - 1]; this.ticking.pop(); }
    }
    // aloni con variazione (tremolio, pulsazione, fuoco)
    const t = this.time;
    for (let i = 0; i < this.glowRecs.length; i++) {
      const r = this.glowRecs[i];
      for (let j = 0; j < r.defs.length; j++) {
        const d = r.defs[j], gl = r.glows[j];
        if (!gl || d.mode === 0) continue;
        let k = 1;
        if (d.mode === 1) k = 1 - d.amp * (0.35 + 0.65 * Math.abs(Math.sin(t * 31 + r.hid) * Math.sin(t * 7.3 + j)));
        else if (d.mode === 2) k = 1 + d.amp * Math.sin(t * 1.6 + r.hid + j * 0.4);
        else k = 0.85 + 0.15 * Math.sin(t * 11 + r.hid) + 0.1 * Math.sin(t * 27.1);
        gl.scaling.setAll(d.size * k);
      }
    }
    this.updateLights(camPos, dt);
    this.actors.sync(actors, dt, t);
    if (this.extremeOn && this.decomp > 0) this.applyDecompose();
  }

  private cands: LightCand[] = [];
  private updateLights(cam: Vec3Like, dt: number): void {
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.3;
      this.cands.length = 0;
      for (const r of this.lightRecs) if (r.cand && Math.abs(r.cand.x - cam.x) < 70 && Math.abs(r.cand.z - cam.z) < 70) this.cands.push(r.cand);
      const chosen = selectNearestLit(this.cands, cam, this.lightKeys, 4);
      for (let i = 0; i < 4; i++) if (this.lightKeys[i] && !chosen.includes(this.lightKeys[i])) { this.lightKeys[i] = ''; this.lightOf[i] = null; }
      for (const k of chosen) {
        if (this.lightKeys.includes(k)) continue;
        const slot = this.lightKeys.indexOf('');
        if (slot < 0) break;
        const r = this.recById.get(k) ?? null;
        this.lightKeys[slot] = k; this.lightOf[slot] = r;
        if (r && r.cand) {
          const l = this.lights[slot], cc = LIGHT_COLS[r.lCol];
          l.position.set(r.cand.x, r.cand.y, r.cand.z); l.diffuse.set(cc[0], cc[1], cc[2]); l.intensity = 0; l.setEnabled(true);
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      const l = this.lights[i], r = this.lightOf[i];
      let target = 0;
      if (r && r.cand) {
        target = r.lInt;
        if (r.lCol === 1) target *= 0.85 + 0.15 * Math.sin(this.time * 11 + r.hid) + 0.08 * Math.sin(this.time * 27.1);
        else if (r.flick > 0) target *= 1 - r.flick * (0.35 + 0.65 * Math.abs(Math.sin(this.time * 31 + r.hid) * Math.sin(this.time * 7.3)));
        l.position.set(r.cand.x, r.cand.y, r.cand.z);
      } else if (r) { this.lightOf[i] = null; this.lightKeys[i] = ''; }
      l.intensity += (target - l.intensity) * Math.min(1, dt * 8);
      if (!this.lightOf[i] && l.intensity < 0.01 && l.isEnabled()) { l.intensity = 0; l.setEnabled(false); }
    }
  }

  private applyDecompose(): void {
    const o = this.tmp;
    for (const g of this.groups) {
      if (!g.active || !g.built) continue;
      for (const d of g.drifters) {
        driftOffset(this.exSeed, d.h, this.exT, this.decomp, o);
        d.n.position.set(o[0], o[1], o[2]); d.n.rotation.set(o[3], o[4], o[5]);
      }
    }
  }

  pickObject(origin: Vec3Like, dir: Vec3Like, maxDist: number): { objectId: string; distance: number } | null {
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1, dx = dir.x / l, dy = dir.y / l, dz = dir.z / l;
    let occT = maxDist;
    this.nHits = 0;
    for (const g of this.groups) {
      if (!g.active || (!g.always && Math.hypot(origin.x - g.cx, origin.z - g.cz) > g.r + maxDist + 2)) continue;
      for (const oc of g.occ) {
        if (oc.door && oc.door.doorOpen) continue;
        const t = rayObb(origin.x, origin.y, origin.z, dx, dy, dz, oc.box, occT);
        if (t < occT) occT = t;
      }
      for (const r of g.recs) {
        const b = r.box;
        if (!b || !r.avail) continue;
        const reach = maxDist + b.hx + b.hz + b.hy;
        if (Math.abs(b.cx - origin.x) > reach || Math.abs(b.cz - origin.z) > reach) continue;
        const t = rayObb(origin.x, origin.y, origin.z, dx, dy, dz, b, maxDist);
        if (t === Infinity) continue;
        if (this.nHits === this.hits.length) this.hits.push({ t: 0, prio: 0, idx: 0 });
        const h = this.hits[this.nHits++];
        h.t = t; h.prio = r.prio; h.idx = r.idx;
      }
    }
    const view = this.hits.length === this.nHits ? this.hits : this.hits.slice(0, this.nHits);
    const best = choosePick(view, occT + 0.012);
    return best ? { objectId: this.recs[best.idx].o.id, distance: best.t } : null;
  }

  createInspectMesh(objectId: string): Mesh | null {
    const r = this.recById.get(objectId);
    if (!r || (r.o.kind !== 'item' && r.o.kind !== 'battery')) return null;
    const mesh = buildInspect(this.c, r.o, this.state?.lang ?? this.lang, this.model.spec);
    this.inspecting = objectId; r.h = NaN;
    mesh.onDisposeObservable.add(() => { if (this.inspecting === objectId) this.inspecting = null; r.h = NaN; });
    return mesh;
  }

  setActorHidden(actorId: string, hidden: boolean): void { this.actors.setHidden(actorId, hidden); }

  setExtreme(state: ExtremeRenderState): void {
    const on = state.active;
    this.c.mats.strip(on ? Math.max(0, Math.min(1, state.strip)) : 0);
    const was = this.extremeOn && this.decomp > 0;
    this.extremeOn = on; this.decomp = on ? Math.max(0, Math.min(1, state.decompose)) : 0; this.exT = state.t; this.exSeed = state.seed | 0;
    if (was && !(on && this.decomp > 0)) // ripristino esatto
      for (const g of this.groups) for (const d of g.drifters) { d.n.position.set(0, 0, 0); d.n.rotation.set(0, 0, 0); }
  }

  applySettings(gfx: GraphicsSettings): void {
    const q = this.c.gfx.quality;
    this.c.gfx = gfx;
    this.c.glow.max = gfx.quality === 'low' ? 28 : gfx.quality === 'high' ? 110 : 60;
    this.grpTimer = 0;
    if (q !== gfx.quality) for (const r of this.recs) if (r.glowCap) r.h = NaN;
  }

  dispose(): void {
    this.actors.dispose();
    for (const r of this.recs) { this.dropVis(r); for (const gl of r.glows) if (gl) this.c.glow.release(gl); }
    for (const l of this.lights) l.dispose();
    this.rootNode.dispose(false, false);
    this.c.glow.dispose();
    this.c.mats.dispose();
    this.recs.length = 0; this.recById.clear(); this.groups.length = 0; this.ticking.length = 0; this.glowRecs.length = 0; this.lightRecs.length = 0;
  }
}

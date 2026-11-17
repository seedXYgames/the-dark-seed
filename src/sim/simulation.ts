// Simulazione autonoma del mondo: PNG con routine, fauna, fenomeni ambientali, anomalie costruite da
// primitive di capacità, illusioni percettive, deriva sottile, misteri nel tempo, SMS inattesi, evento estremo.
// Logica pura e deterministica: dipende solo da SimHost, dagli stream PRNG e dal passo fisso.
import type { ActorView, ExtremeRenderState, Facts, LocalAlterations, SpontaneousKind } from '../core/api';
import type {
  ActorKind, ActorState, AnomalyCapability, CapabilityId, ObjectKind, RoutineStep, Vec2, WorldEvent, WorldObjectSpec,
} from '../core/contracts';
import { WORLD_HALF } from '../core/contracts';
import { clamp, smoothstep, type Rng } from '../core/rng';
import { EXTREME_IDLE, extremeAudioAt, extremeStateAt, makeExtremePlan } from './extreme';
import type { ISimulation, SimFactory, SimHost } from './host';
import { isLampLit } from './objects';
import { Encounters } from './encounters';
import { Watcher } from './watcher';
import { DREAD_HUSH, DreadDirector } from './dread';
import { MysteryMoodDirector } from './mysteryMood';

const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
const bearing = (from: Vec2, to: Vec2) => DIRS[((Math.round(Math.atan2(to.x - from.x, to.z - from.z) / (Math.PI / 4)) % 8) + 8) % 8];
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const LIMIT = WORLD_HALF - 20;
const ANOM_COLORS: [number, number, number][] = [[1, 0.86, 0.62], [0.62, 0.8, 1], [0.72, 1, 0.82], [1, 0.52, 0.42], [0.92, 0.92, 1]];
const ALTER_PROPS: NonNullable<AnomalyCapability['property']>[] = ['rain_up', 'shadow_skew', 'reflection_shift', 'audio_displace', 'dust_float', 'compass_spin'];
const DRIFT_KINDS: ObjectKind[] = ['chair', 'sign', 'door', 'lamp', 'lamp_post', 'cooler'];
export const MAX_DRIFT = 6;

interface PlannedSms { t: number; kind: SpontaneousKind; done?: boolean }

export class Simulation implements ISimulation {
  private readonly encounters: Encounters;
  private readonly watcher: Watcher;
  private readonly dread: DreadDirector;
  private readonly mood: MysteryMoodDirector;
  private readonly st;
  private readonly model;
  private readonly spec;
  private readonly rNpc: Rng; private readonly rFauna: Rng; private readonly rAnom: Rng; private readonly rEnv: Rng;
  private readonly rDrift: Rng; private readonly rSms: Rng; private readonly rIll: Rng;
  private logCursor = 0;
  private envT = 3; private driftT = 60; private slowT = 0;
  private driftCount = 0;
  private alter: LocalAlterations = { rainUp: 0, shadowSkew: 0, reflectionShift: 0, dustFloat: 0, lights: [] };
  private inter = { torch: 0, phone: 0, gps: 0 };
  private hush: { pos: Vec2; radius: number; strength: number }[] = [];
  private loud: { pos: Vec2; t: number }[] = [];
  private smsPlan: PlannedSms[] = [];
  private calls: { t: number; evId: number; pos: Vec2; sound?: string; subject?: string }[] = [];
  private wasPrecip = false; private wasFog = false; private garbledSent = false;
  private thunderT = 40; private vehicleT: number;
  private lampFaults: { id: string; until: number }[] = [];
  private illusionSounds = 0;
  private readonly rSky: Rng;
  private skyT: number; private skyN = 0;
  /** Luce non identificata che attraversa il cielo: tratta a tre tempi (arrivo, eventuale sosta, uscita). */
  private skyObj: { t0: number; p0: [number, number, number]; v1: [number, number, number]; t1: number; hold: number; v2: [number, number, number]; dur: number; color: [number, number, number]; radius: number; id: string } | null = null;
  private readonly doorOpen = (id: string) => this.st.objects[id]?.state === 'open';

  constructor(private readonly h: SimHost) {
    this.st = h.state; this.model = h.model; this.spec = h.spec;
    this.rNpc = h.rng('npc'); this.rFauna = h.rng('fauna'); this.rAnom = h.rng('anomaly'); this.rEnv = h.rng('environment');
    this.rDrift = h.rng('drift'); this.rSms = h.rng('sms'); this.rIll = h.rng('illusion');
    this.vehicleT = this.rEnv.range(90, 400);
    this.rSky = this.rEnv.fork('sky'); this.skyT = this.rSky.range(150, 800);
    this.spawnNpcs(); this.spawnFauna(); this.spawnAnomalies(); this.spawnIllusions(); this.planSms();
    this.encounters = new Encounters(h);
    this.watcher = new Watcher(h);
    this.dread = new DreadDirector(h);
    this.mood = new MysteryMoodDirector(h);
    if (this.st.extreme.predisposed && !this.st.extreme.plan) this.st.extreme.plan = makeExtremePlan(this.st.seed);
    const w = h.weather();
    this.wasPrecip = w.precip > 0.25; this.wasFog = w.fog > 0.55;
  }

  // ---------------------------------------------------------------- creazione attori

  private actor(id: string, kind: ActorKind, archetype: string, pos: Vec2, o: Partial<ActorState> = {}): ActorState {
    const a: ActorState = {
      id, kind, archetype, pos: { x: pos.x, z: pos.z }, heading: 0, goal: '', routine: [], stepIndex: 0, stepTimer: 0, state: 'idle', speed: 1.3,
      present: true, visible: true, lightOn: false, percepts: [], knowledge: [], capabilities: [], drives: {}, photographable: true,
      ownsObjectIds: [], cooldown: 0, nextThink: 0, data: {}, ...o,
    };
    this.st.actors.push(a);
    return a;
  }

  private spot(rng: Rng, c: Vec2, rMin: number, rMax: number, wantForest = false): Vec2 | null {
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(rMin, rMax);
      const x = clamp(c.x + Math.sin(a) * r, -LIMIT, LIMIT), z = clamp(c.z + Math.cos(a) * r, -LIMIT, LIMIT);
      if (this.model.blockedAt(x, z) || this.model.waterDepthAt(x, z) > 0 || this.model.platformAt(x, z)) continue;
      if (wantForest && i < 9 && this.model.forestDensityAt(x, z) < 0.25) continue;
      return { x, z };
    }
    return null;
  }

  private usable(poiId: string, kinds: ObjectKind[]): WorldObjectSpec | undefined {
    const list = this.h.objects({ poiId }).filter((o) => kinds.includes(o.kind) && !o.essential && !o.containerId && !o.buildingId);
    return list.length ? this.rNpc.pick(list) : undefined;
  }

  private spawnNpcs() {
    const r = this.rNpc, entry = this.spec.entry.id;
    const byType = (...t: string[]) => this.spec.pois.filter((p) => t.includes(p.type));
    const count = r.weighted([0, 1, 2, 3], (n) => [0.12, 0.4, 0.32, 0.16][n]);
    const kinds = r.shuffle(['hiker', 'camper', 'motorist', 'resident', 'hiker']);
    const use = (poiId: string, kinds: ObjectKind[]): RoutineStep[] => { const o = this.usable(poiId, kinds); return o ? [{ act: 'use', objectId: o.id, poiId }] : []; };
    for (let i = 0; i < count; i++) {
      const arch = kinds[i], id = `npc${i + 1}`;
      const others = this.spec.pois.filter((p) => p.type !== 'car_park');
      let routine: RoutineStep[] = [], goal = 'walking', home: string | undefined, startAt: string = entry, present = false;
      if (arch === 'camper' && byType('campsite').length) {
        const camp = r.pick(byType('campsite')); home = camp.id; startAt = camp.id; present = true; goal = 'camping';
        const side = byType('restroom', 'picnic', 'lake_dock');
        routine = [{ act: 'wait', duration: r.range(80, 360) }, ...use(camp.id, ['chair', 'cooler']), { act: 'wander', poiId: camp.id, duration: r.range(40, 90) }];
        if (side.length) { const s = r.pick(side); routine.push({ act: 'goto', poiId: s.id }, { act: 'wait', duration: r.range(50, 160) }, { act: 'goto', poiId: camp.id }); }
        routine.push({ act: 'wait', duration: r.range(300, 900) }, { act: 'wander', poiId: camp.id, duration: 60 }, { act: 'wait', duration: 4000 });
      } else if (arch === 'motorist' && byType('gas_station', 'roadside').length) {
        const g = r.pick(byType('gas_station', 'roadside')); goal = 'to_gas';
        routine = [{ act: 'dormant', duration: r.range(60, 900) }, { act: 'goto', poiId: g.id }, { act: 'wait', duration: r.range(60, 220) }, ...use(g.id, ['bin', 'chair']), { act: 'leave' }];
      } else if (arch === 'resident' && byType('town', 'cabin').length) {
        const t = r.pick(byType('town', 'cabin')); home = t.id; goal = 'going_home';
        routine = [{ act: 'dormant', duration: r.range(30, 700) }, { act: 'goto', poiId: t.id }, ...use(t.id, ['door', 'switch']), { act: 'wait', duration: r.range(120, 400) }, ...use(t.id, ['switch', 'generator', 'chair']),
          { act: 'wander', poiId: t.id, duration: r.range(40, 120) }, { act: 'wait', duration: 4000 }];
      } else if (others.length) {
        const a = r.pick(others), lake = byType('lake_dock');
        if (lake.length && r.chance(0.35)) { goal = 'watching_lake'; routine = [{ act: 'dormant', duration: r.range(20, 500) }, { act: 'goto', poiId: lake[0].id }, { act: 'wait', duration: r.range(200, 600) }, { act: 'leave' }]; }
        else {
          const b = r.pick(others); goal = r.chance(0.5) ? 'crossing' : 'walking';
          routine = [{ act: 'dormant', duration: r.range(20, 800) }, { act: 'goto', poiId: a.id }, { act: 'wait', duration: r.range(40, 200) }, ...use(a.id, ['bin', 'chair', 'cooler'])];
          if (b.id !== a.id) routine.push({ act: 'goto', poiId: b.id }, { act: 'wait', duration: r.range(40, 240) });
          routine.push({ act: 'leave' });
        }
      } else continue;
      const p0 = this.model.nodePos.get(startAt) ?? this.spec.entry.pos;
      const pos = present ? this.spot(r, p0, 3, 9) ?? p0 : p0;
      const a = this.actor(id, 'npc', arch === 'camper' || arch === 'motorist' || arch === 'resident' ? arch : 'hiker', pos, { goal, routine, homePoiId: home, present, speed: r.range(1.15, 1.5), name: '' });
      a.data.node = startAt; a.data.saw = 'nothing';
      a.stepTimer = routine[0].duration ?? 0;
      a.state = routine[0].act;
    }
  }

  private spawnFauna() {
    const r = this.rFauna, centre = { x: 0, z: 0 }, spawn = this.spec.playerSpawn.pos;
    const far = (p: Vec2 | null) => (p && dist(p, spawn) > 70 ? p : null);
    let n = 0;
    const herd = far(this.spot(r, centre, 80, WORLD_HALF - 80, true));
    if (herd) for (let i = r.int(2, 4); i > 0; i--) { const p = this.spot(r, herd, 2, 14) ?? herd; const a = this.actor(`fauna${++n}`, 'fauna', 'deer', p, { speed: 1.1 }); a.data.hx = herd.x; a.data.hz = herd.z; a.stepTimer = r.range(2, 30); }
    if (r.chance(0.7)) { const p = far(this.spot(r, centre, 100, WORLD_HALF - 60, true)); if (p) { const a = this.actor(`fauna${++n}`, 'fauna', 'fox', p, { speed: 2.1 }); a.data.hx = p.x; a.data.hz = p.z; a.data.callT = r.range(120, 600); } }
    const bins = this.h.objects({ kind: 'bin' });
    for (let i = r.int(0, Math.min(2, bins.length)); i > 0; i--) {
      const bin = r.pick(bins), p = this.spot(r, bin.pos, 25, 60, true);
      if (!p) continue;
      const a = this.actor(`fauna${++n}`, 'fauna', 'raccoon', p, { speed: 1.6 });
      a.data.hx = p.x; a.data.hz = p.z; a.data.bin = bin.id; a.data.raidT = r.range(150, 1100); a.ownsObjectIds = [bin.id];
    }
    const trees = this.model.trees, nt = Math.floor(trees.length / 5);
    const perch = (arch: string, count: number) => {
      for (let i = 0, tries = 0; i < count && nt > 0 && tries < count * 12; tries++) {
        const k = r.int(0, nt - 1), p = { x: trees[k * 5], z: trees[k * 5 + 1] };
        if (Math.abs(p.x) > LIMIT || Math.abs(p.z) > LIMIT) continue; // alberi oltre il confine della mappa
        i++;
        const a = this.actor(`fauna${++n}`, 'fauna', arch, p, { state: 'perch' });
        a.data.y = r.range(4.5, 8); a.data.callT = r.range(40, 400);
      }
    };
    perch('owl', r.int(2, 4)); perch('crows', r.int(1, 2)); perch('nightbird', r.int(1, 3));
    // conigli: piccole colonie sparse, brucano vicino alla tana
    const rr = r.fork('rabbits');
    for (let c = rr.int(4, 7); c > 0; c--) {
      const warren = far(this.spot(rr, centre, 40, WORLD_HALF - 60));
      if (!warren) continue;
      for (let i = rr.int(2, 4); i > 0; i--) {
        const p = this.spot(rr, warren, 1, 9) ?? warren;
        const a = this.actor(`fauna${++n}`, 'fauna', 'rabbit', p, { speed: 0.8 });
        a.data.hx = warren.x; a.data.hz = warren.z; a.stepTimer = rr.range(2, 25); a.heading = rr.range(0, 6.28);
      }
    }
  }

  private spawnAnomalies() {
    const r = this.rAnom;
    const count = r.weighted([0, 1, 2], (n) => [0.3, 0.45, 0.25][n]);
    const all: CapabilityId[] = ['light', 'motion', 'audio', 'appear', 'vanish', 'interfere', 'alter_local', 'displace', 'perceptual'];
    for (let i = 0; i < count; i++) {
      const ids = r.shuffle([...all]).slice(0, r.int(2, 4));
      const caps: AnomalyCapability[] = ids.map((id) => ({ id, intensity: r.range(0.3, 1), property: id === 'alter_local' ? r.pick(ALTER_PROPS) : undefined }));
      const has = (c: CapabilityId) => ids.includes(c);
      const arch = has('appear') ? (r.chance(0.75) ? 'figure' : 'mass') : has('light') ? 'light' : 'presence';
      const zones = this.spec.zones.filter((z) => z.kind === 'isolated' || z.kind === 'dense' || z.kind === 'clearing');
      const home = zones.length ? r.pick(zones).pos : this.spot(r, { x: 0, z: 0 }, 100, WORLD_HALF - 100) ?? { x: 0, z: 0 };
      const a = this.actor(`anom${i + 1}`, 'anomaly', arch, home, {
        present: false, visible: false, capabilities: caps, state: 'dormant', speed: r.range(0.4, 1.6),
        drives: { curiosity: r.next(), shyness: r.next(), territorial: r.next(), restless: r.next() },
        photographable: !has('perceptual') && r.chance(0.7),
      });
      a.stepTimer = r.range(120, 900);
      const c = r.pick(ANOM_COLORS);
      Object.assign(a.data, { hx: home.x, hz: home.z, c0: c[0], c1: c[1], c2: c[2], y: arch === 'light' ? r.range(1.4, 4) : 0, alpha: 0, lookT: 0 });
    }
  }

  private spawnIllusions() {
    const r = this.rIll, edges = this.spec.edges.filter((e) => e.kind === 'trail' && e.points.length > 3);
    if (!edges.length) return;
    for (let i = r.int(2, 4), n = 0; i > 0; i--) {
      const e = r.pick(edges), k = r.int(1, e.points.length - 2), p = e.points[k], q = e.points[k + 1];
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, side = r.chance(0.5) ? 1 : -1, off = r.range(5, 9);
      const pos = { x: p.x - (dz / l) * off * side, z: p.z + (dx / l) * off * side };
      if (this.model.blockedAt(pos.x, pos.z) || this.model.waterDepthAt(pos.x, pos.z) > 0 || this.model.pathMaskAt(pos.x, pos.z) > 0.2 || this.model.nearestPoi(pos).dist < 40) continue;
      const a = this.actor(`ill${++n}`, 'illusion', 'stump', pos, { heading: r.range(0, 6.28), photographable: true, state: 'still' });
      a.data.reveal = 0;
    }
  }

  private planSms() {
    const r = this.rSms, n = r.int(2, 4);
    const kinds: [SpontaneousKind, number][] = [['banter', 3], ['checkin', 2], ['citizen_call', 1.5], ['false_report', 1], ['wrong_number', 0.8], ['carrier', 0.6], ['contradiction', 0.6], ['garbled', 0.3], ['future_self', 0.05]];
    let t = r.range(120, 320);
    for (let i = 0; i < n; i++) { this.smsPlan.push({ t, kind: r.weighted(kinds, (k) => k[1])[0] }); t += r.range(150, 480); }
  }

  // ---------------------------------------------------------------- passo

  step(dt: number): void {
    const st = this.st;
    if (st.ended || st.abandoned) return;
    this.processLog();
    for (const a of st.actors) {
      a.data.moving = false;
      if (a.cooldown > 0) a.cooldown -= dt;
      if (a.kind === 'npc') this.stepNpc(a, dt);
      else if (a.kind === 'fauna') this.stepFauna(a, dt);
      else if (a.kind === 'anomaly') this.stepAnomaly(a, dt);
      else if (a.kind === 'illusion') this.stepIllusion(a, dt);
      else if (a.kind === 'phenomenon') { a.stepTimer -= dt; if (a.stepTimer <= 0) { a.present = false; a.visible = false; a.lightOn = false; } }
    }
    this.encounters.step(dt);
    this.watcher.step(dt);
    const t0 = this.st.time;
    const preHush = this.st.mysteries.some((m) => m.timeline.some((e) => !e.done && e.t > t0 && e.t - t0 <= DREAD_HUSH));
    this.dread.step(dt, preHush);
    this.mood.step(dt);
    if (st.ended) return;
    this.stepSky(dt);
    this.envT -= dt;
    if (this.envT <= 0) { this.envT = 5; this.stepEnvironment(5); }
    this.driftT -= dt;
    if (this.driftT <= 0) { this.driftT = 45; this.stepDrift(); }
    this.slowT -= dt;
    if (this.slowT <= 0) { this.slowT = 1; this.stepMysteries(); this.stepSms(); this.stepExtreme(); this.refreshFields(); }
  }

  // ---------------------------------------------------------------- cielo

  /** Ogni tanto, a cielo abbastanza sgombro, una luce attraversa la notte: nessun suono, nessuna spiegazione. */
  private stepSky(dt: number) {
    const st = this.st, r = this.rSky;
    if (this.skyObj) { if (st.time - this.skyObj.t0 >= this.skyObj.dur) this.skyObj = null; this.skyLight(); return; }
    this.skyT -= dt;
    if (this.skyT > 0) return;
    const w = this.h.weather();
    if (this.h.sky().ambient > 0.4 || w.cloud > 0.72 || w.fog > 0.5) { this.skyT = r.range(60, 180); return; }
    this.skyT = r.range(420, 1300);
    const pl = st.player.pos, y0 = this.model.groundAt(pl.x, pl.z);
    const a0 = r.range(0, Math.PI * 2), d0 = r.range(520, 820), alt = r.range(230, 430);
    const p0: [number, number, number] = [pl.x + Math.sin(a0) * d0, y0 + alt, pl.z + Math.cos(a0) * d0];
    // punta a un punto che passa a 120–380 m dal giocatore
    const miss = r.range(120, 380) * (r.chance(0.5) ? 1 : -1), tx = pl.x + Math.cos(a0) * miss, tz = pl.z - Math.sin(a0) * miss;
    const len = Math.hypot(tx - p0[0], tz - p0[2]) || 1, speed = r.range(70, 150);
    const v1: [number, number, number] = [((tx - p0[0]) / len) * speed, r.range(-4, 4), ((tz - p0[2]) / len) * speed];
    const mode = r.pick(['straight', 'straight', 'stop', 'turn'] as const);
    const t1 = (len / speed) * r.range(0.85, 1.1), hold = mode === 'stop' ? r.range(2, 4.5) : 0;
    let v2 = v1, tail = len / speed;
    if (mode !== 'straight') {
      const turn = r.range(0.9, 2.0) * (r.chance(0.5) ? 1 : -1), c = Math.cos(turn), s = Math.sin(turn), k = mode === 'stop' ? r.range(2.5, 4) : 1.3;
      v2 = [(v1[0] * c - v1[2] * s) * k, r.range(8, 40), (v1[0] * s + v1[2] * c) * k];
      tail = mode === 'stop' ? r.range(3, 5) : r.range(5, 8);
    }
    const color = r.pick([[0.85, 0.92, 1], [1, 0.82, 0.55], [0.7, 1, 0.85], [1, 0.6, 0.5]] as [number, number, number][]);
    this.skyObj = { t0: st.time, p0, v1, t1, hold, v2, dur: t1 + hold + tail, color, radius: r.range(14, 24), id: `sky${++this.skyN}` };
    const ev = this.h.emit({ type: 'sky_light', pos: { x: tx, z: tz }, origin: 'environment', radius: 0, props: { mode, altitude: Math.round(alt) }, tags: ['sky', 'unidentified'] });
    if (!st.player.indoors) ev.perceivedByPlayer = true;
    this.skyLight();
  }

  /** Aggiorna (o toglie) la luce del cielo nelle alterazioni correnti, a ogni passo. */
  private skyLight() {
    const L = this.alter.lights, i = L.findIndex((l) => l.id.startsWith('sky'));
    if (i >= 0) L.splice(i, 1);
    const o = this.skyObj;
    if (!o) return;
    const t = this.st.time - o.t0, ta = Math.min(t, o.t1), tb = Math.max(0, t - o.t1 - o.hold);
    const moving = t < o.t1 ? o.v1 : tb > 0 ? o.v2 : null;
    const fade = smoothstep(0, 1.2, t) * (1 - smoothstep(o.dur - 1.2, o.dur, t));
    L.unshift({
      id: o.id, pos: { x: o.p0[0] + o.v1[0] * ta + o.v2[0] * tb, y: o.p0[1] + o.v1[1] * ta + o.v2[1] * tb, z: o.p0[2] + o.v1[2] * ta + o.v2[2] * tb },
      color: o.color, intensity: fade, radius: o.radius, sky: true, vel: moving ? { x: moving[0], y: moving[1], z: moving[2] } : undefined,
    });
  }

  /** Reazioni a catena: ogni evento sonoro nuovo viene sentito dagli attori nel suo pubblico. */
  private processLog() {
    const log = this.st.log;
    for (; this.logCursor < log.length; this.logCursor++) {
      const ev = log[this.logCursor];
      const loudness = ev.sound?.loudness ?? 0;
      if (loudness >= 45) this.loud.push({ pos: ev.pos, t: ev.t });
      if (loudness < 25 || ev.tags.includes('reaction')) continue;
      for (const id of ev.audience) {
        if (id === 'player') continue;
        const a = this.st.actors.find((x) => x.id === id);
        if (!a || !a.present || a.id === ev.actorId) continue;
        a.percepts.push(ev.id);
        if (a.percepts.length > 8) a.percepts.shift();
        if (a.kind === 'fauna') {
          if (a.archetype === 'crows' || a.archetype === 'owl') { if (loudness >= 40) this.relocateBird(a, ev.id); }
          else if (a.state !== 'flee') this.flee(a, ev.pos, ev.id);
        } else if (a.kind === 'npc') {
          a.data.alertT = 6; a.data.alertX = ev.pos.x; a.data.alertZ = ev.pos.z;
          if (!a.knowledge.includes(`heard:${ev.sound!.kind}`)) a.knowledge.push(`heard:${ev.sound!.kind}`);
          if (ev.origin === 'anomaly') { a.data.saw = 'lights'; a.data.sawDir = bearing(a.pos, ev.pos); }
          if (ev.origin !== 'player' && ev.origin !== 'npc' && loudness >= 50 && !a.data.called && this.rNpc.chance(0.35)) {
            a.data.called = true;
            this.calls.push({ t: this.st.time + this.rNpc.range(20, 70), evId: ev.id, pos: ev.pos, sound: ev.sound!.kind });
          }
        } else if (a.kind === 'anomaly' && ev.origin === 'player') a.drives.curiosity = clamp(a.drives.curiosity + 0.05, 0, 1);
      }
    }
    if (this.loud.length && this.st.time - this.loud[0].t > 25) this.loud.shift();
  }

  private walk(a: ActorState, tx: number, tz: number, speed: number, dt: number): boolean {
    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.7) return true;
    const len = Math.min(d, speed * dt);
    a.heading = Math.atan2(dx, dz);
    a.data.moving = true;
    // l'acqua profonda non si attraversa; chi ci è già dentro può solo andare verso acqua più bassa
    const maxDepth = Math.max(0.25, this.model.waterDepthAt(a.pos.x, a.pos.z));
    if (this.h.playerDistance(a.pos) > 300) { // fuori vista: astratto
      const nx = a.pos.x + (dx / d) * len, nz = a.pos.z + (dz / d) * len;
      if (this.model.waterDepthAt(nx, nz) > maxDepth) { a.data.stuck = Number(a.data.stuck ?? 0) + dt; return false; }
      a.pos.x = nx; a.pos.z = nz; return false;
    }
    const np = this.model.move(a.pos, (dx / d) * len, (dz / d) * len, this.doorOpen, 0.3);
    const blocked = this.model.waterDepthAt(np.x, np.z) > maxDepth;
    const moved = blocked ? 0 : Math.hypot(np.x - a.pos.x, np.z - a.pos.z);
    if (!blocked) a.pos = np;
    a.data.stuck = moved < len * 0.25 ? Number(a.data.stuck ?? 0) + dt : 0;
    return false;
  }

  // ---------------------------------------------------------------- PNG

  private nextStep(a: ActorState) {
    a.stepIndex++;
    a.route = undefined; a.data.stuck = 0; a.data.useT = 0;
    const s = a.routine[a.stepIndex];
    if (!s) { a.state = 'idle'; a.stepTimer = 1e9; return; }
    a.state = s.act; a.stepTimer = s.duration ?? 0;
  }

  private stepNpc(a: ActorState, dt: number) {
    const s = a.routine[a.stepIndex];
    if (!s || a.state === 'gone') return;
    if (s.act === 'dormant') { a.stepTimer -= dt; if (a.stepTimer <= 0) this.nextStep(a); return; }
    const sky = this.h.sky(), dP = this.h.playerDistance(a.pos), pp = this.st.player.pos;
    a.lightOn = false;
    // incontro con l'agente: si ferma e si volta
    if (a.present && dP < 9 && Number(a.data.greetT ?? 0) < 25) { a.data.greetT = Number(a.data.greetT ?? 0) + dt; a.heading = Math.atan2(pp.x - a.pos.x, pp.z - a.pos.z); a.lightOn = sky.ambient < 0.25; return; }
    if (dP > 14) a.data.greetT = 0;
    if (Number(a.data.alertT ?? 0) > 0) { a.data.alertT = Number(a.data.alertT) - dt; a.heading = Math.atan2(Number(a.data.alertX) - a.pos.x, Number(a.data.alertZ) - a.pos.z); a.lightOn = sky.ambient < 0.25; return; }
    if (this.st.time >= a.nextThink) { a.nextThink = this.st.time + 2; this.npcLook(a); }
    switch (s.act) {
      case 'goto': case 'leave': {
        if (!a.route) {
          const to = s.act === 'leave' ? this.spec.entry.id : s.poiId!;
          const pts = this.model.route(String(a.data.node), to);
          if (!pts || pts.length < 2) { if (s.act === 'leave') { a.present = false; a.state = 'gone'; } else this.nextStep(a); return; }
          const points = a.present ? [{ ...a.pos }, ...pts] : pts;
          a.route = { points, dist: 0, total: this.model.routeLength(points) };
          if (!a.present) { a.present = true; a.pos = { ...pts[0] }; this.h.emit({ type: 'npc_arrives', pos: a.pos, origin: 'npc', actorId: a.id, radius: 30 }); }
          a.data.dest = to; a.data.seg = 0; a.data.segStart = 0;
        }
        const rt = a.route, rain = this.h.weather().precip > 0.5 ? 1.25 : 1;
        rt.dist = Math.min(rt.total, rt.dist + a.speed * rain * dt);
        let seg = Number(a.data.seg), start = Number(a.data.segStart);
        for (;;) {
          const p = rt.points[seg], q = rt.points[seg + 1];
          if (!q) break;
          const l = Math.hypot(q.x - p.x, q.z - p.z);
          if (rt.dist > start + l && seg < rt.points.length - 2) { start += l; seg++; continue; }
          const t = l > 0 ? clamp((rt.dist - start) / l, 0, 1) : 1;
          a.pos.x = p.x + (q.x - p.x) * t; a.pos.z = p.z + (q.z - p.z) * t;
          if (l > 0.01) a.heading = Math.atan2(q.x - p.x, q.z - p.z);
          break;
        }
        a.data.seg = seg; a.data.segStart = start; a.data.moving = true;
        a.lightOn = sky.ambient < 0.25;
        if (dP < 70 && dP > 12 && this.rNpc.chance(0.004)) this.h.emit({ type: 'npc_steps', pos: a.pos, origin: 'npc', actorId: a.id, radius: 8, sound: { kind: 'steps_far', loudness: 38 }, tags: ['reaction'] });
        if (rt.dist >= rt.total) {
          a.data.node = String(a.data.dest);
          if (s.act === 'leave') { a.present = false; a.state = 'gone'; a.lightOn = false; this.h.emit({ type: 'npc_leaves', pos: a.pos, origin: 'npc', actorId: a.id, radius: 30 }); }
          else this.nextStep(a);
        }
        break;
      }
      case 'wait': a.stepTimer -= dt * (this.h.weather().precip > 0.5 ? 1.6 : 1); if (a.stepTimer <= 0) this.nextStep(a); break;
      case 'wander': {
        a.stepTimer -= dt;
        const poi = this.model.poi(s.poiId ?? '');
        if (a.stepTimer <= 0 || !poi) { this.nextStep(a); break; }
        if (a.data.wx === undefined || this.walk(a, Number(a.data.wx), Number(a.data.wz), a.speed * 0.7, dt) || Number(a.data.stuck) > 1.5) {
          const p = this.spot(this.rNpc, poi.pos, 2, poi.radius * 0.7);
          if (p) { a.data.wx = p.x; a.data.wz = p.z; a.data.stuck = 0; }
        }
        a.lightOn = sky.ambient < 0.2;
        break;
      }
      case 'use': {
        const pose = this.h.pose(s.objectId ?? '');
        a.data.useT = Number(a.data.useT ?? 0) + dt;
        if (!pose) { this.nextStep(a); break; }
        const near = dist(a.pos, pose) < 1.9;
        if (!near && Number(a.data.useT) < 45 && Number(a.data.stuck ?? 0) < 3) { this.walk(a, pose.x, pose.z, a.speed, dt); a.lightOn = sky.ambient < 0.25; break; }
        if (near) this.npcUse(a, s.objectId!);
        this.nextStep(a);
        break;
      }
      default: this.nextStep(a);
    }
  }

  private npcLook(a: ActorState) {
    for (const b of this.st.actors) {
      if (b === a || !b.present || !b.visible) continue;
      const d = dist(a.pos, b.pos);
      const lit = b.lightOn || b.archetype === 'light';
      if (d > (lit ? 150 : 35)) continue;
      const saw = b.archetype === 'light' || b.kind === 'anomaly' || b.kind === 'phenomenon' ? 'lights' : b.kind === 'fauna' ? 'animal' : b.kind === 'npc' ? 'person' : '';
      if (!saw || (a.data.saw === 'lights' && saw !== 'lights')) continue;
      a.data.saw = saw; a.data.sawDir = bearing(a.pos, b.pos);
      if (!a.knowledge.includes(`saw:${saw}`)) a.knowledge.push(`saw:${saw}`);
    }
  }

  private npcUse(a: ActorState, id: string) {
    const o = this.h.object(id), os = this.st.objects[id];
    if (!o || !os || o.essential) return;
    const cause = (type: string, kind?: string, loudness = 18) => ({ origin: 'npc' as const, type, actorId: a.id, sound: kind ? { kind, loudness } : undefined });
    switch (o.kind) {
      case 'switch': this.h.setObjectState(id, { on: !os.on }, cause('npc_switch', 'switch', 12)); break;
      case 'door':
        if (os.state === 'closed') this.h.setObjectState(id, { state: 'open' }, cause('npc_door_open', 'door_open', 24));
        else if (os.state === 'open') this.h.setObjectState(id, { state: 'closed' }, cause('npc_door_close', 'door_close', 28));
        else this.h.emit({ type: 'npc_try_door', pos: o.pos, origin: 'npc', actorId: a.id, objectId: id, sound: { kind: 'door_locked', loudness: 22 } });
        break;
      case 'generator':
        if (os.running) this.h.setObjectState(id, { running: false }, cause('npc_generator_stop', 'generator_stop', 40));
        else if (Number(os.fuel) > 0.05) this.h.setObjectState(id, { running: true }, cause('npc_generator_start', 'generator_start', 75));
        break;
      case 'chair': { const p = this.h.pose(id)!; this.h.moveObject(id, { x: p.x + this.rNpc.range(-0.5, 0.5), z: p.z + this.rNpc.range(-0.5, 0.5), rotY: p.rotY + this.rNpc.range(-0.8, 0.8) }, cause('npc_chair_moved', 'chair_scrape', 16)); break; }
      case 'bin': if (os.tipped) this.h.setObjectState(id, { tipped: false }, cause('npc_bin_straightened', 'metal_clank', 26)); else this.h.emit({ type: 'npc_bin_used', pos: o.pos, origin: 'npc', actorId: a.id, objectId: id, sound: { kind: 'metal_clank', loudness: 20 } }); break;
      case 'cooler': this.h.setObjectState(id, { open: !os.open }, cause('npc_cooler', 'click', 10)); break;
      default: break;
    }
  }

  npcTalk(actorId: string): Facts | null {
    const a = this.st.actors.find((x) => x.id === actorId);
    if (!a || a.kind !== 'npc' || !a.present) return null;
    a.data.greetT = 0; a.data.talked = true;
    return { archetype: a.archetype, goal: a.goal, saw: String(a.data.saw ?? 'nothing'), direction: a.data.sawDir as string | undefined };
  }

  // ---------------------------------------------------------------- fauna

  private flee(a: ActorState, from: Vec2, causeEventId?: number) {
    const r = this.rFauna;
    let dx = a.pos.x - from.x, dz = a.pos.z - from.z;
    const rabbit = a.archetype === 'rabbit';
    const d = Math.hypot(dx, dz) || 1, run = rabbit ? r.range(16, 34) : r.range(40, 75), ang = rabbit ? r.range(-0.95, 0.95) : r.range(-0.5, 0.5);
    dx /= d; dz /= d;
    const c = Math.cos(ang), s = Math.sin(ang);
    a.data.tx = clamp(a.pos.x + (dx * c - dz * s) * run, -LIMIT, LIMIT); a.data.tz = clamp(a.pos.z + (dx * s + dz * c) * run, -LIMIT, LIMIT);
    a.state = 'flee'; a.stepTimer = rabbit ? r.range(2.5, 4.5) : r.range(6, 11); a.data.stuck = 0;
    if (a.cooldown <= 0) {
      a.cooldown = rabbit ? 14 : 8;
      this.h.emit({ type: 'fauna_flee', pos: a.pos, origin: 'fauna', actorId: a.id, causeEventId, radius: 12, sound: { kind: a.archetype === 'deer' && r.chance(0.25) ? 'deer' : !rabbit && r.chance(0.5) ? 'twig' : 'rustle', loudness: a.archetype === 'deer' ? 42 : rabbit ? 16 : 24 }, tags: ['reaction'] });
    }
  }

  private relocateBird(a: ActorState, causeEventId?: number) {
    if (a.cooldown > 0) return;
    const trees = this.model.trees, nt = Math.floor(trees.length / 5), r = this.rFauna;
    let best: Vec2 | null = null;
    for (let i = 0; i < 12 && nt > 0; i++) { const k = r.int(0, nt - 1), p = { x: trees[k * 5], z: trees[k * 5 + 1] }, d = dist(p, a.pos); if (d > 40 && d < 260 && Math.abs(p.x) < LIMIT && Math.abs(p.z) < LIMIT) { best = p; break; } }
    a.cooldown = 30;
    this.h.emit({ type: a.archetype === 'crows' ? 'crows_burst' : 'owl_flight', pos: a.pos, origin: 'fauna', actorId: a.id, causeEventId, radius: 20, sound: { kind: a.archetype === 'crows' ? 'crows' : 'rustle', loudness: a.archetype === 'crows' ? 140 : 22 }, tags: ['reaction'] });
    if (best) a.pos = best;
  }

  /** Spostamento silenzioso di un rapace notturno: metà delle volte verso la zona del giocatore, così lo si sente. */
  private driftBird(a: ActorState) {
    const trees = this.model.trees, nt = Math.floor(trees.length / 5), r = this.rFauna, pl = this.st.player.pos;
    const nearPlayer = r.chance(0.5), c = nearPlayer ? pl : a.pos, lo = nearPlayer ? 45 : 40, hi = nearPlayer ? 150 : 260;
    for (let i = 0; i < 40 && nt > 0; i++) {
      const k = r.int(0, nt - 1), p = { x: trees[k * 5], z: trees[k * 5 + 1] }, d = dist(p, c);
      if (d < lo || d > hi || Math.abs(p.x) > LIMIT || Math.abs(p.z) > LIMIT || dist(p, pl) < 30 || this.h.playerCanSee(p)) continue;
      a.pos = p; a.data.y = r.range(4.5, 8);
      return;
    }
  }

  private stepFauna(a: ActorState, dt: number) {
    const r = this.rFauna, pl = this.st.player, dP = this.h.playerDistance(a.pos), night = this.h.sky().ambient < 0.4;
    if (a.state === 'perch') {
      if (dP < 11) { this.relocateBird(a); return; }
      a.data.callT = Number(a.data.callT) - dt;
      if (Number(a.data.callT) <= 0) {
        const w = this.h.weather(), quiet = w.precip < 0.4 && !this.hushedAt(a.pos);
        if (a.archetype === 'owl') {
          a.data.callT = r.range(40, 170);
          if (night && quiet) this.h.emit({ type: 'owl_call', pos: a.pos, origin: 'fauna', actorId: a.id, radius: 5, sound: { kind: 'owl', loudness: 170 }, tags: ['reaction'] });
        } else if (a.archetype === 'nightbird') {
          a.data.callT = r.range(60, 240);
          if (night && quiet) this.h.emit({ type: 'bird_call', pos: a.pos, origin: 'fauna', actorId: a.id, radius: 5, sound: { kind: r.chance(0.4) ? 'screech' : 'nightbird', loudness: 180 }, tags: ['reaction'] });
        } else {
          a.data.callT = r.range(160, 560);
          if (quiet && r.chance(0.5)) this.h.emit({ type: 'crows_call', pos: a.pos, origin: 'fauna', actorId: a.id, radius: 5, sound: { kind: 'crows', loudness: 150 }, tags: ['reaction'] });
        }
        if (a.archetype !== 'crows' && r.chance(0.35)) this.driftBird(a);
      }
      return;
    }
    const rabbit = a.archetype === 'rabbit';
    const speedRun = a.archetype === 'deer' ? 7.5 : a.archetype === 'fox' ? 6 : rabbit ? 8.4 : 3.6;
    if (a.state === 'flee') {
      a.stepTimer -= dt;
      if (this.walk(a, Number(a.data.tx), Number(a.data.tz), speedRun, dt) || a.stepTimer <= 0 || Number(a.data.stuck) > 1) {
        a.state = 'idle'; a.stepTimer = rabbit ? r.range(5, 14) : r.range(15, 50);
        // il coniglio, passato lo spavento, torna verso la tana; gli altri restano dove sono (mai in acqua)
        if (!rabbit && this.model.waterDepthAt(a.pos.x, a.pos.z) <= 0) { a.data.hx = a.pos.x; a.data.hz = a.pos.z; }
      }
      return;
    }
    if (this.st.time >= a.nextThink) {
      a.nextThink = this.st.time + 0.5;
      // il coniglio scappa appena il giocatore lo vede (o gli arriva addosso); gli altri reagiscono alla distanza
      const alarm = rabbit ? (dP < 34 && this.h.playerCanSee(a.pos) ? (pl.running ? 34 : 24) : pl.running ? 24 : 7) : (pl.running ? 46 : a.archetype === 'raccoon' ? 12 : 21);
      if (dP < alarm) { this.flee(a, pl.pos); return; }
      if (a.archetype === 'deer') { const fox = this.st.actors.find((b) => b.archetype === 'fox' && b.present && dist(b.pos, a.pos) < 30); if (fox) { this.flee(a, fox.pos); return; } }
    }
    if (a.archetype === 'fox') {
      a.data.callT = Number(a.data.callT) - dt;
      if (Number(a.data.callT) <= 0) { a.data.callT = r.range(200, 700); if (night && dP > 40) this.h.emit({ type: 'fox_call', pos: a.pos, origin: 'fauna', actorId: a.id, radius: 5, sound: { kind: 'fox', loudness: 170 }, tags: ['reaction'] }); }
    }
    if (a.archetype === 'raccoon' && a.state !== 'raid') {
      a.data.raidT = Number(a.data.raidT) - dt;
      const bin = this.h.pose(String(a.data.bin));
      if (Number(a.data.raidT) <= 0 && bin && this.h.playerDistance(bin) > 30) { a.state = 'raid'; a.data.tx = bin.x; a.data.tz = bin.z; a.stepTimer = 90; a.data.stuck = 0; }
    }
    if (a.state === 'raid') {
      a.stepTimer -= dt;
      const near = Math.hypot(Number(a.data.tx) - a.pos.x, Number(a.data.tz) - a.pos.z) < 1.6;
      if (!near && a.stepTimer > 0 && Number(a.data.stuck) < 3) { this.walk(a, Number(a.data.tx), Number(a.data.tz), a.speed, dt); return; }
      const id = String(a.data.bin), os = this.st.objects[id];
      if (near && os && !os.tipped && r.chance(0.7)) {
        const ev = this.h.setObjectState(id, { tipped: true }, { origin: 'fauna', type: 'bin_tipped', actorId: a.id, sound: { kind: 'bin_tip', loudness: 60 } });
        const p = this.spot(r, a.pos, 0.8, 1.8);
        if (ev && p) this.h.addDynamicObject({ kind: 'trace', poiId: this.h.object(id)!.poiId, pos: p, rotY: r.range(0, 6.28), state: { type: 'litter', age: 0 } }, { origin: 'fauna', type: 'litter_scattered', actorId: a.id, causeEventId: ev.id });
      }
      a.state = 'move'; a.data.tx = Number(a.data.hx); a.data.tz = Number(a.data.hz); a.data.raidT = r.range(500, 1500); a.data.stuck = 0;
      return;
    }
    if (a.state === 'move') {
      if (this.walk(a, Number(a.data.tx), Number(a.data.tz), a.speed, dt) || Number(a.data.stuck) > 2) { a.state = 'idle'; a.stepTimer = r.range(8, 45); }
      return;
    }
    a.stepTimer -= dt;
    // finito in acqua (sponda franata, piena): esce subito verso la riva più vicina
    if (this.model.waterDepthAt(a.pos.x, a.pos.z) > 0.2) {
      const dry = this.spot(r, a.pos, 2, 30) ?? this.spot(r, a.pos, 20, 80);
      if (dry) { a.state = 'move'; a.data.tx = dry.x; a.data.tz = dry.z; a.data.hx = dry.x; a.data.hz = dry.z; a.data.stuck = 0; return; }
    }
    if (a.stepTimer <= 0) {
      const p = rabbit ? this.spot(r, { x: Number(a.data.hx), z: Number(a.data.hz) }, 1, 13) : this.spot(r, { x: Number(a.data.hx), z: Number(a.data.hz) }, 6, a.archetype === 'fox' ? 90 : 40, a.archetype !== 'raccoon');
      if (p) { a.state = 'move'; a.data.tx = p.x; a.data.tz = p.z; a.data.stuck = 0; } else a.stepTimer = 10;
    }
  }

  // ---------------------------------------------------------------- anomalie e illusioni

  private cap(a: ActorState, id: CapabilityId): number { return a.capabilities.find((c) => c.id === id)?.intensity ?? 0; }

  private stepAnomaly(a: ActorState, dt: number) {
    const r = this.rAnom, pl = this.st.player.pos;
    if (a.state === 'dormant') {
      a.data.alpha = 0;
      a.stepTimer -= dt;
      if (a.stepTimer > 0) return;
      // manifestazione: dove, dipende da curiosità e territorialità
      const home = { x: Number(a.data.hx), z: Number(a.data.hz) };
      const nearPlayer = a.drives.curiosity > a.drives.territorial || dist(home, pl) > 260;
      let pos: Vec2 | null = null;
      for (let i = 0; i < 8; i++) {
        const p = nearPlayer ? this.spot(r, pl, 45, 115) : this.spot(r, home, 0, 35);
        if (!p) continue;
        pos = p;
        if (!this.h.playerCanSee(p)) break;
      }
      if (!pos) { a.stepTimer = 30; return; }
      a.pos = pos; a.present = true; a.state = 'manifest'; a.stepTimer = r.range(25, 95) * (0.6 + a.drives.restless);
      a.visible = this.cap(a, 'light') > 0 || this.cap(a, 'appear') > 0;
      a.lightOn = a.archetype === 'light';
      a.heading = Math.atan2(pl.x - pos.x, pl.z - pos.z);
      a.data.lookT = 0; a.data.displaced = false; a.data.soundT = r.range(2, 10); a.data.phase = r.range(0, 6.28);
      const au = this.cap(a, 'audio');
      this.h.emit({ type: 'anomaly_manifest', pos, origin: 'anomaly', actorId: a.id, radius: 6, sound: au > 0 ? { kind: r.pick(['hum_anom', 'tone_anom', 'whisper_anom']), loudness: 35 + 60 * au } : undefined, tags: ['anomaly'] });
      return;
    }
    // manifesta
    a.stepTimer -= dt;
    a.data.alpha = clamp(Number(a.data.alpha) + dt * 0.7, 0, 1);
    const dP = this.h.playerDistance(a.pos), motion = this.cap(a, 'motion');
    if (motion > 0) {
      const ph = Number(a.data.phase) + dt * 0.12 * (0.5 + motion);
      a.data.phase = ph;
      const tx = a.pos.x + Math.cos(ph) * 20, tz = a.pos.z + Math.sin(ph * 0.7) * 20;
      if (a.archetype === 'light' || a.archetype === 'presence') { a.pos.x = clamp(a.pos.x + Math.cos(ph) * a.speed * dt, -LIMIT, LIMIT); a.pos.z = clamp(a.pos.z + Math.sin(ph * 0.7) * a.speed * dt, -LIMIT, LIMIT); a.data.moving = true; }
      else if (dP < 30) { this.walk(a, a.pos.x + (a.pos.x - pl.x), a.pos.z + (a.pos.z - pl.z), a.speed, dt); } // si allontana lentamente
      else if (a.drives.restless > 0.7) this.walk(a, tx, tz, a.speed * 0.4, dt);
    } else if (a.archetype !== 'light') a.heading = Math.atan2(pl.x - a.pos.x, pl.z - a.pos.z);
    const au = this.cap(a, 'audio');
    if (au > 0) {
      a.data.soundT = Number(a.data.soundT) - dt;
      if (Number(a.data.soundT) <= 0) { a.data.soundT = r.range(9, 30); this.h.emit({ type: 'anomaly_sound', pos: a.pos, origin: 'anomaly', actorId: a.id, radius: 4, sound: { kind: r.pick(['hum_anom', 'tone_anom', 'whisper_anom']), loudness: 30 + 55 * au }, tags: ['anomaly', 'reaction'] }); }
    }
    const disp = this.cap(a, 'displace');
    if (disp > 0 && !a.data.displaced && a.stepTimer < 15) {
      a.data.displaced = true;
      const cands = this.h.objects().filter((o) => ['chair', 'bin', 'sign', 'cooler'].includes(o.kind) && !o.essential && !o.containerId && dist(o.pos, a.pos) < 90 && !this.h.playerCanSee(this.h.pose(o.id) ?? o.pos, 6));
      if (cands.length) {
        const o = r.pick(cands), p = this.h.pose(o.id)!, np = this.spot(r, p, 0.4, 0.6 + 2 * disp);
        if (np) this.h.moveObject(o.id, { x: np.x, z: np.z, rotY: p.rotY + r.range(-1.6, 1.6) }, { origin: 'anomaly', type: 'object_displaced', actorId: a.id, tags: ['anomaly'] });
      }
    }
    // timidezza: osservata o avvicinata, cessa
    if (a.visible && this.h.playerCanSee(a.pos) && dP < 80) a.data.lookT = Number(a.data.lookT) + dt;
    const limit = 4 + 26 * (1 - a.drives.shyness);
    const close = dP < (a.archetype === 'light' ? 14 : 20 + 10 * a.drives.shyness);
    if (a.stepTimer <= 0 || close || Number(a.data.lookT) > limit) {
      const instant = this.cap(a, 'vanish') > 0 || a.archetype !== 'figure' || close;
      if (!instant && a.stepTimer > -12) { this.walk(a, a.pos.x + (a.pos.x - pl.x), a.pos.z + (a.pos.z - pl.z), 1.4, dt); return; }
      a.state = 'dormant'; a.present = false; a.visible = false; a.lightOn = false; a.data.alpha = 0;
      a.stepTimer = r.range(70, 420) * (1.4 - a.drives.restless);
      this.h.emit({ type: 'anomaly_vanish', pos: a.pos, origin: 'anomaly', actorId: a.id, radius: 4, tags: ['anomaly'] });
    }
  }

  private stepIllusion(a: ActorState, dt: number) {
    const d = this.h.playerDistance(a.pos), rv = Number(a.data.reveal);
    if (rv >= 1) return;
    const torch = this.st.torch.on && this.st.torch.charge > 0.02;
    if (d < 10 || (torch && d < 19 && this.h.playerCanSee(a.pos))) {
      a.data.reveal = Math.min(1, rv + dt * 0.28); // lento: la sagoma diventa ceppo poco a poco
      if (rv === 0) this.h.emit({ type: 'illusion_resolved', pos: a.pos, origin: 'illusion', actorId: a.id, radius: 2, tags: ['illusion'] });
    }
  }

  // ---------------------------------------------------------------- ambiente

  private hushedAt(p: Vec2): boolean { return this.hush.some((s) => dist(s.pos, p) < s.radius && s.strength > 0.4); }

  private stepEnvironment(dt: number) {
    const r = this.rEnv, w = this.h.weather(), st = this.st, pl = st.player.pos;
    const env = (type: string, kind?: string, loudness = 20) => ({ origin: 'environment' as const, type, sound: kind ? { kind, loudness } : undefined });
    // vento: porte che sbattono, cartelli, rami
    if (w.wind > 0.5 && r.chance((w.wind - 0.45) * 0.22)) {
      const pick = r.next();
      if (pick < 0.4) {
        const doors = this.h.objects({ kind: 'door' }).filter((o) => st.objects[o.id].state === 'open' && !o.essential);
        if (doors.length) this.h.setObjectState(r.pick(doors).id, { state: 'closed' }, env('wind_door_slam', 'door_bang', 70));
      } else if (pick < 0.65) {
        const signs = this.h.objects({ kind: 'sign' }).filter((o) => !o.essential && Number(st.objects[o.id].tilt ?? 0) < 0.3);
        if (signs.length) { const s = r.pick(signs); this.h.setObjectState(s.id, { tilt: +(Number(st.objects[s.id].tilt ?? 0) + r.range(0.06, 0.16)).toFixed(2) }, env('wind_sign_tilt', 'metal_clank', 22)); }
      } else {
        const p = this.spot(r, pl, 50, 170, true);
        if (p) {
          const ev = this.h.emit({ type: 'branch_fall', pos: p, origin: 'environment', radius: 10, sound: { kind: 'branch_fall', loudness: 110 }, preconditions: ['wind>0.5'], persistent: true });
          this.h.addDynamicObject({ kind: 'trace', poiId: this.model.nearestPoi(p).poi.id, pos: p, rotY: r.range(0, 6.28), state: { type: 'branch', age: 0 } }, { origin: 'environment', type: 'branch_on_ground', causeEventId: ev.id });
        }
      }
    }
    // pioggia sui fuochi; consumo dei generatori
    for (const o of this.h.objects({ kind: 'campfire' })) {
      const os = st.objects[o.id];
      if (w.precipType !== 'none' && w.precip > 0.3 && os.state !== 'cold' && r.chance(0.05 * w.precip * dt)) {
        this.h.setObjectState(o.id, { state: os.state === 'burning' ? 'embers' : 'cold' }, env('rain_on_fire', 'fire_douse', 14));
      } else if (os.state === 'burning' && !o.essential && r.chance(0.0012 * dt)) this.h.setObjectState(o.id, { state: 'embers' }, env('fire_dies_down'));
    }
    for (const o of this.h.objects({ kind: 'generator' })) {
      const os = st.objects[o.id];
      if (!os.running || o.essential) continue;
      const fuel = Math.max(0, Number(os.fuel) - dt / 2600);
      os.fuel = fuel;
      if (fuel <= 0) this.h.setObjectState(o.id, { running: false }, env('generator_out_of_fuel', 'generator_stop', 45));
    }
    // guasti elettrici brevi: una lampada si spegne e torna
    for (let i = this.lampFaults.length - 1; i >= 0; i--) {
      const f = this.lampFaults[i];
      if (st.time >= f.until) { this.lampFaults.splice(i, 1); this.h.setObjectState(f.id, { on: true }, env('lamp_recovers', 'click', 8)); }
    }
    if (r.chance(0.006 * dt * (1 + w.precip + w.wind))) {
      const lamps = this.h.objects().filter((o) => (o.kind === 'lamp' || o.kind === 'lamp_post') && !o.essential && isLampLit(st, o) && !this.lampFaults.some((f) => f.id === o.id));
      if (lamps.length) { const l = r.pick(lamps); if (this.h.setObjectState(l.id, { on: false }, env('lamp_fault', 'click', 8))) this.lampFaults.push({ id: l.id, until: st.time + r.range(4, 40) }); }
    }
    // tuoni e veicoli lontani
    if (w.precipType === 'rain' && w.precip > 0.55) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) { this.thunderT = r.range(35, 130); const a = r.range(0, 6.28); this.h.emit({ type: 'thunder', pos: { x: pl.x + Math.sin(a) * 600, z: pl.z + Math.cos(a) * 600 }, origin: 'environment', radius: 5, sound: { kind: 'thunder', loudness: 2500 }, preconditions: ['rain>0.55'] }); }
    }
    this.vehicleT -= dt;
    if (this.vehicleT <= 0) { this.vehicleT = r.range(220, 700); this.h.emit({ type: 'vehicle_passes', pos: this.spec.entry.pos, origin: 'environment', radius: 20, sound: { kind: 'vehicle_pass', loudness: 320 } }); }
    // meteo che cambia davvero -> avviso
    const precip = w.precip > 0.25, fog = w.fog > 0.55;
    if (precip && !this.wasPrecip) { const ev = this.h.emit({ type: 'precipitation_starts', pos: pl, origin: 'environment', radius: 1 }); this.h.sendSms('weather_notice', { weather: w.precipType === 'snow' ? 'snow' : 'rain' }, { causeEventId: ev.id }); }
    else if (fog && !this.wasFog && r.chance(0.5)) { const ev = this.h.emit({ type: 'fog_thickens', pos: pl, origin: 'environment', radius: 1 }); this.h.sendSms('weather_notice', { weather: 'fog' }, { causeEventId: ev.id }); }
    this.wasPrecip = precip; this.wasFog = fog;
    // rumore fantasma: raro, solo nel bosco fitto e mai due volte di fila
    if (this.illusionSounds < 2 && this.model.forestDensityAt(pl.x, pl.z) > 0.55 && this.rIll.chance(0.0015 * dt)) {
      this.illusionSounds++;
      const yaw = st.player.yaw + Math.PI + this.rIll.range(-0.8, 0.8), d = this.rIll.range(9, 20);
      this.h.emit({ type: 'phantom_sound', pos: { x: pl.x + Math.sin(yaw) * d, z: pl.z + Math.cos(yaw) * d }, origin: 'illusion', radius: 1, sound: { kind: this.rIll.pick(['twig', 'rustle', 'steps_far']), loudness: 40 }, tags: ['illusion', 'reaction'] });
    }
  }

  /** Deriva sottile: piccoli cambiamenti fuori vista, pochi per turno, mai su oggetti essenziali. */
  private stepDrift() {
    const r = this.rDrift, st = this.st;
    if (this.driftCount >= MAX_DRIFT || !r.chance(0.3)) return;
    const cands = this.h.objects().filter((o) => DRIFT_KINDS.includes(o.kind) && !o.essential && !o.containerId && this.h.playerDistance(o.pos) < 320 && !this.h.playerCanSee(this.h.pose(o.id) ?? o.pos, 14));
    if (!cands.length) return;
    const o = r.pick(cands), os = st.objects[o.id], cause = (type: string) => ({ origin: 'environment' as const, type, tags: ['drift'] });
    let ev: WorldEvent | null = null;
    switch (o.kind) {
      case 'chair': { const p = this.h.pose(o.id)!; ev = this.h.moveObject(o.id, { x: p.x + r.range(-0.4, 0.4), z: p.z + r.range(-0.4, 0.4), rotY: p.rotY + r.range(-0.7, 0.7) }, cause('drift_chair')); break; }
      case 'sign': ev = this.h.setObjectState(o.id, { tilt: +(Number(os.tilt ?? 0) + r.range(0.04, 0.1)).toFixed(2) }, cause('drift_sign')); break;
      case 'door': if (os.state === 'open' || os.state === 'closed') ev = this.h.setObjectState(o.id, { state: os.state === 'open' ? 'closed' : 'open' }, cause('drift_door')); break;
      case 'lamp': case 'lamp_post': if (!this.lampFaults.some((f) => f.id === o.id)) ev = this.h.setObjectState(o.id, { on: !os.on }, cause('drift_lamp')); break;
      case 'cooler': ev = this.h.setObjectState(o.id, { open: !os.open }, cause('drift_cooler')); break;
      default: break;
    }
    if (ev) this.driftCount++;
  }

  // ---------------------------------------------------------------- misteri, SMS, estremo

  private stepMysteries() {
    const st = this.st, r = this.h.rng('mysteries');
    for (const m of st.mysteries) {
      for (const c of m.clues) {
        if (c.kind !== 'trace' || m.discovered.includes(m.clues.indexOf(c))) continue;
        const o = this.h.object(c.objectId);
        if (o && this.h.playerDistance(o.pos) < 4.5 && this.h.playerCanSee(o.pos)) m.discovered.push(m.clues.indexOf(c));
      }
      for (const e of m.timeline) {
        if (e.done || st.time < e.t) continue;
        e.done = true;
        const poi = this.model.poi(e.poiId);
        if (!poi) continue;
        const base = { origin: 'mystery' as const, tags: ['mystery', m.id] };
        const near = this.spot(r, poi.pos, poi.radius * 0.5, poi.radius + 25) ?? poi.pos;
        switch (e.type) {
          case 'steps': this.h.emit({ ...base, type: 'mystery_steps', pos: near, radius: 6, sound: { kind: 'steps_far', loudness: 60 } }); break;
          case 'voice_far': this.h.emit({ ...base, type: 'mystery_voice', pos: near, radius: 6, sound: { kind: 'voice_far', loudness: 110 } }); break;
          case 'knock': this.h.emit({ ...base, type: 'mystery_knock', pos: poi.pos, radius: 6, sound: { kind: 'knock', loudness: 70 } }); break;
          case 'door_ajar': { const d = this.h.objects({ kind: 'door', poiId: poi.id }).find((o) => st.objects[o.id].state === 'closed' && !o.essential && !this.h.playerCanSee(o.pos, 10)); if (d) this.h.setObjectState(d.id, { state: 'open' }, { ...base, type: 'mystery_door', sound: { kind: 'door_open', loudness: 24 } }); break; }
          case 'lamp_flicker': { const l = this.h.objects({ poiId: poi.id }).find((o) => (o.kind === 'lamp' || o.kind === 'lamp_post') && !o.essential && isLampLit(st, o)); if (l && this.h.setObjectState(l.id, { on: false }, { ...base, type: 'mystery_lamp' })) this.lampFaults.push({ id: l.id, until: st.time + r.range(6, 25) }); break; }
          case 'far_light': {
            const a = this.actor(`${m.id}.light${st.actors.length}`, 'phenomenon', 'light', near, { lightOn: true, photographable: m.origin !== 'anomalous', state: 'shine' });
            a.stepTimer = r.range(25, 80);
            Object.assign(a.data, m.origin === 'human' ? { c0: 1, c1: 0.9, c2: 0.72 } : { c0: 0.7, c1: 0.85, c2: 1 }, { y: m.origin === 'human' ? 1.3 : r.range(2, 5), alpha: 1 });
            this.h.emit({ ...base, type: 'mystery_light', pos: near, radius: 4, actorId: a.id });
            break;
          }
          default: break;
        }
      }
    }
  }

  private stepSms() {
    const st = this.st, r = this.rSms;
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i];
      if (st.time < c.t) continue;
      this.calls.splice(i, 1);
      this.h.sendSms('citizen_call', { poi: this.model.nearestPoi(c.pos).poi.id, sound: c.sound, subject: c.subject }, { causeEventId: c.evId });
    }
    for (const p of this.smsPlan) {
      if (p.done || st.time < p.t) continue;
      p.done = true;
      let kind = p.kind;
      const facts: Facts = {};
      let cause: number | undefined;
      if (kind === 'citizen_call') {
        // deve nascere da un evento reale non già percepito dall'agente
        const ev = [...st.log].reverse().find((e) => e.origin !== 'player' && !e.perceivedByPlayer && st.time - e.t < 400 && ((e.sound?.loudness ?? 0) >= 40 || e.type === 'anomaly_manifest' || e.type === 'mystery_light'));
        if (ev) { cause = ev.id; facts.poi = this.model.nearestPoi(ev.pos).poi.id; facts.sound = ev.sound?.kind; if (ev.type !== 'thunder' && !ev.sound) facts.subject = 'light'; }
        else kind = 'banter';
      } else if (kind === 'false_report') { facts.poi = r.pick(this.spec.pois).id; facts.subject = r.pick(['light', 'person', 'figure']); }
      else if (kind === 'contradiction') { const rep = st.reports[st.reports.length - 1]; const m = rep && st.missions.find((x) => x.id === rep.missionId); if (m) facts.poi = m.poiId; else kind = 'checkin'; }
      else if (kind === 'garbled' && this.inter.phone < 0.15) kind = 'checkin';
      const w = this.h.weather();
      if (kind === 'banter' || kind === 'checkin') facts.weather = w.precip > 0.25 ? (w.precipType === 'snow' ? 'snow' : 'rain') : w.fog > 0.55 ? 'fog' : w.wind > 0.6 ? 'wind' : 'clear';
      this.h.sendSms(kind, facts, { causeEventId: cause });
    }
    if (!this.garbledSent && this.inter.phone > 0.55) {
      this.garbledSent = true;
      const ev = this.h.emit({ type: 'signal_interference', pos: st.player.pos, origin: 'anomaly', radius: 1, tags: ['anomaly'] });
      this.h.sendSms('garbled', {}, { causeEventId: ev.id });
    }
  }

  private stepExtreme() {
    const st = this.st, ex = st.extreme;
    if (!ex.plan) return;
    if (ex.startedAt === undefined) {
      if (ex.predisposed && !ex.done && st.reports.length >= ex.plan.trigger.afterReports && st.time >= ex.plan.trigger.minTime) this.beginExtreme();
      return;
    }
    if (!ex.done && st.time - ex.startedAt >= ex.plan.total) {
      ex.done = true;
      this.h.emit({ type: 'extreme_end', pos: st.player.pos, origin: 'system', radius: 1, tags: ['extreme'], props: { aftermath: ex.plan.aftermath } });
      if (ex.plan.aftermath !== 'stars') this.h.sendSms(this.rAnom.chance(0.5) ? 'future_self' : 'garbled', {});
    }
  }

  private beginExtreme() {
    const st = this.st;
    st.extreme.startedAt = st.time; st.extreme.done = false;
    this.h.emit({ type: 'extreme_begin', pos: st.player.pos, origin: 'system', radius: 1, tags: ['extreme'], persistent: true });
  }

  devForceExtreme(): void {
    const ex = this.st.extreme;
    if (!ex.plan) ex.plan = makeExtremePlan(this.st.seed);
    this.beginExtreme();
  }

  extremeState(): ExtremeRenderState {
    const ex = this.st.extreme;
    if (!ex.plan || ex.startedAt === undefined || ex.done) return { ...EXTREME_IDLE };
    return extremeStateAt(ex.plan, this.st.time - ex.startedAt, this.st.seed);
  }

  // ---------------------------------------------------------------- campi derivati (render, audio)

  private refreshFields() {
    const st = this.st, pl = st.player.pos;
    const alter: LocalAlterations = { rainUp: 0, shadowSkew: 0, reflectionShift: 0, dustFloat: 0, lights: [] };
    const inter = { torch: 0, phone: 0, gps: 0 };
    const hush: typeof this.hush = [];
    for (const a of st.actors) {
      if (!a.present) continue;
      const d = dist(a.pos, pl);
      if (a.archetype === 'fox') hush.push({ pos: a.pos, radius: 55, strength: 0.6 });
      if (a.archetype === 'light' && a.lightOn && d < 420) {
        const k = a.kind === 'anomaly' ? Number(a.data.alpha ?? 1) * (0.5 + this.cap(a, 'light')) : 0.8;
        alter.lights.push({ id: a.id, pos: { x: a.pos.x, y: this.model.groundAt(a.pos.x, a.pos.z) + Number(a.data.y ?? 2), z: a.pos.z }, color: [Number(a.data.c0 ?? 1), Number(a.data.c1 ?? 1), Number(a.data.c2 ?? 1)], intensity: k, radius: 0.25 + 0.3 * k });
      }
      if (a.kind !== 'anomaly') continue;
      const i = this.cap(a, 'interfere');
      if (i > 0) { const v = i * smoothstep(75, 15, d); inter.torch = Math.max(inter.torch, v); inter.phone = Math.max(inter.phone, v * 0.9); inter.gps = Math.max(inter.gps, v); }
      const p = this.cap(a, 'perceptual');
      if (p > 0) hush.push({ pos: a.pos, radius: 90, strength: p });
      else hush.push({ pos: a.pos, radius: 40, strength: 0.5 });
      const al = a.capabilities.find((c) => c.id === 'alter_local');
      if (al && d < 45) {
        const v = al.intensity * smoothstep(45, 12, d);
        if (al.property === 'rain_up') alter.rainUp = Math.max(alter.rainUp, v);
        else if (al.property === 'shadow_skew') alter.shadowSkew = v * 1.2;
        else if (al.property === 'reflection_shift') alter.reflectionShift = Math.max(alter.reflectionShift, v);
        else if (al.property === 'dust_float') alter.dustFloat = Math.max(alter.dustFloat, v);
        else if (al.property === 'compass_spin') inter.gps = Math.max(inter.gps, v);
        else if (al.property === 'audio_displace') hush.push({ pos: a.pos, radius: 60, strength: v });
      }
    }
    for (const l of this.loud) hush.push({ pos: l.pos, radius: 70, strength: 0.7 * clamp(1 - (st.time - l.t) / 25, 0, 1) });
    const ex = st.extreme;
    if (ex.plan && ex.startedAt !== undefined && !ex.done) {
      const t = st.time - ex.startedAt, au = extremeAudioAt(ex.plan, t);
      inter.torch = Math.max(inter.torch, 0.5); inter.phone = Math.max(inter.phone, 0.7 + 0.3 * au); inter.gps = 1;
      hush.push({ pos: pl, radius: 500, strength: 1 });
    }
    this.alter = alter; this.inter = inter; this.hush = hush;
    this.skyLight();
  }

  actorViews(): ActorView[] {
    const out: ActorView[] = [], pl = this.st.player.pos;
    for (const a of this.st.actors) {
      if (!a.present || dist(a.pos, pl) > 700) continue;
      out.push({
        id: a.id, kind: a.kind, archetype: a.archetype, heading: a.heading, moving: a.data.moving === true, lightOn: a.lightOn, visible: a.visible,
        pos: { x: a.pos.x, y: this.model.groundAt(a.pos.x, a.pos.z) + Number(a.data.y ?? 0), z: a.pos.z },
        reveal: Number(a.data.reveal ?? 0), alpha: a.kind === 'anomaly' ? Number(a.data.alpha ?? 1) : 1,
      });
    }
    return out;
  }

  mysteryMood() { return this.mood.view(); }
  localAlterations(): LocalAlterations { return this.alter; }
  hushSources() { const d = this.dread.hush(); return d ? this.hush.concat(d) : this.hush; }
  interference() {
    const d = this.dread.interference();
    if (d.torch <= 0 && d.gps <= 0) return this.inter;
    return { torch: Math.max(this.inter.torch, d.torch), phone: this.inter.phone, gps: Math.max(this.inter.gps, d.gps) };
  }
  onPlayerEvent(_e: WorldEvent): void { /* gli eventi del giocatore arrivano agli attori dal registro (processLog) */ }
}

export const createSimulation: SimFactory = (host: SimHost) => new Simulation(host);

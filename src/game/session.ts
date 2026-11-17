// GameSession: tutta la logica di una partita, senza rendering. È usata dal gioco nel browser
// e, identica, dai test headless e dall'harness statistico.
import type {
  ActorView, CommentTrigger, ExtremeRenderState, Facts, INarrativeComposer, LocalAlterations, MapView, NarrativeContext,
  PhoneView, SkyState, SoundKind, SoundscapeContext, SpontaneousKind, SummaryView, Surface, TorchRender, Vec3Like, WeatherState,
} from '../core/api';
import {
  EXTREME_PROBABILITY, GENERATOR_VERSION, type ActionId, type ActorState, type Lang, type Mission, type ObjState,
  type Observation, type ObservationKind, type PhoneMessage, type Photo, type Report, type SessionState, type StreamName,
  type Vec2, type WorldEvent, type WorldObjectSpec, type WorldSpec,
} from '../core/contracts';
import { Rng, clamp, hash2, streamFor } from '../core/rng';
import { TORCH_ANGLE } from '../core/torch';
import { NarrativeComposer } from '../narrative/composer';
import { pickPersonality } from '../narrative/personality';
import { clockString, skyAt, weatherAt } from '../sim/environment';
import { chronicle, chronicleText } from '../sim/chronicle';
import { isExtremeSeed } from '../sim/extreme';
import type { Cause, ISimulation, SimFactory, SimHost } from '../sim/host';
import { MISSION_TYPES, generateMissions, missionSatisfiedBy } from '../sim/missions';
import { isLampLit, isObjectAvailable } from '../sim/objects';
import type { WorldModel } from '../world/model';
import { generateWorld } from '../world/worldgen';

export const SIM_DT = 0.1;
export const MAX_PHOTOS = 12;
export const WALK_SPEED = 2.5;
export const RUN_SPEED = 5.8;
export const EYE_HEIGHT = 1.68;
export const INTERACT_RANGE = 3.2;
const TORCH_LIFE = 900; // secondi di luce con batteria piena

export interface PlayerInput { forward: number; strafe: number; run: boolean; yaw: number; pitch: number }

export interface Presentation {
  sounds: { kind: SoundKind; pos?: Vec3Like; gain?: number }[];
  lines: { text: string; speaker?: string; tts: boolean }[];
  notices: { key: string; params?: Record<string, string | number> }[];
  footsteps: { surface: Surface; running: boolean }[];
}

export interface FocusAction { objectId?: string; actorId?: string; action: ActionId; kind: string }

class NullSimulation implements ISimulation {
  mysteryMood() { return { active: false, intensity: 0, watched: false }; }
  step(): void {}
  actorViews(): ActorView[] { return []; }
  localAlterations(): LocalAlterations { return { rainUp: 0, shadowSkew: 0, reflectionShift: 0, dustFloat: 0, lights: [] }; }
  hushSources() { return []; }
  interference() { return { torch: 0, phone: 0, gps: 0 }; }
  onPlayerEvent(): void {}
  extremeState(): ExtremeRenderState { return { active: false, codeRain: 0, strip: 0, sky: 0, decompose: 0, stutter: 0, t: 0, seed: 0 }; }
  devForceExtreme(): void {}
  npcTalk(): Facts | null { return null; }
}

const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export function bearing(from: Vec2, to: Vec2): (typeof DIRS)[number] {
  const a = Math.atan2(to.x - from.x, to.z - from.z); // 0 = nord
  return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

const SIG_KEYS = ['state', 'on', 'flap', 'tipped', 'color', 'open', 'running', 'tilt', 'breaker', 'present', 'signed', 'lights', 'headlights'];

export class GameSession implements SimHost {
  readonly spec: WorldSpec;
  readonly model: WorldModel;
  readonly state: SessionState;
  readonly composer: INarrativeComposer;
  readonly out: Presentation = { sounds: [], lines: [], notices: [], footsteps: [] };
  sim: ISimulation;
  private streams = new Map<string, Rng>();
  private byId = new Map<string, WorldObjectSpec>();
  private acc = 0;
  private eventId = 0;
  private obsId = 0;
  private msgId = 0;
  private stepDist = 0;
  private lastCommentT = -100;
  private memory = new Map<string, string>();
  private seenActorAt = new Map<string, number>();
  private heardAt = new Map<string, number>();
  private visited = new Set<string>();
  private scheduled: { t: number; run: () => void }[] = [];
  private flags = new Set<string>();
  private dynCount = 0;
  private inspecting: string | null = null;
  private noise = 0;
  private yVel = 0;
  private cachedWeather: WeatherState;
  private cachedSky: SkyState;
  private lastBoundaryNote = -100;

  constructor(opts: { seed: number; lang: Lang; simFactory?: SimFactory; postProcess?: (spec: WorldSpec) => void }) {
    const { spec, model } = generateWorld(opts.seed, opts.postProcess);
    this.spec = spec;
    this.model = model;
    for (const o of spec.objects) this.byId.set(o.id, o);
    const objects: Record<string, ObjState> = {};
    for (const o of spec.objects) objects[o.id] = { ...o.state };
    const missions = generateMissions(spec, objects, this.rng('missions'));
    const tr = this.rng('torch');
    const predisposed = isExtremeSeed(opts.seed);
    this.state = {
      seed: opts.seed, generatorVersion: GENERATOR_VERSION, lang: opts.lang, time: 0, tick: 0,
      player: { pos: { ...spec.playerSpawn.pos }, y: model.groundAt(spec.playerSpawn.pos.x, spec.playerSpawn.pos.z), yaw: spec.playerSpawn.yaw + Math.PI, pitch: 0, running: false, indoors: false },
      torch: { on: false, charge: tr.range(0.22, 1), spares: 0, fault: 0, flicker: 0 },
      missions, observations: [], photos: [], messages: [], reports: [], objects, objectPos: {}, dynamicObjects: [], actors: [], log: [],
      mysteries: spec.mysteries.map((m) => ({ ...m, clues: m.clues.map((c) => ({ ...c })), timeline: m.timeline.map((t) => ({ ...t })), discovered: [] })),
      personality: pickPersonality(opts.seed), extreme: { predisposed, done: false }, ended: false, abandoned: false,
    };
    const car = spec.pois[0].pos;
    const ctx: NarrativeContext = {
      seed: opts.seed, lang: opts.lang, personality: this.state.personality, officer: spec.officer, colleague: spec.colleague,
      poiName: (id) => model.poi(id)?.name ?? { it: 'zona', en: 'area' },
      poiType: (id) => model.poi(id)?.type ?? 'clearing',
      poiBearing: (id) => { const p = model.poi(id); return p ? { dir: bearing(car, p.pos), dist: Math.round(Math.hypot(p.pos.x - car.x, p.pos.z - car.z) / 10) * 10 } : { dir: 'n', dist: 0 }; },
    };
    this.composer = new NarrativeComposer(ctx);
    this.refreshMissionTexts();
    this.cachedWeather = weatherAt(spec.weather, 0);
    this.cachedSky = skyAt(spec.sky, this.cachedWeather, 0);
    this.sim = opts.simFactory ? opts.simFactory(this) : new NullSimulation();
    // SMS iniziali del collega
    const brief = this.composer.briefing(missions);
    brief.forEach((text, i) => this.at(2.5 + i * 3.5, () => this.pushMessage('colleague', text, i === 0 ? missions.map((m) => m.id) : undefined)));
    this.at(1.2, () => this.say('shift_start', { remaining: missions.length }, true));
    this.visited.add(spec.pois[0].id);
  }

  // ---------------------------------------------------------------- SimHost

  rng(stream: StreamName): Rng {
    let r = this.streams.get(stream);
    if (!r) this.streams.set(stream, (r = streamFor(this.spec.seed, stream)));
    return r;
  }
  weather(): WeatherState { return this.cachedWeather; }
  sky(): SkyState { return this.cachedSky; }
  object(id: string): WorldObjectSpec | undefined { return this.byId.get(id); }
  objects(filter?: { kind?: WorldObjectSpec['kind']; poiId?: string }): WorldObjectSpec[] {
    const out: WorldObjectSpec[] = [];
    for (const o of this.byId.values()) if ((!filter?.kind || o.kind === filter.kind) && (!filter?.poiId || o.poiId === filter.poiId)) out.push(o);
    return out;
  }
  isEssential(id: string): boolean { return !!this.byId.get(id)?.essential; }
  pose(id: string) {
    const o = this.byId.get(id);
    return o ? this.state.objectPos[id] ?? { x: o.pos.x, z: o.pos.z, rotY: o.rotY } : undefined;
  }
  playerDistance(pos: Vec2): number { return Math.hypot(pos.x - this.state.player.pos.x, pos.z - this.state.player.pos.z); }

  private lineOfSight(pos: Vec2, targetY = 1.2): boolean {
    const p = this.state.player;
    const y0 = p.y + EYE_HEIGHT, y1 = this.model.groundAt(pos.x, pos.z) + targetY;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      if (this.model.heightAt(p.pos.x + (pos.x - p.pos.x) * t, p.pos.z + (pos.z - p.pos.z) * t) > y0 + (y1 - y0) * t + 0.3) return false;
    }
    return true;
  }
  private angleTo(pos: Vec2): number {
    const p = this.state.player;
    const a = Math.atan2(pos.x - p.pos.x, pos.z - p.pos.z) - p.yaw;
    return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  }
  playerCanSee(pos: Vec2, margin = 0): boolean {
    const d = this.playerDistance(pos);
    if (d < 12 + margin) return true;
    if (d > 95 + margin) return false;
    return this.angleTo(pos) < 1.05 && this.lineOfSight(pos);
  }

  emit(e: Parameters<SimHost['emit']>[0]): WorldEvent {
    const st = this.state;
    const d = this.playerDistance(e.pos);
    const ev: WorldEvent = {
      id: ++this.eventId, t: st.time, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius ?? 10, origin: e.origin,
      causeEventId: e.causeEventId, actorId: e.actorId, objectId: e.objectId, props: e.props ?? {}, preconditions: e.preconditions ?? [],
      before: e.before, after: e.after, persistent: e.persistent ?? false, audience: [], perceivedByPlayer: false, sound: e.sound, tags: e.tags ?? [],
    };
    const w = this.cachedWeather;
    const hear = e.sound ? e.sound.loudness * (1 - 0.35 * w.wind - 0.3 * (w.precipType === 'rain' ? w.precip : 0)) * (st.player.indoors ? 0.6 : 1) : 0;
    for (const a of st.actors) if (a.present && a.id !== e.actorId && Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) < Math.max(ev.radius, e.sound?.loudness ?? 0)) ev.audience.push(a.id);
    if (d < Math.max(hear, ev.radius)) ev.audience.push('player');
    if (e.origin === 'player') ev.perceivedByPlayer = true;
    else {
      const seen = d < 45 && this.playerCanSee(e.pos);
      if (e.sound && d < hear) {
        ev.perceivedByPlayer = true;
        this.out.sounds.push({ kind: e.sound.kind as SoundKind, pos: { x: e.pos.x, y: this.model.groundAt(e.pos.x, e.pos.z) + 1, z: e.pos.z } });
        const last = this.heardAt.get(e.sound.kind) ?? -100;
        if (!seen && d > 6 && st.time - last > 40) {
          this.heardAt.set(e.sound.kind, st.time);
          const o = this.observe('heard', 'sound', { sound: e.sound.kind, direction: bearing(st.player.pos, e.pos) }, { pos: e.pos, confidence: clamp(1.1 - d / hear, 0.2, 0.9) });
          this.say('heard', o.facts);
        }
      } else if (seen) ev.perceivedByPlayer = true;
    }
    st.log.push(ev);
    return ev;
  }

  setObjectState(id: string, patch: ObjState, cause: Cause): WorldEvent | null {
    const obj = this.byId.get(id);
    const st = this.state.objects[id];
    if (!obj || !st) return null;
    if (cause.origin !== 'player') {
      if (obj.kind === 'door' && (st.state === 'locked' || patch.state === 'locked')) return null;
      if (obj.essential && (patch.present === false || patch.removed === true || patch.taken === true)) return null;
      if (obj.kind === 'police_car') return null;
    }
    const before: ObjState = {}, after: ObjState = {};
    let changed = false;
    for (const k of Object.keys(patch)) if (st[k] !== patch[k]) { before[k] = st[k]; after[k] = patch[k]; st[k] = patch[k]; changed = true; }
    if (!changed) return null;
    if (obj.kind === 'switch' && 'on' in after) for (const l of obj.links ?? []) if (this.state.objects[l]) this.state.objects[l].on = !!after.on;
    const pose = this.pose(id)!;
    return this.emit({ type: cause.type, pos: pose, origin: cause.origin, actorId: cause.actorId, objectId: id, causeEventId: cause.causeEventId, before, after, persistent: true, sound: cause.sound, tags: cause.tags, props: cause.props });
  }

  moveObject(id: string, pose: { x: number; z: number; rotY: number }, cause: Cause): WorldEvent | null {
    const obj = this.byId.get(id);
    if (!obj || !['chair', 'bin', 'item', 'sign', 'cooler', 'trace', 'lamp'].includes(obj.kind)) return null;
    if (this.model.blockedAt(pose.x, pose.z)) return null;
    const prev = this.pose(id)!;
    this.state.objectPos[id] = { x: pose.x, z: pose.z, rotY: pose.rotY };
    return this.emit({ type: cause.type, pos: pose, origin: cause.origin, actorId: cause.actorId, objectId: id, causeEventId: cause.causeEventId, persistent: true, sound: cause.sound, tags: cause.tags,
      props: { ...cause.props, fromX: +prev.x.toFixed(2), fromZ: +prev.z.toFixed(2), fromRot: +prev.rotY.toFixed(2) } });
  }

  addDynamicObject(o: Parameters<SimHost['addDynamicObject']>[0], cause: Cause): WorldObjectSpec {
    const obj: WorldObjectSpec = {
      id: `dyn.${o.kind}${this.dynCount++}`, kind: o.kind, poiId: o.poiId, pos: { x: o.pos.x, z: o.pos.z },
      y: this.model.groundAt(o.pos.x, o.pos.z) + (o.yOff ?? 0.02), rotY: o.rotY ?? 0, state: { ...(o.state ?? {}) }, item: o.item,
    };
    this.state.dynamicObjects.push(obj);
    this.byId.set(obj.id, obj);
    this.state.objects[obj.id] = { ...obj.state };
    this.emit({ type: cause.type, pos: obj.pos, origin: cause.origin, actorId: cause.actorId, objectId: obj.id, causeEventId: cause.causeEventId, persistent: true, sound: cause.sound, tags: cause.tags, props: cause.props });
    return obj;
  }

  sendSms(kind: SpontaneousKind, facts: Facts, opts?: { causeEventId?: number; from?: PhoneMessage['from'] }): void {
    const from = opts?.from ?? (kind === 'citizen_call' || kind === 'false_report' ? 'dispatch' : kind === 'wrong_number' || kind === 'garbled' ? 'unknown' : kind === 'carrier' ? 'carrier' : kind === 'future_self' ? 'self' : 'colleague');
    this.pushMessage(from, this.composer.spontaneous(kind, facts), undefined, opts?.causeEventId);
  }

  // ---------------------------------------------------------------- utilità interne

  private at(delay: number, run: () => void) { this.scheduled.push({ t: this.state.time + delay, run }); }

  private senderName(from: PhoneMessage['from']): string {
    const it = this.state.lang === 'it';
    switch (from) {
      case 'colleague': return `${this.spec.colleague.first} ${this.spec.colleague.last}`;
      case 'dispatch': return it ? 'Centrale' : 'Dispatch';
      case 'unknown': return it ? 'Numero sconosciuto' : 'Unknown number';
      case 'carrier': return it ? 'Operatore' : 'Carrier';
      case 'self': return `${this.spec.officer.first} ${this.spec.officer.last}`;
    }
  }
  private pushMessage(from: PhoneMessage['from'], text: string, missionIds?: string[], causeEventId?: number) {
    this.state.messages.push({ id: ++this.msgId, t: this.state.time, from, sender: this.senderName(from), text, read: false, missionIds, causeEventId });
    this.out.sounds.push({ kind: 'sms' });
    this.out.notices.push({ key: 'notice.newMessage' });
    this.observe('sms', 'phone', {}, { source: 'phone' });
  }

  observe(kind: ObservationKind, subject: string, facts: Facts, o: { pos?: Vec2; confidence?: number; objectId?: string; actorId?: string; missionId?: string; source?: Observation['source'] } = {}): Observation {
    const clean: Observation['facts'] = {};
    for (const k of Object.keys(facts)) { const v = facts[k]; if (v !== undefined) clean[k] = v; }
    const pos = o.pos ?? this.state.player.pos;
    const ob: Observation = {
      id: ++this.obsId, t: this.state.time, kind, source: o.source ?? 'agent', subject, objectId: o.objectId, actorId: o.actorId,
      poiId: this.model.poiAt(pos)?.id ?? this.model.poiAt(this.state.player.pos)?.id, pos: { x: pos.x, z: pos.z }, confidence: o.confidence ?? 1, facts: clean, missionId: o.missionId,
    };
    this.state.observations.push(ob);
    return ob;
  }

  /** Commento parlato del protagonista (può tacere). */
  say(trigger: CommentTrigger, facts: Facts, force = false): void {
    if (!force && this.state.time - this.lastCommentT < 7) return;
    const text = this.composer.comment(trigger, facts);
    if (!text) return;
    this.lastCommentT = this.state.time;
    this.out.lines.push({ text, tts: true });
  }

  private refreshMissionTexts() {
    const cur = this.state.lang;
    for (const lang of ['it', 'en'] as const) {
      this.composer.setLang(lang);
      for (const m of this.state.missions) m.text[lang] = this.composer.missionTitle(m);
    }
    this.composer.setLang(cur);
  }
  setLang(lang: Lang) {
    this.state.lang = lang;
    this.composer.setLang(lang);
    for (const m of this.state.messages) m.sender = this.senderName(m.from);
  }

  private signature(id: string): string {
    const st = this.state.objects[id];
    const p = this.pose(id)!;
    let s = `${Math.round(p.x * 2)},${Math.round(p.z * 2)},${Math.round(p.rotY * 3)}`;
    for (const k of SIG_KEYS) if (k in st) s += `|${k}=${st[k]}`;
    return s;
  }

  // ---------------------------------------------------------------- ciclo

  update(dt: number, input: PlayerInput): void {
    const st = this.state;
    if (st.ended || st.abandoned) return;
    dt = Math.min(dt, 0.25);
    const p = st.player;
    p.yaw = input.yaw; p.pitch = input.pitch;
    if (!this.inspecting) {
      const mag = Math.hypot(input.forward, input.strafe);
      if (mag > 0.01) {
        const f = input.forward / Math.max(1, mag), s = input.strafe / Math.max(1, mag);
        const dirX = Math.sin(p.yaw) * f + Math.cos(p.yaw) * s, dirZ = Math.cos(p.yaw) * f - Math.sin(p.yaw) * s;
        let speed = input.run ? RUN_SPEED : WALK_SPEED;
        const ahead = this.model.groundAt(p.pos.x + dirX * 1.2, p.pos.z + dirZ * 1.2) - p.y;
        if (ahead > 0.45) speed *= clamp(1.35 - ahead, 0.35, 1); // salita ripida: più lenti, mai bloccati
        if (this.model.waterDepthAt(p.pos.x, p.pos.z) > 0.1 && !this.model.platformAt(p.pos.x, p.pos.z)) speed *= 0.6;
        const before = p.pos;
        p.pos = this.model.move(p.pos, dirX * speed * dt, dirZ * speed * dt, (id) => { const s2 = st.objects[id]?.state; return s2 === 'open' || s2 === 'ajar'; });
        const moved = Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
        p.running = input.run && moved > 0.01;
        this.stepDist += moved;
        const stride = input.run ? 1.9 : 1.35;
        if (this.stepDist > stride) {
          this.stepDist = 0;
          let surface = this.model.surfaceAt(p.pos.x, p.pos.z);
          if (surface === 'grass' || surface === 'dirt' || surface === 'road') {
            if (this.cachedWeather.snowCover > 0.45) surface = 'snow';
            else if (this.cachedWeather.wetness > 0.6 || this.model.waterDepthAt(p.pos.x, p.pos.z) > 0.05) surface = 'wet';
          }
          this.out.footsteps.push({ surface, running: input.run });
        }
        this.noise = Math.min(1, this.noise + moved * (input.run ? 0.09 : 0.012));
        if (moved < speed * dt * 0.2 && (Math.abs(p.pos.x) > 692 || Math.abs(p.pos.z) > 692) && st.time - this.lastBoundaryNote > 30) {
          this.lastBoundaryNote = st.time;
          this.out.notices.push({ key: 'notice.boundary' });
        }
      } else p.running = false;
    }
    // quota: i piedi seguono il terreno con una gravità semplice
    const ground = this.model.groundAt(p.pos.x, p.pos.z);
    if (p.y > ground + 0.02) { this.yVel -= 18 * dt; p.y = Math.max(ground, p.y + this.yVel * dt); } else { p.y += (ground - p.y) * Math.min(1, dt * 14); this.yVel = 0; }
    p.indoors = this.model.indoorsAt(p.pos.x, p.pos.z);
    this.noise = Math.max(0, this.noise - dt * 0.12);

    this.acc += dt;
    let guard = 0;
    while (this.acc >= SIM_DT && guard++ < 8) { this.acc -= SIM_DT; this.tick(); }
    if (guard >= 8) this.acc = 0;
  }

  /** Passo fisso della simulazione. Pubblico per harness e test (avanzamento rapido). */
  tick(): void {
    const st = this.state;
    st.time += SIM_DT;
    st.tick++;
    if (st.tick % 10 === 0) {
      this.cachedWeather = weatherAt(this.spec.weather, st.time);
      this.cachedSky = skyAt(this.spec.sky, this.cachedWeather, st.time);
    }
    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.t <= st.time);
      if (due.length) { this.scheduled = this.scheduled.filter((s) => s.t > st.time); for (const d of due) d.run(); }
    }
    this.updateTorch();
    this.sim.step(SIM_DT);
    if (st.tick % 5 === 0) this.perceive();
    if (st.tick % 10 === 0) this.checkArrival();
  }

  private updateTorch() {
    const t = this.state.torch;
    const tr = this.rng('torch');
    const roll = tr.next(); // consumato a ogni passo: indipendente dalle azioni del giocatore
    if (t.on && t.charge > 0) {
      t.charge = Math.max(0, t.charge - SIM_DT / TORCH_LIFE);
      if (t.charge <= 0) {
        if (t.spares > 0) { t.spares--; t.charge = 1; this.out.sounds.push({ kind: 'battery' }); this.out.notices.push({ key: 'notice.batterySwapped' }); }
        else { this.out.notices.push({ key: 'notice.torchDead' }); this.say('torch_dead', {}, true); }
      } else if (t.charge < 0.14 && !this.flags.has('torch_low')) { this.flags.add('torch_low'); this.say('torch_low', {}); }
      if (t.fault <= 0 && roll < SIM_DT / 520) t.fault = 0.5 + tr.next() * 2.2; // guasto ordinario: contatto difettoso
    }
    if (t.fault > 0) t.fault = Math.max(0, t.fault - SIM_DT);
    const inter = this.sim.interference().torch;
    const ordinary = t.fault > 0 ? 0.35 + 0.65 * hash2(this.state.tick, 3, 91) : 0;
    const anomalous = inter > 0.05 ? inter * (0.4 + 0.6 * hash2(this.state.tick, 5, 17)) : 0;
    t.flicker = clamp(Math.max(ordinary, anomalous), 0, 1);
  }

  private perceive() {
    const st = this.state;
    const p = st.player;
    const amb = this.cachedSky.ambient;
    const torchOn = this.torchRender().intensity > 0.2;
    for (const a of st.actors) {
      if (!a.present || !a.visible) continue;
      const d = this.playerDistance(a.pos);
      if (d > 170) continue;
      const ang = this.angleTo(a.pos);
      if (ang > 1.0) continue;
      const lit = a.lightOn || a.archetype === 'light';
      const range = lit ? 160 : Math.max(torchOn && ang < TORCH_ANGLE / 2 ? 40 : 0, 7 + 62 * amb);
      if (d > range || !this.lineOfSight(a.pos)) continue;
      const last = this.seenActorAt.get(a.id) ?? -1000;
      a.data.seenByPlayer = true;
      if (st.time - last < 50) continue;
      this.seenActorAt.set(a.id, st.time);
      const conf = clamp(1 - (d / range) * 0.8, 0.15, 1);
      let subject = 'figure';
      let trig: CommentTrigger = 'saw_figure';
      const facts: Facts = { direction: bearing(p.pos, a.pos), confidence: conf };
      if (a.archetype === 'light') { subject = 'light'; trig = 'saw_light'; }
      else if (a.kind === 'npc' && (d < 28 || (lit && d < 60))) { subject = 'person'; trig = 'saw_person'; }
      else if (a.kind === 'fauna') { if (d < 32) { subject = 'animal'; facts.animal = a.archetype; trig = 'saw_animal'; } else { subject = 'movement'; trig = 'saw_animal'; } }
      else if (a.kind === 'illusion' && Number(a.data.reveal ?? 0) > 0.6) continue;
      this.observe('saw', subject, facts, { pos: a.pos, confidence: conf, actorId: a.id });
      this.say(trig, facts);
    }
    // mutamenti notati su oggetti già visti (dubbi di memoria)
    for (const o of this.byId.values()) {
      if (Math.abs(o.pos.x - p.pos.x) > 16 || Math.abs(o.pos.z - p.pos.z) > 16 || o.containerId) continue;
      const pose = this.pose(o.id)!;
      const d = this.playerDistance(pose);
      if (d > 14 || (d > 4 && this.angleTo(pose) > 0.9)) continue;
      const sig = this.signature(o.id);
      const mem = this.memory.get(o.id);
      if (mem === undefined) { this.memory.set(o.id, sig); continue; }
      if (mem === sig) continue;
      this.memory.set(o.id, sig);
      if (o.kind === 'trace' || o.kind === 'lamp' || o.kind === 'lamp_post') continue;
      const moved = mem.split('|')[0] !== sig.split('|')[0];
      const facts: Facts = { moved };
      const before = /\|(?:state|flap|color|on|tipped|open|running)=([^|]*)/.exec(mem)?.[1], after = /\|(?:state|flap|color|on|tipped|open|running)=([^|]*)/.exec(sig)?.[1];
      if (before !== after && before !== undefined && after !== undefined) { facts.before = before; facts.after = after; }
      this.observe('changed', o.kind, facts, { pos: pose, objectId: o.id, confidence: 0.6 });
      this.say('changed', { object: o.kind, ...facts });
    }
  }

  private checkArrival() {
    const poi = this.model.poiAt(this.state.player.pos);
    if (!poi) return;
    if (!this.visited.has(poi.id)) {
      this.visited.add(poi.id);
      const m = this.state.missions.find((x) => x.poiId === poi.id && x.state === 'pending');
      this.say('arrive_poi', { poi: poi.id, object: m ? this.byId.get(m.targetObjectId)?.kind : undefined });
    }
    if (poi.type === 'car_park' && this.allReported() && !this.flags.has('back')) { this.flags.add('back'); this.say('back_at_car', {}); }
  }

  // ---------------------------------------------------------------- interazioni

  allReported(): boolean { return this.state.missions.every((m) => m.state === 'reported'); }

  isAvailable(id: string): boolean {
    const o = this.byId.get(id);
    return !!o && isObjectAvailable(this.state, o, (i) => this.byId.get(i));
  }

  /** Azione contestuale principale per un oggetto, o null se non interagibile ora. */
  actionFor(id: string): ActionId | null {
    const o = this.byId.get(id);
    const st = this.state.objects[id];
    if (!o || !st || !this.isAvailable(id)) return null;
    switch (o.kind) {
      case 'door': return st.state === 'open' ? 'close' : 'try_door';
      case 'switch': return 'toggle';
      case 'lamp': return st.portable ? 'toggle' : null;
      case 'generator': return st.running ? 'stop' : 'start';
      case 'drawer': case 'cooler': case 'car_trunk': return st.open ? 'close' : 'open';
      case 'tent': return st.flap === 'closed' ? 'open_flap' : st.checked ? 'close_flap' : 'check';
      case 'panel': return !st.open ? 'open' : st.breaker === 'tripped' ? 'reset_breaker' : 'close';
      case 'vehicle': return 'inspect_vehicle';
      case 'sign': return 'read';
      case 'bin': return st.tipped ? 'straighten' : 'check';
      case 'campfire': return st.state === 'cold' ? 'check' : 'douse';
      case 'chair': return st.tipped ? 'straighten' : null;
      case 'item': return 'inspect_item';
      case 'battery': return 'take';
      case 'police_car': return this.allReported() ? 'end_shift' : 'headlights';
      case 'bridge_plate': return 'check_plate';
      case 'logbox': return 'sign_log';
      default: return null;
    }
  }

  canReach(id: string): boolean {
    const pose = this.pose(id);
    if (!pose) return false;
    const o = this.byId.get(id)!;
    return this.playerDistance(pose) <= (o.interactRadius ?? INTERACT_RANGE) + (o.kind === 'police_car' || o.kind === 'vehicle' ? 1.6 : 0);
  }

  /** PNG abbastanza vicino e davanti per rivolgergli la parola. */
  talkTarget(): ActorState | null {
    let best: ActorState | null = null, bd = 4.2;
    for (const a of this.state.actors) {
      if (a.kind !== 'npc' || !a.present || !a.visible) continue;
      const d = this.playerDistance(a.pos);
      if (d < bd && this.angleTo(a.pos) < 0.6) { bd = d; best = a; }
    }
    return best;
  }
  talk(actorId: string): void {
    const facts = this.sim.npcTalk(actorId);
    if (!facts) return;
    const a = this.state.actors.find((x) => x.id === actorId);
    this.out.lines.push({ text: this.composer.npcLine(facts), speaker: a?.name ?? '', tts: false });
    this.observe('heard', 'person', { ...facts }, { pos: a?.pos, actorId });
  }

  /** Esegue l'azione principale sull'oggetto. Restituisce l'azione svolta o null. */
  interact(id: string): ActionId | null {
    const st = this.state;
    if (st.ended || st.abandoned) return null;
    const o = this.byId.get(id);
    const action = this.actionFor(id);
    if (!o || !action || !this.canReach(id)) return null;
    const os = st.objects[id];
    const before = { ...os };
    const facts: Facts = {};
    const cause = (type: string, sound?: SoundKind, loud = 18): Cause => ({ origin: 'player', type, sound: sound ? { kind: sound, loudness: loud } : undefined });
    const snd = (kind: SoundKind) => { const p = this.pose(id)!; this.out.sounds.push({ kind, pos: { x: p.x, y: o.y + 0.5, z: p.z } }); };
    let ev: WorldEvent | null = null;
    let trigger: CommentTrigger = 'interaction';
    switch (action) {
      case 'try_door':
        if (os.state === 'locked') { facts.state = 'locked'; snd('door_locked'); ev = this.emit({ type: 'door_tried', pos: o.pos, origin: 'player', objectId: id, sound: { kind: 'door_locked', loudness: 10 } }); trigger = 'locked'; }
        else { facts.state = os.state === 'ajar' ? 'ajar' : 'unlocked'; snd('door_open'); ev = this.setObjectState(id, { state: 'open' }, cause('door_opened', 'door_open', 16)); }
        break;
      case 'close':
        if (o.kind === 'door') { snd('door_close'); ev = this.setObjectState(id, { state: 'closed' }, cause('door_closed', 'door_close', 16)); facts.state = 'closed'; }
        else { snd(o.kind === 'car_trunk' ? 'car_door' : o.kind === 'panel' ? 'click' : 'drawer'); ev = this.setObjectState(id, { open: false }, cause('closed')); facts.state = 'closed'; }
        break;
      case 'open':
        snd(o.kind === 'car_trunk' ? 'car_door' : o.kind === 'panel' ? 'click' : 'drawer');
        ev = this.setObjectState(id, { open: true }, cause('opened'));
        facts.state = o.kind === 'panel' ? String(os.breaker) : 'open';
        if (o.kind !== 'panel') { const inside = [...this.byId.values()].filter((c) => c.containerId === id && this.isAvailable(c.id)); facts.detail = inside.length ? (inside[0].kind === 'battery' ? 'battery' : 'note') : 'nothing'; if (inside.some((c) => c.kind === 'battery')) this.say('battery_found', {}); }
        break;
      case 'toggle': {
        const on = !os.on;
        snd('switch');
        ev = this.setObjectState(id, { on }, cause(on ? 'switched_on' : 'switched_off', 'switch', 6));
        facts.state = on ? 'on' : 'off'; facts.before = before.on ? 'on' : 'off';
        if (o.kind === 'switch' && on && (o.links ?? []).length && !(o.links ?? []).some((l) => isLampLit(st, this.byId.get(l)!))) facts.detail = 'no_power';
        break;
      }
      case 'start':
        if (Number(os.fuel ?? 1) > 0.02) { snd('generator_start'); ev = this.setObjectState(id, { running: true }, cause('generator_started', 'generator_start', 60)); facts.state = 'running'; }
        else { snd('generator_stop'); ev = this.emit({ type: 'generator_failed', pos: o.pos, origin: 'player', objectId: id, sound: { kind: 'generator_stop', loudness: 25 } }); facts.state = 'stopped'; facts.detail = 'no_fuel'; }
        facts.before = 'stopped';
        break;
      case 'stop': snd('generator_stop'); ev = this.setObjectState(id, { running: false }, cause('generator_stopped', 'generator_stop', 30)); facts.state = 'stopped'; facts.before = 'running'; break;
      case 'open_flap': snd('tent_zip'); ev = this.setObjectState(id, { flap: 'open', checked: true }, cause('tent_opened', 'tent_zip', 9)); facts.state = os.occupied ? 'occupied' : 'empty'; facts.detail = os.content === 'empty' ? 'nothing' : String(os.content); facts.color = String(os.color); break;
      case 'check':
        if (o.kind === 'tent') { os.checked = true; facts.state = os.occupied ? 'occupied' : 'empty'; facts.detail = os.content === 'empty' ? 'nothing' : String(os.content); }
        else if (o.kind === 'bin') { snd('metal_clank'); facts.state = 'upright'; facts.detail = os.content === 'empty' ? 'nothing' : String(os.content); }
        else if (o.kind === 'campfire') { facts.state = 'cold'; facts.detail = 'ash'; }
        ev = this.emit({ type: 'checked', pos: o.pos, origin: 'player', objectId: id });
        break;
      case 'close_flap': snd('tent_zip'); ev = this.setObjectState(id, { flap: 'closed' }, cause('tent_closed', 'tent_zip', 9)); facts.state = 'closed'; break;
      case 'reset_breaker': snd('breaker'); ev = this.setObjectState(id, { breaker: 'ok' }, cause('breaker_reset', 'breaker', 12)); facts.state = 'ok'; facts.before = 'tripped'; break;
      case 'inspect_vehicle': snd('click'); facts.state = 'empty'; facts.detail = String(os.detail); facts.plate = String(os.plate); ev = this.emit({ type: 'vehicle_inspected', pos: o.pos, origin: 'player', objectId: id }); break;
      case 'read': { const text = String(st.lang === 'it' ? os.textIt : os.textEn); this.out.lines.push({ text: `«${text}»`, tts: false }); ev = this.emit({ type: 'sign_read', pos: o.pos, origin: 'player', objectId: id }); this.observe('read', 'sign', {}, { objectId: id, pos: o.pos }); this.memory.set(id, this.signature(id)); return action; }
      case 'straighten': snd(o.kind === 'bin' ? 'metal_clank' : 'chair_scrape'); facts.state = 'tipped'; facts.detail = o.kind === 'bin' ? (os.content === 'empty' ? 'nothing' : String(os.content)) : undefined; ev = this.setObjectState(id, { tipped: false }, cause('straightened', 'metal_clank', 14)); break;
      case 'douse': snd('fire_douse'); facts.state = os.state === 'burning' ? 'burning' : 'warm'; ev = this.setObjectState(id, { state: 'cold' }, cause('fire_doused', 'fire_douse', 12)); break;
      case 'inspect_item': {
        this.inspecting = id;
        os.inspected = true;
        if (o.item?.mysteryId !== undefined && o.item.clueIndex !== undefined) { const my = st.mysteries.find((m) => m.id === o.item!.mysteryId); if (my && !my.discovered.includes(o.item.clueIndex)) my.discovered.push(o.item.clueIndex); }
        this.out.sounds.push({ kind: 'paper', gain: 0.6 });
        this.observe('read', 'item', { item: o.item?.kind, detail: o.item?.kind === 'note' ? 'note' : undefined }, { objectId: id, pos: o.pos });
        ev = this.emit({ type: 'item_inspected', pos: o.pos, origin: 'player', objectId: id });
        this.sim.onPlayerEvent(ev);
        return action;
      }
      case 'take': snd('battery'); ev = this.setObjectState(id, { taken: true }, cause('battery_taken'));
        if (st.torch.charge < 0.3) { st.torch.charge = 1; this.out.notices.push({ key: 'notice.batterySwapped' }); } else { st.torch.spares++; this.out.notices.push({ key: 'notice.batteryTaken' }); }
        this.flags.delete('torch_low');
        break;
      case 'headlights': {
        const on = !os.headlights;
        snd('click');
        ev = this.setObjectState(id, { headlights: on }, cause(on ? 'headlights_on' : 'headlights_off'));
        if (!this.allReported() && !this.flags.has('car_note')) {
          this.flags.add('car_note');
          const n = st.missions.filter((m) => m.state !== 'reported').length;
          this.out.notices.push({ key: 'notice.shiftNotDone', params: { n } });
          this.say('not_done_at_car', { remaining: n }, true);
        }
        this.memory.set(id, this.signature(id));
        if (ev) this.sim.onPlayerEvent(ev);
        return action;
      }
      case 'end_shift': snd('car_door'); st.ended = true; st.endedAt = st.time; this.emit({ type: 'shift_ended', pos: o.pos, origin: 'player', objectId: id }); return action;
      case 'check_plate': snd('metal_clank'); facts.state = String(os.state); facts.count = Number(os.year); ev = this.emit({ type: 'plate_checked', pos: o.pos, origin: 'player', objectId: id }); break;
      case 'sign_log': snd('paper'); facts.state = 'signed'; facts.count = Number(os.entries); ev = this.setObjectState(id, { signed: true }, cause('log_signed')); break;
      default: return null;
    }
    this.memory.set(id, this.signature(id));
    for (const l of o.links ?? []) if (this.byId.has(l)) this.memory.set(l, this.signature(l));
    const mission = st.missions.find((m) => m.targetObjectId === id && m.state === 'pending');
    const hit = mission && missionSatisfiedBy(mission, action, before, st.objects[id]);
    this.observe('interaction', o.kind, facts, { objectId: id, pos: o.pos, missionId: mission?.id ?? st.missions.find((m) => m.targetObjectId === id)?.id });
    if (mission && hit) {
      mission.state = 'inspected';
      mission.inspectedAt = st.time;
      mission.outcome = { ...(mission.outcome ?? {}), ...Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined)) } as Mission['outcome'];
      this.out.notices.push({ key: 'notice.missionInspected' });
    }
    if (ev) this.sim.onPlayerEvent(ev);
    this.say(trigger, { object: o.kind, poi: o.poiId, ...facts });
    return action;
  }

  inspectedId(): string | null { return this.inspecting; }
  inspectInfo(): { title: string; note: string } | null {
    const o = this.inspecting ? this.byId.get(this.inspecting) : undefined;
    if (!o?.item) return null;
    const lang = this.state.lang;
    return { title: o.item.title[lang], note: this.composer.itemNote(o.item.kind, { text: o.item.text?.[lang], poi: o.poiId }) };
  }
  endInspect(): void {
    if (!this.inspecting) return;
    const o = this.byId.get(this.inspecting);
    this.inspecting = null;
    this.out.sounds.push({ kind: 'paper', gain: 0.4 });
    if (o) this.say('item_inspected', { item: o.item?.kind });
  }

  toggleTorch(): void {
    const t = this.state.torch;
    t.on = !t.on;
    this.out.sounds.push({ kind: 'torch_click' });
    if (t.on && t.charge <= 0) this.out.notices.push({ key: 'notice.torchDead' });
  }

  torchRender(phoneOpen = false): TorchRender {
    const t = this.state.torch;
    let intensity = 0;
    if (t.on && t.charge > 0) intensity = (t.charge > 0.12 ? 1 : 0.35 + (t.charge / 0.12) * 0.65) * (1 - t.flicker);
    return { on: t.on, intensity, phoneGlow: phoneOpen ? 0.8 : intensity < 0.05 ? 0.45 : 0 };
  }

  // ---------------------------------------------------------------- foto e rapporti

  /** Soggetti realmente inquadrabili ora (attori fotografabili e oggetti vicini nel campo visivo). */
  photoSubjects(): { subjects: string[]; hiddenActorIds: string[] } {
    const subjects = new Set<string>();
    const hidden: string[] = [];
    for (const a of this.state.actors) {
      if (!a.present || !a.visible) continue;
      const d = this.playerDistance(a.pos);
      if (d > 120 || this.angleTo(a.pos) > 0.62 || !this.lineOfSight(a.pos)) continue;
      if (!a.photographable) { hidden.push(a.id); continue; }
      subjects.add(a.archetype === 'light' ? 'light' : a.kind === 'npc' ? 'person' : a.kind === 'fauna' ? 'animal' : 'figure');
    }
    for (const o of this.byId.values()) {
      if (Math.abs(o.pos.x - this.state.player.pos.x) > 18 || !this.isAvailable(o.id)) continue;
      const pose = this.pose(o.id)!;
      if (this.model.indoorsAt(pose.x, pose.z) && !this.state.player.indoors) continue; // dietro una parete
      if (this.playerDistance(pose) < 16 && this.angleTo(pose) < 0.6) subjects.add(o.kind);
    }
    return { subjects: [...subjects], hiddenActorIds: hidden };
  }

  addPhoto(dataUrl: string, subjects: string[]): Photo | null {
    const st = this.state;
    if (st.photos.length >= MAX_PHOTOS) { this.out.notices.push({ key: 'notice.photoFull' }); return null; }
    const id = (st.photos[st.photos.length - 1]?.id ?? 0) + 1;
    const photo: Photo = { id, t: st.time, dataUrl, bytes: Math.round(dataUrl.length * 0.75), pos: { ...st.player.pos }, yaw: st.player.yaw, poiId: this.model.poiAt(st.player.pos)?.id, subjects };
    st.photos.push(photo);
    this.out.sounds.push({ kind: 'camera' });
    this.out.notices.push({ key: 'notice.photoSaved' });
    this.observe('photo', 'photo', { count: subjects.length }, { source: 'camera' });
    this.say('photo', {});
    return photo;
  }
  deletePhoto(id: number): void {
    if (this.state.reports.some((r) => r.photoIds.includes(id))) return; // non si alterano rapporti già prodotti
    this.state.photos = this.state.photos.filter((p) => p.id !== id);
  }

  private reportObservations(m: Mission): Observation[] {
    return this.state.observations.filter((o) => o.missionId === m.id || (o.poiId === m.poiId && (o.kind === 'saw' || o.kind === 'heard' || o.kind === 'changed')));
  }
  reportDraft(missionId: string): string {
    const m = this.state.missions.find((x) => x.id === missionId);
    if (!m || m.state === 'pending') return '';
    const done = this.state.reports.find((r) => r.missionId === missionId);
    if (done) return done.text;
    return this.composer.report(m, this.reportObservations(m), { hour: this.cachedSky.hour, photoCount: 0 });
  }
  submitReport(missionId: string, photoIds: number[]): Report | null {
    const st = this.state;
    const m = st.missions.find((x) => x.id === missionId);
    if (!m || m.state !== 'inspected') return null;
    const obs = this.reportObservations(m);
    const valid = photoIds.filter((id) => st.photos.some((p) => p.id === id));
    const report: Report = { id: st.reports.length + 1, missionId, t: st.time, text: this.composer.report(m, obs, { hour: this.cachedSky.hour, photoCount: valid.length }), photoIds: valid, observationIds: obs.map((o) => o.id) };
    st.reports.push(report);
    m.state = 'reported';
    m.reportedAt = st.time;
    this.out.sounds.push({ kind: 'report_sent' });
    this.out.notices.push({ key: 'notice.reportSent' });
    this.emit({ type: 'report_filed', pos: st.player.pos, origin: 'player', props: { mission: m.id } });
    const r = this.rng('sms');
    const left = st.missions.filter((x) => x.state !== 'reported').length;
    if (left === 0) { this.at(5 + r.next() * 6, () => this.sendSms('all_reports_ack', {})); this.say('all_done', { remaining: 0 }, true); }
    else { if (r.chance(0.7)) this.at(8 + r.next() * 14, () => this.sendSms('ack_report', { poi: m.poiId })); this.say('report_done', { remaining: left, poi: m.poiId }); }
    return report;
  }

  markRead(id: number): void { const m = this.state.messages.find((x) => x.id === id); if (m) m.read = true; }
  unread(): number { return this.state.messages.filter((m) => !m.read).length; }
  abandon(): void { this.state.abandoned = true; }

  // ---------------------------------------------------------------- viste

  private mapStatic: { lang: string; edges: MapView['edges']; pois: MapView['pois'] } | null = null;

  /** Mappa per il telefono e per il navigatore: parti fisse in cache, giocatore e segnalini aggiornati. */
  mapView(): MapView {
    const st = this.state, lang = st.lang;
    if (!this.mapStatic || this.mapStatic.lang !== lang) {
      this.mapStatic = {
        lang, edges: this.spec.edges.map((e) => ({ kind: e.kind, points: e.points })),
        pois: this.spec.pois.filter((p) => p.type !== 'bridge').map((p) => ({ name: p.name[lang], type: p.type, pos: p.pos })),
      };
    }
    const t = this.spec.terrain;
    return {
      size: this.spec.size, edges: this.mapStatic.edges, pois: this.mapStatic.pois,
      lake: t.lake ? { center: t.lake.center, radius: t.lake.radius } : undefined, river: t.river?.points, car: this.spec.carSpawn.pos,
      player: { pos: st.player.pos, yaw: st.player.yaw }, glitch: this.sim.interference().gps,
      targets: st.missions.map((m, i) => {
        const p = this.pose(m.targetObjectId) ?? this.model.poi(m.poiId)?.pos ?? { x: 0, z: 0 };
        return { n: i + 1, pos: { x: p.x, z: p.z }, state: m.state };
      }),
    };
  }

  phoneView(): PhoneView {
    const st = this.state;
    const lang = st.lang;
    const inter = this.sim.interference();
    const base = 2 + Math.round(hash2(Math.round(st.player.pos.x / 120), Math.round(st.player.pos.z / 120), this.spec.seed) * 2);
    const map = this.mapView();
    return {
      clock: clockString(this.cachedSky.hour), signal: clamp(Math.round(base * (1 - inter.phone)), 0, 4), torchCharge: st.torch.charge, torchSpares: st.torch.spares,
      messages: st.messages, photos: st.photos, maxPhotos: MAX_PHOTOS, reports: st.reports, map, allReported: this.allReported(),
      missions: st.missions.map((m, i) => ({ id: m.id, n: i + 1, title: m.text[lang], place: this.model.poi(m.poiId)?.name[lang] ?? '', state: m.state, canReport: m.state === 'inspected' })),
    };
  }

  summary(baseUrl: string): SummaryView {
    const st = this.state;
    const sep = baseUrl.includes('?') ? baseUrl.slice(0, baseUrl.indexOf('?')) : baseUrl;
    const log = chronicle(st, this.spec, st.lang);
    return {
      seed: st.seed, officer: `${this.spec.officer.first} ${this.spec.officer.last}`, durationSeconds: Math.round(st.endedAt ?? st.time),
      outcome: st.death ? 'killed' : 'completed',
      missionsCompleted: st.missions.filter((m) => m.state === 'reported').length,
      reports: st.reports.map((r) => ({ title: st.missions.find((m) => m.id === r.missionId)!.text[st.lang], text: r.text })), shareUrl: `${sep.split('#')[0]}?seed=${st.seed}`,
      chronicle: log, chronicleText: chronicleText(log, `The Dark Seed — seed ${st.seed} — ${this.spec.officer.first} ${this.spec.officer.last}`, st.lang),
    };
  }

  soundscapeContext(): SoundscapeContext {
    const p = this.state.player.pos;
    let town = Infinity;
    for (const poi of this.spec.pois) if (poi.type === 'town' || poi.type === 'gas_station') town = Math.min(town, Math.hypot(poi.pos.x - p.x, poi.pos.z - p.z));
    return {
      time: this.state.time, hour: this.cachedSky.hour, weather: this.cachedWeather, pos: p, forestDensity: this.model.forestDensityAt(p.x, p.z),
      waterDistance: this.model.waterDistance(p), townDistance: town, indoors: this.state.player.indoors, playerNoise: this.noise, hushSources: this.sim.hushSources(),
    };
  }

  /** Sorgenti sonore continue vicine: generatori accesi, fuochi, acqua. */
  loops(): { id: string; kind: 'generator' | 'fire' | 'lamp_buzz'; pos: Vec3Like; gain: number }[] {
    const out: ReturnType<GameSession['loops']> = [];
    const p = this.state.player.pos;
    for (const o of this.byId.values()) {
      if (Math.abs(o.pos.x - p.x) > 90 || Math.abs(o.pos.z - p.z) > 90) continue;
      const s = this.state.objects[o.id];
      if (o.kind === 'generator' && s.running) out.push({ id: o.id, kind: 'generator', pos: { x: o.pos.x, y: o.y + 0.5, z: o.pos.z }, gain: 0.9 });
      else if (o.kind === 'campfire' && s.state === 'burning') out.push({ id: o.id, kind: 'fire', pos: { x: o.pos.x, y: o.y + 0.3, z: o.pos.z }, gain: 0.7 });
      else if (o.kind === 'lamp_post' && isLampLit(this.state, o) && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 25) out.push({ id: o.id, kind: 'lamp_buzz', pos: { x: o.pos.x, y: o.y + 4, z: o.pos.z }, gain: 0.35 });
    }
    return out;
  }

  /** Svuota e restituisce gli effetti di presentazione accumulati. */
  drain(): Presentation {
    const o = { sounds: this.out.sounds.splice(0), lines: this.out.lines.splice(0), notices: this.out.notices.splice(0), footsteps: this.out.footsteps.splice(0) };
    return o;
  }

  missionDef(m: Mission) { return MISSION_TYPES[m.type]; }
}

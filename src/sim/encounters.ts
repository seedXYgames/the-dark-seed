// Incontri fisici del bosco: deterministici, separati dalle anomalie percettive.
import { WORLD_HALF, type ActorState, type Vec2, type WorldEvent } from '../core/contracts';
import { streamFor, type Rng } from '../core/rng';
import { toLocal, type WorldModel } from '../world/model';
import type { SimHost } from './host';

export type EncounterKind = 'none' | 'bigfoot' | 'aliens' | 'cult';
export function encounterPlan(seed: number) {
  const r = streamFor(seed, 'encounters');
  const kind = r.weighted<EncounterKind>(['none', 'bigfoot', 'aliens', 'cult'], k => ({ none: 70, bigfoot: 10, aliens: 12, cult: 8 })[k]);
  return { kind, count: kind === 'bigfoot' ? 1 : kind === 'none' ? 0 : r.int(2, 5),
    skin: r.pick(['green', 'grey'] as const), setting: r.pick(['wreck', 'tents'] as const) };
}
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Vista degli incontri: terreno e volumi degli edifici occludono anche la torcia. */
export function encounterSight(model: WorldModel, from: Vec2, to: Vec2): boolean {
  const n = Math.max(2, Math.ceil(distance(from, to) / 1.5));
  const y0 = model.groundAt(from.x, from.z) + 1.6, y1 = model.groundAt(to.x, to.z) + 1.3;
  for (let i = 1; i < n; i++) {
    const t = i / n, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t, y = y0 + (y1 - y0) * t;
    if (model.heightAt(x, z) > y - 0.15) return false;
    for (const b of model.spec.buildings) {
      const [lx, lz] = toLocal(x, z, b.pos.x, b.pos.z, b.rotY);
      if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2 && y < b.floorY + b.h) return false;
    }
  }
  return true;
}

export class Encounters {
  private readonly r: Rng;
  private members: ActorState[] = [];
  private site: Vec2 = { x: 0, z: 0 };
  private senseAt = 0;
  private soundAt = 0;
  private logCursor = 0;
  private noises: WorldEvent[] = [];
  constructor(private h: SimHost) {
    this.r = h.rng('encounters').fork('behaviour');
    const plan = encounterPlan(h.spec.seed);
    if (plan.kind === 'none') return;
    const pois = this.r.shuffle(h.spec.pois.filter(p => p.type !== 'car_park' && p.type !== 'bridge' && distance(p.pos, h.spec.carSpawn.pos) > 180));
    const reachable = h.model.reachable(h.spec.playerSpawn.pos);
    let found = false, poiId = '';
    for (const poi of pois) {
      for (let i = 0; i < 50; i++) {
        const a = this.r.range(0, Math.PI * 2), d = poi.radius + this.r.range(35, 75);
        const p = { x: poi.pos.x + Math.sin(a) * d, z: poi.pos.z + Math.cos(a) * d };
        if (Math.abs(p.x) > WORLD_HALF - 80 || Math.abs(p.z) > WORLD_HALF - 80 || distance(p, h.spec.carSpawn.pos) < 120 || !reachable.at(p.x, p.z)) continue;
        // Un sito asciutto e senza muri, rocce o tronchi per i personaggi e gli oggetti scenici.
        let clear = true;
        for (let x = -7; x <= 7 && clear; x += 3.5) for (let z = -7; z <= 7; z += 3.5) {
          const q = { x: p.x + x, z: p.z + z }, resolved = h.model.resolve(q.x, q.z, 0.5, () => false);
          if (h.model.waterDepthAt(q.x, q.z) > 0.05 || h.model.slopeAt(q.x, q.z) > 0.65 || distance(q, resolved) > 0.3 || h.model.indoorsAt(q.x, q.z)) { clear = false; break; }
        }
        if (!clear) continue;
        this.site = p; poiId = poi.id; found = true; break;
      }
      if (found) break;
    }
    if (!found) return; // non forzare un incontro in un sito irraggiungibile
    const arch = plan.kind === 'bigfoot' ? 'bigfoot' : plan.kind === 'cult' ? 'cultist' : `alien_${plan.skin}`;
    for (let i = 0; i < plan.count; i++) {
      const angle = i * Math.PI * 2 / plan.count + this.r.range(-0.18, 0.18), radius = plan.kind === 'bigfoot' ? 0 : 4.5;
      const a = this.actor(`${arch}.${i}`, arch, { x: this.site.x + Math.sin(angle) * radius, z: this.site.z + Math.cos(angle) * radius }, poiId);
      a.heading = angle + Math.PI;
      a.state = plan.kind === 'cult' ? 'ritual' : plan.kind === 'aliens' ? 'working' : 'patrol';
      a.data.homeX = a.pos.x; a.data.homeZ = a.pos.z;
      a.data.fleeAfter = this.r.range(120, 210); a.data.alert = 0;
      this.members.push(a);
    }
    if (plan.kind !== 'bigfoot') this.actor('site', plan.kind === 'cult' ? 'ritual_site' : plan.setting === 'wreck' ? 'ufo_wreck' : 'alien_tents', this.site, poiId);
    h.emit({ type: 'encounter_present', pos: this.site, origin: plan.kind === 'cult' ? 'npc' : 'anomaly', radius: 0, props: { kind: plan.kind, count: plan.count, setting: plan.setting }, persistent: true });
    this.soundAt = this.r.range(12, 30);
  }

  private actor(id: string, archetype: string, pos: Vec2, poiId: string): ActorState {
    const a: ActorState = { id: `encounter.${id}`, kind: 'encounter', archetype, pos, heading: 0, goal: 'site', routine: [], stepIndex: 0, stepTimer: 0,
      state: 'idle', speed: 0, present: true, visible: true, lightOn: false, percepts: [], knowledge: [], capabilities: [], drives: {}, photographable: true,
      homePoiId: poiId, ownsObjectIds: [], cooldown: 0, nextThink: 0, data: {} };
    this.h.state.actors.push(a); return a;
  }

  private move(a: ActorState, target: Vec2, speed: number, dt: number) {
    const d = distance(a.pos, target);
    if (d < 0.5) { a.data.moving = false; return; }
    const angle = Math.atan2(target.x - a.pos.x, target.z - a.pos.z), step = Math.min(speed * dt, d);
    const door = (id: string) => this.h.state.objects[id]?.state === 'open';
    let best = a.pos, score = -Infinity, heading = angle;
    // Sonda i passaggi attorno a tronchi e muri senza teletrasportare gli attori.
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const th = angle + turn, x = Math.sin(th), z = Math.cos(th);
      const probe = this.h.model.move(a.pos, x * 1.8, z * 1.8, door, 0.3);
      const p = this.h.model.move(a.pos, x * step, z * step, door, 0.3);
      const moved = distance(a.pos, p);
      if (moved > step * 1.4 + 0.03 || this.h.model.waterDepthAt(p.x, p.z) > 0.25) continue;
      const merit = (d - distance(probe, target)) + moved * 2 - Math.abs(turn) * 0.12;
      if (merit > score) { score = merit; best = p; heading = th; }
      if (turn === 0 && distance(a.pos, probe) > 1.65 && moved > step * 0.9) break;
    }
    a.data.moving = distance(a.pos, best) > 0.005; a.pos = best; a.heading = heading;
  }

  step(dt: number) {
    const h = this.h, st = h.state;
    if (st.ended || !this.members.length) return;
    // Il rumore fa cercare il punto d'origine: non concede conoscenza onnisciente del giocatore.
    this.noises.push(...st.log.slice(this.logCursor).filter(e => e.origin === 'player' && (e.sound?.loudness ?? 0) >= 15));
    this.noises = this.noises.filter(e => st.time - e.t < 1.2);
    this.logCursor = st.log.length;
    const sense = st.time >= this.senseAt;
    if (sense) this.senseAt = st.time + 0.25;
    for (const a of this.members) {
      if (!a.present) continue;
      const alien = a.archetype.startsWith('alien_'), big = a.archetype === 'bigfoot', d = distance(a.pos, st.player.pos);
      if (sense && a.state !== 'flee') {
        const angle = Math.atan2(st.player.pos.x - a.pos.x, st.player.pos.z - a.pos.z) - a.heading;
        const facing = Math.cos(angle) > 0.25;
        const torch = st.torch.on && st.torch.charge > 0 && st.torch.fault <= 0;
        const daylight = h.sky().ambient;
        const sightRange = (torch ? 48 : 10 + daylight * 35) * (1 - h.weather().fog * 0.45);
        const seen = d < sightRange && (facing || d < 4) && encounterSight(h.model, a.pos, st.player.pos);
        const heard = st.player.running && d < 32 * (1 - h.weather().wind * 0.4) && !st.player.indoors;
        const noise = this.noises.find(e => distance(a.pos, e.pos) < Math.min(45, e.sound!.loudness));
        const noticed = seen || heard || !!noise;
        a.data.alert = Math.max(0, Math.min(1.5, Number(a.data.alert) + (noticed ? 0.3 : -0.16)));
        if (noticed) {
          const p = seen || heard ? st.player.pos : noise!.pos;
          a.data.lastX = p.x; a.data.lastZ = p.z; a.data.lastSense = st.time;
        }
        if (Number(a.data.alert) >= 0.85 && a.state !== 'chase') {
          a.state = 'chase';
          if (a.data.started === undefined) a.data.started = st.time;
          h.emit({ type: 'encounter_alert', pos: a.pos, actorId: a.id, origin: alien || big ? 'anomaly' : 'npc', radius: 5,
            sound: { kind: alien ? 'alien_call' : big ? 'bigfoot_growl' : 'voice_far', loudness: 65 }, tags: ['reaction'] });
        }
      }
      if (alien && a.data.started !== undefined && st.time - Number(a.data.started) > Number(a.data.fleeAfter) && a.state !== 'flee') {
        a.state = 'flee'; a.data.fleeAt = st.time;
        h.emit({ type: 'encounter_fled', pos: a.pos, actorId: a.id, origin: 'anomaly', radius: 0 });
      }
      if (a.state === 'flee') {
        const angle = Math.atan2(a.pos.x - st.player.pos.x, a.pos.z - st.player.pos.z);
        const target = { x: Math.max(-675, Math.min(675, a.pos.x + Math.sin(angle) * 30)), z: Math.max(-675, Math.min(675, a.pos.z + Math.cos(angle) * 30)) };
        this.move(a, target, 10, dt);
        if (st.time - Number(a.data.fleeAt) > 6 && distance(a.pos, st.player.pos) > 65 && !h.playerCanSee(a.pos)) { a.present = false; a.visible = false; }
      } else if (a.state === 'chase') {
        const last = { x: Number(a.data.lastX), z: Number(a.data.lastZ) };
        if (alien && d < 5) a.data.moving = false;
        else this.move(a, last, alien ? 3.4 : big ? 5.1 : 4.3, dt);
        if (!alien && d < (big ? 1.65 : 1.3) && encounterSight(h.model, a.pos, st.player.pos)) {
          st.death = { actorId: a.id, kind: big ? 'bigfoot' : 'cultist' }; st.ended = true; st.endedAt = st.time;
          h.emit({ type: 'officer_killed', pos: st.player.pos, actorId: a.id, origin: big ? 'anomaly' : 'npc', radius: 3 });
          break;
        }
        if (st.time - Number(a.data.lastSense ?? 0) > 12) { a.state = 'search'; a.stepTimer = 18; }
      } else if (a.state === 'search') {
        a.stepTimer -= dt;
        if (a.stepTimer <= 0) { a.state = alien ? 'working' : big ? 'patrol' : 'ritual'; a.data.alert = 0; }
        else { a.heading += dt * 0.45; a.data.moving = false; }
      } else if (Number(a.data.alert) > 0 && a.data.lastX !== undefined) {
        // Si gira verso luce/rumore e ascolta: la pattuglia non deve cancellare il sospetto.
        a.heading = Math.atan2(Number(a.data.lastX) - a.pos.x, Number(a.data.lastZ) - a.pos.z);
        a.data.moving = false;
      } else {
        // Lavoro attorno al relitto, rito in cerchio, o pattuglia corta attorno al luogo.
        const t = st.time * (big ? 0.035 : 0.08) + Number(a.data.homeX) * 0.7;
        const r = big ? 7 : 0.8;
        this.move(a, { x: Number(a.data.homeX) + Math.sin(t) * r, z: Number(a.data.homeZ) + Math.cos(t) * r }, big ? 0.8 : 0.45, dt);
        if (!big) a.heading = Math.atan2(this.site.x - a.pos.x, this.site.z - a.pos.z);
      }
    }
    if (st.time > this.soundAt) {
      this.soundAt = st.time + this.r.range(12, 26);
      const active = this.members.filter(a => a.present && a.state !== 'flee');
      if (active.length) {
        const a = this.r.pick(active), alien = a.archetype.startsWith('alien_');
        h.emit({ type: 'encounter_sound', pos: a.pos, actorId: a.id, origin: a.archetype === 'cultist' ? 'npc' : 'anomaly', radius: 0,
          sound: { kind: alien ? 'alien_call' : a.archetype === 'bigfoot' ? 'bigfoot_growl' : 'cult_chant', loudness: a.state === 'chase' ? 85 : 55 }, tags: ['reaction'] });
      }
    }
  }
}

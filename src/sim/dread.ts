// Regia della paura: piccoli "colpi" rari e deterministici (dal seed) che non hanno spiegazione.
// Ogni colpo è annunciato dal silenzio: la natura si zittisce intorno al giocatore per qualche secondo,
// poi (quasi sempre) succede qualcosa, poi i suoni tornano piano. A volte il silenzio non porta a nulla.
// Colpi possibili:
//  - qualcosa cambia alle spalle (porta, fari dell'auto, cartello, lampione, l'omino dove eri passato);
//  - un passo in più dietro di te quando ti fermi;
//  - colpi sulla carrozzeria dell'auto quando sei lontano;
//  - la torcia sfarfalla, il GPS sposta il puntino.
// Inoltre: la torcia sfarfalla quando inquadri una presenza, e i misteri programmati sono preceduti dal silenzio.
import type { ActorState, Vec2, WorldObjectSpec } from '../core/contracts';
import { clamp, streamFor } from '../core/rng';
import { isLampLit } from './objects';
import type { SimHost } from './host';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
type Hush = { pos: Vec2; radius: number; strength: number };
type Action = 'behind' | 'mimic' | 'knock' | 'flicker' | 'gps' | 'nothing';

/** Durata del silenzio che precede un colpo (s). */
export const DREAD_HUSH = 4;
/** Dopo il colpo il silenzio si scioglie in questi secondi. */
const RELEASE = 7;

export class DreadDirector {
  private readonly r;
  private next: number;
  private phase: 'idle' | 'hush' | 'release' = 'idle';
  private phaseAt = 0;
  private action: Action = 'nothing';
  private flickerUntil = -1;
  private gpsUntil = -1;
  private framedFlickerAt = -100;
  /** Tracce recenti del giocatore (per far ricomparire l'omino dove sei già passato). */
  private readonly trail: { t: number; pos: Vec2 }[] = [];
  private lastPos: Vec2 | null = null;
  private stillFor = 0;
  /** Colpi eseguiti, per diagnostica e test. */
  readonly done: Action[] = [];

  constructor(private h: SimHost) {
    this.r = streamFor(h.spec.seed, 'encounters').fork('dread');
    this.next = this.r.range(150, 300);
  }

  /** Istante del prossimo colpo programmato (test). */
  nextBeatAt(): number { return this.next; }

  step(dt: number, preHush: boolean) {
    const h = this.h, st = h.state;
    if (st.ended || st.abandoned) return;
    const pl = st.player.pos;
    // movimento del giocatore
    if (this.lastPos) {
      const v = dist(pl, this.lastPos) / Math.max(dt, 1e-3);
      this.stillFor = v < 0.3 ? this.stillFor + dt : 0;
    }
    this.lastPos = { x: pl.x, z: pl.z };
    const lastTrail = this.trail[this.trail.length - 1];
    if (!lastTrail || dist(lastTrail.pos, pl) > 6) {
      this.trail.push({ t: st.time, pos: { x: pl.x, z: pl.z } });
      if (this.trail.length > 80) this.trail.shift();
    }
    this.framedFlicker();
    // un mistero sta per accadere: anticipa il silenzio senza aggiungere un colpo
    if (preHush && this.phase === 'idle') { this.phase = 'release'; this.phaseAt = st.time + DREAD_HUSH; }

    if (this.phase === 'idle' && st.time >= this.next && !st.player.indoors) {
      this.phase = 'hush';
      this.phaseAt = st.time;
      this.action = this.choose();
    } else if (this.phase === 'hush') {
      const elapsed = st.time - this.phaseAt;
      // il passo imitato aspetta che ti fermi (fino a qualche secondo in più)
      const ready = this.action !== 'mimic' || this.stillFor > 0.6 || elapsed > DREAD_HUSH + 8;
      if (elapsed >= DREAD_HUSH && ready) {
        this.perform(this.action);
        this.done.push(this.action);
        this.phase = 'release';
        this.phaseAt = st.time;
        // al primo turno i colpi sono più radi; poi si infittiscono un poco
        const pace = st.time < 900 ? 1 : 0.75;
        this.next = st.time + this.r.range(170, 360) * pace;
      }
    } else if (this.phase === 'release' && st.time - this.phaseAt > RELEASE) {
      this.phase = 'idle';
    }
  }

  /** Silenzio della natura attorno al giocatore. */
  hush(): Hush | null {
    const st = this.h.state, t = st.time - this.phaseAt;
    let s = 0;
    if (this.phase === 'hush') s = clamp(t / 1.6, 0, 1);
    else if (this.phase === 'release') s = clamp(1 - t / RELEASE, 0, 1);
    return s > 0.01 ? { pos: { x: st.player.pos.x, z: st.player.pos.z }, radius: 140, strength: s } : null;
  }

  interference(): { torch: number; gps: number } {
    const t = this.h.state.time;
    return { torch: t < this.flickerUntil ? 0.75 : 0, gps: t < this.gpsUntil ? 0.4 : 0 };
  }

  // ------------------------------------------------------------ scelta ed esecuzione

  private choose(): Action {
    const r = this.r, st = this.h.state;
    const car = this.car();
    const far = car ? this.h.playerDistance(this.h.pose(car.id) ?? car.pos) : 0;
    const opts: [Action, number][] = [
      ['behind', 3], ['mimic', 2.5], ['flicker', 1.5], ['gps', 1], ['nothing', 1.6],
      ['knock', car && far > 60 && far < 200 ? 2 : 0],
    ];
    if (!st.torch.on) opts[2][1] = 0;
    let tot = 0;
    for (const [, w] of opts) tot += w;
    let x = r.range(0, tot);
    for (const [a, w] of opts) { if ((x -= w) <= 0) return a; }
    return 'nothing';
  }

  private perform(a: Action) {
    const h = this.h, st = h.state, pl = st.player.pos, r = this.r;
    const tag = { origin: 'anomaly' as const, tags: ['dread', 'unidentified'] };
    switch (a) {
      case 'behind': {
        if (this.watcherBehind()) return;
        const cand = h.objects().filter((o) => this.behindCandidate(o));
        if (!cand.length) return;
        const o = r.pick(cand), os = st.objects[o.id];
        const cause = (type: string) => ({ ...tag, type });
        switch (o.kind) {
          case 'door': h.setObjectState(o.id, { state: os.state === 'open' ? 'closed' : 'open' }, cause('dread_door')); break;
          case 'police_car': h.setObjectState(o.id, { headlights: !os.headlights }, cause('dread_headlights')); break;
          case 'sign': h.setObjectState(o.id, { tilt: +(Number(os.tilt ?? 0) + r.range(0.25, 0.5)).toFixed(2) }, cause('dread_sign')); break;
          case 'lamp': case 'lamp_post': h.setObjectState(o.id, { on: !os.on }, cause('dread_lamp')); break;
          case 'chair': { const p = h.pose(o.id)!; h.moveObject(o.id, { x: p.x, z: p.z, rotY: p.rotY + Math.PI }, cause('dread_chair')); break; }
          default: break;
        }
        return;
      }
      case 'mimic': {
        // un passo in più, proprio dietro, sullo stesso terreno
        const back = st.player.yaw + Math.PI + r.range(-0.5, 0.5), d = r.range(2.5, 5);
        const pos = { x: pl.x + Math.sin(back) * d, z: pl.z + Math.cos(back) * d };
        h.emit({ ...tag, type: 'dread_step', pos, radius: 2, sound: { kind: 'mimic_step', loudness: 25 } });
        return;
      }
      case 'knock': {
        const car = this.car();
        if (!car) return;
        const p = h.pose(car.id) ?? car.pos;
        h.emit({ ...tag, type: 'dread_knock', pos: { x: p.x, z: p.z }, radius: 3, sound: { kind: 'knock', loudness: 420 } });
        return;
      }
      case 'flicker': this.flickerUntil = st.time + r.range(1.2, 2.4); return;
      case 'gps': this.gpsUntil = st.time + r.range(15, 35); return;
      default: return;
    }
  }

  private car(): WorldObjectSpec | undefined {
    return this.h.objects({ kind: 'police_car' })[0];
  }

  private behindCandidate(o: WorldObjectSpec): boolean {
    const h = this.h, st = h.state;
    if (!['door', 'police_car', 'sign', 'lamp', 'lamp_post', 'chair'].includes(o.kind) || o.containerId) return false;
    const p = h.pose(o.id) ?? o.pos, d = h.playerDistance(p);
    if (d < 6 || d > 70 || h.playerCanSee(p, 4)) return false;
    // davvero alle spalle: il giocatore l'ha guardato da poco ed è ancora vicino
    if (o.kind === 'door' && st.objects[o.id].state !== 'open' && st.objects[o.id].state !== 'closed') return false;
    if ((o.kind === 'lamp' || o.kind === 'lamp_post') && (o.essential || !isLampLit(st, o))) return false;
    if (o.kind !== 'police_car' && o.essential) return false;
    return true;
  }

  /** L'omino ricompare in un punto dove sei passato da poco, alle tue spalle. */
  private watcherBehind(): boolean {
    const h = this.h, st = h.state;
    const w = st.actors.find((a: ActorState) => a.archetype === 'watcher' && a.present);
    if (!w || h.playerCanSee(w.pos, 20)) return false;
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i].pos, d = h.playerDistance(p);
      if (d < 30 || d > 60 || h.playerCanSee(p, 15)) continue;
      if (h.model.blockedAt(p.x, p.z) || h.model.waterDepthAt(p.x, p.z) > 0.05) continue;
      w.pos = { x: p.x, z: p.z };
      w.data.fleeUntil = 0;
      h.emit({ origin: 'anomaly', type: 'dread_watcher_behind', pos: p, radius: 0, actorId: w.id, tags: ['dread', 'watcher'] });
      return true;
    }
    return false;
  }

  /** Quando inquadri una presenza, la torcia perde il contatto per un attimo. */
  private framedFlicker() {
    const h = this.h, st = h.state;
    if (!st.torch.on || st.time - this.framedFlickerAt < 50) return;
    const p = st.player;
    for (const a of st.actors) {
      if (!a.present || !a.visible || !['anomaly', 'encounter', 'illusion'].includes(a.kind)) continue;
      const d = dist(a.pos, p.pos);
      if (d < 8 || d > 60) continue;
      const ang = Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - p.yaw;
      if (Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) > 0.3 || !h.playerCanSee(a.pos)) continue;
      this.framedFlickerAt = st.time;
      this.flickerUntil = st.time + 0.9 + this.r.range(0, 0.8);
      return;
    }
  }
}

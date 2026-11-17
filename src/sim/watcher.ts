// Un osservatore persistente, indipendente dagli incontri ostili del seed.
import { WORLD_HALF, type ActorState, type Vec2 } from '../core/contracts';
import { streamFor } from '../core/rng';
import { encounterSight } from './encounters';
import type { SimHost } from './host';

export const hasWatcher = (seed: number) => streamFor(seed, 'encounters').fork('watcher').chance(0.15);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
/** Più veloce della corsa del giocatore (5,8 m/s). */
const FLEE_SPEED = 7.5;

export class Watcher {
  private actor?: ActorState;
  private r;
  private nextThink = 0;
  private relocateAfter = 0;
  constructor(private h: SimHost) {
    this.r = streamFor(h.spec.seed, 'encounters').fork('watcher-position');
    if (!hasWatcher(h.spec.seed)) return;
    const pos = this.spot(false);
    if (!pos) return;
    this.actor = {
      id: 'watcher', kind: 'encounter', archetype: 'watcher', pos, heading: 0, goal: 'observe', routine: [], stepIndex: 0, stepTimer: 0,
      state: 'watch', speed: 2.2, present: true, visible: true, lightOn: false, percepts: [], knowledge: [], capabilities: [], drives: {},
      photographable: true, ownsObjectIds: [], cooldown: 0, nextThink: 0, data: { watching: false, awakeAt: this.r.range(18, 65), moving: false },
    };
    h.state.actors.push(this.actor);
  }

  private spot(unseen: boolean): Vec2 | null {
    const h = this.h, pl = h.state.player.pos;
    for (let i = 0; i < 90; i++) {
      const angle = this.r.range(0, Math.PI * 2), radius = this.r.range(60, 100);
      const p = { x: pl.x + Math.sin(angle) * radius, z: pl.z + Math.cos(angle) * radius };
      if (Math.abs(p.x) > WORLD_HALF - 35 || Math.abs(p.z) > WORLD_HALF - 35 || h.model.blockedAt(p.x, p.z) || h.model.indoorsAt(p.x, p.z) || h.model.waterDepthAt(p.x, p.z) > 0.05) continue;
      if (unseen && h.playerCanSee(p, 25)) continue;
      const q = h.model.resolve(p.x, p.z, 0.35, id => h.state.objects[id]?.state === 'open');
      if (dist(p, q) > 0.15 || !encounterSight(h.model, p, pl)) continue;
      return p;
    }
    return null;
  }

  /** Inquadrato: il giocatore lo guarda quasi dritto, con la linea di vista libera. */
  private framed(a: ActorState, d: number): boolean {
    const st = this.h.state, p = st.player;
    if (d > 140) return false;
    const ang = Math.atan2(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - p.yaw;
    return Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) < 0.42 && encounterSight(this.h.model, a.pos, p.pos);
  }

  step(dt: number) {
    const a = this.actor, h = this.h, st = h.state;
    if (!a || st.ended || st.abandoned) return;
    const d = dist(a.pos, st.player.pos);
    const seen = h.playerCanSee(a.pos, 20) && encounterSight(h.model, a.pos, st.player.pos);
    a.data.moving = false;
    // Inquadrato, scappa: corre via più veloce di quanto il giocatore possa correre. Non si raggiunge mai.
    if (!st.player.indoors && st.time >= Number(a.data.awakeAt) && this.framed(a, d)) {
      if (Number(a.data.fleeUntil ?? 0) <= st.time) h.emit({ type: 'watcher_flees', actorId: a.id, origin: 'anomaly', pos: a.pos, radius: 0, tags: ['watcher'] });
      a.data.fleeUntil = st.time + 5;
    }
    if (Number(a.data.fleeUntil ?? 0) > st.time) {
      a.heading = Math.atan2(a.pos.x - st.player.pos.x, a.pos.z - st.player.pos.z);
      const step = FLEE_SPEED * dt;
      // se un ostacolo lo blocca prova a scartare di lato
      for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
        const hd = a.heading + turn;
        const p = h.model.move(a.pos, Math.sin(hd) * step, Math.cos(hd) * step, id => st.objects[id]?.state === 'open', 0.3);
        if (h.model.waterDepthAt(p.x, p.z) < 0.3 && dist(a.pos, p) > step * 0.5) { a.pos = p; a.heading = hd; a.data.moving = true; break; }
      }
      a.data.watching = false;
      a.state = 'flee';
      this.relocateAfter = Math.min(this.relocateAfter, st.time + 3);
      return;
    }
    a.heading = Math.atan2(st.player.pos.x - a.pos.x, st.player.pos.z - a.pos.z);
    // Si avvicina solo fuori campo, mantenendo una distanza prudente.
    if (!seen && d > 78 && d < 170 && !st.player.indoors) {
      const step = Math.min(a.speed * dt, d - 75);
      const p = h.model.move(a.pos, Math.sin(a.heading) * step, Math.cos(a.heading) * step, id => st.objects[id]?.state === 'open', 0.3);
      if (h.model.waterDepthAt(p.x, p.z) < 0.1 && dist(a.pos, p) <= step * 1.5 + 0.01) { a.data.moving = dist(a.pos, p) > 0.005; a.pos = p; }
    }
    if (st.time < this.nextThink) return;
    this.nextThink = st.time + 0.5;
    // Troppo vicino (il giocatore gli è arrivato addosso di spalle): sparisce appena non è guardato.
    // Se lo si lascia indietro riappare solo fuori campo: non scompare mentre lo stai guardando.
    if (!seen && (d > 135 || d < 40 || !encounterSight(h.model, a.pos, st.player.pos)) && (st.time >= this.relocateAfter || d < 25) && !st.player.indoors) {
      this.relocateAfter = st.time + 12;
      const p = this.spot(true);
      if (p) { a.pos = p; a.data.moving = false; }
    }
    const nowD = dist(a.pos, st.player.pos);
    const watching = st.time >= Number(a.data.awakeAt) && nowD >= 30 && nowD <= 135 && !st.player.indoors && encounterSight(h.model, a.pos, st.player.pos);
    if (watching && !a.data.watching) h.emit({ type: 'watcher_observes', actorId: a.id, origin: 'anomaly', pos: a.pos, radius: 0, tags: ['watcher'] });
    a.data.watching = watching;
    a.state = watching ? 'watch' : 'follow';
  }
}

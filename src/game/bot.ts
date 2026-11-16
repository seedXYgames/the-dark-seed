// Bot headless: gioca un turno intero usando lo stesso movimento e le stesse collisioni del giocatore.
// Usato dai test di accettazione e dall'harness (verifica "dall'auto all'auto" senza scorciatoie).
import type { Vec2 } from '../core/contracts';
import { GameSession, SIM_DT, type PlayerInput } from './session';

export interface BotResult { ok: boolean; reason?: string; time: number; walked: number; steps: number }

export class Bot {
  walked = 0;
  steps = 0;
  constructor(readonly s: GameSession, readonly opts: { run?: boolean; torch?: boolean } = {}) {}

  private stepToward(target: Vec2): number {
    const p = this.s.state.player;
    const yaw = Math.atan2(target.x - p.pos.x, target.z - p.pos.z);
    const input: PlayerInput = { forward: 1, strafe: 0, run: this.opts.run ?? true, yaw, pitch: 0 };
    const before = { ...p.pos };
    this.s.update(SIM_DT, input);
    this.steps++;
    const d = Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
    this.walked += d;
    return d;
  }

  /** Cammina fino a `reach` metri dal punto; aggira piccoli ostacoli con deviazioni laterali. */
  walkTo(target: Vec2, reach: number, maxSteps = 6000): boolean {
    const p = this.s.state.player;
    let stuck = 0;
    for (let i = 0; i < maxSteps; i++) {
      const dist = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
      if (dist <= reach) return true;
      const moved = this.stepToward(target);
      if (moved < 0.02) {
        stuck++;
        // deviazione deterministica: alterna i lati e allunga il passo laterale
        const side = stuck % 2 ? 1 : -1;
        const a = Math.atan2(target.x - p.pos.x, target.z - p.pos.z) + side * (0.9 + 0.2 * Math.min(6, stuck));
        const detour = { x: p.pos.x + Math.sin(a) * (2 + stuck * 0.5), z: p.pos.z + Math.cos(a) * (2 + stuck * 0.5) };
        for (let k = 0; k < 12 + stuck * 2; k++) this.stepToward(detour);
        if (stuck > 40) return false;
      }
    }
    return false;
  }

  followRoute(pts: Vec2[]): boolean {
    for (const pt of pts) if (!this.walkTo(pt, 1.6)) return false;
    return true;
  }

  private goToPoi(from: string, to: string): boolean {
    const route = this.s.model.route(from, to);
    if (!route.length) return false;
    return this.followRoute(route);
  }

  private approach(objectId: string): boolean {
    const pose = this.s.pose(objectId);
    if (!pose) return false;
    // prova avvicinamenti da più direzioni: l'oggetto può stare dietro un ostacolo
    for (let k = 0; k < 8 && !this.s.canReach(objectId); k++) {
      const a = (k / 8) * Math.PI * 2;
      this.walkTo(k === 0 ? pose : { x: pose.x + Math.sin(a) * 2.4, z: pose.z + Math.cos(a) * 2.4 }, k === 0 ? 2.4 : 0.8, 400);
    }
    return this.s.canReach(objectId);
  }

  /** Completa tutti gli incarichi, scrive i rapporti e torna all'auto. */
  playShift(): BotResult {
    const s = this.s;
    const st = s.state;
    const carPoi = s.spec.pois[0].id;
    const car = s.objects({ kind: 'police_car' })[0];
    const fail = (reason: string): BotResult => ({ ok: false, reason: st.death ? `killed by ${st.death.kind}` : reason, time: st.time, walked: this.walked, steps: this.steps });
    if (this.opts.torch) s.toggleTorch();
    // prima di finire, l'auto non deve chiudere il turno
    if (s.canReach(car.id)) { s.interact(car.id); if (st.ended) return fail('ended early'); }
    let here = carPoi;
    for (const m of st.missions) {
      if (!this.goToPoi(here, m.poiId)) return fail(`route ${here}->${m.poiId}`);
      here = m.poiId;
      if (m.state !== 'pending') return fail(`mission ${m.id} completed by zone`);
      if (!this.approach(m.targetObjectId)) return fail(`cannot reach ${m.targetObjectId}`);
      for (let k = 0; k < 4 && m.state === 'pending'; k++) if (!s.interact(m.targetObjectId)) break;
      if ((m.state as string) !== 'inspected') return fail(`interaction failed ${m.id} ${m.type}`);
      if (!s.submitReport(m.id, [])) return fail(`report failed ${m.id}`);
      // torna al centro del POI per riprendere il sentiero
      this.walkTo(s.model.poi(m.poiId)!.pos, 2, 600);
    }
    if (!s.allReported()) return fail('not all reported');
    if (!this.goToPoi(here, carPoi)) return fail('route back');
    if (!this.approach(car.id)) return fail('cannot reach car');
    if (s.interact(car.id) !== 'end_shift' || !st.ended) return fail('end shift');
    return { ok: true, time: st.time, walked: this.walked, steps: this.steps };
  }
}

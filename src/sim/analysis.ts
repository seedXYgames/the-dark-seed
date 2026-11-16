// Diagnostica di sviluppo: riassume il registro del mondo di un turno. Mai mostrata al giocatore.
import type { SessionState } from '../core/contracts';

export interface ShiftDiagnostics {
  events: number;
  byOrigin: Record<string, number>;
  byType: Record<string, number>;
  /** Lunghezza massima di una catena causale (evento -> conseguenza -> …). */
  maxChain: number;
  chained: number;
  perceived: number;
  actors: Record<string, number>;
  sms: number;
  smsWithCause: number;
  drift: number;
  mysteries: number;
  cluesFound: number;
  extreme: boolean;
}

export function diagnose(st: SessionState): ShiftDiagnostics {
  const byOrigin: Record<string, number> = {}, byType: Record<string, number> = {}, actors: Record<string, number> = {};
  const depth = new Map<number, number>();
  let maxChain = 1, chained = 0, perceived = 0, drift = 0;
  for (const e of st.log) {
    byOrigin[e.origin] = (byOrigin[e.origin] ?? 0) + 1;
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    const d = e.causeEventId !== undefined ? (depth.get(e.causeEventId) ?? 1) + 1 : 1;
    depth.set(e.id, d);
    if (d > 1) chained++;
    if (d > maxChain) maxChain = d;
    if (e.perceivedByPlayer) perceived++;
    if (e.tags.includes('drift')) drift++;
  }
  for (const a of st.actors) actors[a.kind] = (actors[a.kind] ?? 0) + 1;
  return {
    events: st.log.length, byOrigin, byType, maxChain, chained, perceived, actors, drift,
    sms: st.messages.length, smsWithCause: st.messages.filter((m) => m.causeEventId !== undefined).length,
    mysteries: st.mysteries.length, cluesFound: st.mysteries.reduce((n, m) => n + m.discovered.length, 0),
    extreme: st.extreme.startedAt !== undefined,
  };
}

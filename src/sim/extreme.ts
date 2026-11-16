// Classe estrema di rottura della realtà: predisposizione per seed (≈0,01% delle partite), piano e inviluppi.
import type { ExtremeRenderState } from '../core/api';
import { EXTREME_PROBABILITY, type ExtremePlan } from '../core/contracts';
import { clamp, smoothstep, streamFor } from '../core/rng';

/** Vero per circa un seed su diecimila. Dipende solo dal seed: è verificabile contando i seed. */
export function isExtremeSeed(seed: number): boolean {
  return streamFor(seed, 'rare').next() < EXTREME_PROBABILITY;
}

const KINDS: ExtremePlan['phases'][number]['kind'][] = ['code_rain', 'strip', 'sky', 'decompose', 'audio', 'stutter'];

/** Piano deterministico dell'evento: fasi sovrapposte, condizione d'innesco e strascico. */
export function makeExtremePlan(seed: number): ExtremePlan {
  const r = streamFor(seed, 'rare').fork('plan');
  const kinds = r.shuffle([...KINDS]).slice(0, r.int(4, 6));
  const phases: ExtremePlan['phases'] = [];
  let t = 0, total = 0;
  for (const kind of kinds) {
    const start = t + r.range(0, 3), duration = r.range(9, 20);
    phases.push({ kind, start, duration });
    total = Math.max(total, start + duration);
    t = start + duration * r.range(0.45, 0.8);
  }
  return {
    phases, total: total + 4,
    trigger: { afterReports: r.int(1, 2), minTime: r.range(240, 720) },
    aftermath: r.pick(['stars', 'sms', 'both'] as const),
  };
}

function envelope(t: number, start: number, duration: number): number {
  if (t < start || t > start + duration) return 0;
  return smoothstep(0, 2.5, t - start) * (1 - smoothstep(duration - 3, duration, t - start));
}

export const EXTREME_IDLE: ExtremeRenderState = { active: false, codeRain: 0, strip: 0, sky: 0, decompose: 0, stutter: 0, t: 0, seed: 0 };

/** Intensità degli effetti a t secondi dall'inizio. Fuori dall'intervallo tutto torna esattamente a zero. */
export function extremeStateAt(plan: ExtremePlan, t: number, seed: number): ExtremeRenderState {
  if (t < 0 || t >= plan.total) return { ...EXTREME_IDLE };
  const lvl = (kind: string) => {
    let v = 0;
    for (const p of plan.phases) if (p.kind === kind) v = Math.max(v, envelope(t, p.start, p.duration));
    return clamp(v, 0, 1);
  };
  return { active: true, codeRain: lvl('code_rain'), strip: lvl('strip'), sky: lvl('sky'), decompose: lvl('decompose'), stutter: lvl('stutter'), t, seed };
}

/** Distorsione audio durante la fase 'audio' (0..1). */
export function extremeAudioAt(plan: ExtremePlan, t: number): number {
  let v = 0;
  for (const p of plan.phases) if (p.kind === 'audio') v = Math.max(v, envelope(t, p.start, p.duration));
  return v;
}

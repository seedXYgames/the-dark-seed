// Profilo narrativo dell'agente: deterministico dal seed, stabile per tutta la partita.
import type { Personality } from '../core/contracts';
import { streamFor } from '../core/rng';
import { PERSONALITIES } from './grammar';

export function pickPersonality(seed: number): Personality {
  return streamFor(seed, 'voice').fork('personality').pick(PERSONALITIES);
}

/** Parametri della voce sintetica: moderati, diversi per profilo. */
export const VOICE_STYLE: Record<Personality, { rate: number; pitch: number }> = {
  reserved: { rate: 0.9, pitch: 0.9 },
  pragmatic: { rate: 1.0, pitch: 0.98 },
  ironic: { rate: 0.98, pitch: 0.97 },
  skeptical: { rate: 0.93, pitch: 0.92 },
  nervous: { rate: 1.05, pitch: 1.0 },
};

/** Propensione di base a commentare ad alta voce (0..1). */
export const TALKATIVENESS: Record<Personality, number> = {
  reserved: 0.28,
  pragmatic: 0.5,
  ironic: 0.6,
  skeptical: 0.5,
  nervous: 0.72,
};

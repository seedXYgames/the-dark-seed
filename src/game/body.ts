// Il corpo dell'agente: fiato, freddo e batteria del telefono. Nessuno di questi uccide: rallentano,
// fanno tremare, spengono il telefono. Ci si riprende al riparo, alla volante o accanto a un fuoco.
import type { WeatherState } from '../core/api';
import { clamp } from '../core/rng';
import type { BodyState } from '../core/contracts';

export type { BodyState };

export type PhoneUse = 'off' | 'open' | 'camera';

export interface BodyContext {
  running: boolean;
  moving: boolean;
  indoors: boolean;
  nearCar: boolean;
  nearFire: boolean;
  weather: WeatherState;
  phoneUse: PhoneUse;
}

export type BodyNotice = 'breathless' | 'cold' | 'veryCold' | 'warmer' | 'phoneLow' | 'phoneDead' | 'phoneCharging' | 'phoneBack';

/** Secondi di corsa a fiato pieno. */
export const SPRINT_SECONDS = 16;

export function newBody(phoneCharge: number): BodyState {
  return { stamina: 1, exhausted: false, warmth: 1, phone: clamp(phoneCharge, 0, 1), breathless: 0, coldest: 1, phoneDied: false };
}

/** Quanto freddo prende il corpo al secondo, all'aperto e fermo (0 = nessuno). */
export function chillRate(w: WeatherState): number {
  const air = clamp((9 - w.temperature) / 16, 0, 1);
  const wet = w.precip * (w.precipType === 'snow' ? 0.45 : w.precipType === 'rain' ? 0.6 : 0) + w.wetness * 0.15;
  const k = air * 0.65 + wet + w.wind * 0.25 * (0.4 + air);
  // a chill = 1 servono circa 22 minuti per gelare
  return clamp(k, 0, 1.6) / (22 * 60);
}

export class Body {
  private notified = new Set<BodyNotice>();
  constructor(readonly s: BodyState) {}

  /** Velocità relativa (freddo intenso: passi più corti). */
  speedFactor(): number { return this.s.warmth < 0.3 ? 0.86 + 0.14 * (this.s.warmth / 0.3) : 1; }
  canRun(): boolean { return !this.s.exhausted && this.s.stamina > 0.02; }
  phoneOn(): boolean { return this.s.phone > 0; }
  /** Tremore 0..1 per la telecamera. */
  shiver(): number { return this.s.warmth < 0.35 ? clamp((0.35 - this.s.warmth) / 0.3, 0, 1) : 0; }

  step(dt: number, c: BodyContext): BodyNotice[] {
    const s = this.s, out: BodyNotice[] = [];
    // fiato
    const coldTax = s.warmth < 0.3 ? 1.35 : 1;
    if (c.running) s.stamina = Math.max(0, s.stamina - (dt / SPRINT_SECONDS) * coldTax);
    else s.stamina = Math.min(1, s.stamina + dt / (c.moving ? 11 : 6));
    if (!s.exhausted && s.stamina <= 0) { s.exhausted = true; s.breathless++; out.push('breathless'); }
    if (s.exhausted && s.stamina > 0.4) s.exhausted = false;
    // freddo
    const before = s.warmth;
    if (c.nearFire) s.warmth = Math.min(1, s.warmth + dt / 50);
    else if (c.nearCar) s.warmth = Math.min(1, s.warmth + dt / 80);
    else if (c.indoors) s.warmth = Math.min(1, s.warmth + dt / 200);
    else s.warmth = Math.max(0, s.warmth - chillRate(c.weather) * dt * (c.running ? 0.55 : c.moving ? 0.85 : 1));
    s.coldest = Math.min(s.coldest, s.warmth);
    if (before >= 0.35 && s.warmth < 0.35) out.push(this.once('cold'));
    if (before >= 0.15 && s.warmth < 0.15) out.push(this.once('veryCold'));
    if (before < 0.3 && s.warmth >= 0.3 && (c.nearFire || c.nearCar || c.indoors)) { out.push('warmer'); this.notified.delete('cold'); this.notified.delete('veryCold'); }
    // telefono: si scarica in tasca, molto di più con lo schermo acceso o la fotocamera; si ricarica in macchina
    const had = s.phone;
    if (c.nearCar) {
      s.phone = Math.min(1, s.phone + dt / 110);
      if (had < 0.95 && Math.floor(had * 4) !== Math.floor(s.phone * 4)) out.push('phoneCharging');
    } else {
      const drain = c.phoneUse === 'camera' ? 1 / 700 : c.phoneUse === 'open' ? 1 / 1100 : 1 / 5400;
      // il freddo scarica le batterie più in fretta
      s.phone = Math.max(0, s.phone - dt * drain * (s.warmth < 0.3 ? 1.4 : 1));
    }
    if (had >= 0.15 && s.phone < 0.15) out.push(this.once('phoneLow'));
    if (had > 0 && s.phone <= 0) { s.phoneDied = true; out.push('phoneDead'); this.notified.delete('phoneLow'); }
    if (had <= 0 && s.phone > 0) out.push('phoneBack');
    return out.filter((n): n is BodyNotice => !!n);
  }

  private once(n: BodyNotice): BodyNotice {
    if (this.notified.has(n)) return null as unknown as BodyNotice;
    this.notified.add(n);
    return n;
  }
}

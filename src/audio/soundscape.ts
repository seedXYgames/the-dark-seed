// Modello puro del "silenzio ambientale dinamico" (spec 12A.6). Nessun DOM, nessun Web Audio:
// solo funzioni deterministiche che traducono ora, meteo, posizione e stati in livelli 0..1.
import type { SoundscapeContext, SoundscapeLevels } from '../core/api';
import { WORLD_HALF, type Vec2 } from '../core/contracts';
import { Rng, clamp, smoothstep, streamFor } from '../core/rng';

const c01 = (v: number): number => (Number.isFinite(v) ? clamp(v, 0, 1) : 0);

/** Ora "notturna" continua: le ore dopo mezzanotte diventano 24..36, così 19.5 → 29 è monotòno. */
function nightHour(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return h < 12 ? h + 24 : h;
}

/** Silenzio 0..1 prodotto nel punto `pos` da sorgenti e rumore del giocatore (vince il più forte). */
export function computeHush(
  pos: Vec2,
  sources: readonly { pos: Vec2; radius: number; strength: number }[],
  playerNoise: number,
): number {
  let hush = c01(playerNoise) * 0.6;
  for (const s of sources) {
    const r = Math.max(1, s.radius);
    const d = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
    // pieno entro metà raggio, sfuma fino a 1.5 raggi
    const fall = 1 - smoothstep(r * 0.5, r * 1.5, d);
    const h = c01(s.strength) * fall;
    if (h > hush) hush = h;
  }
  return c01(hush);
}

export function computeSoundscape(ctx: SoundscapeContext): SoundscapeLevels {
  const w = ctx.weather;
  const hn = nightHour(ctx.hour);
  const h24 = ((ctx.hour % 24) + 24) % 24;
  const density = c01(ctx.forestDensity);
  const wind = c01(w.wind);
  const rainAmt = w.precipType === 'rain' ? c01(w.precip) : 0;
  const snowAmt = w.precipType === 'snow' ? c01(w.precip) : 0;
  // la neve che cade e quella a terra assorbono tutto
  const snowDamp = (1 - 0.55 * snowAmt) * (1 - 0.25 * c01(w.snowCover));
  const indoors = ctx.indoors;

  // --- vento: riparo al chiuso e nel bosco fitto
  const shelter = (indoors ? 0.28 : 1) * (1 - 0.45 * density);
  const windLevel = Math.pow(wind, 1.15) * shelter * snowDamp;

  // --- pioggia: solo se piove davvero; al chiuso resta il tamburellare sul tetto
  const rainLevel = Math.pow(rainAmt, 0.8) * (indoors ? 0.6 : 1 - 0.15 * density);

  // --- fauna
  const hush = computeHush(ctx.pos, ctx.hushSources, ctx.playerNoise);
  const faunaIndoor = indoors ? 0.22 : 1;

  const warm = smoothstep(8, 17, w.temperature);
  const evening = smoothstep(18, 20, hn);
  const preDawnFade = 1 - 0.85 * smoothstep(26, 29, hn); // dalle 2:00 alle 5:00
  const insects =
    warm * evening * preDawnFade * (1 - 0.92 * rainAmt) * (snowAmt > 0 ? 0 : 1) *
    (1 - 0.35 * wind) * (1 - 0.3 * c01(w.wetness)) * (0.65 + 0.35 * density) * faunaIndoor;

  const nearWater = Number.isFinite(ctx.waterDistance) ? 1 - smoothstep(25, 120, ctx.waterDistance) : 0;
  const mild = smoothstep(6, 13, w.temperature);
  const nightF = smoothstep(18.5, 20.5, hn) * (1 - smoothstep(28.5, 30.5, hn));
  const wetBonus = 0.5 + 0.5 * Math.max(c01(w.wetness), Math.min(1, rainAmt * 1.5));
  const frogs =
    nearWater * mild * nightF * wetBonus * (1 - 0.5 * smoothstep(0.6, 1, rainAmt)) *
    (snowAmt > 0 ? 0 : 1) * faunaIndoor;

  // coro dell'alba dopo le 4:30, giorno pieno, poi di nuovo notte dopo il tramonto
  const chorus = h24 < 12 ? smoothstep(4.5, 6.2, h24) : 1 - smoothstep(18, 20.5, h24);
  const nightBirds = (1 - chorus) * 0.13 * (0.35 + 0.65 * density);
  const birds =
    (nightBirds + chorus * 0.75) * (1 - 0.75 * rainAmt) * (1 - 0.55 * wind) * snowDamp * faunaIndoor;

  // --- acqua, foglie, attività umane, stanza
  const waterProx = Number.isFinite(ctx.waterDistance) ? 1 - smoothstep(4, 150, ctx.waterDistance) : 0;
  const water = waterProx * waterProx * (indoors ? 0.3 : 1) * (1 - 0.3 * c01(w.snowCover));

  const leaves = Math.pow(wind, 0.9) * density * (indoors ? 0.2 : 1) * snowDamp;

  const townProx = Number.isFinite(ctx.townDistance) ? 1 - smoothstep(50, 900, ctx.townDistance) : 0;
  const lateNight = smoothstep(22, 25, hn) * (1 - smoothstep(28.5, 30.5, hn));
  const human = townProx * (1 - 0.7 * lateNight) * 0.85 * (indoors ? 0.5 : 1) * snowDamp;

  const room = indoors ? 0.6 : 0;

  const k = 1 - hush;
  return {
    wind: c01(windLevel),
    rain: c01(rainLevel),
    insects: c01(insects * k),
    frogs: c01(frogs * k),
    birds: c01(birds * k),
    water: c01(water),
    leaves: c01(leaves),
    human: c01(human),
    room: c01(room),
    hush,
  };
}

// ---------------------------------------------------------------- silenzi di causa ignota

export interface SilenceEpisode {
  start: number;
  duration: number;
  ramp: number;
  peak: number;
  radius: number;
  origin: Vec2;
  vel: Vec2;
}

export interface SilenceSource { pos: Vec2; radius: number; strength: number; cause: 'unknown' }

const HOUR = 3600;
const MAX_PER_HOUR = 3;
const MAP_LIMIT = WORLD_HALF - 20;

/**
 * Zone di silenzio senza causa nota: rade, lente, con rampe dolci. Funzione pura di (seed, tempo):
 * gli episodi di ogni ora derivano da un sotto-stream proprio, quindi l'ordine delle interrogazioni
 * è irrilevante (la cache interna non è osservabile). Non genera né implica alcun altro evento.
 */
export class SilencePlanner {
  private readonly root: Rng;
  /** Media di episodi per ora di turno per questo seed (0 = nessun silenzio ignoto). */
  private readonly rate: number;
  private readonly cache = new Map<number, SilenceEpisode[]>();

  constructor(seed: number) {
    this.root = streamFor(seed, 'soundscape').fork('silence');
    const p = this.root.fork('profile');
    this.rate = p.chance(0.22) ? 0 : p.range(0.25, 1.9);
  }

  private hourEpisodes(h: number): SilenceEpisode[] {
    const hit = this.cache.get(h);
    if (hit) return hit;
    const out: SilenceEpisode[] = [];
    if (this.rate > 0 && h >= 0) {
      const r = this.root.fork('h' + h);
      // Poisson (Knuth) troncata
      const limit = Math.exp(-this.rate);
      let n = 0;
      let acc = r.next();
      while (acc > limit && n < MAX_PER_HOUR) {
        n++;
        acc *= r.next();
      }
      for (let i = 0; i < n; i++) {
        const duration = r.range(40, 150);
        const ang = r.range(0, Math.PI * 2);
        const speed = r.range(0, 0.6);
        out.push({
          start: h * HOUR + r.range(0, HOUR),
          duration,
          ramp: Math.max(12, duration * r.range(0.3, 0.45)),
          peak: r.range(0.55, 1),
          radius: r.range(60, 200),
          origin: { x: r.range(-MAP_LIMIT, MAP_LIMIT), z: r.range(-MAP_LIMIT, MAP_LIMIT) },
          vel: { x: Math.sin(ang) * speed, z: Math.cos(ang) * speed },
        });
      }
      out.sort((a, b) => a.start - b.start);
    }
    this.cache.set(h, out);
    return out;
  }

  /** Episodi che iniziano in [t0, t1). Diagnostica e test. */
  episodesBetween(t0: number, t1: number): SilenceEpisode[] {
    const out: SilenceEpisode[] = [];
    if (!(t1 > t0)) return out;
    const h0 = Math.max(0, Math.floor(t0 / HOUR));
    const h1 = Math.floor((t1 - 1e-9) / HOUR);
    for (let h = h0; h <= h1; h++) {
      for (const e of this.hourEpisodes(h)) if (e.start >= t0 && e.start < t1) out.push(e);
    }
    return out;
  }

  /** Sorgenti di silenzio attive all'istante `time`. `playerPos` non influisce: il silenzio non segue nessuno. */
  sourcesAt(time: number, _playerPos: Vec2): SilenceSource[] {
    const out: SilenceSource[] = [];
    if (!Number.isFinite(time) || time < 0 || this.rate <= 0) return out;
    const h = Math.floor(time / HOUR);
    for (let hh = Math.max(0, h - 1); hh <= h; hh++) {
      for (const e of this.hourEpisodes(hh)) {
        const dt = time - e.start;
        if (dt <= 0 || dt >= e.duration) continue;
        const env = smoothstep(0, e.ramp, dt) * (1 - smoothstep(e.duration - e.ramp, e.duration, dt));
        const strength = e.peak * env;
        if (strength <= 0) continue;
        out.push({
          pos: {
            x: clamp(e.origin.x + e.vel.x * dt, -MAP_LIMIT, MAP_LIMIT),
            z: clamp(e.origin.z + e.vel.z * dt, -MAP_LIMIT, MAP_LIMIT),
          },
          radius: e.radius,
          strength,
          cause: 'unknown',
        });
      }
    }
    return out;
  }
}

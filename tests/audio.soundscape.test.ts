import { describe, expect, it } from 'vitest';
import type { SoundscapeContext, SoundscapeLevels, WeatherState } from '../src/core/api';
import { SilencePlanner, computeHush, computeSoundscape } from '../src/audio/soundscape';

const weather = (o: Partial<WeatherState> = {}): WeatherState => ({
  cloud: 0.3, fog: 0.1, precip: 0, precipType: 'none', wind: 0.3, windDir: 0, temperature: 16,
  wetness: 0.1, snowCover: 0, ...o,
});
const ctx = (o: Partial<SoundscapeContext> = {}, w: Partial<WeatherState> = {}): SoundscapeContext => ({
  time: 600, hour: 22, weather: weather(w), pos: { x: 0, z: 0 }, forestDensity: 0.5, waterDistance: 60,
  townDistance: 300, indoors: false, playerNoise: 0, hushSources: [], ...o,
});
const KEYS: (keyof SoundscapeLevels)[] = ['wind', 'rain', 'insects', 'frogs', 'birds', 'water', 'leaves', 'human', 'room', 'hush'];

describe('computeSoundscape', () => {
  it('keeps every level in [0,1] across a wide sweep, including degenerate inputs', () => {
    const types = ['none', 'rain', 'snow'] as const;
    for (let i = 0; i < 4000; i++) {
      const f = (k: number) => ((i * 0.6180339887 * k) % 1 + 1) % 1;
      const lv = computeSoundscape(ctx(
        {
          hour: f(1) * 30 - 3, forestDensity: f(2) * 1.4 - 0.2, waterDistance: i % 17 === 0 ? Infinity : f(3) * 500,
          townDistance: i % 19 === 0 ? Infinity : f(4) * 1500, indoors: i % 3 === 0, playerNoise: f(5) * 1.5 - 0.2,
          pos: { x: f(6) * 1400 - 700, z: f(7) * 1400 - 700 },
          hushSources: i % 2 ? [{ pos: { x: 0, z: 0 }, radius: f(8) * 300, strength: f(9) * 1.5 }] : [],
        },
        { precip: f(10) * 1.2, precipType: types[i % 3], wind: f(11) * 1.3, temperature: f(12) * 45 - 12, wetness: f(13), snowCover: f(14) },
      ));
      for (const k of KEYS) {
        expect(Number.isFinite(lv[k]), k).toBe(true);
        expect(lv[k]).toBeGreaterThanOrEqual(0);
        expect(lv[k]).toBeLessThanOrEqual(1);
      }
    }
    const nan = computeSoundscape(ctx({ hour: NaN, waterDistance: NaN, playerNoise: NaN }, { wind: NaN, temperature: NaN }));
    for (const k of KEYS) expect(Number.isFinite(nan[k])).toBe(true);
  });

  it('is deterministic', () => {
    expect(computeSoundscape(ctx())).toEqual(computeSoundscape(ctx()));
  });

  it('wind level grows with wind and is reduced by shelter', () => {
    let prev = -1;
    for (let w = 0; w <= 1.0001; w += 0.1) {
      const v = computeSoundscape(ctx({}, { wind: w })).wind;
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    const open = computeSoundscape(ctx({ forestDensity: 0 }, { wind: 0.7 })).wind;
    expect(computeSoundscape(ctx({ forestDensity: 1 }, { wind: 0.7 })).wind).toBeLessThan(open);
    expect(computeSoundscape(ctx({ forestDensity: 0, indoors: true }, { wind: 0.7 })).wind).toBeLessThan(open * 0.5);
  });

  it('rain only with rain; snow is silent and damps', () => {
    expect(computeSoundscape(ctx({}, { precip: 0.8, precipType: 'none' })).rain).toBe(0);
    expect(computeSoundscape(ctx({}, { precip: 0.8, precipType: 'snow' })).rain).toBe(0);
    const light = computeSoundscape(ctx({}, { precip: 0.2, precipType: 'rain' })).rain;
    const heavy = computeSoundscape(ctx({}, { precip: 0.9, precipType: 'rain' })).rain;
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
    const dry = computeSoundscape(ctx({}, { wind: 0.6 }));
    const snow = computeSoundscape(ctx({}, { wind: 0.6, precip: 0.8, precipType: 'snow' }));
    expect(snow.wind).toBeLessThan(dry.wind);
    expect(snow.leaves).toBeLessThan(dry.leaves);
    expect(snow.human).toBeLessThan(dry.human);
    expect(snow.insects).toBe(0);
    expect(snow.frogs).toBe(0);
  });

  it('insects: warm dry nights; fade in cold, rain and late pre-dawn', () => {
    const warm = computeSoundscape(ctx({}, { temperature: 20 })).insects;
    expect(warm).toBeGreaterThan(0.3);
    expect(computeSoundscape(ctx({}, { temperature: 7 })).insects).toBe(0);
    expect(computeSoundscape(ctx({}, { temperature: 11 })).insects).toBeLessThan(warm);
    expect(computeSoundscape(ctx({}, { temperature: 20, precip: 0.8, precipType: 'rain' })).insects).toBeLessThan(warm * 0.4);
    expect(computeSoundscape(ctx({ hour: 4.5 }, { temperature: 20 })).insects).toBeLessThan(warm * 0.4);
  });

  it('frogs only near water on mild nights', () => {
    expect(computeSoundscape(ctx({ waterDistance: 120 })).frogs).toBe(0);
    expect(computeSoundscape(ctx({ waterDistance: 400 })).frogs).toBe(0);
    expect(computeSoundscape(ctx({ waterDistance: Infinity })).frogs).toBe(0);
    const near = computeSoundscape(ctx({ waterDistance: 15 }, { wetness: 0.8 })).frogs;
    expect(near).toBeGreaterThan(0.3);
    expect(computeSoundscape(ctx({ waterDistance: 80 }, { wetness: 0.8 })).frogs).toBeLessThan(near);
    expect(computeSoundscape(ctx({ waterDistance: 15 }, { wetness: 0.8, temperature: 3 })).frogs).toBe(0);
    expect(computeSoundscape(ctx({ waterDistance: 15 }, { wetness: 0 })).frogs).toBeLessThan(near);
  });

  it('birds: sparse at night, dawn chorus rising after 4:30', () => {
    const night = computeSoundscape(ctx({ hour: 1 })).birds;
    expect(night).toBeGreaterThan(0);
    expect(night).toBeLessThan(0.15);
    expect(computeSoundscape(ctx({ hour: 4.4 })).birds).toBeCloseTo(computeSoundscape(ctx({ hour: 3 })).birds, 6);
    const a = computeSoundscape(ctx({ hour: 4.9 })).birds;
    const b = computeSoundscape(ctx({ hour: 5.4 })).birds;
    const c = computeSoundscape(ctx({ hour: 6 })).birds;
    expect(a).toBeGreaterThan(night);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('water by distance, leaves by wind × forest, human by town distance and hour, room indoors', () => {
    expect(computeSoundscape(ctx({ waterDistance: 5 })).water).toBeGreaterThan(computeSoundscape(ctx({ waterDistance: 60 })).water);
    expect(computeSoundscape(ctx({ waterDistance: 300 })).water).toBe(0);
    expect(computeSoundscape(ctx({ forestDensity: 0 }, { wind: 0.8 })).leaves).toBe(0);
    expect(computeSoundscape(ctx({ forestDensity: 0.9 }, { wind: 0.8 })).leaves)
      .toBeGreaterThan(computeSoundscape(ctx({ forestDensity: 0.9 }, { wind: 0.2 })).leaves);
    const town = computeSoundscape(ctx({ townDistance: 80, hour: 21 })).human;
    expect(town).toBeGreaterThan(computeSoundscape(ctx({ townDistance: 600, hour: 21 })).human);
    expect(computeSoundscape(ctx({ townDistance: 80, hour: 2.5 })).human).toBeLessThan(town * 0.5);
    expect(computeSoundscape(ctx({ townDistance: 2000 })).human).toBe(0);
    expect(computeSoundscape(ctx()).room).toBe(0);
    expect(computeSoundscape(ctx({ indoors: true })).room).toBeGreaterThan(0.3);
  });

  it('a hush source at the player silences fauna but not wind/water', () => {
    const base = computeSoundscape(ctx({ waterDistance: 20, hour: 5.2 }, { wetness: 0.7 }));
    expect(base.insects).toBeGreaterThan(0);
    expect(base.frogs).toBeGreaterThan(0);
    expect(base.birds).toBeGreaterThan(0);
    expect(base.hush).toBe(0);
    const hushed = computeSoundscape(ctx(
      { waterDistance: 20, hour: 5.2, hushSources: [{ pos: { x: 0, z: 0 }, radius: 100, strength: 1 }] }, { wetness: 0.7 }));
    expect(hushed.hush).toBe(1);
    expect(hushed.insects).toBe(0);
    expect(hushed.frogs).toBe(0);
    expect(hushed.birds).toBe(0);
    expect(hushed.wind).toBe(base.wind);
    expect(hushed.water).toBe(base.water);
    expect(hushed.leaves).toBe(base.leaves);
    expect(hushed.human).toBe(base.human);
  });

  it('hush: distance falloff, strongest wins, running quiets fauna partially', () => {
    const src = (x: number, strength: number) => ({ pos: { x, z: 0 }, radius: 100, strength });
    const p = { x: 0, z: 0 };
    expect(computeHush(p, [src(1000, 1)], 0)).toBe(0);
    const mid = computeHush(p, [src(100, 1)], 0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(computeHush(p, [src(60, 1)], 0)).toBeGreaterThan(mid);
    expect(computeHush(p, [src(0, 0.3), src(0, 0.8), src(0, 0.5)], 0)).toBeCloseTo(0.8, 9);
    expect(computeHush(p, [src(0, 5)], 0)).toBe(1);
    const run = computeSoundscape(ctx({ playerNoise: 1 }, { temperature: 20 }));
    const still = computeSoundscape(ctx({}, { temperature: 20 }));
    expect(run.hush).toBeGreaterThan(0);
    expect(run.hush).toBeLessThan(1);
    expect(run.insects).toBeLessThan(still.insects);
    expect(run.insects).toBeGreaterThan(0);
    expect(run.wind).toBe(still.wind);
  });

  it('changing hour, weather or place changes the output', () => {
    const a = computeSoundscape(ctx());
    expect(computeSoundscape(ctx({ hour: 3.5 }))).not.toEqual(a);
    expect(computeSoundscape(ctx({}, { wind: 0.8 }))).not.toEqual(a);
    expect(computeSoundscape(ctx({ waterDistance: 10, forestDensity: 0.9, townDistance: 700 }))).not.toEqual(a);
  });
});

describe('SilencePlanner', () => {
  const P = { x: 0, z: 0 };
  const SHIFT = 2 * 3600;

  it('is a deterministic function of (seed, time), independent of query order and player position', () => {
    for (const seed of [1, 42, 77777, 999999]) {
      const a = new SilencePlanner(seed);
      const b = new SilencePlanner(seed);
      const times: number[] = [];
      for (let t = 0; t <= SHIFT; t += 7) times.push(t);
      const fwd = times.map((t) => a.sourcesAt(t, P));
      const back = times.slice().reverse().map((t) => b.sourcesAt(t, { x: 300, z: -200 })).reverse();
      expect(back).toEqual(fwd);
      expect(times.map((t) => a.sourcesAt(t, P))).toEqual(fwd);
    }
  });

  it('different seeds give different plans', () => {
    const sig = (seed: number) => JSON.stringify(new SilencePlanner(seed).episodesBetween(0, 4 * 3600));
    const set = new Set<string>();
    for (let s = 0; s < 60; s++) set.add(sig(s));
    expect(set.size).toBeGreaterThan(40);
  });

  it('is sparse: 0–3 episodes per hour, some seeds with none, sane parameters', () => {
    let total = 0;
    let none = 0;
    const hours = 3;
    for (let seed = 0; seed < 200; seed++) {
      const pl = new SilencePlanner(seed * 4999 + 13);
      const eps = pl.episodesBetween(0, hours * 3600);
      if (eps.length === 0) none++;
      total += eps.length;
      for (let h = 0; h < hours; h++) {
        expect(pl.episodesBetween(h * 3600, (h + 1) * 3600).length).toBeLessThanOrEqual(3);
      }
      for (const e of eps) {
        expect(e.duration).toBeGreaterThanOrEqual(40);
        expect(e.duration).toBeLessThanOrEqual(150);
        expect(e.radius).toBeGreaterThanOrEqual(60);
        expect(e.radius).toBeLessThanOrEqual(200);
        expect(Math.abs(e.origin.x)).toBeLessThanOrEqual(700);
        expect(Math.abs(e.origin.z)).toBeLessThanOrEqual(700);
      }
    }
    const perHour = total / (200 * hours);
    expect(none).toBeGreaterThanOrEqual(15);
    expect(none).toBeLessThanOrEqual(120);
    expect(perHour).toBeGreaterThan(0.3);
    expect(perHour).toBeLessThan(1.6);
  });

  it('ramps smoothly in and out, stays in the map, drifts slowly, and is mostly inactive', () => {
    let active = 0;
    let samples = 0;
    let peakSeen = 0;
    for (let seed = 0; seed < 200; seed++) {
      const pl = new SilencePlanner(seed);
      const eps = pl.episodesBetween(0, SHIFT);
      for (const e of eps) {
        let prev = 0;
        let prevPos: { x: number; z: number } | null = null;
        for (let t = e.start - 1; t <= e.start + e.duration + 1; t += 0.5) {
          const mine = pl.sourcesAt(t, P).filter((s) => s.radius === e.radius);
          const s = mine.length ? mine[0].strength : 0;
          expect(Math.abs(s - prev)).toBeLessThanOrEqual(0.07); // ≤ 0.14 al secondo
          prev = s;
          if (mine.length) {
            expect(mine[0].cause).toBe('unknown');
            expect(s).toBeGreaterThan(0);
            expect(s).toBeLessThanOrEqual(1);
            expect(Math.abs(mine[0].pos.x)).toBeLessThanOrEqual(700);
            expect(Math.abs(mine[0].pos.z)).toBeLessThanOrEqual(700);
            if (prevPos) expect(Math.hypot(mine[0].pos.x - prevPos.x, mine[0].pos.z - prevPos.z)).toBeLessThanOrEqual(0.31);
            prevPos = mine[0].pos;
            peakSeen = Math.max(peakSeen, s);
          }
        }
        expect(prev).toBe(0);
      }
      for (let t = 0; t < SHIFT; t += 30) {
        samples++;
        if (pl.sourcesAt(t, P).length > 0) active++;
      }
    }
    expect(peakSeen).toBeGreaterThan(0.8);
    expect(active / samples).toBeLessThan(0.08);
    expect(active).toBeGreaterThan(0);
  });

  it('returns nothing for invalid or negative times', () => {
    const pl = new SilencePlanner(5);
    expect(pl.sourcesAt(-10, P)).toEqual([]);
    expect(pl.sourcesAt(NaN, P)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { SkyState, WeatherState } from '../src/core/api';
import { DEFAULT_SETTINGS } from '../src/core/contracts';
import { torchProfile, TORCH_POWER } from '../src/core/torch';
import {
  CHUNK_N, ambientIntensity, calibrate, chunkCenter, chunkDistance, chunkIndex, dirFromAzEl, fogDensity, fogLinear, groupByChunk, lodFor,
  luma, qualityParams, skyColors, stutterTime,
  VIEW_ALL,
} from '../src/render/envMath';

const sky = (o: Partial<SkyState>): SkyState => ({
  hour: 23, sunElevation: -0.6, sunAzimuth: 4.7, moonElevation: 0.7, moonAzimuth: 2, moonPhase: 0.5, moonIllum: 1, moonLight: 0.9,
  starVisibility: 1, ambient: 0.14, starSeed: 7, tint: 0.5, ...o,
});
const wx = (o: Partial<WeatherState>): WeatherState => ({
  cloud: 0, fog: 0, precip: 0, precipType: 'none', wind: 0.2, windDir: 1, temperature: 8, wetness: 0, snowCover: 0, ...o,
});
const gfx = DEFAULT_SETTINGS.gfx;

describe('profilo della torcia', () => {
  it('sfuma senza corone piatte e conserva la penombra senza saturarla', () => {
    expect(torchProfile(0)).toBeCloseTo(1);
    let prev = 1;
    for (let i = 1; i <= 100; i++) {
      const next = torchProfile(i / 100);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(prev);
      expect(prev - next).toBeLessThan(0.035);
      prev = next;
    }
    expect(torchProfile(1)).toBe(0);
    expect(torchProfile(1.2)).toBe(0);
    expect(TORCH_POWER * torchProfile(0.75)).toBeLessThan(1);
  });
});
const dusk = sky({ hour: 20, sunElevation: -0.05, ambient: 0.4, moonLight: 0.1, starVisibility: 0.1 });
const clearMoon = sky({});
const overcast = sky({ moonElevation: -0.3, moonLight: 0, moonIllum: 0, ambient: 0.02, starVisibility: 0 });

describe('envMath: cielo e luce', () => {
  it('la notte è più scura del crepuscolo', () => {
    const d = skyColors(dusk, wx({})), n = skyColors(clearMoon, wx({}));
    expect(luma(n.zenith)).toBeLessThan(luma(d.zenith));
    expect(luma(n.horizon)).toBeLessThan(luma(d.horizon));
    expect(luma(n.fog)).toBeLessThan(luma(d.fog));
    expect(n.ambientIntensity).toBeLessThan(d.ambientIntensity);
    expect(n.night).toBeGreaterThan(d.night);
  });
  it('coperto senza luna: ambiente e luce inferiori al sereno con luna piena', () => {
    const o = skyColors(overcast, wx({ cloud: 1 })), c = skyColors(clearMoon, wx({}));
    expect(o.ambientIntensity).toBeLessThan(c.ambientIntensity);
    expect(o.lightIntensity).toBeLessThan(c.lightIntensity);
    expect(o.lightIntensity).toBe(0);
    expect(luma(o.horizon)).toBeLessThan(luma(c.horizon));
    expect(c.lightIsSun).toBe(false);
  });
  it('al crepuscolo la luce direzionale è il sole basso e punta sopra l\'orizzonte', () => {
    const d = skyColors(sky({ sunElevation: 0.03, ambient: 0.6, moonLight: 0 }), wx({}));
    expect(d.lightIsSun).toBe(true);
    expect(d.lightDir[1]).toBeGreaterThan(0.1);
    expect(d.sunGlowAmount).toBeGreaterThan(0.3);
  });
  it('convenzione degli azimut: 0 = +z, π/2 = +x', () => {
    const n = dirFromAzEl(0, 0), e = dirFromAzEl(Math.PI / 2, 0);
    expect(n[2]).toBeCloseTo(1); expect(e[0]).toBeCloseTo(1); expect(dirFromAzEl(1, Math.PI / 2)[1]).toBeCloseTo(1);
  });
  it('tutti i colori sono finiti e non negativi lungo la notte', () => {
    for (let e = -0.7; e <= 0.3; e += 0.05)
      for (const cl of [0, 0.5, 1]) {
        const p = skyColors(sky({ sunElevation: e }), wx({ cloud: cl, fog: cl }));
        for (const c of [p.zenith, p.horizon, p.fog, p.cloud, p.cloudLit, p.ambientColor, p.lightColor]) for (const v of c) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
      }
  });
});

describe('envMath: nebbia', () => {
  it('la densità cresce con weather.fog e non è mai nulla', () => {
    let prev = 0;
    for (let f = 0; f <= 1.0001; f += 0.1) {
      const d = fogDensity(wx({ fog: f }), clearMoon, gfx);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    expect(fogDensity(wx({ fog: 1 }), clearMoon, gfx)).toBeGreaterThan(fogDensity(wx({ fog: 0 }), clearMoon, gfx) * 5);
    expect(fogDensity(wx({ fog: 0.3, precip: 1, precipType: 'snow' }), clearMoon, gfx)).toBeGreaterThan(fogDensity(wx({ fog: 0.3 }), clearMoon, gfx));
  });
  it('nebbia lineare: sempre presente e mai prima del bordo del mondo', () => {
    const l = fogLinear(wx({}), clearMoon, gfx);
    expect(l.end).toBeLessThanOrEqual(VIEW_ALL + 1e-6);
    expect(l.start).toBeLessThan(l.end);
    expect(fogLinear(wx({ fog: 1 }), clearMoon, gfx).end).toBeLessThan(l.end);
  });
});

describe('envMath: calibrazione display', () => {
  it('è limitata e non trasforma la notte in giorno', () => {
    const night = skyColors(overcast, wx({ cloud: 1 })), d = skyColors(dusk, wx({}));
    const nightMax = calibrate(ambientIntensity(overcast.ambient) * Math.max(...night.ambientColor), 1.25);
    const duskRef = calibrate(d.ambientIntensity * Math.max(...d.ambientColor), 0.8);
    expect(nightMax).toBeLessThan(duskRef * 0.5);
    for (const v of [0, 0.01, 0.1, 0.5, 1]) {
      expect(calibrate(v, 1)).toBeCloseTo(v, 6);
      expect(calibrate(v, 1.25)).toBeGreaterThanOrEqual(calibrate(v, 1));
      expect(calibrate(v, 0.8)).toBeLessThanOrEqual(calibrate(v, 1));
      expect(calibrate(v, 9)).toBe(calibrate(v, 1.25));
    }
    expect(calibrate(0.02, 1.25)).toBeLessThan(0.06);
  });
});

describe('envMath: chunk e LOD', () => {
  it('ogni albero finisce in esattamente un chunk', () => {
    const n = 5000, data = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) { data[i * 5] = ((i * 7919) % 1600) - 800 + 0.37; data[i * 5 + 1] = ((i * 104729) % 1600) - 800 + 0.11; }
    data[0] = -800; data[1] = -800; data[5] = 800; data[6] = 800;
    const groups = groupByChunk(data, 5);
    expect(groups.length).toBe(CHUNK_N * CHUNK_N);
    const seen = new Uint8Array(n);
    groups.forEach((g, ci) => g.forEach((k) => {
      seen[k]++;
      expect(chunkIndex(data[k * 5], data[k * 5 + 1])).toBe(ci);
      expect(chunkDistance(ci, data[k * 5], data[k * 5 + 1])).toBeLessThan(1e-6);
    }));
    expect(Array.from(seen).every((v) => v === 1)).toBe(true);
    const c = chunkCenter(chunkIndex(10, -310));
    expect(Math.abs(c.x - 10)).toBeLessThanOrEqual(50); expect(Math.abs(c.z + 310)).toBeLessThanOrEqual(50);
  });
  it('la funzione LOD è monotòna nella distanza', () => {
    for (const q of ['low', 'medium', 'high'] as const)
      for (const dd of [150, 420, 800]) {
        let prev = 0;
        for (let d = 0; d < 1200; d += 3) { const l = lodFor(d, qualityParams(q).nearDist, dd); expect(l).toBeGreaterThanOrEqual(prev); prev = l; }
        expect(prev).toBe(2);
        expect(lodFor(0, qualityParams(q).nearDist, dd)).toBe(0);
      }
    expect(qualityParams('low').rain).toBeLessThan(qualityParams('high').rain);
  });
  it('stutter: identità a 0, quantizzato e non decrescente altrimenti', () => {
    expect(stutterTime(12.345, 0)).toBe(12.345);
    let prev = -1, distinct = 0;
    for (let t = 0; t < 2; t += 0.01) { const v = stutterTime(t, 1); expect(v).toBeGreaterThanOrEqual(prev); if (v !== prev) distinct++; prev = v; expect(v).toBeLessThanOrEqual(t + 1e-9); }
    expect(distinct).toBeLessThan(10);
  });
});

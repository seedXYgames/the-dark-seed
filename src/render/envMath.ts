// Matematica pura dell'ambiente (colori del cielo, nebbia, calibrazione, chunk, LOD). Nessun Babylon:
// tutto qui è verificabile in node.
import type { SkyState, WeatherState } from '../core/api';
import type { GraphicsSettings } from '../core/contracts';

export type RGB = [number, number, number];

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Direzione unitaria da azimut (0 = +z nord, π/2 = +x est) ed elevazione. */
export function dirFromAzEl(az: number, el: number, out: RGB = [0, 0, 0]): RGB {
  const c = Math.cos(el);
  out[0] = Math.sin(az) * c;
  out[1] = Math.sin(el);
  out[2] = Math.cos(az) * c;
  return out;
}

// ---------------------------------------------------------------- cielo

export interface SkyPalette {
  zenith: RGB;
  horizon: RGB;
  /** Colore della nebbia di scena (legato all'orizzonte). */
  fog: RGB;
  cloud: RGB;
  cloudLit: RGB;
  sunGlow: RGB;
  sunGlowAmount: number;
  ambientColor: RGB;
  groundColor: RGB;
  ambientIntensity: number;
  /** Luce direzionale (luna oppure sole basso). */
  lightColor: RGB;
  lightIntensity: number;
  /** Direzione VERSO la sorgente. */
  lightDir: RGB;
  lightIsSun: boolean;
  /** 0 = giorno/crepuscolo, 1 = notte piena. */
  night: number;
}

export function makePalette(): SkyPalette {
  return {
    zenith: [0, 0, 0], horizon: [0, 0, 0], fog: [0, 0, 0], cloud: [0, 0, 0], cloudLit: [0, 0, 0], sunGlow: [0, 0, 0],
    sunGlowAmount: 0, ambientColor: [0, 0, 0], groundColor: [0, 0, 0], ambientIntensity: 0, lightColor: [0, 0, 0],
    lightIntensity: 0, lightDir: [0, 1, 0], lightIsSun: false, night: 1,
  };
}

// fermate per elevazione del sole (radianti): zenit, orizzonte
const STOPS: { e: number; z: RGB; h: RGB }[] = [
  { e: -0.34, z: [0.004, 0.006, 0.017], h: [0.011, 0.016, 0.032] },
  { e: -0.24, z: [0.010, 0.016, 0.046], h: [0.028, 0.042, 0.088] },
  { e: -0.15, z: [0.030, 0.050, 0.150], h: [0.120, 0.150, 0.300] },
  { e: -0.07, z: [0.090, 0.095, 0.290], h: [0.660, 0.300, 0.300] },
  { e: 0.02, z: [0.150, 0.210, 0.470], h: [0.960, 0.520, 0.230] },
  { e: 0.2, z: [0.200, 0.370, 0.680], h: [0.640, 0.730, 0.830] },
];

function lerp3(out: RGB, a: RGB, b: RGB, t: number): RGB {
  out[0] = mix(a[0], b[0], t); out[1] = mix(a[1], b[1], t); out[2] = mix(a[2], b[2], t);
  return out;
}
export const luma = (c: RGB) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

/** Intensità della luce emisferica a partire dalla luce ambientale naturale 0..1. */
export function ambientIntensity(ambient: number): number {
  return 0.03 + 0.92 * Math.pow(clamp01(ambient), 0.8);
}

export function skyColors(sky: SkyState, weather: WeatherState, out: SkyPalette = makePalette()): SkyPalette {
  const e = sky.sunElevation;
  let i = 0;
  while (i < STOPS.length - 2 && e > STOPS[i + 1].e) i++;
  const t = clamp01((e - STOPS[i].e) / (STOPS[i + 1].e - STOPS[i].e));
  lerp3(out.zenith, STOPS[i].z, STOPS[i + 1].z, t);
  lerp3(out.horizon, STOPS[i].h, STOPS[i + 1].h, t);
  const night = 1 - sstep(-0.3, -0.08, e);
  out.night = night;
  // tinta del seed: sposta leggermente il crepuscolo tra arancio e viola
  const tw = sstep(-0.2, -0.05, e) * (1 - sstep(0.05, 0.2, e));
  const tint = (sky.tint - 0.5) * 2;
  out.horizon[0] *= 1 + 0.12 * tint * tw; out.horizon[2] *= 1 - 0.25 * tint * tw;
  out.zenith[0] *= 1 - 0.2 * tint * tw; out.zenith[2] *= 1 + 0.1 * tint * tw;
  // chiaro di luna nel cielo notturno
  const moonUp = sstep(-0.03, 0.1, sky.moonElevation);
  const ml = sky.moonLight * moonUp * night;
  out.zenith[0] += 0.006 * ml; out.zenith[1] += 0.011 * ml; out.zenith[2] += 0.026 * ml;
  out.horizon[0] += 0.014 * ml; out.horizon[1] += 0.022 * ml; out.horizon[2] += 0.042 * ml;

  const cl = clamp01(weather.cloud);
  // nuvole: grigio legato alla luminosità del cielo, appena rischiarate dalla luna
  const skyL = luma(out.horizon) * 0.55 + luma(out.zenith) * 0.45;
  const cb = skyL * mix(0.9, 0.42, cl) + 0.004;
  out.cloud[0] = cb * 0.95 + 0.004 * ml; out.cloud[1] = cb * 0.98 + 0.006 * ml; out.cloud[2] = cb * 1.12 + 0.01 * ml;
  // bordi illuminati: dal sole al crepuscolo, dalla luna di notte
  const glowK = sstep(-0.2, -0.03, e) * (1 - sstep(0.1, 0.3, e));
  out.sunGlow[0] = 1.0; out.sunGlow[1] = mix(0.34, 0.62, sstep(-0.1, 0.1, e)); out.sunGlow[2] = mix(0.22, 0.3, sstep(-0.1, 0.1, e));
  out.sunGlowAmount = glowK * (1 - 0.8 * cl);
  out.cloudLit[0] = out.cloud[0] + 0.55 * glowK * (1 - 0.6 * cl) + 0.035 * ml;
  out.cloudLit[1] = out.cloud[1] + 0.26 * glowK * (1 - 0.6 * cl) + 0.045 * ml;
  out.cloudLit[2] = out.cloud[2] + 0.2 * glowK * (1 - 0.6 * cl) + 0.06 * ml;

  // nebbia: orizzonte mescolato alle nuvole e attenuato dalla copertura
  const fg = clamp01(weather.fog);
  const dim = mix(1, 0.5, cl * (1 - 0.5 * (1 - night)));
  for (let k = 0; k < 3; k++) {
    const base = mix(mix(out.horizon[k], out.zenith[k], 0.45) * 0.8, out.cloud[k], cl * 0.8) * dim;
    const grey = luma(out.horizon) * dim * 0.9 + 0.006 * ml;
    out.fog[k] = mix(base, grey, fg * 0.6);
  }
  // l'orizzonte visibile sotto la coltre tende al colore delle nuvole
  for (let k = 0; k < 3; k++) out.horizon[k] = mix(out.horizon[k], out.cloud[k] * 1.15, cl * cl * 0.85);

  // ambiente
  const ai = ambientIntensity(sky.ambient);
  out.ambientIntensity = ai;
  const az = luma(out.zenith) + 1e-4, ah = luma(out.horizon) + 1e-4;
  for (let k = 0; k < 3; k++) {
    const c = (out.zenith[k] / az) * 0.55 + (out.horizon[k] / ah) * 0.45; // tinta normalizzata
    out.ambientColor[k] = mix(c, 1, 0.35 + 0.4 * cl);
    out.groundColor[k] = out.ambientColor[k] * 0.45;
  }
  // luce direzionale: sole basso oppure luna
  const sunI = sstep(-0.09, 0.06, e) * (1 - 0.8 * cl) * 0.85;
  const moonI = sky.moonLight * moonUp * 0.42;
  if (sunI >= moonI) {
    out.lightIsSun = true; out.lightIntensity = sunI;
    dirFromAzEl(sky.sunAzimuth, Math.max(0.16, e), out.lightDir);
    out.lightColor[0] = 1; out.lightColor[1] = mix(0.5, 0.86, sstep(-0.05, 0.2, e)); out.lightColor[2] = mix(0.34, 0.7, sstep(-0.05, 0.2, e));
  } else {
    out.lightIsSun = false; out.lightIntensity = moonI;
    dirFromAzEl(sky.moonAzimuth, Math.max(0.2, sky.moonElevation), out.lightDir);
    out.lightColor[0] = 0.62; out.lightColor[1] = 0.74; out.lightColor[2] = 1;
  }
  return out;
}

// ---------------------------------------------------------------- nebbia

/** Densità exp2 dovuta solo al meteo e alla foschia notturna (senza il limite della distanza di disegno). */
export function weatherFogDensity(weather: WeatherState, sky: SkyState): number {
  const night = 1 - sstep(-0.3, -0.08, sky.sunElevation);
  const f = clamp01(weather.fog);
  let d = 0.0011 + 0.0007 * night + 0.034 * Math.pow(f, 1.6);
  if (weather.precipType === 'rain') d += 0.0055 * clamp01(weather.precip);
  else if (weather.precipType === 'snow') d += 0.011 * clamp01(weather.precip);
  return d;
}

/** Densità exp2 della nebbia di scena: cresce con weather.fog e non scende mai sotto ciò che nasconde il limite di disegno. */
export function fogDensity(weather: WeatherState, sky: SkyState, gfx: GraphicsSettings): number {
  return Math.max(weatherFogDensity(weather, sky), 0.62 / VIEW_ALL);
}

/** Nebbia lineare leggera (fogEffects = false): mai nulla. */
export function fogLinear(weather: WeatherState, sky: SkyState, gfx: GraphicsSettings): { start: number; end: number } {
  const vis = 1.6 / weatherFogDensity(weather, sky);
  const end = Math.max(60, Math.min(VIEW_ALL, vis));
  return { start: end * 0.3, end };
}

/** Foschia 0..1 applicata alle montagne lontane (solo meteo). */
export function distantHaze(weather: WeatherState): number {
  const p = weather.precipType === 'none' ? 0 : clamp01(weather.precip);
  return clamp01(Math.pow(clamp01(weather.fog), 0.7) * 1.25 + p * 0.55);
}

// ---------------------------------------------------------------- calibrazione display

export function calibration(brightness: number): { gain: number; gamma: number } {
  const b = Math.min(1.25, Math.max(0.8, brightness));
  return { gain: 1 + (b - 1) * 0.8, gamma: 1 + (b - 1) * 0.6 };
}
/** Valore finale (0..1) di un canale dopo la calibrazione: stessa formula del post-process. */
export function calibrate(v: number, brightness: number): number {
  const c = calibration(brightness);
  return clamp01(Math.pow(Math.max(0, v), 1 / c.gamma) * c.gain);
}

// ---------------------------------------------------------------- qualità, chunk, LOD

export interface QualityParams {
  nearDist: number; rockDist: number; coverRadius: number; coverCell: number; rain: number; snow: number; debris: number; motes: number;
  shadowMap: number; shadowRange: number; lodInterval: number;
}
export function qualityParams(q: GraphicsSettings['quality']): QualityParams {
  if (q === 'low') return { nearDist: 60, rockDist: 260, coverRadius: 12, coverCell: 2.2, rain: 1400, snow: 900, debris: 60, motes: 80, shadowMap: 1024, shadowRange: 60, lodInterval: 0.4 };
  if (q === 'high') return { nearDist: 135, rockDist: 520, coverRadius: 110, coverCell: 1.5, rain: 6000, snow: 4000, debris: 220, motes: 260, shadowMap: 2048, shadowRange: 90, lodInterval: 0.2 };
  return { nearDist: 95, rockDist: 380, coverRadius: 19, coverCell: 1.8, rain: 3500, snow: 2400, debris: 140, motes: 160, shadowMap: 2048, shadowRange: 75, lodInterval: 0.25 };
}

/** Tutto il mondo resta disegnato: nessun oggetto compare o scompare con la distanza (solo il dettaglio cambia). */
export const VIEW_ALL = 2400;
export const CHUNK_SIZE = 100;
export const CHUNK_MIN = -800;
export const CHUNK_N = 16;

export function chunkCoord(v: number): number {
  const c = Math.floor((v - CHUNK_MIN) / CHUNK_SIZE);
  return c < 0 ? 0 : c >= CHUNK_N ? CHUNK_N - 1 : c;
}
export function chunkIndex(x: number, z: number): number {
  return chunkCoord(z) * CHUNK_N + chunkCoord(x);
}
export function chunkCenter(index: number): { x: number; z: number } {
  const i = index % CHUNK_N, j = (index - i) / CHUNK_N;
  return { x: CHUNK_MIN + (i + 0.5) * CHUNK_SIZE, z: CHUNK_MIN + (j + 0.5) * CHUNK_SIZE };
}

/** Raggruppa elementi [x, z, …] (stride campi) per chunk: ogni elemento finisce in esattamente un chunk. */
export function groupByChunk(data: Float32Array, stride: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < CHUNK_N * CHUNK_N; i++) out.push([]);
  const n = Math.floor(data.length / stride);
  for (let k = 0; k < n; k++) out[chunkIndex(data[k * stride], data[k * stride + 1])].push(k);
  return out;
}

/** Distanza orizzontale da un punto al bordo di un chunk (0 se dentro). */
export function chunkDistance(index: number, x: number, z: number): number {
  const c = chunkCenter(index);
  const dx = Math.max(0, Math.abs(x - c.x) - CHUNK_SIZE / 2), dz = Math.max(0, Math.abs(z - c.z) - CHUNK_SIZE / 2);
  return Math.hypot(dx, dz);
}

/** LOD per distanza: 0 dettagliato, 1 economico, 2 nascosto. Monotòna non decrescente nella distanza. */
export function lodFor(dist: number, nearDist: number, drawDistance: number): 0 | 1 | 2 {
  const far = Math.max(drawDistance, 40);
  if (dist > far) return 2;
  return dist <= Math.min(nearDist, far) ? 0 : 1;
}

/** Hash intero deterministico → [0,1). */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Tempo quantizzato per l'effetto "stutter": con amount 0 restituisce t invariato. */
export function stutterTime(t: number, amount: number): number {
  if (amount <= 0) return t;
  const q = 0.04 + 0.4 * clamp01(amount);
  return Math.floor(t / q) * q;
}

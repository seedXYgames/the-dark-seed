// Cielo e meteo come funzioni pure del tempo simulato: deterministici e indipendenti dal frame rate.
import type { SkyState, WeatherState } from '../core/api';
import { CLOCK_SCALE, type SkyInit, type WeatherInit } from '../core/contracts';
import { clamp, noise1, smoothstep } from '../core/rng';

export const SUNSET_HOUR = 19.75;
export const SUNRISE_HOUR = 5.75;

export function hourAt(sky: SkyInit, time: number): number {
  return (sky.startHour + (time * CLOCK_SCALE) / 3600) % 24;
}

export function clockString(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function weatherRaw(w: WeatherInit, time: number) {
  const t = time / 420; // scala temporale delle variazioni (minuti reali)
  const v = w.volatility;
  const cloud = clamp(w.baseCloud + (noise1(t, w.salt) - 0.5) * 1.1 * v + (noise1(t * 0.31, w.salt + 5) - 0.5) * 0.5 * v, 0, 1);
  const wind = clamp(w.baseWind + (noise1(t * 1.7, w.salt + 11) - 0.5) * 0.9 * v + (noise1(time / 23, w.salt + 12) - 0.5) * 0.18, 0, 1);
  const precip = clamp((cloud - 0.56) * 2.6 * (0.35 + noise1(t * 1.3, w.salt + 21) * 0.9) + w.basePrecip * 0.6 * smoothstep(0.45, 0.7, cloud), 0, 1);
  const temperature = w.temperature - (time * CLOCK_SCALE) / 3600 * 0.55 + (noise1(t * 0.5, w.salt + 31) - 0.5) * 2 - precip * 1.5;
  return { cloud, wind, precip, temperature };
}

export function weatherAt(w: WeatherInit, time: number): WeatherState {
  const r = weatherRaw(w, time);
  const precipType: WeatherState['precipType'] = r.precip < 0.04 ? 'none' : r.temperature <= 0.8 ? 'snow' : 'rain';
  // bagnato e neve al suolo: media pesata del passato recente (senza stato)
  let wet = 0, snow = 0;
  const LAGS = [0, 60, 150, 300, 500, 800];
  for (let i = 0; i < LAGS.length; i++) {
    const p = weatherRaw(w, Math.max(0, time - LAGS[i]));
    const k = 1 - i / (LAGS.length + 1);
    if (p.precip >= 0.04) { if (p.temperature <= 0.8) snow += p.precip * k; else wet += p.precip * k; }
  }
  const startWet = w.basePrecip > 0.05 && w.temperature > 0.8 ? 0.5 : 0;
  const startSnow = w.temperature < -1 ? clamp(0.25 + w.basePrecip, 0, 1) * (w.baseCloud > 0.3 ? 1 : 0.6) : 0;
  const fogBase = w.baseFog + (noise1(time / 520, w.salt + 41) - 0.5) * 0.45 * w.volatility;
  const fog = clamp(fogBase * (1 - r.wind * 0.55) + (r.precip > 0.3 ? 0.12 : 0) + (r.temperature < 4 && r.wind < 0.25 ? 0.1 : 0), 0, 1);
  return {
    cloud: r.cloud, fog, precip: r.precip, precipType, wind: r.wind,
    windDir: w.windDir + (noise1(time / 300, w.salt + 51) - 0.5) * 1.2, temperature: r.temperature,
    wetness: clamp(startWet + wet * 0.6, 0, 1), snowCover: clamp(startSnow + snow * 0.5, 0, 1),
  };
}

export function skyAt(sky: SkyInit, weather: WeatherState, time: number): SkyState {
  const hour = hourAt(sky, time);
  // elevazione solare: giorno 5:45–19:45, notte simmetrica
  let sunElevation: number;
  const dayLen = SUNSET_HOUR - SUNRISE_HOUR;
  if (hour >= SUNRISE_HOUR && hour <= SUNSET_HOUR) sunElevation = Math.sin((Math.PI * (hour - SUNRISE_HOUR)) / dayLen) * 1.05;
  else {
    const hn = hour < SUNRISE_HOUR ? hour + 24 : hour;
    sunElevation = -Math.sin((Math.PI * (hn - SUNSET_HOUR)) / (24 - dayLen)) * 0.75;
  }
  const hn = hour < 12 ? hour + 24 : hour; // ore notturne continue 12..36
  const night = clamp((hn - SUNSET_HOUR) / (24 - dayLen), 0, 1);
  const sunAzimuth = sky.sunsetAzimuth + (hn - SUNSET_HOUR) * 0.262; // ~15°/h
  // luna: arco semplice attraverso la notte, picco a metà
  const moonElevation = sky.moonPeakElevation * Math.sin(Math.PI * clamp(night * 0.9 + 0.05, 0, 1)) - (1 - Math.sin(Math.PI * clamp(night, 0, 1))) * 0.12;
  const moonAzimuth = sky.moonAzimuth + (night - 0.5) * 2.2;
  const moonIllum = (1 - Math.cos(sky.moonPhase * 2 * Math.PI)) / 2;
  const clear = 1 - weather.cloud;
  const dayLight = smoothstep(-0.1, 0.12, sunElevation); // crepuscolo
  const moonLight = moonElevation > 0 ? moonIllum * smoothstep(0, 0.35, moonElevation) * (0.12 + 0.88 * clear * clear) * (1 - weather.fog * 0.5) : 0;
  const starVisibility = clamp((1 - smoothstep(-0.22, -0.05, sunElevation)) * clear * clear * (1 - weather.fog * 0.7) * (1 - moonLight * 0.45), 0, 1);
  const twilight = smoothstep(-0.3, 0.0, sunElevation) * 0.1 * (0.4 + 0.6 * clear);
  const ambient = clamp(0.018 + 0.012 * clear + moonLight * 0.11 + starVisibility * 0.012 + twilight + dayLight * 0.75 * (0.45 + 0.55 * clear), 0, 1);
  return { hour, sunElevation, sunAzimuth, moonElevation, moonAzimuth, moonPhase: sky.moonPhase, moonIllum, moonLight, starVisibility, ambient, starSeed: sky.starSeed, tint: sky.tint };
}

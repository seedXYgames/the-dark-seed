import { describe, expect, it } from 'vitest';
import { Body, newBody, SPRINT_SECONDS, chillRate } from '../src/game/body';
import { DispatchRadio, ANSWER_WINDOW, type RadioWorld } from '../src/game/radio';
import { ACHIEVEMENTS, emptyProgress, loadProgress, recordShift, saveProgress, type ShiftRecord } from '../src/game/achievements';
import { storyOf } from '../src/game/story';
import { GameSession } from '../src/game/session';
import type { WeatherState } from '../src/core/api';
import type { Mystery } from '../src/core/contracts';

const mild: WeatherState = { cloud: 0.3, fog: 0, precip: 0, precipType: 'none', wind: 0.1, windDir: 0, temperature: 12, wetness: 0, snowCover: 0 };
const snow: WeatherState = { ...mild, precip: 0.8, precipType: 'snow', temperature: -6, wind: 0.6, snowCover: 0.8 };
const ctx = (o: Partial<Parameters<Body['step']>[1]> = {}) => ({ running: false, moving: false, indoors: false, nearCar: false, nearFire: false, weather: mild, phoneUse: 'off' as const, ...o });

describe('corpo: fiato, freddo, telefono', () => {
  it('la corsa finisce il fiato, poi si recupera camminando', () => {
    const b = new Body(newBody(1));
    for (let t = 0; t < SPRINT_SECONDS + 1; t += 0.1) b.step(0.1, ctx({ running: true, moving: true }));
    expect(b.canRun()).toBe(false);
    expect(b.s.breathless).toBe(1);
    for (let t = 0; t < 10; t += 0.1) b.step(0.1, ctx({ moving: true }));
    expect(b.canRun()).toBe(true);
  });
  it('con la neve si gela, alla volante ci si scalda e il telefono si ricarica', () => {
    expect(chillRate(snow)).toBeGreaterThan(chillRate(mild) * 3);
    const b = new Body(newBody(0.3));
    for (let t = 0; t < 25 * 60; t += 0.5) b.step(0.5, ctx({ weather: snow, phoneUse: 'open' }));
    expect(b.s.warmth).toBeLessThan(0.15);
    expect(b.shiver()).toBeGreaterThan(0.5);
    expect(b.speedFactor()).toBeLessThan(1);
    expect(b.s.phone).toBe(0);
    expect(b.s.phoneDied).toBe(true);
    for (let t = 0; t < 120; t += 0.5) b.step(0.5, ctx({ weather: snow, nearCar: true }));
    expect(b.s.warmth).toBeGreaterThan(0.9);
    expect(b.s.phone).toBeGreaterThan(0.9);
  });
});

describe('radio della centrale', () => {
  const world = (time: number, uneasy = false): RadioWorld => ({
    time, lang: 'it', officer: { first: 'Anna', last: 'Ferri' }, tipPoi: () => ({ id: 'cabin0', name: { it: 'Baita del Tasso', en: 'Badger Cabin' } }),
    badWeather: () => false, uneasy: () => uneasy,
  });
  it('chiama, accetta la risposta e richiama più tardi; stesso seed, stesse chiamate', () => {
    const run = () => {
      const r = new DispatchRadio(42), texts: string[] = [];
      for (let t = 0; t < 1800; t += 1) {
        for (const l of r.step(world(t), false)) if (l.text) texts.push(l.text);
        if (r.pending() && r.current!.at + 3 <= t) for (const l of r.answer(world(t))) texts.push(l.text);
      }
      return { texts, calls: r.calls, answered: r.answered };
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
    expect(a.calls).toBeGreaterThanOrEqual(3);
    expect(a.answered).toBe(a.calls);
    expect(a.texts.some((t) => t.includes('Ferri'))).toBe(true);
  });
  it('una chiamata non risposta scade; a volte la centrale smentisce di aver chiamato', () => {
    let wrong = 0, missed = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = new DispatchRadio(seed);
      for (let t = 0; t < 3000; t += 1) for (const l of r.step(world(t, true), false)) { if (l.event === 'radio_wrong') wrong++; if (l.event === 'radio_missed') missed++; }
    }
    expect(missed).toBeGreaterThan(40);
    expect(wrong).toBeGreaterThan(3);
    expect(ANSWER_WINDOW).toBeGreaterThan(10);
  });
});

describe('obiettivi e progressi', () => {
  const rec = (o: Partial<ShiftRecord> = {}): ShiftRecord => ({
    seed: 5, completed: true, durationSeconds: 900, missions: 3, missionsReported: 3, photos: 2, maxPhotos: 12, photographed: [], subjects: [], events: [],
    torchOnSeconds: 600, runMeters: 100, walkMeters: 1000, batteriesTaken: 0, housesEntered: 0, churchVisited: false, pierWalked: false, dreadBeats: 0,
    cluesFound: 0, cluesTotal: 2, radioCalls: 1, radioAnswered: 1, coldest: 0.8, breathless: 0, phoneDied: false, ...o,
  });
  it('ogni obiettivo ha nome e descrizione nelle due lingue, id unici', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) for (const l of ['it', 'en'] as const) { expect(a.name[l].length).toBeGreaterThan(3); expect(a.desc[l].length).toBeGreaterThan(10); }
  });
  it('si sbloccano una volta sola e restano salvati', () => {
    const p = emptyProgress();
    const first = recordShift(rec({ photographed: ['ufo_wreck'] }), p);
    expect(first).toContain('first_shift');
    expect(first).toContain('bureaucrat');
    expect(first).toContain('ufo_ticket');
    expect(recordShift(rec(), p)).not.toContain('first_shift');
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    saveProgress(p, store);
    const back = loadProgress(store);
    expect(back.unlocked.ufo_ticket.seed).toBe(5);
    expect(back.shifts).toBe(2);
    expect(recordShift(rec(), back)).toContain('again');
    expect(loadProgress({ getItem: () => '{rotto' }).shifts).toBe(0);
  });
});

describe('storia del bosco', () => {
  it('pochi indizi danno un’ipotesi, tutti la ricostruzione completa', () => {
    const m: Mystery = { id: 'my1', origin: 'human', theme: 'overdue_hiker', motive: 'lost_way', originPoiId: 'cabin0', clues: [
      { objectId: 'a', poiId: 'cabin0', order: 0, kind: 'item' }, { objectId: 'b', poiId: 'camp0', order: 1, kind: 'trace' }], timeline: [], discovered: [] };
    expect(storyOf([m], 'it', () => 'Baita')).toEqual([]);
    m.discovered = [0];
    const part = storyOf([m], 'it', () => 'Baita')[0];
    m.discovered = [0, 1];
    const full = storyOf([m], 'en', () => 'Cabin')[0];
    expect(part.text).toContain('Baita');
    expect(full.text.length).toBeGreaterThan(part.text.length);
    expect(full.found).toBe(2);
  });
});

describe('sessione', () => {
  it('il turno produce un riepilogo per gli obiettivi e la radio parla', () => {
    const s = new GameSession({ seed: 7, lang: 'it' });
    const start = s.state.body.phone;
    s.state.player.pos = { x: s.state.player.pos.x + 40, z: s.state.player.pos.z };
    for (let i = 0; i < 400 * 10; i++) s.tick();
    const r = s.shiftRecord();
    expect(r.seed).toBe(7);
    expect(r.radioCalls).toBeGreaterThanOrEqual(1);
    expect(s.state.body.phone).toBeLessThan(start);
    expect(s.state.log.some((e) => e.type === 'radio_call')).toBe(true);
  });
});

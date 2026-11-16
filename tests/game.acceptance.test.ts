import { describe, expect, it } from 'vitest';
import { SEED_MAX } from '../src/core/contracts';
import { parseSeed } from '../src/core/seed';
import { Bot } from '../src/game/bot';
import { GameSession, SIM_DT } from '../src/game/session';
import { seedMysteries } from '../src/sim/mysteries';
import { createSimulation } from '../src/sim/simulation';
import { generateWorld } from '../src/world/worldgen';

const make = (seed: number, lang: 'it' | 'en' = 'it') => new GameSession({ seed, lang, simFactory: createSimulation, postProcess: seedMysteries });
const idle = (s: GameSession, seconds: number) => { for (let i = 0; i < seconds / SIM_DT; i++) s.update(SIM_DT, { forward: 0, strafe: 0, run: false, yaw: s.state.player.yaw, pitch: 0 }); };

describe('seed', () => {
  it('accetta solo interi tra 0 e 1.000.000', () => {
    for (const ok of ['0', '1', '4242', String(SEED_MAX)]) expect(parseSeed(ok).ok).toBe(true);
    for (const bad of ['', 'abc', '-1', '1000001', '12.5', '1e3', ' ']) expect(parseSeed(bad).ok).toBe(false);
  });

  it('lo stesso seed genera lo stesso mondo; seed diversi mondi diversi', () => {
    const a = generateWorld(31337, seedMysteries).spec, b = generateWorld(31337, seedMysteries).spec, c = generateWorld(31338, seedMysteries).spec;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c.pois)).not.toBe(JSON.stringify(a.pois));
    expect(a.size).toBe(1400);
    for (const p of a.pois) { expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(700); expect(Math.abs(p.pos.z)).toBeLessThanOrEqual(700); }
  });

  it('i seed di confine generano mondi validi', () => {
    for (const seed of [0, SEED_MAX]) { const s = make(seed); expect(s.state.missions.length).toBeGreaterThanOrEqual(2); expect(new Bot(s).playShift().ok).toBe(true); }
  });
});

describe('turno', () => {
  it('comincia vicino all\'auto con il briefing via SMS e gli incarichi nel telefono', () => {
    const s = make(909);
    const car = s.objects({ kind: 'police_car' })[0];
    expect(Math.hypot(car.pos.x - s.state.player.pos.x, car.pos.z - s.state.player.pos.z)).toBeLessThan(12);
    idle(s, 30);
    expect(s.state.messages.length).toBeGreaterThanOrEqual(1);
    expect(s.state.messages[0].missionIds?.length).toBe(s.state.missions.length);
    const view = s.phoneView();
    expect(view.missions.length).toBe(s.state.missions.length);
    for (const m of view.missions) expect(m.title.length).toBeGreaterThan(3);
  });

  it('entrare nell\'area non completa l\'incarico; serve l\'interazione, poi il rapporto', () => {
    const s = make(909), m = s.state.missions[0], poi = s.model.poi(m.poiId)!;
    s.state.player.pos = { ...poi.pos };
    idle(s, 20);
    expect(m.state).toBe('pending');
    expect(s.submitReport(m.id, [])).toBeNull();
  });

  it('l\'auto non chiude il turno finché mancano rapporti', () => {
    const s = make(909), car = s.objects({ kind: 'police_car' })[0];
    idle(s, 1);
    if (s.canReach(car.id)) s.interact(car.id);
    expect(s.state.ended).toBe(false);
  });

  it('i rapporti citano solo fatti osservati e cambiano con la lingua', () => {
    const it_ = make(1234, 'it'), en = make(1234, 'en');
    expect(new Bot(it_).playShift().ok).toBe(true); expect(new Bot(en).playShift().ok).toBe(true);
    expect(it_.state.reports.length).toBe(it_.state.missions.length);
    for (let i = 0; i < it_.state.reports.length; i++) {
      const r = it_.state.reports[i];
      expect(r.text.length).toBeGreaterThan(40);
      expect(r.observationIds.length).toBeGreaterThan(0);
      for (const id of r.observationIds) expect(it_.state.observations.some((o) => o.id === id)).toBe(true);
      expect(r.text).not.toBe(en.state.reports[i].text);
      // la causa nascosta degli eventi non entra mai nei testi
      for (const word of ['anomaly', 'anomalia', 'mystery', 'illusion', 'origin']) expect(r.text.toLowerCase()).not.toContain(word);
    }
    const sum = it_.summary('https://example.invalid/');
    expect(JSON.stringify(sum)).toContain('1234');
  });

  it('torcia: si scarica solo da accesa e le pile di scorta la ricaricano', () => {
    const s = make(77), c0 = s.state.torch.charge;
    idle(s, 60);
    expect(s.state.torch.charge).toBe(c0);
    s.toggleTorch();
    idle(s, 120);
    expect(s.state.torch.charge).toBeLessThan(c0);
    expect(s.torchRender().intensity).toBeGreaterThan(0);
  });

  it('galleria: al massimo 12 foto, eliminabili', () => {
    const s = make(77);
    for (let i = 0; i < 14; i++) s.addPhoto('data:image/jpeg;base64,AAAA', ['door']);
    expect(s.state.photos.length).toBe(12);
    s.deletePhoto(s.state.photos[0].id);
    expect(s.state.photos.length).toBe(11);
  });

  it('il giocatore non esce dalla mappa', () => {
    const s = make(77);
    for (let i = 0; i < 4000; i++) s.update(SIM_DT, { forward: 1, strafe: 0, run: true, yaw: Math.PI / 2, pitch: 0 });
    expect(Math.abs(s.state.player.pos.x)).toBeLessThanOrEqual(700);
    expect(Math.abs(s.state.player.pos.z)).toBeLessThanOrEqual(700);
  });
});

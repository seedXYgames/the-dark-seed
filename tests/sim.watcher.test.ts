import { describe, expect, it, vi } from 'vitest';
import { GameSession } from '../src/game/session';
import { Watcher, hasWatcher } from '../src/sim/watcher';
import { MysteryMoodDirector } from '../src/sim/mysteryMood';
import type { ActorState } from '../src/core/contracts';

function fixture(seed = 0) {
  const s = new GameSession({ seed, lang: 'it' });
  s.spec.buildings = [];
  vi.spyOn(s.model, 'groundAt').mockReturnValue(0);
  vi.spyOn(s.model, 'heightAt').mockReturnValue(0);
  vi.spyOn(s.model, 'waterDepthAt').mockReturnValue(0);
  vi.spyOn(s.model, 'blockedAt').mockReturnValue(false);
  vi.spyOn(s.model, 'indoorsAt').mockReturnValue(false);
  vi.spyOn(s.model, 'resolve').mockImplementation((x, z) => ({ x, z }));
  vi.spyOn(s.model, 'move').mockImplementation((p, x, z) => ({ x: p.x + x, z: p.z + z }));
  const seen = vi.spyOn(s, 'playerCanSee').mockReturnValue(false);
  const watcher = new Watcher(s), mood = new MysteryMoodDirector(s);
  const step = (n: number) => { for (let i = 0; i < n * 10; i++) { s.state.time += 0.1; watcher.step(0.1); mood.step(0.1); } };
  return { s, watcher, mood, seen, step, a: s.state.actors.find(a => a.archetype === 'watcher')! };
}

describe('osservatore e musica misteriosa', () => {
  it('la presenza dipende dal seed e può accompagnare l’intero turno senza attaccare', () => {
    const x = fixture();
    expect(hasWatcher(0)).toBe(true);
    const pos = { ...x.a.pos };
    expect(fixture().a.pos).toEqual(pos);
    x.step(1200);
    expect(x.a.present).toBe(true); expect(x.a.data.watching).toBe(true);
    expect(x.s.state.death).toBeUndefined(); expect(x.s.state.ended).toBe(false);
    expect(x.mood.view()).toMatchObject({ active: true, watched: true });
  });
  it('se inquadrato scappa più veloce della corsa del giocatore', () => {
    const x = fixture(); x.step(80);
    const pl = x.s.state.player;
    const face = () => { pl.yaw = Math.atan2(x.a.pos.x - pl.pos.x, x.a.pos.z - pl.pos.z); };
    face();
    const d0 = x.s.playerDistance(x.a.pos);
    // il giocatore gli corre incontro a 5,8 m/s per 6 secondi, sempre guardandolo
    for (let i = 0; i < 60; i++) {
      const dx = x.a.pos.x - pl.pos.x, dz = x.a.pos.z - pl.pos.z, n = Math.hypot(dx, dz);
      pl.pos = { x: pl.pos.x + (dx / n) * 0.58, z: pl.pos.z + (dz / n) * 0.58 };
      face(); x.step(0.1);
    }
    expect(x.a.state).toBe('flee');
    expect(x.s.playerDistance(x.a.pos)).toBeGreaterThan(d0);
    expect(x.s.state.log.some(e => e.type === 'watcher_flees')).toBe(true);
  });
  it('resta fermo se è nel campo visivo ma non inquadrato, e si riposiziona solo fuori campo', () => {
    const x = fixture(); x.seen.mockReturnValue(true);
    const pos = { ...x.a.pos };
    x.step(10); expect(x.a.pos).toEqual(pos);
    x.s.state.player.pos = { x: pos.x + 200, z: pos.z };
    x.step(2); expect(x.a.pos).toEqual(pos);
    x.seen.mockReturnValue(false); x.step(2);
    expect(x.a.pos).not.toEqual(pos);
    expect(x.s.playerDistance(x.a.pos)).toBeGreaterThan(40);
    expect(x.s.playerDistance(x.a.pos)).toBeLessThan(110);
  });
  it('la musica sfuma se non può più osservare il giocatore e si spegne a fine turno', () => {
    const x = fixture(); x.step(80); expect(x.mood.view().active).toBe(true);
    x.s.state.player.indoors = true; x.step(35);
    expect(x.mood.view()).toMatchObject({ active: false, watched: false });
    x.s.state.player.indoors = false; x.step(10); expect(x.mood.view().active).toBe(true);
    x.s.state.ended = true; x.step(1); expect(x.mood.view()).toEqual({ active: false, watched: false, intensity: 0 });
  });
  it('una stranezza non percepita dall’altra parte della mappa non attiva l’indicatore', () => {
    const x = fixture(); x.a.present = false;
    const e = x.s.emit({ type: 'anomaly_sound', origin: 'anomaly', pos: { x: 600, z: -600 }, radius: 0 });
    e.perceivedByPlayer = false;
    x.mood.step(0.1); expect(x.mood.view().active).toBe(false);
  });
  it('eventi strani percepiti attivano la musica, poi la lasciano sfumare', () => {
    for (const kind of ['anomaly', 'illusion', 'mystery', 'encounter', 'sky', 'drift']) {
      const x = fixture(); x.a.present = false;
      const origin = ['anomaly', 'illusion', 'mystery'].includes(kind) ? kind as 'anomaly' | 'illusion' | 'mystery' : 'environment';
      const ev = x.s.emit({ type: kind === 'encounter' ? 'encounter_sound' : 'strange', origin, pos: x.s.state.player.pos,
        tags: kind === 'sky' ? ['unidentified'] : kind === 'drift' ? ['drift'] : [] });
      ev.perceivedByPlayer = true;
      for (let i = 0; i < 30; i++) { x.s.state.time += 0.1; x.mood.step(0.1); }
      expect(x.mood.view().active, kind).toBe(true);
      for (let i = 0; i < 400; i++) { x.s.state.time += 0.1; x.mood.step(0.1); }
      expect(x.mood.view().active, kind).toBe(false);
    }
  });
  it('vedere una presenza strana attiva il segnale anche senza un nuovo evento sonoro', () => {
    const x = fixture(); x.a.present = false;
    x.s.state.actors.push({ ...x.a, id: 'alien', archetype: 'alien_grey', data: {}, present: true, pos: { ...x.s.state.player.pos } } as ActorState);
    x.seen.mockReturnValue(true);
    for (let i = 0; i < 25; i++) { x.s.state.time += 0.1; x.mood.step(0.1); }
    expect(x.mood.view()).toMatchObject({ active: true, watched: false });
  });
  it('i seed senza omino conservano la possibilità di eventi misteriosi', () => {
    const seed = Array.from({ length: 50 }, (_, i) => i).find(i => !hasWatcher(i))!;
    const x = fixture(seed); expect(x.a).toBeUndefined();
    const e = x.s.emit({ type: 'anomaly_manifest', origin: 'anomaly', pos: x.s.state.player.pos }); e.perceivedByPlayer = true;
    for (let i = 0; i < 20; i++) { x.s.state.time += 0.1; x.mood.step(0.1); }
    expect(x.mood.view().active).toBe(true);
  });
  it('anche un SMS misterioso attiva il segnale una sola volta, senza tenerlo acceso per sempre', () => {
    const x = fixture(); x.a.present = false;
    x.s.sendSms('garbled', {});
    for (let i = 0; i < 20; i++) { x.s.state.time += 0.1; x.mood.step(0.1); }
    expect(x.mood.view().active).toBe(true);
    for (let i = 0; i < 400; i++) { x.s.state.time += 0.1; x.mood.step(0.1); }
    expect(x.mood.view().active).toBe(false);
  });
  it('notare un mutamento del mondo fa partire il segnale anche se la sua causa era fuori vista', () => {
    const x = fixture(); x.a.present = false;
    x.s.observe('changed', 'chair', { moved: true });
    for (let i = 0; i < 20; i++) { x.s.state.time += 0.1; x.mood.step(0.1); }
    expect(x.mood.view().active).toBe(true);
  });
  it('un’alterazione locale attiva il segnale anche quando la presenza che la produce è invisibile', () => {
    const x = fixture(); x.a.present = false;
    x.s.state.actors.push({ ...x.a, id: 'rain', kind: 'anomaly', present: true, visible: false, pos: { ...x.s.state.player.pos },
      data: {}, capabilities: [{ id: 'alter_local', property: 'rain_up', intensity: 0.8 }] });
    for (let i = 0; i < 20; i++) { x.s.state.time += 0.1; x.mood.step(0.1); }
    expect(x.mood.view().active).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { GameSession } from '../src/game/session';
import { Encounters, encounterPlan, encounterSight } from '../src/sim/encounters';
import { TORCH_ANGLE } from '../src/core/torch';

function setup(seed: number, flat = true) {
  const s = new GameSession({ seed, lang: 'it' });
  const e = new Encounters(s);
  const members = s.state.actors.filter(a => a.kind === 'encounter' && !['ufo_wreck', 'ritual_site', 'alien_tents'].includes(a.archetype));
  if (flat) {
    s.spec.buildings = [];
    vi.spyOn(s.model, 'groundAt').mockReturnValue(0);
    vi.spyOn(s.model, 'heightAt').mockReturnValue(0);
    vi.spyOn(s.model, 'waterDepthAt').mockReturnValue(0);
    vi.spyOn(s.model, 'move').mockImplementation((p, dx, dz) => ({ x: p.x + dx, z: p.z + dz }));
    vi.spyOn(s, 'sky').mockReturnValue({ ...s.sky(), ambient: 0.02 });
    vi.spyOn(s, 'weather').mockReturnValue({ ...s.weather(), fog: 0, wind: 0 });
  }
  const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 10); i++) { s.state.time += 0.1; e.step(0.1); } };
  const place = (d: number, facing = true) => {
    const a = members[0];
    s.state.player.pos = { x: a.pos.x, z: a.pos.z + d };
    for (const m of members) m.heading = facing ? Math.atan2(s.state.player.pos.x - m.pos.x, s.state.player.pos.z - m.pos.z) : Math.PI;
  };
  return { s, e, members, step, place };
}

describe('incontri fisici', () => {
  it('seed di prova: bigfoot, rito e alieni nei due contesti, riproducibili e raggiungibili', () => {
    for (const [seed, archetype, count] of [[14, 'bigfoot', 1], [7, 'cultist', 3], [13, 'alien_grey', 4], [78, 'alien_green', 2]] as const) {
      const { s, members } = setup(seed, false);
      expect(members.length).toBe(count);
      expect(members.every(a => a.archetype === archetype)).toBe(true);
      const reachable = s.model.reachable(s.spec.playerSpawn.pos);
      for (const a of members) expect(reachable.at(a.pos.x, a.pos.z)).toBe(true);
      expect(setup(seed, false).s.state.actors).toEqual(s.state.actors);
      if (seed === 13) expect(s.state.actors.some(a => a.archetype === 'alien_tents')).toBe(true);
      if (seed === 78) expect(s.state.actors.some(a => a.archetype === 'ufo_wreck')).toBe(true);
    }
  });
  it('la selezione include turni ordinari, entrambi i colori e gruppi da 2 a 5', () => {
    const plans = Array.from({ length: 1000 }, (_, s) => encounterPlan(s));
    expect(plans.some(p => p.kind === 'none')).toBe(true);
    for (const kind of ['aliens', 'cult']) expect(new Set(plans.filter(p => p.kind === kind).map(p => p.count))).toEqual(new Set([2, 3, 4, 5]));
    expect(new Set(plans.filter(p => p.kind === 'aliens').map(p => p.skin))).toEqual(new Set(['grey', 'green']));
  });
  it('si possono osservare da lontano senza essere individuati', () => {
    const x = setup(14); x.place(80); x.step(10);
    expect(x.members[0].state).toBe('patrol'); expect(x.s.state.death).toBeUndefined();
  });
  it('corsa e torcia rivelano il giocatore prima della vista notturna normale', () => {
    for (const mode of ['quiet', 'running', 'torch']) {
      const x = setup(14); x.place(28); x.s.state.player.running = mode === 'running';
      x.s.state.torch.on = mode === 'torch'; x.step(1.3);
      expect(x.members[0].state === 'chase').toBe(mode !== 'quiet');
    }
  });
  it('un rumore del giocatore viene ricordato tra i passi di percezione', () => {
    const x = setup(14); x.place(28, false); x.step(0.1);
    x.s.emit({ type: 'door_bang', pos: x.s.state.player.pos, origin: 'player', sound: { kind: 'door_bang', loudness: 45 } });
    x.step(1.1); expect(x.members[0].state).toBe('chase');
  });
  it('muri e terreno interrompono la vista, anche con la torcia', () => {
    const x = setup(14); x.place(28); x.s.state.torch.on = true;
    vi.spyOn(x.s.model, 'heightAt').mockReturnValue(100);
    expect(encounterSight(x.s.model, x.members[0].pos, x.s.state.player.pos)).toBe(false);
    x.step(2); expect(x.members[0].state).not.toBe('chase');
    vi.spyOn(x.s.model, 'heightAt').mockReturnValue(0);
    const a = x.members[0], p = x.s.state.player.pos;
    x.s.spec.buildings = [{ id: 'wall', pos: { x: (a.pos.x + p.x) / 2, z: (a.pos.z + p.z) / 2 }, w: 5, d: 5, h: 4, floorY: 0, rotY: 0 } as any];
    expect(encounterSight(x.s.model, a.pos, p)).toBe(false);
  });
  it('bigfoot e setta possono raggiungere e uccidere; il turno si ferma', () => {
    for (const seed of [14, 7]) {
      const x = setup(seed); x.place(6); x.s.state.torch.on = true; x.step(15);
      expect(x.s.state.death?.kind).toBe(seed === 14 ? 'bigfoot' : 'cultist');
      expect(x.s.state.ended).toBe(true); expect(x.s.summary('http://localhost/').outcome).toBe('killed');
      const p = { ...x.members[0].pos }; x.step(5); expect(x.members[0].pos).toEqual(p);
      expect(x.s.interact(x.s.objects({ kind: 'police_car' })[0].id)).toBeNull();
    }
  });
  it('spenta la luce e interrotta la vista, cercano poi tornano al luogo senza inseguimento onnisciente', () => {
    const x = setup(14); x.place(28); x.s.state.torch.on = true; x.step(1.3);
    expect(x.members[0].state).toBe('chase');
    x.s.state.torch.on = false; x.place(400); x.step(14);
    expect(x.members[0].state).toBe('search'); x.step(19); expect(x.members[0].state).toBe('patrol');
  });
  it('gli alieni seguono, fanno versi, non uccidono e fuggono dopo pochi minuti', () => {
    const x = setup(78); x.place(6); x.s.state.torch.on = true; x.step(2);
    expect(x.members.some(a => a.state === 'chase')).toBe(true);
    x.step(240);
    expect(x.s.state.death).toBeUndefined(); expect(x.s.state.ended).toBe(false);
    expect(x.s.state.log.some(e => e.sound?.kind === 'alien_call')).toBe(true);
    expect(x.members.every(a => !a.present)).toBe(true);
  });
  it('il cono della torcia ha metà raggio alla stessa distanza', () => {
    expect(Math.tan(TORCH_ANGLE / 2) / Math.tan(1.16 / 2)).toBeCloseTo(0.5, 10);
  });
});

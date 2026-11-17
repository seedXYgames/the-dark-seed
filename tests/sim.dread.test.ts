import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/session';
import { DREAD_HUSH, DreadDirector } from '../src/sim/dread';

function run(seed: number, seconds: number) {
  const s = new GameSession({ seed, lang: 'it' });
  const d = new DreadDirector(s);
  const hushes: { t: number; v: number }[] = [];
  for (let i = 0; i < seconds * 10; i++) {
    s.state.time += 0.1;
    d.step(0.1, false);
    const h = d.hush();
    hushes.push({ t: s.state.time, v: h ? h.strength : 0 });
  }
  return { s, d, hushes };
}

describe('regia della paura', () => {
  it('è deterministica e i colpi sono rari', () => {
    const a = run(7, 1800), b = run(7, 1800);
    expect(a.d.done).toEqual(b.d.done);
    expect(a.d.done.length).toBeGreaterThanOrEqual(3);
    expect(a.d.done.length).toBeLessThanOrEqual(12);
  });
  it('ogni colpo è preceduto dal silenzio della natura', () => {
    const { hushes, s } = run(11, 1200);
    const dreadEvents = s.state.log.filter((e) => e.tags.includes('dread'));
    for (const e of dreadEvents) {
      const before = hushes.find((h) => Math.abs(h.t - (e.t - 1)) < 0.06);
      expect(before?.v ?? 0).toBeGreaterThan(0.5);
    }
    expect(DREAD_HUSH).toBeGreaterThanOrEqual(3);
  });
  it('il passo imitato arriva da dietro, vicino', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { s } = run(seed, 1500);
      const step = s.state.log.find((e) => e.type === 'dread_step');
      if (!step) continue;
      expect(s.playerDistance(step.pos)).toBeLessThan(6);
      return;
    }
    throw new Error('nessun passo imitato in 40 seed');
  });
});

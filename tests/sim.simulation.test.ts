import { describe, expect, it } from 'vitest';
import { EXTREME_PROBABILITY, SEED_MAX, WORLD_HALF } from '../src/core/contracts';
import { Bot } from '../src/game/bot';
import { GameSession, SIM_DT } from '../src/game/session';
import { diagnose } from '../src/sim/analysis';
import { extremeStateAt, isExtremeSeed, makeExtremePlan } from '../src/sim/extreme';
import { seedMysteries } from '../src/sim/mysteries';
import { MAX_DRIFT, createSimulation } from '../src/sim/simulation';

const make = (seed: number) => new GameSession({ seed, lang: 'it', simFactory: createSimulation, postProcess: seedMysteries });
const play = (seed: number) => { const s = make(seed); const r = new Bot(s).playShift(); return { s, r }; };
const idle = (s: GameSession, seconds: number) => { for (let i = 0; i < seconds / SIM_DT; i++) s.update(SIM_DT, { forward: 0, strafe: 0, run: false, yaw: s.state.player.yaw, pitch: 0 }); };
const SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i * 7919);
const shifts = SEEDS.map(play);

describe('turni completi con simulazione attiva', () => {
  it('20 seed: 2–5 incarichi, tutti completabili dall\'auto all\'auto', () => {
    for (const { s, r } of shifts) {
      expect(r.ok, `seed ${s.state.seed}: ${r.reason}`).toBe(true);
      expect(s.state.missions.length).toBeGreaterThanOrEqual(2);
      expect(s.state.missions.length).toBeLessThanOrEqual(5);
      expect(s.state.missions.every((m) => m.state === 'reported')).toBe(true);
    }
  });

  it('stesso seed e stessi input: stesso mondo, stessi eventi', () => {
    const a = shifts[3].s.state, b = play(SEEDS[3]).s.state;
    expect(b.log.length).toBe(a.log.length);
    expect(b.log.map((e) => `${e.t.toFixed(1)}|${e.type}|${e.origin}|${e.pos.x.toFixed(2)}`)).toEqual(a.log.map((e) => `${e.t.toFixed(1)}|${e.type}|${e.origin}|${e.pos.x.toFixed(2)}`));
    expect(b.messages.map((m) => m.text)).toEqual(a.messages.map((m) => m.text));
    expect(b.actors.map((x) => x.pos)).toEqual(a.actors.map((x) => x.pos));
  });

  it('seed diversi producono turni diversi', () => {
    const sig = new Set(shifts.map(({ s }) => s.state.log.map((e) => e.type).join(',')));
    expect(sig.size).toBe(shifts.length);
  });

  it('gli oggetti degli incarichi non vengono mai rimossi, spostati o usati da altri', () => {
    for (const { s } of shifts) {
      const essential = new Set(s.state.missions.map((m) => m.targetObjectId));
      for (const e of s.state.log) {
        if (e.origin === 'player' || !e.objectId || !essential.has(e.objectId)) continue;
        expect(['bin_tipped', 'rain_on_fire'], `${e.type} su oggetto essenziale`).toContain(e.type);
      }
      for (const id of essential) { expect(s.state.objects[id].taken).not.toBe(true); expect(s.state.objectPos[id]).toBeUndefined(); }
    }
  });

  it('il mondo agisce da solo: fauna, ambiente e catene causali', () => {
    let fauna = 0, env = 0, chained = 0, npc = 0;
    for (const { s } of shifts) { const d = diagnose(s.state); fauna += d.byOrigin.fauna ?? 0; env += d.byOrigin.environment ?? 0; npc += d.byOrigin.npc ?? 0; chained += d.chained; expect(d.drift).toBeLessThanOrEqual(MAX_DRIFT); }
    expect(fauna).toBeGreaterThan(20); expect(env).toBeGreaterThan(20); expect(npc).toBeGreaterThan(5); expect(chained).toBeGreaterThan(10);
  });

  it('ogni conseguenza indica una causa esistente e precedente', () => {
    for (const { s } of shifts) {
      const byId = new Map(s.state.log.map((e) => [e.id, e]));
      for (const e of s.state.log) if (e.causeEventId !== undefined) { const c = byId.get(e.causeEventId); expect(c).toBeDefined(); expect(c!.t).toBeLessThanOrEqual(e.t); }
      for (const m of s.state.messages) if (m.causeEventId !== undefined) expect(byId.has(m.causeEventId)).toBe(true);
    }
  });

  it('la deriva sottile avviene solo fuori vista', () => {
    // host che registra la visibilità al momento della deriva
    const s = make(4242);
    const seen: boolean[] = [];
    const emit = s.emit.bind(s);
    s.emit = (e) => { if (e.tags?.includes('drift')) seen.push(s.playerCanSee(e.pos)); return emit(e); };
    idle(s, 1500);
    expect(seen.every((v) => v === false)).toBe(true);
  });
});

describe('attori', () => {
  it('le anomalie nascono da primitive di capacità, non da un catalogo fisso', () => {
    const sets = new Set<string>(), archetypes = new Set<string>();
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed);
      for (const a of s.state.actors.filter((x) => x.kind === 'anomaly')) {
        n++;
        expect(a.capabilities.length).toBeGreaterThanOrEqual(2);
        for (const c of a.capabilities) { expect(c.intensity).toBeGreaterThan(0); expect(c.intensity).toBeLessThanOrEqual(1); }
        sets.add(a.capabilities.map((c) => c.id).sort().join('+')); archetypes.add(a.archetype);
        expect(a.present).toBe(false);
      }
    }
    expect(n).toBeGreaterThan(30);
    expect(sets.size).toBeGreaterThan(20);
    expect(archetypes.size).toBeGreaterThanOrEqual(3);
  });

  it('i PNG seguono una routine, parlano solo di ciò che sanno e non conoscono la verità', () => {
    let talked = 0;
    for (const { s } of shifts) for (const a of s.state.actors.filter((x) => x.kind === 'npc')) {
      expect(a.routine.length).toBeGreaterThan(1);
      a.present = true;
      const f = s.sim.npcTalk(a.id)!;
      expect(Object.keys(f).sort()).toEqual(['archetype', 'direction', 'goal', 'saw']);
      expect(['lights', 'animal', 'person', 'nothing']).toContain(f.saw);
      talked++;
    }
    expect(talked).toBeGreaterThan(10);
  });

  it('gli attori restano dentro la mappa e fuori dall\'acqua profonda', () => {
    for (const { s } of shifts) for (const a of s.state.actors) {
      expect(Math.abs(a.pos.x)).toBeLessThanOrEqual(WORLD_HALF); expect(Math.abs(a.pos.z)).toBeLessThanOrEqual(WORLD_HALF);
      if (a.kind === 'fauna' && a.state !== 'perch') expect(s.model.waterDepthAt(a.pos.x, a.pos.z)).toBeLessThan(0.6);
    }
  });

  it('le illusioni si rivelano da vicino e non tornano ambigue', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = make(seed), ill = s.state.actors.find((a) => a.kind === 'illusion');
      if (!ill) continue;
      expect(ill.data.reveal).toBe(0);
      s.state.player.pos = { x: ill.pos.x + 3, z: ill.pos.z };
      idle(s, 4);
      expect(ill.data.reveal).toBe(1);
      s.state.player.pos = { x: ill.pos.x + 200, z: ill.pos.z };
      idle(s, 2);
      expect(ill.data.reveal).toBe(1);
      return;
    }
    throw new Error('nessuna illusione in 40 seed');
  });

  it('i conigli brucano vicino alla tana e scappano quando il giocatore si avvicina', () => {
    const s = make(203), rabbits = s.state.actors.filter((a) => a.archetype === 'rabbit');
    expect(rabbits.length).toBeGreaterThanOrEqual(4);
    const rb = rabbits[0], from = { x: rb.pos.x, z: rb.pos.z };
    s.state.player.pos = { x: rb.pos.x + 5, z: rb.pos.z };
    idle(s, 3);
    expect(Math.hypot(rb.pos.x - from.x, rb.pos.z - from.z)).toBeGreaterThan(8);
    expect(s.state.log.some((e) => e.type === 'fauna_flee' && e.actorId === rb.id)).toBe(true);
  });

  it('di notte gufi e uccelli notturni si fanno sentire, e a volte una luce attraversa il cielo', () => {
    let owl = 0, bird = 0, heard = 0, sky = 0;
    for (const seed of [94, 203, 241]) {
      const s = make(seed);
      idle(s, 1500);
      for (const e of s.state.log) {
        if (e.type === 'owl_call') owl++;
        if (e.type === 'bird_call') bird++;
        if ((e.type === 'owl_call' || e.type === 'bird_call') && e.perceivedByPlayer) heard++;
        if (e.type === 'sky_light') { sky++; expect(e.sound).toBeUndefined(); }
      }
      for (const l of s.sim.localAlterations().lights) expect(Number.isFinite(l.pos.x + l.pos.y + l.pos.z)).toBe(true);
    }
    expect(owl).toBeGreaterThan(10); expect(bird).toBeGreaterThan(4); expect(heard).toBeGreaterThan(5); expect(sky).toBeGreaterThanOrEqual(2);
  });
});

describe('misteri', () => {
  it('ogni mondo ha misteri con indizi fisici raggiungibili e nessuna spiegazione', () => {
    const themes = new Set<string>();
    for (const { s } of shifts) {
      expect(s.spec.mysteries.length).toBeGreaterThanOrEqual(1);
      for (const m of s.spec.mysteries) {
        themes.add(m.theme);
        expect(m.clues.length).toBeGreaterThanOrEqual(1);
        for (const c of m.clues) {
          const o = s.object(c.objectId)!;
          expect(o).toBeDefined();
          expect(Number.isFinite(o.y)).toBe(true);
          expect(s.model.blockedAt(o.pos.x, o.pos.z)).toBe(false);
          expect(Math.abs(o.y - s.model.groundAt(o.pos.x, o.pos.z))).toBeLessThan(0.2);
        }
      }
    }
    expect(themes.size).toBeGreaterThanOrEqual(5);
  });
});

describe('evento estremo', () => {
  it('circa lo 0,01% dei seed è predisposto (conteggio esatto su tutti i seed)', () => {
    let c = 0;
    const first: number[] = [];
    for (let s = 0; s <= SEED_MAX; s++) if (isExtremeSeed(s)) { c++; if (first.length < 3) first.push(s); }
    const expected = (SEED_MAX + 1) * EXTREME_PROBABILITY; // ≈100
    expect(c).toBeGreaterThan(expected - 4 * Math.sqrt(expected));
    expect(c).toBeLessThan(expected + 4 * Math.sqrt(expected));
    // un seed predisposto ha un piano; uno normale no
    expect(make(first[0]).state.extreme.plan).toBeDefined();
    expect(make(first[0]).state.extreme.predisposed).toBe(true);
  }, 120_000);

  it('nei turni normali non si innesca mai', () => {
    for (const { s } of shifts) { expect(s.state.extreme.predisposed).toBe(false); expect(s.state.extreme.startedAt).toBeUndefined(); expect(s.sim.extremeState().active).toBe(false); }
  });

  it('il piano è deterministico e gli inviluppi restano in 0..1 e tornano a zero', () => {
    const p = makeExtremePlan(77);
    expect(makeExtremePlan(77)).toEqual(p);
    expect(p.phases.length).toBeGreaterThanOrEqual(4);
    for (let t = 0; t < p.total + 5; t += 0.25) {
      const e = extremeStateAt(p, t, 77);
      for (const v of [e.codeRain, e.strip, e.sky, e.decompose, e.stutter]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      if (t >= p.total) expect(e).toMatchObject({ active: false, codeRain: 0, strip: 0, sky: 0, decompose: 0, stutter: 0 });
    }
  });

  it('forzato in sviluppo: comincia, finisce, e il turno resta completabile', () => {
    const s = make(55);
    idle(s, 5);
    s.sim.devForceExtreme();
    expect(s.state.extreme.predisposed).toBe(false);
    idle(s, 3);
    expect(s.sim.extremeState().active).toBe(true);
    idle(s, s.state.extreme.plan!.total + 2);
    expect(s.sim.extremeState().active).toBe(false);
    expect(s.state.extreme.done).toBe(true);
    expect(new Bot(s).playShift().ok).toBe(true);
  });
});

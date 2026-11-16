import { describe, expect, it } from 'vitest';
import type { LoopKind, SoundKind, SoundscapeLevels, Surface } from '../src/core/api';
import { AudioEngine, MAX_LOOPS, MAX_ONE_SHOTS } from '../src/audio/engine';
import { AMBIENT_RECIPES, LOOPS, RECIPES, createNoiseBank, distortionCurve, footstepRecipe } from '../src/audio/synth';
import { Rng } from '../src/core/rng';

const KINDS: SoundKind[] = [
  'door_open', 'door_close', 'door_locked', 'door_bang', 'switch', 'generator_start', 'generator_stop', 'drawer',
  'tent_zip', 'breaker', 'metal_clank', 'bin_tip', 'twig', 'owl', 'fox', 'deer', 'crows', 'frog', 'splash',
  'vehicle_pass', 'vehicle_start', 'car_door', 'typing', 'paper', 'camera', 'sms', 'battery', 'click', 'steps_far',
  'voice_far', 'knock', 'hum_anom', 'whisper_anom', 'tone_anom', 'thunder', 'branch_fall', 'fire_douse', 'ui',
  'torch_click', 'rustle', 'chair_scrape', 'report_sent',
];
const LOOP_KINDS: LoopKind[] = ['generator', 'water', 'fire', 'lamp_buzz', 'anom_drone', 'engine_idle'];
const SURFACES: Surface[] = ['grass', 'dirt', 'road', 'wood', 'snow', 'floor', 'wet'];
const LEVELS: SoundscapeLevels = { wind: 0.6, rain: 0.8, insects: 0.5, frogs: 0.9, birds: 0.7, water: 0.4, leaves: 0.6, human: 0.2, room: 0.1, hush: 0 };

/**
 * Contesto Web Audio finto: registra le chiamate e controlla gli errori di programmazione che
 * un vero AudioContext solleverebbe (rampe esponenziali verso valori non positivi, tempi non finiti).
 */
class FakeCtx {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  calls: Record<string, number> = {};
  errors: string[] = [];
  live = 0; // connessioni attive verso nodi
  destination = this.node('destination');
  listener = this.node('listener');
  private count(k: string) { this.calls[k] = (this.calls[k] ?? 0) + 1; }
  private param(): unknown {
    const ctx = this;
    const chk = (name: string, v: number, t: number) => {
      if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) ctx.errors.push(`${name}(${v}, ${t})`);
      if (name === 'exponentialRampToValueAtTime' && !(v > 0)) ctx.errors.push(`${name} target ${v}`);
    };
    const p: Record<string, unknown> = { value: 0 };
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) {
      p[m] = (v: number, t: number, tc?: number) => {
        ctx.count(m);
        chk(m, v, t);
        if (m === 'setTargetAtTime' && !(tc !== undefined && tc > 0)) ctx.errors.push('setTargetAtTime tc');
        return p;
      };
    }
    p.cancelScheduledValues = () => p;
    return p;
  }
  node(kind: string): any {
    const ctx = this;
    const n: Record<string, unknown> = { __kind: kind };
    return new Proxy(n, {
      get(t, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        if (prop in t) return t[prop];
        if (prop === 'connect') return (dst: unknown) => { ctx.count('connect'); if (dst == null) ctx.errors.push('connect(null)'); ctx.live++; return dst; };
        if (prop === 'disconnect') return () => { ctx.count('disconnect'); ctx.live--; };
        if (prop === 'start' || prop === 'stop') {
          return (when?: number, off?: number) => {
            ctx.count(kind + '.' + prop);
            if (when !== undefined && !(Number.isFinite(when) && when >= 0)) ctx.errors.push(`${prop}(${when})`);
            if (off !== undefined && !(Number.isFinite(off) && off >= 0)) ctx.errors.push(`offset ${off}`);
          };
        }
        if (prop === 'setPosition' || prop === 'setOrientation') return () => ctx.count(prop);
        // qualunque altra proprietà letta è un AudioParam (gain, frequency, positionX…)
        return (t[prop] = ctx.param());
      },
      set(t, prop, value) { t[prop as string] = value; return true; },
    });
  }
  createBuffer(_ch: number, len: number, sr: number) {
    const d = new Float32Array(len);
    return { duration: len / sr, length: len, sampleRate: sr, getChannelData: () => d };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
for (const k of ['Gain', 'Oscillator', 'BufferSource', 'BiquadFilter', 'Panner', 'StereoPanner', 'DynamicsCompressor', 'WaveShaper', 'Delay']) {
  (FakeCtx.prototype as any)['create' + k] = function (this: FakeCtx) {
    this.calls['create' + k] = (this.calls['create' + k] ?? 0) + 1;
    return this.node(k);
  };
}
const fake = () => new FakeCtx() as FakeCtx & Record<string, any>;
const asCtx = (f: FakeCtx) => f as unknown as AudioContext;

describe('AudioEngine without Web Audio (node)', () => {
  it('is constructible and every method is a safe no-op, before and after resume', async () => {
    const e = new AudioEngine();
    const all = () => {
      e.setMuted(true);
      e.setMuted(false);
      e.setListener({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 });
      e.setListener({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      e.setAmbient(LEVELS);
      e.setAmbient({} as SoundscapeLevels);
      for (const k of KINDS) {
        e.playOneShot(k);
        e.playOneShot(k, { pos: { x: 10, y: 1, z: -5 }, gain: 0.5, pitch: 1.2 });
      }
      e.playOneShot('nope' as SoundKind);
      for (const k of LOOP_KINDS) e.setLoop('l-' + k, k, { x: 0, y: 0, z: 0 }, 0.8);
      e.setLoop('l-fire', null);
      e.setLoop('missing', null);
      for (const s of SURFACES) { e.footstep(s, false); e.footstep(s, true); }
      e.setDistortion(0.7);
      e.setDistortion(0);
      e.tick();
      e.suspend();
    };
    expect(all).not.toThrow();
    await expect(e.resume()).resolves.toBeUndefined();
    await expect(e.resume()).resolves.toBeUndefined();
    expect(all).not.toThrow();
    expect(() => { e.dispose(); e.dispose(); }).not.toThrow();
    expect(all).not.toThrow();
    await expect(e.resume()).resolves.toBeUndefined();
  });

  it('survives a context factory that throws or a context that breaks mid-build', async () => {
    const a = new AudioEngine({ createContext: () => { throw new Error('no audio'); } });
    await a.resume();
    expect(() => { a.playOneShot('owl'); a.setAmbient(LEVELS); a.dispose(); }).not.toThrow();
    const b = new AudioEngine({ createContext: () => ({ sampleRate: 8000 }) as unknown as AudioContext });
    await b.resume();
    expect(() => { b.playOneShot('owl'); b.setLoop('x', 'fire'); b.tick(); b.dispose(); }).not.toThrow();
  });
});

describe('synth recipes on an injected context', () => {
  const run = (fn: (f: FakeCtx, p: { pitch: number; rng: Rng; noise: ReturnType<typeof createNoiseBank> }) => void) => {
    const f = fake();
    const noise = createNoiseBank(asCtx(f), new Rng('t/noise'), 0.5);
    fn(f, { pitch: 1, rng: new Rng('t'), noise });
    return f;
  };

  it('noise buffers are normalised, loop-safe and deterministic', () => {
    const f = fake();
    const a = createNoiseBank(asCtx(f), new Rng('n'), 0.5);
    const b = createNoiseBank(asCtx(f), new Rng('n'), 0.5);
    for (const k of ['white', 'pink', 'brown'] as const) {
      const d = a[k].getChannelData(0);
      let peak = 0;
      for (const x of d) peak = Math.max(peak, Math.abs(x));
      expect(peak).toBeGreaterThan(0.5);
      expect(peak).toBeLessThanOrEqual(0.9001);
      expect(Math.abs(d[d.length - 1] - d[0])).toBeLessThan(0.2);
      expect(Array.from(b[k].getChannelData(0).slice(0, 50))).toEqual(Array.from(d.slice(0, 50)));
    }
  });

  it('every SoundKind has a recipe that schedules sources validly and returns a sane duration', () => {
    expect(Object.keys(RECIPES).sort()).toEqual(KINDS.slice().sort());
    const signatures = new Set<string>();
    for (const kind of KINDS) {
      for (const pitch of [0.5, 1, 2]) {
        let dur = 0;
        const f = run((ctx, p) => { dur = RECIPES[kind](asCtx(ctx), ctx.node('out'), 1.5, { ...p, pitch }); });
        expect(f.errors, kind).toEqual([]);
        expect(dur, kind).toBeGreaterThan(0.03);
        expect(dur, kind).toBeLessThan(9);
        const started = (f.calls['Oscillator.start'] ?? 0) + (f.calls['BufferSource.start'] ?? 0);
        const stopped = (f.calls['Oscillator.stop'] ?? 0) + (f.calls['BufferSource.stop'] ?? 0);
        expect(started, kind).toBeGreaterThan(0);
        expect(stopped, kind + ' sources must all be stopped').toBe(started);
        if (pitch === 1) signatures.add(JSON.stringify(f.calls) + dur.toFixed(3));
      }
    }
    // ricette realmente diverse tra loro, non una sola con parametri cambiati
    expect(signatures.size).toBeGreaterThanOrEqual(KINDS.length - 2);
  });

  it('ambient one-shots, footsteps on every surface and loops build without scheduling errors', () => {
    for (const id of Object.keys(AMBIENT_RECIPES) as (keyof typeof AMBIENT_RECIPES)[]) {
      const f = run((ctx, p) => { expect(AMBIENT_RECIPES[id](asCtx(ctx), ctx.node('out'), 0, p)).toBeGreaterThan(0); });
      expect(f.errors, id).toEqual([]);
    }
    for (const s of SURFACES) for (const running of [false, true]) {
      const f = run((ctx, p) => { expect(footstepRecipe(asCtx(ctx), ctx.node('out'), 0.2, p, s, running, running)).toBeGreaterThan(0.05); });
      expect(f.errors, s).toEqual([]);
      expect(f.calls['BufferSource.start']).toBeGreaterThan(0);
    }
    for (const k of LOOP_KINDS) {
      const f = run((ctx, p) => {
        const h = LOOPS[k](asCtx(ctx), ctx.node('out'), p);
        h.tick?.(1, 0.1);
        h.tick?.(1.1, 0.1);
        h.stop(2);
      });
      expect(f.errors, k).toEqual([]);
      const started = (f.calls['Oscillator.start'] ?? 0) + (f.calls['BufferSource.start'] ?? 0);
      expect(started, k).toBeGreaterThan(1);
    }
  });

  it('distortion curve is bounded', () => {
    const c = distortionCurve(256);
    expect(c.length).toBe(256);
    for (const x of c) expect(Math.abs(x)).toBeLessThanOrEqual(1);
    expect(Math.abs(c[128])).toBeLessThan(0.05);
  });
});

describe('AudioEngine on an injected context', () => {
  const make = async () => {
    const f = fake();
    const e = new AudioEngine({ createContext: () => asCtx(f) });
    await e.resume();
    return { f, e };
  };
  const advance = (f: FakeCtx, e: AudioEngine, seconds: number) => {
    for (let i = 0; i < seconds * 10; i++) { f.currentTime += 0.1; e.tick(); }
  };

  it('builds the graph once, plays everything, schedules ambient events, and cleans up', async () => {
    const { f, e } = await make();
    await e.resume();
    expect(f.calls.createDynamicsCompressor).toBe(2);
    expect(f.calls.createWaveShaper).toBe(1);
    e.setListener({ x: 5, y: 1.7, z: 9 }, { x: 0, y: 0, z: 1 });
    e.setAmbient(LEVELS);
    const before = f.calls.createPanner ?? 0;
    for (const k of KINDS) e.playOneShot(k, { pos: { x: 20, y: 1, z: 30 }, gain: 1, pitch: 1 });
    // cap a 24 voci: le più deboli cedono il posto alle più forti, le nuove più deboli non partono
    const made = (f.calls.createPanner ?? 0) - before;
    expect(made).toBeGreaterThanOrEqual(MAX_ONE_SHOTS);
    expect(made).toBeLessThan(KINDS.length);
    expect(f.calls.disconnect ?? 0).toBe(0); // le voci sostituite sfumano, non vengono troncate subito
    e.playOneShot('ui');
    for (const s of SURFACES) e.footstep(s, true);
    advance(f, e, 12); // le voci finiscono e vengono rilasciate
    const p0 = f.calls.createPanner ?? 0;
    e.playOneShot('sms'); // senza pos: nessun panner
    expect(f.calls.createPanner ?? 0).toBe(p0);
    advance(f, e, 30);
    expect(f.calls.createPanner ?? 0).toBeGreaterThan(p0 + 10); // rane/uccelli/gocce/fronde programmati
    expect(f.errors).toEqual([]);
    e.setMuted(true);
    e.suspend();
    expect(f.state).toBe('suspended');
    const n = f.calls.createGain;
    e.playOneShot('knock');
    advance(f, e, 2);
    expect(f.calls.createGain).toBe(n); // sospeso: nessuna voce accumulata
    await e.resume();
    expect(f.state).toBe('running');
    e.dispose();
    expect(f.state).toBe('closed');
    expect(() => { e.playOneShot('owl'); e.setAmbient(LEVELS); e.tick(); }).not.toThrow();
  });

  it('silent ambient schedules no fauna events', async () => {
    const { f, e } = await make();
    e.setAmbient({ ...LEVELS, rain: 0, frogs: 0, birds: 0, leaves: 0 });
    advance(f, e, 60);
    expect(f.calls.createPanner ?? 0).toBe(0);
    e.dispose();
  });

  it('loops: keyed by id, updated in place, capped, faded out and disposed', async () => {
    const { f, e } = await make();
    e.setLoop('gen', 'generator', { x: 10, y: 0, z: 0 }, 1);
    expect(f.calls.createPanner).toBe(1);
    const gains = f.calls.createGain;
    e.setLoop('gen', 'generator', { x: 12, y: 0, z: 0 }, 0.5); // aggiornamento: nessun nodo nuovo
    expect(f.calls.createPanner).toBe(1);
    expect(f.calls.createGain).toBe(gains);
    for (let i = 0; i < 12; i++) e.setLoop('w' + i, 'water', { x: 400 + i, y: 0, z: 0 }, 0.3);
    expect(f.calls.createPanner).toBe(MAX_LOOPS); // gli altri sono più deboli di tutti i presenti
    e.setLoop('near', 'fire', { x: 1, y: 0, z: 0 }, 1); // più forte: prende il posto del più debole
    expect(f.calls.createPanner).toBe(MAX_LOOPS + 1);
    e.setLoop('ui-hum', 'lamp_buzz'); // senza pos, ma debole: scartato perché pieno
    const stopsBefore = (f.calls['Oscillator.stop'] ?? 0) + (f.calls['BufferSource.stop'] ?? 0);
    e.setLoop('gen', null);
    advance(f, e, 3);
    expect((f.calls['Oscillator.stop'] ?? 0) + (f.calls['BufferSource.stop'] ?? 0)).toBeGreaterThan(stopsBefore);
    expect(f.errors).toEqual([]);
    e.dispose();
  });

  it('loops requested before resume start once the context exists', async () => {
    const f = fake();
    const e = new AudioEngine({ createContext: () => asCtx(f) });
    e.setLoop('gen', 'generator', { x: 3, y: 0, z: 3 }, 1);
    e.setLoop('gone', 'fire', { x: 3, y: 0, z: 3 }, 1);
    e.setLoop('gone', null);
    expect(f.calls.createPanner).toBeUndefined();
    await e.resume();
    expect(f.calls.createPanner).toBe(1);
    e.dispose();
  });

  it('distortion connects the wet branch only while active and restores the clean path', async () => {
    const { f, e } = await make();
    const c0 = f.calls.connect;
    e.setDistortion(0);
    expect(f.calls.connect).toBe(c0);
    e.setDistortion(0.6);
    expect(f.calls.connect).toBe(c0 + 1);
    e.setDistortion(0.9);
    expect(f.calls.connect).toBe(c0 + 1);
    const d0 = f.calls.disconnect ?? 0;
    e.setDistortion(0);
    advance(f, e, 2);
    expect((f.calls.disconnect ?? 0)).toBe(d0 + 1);
    e.setDistortion(0.2);
    expect(f.calls.connect).toBe(c0 + 2);
    expect(f.errors).toEqual([]);
    e.dispose();
  });

  it('falls back to the deprecated listener API', async () => {
    const f = fake();
    f.listener = { setPosition: () => { f.calls.setPosition = (f.calls.setPosition ?? 0) + 1; }, setOrientation: () => { f.calls.setOrientation = (f.calls.setOrientation ?? 0) + 1; } };
    const e = new AudioEngine({ createContext: () => asCtx(f) });
    await e.resume();
    e.setListener({ x: 1, y: 2, z: 3 }, { x: 1, y: 0, z: 0 });
    expect(f.calls.setPosition).toBeGreaterThanOrEqual(2);
    expect(f.calls.setOrientation).toBeGreaterThanOrEqual(2);
    e.dispose();
  });
});

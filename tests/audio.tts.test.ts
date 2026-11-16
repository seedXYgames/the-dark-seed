import { describe, expect, it } from 'vitest';
import { Tts, chooseVoice, type SpeechSynthLike, type UtteranceLike, type VoiceInfo } from '../src/audio/tts';

const v = (name: string, lang: string, localService = false, def = false): VoiceInfo => ({ name, lang, localService, default: def });

describe('chooseVoice', () => {
  it('returns null without a matching language', () => {
    expect(chooseVoice([], 'it')).toBeNull();
    expect(chooseVoice([v('A', 'en-US', true, true), v('B', 'fr-FR', true)], 'it')).toBeNull();
    // "ita…"/"eng…" prefixes of other tags must not match by accident
    expect(chooseVoice([v('X', 'enx-ZZ', true)], 'en')).toBeNull();
  });
  it('prefers local voices over remote ones, even when the remote one is default', () => {
    const voices = [v('Remote IT', 'it-IT', false, true), v('Local IT', 'it-IT', true, false)];
    expect(chooseVoice(voices, 'it')?.name).toBe('Local IT');
  });
  it('among equally local voices prefers the default, then the canonical region, then order', () => {
    expect(chooseVoice([v('a', 'en-AU', true), v('b', 'en-IN', true, true), v('c', 'en-US', true)], 'en')?.name).toBe('b');
    expect(chooseVoice([v('a', 'en-AU', true), v('c', 'en-US', true)], 'en')?.name).toBe('c');
    expect(chooseVoice([v('a', 'en-AU', true), v('d', 'en-ZA', true)], 'en')?.name).toBe('a');
  });
  it('falls back to a remote voice when nothing local exists', () => {
    expect(chooseVoice([v('r1', 'it-CH'), v('r2', 'it-IT', false, true)], 'it')?.name).toBe('r2');
  });
  it('accepts bare, underscore and mixed-case language tags', () => {
    expect(chooseVoice([v('x', 'IT')], 'it')?.name).toBe('x');
    expect(chooseVoice([v('y', 'en_GB', true)], 'en')?.name).toBe('y');
  });
});

class FakeSynth implements SpeechSynthLike {
  spoken: UtteranceLike[] = [];
  cancels = 0;
  listeners: (() => void)[] = [];
  constructor(public voices: VoiceInfo[]) {}
  getVoices() { return this.voices; }
  speak(u: UtteranceLike) { this.spoken.push(u); }
  cancel() { this.cancels++; }
  addEventListener(_t: 'voiceschanged', cb: () => void) { this.listeners.push(cb); }
  removeEventListener(_t: 'voiceschanged', cb: () => void) { this.listeners = this.listeners.filter((l) => l !== cb); }
  end(i: number) { (this.spoken[i].onend as () => void)(); }
}
const mk = (text: string): UtteranceLike => ({ text, lang: '', voice: null, rate: 1, pitch: 1, volume: 1, onend: null, onerror: null });

describe('Tts', () => {
  it('works in node without speechSynthesis: unsupported, never throws', () => {
    const t = new Tts();
    expect(t.status()).toEqual({ supported: false, voice: { it: null, en: null }, local: { it: false, en: false } });
    expect(t.speak('ciao', 'it')).toBe(false);
    expect(t.speak('hello', 'en', { interrupt: true, rate: 5, pitch: -3 })).toBe(false);
    expect(() => { t.cancel(); t.setEnabled(false); t.setEnabled(true); t.dispose(); }).not.toThrow();
  });

  it('reports chosen voices and speaks only languages that have one', () => {
    const s = new FakeSynth([v('Alice', 'it-IT', true), v('Cloud EN', 'en-US', false)]);
    const t = new Tts({ synth: s, makeUtterance: mk });
    expect(t.status()).toEqual({ supported: true, voice: { it: 'Alice', en: 'Cloud EN' }, local: { it: true, en: false } });
    expect(t.speak('Buonasera.', 'it', { rate: 3, pitch: 0.1 })).toBe(true);
    expect(s.spoken).toHaveLength(1);
    expect(s.spoken[0].lang).toBe('it-IT');
    expect(s.spoken[0].rate).toBe(1.1);
    expect(s.spoken[0].pitch).toBe(0.7);
    expect((s.spoken[0].voice as VoiceInfo).name).toBe('Alice');
    expect(t.speak('   ', 'it')).toBe(false);
    t.dispose();

    const onlyIt = new Tts({ synth: new FakeSynth([v('Alice', 'it-IT', true)]), makeUtterance: mk });
    expect(onlyIt.speak('hello', 'en')).toBe(false);
    expect(onlyIt.status().voice.en).toBeNull();
    onlyIt.dispose();
  });

  it('discovers voices that arrive later through voiceschanged', () => {
    const s = new FakeSynth([]);
    const t = new Tts({ synth: s, makeUtterance: mk });
    expect(t.speak('ciao', 'it')).toBe(false);
    s.voices = [v('Luca', 'it-IT', true)];
    s.listeners.forEach((l) => l());
    expect(t.status().voice.it).toBe('Luca');
    expect(t.speak('ciao', 'it')).toBe(true);
    t.dispose();
    expect(s.listeners).toHaveLength(0);
  });

  it('queues overlapping lines, bounds the queue, and interrupt cancels the current one', () => {
    const s = new FakeSynth([v('Alice', 'it-IT', true)]);
    const t = new Tts({ synth: s, makeUtterance: mk });
    expect(t.speak('uno', 'it')).toBe(true);
    expect(t.speak('due', 'it')).toBe(true);
    expect(t.speak('tre', 'it')).toBe(true);
    expect(t.speak('quattro', 'it')).toBe(true);
    expect(s.spoken.map((u) => u.text)).toEqual(['uno']); // one at a time
    s.end(0);
    expect(s.spoken.map((u) => u.text)).toEqual(['uno', 'tre']); // oldest pending dropped
    expect(t.speak('ora', 'it', { interrupt: true })).toBe(true);
    expect(s.cancels).toBe(1);
    expect(s.spoken.map((u) => u.text)).toEqual(['uno', 'tre', 'ora']);
    s.end(1); // late end of the interrupted line must not advance anything
    s.end(2);
    expect(s.spoken).toHaveLength(3); // queue was cleared by interrupt
    t.dispose();
  });

  it('setEnabled(false) silences and cancels; errors in the synth never escape', () => {
    const s = new FakeSynth([v('Alice', 'it-IT', true)]);
    const t = new Tts({ synth: s, makeUtterance: mk });
    t.speak('uno', 'it');
    t.setEnabled(false);
    expect(s.cancels).toBe(1);
    expect(t.speak('due', 'it')).toBe(false);
    t.setEnabled(true);
    s.speak = () => { throw new Error('boom'); };
    s.cancel = () => { throw new Error('boom'); };
    expect(t.speak('tre', 'it')).toBe(false);
    expect(() => t.cancel()).not.toThrow();
    const broken = new Tts({ synth: { getVoices() { throw new Error('x'); }, speak() {}, cancel() {} }, makeUtterance: mk });
    expect(broken.speak('a', 'en')).toBe(false);
    expect(broken.status().supported).toBe(true);
  });
});

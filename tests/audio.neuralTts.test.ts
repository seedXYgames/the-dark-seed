import { describe, expect, it } from 'vitest';
import { NeuralTts, finishPcm, splitText } from '../src/audio/neuralTts';
import type { ITts } from '../src/core/api';

function fakeFallback(): ITts & { said: string[] } {
  const said: string[] = [];
  return {
    said,
    status: () => ({ supported: true, voice: { it: 'Luca', en: 'Daniel' }, local: { it: true, en: true } }),
    speak: (t: string) => { said.push(t); return true; },
    cancel: () => undefined,
    setEnabled: () => undefined,
  };
}

describe('voce neurale', () => {
  it('spezza i testi lunghi sui confini di frase senza perdere parole', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Frase numero ${i}, con qualche parola in più.`).join(' ');
    const parts = splitText(text, 120);
    expect(parts.length).toBeGreaterThan(5);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(120);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(text);
    expect(splitText('  Breve.  ')).toEqual(['Breve.']);
  });

  it('normalizza il volume e unisce i pezzi con una pausa', () => {
    const a = new Float32Array(1000).fill(0.3);
    const out = finishPcm([a, a], 16000, 0.1);
    expect(out.length).toBe(2000 + 1600);
    expect(Math.max(...out)).toBeCloseTo(0.85, 2);
    expect(out[0]).toBe(0);
  });

  it('senza uscita audio usa la voce del browser', () => {
    const fb = fakeFallback();
    const tts = new NeuralTts(fb, () => null);
    expect(tts.speak('Sono arrivato al fienile.', 'it')).toBe(true);
    expect(fb.said).toEqual(['Sono arrivato al fienile.']);
    expect(tts.status().voice.it).toBe('Riccardo (Piper)');
  });
});

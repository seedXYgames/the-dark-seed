import { describe, expect, it } from 'vitest';
import { parseSeed, randomSeed, seedFromUrl, shareUrl } from '../src/core/seed';

describe('parseSeed', () => {
  it('accepts the bounds and plain integers', () => {
    expect(parseSeed('0')).toEqual({ ok: true, seed: 0 });
    expect(parseSeed('1000000')).toEqual({ ok: true, seed: 1000000 });
    expect(parseSeed('  42 ')).toEqual({ ok: true, seed: 42 });
    expect(parseSeed('007')).toEqual({ ok: true, seed: 7 });
    expect(parseSeed('0000001000000')).toEqual({ ok: true, seed: 1000000 });
    expect(parseSeed('000')).toEqual({ ok: true, seed: 0 });
  });
  it('rejects empty input', () => {
    expect(parseSeed('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseSeed('   ')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects out of range values', () => {
    expect(parseSeed('-1')).toEqual({ ok: false, reason: 'out_of_range' });
    expect(parseSeed('1000001')).toEqual({ ok: false, reason: 'out_of_range' });
    expect(parseSeed('99999999999999999999999')).toEqual({ ok: false, reason: 'out_of_range' });
  });
  it('rejects decimals, exponents, signs and text', () => {
    for (const s of ['3.5', '3,5', '1e3', 'abc', '12abc', '+5', '0x10', '1 000', '--1', '-', '١٢', 'NaN', 'Infinity', '5.0']) {
      expect(parseSeed(s), s).toEqual({ ok: false, reason: 'not_integer' });
    }
  });
});

describe('randomSeed', () => {
  it('maps the unit interval onto [0, 1000000]', () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.9999999)).toBe(1000000);
    expect(randomSeed(() => 0.5)).toBe(500000);
  });
  it('never leaves the range, even with a misbehaving generator', () => {
    for (const v of [1, 2, -1, NaN, Infinity]) {
      const s = randomSeed(() => v);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1000000);
    }
    for (let i = 0; i < 2000; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s) && s >= 0 && s <= 1000000).toBe(true);
    }
  });
});

describe('seedFromUrl / shareUrl', () => {
  it('reads a valid seed', () => {
    expect(seedFromUrl('?seed=123')).toBe(123);
    expect(seedFromUrl('?a=1&seed=1000000&b=2')).toBe(1000000);
    expect(seedFromUrl('seed=0')).toBe(0);
  });
  it('returns null when missing or invalid', () => {
    for (const s of ['', '?', '?seed=', '?seed=-1', '?seed=1000001', '?seed=abc', '?seed=1.5', '?other=3', '?seed=1e3']) {
      expect(seedFromUrl(s), s).toBeNull();
    }
  });
  it('round-trips through shareUrl', () => {
    for (const seed of [0, 7, 424242, 1000000]) {
      const url = shareUrl('https://example.org/game/index.html?seed=5&x=1#frag', seed);
      expect(url).toBe(`https://example.org/game/index.html?seed=${seed}`);
      expect(seedFromUrl(new URL(url).search)).toBe(seed);
      expect(seedFromUrl(url)).toBe(seed);
    }
    expect(shareUrl('http://127.0.0.1:5173/', 12)).toBe('http://127.0.0.1:5173/?seed=12');
  });
  it('does not contain any auto-start flag', () => {
    expect(shareUrl('https://example.org/', 9)).not.toMatch(/start|play|auto/i);
  });
});

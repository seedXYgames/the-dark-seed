import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/core/contracts';
import { applyQualityPreset, detectLang, loadSettings, sanitizeSettings, saveSettings } from '../src/ui/settingsStore';

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    for (const raw of [null, undefined, 3, 'x', [], [1, 2], {}, { gfx: null }, { gfx: 'no' }, { lang: 'fr', gfx: [] }]) {
      expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });
  it('does not return the shared default object', () => {
    const s = sanitizeSettings(null);
    expect(s).not.toBe(DEFAULT_SETTINGS);
    expect(s.gfx).not.toBe(DEFAULT_SETTINGS.gfx);
  });
  it('clamps brightness and forces the rest of the graphics to the maximum', () => {
    const lo = sanitizeSettings({ lang: 'en', gfx: { brightness: 0.1, renderScale: 0.1, drawDistance: 5, shadows: false } });
    expect(lo.lang).toBe('en');
    expect(lo.gfx.brightness).toBe(0.8);
    expect(lo.gfx).toEqual({ ...DEFAULT_SETTINGS.gfx, brightness: 0.8 });
    expect(DEFAULT_SETTINGS.gfx).toMatchObject({ quality: 'high', renderScale: 1, shadows: true, antialias: true, drawDistance: 700, fogEffects: true });
    expect(sanitizeSettings({ gfx: { brightness: 9 } }).gfx.brightness).toBe(1.25);
  });
  it('rejects wrong types field by field', () => {
    const s = sanitizeSettings({
      lang: 5,
      gfx: { brightness: '1.1', quality: 'ultra', renderScale: NaN, shadows: 'yes', antialias: 0, drawDistance: Infinity, fogEffects: null },
    });
    expect(s).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps language and brightness only', () => {
    const v = { lang: 'en', gfx: { brightness: 1.1, quality: 'low', renderScale: 0.7, shadows: false, antialias: false, drawDistance: 555, fogEffects: false } };
    expect(sanitizeSettings(v)).toEqual({ lang: 'en', gfx: { ...DEFAULT_SETTINGS.gfx, brightness: 1.1 } });
  });
  it('uses the fallback language only when none is stored', () => {
    expect(sanitizeSettings({}, 'en').lang).toBe('en');
    expect(sanitizeSettings({ lang: 'it' }, 'en').lang).toBe('it');
  });
});

describe('detectLang', () => {
  it('maps it* to Italian and the rest to English', () => {
    expect(detectLang('it')).toBe('it');
    expect(detectLang('it-IT')).toBe('it');
    expect(detectLang('IT-ch')).toBe('it');
    expect(detectLang('en-US')).toBe('en');
    expect(detectLang('de')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
    expect(detectLang('')).toBe('en');
  });
});

describe('load/save without usable storage', () => {
  it('never throws and falls back to defaults', () => {
    const g = globalThis as { localStorage?: unknown };
    const saved = Object.getOwnPropertyDescriptor(g, 'localStorage');
    try {
      Object.defineProperty(g, 'localStorage', {
        configurable: true,
        get() { throw new Error('denied'); },
      });
      expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
      expect(loadSettings().gfx).toEqual(DEFAULT_SETTINGS.gfx);

      const mem = new Map<string, string>();
      Object.defineProperty(g, 'localStorage', {
        configurable: true,
        value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
      });
      const custom = sanitizeSettings({ lang: 'en', gfx: { brightness: 1.2, quality: 'low', drawDistance: 300 } });
      saveSettings(custom);
      expect(mem.has('tds.settings.v1')).toBe(true);
      expect(loadSettings()).toEqual(custom);
      mem.set('tds.settings.v1', '{not json');
      expect(loadSettings().gfx).toEqual(DEFAULT_SETTINGS.gfx);
      mem.set('tds.settings.v1', '{"lang":"en","gfx":{"brightness":50}}');
      expect(loadSettings().gfx.brightness).toBe(1.25);
    } finally {
      if (saved) Object.defineProperty(g, 'localStorage', saved);
      else delete g.localStorage;
    }
  });
});

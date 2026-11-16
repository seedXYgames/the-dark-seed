import { describe, expect, it } from 'vitest';
import type { ActionId, ItemKind, ObjectKind, PoiType } from '../src/core/contracts';
import { STRINGS, t } from '../src/i18n/strings';

// Elenchi esaustivi: `satisfies Record<Union, true>` fa fallire tsc se un valore dell'unione manca.
const ACTIONS = Object.keys({
  try_door: true, open: true, close: true, toggle: true, start: true, stop: true, check: true, open_flap: true,
  close_flap: true, reset_breaker: true, inspect_vehicle: true, read: true, douse: true, inspect_item: true,
  take: true, headlights: true, end_shift: true, straighten: true, check_plate: true, sign_log: true, talk: true,
  put_back: true,
} satisfies Record<ActionId, true>);
const OBJECTS = Object.keys({
  door: true, switch: true, lamp: true, generator: true, drawer: true, tent: true, panel: true, vehicle: true,
  sign: true, bin: true, table: true, campfire: true, chair: true, item: true, battery: true, police_car: true,
  car_trunk: true, bridge_plate: true, logbox: true, pump: true, trace: true, cooler: true, woodpile: true,
  bench: true, fence: true, lamp_post: true,
} satisfies Record<ObjectKind, true>);
const ITEMS = Object.keys({
  note: true, photo: true, key: true, radio: true, tool: true, map: true, mug: true, lantern: true, boot: true,
  tag: true, phone: true, bottle: true,
} satisfies Record<ItemKind, true>);
const POIS = Object.keys({
  car_park: true, cabin: true, campsite: true, picnic: true, town: true, gas_station: true, bridge: true,
  lake_dock: true, lookout: true, utility: true, restroom: true, roadside: true, clearing: true,
} satisfies Record<PoiType, true>);
const HINTS = ['move', 'run', 'interact', 'torch', 'phone', 'photo', 'pause', 'inspect', 'clickToResume'];
const NOTICES = ['photoSaved', 'photoFull', 'reportSent', 'batteryTaken', 'torchDead', 'shiftNotDone', 'newMessage', 'noVoice'];
const LANGS = ['it', 'en'] as const;

describe('i18n tables', () => {
  it('have identical key sets', () => {
    expect(Object.keys(STRINGS.it).sort()).toEqual(Object.keys(STRINGS.en).sort());
    expect(Object.keys(STRINGS.it).length).toBeGreaterThan(150);
  });
  it('have no empty or untrimmed strings', () => {
    for (const lang of LANGS) {
      for (const [k, v] of Object.entries(STRINGS[lang])) {
        expect(typeof v, k).toBe('string');
        expect(v.trim().length, `${lang}:${k}`).toBeGreaterThan(0);
        expect(v, `${lang}:${k}`).toBe(v.trim());
      }
    }
  });
  it('use the same placeholders in both languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(STRINGS.it)) expect(ph(STRINGS.it[k]), k).toBe(ph(STRINGS.en[k]));
  });
  it('cover every required key family', () => {
    const required = [
      ...ACTIONS.map((a) => `action.${a}`),
      ...OBJECTS.map((o) => `object.${o}`),
      ...ITEMS.map((i) => `item.${i}`),
      ...POIS.map((p) => `poi.${p}`),
      ...HINTS.map((h) => `hint.${h}`),
      ...NOTICES.map((n) => `notice.${n}`),
      'menu.start', 'menu.settings', 'intro.play', 'pause.resume', 'pause.toMenu', 'summary.title', 'summary.copySeed',
      'phone.writeReport', 'phone.report.submit',
    ];
    expect(ACTIONS.length).toBe(22);
    expect(OBJECTS.length).toBe(26);
    expect(ITEMS.length).toBe(12);
    expect(POIS.length).toBe(13);
    for (const lang of LANGS) {
      for (const k of required) {
        expect(Object.prototype.hasOwnProperty.call(STRINGS[lang], k), `${lang}:${k}`).toBe(true);
        expect(t(lang, k)).not.toBe(k);
      }
    }
  });
  it('carry the mandated wording', () => {
    expect(t('it', 'menu.start')).toBe('Inizia una partita');
    expect(t('en', 'menu.start')).toBe('Start Game');
    expect(t('it', 'menu.settings')).toBe('Impostazioni');
    expect(t('en', 'menu.settings')).toBe('Settings');
    expect(t('it', 'action.try_door')).toBe('Prova la porta');
    expect(t('en', 'action.try_door')).toBe('Try the door');
    expect(t('it', 'action.end_shift')).toBe('Termina il turno');
    expect(t('en', 'action.end_shift')).toBe('End shift');
    expect(t('it', 'summary.title')).toBe('Turno terminato');
    expect(t('en', 'summary.title')).toBe('Shift complete');
    expect(t('it', 'phone.writeReport')).toBe('Scrivi rapporto');
    expect(t('en', 'phone.report.submit')).toBe('Submit');
  });
  it('keep object, item and place nouns lowercase', () => {
    for (const lang of LANGS) {
      for (const [k, v] of Object.entries(STRINGS[lang])) {
        if (/^(object|item|poi)\./.test(k)) expect(v, `${lang}:${k}`).toBe(v.toLowerCase());
      }
    }
  });
});

describe('t()', () => {
  it('interpolates parameters', () => {
    expect(t('it', 'notice.shiftNotDone', { n: 2 })).toBe('Rapporti ancora da inviare: 2');
    expect(t('en', 'notice.shiftNotDone', { n: 2 })).toBe('Reports still to send: 2');
    expect(t('en', 'phone.camera.count', { n: 3, max: 12 })).toBe('3 / 12');
    expect(t('it', 'pause.seed', { seed: 0 })).toBe('Seed 0');
  });
  it('leaves unknown placeholders and returns the key when missing', () => {
    expect(t('en', 'phone.camera.count', { n: 3 })).toBe('3 / {max}');
    expect(t('en', 'does.not.exist')).toBe('does.not.exist');
    expect(t('it', 'toString')).toBe('toString');
    expect(t('it', 'constructor')).toBe('constructor');
  });
});

describe('language purity', () => {
  const pad = (s: string) => ` ${s.toLowerCase().replace(/[.,:;!?·—()'’"]/g, ' ')} `;
  const EN_ONLY = [' the ', ' and ', ' of ', ' with ', ' you ', ' your ', ' to ', ' is ', ' from ', ' back ', ' then '];
  const IT_ONLY = [' il ', ' lo ', ' la ', ' della ', ' del ', ' che ', ' per ', ' non ', ' una ', ' di ', ' ed ', ' poi ', ' con '];
  it('Italian strings contain no English function words', () => {
    for (const [k, v] of Object.entries(STRINGS.it)) for (const w of EN_ONLY) expect(pad(v).includes(w), `${k}: "${v}" has${w}`).toBe(false);
  });
  it('English strings contain no Italian function words', () => {
    for (const [k, v] of Object.entries(STRINGS.en)) for (const w of IT_ONLY) expect(pad(v).includes(w), `${k}: "${v}" has${w}`).toBe(false);
  });
});

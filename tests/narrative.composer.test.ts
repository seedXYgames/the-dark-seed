import { describe, expect, it } from 'vitest';
import type { ActionId, ItemKind, Lang, Mission, MissionType, Observation, ObservationKind, Personality, ReasonId } from '../src/core/contracts';
import type { CommentTrigger, NarrativeContext, SpontaneousKind } from '../src/core/api';
import { Rng } from '../src/core/rng';
import { NarrativeComposer } from '../src/narrative/composer';
import { pickPersonality } from '../src/narrative/personality';
import { DETAILS, DIRS, SOUNDS, STATES, ANIMALS, COLORS, WEATHERS, ITEM_KINDS, PERSONALITIES, hhmm, itDef, itIndef, itPrep, itPartitive, enIndef, enPlural, finish } from '../src/narrative/grammar';
import { itPlace, itState } from '../src/narrative/lexicon.it';

const LANGS: Lang[] = ['it', 'en'];
const TYPES: MissionType[] = ['check_tent', 'check_cabin', 'lights_off', 'generator', 'picnic_check', 'vehicle_check', 'bridge_check', 'panel_check', 'smoke_report', 'surveil'];
const REASONS: ReasonId[] = ['caller_worried', 'routine', 'hiker_report', 'owner_request', 'noise_complaint', 'lights_seen', 'smoke_seen', 'power_fault', 'ranger_request', 'overdue_party', 'storm_damage', 'abandoned'];
const ACTIONS: Record<MissionType, ActionId[]> = {
  check_tent: ['open_flap'], check_cabin: ['try_door'], lights_off: ['toggle'], generator: ['start', 'stop', 'check'], picnic_check: ['check'],
  vehicle_check: ['inspect_vehicle'], bridge_check: ['check_plate'], panel_check: ['reset_breaker', 'check'], smoke_report: ['check', 'douse'], surveil: ['sign_log'],
};
const SUBJECTS = ['door', 'switch', 'lamp', 'generator', 'drawer', 'tent', 'panel', 'vehicle', 'sign', 'bin', 'table', 'campfire', 'chair', 'item', 'battery',
  'bridge_plate', 'logbox', 'pump', 'trace', 'cooler', 'woodpile', 'person', 'animal', 'figure', 'light', 'movement', 'sound', 'silence', 'mystery_blob'];
const POIS: Record<string, Record<Lang, string>> = {
  p1: { it: 'Campeggio Tre Abeti', en: 'Three Firs Camp' }, p2: { it: 'Baita del Lupo', en: 'Wolf Cabin' },
  p3: { it: 'Area Picnic del Lago', en: 'Lake Picnic Area' }, p4: { it: 'Ponte Vecchio', en: 'Old Bridge' },
  p5: { it: 'Stazione di Servizio', en: 'Gas Station' }, p6: { it: 'San Rocco', en: 'Saint Rock' }, p7: { it: 'Spiazzo dello Scoglio', en: 'Crag Clearing' },
};
const POI_IDS = Object.keys(POIS);
const NAMES: Record<Lang, { officer: { first: string; last: string }; colleague: { first: string; last: string } }> = {
  it: { officer: { first: 'Marco', last: 'Rinaldi' }, colleague: { first: 'Luca', last: 'Ferri' } },
  en: { officer: { first: 'Harlan', last: 'Whitlock' }, colleague: { first: 'Dana', last: 'Mercer' } },
};
function ctx(seed: number, lang: Lang, personality: Personality = 'pragmatic'): NarrativeContext {
  return {
    seed, lang, personality, ...NAMES[lang],
    poiName: (id) => POIS[id], poiType: () => 'campsite',
    poiBearing: (id) => ({ dir: DIRS[(id.charCodeAt(1) + seed) % 8], dist: 60 + ((id.charCodeAt(1) * 97 + seed * 13) % 600) }),
  };
}
function mission(i: number, r: Rng, withOutcome = true): Mission {
  const type = TYPES[i % TYPES.length];
  const m: Mission = {
    id: `m${i}`, type, poiId: POI_IDS[i % POI_IDS.length], targetObjectId: `o${i}`, requiredAction: r.pick(ACTIONS[type]),
    reason: REASONS[i % REASONS.length], prerequisites: [], state: 'inspected', supportedObservations: ['interaction'], text: { it: '', en: '' },
  };
  if (withOutcome && r.chance(0.8)) m.outcome = facts(r, true);
  return m;
}
function facts(r: Rng, outcome = false): Record<string, string | number | boolean> {
  const f: Record<string, string | number | boolean> = {};
  if (r.chance(0.5)) f.state = r.pick(STATES);
  if (r.chance(0.35)) f.detail = r.pick(DETAILS);
  if (r.chance(0.3)) f.direction = r.pick(DIRS);
  if (r.chance(0.25)) f.color = r.pick(COLORS);
  if (r.chance(0.15)) f.moved = true;
  if (r.chance(0.2)) { f.before = r.pick(STATES); f.after = r.pick(STATES); }
  if (r.chance(0.2)) f.count = r.int(1, 12);
  if (r.chance(0.15)) f.item = r.pick(ITEM_KINDS);
  if (r.chance(0.15)) f.plate = 'AB 123 CD';
  if (r.chance(0.15)) f.weather = r.pick(WEATHERS);
  if (r.chance(0.15)) { f.junk = '{raw}'; f.state2 = 'undefined'; }
  if (r.chance(0.08)) f.state = 'zzz_unknown';
  if (!outcome && r.chance(0.2)) f.animal = r.pick(ANIMALS);
  return f;
}
function observations(m: Mission, r: Rng): Observation[] {
  const out: Observation[] = [];
  const k = r.int(0, 6);
  for (let j = 0; j < k; j++) {
    const kind = r.pick<ObservationKind>(['interaction', 'saw', 'saw', 'heard', 'heard', 'changed', 'read', 'felt']);
    const f = facts(r);
    if (kind === 'heard' && r.chance(0.85)) f.sound = r.pick(SOUNDS);
    out.push({
      id: j, t: j * 10, kind, source: 'agent', subject: kind === 'heard' ? r.pick(['sound', 'silence', 'generator']) : r.pick(SUBJECTS),
      pos: { x: 0, z: 0 }, confidence: r.next(), facts: f, missionId: kind === 'interaction' ? m.id : undefined,
    });
  }
  return out;
}

const BAD = ['{', '}', 'undefined', 'null', 'NaN', '[object', 'zzz', 'junk', 'blob', '_'];
const IT_WORDS = ['il', 'lo', 'la', 'gli', 'le', 'un', 'una', 'uno', 'di', 'del', 'della', 'dei', 'che', 'non', 'per', 'con', 'sono', 'è', 'nel', 'nella', 'alla', 'al', 'sul', 'dalla', 'più', 'anche', 'questo', 'ho', 'ma', 'ed', 'presso', 'circa', 'e', 'da', 'su', 'se', 'ne', 'mi', 'ci', 'si', 'ha'];
const EN_WORDS = ['the', 'of', 'and', 'is', 'was', 'were', 'at', 'with', 'for', 'not', 'this', 'that', 'it', 'on', 'from', 'been', 'have', 'has', 'an', 'by', 'to', 'there', 'about', 'near', 'are', 'be', 'you', 'your', 'my', 'he', 'they', 'but', 'or', 'if', 'when', 'what', 'which', 'will'];
const FOREIGN: Record<Lang, Set<string>> = { it: new Set(EN_WORDS), en: new Set(IT_WORDS) };

function checkText(t: string, lang: Lang, opts: { purity?: boolean; quoted?: boolean } = {}): void {
  expect(t.length).toBeGreaterThan(0);
  for (const b of BAD) expect(t, `"${b}" in: ${t}`).not.toMatch(new RegExp(/^\w+$/.test(b) ? `\\b${b}\\b` : b.replace(/[{}\[]/g, '\\$&')));
  expect(t, t).not.toMatch(/ {2}/);
  expect(t, t).not.toMatch(/\s[,.;:!?…)]/);
  expect(t, t).toMatch(/[.!?…»”]$/);
  const body = opts.quoted ? t.replace(/[«“].*[»”]/, 'Q') : t;
  for (const s of body.split(/(?<=[.!?])\s+/)) expect(s, `sentence start: "${s}" in: ${t}`).toMatch(/^[\p{Lu}\d«“(]/u);
  if (opts.purity !== false) {
    for (const w of body.toLowerCase().split(/[^\p{L}]+/u)) expect(FOREIGN[lang].has(w), `foreign word "${w}" in: ${t}`).toBe(false);
  }
}
const sentences = (t: string): number => t.split(/(?<=[.!?])\s+/).length;

const SPECIES: Record<string, RegExp> = {
  deer: /\b(cerv[oi]|deer)\b/i, fox: /\b(volp[ei]|fox(es)?)\b/i, raccoon: /\b(procion[ei]|raccoons?)\b/i, owl: /\b(guf[oi]|owls?)\b/i, crows: /\b(corv[oi]|crows?)\b/i,
  rabbit: /\b(conigli[oi]?|rabbits?)\b/i, nightbird: /\b(uccell[oi] notturn[oi]|night birds?)\b/i,
};
const NEVER = /\b(ghosts?|fantasm[ai]|anomal\w*|aliens?|alien[oi]|supernatural|soprannaturale|paranormal\w*|illusion\w*|because|perché|caused|causat\w*|a causa|due to|spirit\w*)\b/i;

describe.each(LANGS)('composer [%s]', (lang) => {
  it('reports: 240 combinations are well formed, factual and cause-free', () => {
    const r = new Rng('test-reports-' + lang);
    for (let i = 0; i < 240; i++) {
      const seed = r.int(0, 1_000_000);
      const comp = new NarrativeComposer(ctx(seed, lang, PERSONALITIES[i % 5]));
      const m = mission(i, r);
      if (i % 17 === 0) { m.state = 'pending'; delete m.outcome; }
      const obs = observations(m, r);
      const hour = 19.5 + r.next() * 9.5;
      const text = comp.report(m, obs, { hour, photoCount: i % 4 });
      checkText(text, lang);
      expect(text).toContain(POIS[m.poiId][lang]);
      expect(text).toContain(NAMES[lang].officer.last);
      expect(text).toContain(hhmm(hour));
      const ns = sentences(text);
      expect(ns, text).toBeGreaterThanOrEqual(4);
      expect(ns, text).toBeLessThanOrEqual(8);
      expect(text, text).not.toMatch(NEVER);
      const relevant = obs.filter((o) => ['saw', 'heard', 'changed', 'felt'].includes(o.kind));
      for (const [a, re] of Object.entries(SPECIES)) {
        if (!relevant.some((o) => o.facts.animal === a || o.facts.sound === a)) expect(text, `${a} leaked: ${text}`).not.toMatch(re);
      }
      if (!relevant.some((o) => o.subject === 'animal' || o.facts.animal !== undefined)) expect(text, text).not.toMatch(/\banimal[ei]?s?\b/i);
      const windy = obs.some((o) => o.facts.weather === 'wind') || m.outcome?.weather === 'wind';
      if (!windy) expect(text, text).not.toMatch(/\b(vento|wind)\b/i);
      // anteprima e invio coincidono; nessuna dipendenza dalla personalità
      expect(comp.report(m, obs, { hour, photoCount: i % 4 })).toBe(text);
      expect(new NarrativeComposer(ctx(seed, lang, PERSONALITIES[(i + 2) % 5])).report(m, obs, { hour, photoCount: i % 4 })).toBe(text);
    }
  });

  it('report with nothing else observed ends with a plain conclusion and mentions observed facts', () => {
    const comp = new NarrativeComposer(ctx(7, lang));
    const m = mission(1, new Rng('x'), false);
    m.outcome = { state: 'locked' };
    const clean = comp.report(m, [], { hour: 22.683, photoCount: 2 });
    expect(clean).toContain('22:41');
    expect(clean).toMatch(lang === 'it' ? /chius[ao] a chiave/ : /locked/);
    expect(clean).toMatch(lang === 'it' ? /due fotografie/ : /two photographs/i);
    const obs: Observation[] = [
      { id: 1, t: 1, kind: 'saw', source: 'agent', subject: 'figure', pos: { x: 0, z: 0 }, confidence: 0.2, facts: { direction: 'ne' } },
      { id: 2, t: 2, kind: 'heard', source: 'agent', subject: 'sound', pos: { x: 0, z: 0 }, confidence: 0.9, facts: { sound: 'metal_clank' } },
      { id: 3, t: 3, kind: 'changed', source: 'agent', subject: 'chair', pos: { x: 0, z: 0 }, confidence: 0.9, facts: { moved: true } },
    ];
    const noted = comp.report(m, obs, { hour: 22.683, photoCount: 0 });
    expect(noted).toMatch(lang === 'it' ? /sagoma non identificata verso nord-est/ : /unidentified shape to the north-east/);
    expect(noted).toMatch(lang === 'it' ? /colpo metallico/ : /metallic clank/);
    expect(noted).toMatch(lang === 'it' ? /la sedia non era più/ : /the chair was no longer/);
  });

  it('briefing: 2-4 messages, every place mentioned, well formed', () => {
    const r = new Rng('test-brief-' + lang);
    for (let i = 0; i < 160; i++) {
      const count = 1 + (i % 7);
      const ms = Array.from({ length: count }, (_, k) => mission(i + k, r, false));
      const comp = new NarrativeComposer(ctx(r.int(0, 1_000_000), lang));
      const msgs = comp.briefing(ms);
      expect(msgs.length).toBeGreaterThanOrEqual(2);
      expect(msgs.length).toBeLessThanOrEqual(4);
      for (const t of msgs) checkText(t, lang);
      for (const m of ms) expect(msgs.filter((t) => t.includes(POIS[m.poiId][lang])).length).toBeGreaterThanOrEqual(1);
      expect(msgs[0]).toContain(NAMES[lang].colleague.first);
      expect(msgs[msgs.length - 1]).toMatch(lang === 'it' ? /rapporto/ : /report/);
      expect(msgs[msgs.length - 1]).toMatch(lang === 'it' ? /auto|macchina/ : /car/);
      expect(comp.briefing(ms)).toEqual(msgs);
      for (const m of ms) {
        const title = comp.missionTitle(m);
        expect(title).toContain(' — ' + POIS[m.poiId][lang]);
      }
    }
    expect(new NarrativeComposer(ctx(1, lang)).briefing([]).length).toBe(2);
  });

  it('comments, spontaneous SMS, NPC lines and item notes are well formed', () => {
    const r = new Rng('test-misc-' + lang);
    const triggers: CommentTrigger[] = ['shift_start', 'arrive_poi', 'interaction', 'report_done', 'all_done', 'saw_figure', 'saw_light', 'saw_person', 'saw_animal', 'heard', 'changed', 'torch_low', 'torch_dead', 'battery_found', 'silence', 'weather', 'back_at_car', 'not_done_at_car', 'item_inspected', 'locked', 'photo'];
    const kinds: SpontaneousKind[] = ['weather_notice', 'banter', 'ack_report', 'contradiction', 'citizen_call', 'false_report', 'wrong_number', 'garbled', 'carrier', 'future_self', 'checkin', 'all_reports_ack'];
    for (const p of PERSONALITIES) {
      const comp = new NarrativeComposer(ctx(r.int(0, 999999), lang, p));
      let spoken = 0; let heardSpoken = 0;
      for (let i = 0; i < 420; i++) {
        const trg = triggers[i % triggers.length];
        const f = { poi: r.pick(POI_IDS), object: r.pick(SUBJECTS), state: r.pick(STATES), sound: r.pick(SOUNDS), animal: r.pick(ANIMALS), item: r.pick(ITEM_KINDS), weather: r.pick(WEATHERS), remaining: r.int(0, 5), confidence: r.next(), junk: '{x}' };
        const line = comp.comment(trg, r.chance(0.3) ? {} : f);
        if (['shift_start', 'not_done_at_car', 'all_done', 'torch_dead'].includes(trg)) expect(line).not.toBeNull();
        if (line !== null) {
          spoken++;
          checkText(line, lang);
          expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(16);
          if (trg === 'heard') heardSpoken++;
        }
      }
      expect(spoken).toBeLessThan(420);
      expect(heardSpoken).toBeLessThan(20);
      for (let i = 0; i < 20; i++) expect(comp.comment('heard', { sound: 'twig' }) !== null && comp.comment('heard', { sound: 'twig' }) !== null).toBe(false);
      for (let i = 0; i < 180; i++) {
        const kind = kinds[i % kinds.length];
        const f = r.chance(0.25) ? {} : { poi: r.pick(POI_IDS), weather: r.pick(WEATHERS), sound: r.chance(0.5) ? r.pick(SOUNDS) : undefined, subject: r.pick(SUBJECTS) };
        const t = comp.spontaneous(kind, f);
        if (kind === 'garbled') {
          expect(t).toMatch(/[#_*]/);
          expect(t).toMatch(/^\p{Lu}/u);
          expect(t).toMatch(/[.?]$/);
        } else checkText(t, lang);
        if (kind === 'contradiction') expect(t).toMatch(lang === 'it' ? /controlla|comunque/i : /check|all the same/i);
        if (kind === 'all_reports_ack') expect(t).toMatch(lang === 'it' ? /auto|macchina/ : /car/);
        expect(t).not.toMatch(NEVER);
      }
      for (let i = 0; i < 80; i++) {
        const t = comp.npcLine({ archetype: r.pick(['hiker', 'camper', 'motorist', 'resident', 'wizard']), goal: r.pick(['camping', 'crossing', 'watching_lake', 'to_gas', 'going_home', 'walking', 'zzz']), saw: r.pick(['lights', 'animal', 'person', 'nothing', undefined]), direction: r.pick([...DIRS, undefined]) });
        checkText(t, lang);
      }
      const written = lang === 'it' ? 'Torno alle sei. Non aspettarmi' : 'Back at six. Do not wait';
      for (const k of ITEM_KINDS) {
        const t = comp.itemNote(k as ItemKind, { text: written, worn: r.chance(0.5), wet: r.chance(0.5), poi: r.chance(0.5) ? 'p3' : undefined });
        checkText(t, lang, { quoted: true });
        expect(t).toContain(written);
        expect(sentences(t.replace(written, 'Q'))).toBeLessThanOrEqual(2);
        expect(comp.itemNote(k as ItemKind, {})).not.toMatch(/[«“]/);
      }
      const v = comp.voiceStyle();
      expect(v.rate).toBeGreaterThanOrEqual(0.85); expect(v.rate).toBeLessThanOrEqual(1.05);
      expect(v.pitch).toBeGreaterThanOrEqual(0.8); expect(v.pitch).toBeLessThanOrEqual(1.1);
    }
  });

  it('determinism and variety', () => {
    const r = new Rng('test-det');
    const m = mission(0, r, false);
    m.outcome = { state: 'open', detail: 'sleeping_bag' };
    const obs = observations(m, new Rng('obs'));
    const run = (seed: number): string[] => {
      const c = new NarrativeComposer(ctx(seed, lang, 'ironic'));
      return [...c.briefing([m, mission(3, new Rng('b'), false)]), c.report(m, obs, { hour: 23.5, photoCount: 1 }), String(c.comment('shift_start', {})),
        String(c.comment('arrive_poi', { poi: 'p1' })), c.spontaneous('garbled', {}), c.spontaneous('banter', {}), c.npcLine({ archetype: 'hiker', goal: 'walking' })];
    };
    expect(run(4242)).toEqual(run(4242));
    const reports = new Set<string>(); const briefs = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const c = new NarrativeComposer(ctx(s * 7919 + 3, lang));
      reports.add(c.report(m, obs, { hour: 23.5, photoCount: 1 }).replace(/\d\d:\d\d/, ''));
      briefs.add(c.briefing([m]).join(' ').replace(/\([^)]*\)|\d+/g, ''));
    }
    expect(reports.size).toBeGreaterThanOrEqual(60);
    expect(briefs.size).toBeGreaterThanOrEqual(60);
  });

  it('two personalities: different style, same facts', () => {
    const m = mission(1, new Rng('p'), false);
    m.outcome = { state: 'locked' };
    const obs = observations(m, new Rng('po'));
    const a = new NarrativeComposer(ctx(99, lang, 'reserved'));
    const b = new NarrativeComposer(ctx(99, lang, 'nervous'));
    expect(a.report(m, obs, { hour: 1.25, photoCount: 1 })).toBe(b.report(m, obs, { hour: 1.25, photoCount: 1 }));
    expect(a.briefing([m])).toEqual(b.briefing([m]));
    const lines = (c: NarrativeComposer): string[] => (['shift_start', 'all_done', 'torch_dead', 'not_done_at_car'] as CommentTrigger[]).map((t) => String(c.comment(t, { remaining: 2 })));
    const la = lines(a); const lb = lines(b);
    for (let i = 0; i < la.length; i++) expect(la[i]).not.toBe(lb[i]);
    expect(lb.join(' ')).toContain('…');
    expect(la.join(' ').length).toBeLessThan(lb.join(' ').length);
    expect(a.voiceStyle()).not.toEqual(b.voiceStyle());
    // il silenzio dipende dal profilo
    const talk = (p: Personality): number => { const c = new NarrativeComposer(ctx(5, lang, p)); let k = 0; for (let i = 0; i < 300; i++) if (c.comment('arrive_poi', { poi: 'p2' })) k++; return k; };
    expect(talk('reserved')).toBeLessThan(talk('nervous'));
  });

  it('setLang switches language', () => {
    const other: Lang = lang === 'it' ? 'en' : 'it';
    const c = new NarrativeComposer(ctx(11, lang));
    c.setLang(other);
    const m = mission(2, new Rng('s'), false);
    const t = c.report(m, [], { hour: 2, photoCount: 0 });
    expect(t).toContain(POIS[m.poiId][other]);
    for (const w of t.toLowerCase().replace(NAMES[lang].officer.last.toLowerCase(), '').split(/[^\p{L}]+/u)) expect(FOREIGN[other].has(w), w + ' in ' + t).toBe(false);
  });

  it('never throws on hostile input', () => {
    const c = new NarrativeComposer({ ...ctx(3, lang), poiName: () => { throw new Error('x'); }, poiBearing: () => { throw new Error('y'); } });
    const m = { ...mission(0, new Rng('h'), false), type: 'weird' as MissionType, reason: 'odd' as ReasonId, outcome: { state: 5, plate: '{x}', count: NaN } as unknown as Mission['outcome'] };
    const obs = [{ id: 1, t: 0, kind: 'saw', source: 'agent', subject: 42, pos: { x: 0, z: 0 }, confidence: NaN, facts: null }] as unknown as Observation[];
    checkText(c.report(m, obs, { hour: NaN, photoCount: -3 }), lang);
    for (const t of c.briefing([m])) checkText(t, lang);
    expect(c.comment('bogus' as CommentTrigger, {})).toBeNull();
    checkText(c.spontaneous('bogus' as SpontaneousKind, {}), lang);
    checkText(c.itemNote('bogus' as ItemKind, { text: 5 }), lang);
  });
});

describe('personality', () => {
  it('is deterministic and reaches all five', () => {
    const seen = new Set<Personality>();
    for (let s = 0; s < 300; s++) { seen.add(pickPersonality(s)); expect(pickPersonality(s)).toBe(pickPersonality(s)); }
    expect(seen.size).toBe(5);
  });
  it('comment pools do not overlap between personalities', () => {
    for (const lang of LANGS) {
      const sets = PERSONALITIES.map((p) => { const c = new NarrativeComposer(ctx(1, lang, p)); const s = new Set<string>(); for (let i = 0; i < 12; i++) s.add(String(c.comment('all_done', {}))); return s; });
      for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) for (const x of sets[i]) expect(sets[j].has(x)).toBe(false);
    }
  });
});

describe('grammar', () => {
  it('Italian articles and articulated prepositions (38 nouns)', () => {
    const cases: [string, 'm' | 'f', string, string, string, string][] = [
      ['cane', 'm', 'il cane', 'un cane', 'al cane', 'del cane'], ['zaino', 'm', 'lo zaino', 'uno zaino', 'allo zaino', 'dello zaino'],
      ['albero', 'm', "l'albero", 'un albero', "all'albero", "dell'albero"], ['studente', 'm', 'lo studente', 'uno studente', 'allo studente', 'dello studente'],
      ['gnomo', 'm', 'lo gnomo', 'uno gnomo', 'allo gnomo', 'dello gnomo'], ['psicologo', 'm', 'lo psicologo', 'uno psicologo', 'allo psicologo', 'dello psicologo'],
      ['xilofono', 'm', 'lo xilofono', 'uno xilofono', 'allo xilofono', 'dello xilofono'], ['yogurt', 'm', 'lo yogurt', 'uno yogurt', 'allo yogurt', 'dello yogurt'],
      ['iodio', 'm', 'lo iodio', 'uno iodio', 'allo iodio', 'dello iodio'], ['pneumatico', 'm', 'lo pneumatico', 'uno pneumatico', 'allo pneumatico', 'dello pneumatico'],
      ['scarpone', 'm', 'lo scarpone', 'uno scarpone', 'allo scarpone', 'dello scarpone'], ['specchio', 'm', 'lo specchio', 'uno specchio', 'allo specchio', 'dello specchio'],
      ['interruttore', 'm', "l'interruttore", 'un interruttore', "all'interruttore", "dell'interruttore"], ['oggetto', 'm', "l'oggetto", 'un oggetto', "all'oggetto", "dell'oggetto"],
      ['animale', 'm', "l'animale", 'un animale', "all'animale", "dell'animale"], ['attrezzo', 'm', "l'attrezzo", 'un attrezzo', "all'attrezzo", "dell'attrezzo"],
      ['hotel', 'm', "l'hotel", 'un hotel', "all'hotel", "dell'hotel"], ['uomo', 'm', "l'uomo", 'un uomo', "all'uomo", "dell'uomo"],
      ['generatore', 'm', 'il generatore', 'un generatore', 'al generatore', 'del generatore'], ['sentiero', 'm', 'il sentiero', 'un sentiero', 'al sentiero', 'del sentiero'],
      ['quadro elettrico', 'm', 'il quadro elettrico', 'un quadro elettrico', 'al quadro elettrico', 'del quadro elettrico'], ['bidone', 'm', 'il bidone', 'un bidone', 'al bidone', 'del bidone'],
      ['porta', 'f', 'la porta', 'una porta', 'alla porta', 'della porta'], ['auto', 'f', "l'auto", "un'auto", "all'auto", "dell'auto"],
      ['ombra', 'f', "l'ombra", "un'ombra", "all'ombra", "dell'ombra"], ['etichetta', 'f', "l'etichetta", "un'etichetta", "all'etichetta", "dell'etichetta"],
      ['sedia', 'f', 'la sedia', 'una sedia', 'alla sedia', 'della sedia'], ['staccionata', 'f', 'la staccionata', 'una staccionata', 'alla staccionata', 'della staccionata'],
      ['zona', 'f', 'la zona', 'una zona', 'alla zona', 'della zona'], ['tenda', 'f', 'la tenda', 'una tenda', 'alla tenda', 'della tenda'],
      ['isola', 'f', "l'isola", "un'isola", "all'isola", "dell'isola"], ['scatola', 'f', 'la scatola', 'una scatola', 'alla scatola', 'della scatola'],
      ['luce', 'f', 'la luce', 'una luce', 'alla luce', 'della luce'], ['chiave', 'f', 'la chiave', 'una chiave', 'alla chiave', 'della chiave'],
      ['lampione', 'm', 'il lampione', 'un lampione', 'al lampione', 'del lampione'], ['zoccolo', 'm', 'lo zoccolo', 'uno zoccolo', 'allo zoccolo', 'dello zoccolo'],
      ['sbarra', 'f', 'la sbarra', 'una sbarra', 'alla sbarra', 'della sbarra'], ['orma', 'f', "l'orma", "un'orma", "all'orma", "dell'orma"],
    ];
    for (const [w, g, def, ind, a, di] of cases) {
      expect(itDef(w, g)).toBe(def); expect(itIndef(w, g)).toBe(ind); expect(itPrep('a', w, g)).toBe(a); expect(itPrep('di', w, g)).toBe(di);
    }
    expect(itDef('zaini', 'm', true)).toBe('gli zaini'); expect(itDef('alberi', 'm', true)).toBe('gli alberi'); expect(itDef('cani', 'm', true)).toBe('i cani');
    expect(itDef('gnomi', 'm', true)).toBe('gli gnomi'); expect(itDef('auto', 'f', true)).toBe('le auto');
    expect(itPrep('in', 'auto', 'f')).toBe("nell'auto"); expect(itPrep('su', 'alberi', 'm', true)).toBe('sugli alberi'); expect(itPrep('da', 'sedie', 'f', true)).toBe('dalle sedie');
    expect(itPrep('in', 'zaino', 'm')).toBe('nello zaino'); expect(itPrep('su', 'tavolo', 'm')).toBe('sul tavolo'); expect(itPrep('da', 'cani', 'm', true)).toBe('dai cani');
    expect(itPartitive('scarponi', 'm')).toBe('degli scarponi'); expect(itPartitive('luci', 'f')).toBe('delle luci'); expect(itPartitive('passi', 'm')).toBe('dei passi');
    expect(itState('locked', 'f')).toBe('chiusa a chiave'); expect(itState('on', 'f', true)).toBe('accese'); expect(itState('tipped', 'm', true)).toBe('rovesciati'); expect(itState('running', 'f')).toBe('in funzione');
  });
  it('Italian place names', () => {
    expect(itPlace('Campeggio Tre Abeti', 'a')).toBe('al Campeggio Tre Abeti'); expect(itPlace('Area Picnic del Lago', 'il')).toBe("l'Area Picnic del Lago");
    expect(itPlace('Area Picnic del Lago', 'di')).toBe("dell'Area Picnic del Lago"); expect(itPlace('Baita del Lupo', 'su')).toBe('sulla Baita del Lupo');
    expect(itPlace('Spiazzo dello Scoglio', 'a')).toBe('allo Spiazzo dello Scoglio'); expect(itPlace('San Rocco', 'a')).toBe('a San Rocco');
    expect(itPlace('San Rocco', 'il')).toBe('San Rocco'); expect(itPlace('Stazione di Servizio', 'presso')).toBe('presso la Stazione di Servizio');
    expect(itPlace('Bagni Pubblici', 'a')).toBe('ai Bagni Pubblici');
  });
  it('English a/an, plurals, typography, time', () => {
    expect(enIndef('owl')).toBe('an owl'); expect(enIndef('door')).toBe('a door'); expect(enIndef('unidentified shape')).toBe('an unidentified shape');
    expect(enIndef('unit')).toBe('a unit'); expect(enIndef('hour')).toBe('an hour'); expect(enIndef('amber light')).toBe('an amber light');
    expect(enPlural('box')).toBe('boxes'); expect(enPlural('battery')).toBe('batteries'); expect(enPlural('person')).toBe('people'); expect(enPlural('tent')).toBe('tents'); expect(enPlural('bench')).toBe('benches');
    expect(finish('  ciao ,  mondo . va   bene ')).toBe('Ciao, mondo. Va bene');
    expect(hhmm(22.683)).toBe('22:41'); expect(hhmm(29)).toBe('05:00'); expect(hhmm(0.5)).toBe('00:30');
  });
});

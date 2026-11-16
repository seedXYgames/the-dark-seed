// Strumenti condivisi del NarrativeComposer: vocabolari tipizzati dei fatti, scelta con memoria
// anti-ripetizione, riempimento degli slot, rifinitura tipografica, regole di concordanza
// italiane (articoli, preposizioni articolate, aggettivi) e inglesi (a/an, plurali).
// Nessuna dipendenza da DOM, rete o Math.random().
import type { ItemKind, MissionType, Personality, ReasonId } from '../core/contracts';
import type { CommentTrigger, SpontaneousKind } from '../core/api';
import type { Rng } from '../core/rng';

// ---------------------------------------------------------------- vocabolari dei fatti

export const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Dir = (typeof DIRS)[number];

export const STATES = [
  'locked', 'unlocked', 'ajar', 'open', 'closed', 'on', 'off', 'running', 'stopped', 'empty', 'occupied',
  'tipped', 'upright', 'warm', 'cold', 'burning', 'out', 'tripped', 'ok', 'damaged', 'intact', 'signed',
] as const;
export type StateKey = (typeof STATES)[number];

export const DETAILS = [
  'sleeping_bag', 'food', 'boots', 'nothing', 'keys_inside', 'flat_tire', 'hood_warm', 'fogged_windows',
  'scratches', 'wet', 'ash', 'litter', 'note',
] as const;
export type DetailKey = (typeof DETAILS)[number];

export const SOUNDS = [
  'steps_far', 'voice_far', 'metal_clank', 'owl', 'fox', 'deer', 'crows', 'knock', 'twig', 'vehicle_pass',
  'hum_anom', 'whisper_anom', 'tone_anom', 'door_bang', 'branch_fall', 'rustle', 'splash', 'thunder',
  'chair_scrape', 'car_door', 'vehicle_start', 'frog',
] as const;
export type SoundKey = (typeof SOUNDS)[number];

export const ANIMALS = ['deer', 'fox', 'raccoon', 'owl', 'crows'] as const;
export type AnimalKey = (typeof ANIMALS)[number];

export const COLORS = ['red', 'white', 'blue', 'green', 'yellow', 'orange', 'dark', 'grey', 'black', 'pale', 'amber'] as const;
export type ColorKey = (typeof COLORS)[number];

export const WEATHERS = ['rain', 'snow', 'fog', 'wind', 'clear'] as const;
export type WeatherKey = (typeof WEATHERS)[number];

export const ITEM_KINDS = ['note', 'photo', 'key', 'radio', 'tool', 'map', 'mug', 'lantern', 'boot', 'tag', 'phone', 'bottle'] as const;

/** Soggetti nominabili: ObjectKind, categorie percepite e lo pseudo-soggetto 'lights' (incarico luci). */
export const SUBJECTS = [
  'door', 'switch', 'lamp', 'generator', 'drawer', 'tent', 'panel', 'vehicle', 'sign', 'bin', 'table', 'campfire',
  'chair', 'item', 'battery', 'police_car', 'car_trunk', 'bridge_plate', 'logbox', 'pump', 'trace', 'cooler',
  'woodpile', 'bench', 'fence', 'lamp_post', 'lights', 'person', 'animal', 'figure', 'light', 'movement',
  'sound', 'silence',
] as const;
export type SubjectKey = (typeof SUBJECTS)[number];

export const PERSONALITIES: readonly Personality[] = ['reserved', 'pragmatic', 'ironic', 'skeptical', 'nervous'];

function setOf<T extends string>(arr: readonly T[]): ReadonlySet<string> {
  return new Set<string>(arr);
}
const DIR_SET = setOf(DIRS);
const STATE_SET = setOf(STATES);
const DETAIL_SET = setOf(DETAILS);
const SOUND_SET = setOf(SOUNDS);
const ANIMAL_SET = setOf(ANIMALS);
const COLOR_SET = setOf(COLORS);
const WEATHER_SET = setOf(WEATHERS);
const ITEM_SET = setOf(ITEM_KINDS);
const SUBJECT_SET = setOf(SUBJECTS);

export interface CleanFacts {
  state?: StateKey;
  detail?: DetailKey;
  sound?: SoundKey;
  direction?: Dir;
  animal?: AnimalKey;
  color?: ColorKey;
  moved?: boolean;
  before?: StateKey;
  after?: StateKey;
  count?: number;
  item?: ItemKind;
  plate?: string;
  weather?: WeatherKey;
}

type RawFacts = Record<string, string | number | boolean | undefined> | undefined | null;

function word(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim().toLowerCase() : undefined;
}

export function asDir(v: unknown): Dir | undefined {
  const w = word(v);
  return w !== undefined && DIR_SET.has(w) ? (w as Dir) : undefined;
}
export function asState(v: unknown): StateKey | undefined {
  const w = word(v);
  return w !== undefined && STATE_SET.has(w) ? (w as StateKey) : undefined;
}
export function asSound(v: unknown): SoundKey | undefined {
  const w = word(v);
  return w !== undefined && SOUND_SET.has(w) ? (w as SoundKey) : undefined;
}
export function asAnimal(v: unknown): AnimalKey | undefined {
  const w = word(v);
  return w !== undefined && ANIMAL_SET.has(w) ? (w as AnimalKey) : undefined;
}
export function asWeather(v: unknown): WeatherKey | undefined {
  const w = word(v);
  return w !== undefined && WEATHER_SET.has(w) ? (w as WeatherKey) : undefined;
}
export function asItem(v: unknown): ItemKind | undefined {
  const w = word(v);
  return w !== undefined && ITEM_SET.has(w) ? (w as ItemKind) : undefined;
}
export function asSubject(v: unknown): SubjectKey | undefined {
  const w = word(v);
  return w !== undefined && SUBJECT_SET.has(w) ? (w as SubjectKey) : undefined;
}
export function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Tiene solo chiavi e valori noti: tutto il resto viene ignorato e non arriva mai nel testo. */
export function cleanFacts(raw: RawFacts): CleanFacts {
  const out: CleanFacts = {};
  if (!raw || typeof raw !== 'object') return out;
  out.state = asState(raw.state);
  const d = word(raw.detail);
  if (d !== undefined && DETAIL_SET.has(d)) out.detail = d as DetailKey;
  out.sound = asSound(raw.sound);
  out.direction = asDir(raw.direction);
  out.animal = asAnimal(raw.animal);
  let col = word(raw.color);
  if (col === 'gray') col = 'grey';
  if (col !== undefined && COLOR_SET.has(col)) out.color = col as ColorKey;
  if (raw.moved === true) out.moved = true;
  out.before = asState(raw.before);
  out.after = asState(raw.after);
  const n = asNumber(raw.count);
  if (n !== undefined && n >= 1 && n <= 99) out.count = Math.round(n);
  out.item = asItem(raw.item);
  if (typeof raw.plate === 'string') {
    const p = raw.plate.trim().toUpperCase();
    if (/^[A-Z0-9][A-Z0-9 \-]{1,10}[A-Z0-9]$/.test(p) && !/ {2}/.test(p)) out.plate = p;
  }
  out.weather = asWeather(raw.weather);
  return out;
}

// ---------------------------------------------------------------- scelta con memoria

/** Sceglie tra varianti evitando quelle usate di recente (filtro di ripetizione). */
export class Chooser {
  private recent: string[] = [];
  constructor(private readonly rng: Rng, private readonly size = 40) {}
  pick(options: readonly string[]): string {
    if (options.length === 0) return '';
    const fresh = options.filter((o) => !this.recent.includes(o));
    const v = this.rng.pick(fresh.length > 0 ? fresh : options);
    this.remember(v);
    return v;
  }
  remember(v: string): void {
    this.recent.push(v);
    if (this.recent.length > this.size) this.recent.shift();
  }
  chance(p: number): boolean {
    return this.rng.chance(p);
  }
  next(): number {
    return this.rng.next();
  }
}

// ---------------------------------------------------------------- slot e tipografia

export type SlotResolver = (name: string, form: string) => string | null;

/** Riempie gli slot `{nome}` / `{nome:forma}`; null se uno slot non è risolvibile con i fatti dati. */
export function fill(tpl: string, resolve: SlotResolver): string | null {
  let ok = true;
  const out = tpl.replace(/\{([a-z]+)(?::([a-z]+))?\}/g, (_m, name: string, form: string | undefined) => {
    const v = resolve(name, form ?? '');
    if (v === null || v === '') {
      ok = false;
      return '';
    }
    return v;
  });
  return ok ? out : null;
}

/** Sceglie un modello tra quelli risolvibili (stringa con varianti separate da `|`) e lo riempie. */
export function pickFill(c: Chooser, variants: string, resolve: SlotResolver, preferPlain = false): string {
  const all = variants.split('|');
  let usable = all.filter((t) => fill(t, resolve) !== null);
  if (preferPlain) {
    const plain = usable.filter((t) => !t.includes('{'));
    if (plain.length > 0) usable = plain;
  }
  if (usable.length === 0) usable = all.filter((t) => !t.includes('{'));
  const tpl = c.pick(usable);
  return fill(tpl, resolve) ?? '';
}

export function cap(s: string): string {
  const m = /\p{L}/u.exec(s);
  if (!m) return s;
  const i = m.index;
  // non toccare ciò che precede la prima lettera se è una cifra (es. "3 fotografie")
  if (/\d/.test(s.slice(0, i))) return s;
  return s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
}

export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Rifinitura: spazi, punteggiatura, maiuscola a inizio testo e dopo fine frase. */
export function finish(text: string): string {
  let s = text.replace(/\s+/g, ' ').trim();
  s = s.replace(/ +([,.;:!?…)])/g, '$1');
  s = s.replace(/\( +/g, '(');
  s = s.replace(/([,;:])\1+/g, '$1');
  s = s.replace(/([.!?…])\.+/g, '$1');
  s = s.replace(/,([.;:!?…])/g, '$1');
  s = cap(s);
  s = s.replace(/([.!?]) (\p{Ll})/gu, (_m, p: string, l: string) => `${p} ${l.toUpperCase()}`);
  return s;
}

/** Ora decimale (anche oltre 24, es. 29.0) → "HH:MM". */
export function hhmm(hour: number): string {
  const h = Number.isFinite(hour) ? hour : 0;
  let total = Math.round(h * 60) % 1440;
  if (total < 0) total += 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
}

/** Distanza approssimata come la direbbe una persona: decine sotto i 100 m, cinquantine oltre. */
export function roundDist(d: number): number {
  const v = Number.isFinite(d) ? Math.abs(d) : 0;
  if (v < 100) return Math.max(10, Math.round(v / 10) * 10);
  return Math.round(v / 50) * 50;
}

/** Elenco "a, b e c"; se un elemento contiene virgole usa il punto e virgola. */
export function joinList(items: string[], and: string, also: string): string {
  if (items.length <= 1) return items.join('');
  if (items.some((i) => i.includes(','))) {
    return items.slice(0, -1).join('; ') + `; ${also} ` + items[items.length - 1];
  }
  return items.slice(0, -1).join(', ') + ` ${and} ` + items[items.length - 1];
}

/** Corrompe in modo deterministico parte delle lettere di un testo (SMS disturbato). */
export function garble(text: string, rng: Rng): string {
  const marks = ['#', '_', '*'];
  const words = text.split(' ');
  let touched = false;
  const out = words.map((w, i) => {
    if (i === 0) return w;
    const letters = w.replace(/[^\p{L}]/gu, '').length;
    if (letters < 4 || !rng.chance(0.5)) return w;
    let seen = 0;
    return w.replace(/\p{L}/gu, (ch) => {
      seen++;
      if (seen === 1 || !rng.chance(0.55)) return ch;
      touched = true;
      return rng.pick(marks);
    });
  });
  if (!touched) {
    let best = -1;
    for (let i = 1; i < out.length; i++) if (best < 0 || out[i].length > out[best].length) best = i;
    if (best > 0) {
      const w = out[best];
      let seen = 0;
      out[best] = w.replace(/\p{L}/gu, (ch) => (++seen % 2 === 0 ? marks[seen % 3] : ch));
    }
  }
  return out.join(' ');
}

// ---------------------------------------------------------------- italiano

export type Gender = 'm' | 'f';
export interface ItNoun { s: string; p: string; g: Gender; pluralOnly?: boolean }

const IT_VOWELS = 'aeiouàèéìíòóùú';

/** Classe fonetica dell'iniziale: decide il/lo/l', un/uno, i/gli. */
export function itOnset(w: string): 'vowel' | 'impure' | 'plain' {
  const s = w.toLowerCase().replace(/^[^\p{L}]+/u, '');
  if (s.length === 0) return 'plain';
  const a = s.charAt(0);
  const b = s.charAt(1);
  if ((a === 'i' || a === 'y' || a === 'j') && b !== '' && IT_VOWELS.includes(b)) return 'impure';
  if (IT_VOWELS.includes(a)) return 'vowel';
  if (a === 'h' && b !== '' && IT_VOWELS.includes(b)) return 'vowel';
  if (a === 'z' || a === 'x' || a === 'y') return 'impure';
  if (a === 's' && b !== '' && !IT_VOWELS.includes(b)) return 'impure';
  if ((a === 'g' && b === 'n') || (a === 'p' && (b === 's' || b === 'n'))) return 'impure';
  return 'plain';
}

/** Articolo determinativo (solo l'articolo). */
export function itDefArt(w: string, g: Gender, plural = false): string {
  const on = itOnset(w);
  if (g === 'f') return plural ? 'le' : on === 'vowel' ? "l'" : 'la';
  if (plural) return on === 'plain' ? 'i' : 'gli';
  return on === 'vowel' ? "l'" : on === 'impure' ? 'lo' : 'il';
}

function glue(art: string, w: string): string {
  return art.endsWith("'") ? art + w : `${art} ${w}`;
}

/** "il cane", "lo zaino", "l'albero", "gli gnomi", "le auto". */
export function itDef(w: string, g: Gender, plural = false): string {
  return glue(itDefArt(w, g, plural), w);
}

/** "un cane", "uno zaino", "un'auto", "una sedia". */
export function itIndef(w: string, g: Gender): string {
  const on = itOnset(w);
  const art = g === 'f' ? (on === 'vowel' ? "un'" : 'una') : on === 'impure' ? 'uno' : 'un';
  return glue(art, w);
}

export type ItPrep = 'a' | 'di' | 'da' | 'in' | 'su';
const IT_PREP_STEM: Record<ItPrep, string> = { a: 'a', di: 'de', da: 'da', in: 'ne', su: 'su' };

/** Preposizione articolata: "al cane", "dello zaino", "nell'auto", "sugli alberi", "dalle sedie". */
export function itPrep(prep: ItPrep, w: string, g: Gender, plural = false): string {
  const art = itDefArt(w, g, plural);
  const stem = IT_PREP_STEM[prep];
  let fused: string;
  switch (art) {
    case 'il': fused = stem + 'l'; break;
    case 'lo': fused = stem + 'llo'; break;
    case 'la': fused = stem + 'lla'; break;
    case "l'": fused = stem + "ll'"; break;
    case 'i': fused = stem + 'i'; break;
    case 'gli': fused = stem + 'gli'; break;
    default: fused = stem + 'lle';
  }
  return glue(fused, w);
}

/** Partitivo plurale: "dei cani", "degli zaini", "delle sedie". */
export function itPartitive(w: string, g: Gender): string {
  return itPrep('di', w, g, true);
}

/** Aggettivo regolare in -o (radice senza vocale finale): rovesciat → rovesciato/a/i/e. */
export function itAdjO(stem: string, g: Gender, plural = false): string {
  return stem + (g === 'm' ? (plural ? 'i' : 'o') : plural ? 'e' : 'a');
}

// ---------------------------------------------------------------- inglese

export interface EnNoun { s: string; p: string; pluralOnly?: boolean }

/** "a door", "an owl", "an hour", "a unit". */
export function enIndef(phrase: string): string {
  const w = phrase.toLowerCase().replace(/^[^a-z]+/, '');
  let an = /^[aeiou]/.test(w);
  if (/^(uni([^nmd]|$)|use|usu|eu|one\b|once\b|ut[ie])/.test(w)) an = false;
  if (/^(hour|honest|honou?r|heir)/.test(w)) an = true;
  return `${an ? 'an' : 'a'} ${phrase}`;
}

const EN_IRREGULAR: Record<string, string> = {
  person: 'people', man: 'men', woman: 'women', child: 'children', foot: 'feet', tooth: 'teeth',
  mouse: 'mice', deer: 'deer', sheep: 'sheep', leaf: 'leaves', knife: 'knives', shelf: 'shelves',
};

/** Plurale regolare inglese con le irregolarità più comuni. */
export function enPlural(w: string): string {
  const low = w.toLowerCase();
  if (EN_IRREGULAR[low]) return EN_IRREGULAR[low];
  if (/(s|x|z|ch|sh)$/.test(low)) return w + 'es';
  if (/[^aeiou]y$/.test(low)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

// ---------------------------------------------------------------- contratto dei pacchetti lingua

export type GenMode = 'start' | 'stop' | 'any';
export type BriefPos = 'only' | 'first' | 'mid' | 'last';

export interface BriefItem {
  type: MissionType;
  reason: ReasonId;
  place: string;
  dir?: Dir;
  dist?: number;
  gen: GenMode;
}

export interface Target { key: SubjectKey; plural: boolean }

export interface Percept { subject: string; conf: number; facts: CleanFacts }

export interface CommentFacts {
  place?: string;
  object?: SubjectKey;
  state?: StateKey;
  sound?: SoundKey;
  animal?: AnimalKey;
  item?: ItemKind;
  weather?: WeatherKey;
  remaining?: number;
  lowConf: boolean;
}

export interface SpontFacts { place?: string; weather?: WeatherKey; sound?: SoundKey; subject?: SubjectKey }
export interface NpcFacts { archetype?: string; goal?: string; saw?: string; direction?: Dir }
export interface ItemFacts { worn: boolean; wet: boolean; place?: string }

/** Tutto ciò che è specifico di una lingua: lessico, modelli, concordanze. */
export interface LangPack {
  fallbackPlace: string;
  briefingOpen(c: Chooser, colleague: string, officer: string, n: number): string;
  briefingMission(c: Chooser, m: BriefItem, pos: BriefPos): string;
  briefingClose(c: Chooser): string;
  missionTitle(type: MissionType, place: string): string;
  reportHeader(c: Chooser, first: string, last: string, time: string): string;
  reportPlace(c: Chooser, type: MissionType, place: string): string;
  reportAction(c: Chooser, type: MissionType, action: string, gen: GenMode): string;
  reportNoAction(c: Chooser): string;
  joinClauses(a: string, b: string): string;
  reportState(c: Chooser, target: Target, f: CleanFacts): string | null;
  reportSeen(c: Chooser, items: Percept[]): string | null;
  reportHeard(c: Chooser, items: Percept[]): string | null;
  reportChanged(c: Chooser, items: Percept[]): string | null;
  reportPhotos(c: Chooser, n: number): string;
  reportConclusion(c: Chooser, clean: boolean): string;
  comment(c: Chooser, p: Personality, trigger: CommentTrigger, f: CommentFacts): string;
  /** Per 'garbled' restituisce la frase base: la corruzione la applica il compositore. */
  spontaneous(c: Chooser, kind: SpontaneousKind, f: SpontFacts): string;
  npcLine(c: Chooser, f: NpcFacts): string;
  itemNote(c: Chooser, kind: ItemKind, f: ItemFacts): string;
  /** Frase che cita il testo scritto sull'oggetto; `quoted` è già tra virgolette. */
  itemText(c: Chooser, text: string): string;
}

export type CommentTable = Record<CommentTrigger, Record<Personality, string>>;

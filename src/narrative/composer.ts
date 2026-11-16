// NarrativeComposer locale, bilingue, a costo zero: nessun LLM, nessuna rete.
// Orchestrazione indipendente dalla lingua; lessico e concordanze stanno nei pacchetti IT/EN.
// Rapporti, titoli, briefing e note sugli oggetti sono funzioni pure di (seed, input): l'anteprima
// di un rapporto e il rapporto inviato coincidono. Commenti e SMS spontanei usano uno stream con
// memoria delle frasi recenti.
import type { ItemKind, Lang, Mission, Observation, Personality } from '../core/contracts';
import type { CommentTrigger, Facts, INarrativeComposer, NarrativeContext, SpontaneousKind } from '../core/api';
import { hashString, streamFor, type Rng } from '../core/rng';
import {
  type BriefItem, type BriefPos, type CleanFacts, type CommentFacts, type Dir, type GenMode, type LangPack,
  type Percept, type SubjectKey, type Target,
  Chooser, asAnimal, asDir, asItem, asNumber, asSound, asState, asSubject, asWeather, cleanFacts, finish, garble, hhmm,
} from './grammar';
import { IT } from './lexicon.it';
import { EN } from './lexicon.en';
import { TALKATIVENESS, VOICE_STYLE } from './personality';

const PACKS: Record<Lang, LangPack> = { it: IT, en: EN };

const ALWAYS_SPOKEN: ReadonlySet<CommentTrigger> = new Set<CommentTrigger>(['shift_start', 'not_done_at_car', 'all_done', 'torch_dead']);

/** Quanto un tipo di evento invita al commento (moltiplica la loquacità del profilo). */
const TRIGGER_WEIGHT: Record<CommentTrigger, number> = {
  shift_start: 2, arrive_poi: 1.2, interaction: 0.9, report_done: 1, all_done: 2, saw_figure: 1.6, saw_light: 1.4,
  saw_person: 1.5, saw_animal: 1.1, heard: 0.55, changed: 1.3, torch_low: 1.8, torch_dead: 2, battery_found: 1.2,
  silence: 0.9, weather: 0.6, back_at_car: 1.1, not_done_at_car: 2, item_inspected: 1, locked: 1.2, photo: 0.5,
};

const DEFAULT_TARGET: Record<string, Target> = {
  check_tent: { key: 'tent', plural: false },
  check_cabin: { key: 'door', plural: false },
  lights_off: { key: 'lights', plural: true },
  generator: { key: 'generator', plural: false },
  picnic_check: { key: 'bin', plural: false },
  vehicle_check: { key: 'vehicle', plural: false },
  bridge_check: { key: 'bridge_plate', plural: false },
  panel_check: { key: 'panel', plural: false },
  smoke_report: { key: 'campfire', plural: false },
  surveil: { key: 'logbox', plural: false },
};
const PICNIC_TARGETS: ReadonlySet<SubjectKey> = new Set<SubjectKey>(['bin', 'table', 'cooler', 'bench', 'chair']);

function cleanName(s: unknown, fallback: string): string {
  if (typeof s !== 'string') return fallback;
  const v = s.replace(/[{}\[\]]/g, '').replace(/\s+/g, ' ').trim();
  return v.length > 0 ? v : fallback;
}

export class NarrativeComposer implements INarrativeComposer {
  private lang: Lang;
  private pack: LangPack;
  private readonly sms: Rng;
  private readonly personality: Personality;
  private readonly voiceRng: Rng;
  private readonly commentChooser: Chooser;
  private readonly spontChooser: Chooser;
  private readonly npcChooser: Chooser;
  private readonly garbleRng: Rng;
  private lastSpoken: CommentTrigger | null = null;
  private lastLine = '';

  constructor(private readonly ctx: NarrativeContext) {
    this.lang = ctx.lang === 'en' ? 'en' : 'it';
    this.pack = PACKS[this.lang];
    this.personality = ctx.personality in TALKATIVENESS ? ctx.personality : 'pragmatic';
    this.sms = streamFor(ctx.seed, 'sms');
    const voice = streamFor(ctx.seed, 'voice');
    this.voiceRng = voice.fork('speak');
    this.commentChooser = new Chooser(voice.fork('comment'));
    this.spontChooser = new Chooser(this.sms.fork('spontaneous'));
    this.npcChooser = new Chooser(this.sms.fork('npc'));
    this.garbleRng = this.sms.fork('garble');
  }

  setLang(lang: Lang): void {
    this.lang = lang === 'en' ? 'en' : 'it';
    this.pack = PACKS[this.lang];
  }

  // ---------------------------------------------------------------- accesso sicuro al contesto

  private place(poiId: unknown): string | undefined {
    if (typeof poiId !== 'string' || poiId.length === 0) return undefined;
    try {
      const l = this.ctx.poiName(poiId);
      const v = l ? cleanName(l[this.lang], '') : '';
      return v.length > 0 ? v : undefined;
    } catch {
      return undefined;
    }
  }

  private bearing(poiId: string): { dir?: Dir; dist?: number } {
    try {
      const b = this.ctx.poiBearing(poiId);
      if (!b) return {};
      const dir = asDir(b.dir);
      const dist = asNumber(b.dist);
      return { dir, dist: dir !== undefined && dist !== undefined && dist > 0 ? dist : undefined };
    } catch {
      return {};
    }
  }

  private genMode(m: Mission): GenMode {
    if (m.type !== 'generator') return 'any';
    if (m.requiredAction === 'start') return 'start';
    if (m.requiredAction === 'stop') return 'stop';
    return 'any';
  }

  // ---------------------------------------------------------------- briefing

  briefing(missions: Mission[]): string[] {
    const pack = this.pack;
    const c = new Chooser(this.sms.fork(`briefing:${this.lang}`));
    const list = Array.isArray(missions) ? missions : [];
    const count = list.length;
    const open = pack.briefingOpen(c, cleanName(this.ctx.colleague?.first, ''), cleanName(this.ctx.officer?.first, ''), count);
    const blocks = list.map((m, i) => {
      const b = this.bearing(m.poiId);
      let gen = this.genMode(m);
      if (m.type === 'generator' && gen === 'any') {
        const st = asState(m.outcome?.state);
        if (st === 'running') gen = 'stop';
        else if (st === 'stopped') gen = 'start';
      }
      const item: BriefItem = {
        type: m.type, reason: m.reason, place: this.place(m.poiId) ?? pack.fallbackPlace, dir: b.dir, dist: b.dist, gen,
      };
      const pos: BriefPos = count === 1 ? 'only' : i === 0 ? 'first' : i === count - 1 ? 'last' : 'mid';
      return pack.briefingMission(c, item, pos);
    });
    const chunks = count <= 2 ? 1 : count <= 4 ? 2 : 3;
    const out: string[] = [];
    let at = 0;
    for (let k = 0; k < chunks; k++) {
      const size = Math.ceil((count - at) / (chunks - k));
      const part = blocks.slice(at, at + size).join(' ');
      at += size;
      out.push(finish(k === 0 ? `${open} ${part}` : part));
    }
    out.push(finish(pack.briefingClose(c)));
    return out;
  }

  missionTitle(mission: Mission): string {
    return this.pack.missionTitle(mission.type, this.place(mission.poiId) ?? this.pack.fallbackPlace);
  }

  // ---------------------------------------------------------------- rapporto

  report(mission: Mission, observations: Observation[], extra: { hour: number; photoCount: number }): string {
    const pack = this.pack;
    const c = new Chooser(this.sms.fork(`report:${mission.id}`));
    const obs = Array.isArray(observations) ? observations.filter((o) => o && typeof o === 'object') : [];
    const place = this.place(mission.poiId) ?? pack.fallbackPlace;

    const own = obs.filter((o) => o.kind === 'interaction' && o.missionId === mission.id);
    let merged: CleanFacts = {};
    for (const o of own) merged = { ...merged, ...stripUndefined(cleanFacts(o.facts)) };
    merged = { ...merged, ...stripUndefined(cleanFacts(mission.outcome)) };
    const inspected = own.length > 0 || mission.outcome !== undefined || mission.state !== 'pending';

    let target: Target = DEFAULT_TARGET[mission.type] ?? { key: 'item', plural: false };
    if (mission.type === 'picnic_check') {
      for (const o of own) {
        const s = asSubject(o.subject);
        if (s && PICNIC_TARGETS.has(s)) target = { key: s, plural: false };
      }
    }

    // percezioni sul posto, senza duplicati; al più tre per gruppo, le più certe
    const seen: Percept[] = [];
    const heard: Percept[] = [];
    const changed: Percept[] = [];
    const dedupe = new Map<string, Percept>();
    for (const o of obs) {
      if (o.kind !== 'saw' && o.kind !== 'heard' && o.kind !== 'changed' && o.kind !== 'felt') continue;
      const subject = typeof o.subject === 'string' ? o.subject.trim().toLowerCase() : '';
      if (o.kind === 'felt' && subject !== 'silence') continue;
      const conf = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? Math.min(1, Math.max(0, o.confidence)) : 0.5;
      const facts = stripUndefined(cleanFacts(o.facts));
      const group = o.kind === 'changed' ? 'c' : o.kind === 'heard' || o.kind === 'felt' || subject === 'sound' || subject === 'silence' ? 'h' : 's';
      const key = `${group}|${subject}|${JSON.stringify(facts)}`;
      const prev = dedupe.get(key);
      if (prev) {
        prev.conf = Math.max(prev.conf, conf);
        continue;
      }
      const p: Percept = { subject, conf, facts };
      dedupe.set(key, p);
      (group === 'c' ? changed : group === 'h' ? heard : seen).push(p);
    }
    const top = (arr: Percept[]): Percept[] => {
      if (arr.length <= 3) return arr;
      const keep = new Set(arr.map((p, i) => ({ p, i })).sort((a, b) => b.p.conf - a.p.conf || a.i - b.i).slice(0, 3).map((x) => x.p));
      return arr.filter((p) => keep.has(p));
    };

    const header = pack.reportHeader(c, cleanName(this.ctx.officer?.first, ''), cleanName(this.ctx.officer?.last, ''), hhmm(extra?.hour ?? 0));
    const placeS = pack.reportPlace(c, mission.type, place);
    const actionS = inspected ? pack.reportAction(c, mission.type, mission.requiredAction, this.genMode(mission)) : pack.reportNoAction(c);
    const stateS = inspected ? pack.reportState(c, target, merged) : null;
    const seenS = pack.reportSeen(c, top(seen));
    const heardS = pack.reportHeard(c, top(heard));
    const changedS = pack.reportChanged(c, top(changed));
    const photos = Math.max(0, Math.round(asNumber(extra?.photoCount) ?? 0));
    const photoS = pack.reportPhotos(c, photos);
    const endS = pack.reportConclusion(c, !seenS && !heardS && !changedS);

    const middle = [stateS, seenS, heardS, changedS].filter((s): s is string => s !== null);
    const lead = middle.length >= 4 ? [pack.joinClauses(placeS, actionS)] : [placeS, actionS];
    return [header, ...lead, ...middle, photoS, endS].map(finish).join(' ');
  }

  // ---------------------------------------------------------------- commenti parlati

  comment(trigger: CommentTrigger, facts: Facts): string | null {
    const f = facts && typeof facts === 'object' ? facts : {};
    const weight = TRIGGER_WEIGHT[trigger];
    if (weight === undefined) return null;
    if (!ALWAYS_SPOKEN.has(trigger)) {
      // un numero per chiamata: la sequenza resta deterministica anche quando tace
      const roll = this.voiceRng.next();
      if (trigger === 'heard' && this.lastSpoken === 'heard') {
        this.lastSpoken = null;
        return null;
      }
      if (roll >= Math.min(0.95, TALKATIVENESS[this.personality] * weight)) return null;
    }
    const conf = asNumber(f.confidence);
    const object = asSubject(f.object);
    const cf: CommentFacts = {
      place: this.place(f.poi),
      object: object && object !== 'lights' ? object : undefined,
      state: asState(f.state),
      sound: asSound(f.sound),
      animal: asAnimal(f.animal),
      item: asItem(f.item),
      weather: asWeather(f.weather),
      remaining: asNumber(f.remaining),
      lowConf: conf !== undefined && conf < 0.4,
    };
    let line = finish(this.pack.comment(this.commentChooser, this.personality, trigger, cf));
    if (line === this.lastLine) line = finish(this.pack.comment(this.commentChooser, this.personality, trigger, cf));
    if (line.length === 0) return null;
    this.lastSpoken = trigger;
    this.lastLine = line;
    return line;
  }

  // ---------------------------------------------------------------- SMS spontanei, PNG, oggetti

  spontaneous(kind: SpontaneousKind, facts: Facts): string {
    const f = facts && typeof facts === 'object' ? facts : {};
    const subject = asSubject(f.subject);
    const text = this.pack.spontaneous(this.spontChooser, kind, {
      place: this.place(f.poi),
      weather: asWeather(f.weather),
      sound: asSound(f.sound),
      subject: subject && subject !== 'sound' && subject !== 'silence' ? subject : undefined,
    });
    const done = finish(text);
    return kind === 'garbled' ? garble(done, this.garbleRng) : done;
  }

  npcLine(facts: Facts): string {
    const f = facts && typeof facts === 'object' ? facts : {};
    const s = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim().toLowerCase() : undefined);
    return finish(this.pack.npcLine(this.npcChooser, { archetype: s(f.archetype), goal: s(f.goal), saw: s(f.saw), direction: asDir(f.direction) }));
  }

  itemNote(kind: ItemKind, facts: Facts): string {
    const f = facts && typeof facts === 'object' ? facts : {};
    const text = typeof f.text === 'string' ? f.text.replace(/\s+/g, ' ').trim() : '';
    const k = asItem(kind) ?? 'note';
    const c = new Chooser(this.sms.fork(`item:${k}:${hashString(text)}`));
    const note = finish(this.pack.itemNote(c, k, { worn: f.worn === true, wet: f.wet === true, place: this.place(f.poi) }));
    // il testo citato non viene ritoccato
    return text.length > 0 ? `${note} ${this.pack.itemText(c, text)}` : note;
  }

  voiceStyle(): { rate: number; pitch: number } {
    const v = VOICE_STYLE[this.personality];
    return { rate: v.rate, pitch: v.pitch };
  }
}

function stripUndefined(f: CleanFacts): CleanFacts {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined) out[k] = v;
  return out as CleanFacts;
}

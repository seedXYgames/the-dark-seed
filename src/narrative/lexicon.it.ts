// Lessico e grammatica italiana del NarrativeComposer.
import type { ItemKind, MissionType, Personality, ReasonId } from '../core/contracts';
import type { CommentTrigger, SpontaneousKind } from '../core/api';
import {
  type AnimalKey, type BriefItem, type BriefPos, type Chooser, type CleanFacts, type ColorKey, type CommentFacts,
  type CommentTable, type DetailKey, type Dir, type Gender, type GenMode, type ItNoun, type ItemFacts,
  type LangPack, type NpcFacts, type Percept, type SlotResolver, type SoundKey, type SpontFacts, type StateKey,
  type SubjectKey, type Target, type WeatherKey,
  asSubject, itAdjO, itDef, itIndef, itPartitive, itPrep, joinList, lowerFirst, pickFill, roundDist,
} from './grammar';

// ---------------------------------------------------------------- sostantivi

const n = (s: string, p: string, g: Gender, pluralOnly = false): ItNoun => ({ s, p, g, pluralOnly });

export const IT_NOUNS: Record<SubjectKey, ItNoun> = {
  door: n('porta', 'porte', 'f'),
  switch: n('interruttore', 'interruttori', 'm'),
  lamp: n('lampada', 'lampade', 'f'),
  generator: n('generatore', 'generatori', 'm'),
  drawer: n('cassetto', 'cassetti', 'm'),
  tent: n('tenda', 'tende', 'f'),
  panel: n('quadro elettrico', 'quadri elettrici', 'm'),
  vehicle: n('veicolo', 'veicoli', 'm'),
  sign: n('cartello', 'cartelli', 'm'),
  bin: n('bidone', 'bidoni', 'm'),
  table: n('tavolo', 'tavoli', 'm'),
  campfire: n('focolare', 'focolari', 'm'),
  chair: n('sedia', 'sedie', 'f'),
  item: n('oggetto', 'oggetti', 'm'),
  battery: n('pila', 'pile', 'f'),
  police_car: n('auto di servizio', 'auto di servizio', 'f'),
  car_trunk: n('bagagliaio', 'bagagliai', 'm'),
  bridge_plate: n("targhetta d'ispezione", "targhette d'ispezione", 'f'),
  logbox: n('cassetta del registro', 'cassette del registro', 'f'),
  pump: n('pompa', 'pompe', 'f'),
  trace: n('traccia', 'tracce', 'f'),
  cooler: n('borsa frigo', 'borse frigo', 'f'),
  woodpile: n('catasta di legna', 'cataste di legna', 'f'),
  bench: n('panchina', 'panchine', 'f'),
  fence: n('staccionata', 'staccionate', 'f'),
  lamp_post: n('lampione', 'lampioni', 'm'),
  lights: n('luce', 'luci', 'f', true),
  person: n('persona', 'persone', 'f'),
  animal: n('animale', 'animali', 'm'),
  figure: n('sagoma', 'sagome', 'f'),
  light: n('luce', 'luci', 'f'),
  movement: n('movimento', 'movimenti', 'm'),
  sound: n('rumore', 'rumori', 'm'),
  silence: n('silenzio', 'silenzi', 'm'),
};

export const IT_ITEMS: Record<ItemKind, ItNoun> = {
  note: n('biglietto', 'biglietti', 'm'),
  photo: n('fotografia', 'fotografie', 'f'),
  key: n('chiave', 'chiavi', 'f'),
  radio: n('radio', 'radio', 'f'),
  tool: n('attrezzo', 'attrezzi', 'm'),
  map: n('mappa', 'mappe', 'f'),
  mug: n('tazza', 'tazze', 'f'),
  lantern: n('lanterna', 'lanterne', 'f'),
  boot: n('scarpone', 'scarponi', 'm'),
  tag: n('cartellino', 'cartellini', 'm'),
  phone: n('telefono', 'telefoni', 'm'),
  bottle: n('bottiglia', 'bottiglie', 'f'),
};

export const IT_ANIMALS: Record<AnimalKey, ItNoun> = {
  deer: n('cervo', 'cervi', 'm'),
  fox: n('volpe', 'volpi', 'f'),
  raccoon: n('procione', 'procioni', 'm'),
  owl: n('gufo', 'gufi', 'm'),
  crows: n('corvo', 'corvi', 'm', true),
};

const LOW_NOUNS: Partial<Record<SubjectKey, ItNoun>> = {
  figure: n('sagoma non identificata', 'sagome non identificate', 'f'),
  light: n('bagliore non identificato', 'bagliori non identificati', 'm'),
  movement: n('movimento indistinto', 'movimenti indistinti', 'm'),
};

const NUM = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];
function num(v: number): string {
  return v >= 0 && v <= 10 ? NUM[v] : String(v);
}

function defNP(noun: ItNoun, plural = false): string {
  const pl = plural || !!noun.pluralOnly;
  return itDef(pl ? noun.p : noun.s, noun.g, pl);
}
function indefNP(noun: ItNoun): string {
  return noun.pluralOnly ? itPartitive(noun.p, noun.g) : itIndef(noun.s, noun.g);
}
function prepNP(prep: 'a' | 'di' | 'da' | 'in' | 'su', noun: ItNoun, plural = false): string {
  const pl = plural || !!noun.pluralOnly;
  return itPrep(prep, pl ? noun.p : noun.s, noun.g, pl);
}

// ---------------------------------------------------------------- stati, dettagli, suoni

const STATE_STEM: Record<StateKey, { stem?: string; pre?: string; post?: string; inv?: string }> = {
  locked: { stem: 'chius', post: ' a chiave' },
  unlocked: { stem: 'chius', pre: 'non ', post: ' a chiave' },
  ajar: { stem: 'socchius' },
  open: { stem: 'apert' },
  closed: { stem: 'chius' },
  on: { stem: 'acces' },
  off: { stem: 'spent' },
  running: { inv: 'in funzione' },
  stopped: { stem: 'ferm' },
  empty: { stem: 'vuot' },
  occupied: { stem: 'occupat' },
  tipped: { stem: 'rovesciat' },
  upright: { inv: 'in piedi' },
  warm: { stem: 'cald' },
  cold: { stem: 'fredd' },
  burning: { stem: 'acces' },
  out: { stem: 'spent' },
  tripped: { stem: 'scattat' },
  ok: { inv: 'in ordine' },
  damaged: { stem: 'danneggiat' },
  intact: { stem: 'integr' },
  signed: { stem: 'firmat' },
};

/** Aggettivo di stato concordato in genere e numero. */
export function itState(state: StateKey, g: Gender, plural = false): string {
  const e = STATE_STEM[state];
  if (e.inv !== undefined) return e.inv;
  return (e.pre ?? '') + itAdjO(e.stem ?? '', g, plural) + (e.post ?? '');
}

const DETAIL_WITH: Record<DetailKey, string> = {
  sleeping_bag: "con un sacco a pelo all'interno",
  food: 'con resti di cibo',
  boots: 'con un paio di scarponi',
  nothing: 'senza nulla di rilevante',
  keys_inside: "con le chiavi all'interno",
  flat_tire: 'con una gomma a terra',
  hood_warm: 'con il cofano ancora caldo',
  fogged_windows: 'con i vetri appannati',
  scratches: 'con dei graffi',
  wet: 'con la superficie bagnata',
  ash: 'con della cenere',
  litter: 'con rifiuti sparsi attorno',
  note: 'con un biglietto',
};

interface SoundPhrase { t: string; g: Gender; pl?: boolean }
const SOUND: Record<SoundKey, SoundPhrase> = {
  steps_far: { t: 'dei passi in lontananza', g: 'm', pl: true },
  voice_far: { t: 'una voce lontana', g: 'f' },
  metal_clank: { t: 'un colpo metallico', g: 'm' },
  owl: { t: 'il verso di un gufo', g: 'm' },
  fox: { t: 'il verso di una volpe', g: 'm' },
  deer: { t: 'il verso di un cervo', g: 'm' },
  crows: { t: 'il gracchiare di alcuni corvi', g: 'm' },
  knock: { t: 'dei colpi ripetuti', g: 'm', pl: true },
  twig: { t: 'lo schiocco di un ramo spezzato', g: 'm' },
  vehicle_pass: { t: 'il passaggio di un veicolo', g: 'm' },
  hum_anom: { t: 'un ronzio basso e continuo', g: 'm' },
  whisper_anom: { t: 'un bisbiglio indistinto', g: 'm' },
  tone_anom: { t: 'un tono acuto e prolungato', g: 'm' },
  door_bang: { t: 'il colpo di una porta che sbatte', g: 'm' },
  branch_fall: { t: 'la caduta di un ramo', g: 'f' },
  rustle: { t: 'un fruscio', g: 'm' },
  splash: { t: "un tonfo nell'acqua", g: 'm' },
  thunder: { t: 'un tuono', g: 'm' },
  chair_scrape: { t: 'il rumore di una sedia trascinata', g: 'm' },
  car_door: { t: 'il rumore di una portiera', g: 'm' },
  vehicle_start: { t: "l'avviamento di un motore", g: 'm' },
  frog: { t: 'il gracidare di una rana', g: 'm' },
};

const COLOR: Record<ColorKey, string> = {
  red: 'rosso', white: 'bianco', blue: 'blu', green: 'verde', yellow: 'giallo', orange: 'arancione',
  dark: 'scuro', grey: 'grigio', black: 'nero', pale: 'chiaro', amber: 'ambra',
};

const DIR: Record<Dir, string> = {
  n: 'nord', ne: 'nord-est', e: 'est', se: 'sud-est', s: 'sud', sw: 'sud-ovest', w: 'ovest', nw: 'nord-ovest',
};

const WX_PHRASE: Record<WeatherKey, string> = {
  rain: 'sotto la pioggia', snow: 'sotto la neve', fog: 'nella nebbia', wind: 'con vento sostenuto', clear: 'con cielo sereno',
};
const WX_CLAUSE: Record<WeatherKey, string> = {
  rain: 'piove', snow: 'nevica', fog: 'sale la nebbia', wind: 'si alza il vento', clear: 'il cielo si apre',
};
const WX_FORECAST: Record<WeatherKey, string> = {
  rain: 'pioggia in arrivo', snow: 'neve in arrivo', fog: 'nebbia in aumento', wind: 'vento in rinforzo', clear: 'schiarite in arrivo',
};

// ---------------------------------------------------------------- nomi di luogo

const PLACE_HEADS: Record<string, { g: Gender; pl?: boolean }> = {
  campeggio: { g: 'm' }, baita: { g: 'f' }, ponte: { g: 'm' }, area: { g: 'f' }, capanno: { g: 'm' }, molo: { g: 'm' },
  belvedere: { g: 'm' }, stazione: { g: 'f' }, parcheggio: { g: 'm' }, radura: { g: 'f' }, cabina: { g: 'f' },
  rifugio: { g: 'm' }, distributore: { g: 'm' }, paese: { g: 'm' }, piazzola: { g: 'f' }, lago: { g: 'm' },
  casa: { g: 'f' }, torre: { g: 'f' }, sentiero: { g: 'm' }, borgo: { g: 'm' }, pontile: { g: 'm' }, sosta: { g: 'f' },
  emporio: { g: 'm' }, villaggio: { g: 'm' }, centrale: { g: 'f' }, valle: { g: 'f' }, fonte: { g: 'f' },
  sorgente: { g: 'f' }, croce: { g: 'f' }, zona: { g: 'f' }, punto: { g: 'm' }, bivio: { g: 'm' }, mulino: { g: 'm' },
  osservatorio: { g: 'm' }, pineta: { g: 'f' }, cascata: { g: 'f' }, approdo: { g: 'm' }, spiazzo: { g: 'm' },
  chiosco: { g: 'm' }, fienile: { g: 'm' }, colle: { g: 'm' }, passo: { g: 'm' }, monte: { g: 'm' },
  bagni: { g: 'm', pl: true }, servizi: { g: 'm', pl: true }, case: { g: 'f', pl: true },
  cascate: { g: 'f', pl: true }, rocce: { g: 'f', pl: true }, baite: { g: 'f', pl: true },
};
const PLACE_BARE = new Set(['san', 'santa', 'santo', 'sant', 'via', 'località', 'km', 'il', 'lo', 'la', 'i', 'gli', 'le', 'l']);

export type ItPlaceForm = 'bare' | 'il' | 'a' | 'di' | 'da' | 'su' | 'in' | 'per' | 'presso';

/** Nome di luogo con articolo o preposizione articolata, dedotti dalla prima parola del nome. */
export function itPlace(name: string, form: ItPlaceForm): string {
  if (form === 'bare') return name;
  const first = (name.split(/[\s']/)[0] ?? '').toLowerCase();
  let head: { g: Gender; pl?: boolean } | undefined = PLACE_HEADS[first];
  if (!head && !PLACE_BARE.has(first) && /^\p{Lu}/u.test(name)) {
    if (first.length > 2 && first.endsWith('o')) head = { g: 'm' };
    else if (first.length > 2 && first.endsWith('a')) head = { g: 'f' };
  }
  if (!head) {
    if (form === 'il') return name;
    if (form === 'in') return `a ${name}`;
    return `${form} ${name}`;
  }
  const pl = !!head.pl;
  switch (form) {
    case 'il': return itDef(name, head.g, pl);
    case 'per': return `per ${itDef(name, head.g, pl)}`;
    case 'presso': return `presso ${itDef(name, head.g, pl)}`;
    default: return itPrep(form, name, head.g, pl);
  }
}

function dirPhrase(c: Chooser, dir: Dir | undefined, dist: number | undefined): string {
  if (dir === undefined) return '';
  const d = DIR[dir];
  if (dist === undefined) return c.pick([`a ${d} dell'auto`, `verso ${d} rispetto all'auto`]);
  const m = roundDist(dist);
  return c.pick([
    `a ${d} dell'auto, circa ${m} metri`,
    `circa ${m} metri a ${d} dell'auto`,
    `a circa ${m} metri dall'auto, verso ${d}`,
  ]);
}

// ---------------------------------------------------------------- incarichi

const REASON: Record<ReasonId, string[]> = {
  caller_worried: ['Ha chiamato una persona preoccupata', 'Qualcuno ha telefonato in centrale, piuttosto in ansia'],
  routine: ['Controllo di routine', 'Giro ordinario, niente di urgente'],
  hiker_report: ['Lo ha segnalato un escursionista', 'La segnalazione arriva da un escursionista'],
  owner_request: ['Il proprietario ha chiesto una verifica', 'Richiesta del proprietario'],
  noise_complaint: ['È arrivata una lamentela per dei rumori', 'Qualcuno si è lamentato dei rumori'],
  lights_seen: ['Qualcuno ha visto delle luci in zona', 'Sono state segnalate delle luci'],
  smoke_seen: ['Qualcuno ha segnalato del fumo', 'È stato segnalato del fumo'],
  power_fault: ['Risulta un guasto sulla linea elettrica', 'La rete segnala un guasto'],
  ranger_request: ['Lo chiedono i guardaparco', 'Richiesta dei guardaparco'],
  overdue_party: ["Un gruppo non è rientrato all'orario previsto", "C'è un gruppo in ritardo sul rientro"],
  storm_damage: ["Potrebbero esserci danni dopo l'ultimo temporale", 'Possibili danni da maltempo'],
  abandoned: ['Risulta incustodito da giorni', 'Pare incustodito da tempo'],
};

interface Thing { bare: string; clause: string }
const THING: Record<MissionType, Thing> = {
  check_tent: { bare: 'una tenda che sembra abbandonata', clause: "c'è una tenda che sembra abbandonata" },
  check_cabin: { bare: 'una baita da controllare', clause: "c'è una baita da controllare" },
  lights_off: { bare: 'delle luci rimaste accese', clause: 'ci sono delle luci rimaste accese' },
  generator: { bare: 'un generatore da controllare', clause: "c'è un generatore da controllare" },
  picnic_check: { bare: "un'area picnic da controllare", clause: "c'è un'area picnic da controllare" },
  vehicle_check: { bare: "un'auto ferma", clause: "c'è un'auto ferma" },
  bridge_check: { bare: 'un ponte da verificare', clause: "c'è un ponte da verificare" },
  panel_check: { bare: 'un quadro elettrico da controllare', clause: "c'è un quadro elettrico da controllare" },
  smoke_report: { bare: 'segnalazioni di fumo o luci', clause: 'ci sono segnalazioni di fumo o luci' },
  surveil: { bare: "una struttura da tenere d'occhio", clause: "c'è una struttura da tenere d'occhio" },
};
const GEN_THING: Record<GenMode, Thing> = {
  stop: { bare: 'un generatore rimasto in funzione', clause: "c'è un generatore rimasto in funzione" },
  start: { bare: 'un generatore che risulta fermo', clause: "c'è un generatore che risulta fermo" },
  any: THING.generator,
};

const INSTR: Record<MissionType, string[]> = {
  check_tent: ['Apri il telo e guarda dentro', "Apri la tenda e controlla cosa c'è all'interno", "Scosta il telo d'ingresso e dai un'occhiata dentro"],
  check_cabin: ['Prova la porta', 'Controlla se la porta è chiusa: prova la maniglia', 'Vai alla porta e prova ad aprirla'],
  lights_off: ["Trova l'interruttore e spegnile", "Spegni le luci dall'interruttore", "Cerca l'interruttore e spegni tutto"],
  generator: ['Controllalo e, a seconda di come lo trovi, spegnilo o riavvialo', 'Se è fermo riavvialo, se gira spegnilo'],
  picnic_check: ['Controlla i bidoni e il tavolo', "Dai un'occhiata a bidoni e tavoli", 'Verifica che bidoni e tavolo siano a posto'],
  vehicle_check: ['Ispezionala', "Dalle un'occhiata da vicino", 'Controlla il veicolo'],
  bridge_check: ["Controlla la targhetta d'ispezione", "Verifica la targhetta d'ispezione e il parapetto", "Dai un'occhiata alla targhetta e al parapetto"],
  panel_check: ["Aprilo e controlla l'interruttore generale; se è scattato, riarmalo", "Apri il quadro e verifica l'interruttore", "Aprilo, controlla e se serve riarma l'interruttore"],
  smoke_report: ['Controlla il focolare', 'Vai a vedere il cerchio del fuoco', 'Verifica il punto del fuoco da campo'],
  surveil: ['Firma il registro nella cassetta e documenta quello che vedi', 'Firma il registro e documenta la situazione', 'Metti la firma sul registro nella cassetta e documenta'],
};
const GEN_INSTR: Record<GenMode, string[]> = {
  stop: ['Controllalo e spegnilo', "Dagli un'occhiata e poi arrestalo"],
  start: ['Controllalo e riavvialo', "Dagli un'occhiata e rimettilo in funzione"],
  any: INSTR.generator,
};

const LEAD: Record<BriefPos, string[]> = {
  only: [''],
  first: ['', 'Per cominciare,', 'Primo punto,'],
  mid: ['Poi', 'Inoltre', 'Dopo di che'],
  last: ['Infine', 'Per finire,', 'Ultima cosa,'],
};

const TITLE: Record<MissionType, string> = {
  check_tent: 'Tenda abbandonata', check_cabin: 'Controllo baita', lights_off: 'Luci accese', generator: 'Generatore',
  picnic_check: 'Area picnic', vehicle_check: 'Veicolo fermo', bridge_check: 'Verifica ponte',
  panel_check: 'Quadro elettrico', smoke_report: 'Segnalazione di fumo', surveil: 'Sorveglianza',
};

const PURPOSE: Record<MissionType, { g: Gender; t: string }> = {
  check_tent: { g: 'f', t: 'verifica di una tenda segnalata come abbandonata' },
  check_cabin: { g: 'm', t: 'controllo della porta di una baita' },
  lights_off: { g: 'f', t: 'verifica di luci rimaste accese' },
  generator: { g: 'm', t: 'controllo di un generatore' },
  picnic_check: { g: 'm', t: "controllo dell'area picnic" },
  vehicle_check: { g: 'f', t: 'ispezione di un veicolo fermo' },
  bridge_check: { g: 'f', t: 'verifica del ponte' },
  panel_check: { g: 'm', t: 'controllo di un quadro elettrico' },
  smoke_report: { g: 'f', t: 'verifica di una segnalazione di fumo o luci' },
  surveil: { g: 'f', t: 'sorveglianza di una struttura' },
};

const ACTION: Record<MissionType, string[]> = {
  check_tent: ["Ho aperto il telo d'ingresso e ho guardato all'interno", "Ho aperto la tenda e ne ho controllato l'interno", "Ho scostato il telo e ho ispezionato l'interno della tenda"],
  check_cabin: ['Ho provato la porta', "Ho provato ad aprire la porta d'ingresso", 'Ho verificato la porta provando la maniglia'],
  lights_off: ["Ho azionato l'interruttore", "Ho agito sull'interruttore delle luci", "Ho individuato l'interruttore e l'ho azionato"],
  generator: ['Ho controllato il generatore', 'Ho eseguito la verifica del generatore'],
  picnic_check: ["Ho controllato l'area, compresi bidoni e tavoli", "Ho ispezionato l'area picnic", "Ho fatto il giro dell'area controllando bidoni e tavoli"],
  vehicle_check: ['Ho ispezionato il veicolo', 'Ho esaminato il veicolo sul posto', "Ho eseguito l'ispezione del veicolo"],
  bridge_check: ["Ho controllato la targhetta d'ispezione del ponte", "Ho verificato la targhetta d'ispezione e il parapetto", "Ho esaminato la targhetta d'ispezione sul ponte"],
  panel_check: ["Ho aperto il quadro elettrico e l'ho controllato", "Ho aperto il quadro e verificato l'interruttore generale"],
  smoke_report: ['Ho controllato il focolare', 'Ho esaminato il cerchio del fuoco', 'Ho verificato il punto del fuoco da campo'],
  surveil: ['Ho firmato il registro nella cassetta', 'Ho apposto la firma sul registro di sorveglianza', 'Ho firmato il registro e preso nota dello stato della struttura'],
};
const GEN_ACTION: Record<GenMode, string[]> = {
  stop: ["Ho controllato il generatore e l'ho arrestato", 'Ho verificato il generatore e ne ho fermato il motore'],
  start: ["Ho controllato il generatore e l'ho riavviato", "Ho verificato il generatore e l'ho rimesso in funzione"],
  any: ACTION.generator,
};

// ---------------------------------------------------------------- frasi di percezione

function verb(plural: boolean, sing: string, plur: string): string {
  return plural ? plur : sing;
}

function seenNP(p: Percept): string {
  const f = p.facts;
  const subj = asSubject(p.subject);
  const low = p.conf < 0.4;
  let noun: ItNoun | undefined;
  let prefix = '';
  if (f.animal) noun = IT_ANIMALS[f.animal];
  else if (subj === 'item' && f.item) noun = IT_ITEMS[f.item];
  else if (subj) noun = IT_NOUNS[subj];
  if (!noun) return 'qualcosa di non identificato' + (f.direction ? ` verso ${DIR[f.direction]}` : '');
  let hedge: 'none' | 'mid' | 'low' = p.conf >= 0.75 ? 'none' : low ? 'low' : 'mid';
  if (low) {
    if (!f.animal && subj && LOW_NOUNS[subj]) {
      noun = LOW_NOUNS[subj] as ItNoun;
      hedge = 'none';
    } else if (f.animal || subj === 'person' || subj === 'animal') {
      prefix = 'una sagoma non identificata, forse ';
      hedge = 'none';
    }
  }
  const many = (f.count ?? 1) >= 2;
  const pl = many || !!noun.pluralOnly;
  let np = many ? `${num(f.count as number)} ${noun.p}` : pl ? itPartitive(noun.p, noun.g) : itIndef(noun.s, noun.g);
  if (f.color) np += ` di colore ${COLOR[f.color]}`;
  if (f.state) np += ` ${itState(f.state, noun.g, pl)}`;
  if (f.detail) np += ` ${DETAIL_WITH[f.detail]}`;
  if (f.plate) np += `, targa ${f.plate}`;
  if (f.moved) np += ', in una posizione diversa da prima';
  if (f.direction) np += ` verso ${DIR[f.direction]}`;
  if (f.weather) np += ` ${WX_PHRASE[f.weather]}`;
  if (hedge === 'mid') {
    const q = noun.g === 'm' ? (pl ? 'quelli' : 'quello') : pl ? 'quelle' : 'quella';
    return `${q} che ${verb(pl, 'sembrava', 'sembravano')} ${np}`;
  }
  if (hedge === 'low') return `forse ${np}`;
  return prefix + np;
}

function heardNP(p: Percept): { t: string; silence: boolean } {
  const f = p.facts;
  const subj = asSubject(p.subject);
  if (!f.sound && subj === 'silence') return { t: 'un silenzio insolito', silence: true };
  let ph: SoundPhrase;
  if (f.sound) ph = SOUND[f.sound];
  else if (subj && subj !== 'sound' && subj !== 'person' && subj !== 'animal' && subj !== 'figure' && subj !== 'light' && subj !== 'movement') {
    ph = { t: `un rumore proveniente ${prepNP('da', IT_NOUNS[subj])}`, g: 'm' };
  } else ph = { t: 'un rumore non identificato', g: 'm' };
  let t = ph.t;
  if (f.direction) t += ` in direzione ${DIR[f.direction]}`;
  if (p.conf < 0.4) t = `forse ${t}`;
  else if (p.conf < 0.75) {
    const q = ph.g === 'm' ? (ph.pl ? 'quelli' : 'quello') : ph.pl ? 'quelle' : 'quella';
    t = `${q} che ${verb(!!ph.pl, 'sembrava', 'sembravano')} ${t}`;
  }
  return { t, silence: false };
}

function changedClause(p: Percept): string | null {
  const f = p.facts;
  const subj = asSubject(p.subject);
  const noun = subj === 'item' && f.item ? IT_ITEMS[f.item] : subj ? IT_NOUNS[subj] : undefined;
  if (!noun || subj === 'sound' || subj === 'silence') return null;
  const pl = (f.count ?? 1) >= 2 || !!noun.pluralOnly;
  const T = defNP(noun, pl);
  const era = verb(pl, 'era', 'erano');
  let t: string;
  const now = f.after ?? f.state;
  if (f.before && f.after) t = `${T}, prima ${itState(f.before, noun.g, pl)}, ${era} ${itState(f.after, noun.g, pl)}`;
  else if (f.moved) t = `${T} non ${era} più nella posizione di prima`;
  else if (now) t = `${T} ${era} ora ${itState(now, noun.g, pl)}`;
  else t = `${T} ${verb(pl, 'appariva', 'apparivano')} ${itAdjO('divers', noun.g, pl)} da prima`;
  if (p.conf < 0.4) t += ', ma non ne ho la certezza';
  else if (p.conf < 0.7) t += ', salvo mio errore';
  return t;
}

// ---------------------------------------------------------------- commenti

const COMMENTS: CommentTable = {
  shift_start: {
    reserved: 'Si comincia.|Va bene. Al lavoro.',
    pragmatic: 'Incarichi ricevuti. Un posto alla volta.|Bene, vediamo il primo punto.|Lista chiara. Meglio iniziare subito.',
    ironic: "Un'altra notte nel bosco. Che fortuna.|Turno di notte tra gli alberi. Il sogno di tutti.",
    skeptical: "Solite segnalazioni. Vediamo cosa c'è di vero.|Scommetto che non c'è niente. Andiamo a vedere.",
    nervous: "Va bene… va bene. Un passo alla volta.|Buio pesto… d'accordo, andiamo.",
  },
  arrive_poi: {
    reserved: '{place:il}.|Ci siamo.',
    pragmatic: "Eccomi {place:a}. Vediamo cosa c'è da fare.|Sul posto. Controllo e riparto.",
    ironic: "{place:il}. Incantevole, a quest'ora.|Eccoci. Posto vivace.",
    skeptical: '{place:il}. Sembra tutto normale.|Ci siamo. Niente di strano, per ora.',
    nervous: "{place:il}… non c'è nessuno, vero?|Ci siamo… facciamo in fretta.",
  },
  interaction: {
    reserved: 'Fatto.|{obj:il}: {state}.',
    pragmatic: '{obj:il} è {state}. Ne prendo nota.|Controllato. Si va avanti.',
    ironic: '{obj:il} è {state}. Sorprendente.|Ecco fatto. Lavoro da manuale.',
    skeptical: '{obj:il} è {state}. Niente di misterioso.|Come pensavo. Niente di particolare.',
    nervous: '{obj:il} è {state}… bene, bene.|Fatto… andiamo via di qui.',
  },
  report_done: {
    reserved: 'Rapporto inviato.|Inviato.',
    pragmatic: 'Rapporto fatto: {rem}.|Uno in meno. Avanti.',
    ironic: 'Un altro capolavoro di burocrazia.|Rapporto inviato. Qualcuno lo leggerà, forse.',
    skeptical: 'Scritto quello che ho visto. Niente di più.|Rapporto inviato. Solo fatti.',
    nervous: 'Inviato… bene, {rem}.|Fatto anche questo… avanti.',
  },
  all_done: {
    reserved: "Finito. Torno all'auto.|Tutto fatto. Si rientra.",
    pragmatic: "Tutti i rapporti inviati. Torno alla macchina.|Lavoro chiuso. Rientro all'auto.",
    ironic: "Tutto fatto. Il bosco può fare a meno di me.|Finito. Torno all'auto, prima che cambino idea.",
    skeptical: "Tutto controllato, come previsto. Torno all'auto.|Finito. Niente che un rapporto non spieghi. Torno all'auto.",
    nervous: "Finito… finalmente. Torno all'auto, subito.|Basta così… alla macchina, forza.",
  },
  saw_figure: {
    reserved: "C'è qualcosa laggiù.|Una sagoma.",
    pragmatic: 'Una sagoma. La segno nel rapporto.|Vedo qualcosa. Da annotare.',
    ironic: 'Una sagoma. Magari saluta.|Ottimo, compagnia. O forse un cespuglio.',
    skeptical: "Sarà un tronco. O un'ombra.|Una sagoma. Con questo buio, può essere qualunque cosa.",
    nervous: "C'è… c'è qualcosa laggiù?|Quella sagoma… non mi piace.",
  },
  saw_light: {
    reserved: 'Una luce.|Luce, laggiù.',
    pragmatic: 'Una luce. Prendo nota della direzione.|Luce in lontananza. La annoto.',
    ironic: 'Una luce. Qualcuno ha pagato la bolletta.|Luci nel bosco. Mancava solo questo.',
    skeptical: 'Una luce. Ci sarà una spiegazione.|Luce laggiù. Non significa niente, da sola.',
    nervous: "Quella luce… cos'è?|Una luce… non mi piace per niente.",
  },
  saw_person: {
    reserved: "C'è qualcuno.|Una persona.",
    pragmatic: "C'è una persona. Meglio tenerla d'occhio.|Qualcuno in zona. Ne prendo nota.",
    ironic: "Guarda, non sono l'unica anima in giro.|Compagnia. A quest'ora, poi.",
    skeptical: 'Qualcuno a spasso. Capita.|Una persona. Niente di strano, fin qui.',
    nervous: "C'è qualcuno… chi gira a quest'ora?|Una persona… spero mi abbia visto.",
  },
  saw_animal: {
    reserved: '{animal:un}.|Un animale.',
    pragmatic: '{animal:un}. Niente da segnalare.|Solo un animale. Avanti.',
    ironic: '{animal:un}. Almeno qualcuno è di casa.|Un animale. Il testimone ideale.',
    skeptical: '{animal:un}. Ecco chi fa rumore, magari.|Un animale. Come volevasi dimostrare.',
    nervous: '{animal:un}… solo {animal:un}. Bene.|Era un animale… credo.',
  },
  heard: {
    reserved: 'Sentito.|Un rumore.',
    pragmatic: '{sound}. Lo tengo a mente.|Un rumore. Prendo nota.',
    ironic: '{sound}. Il bosco ha sempre qualcosa da dire.|Rumori. Che novità.',
    skeptical: '{sound}. Di notte si sente di tutto.|Un rumore. Il bosco ne è pieno.',
    nervous: "{sound}… l'ho sentito davvero?|Cos'era… cos'era quello?",
  },
  changed: {
    reserved: 'Prima era diverso.|{obj:il}. Non era così.',
    pragmatic: '{obj:il} non è come prima. Lo scrivo.|Qui è cambiato qualcosa. Da annotare.',
    ironic: '{obj:il} non è come prima. O invecchio.|Qualcuno ha fatto ordine, pare.',
    skeptical: '{obj:il} mi sembra diverso da prima. Forse ricordo male.|Diverso da prima? Forse ricordo male io.',
    nervous: '{obj:il}… non era così, lo giurerei.|Aspetta… prima non era così.',
  },
  torch_low: {
    reserved: 'La torcia cala.|Pila quasi finita.',
    pragmatic: 'Torcia debole. Serve una pila di ricambio.|La pila sta finendo. Meglio cambiarla presto.',
    ironic: 'La torcia si arrende. Tempismo perfetto.|Pila agli sgoccioli. Ovviamente.',
    skeptical: 'Pila scarica, niente di strano. Dura quel che dura.|La torcia cala. Succede, con queste pile.',
    nervous: 'No, no… la torcia sta calando.|La luce si abbassa… non adesso.',
  },
  torch_dead: {
    reserved: 'Torcia spenta.|Buio.',
    pragmatic: "Torcia a zero. Devo cambiare la pila.|Pila finita. Ne serve un'altra.",
    ironic: 'Ed ecco il buio. Mancava giusto quello.|Torcia morta. Serata perfetta.',
    skeptical: 'Pila esaurita. Tutto qui.|Si è scaricata. Capita.',
    nervous: 'No… no, no. È buio.|La torcia… non si accende più.',
  },
  battery_found: {
    reserved: 'Una pila.|Pila. Bene.',
    pragmatic: 'Una pila di scorta. Utile.|Pila trovata. La tengo.',
    ironic: "Una pila. Il bosco provvede.|Guarda un po', una pila. Quasi commovente.",
    skeptical: 'Una pila. Vediamo se funziona.|Pila di scorta. Sempre che sia carica.',
    nervous: 'Una pila… meno male.|Pila… grazie al cielo.',
  },
  silence: {
    reserved: 'Silenzio.|Troppo silenzio.',
    pragmatic: 'Non si sente più niente. Prendo nota.|Silenzio improvviso. Lo annoto.',
    ironic: 'Che pace. Fin troppa.|Silenzio assoluto. Avranno finito le chiacchiere.',
    skeptical: 'Silenzio. Gli animali ogni tanto tacciono.|Non si sente niente. Può capitare.',
    nervous: 'Perché non si sente più niente?|È tutto zitto… troppo zitto.',
  },
  weather: {
    reserved: '{wx}.|Cambia il tempo.',
    pragmatic: '{wx}. Ne tengo conto.|Il tempo cambia. Attenzione a dove metto i piedi.',
    ironic: '{wx}. Serata sempre più interessante.|Il tempo cambia. Che sorpresa.',
    skeptical: '{wx}. È solo il tempo.|Cambia il tempo. Tutto qui.',
    nervous: '{wx}… va bene, va bene.|Il tempo cambia… proprio adesso.',
  },
  back_at_car: {
    reserved: "L'auto.|Eccola.",
    pragmatic: "Di nuovo all'auto. Punto fermo.|L'auto è qui. Bene.",
    ironic: "Casa dolce casa, su quattro ruote.|La macchina. L'unica che mi aspetta.",
    skeptical: "L'auto è dove l'ho lasciata. Ovviamente.|La macchina. Tutto a posto.",
    nervous: "L'auto… meno male.|Eccola… è ancora qui.",
  },
  not_done_at_car: {
    reserved: 'Non ancora: {rem}.|Non ho finito.',
    pragmatic: 'Non posso chiudere il turno: {rem}.|Manca ancora del lavoro. Torno a farlo.',
    ironic: 'Mi piacerebbe andarmene, ma {rem}.|Bella idea, la fuga. Peccato per i rapporti.',
    skeptical: 'Non è finita: {rem}.|Prima il lavoro, poi si va.',
    nervous: "Vorrei andare via… ma {rem}.|Non posso ancora… c'è altro da fare.",
  },
  item_inspected: {
    reserved: '{item:un}.|Interessante.',
    pragmatic: '{item:un}. Ne prendo nota.|Da annotare.',
    ironic: '{item:un}. Qualcuno ne sentirà la mancanza.|Oggetti smarriti, reparto bosco.',
    skeptical: '{item:un}. Una dimenticanza, immagino.|Roba lasciata in giro. Niente di più.',
    nervous: '{item:un}… di chi è?|Di chi sarà?',
  },
  locked: {
    reserved: 'Non si apre.|Serratura chiusa.',
    pragmatic: 'Non si apre. Lo riporto così.|Serratura chiusa. Prendo nota.',
    ironic: 'Non si apre. Nessuno mi aspettava, a quanto pare.|Serratura chiusa. Che accoglienza.',
    skeptical: "Non si apre. Normale, a quest'ora.|Serratura chiusa. Come dovrebbe essere.",
    nervous: 'Non si apre… meglio così, forse.|È chiuso… bene. Credo.',
  },
  photo: {
    reserved: 'Fatta.|Scattata.',
    pragmatic: 'Foto scattata. Va nel rapporto.|Una foto per il rapporto.',
    ironic: 'Un bel ricordo della serata.|Foto artistica. Più o meno.',
    skeptical: 'Foto fatta. Così resta agli atti.|Meglio una foto che la memoria.',
    nervous: 'Fatta… spero sia venuta.|Una foto… così non me lo sogno.',
  },
};

function commentResolver(f: CommentFacts): SlotResolver {
  return (name, form) => {
    const obj = f.object ? IT_NOUNS[f.object] : undefined;
    switch (name) {
      case 'place': return f.place ? itPlace(f.place, form === 'a' ? 'a' : form === 'il' ? 'il' : 'bare') : null;
      case 'obj': return obj ? (form === 'un' ? indefNP(obj) : defNP(obj)) : null;
      case 'state': return obj && f.state ? itState(f.state, obj.g, !!obj.pluralOnly) : null;
      case 'sound': return f.sound ? SOUND[f.sound].t : null;
      case 'animal': return f.animal ? indefNP(IT_ANIMALS[f.animal]) : null;
      case 'item': return f.item ? indefNP(IT_ITEMS[f.item]) : null;
      case 'wx': return f.weather ? WX_CLAUSE[f.weather] : null;
      case 'rem': {
        if (f.remaining === undefined) return null;
        const r = Math.max(0, Math.round(f.remaining));
        return r === 0 ? 'non ne manca nessuno' : r === 1 ? 'ne manca uno' : `ne mancano ${num(r)}`;
      }
      default: return null;
    }
  };
}

// ---------------------------------------------------------------- PNG

const NPC_GREET: Record<string, string[]> = {
  hiker: ['Buonasera, agente.', 'Salve, agente.'],
  camper: ['Buonasera.', 'Ah, buonasera, agente.'],
  motorist: ['Agente, buonasera.', 'Buonasera, agente.'],
  resident: ['Sera, agente.', 'Buonasera, agente.'],
};
const NPC_GOAL: Record<string, string[]> = {
  camping: ['Cerco solo un posto per la tenda.', 'Stanotte mi accampo qui vicino.'],
  crossing: ['Sto solo attraversando la zona.', 'Sono di passaggio, proseguo a piedi.'],
  watching_lake: ['Sono qui per guardare il lago.', "Mi fermo un po' a guardare l'acqua."],
  to_gas: ['Sto andando al distributore.', 'Cerco il distributore, sono quasi a secco.'],
  going_home: ['Sto tornando a casa.', 'Rientro a casa, abito qui vicino.'],
  walking: ['Faccio solo due passi.', 'Una passeggiata prima di dormire, niente di più.'],
};
const NPC_SAW: Record<string, string[]> = {
  lights: ['Ho visto delle luci{d}, non so dirle altro.', "Prima c'erano delle luci{d}."],
  animal: ['Ho visto un animale{d}, non so quale.', 'Qualche animale si muoveva{d}.'],
  person: ["Ho visto qualcuno{d}, ma non l'ho riconosciuto.", "C'era una persona{d}, mi pare."],
  nothing: ['Non ho visto niente di particolare.', 'Qui intorno non ho notato nulla.'],
};

// ---------------------------------------------------------------- pacchetto

export const IT: LangPack = {
  fallbackPlace: 'zona indicata',

  briefingOpen(c, colleague, officer, count) {
    const hi = c.pick([`Ciao ${officer}, sono ${colleague}.`, `Buonasera ${officer}, qui ${colleague}.`, `${officer}, sono ${colleague} dalla centrale.`]);
    let intro: string;
    if (count <= 0) intro = 'Per ora nessun incarico in lista.';
    else if (count === 1) intro = c.pick(['Stanotte hai un incarico.', "Per il tuo giro c'è una cosa da controllare.", 'Lista di stanotte: una tappa.']);
    else {
      const k = num(count);
      intro = c.pick([`Stanotte hai ${k} incarichi.`, `Per il tuo giro ci sono ${k} cose da controllare.`, `Lista di stanotte: ${k} tappe.`]);
    }
    return `${hi} ${intro}`;
  },

  briefingMission(c, m: BriefItem, pos: BriefPos) {
    const thing = m.type === 'generator' ? GEN_THING[m.gen] : THING[m.type] ?? { bare: 'un controllo da fare', clause: "c'è un controllo da fare" };
    const instr = c.pick(m.type === 'generator' ? GEN_INSTR[m.gen] : INSTR[m.type] ?? ['Controlla la situazione']);
    const reasons = REASON[m.reason];
    const reason = reasons ? c.pick(reasons) : '';
    const dir = dirPhrase(c, m.dir, m.dist);
    const lead = c.pick(LEAD[pos]);
    const at = itPlace(m.place, 'a');
    const frame = c.pick(reason ? ['f1', 'f2', 'f3'] : ['f1', 'f2']);
    if (frame === 'f1') {
      return `${lead} ${m.place}${dir ? ` (${dir})` : ''}: ${thing.bare}. ${reason ? reason + '.' : ''} ${instr}.`;
    }
    if (frame === 'f2') {
      return `${lead} ${thing.clause} ${at}${dir ? `, ${dir}` : ''}. ${reason ? reason + '.' : ''} ${instr}.`;
    }
    return `${reason}: ${thing.clause} ${at}${dir ? `, ${dir}` : ''}. ${instr}.`;
  },

  briefingClose(c) {
    const main = c.pick([
      "Per ogni incarico compila un rapporto dal telefono, poi torna all'auto.",
      'Ricordati: un rapporto per ciascun punto, e a fine giro rientra alla macchina.',
      "Fai un rapporto per ognuno e quando hai finito torna all'auto.",
    ]);
    return main + c.pick(['', ' Buon lavoro.', ' Ci sentiamo dopo.']);
  },

  missionTitle(type: MissionType, place: string) {
    return `${TITLE[type] ?? 'Controllo'} — ${place}`;
  },

  reportHeader(c, first, last, time) {
    return c.pick([
      `Rapporto dell'agente ${last}, ore ${time}.`,
      `Agente ${first} ${last}, rapporto di servizio delle ore ${time}.`,
      `Rapporto di servizio, ore ${time}, agente ${last}.`,
      `Verbale delle ore ${time}, agente ${first} ${last}.`,
    ]);
  },

  reportPlace(c, type, place) {
    const p = PURPOSE[type] ?? { g: 'm' as Gender, t: 'controllo richiesto' };
    const per = `per ${itDef(p.t, p.g)}`;
    return c.pick([
      `Ho raggiunto ${itPlace(place, 'il')} ${per}.`,
      `Intervento ${itPlace(place, 'presso')}: ${p.t}.`,
      `Sopralluogo ${itPlace(place, 'a')} ${per}.`,
      `Controllo eseguito ${itPlace(place, 'a')}: ${p.t}.`,
    ]);
  },

  reportAction(c, type, action, gen) {
    if (type === 'generator') return c.pick(GEN_ACTION[gen]) + '.';
    if (type === 'panel_check' && action === 'reset_breaker') return "Ho aperto il quadro elettrico e riarmato l'interruttore.";
    if (type === 'smoke_report' && action === 'douse') return "Ho controllato il focolare e l'ho spento.";
    return c.pick(ACTION[type] ?? ['Ho eseguito il controllo richiesto']) + '.';
  },

  reportNoAction(c) {
    return c.pick(['Nessuna verifica diretta risulta annotata.', 'Non risulta annotata alcuna verifica diretta.']);
  },

  joinClauses(a, b) {
    return `${a.replace(/[.]$/, '')}; ${lowerFirst(b)}`;
  },

  reportState(c, target: Target, f: CleanFacts) {
    const noun = IT_NOUNS[target.key];
    const pl = target.plural || !!noun.pluralOnly;
    const col = f.color ? ` di colore ${COLOR[f.color]}` : '';
    const il = defNP(noun, pl) + col;
    const era = verb(pl, 'era', 'erano');
    const risultava = verb(pl, 'risultava', 'risultavano');
    let main = '';
    let detailUsed = false;
    const state = f.state ?? f.after;
    if (f.before && f.after) {
      main = `${il}, in un primo momento ${itState(f.before, noun.g, pl)}, ${risultava} ${itState(f.after, noun.g, pl)} al termine del controllo`;
    } else if (state) {
      const st = itState(state, noun.g, pl);
      main = c.pick([
        `${il} ${era} ${st}`,
        `Ho trovato ${il} ${st}`,
        `Al momento del controllo ${il} ${risultava} ${st}`,
        `${il} ${verb(pl, 'si presentava', 'si presentavano')} ${st}`,
      ]);
    } else if (f.detail) {
      main = `Ho trovato ${il} ${DETAIL_WITH[f.detail]}`;
      detailUsed = true;
    }
    const extras: string[] = [];
    if (f.detail && !detailUsed) extras.push(DETAIL_WITH[f.detail]);
    if (f.plate) extras.push(`targa ${f.plate}`);
    if (f.weather) extras.push(WX_PHRASE[f.weather]);
    if (!main) {
      if (extras.length === 0 && !f.item) return null;
      main = `Annotazioni sul controllo ${prepNP('di', noun, pl)}`;
      if (extras.length > 0) main += `: ${extras.join(', ')}`;
      else return `Sul posto c'era ${indefNP(IT_ITEMS[f.item as ItemKind])}.`;
    } else if (extras.length > 0) main += `, ${extras.join(', ')}`;
    if (f.item) main += `; sul posto c'era ${indefNP(IT_ITEMS[f.item])}`;
    return main + '.';
  },

  reportSeen(c, items) {
    if (items.length === 0) return null;
    const list = joinList(items.map(seenNP), 'e', 'inoltre');
    return c.pick([`Sul posto ho notato ${list}.`, `Ho inoltre osservato ${list}.`, `Durante il sopralluogo ho visto ${list}.`, `Annoto di aver visto ${list}.`]);
  },

  reportHeard(c, items) {
    if (items.length === 0) return null;
    const parts = items.map(heardNP);
    const list = joinList(parts.map((p) => p.t), 'e', 'inoltre');
    if (parts.some((p) => p.silence)) return c.pick([`Ho avvertito ${list}.`, `Sul posto ho percepito ${list}.`]);
    return c.pick([`Ho udito ${list}.`, `Ho sentito ${list}.`, `Durante la permanenza ho avvertito ${list}.`]);
  },

  reportChanged(c, items) {
    const clauses = items.map(changedClause).filter((x): x is string => x !== null);
    if (clauses.length === 0) return null;
    const list = clauses.join('; ');
    const head = clauses.length > 1 ? 'Annoto dei cambiamenti' : 'Annoto un cambiamento';
    return c.pick([`Rispetto a prima, ${list}.`, `${head}: ${list}.`, `Segnalo inoltre che ${list}.`]);
  },

  reportPhotos(c, count) {
    if (count <= 0) return c.pick(['Nessuna fotografia allegata.', 'Non allego fotografie.']);
    if (count === 1) return c.pick(['Allego una fotografia.', 'Si allega una fotografia.', 'Una fotografia allegata al presente rapporto.']);
    const k = num(count);
    return c.pick([`Allego ${k} fotografie.`, `Si allegano ${k} fotografie.`, `Fotografie allegate: ${k}.`]);
  },

  reportConclusion(c, clean) {
    return clean
      ? c.pick(["Nient'altro da segnalare.", 'Non ho rilevato altro di insolito.', 'Per il resto, tutto regolare.', 'Nessun altro elemento da annotare.'])
      : c.pick([
          "Non ho elementi per stabilire l'origine di quanto annotato.",
          'Mi limito a riferire quanto osservato, senza ulteriori valutazioni.',
          'Quanto sopra è riportato come osservato, senza altre verifiche possibili sul momento.',
          "Nessun'altra osservazione.",
        ]);
  },

  comment(c, p: Personality, trigger: CommentTrigger, f: CommentFacts) {
    const row = COMMENTS[trigger];
    return pickFill(c, row ? row[p] : 'Va bene.', commentResolver(f), f.lowConf);
  },

  spontaneous(c, kind: SpontaneousKind, f: SpontFacts) {
    const near = f.place ? `nei pressi ${itPlace(f.place, 'di')}` : 'nella tua zona';
    const what = f.sound ? SOUND[f.sound].t : f.subject ? indefNP(IT_NOUNS[f.subject]) : 'qualcosa di poco chiaro';
    const perceived = `${f.sound ? 'sentito' : 'visto'} ${what}`;
    switch (kind) {
      case 'weather_notice': {
        if (!f.weather) return c.pick(['Aggiornamento meteo: il tempo sta cambiando sulla tua zona.', 'Occhio, il meteo sta girando dalle tue parti.']);
        const w = WX_FORECAST[f.weather];
        return c.pick([`Aggiornamento meteo: ${w} sulla tua zona.`, `Occhio, il radar dà ${w} dalle tue parti.`, `Previsioni appena cambiate: ${w} nel tuo settore.`])
          + c.pick(['', ' Niente di grave, ma tienine conto.', ' Regolati tu.']);
      }
      case 'banter':
        return c.pick([
          'Qui in centrale la macchinetta del caffè è di nuovo guasta.',
          "Hanno spostato un'altra volta i turni della settimana prossima.",
          'Stasera ho cenato con un panino freddo alla scrivania.',
          "Il riscaldamento dell'ufficio fa un rumore infernale.",
          'Sto compilando moduli da due ore.',
          'Alla radio danno solo vecchie canzoni.',
        ]) + c.pick(['', ' Tu come te la passi?', " Beato te che sei all'aria aperta.", ' Niente di nuovo, insomma.']);
      case 'ack_report': {
        const tail = c.pick(['', ' Grazie.', ' Tutto registrato.']);
        if (!f.place) return c.pick(['Rapporto ricevuto.', 'Il tuo rapporto è arrivato.']) + tail;
        return c.pick([
          `Ricevuto il rapporto ${itPlace(f.place, 'su')}.`,
          `Rapporto ${itPlace(f.place, 'di')} arrivato.`,
          `Ho qui il tuo rapporto ${itPlace(f.place, 'su')}.`,
        ]) + tail;
      }
      case 'all_reports_ack':
        return c.pick([
          "Ho tutti i rapporti. Torna all'auto, per stanotte basta così.",
          'Rapporti tutti arrivati. Puoi rientrare alla macchina.',
          "Ricevuto tutto. Torna all'auto e chiudi il turno.",
        ]);
      case 'contradiction':
        if (!f.place) {
          return c.pick([
            'Forse una delle chiamate di stanotte era un errore, qui non ne sono più sicuri. Tu controlla tutto lo stesso.',
            'Mi dicono che una segnalazione potrebbe essere uno sbaglio. Fai comunque il giro completo.',
          ]);
        }
        return c.pick([
          `Forse la chiamata ${itPlace(f.place, 'per')} era un errore, qui non ne sono più sicuri. Tu controlla lo stesso.`,
          `Mi dicono che la segnalazione ${itPlace(f.place, 'su')} potrebbe essere uno sbaglio. Facci comunque un salto.`,
          `Piccolo dubbio ${itPlace(f.place, 'su')}: chi ha chiamato potrebbe essersi confuso. Verifica comunque.`,
        ]);
      case 'citizen_call':
        return c.pick([
          `Centrale: un cittadino segnala ${what} ${near}. Se sei in zona, verifica.`,
          `Dalla centrale: è arrivata una chiamata per ${what} ${near}. Dai un'occhiata se puoi.`,
          `Centrale: un residente riferisce ${what} ${near}. Verifica quando passi.`,
        ]);
      case 'false_report':
        return c.pick([
          `Segnalazione non confermata: qualcuno dice di aver ${perceived} ${near}. Potrebbe non essere vero, valuta tu.`,
          `Arriva una voce: qualcuno avrebbe ${perceived} ${near}. Non è detto che sia attendibile.`,
          `Un tale sostiene di aver ${perceived} ${near}. Prendila con cautela, non ci sono conferme.`,
        ]);
      case 'wrong_number':
        return c.pick([
          'Mamma, ho lasciato le chiavi sotto il vaso. Ci vediamo domenica.',
          'Ciao Gianni, la riunione di condominio è spostata a giovedì alle sette.',
          'Ti ho preso il pane. Ricordati di ritirare i panni stesi.',
          'Sono arrivata, parcheggio dietro la farmacia. Scendi tu?',
          "La lavatrice finisce tra mezz'ora, poi stendi per favore.",
        ]);
      case 'garbled':
        return c.pick([
          'Sei ancora lì? Avevi detto che tornavi prima.',
          "Non ho capito l'ultimo messaggio. Puoi ripetere dove sei?",
          'La luce del portico è rimasta accesa di nuovo. Passi tu a spegnerla?',
          'Ti ho chiamato tre volte. Rispondi quando leggi.',
          'Hanno detto di aspettare vicino alla strada. Non so fino a quando.',
        ]);
      case 'carrier':
        return c.pick([
          'Messaggio di servizio: copertura ridotta nella tua zona. Alcuni messaggi potrebbero arrivare in ritardo.',
          "Avviso dell'operatore: lavori sulla rete in corso. Il servizio potrebbe subire brevi interruzioni.",
          'Info operatore: segnale debole rilevato. I messaggi in attesa saranno consegnati appena possibile.',
        ]);
      case 'future_self':
        return c.pick([
          'Ricordati la pila di scorta.',
          'Non dimenticare di chiudere la portiera.',
          'Controlla due volte prima di scrivere.',
          'Sono io. Poi ti spiego.',
          "Guarda bene prima di tornare all'auto.",
          'Promemoria: scrivi solo quello che hai visto.',
        ]);
      case 'checkin':
      default:
        return c.pick([
          'Tutto bene lì? Fatti sentire quando puoi.',
          'Come procede il giro? Scrivimi due righe appena riesci.',
          "Tutto a posto? Non ti sento da un po'.",
          'Ci sei? Dimmi solo se va tutto bene.',
        ]);
    }
  },

  npcLine(c, f: NpcFacts) {
    const parts: string[] = [c.pick(NPC_GREET[f.archetype ?? ''] ?? ['Buonasera.'])];
    const goal = NPC_GOAL[f.goal ?? ''];
    if (goal) parts.push(c.pick(goal));
    const saw = NPC_SAW[f.saw ?? ''];
    if (saw) parts.push(c.pick(saw).replace('{d}', f.direction ? ` verso ${DIR[f.direction]}` : ''));
    return parts.join(' ');
  },

  itemNote(c, kind: ItemKind, f: ItemFacts) {
    const noun = IT_ITEMS[kind] ?? IT_NOUNS.item;
    const adjs: string[] = [];
    if (f.worn) adjs.push(itAdjO('consumat', noun.g));
    if (f.wet) adjs.push(itAdjO('bagnat', noun.g));
    const np = itIndef(noun.s, noun.g) + (adjs.length ? ` ${adjs.join(' e ')}` : '');
    const where = f.place ? `, ${itPlace(f.place, 'a')}` : '';
    return c.pick([`${np}${where}.`, `Si tratta di ${np}${where}.`, `È ${np}${where}.`]);
  },

  itemText(c, text) {
    const end = /[.!?…]$/.test(text) ? '' : '.';
    return c.pick([`C'è scritto: «${text}»${end}`, `Riporta la scritta: «${text}»${end}`, `Sopra si legge: «${text}»${end}`]);
  },
};

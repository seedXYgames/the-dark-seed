// Obiettivi sbloccabili. Si valutano a fine turno (anche alla morte) a partire da quello che è
// davvero successo nel turno; i progressi restano nel browser (nessun account, nessuna rete).
import type { L10n } from '../core/contracts';

/** Quello che serve per giudicare un turno: compilato dalla sessione a fine partita. */
export interface ShiftRecord {
  seed: number;
  completed: boolean;
  death?: 'bigfoot' | 'cultist';
  durationSeconds: number;
  missions: number;
  missionsReported: number;
  photos: number;
  maxPhotos: number;
  /** Archetipi inquadrati nelle foto (watcher, bigfoot, alien_*, ufo_wreck, deer, ...). */
  photographed: string[];
  /** Categorie fotografate (animal, figure, person, light, ...). */
  subjects: string[];
  events: string[];
  torchOnSeconds: number;
  runMeters: number;
  walkMeters: number;
  batteriesTaken: number;
  housesEntered: number;
  churchVisited: boolean;
  pierWalked: boolean;
  dreadBeats: number;
  cluesFound: number;
  cluesTotal: number;
  radioCalls: number;
  radioAnswered: number;
  coldest: number;
  breathless: number;
  phoneDied: boolean;
}

export interface AchievementDef { id: string; name: L10n; desc: L10n; secret?: boolean; test: (r: ShiftRecord, p: Progress) => boolean }

export interface Progress {
  version: 1;
  unlocked: Record<string, { seed: number; at: number }>;
  shifts: number;
  completed: number;
  seeds: number[];
  /** Quante volte è stato giocato ciascun seed (solo i più recenti). */
  seedPlays: Record<string, number>;
  /** Totali di tutti i turni. */
  totals: Totals;
  /** Ultimi seed giocati, dal più recente. */
  recent: number[];
}

export interface Totals { seconds: number; meters: number; photos: number; reports: number; deaths: number; clues: number; radio: number; houses: number; longest: number }
const emptyTotals = (): Totals => ({ seconds: 0, meters: 0, photos: 0, reports: 0, deaths: 0, clues: 0, radio: 0, houses: 0, longest: 0 });

const L = (it: string, en: string): L10n => ({ it, en });
const has = (r: ShiftRecord, ev: string) => r.events.includes(ev);
const shot = (r: ShiftRecord, prefix: string) => r.photographed.some((a) => a === prefix || a.startsWith(prefix));

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_shift', name: L('Timbro il cartellino', 'Clocking Out'), desc: L('Chiudi il tuo primo turno tornando alla volante.', 'Finish your first shift back at the patrol car.'), test: (r) => r.completed },
  { id: 'bureaucrat', name: L('Burocrate dell’anno', 'Paperwork Champion'), desc: L('Invia il rapporto di ogni incarico in un solo turno.', 'File a report for every assignment in a single shift.'), test: (r) => r.missions > 0 && r.missionsReported >= r.missions },
  { id: 'ufo_ticket', name: L('Divieto di sosta interstellare', 'Interstellar Parking Ticket'), desc: L('Fotografa un disco volante parcheggiato dove non dovrebbe.', 'Photograph a flying saucer parked where it shouldn’t be.'), test: (r) => shot(r, 'ufo_wreck') || shot(r, 'alien_tents') },
  { id: 'alien_selfie', name: L('Incontro ravvicinato del tipo «cheese»', 'Close Encounter of the Cheese Kind'), desc: L('Fotografa un visitatore che non è di queste parti.', 'Photograph a visitor who is not from around here.'), test: (r) => shot(r, 'alien_') },
  { id: 'bigfoot_photo', name: L('Prova schiacciante (e sfocata)', 'Blurry but Conclusive'), desc: L('Fotografa la creatura grande e pelosa. Sì, quella.', 'Photograph the big hairy creature. Yes, that one.'), test: (r) => shot(r, 'bigfoot') },
  { id: 'bear_hug', name: L('Abbraccio di montagna', 'Mountain Hug'), desc: L('Fatti stringere troppo forte da qualcosa di molto peloso.', 'Get hugged too hard by something very hairy.'), secret: true, test: (r) => r.death === 'bigfoot' },
  { id: 'cult_member', name: L('Iscrizione d’ufficio', 'Enrolled by Force'), desc: L('Disturba una cerimonia che non prevedeva ospiti.', 'Interrupt a ceremony that had no guest list.'), secret: true, test: (r) => r.death === 'cultist' },
  { id: 'watcher_shy', name: L('Timido, l’amico', 'Camera Shy'), desc: L('Inquadra l’osservatore e guardalo scappare.', 'Frame the watcher and watch him run.'), test: (r) => has(r, 'watcher_flees') },
  { id: 'watcher_photo', name: L('Ritratto di famiglia', 'Family Portrait'), desc: L('Riesci a fotografare l’osservatore prima che sparisca.', 'Manage to photograph the watcher before he vanishes.'), test: (r) => shot(r, 'watcher') },
  { id: 'extreme', name: L('Non ho bevuto, giuro', 'I Swear I’m Sober'), desc: L('Assisti a quello che nessun rapporto può descrivere.', 'Witness what no report can describe.'), secret: true, test: (r) => has(r, 'extreme_begin') },
  { id: 'dark_mode', name: L('Modalità risparmio', 'Power Saving Mode'), desc: L('Chiudi un turno tenendo la torcia accesa meno di due minuti.', 'Finish a shift with the torch on for less than two minutes.'), test: (r) => r.completed && r.torchOnSeconds < 120 },
  { id: 'battery_hoarder', name: L('Collezionista di stilo', 'Battery Hoarder'), desc: L('Raccogli tre batterie in un solo turno.', 'Pick up three batteries in a single shift.'), test: (r) => r.batteriesTaken >= 3 },
  { id: 'full_roll', name: L('Rullino finito', 'Out of Film'), desc: L('Riempi la memoria del telefono di foto.', 'Fill the phone memory with photos.'), test: (r) => r.photos >= r.maxPhotos },
  { id: 'nature', name: L('Documentarista per caso', 'Accidental Wildlife Host'), desc: L('Fotografa un animale del bosco.', 'Photograph a forest animal.'), test: (r) => r.subjects.includes('animal') },
  { id: 'intruder', name: L('Permesso? C’è nessuno?', 'Hello? Anybody Home?'), desc: L('Entra in una casa del paese lasciata aperta.', 'Walk into a town house that was left unlocked.'), test: (r) => r.housesEntered >= 1 },
  { id: 'house_tour', name: L('Agente immobiliare', 'Open House'), desc: L('Visita tre case diverse nello stesso turno.', 'Visit three different houses in the same shift.'), test: (r) => r.housesEntered >= 3 },
  { id: 'church', name: L('Una preghiera non guasta', 'Couldn’t Hurt to Pray'), desc: L('Passa accanto al campanile di un paese.', 'Walk past a village bell tower.'), test: (r) => r.churchVisited },
  { id: 'pier', name: L('Pescatore senza canna', 'Fisherman Without a Rod'), desc: L('Cammina fino in fondo a un molo.', 'Walk to the end of a pier.'), test: (r) => r.pierWalked },
  { id: 'marathon', name: L('Maratoneta notturno', 'Midnight Marathon'), desc: L('Corri per due chilometri in un solo turno.', 'Run two kilometres in a single shift.'), test: (r) => r.runMeters >= 2000 },
  { id: 'hiker', name: L('Contapassi impazzito', 'Step Counter Meltdown'), desc: L('Percorri sei chilometri in un turno.', 'Cover six kilometres in one shift.'), test: (r) => r.runMeters + r.walkMeters >= 6000 },
  { id: 'jumpy', name: L('Coniglio di nervi', 'Bundle of Nerves'), desc: L('Sopravvivi a quattro momenti di silenzio sospetto nello stesso turno.', 'Live through four suspicious silences in the same shift.'), test: (r) => r.dreadBeats >= 4 },
  { id: 'insomnia', name: L('Insonnia professionale', 'Professional Insomniac'), desc: L('Resta in servizio più di quaranta minuti.', 'Stay on duty for more than forty minutes.'), test: (r) => r.durationSeconds >= 2400 },
  { id: 'speedrun', name: L('Straordinari? No, grazie', 'Overtime? No Thanks'), desc: L('Chiudi un turno completo in meno di dodici minuti.', 'Complete a full shift in under twelve minutes.'), test: (r) => r.completed && r.missions > 0 && r.missionsReported >= r.missions && r.durationSeconds < 720 },
  { id: 'detective', name: L('Ispettore di provincia', 'Small-Town Detective'), desc: L('Trova tutti gli indizi della storia del bosco in un turno.', 'Find every clue of the forest’s story in one shift.'), test: (r) => r.cluesTotal > 0 && r.cluesFound >= r.cluesTotal },
  { id: 'nosy', name: L('Ficcanaso certificato', 'Certified Snoop'), desc: L('Trova almeno tre indizi della storia del bosco.', 'Find at least three clues of the forest’s story.'), test: (r) => r.cluesFound >= 3 },
  { id: 'radio_good', name: L('Ricevuto, passo e chiudo', 'Copy That, Over and Out'), desc: L('Rispondi a tre chiamate della centrale in un turno.', 'Answer three calls from dispatch in one shift.'), test: (r) => r.radioAnswered >= 3 },
  { id: 'radio_ghost', name: L('Linea disturbata', 'Bad Line'), desc: L('Ricevi una chiamata che la centrale non ha mai fatto.', 'Get a call that dispatch never made.'), secret: true, test: (r) => has(r, 'radio_wrong') },
  { id: 'frozen', name: L('Ghiacciolo in divisa', 'Popsicle in Uniform'), desc: L('Lascia che il freddo ti entri nelle ossa.', 'Let the cold get into your bones.'), test: (r) => r.coldest < 0.15 },
  { id: 'no_breath', name: L('Polmoni di cartone', 'Cardboard Lungs'), desc: L('Resta senza fiato cinque volte nello stesso turno.', 'Run out of breath five times in the same shift.'), test: (r) => r.breathless >= 5 },
  { id: 'phone_dead', name: L('Batteria scarica, scuse pronte', 'Dead Phone, Ready Excuse'), desc: L('Lascia scaricare il telefono durante il turno.', 'Let your phone die during the shift.'), test: (r) => r.phoneDied },
  { id: 'gardener', name: L('Giardiniere del caos', 'Gardener of Chaos'), desc: L('Gioca dieci seed diversi.', 'Play ten different seeds.'), test: (_r, p) => p.seeds.length >= 10 },
  { id: 'again', name: L('Ancora tu?', 'You Again?'), desc: L('Gioca tre volte lo stesso seed.', 'Play the same seed three times.'), test: (r, p) => (p.seedPlays[String(r.seed)] ?? 0) >= 3 },
  { id: 'veteran', name: L('Veterano del turno di notte', 'Night Shift Veteran'), desc: L('Completa dieci turni.', 'Complete ten shifts.'), test: (_r, p) => p.completed >= 10 },
  { id: 'lucky_seed', name: L('Seme fortunato', 'Lucky Seed'), desc: L('Gioca un seed che termina con 777.', 'Play a seed ending in 777.'), secret: true, test: (r) => r.seed % 1000 === 777 },
];

const KEY = 'tds.progress.v1';

export function emptyProgress(): Progress {
  return { version: 1, unlocked: {}, shifts: 0, completed: 0, seeds: [], seedPlays: {}, totals: emptyTotals(), recent: [] };
}

export function loadProgress(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Progress {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw) as Partial<Progress>;
    const e = emptyProgress();
    return {
      version: 1,
      unlocked: p.unlocked && typeof p.unlocked === 'object' ? p.unlocked : e.unlocked,
      shifts: Number(p.shifts) || 0, completed: Number(p.completed) || 0,
      seeds: Array.isArray(p.seeds) ? p.seeds.filter((s) => Number.isFinite(s)).slice(-500) : [],
      seedPlays: p.seedPlays && typeof p.seedPlays === 'object' ? p.seedPlays : {},
      totals: { ...emptyTotals(), ...(p.totals && typeof p.totals === 'object' ? p.totals : {}) },
      recent: Array.isArray(p.recent) ? p.recent.filter((s) => Number.isFinite(s)).slice(0, 12) : [],
    };
  } catch { return emptyProgress(); }
}

/** Grado in base ai turni completati: indice 0..4 (recluta → veterano). */
export function rankOf(p: Progress): number {
  const c = p.completed;
  return c >= 25 ? 4 : c >= 10 ? 3 : c >= 3 ? 2 : c >= 1 ? 1 : 0;
}

/** Il seed giocato più volte (a parità, il più recente). */
export function favouriteSeed(p: Progress): number | null {
  let best: number | null = null, n = 0;
  for (const s of p.recent) { const c = p.seedPlays[String(s)] ?? 0; if (c > n) { n = c; best = s; } }
  return best;
}

export function saveProgress(p: Progress, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
    if (typeof window !== 'undefined' && (window as any).SeedXY?.syncLocalProgress) {
      (window as any).SeedXY.syncLocalProgress().catch(() => {});
    }
  } catch { /* memoria del browser non disponibile */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** Registra il turno e restituisce gli obiettivi sbloccati per la prima volta. */
export function recordShift(r: ShiftRecord, p: Progress, now = Date.now()): string[] {
  p.shifts++;
  if (r.completed) p.completed++;
  if (!p.seeds.includes(r.seed)) p.seeds.push(r.seed);
  if (p.seeds.length > 500) p.seeds.splice(0, p.seeds.length - 500);
  const k = String(r.seed);
  p.seedPlays[k] = (p.seedPlays[k] ?? 0) + 1;
  p.recent = [r.seed, ...p.recent.filter((x) => x !== r.seed)].slice(0, 12);
  const t = p.totals;
  t.seconds += r.durationSeconds; t.meters += Math.round(r.runMeters + r.walkMeters); t.photos += r.photos; t.reports += r.missionsReported;
  t.deaths += r.death ? 1 : 0; t.clues += r.cluesFound; t.radio += r.radioAnswered; t.houses += r.housesEntered; t.longest = Math.max(t.longest, r.durationSeconds);
  const keys = Object.keys(p.seedPlays);
  if (keys.length > 300) for (const old of keys.slice(0, keys.length - 300)) delete p.seedPlays[old];
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.unlocked[a.id]) continue;
    let ok = false;
    try { ok = a.test(r, p); } catch { ok = false; }
    if (ok) { p.unlocked[a.id] = { seed: r.seed, at: now }; fresh.push(a.id); }
  }
  return fresh;
}

// Interfacce tra moduli. Ogni workstream implementa ESATTAMENTE queste firme.
// Chi consuma un modulo dipende solo da questo file e da contracts.ts.
import type {
  ActionId, ActorState, GraphicsSettings, ItemKind, L10n, Lang, Mission, ObjectKind, Observation,
  Personality, PhoneMessage, Photo, Poi, Report, SessionState, Settings, Vec2, WorldSpec,
} from './contracts';

// ---------------------------------------------------------------- ambiente (puro)

export interface WeatherState {
  cloud: number; // 0..1 copertura
  fog: number; // 0..1
  precip: number; // 0..1 intensità
  precipType: 'none' | 'rain' | 'snow';
  wind: number; // 0..1
  windDir: number; // radianti, direzione verso cui soffia
  temperature: number; // °C
  wetness: number; // 0..1 superfici bagnate
  snowCover: number; // 0..1
}

export interface SkyState {
  hour: number; // 0..24
  sunElevation: number; // radianti, negativa sotto l'orizzonte
  sunAzimuth: number;
  moonElevation: number;
  moonAzimuth: number;
  moonPhase: number; // 0..1 (0.5 piena)
  moonIllum: number; // 0..1 frazione illuminata
  /** Luce lunare che arriva al suolo, già attenuata dalle nuvole (0..1). */
  moonLight: number;
  starVisibility: number; // 0..1
  /** Luce ambientale naturale complessiva 0..1 (0.02 notte coperta … 1 pieno giorno). */
  ambient: number;
  starSeed: number;
  tint: number;
}

// ---------------------------------------------------------------- audio

export interface SoundscapeLevels {
  wind: number; rain: number; insects: number; frogs: number; birds: number;
  water: number; leaves: number; human: number; room: number;
  /** 0 = normale, 1 = silenzio innaturale completo della fauna. Solo diagnostica/mix. */
  hush: number;
}

export interface SoundscapeContext {
  time: number; // secondi simulati
  hour: number;
  weather: WeatherState;
  pos: Vec2;
  forestDensity: number; // 0..1 nel punto
  waterDistance: number; // metri dall'acqua più vicina (Infinity se assente)
  townDistance: number; // metri dal centro abitato o struttura attiva più vicina
  indoors: boolean;
  playerNoise: number; // 0..1 (corsa, rumori recenti)
  /** Sorgenti di silenzio: predatori, eventi forti, cause ignote. */
  hushSources: { pos: Vec2; radius: number; strength: number }[];
}

export type SoundKind =
  | 'door_open' | 'door_close' | 'door_locked' | 'door_bang' | 'switch' | 'generator_start' | 'generator_stop'
  | 'drawer' | 'tent_zip' | 'breaker' | 'metal_clank' | 'bin_tip' | 'twig' | 'owl' | 'fox' | 'deer' | 'crows'
  | 'frog' | 'splash' | 'vehicle_pass' | 'vehicle_start' | 'car_door' | 'typing' | 'paper' | 'camera' | 'sms'
  | 'battery' | 'click' | 'steps_far' | 'voice_far' | 'knock' | 'hum_anom' | 'whisper_anom' | 'tone_anom'
  | 'thunder' | 'branch_fall' | 'fire_douse' | 'ui' | 'torch_click' | 'rustle' | 'chair_scrape' | 'report_sent' | 'screech' | 'nightbird'
  | 'alien_call' | 'bigfoot_growl' | 'cult_chant' | 'mimic_step' | 'radio';

export type LoopKind = 'generator' | 'water' | 'fire' | 'lamp_buzz' | 'anom_drone' | 'engine_idle' | 'mystery_music' | 'breath_calm' | 'breath_fast';
export interface MysteryMood {
  active: boolean; intensity: number; watched: boolean;
  /** Solo sviluppo: causa tecnica dell'indicatore, mostrata accanto all'etichetta (DEBUG_EVENT_REASON in ui.ts). */
  debugReason?: string;
}
export type Surface = 'grass' | 'dirt' | 'road' | 'wood' | 'snow' | 'floor' | 'wet';

export interface Vec3Like { x: number; y: number; z: number }

export interface IAudioEngine {
  /** Da chiamare dopo un gesto utente. Idempotente. */
  resume(): Promise<void>;
  suspend(): void;
  setMuted(muted: boolean): void;
  setListener(pos: Vec3Like, forward: Vec3Like): void;
  /** Livelli obiettivo dell'ambiente; l'engine sfuma con transizioni dolci. */
  setAmbient(levels: SoundscapeLevels): void;
  playOneShot(kind: SoundKind, opts?: { pos?: Vec3Like; gain?: number; pitch?: number }): void;
  /** Sorgente continua posizionale identificata da id; kind null la ferma con dissolvenza. */
  setLoop(id: string, kind: LoopKind | null, pos?: Vec3Like, gain?: number): void;
  footstep(surface: Surface, running: boolean): void;
  /** 0..1: distorsione innaturale globale (anomalie/evento estremo). */
  setDistortion(amount: number): void;
  dispose(): void;
}

export interface TtsStatus {
  supported: boolean;
  voice: Record<Lang, string | null>;
  local: Record<Lang, boolean>;
}

export interface ITts {
  status(): TtsStatus;
  /** Parla se esiste una voce per la lingua; altrimenti non fa nulla (i sottotitoli restano). */
  speak(text: string, lang: Lang, style?: { rate?: number; pitch?: number; interrupt?: boolean }): boolean;
  cancel(): void;
  setEnabled(on: boolean): void;
}

// ---------------------------------------------------------------- narrativa

export type CommentTrigger =
  | 'shift_start' | 'arrive_poi' | 'interaction' | 'report_done' | 'all_done' | 'saw_figure' | 'saw_light'
  | 'saw_person' | 'saw_animal' | 'heard' | 'changed' | 'torch_low' | 'torch_dead' | 'battery_found'
  | 'silence' | 'weather' | 'back_at_car' | 'not_done_at_car' | 'item_inspected' | 'locked' | 'photo';

export type SpontaneousKind =
  | 'weather_notice' | 'banter' | 'ack_report' | 'contradiction' | 'citizen_call' | 'false_report'
  | 'wrong_number' | 'garbled' | 'carrier' | 'future_self' | 'checkin' | 'all_reports_ack';

/** Fatti tipizzati passati al compositore. Solo fatti osservati dal protagonista. */
export type Facts = Record<string, string | number | boolean | undefined>;

export interface NarrativeContext {
  seed: number;
  lang: Lang;
  personality: Personality;
  officer: { first: string; last: string };
  colleague: { first: string; last: string };
  poiName(poiId: string): L10n;
  poiType(poiId: string): string;
  /** Descrizione direzionale dal punto di partenza, es. {dir:'ne', dist:420}. */
  poiBearing(poiId: string): { dir: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'; dist: number };
}

export interface INarrativeComposer {
  setLang(lang: Lang): void;
  /** SMS iniziali del collega che presentano gli incarichi. */
  briefing(missions: Mission[]): string[];
  spontaneous(kind: SpontaneousKind, facts: Facts): string;
  /** Commento parlato; null = il personaggio tace (frequente). */
  comment(trigger: CommentTrigger, facts: Facts): string | null;
  /** Rapporto oggettivo basato solo sulle osservazioni fornite. */
  report(mission: Mission, observations: Observation[], extra: { hour: number; photoCount: number }): string;
  /** Battuta breve di un PNG, dai suoi obiettivi e conoscenze parziali. */
  npcLine(facts: Facts): string;
  /** Nota del protagonista su un oggetto ispezionato. */
  itemNote(kind: ItemKind, facts: Facts): string;
  /** Titolo breve localizzato di un incarico, per l'elenco nel telefono. */
  missionTitle(mission: Mission): string;
  /** Parametri di stile vocale derivati dalla personalità. */
  voiceStyle(): { rate: number; pitch: number };
}

// ---------------------------------------------------------------- UI

export interface MissionView {
  id: string;
  /** Numero del segnalino sulla mappa. */
  n?: number;
  title: string;
  place: string;
  state: Mission['state'];
  canReport: boolean;
}

export interface MapView {
  size: number;
  edges: { kind: 'road' | 'trail'; points: Vec2[] }[];
  pois: { name: string; type: string; pos: Vec2 }[];
  lake?: { center: Vec2; radius: number };
  river?: Vec2[];
  car: Vec2;
  player: { pos: Vec2; yaw: number };
  /** 0..1: disturbo del segnale di posizione. */
  glitch: number;
  /** Luoghi dei rapporti da fare: numero d'ordine, posizione e stato. */
  targets?: { n: number; pos: Vec2; state: 'pending' | 'inspected' | 'reported' }[];
}

export interface PhoneView {
  clock: string; // "22:41"
  signal: number; // 0..4
  torchCharge: number; // 0..1
  torchSpares: number;
  /** Batteria del telefono 0..1. */
  phoneBattery?: number;
  messages: PhoneMessage[];
  missions: MissionView[];
  photos: Photo[];
  maxPhotos: number;
  reports: Report[];
  map: MapView;
  allReported: boolean;
}

export interface SummaryView {
  outcome?: 'completed' | 'killed';
  seed: number;
  officer: string;
  durationSeconds: number;
  missionsCompleted: number;
  reports: { title: string; text: string }[];
  shareUrl: string;
  /** Registro di ciò che è accaduto davvero durante il turno (mostrato solo a fine turno). */
  chronicle?: { time: string; place: string; text: string; seen: boolean; rare: boolean }[];
  /** Lo stesso registro in testo semplice, per lo scaricamento. */
  chronicleText?: string;
  /** Obiettivi sbloccati per la prima volta in questo turno (id). */
  achievements?: string[];
  /** La storia del bosco: cosa si è capito dei misteri, in base agli indizi trovati. */
  story?: { title: string; text: string; found: number; total: number }[];
}

export interface UiCallbacks {
  /** Avvia la partita con un seed già validato. */
  onStartGame(seed: number): void;
  onSettingsChanged(settings: Settings): void;
  onResume(): void;
  /** Abbandono volontario confermato. */
  onAbandon(): void;
  onBackToMenu(): void;
  /** Voce «Esci» del menu: silenzia il gioco prima del congedo. */
  onExit?(): void;
  onExitCancelled?(): void;
  onPhoneClosed(): void;
  onTakePhoto(): void;
  onMessageRead(messageId: number): void;
  /** Testo del rapporto proposto per l'incarico (anteprima). */
  getReportDraft(missionId: string): string;
  onSubmitReport(missionId: string, photoIds: number[]): void;
  onDeletePhoto(photoId: number): void;
  /** Suono di interfaccia (tasti, tocco). */
  onUiSound(kind: 'ui' | 'typing' | 'paper'): void;
}

export type ScreenId = 'loading' | 'menu' | 'settings' | 'intro' | 'game' | 'pause' | 'summary' | 'achievements';
export type PhoneTab = 'messages' | 'tasks' | 'camera' | 'gallery' | 'map';

export interface IUi {
  setMystery(mood: MysteryMood): void;
  setSettings(settings: Settings): void;
  show(screen: ScreenId): void;
  current(): ScreenId;
  // HUD
  setPrompt(text: string | null): void;
  setSubtitle(text: string | null, speaker?: string): void;
  notify(text: string): void;
  setHints(lines: string[]): void;
  setTorch(charge: number, on: boolean, spares: number): void;
  setPauseInfo(seed: number): void;
  // Telefono
  openPhone(tab?: PhoneTab): void;
  closePhone(): void;
  isPhoneOpen(): boolean;
  updatePhone(view: PhoneView): void;
  setUnread(count: number): void;
  // Ispezione
  showInspect(title: string, note: string): void;
  hideInspect(): void;
  // Fine turno
  showSummary(view: SummaryView): void;
  /** Effetti a schermo intero controllati (evento estremo, interferenze). intensity 0..1. */
  setScreenEffect(kind: 'none' | 'code_rain' | 'white' | 'static' | 'flash', intensity: number): void;
  setLoadingProgress(p: number, label?: string): void;
}

// ---------------------------------------------------------------- rendering

/** Alterazioni locali delle regole percepite, calcolate dalla simulazione per la posizione del giocatore. */
export interface LocalAlterations {
  rainUp: number; // 0..1
  shadowSkew: number; // radianti di deviazione della direzione delle ombre
  reflectionShift: number; // 0..1
  dustFloat: number; // 0..1
  /** Luci anomale visibili: posizione, colore e intensità. */
  lights: { id: string; pos: Vec3Like; color: [number, number, number]; intensity: number; radius: number; /** Velocità (m/s) per interpolare tra un passo e l'altro. */ vel?: Vec3Like; /** Alta nel cielo: sopra la foschia del suolo. */ sky?: boolean }[];
}

export interface ExtremeRenderState {
  active: boolean;
  /** 0..1 per ciascun effetto. */
  codeRain: number;
  strip: number;
  sky: number;
  decompose: number;
  stutter: number;
  t: number;
  seed: number;
}

export interface TorchRender {
  on: boolean;
  intensity: number; // 0..1 dopo carica/guasti
  phoneGlow: number; // 0..1 debole bagliore del telefono
}

/** Vista minima del mondo per il rendering; implementata da WorldModel. */
export interface IWorldModel {
  readonly spec: WorldSpec;
  heightAt(x: number, z: number): number;
  /** Quota su cui cammina il giocatore (terreno, ponti, pavimenti). */
  groundAt(x: number, z: number): number;
  waterDepthAt(x: number, z: number): number;
  forestDensityAt(x: number, z: number): number;
  /** 0 fuori sentiero … 1 centro del sentiero; kind del sentiero più vicino. */
  pathMaskAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): Surface;
  readonly trees: Float32Array; // [x, z, scale, variant, rot] * n
  readonly rocks: Float32Array; // [x, z, scale, rot] * n
  poi(id: string): Poi | undefined;
}

export interface IEnvironmentRenderer {
  update(dt: number, camPos: Vec3Like, sky: SkyState, weather: WeatherState, alter: LocalAlterations, torch: TorchRender): void;
  applySettings(gfx: GraphicsSettings): void;
  setExtreme(state: ExtremeRenderState): void;
  /** Registra una mesh come proiettore d'ombra (se le ombre sono attive). */
  addShadowCaster(mesh: unknown): void;
  dispose(): void;
}

export interface ActorView {
  id: string;
  kind: ActorState['kind'];
  archetype: string;
  pos: Vec3Like;
  heading: number;
  moving: boolean;
  lightOn: boolean;
  visible: boolean;
  /** Per illusioni: 0 = sagoma ambigua, 1 = oggetto reale rivelato. */
  reveal: number;
  alpha: number;
}

export interface IWorldObjectsRenderer {
  /** Allinea le mesh allo stato corrente (porte, luci, oggetti spostati, attori). */
  sync(state: SessionState, actors: ActorView[], camPos: Vec3Like, dt: number, sky: SkyState): void;
  /** Id dell'oggetto interattivo colpito dal raggio al centro dello schermo entro maxDist, se esiste. */
  pickObject(origin: Vec3Like, dir: Vec3Like, maxDist: number): { objectId: string; distance: number } | null;
  /** Crea (o riusa) la mesh 3D dettagliata di un oggetto da ispezionare, centrata sull'origine. */
  createInspectMesh(objectId: string): unknown;
  /** Nasconde/mostra temporaneamente attori (per foto: ciò che la cattura non registra). */
  setActorHidden(actorId: string, hidden: boolean): void;
  setExtreme(state: ExtremeRenderState): void;
  applySettings(gfx: GraphicsSettings): void;
  dispose(): void;
}

// ---------------------------------------------------------------- etichette (i18n)

/** Chiavi i18n richieste dal gioco: `action.<ActionId>`, `object.<ObjectKind>`, `item.<ItemKind>`. */
export type ActionLabelKey = `action.${ActionId}`;
export type ObjectLabelKey = `object.${ObjectKind}`;
export type ItemLabelKey = `item.${ItemKind}`;

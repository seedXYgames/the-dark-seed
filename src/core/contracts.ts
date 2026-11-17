// Contratti condivisi di The Dark Seed. Tutta la logica di gioco (worldgen, simulazione,
// narrativa) dipende solo da questi tipi e non da Babylon.js: per questo è testabile headless.

export const GENERATOR_VERSION = 1;
export const WORLD_SIZE = 1000; // metri, lato del quadrato giocabile (era 1400: meno corse a vuoto)
/** Scala rispetto alla mappa originale da 1400 m, per le distanze di piazzamento. */
export const WORLD_K = WORLD_SIZE / 1400;
export const WORLD_HALF = WORLD_SIZE / 2;
export const SEED_MIN = 0;
export const SEED_MAX = 1_000_000;
/** Probabilità per partita (non per minuto) che un seed sia predisposto alla classe estrema. */
export const EXTREME_PROBABILITY = 1e-4;
/** Secondi di orologio del mondo per ogni secondo reale. */
export const CLOCK_SCALE = 6;

export type Seed = number;
export type Lang = 'it' | 'en';
export type L10n = Record<Lang, string>;

export type StreamName =
  | 'worldgen' | 'poi' | 'objects' | 'flora' | 'sky' | 'weather' | 'npc' | 'fauna' | 'missions'
  | 'mysteries' | 'anomaly' | 'rare' | 'sms' | 'ui' | 'names' | 'drift' | 'voice' | 'soundscape'
  | 'environment' | 'illusion' | 'torch' | 'encounters';

export interface Vec2 { x: number; z: number }

// ---------------------------------------------------------------- mondo

export type PoiType =
  | 'car_park' | 'cabin' | 'campsite' | 'picnic' | 'town' | 'gas_station' | 'bridge'
  | 'lake_dock' | 'lookout' | 'utility' | 'restroom' | 'roadside' | 'clearing';

export interface Poi {
  id: string;
  type: PoiType;
  name: L10n;
  pos: Vec2;
  rotY: number;
  radius: number;
  baseHeight: number;
  lit: boolean;
  variant: number;
  /** Lunghezza del molo (m) per i porticcioli; 20 se assente. */
  pier?: number;
}

export type PathKind = 'road' | 'trail';
export interface PathEdge {
  id: string;
  a: string; // id nodo (POI o nodo di ingresso)
  b: string;
  kind: PathKind;
  width: number;
  points: Vec2[];
  length: number;
}

export interface BridgeSpec { id: string; a: Vec2; b: Vec2; width: number; deckY: number; poiId: string }

export type ZoneKind = 'open' | 'dense' | 'narrow' | 'clearing' | 'slope' | 'lit' | 'isolated' | 'water';
export interface PsychZone { kind: ZoneKind; pos: Vec2; radius: number }

export interface TerrainSpec {
  gridStep: number; // metri tra campioni altimetrici
  chunkSize: number; // metri, per rendering a tasselli
  amplitude: number;
  salt: number;
  ridgeAngle: number;
  lake?: { center: Vec2; radius: number; level: number; wobble: number[] };
  river?: { points: Vec2[]; halfWidth: number; levelStart: number; levelEnd: number };
  /** Strada d'accesso: il rilievo di confine si abbassa lungo questa linea. */
  entryRoad: { from: Vec2; to: Vec2 };
  forestSalt: number;
  forestBias: number; // densità media del bosco
}

export type BuildingKind = 'cabin' | 'house' | 'kiosk' | 'shed' | 'restroom' | 'tower' | 'canopy' | 'church' | 'barn';
export interface BuildingSpec {
  id: string;
  poiId: string;
  kind: BuildingKind;
  pos: Vec2;
  rotY: number;
  w: number;
  d: number;
  h: number;
  floorY: number;
  enterable: boolean;
  doorId?: string;
  doorOffset: number; // posizione della porta lungo la facciata (+z locale)
  palette: number;
  litWindows: boolean;
}

export type ObjectKind =
  | 'door' | 'switch' | 'lamp' | 'generator' | 'drawer' | 'tent' | 'panel' | 'vehicle' | 'sign'
  | 'bin' | 'table' | 'campfire' | 'chair' | 'item' | 'battery' | 'police_car' | 'car_trunk'
  | 'bridge_plate' | 'logbox' | 'pump' | 'trace' | 'cooler' | 'woodpile' | 'bench' | 'fence' | 'lamp_post';

export type ItemKind = 'note' | 'photo' | 'key' | 'radio' | 'tool' | 'map' | 'mug' | 'lantern' | 'boot' | 'tag' | 'phone' | 'bottle';

/** Stato mutabile di un oggetto: è la "memoria del bosco". Solo valori serializzabili. */
export type ObjState = Record<string, number | string | boolean>;

export interface WorldObjectSpec {
  id: string;
  kind: ObjectKind;
  poiId: string;
  pos: Vec2;
  y: number; // quota assoluta della base
  rotY: number;
  state: ObjState;
  /** Oggetto bersaglio di almeno un incarico: non può essere rimosso o reso inutilizzabile. */
  essential?: boolean;
  /** Per oggetti contenuti (cassetti, bagagliai, veicoli): id del contenitore. */
  containerId?: string;
  buildingId?: string;
  item?: { kind: ItemKind; text?: L10n; mysteryId?: string; clueIndex?: number; title: L10n };
  /** Collegamenti funzionali, es. interruttore -> lampade, generatore -> lampade. */
  links?: string[];
  interactRadius?: number;
}

export interface SkyInit {
  startHour: number; // ora locale decimale: da tramonto (19.5) a prima dell'alba (5.0, come 29.0)
  moonPhase: number; // 0 nuova … 0.5 piena … 1 nuova
  moonAzimuth: number;
  moonPeakElevation: number; // può essere negativa: luna non visibile
  starSeed: number;
  sunsetAzimuth: number;
  tint: number;
}

export interface WeatherInit {
  salt: number;
  baseCloud: number;
  baseFog: number;
  basePrecip: number;
  baseWind: number;
  windDir: number;
  temperature: number; // °C a inizio turno
  volatility: number;
}

export interface WorldSpec {
  seed: Seed;
  generatorVersion: number;
  size: number;
  attempt: number;
  terrain: TerrainSpec;
  pois: Poi[];
  entry: { id: string; pos: Vec2 };
  edges: PathEdge[];
  bridges: BridgeSpec[];
  buildings: BuildingSpec[];
  objects: WorldObjectSpec[];
  carSpawn: { pos: Vec2; rotY: number };
  playerSpawn: { pos: Vec2; yaw: number };
  scenic: { pos: Vec2; kind: 'vista' | 'far_lights' | 'peak' }[];
  zones: PsychZone[];
  sky: SkyInit;
  weather: WeatherInit;
  officer: { first: string; last: string };
  colleague: { first: string; last: string };
  farLights: { azimuth: number; count: number }[];
  /** Misteri latenti seminati dal seed (verità del mondo, mai mostrata). */
  mysteries: Mystery[];
}

// ---------------------------------------------------------------- incarichi

export type MissionType =
  | 'check_tent' | 'check_cabin' | 'lights_off' | 'generator' | 'picnic_check' | 'vehicle_check'
  | 'bridge_check' | 'panel_check' | 'smoke_report' | 'surveil';
export type MissionState = 'pending' | 'inspected' | 'reported';
export type ReasonId =
  | 'caller_worried' | 'routine' | 'hiker_report' | 'owner_request' | 'noise_complaint' | 'lights_seen'
  | 'smoke_seen' | 'power_fault' | 'ranger_request' | 'overdue_party' | 'storm_damage' | 'abandoned';

export interface Mission {
  id: string;
  type: MissionType;
  poiId: string;
  targetObjectId: string;
  /** Interazione concreta richiesta: entrare in un'area non basta. */
  requiredAction: ActionId;
  reason: ReasonId;
  prerequisites: string[];
  state: MissionState;
  supportedObservations: ObservationKind[];
  text: L10n;
  inspectedAt?: number;
  reportedAt?: number;
  /** Fatti osservati al momento dell'interazione (non la verità nascosta). */
  outcome?: Record<string, string | number | boolean>;
}

export type ActionId =
  | 'try_door' | 'open' | 'close' | 'toggle' | 'start' | 'stop' | 'check' | 'open_flap' | 'close_flap'
  | 'reset_breaker' | 'inspect_vehicle' | 'read' | 'douse' | 'inspect_item' | 'take' | 'headlights'
  | 'end_shift' | 'straighten' | 'check_plate' | 'sign_log' | 'talk' | 'put_back';

// ---------------------------------------------------------------- eventi e osservazioni

export type EventOrigin = 'player' | 'npc' | 'fauna' | 'environment' | 'anomaly' | 'illusion' | 'system' | 'mystery';

export interface WorldEvent {
  id: number;
  t: number; // tempo simulato (s dall'inizio turno)
  type: string;
  pos: Vec2;
  radius: number;
  /** Causa: nota solo alla simulazione, mai esposta a rapporti o narratore. */
  origin: EventOrigin;
  causeEventId?: number;
  actorId?: string;
  objectId?: string;
  props: Record<string, number | string | boolean>;
  preconditions: string[];
  before?: ObjState;
  after?: ObjState;
  persistent: boolean;
  /** Chi avrebbe potuto percepirlo (id attori, 'player'). */
  audience: string[];
  /** Percezione effettiva da parte del giocatore. */
  perceivedByPlayer: boolean;
  sound?: { kind: string; loudness: number };
  /** Solo diagnostica di sviluppo. */
  tags: string[];
}

export type ObservationKind = 'interaction' | 'saw' | 'heard' | 'changed' | 'read' | 'photo' | 'sms' | 'felt';
export type ObservationSource = 'agent' | 'camera' | 'phone';

export interface Observation {
  id: number;
  t: number;
  kind: ObservationKind;
  source: ObservationSource;
  /** Ciò che è stato percepito, non ciò che è: 'figure', 'light', 'person', 'animal', un ObjectKind… */
  subject: string;
  objectId?: string;
  actorId?: string;
  poiId?: string;
  pos: Vec2;
  confidence: number; // 0..1
  facts: Record<string, string | number | boolean>;
  missionId?: string;
}

// ---------------------------------------------------------------- attori

export type ActorKind = 'npc' | 'fauna' | 'phenomenon' | 'anomaly' | 'illusion' | 'encounter';
export type CapabilityId =
  | 'light' | 'motion' | 'audio' | 'appear' | 'vanish' | 'interfere' | 'alter_local' | 'displace' | 'perceptual';

export interface AnomalyCapability {
  id: CapabilityId;
  intensity: number; // 0..1
  /** Proprietà alterata localmente per 'alter_local'. */
  property?: 'rain_up' | 'shadow_skew' | 'reflection_shift' | 'audio_displace' | 'dust_float' | 'compass_spin';
}

export interface RoutineStep {
  act: 'goto' | 'wait' | 'use' | 'leave' | 'wander' | 'graze' | 'perch' | 'manifest' | 'dormant';
  poiId?: string;
  objectId?: string;
  action?: ActionId;
  duration?: number;
  note?: string;
}

export interface ActorState {
  id: string;
  kind: ActorKind;
  archetype: string;
  name?: string;
  pos: Vec2;
  heading: number;
  /** Posizione astratta quando fuori vista: nodo/edge del grafo. */
  route?: { points: Vec2[]; dist: number; total: number };
  goal: string;
  routine: RoutineStep[];
  stepIndex: number;
  stepTimer: number;
  state: string;
  speed: number;
  present: boolean; // false = uscito dalla mappa o non ancora arrivato
  visible: boolean; // per anomalie: manifestazione visibile
  lightOn: boolean;
  /** Percezioni recenti disponibili all'attore (id evento). */
  percepts: number[];
  knowledge: string[];
  capabilities: AnomalyCapability[];
  drives: Record<string, number>;
  photographable: boolean;
  homePoiId?: string;
  ownsObjectIds: string[];
  cooldown: number;
  nextThink: number;
  data: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------- misteri

export type MysteryOrigin = 'human' | 'natural' | 'unidentified' | 'anomalous';
export interface MysteryClue {
  objectId: string;
  poiId: string;
  order: number; // posizione nella cronologia del mistero
  kind: 'item' | 'trace' | 'state';
}
export interface Mystery {
  id: string;
  origin: MysteryOrigin;
  theme: string;
  motive: string;
  originPoiId: string;
  clues: MysteryClue[];
  /** Conseguenze temporali pianificate: tempo simulato e tipo di evento. */
  timeline: { t: number; type: string; poiId: string; objectId?: string; done?: boolean }[];
  discovered: number[]; // indici degli indizi osservati
}

// ---------------------------------------------------------------- sessione

export interface PhoneMessage {
  id: number;
  t: number;
  from: 'colleague' | 'dispatch' | 'unknown' | 'self' | 'carrier';
  sender: string;
  text: string;
  read: boolean;
  missionIds?: string[];
  /** Solo diagnostica: evento del mondo che ha originato il messaggio. */
  causeEventId?: number;
}

export interface Photo {
  id: number;
  t: number;
  dataUrl: string;
  bytes: number;
  pos: Vec2;
  yaw: number;
  poiId?: string;
  /** Soggetti effettivamente presenti nel fotogramma catturato. */
  subjects: string[];
}

export interface Report {
  id: number;
  missionId: string;
  t: number;
  text: string;
  photoIds: number[];
  /** Osservazioni su cui il testo è basato. */
  observationIds: number[];
}

export interface TorchState {
  on: boolean;
  charge: number; // 0..1
  spares: number;
  fault: number; // secondi residui di guasto (tremolio/interruzione)
  flicker: number; // 0..1 intensità corrente del tremolio
}

export type Personality = 'reserved' | 'pragmatic' | 'ironic' | 'skeptical' | 'nervous';

export interface ExtremePlan {
  phases: { kind: 'code_rain' | 'strip' | 'sky' | 'decompose' | 'audio' | 'stutter'; start: number; duration: number }[];
  trigger: { afterReports: number; minTime: number };
  total: number;
  aftermath: 'stars' | 'sms' | 'both';
}

export interface SessionState {
  seed: Seed;
  generatorVersion: number;
  lang: Lang;
  time: number; // secondi simulati dall'inizio turno
  tick: number;
  player: { pos: Vec2; y: number; yaw: number; pitch: number; running: boolean; indoors: boolean };
  torch: TorchState;
  missions: Mission[];
  observations: Observation[];
  photos: Photo[];
  messages: PhoneMessage[];
  reports: Report[];
  /** Stato corrente di tutti gli oggetti (memoria del bosco). */
  objects: Record<string, ObjState>;
  /** Posizioni correnti degli oggetti spostabili. */
  objectPos: Record<string, { x: number; z: number; rotY: number }>;
  /** Oggetti creati durante il turno (tracce, oggetti lasciati): stessa forma degli oggetti del mondo. */
  dynamicObjects: WorldObjectSpec[];
  actors: ActorState[];
  log: WorldEvent[];
  mysteries: Mystery[];
  personality: Personality;
  extreme: { predisposed: boolean; plan?: ExtremePlan; startedAt?: number; done: boolean };
  ended: boolean;
  endedAt?: number;
  death?: { actorId: string; kind: 'bigfoot' | 'cultist' };
  abandoned: boolean;
}

export interface GraphicsSettings {
  brightness: number; // 0.8..1.25 calibrazione display
  quality: 'low' | 'medium' | 'high';
  renderScale: number; // 0.5..1
  shadows: boolean;
  antialias: boolean;
  drawDistance: number; // metri
  fogEffects: boolean;
}

export interface Settings { lang: Lang; gfx: GraphicsSettings }

export const DEFAULT_SETTINGS: Settings = {
  lang: 'it',
  gfx: { brightness: 1, quality: 'high', renderScale: 1, shadows: true, antialias: true, drawDistance: 700, fogEffects: true },
};

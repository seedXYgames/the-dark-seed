// Contratto tra la sessione di gioco (host) e la simulazione autonoma del mondo.
import type { ActorView, ExtremeRenderState, Facts, LocalAlterations, MysteryMood, SkyState, SpontaneousKind, WeatherState } from '../core/api';
import type {
  EventOrigin, ObjState, ObjectKind, PhoneMessage, SessionState, StreamName, Vec2, WorldEvent, WorldObjectSpec, WorldSpec,
} from '../core/contracts';
import type { Rng } from '../core/rng';
import type { WorldModel } from '../world/model';

export interface Cause {
  origin: EventOrigin;
  type: string; // tipo di evento registrato, es. 'door_slam', 'bin_tipped'
  actorId?: string;
  causeEventId?: number;
  sound?: { kind: string; loudness: number }; // loudness ≈ raggio di udibilità in metri in aria calma
  tags?: string[];
  props?: Record<string, number | string | boolean>;
}

export interface SimHost {
  readonly spec: WorldSpec;
  readonly model: WorldModel;
  readonly state: SessionState;
  /** Stream PRNG della partita, uno per nome (istanza condivisa e stabile). */
  rng(stream: StreamName): Rng;
  /** Registra un evento del mondo. Calcola pubblico e percezione del giocatore, riproduce l'eventuale suono. */
  emit(e: { type: string; pos: Vec2; origin: EventOrigin; radius?: number; actorId?: string; objectId?: string; causeEventId?: number;
    props?: Record<string, number | string | boolean>; preconditions?: string[]; before?: ObjState; after?: ObjState; persistent?: boolean;
    sound?: { kind: string; loudness: number }; tags?: string[] }): WorldEvent;
  /** Cambia lo stato di un oggetto registrando evento prima/dopo. Restituisce null se il cambiamento è vietato
   *  (oggetto inesistente; oggetto essenziale che verrebbe rimosso; porta chiusa a chiave; ecc.). */
  setObjectState(id: string, patch: ObjState, cause: Cause): WorldEvent | null;
  /** Sposta un oggetto spostabile (sedie, bidoni, oggetti, cartelli). */
  moveObject(id: string, pose: { x: number; z: number; rotY: number }, cause: Cause): WorldEvent | null;
  /** Crea un oggetto durante il turno (tracce, oggetti lasciati). L'id viene assegnato dall'host. */
  addDynamicObject(o: { kind: ObjectKind; poiId: string; pos: Vec2; rotY?: number; state?: ObjState; item?: WorldObjectSpec['item']; yOff?: number }, cause: Cause): WorldObjectSpec;
  /** Invia un SMS inatteso composto dal NarrativeComposer. Non blocca mai gli incarichi. */
  sendSms(kind: SpontaneousKind, facts: Facts, opts?: { causeEventId?: number; from?: PhoneMessage['from'] }): void;
  /** Vero se il giocatore può plausibilmente vedere quel punto ora (vicino, davanti, in linea di vista). */
  playerCanSee(pos: Vec2, margin?: number): boolean;
  playerDistance(pos: Vec2): number;
  weather(): WeatherState;
  sky(): SkyState;
  object(id: string): WorldObjectSpec | undefined;
  objects(filter?: { kind?: ObjectKind; poiId?: string }): WorldObjectSpec[];
  isEssential(id: string): boolean;
  /** Posizione corrente di un oggetto. */
  pose(id: string): { x: number; z: number; rotY: number } | undefined;
}

export interface ISimulation {
  mysteryMood(): MysteryMood;
  /** Passo fisso (dt = 0.1 s). Deve essere deterministico dato lo stato e gli stream. */
  step(dt: number): void;
  /** Attori da disegnare (entro ~250 m dal giocatore), con posizione 3D. */
  actorViews(): ActorView[];
  localAlterations(): LocalAlterations;
  hushSources(): { pos: Vec2; radius: number; strength: number }[];
  /** Interferenza elettronica corrente sul giocatore, 0..1. */
  interference(): { torch: number; phone: number; gps: number };
  /** Notifica di un evento causato dal giocatore (rumore, luce, oggetto usato): gli attori possono reagire. */
  onPlayerEvent(e: WorldEvent): void;
  extremeState(): ExtremeRenderState;
  /** Solo sviluppo/test: avvia subito l'evento estremo senza alterare la probabilità di produzione. */
  devForceExtreme(): void;
  /** Battuta di un PNG vicino (fatti per il NarrativeComposer.npcLine), o null. */
  npcTalk(actorId: string): Facts | null;
}

export type SimFactory = (host: SimHost) => ISimulation;
export type { ActorView, ExtremeRenderState, LocalAlterations, SkyState, WeatherState };

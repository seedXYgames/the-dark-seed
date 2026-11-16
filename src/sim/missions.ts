// Libreria di incarichi generativi: tipi parametrici assegnati ai luoghi realmente presenti.
import type {
  ActionId, Mission, MissionType, ObjState, ObjectKind, ObservationKind, ReasonId, WorldObjectSpec, WorldSpec,
} from '../core/contracts';
import type { Rng } from '../core/rng';

interface TypeDef {
  kind: ObjectKind;
  action: ActionId;
  accepts: ActionId[];
  reasons: ReasonId[];
  weight: number;
  filter?: (o: WorldObjectSpec, spec: WorldSpec) => boolean;
}

const bkind = (o: WorldObjectSpec, spec: WorldSpec) => spec.buildings.find((b) => b.id === o.buildingId)?.kind;

export const MISSION_TYPES: Record<MissionType, TypeDef> = {
  check_tent: { kind: 'tent', action: 'open_flap', accepts: ['open_flap', 'check'], reasons: ['abandoned', 'overdue_party', 'hiker_report', 'caller_worried'], weight: 1.2 },
  check_cabin: { kind: 'door', action: 'try_door', accepts: ['try_door', 'open', 'close'], reasons: ['owner_request', 'routine', 'noise_complaint', 'caller_worried'], weight: 1.2, filter: (o, s) => bkind(o, s) !== 'house' },
  lights_off: { kind: 'switch', action: 'toggle', accepts: ['toggle'], reasons: ['lights_seen', 'owner_request', 'routine'], weight: 1, filter: (o, s) => bkind(o, s) !== 'house' },
  generator: { kind: 'generator', action: 'check', accepts: ['start', 'stop'], reasons: ['power_fault', 'noise_complaint', 'ranger_request'], weight: 1 },
  picnic_check: { kind: 'bin', action: 'check', accepts: ['check', 'straighten'], reasons: ['routine', 'hiker_report', 'ranger_request'], weight: 0.9, filter: (o) => o.poiId.startsWith('picnic') },
  vehicle_check: { kind: 'vehicle', action: 'inspect_vehicle', accepts: ['inspect_vehicle'], reasons: ['abandoned', 'caller_worried', 'routine', 'overdue_party'], weight: 1.1 },
  bridge_check: { kind: 'bridge_plate', action: 'check_plate', accepts: ['check_plate'], reasons: ['storm_damage', 'ranger_request', 'routine'], weight: 1 },
  panel_check: { kind: 'panel', action: 'open', accepts: ['open', 'reset_breaker'], reasons: ['power_fault', 'storm_damage', 'ranger_request'], weight: 1 },
  smoke_report: { kind: 'campfire', action: 'check', accepts: ['check', 'douse'], reasons: ['smoke_seen', 'lights_seen', 'hiker_report'], weight: 1 },
  surveil: { kind: 'logbox', action: 'sign_log', accepts: ['sign_log'], reasons: ['routine', 'ranger_request', 'lights_seen'], weight: 0.9 },
};

const SUPPORTED: ObservationKind[] = ['interaction', 'saw', 'heard', 'changed', 'photo'];

/** Sceglie 2–5 incarichi completabili e adatta lo stato iniziale degli oggetti alla segnalazione. */
export function generateMissions(spec: WorldSpec, objects: Record<string, ObjState>, rng: Rng): Mission[] {
  const pool: { type: MissionType; obj: WorldObjectSpec }[] = [];
  for (const type of Object.keys(MISSION_TYPES) as MissionType[]) {
    const def = MISSION_TYPES[type];
    for (const o of spec.objects) {
      if (o.kind !== def.kind || o.containerId) continue;
      if (def.filter && !def.filter(o, spec)) continue;
      pool.push({ type, obj: o });
    }
  }
  const u = rng.next();
  const want = u < 0.25 ? 2 : u < 0.6 ? 3 : u < 0.85 ? 4 : 5;
  const missions: Mission[] = [];
  const usedObj = new Set<string>(), usedPoi = new Set<string>(), usedType = new Set<MissionType>();
  while (missions.length < want) {
    let cand = pool.filter((c) => !usedObj.has(c.obj.id) && !usedType.has(c.type) && !usedPoi.has(c.obj.poiId));
    if (!cand.length) cand = pool.filter((c) => !usedObj.has(c.obj.id) && !usedPoi.has(c.obj.poiId));
    if (!cand.length) cand = pool.filter((c) => !usedObj.has(c.obj.id) && !usedType.has(c.type));
    if (!cand.length) cand = pool.filter((c) => !usedObj.has(c.obj.id));
    if (!cand.length) break;
    // pesa per tipo, non per numero di oggetti di quel tipo
    const types = [...new Set(cand.map((c) => c.type))];
    const type = rng.weighted(types, (t) => MISSION_TYPES[t].weight);
    const c = rng.pick(cand.filter((x) => x.type === type));
    usedObj.add(c.obj.id); usedPoi.add(c.obj.poiId); usedType.add(c.type);
    const def = MISSION_TYPES[c.type];
    const st = objects[c.obj.id];
    const m: Mission = {
      id: `m${missions.length + 1}`, type: c.type, poiId: c.obj.poiId, targetObjectId: c.obj.id, requiredAction: def.action,
      reason: rng.pick(def.reasons), prerequisites: [], state: 'pending', supportedObservations: SUPPORTED, text: { it: '', en: '' },
    };
    switch (c.type) {
      case 'lights_off': {
        st.on = true;
        for (const id of c.obj.links ?? []) {
          const l = objects[id];
          l.on = true;
          if (typeof l.power === 'string' && l.power && objects[l.power]) objects[l.power].running = true;
          if (typeof l.breaker === 'string' && l.breaker && objects[l.breaker]) objects[l.breaker].breaker = 'ok';
        }
        break;
      }
      case 'generator': {
        st.running = rng.chance(0.6);
        if (!st.running) st.fuel = Math.max(Number(st.fuel) || 0, 0.3);
        m.outcome = { expected: st.running ? 'running' : 'stopped' };
        m.requiredAction = st.running ? 'stop' : 'start';
        break;
      }
      case 'smoke_report': st.state = rng.weighted(['cold', 'embers', 'burning'], (s) => (s === 'cold' ? 0.42 : s === 'embers' ? 0.4 : 0.18)); break;
      case 'check_tent': st.flap = 'closed'; break;
      case 'panel_check': if (rng.chance(0.6)) st.breaker = 'tripped'; st.open = false; break;
      case 'check_cabin': if (st.state === 'open') st.state = 'closed'; break;
      default: break;
    }
    c.obj.essential = true;
    missions.push(m);
  }
  return missions;
}

/** L'interazione appena svolta soddisfa l'incarico? (entrare nell'area non basta mai) */
export function missionSatisfiedBy(m: Mission, action: ActionId, before: ObjState, after: ObjState): boolean {
  const def = MISSION_TYPES[m.type];
  if (!def.accepts.includes(action)) return false;
  if (m.type === 'panel_check' && action === 'open') return after.breaker !== 'tripped';
  return true;
}

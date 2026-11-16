// Regole di stato degli oggetti condivise da simulazione, sessione e rendering.
import type { ObjState, SessionState, WorldObjectSpec, WorldSpec } from '../core/contracts';

/** Una lampada illumina solo se accesa, alimentata (eventuale generatore) e con interruttore generale non scattato. */
export function isLampLit(state: SessionState, obj: WorldObjectSpec): boolean {
  const st = state.objects[obj.id];
  if (!st || !st.on) return false;
  if (typeof st.power === 'string' && st.power && !state.objects[st.power]?.running) return false;
  if (typeof st.breaker === 'string' && st.breaker && state.objects[st.breaker]?.breaker === 'tripped') return false;
  return true;
}

export function isContainerOpen(st: ObjState | undefined, kind: WorldObjectSpec['kind']): boolean {
  if (!st) return false;
  if (kind === 'tent') return st.flap === 'open';
  return !!st.open;
}

/** Visibile e interagibile: non preso, non rimosso, e con l'eventuale contenitore aperto. */
export function isObjectAvailable(state: SessionState, obj: WorldObjectSpec, byId: (id: string) => WorldObjectSpec | undefined): boolean {
  const st = state.objects[obj.id];
  if (!st) return false;
  if (st.taken === true || st.present === false || st.removed === true) return false;
  if (obj.containerId) {
    const c = byId(obj.containerId);
    if (!c || !isContainerOpen(state.objects[c.id], c.kind)) return false;
  }
  return true;
}

export function objectIndex(spec: WorldSpec, state?: SessionState): Map<string, WorldObjectSpec> {
  const m = new Map<string, WorldObjectSpec>();
  for (const o of spec.objects) m.set(o.id, o);
  if (state) for (const o of state.dynamicObjects) m.set(o.id, o);
  return m;
}

/** Posizione corrente (gli oggetti spostabili hanno un override in objectPos). */
export function objectPose(state: SessionState, obj: WorldObjectSpec): { x: number; z: number; rotY: number } {
  return state.objectPos[obj.id] ?? { x: obj.pos.x, z: obj.pos.z, rotY: obj.rotY };
}

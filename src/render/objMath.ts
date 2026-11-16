// Helper puri (niente Babylon, niente DOM) per il renderer di strutture, oggetti e attori.
import type { BuildingSpec, ItemKind, ObjState, ObjectKind } from '../core/contracts';

export const DEG = Math.PI / 180;
export const WALL_T = 0.18; // semi-spessore dei muri delle baite (come buildingColliders)
export const DOOR_GAP = 0.62; // semi-apertura della porta
export const DOOR_H = 2.05;

/** Angolo (radianti) dell'anta per lo stato logico della porta. */
export function doorAngle(state: unknown): number {
  if (state === 'open') return 100 * DEG;
  if (state === 'ajar') return 20 * DEG;
  return 0;
}

export interface WallSeg { lx: number; lz: number; hx: number; hz: number; door?: boolean }

/** Segmenti murari nel sistema locale dell'edificio, nello stesso ordine di `buildingColliders`. */
export function cabinWallSegments(b: BuildingSpec): WallSeg[] {
  const out: WallSeg[] = [];
  if (b.kind === 'canopy') return out;
  if (!b.enterable) { out.push({ lx: 0, lz: 0, hx: b.w / 2, hz: b.d / 2 }); return out; }
  const T = WALL_T, hw = b.w / 2, hd = b.d / 2;
  out.push({ lx: 0, lz: -hd, hx: hw, hz: T });
  out.push({ lx: -hw, lz: 0, hx: T, hz: hd });
  out.push({ lx: hw, lz: 0, hx: T, hz: hd });
  const left = b.doorOffset - DOOR_GAP, right = b.doorOffset + DOOR_GAP;
  if (left > -hw) out.push({ lx: (-hw + left) / 2, lz: hd, hx: (left + hw) / 2, hz: T });
  if (right < hw) out.push({ lx: (hw + right) / 2, lz: hd, hx: (hw - right) / 2, hz: T });
  if (b.doorId) out.push({ lx: b.doorOffset, lz: hd, hx: DOOR_GAP, hz: T * 0.8, door: true });
  return out;
}

/** Mondo -> locale (inverso di `toWorld`). */
export function toLocal(px: number, pz: number, cx: number, cz: number, rot: number): { x: number; z: number } {
  const dx = px - cx, dz = pz - cz, c = Math.cos(rot), s = Math.sin(rot);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** z locale (nel sistema dell'oggetto) della faccia esterna del muro frontale dell'edificio che lo ospita. */
export function wallFaceZ(objX: number, objZ: number, b: BuildingSpec): number {
  const l = toLocal(objX, objZ, b.pos.x, b.pos.z, b.rotY);
  return b.d / 2 + (b.enterable ? WALL_T : 0) - l.z;
}

export function hashStr(s: string, h: number): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h;
}
export function hashNum(v: number, h: number): number {
  return Math.imul(h ^ ((v * 4096) | 0), 16777619) ^ (h >>> 13);
}
/** Firma numerica dello stato di un oggetto: cambia quando cambia una chiave o un valore. Nessuna allocazione. */
export function hashState(st: ObjState | undefined, h = 2166136261): number {
  if (!st) return 0;
  for (const k in st) {
    const v = st[k];
    h = hashStr(k, h);
    if (typeof v === 'number') h = hashNum(v, h);
    else if (typeof v === 'string') h = hashStr(v, h ^ 0x51);
    else h = Math.imul(h ^ (v ? 0x9e37 : 0x7f4a), 16777619);
  }
  return h | 0;
}
export function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A capo per parole entro `maxWidth` (unità di `measure`, per difetto numero di caratteri). */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number = (s) => s.length): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter((w) => w.length > 0);
    let cur = '';
    for (let w of words) {
      while (measure(w) > maxWidth && w.length > 1) { // parola più lunga della riga: spezza
        let n = w.length - 1;
        while (n > 1 && measure(w.slice(0, n)) > maxWidth) n--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, n)); w = w.slice(n);
      }
      const t = cur ? cur + ' ' + w : w;
      if (cur && measure(t) > maxWidth) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur || words.length === 0) lines.push(cur);
  }
  return lines;
}

export interface LightCand { key: string; x: number; y: number; z: number }
/** Le `n` sorgenti accese più vicine; quelle già scelte sono favorite (isteresi) per evitare sfarfallii di assegnazione. */
export function selectNearestLit(cands: LightCand[], cam: { x: number; y: number; z: number }, prev: readonly string[], n: number, hysteresis = 1.3): string[] {
  const scored = cands.map((c) => {
    let d = Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z);
    if (prev.includes(c.key)) d /= hysteresis;
    return { key: c.key, d };
  });
  scored.sort((a, b) => a.d - b.d || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const chosen = scored.slice(0, n).map((s) => s.key);
  // stabilità: chi era già assegnato mantiene il proprio posto nell'elenco
  const out: string[] = [];
  for (const k of prev) if (chosen.includes(k)) out.push(k);
  for (const k of chosen) if (!out.includes(k)) out.push(k);
  return out;
}

export interface Obb { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; rot: number }
/** Distanza lungo il raggio fino al box orientato (rotazione attorno a y), Infinity se mancato. */
export function rayObb(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Obb, maxT: number): number {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const px = ox - b.cx, pz = oz - b.cz;
  const lx = px * c - pz * s, lz = px * s + pz * c, ly = oy - b.cy;
  const ex = dx * c - dz * s, ez = dx * s + dz * c;
  let t0 = 0, t1 = maxT;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? lx : a === 1 ? ly : lz, d = a === 0 ? ex : a === 1 ? dy : ez, h = a === 0 ? b.hx : a === 1 ? b.hy : b.hz;
    if (Math.abs(d) < 1e-9) { if (o < -h || o > h) return Infinity; continue; }
    let ta = (-h - o) / d, tb = (h - o) / d;
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

const PICKABLE: Partial<Record<ObjectKind, true>> = {
  door: true, switch: true, lamp: true, generator: true, drawer: true, tent: true, panel: true, vehicle: true, police_car: true,
  car_trunk: true, sign: true, bin: true, campfire: true, chair: true, item: true, battery: true, bridge_plate: true, logbox: true, cooler: true,
};
export function isPickableKind(kind: ObjectKind, st: ObjState | undefined): boolean {
  if (!PICKABLE[kind]) return false;
  if (kind === 'lamp') return !!st && st.type === 'lantern';
  return true;
}

export interface LocalBox { ox: number; oy: number; oz: number; hx: number; hy: number; hz: number; prio: number }
const B = (ox: number, oy: number, oz: number, hx: number, hy: number, hz: number, prio = 0): LocalBox => ({ ox, oy, oz, hx, hy, hz, prio });
/** Proxy di selezione nel sistema locale dell'oggetto. `wf` = z locale della faccia del muro per oggetti a parete. */
export function pickProxyLocal(kind: ObjectKind, st: ObjState, wf = 0): LocalBox | null {
  if (!isPickableKind(kind, st)) return null;
  switch (kind) {
    case 'door': return st.state === 'open' ? B(-0.72, 1.02, 0.6, 0.12, 1.03, 0.62) : B(0, 1.02, 0.04, 0.62, 1.03, WALL_T + 0.06);
    case 'switch': return B(0, 0, wf + 0.05, 0.12, 0.15, 0.08, 1);
    case 'lamp': return B(0, 0.17, 0, 0.17, 0.2, 0.17, 1);
    case 'generator': return B(0, 0.4, 0, 0.55, 0.45, 0.4);
    case 'drawer': return st.open ? B(0, 0.07, -0.13, 0.33, 0.1, 0.27, 1) : B(0, 0.07, -0.42, 0.33, 0.1, 0.12, 1);
    case 'tent': return B(0, 0.7, 0, 1.15, 0.75, 1.25);
    case 'panel': return B(0, 0, wf + 0.09, 0.3, 0.36, 0.11, 1);
    case 'vehicle': case 'police_car': return B(0, 0.75, 0, 0.95, 0.78, 2.3);
    case 'car_trunk': return B(0, 0.2, 0.8, 0.78, 0.22, 0.5, 1);
    case 'sign': return st.board ? B(0, 1.4, 0, 0.9, 0.75, 0.14) : B(0, 1.25, 0, 0.55, 0.45, 0.12);
    case 'bin': return st.tipped ? B(0.55, 0.36, 0, 0.62, 0.38, 0.36) : B(0, 0.56, 0, 0.4, 0.58, 0.36);
    case 'campfire': return st.grill ? B(0, 0.6, 0, 0.4, 0.62, 0.35) : B(0, 0.22, 0, 0.62, 0.3, 0.62);
    case 'chair': return B(0, 0.45, 0, 0.33, 0.48, 0.33);
    case 'item': return B(0, 0.07, 0, 0.17, 0.11, 0.17, 2);
    case 'battery': return B(0, 0.04, 0, 0.11, 0.08, 0.11, 2);
    case 'bridge_plate': return B(0, 0, 0.03, 0.21, 0.16, 0.09, 1);
    case 'logbox': return B(0, 1.15, 0, 0.26, 0.24, 0.24);
    case 'cooler': return B(0, 0.22, 0, 0.35, 0.26, 0.25);
    default: return null;
  }
}

export interface PickHit { t: number; prio: number; idx: number }
/**
 * Sceglie il bersaglio tra i colpi non occlusi: il più vicino, salvo che un oggetto più piccolo/contenuto
 * (priorità maggiore) sia colpito entro `slack` metri dietro di esso.
 */
export function choosePick(hits: PickHit[], occluderT: number, slack = 1.3): PickHit | null {
  let best: PickHit | null = null;
  for (const h of hits) if (h.t < occluderT && (!best || h.t < best.t)) best = h;
  if (!best) return null;
  let fine: PickHit | null = null;
  for (const h of hits) {
    if (h.t >= occluderT || h.prio <= best.prio || h.t > best.t + slack) continue;
    if (!fine || h.prio > fine.prio || (h.prio === fine.prio && h.t < fine.t)) fine = h;
  }
  return fine ?? best;
}

/** Spostamento visivo deterministico per la fase «decompose». Scrive in `out` [dx,dy,dz,rx,ry,rz]. */
export function driftOffset(seed: number, idHash: number, t: number, amount: number, out: number[]): void {
  const a = hash01(idHash ^ seed), b = hash01(idHash * 31 + seed + 7), c = hash01(idHash * 131 + seed + 13);
  const ang = a * Math.PI * 2, k = amount * amount * (3 - 2 * amount);
  const wob = Math.sin(t * (0.3 + b * 0.5) + a * 6.28);
  const r = k * (1.2 + 4.5 * b + 0.6 * wob);
  out[0] = Math.sin(ang) * r; out[2] = Math.cos(ang) * r;
  out[1] = k * (0.3 + 3.2 * c + 0.4 * Math.sin(t * 0.7 + c * 9));
  out[3] = k * (b - 0.5) * 1.6 + k * 0.12 * wob;
  out[4] = k * (a - 0.5) * 2.4;
  out[5] = k * (c - 0.5) * 1.6;
}

export const WORLD_ITEM_RADIUS: Record<ItemKind, number> = {
  note: 0.13, photo: 0.1, key: 0.07, radio: 0.11, tool: 0.16, map: 0.16, mug: 0.065, lantern: 0.15, boot: 0.15, tag: 0.06, phone: 0.085, bottle: 0.13,
};
/** Oggetti piatti: in terra giacciono con la faccia frontale verso l'alto. */
export const ITEM_FLAT: Record<ItemKind, boolean> = {
  note: true, photo: true, key: true, radio: false, tool: true, map: true, mug: false, lantern: false, boot: false, tag: true, phone: true, bottle: false,
};

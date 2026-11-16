// Misteri latenti: verità del mondo seminata dal seed. Lasciano indizi fisici parziali e
// conseguenze nel tempo; non vengono mai spiegati al giocatore.
import type { ItemKind, L10n, Mystery, MysteryOrigin, Poi, WorldObjectSpec, WorldSpec } from '../core/contracts';
import { streamFor, type Rng } from '../core/rng';
import { itemTitle } from '../world/layouts';

interface Theme {
  origin: MysteryOrigin;
  theme: string;
  motives: string[];
  items: ItemKind[];
  traces: string[];
  notes: L10n[];
  timeline: string[];
}

const THEMES: Theme[] = [
  { origin: 'human', theme: 'overdue_hiker', motives: ['lost_way', 'injury', 'changed_plan'], items: ['boot', 'map', 'bottle', 'note'], traces: ['boot', 'drag'],
    notes: [
      { it: 'Se trovi questo: ho lasciato il sentiero dopo il secondo bivio. Torno prima che faccia buio.', en: 'If you find this: I left the trail after the second fork. Back before dark.' },
      { it: 'Acqua finita alle 16. Il segnale va e viene.', en: 'Out of water at 4 pm. Signal comes and goes.' },
    ], timeline: ['steps', 'far_light', 'voice_far'] },
  { origin: 'human', theme: 'night_poacher', motives: ['profit', 'old_habit'], items: ['tag', 'tool', 'bottle'], traces: ['drag', 'tire', 'feathers'],
    notes: [{ it: 'Giovedì, dopo la mezzanotte. Niente luci.', en: 'Thursday, after midnight. No lights.' }], timeline: ['far_light', 'steps', 'door_ajar'] },
  { origin: 'human', theme: 'runaway', motives: ['avoid_home', 'argument'], items: ['phone', 'note', 'mug'], traces: ['boot', 'wrapper'],
    notes: [
      { it: 'Non cercatemi stanotte. Sto bene.', en: "Don't look for me tonight. I'm fine." },
      { it: 'Ho dormito qui due notti. Me ne vado prima del turno di guardia.', en: 'Slept here two nights. Leaving before the patrol comes.' },
    ], timeline: ['lamp_flicker', 'door_ajar', 'steps'] },
  { origin: 'natural', theme: 'sick_stag', motives: ['illness'], items: ['tag'], traces: ['tracks_deer', 'scratch', 'feathers'],
    notes: [{ it: 'Cervo adulto visto barcollare vicino all\'acqua. Avvisare la forestale.', en: 'Adult stag seen staggering near the water. Notify the rangers.' }], timeline: ['steps', 'knock'] },
  { origin: 'natural', theme: 'storm_blowdown', motives: ['weather'], items: ['tool', 'lantern'], traces: ['branch', 'scratch'],
    notes: [{ it: 'Linea caduta due volte questa settimana. Il quadro scatta da solo.', en: 'Line down twice this week. The breaker trips on its own.' }], timeline: ['lamp_flicker', 'knock'] },
  { origin: 'unidentified', theme: 'ridge_lights', motives: ['unknown'], items: ['photo', 'note', 'radio'], traces: ['ash', 'tire'],
    notes: [
      { it: 'Terza notte. Sempre alla stessa ora, sempre dallo stesso lato. Non è una torcia.', en: 'Third night. Always the same hour, always the same side. It is not a flashlight.' },
      { it: 'Contate: undici secondi accesa, quattro spenta.', en: 'Count it: eleven seconds on, four off.' },
    ], timeline: ['far_light', 'far_light', 'lamp_flicker'] },
  { origin: 'unidentified', theme: 'night_knocking', motives: ['unknown'], items: ['note', 'mug', 'key'], traces: ['boot', 'scratch'],
    notes: [{ it: 'Bussano ancora. Ho guardato: fuori non c\'era nessuno.', en: 'The knocking again. I looked: nobody was outside.' }], timeline: ['knock', 'knock', 'door_ajar'] },
  { origin: 'anomalous', theme: 'quiet_circle', motives: ['unknown'], items: ['lantern', 'note', 'radio'], traces: ['ash', 'scratch', 'feathers'],
    notes: [
      { it: 'Qui gli uccelli smettono. Ho misurato: quaranta passi, poi ricominciano.', en: 'The birds stop here. I paced it: forty steps, then they start again.' },
      { it: 'La bussola non è d\'accordo con la mappa. Solo in questo punto.', en: 'The compass disagrees with the map. Only at this spot.' },
    ], timeline: ['far_light', 'knock', 'lamp_flicker'] },
  { origin: 'anomalous', theme: 'ending_tracks', motives: ['unknown'], items: ['boot', 'photo', 'note'], traces: ['boot', 'boot', 'drag'],
    notes: [{ it: 'Le impronte arrivano fin qui. Non tornano indietro e non proseguono.', en: 'The footprints come this far. They do not turn back and they do not go on.' }], timeline: ['steps', 'far_light', 'voice_far'] },
];

const ORIGIN_WEIGHT: Record<MysteryOrigin, number> = { human: 0.4, natural: 0.25, unidentified: 0.22, anomalous: 0.13 };
const SKIP_POI = new Set(['bridge', 'lake_dock', 'car_park']);

function insideBuilding(spec: WorldSpec, x: number, z: number, margin: number): boolean {
  for (const b of spec.buildings) {
    const dx = x - b.pos.x, dz = z - b.pos.z, c = Math.cos(b.rotY), s = Math.sin(b.rotY);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < b.w / 2 + margin && Math.abs(lz) < b.d / 2 + margin) return true;
  }
  return false;
}

function freeSpot(spec: WorldSpec, poi: Poi, rng: Rng): { x: number; z: number } | null {
  for (let i = 0; i < 24; i++) {
    const a = rng.range(0, Math.PI * 2), r = poi.radius * rng.range(0.3, 0.62);
    const x = poi.pos.x + Math.sin(a) * r, z = poi.pos.z + Math.cos(a) * r;
    if (insideBuilding(spec, x, z, 1.2)) continue;
    if (spec.objects.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 1.6)) continue;
    return { x, z };
  }
  return null;
}

/** Aggiunge al mondo 1–3 misteri con indizi fisici (oggetti e tracce). Da passare a generateWorld come postProcess.
 *  Gli oggetti aggiunti hanno y = NaN: generateWorld li appoggia al terreno reale. */
export function seedMysteries(spec: WorldSpec): void {
  if (spec.mysteries.length) return;
  const rng = streamFor(spec.seed, 'mysteries');
  const pois = spec.pois.filter((p) => !SKIP_POI.has(p.type));
  if (pois.length < 2) return;
  const count = rng.weighted([1, 2, 3], (n) => (n === 1 ? 0.45 : n === 2 ? 0.4 : 0.15));
  const used = new Set<string>();
  for (let m = 0; m < count; m++) {
    const origin = rng.weighted(Object.keys(ORIGIN_WEIGHT) as MysteryOrigin[], (o) => ORIGIN_WEIGHT[o]);
    const options = THEMES.filter((t) => t.origin === origin && !used.has(t.theme));
    if (!options.length) continue;
    const theme = rng.pick(options);
    used.add(theme.theme);
    const id = `my${m + 1}`;
    const path = rng.shuffle([...pois]).slice(0, Math.min(pois.length, rng.int(2, 4)));
    const mystery: Mystery = { id, origin, theme: theme.theme, motive: rng.pick(theme.motives), originPoiId: path[0].id, clues: [], timeline: [], discovered: [] };
    const notes = rng.shuffle([...theme.notes]);
    path.forEach((poi, order) => {
      const spot = freeSpot(spec, poi, rng);
      if (!spot) return;
      const asItem = order === 0 || rng.chance(0.55);
      const index = mystery.clues.length;
      const base: Pick<WorldObjectSpec, 'poiId' | 'pos' | 'y' | 'rotY'> = { poiId: poi.id, pos: spot, y: Number.NaN, rotY: rng.range(0, Math.PI * 2) };
      let obj: WorldObjectSpec;
      if (asItem) {
        let kind = rng.pick(theme.items);
        if (order === 0 && notes.length) kind = 'note';
        const text = kind === 'note' ? notes.shift() ?? rng.pick(theme.notes) : undefined;
        obj = { ...base, id: `${id}.item${index}`, kind: 'item', state: { taken: false, worn: rng.chance(0.5), wet: rng.chance(0.3) }, item: { kind, text, mysteryId: id, clueIndex: index, title: itemTitle(kind) } };
      } else {
        obj = { ...base, id: `${id}.trace${index}`, kind: 'trace', state: { type: rng.pick(theme.traces), age: rng.range(0, 0.7), mystery: id, clue: index } };
      }
      spec.objects.push(obj);
      mystery.clues.push({ objectId: obj.id, poiId: poi.id, order, kind: asItem ? 'item' : 'trace' });
    });
    let t = rng.range(140, 380);
    for (const type of theme.timeline) {
      if (!rng.chance(0.8)) continue;
      mystery.timeline.push({ t, type, poiId: rng.pick(path).id });
      t += rng.range(160, 520);
    }
    if (mystery.clues.length) spec.mysteries.push(mystery);
  }
}

// Disposizione locale di edifici e oggetti per ciascun tipo di POI.
// Coordinate locali: +z = lato aperto verso il sentiero d'arrivo, edifici verso -z.
import type {
  BridgeSpec, BuildingKind, BuildingSpec, ItemKind, L10n, ObjState, ObjectKind, Poi, WorldObjectSpec, WorldSpec,
} from '../core/contracts';
import type { Rng } from '../core/rng';
import { toWorld } from './model';
import { plate } from './names';

const NOTES: L10n[] = [
  { it: 'Tornati al lago. Lasciate la chiave sotto il secchio.', en: 'Gone back to the lake. Leave the key under the bucket.' },
  { it: 'Ricordati la legna prima che piova.', en: 'Remember the firewood before it rains.' },
  { it: 'Giovedì: controllare il filtro. Olio quasi finito.', en: 'Thursday: check the filter. Oil nearly out.' },
  { it: 'Non dare da mangiare alle volpi. Sul serio.', en: 'Do not feed the foxes. Seriously.' },
  { it: 'Lista: caffè, fiammiferi, nastro, pile.', en: 'List: coffee, matches, tape, batteries.' },
  { it: 'Sentiero nord chiuso dopo il temporale.', en: 'North trail closed after the storm.' },
  { it: 'Chi ha preso la lanterna la riporti.', en: 'Whoever took the lantern, bring it back.' },
  { it: 'Partiamo presto. Non aspettarci.', en: 'We are leaving early. Do not wait for us.' },
  { it: 'Il generatore fa i capricci col freddo. Insistere.', en: 'The generator acts up in the cold. Keep trying.' },
  { it: 'Mirtilli oltre il secondo tornante.', en: 'Blueberries past the second bend.' },
  { it: 'Spegnere tutto prima di andare via.', en: 'Switch everything off before you leave.' },
  { it: 'Ho sentito di nuovo quel rumore verso le tre.', en: 'Heard that noise again around three.' },
];
const PHOTO_CAPTIONS: L10n[] = [
  { it: 'Tre persone davanti a una tenda, sorridenti.', en: 'Three people in front of a tent, smiling.' },
  { it: 'Un cane su un molo, controluce.', en: 'A dog on a dock, backlit.' },
  { it: 'Una baita sotto la neve. Sul retro una data sbiadita.', en: 'A cabin under snow. A faded date on the back.' },
  { it: 'Il lago all’alba. Qualcuno ha cerchiato un punto a penna.', en: 'The lake at dawn. Someone circled a spot in pen.' },
  { it: 'Un bambino con una trota enorme.', en: 'A child holding a huge trout.' },
];
const SIGN_TEXT: Record<string, L10n[]> = {
  trail: [{ it: 'Restare sul sentiero', en: 'Stay on the trail' }, { it: 'Area boschiva: accendere fuochi solo nei bracieri', en: 'Woodland area: fires in fire rings only' }, { it: 'Portate via i vostri rifiuti', en: 'Pack out your trash' }],
  park: [{ it: 'Parcheggio escursionisti — chiusura al tramonto', en: 'Trailhead parking — closes at dusk' }],
  town: [{ it: 'Benvenuti', en: 'Welcome' }],
  gas: [{ it: 'Carburante — Ghiaccio — Esche', en: 'Fuel — Ice — Bait' }],
  bridge: [{ it: 'Ponte pedonale — carico massimo 6 persone', en: 'Footbridge — max load 6 persons' }],
  water: [{ it: 'Acque profonde — vietata la balneazione notturna', en: 'Deep water — no swimming after dark' }],
  tower: [{ it: 'Torre antincendio — accesso riservato', en: 'Fire tower — authorized access only' }],
};
const TENT_CONTENT = ['sleeping_bag', 'empty', 'gear', 'food', 'boots'];
const VEHICLE_DETAIL = ['nothing', 'keys_inside', 'flat_tire', 'fogged_windows', 'hood_warm', 'scratches', 'note'];
const ITEM_KINDS: ItemKind[] = ['note', 'photo', 'key', 'radio', 'tool', 'map', 'mug', 'lantern', 'boot', 'tag', 'bottle'];
const ITEM_TITLE: Record<ItemKind, L10n> = {
  note: { it: 'Biglietto', en: 'Note' }, photo: { it: 'Fotografia', en: 'Photograph' }, key: { it: 'Chiave', en: 'Key' },
  radio: { it: 'Radio portatile', en: 'Portable radio' }, tool: { it: 'Attrezzo', en: 'Tool' }, map: { it: 'Carta dei sentieri', en: 'Trail map' },
  mug: { it: 'Tazza smaltata', en: 'Enamel mug' }, lantern: { it: 'Lanterna', en: 'Lantern' }, boot: { it: 'Scarpone', en: 'Hiking boot' },
  tag: { it: 'Targhetta', en: 'Tag' }, phone: { it: 'Telefono', en: 'Phone' }, bottle: { it: 'Borraccia', en: 'Water bottle' },
};
export function itemTitle(kind: ItemKind): L10n { return ITEM_TITLE[kind]; }

export function layoutPoi(spec: WorldSpec, poi: Poi, rng: Rng, bridge: BridgeSpec | undefined, ground: (x: number, z: number) => number): void {
  const counts = new Map<string, number>();
  const nid = (k: string) => { const n = counts.get(k) ?? 0; counts.set(k, n + 1); return `${poi.id}.${k}${n}`; };
  const W = (lx: number, lz: number) => toWorld(lx, lz, poi.pos.x, poi.pos.z, poi.rotY);

  const add = (kind: ObjectKind, lx: number, lz: number, o: Partial<WorldObjectSpec> & { yOff?: number; lrot?: number; state?: ObjState } = {}): WorldObjectSpec => {
    const pos = o.pos ?? W(lx, lz);
    const obj: WorldObjectSpec = {
      id: nid(kind), kind, poiId: poi.id, pos, y: (o.y ?? ground(pos.x, pos.z)) + (o.yOff ?? 0), rotY: o.rotY ?? poi.rotY + (o.lrot ?? 0),
      state: o.state ?? {},
    };
    if (o.containerId) obj.containerId = o.containerId;
    if (o.buildingId) obj.buildingId = o.buildingId;
    if (o.item) obj.item = o.item;
    if (o.links) obj.links = o.links;
    if (o.interactRadius) obj.interactRadius = o.interactRadius;
    spec.objects.push(obj);
    return obj;
  };

  const genericItem = (r: Rng): WorldObjectSpec['item'] => {
    const kind = r.pick(ITEM_KINDS);
    let text: L10n | undefined;
    if (kind === 'note') text = r.pick(NOTES);
    if (kind === 'photo') text = r.pick(PHOTO_CAPTIONS);
    if (kind === 'tag') { const n = r.int(10, 99); text = { it: `Piazzola ${n}`, en: `Site ${n}` }; }
    return { kind, text, title: ITEM_TITLE[kind] };
  };

  /** Edificio con porta sulla facciata (+z locale dell'edificio). lrot = rotazione locale rispetto al POI. */
  const building = (kind: BuildingKind, lx: number, lz: number, lrot: number, w: number, d: number, h: number, enterable: boolean, doorState: string | null) => {
    const pos = W(lx, lz);
    const rotY = poi.rotY + lrot;
    const b: BuildingSpec = {
      id: nid(kind), poiId: poi.id, kind, pos, rotY, w, d, h, floorY: poi.baseHeight + 0.12, enterable,
      doorOffset: kind === 'cabin' ? rng.range(-w / 2 + 1.3, w / 2 - 1.9) : 0, palette: rng.int(0, 5), litWindows: false,
    };
    spec.buildings.push(b);
    const BW = (blx: number, blz: number) => toWorld(blx, blz, pos.x, pos.z, rotY);
    if (doorState) {
      const door = add('door', 0, 0, { pos: BW(b.doorOffset, d / 2), rotY, y: b.floorY, state: { state: doorState }, buildingId: b.id });
      b.doorId = door.id;
    }
    return { b, BW };
  };

  /** Interruttore esterno accanto alla porta + lampada del portico (+ eventuale luce interna). */
  const porchLight = (b: BuildingSpec, BW: (x: number, z: number) => { x: number; z: number }, on: boolean, interior: boolean) => {
    const lamps: string[] = [];
    lamps.push(add('lamp', 0, 0, { pos: BW(b.doorOffset, b.d / 2 + 0.35), rotY: b.rotY, y: b.floorY + 2.25, state: { on, type: 'porch' }, buildingId: b.id }).id);
    if (interior) lamps.push(add('lamp', 0, 0, { pos: BW(0, 0), rotY: b.rotY, y: b.floorY + b.h - 0.35, state: { on, type: 'ceiling' }, buildingId: b.id }).id);
    add('switch', 0, 0, { pos: BW(b.doorOffset + 0.95, b.d / 2 + 0.12), rotY: b.rotY, y: b.floorY + 1.25, state: { on }, links: lamps, buildingId: b.id });
    b.litWindows = on && interior;
    if (on) poi.lit = true;
    return lamps;
  };

  const sign = (lx: number, lz: number, family: string, extra?: L10n) => {
    const tx = extra ?? rng.pick(SIGN_TEXT[family]);
    add('sign', lx, lz, { lrot: Math.PI + rng.range(-0.3, 0.3), state: { textIt: tx.it, textEn: tx.en, tilt: 0 } });
  };
  const battery = (lx: number, lz: number, p: number, o: Partial<WorldObjectSpec> & { yOff?: number } = {}) => {
    if (rng.chance(p)) add('battery', lx, lz, { ...o, state: { taken: false } });
  };

  switch (poi.type) {
    case 'car_park': {
      const car = add('police_car', 3.4, 0, { lrot: 0, state: { headlights: true, beacon: true } });
      const tp = toWorld(0, -2.55, car.pos.x, car.pos.z, car.rotY);
      const trunk = add('car_trunk', 0, 0, { pos: tp, rotY: car.rotY, yOff: 0.75, state: { open: false } });
      if (rng.chance(0.5)) add('battery', 0, 0, { pos: tp, rotY: car.rotY, yOff: 0.8, containerId: trunk.id, state: { taken: false } });
      sign(-7, 6, 'park');
      add('sign', -8.5, 3, { lrot: Math.PI, state: { textIt: poi.name.it, textEn: poi.name.en, tilt: 0, board: true } });
      const on = rng.chance(0.45);
      add('lamp_post', -8, -6, { state: { on } });
      if (on) poi.lit = true;
      add('bin', -6, 8.5, { state: { tipped: false, content: rng.pick(['litter', 'empty']) } });
      if (rng.chance(0.5)) add('bench', 7.5, 7, { lrot: -0.6 });
      break;
    }
    case 'cabin': {
      const w = rng.range(6.4, 8.2), d = rng.range(5, 6.4);
      const doorState = rng.weighted(['locked', 'closed', 'ajar'], (s) => (s === 'locked' ? 0.42 : s === 'closed' ? 0.4 : 0.18));
      const { b, BW } = building('cabin', 0, -8, 0, w, d, 2.7, true, doorState);
      const on = rng.chance(0.3);
      const lamps = porchLight(b, BW, on, true);
      const tx = -w / 2 + 1.5, tz = -d / 2 + 1.2;
      add('table', 0, 0, { pos: BW(tx, tz), rotY: b.rotY, y: b.floorY, buildingId: b.id });
      const drawer = add('drawer', 0, 0, { pos: BW(tx, tz + 0.7), rotY: b.rotY, y: b.floorY + 0.5, state: { open: false }, buildingId: b.id });
      if (rng.chance(0.55)) add('battery', 0, 0, { pos: BW(tx - 0.2, tz + 0.75), rotY: b.rotY, y: b.floorY + 0.55, containerId: drawer.id, state: { taken: false }, buildingId: b.id });
      if (rng.chance(0.65)) add('item', 0, 0, { pos: BW(tx + 0.3, tz), rotY: b.rotY + rng.range(0, 6.28), y: b.floorY + 0.78, item: genericItem(rng), state: { taken: false }, buildingId: b.id });
      add('chair', 0, 0, { pos: BW(tx + 1.3, tz + 0.2), rotY: b.rotY + rng.range(-1, 1), y: b.floorY, buildingId: b.id });
      add('chair', 0, 0, { pos: BW(b.doorOffset - 1.7, d / 2 + 1.1), rotY: b.rotY + rng.range(2.6, 3.6) });
      add('woodpile', 0, 0, { pos: BW(w / 2 + 0.9, -0.5), rotY: b.rotY + Math.PI / 2 });
      if (rng.chance(0.38)) {
        const running = on || rng.chance(0.3);
        add('generator', 0, 0, { pos: BW(-w / 2 - 1.5, -1), rotY: b.rotY, state: { running, fuel: rng.range(0.15, 1) }, links: lamps });
        for (const id of lamps) spec.objects.find((o) => o.id === id)!.state.power = `${poi.id}.generator0`;
      }
      add('sign', 5.5, 3.5, { lrot: Math.PI, state: { textIt: poi.name.it, textEn: poi.name.en, tilt: 0 } });
      break;
    }
    case 'campsite': {
      const nT = rng.int(1, 3);
      const a0 = rng.range(0, 6.28);
      for (let i = 0; i < nT; i++) {
        const a = a0 + (i * 6.28) / 3 + rng.range(-0.3, 0.3), r = rng.range(7, 10);
        const lx = Math.sin(a) * r, lz = -Math.abs(Math.cos(a) * r) - 2 + (i === 2 ? 14 : 0);
        const tent = add('tent', lx, lz, { rotY: poi.rotY + Math.atan2(-lx, -lz), state: { flap: rng.chance(0.7) ? 'closed' : 'open', color: rng.int(0, 5), content: rng.pick(TENT_CONTENT), occupied: false } });
        if (rng.chance(0.3)) add('item', 0, 0, { pos: tent.pos, yOff: 0.08, rotY: rng.range(0, 6.28), containerId: tent.id, item: genericItem(rng), state: { taken: false } });
      }
      add('campfire', 3, 3.5, { state: { state: rng.weighted(['cold', 'embers', 'burning'], (s) => (s === 'cold' ? 0.55 : s === 'embers' ? 0.3 : 0.15)) } });
      add('chair', 4.6, 2.4, { lrot: -2.2 + rng.range(-0.4, 0.4) });
      if (rng.chance(0.6)) add('chair', 1.6, 5, { lrot: 2.8 + rng.range(-0.4, 0.4) });
      add('cooler', 5.5, 5.5, { lrot: rng.range(0, 3), state: { open: false } });
      battery(5.9, 5.0, 0.32, { yOff: 0.02 });
      const on = rng.chance(0.3);
      add('lamp', -3, 4, { yOff: 0.0, state: { on, type: 'lantern', portable: true } });
      if (on) poi.lit = true;
      add('bin', -8, 9, { state: { tipped: false, content: rng.pick(['litter', 'food', 'empty']) } });
      sign(-6, 12, 'trail', { it: poi.name.it, en: poi.name.en });
      break;
    }
    case 'picnic': {
      const nT = rng.int(2, 3);
      const spots = [[-6, -4], [6, -5], [-5, 6]];
      for (let i = 0; i < nT; i++) {
        const t = add('table', spots[i][0], spots[i][1], { lrot: rng.range(-0.5, 0.5), state: { picnic: true } });
        if (i === 0 && rng.chance(0.6)) add('item', 0, 0, { pos: t.pos, yOff: 0.78, rotY: rng.range(0, 6.28), item: genericItem(rng), state: { taken: false } });
      }
      add('bin', 8, 4, { state: { tipped: rng.chance(0.2), content: rng.pick(['litter', 'food', 'empty']) } });
      if (rng.chance(0.5)) add('bin', -9, -1, { state: { tipped: false, content: 'litter' } });
      sign(4, 9, 'trail', rng.chance(0.5) ? { it: poi.name.it, en: poi.name.en } : undefined);
      if (rng.chance(0.4)) add('campfire', 1.5, -8, { state: { state: rng.pick(['cold', 'cold', 'embers']), grill: true } });
      break;
    }
    case 'utility': {
      const { b, BW } = building('shed', 0, -6, 0, 3.4, 3, 2.5, false, rng.chance(0.85) ? 'locked' : 'closed');
      const lampOn = rng.chance(0.55);
      const lp = add('lamp_post', -5, 2, { state: { on: lampOn } });
      if (lampOn) poi.lit = true;
      const running = rng.chance(0.55);
      add('generator', 4, -4, { lrot: 0.4, state: { running, fuel: rng.range(0.2, 1) }, links: [lp.id] });
      lp.state.power = `${poi.id}.generator0`;
      add('panel', 0, 0, { pos: BW(-1.0, b.d / 2 + 0.08), rotY: b.rotY, y: b.floorY + 1.3, state: { open: false, breaker: rng.chance(0.35) ? 'tripped' : 'ok' }, links: [lp.id], buildingId: b.id });
      lp.state.breaker = `${poi.id}.panel0`;
      if (rng.chance(0.45)) add('logbox', 5.5, 4, { state: { signed: false, entries: rng.int(2, 30) } });
      battery(1.2, -4.2, 0.22, { yOff: 0.05 });
      add('sign', 3, 6, { lrot: Math.PI, state: { textIt: poi.name.it, textEn: poi.name.en, tilt: 0 } });
      break;
    }
    case 'lookout': {
      building('tower', 0, -6, 0, 3.6, 3.6, 13, false, null);
      add('logbox', 3.2, -3, { state: { signed: false, entries: rng.int(5, 60) } });
      sign(-4, 2.5, 'tower');
      add('bench', 4, 4, { lrot: -2.4 });
      if (rng.chance(0.4)) add('item', 4, 4, { yOff: 0.5, rotY: rng.range(0, 6.28), item: genericItem(rng), state: { taken: false } });
      break;
    }
    case 'restroom': {
      const { b, BW } = building('restroom', 0, -5, 0, 4.4, 3.2, 2.6, false, rng.chance(0.5) ? 'locked' : 'closed');
      porchLight(b, BW, rng.chance(0.5), false);
      add('bin', 3.6, -2, { state: { tipped: false, content: 'litter' } });
      if (rng.chance(0.28)) add('battery', 0, 0, { pos: BW(-1.4, b.d / 2 + 0.2), y: b.floorY + 1.05, rotY: b.rotY, state: { taken: false } });
      break;
    }
    case 'roadside': {
      add('vehicle', 3.2, -1, { lrot: rng.range(-0.25, 0.25) + Math.PI / 2, state: vehicleState(rng) });
      add('trace', 3.2, 3.5, { state: { type: 'tire', age: rng.range(0, 1) } });
      battery(1.6, -1.2, 0.2, { yOff: 0.02 });
      if (rng.chance(0.4)) add('item', 0.8, -3, { yOff: 0.03, rotY: rng.range(0, 6.28), item: genericItem(rng), state: { taken: false } });
      break;
    }
    case 'clearing': {
      if (rng.chance(0.5)) add('bench', 5, -3, { lrot: rng.range(0, 6.28) });
      if (rng.chance(0.55)) add('logbox', -4, -4, { state: { signed: false, entries: rng.int(1, 40) } });
      if (rng.chance(0.35)) add('campfire', 3, 5, { state: { state: rng.pick(['cold', 'cold', 'embers']) } });
      if (rng.chance(0.4)) sign(-5, 5, 'trail');
      add('trace', rng.range(-8, 8), rng.range(-8, 8), { state: { type: rng.pick(['tracks_deer', 'boot', 'feathers']), age: rng.range(0, 1) } });
      break;
    }
    case 'lake_dock': {
      add('bench', -4.5, -1, { lrot: 0 });
      const on = rng.chance(0.4);
      add('lamp_post', 3.2, 2.5, { state: { on } });
      if (on) poi.lit = true;
      sign(-3, 4, 'water');
      if (rng.chance(0.5)) add('logbox', 4.5, -2, { state: { signed: false, entries: rng.int(3, 50) } });
      if (rng.chance(0.45)) add('item', 0.4, 21.5, { y: poi.baseHeight + 0.35, yOff: 0.03, rotY: rng.range(0, 6.28), item: genericItem(rng), state: { taken: false } });
      add('chair', -0.5, 19, { y: poi.baseHeight + 0.35, lrot: rng.range(-0.5, 0.5) + Math.PI });
      break;
    }
    case 'town': {
      const n = rng.int(4, 7);
      let k = 0;
      for (let i = 0; i < n; i++) {
        const sideZ = i % 2 === 0 ? -1 : 1;
        const lx = -48 + (i >> 1) * 27 + (sideZ > 0 ? 13 : 0) + rng.range(-2, 2);
        const w = rng.range(7, 9.5), d = rng.range(6, 8);
        const { b, BW } = building('house', lx, sideZ * (11 + d / 2 + rng.range(0, 3)), sideZ > 0 ? Math.PI : 0, w, d, 3.1, false, rng.chance(0.9) ? 'locked' : 'closed');
        const on = rng.chance(0.4);
        porchLight(b, BW, on, false);
        b.litWindows = rng.chance(0.35);
        if (b.litWindows) poi.lit = true;
        if (rng.chance(0.3)) add('chair', 0, 0, { pos: BW(-1.8, d / 2 + 1), rotY: b.rotY + Math.PI + rng.range(-0.5, 0.5) });
        if (rng.chance(0.25)) add('generator', 0, 0, { pos: BW(w / 2 + 1.2, 0), rotY: b.rotY, state: { running: false, fuel: rng.range(0.2, 1) }, links: [] });
        k++;
      }
      for (const lx of [-40, 0, 40]) { const on = rng.chance(0.75); add('lamp_post', lx + rng.range(-3, 3), 4.6, { state: { on } }); if (on) poi.lit = true; }
      add('vehicle', rng.range(-30, 30), -5.2, { lrot: Math.PI / 2, state: vehicleState(rng) });
      if (rng.chance(0.5)) add('vehicle', rng.range(-30, 30), 5.4, { lrot: -Math.PI / 2, state: vehicleState(rng) });
      add('sign', -56, 4.5, { lrot: Math.PI / 2, state: { textIt: `Benvenuti a ${poi.name.it}`, textEn: `Welcome to ${poi.name.en}`, tilt: 0, board: true } });
      add('bench', 12, 5.2, { lrot: Math.PI });
      add('bin', 15, 5.4, { state: { tipped: false, content: 'litter' } });
      add('bin', -22, -5.6, { state: { tipped: false, content: rng.pick(['litter', 'food']) } });
      if (k > 4 && rng.chance(0.5)) add('logbox', 52, 5, { state: { signed: false, entries: rng.int(2, 20) } });
      break;
    }
    case 'gas_station': {
      building('canopy', 0, 7, 0, 8.5, 5, 4.2, false, null);
      add('pump', -1.6, 7, { state: {} });
      add('pump', 1.6, 7, { state: {} });
      const { b, BW } = building('kiosk', 0, -7, 0, 6.5, 4.2, 2.9, false, rng.chance(0.7) ? 'locked' : 'closed');
      const on = rng.chance(0.65);
      porchLight(b, BW, on, false);
      b.litWindows = on && rng.chance(0.5);
      const cl = add('lamp', 0, 7, { yOff: 4.0, state: { on, type: 'canopy' } });
      spec.objects.find((o) => o.kind === 'switch' && o.poiId === poi.id)!.links!.push(cl.id);
      sign(10, 9, 'gas');
      add('bin', 4.2, -4, { state: { tipped: false, content: 'litter' } });
      // fermo accanto alla colonnina, fra la pensilina e il chiosco (mai sulle colonne)
      if (rng.chance(0.5)) add('vehicle', -0.8, 4.75, { lrot: Math.PI / 2, state: vehicleState(rng) });
      if (rng.chance(0.62)) add('battery', 0, 0, { pos: BW(-2.2, b.d / 2 + 0.25), y: b.floorY + 0.95, rotY: b.rotY, state: { taken: false } });
      add('panel', 0, 0, { pos: BW(2.4, b.d / 2 + 0.08), rotY: b.rotY, y: b.floorY + 1.3, state: { open: false, breaker: rng.chance(0.25) ? 'tripped' : 'ok' }, links: [cl.id], buildingId: b.id });
      cl.state.breaker = `${poi.id}.panel0`;
      break;
    }
    case 'bridge': {
      if (!bridge) break;
      const dx = bridge.b.x - bridge.a.x, dz = bridge.b.z - bridge.a.z;
      const l = Math.hypot(dx, dz);
      const ux = dx / l, uz = dz / l;
      const side = { x: -uz, z: ux };
      const pp = { x: bridge.a.x + ux * 1.2 + side.x * (bridge.width / 2), z: bridge.a.z + uz * 1.2 + side.z * (bridge.width / 2) };
      add('bridge_plate', 0, 0, { pos: pp, y: bridge.deckY, yOff: 0.95, rotY: Math.atan2(-side.x, -side.z), state: { state: rng.weighted(['intact', 'damaged', 'loose'], (s) => (s === 'intact' ? 0.6 : 0.2)), year: rng.int(1987, 2019) } });
      const sp = { x: bridge.a.x - ux * 2.5 + side.x * 2.2, z: bridge.a.z - uz * 2.5 + side.z * 2.2 };
      const tx = rng.pick(SIGN_TEXT.bridge);
      add('sign', 0, 0, { pos: sp, rotY: Math.atan2(-ux, -uz), state: { textIt: tx.it, textEn: tx.en, tilt: 0 } });
      break;
    }
  }
}

function vehicleState(rng: Rng): ObjState {
  const detail = rng.pick(VEHICLE_DETAIL);
  return {
    color: rng.int(0, 5), plate: plate(rng), body: rng.pick(['sedan', 'pickup', 'wagon']), detail,
    hood: detail === 'hood_warm' ? 'warm' : 'cold', windows: detail === 'fogged_windows' ? 'fogged' : 'clear', lights: false, present: true,
  };
}

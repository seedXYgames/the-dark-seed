import type { L10n, PoiType } from '../core/contracts';
import type { Rng } from '../core/rng';

export const FIRST_NAMES = [
  'Dale', 'Harper', 'Wes', 'Nora', 'Calvin', 'June', 'Marcus', 'Ellen', 'Roy', 'Tessa', 'Glenn', 'Ruth', 'Amos',
  'Claire', 'Hank', 'Maeve', 'Owen', 'Lena', 'Frank', 'Dana', 'Silas', 'Irene', 'Walt', 'Paige', 'Abel', 'Joan',
  'Curtis', 'Vera', 'Miles', 'Greta', 'Russ', 'Hazel', 'Emmett', 'Lorna', 'Boyd', 'Wren', 'Clyde', 'Opal', 'Dean', 'Faye',
];
export const LAST_NAMES = [
  'Hollis', 'Marlowe', 'Briggs', 'Tanner', 'Whitlock', 'Ames', 'Calloway', 'Draper', 'Ferris', 'Garrity', 'Hale',
  'Ingram', 'Kessler', 'Lowry', 'Mercer', 'Nash', 'Oakes', 'Pruitt', 'Quimby', 'Rourke', 'Sayer', 'Thorne', 'Underhill',
  'Vance', 'Wexler', 'Yates', 'Abbott', 'Barlow', 'Crane', 'Dunmore', 'Eastman', 'Fenwick', 'Grady', 'Hobbs', 'Jessup',
  'Kirby', 'Lund', 'Maddox', 'Norwood', 'Pike', 'Renner', 'Stroud', 'Talbot', 'Voss', 'Weller', 'Ashby', 'Bower', 'Cobb',
];

/** Coppie (it, en) per comporre toponimi. */
const WORDS: [string, string][] = [
  ['del Corvo', 'Raven'], ['del Lupo', 'Wolf'], ["dell'Abete", 'Fir'], ['del Larice', 'Larch'], ["dell'Alce", 'Elk'],
  ['della Volpe', 'Fox'], ['del Gufo', 'Owl'], ['della Lince', 'Lynx'], ['del Cervo', 'Stag'], ['della Felce', 'Fern'],
  ['del Muschio', 'Moss'], ['della Cenere', 'Ash'], ['del Tasso', 'Badger'], ['della Nebbia', 'Mist'], ['del Granito', 'Granite'],
  ['della Brina', 'Frost'], ['del Cedro', 'Cedar'], ['del Falco', 'Hawk'], ['della Lontra', 'Otter'], ['del Sasso', 'Stone'],
  ['della Quercia', 'Oak'], ['del Tuono', 'Thunder'], ['della Trota', 'Trout'], ['del Ginepro', 'Juniper'], ['della Resina', 'Pitch'],
  ['del Salice', 'Willow'], ['della Scure', 'Hatchet'], ['del Picchio', 'Woodpecker'], ['della Luna', 'Moon'], ['del Ferro', 'Iron'],
];

const TYPE_NOUN: Record<PoiType, [string, string][]> = {
  car_park: [['Parcheggio', 'Parking'], ['Piazzola', 'Pullout']],
  cabin: [['Baita', 'Cabin'], ['Capanno', 'Lodge'], ['Rifugio', 'Hut']],
  campsite: [['Campeggio', 'Camp'], ['Area tende', 'Campground']],
  picnic: [['Area picnic', 'Picnic Area'], ['Area di sosta', 'Rest Area']],
  town: [['Borgo', 'Hollow'], ['Abitato', 'Crossing']],
  gas_station: [['Distributore', 'Gas Station'], ['Stazione di servizio', 'Filling Station']],
  bridge: [['Ponte', 'Bridge'], ['Passerella', 'Footbridge']],
  lake_dock: [['Molo', 'Dock'], ['Pontile', 'Landing']],
  lookout: [['Torretta', 'Lookout'], ['Vedetta', 'Fire Tower']],
  utility: [['Cabina elettrica', 'Utility Shed'], ['Stazione tecnica', 'Service Station']],
  restroom: [['Servizi', 'Restrooms'], ['Blocco servizi', 'Comfort Station']],
  roadside: [['Slargo', 'Turnout'], ['Piazzola', 'Lay-by']],
  clearing: [['Radura', 'Clearing'], ['Prato', 'Meadow']],
  sawmill: [['Segheria', 'Sawmill'], ['Vecchia segheria', 'Old Mill']],
  weather_station: [['Stazione meteo', 'Weather Station'], ['Capannina meteo', 'Weather Post']],
};

export function poiName(type: PoiType, rng: Rng, used: Set<string>): L10n {
  for (let i = 0; i < 40; i++) {
    const n = rng.pick(TYPE_NOUN[type]);
    const w = rng.pick(WORDS);
    const it = `${n[0]} ${w[0]}`;
    if (used.has(it)) continue;
    used.add(it);
    return { it, en: `${w[1]} ${n[1]}` };
  }
  const k = used.size + 1;
  const n = TYPE_NOUN[type][0];
  used.add(`${n[0]} ${k}`);
  return { it: `${n[0]} ${k}`, en: `${n[1]} ${k}` };
}

/** Il protagonista è un uomo: nomi maschili per l'agente (anche la voce del narratore è maschile). */
export const OFFICER_FIRST_NAMES = ['Dale', 'Wes', 'Calvin', 'Marcus', 'Roy', 'Glenn', 'Amos', 'Hank', 'Owen', 'Frank', 'Silas', 'Walt', 'Abel', 'Curtis', 'Miles', 'Russ', 'Emmett', 'Boyd', 'Clyde', 'Dean'];

export function officerName(rng: Rng): { first: string; last: string } {
  return { first: rng.pick(OFFICER_FIRST_NAMES), last: rng.pick(LAST_NAMES) };
}

export function personName(rng: Rng): { first: string; last: string } {
  return { first: rng.pick(FIRST_NAMES), last: rng.pick(LAST_NAMES) };
}

export function plate(rng: Rng): string {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 3; i++) s += L[rng.int(0, L.length - 1)];
  return `${s}-${rng.int(100, 999)}`;
}

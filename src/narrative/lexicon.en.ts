// English lexicon and grammar of the NarrativeComposer.
import type { ItemKind, MissionType, Personality, ReasonId } from '../core/contracts';
import type { CommentTrigger, SpontaneousKind } from '../core/api';
import {
  type AnimalKey, type BriefItem, type BriefPos, type Chooser, type CleanFacts, type ColorKey, type CommentFacts,
  type CommentTable, type DetailKey, type Dir, type EnNoun, type GenMode, type ItemFacts, type LangPack,
  type NpcFacts, type Percept, type SlotResolver, type SoundKey, type SpontFacts, type StateKey, type SubjectKey,
  type Target, type WeatherKey,
  asSubject, enIndef, joinList, pickFill, roundDist,
} from './grammar';

const n = (s: string, p: string, pluralOnly = false): EnNoun => ({ s, p, pluralOnly });

export const EN_NOUNS: Record<SubjectKey, EnNoun> = {
  door: n('door', 'doors'),
  switch: n('switch', 'switches'),
  lamp: n('lamp', 'lamps'),
  generator: n('generator', 'generators'),
  drawer: n('drawer', 'drawers'),
  tent: n('tent', 'tents'),
  panel: n('electrical panel', 'electrical panels'),
  vehicle: n('vehicle', 'vehicles'),
  sign: n('sign', 'signs'),
  bin: n('bin', 'bins'),
  table: n('table', 'tables'),
  campfire: n('fire ring', 'fire rings'),
  chair: n('chair', 'chairs'),
  item: n('object', 'objects'),
  battery: n('battery', 'batteries'),
  police_car: n('patrol car', 'patrol cars'),
  car_trunk: n('car boot', 'car boots'),
  bridge_plate: n('inspection plate', 'inspection plates'),
  logbox: n('log box', 'log boxes'),
  pump: n('pump', 'pumps'),
  trace: n('mark on the ground', 'marks on the ground'),
  cooler: n('cooler', 'coolers'),
  woodpile: n('woodpile', 'woodpiles'),
  bench: n('bench', 'benches'),
  fence: n('fence', 'fences'),
  lamp_post: n('lamp post', 'lamp posts'),
  lights: n('light', 'lights', true),
  person: n('person', 'people'),
  animal: n('animal', 'animals'),
  figure: n('figure', 'figures'),
  light: n('light', 'lights'),
  movement: n('movement', 'movements'),
  sound: n('noise', 'noises'),
  silence: n('silence', 'silences'),
};

export const EN_ITEMS: Record<ItemKind, EnNoun> = {
  note: n('note', 'notes'),
  photo: n('photograph', 'photographs'),
  key: n('key', 'keys'),
  radio: n('radio', 'radios'),
  tool: n('tool', 'tools'),
  map: n('map', 'maps'),
  mug: n('mug', 'mugs'),
  lantern: n('lantern', 'lanterns'),
  boot: n('boot', 'boots'),
  tag: n('tag', 'tags'),
  phone: n('phone', 'phones'),
  bottle: n('bottle', 'bottles'),
};

export const EN_ANIMALS: Record<AnimalKey, EnNoun> = {
  deer: n('deer', 'deer'),
  fox: n('fox', 'foxes'),
  raccoon: n('raccoon', 'raccoons'),
  owl: n('owl', 'owls'),
  crows: n('crow', 'crows', true),
};

const LOW_NOUNS: Partial<Record<SubjectKey, EnNoun>> = {
  figure: n('unidentified shape', 'unidentified shapes'),
  light: n('unidentified glow', 'unidentified glows'),
  movement: n('indistinct movement', 'indistinct movements'),
};

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function num(v: number): string {
  return v >= 0 && v <= 10 ? NUM[v] : String(v);
}

function defNP(noun: EnNoun, plural = false): string {
  return `the ${plural || noun.pluralOnly ? noun.p : noun.s}`;
}
function indefNP(noun: EnNoun): string {
  return noun.pluralOnly ? `some ${noun.p}` : enIndef(noun.s);
}

const STATE: Record<StateKey, string> = {
  locked: 'locked', unlocked: 'unlocked', ajar: 'ajar', open: 'open', closed: 'closed', on: 'switched on',
  off: 'switched off', running: 'running', stopped: 'not running', empty: 'empty', occupied: 'occupied',
  tipped: 'tipped over', upright: 'upright', warm: 'warm', cold: 'cold', burning: 'burning', out: 'out',
  tripped: 'tripped', ok: 'in order', damaged: 'damaged', intact: 'intact', signed: 'signed',
};

const DETAIL_WITH: Record<DetailKey, string> = {
  sleeping_bag: 'with a sleeping bag inside',
  food: 'with leftover food',
  boots: 'with a pair of boots',
  nothing: 'with nothing of note',
  keys_inside: 'with the keys inside',
  flat_tire: 'with a flat tyre',
  hood_warm: 'with the bonnet still warm',
  fogged_windows: 'with fogged windows',
  scratches: 'with scratch marks',
  wet: 'with a wet surface',
  ash: 'with ash',
  litter: 'with litter scattered around',
  note: 'with a note',
};

const SOUND: Record<SoundKey, string> = {
  steps_far: 'footsteps in the distance',
  voice_far: 'a distant voice',
  metal_clank: 'a metallic clank',
  owl: 'an owl calling',
  fox: 'the cry of a fox',
  deer: 'the call of a deer',
  crows: 'crows cawing',
  knock: 'a knocking sound',
  twig: 'a twig snapping',
  vehicle_pass: 'a vehicle passing',
  hum_anom: 'a low, steady hum',
  whisper_anom: 'an indistinct whisper',
  tone_anom: 'a sustained high tone',
  door_bang: 'a door banging',
  branch_fall: 'a branch falling',
  rustle: 'a rustling sound',
  splash: 'a splash',
  thunder: 'a roll of thunder',
  chair_scrape: 'a chair scraping',
  car_door: 'a car door',
  vehicle_start: 'an engine starting',
  frog: 'a frog croaking',
};

const COLOR: Record<ColorKey, string> = {
  red: 'red', white: 'white', blue: 'blue', green: 'green', yellow: 'yellow', orange: 'orange', dark: 'dark',
  grey: 'grey', black: 'black', pale: 'pale', amber: 'amber',
};

const DIR: Record<Dir, string> = {
  n: 'north', ne: 'north-east', e: 'east', se: 'south-east', s: 'south', sw: 'south-west', w: 'west', nw: 'north-west',
};

const WX_PHRASE: Record<WeatherKey, string> = {
  rain: 'in the rain', snow: 'in falling snow', fog: 'in fog', wind: 'in a strong wind', clear: 'under a clear sky',
};
const WX_CLAUSE: Record<WeatherKey, string> = {
  rain: "it's raining", snow: "it's snowing", fog: "fog's coming in", wind: "the wind's picking up", clear: "the sky's clearing",
};
const WX_FORECAST: Record<WeatherKey, string> = {
  rain: 'rain moving in', snow: 'snow on the way', fog: 'fog thickening', wind: 'wind picking up', clear: 'skies clearing',
};

function dirPhrase(c: Chooser, dir: Dir | undefined, dist: number | undefined): string {
  if (dir === undefined) return '';
  const d = DIR[dir];
  if (dist === undefined) return c.pick([`${d} of the car`, `to the ${d} of the car`]);
  const m = roundDist(dist);
  return c.pick([`${d} of the car, about ${m} m`, `about ${m} m ${d} of the car`, `roughly ${m} m to the ${d} of the car`]);
}

// ---------------------------------------------------------------- missions

const REASON: Record<ReasonId, string[]> = {
  caller_worried: ['A worried caller rang the station', 'Someone rang in, rather anxious'],
  routine: ['Routine check', 'Standard round, nothing urgent'],
  hiker_report: ['A hiker reported it', 'This one comes from a hiker'],
  owner_request: ['The owner asked us to check', 'Request from the owner'],
  noise_complaint: ['We had a noise complaint', 'Someone complained about noise'],
  lights_seen: ['Somebody saw lights out there', 'Lights were reported'],
  smoke_seen: ['Somebody reported smoke', 'Smoke was reported'],
  power_fault: ["There's a power fault showing on the line", 'The grid shows a fault'],
  ranger_request: ['The rangers asked for this one', 'Request from the rangers'],
  overdue_party: ["A party hasn't come back on time", 'A group is overdue'],
  storm_damage: ['There may be damage from the last storm', 'Possible storm damage'],
  abandoned: ['Reported as left unattended for days', 'Apparently left unattended for some time'],
};

interface Thing { bare: string; clause: string }
const THING: Record<MissionType, Thing> = {
  check_tent: { bare: 'a tent that looks abandoned', clause: "there's a tent that looks abandoned" },
  check_cabin: { bare: 'a cabin that needs checking', clause: "there's a cabin that needs checking" },
  lights_off: { bare: 'lights left on', clause: 'there are lights left on' },
  generator: { bare: 'a generator that needs checking', clause: "there's a generator that needs checking" },
  picnic_check: { bare: 'a picnic area to look over', clause: "there's a picnic area to look over" },
  vehicle_check: { bare: 'a stopped car', clause: "there's a stopped car" },
  bridge_check: { bare: 'a bridge that needs a look', clause: "there's a bridge that needs a look" },
  panel_check: { bare: 'an electrical panel to check', clause: "there's an electrical panel to check" },
  smoke_report: { bare: 'reports of smoke or lights', clause: 'there are reports of smoke or lights' },
  surveil: { bare: 'a structure to keep an eye on', clause: "there's a structure to keep an eye on" },
};
const GEN_THING: Record<GenMode, Thing> = {
  stop: { bare: 'a generator left running', clause: "there's a generator left running" },
  start: { bare: 'a generator that has stopped', clause: "there's a generator that has stopped" },
  any: THING.generator,
};

const INSTR: Record<MissionType, string[]> = {
  check_tent: ['Open the flap and look inside', "Open the tent and check what's in there", 'Pull back the flap and have a look inside'],
  check_cabin: ['Try the door', 'See whether the door is locked: try the handle', 'Go up to the door and try it'],
  lights_off: ['Find the switch and turn them off', 'Turn the lights off at the switch', 'Look for the switch and shut everything off'],
  generator: ['Check it and shut it down or restart it, depending on how you find it', "If it's stopped, restart it; if it's running, shut it down"],
  picnic_check: ['Check the bins and the table', 'Have a look at the bins and tables', 'Make sure the bins and table are in order'],
  vehicle_check: ['Inspect it', 'Take a close look at it', 'Check the vehicle over'],
  bridge_check: ['Check the inspection plate', 'Check the inspection plate and the railing', 'Have a look at the plate and the railing'],
  panel_check: ['Open it and check the main breaker; if it has tripped, reset it', 'Open the panel and check the breaker', 'Open it, check it and reset the breaker if needed'],
  smoke_report: ['Check the fire ring', 'Go and look at the fire ring', 'Check the campfire spot'],
  surveil: ['Sign the log in the log box and document what you see', 'Sign the log and document the situation', 'Put your signature in the log box and document the place'],
};
const GEN_INSTR: Record<GenMode, string[]> = {
  stop: ['Check it and shut it down', 'Have a look, then switch it off'],
  start: ['Check it and restart it', 'Have a look and get it running again'],
  any: INSTR.generator,
};

const LEAD: Record<BriefPos, string[]> = {
  only: [''],
  first: ['', 'To start,', 'First up,'],
  mid: ['Then', 'Also,', 'After that,'],
  last: ['Lastly,', 'Finally,', 'Last one,'],
};

const TITLE: Record<MissionType, string> = {
  check_tent: 'Abandoned tent', check_cabin: 'Cabin check', lights_off: 'Lights left on', generator: 'Generator',
  picnic_check: 'Picnic area', vehicle_check: 'Stopped vehicle', bridge_check: 'Bridge check',
  panel_check: 'Electrical panel', smoke_report: 'Smoke report', surveil: 'Surveillance',
};

const PURPOSE: Record<MissionType, { verb: string; noun: string }> = {
  check_tent: { verb: 'check a tent reported as abandoned', noun: 'check of a tent reported as abandoned' },
  check_cabin: { verb: 'check a cabin door', noun: 'check of a cabin door' },
  lights_off: { verb: 'check on lights left on', noun: 'check on lights left on' },
  generator: { verb: 'check a generator', noun: 'generator check' },
  picnic_check: { verb: 'check the picnic area', noun: 'picnic area check' },
  vehicle_check: { verb: 'inspect a stopped vehicle', noun: 'inspection of a stopped vehicle' },
  bridge_check: { verb: 'check the bridge', noun: 'bridge check' },
  panel_check: { verb: 'check an electrical panel', noun: 'check of an electrical panel' },
  smoke_report: { verb: 'follow up a report of smoke or lights', noun: 'follow-up on a report of smoke or lights' },
  surveil: { verb: 'keep watch on a structure', noun: 'surveillance of a structure' },
};

const ACTION: Record<MissionType, string[]> = {
  check_tent: ['I opened the tent flap and looked inside', 'I opened the flap and checked the interior of the tent', 'I drew back the flap and inspected the inside of the tent'],
  check_cabin: ['I tried the door', 'I tried the cabin door', 'I tested the door by trying the handle'],
  lights_off: ['I operated the switch', 'I located the light switch and operated it', 'I used the switch for the lights'],
  generator: ['I checked the generator', 'I carried out the generator check'],
  picnic_check: ['I checked the area, including the bins and tables', 'I inspected the picnic area', 'I walked the area and checked the bins and tables'],
  vehicle_check: ['I inspected the vehicle', 'I examined the vehicle on site', 'I carried out an inspection of the vehicle'],
  bridge_check: ['I checked the inspection plate on the bridge', 'I checked the inspection plate and the railing', "I examined the bridge's inspection plate"],
  panel_check: ['I opened the electrical panel and checked it', 'I opened the panel and checked the main breaker'],
  smoke_report: ['I checked the fire ring', 'I examined the fire ring', 'I inspected the campfire spot'],
  surveil: ['I signed the log in the log box', 'I signed the surveillance log', 'I signed the log and noted the condition of the structure'],
};
const GEN_ACTION: Record<GenMode, string[]> = {
  stop: ['I checked the generator and shut it down', 'I inspected the generator and stopped the engine'],
  start: ['I checked the generator and restarted it', 'I inspected the generator and got it running again'],
  any: ACTION.generator,
};

// ---------------------------------------------------------------- perception phrases

function seenNP(p: Percept): string {
  const f = p.facts;
  const subj = asSubject(p.subject);
  const low = p.conf < 0.4;
  let noun: EnNoun | undefined;
  let prefix = '';
  if (f.animal) noun = EN_ANIMALS[f.animal];
  else if (subj === 'item' && f.item) noun = EN_ITEMS[f.item];
  else if (subj) noun = EN_NOUNS[subj];
  if (!noun) return 'something unidentified' + (f.direction ? ` to the ${DIR[f.direction]}` : '');
  let hedge: 'none' | 'mid' | 'low' = p.conf >= 0.75 ? 'none' : low ? 'low' : 'mid';
  if (low) {
    if (!f.animal && subj && LOW_NOUNS[subj]) {
      noun = LOW_NOUNS[subj] as EnNoun;
      hedge = 'none';
    } else if (f.animal || subj === 'person' || subj === 'animal') {
      prefix = 'an unidentified shape, possibly ';
      hedge = 'none';
    }
  }
  const many = (f.count ?? 1) >= 2;
  const pl = many || !!noun.pluralOnly;
  const adj = f.color ? `${COLOR[f.color]} ` : '';
  let np = many ? `${num(f.count as number)} ${adj}${noun.p}` : pl ? `some ${adj}${noun.p}` : enIndef(`${adj}${noun.s}`);
  if (f.state) np += ` that ${pl ? 'were' : 'was'} ${STATE[f.state]}`;
  if (f.detail) np += ` ${DETAIL_WITH[f.detail]}`;
  if (f.plate) np += `, plate ${f.plate}`;
  if (f.moved) np += ', in a different position from before';
  if (f.direction) np += ` to the ${DIR[f.direction]}`;
  if (f.weather) np += ` ${WX_PHRASE[f.weather]}`;
  if (hedge === 'mid') return `what appeared to be ${np}`;
  if (hedge === 'low') return `possibly ${np}`;
  return prefix + np;
}

function heardNP(p: Percept): { t: string; silence: boolean } {
  const f = p.facts;
  const subj = asSubject(p.subject);
  if (!f.sound && subj === 'silence') return { t: 'an unusual silence', silence: true };
  let t: string;
  if (f.sound) t = SOUND[f.sound];
  else if (subj && subj !== 'sound' && subj !== 'person' && subj !== 'animal' && subj !== 'figure' && subj !== 'light' && subj !== 'movement') {
    t = `a noise coming from ${defNP(EN_NOUNS[subj])}`;
  } else t = 'an unidentified noise';
  if (f.direction) t += ` from the ${DIR[f.direction]}`;
  if (p.conf < 0.4) t = `possibly ${t}`;
  else if (p.conf < 0.75) t = `what sounded like ${t}`;
  return { t, silence: false };
}

function changedClause(p: Percept): string | null {
  const f = p.facts;
  const subj = asSubject(p.subject);
  const noun = subj === 'item' && f.item ? EN_ITEMS[f.item] : subj ? EN_NOUNS[subj] : undefined;
  if (!noun || subj === 'sound' || subj === 'silence') return null;
  const pl = (f.count ?? 1) >= 2 || !!noun.pluralOnly;
  const T = defNP(noun, pl);
  const was = pl ? 'were' : 'was';
  let t: string;
  const now = f.after ?? f.state;
  if (f.before && f.after) t = `${T}, ${STATE[f.before]} earlier, ${was} now ${STATE[f.after]}`;
  else if (f.moved) t = `${T} ${was} no longer in the same position as before`;
  else if (now) t = `${T} ${was} now ${STATE[now]}`;
  else t = `${T} looked different from before`;
  if (p.conf < 0.4) t += ', though I cannot be certain';
  else if (p.conf < 0.7) t += ', unless I am mistaken';
  return t;
}

// ---------------------------------------------------------------- comments

const COMMENTS: CommentTable = {
  shift_start: {
    reserved: "Right. To work.|Let's get started.",
    pragmatic: 'Jobs received. One stop at a time.|Right, first stop.|List is clear. Best get moving.',
    ironic: 'Another night in the woods. Lucky me.|Night shift among the trees. Living the dream.',
    skeptical: "The usual call-outs. Let's see what's real.|Bet it's nothing. Let's look anyway.",
    nervous: "Okay… okay. One step at a time.|Pitch dark… fine. Let's go.",
  },
  arrive_poi: {
    reserved: '{place}.|Here.',
    pragmatic: "{place}. Let's see what needs doing.|On site. Check it and move on.",
    ironic: '{place}. Charming, this time of night.|Here we go. Lively spot.',
    skeptical: '{place}. Looks normal enough.|Here. Nothing odd so far.',
    nervous: "{place}… nobody here, right?|Here… let's be quick.",
  },
  interaction: {
    reserved: 'Done.|{obj:the}: {state}.',
    pragmatic: '{obj:the} is {state}. Noted.|Checked. Moving on.',
    ironic: '{obj:the} is {state}. Shocking.|There. Textbook police work.',
    skeptical: '{obj:the} is {state}. Nothing mysterious.|As expected. Nothing special.',
    nervous: "{obj:the} is {state}… good, good.|Done… let's get out of here.",
  },
  report_done: {
    reserved: 'Report sent.|Sent.',
    pragmatic: 'Report filed: {rem}.|One down. Next.',
    ironic: 'Another masterpiece of paperwork.|Report sent. Someone might even read it.',
    skeptical: 'Wrote what I saw. Nothing more.|Report sent. Facts only.',
    nervous: "Sent… good, {rem}.|That's done… keep going.",
  },
  all_done: {
    reserved: 'Done. Back to the car.|All finished. Heading back.',
    pragmatic: 'All reports filed. Back to the car.|Job closed. Returning to the car.',
    ironic: 'All done. The woods will cope without me.|Finished. Back to the car before they change their minds.',
    skeptical: "Everything checked, as expected. Back to the car.|Done. Nothing a report can't explain. Back to the car.",
    nervous: "Done… finally. Back to the car, now.|That's enough… to the car, quickly.",
  },
  saw_figure: {
    reserved: 'Something over there.|A shape.',
    pragmatic: 'A shape. It goes in the report.|I see something. Worth noting.',
    ironic: "A shape. Maybe it'll wave.|Great, company. Or possibly a bush.",
    skeptical: 'Probably a tree trunk. Or a shadow.|A shape. In this dark, could be anything.',
    nervous: "Is… is something over there?|That shape… I don't like it.",
  },
  saw_light: {
    reserved: 'A light.|Light, over there.',
    pragmatic: 'A light. Noting the direction.|Light in the distance. Noted.',
    ironic: 'A light. Somebody paid the electric bill.|Lights in the woods. Just what I needed.',
    skeptical: "A light. There'll be an explanation.|Light over there. Means nothing by itself.",
    nervous: "That light… what is it?|A light… I don't like this at all.",
  },
  saw_person: {
    reserved: "Someone's there.|A person.",
    pragmatic: "There's a person. Better keep an eye out.|Someone around. Noted.",
    ironic: "Look at that, I'm not the only soul out here.|Company. At this hour, too.",
    skeptical: 'Someone out walking. It happens.|A person. Nothing strange so far.',
    nervous: "Someone's there… who's out at this hour?|A person… hope they saw me.",
  },
  saw_animal: {
    reserved: '{animal:a}.|An animal.',
    pragmatic: '{animal:a}. Nothing to report.|Just an animal. Moving on.',
    ironic: '{animal:a}. At least somebody lives here.|An animal. The ideal witness.',
    skeptical: '{animal:a}. Might explain the noises.|An animal. As predicted.',
    nervous: '{animal:a}… just {animal:a}. Good.|It was an animal… I think.',
  },
  heard: {
    reserved: 'Heard that.|A noise.',
    pragmatic: "{sound}. I'll keep it in mind.|A noise. Noted.",
    ironic: '{sound}. The woods always have something to say.|Noises. What a novelty.',
    skeptical: '{sound}. You hear all sorts at night.|A noise. The woods are full of them.',
    nervous: '{sound}… did I really hear that?|What was… what was that?',
  },
  changed: {
    reserved: "That was different before.|{obj:the}. It wasn't like that.",
    pragmatic: "{obj:the} isn't how it was. Writing it down.|Something changed here. Worth noting.",
    ironic: "{obj:the} isn't how it was. Or I'm getting old.|Someone's been tidying up, it seems.",
    skeptical: "{obj:the} looks different. Maybe I misremember.|Different from before? Maybe my memory's off.",
    nervous: "{obj:the}… it wasn't like that. I'd swear.|Wait… it wasn't like that before.",
  },
  torch_low: {
    reserved: "Torch is fading.|Battery's nearly gone.",
    pragmatic: "Torch is weak. Need a spare battery.|Battery's running out. Better swap it soon.",
    ironic: 'The torch is giving up. Perfect timing.|Battery on its last legs. Naturally.',
    skeptical: 'Low battery, nothing strange. They only last so long.|Torch is fading. Happens with these batteries.',
    nervous: "No, no… the torch is fading.|The light's dropping… not now.",
  },
  torch_dead: {
    reserved: 'Torch is out.|Dark.',
    pragmatic: "Torch is dead. Need to change the battery.|Battery's finished. I need another.",
    ironic: "And there's the dark. Just what was missing.|Dead torch. Perfect evening.",
    skeptical: "Flat battery. That's all.|It ran down. It happens.",
    nervous: "No… no, no. It's dark.|The torch… it won't come on.",
  },
  battery_found: {
    reserved: 'A battery.|Battery. Good.',
    pragmatic: 'A spare battery. Useful.|Battery found. Keeping it.',
    ironic: 'A battery. The woods provide.|Well now, a battery. Almost touching.',
    skeptical: "A battery. Let's see if it works.|Spare battery. Assuming it's charged.",
    nervous: 'A battery… thank goodness.|Battery… oh, thank heavens.',
  },
  silence: {
    reserved: 'Quiet.|Too quiet.',
    pragmatic: "Can't hear a thing now. Noted.|Sudden quiet. Noting it.",
    ironic: 'How peaceful. A bit too peaceful.|Total silence. They must have run out of gossip.',
    skeptical: "Quiet. Animals go silent sometimes.|Can't hear anything. It happens.",
    nervous: "Why can't I hear anything?|It's all gone quiet… too quiet.",
  },
  weather: {
    reserved: "{wx}.|Weather's turning.",
    pragmatic: "{wx}. I'll allow for it.|Weather's changing. Watch my footing.",
    ironic: "{wx}. This evening keeps getting better.|Weather's changing. What a surprise.",
    skeptical: "{wx}. It's only weather.|Weather's turning. That's all.",
    nervous: "{wx}… fine, fine.|The weather's turning… right now, of course.",
  },
  back_at_car: {
    reserved: 'The car.|There it is.',
    pragmatic: "Back at the car. Fixed point.|Car's here. Good.",
    ironic: 'Home sweet home, on four wheels.|The car. The only one waiting for me.',
    skeptical: "Car's where I left it. Obviously.|The car. All fine.",
    nervous: 'The car… thank goodness.|There it is… still here.',
  },
  not_done_at_car: {
    reserved: "Not yet: {rem}.|I'm not finished.",
    pragmatic: "Can't end the shift: {rem}.|Still work to do. Back to it.",
    ironic: "I'd love to leave, but {rem}.|Nice idea, running off. Shame about the reports.",
    skeptical: 'Not over: {rem}.|Work first, then we go.',
    nervous: "I want to leave… but {rem}.|I can't yet… there's still work to do.",
  },
  item_inspected: {
    reserved: '{item:a}.|Interesting.',
    pragmatic: '{item:a}. Noting it.|Worth noting.',
    ironic: '{item:a}. Someone will miss this.|Lost property, forest branch.',
    skeptical: '{item:a}. Left behind, I suppose.|Stuff left lying around. Nothing more.',
    nervous: '{item:a}… whose is it?|Whose could this be?',
  },
  locked: {
    reserved: "Won't open.|Locked.",
    pragmatic: "Locked. I'll report it as is.|Lock's engaged. Noted.",
    ironic: "Won't open. Nobody was expecting me, apparently.|Locked. Some welcome.",
    skeptical: "Won't open. Normal, at this hour.|Locked. As it should be.",
    nervous: "Won't open… maybe that's for the best.|It's locked… good. I think.",
  },
  photo: {
    reserved: 'Got it.|Taken.',
    pragmatic: 'Photo taken. It goes in the report.|One photo for the report.',
    ironic: 'A lovely souvenir of the evening.|Artistic shot. More or less.',
    skeptical: "Photo taken. That's on record now.|Better a photo than memory.",
    nervous: "Got it… hope it came out.|A photo… so I know I didn't dream it.",
  },
};

function commentResolver(f: CommentFacts): SlotResolver {
  return (name, form) => {
    const obj = f.object ? EN_NOUNS[f.object] : undefined;
    switch (name) {
      case 'place': return f.place ?? null;
      case 'obj': return obj ? (form === 'a' ? indefNP(obj) : defNP(obj)) : null;
      case 'state': return obj && f.state ? STATE[f.state] : null;
      case 'sound': return f.sound ? SOUND[f.sound] : null;
      case 'animal': return f.animal ? indefNP(EN_ANIMALS[f.animal]) : null;
      case 'item': return f.item ? indefNP(EN_ITEMS[f.item]) : null;
      case 'wx': return f.weather ? WX_CLAUSE[f.weather] : null;
      case 'rem': {
        if (f.remaining === undefined) return null;
        const r = Math.max(0, Math.round(f.remaining));
        return r === 0 ? 'there are none left to do' : r === 1 ? "there's one left to do" : `there are ${num(r)} left to do`;
      }
      default: return null;
    }
  };
}

// ---------------------------------------------------------------- NPC

const NPC_GREET: Record<string, string[]> = {
  hiker: ['Evening, officer.', 'Hello, officer.'],
  camper: ['Evening.', 'Oh, good evening, officer.'],
  motorist: ['Officer, good evening.', 'Evening, officer.'],
  resident: ['Evening, officer.', 'Good evening.'],
};
const NPC_GOAL: Record<string, string[]> = {
  camping: ['Just looking for somewhere to pitch my tent.', "I'm camping near here tonight."],
  crossing: ["I'm only passing through.", 'Just crossing the area on foot.'],
  watching_lake: ['I came to look at the lake.', "I'm stopping for a while to watch the water."],
  to_gas: ["I'm heading for the gas station.", "Looking for the gas station, I'm nearly empty."],
  going_home: ["I'm on my way home.", 'Heading home, I live close by.'],
  walking: ['Just out for a walk.', 'A stroll before bed, nothing more.'],
};
const NPC_SAW: Record<string, string[]> = {
  lights: ["I saw some lights{d}, can't tell you more.", 'There were lights{d} earlier.'],
  animal: ["I saw an animal{d}, couldn't say which.", 'Some animal was moving about{d}.'],
  person: ["I saw someone{d}, but didn't recognise them.", 'There was a person{d}, I think.'],
  nothing: ["I haven't seen anything in particular.", "Haven't noticed a thing around here."],
};

// ---------------------------------------------------------------- pack

export const EN: LangPack = {
  fallbackPlace: 'the indicated location',

  briefingOpen(c, colleague, officer, count) {
    const hi = c.pick([`Hi ${officer}, ${colleague} here.`, `Evening ${officer}, it's ${colleague}.`, `${officer}, ${colleague} from the station.`]);
    let intro: string;
    if (count <= 0) intro = 'Nothing on the list yet tonight.';
    else if (count === 1) intro = c.pick(["You've got one job tonight.", 'One thing to check on your round tonight.', "Tonight's list: one stop."]);
    else {
      const k = num(count);
      intro = c.pick([`You've got ${k} jobs tonight.`, `${k} things to check on your round tonight.`, `Tonight's list: ${k} stops.`]);
    }
    return `${hi} ${intro}`;
  },

  briefingMission(c, m: BriefItem, pos: BriefPos) {
    const thing = m.type === 'generator' ? GEN_THING[m.gen] : THING[m.type] ?? { bare: 'a check to carry out', clause: "there's a check to carry out" };
    const instr = c.pick(m.type === 'generator' ? GEN_INSTR[m.gen] : INSTR[m.type] ?? ['Check the situation']);
    const reasons = REASON[m.reason];
    const reason = reasons ? c.pick(reasons) : '';
    const dir = dirPhrase(c, m.dir, m.dist);
    const lead = c.pick(LEAD[pos]);
    const frame = c.pick(reason ? ['f1', 'f2', 'f3'] : ['f1', 'f2']);
    if (frame === 'f1') {
      return `${lead} ${m.place}${dir ? ` (${dir})` : ''}: ${thing.bare}. ${reason ? reason + '.' : ''} ${instr}.`;
    }
    if (frame === 'f2') {
      return `${lead} ${thing.clause} at ${m.place}${dir ? `, ${dir}` : ''}. ${reason ? reason + '.' : ''} ${instr}.`;
    }
    return `${reason}: ${thing.clause} at ${m.place}${dir ? `, ${dir}` : ''}. ${instr}.`;
  },

  briefingClose(c) {
    const main = c.pick([
      'File a report for each one from your phone, then come back to the car.',
      "Remember: one report for every stop, and head back to the car when you're done.",
      "Write up a report for each and return to the car once you've finished.",
    ]);
    return main + c.pick(['', ' Good luck.', ' Talk later.']);
  },

  missionTitle(type: MissionType, place: string) {
    return `${TITLE[type] ?? 'Check'} — ${place}`;
  },

  reportHeader(c, first, last, time) {
    return c.pick([
      `Report by Officer ${last}, ${time}.`,
      `Officer ${first} ${last}, duty report, ${time}.`,
      `Duty report, ${time}, Officer ${last}.`,
      `Patrol log, ${time}, Officer ${first} ${last}.`,
    ]);
  },

  reportPlace(c, type, place) {
    const p = PURPOSE[type] ?? { verb: 'carry out the requested check', noun: 'requested check' };
    return c.pick([
      `I reached ${place} to ${p.verb}.`,
      `Attended ${place}: ${p.noun}.`,
      `Site visit at ${place} to ${p.verb}.`,
      `Check carried out at ${place}: ${p.noun}.`,
    ]);
  },

  reportAction(c, type, action, gen) {
    if (type === 'generator') return c.pick(GEN_ACTION[gen]) + '.';
    if (type === 'panel_check' && action === 'reset_breaker') return 'I opened the electrical panel and reset the breaker.';
    if (type === 'smoke_report' && action === 'douse') return 'I checked the fire ring and doused it.';
    return c.pick(ACTION[type] ?? ['I carried out the requested check']) + '.';
  },

  reportNoAction(c) {
    return c.pick(['No direct check is recorded.', 'No direct check has been logged.']);
  },

  joinClauses(a, b) {
    return `${a.replace(/[.]$/, '')}; ${b}`;
  },

  reportState(c, target: Target, f: CleanFacts) {
    const noun = EN_NOUNS[target.key];
    const pl = target.plural || !!noun.pluralOnly;
    const the = `the ${f.color ? COLOR[f.color] + ' ' : ''}${pl ? noun.p : noun.s}`;
    const was = pl ? 'were' : 'was';
    let main = '';
    let detailUsed = false;
    const state = f.state ?? f.after;
    if (f.before && f.after) {
      main = `${the}, ${STATE[f.before]} at first, ${was} ${STATE[f.after]} at the end of the check`;
    } else if (state) {
      const st = STATE[state];
      main = c.pick([
        `${the} ${was} ${st}`,
        `I found ${the} ${st}`,
        `At the time of the check ${the} ${was} ${st}`,
        `${the} ${was} found ${st}`,
      ]);
    } else if (f.detail) {
      main = `I found ${the} ${DETAIL_WITH[f.detail]}`;
      detailUsed = true;
    }
    const extras: string[] = [];
    if (f.detail && !detailUsed) extras.push(DETAIL_WITH[f.detail]);
    if (f.plate) extras.push(`plate ${f.plate}`);
    if (f.weather) extras.push(WX_PHRASE[f.weather]);
    if (!main) {
      if (extras.length === 0 && !f.item) return null;
      if (extras.length === 0) return `${indefNP(EN_ITEMS[f.item as ItemKind])} was at the scene.`;
      main = `Notes on the check of ${the}: ${extras.join(', ')}`;
    } else if (extras.length > 0) main += `, ${extras.join(', ')}`;
    if (f.item) main += `; ${indefNP(EN_ITEMS[f.item])} was at the scene`;
    return main + '.';
  },

  reportSeen(c, items) {
    if (items.length === 0) return null;
    const list = joinList(items.map(seenNP), 'and', 'also');
    return c.pick([`At the scene I noticed ${list}.`, `I also observed ${list}.`, `During the visit I saw ${list}.`, `I note having seen ${list}.`]);
  },

  reportHeard(c, items) {
    if (items.length === 0) return null;
    const parts = items.map(heardNP);
    const list = joinList(parts.map((p) => p.t), 'and', 'also');
    if (parts.some((p) => p.silence)) return c.pick([`I noticed ${list}.`, `On site I was aware of ${list}.`]);
    return c.pick([`I heard ${list}.`, `While on site I heard ${list}.`, `I also heard ${list}.`]);
  },

  reportChanged(c, items) {
    const clauses = items.map(changedClause).filter((x): x is string => x !== null);
    if (clauses.length === 0) return null;
    const list = clauses.join('; ');
    const head = clauses.length > 1 ? 'I note some changes' : 'I note a change';
    return c.pick([`Compared with earlier, ${list}.`, `${head}: ${list}.`, `I also record that ${list}.`]);
  },

  reportPhotos(c, count) {
    if (count <= 0) return c.pick(['No photographs attached.', 'I attach no photographs.']);
    if (count === 1) return c.pick(['One photograph attached.', 'I attach one photograph.', 'One photograph accompanies this report.']);
    const k = num(count);
    return c.pick([`${k} photographs attached.`, `I attach ${k} photographs.`, `Photographs attached: ${k}.`]);
  },

  reportConclusion(c, clean) {
    return clean
      ? c.pick(['Nothing else to report.', 'I observed nothing else unusual.', 'Otherwise, all in order.', 'No further observations.'])
      : c.pick([
          'I have no basis to determine the source of what is noted above.',
          'I report only what I observed, without further assessment.',
          'The above is recorded as observed; no further verification was possible at the time.',
          'Nothing further to add.',
        ]);
  },

  comment(c, p: Personality, trigger: CommentTrigger, f: CommentFacts) {
    const row = COMMENTS[trigger];
    return pickFill(c, row ? row[p] : 'Right.', commentResolver(f), f.lowConf);
  },

  spontaneous(c, kind: SpontaneousKind, f: SpontFacts) {
    const near = f.place ? `near ${f.place}` : 'in your area';
    const what = f.sound ? SOUND[f.sound] : f.subject ? indefNP(EN_NOUNS[f.subject]) : 'something unclear';
    const perceived = `${f.sound ? 'heard' : 'seen'} ${what}`;
    switch (kind) {
      case 'weather_notice': {
        if (!f.weather) return c.pick(['Weather update: conditions are changing over your area.', 'Heads up, the weather is shifting where you are.']);
        const w = WX_FORECAST[f.weather];
        return c.pick([`Weather update: ${w} over your area.`, `Heads up, the radar shows ${w} where you are.`, `Forecast just changed: ${w} in your sector.`])
          + c.pick(['', ' Nothing major, but keep it in mind.', ' Your call how to handle it.']);
      }
      case 'banter':
        return c.pick([
          'The coffee machine at the station is broken again.',
          "They've reshuffled next week's shifts once more.",
          'Dinner tonight was a cold sandwich at my desk.',
          'The office heating is making an awful racket.',
          "I've been filling in forms for two hours.",
          'Nothing but old songs on the radio tonight.',
        ]) + c.pick(['', ' How are you getting on?', ' Lucky you, out in the fresh air.', ' Nothing new, in other words.']);
      case 'ack_report': {
        const tail = c.pick(['', ' Thanks.', ' All logged.']);
        if (!f.place) return c.pick(['Report received.', 'Your report came through.']) + tail;
        return c.pick([`Got your report on ${f.place}.`, `Report for ${f.place} received.`, `Your ${f.place} report came through.`]) + tail;
      }
      case 'all_reports_ack':
        return c.pick([
          "I've got all the reports. Head back to the car, that's enough for tonight.",
          'All reports are in. You can return to the car.',
          'Everything received. Go back to the car and close out the shift.',
        ]);
      case 'contradiction':
        if (!f.place) {
          return c.pick([
            "One of tonight's calls may have been a mistake, nobody here is sure any more. Check everything anyway.",
            "I'm told one report could be an error. Do the full round all the same.",
          ]);
        }
        return c.pick([
          `The call about ${f.place} may have been a mistake, nobody here is sure any more. Check it anyway.`,
          `I'm told the report for ${f.place} could be an error. Stop by all the same.`,
          `Slight doubt about ${f.place}: the caller may have been confused. Still, go and check.`,
        ]);
      case 'citizen_call':
        return c.pick([
          `Dispatch: a citizen reports ${what} ${near}. If you're in the area, check it.`,
          `From dispatch: a call came in about ${what} ${near}. Take a look if you can.`,
          `Dispatch: a resident mentions ${what} ${near}. Check when you pass.`,
        ]);
      case 'false_report':
        return c.pick([
          `Unconfirmed report: someone claims to have ${perceived} ${near}. It may not be true, use your judgement.`,
          `Word has come in that someone may have ${perceived} ${near}. It may not be reliable.`,
          `A caller says they have ${perceived} ${near}. Treat it with caution, nothing confirms it.`,
        ]);
      case 'wrong_number':
        return c.pick([
          'Mum, I left the keys under the flowerpot. See you Sunday.',
          "Hi Gary, the residents' meeting has moved to Thursday at seven.",
          'Got the bread. Remember to bring the washing in.',
          "I'm here, parked behind the pharmacy. Are you coming down?",
          'The washing machine finishes in half an hour, hang it out please.',
        ]);
      case 'garbled':
        return c.pick([
          "Are you still there? You said you'd be back earlier.",
          "I didn't catch your last message. Can you repeat where you are?",
          'The porch light was left on again. Will you go and turn it off?',
          'I called you three times. Answer when you read this.',
          "They said to wait by the road. I don't know how long.",
        ]);
      case 'carrier':
        return c.pick([
          'Service message: reduced coverage in your area. Some messages may arrive late.',
          'Network notice: maintenance work in progress. Service may be briefly interrupted.',
          'Operator info: weak signal detected. Pending messages will be delivered as soon as possible.',
        ]);
      case 'future_self':
        return c.pick([
          'Remember the spare battery.',
          "Don't forget to shut the car door.",
          'Check twice before you write.',
          "It's me. I'll explain later.",
          'Look carefully before you go back to the car.',
          'Reminder: write only what you saw.',
        ]);
      case 'checkin':
      default:
        return c.pick([
          'Everything okay out there? Message me when you can.',
          "How's the round going? Drop me a line when you get a chance.",
          "All good? Haven't heard from you in a while.",
          "You there? Just tell me everything's fine.",
        ]);
    }
  },

  npcLine(c, f: NpcFacts) {
    const parts: string[] = [c.pick(NPC_GREET[f.archetype ?? ''] ?? ['Evening.'])];
    const goal = NPC_GOAL[f.goal ?? ''];
    if (goal) parts.push(c.pick(goal));
    const saw = NPC_SAW[f.saw ?? ''];
    if (saw) parts.push(c.pick(saw).replace('{d}', f.direction ? ` to the ${DIR[f.direction]}` : ''));
    return parts.join(' ');
  },

  itemNote(c, kind: ItemKind, f: ItemFacts) {
    const noun = EN_ITEMS[kind] ?? EN_NOUNS.item;
    const adjs: string[] = [];
    if (f.worn) adjs.push('worn');
    if (f.wet) adjs.push('wet');
    const np = enIndef(`${adjs.length ? adjs.join(', ') + ' ' : ''}${noun.s}`);
    const where = f.place ? `, at ${f.place}` : '';
    return c.pick([`${np}${where}.`, `It's ${np}${where}.`, `This is ${np}${where}.`]);
  },

  itemText(c, text) {
    const end = /[.!?…]$/.test(text) ? '' : '.';
    return c.pick([`It reads: “${text}”${end}`, `Written on it: “${text}”${end}`, `The writing says: “${text}”${end}`]);
  },
};

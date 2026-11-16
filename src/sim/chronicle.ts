// Registro di fine turno: racconta, solo a turno concluso, cosa è successo davvero nel bosco
// (eventi del mondo con la loro causa), compresi gli eventi casuali che l'agente non ha visto.
import type { Lang, SessionState, WorldEvent, WorldSpec } from '../core/contracts';
import { hourAt, clockString } from './environment';

export interface ChronicleEntry { time: string; place: string; text: string; seen: boolean; origin: WorldEvent['origin']; rare: boolean }

type T = { it: string; en: string };
const L = (it: string, en: string): T => ({ it, en });

/** {a} = chi (attore), {o} = oggetto. */
const TEXT: Record<string, T> = {
  watcher_observes: L('Un piccolo uomo col cappello ti osservava da lontano.', 'A small man in a hat watched you from a distance.'),
  encounter_present: L('Qualcuno era già nel bosco prima del tuo arrivo.', 'Someone was already in the woods before you arrived.'),
  encounter_alert: L('Una presenza ti ha individuato e ha cominciato a seguirti.', 'A presence noticed you and began following you.'),
  encounter_sound: L('Voci insolite nel bosco.', 'Unusual voices in the woods.'),
  encounter_fled: L('Una figura è fuggita nel bosco.', 'A figure fled into the woods.'),
  officer_killed: L('Sei stato raggiunto e ucciso. Le trasmissioni si sono interrotte.', 'You were caught and killed. The transmissions stopped.'),
  // agente
  door_tried: L('Hai provato una porta.', 'You tried a door.'),
  door_opened: L('Hai aperto una porta.', 'You opened a door.'),
  door_closed: L('Hai chiuso una porta.', 'You closed a door.'),
  tent_opened: L('Hai scostato il telo di una tenda.', 'You opened a tent flap.'),
  tent_closed: L('Hai richiuso una tenda.', 'You closed a tent.'),
  generator_started: L('Hai avviato un generatore.', 'You started a generator.'),
  generator_stopped: L('Hai spento un generatore.', 'You stopped a generator.'),
  generator_failed: L('Il generatore non è partito.', 'The generator would not start.'),
  breaker_reset: L('Hai riarmato un interruttore generale.', 'You reset a breaker.'),
  fire_doused: L('Hai spento un fuoco.', 'You put out a fire.'),
  battery_taken: L('Hai preso delle pile.', 'You took some batteries.'),
  vehicle_inspected: L("Hai controllato un'auto.", 'You inspected a car.'),
  plate_checked: L('Hai verificato la targa di un ponte.', 'You checked a bridge plate.'),
  log_signed: L('Hai firmato un registro.', 'You signed a logbook.'),
  item_inspected: L('Hai esaminato un oggetto.', 'You examined an item.'),
  report_filed: L('Hai inviato un rapporto.', 'You filed a report.'),
  shift_ended: L('Turno chiuso alla volante.', 'Shift closed at the patrol car.'),
  headlights_on: L('Hai acceso i fari della volante.', 'You switched on the patrol car headlights.'),
  headlights_off: L('Hai spento i fari della volante.', 'You switched off the patrol car headlights.'),
  switched_off: L('Hai spento le luci.', 'You switched the lights off.'),
  switched_on: L('Hai acceso le luci.', 'You switched the lights on.'),
  checked: L('Hai controllato: {o}.', 'You checked: {o}.'),
  opened: L('Hai aperto: {o}.', 'You opened: {o}.'),
  straightened: L('Hai rimesso a posto: {o}.', 'You put back in place: {o}.'),
  // persone
  npc_arrives: L('{a} è entrato nella zona.', '{a} entered the area.'),
  npc_leaves: L('{a} se n\'è andato.', '{a} left the area.'),
  npc_door_open: L('{a} ha aperto una porta.', '{a} opened a door.'),
  npc_door_close: L('{a} ha chiuso una porta.', '{a} closed a door.'),
  npc_try_door: L('{a} ha provato una porta chiusa a chiave.', '{a} tried a locked door.'),
  npc_switch: L('{a} ha usato un interruttore.', '{a} flipped a switch.'),
  npc_generator_start: L('{a} ha avviato un generatore.', '{a} started a generator.'),
  npc_generator_stop: L('{a} ha spento un generatore.', '{a} stopped a generator.'),
  npc_chair_moved: L('{a} ha spostato una sedia.', '{a} moved a chair.'),
  npc_bin_used: L('{a} ha gettato qualcosa in un bidone.', '{a} threw something in a bin.'),
  npc_bin_straightened: L('{a} ha raddrizzato un bidone.', '{a} set a bin upright.'),
  npc_cooler: L('{a} ha aperto una borsa frigo.', '{a} opened a cooler.'),
  // fauna
  fauna_flee: L('{a} è fuggito spaventato.', '{a} bolted, startled.'),
  owl_call: L('Un gufo ha chiamato.', 'An owl called.'),
  bird_call: L('Un uccello notturno ha lanciato il suo richiamo.', 'A night bird gave its call.'),
  crows_call: L('Dei corvi hanno gracchiato.', 'Crows cawed.'),
  sky_light: L('Una luce ha attraversato il cielo in silenzio.', 'A light crossed the sky without a sound.'),
  fox_call: L('Una volpe ha gridato nel buio.', 'A fox screamed in the dark.'),
  crows_burst: L('Uno stormo di corvi si è alzato di colpo.', 'A flock of crows burst into the air.'),
  owl_flight: L('Un gufo ha cambiato albero.', 'An owl moved to another tree.'),
  bin_tipped: L('Un procione ha rovesciato un bidone.', 'A raccoon knocked over a bin.'),
  litter_scattered: L('Rifiuti sparsi a terra.', 'Litter scattered on the ground.'),
  // ambiente
  wind_door_slam: L('Il vento ha sbattuto una porta.', 'The wind slammed a door.'),
  wind_sign_tilt: L('Il vento ha piegato un cartello.', 'The wind bent a sign.'),
  branch_fall: L('È caduto un ramo.', 'A branch fell.'),
  branch_on_ground: L('Un ramo è rimasto a terra.', 'A branch lay on the ground.'),
  rain_on_fire: L('La pioggia ha smorzato un fuoco.', 'Rain damped down a fire.'),
  fire_dies_down: L('Un fuoco si è affievolito da solo.', 'A fire died down on its own.'),
  generator_out_of_fuel: L('Un generatore è rimasto senza carburante.', 'A generator ran out of fuel.'),
  lamp_fault: L('Una lampada si è spenta per un guasto.', 'A lamp failed.'),
  lamp_recovers: L('La lampada si è riaccesa.', 'The lamp came back on.'),
  thunder: L('Un tuono in lontananza.', 'Distant thunder.'),
  vehicle_passes: L("Un'auto è passata sulla strada d'accesso.", 'A car passed on the access road.'),
  precipitation_starts: L('Ha cominciato a cadere qualcosa dal cielo.', 'It started to come down.'),
  fog_thickens: L('La nebbia si è infittita.', 'The fog thickened.'),
  drift_chair: L('Una sedia si è spostata di poco. Nessuno l\'ha toccata.', 'A chair shifted slightly. Nobody touched it.'),
  drift_sign: L('Un cartello si è inclinato. Nessuno l\'ha toccato.', 'A sign tilted. Nobody touched it.'),
  drift_door: L('Una porta ha cambiato posizione. Nessuno l\'ha toccata.', 'A door changed position. Nobody touched it.'),
  drift_lamp: L('Una lampada ha cambiato stato da sola.', 'A lamp changed state on its own.'),
  drift_cooler: L('Una borsa frigo si è aperta o chiusa da sola.', 'A cooler opened or closed on its own.'),
  // anomalie, illusioni, misteri
  anomaly_manifest: L('Qualcosa che non ha un nome si è manifestato.', 'Something without a name manifested.'),
  anomaly_sound: L('Un suono senza sorgente.', 'A sound with no source.'),
  anomaly_vanish: L('Quella presenza è svanita.', 'That presence vanished.'),
  object_displaced: L('Un oggetto è stato spostato da qualcosa che non si è visto.', 'An object was moved by something unseen.'),
  signal_interference: L('Il telefono ha perso il segnale vicino a qualcosa.', 'The phone lost signal near something.'),
  illusion_resolved: L('Quella sagoma era solo un ceppo.', 'That shape was only a stump.'),
  phantom_sound: L('Un rumore che non è mai avvenuto: era la tua mente.', 'A noise that never happened: it was your mind.'),
  mystery_steps: L('Passi, legati a una storia che il bosco non racconta.', 'Footsteps, part of a story the forest does not tell.'),
  mystery_voice: L('Una voce lontana, legata a quella stessa storia.', 'A distant voice, tied to that same story.'),
  mystery_knock: L('Qualcuno ha bussato. Non c\'era nessuno.', 'Someone knocked. Nobody was there.'),
  mystery_door: L('Una porta si è socchiusa.', 'A door came ajar.'),
  mystery_lamp: L('Una lampada si è spenta senza motivo apparente.', 'A lamp went out for no clear reason.'),
  mystery_light: L('Una luce si è accesa dove non dovrebbe esserci nessuno.', 'A light came on where nobody should be.'),
  extreme_begin: L('La realtà ha ceduto. Evento rarissimo: circa una partita su diecimila.', 'Reality gave way. An extremely rare event: about one game in ten thousand.'),
  extreme_end: L('Tutto è tornato come prima. Quasi.', 'Everything went back to how it was. Almost.'),
};

/** Eventi troppo minuti o ripetitivi per il registro. */
const SKIP = new Set(['npc_steps', 'closed', 'sign_read', 'lamp_recovers']);

const OBJ: Record<string, T> = {
  campfire: L('un fuoco', 'a campfire'), bin: L('un bidone', 'a bin'), panel: L('un quadro elettrico', 'an electrical panel'), cooler: L('una borsa frigo', 'a cooler'),
  drawer: L('un cassetto', 'a drawer'), car_trunk: L('un bagagliaio', 'a car trunk'), generator: L('un generatore', 'a generator'), table: L('un tavolo', 'a table'),
  sign: L('un cartello', 'a sign'), tent: L('una tenda', 'a tent'), chair: L('una sedia', 'a chair'), logbox: L('una cassetta del registro', 'a logbox'),
};
const RARE = new Set(['anomaly', 'mystery', 'illusion']);

const WHO: Record<string, T> = {
  hiker: L('Un escursionista', 'A hiker'), camper: L('Un campeggiatore', 'A camper'), motorist: L('Un automobilista', 'A motorist'),
  resident: L('Un residente', 'A resident'), deer: L('Un cervo', 'A deer'), fox: L('Una volpe', 'A fox'), raccoon: L('Un procione', 'A raccoon'),
  owl: L('Un gufo', 'An owl'), crows: L('Un corvo', 'A crow'), rabbit: L('Un coniglio', 'A rabbit'), nightbird: L('Un uccello notturno', 'A night bird'),
};

export function chronicle(st: SessionState, spec: WorldSpec, lang: Lang): ChronicleEntry[] {
  const out: ChronicleEntry[] = [];
  const last = new Map<string, number>();
  const poiName = (x: number, z: number) => {
    let best = spec.pois[0], bd = Infinity;
    for (const p of spec.pois) { const d = Math.hypot(p.pos.x - x, p.pos.z - z); if (d < bd) { bd = d; best = p; } }
    return bd < best.radius + 60 ? best.name[lang] : lang === 'it' ? `nel bosco, verso ${best.name.it}` : `in the woods, towards ${best.name.en}`;
  };
  for (const e of st.log) {
    if (SKIP.has(e.type)) continue;
    const tpl = TEXT[e.type];
    if (!tpl) continue;
    // eventi uguali e ravvicinati nello stesso luogo: uno solo
    const key = `${e.type}|${Math.round(e.pos.x / 40)}|${Math.round(e.pos.z / 40)}`;
    if ((last.get(key) ?? -1e9) > e.t - 90) continue;
    last.set(key, e.t);
    const actor = e.actorId ? st.actors.find((a) => a.id === e.actorId) : undefined;
    const who = actor ? WHO[actor.archetype]?.[lang] ?? (lang === 'it' ? 'Qualcuno' : 'Someone') : lang === 'it' ? 'Qualcuno' : 'Someone';
    const kind = e.objectId ? spec.objects.find((o) => o.id === e.objectId)?.kind ?? st.dynamicObjects.find((o) => o.id === e.objectId)?.kind : undefined;
    const obj = (kind && OBJ[kind]?.[lang]) ?? (lang === 'it' ? 'un oggetto' : 'an object');
    let text = tpl[lang].replace('{a}', who).replace('{o}', obj);
    if (e.type === 'fauna_flee' && actor?.archetype === 'fox') text = lang === 'it' ? 'Una volpe è fuggita spaventata.' : 'A fox bolted, startled.';
    out.push({
      time: clockString(hourAt(spec.sky, e.t)), place: poiName(e.pos.x, e.pos.z), text,
      seen: e.origin === 'player' || e.perceivedByPlayer, origin: e.origin, rare: RARE.has(e.origin) || e.tags.includes('extreme') || e.tags.includes('drift') || e.tags.includes('unidentified'),
    });
  }
  return out;
}

/** Versione testuale scaricabile del registro. */
export function chronicleText(entries: ChronicleEntry[], header: string, lang: Lang): string {
  const unseen = lang === 'it' ? ' (non visto)' : ' (not witnessed)';
  return [header, '', ...entries.map((e) => `${e.time}  ${e.place} — ${e.text}${e.seen ? '' : unseen}`)].join('\n') + '\n';
}

// La storia del bosco: a fine turno gli indizi trovati si ricompongono in un racconto.
// Con pochi indizi resta un'ipotesi; con tutti, la ricostruzione è completa. I misteri anomali
// non si spiegano mai del tutto: anche completi restano una domanda.
import type { L10n, Lang, Mystery } from '../core/contracts';

interface Epilogue { title: L10n; partial: L10n; full: L10n }
const L = (it: string, en: string): L10n => ({ it, en });

const EPILOGUES: Record<string, Epilogue> = {
  overdue_hiker: {
    title: L('L’escursionista in ritardo', 'The overdue hiker'),
    partial: L('Qualcuno è passato da {place} con troppo poco tempo e troppa poca acqua. Dove sia andato dopo, non è chiaro.', 'Someone came through {place} with too little time and too little water. Where they went next is unclear.'),
    full: L('Un escursionista ha lasciato il sentiero dopo {place}, convinto di tornare prima del buio. Gli oggetti che hai trovato disegnano la sua strada: si è perso, ha provato a chiamare, poi ha cercato la strada verso la luce. Domattina la forestale saprà dove cercarlo.', 'A hiker left the trail after {place}, sure they would be back before dark. The things you found trace their route: lost, trying to call, then heading for the nearest light. In the morning the rangers will know where to look.'),
  },
  night_poacher: {
    title: L('Il bracconiere', 'The poacher'),
    partial: L('Qualcuno lavora di notte nel bosco, senza luci. A {place} ha lasciato più tracce di quante volesse.', 'Someone works the woods at night, without lights. At {place} they left more traces than they meant to.'),
    full: L('Un bracconiere batte questa zona da settimane, sempre dopo mezzanotte. Partiva da {place}, trascinava la preda fino al mezzo e spariva prima dell’alba. Il tuo rapporto gli costerà caro.', 'A poacher has been working this area for weeks, always after midnight. They started from {place}, dragged the kill to a vehicle and were gone before dawn. Your report is going to cost them.'),
  },
  runaway: {
    title: L('Chi non voleva essere trovato', 'Someone who didn’t want to be found'),
    partial: L('A {place} qualcuno ha dormito per qualche notte. Se n’è andato in fretta.', 'At {place} someone slept rough for a few nights. They left in a hurry.'),
    full: L('Un ragazzo scappato di casa ha passato due notti fra {place} e i dintorni. Ha lasciato un biglietto per dire che stava bene e se n’è andato prima del tuo turno. Stavolta, almeno, sai che è vivo.', 'A teenager who ran away from home spent two nights around {place}. They left a note to say they were fine and moved on before your shift. This time, at least, you know they are alive.'),
  },
  sick_stag: {
    title: L('Il cervo malato', 'The sick stag'),
    partial: L('Un animale grosso si è trascinato vicino a {place}. Qualcosa non andava.', 'A large animal dragged itself near {place}. Something was wrong with it.'),
    full: L('Un cervo adulto, malato, si aggira da giorni fra {place} e l’acqua. Le tracce, i graffi sugli alberi, i colpi nella notte: era lui. La forestale lo troverà.', 'An adult stag, sick, has been wandering for days between {place} and the water. The tracks, the scratches on the trees, the knocks in the night: it was him. The rangers will find him.'),
  },
  storm_blowdown: {
    title: L('La linea che cade', 'The line that keeps failing'),
    partial: L('A {place} la corrente va e viene. Qualcuno se n’era già accorto.', 'At {place} the power keeps cutting out. Someone had already noticed.'),
    full: L('L’ultima tempesta ha piegato i rami sopra la linea vicino a {place}: ogni colpo di vento la fa saltare. Le luci che si spengono da sole hanno una spiegazione noiosissima. Quasi un sollievo.', 'The last storm bent branches over the line near {place}: every gust trips it. The lights going out on their own have a very boring explanation. Almost a relief.'),
  },
  ridge_lights: {
    title: L('Le luci sul crinale', 'The lights on the ridge'),
    partial: L('Qualcuno, prima di te, ha visto delle luci da {place} e le ha contate.', 'Someone before you saw lights from {place} and counted them.'),
    full: L('Da tre notti una luce compare sul crinale sopra {place}, sempre alla stessa ora: undici secondi accesa, quattro spenta. Chi la osservava ha lasciato appunti e foto, poi ha smesso di scrivere. Nessuno sa da dove venga. Nemmeno tu.', 'For three nights a light has appeared on the ridge above {place}, always at the same hour: eleven seconds on, four off. Whoever watched it left notes and photos, then stopped writing. Nobody knows where it comes from. Neither do you.'),
  },
  night_knocking: {
    title: L('Chi bussa di notte', 'Knocking at night'),
    partial: L('A {place} qualcuno sente bussare. Fuori non c’è mai nessuno.', 'At {place} someone keeps hearing knocks. There is never anyone outside.'),
    full: L('Da settimane, a {place}, qualcuno bussa alle porte dopo mezzanotte. Le impronte arrivano fino alla soglia e lì finiscono. Chi ci viveva ha smesso di aprire. Stanotte hai sentito anche tu.', 'For weeks, at {place}, something has knocked on doors after midnight. The footprints come up to the threshold and stop there. Whoever lived there stopped answering. Tonight you heard it too.'),
  },
  quiet_circle: {
    title: L('Il cerchio del silenzio', 'The circle of silence'),
    partial: L('Vicino a {place} c’è un punto dove gli uccelli smettono di cantare. Qualcuno lo aveva misurato.', 'Near {place} there is a spot where the birds stop singing. Someone had measured it.'),
    full: L('Vicino a {place} c’è un cerchio di quaranta passi dove gli uccelli tacciono, la bussola sbaglia e la cenere non si raffredda. Chi l’ha studiato ha lasciato tutto lì, anche la lanterna. Il cerchio, stanotte, era un po’ più largo.', 'Near {place} there is a circle forty paces wide where birds go quiet, compasses lie and the ash never cools. Whoever studied it left everything behind, even the lantern. Tonight the circle was a little wider.'),
  },
  ending_tracks: {
    title: L('Le impronte che finiscono', 'The tracks that end'),
    partial: L('Delle impronte attraversano {place}. A un certo punto smettono.', 'Footprints cross {place}. At some point they stop.'),
    full: L('Le impronte partono da {place}, attraversano il bosco e si fermano nel mezzo di una radura: non tornano indietro e non proseguono. Hai trovato la sua foto, i suoi scarponi. Di lui, nient’altro.', 'The footprints start at {place}, cross the woods and stop in the middle of a clearing: they don’t turn back and they don’t go on. You found his photo, his boots. Of him, nothing else.'),
  },
};

export function storyOf(mysteries: Mystery[], lang: Lang, placeName: (poiId: string) => string): { title: string; text: string; found: number; total: number }[] {
  const out: { title: string; text: string; found: number; total: number }[] = [];
  for (const m of mysteries) {
    const e = EPILOGUES[m.theme];
    const found = m.discovered.length, total = m.clues.length;
    if (!e || !found || !total) continue;
    const text = (found >= total ? e.full : e.partial)[lang].replace(/\{place\}/g, placeName(m.originPoiId));
    out.push({ title: e.title[lang], text, found, total });
  }
  return out;
}

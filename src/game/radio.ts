// Radio di servizio: la centrale chiama ogni tanto, chiede notizie, segnala qualcosa. Si risponde con R.
// Ogni tanto la chiamata non arriva dalla centrale: poco dopo la centrale vera dice di non aver chiamato.
import type { L10n, Lang } from '../core/contracts';
import { streamFor, type Rng } from '../core/rng';

export type CallKind = 'check' | 'tip' | 'weather' | 'wrong';

export interface RadioCall {
  id: number;
  kind: CallKind;
  at: number;
  /** Fino a quando si può rispondere (s simulati). */
  until: number;
  reminded: boolean;
  answered: boolean;
  poiId?: string;
}

export interface RadioWorld {
  time: number;
  lang: Lang;
  officer: { first: string; last: string };
  /** Luoghi di cui la centrale può parlare (misteri, incarichi aperti). */
  tipPoi(): { id: string; name: L10n } | null;
  badWeather(): boolean;
  /** Il bosco è "attivo": c'è una presenza, un incontro o un osservatore. */
  uneasy(): boolean;
}

export interface RadioLine { text: string; speaker: string; sound?: boolean; event?: 'radio_call' | 'radio_answered' | 'radio_missed' | 'radio_wrong' }

const L = (it: string, en: string): L10n => ({ it, en });
const SPEAKER = L('Centrale', 'Dispatch');
const ME = L('Tu', 'You');

const CHECK = [
  L('Centrale a {last}, mi ricevi? Tutto regolare lì?', 'Dispatch to {last}, do you copy? All quiet out there?'),
  L('{last}, qui centrale. Dammi un aggiornamento quando puoi.', '{last}, dispatch here. Give me an update when you can.'),
  L('Centrale per {last}. Posizione e situazione, per favore.', 'Dispatch for {last}. Position and status, please.'),
  L('{first}, ci sei? Il collega chiede se ti serve qualcosa.', '{first}, you there? Your partner asks if you need anything.'),
];
const TIP = [
  L('{last}, ci segnalano una luce dalle parti di {poi}. Se passi, dai un’occhiata.', '{last}, we’ve had a report of a light near {poi}. Take a look if you pass by.'),
  L('Centrale a {last}: un escursionista dice di aver sentito voci verso {poi}. Niente di urgente.', 'Dispatch to {last}: a hiker says he heard voices towards {poi}. Nothing urgent.'),
  L('{last}, una signora ha chiamato per dei rumori vicino a {poi}. Sarà un animale.', '{last}, a lady called about noises near {poi}. Probably an animal.'),
];
const WEATHER = [
  L('{last}, qui centrale. Il tempo peggiora: copriti e non allontanarti troppo dalla macchina.', '{last}, dispatch. Weather’s getting worse: wrap up and don’t stray too far from the car.'),
  L('Centrale a {last}: il meteo dà freddo intenso nelle prossime ore. Se serve, scaldati in macchina.', 'Dispatch to {last}: forecast says hard cold for the next few hours. Warm up in the car if you need to.'),
];
const WRONG = [
  L('{first}… chi è quello dietro di te?', '{first}… who is that standing behind you?'),
  L('{last}, ripeti… non ti sentiamo… sei già passato di lì. Due volte.', '{last}, say again… we can’t hear you… you’ve already been there. Twice.'),
  L('Torna alla macchina, {first}. Non ti fermare. Non voltarti.', 'Go back to the car, {first}. Don’t stop. Don’t turn around.'),
  L('Centrale a {last}… ti vediamo. Perché spegni la torcia?', 'Dispatch to {last}… we can see you. Why do you keep turning the torch off?'),
  L('Siamo in tre a cercarti, {first}. Tu sei dove sei sempre stato.', 'There are three of us looking for you, {first}. You are where you have always been.'),
];
const REMIND = [
  L('{last}, rispondi. Mi ricevi?', '{last}, answer please. Do you copy?'),
  L('{first}? Centrale. Rispondi quando puoi.', '{first}? Dispatch. Answer when you can.'),
];
const MY_ANSWER = [
  L('Qui {last}. Tutto tranquillo, proseguo il giro.', '{last} here. All quiet, carrying on with the round.'),
  L('Ricevo. Sto controllando, vi aggiorno.', 'Copy. Checking things now, will update.'),
  L('{last}, ricevuto. Per ora niente di strano.', '{last}, copy. Nothing odd so far.'),
];
const MY_ANSWER_TIP = [L('Ricevuto, passo da {poi}.', 'Copy, I’ll swing by {poi}.'), L('Ok, ci vado appena posso.', 'Okay, heading there when I can.')];
const MY_ANSWER_WRONG = [L('Centrale? Ripetete, non ho capito.', 'Dispatch? Say again, I didn’t get that.'), L('…Chi parla?', '…Who is this?')];
const ACK = [L('Ricevuto, {last}. Passo e chiudo.', 'Copy, {last}. Over and out.'), L('Bene. Fatti sentire.', 'Good. Keep in touch.')];
const DENY = [
  L('{last}, qui centrale. Ci hai cercato? Da qui non risulta nessuna chiamata negli ultimi venti minuti.', '{last}, dispatch here. Were you trying to reach us? We show no calls in the last twenty minutes.'),
  L('Centrale a {last}: il collega dice che non ti abbiamo chiamato. Controlla la radio.', 'Dispatch to {last}: your partner says we never called you. Check your radio.'),
];

/** Secondi per rispondere a una chiamata. */
export const ANSWER_WINDOW = 20;

export class DispatchRadio {
  private r: Rng;
  private next: number;
  private n = 0;
  private deny: number | null = null;
  current: RadioCall | null = null;
  calls = 0;
  answered = 0;

  constructor(seed: number) {
    this.r = streamFor(seed, 'encounters').fork('radio');
    this.next = this.r.range(160, 300);
  }

  private fmt(w: RadioWorld, l: L10n, poi?: string): string {
    return l[w.lang].replace(/\{first\}/g, w.officer.first).replace(/\{last\}/g, w.officer.last).replace(/\{poi\}/g, poi ?? '');
  }

  step(w: RadioWorld, quiet: boolean): RadioLine[] {
    const out: RadioLine[] = [];
    const sp = SPEAKER[w.lang];
    if (this.deny !== null && w.time >= this.deny) {
      this.deny = null;
      out.push({ text: this.fmt(w, this.r.pick(DENY)), speaker: sp, sound: true, event: 'radio_wrong' });
    }
    const c = this.current;
    if (c) {
      if (!c.answered && !c.reminded && c.kind !== 'wrong' && w.time > c.at + ANSWER_WINDOW * 0.55) {
        c.reminded = true;
        out.push({ text: this.fmt(w, this.r.pick(REMIND)), speaker: sp, sound: true });
      }
      if (w.time > c.until) {
        if (!c.answered) out.push({ text: '', speaker: sp, event: 'radio_missed' });
        if (c.kind === 'wrong') this.deny = w.time + this.r.range(18, 40);
        this.current = null;
      }
      return out;
    }
    if (w.time < this.next || quiet) return out;
    this.n++;
    let kind: CallKind = 'check';
    const roll = this.r.next();
    const tip = w.tipPoi();
    const wrongP = this.n < 2 ? 0 : w.uneasy() ? 0.35 : 0.14;
    if (roll < wrongP) kind = 'wrong';
    else if (w.badWeather() && roll < wrongP + 0.3) kind = 'weather';
    else if (tip && roll < wrongP + 0.55) kind = 'tip';
    const poi = kind === 'tip' ? tip! : undefined;
    const lines = kind === 'wrong' ? WRONG : kind === 'weather' ? WEATHER : kind === 'tip' ? TIP : CHECK;
    this.current = { id: this.n, kind, at: w.time, until: w.time + ANSWER_WINDOW, reminded: false, answered: false, poiId: poi?.id };
    this.calls++;
    out.push({ text: this.fmt(w, this.r.pick(lines), poi?.name[w.lang]), speaker: sp, sound: true, event: 'radio_call' });
    this.next = w.time + this.r.range(260, 520);
    return out;
  }

  /** Il giocatore preme R. */
  answer(w: RadioWorld, poiName?: string): RadioLine[] {
    const c = this.current;
    if (!c || c.answered) return [];
    c.answered = true;
    this.answered++;
    const me = ME[w.lang], sp = SPEAKER[w.lang];
    if (c.kind === 'wrong') {
      // dall'altra parte, solo fruscio
      return [{ text: this.fmt(w, this.r.pick(MY_ANSWER_WRONG)), speaker: me, sound: true, event: 'radio_answered' }, { text: '…', speaker: sp }];
    }
    const mine = c.kind === 'tip' ? this.r.pick(MY_ANSWER_TIP) : this.r.pick(MY_ANSWER);
    c.until = Math.min(c.until, w.time + 1);
    return [
      { text: this.fmt(w, mine, poiName), speaker: me, sound: true, event: 'radio_answered' },
      { text: this.fmt(w, this.r.pick(ACK)), speaker: sp },
    ];
  }

  pending(): boolean { return !!this.current && !this.current.answered; }
}

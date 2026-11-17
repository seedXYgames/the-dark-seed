// Interfaccia DOM di The Dark Seed: schermate, HUD, telefono, didascalia d'ispezione ed effetti
// a schermo intero, sovrapposti al canvas WebGL. L'interfaccia non chiede mai il pointer lock.
import './ui.css';
import type { IUi, MapView, MysteryMood, PhoneTab, PhoneView, ScreenId, SummaryView, UiCallbacks } from '../core/api';
import type { Lang, Settings } from '../core/contracts';
import { t } from '../i18n/strings';
import { ScreenEffects } from './effects';
import { Phone } from './phone';
import { drawMap } from './map';
import { Screens, applyI18n, el, i18nAria } from './screens';

/** Fase di sviluppo: accanto a "Evento insolito" si mostra la causa tecnica. Mettere false per la versione finale. */
const DEBUG_EVENT_REASON = true;
import { sanitizeSettings, saveSettings } from './settingsStore';

const NOTICE_MS = 4000;
const NOTICE_MAX = 3;
const SUBTITLE_MS = 7000;
const HINTS_MS = 12000;
const TORCH_SHOW_MS = 3500;

const SCREEN_IDS: readonly ScreenId[] = ['loading', 'menu', 'settings', 'intro', 'game', 'pause', 'summary'];

export class Ui implements IUi {
  private settings: Settings;
  private screen: ScreenId = 'loading';
  private readonly screens: Screens;
  private readonly phone: Phone;
  private readonly effects: ScreenEffects;

  private readonly hud: HTMLElement;
  private readonly mysteryEl: HTMLElement;
  private readonly mysteryLabel: HTMLElement;
  private readonly mysteryReason: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly subSpeaker: HTMLElement;
  private readonly subText: HTMLElement;
  private readonly noticesEl: HTMLElement;
  private readonly hintsEl: HTMLElement;
  private readonly torchEl: HTMLElement;
  private readonly torchFill: HTMLElement;
  private readonly torchSpares: HTMLElement;
  private readonly unreadEl: HTMLElement;
  private readonly unreadCount: HTMLElement;
  private readonly inspectEl: HTMLElement;
  private readonly inspectTitle: HTMLElement;
  private readonly inspectNote: HTMLElement;
  private readonly inspectHint: HTMLElement;

  private subtitleTimer = 0;
  private hintsTimer = 0;
  private torchTimer = 0;
  private torchSig = '';
  private promptText: string | null = null;
  private readonly noticeQueue: string[] = [];
  private noticeActive = 0;
  private phoneOpenedAt = -1e9;
  // navigatore: il telefono resta in mano sulla mappa mentre si cammina
  private readonly navEl: HTMLElement;
  private readonly navCanvas: HTMLCanvasElement;
  private readonly navClock: HTMLElement;
  private navOn = false;
  private readonly onKeyDown: (ev: KeyboardEvent) => void;
  private readonly onClick: (ev: MouseEvent) => void;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: UiCallbacks,
    settings: Settings,
  ) {
    this.settings = sanitizeSettings(settings, settings?.lang === 'en' ? 'en' : 'it');
    root.classList.add('tds-ui');
    root.lang = this.settings.lang;

    this.effects = new ScreenEffects();

    // ---- HUD
    this.hud = el('div', 'tds-hud');
    this.hud.hidden = true;
    this.mysteryEl = el('div', 'tds-event');
    this.mysteryEl.hidden = true;
    this.mysteryEl.setAttribute('role', 'status');
    const eventDot = el('span', 'tds-event-dot'); eventDot.setAttribute('aria-hidden', 'true');
    this.mysteryLabel = el('span');
    this.mysteryReason = el('span', 'tds-event-why');
    this.mysteryEl.append(eventDot, this.mysteryLabel, this.mysteryReason);
    this.hud.appendChild(this.mysteryEl);
    const dot = el('div', 'tds-dot');
    dot.setAttribute('aria-hidden', 'true');
    this.promptEl = el('div', 'tds-prompt');
    this.promptEl.hidden = true;
    this.promptEl.setAttribute('role', 'status');

    const bottom = el('div', 'tds-bottom');
    this.subtitleEl = el('div', 'tds-subtitle');
    this.subtitleEl.hidden = true;
    this.subtitleEl.setAttribute('aria-live', 'polite');
    this.subSpeaker = el('span', 'tds-sub-speaker');
    this.subText = el('span', 'tds-sub-text');
    this.subtitleEl.append(this.subSpeaker, this.subText);
    this.inspectEl = el('div', 'tds-inspect');
    this.inspectEl.hidden = true;
    this.inspectTitle = el('div', 'tds-inspect-title');
    this.inspectNote = el('div', 'tds-inspect-note');
    this.inspectHint = el('div', 'tds-inspect-hint');
    this.inspectEl.append(this.inspectTitle, this.inspectNote, this.inspectHint);
    bottom.append(this.subtitleEl, this.inspectEl);

    this.noticesEl = el('div', 'tds-notices');
    this.noticesEl.setAttribute('role', 'log');
    this.noticesEl.setAttribute('aria-live', 'polite');
    this.hintsEl = el('ul', 'tds-hints');
    this.hintsEl.hidden = true;

    const corner = el('div', 'tds-corner');
    this.unreadEl = el('div', 'tds-unread');
    this.unreadEl.hidden = true;
    this.unreadEl.setAttribute('role', 'img');
    const env = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    env.setAttribute('viewBox', '0 0 24 24');
    env.setAttribute('aria-hidden', 'true');
    env.setAttribute('class', 'tds-ico');
    env.innerHTML = '<path d="M3.5 6h17v12h-17z"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>';
    this.unreadCount = el('span', 'tds-unread-n');
    this.unreadEl.append(env, this.unreadCount);
    this.torchEl = el('div', 'tds-torch');
    this.torchEl.setAttribute('role', 'img');
    i18nAria(this.torchEl, 'hud.torch');
    const batt = el('span', 'tds-batt');
    this.torchFill = el('i', 'tds-batt-fill');
    batt.appendChild(this.torchFill);
    this.torchSpares = el('span', 'tds-torch-spares');
    this.torchEl.append(batt, this.torchSpares);
    corner.append(this.unreadEl, this.torchEl);

    this.navEl = el('div', 'tds-nav');
    this.navEl.hidden = true;
    this.navEl.setAttribute('aria-hidden', 'true');
    const navScreen = el('div', 'tds-nav-screen');
    const navBar = el('div', 'tds-nav-bar');
    this.navClock = el('span', 'tds-nav-clock');
    const navKey = el('span', 'tds-nav-key', 'M');
    navBar.append(this.navClock, navKey);
    this.navCanvas = el('canvas', 'tds-nav-map');
    navScreen.append(navBar, this.navCanvas);
    this.navEl.appendChild(navScreen);

    this.hud.append(dot, this.promptEl, bottom, this.noticesEl, this.hintsEl, corner, this.navEl);

    // ---- telefono e schermate
    this.phone = new Phone(callbacks, () => this.settings.lang, () => this.userClosePhone());
    this.screens = new Screens({
      callbacks,
      lang: () => this.settings.lang,
      settings: () => this.settings,
      changeSettings: (next) => this.changeSettings(next),
      go: (screen) => this.show(screen),
    });

    root.append(this.effects.el, this.hud, this.phone.el, this.screens.el);
    applyI18n(this.hud, this.settings.lang);

    this.onClick = (ev) => {
      const target = ev.target instanceof Element ? ev.target.closest('button, summary') : null;
      if (!target || !root.contains(target)) return;
      if ((target as HTMLButtonElement).disabled || (target as HTMLElement).dataset.silent !== undefined) return;
      this.callbacks.onUiSound('ui');
    };
    root.addEventListener('click', this.onClick);

    this.onKeyDown = (ev) => this.handleKey(ev);
    window.addEventListener('keydown', this.onKeyDown, true);

    this.show('loading');
  }

  /** Rimuove ascoltatori ed elementi (utile per test e ricaricamenti a caldo). */
  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.root.removeEventListener('click', this.onClick);
    this.phone.hide();
    this.effects.dispose();
    window.clearTimeout(this.subtitleTimer);
    window.clearTimeout(this.hintsTimer);
    window.clearTimeout(this.torchTimer);
    this.hud.remove();
    this.phone.el.remove();
    this.screens.el.remove();
  }

  // ------------------------------------------------------------ impostazioni e schermate

  setSettings(settings: Settings): void {
    const next = sanitizeSettings(settings, this.settings.lang);
    const langChanged = next.lang !== this.settings.lang;
    this.settings = next;
    if (langChanged) this.relabel();
    else this.screens.syncSettings();
  }

  private changeSettings(next: Settings): void {
    const clean = sanitizeSettings(next, this.settings.lang);
    const langChanged = clean.lang !== this.settings.lang;
    this.settings = clean;
    saveSettings(clean);
    if (langChanged) this.relabel();
    else this.screens.syncSettings();
    this.callbacks.onSettingsChanged({ lang: clean.lang, gfx: { ...clean.gfx } });
  }

  private relabel(): void {
    const lang: Lang = this.settings.lang;
    this.root.lang = lang;
    applyI18n(this.hud, lang);
    this.inspectHint.textContent = t(lang, 'hint.inspect');
    this.torchSig = '';
    this.screens.relabel();
    this.phone.relabel();
  }

  show(screen: ScreenId): void {
    if (!SCREEN_IDS.includes(screen)) return;
    this.screen = screen;
    this.root.dataset.screen = screen;
    const inGame = screen === 'game';
    this.hud.hidden = !inGame;
    if (!inGame && screen !== 'pause') {
      // fuori dal turno: telefono chiuso e stato dell'HUD azzerato
      this.phone.hide();
      this.root.classList.remove('is-phone-open');
      if (screen !== 'summary') { this.resetHud(); this.setNavigator(false); }
    }
    this.phone.el.classList.toggle('is-suspended', !inGame);
    this.screens.show(screen);
  }

  current(): ScreenId {
    return this.screen;
  }

  private resetHud(): void {
    this.setMystery({ active: false, intensity: 0, watched: false });
    this.setPrompt(null);
    this.setSubtitle(null);
    this.setHints([]);
    this.hideInspect();
    this.noticeQueue.length = 0;
    this.noticesEl.textContent = '';
    this.noticeActive = 0;
    this.setUnread(0);
    this.torchEl.classList.remove('is-visible');
  }

  // ------------------------------------------------------------ HUD

  setPrompt(text: string | null): void {
    const v = text && text.length > 0 ? text : null;
    if (v === this.promptText) return;
    this.promptText = v;
    this.promptEl.hidden = v === null;
    this.promptEl.textContent = v ?? '';
  }

  setSubtitle(text: string | null, speaker?: string): void {
    window.clearTimeout(this.subtitleTimer);
    if (!text) {
      this.subtitleEl.hidden = true;
      this.subtitleEl.classList.remove('is-fading');
      return;
    }
    this.subSpeaker.textContent = speaker ? speaker : '';
    this.subSpeaker.hidden = !speaker;
    this.subText.textContent = text;
    this.subtitleEl.classList.remove('is-fading');
    this.subtitleEl.hidden = false;
    this.subtitleTimer = window.setTimeout(() => {
      this.subtitleEl.classList.add('is-fading');
      this.subtitleTimer = window.setTimeout(() => {
        this.subtitleEl.hidden = true;
        this.subtitleEl.classList.remove('is-fading');
      }, 700);
    }, SUBTITLE_MS);
  }

  notify(text: string): void {
    if (!text) return;
    this.noticeQueue.push(text);
    this.pumpNotices();
  }

  private pumpNotices(): void {
    while (this.noticeActive < NOTICE_MAX && this.noticeQueue.length > 0) {
      const text = this.noticeQueue.shift() as string;
      const n = el('div', 'tds-notice', text);
      this.noticesEl.appendChild(n);
      this.noticeActive += 1;
      window.setTimeout(() => {
        n.classList.add('is-leaving');
        window.setTimeout(() => {
          n.remove();
          this.noticeActive = Math.max(0, this.noticeActive - 1);
          this.pumpNotices();
        }, 420);
      }, NOTICE_MS);
    }
  }

  setHints(lines: string[]): void {
    window.clearTimeout(this.hintsTimer);
    this.hintsEl.textContent = '';
    this.hintsEl.classList.remove('is-fading');
    const list = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string' && l.length > 0) : [];
    if (list.length === 0) {
      this.hintsEl.hidden = true;
      return;
    }
    for (const l of list) this.hintsEl.appendChild(el('li', undefined, l));
    this.hintsEl.hidden = false;
    this.hintsTimer = window.setTimeout(() => {
      this.hintsEl.classList.add('is-fading');
      this.hintsTimer = window.setTimeout(() => {
        this.hintsEl.hidden = true;
        this.hintsEl.classList.remove('is-fading');
      }, 1200);
    }, HINTS_MS);
  }

  setTorch(charge: number, on: boolean, spares: number): void {
    const c = Math.min(1, Math.max(0, Number.isFinite(charge) ? charge : 0));
    const sp = Math.max(0, Math.floor(Number.isFinite(spares) ? spares : 0));
    const low = c < 0.2;
    // l'indicatore riappare solo per cambi significativi: accensione, pile, soglie del 10%
    const sig = `${on ? 1 : 0}|${sp}|${Math.ceil(c * 10)}|${low ? 1 : 0}|${c <= 0 ? 1 : 0}`;
    const pct = Math.round(c * 100);
    this.torchFill.style.width = `${pct}%`;
    if (sig === this.torchSig) return;
    const first = this.torchSig === '';
    this.torchSig = sig;
    this.torchEl.classList.toggle('is-low', low);
    this.torchEl.classList.toggle('is-on', on);
    this.torchSpares.textContent = sp > 0 ? `+${sp}` : '';
    this.torchSpares.setAttribute('aria-label', t(this.settings.lang, 'hud.spares', { n: sp }));
    if (first) return;
    this.torchEl.classList.add('is-visible');
    window.clearTimeout(this.torchTimer);
    this.torchTimer = window.setTimeout(() => this.torchEl.classList.remove('is-visible'), TORCH_SHOW_MS);
  }

  setPauseInfo(seed: number): void {
    this.screens.setPauseInfo(seed);
  }

  setUnread(count: number): void {
    const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    this.unreadEl.hidden = n === 0;
    this.unreadCount.textContent = n > 9 ? '9+' : String(n);
    this.unreadEl.setAttribute('aria-label', t(this.settings.lang, 'hud.unread', { n }));
  }

  // ------------------------------------------------------------ navigatore

  setNavigator(on: boolean): void {
    this.navOn = on;
    this.navEl.hidden = !on;
    this.root.classList.toggle('is-nav-on', on);
  }

  isNavigatorOn(): boolean {
    return this.navOn;
  }

  /** Ridisegna il navigatore: mappa centrata sul giocatore, nord in alto, segnalini dei rapporti. */
  updateNavigator(map: MapView, clock: string): void {
    if (!this.navOn || this.phone.isOpen()) return;
    const c = this.navCanvas;
    const w = Math.max(80, c.clientWidth), h = Math.max(80, c.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (this.navClock.textContent !== clock) this.navClock.textContent = clock;
    const lang = this.settings.lang;
    drawMap(ctx, map, pw, ph, {
      car: t(lang, 'phone.map.car'), north: t(lang, 'phone.map.north'), scale: t(lang, 'phone.map.scale', { n: 100 }), weak: t(lang, 'phone.map.weak'),
    }, performance.now() / 1000, { follow: { span: 300 } });
  }

  // ------------------------------------------------------------ telefono

  openPhone(tab?: PhoneTab): void {
    this.phoneOpenedAt = performance.now();
    this.phone.show(tab);
    this.root.classList.add('is-phone-open');
  }

  /** Chiusura richiesta dal gioco: non richiama onPhoneClosed. */
  closePhone(): void {
    this.phone.hide();
    this.root.classList.remove('is-phone-open');
  }

  /** Mirino della fotocamera del telefono (null se non è sullo schermo). */
  phoneViewfinder(): HTMLCanvasElement | null {
    return this.phone.viewfinder();
  }

  isPhoneOpen(): boolean {
    return this.phone.isOpen();
  }

  updatePhone(view: PhoneView): void {
    this.phone.update(view);
  }

  /** Chiusura decisa dal giocatore (pulsante, T, Esc): avvisa il gioco. */
  private userClosePhone(): void {
    if (!this.phone.isOpen()) return;
    this.closePhone();
    this.callbacks.onPhoneClosed();
  }

  // ------------------------------------------------------------ ispezione, riepilogo, effetti

  showInspect(title: string, note: string): void {
    this.inspectTitle.textContent = title;
    this.inspectNote.textContent = note;
    this.inspectNote.hidden = !note;
    this.inspectHint.textContent = t(this.settings.lang, 'hint.inspect');
    this.inspectEl.hidden = false;
  }

  hideInspect(): void {
    this.inspectEl.hidden = true;
  }

  showSummary(view: SummaryView): void {
    this.screens.showSummary(view);
    this.show('summary');
  }

  setMystery(mood: MysteryMood): void {
    this.mysteryEl.hidden = !mood.active;
    const key = mood.watched ? 'hud.watched' : 'hud.strangeEvent';
    if (this.mysteryLabel.dataset.i18n !== key) {
      this.mysteryLabel.dataset.i18n = key;
      this.mysteryLabel.textContent = t(this.settings.lang, key);
    }
    const why = DEBUG_EVENT_REASON && mood.active ? mood.debugReason ?? '' : '';
    if (this.mysteryReason.textContent !== why) this.mysteryReason.textContent = why;
    this.mysteryReason.hidden = !why;
  }

  setScreenEffect(kind: 'none' | 'code_rain' | 'white' | 'static' | 'flash', intensity: number): void {
    this.effects.set(kind, intensity);
  }

  setLoadingProgress(p: number, label?: string): void {
    this.screens.setLoadingProgress(p, label);
  }

  // ------------------------------------------------------------ tastiera

  private handleKey(ev: KeyboardEvent): void {
    if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const key = ev.key;
    if (this.screen === 'game') {
      if (!this.phone.isOpen()) return;
      if (ev.code === 'KeyM' && !ev.repeat) {
        ev.preventDefault(); ev.stopImmediatePropagation();
        this.openPhone('map');
        return;
      }
      const isT = key === 't' || key === 'T' || ev.code === 'KeyT';
      if (key !== 'Escape' && !isT) return;
      // il tasto che ha appena aperto il telefono non deve richiuderlo nello stesso evento
      if (ev.repeat || performance.now() - this.phoneOpenedAt < 150) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.userClosePhone();
      return;
    }
    if (this.screen === 'pause' && key === 'Escape' && this.screens.isConfirmOpen()) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.screens.cancelConfirm();
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const target = ev.target;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      if (this.screens.navigate(key === 'ArrowDown' ? 1 : -1)) ev.preventDefault();
      return;
    }
    if ((this.screen === 'settings' || this.screen === 'intro') && key === 'Escape') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this.show('menu');
    }
  }
}

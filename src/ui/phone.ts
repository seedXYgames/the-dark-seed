// Telefono di servizio: messaggi, incarichi e rapporti, fotocamera, galleria, mappa.
// updatePhone può arrivare più volte al secondo: ogni scheda viene ricostruita solo quando
// cambia la "firma" dei dati che mostra, e solo se è la scheda visibile.
import type { MissionView, PhoneTab, PhoneView, UiCallbacks } from '../core/api';
import type { Lang, Photo } from '../core/contracts';
import { t } from '../i18n/strings';
import { drawMap, effectiveSignal } from './map';
import { applyI18n, el, i18n, i18nAria } from './screens';

const TABS: PhoneTab[] = ['messages', 'tasks', 'camera', 'gallery', 'map'];

const ICONS: Record<PhoneTab | 'close' | 'torch', string> = {
  messages: '<path d="M4 5h16v11H9l-4 3.5V16H4z"/>',
  tasks: '<path d="M7 4h10v16H7z"/><path d="M9.5 9.5l1.5 1.5 3-3M9.5 15h5"/>',
  camera: '<path d="M4 8h3.5l1.5-2h6l1.5 2H20v11H4z"/><circle cx="12" cy="13.2" r="3.2"/>',
  gallery: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  map: '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z"/><path d="M9 4v14M15 6v14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  torch: '<path d="M9 3h6v4l-1.5 2.5V20h-3V9.5L9 7z"/>',
};

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'tds-ico');
  svg.innerHTML = ICONS[name];
  return svg;
}

interface Editor {
  missionId: string;
  draft: string;
  shown: number;
  timer: number;
  ticks: number;
  attach: Set<number>;
  root: HTMLElement;
  textEl: HTMLElement;
  photosEl: HTMLElement;
  attachedEl: HTMLElement;
  submit: HTMLButtonElement;
  skipEl: HTMLElement;
  photoSig: string;
}

export class Phone {
  readonly el: HTMLElement;
  private open = false;
  private tab: PhoneTab = 'messages';
  private view: PhoneView | null = null;
  /** Mirino dal vivo: copia dell'inquadratura del gioco, riusata tra un aggiornamento e l'altro. */
  private readonly finder: HTMLCanvasElement = (() => {
    const c = document.createElement('canvas');
    c.className = 'tds-cam-live';
    c.width = 270; c.height = 360;
    return c;
  })();
  private readonly sig: Record<PhoneTab, string> = { messages: '', tasks: '', camera: '', gallery: '', map: '' };

  private readonly panes: Record<PhoneTab, HTMLElement>;
  private readonly tabBtns: Record<PhoneTab, HTMLButtonElement>;
  private readonly clockEl: HTMLElement;
  private readonly signalEl: HTMLElement;
  private readonly torchEl: HTMLElement;
  private readonly torchPct: HTMLElement;
  private readonly phoneBatt: HTMLElement;
  private readonly phoneBattFill: HTMLElement;
  private readonly msgBadge: HTMLElement;
  private statusSig = '';

  private readonly notifiedRead = new Set<number>();
  private readTimer = 0;
  private lastMsgCount = -1;

  private readonly expanded = new Set<string>();
  private editor: Editor | null = null;

  private readonly thumbs = new Map<number, HTMLButtonElement>();
  private enlarged: number | null = null;

  private mapCanvas: HTMLCanvasElement | null = null;
  private mapTimer = 0;

  constructor(
    private readonly cb: UiCallbacks,
    private readonly lang: () => Lang,
    private readonly requestClose: () => void,
  ) {
    this.el = el('aside', 'tds-phone');
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    i18nAria(this.el, 'phone.label');

    const body = el('div', 'tds-phone-body');
    const close = el('button', 'tds-phone-close');
    close.type = 'button';
    i18nAria(close, 'phone.close');
    close.appendChild(icon('close'));
    close.addEventListener('click', () => this.requestClose());

    const screen = el('div', 'tds-phone-screen');
    const status = el('div', 'tds-status');
    this.clockEl = el('span', 'tds-status-clock', '--:--');
    const right = el('span', 'tds-status-right');
    this.signalEl = el('span', 'tds-signal');
    this.signalEl.setAttribute('role', 'img');
    for (let i = 0; i < 4; i++) this.signalEl.appendChild(el('i'));
    this.torchEl = el('span', 'tds-status-torch');
    this.torchEl.setAttribute('role', 'img');
    this.torchEl.appendChild(icon('torch'));
    this.torchPct = el('span', 'tds-status-pct', '');
    this.torchEl.appendChild(this.torchPct);
    this.phoneBatt = el('span', 'tds-status-phone');
    this.phoneBatt.setAttribute('role', 'img');
    const pb = el('span', 'tds-batt');
    this.phoneBattFill = el('i', 'tds-batt-fill');
    pb.appendChild(this.phoneBattFill);
    this.phoneBatt.appendChild(pb);
    right.append(this.signalEl, this.torchEl, this.phoneBatt);
    status.append(this.clockEl, right);

    const content = el('div', 'tds-phone-content');
    const panes = {} as Record<PhoneTab, HTMLElement>;
    const btns = {} as Record<PhoneTab, HTMLButtonElement>;
    const tabs = el('nav', 'tds-tabs');
    tabs.setAttribute('role', 'tablist');
    this.msgBadge = el('span', 'tds-tab-badge');
    this.msgBadge.hidden = true;
    for (const id of TABS) {
      const pane = el('section', `tds-pane tds-pane-${id}`);
      pane.hidden = true;
      pane.setAttribute('role', 'tabpanel');
      panes[id] = pane;
      content.appendChild(pane);
      const b = el('button', 'tds-tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.appendChild(icon(id));
      b.appendChild(i18n(el('span', 'tds-tab-label'), `phone.tab.${id}`));
      if (id === 'messages') b.appendChild(this.msgBadge);
      b.addEventListener('click', () => this.setTab(id));
      btns[id] = b;
      tabs.appendChild(b);
    }
    this.panes = panes;
    this.tabBtns = btns;
    screen.append(status, content, tabs);
    body.append(close, screen);
    this.el.appendChild(body);
    applyI18n(this.el, this.lang());
  }

  // ------------------------------------------------------------ API

  /** Il mirino, se la fotocamera è aperta e visibile; null altrimenti. */
  viewfinder(): HTMLCanvasElement | null {
    return this.open && this.tab === 'camera' && this.finder.isConnected ? this.finder : null;
  }

  isOpen(): boolean {
    return this.open;
  }

  show(tab?: PhoneTab): void {
    this.open = true;
    this.el.hidden = false;
    this.setTab(tab && TABS.includes(tab) ? tab : this.tab, true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.closeEditor();
    this.enlarged = null;
    this.sig.gallery = '';
    window.clearTimeout(this.readTimer);
    this.readTimer = 0;
    this.stopMapTimer();
  }

  update(view: PhoneView): void {
    this.view = view;
    if (this.open) this.render();
  }

  relabel(): void {
    applyI18n(this.el, this.lang());
    for (const id of TABS) this.sig[id] = '';
    this.statusSig = '';
    if (this.editor) {
      const id = this.editor.missionId;
      this.closeEditor();
      if (this.open) this.openEditor(id);
    }
    if (this.open) this.render();
  }

  // ------------------------------------------------------------ struttura

  private setTab(tab: PhoneTab, force = false): void {
    if (tab !== this.tab || force) {
      if (tab !== 'tasks') this.closeEditor();
      if (tab !== 'gallery') this.enlarged = null;
      if (tab !== 'map') this.stopMapTimer();
      this.tab = tab;
      this.sig[tab] = '';
    }
    for (const id of TABS) {
      this.panes[id].hidden = id !== tab;
      this.tabBtns[id].classList.toggle('is-on', id === tab);
      this.tabBtns[id].setAttribute('aria-selected', id === tab ? 'true' : 'false');
    }
    this.render();
  }

  private render(): void {
    const v = this.view;
    this.renderStatus();
    if (!v) return;
    switch (this.tab) {
      case 'messages': this.renderMessages(v); break;
      case 'tasks': this.renderTasks(v); break;
      case 'camera': this.renderCamera(v); break;
      case 'gallery': this.renderGallery(v); break;
      case 'map': this.renderMap(v); break;
    }
  }

  private renderStatus(): void {
    const v = this.view;
    const lang = this.lang();
    const clock = v ? v.clock : '--:--';
    const signal = v ? effectiveSignal(v.signal, v.map.glitch) : 0;
    const pct = v ? Math.round(Math.min(1, Math.max(0, v.torchCharge)) * 100) : 0;
    const unread = v ? v.messages.reduce((n, m) => n + (m.read ? 0 : 1), 0) : 0;
    const ph = v ? Math.round(Math.min(1, Math.max(0, v.phoneBattery ?? 1)) * 100) : 100;
    const sig = `${lang}|${clock}|${signal}|${pct}|${unread}|${ph}`;
    if (sig === this.statusSig) return;
    this.statusSig = sig;
    this.clockEl.textContent = clock;
    this.signalEl.dataset.level = String(signal);
    this.signalEl.setAttribute('aria-label', t(lang, 'phone.status.signal', { n: signal }));
    this.torchPct.textContent = `${pct}%`;
    this.phoneBattFill.style.width = `${ph}%`;
    this.phoneBatt.classList.toggle('is-low', ph < 15);
    this.phoneBatt.setAttribute('aria-label', t(lang, 'phone.status.phone', { n: ph }));
    this.torchEl.classList.toggle('is-low', pct < 20);
    this.torchEl.setAttribute('aria-label', t(lang, 'phone.status.torch', { n: pct }));
    this.msgBadge.hidden = unread === 0;
    this.msgBadge.textContent = unread > 9 ? '9+' : String(unread);
  }

  // ------------------------------------------------------------ messaggi

  private renderMessages(v: PhoneView): void {
    const lang = this.lang();
    const sig = `${lang}|${v.messages.map((m) => `${m.id}${m.read ? 'r' : 'u'}`).join(',')}`;
    if (sig !== this.sig.messages) {
      this.sig.messages = sig;
      const pane = this.panes.messages;
      const prevScroll = pane.scrollTop;
      const atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 24;
      pane.textContent = '';
      if (v.messages.length === 0) {
        pane.appendChild(el('p', 'tds-empty', t(lang, 'phone.noMessages')));
      } else {
        const list = el('div', 'tds-thread');
        const sorted = v.messages.slice().sort((a, b) => a.t - b.t || a.id - b.id);
        let prevKey = '';
        let firstUnread: HTMLElement | null = null;
        for (const m of sorted) {
          const mine = m.from === 'self';
          const key = `${m.from}|${m.sender}`;
          if (key !== prevKey) {
            list.appendChild(el('div', `tds-sender tds-from-${m.from}${mine ? ' is-mine' : ''}`, m.sender));
            prevKey = key;
          }
          const b = el('div', `tds-bubble tds-from-${m.from}${mine ? ' is-mine' : ''}${m.read ? '' : ' is-unread'}`, m.text);
          if (!m.read && !firstUnread) firstUnread = b;
          list.appendChild(b);
        }
        pane.appendChild(list);
        const grew = v.messages.length !== this.lastMsgCount;
        if (grew || atBottom) {
          if (firstUnread) pane.scrollTop = Math.max(0, firstUnread.offsetTop - 40);
          else pane.scrollTop = pane.scrollHeight;
        } else pane.scrollTop = prevScroll;
      }
      this.lastMsgCount = v.messages.length;
    }
    if (!this.readTimer && v.messages.some((m) => !m.read && !this.notifiedRead.has(m.id))) {
      this.readTimer = window.setTimeout(() => {
        this.readTimer = 0;
        if (!this.open || this.tab !== 'messages' || !this.view) return;
        for (const m of this.view.messages) {
          if (!m.read && !this.notifiedRead.has(m.id)) {
            this.notifiedRead.add(m.id);
            this.cb.onMessageRead(m.id);
          }
        }
      }, 900);
    }
  }

  // ------------------------------------------------------------ incarichi e rapporti

  private renderTasks(v: PhoneView): void {
    if (this.editor) {
      const still = v.missions.find((m) => m.id === this.editor?.missionId);
      if (!still || still.state !== 'inspected' || !still.canReport) this.closeEditor();
      else {
        this.renderEditorPhotos(v.photos);
        return;
      }
    }
    const lang = this.lang();
    const sig = `${lang}|${v.allReported}|${v.missions.map((m) => `${m.id}:${m.n}:${m.state}:${m.canReport}:${m.title}:${m.place}`).join(';')}|${v.reports
      .map((r) => `${r.id}:${r.missionId}`)
      .join(',')}|${Array.from(this.expanded).join(',')}`;
    if (sig === this.sig.tasks) return;
    this.sig.tasks = sig;
    const pane = this.panes.tasks;
    const scroll = pane.scrollTop;
    pane.textContent = '';
    if (v.missions.length === 0) {
      pane.appendChild(el('p', 'tds-empty', t(lang, 'phone.noTasks')));
      return;
    }
    if (v.allReported) pane.appendChild(el('p', 'tds-all-done', t(lang, 'phone.allReported')));
    for (const m of v.missions) pane.appendChild(this.missionCard(m, v, lang));
    pane.scrollTop = scroll;
  }

  private missionCard(m: MissionView, v: PhoneView, lang: Lang): HTMLElement {
    const card = el('article', `tds-task is-${m.state}`);
    const head = el('div', 'tds-task-head');
    const title = el('h4', 'tds-task-title', m.title);
    if (m.n) { const pin = el('span', `tds-task-pin is-${m.state}`, m.state === 'reported' ? '✓' : String(m.n)); pin.setAttribute('aria-hidden', 'true'); title.prepend(pin); }
    head.append(title, el('span', 'tds-chip', t(lang, `phone.state.${m.state}`)));
    card.append(head, el('p', 'tds-task-place', m.place));
    if (m.state === 'pending') {
      card.appendChild(el('p', 'tds-task-note', t(lang, 'phone.needInspect')));
    } else if (m.state === 'inspected' && m.canReport) {
      const b = el('button', 'tds-pbtn tds-pbtn-primary', t(lang, 'phone.writeReport'));
      b.type = 'button';
      b.addEventListener('click', () => this.openEditor(m.id));
      card.appendChild(b);
    } else if (m.state === 'reported') {
      const report = v.reports.filter((r) => r.missionId === m.id).pop();
      if (report) {
        const openNow = this.expanded.has(m.id);
        const b = el('button', 'tds-pbtn', t(lang, openNow ? 'phone.hideReport' : 'phone.readReport'));
        b.type = 'button';
        b.setAttribute('aria-expanded', openNow ? 'true' : 'false');
        b.addEventListener('click', () => {
          if (openNow) this.expanded.delete(m.id);
          else this.expanded.add(m.id);
          this.render();
        });
        card.appendChild(b);
        if (openNow) {
          card.appendChild(el('p', 'tds-filed', report.text));
          if (report.photoIds.length > 0) {
            card.appendChild(el('p', 'tds-task-note', t(lang, 'phone.report.attached', { n: report.photoIds.length })));
          }
        }
      }
    }
    return card;
  }

  private openEditor(missionId: string): void {
    const v = this.view;
    if (!v) return;
    const mission = v.missions.find((m) => m.id === missionId);
    if (!mission) return;
    this.closeEditor();
    const lang = this.lang();
    const pane = this.panes.tasks;
    pane.textContent = '';
    this.sig.tasks = '';
    const root = el('div', 'tds-editor');
    root.append(el('p', 'tds-editor-kicker', t(lang, 'phone.report.title')), el('h4', 'tds-task-title', mission.title), el('p', 'tds-task-place', mission.place));
    const textEl = el('div', 'tds-editor-text is-typing');
    textEl.setAttribute('aria-live', 'off');
    const skipEl = el('p', 'tds-task-note', t(lang, 'phone.report.skip'));
    const attachTitle = el('p', 'tds-editor-sub', t(lang, 'phone.report.attach'));
    const attachedEl = el('span', 'tds-editor-count');
    attachTitle.appendChild(attachedEl);
    const photosEl = el('div', 'tds-attach');
    const actions = el('div', 'tds-editor-actions');
    const cancel = el('button', 'tds-pbtn', t(lang, 'phone.report.cancel'));
    cancel.type = 'button';
    const submit = el('button', 'tds-pbtn tds-pbtn-primary', t(lang, 'phone.report.submit'));
    submit.type = 'button';
    submit.disabled = true;
    actions.append(cancel, submit);
    root.append(textEl, skipEl, attachTitle, photosEl, actions);
    pane.appendChild(root);
    pane.scrollTop = 0;

    let draft = '';
    try {
      draft = String(this.cb.getReportDraft(missionId) ?? '');
    } catch {
      draft = '';
    }
    const ed: Editor = {
      missionId, draft, shown: 0, timer: 0, ticks: 0, attach: new Set<number>(), root, textEl, photosEl, attachedEl, submit, skipEl, photoSig: '\u0000',
    };
    this.editor = ed;
    const finish = () => {
      window.clearInterval(ed.timer);
      ed.timer = 0;
      ed.shown = ed.draft.length;
      textEl.textContent = ed.draft;
      textEl.classList.remove('is-typing');
      skipEl.hidden = true;
      submit.disabled = false;
    };
    textEl.addEventListener('click', () => {
      if (ed.timer) finish();
    });
    cancel.addEventListener('click', () => {
      this.closeEditor();
      this.render();
    });
    submit.addEventListener('click', () => {
      if (submit.disabled) return;
      const ids = Array.from(ed.attach).sort((a, b) => a - b);
      this.closeEditor();
      this.cb.onUiSound('paper');
      this.cb.onSubmitReport(missionId, ids);
      this.render();
    });
    if (draft.length === 0) finish();
    else {
      ed.timer = window.setInterval(() => {
        ed.ticks += 1;
        ed.shown = Math.min(ed.draft.length, ed.shown + 2);
        textEl.textContent = ed.draft.slice(0, ed.shown);
        if (ed.ticks % 4 === 1) this.cb.onUiSound('typing');
        if (ed.shown >= ed.draft.length) finish();
        else if (textEl.scrollHeight > textEl.clientHeight) textEl.scrollTop = textEl.scrollHeight;
      }, 30);
    }
    this.renderEditorPhotos(v.photos);
  }

  private renderEditorPhotos(photos: Photo[]): void {
    const ed = this.editor;
    if (!ed) return;
    const sig = photos.map((p) => p.id).join(',');
    if (sig === ed.photoSig) return;
    ed.photoSig = sig;
    const lang = this.lang();
    const alive = new Set(photos.map((p) => p.id));
    for (const id of Array.from(ed.attach)) if (!alive.has(id)) ed.attach.delete(id);
    ed.photosEl.textContent = '';
    const count = () => {
      ed.attachedEl.textContent = ed.attach.size > 0 ? ` · ${t(lang, 'phone.report.attached', { n: ed.attach.size })}` : '';
    };
    count();
    if (photos.length === 0) {
      ed.photosEl.appendChild(el('p', 'tds-task-note', t(lang, 'phone.report.noPhotos')));
      return;
    }
    photos.forEach((p, i) => {
      const b = el('button', 'tds-thumb tds-thumb-attach');
      b.type = 'button';
      b.setAttribute('aria-label', t(lang, 'phone.report.photoToggle', { n: i + 1 }));
      const on = ed.attach.has(p.id);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('is-on', on);
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.src = p.dataUrl;
      b.appendChild(img);
      b.addEventListener('click', () => {
        const now = !ed.attach.has(p.id);
        if (now) ed.attach.add(p.id);
        else ed.attach.delete(p.id);
        b.setAttribute('aria-pressed', now ? 'true' : 'false');
        b.classList.toggle('is-on', now);
        count();
      });
      ed.photosEl.appendChild(b);
    });
  }

  private closeEditor(): void {
    if (!this.editor) return;
    window.clearInterval(this.editor.timer);
    this.editor.root.remove();
    this.editor = null;
    this.sig.tasks = '';
  }

  // ------------------------------------------------------------ fotocamera

  private renderCamera(v: PhoneView): void {
    const lang = this.lang();
    const full = v.photos.length >= v.maxPhotos;
    const last = v.photos.length > 0 ? v.photos[v.photos.length - 1] : null;
    const sig = `${lang}|${v.photos.length}|${v.maxPhotos}|${last ? last.id : ''}`;
    if (sig === this.sig.camera) return;
    this.sig.camera = sig;
    const pane = this.panes.camera;
    pane.textContent = '';
    const frame = el('div', 'tds-cam-frame');
    frame.appendChild(this.finder);
    for (const c of ['tl', 'tr', 'bl', 'br']) frame.appendChild(el('i', `tds-cam-corner is-${c}`));
    frame.appendChild(el('p', 'tds-cam-hint', t(lang, full ? 'phone.camera.full' : 'phone.camera.hint')));
    const bar = el('div', 'tds-cam-bar');
    const lastBox = el('div', 'tds-cam-last');
    if (last) {
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.src = last.dataUrl;
      lastBox.appendChild(img);
    }
    const shutter = el('button', 'tds-shutter');
    shutter.type = 'button';
    shutter.dataset.silent = '';
    shutter.disabled = full;
    shutter.setAttribute('aria-label', t(lang, 'phone.camera.shutter'));
    shutter.addEventListener('click', () => {
      if (shutter.disabled) return;
      frame.classList.remove('is-shot');
      void frame.offsetWidth;
      frame.classList.add('is-shot');
      this.cb.onTakePhoto();
    });
    const counter = el('span', `tds-cam-count${full ? ' is-full' : ''}`, t(lang, 'phone.camera.count', { n: v.photos.length, max: v.maxPhotos }));
    bar.append(lastBox, shutter, counter);
    pane.append(frame, bar);
  }

  // ------------------------------------------------------------ galleria

  private renderGallery(v: PhoneView): void {
    const lang = this.lang();
    if (this.enlarged !== null && !v.photos.some((p) => p.id === this.enlarged)) this.enlarged = null;
    const sig = `${lang}|${v.photos.map((p) => p.id).join(',')}|${this.enlarged}`;
    if (sig === this.sig.gallery) return;
    this.sig.gallery = sig;
    const pane = this.panes.gallery;
    const alive = new Set(v.photos.map((p) => p.id));
    for (const id of Array.from(this.thumbs.keys())) {
      if (!alive.has(id)) {
        this.thumbs.get(id)?.remove();
        this.thumbs.delete(id);
      }
    }
    pane.textContent = '';
    if (this.enlarged !== null) {
      const photo = v.photos.find((p) => p.id === this.enlarged) as Photo;
      const box = el('div', 'tds-photo-view');
      const img = el('img', 'tds-photo-big');
      img.alt = t(lang, 'phone.gallery.photo', { n: v.photos.indexOf(photo) + 1 });
      img.draggable = false;
      img.src = photo.dataUrl;
      const actions = el('div', 'tds-editor-actions');
      const back = el('button', 'tds-pbtn', t(lang, 'phone.gallery.back'));
      back.type = 'button';
      back.addEventListener('click', () => {
        this.enlarged = null;
        this.render();
      });
      const del = el('button', 'tds-pbtn tds-pbtn-danger', t(lang, 'phone.gallery.delete'));
      del.type = 'button';
      del.addEventListener('click', () => {
        this.enlarged = null;
        this.cb.onDeletePhoto(photo.id);
        this.render();
      });
      actions.append(back, del);
      box.append(img, actions);
      pane.appendChild(box);
      return;
    }
    if (v.photos.length === 0) {
      pane.appendChild(el('p', 'tds-empty', t(lang, 'phone.gallery.empty')));
      return;
    }
    // le miniature esistenti vengono riutilizzate: nessuna immagine è ricreata senza motivo
    const grid = el('div', 'tds-grid');
    v.photos.forEach((p, i) => {
      let b = this.thumbs.get(p.id);
      if (!b) {
        b = el('button', 'tds-thumb');
        b.type = 'button';
        const img = el('img');
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.src = p.dataUrl;
        b.appendChild(img);
        b.addEventListener('click', () => {
          this.enlarged = p.id;
          this.render();
        });
        this.thumbs.set(p.id, b);
      }
      b.setAttribute('aria-label', t(lang, 'phone.gallery.photo', { n: i + 1 }));
      grid.appendChild(b);
    });
    pane.appendChild(grid);
  }

  // ------------------------------------------------------------ mappa

  private renderMap(v: PhoneView): void {
    const pane = this.panes.map;
    if (!this.mapCanvas) {
      this.mapCanvas = el('canvas', 'tds-map');
      this.mapCanvas.setAttribute('role', 'img');
      pane.appendChild(this.mapCanvas);
    }
    const lang = this.lang();
    this.mapCanvas.setAttribute('aria-label', t(lang, 'phone.tab.map'));
    const side = Math.max(120, Math.floor(Math.min(pane.clientWidth, pane.clientHeight || pane.clientWidth)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(side * dpr);
    const m = v.map;
    const moving = m.glitch > 0;
    const sig = `${lang}|${px}|${m.size}|${m.edges.length}|${m.pois.length}|${(m.targets ?? []).map((x) => x.state[0]).join('')}|${Math.round(m.player.pos.x * 2)}|${Math.round(m.player.pos.z * 2)}|${Math.round(
      m.player.yaw * 40,
    )}|${Math.round(m.car.x)}|${Math.round(m.car.z)}|${m.glitch.toFixed(2)}`;
    if (moving && !this.mapTimer) {
      this.mapTimer = window.setInterval(() => {
        if (!this.open || this.tab !== 'map' || !this.view || this.view.map.glitch <= 0) {
          this.stopMapTimer();
          return;
        }
        this.render();
      }, 110);
    } else if (!moving) this.stopMapTimer();
    if (sig === this.sig.map && !moving) return;
    this.sig.map = sig;
    this.paintMap(v, px, side);
  }

  private paintMap(v: PhoneView, px: number, side: number): void {
    const c = this.mapCanvas;
    if (!c) return;
    if (c.width !== px || c.height !== px) {
      c.width = px;
      c.height = px;
      c.style.width = `${side}px`;
      c.style.height = `${side}px`;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const lang = this.lang();
    drawMap(
      ctx,
      v.map,
      px,
      px,
      {
        car: t(lang, 'phone.map.car'),
        north: t(lang, 'phone.map.north'),
        scale: t(lang, 'phone.map.scale', { n: 200 }),
        weak: t(lang, 'phone.map.weak'),
      },
      performance.now() / 1000,
    );
  }

  private stopMapTimer(): void {
    if (this.mapTimer) window.clearInterval(this.mapTimer);
    this.mapTimer = 0;
  }
}

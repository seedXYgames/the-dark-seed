// Punto d'ingresso: collega UI, sessione di gioco, rendering, audio e input.
import { makeSky } from './world/worldgen';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AudioEngine } from './audio/engine';
import { SilencePlanner, computeSoundscape } from './audio/soundscape';
import { Tts } from './audio/tts';
import type { ExtremeRenderState, PhoneTab, UiCallbacks } from './core/api';
import type { Settings } from './core/contracts';
import { clamp } from './core/rng';
import { EYE_HEIGHT, GameSession, type PlayerInput } from './game/session';
import { t } from './i18n/strings';
import { EnvironmentRenderer } from './render/environment';
import { WorldObjectsRenderer } from './render/worldObjects';
import { seedMysteries } from './sim/mysteries';
import { createSimulation } from './sim/simulation';
import { loadSettings } from './ui/settingsStore';
import { Ui } from './ui/ui';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const root = document.getElementById('ui-root') as HTMLElement;
const engine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' }, false);
let settings: Settings = loadSettings();
const audio = new AudioEngine();
const tts = new Tts();

interface View {
  scene: Scene; camera: UniversalCamera; env: EnvironmentRenderer; objs: WorldObjectsRenderer; session: GameSession; silence: SilencePlanner;
}
let view: View | null = null;
let mode: 'boot' | 'menu' | 'game' | 'summary' = 'boot';
let paused = false;
let yaw = 0, pitch = 0;
const keys = new Set<string>();
let menuAngle = 0;
let subtitleUntil = 0;
let lastPhoneUpdate = 0;
let focus: { id?: string; actorId?: string } = {};
let inspect: { mesh: TransformNode; light: PointLight; rx: number; ry: number; dist: number } | null = null;
let pendingPhoto = false;
const BASE_FOV = 1.15, ZOOM_FOV = 0.42;
let zooming = false;
let wantLock = false;
let frame = 0;
let devTimeScale = 1;
let noVoiceNoted = false;
const loopIds = new Set<string>();
const NO_EXTREME: ExtremeRenderState = { active: false, codeRain: 0, strip: 0, sky: 0, decompose: 0, stutter: 0, t: 0, seed: 0 };

const L = () => settings.lang;

function buildView(seed: number, playable: boolean): View {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  scene.skipPointerMovePicking = true;
  scene.ambientColor = new Color3(0, 0, 0);
  const camera = new UniversalCamera('cam', new Vector3(0, 2, 0), scene);
  camera.minZ = 0.1; camera.maxZ = 4000; camera.fov = BASE_FOV;
  camera.inputs.clear();
  scene.activeCamera = camera;
  const session = new GameSession({ seed, lang: settings.lang, simFactory: playable ? createSimulation : undefined, postProcess: seedMysteries });
  const env = new EnvironmentRenderer(scene, session.model, settings.gfx);
  const objs = new WorldObjectsRenderer(scene, session.model, settings.gfx, (m: AbstractMesh) => env.addShadowCaster(m));
  return { scene, camera, env, objs, session, silence: new SilencePlanner(seed) };
}

function disposeView() {
  if (!view) return;
  endInspect(false);
  for (const id of loopIds) audio.setLoop(id, null);
  loopIds.clear();
  view.objs.dispose(); view.env.dispose(); view.scene.dispose();
  view = null;
}

function later(fn: () => void) { requestAnimationFrame(() => setTimeout(fn, 30)); }

function showMenu() {
  mode = 'boot';
  ui.show('loading');
  ui.setLoadingProgress(0.2);
  if (document.pointerLockElement) document.exitPointerLock();
  later(() => {
    disposeView();
    // lo sfondo del menu usa un seed proprio, indipendente da quello di gioco
    // …scelto fra quelli che cominciano al tramonto, così il paesaggio si legge
    let menuSeed = Math.floor(Math.random() * 1_000_001);
    for (let i = 0; i < 60 && makeSky(menuSeed).startHour > 20.1; i++) menuSeed = Math.floor(Math.random() * 1_000_001);
    view = buildView(menuSeed, false);
    menuAngle = Math.random() * Math.PI * 2;
    ui.setLoadingProgress(1);
    mode = 'menu';
    ui.show('menu');
    audio.setAmbient({ wind: 0.25, rain: 0, insects: 0.2, frogs: 0, birds: 0.1, water: 0, leaves: 0.2, human: 0, room: 0, hush: 0 });
  });
}

function startGame(seed: number) {
  mode = 'boot';
  ui.show('loading');
  ui.setLoadingProgress(0.15);
  void audio.resume();
  later(() => {
    disposeView();
    ui.setLoadingProgress(0.5);
    later(() => {
      view = buildView(seed, true);
      const p = view.session.state.player;
      yaw = p.yaw; pitch = 0;
      paused = false;
      mode = 'game';
      ui.setPauseInfo(seed);
      ui.show('game');
      ui.setHints(['hint.move', 'hint.run', 'hint.interact', 'hint.zoom', 'hint.torch', 'hint.phone', 'hint.map', 'hint.photo', 'hint.pause'].map((k) => t(L(), k)));
      ui.setTorch(view.session.state.torch.charge, false, 0);
      lockPointer();
      if (import.meta.env.DEV) exposeDev();
    });
  });
}

function lockPointer() {
  wantLock = true;
  try { const r = canvas.requestPointerLock() as unknown; if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {}); } catch { /* serve un gesto dell'utente */ }
}
function unlockPointer() { wantLock = false; zooming = false; if (document.pointerLockElement) document.exitPointerLock(); }

const callbacks: UiCallbacks = {
  onStartGame: (seed) => startGame(seed),
  onSettingsChanged: (s) => {
    settings = s;
    view?.env.applySettings(s.gfx); view?.objs.applySettings(s.gfx);
    if (view && view.session.state.lang !== s.lang) view.session.setLang(s.lang);
  },
  onResume: () => { paused = false; ui.show('game'); lockPointer(); void audio.resume(); },
  onAbandon: () => { view?.session.abandon(); tts.cancel(); showMenu(); },
  onBackToMenu: () => showMenu(),
  onExit: () => { audio.suspend(); tts.cancel(); },
  onExitCancelled: () => { void audio.resume(); },
  onPhoneClosed: () => { if (mode === 'game' && !paused) lockPointer(); },
  onTakePhoto: () => { pendingPhoto = true; },
  onMessageRead: (id) => view?.session.markRead(id),
  getReportDraft: (id) => view?.session.reportDraft(id) ?? '',
  onSubmitReport: (id, photos) => { view?.session.submitReport(id, photos); refreshPhone(true); },
  onDeletePhoto: (id) => { view?.session.deletePhoto(id); refreshPhone(true); },
  onUiSound: (kind) => { void audio.resume(); audio.playOneShot(kind, { gain: kind === 'typing' ? 0.35 : 0.5 }); },
};
const ui = new Ui(root, callbacks, settings);

function refreshPhone(force = false) {
  if (!view || mode !== 'game') return;
  const now = performance.now();
  if (!force && now - lastPhoneUpdate < 400) return;
  lastPhoneUpdate = now;
  ui.setUnread(view.session.unread());
  if (ui.isPhoneOpen()) ui.updatePhone(view.session.phoneView());
}

function openPhone(tab?: PhoneTab) {
  if (!view || inspect) return;
  unlockPointer();
  ui.openPhone(tab);
  refreshPhone(true);
}

// ---------------------------------------------------------------- ispezione 3D

function beginInspect(id: string) {
  if (!view) return;
  const mesh = view.objs.createInspectMesh(id) as TransformNode | null;
  const info = view.session.inspectInfo();
  if (!mesh || !info) { view.session.endInspect(); return; }
  mesh.parent = view.camera;
  mesh.position.set(0, -0.02, 0.62);
  const light = new PointLight('inspectLight', new Vector3(0.25, 0.3, 0.1), view.scene);
  light.parent = view.camera;
  light.intensity = 0.9; light.range = 3; light.diffuse = new Color3(1, 0.95, 0.85);
  const meshes = mesh.getChildMeshes(false);
  if ((mesh as unknown as AbstractMesh).getTotalVertices) meshes.push(mesh as unknown as AbstractMesh);
  for (const m of meshes) { m.renderingGroupId = 2; m.isPickable = false; }
  light.includedOnlyMeshes = meshes;
  inspect = { mesh, light, rx: 0.5, ry: 0.4, dist: 0.62 };
  ui.showInspect(info.title, info.note);
  ui.setPrompt(null);
}
function endInspect(notify = true) {
  if (!inspect) return;
  inspect.mesh.dispose(false, true);
  inspect.light.dispose();
  inspect = null;
  ui.hideInspect();
  if (notify) view?.session.endInspect();
}

// ---------------------------------------------------------------- input

function doInteract() {
  if (!view || mode !== 'game' || paused || ui.isPhoneOpen()) return;
  if (inspect) { endInspect(); return; }
  const s = view.session;
  if (focus.id) {
    const action = s.interact(focus.id);
    if (action === 'inspect_item') beginInspect(focus.id);
  } else if (focus.actorId) s.talk(focus.actorId);
}

window.addEventListener('keydown', (e) => {
  if (mode !== 'game' || !view || e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (paused) return;
  if (ui.isPhoneOpen()) return; // T/Esc sono gestiti dall'interfaccia
  switch (e.code) {
    case 'KeyE': doInteract(); break;
    case 'KeyF': if (!inspect) view.session.toggleTorch(); break;
    case 'KeyT': openPhone(); break;
    case 'KeyM': openPhone('map'); break;
    case 'KeyC': if (!inspect) pendingPhoto = true; break;
    default: break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); zooming = false; });
canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'game' || paused || ui.isPhoneOpen()) return;
  void audio.resume();
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) doInteract();
  if (e.button === 2 && !inspect) zooming = true;
});
// tasto destro: zoom per guardare lontano (come stringere gli occhi o un binocolo tascabile)
window.addEventListener('mouseup', (e) => { if (e.button === 2) zooming = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (mode !== 'game' || document.pointerLockElement !== canvas) return;
  if (inspect) { inspect.rx += e.movementX * 0.008; inspect.ry = clamp(inspect.ry + e.movementY * 0.008, -1.5, 1.5); return; }
  const sens = 0.0022 * (view ? view.camera.fov / BASE_FOV : 1); // più lento quando si zooma
  yaw += e.movementX * sens;
  pitch = clamp(pitch + e.movementY * sens, -1.45, 1.45);
});
canvas.addEventListener('wheel', (e) => { if (inspect) { inspect.dist = clamp(inspect.dist + e.deltaY * 0.0006, 0.3, 0.95); e.preventDefault(); } }, { passive: false });
document.addEventListener('pointerlockchange', () => {
  if (mode !== 'game' || !view) return;
  if (document.pointerLockElement === canvas) return;
  // blocco perso senza che lo volessimo (Esc o cambio finestra): pausa
  if (wantLock && !ui.isPhoneOpen() && !view.session.state.ended) { paused = true; wantLock = false; endInspect(); ui.show('pause'); tts.cancel(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'game' && !paused && view && !ui.isPhoneOpen()) { paused = true; unlockPointer(); ui.show('pause'); } });
window.addEventListener('resize', () => engine.resize());

// ---------------------------------------------------------------- foto

function capturePhoto(v: View) {
  const { subjects, hiddenActorIds } = v.session.photoSubjects();
  for (const id of hiddenActorIds) v.objs.setActorHidden(id, true);
  v.scene.onAfterRenderObservable.addOnce(() => {
    try {
      const c = document.createElement('canvas');
      c.width = 480; c.height = Math.round((480 * canvas.height) / Math.max(1, canvas.width));
      c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
      v.session.addPhoto(c.toDataURL('image/jpeg', 0.72), subjects);
      ui.setScreenEffect('flash', 0.6);
    } finally {
      for (const id of hiddenActorIds) v.objs.setActorHidden(id, false);
      refreshPhone(true);
    }
  });
}

// ---------------------------------------------------------------- ciclo

function gameFrame(v: View, dt: number) {
  const s = v.session;
  const st = s.state;
  const phoneOpen = ui.isPhoneOpen();
  if (!paused) {
    const active = document.activeElement;
    const typing = active instanceof HTMLElement && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT');
    const moving = !inspect && !typing && (phoneOpen || document.pointerLockElement === canvas);
    const input: PlayerInput = {
      forward: moving ? (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) : 0,
      strafe: moving ? (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) : 0,
      run: keys.has('ShiftLeft') || keys.has('ShiftRight'), yaw, pitch,
    };
    for (let i = 0; i < devTimeScale; i++) s.update(dt, input);
  }
  const p = st.player;
  v.camera.position.set(p.pos.x, p.y + EYE_HEIGHT, p.pos.z);
  v.camera.rotation.set(pitch, yaw, 0);
  const wantFov = zooming && !paused && !phoneOpen && !inspect ? ZOOM_FOV : BASE_FOV;
  v.camera.fov += (wantFov - v.camera.fov) * Math.min(1, dt * 9);
  if (inspect) { inspect.mesh.rotation.set(inspect.ry, inspect.rx, 0); inspect.mesh.position.z += (inspect.dist - inspect.mesh.position.z) * 0.2; }

  const sky = s.sky(), weather = s.weather();
  const ex = s.sim.extremeState();
  const inter = s.sim.interference();
  v.env.setExtreme(ex); v.objs.setExtreme(ex);
  v.env.update(dt, v.camera.position, sky, weather, s.sim.localAlterations(), s.torchRender(phoneOpen));
  v.objs.sync(st, s.sim.actorViews(), v.camera.position, dt, sky);
  if (ex.active && ex.codeRain > 0.02) ui.setScreenEffect('code_rain', ex.codeRain);
  else if (inter.phone > 0.35 && phoneOpen) ui.setScreenEffect('static', inter.phone * 0.6);
  else if (frame % 10 === 0) ui.setScreenEffect('none', 0);

  // messa a fuoco dell'interazione
  if (frame % 3 === 0 && !paused && !phoneOpen && !inspect) {
    const f = v.camera.getDirection(Vector3.Forward());
    const hit = v.objs.pickObject(v.camera.position, f, 4.6);
    focus = {};
    let prompt: string | null = null;
    if (hit) {
      const action = s.actionFor(hit.objectId);
      if (action && s.canReach(hit.objectId)) { focus.id = hit.objectId; prompt = `[E]  ${t(L(), `action.${action}`)}`; }
    }
    if (!focus.id) { const a = s.talkTarget(); if (a) { focus.actorId = a.id; prompt = `[E]  ${t(L(), 'action.talk')}`; } }
    ui.setPrompt(prompt);
  }

  // audio
  const fwd = v.camera.getDirection(Vector3.Forward());
  audio.setListener(v.camera.position, fwd);
  if (frame % 6 === 0) {
    const mood = s.sim.mysteryMood();
    const scoreOn = mood.active && !paused && !st.ended && mode === 'game';
    ui.setMystery(st.ended ? { active: false, intensity: 0, watched: false } : mood);
    const ctx = s.soundscapeContext();
    ctx.hushSources = ctx.hushSources.concat(v.silence.sourcesAt(st.time, p.pos));
    audio.setAmbient(computeSoundscape(ctx));
    audio.setDistortion(clamp((ex.active ? 0.35 + 0.5 * Math.max(ex.strip, ex.decompose, ex.sky) : 0) + inter.phone * 0.25, 0, 1));
    const loops = s.loops();
    const seen = new Set<string>();
    if (scoreOn) {
      seen.add('mystery-score'); loopIds.add('mystery-score');
      audio.setLoop('mystery-score', 'mystery_music', undefined, 0.2 + mood.intensity * 0.65);
    }
    for (const l of loops) { seen.add(l.id); loopIds.add(l.id); audio.setLoop(l.id, l.kind, l.pos, l.gain); }
    const wd = ctx.waterDistance;
    if (wd < 80) { seen.add('water'); loopIds.add('water'); audio.setLoop('water', 'water', { x: p.pos.x, y: p.y, z: p.pos.z }, clamp(1 - wd / 80, 0, 1) * 0.6); }
    for (const id of [...loopIds]) if (!seen.has(id)) { audio.setLoop(id, null); loopIds.delete(id); }
  }
  const out = s.drain();
  for (const sd of out.sounds) audio.playOneShot(sd.kind, { pos: sd.pos, gain: sd.gain });
  for (const fs of out.footsteps) audio.footstep(fs.surface, fs.running);
  for (const n of out.notices) ui.notify(t(L(), n.key, n.params));
  for (const line of out.lines) {
    ui.setSubtitle(line.text, line.speaker);
    subtitleUntil = performance.now() + 2600 + line.text.length * 55;
    if (line.tts) {
      const spoken = tts.speak(line.text, L(), s.composer.voiceStyle());
      if (!spoken && !noVoiceNoted && tts.status().supported && !tts.status().voice[L()]) { noVoiceNoted = true; ui.notify(t(L(), 'notice.noVoice')); }
    }
  }
  if (subtitleUntil && performance.now() > subtitleUntil) { subtitleUntil = 0; ui.setSubtitle(null); }
  if (frame % 15 === 0) ui.setTorch(st.torch.charge, st.torch.on, st.torch.spares);
  refreshPhone();

  if (pendingPhoto) { pendingPhoto = false; capturePhoto(v); }

  if (st.ended && mode === 'game') {
    mode = 'summary';
    unlockPointer();
    endInspect(false);
    ui.closePhone();
    ui.setPrompt(null); ui.setSubtitle(null); ui.setScreenEffect('none', 0);
    tts.cancel();
    ui.showSummary(s.summary(location.href));
  }
}

function menuFrame(v: View, dt: number) {
  const s = v.session;
  menuAngle += dt * 0.02;
  const c = s.spec.scenic[0]?.pos ?? s.spec.carSpawn.pos;
  const r = 26;
  const x = clamp(c.x + Math.cos(menuAngle) * r, -660, 660), z = clamp(c.z + Math.sin(menuAngle) * r, -660, 660);
  v.camera.position.set(x, s.model.heightAt(x, z) + 13, z);
  v.camera.rotation.set(0.1, menuAngle + Math.PI * 0.6, 0);
  v.env.setExtreme(NO_EXTREME);
  v.env.update(dt, v.camera.position, s.sky(), s.weather(), s.sim.localAlterations(), { on: false, intensity: 0, phoneGlow: 0 });
  v.objs.sync(s.state, [], v.camera.position, dt, s.sky());
}

let last = performance.now();
engine.runRenderLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frame++;
  if (!view || mode === 'boot') return;
  // schermate nere (intro) non hanno bisogno del 3D
  if (mode === 'menu' && ui.current() === 'intro') return;
  if (mode === 'menu') menuFrame(view, dt);
  else gameFrame(view, dt);
  view.scene.render();
});

function exposeDev() {
  // Strumenti di sviluppo: esistono solo con `npm run dev`, mai nella build di produzione.
  (window as unknown as Record<string, unknown>).__tds = {
    get session() { return view?.session; },
    get view() { return view; },
    forceExtreme: () => view?.session.sim.devForceExtreme(),
    setTimeScale: (n: number) => { devTimeScale = Math.max(1, Math.min(40, Math.round(n))); },
    look: (y: number, p: number) => { yaw = y; pitch = p; },
    teleport: (x: number, z: number) => { if (view) { view.session.state.player.pos = { x, z }; view.session.state.player.y = view.session.model.groundAt(x, z); } },
    photo: () => { pendingPhoto = true; },
    zoom: (on: boolean) => { zooming = on; },
    ttsStatus: () => tts.status(),
  };
}

showMenu();

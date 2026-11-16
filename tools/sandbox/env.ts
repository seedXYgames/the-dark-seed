// Sandbox di sviluppo per l'EnvironmentRenderer. Parametri URL:
// ?seed=&hour=21.5&cloud=0.2&fog=0.1&precip=0&snow=0&wind=0.3&moon=0.5&moonel=0.7&moonaz=2&torch=1&x=&z=&yaw=&pitch=&up=
// &extreme=strip:0.8,decompose:0.6,sky:1,stutter:0.5 &alter=rainUp:1,shadowSkew:1,reflectionShift:1,dustFloat:1,lights:1
// &quality=&shadows=0&aa=0&fogfx=0&scale=&dd=&bright=&wet=&hud=0
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { ExtremeRenderState, LocalAlterations, SkyState, WeatherState } from '../../src/core/api';
import { DEFAULT_SETTINGS, type GraphicsSettings } from '../../src/core/contracts';
import { generateWorld } from '../../src/world/worldgen';
import { EnvironmentRenderer } from '../../src/render/environment';

const P = new URLSearchParams(location.search);
const num = (k: string, d: number) => (P.has(k) && P.get(k) !== '' ? Number(P.get(k)) : d);
const kv = (k: string): Record<string, number> => {
  const o: Record<string, number> = {};
  for (const part of (P.get(k) ?? '').split(',')) { const [a, b] = part.split(':'); if (a) o[a] = b === undefined ? 1 : Number(b); }
  return o;
};
const seed = num('seed', 4242);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false, antialias: false });
const scene = new Scene(engine);
scene.clearColor = new Color4(0, 0, 0, 1);
const { spec, model } = generateWorld(seed);
const sx = num('x', spec.playerSpawn.pos.x), sz = num('z', spec.playerSpawn.pos.z);
const camera = new UniversalCamera('cam', new Vector3(sx, model.groundAt(sx, sz) + 1.7 + num('up', 0), sz), scene);
camera.minZ = 0.1; camera.maxZ = 4000; camera.fov = 1.15;
camera.rotation.y = num('yaw', spec.playerSpawn.yaw); camera.rotation.x = num('pitch', 0);
camera.keysUp = [87]; camera.keysDown = [83]; camera.keysLeft = [65]; camera.keysRight = [68];
camera.speed = 2.5; camera.attachControl(canvas, true);

const gfx: GraphicsSettings = {
  ...DEFAULT_SETTINGS.gfx, quality: (P.get('quality') as GraphicsSettings['quality']) ?? 'medium', shadows: num('shadows', 1) > 0,
  antialias: num('aa', 1) > 0, fogEffects: num('fogfx', 1) > 0, renderScale: num('scale', 1), drawDistance: num('dd', 420), brightness: num('bright', 1),
};
const t0 = performance.now();
const env = new EnvironmentRenderer(scene, model, gfx);
const buildMs = performance.now() - t0;

// stato del cielo costruito dai parametri (il gioco reale lo riceve da un altro modulo)
const hour = num('hour', 21.5);
const cloud = num('cloud', 0.2), fog = num('fog', 0.1), precip = num('precip', 0), snow = num('snow', 0), wind = num('wind', 0.3);
const moonPhase = num('moon', 0.5);
function skyState(h: number): SkyState {
  const hh = h % 24;
  const sunElevation = Math.sin(((hh - 6) / 24) * Math.PI * 2) * 0.95 - 0.02; // tramonto ≈ 18, minimo a mezzanotte
  const moonElevation = num('moonel', 0.7), moonIllum = 0.5 - 0.5 * Math.cos(moonPhase * Math.PI * 2);
  const up = Math.max(0, Math.min(1, (moonElevation + 0.03) / 0.13));
  const moonLight = moonIllum * up * (1 - 0.85 * cloud);
  const day = Math.max(0, Math.min(1, (sunElevation + 0.3) / 0.5));
  const ambient = Math.min(1, 0.02 + 0.02 * (1 - cloud) + 0.11 * moonLight + Math.pow(day, 2.2) * (1 - 0.5 * cloud));
  return {
    hour: hh, sunElevation, sunAzimuth: spec.sky.sunsetAzimuth, moonElevation, moonAzimuth: num('moonaz', spec.sky.moonAzimuth), moonPhase, moonIllum, moonLight,
    starVisibility: Math.max(0, 1 - day * 2.5) * (1 - cloud) * (1 - 0.5 * moonLight), ambient, starSeed: spec.sky.starSeed, tint: spec.sky.tint,
  };
}
const weather: WeatherState = {
  cloud, fog, precip: Math.max(precip, snow), precipType: snow > 0 ? 'snow' : precip > 0 ? 'rain' : 'none', wind, windDir: spec.weather.windDir,
  temperature: snow > 0 ? -3 : 9, wetness: num('wet', precip > 0 ? 0.8 : 0), snowCover: num('snowcover', snow > 0 ? 0.8 : 0),
};
const al = kv('alter');
const alter: LocalAlterations = { rainUp: al.rainUp ?? 0, shadowSkew: al.shadowSkew ?? 0, reflectionShift: al.reflectionShift ?? 0, dustFloat: al.dustFloat ?? 0, lights: [] };
if (al.lights) {
  const f = camera.getDirection(Vector3.Forward());
  alter.lights.push({ id: 'a', pos: { x: sx + f.x * 14, y: camera.position.y + 1.2, z: sz + f.z * 14 }, color: [0.5, 0.9, 1], intensity: 1, radius: 0.8 });
}
const ex = kv('extreme');
const extreme: ExtremeRenderState = { active: P.has('extreme'), codeRain: 0, strip: ex.strip ?? 0, sky: ex.sky ?? 0, decompose: ex.decompose ?? 0, stutter: ex.stutter ?? 0, t: 0, seed };
const torch = { on: num('torch', 0) > 0, intensity: num('torch', 0), phoneGlow: num('phone', 0) };

let draws = 0, drawsLast = 0;
const eng = engine as unknown as Record<string, (...a: unknown[]) => unknown>;
for (const fn of ['drawElementsType', 'drawArraysType']) { const o = eng[fn].bind(engine); eng[fn] = (...a: unknown[]) => { draws++; return o(...a); }; }
const hud = document.getElementById('hud')!;
if (num('hud', 1) === 0) hud.style.display = 'none';
const w = window as unknown as Record<string, unknown>;
let frames = 0, acc = 0, simT = 0;
w.__env = env; w.__scene = scene; w.__extreme = extreme; w.__stats = {};
engine.runRenderLoop(() => {
  const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
  simT += dt;
  if (extreme.active) { extreme.t = simT; env.setExtreme(extreme); } else env.setExtreme(extreme);
  const c = camera.position;
  if (num('walk', 1) > 0 && num('up', 0) === 0) c.y = model.groundAt(c.x, c.z) + 1.7;
  const u0 = performance.now();
  env.update(dt, c, skyState(hour + (simT * 6) / 3600), weather, alter, torch);
  const updMs = performance.now() - u0;
  draws = 0;
  scene.render();
  drawsLast = draws;
  frames++; acc += engine.getDeltaTime();
  if (frames % 10 === 0) {
    const stats = { frameMs: acc / 10, updateMs: updMs, drawCalls: drawsLast,
      activeMeshes: scene.getActiveMeshes().length, trees: env.treeCount, buildMs };
    acc = 0; w.__stats = stats;
    hud.textContent = `seed ${seed}  x ${c.x.toFixed(0)} z ${c.z.toFixed(0)} yaw ${camera.rotation.y.toFixed(2)}\n${stats.frameMs.toFixed(1)} ms  draws ${stats.drawCalls}  meshes ${stats.activeMeshes}  trees ${stats.trees}`;
  }
  if (frames === num('ready', 12)) w.__ready = true;
});
window.addEventListener('resize', () => engine.resize());

// EnvironmentRenderer: orchestration di terreno, bosco, acqua, cielo, scenografia lontana, luci, nebbia, meteo
// ed evento estremo. Tutto procedurale; nessun asset esterno.
import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type {
  ExtremeRenderState, IEnvironmentRenderer, LocalAlterations, SkyState, TorchRender, Vec3Like, WeatherState,
} from '../core/api';
import type { GraphicsSettings } from '../core/contracts';
import type { WorldModel } from '../world/model';
import {
  clamp01, dirFromAzEl, distantHaze, fogDensity, fogLinear, hash3, makePalette, mix, qualityParams, skyColors, sstep, stutterTime,
  type QualityParams, type RGB,
} from './envMath';
import { TerrainRenderer, envShared } from './terrainMesh';
import { ForestRenderer } from './forest';
import { WaterRenderer } from './water';
import { SkyRenderer } from './sky';
import { DistantRenderer } from './distant';
import { WeatherFx } from './weatherFx';
import { LightingRig } from './lighting';

const NO_EXTREME: ExtremeRenderState = { active: false, codeRain: 0, strip: 0, sky: 0, decompose: 0, stutter: 0, t: 0, seed: 0 };

export class EnvironmentRenderer implements IEnvironmentRenderer {
  readonly moonLight: DirectionalLight;
  private camera: Camera;
  private gfx: GraphicsSettings;
  private q: QualityParams;
  private terrain: TerrainRenderer;
  private forest: ForestRenderer;
  private water: WaterRenderer;
  private sky: SkyRenderer;
  private distant: DistantRenderer;
  private fx: WeatherFx;
  private rig: LightingRig;
  private pal = makePalette();
  private moonDir: RGB = [0, 1, 0];
  private time = 0;
  private animTime = 0;
  private extreme: ExtremeRenderState = { ...NO_EXTREME };
  private decomposed = false;
  private disposed = false;
  private prevFog: { mode: number; density: number; start: number; end: number; color: Color3 };
  private prevScaling: number;

  constructor(private scene: Scene, private model: WorldModel, gfx: GraphicsSettings) {
    if (!scene.activeCamera) throw new Error('EnvironmentRenderer: scene.activeCamera is required');
    this.camera = scene.activeCamera;
    this.gfx = { ...gfx };
    this.q = qualityParams(gfx.quality);
    this.prevFog = { mode: scene.fogMode, density: scene.fogDensity, start: scene.fogStart, end: scene.fogEnd, color: scene.fogColor.clone() };
    this.prevScaling = scene.getEngine().getHardwareScalingLevel();
    this.terrain = new TerrainRenderer(scene, model);
    this.forest = new ForestRenderer(scene, model, this.terrain.fields, this.q, gfx.drawDistance);
    this.water = new WaterRenderer(scene, model);
    this.sky = new SkyRenderer(scene);
    this.distant = new DistantRenderer(scene, model);
    this.fx = new WeatherFx(scene, this.q);
    this.rig = new LightingRig(scene, this.camera);
    this.moonLight = this.rig.moonLight;
    this.applySettings(gfx);
  }

  get shadowGenerator(): ShadowGenerator | null { return this.rig.shadowGenerator; }

  /** Numero di alberi istanziati (diagnostica). */
  get treeCount(): number { return this.forest.treeCount; }

  applySettings(gfx: GraphicsSettings): void {
    if (this.disposed) return;
    this.gfx = { ...gfx };
    this.q = qualityParams(gfx.quality);
    this.scene.getEngine().setHardwareScalingLevel(1 / Math.min(1, Math.max(0.5, gfx.renderScale)));
    this.forest.setQuality(this.q, gfx.drawDistance);
    this.fx.setQuality(this.q);
    this.rig.applySettings(gfx, this.q);
    this.terrain.setReceiveShadows(gfx.shadows);
    this.rig.syncCasters(this.forest.nearActive);
  }

  addShadowCaster(mesh: unknown): void {
    if (mesh && typeof (mesh as AbstractMesh).getBoundingInfo === 'function') this.rig.addShadowCaster(mesh as AbstractMesh);
  }

  setExtreme(state: ExtremeRenderState): void {
    const e = this.extreme;
    if (!state.active) { Object.assign(e, NO_EXTREME); this.restoreDecompose(); return; }
    e.active = true; e.codeRain = state.codeRain; e.strip = clamp01(state.strip); e.sky = clamp01(state.sky);
    e.decompose = clamp01(state.decompose); e.stutter = clamp01(state.stutter); e.t = state.t; e.seed = state.seed;
  }

  private restoreDecompose(): void {
    if (!this.decomposed) return;
    this.decomposed = false;
    for (const c of this.terrain.chunks) {
      c.mesh.position.set(c.x, c.y, c.z); c.mesh.scaling.set(1, 1, 1); c.mesh.rotation.set(0, 0, 0);
      c.mesh.freezeWorldMatrix();
    }
    for (const ch of this.forest.chunks) {
      const all = ch.rocks ? [...ch.near, ...ch.far, ch.rocks] : [...ch.near, ...ch.far];
      for (const m of all) { m.position.set(ch.x, ch.y, ch.z); m.scaling.set(1, 1, 1); m.rotation.set(0, 0, 0); m.freezeWorldMatrix(); }
    }
  }

  private applyDecompose(cx: number, cz: number): void {
    const e = this.extreme, a = e.decompose;
    this.decomposed = true;
    const step = Math.floor(e.t * 7), seed = e.seed | 0;
    const smooth = Math.sin(e.t * 2.3);
    let i = 0;
    for (const c of this.terrain.chunks) {
      i++;
      const h1 = hash3(i, seed, step) - 0.5, h2 = hash3(i, seed + 9, Math.floor(step / 3)) - 0.5;
      const near = 1 - sstep(150, 500, Math.hypot(c.x - cx, c.z - cz)) * 0.4;
      c.mesh.position.set(c.x + h2 * 14 * a * a, c.y + (h1 * 10 + h2 * 28 * smooth) * a * near - 6 * a * a, c.z - h2 * 9 * a * a);
      c.mesh.rotation.set(h2 * 0.06 * a, 0, h1 * 0.05 * a);
      c.mesh.scaling.set(1 - 0.06 * a * Math.abs(h2), 1 + h1 * 0.8 * a, 1 - 0.06 * a * Math.abs(h1));
      c.mesh.freezeWorldMatrix();
    }
    for (const ch of this.forest.chunks) {
      if (ch.lod === 2) continue;
      i++;
      const h1 = hash3(i, seed + 3, step) - 0.5, h2 = hash3(i, seed + 5, Math.floor(step / 2)) - 0.5;
      const list = ch.lod === 0 ? ch.near : ch.far;
      let k = 0;
      for (const m of list) {
        k++;
        const h3 = hash3(i, k, step) - 0.5;
        m.position.set(ch.x + h3 * 8 * a, ch.y + (h1 * 16 + h3 * 10 + 9 * smooth * h2) * a, ch.z + h2 * 8 * a);
        m.scaling.set(1 + h2 * 0.25 * a, Math.max(0.05, 1 + (h1 * 1.6 + h3) * a), 1 + h3 * 0.25 * a);
        m.rotation.set(h3 * 0.12 * a, 0, h1 * 0.12 * a);
        m.freezeWorldMatrix();
      }
    }
  }

  update(dt: number, camPos: Vec3Like, sky: SkyState, weather: WeatherState, alter: LocalAlterations, torch: TorchRender): void {
    if (this.disposed) return;
    const e = this.extreme;
    this.time += dt;
    // "stutter": il tempo delle animazioni avanza a scatti
    const prevAnim = this.animTime;
    this.animTime = e.active && e.stutter > 0 ? Math.max(prevAnim, stutterTime(this.time, e.stutter)) : this.time;
    const adt = Math.max(0, this.animTime - prevAnim);
    const strip = e.active ? e.strip : 0;
    const scene = this.scene;

    const pal = skyColors(sky, weather, this.pal);
    const precip = weather.precipType === 'none' ? 0 : clamp01(weather.precip);

    // nebbia
    let fogMode = 0, dens = 0, fStart = 0, fEnd = 0;
    if (this.gfx.fogEffects) {
      dens = fogDensity(weather, sky, this.gfx);
      scene.fogMode = 2; scene.fogDensity = dens; // FOGMODE_EXP2
    } else {
      const lin = fogLinear(weather, sky, this.gfx);
      fogMode = 1; fStart = lin.start; fEnd = lin.end; dens = 1.3 / lin.end;
      scene.fogMode = 3; scene.fogStart = fStart; scene.fogEnd = fEnd; // FOGMODE_LINEAR
    }
    const fl = this.fx.flash * 0.25;
    scene.fogColor.set(mix(pal.fog[0] + fl, 1, strip), mix(pal.fog[1] + fl, 1, strip), mix(pal.fog[2] + fl, 1, strip));

    envShared.snow = clamp01(weather.snowCover);
    envShared.wet = clamp01(weather.wetness) * (1 - envShared.snow * 0.7);
    envShared.strip = strip;

    this.rig.update(dt, camPos, pal, alter, torch, weather.fog + (dens > 0.004 ? 0.08 : 0), precip, this.fx.flash, strip);
    this.terrain.update(envShared.wet);
    this.forest.setWet(envShared.wet);
    if (this.forest.update(dt, camPos.x, camPos.z)) this.rig.syncCasters(this.forest.nearActive);

    this.sky.update(adt, this.animTime, camPos, sky, weather, pal, e.active ? e.sky : 0, strip * 0.0);
    this.distant.update(this.animTime, camPos, pal, distantHaze(weather), dens, envShared.snow, strip);
    dirFromAzEl(sky.moonAzimuth, sky.moonElevation, this.moonDir);
    const moonAmount = sstep(-0.02, 0.08, sky.moonElevation) * clamp01(sky.moonIllum) * (1 - 0.9 * clamp01(weather.cloud)) * (0.25 + 0.75 * pal.night);
    this.water.update(this.animTime, camPos, pal, this.moonDir, moonAmount, clamp01(alter.reflectionShift), this.rig.torchPos, this.rig.torchDir,
      this.rig.torchLevel, fogMode, dens, fStart, fEnd, strip);
    this.fx.update(adt, this.animTime, camPos, weather, pal, clamp01(alter.rainUp), clamp01(alter.dustFloat), this.rig.torchPos, this.rig.torchDir, this.rig.torchLevel);

    if (e.active && e.decompose > 0) this.applyDecompose(camPos.x, camPos.z);
    else this.restoreDecompose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    Object.assign(this.extreme, NO_EXTREME);
    envShared.snow = 0; envShared.wet = 0; envShared.strip = 0;
    this.rig.dispose(); this.fx.dispose(); this.distant.dispose(); this.sky.dispose(); this.water.dispose(); this.forest.dispose(); this.terrain.dispose();
    const s = this.scene, p = this.prevFog;
    s.fogMode = p.mode; s.fogDensity = p.density; s.fogStart = p.start; s.fogEnd = p.end; s.fogColor.copyFrom(p.color);
    s.getEngine().setHardwareScalingLevel(this.prevScaling);
  }
}

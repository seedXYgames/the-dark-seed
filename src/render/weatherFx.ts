// Effetti meteo: pioggia, neve, foglie/polvere nel vento, pulviscolo anomalo. Ogni campo è una sola mesh
// animata interamente nel vertex shader (nessuna allocazione o aggiornamento di buffer per frame).
import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import type { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import type { WeatherState } from '../core/api';
import { Rng } from '../core/rng';
import { clamp01, sstep, type QualityParams, type SkyPalette } from './envMath';
import { u3, u4 } from './sky';

Effect.ShadersStore['tdsPrecipVertexShader'] = `
precision highp float;
attribute vec3 position;attribute vec3 normal;attribute vec2 uv;
uniform mat4 view,projection;
uniform vec3 uCam,uBox,uOffset,uVel,uTorchPos,uTorchDir,uAmb;
uniform vec4 uP; // width, length, density, upFraction
uniform vec4 uQ; // swayAmp, swayFreq, time, torch
varying vec2 vUv;varying vec3 vLight;varying float vFade;
void main(void){
  float sp=0.75+0.25*floor(normal.x*2.999);
  float up=step(normal.y,uP.w)*step(0.0001,uP.w);
  vec3 off=uOffset*sp;off.y=mix(off.y,-off.y,up);
  vec3 p=position*uBox+off;
  p.xz+=sin(uQ.z*uQ.y*(0.6+normal.x)+normal.z*40.0+vec2(0.0,1.7))*uQ.x;
  p=mod(p-uCam+uBox*0.5,uBox)-uBox*0.5+uCam;
  vec3 vel=uVel;vel.y=mix(vel.y,-vel.y,up);
  vec3 axis=normalize(vel+vec3(0.0,1e-4,0.0));
  vec4 vc=view*vec4(p,1.0);
  vec3 va=mat3(view)*axis;
  vec2 side=normalize(vec2(-va.y,va.x)+vec2(1e-5,0.0));
  vc.xy+=side*uv.x*uP.x;
  vc.xyz+=va*(uv.y-0.5)*uP.y;
  gl_Position=projection*vc;
  if(fract(normal.z*7.31)>uP.z)gl_Position=vec4(2.0,2.0,2.0,1.0);
  vUv=uv;
  vec3 L=p-uTorchPos;float d=length(L);L/=max(d,0.001);
  float cone=smoothstep(0.80,0.95,dot(L,uTorchDir))*max(0.0,1.0-d/30.0);
  vLight=uAmb+vec3(1.0,0.93,0.8)*uQ.w*cone*1.6;
  float dc=length(p-uCam);
  vFade=smoothstep(0.5*min(uBox.x,uBox.z),0.36*min(uBox.x,uBox.z),dc)*smoothstep(0.3,1.2,dc);
}`;
Effect.ShadersStore['tdsPrecipFragmentShader'] = `
precision highp float;
varying vec2 vUv;varying vec3 vLight;varying float vFade;
uniform vec4 uColor;uniform float uRound;
void main(void){
  float a=uRound>0.5?smoothstep(1.0,0.25,length(vec2(vUv.x,vUv.y*2.0-1.0))):(1.0-abs(vUv.x))*smoothstep(0.0,0.2,vUv.y)*smoothstep(1.0,0.6,vUv.y);
  a*=uColor.a*vFade;
  gl_FragColor=vec4(uColor.rgb*vLight*a,a);
}`;

class ParticleField {
  mesh: Mesh; mat: ShaderMaterial;
  u: Record<string, Vector3> = {};
  uP: Vector4; uQ: Vector4; uColor: Vector4;
  ox = 0; oy = 0; oz = 0;
  constructor(scene: Scene, name: string, readonly count: number, readonly box: [number, number, number], round: boolean, additive: boolean) {
    const r = new Rng('tds.fx.' + name);
    const pos = new Float32Array(count * 12), nor = new Float32Array(count * 12), uv = new Float32Array(count * 8), idx = new Uint32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = r.next(), y = r.next(), z = r.next(), a = r.next(), b = r.next(), c = r.next();
      for (let k = 0; k < 4; k++) {
        pos.set([x, y, z], i * 12 + k * 3); nor.set([a, b, c], i * 12 + k * 3);
      }
      uv.set([-1, 0, 1, 0, 1, 1, -1, 1], i * 8);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    this.mesh = new Mesh('tds.fx.' + name, scene);
    const vd = new VertexData();
    vd.positions = pos; vd.normals = nor; vd.uvs = uv; vd.indices = idx;
    vd.applyToMesh(this.mesh, false);
    const names = ['uCam', 'uBox', 'uOffset', 'uVel', 'uTorchPos', 'uTorchDir', 'uAmb'];
    this.mat = new ShaderMaterial('tds.fx.' + name, scene, { vertex: 'tdsPrecip', fragment: 'tdsPrecip' }, {
      attributes: ['position', 'normal', 'uv'], uniforms: ['view', 'projection', ...names, 'uP', 'uQ', 'uColor', 'uRound'], needAlphaBlending: true,
    });
    for (const n of names) this.u[n] = u3(this.mat, n);
    this.uP = u4(this.mat, 'uP'); this.uQ = u4(this.mat, 'uQ'); this.uColor = u4(this.mat, 'uColor');
    this.mat.setFloat('uRound', round ? 1 : 0);
    this.u.uBox.set(box[0], box[1], box[2]);
    this.mat.alphaMode = additive ? 6 : 7; // ALPHA_ONEONE : ALPHA_PREMULTIPLIED
    this.mat.backFaceCulling = false; this.mat.disableDepthWrite = true;
    this.mesh.material = this.mat; this.mesh.isPickable = false; this.mesh.alwaysSelectAsActiveMesh = true; this.mesh.applyFog = false;
    this.mesh.setEnabled(false);
  }
  /** Avanza lo spostamento accumulato (riavvolto su 4 × box: invariante per le tre velocità relative). */
  step(dt: number, vx: number, vy: number, vz: number): void {
    this.ox = (this.ox + vx * dt) % (this.box[0] * 4); this.oy = (this.oy + vy * dt) % (this.box[1] * 4); this.oz = (this.oz + vz * dt) % (this.box[2] * 4);
    this.u.uOffset.set(this.ox, this.oy, this.oz);
    this.u.uVel.set(vx, vy, vz);
  }
  dispose(): void { this.mesh.dispose(); this.mat.dispose(); }
}

export class WeatherFx {
  private rain!: ParticleField; private snow!: ParticleField; private debris!: ParticleField; private motes!: ParticleField;
  private fields: ParticleField[] = [];
  private q: QualityParams;
  /** Incremento temporaneo della luce ambientale dovuto a un lampo (0..1). */
  flash = 0;
  private stormT = 0;

  constructor(private scene: Scene, q: QualityParams) { this.q = q; this.build(); }

  private build(): void {
    for (const f of this.fields) f.dispose();
    const q = this.q, s = this.scene;
    this.rain = new ParticleField(s, 'rain', q.rain, [26, 18, 26], false, true);
    this.snow = new ParticleField(s, 'snow', q.snow, [24, 14, 24], true, false);
    this.debris = new ParticleField(s, 'debris', q.debris, [30, 10, 30], true, false);
    this.motes = new ParticleField(s, 'motes', q.motes, [14, 8, 14], true, true);
    this.fields = [this.rain, this.snow, this.debris, this.motes];
  }

  setQuality(q: QualityParams): void {
    const rebuild = q.rain !== this.q.rain;
    this.q = q;
    if (rebuild) this.build();
  }

  update(dt: number, time: number, cam: { x: number; y: number; z: number }, weather: WeatherState, pal: SkyPalette, rainUp: number, dustFloat: number,
    torchPos: Vector3, torchDir: Vector3, torchI: number): void {
    const wx = Math.sin(weather.windDir) * weather.wind, wz = Math.cos(weather.windDir) * weather.wind;
    const p = clamp01(weather.precip);
    const rainD = weather.precipType === 'rain' ? Math.pow(p, 0.8) : 0;
    const snowD = weather.precipType === 'snow' ? Math.pow(p, 0.7) : 0;
    const debrisD = sstep(0.55, 0.95, weather.wind) * 0.9;
    const moteD = clamp01(dustFloat);
    const ai = pal.ambientIntensity;
    const ar = pal.ambientColor[0] * ai + pal.lightColor[0] * pal.lightIntensity * 0.4 + this.flash;
    const ag = pal.ambientColor[1] * ai + pal.lightColor[1] * pal.lightIntensity * 0.4 + this.flash;
    const ab = pal.ambientColor[2] * ai + pal.lightColor[2] * pal.lightIntensity * 0.4 + this.flash;
    const common = (f: ParticleField, density: number, width: number, length: number, up: number, swayA: number, swayF: number) => {
      const on = density > 0.004;
      if (on !== f.mesh.isEnabled()) f.mesh.setEnabled(on);
      if (!on) return false;
      f.u.uCam.set(cam.x, cam.y, cam.z);
      f.u.uTorchPos.copyFrom(torchPos); f.u.uTorchDir.copyFrom(torchDir);
      f.u.uAmb.set(ar, ag, ab);
      f.uP.set(width, length, density, up);
      f.uQ.set(swayA, swayF, time % 3600, torchI);
      return true;
    };
    if (common(this.rain, rainD, 0.011, 0.6 + 0.3 * p, rainUp, 0, 0)) {
      this.rain.step(dt, wx * 7, -16 - 5 * p, wz * 7);
      this.rain.uColor.set(0.75, 0.82, 0.95, 0.5);
    }
    if (common(this.snow, snowD, 0.028, 0.056, rainUp, 0.35, 0.9)) {
      this.snow.step(dt, wx * 3.2, -1.25, wz * 3.2);
      this.snow.uColor.set(0.95, 0.97, 1.0, 0.85);
    }
    if (common(this.debris, debrisD, 0.045, 0.07, 0, 0.8, 1.7)) {
      this.debris.step(dt, wx * 8, -0.5, wz * 8);
      this.debris.uColor.set(0.5, 0.36, 0.2, 0.8);
    }
    if (common(this.motes, moteD, 0.016, 0.032, 0, 0.25, 0.5)) {
      this.motes.step(dt, 0.03, 0.22, -0.02);
      this.motes.uColor.set(1.0, 0.95, 0.8, 0.55);
      this.motes.u.uAmb.set(ar + 0.12, ag + 0.12, ab + 0.12);
    }
    // lampi radi nei temporali forti: evento deterministico per finestra temporale
    this.flash = Math.max(0, this.flash - dt * 5);
    if (weather.precipType === 'rain' && p > 0.72) {
      const prev = Math.floor(this.stormT / 9);
      this.stormT += dt;
      const cur = Math.floor(this.stormT / 9);
      if (cur !== prev && ((cur * 2654435761) >>> 0) / 4294967296 < 0.3 * (p - 0.6) / 0.4) this.flash = 0.5;
    }
  }

  dispose(): void { for (const f of this.fields) f.dispose(); this.fields.length = 0; }
}

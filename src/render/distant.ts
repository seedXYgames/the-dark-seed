// Scenografia lontana non esplorabile: anelli di montagne, fascia di colline boscose (grembiule), luci di case lontane.
import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import type { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { fbm2, hash2, valueNoise2 } from '../core/rng';
import type { WorldModel } from '../world/model';
import { clamp01, mix, sstep, type SkyPalette } from './envMath';
import { set3, u3, u4 } from './sky';
import { buildApron } from './terrainMesh';

Effect.ShadersStore['tdsFarVertexShader'] = `
precision highp float;
attribute vec3 position;attribute vec3 normal;attribute vec4 color;
uniform mat4 viewProjection;uniform vec3 uCam;
varying vec3 vN;varying vec4 vC;varying float vD;
void main(void){vN=normal;vC=color;vD=length(position-uCam);gl_Position=viewProjection*vec4(position,1.0);}`;
Effect.ShadersStore['tdsFarFragmentShader'] = `
precision highp float;
varying vec3 vN;varying vec4 vC;varying float vD;
uniform vec3 uLightDir,uLightCol,uAmb,uAerial,uFog;
uniform vec4 uP; // haze, strip, fogDensity, snow
void main(void){
  vec3 n=normalize(vN);
  vec3 alb=mix(vC.rgb,vec3(0.7,0.74,0.8),uP.w*smoothstep(0.2,0.7,n.y)*0.8);
  vec3 col=alb*(uAmb+uLightCol*max(dot(n,uLightDir),0.0));
  if(vC.a<0.0){col=mix(col,uFog,1.0-exp(-pow(vD*uP.z,2.0)));}
  else{col=mix(col,uAerial,vC.a);col=mix(col,uFog,uP.x);}
  col=mix(col,vec3(1.0),uP.y);
  gl_FragColor=vec4(col,1.0);
}`;

Effect.ShadersStore['tdsSpriteVertexShader'] = `
precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 color;
uniform mat4 view,projection;uniform vec4 uS; // intensity, time, fogDensity, twinkle
varying vec2 vUv;varying vec3 vCol;
void main(void){
  vec4 vc=view*vec4(position,1.0);
  float d=length(vc.xyz);
  vc.xy+=uv*color.a;
  gl_Position=projection*vc;
  vUv=uv;
  float tw=1.0-uS.w*0.45*(0.5+0.5*sin(uS.y*(2.0+fract(position.x*0.37)*3.0)+position.z));
  vCol=color.rgb*uS.x*tw*exp(-pow(d*uS.z,2.0));
}`;
Effect.ShadersStore['tdsSpriteFragmentShader'] = `
precision highp float;
varying vec2 vUv;varying vec3 vCol;
void main(void){
  float r=length(vUv);
  float a=(exp(-r*r*14.0)+0.22*exp(-r*3.2))*smoothstep(1.0,0.55,r);
  gl_FragColor=vec4(vCol*a,a);
}`;

/** Mesh di N quad billboard additivi (centro per vertice, angolo in uv, colore+dimensione in color). */
export function makeSpriteMesh(scene: Scene, name: string, count: number, updatable: boolean): { mesh: Mesh; mat: ShaderMaterial; uS: Vector4; pos: Float32Array; col: Float32Array } {
  const pos = new Float32Array(count * 12), col = new Float32Array(count * 16), uv = new Float32Array(count * 8), idx = new Uint32Array(count * 6);
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < count; i++) {
    uv.set(corners, i * 8);
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = pos; vd.colors = col; vd.uvs = uv; vd.indices = idx;
  vd.applyToMesh(mesh, updatable);
  const mat = new ShaderMaterial(name, scene, { vertex: 'tdsSprite', fragment: 'tdsSprite' }, {
    attributes: ['position', 'uv', 'color'], uniforms: ['view', 'projection', 'uS'], needAlphaBlending: true,
  });
  mat.alphaMode = 6; // ALPHA_ONEONE
  mat.backFaceCulling = false; mat.disableDepthWrite = true;
  mesh.material = mat; mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true; mesh.hasVertexAlpha = true;
  return { mesh, mat, uS: u4(mat, 'uS'), pos, col };
}
export function setSprite(pos: Float32Array, col: Float32Array, i: number, x: number, y: number, z: number, r: number, g: number, b: number, size: number): void {
  for (let k = 0; k < 4; k++) {
    pos[i * 12 + k * 3] = x; pos[i * 12 + k * 3 + 1] = y; pos[i * 12 + k * 3 + 2] = z;
    col[i * 16 + k * 4] = r; col[i * 16 + k * 4 + 1] = g; col[i * 16 + k * 4 + 2] = b; col[i * 16 + k * 4 + 3] = size;
  }
}

const RINGS = [
  { R: 1560, base: 430, aerial: 0.40, depth: 420 },
  { R: 2200, base: 680, aerial: 0.60, depth: 520 },
  { R: 2860, base: 980, aerial: 0.76, depth: 600 },
];

export class DistantRenderer {
  private meshes: Mesh[] = [];
  private mat: ShaderMaterial;
  private u: Record<string, Vector3> = {};
  private uP: Vector4;
  private lights: ReturnType<typeof makeSpriteMesh> | null = null;

  constructor(scene: Scene, model: WorldModel) {
    const names = ['uCam', 'uLightDir', 'uLightCol', 'uAmb', 'uAerial', 'uFog'];
    this.mat = new ShaderMaterial('tds.far', scene, { vertex: 'tdsFar', fragment: 'tdsFar' }, {
      attributes: ['position', 'normal', 'color'], uniforms: ['viewProjection', ...names, 'uP'],
    });
    for (const n of names) this.u[n] = u3(this.mat, n);
    this.uP = u4(this.mat, 'uP');
    this.mat.backFaceCulling = false;
    const salt = model.spec.terrain.salt | 0;
    const add = (name: string, positions: Float32Array, normals: Float32Array, colors: Float32Array, indices: Uint32Array) => {
      const m = new Mesh(name, scene);
      const vd = new VertexData();
      vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
      vd.applyToMesh(m, false);
      m.material = this.mat; m.isPickable = false; m.applyFog = false; m.freezeWorldMatrix(); m.alwaysSelectAsActiveMesh = true;
      this.meshes.push(m);
    };
    const ap = buildApron(model);
    for (let i = 3; i < ap.colors.length; i += 4) ap.colors[i] = -1; // nebbia di scena calcolata sulla distanza
    add('tds.apron', ap.positions, ap.normals, ap.colors, ap.indices);

    const ridge = (ri: number, a: number) => {
      const cx = Math.cos(a), sz = Math.sin(a), s = salt + ri * 77;
      const big = fbm2(cx * 1.6 + 5, sz * 1.6 + 5, s, 2);
      const mid = 1 - Math.abs(fbm2(cx * 5 + 9, sz * 5 + 9, s + 3, 3) * 2 - 1);
      const fine = fbm2(cx * 22, sz * 22, s + 5, 2);
      return RINGS[ri].base * (0.3 + 0.75 * big + 0.42 * mid * mid + 0.12 * fine);
    };
    RINGS.forEach((ring, ri) => {
      const SEG = 220, prof = [0, 0.3, 0.6, 0.85, 1], P = prof.length;
      const pos = new Float32Array(SEG * P * 3), col = new Float32Array(SEG * P * 4), nor = new Float32Array(SEG * P * 3), idx = new Uint32Array(SEG * (P - 1) * 6);
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2, H = ridge(ri, a);
        for (let p = 0; p < P; p++) {
          const f = prof[p], v = s * P + p;
          const wob = (hash2(s, p, salt + ri) - 0.5) * 0.12 * (p > 0 && p < P - 1 ? 1 : 0);
          const r = ring.R - (1 - f) * ring.depth * (1 + wob);
          const y = p === 0 ? -140 : H * Math.pow(f, 1.25) * (1 + wob * 1.5);
          pos[v * 3] = Math.sin(a) * r; pos[v * 3 + 1] = y; pos[v * 3 + 2] = Math.cos(a) * r;
          const n = 0.8 + 0.4 * hash2(s, p + 9, salt + ri);
          const rock = sstep(0.42, 0.7, y / (ring.base * 1.2) + (n - 1) * 0.3);
          const snow = sstep(0.82, 1.0, y / (ring.base * 1.15) + (n - 1) * 0.25);
          let cr = mix(0.045, 0.2, rock) * n, cg = mix(0.075, 0.19, rock) * n, cb = mix(0.05, 0.19, rock) * n;
          cr = mix(cr, 0.62, snow); cg = mix(cg, 0.66, snow); cb = mix(cb, 0.74, snow);
          col[v * 4] = cr; col[v * 4 + 1] = cg; col[v * 4 + 2] = cb; col[v * 4 + 3] = ring.aerial;
        }
      }
      let o = 0;
      for (let s = 0; s < SEG; s++)
        for (let p = 0; p < P - 1; p++) {
          const a = s * P + p, b = ((s + 1) % SEG) * P + p;
          idx[o++] = a; idx[o++] = a + 1; idx[o++] = b; idx[o++] = b; idx[o++] = a + 1; idx[o++] = b + 1;
        }
      VertexData.ComputeNormals(pos, idx, nor);
      // normali rivolte verso l'interno/alto (verso il giocatore)
      for (let v = 0; v < SEG * P; v++) {
        const d = nor[v * 3] * pos[v * 3] + nor[v * 3 + 2] * pos[v * 3 + 2];
        if (d > 0) { nor[v * 3] = -nor[v * 3]; nor[v * 3 + 1] = -nor[v * 3 + 1]; nor[v * 3 + 2] = -nor[v * 3 + 2]; }
      }
      add('tds.mountains.' + ri, pos, nor, col, idx);
    });

    // luci di case lontane sulle pendici del primo anello
    let count = 0;
    for (const f of model.spec.farLights) count += f.count;
    if (count > 0) {
      const sp = makeSpriteMesh(scene, 'tds.farLights', count, false);
      let i = 0;
      model.spec.farLights.forEach((f, fi) => {
        for (let k = 0; k < f.count; k++) {
          const a = f.azimuth + (hash2(fi, k, salt + 501) - 0.5) * 0.16;
          const fr = 0.42 + 0.3 * hash2(fi, k, salt + 502);
          const r = RINGS[0].R - (1 - fr) * RINGS[0].depth - 14;
          const y = ridge(0, a) * Math.pow(fr, 1.25) + 4 + (valueNoise2(a * 40, k, salt) - 0.5) * 30;
          const warm = hash2(fi, k, salt + 503);
          setSprite(sp.pos, sp.col, i++, Math.sin(a) * r, y, Math.cos(a) * r, 1.0, 0.62 + 0.2 * warm, 0.28 + 0.25 * warm, 4.5 + 3.5 * hash2(fi, k, salt + 504));
        }
      });
      sp.mesh.setVerticesData('position', sp.pos, false);
      sp.mesh.setVerticesData('color', sp.col, false);
      sp.mesh.applyFog = false;
      this.lights = sp;
    }
  }

  update(time: number, cam: { x: number; y: number; z: number }, pal: SkyPalette, haze: number, fogDensity: number, snow: number, strip: number): void {
    const u = this.u;
    u.uCam.set(cam.x, cam.y, cam.z);
    set3(u.uLightDir, pal.lightDir);
    const li = pal.lightIntensity * 1.2;
    u.uLightCol.set(pal.lightColor[0] * li, pal.lightColor[1] * li, pal.lightColor[2] * li);
    const ai = pal.ambientIntensity;
    u.uAmb.set(pal.ambientColor[0] * ai, pal.ambientColor[1] * ai, pal.ambientColor[2] * ai);
    u.uAerial.set(mix(pal.horizon[0], pal.zenith[0], 0.45), mix(pal.horizon[1], pal.zenith[1], 0.45), mix(pal.horizon[2], pal.zenith[2], 0.45));
    set3(u.uFog, pal.fog);
    this.uP.set(clamp01(haze), strip, fogDensity, snow);
    if (this.lights) this.lights.uS.set((0.25 + 0.75 * pal.night) * (1 - clamp01(haze * 1.15)) * (1 - strip), time % 3600, 0, 1);
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    this.meshes.length = 0;
    this.mat.dispose();
    if (this.lights) { this.lights.mesh.dispose(); this.lights.mat.dispose(); }
  }
}

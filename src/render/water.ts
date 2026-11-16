// Acqua: lago (forma da lakeRadiusAt) e nastro del fiume. Materiale scuro riflettente con increspature animate,
// riflesso di luna/cielo, bordi sfumati sulla profondità (niente z-fighting con le rive).
import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import type { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { lakeRadiusAt, polyLens } from '../world/terrain';
import type { WorldModel } from '../world/model';
import { mix, type RGB, type SkyPalette } from './envMath';
import { set3, u3, u4 } from './sky';
import { TORCH_PROFILE_GLSL, TORCH_COLOR } from '../core/torch';

Effect.ShadersStore['tdsWaterVertexShader'] = `
precision highp float;
attribute vec3 position;attribute vec2 uv;
uniform mat4 viewProjection;
varying vec3 vPos;varying float vDepth;
void main(void){vPos=position;vDepth=uv.x;gl_Position=viewProjection*vec4(position,1.0);}`;

Effect.ShadersStore['tdsWaterFragmentShader'] = `
precision highp float;
varying vec3 vPos;varying float vDepth;
uniform vec3 uCam,uZenith,uHorizon,uFog,uMoonDir,uMoonCol,uTorchPos,uTorchDir;
uniform vec4 uP; // time, reflectionShift, torch, strip
uniform vec4 uF; // fogMode, density, start, end
${TORCH_PROFILE_GLSL}
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}
void main(void){
  vec2 p=vPos.xz;float t=uP.x;
  vec2 g=(vec2(vn(p*0.8+vec2(t*0.21,t*0.12)),vn(p*0.8+vec2(17.0-t*0.16,t*0.19)))-0.5)*0.22
        +(vec2(vn(p*2.9-vec2(t*0.42,t*0.1)),vn(p*2.9+vec2(31.0,-t*0.37)))-0.5)*0.13;
  vec3 n=normalize(vec3(g.x,1.0,g.y));
  vec3 V=normalize(uCam-vPos);
  float dist=length(uCam-vPos);
  n=normalize(mix(n,vec3(0.0,1.0,0.0),clamp(dist/400.0,0.0,0.5)));
  vec3 R=reflect(-V,n);
  float fres=0.04+0.96*pow(1.0-max(dot(V,n),0.0),4.0);
  vec3 skyc=mix(uHorizon,uZenith,pow(max(R.y,0.0),0.45));
  vec3 deep=vec3(0.004,0.009,0.012)+uZenith*0.12;
  vec3 col=mix(deep,skyc,fres);
  float sh=uP.y;
  vec3 md=normalize(rotY(uMoonDir,sh*1.3)+vec3(0.0,sh*0.25,0.0));
  float sp=pow(max(dot(R,md),0.0),260.0)*3.0+pow(max(dot(R,md),0.0),30.0)*0.3+pow(max(dot(R,md),0.0),6.0)*0.05;
  if(sh>0.0){
    vec3 m2=normalize(rotY(uMoonDir,-sh*2.1)+vec3(0.0,0.4*sh,0.0));
    sp+=sh*(pow(max(dot(R,m2),0.0),200.0)*3.0);
  }
  col+=uMoonCol*sp;
  vec3 L=vPos-uTorchPos;float d=length(L);L/=d;
  float cone=tdsTorchMask(vPos-uTorchPos,uTorchDir)*max(0.0,1.0-d/45.0);
  col+=uP.z*cone*vec3(${TORCH_COLOR.map(c => c.toFixed(3)).join(',')})*(0.035+0.9*pow(max(dot(R,-L),0.0),50.0));
  float fog=uF.x<0.5?1.0-exp(-pow(dist*uF.y,2.0)):clamp((dist-uF.z)/(uF.w-uF.z),0.0,1.0);
  col=mix(col,uFog,fog);
  col=mix(col,vec3(1.0),uP.w);
  gl_FragColor=vec4(col,smoothstep(0.0,0.3,vDepth)*0.94);
}`;

export class WaterRenderer {
  readonly meshes: Mesh[] = [];
  private mat: ShaderMaterial;
  private u: Record<string, Vector3> = {};
  private uP: Vector4; private uF: Vector4;

  constructor(scene: Scene, model: WorldModel) {
    const names = ['uCam', 'uZenith', 'uHorizon', 'uFog', 'uMoonDir', 'uMoonCol', 'uTorchPos', 'uTorchDir'];
    this.mat = new ShaderMaterial('tds.water', scene, { vertex: 'tdsWater', fragment: 'tdsWater' }, {
      attributes: ['position', 'uv'], uniforms: ['viewProjection', ...names, 'uP', 'uF'], needAlphaBlending: true,
    });
    for (const n of names) this.u[n] = u3(this.mat, n);
    this.uP = u4(this.mat, 'uP'); this.uF = u4(this.mat, 'uF');
    this.mat.backFaceCulling = false;
    this.mat.disableDepthWrite = true;
    const t = model.spec.terrain;
    const add = (name: string, pos: number[], uv: number[], idx: number[]) => {
      const m = new Mesh(name, scene);
      const vd = new VertexData();
      vd.positions = new Float32Array(pos); vd.uvs = new Float32Array(uv); vd.indices = new Uint32Array(idx);
      vd.applyToMesh(m, false);
      m.material = this.mat; m.isPickable = false; m.freezeWorldMatrix();
      this.meshes.push(m);
    };
    if (t.lake) {
      const lake = t.lake, SEG = 72, fr = [0.3, 0.55, 0.75, 0.86, 0.93, 0.98, 1.02, 1.05];
      const pos: number[] = [lake.center.x, lake.level, lake.center.z], uv: number[] = [model.waterDepthAt(lake.center.x, lake.center.z), 0], idx: number[] = [];
      for (let r = 0; r < fr.length; r++)
        for (let s = 0; s < SEG; s++) {
          const a = (s / SEG) * Math.PI * 2, R = lakeRadiusAt(lake, a) * fr[r];
          const x = lake.center.x + Math.cos(a) * R, z = lake.center.z + Math.sin(a) * R;
          pos.push(x, lake.level, z);
          uv.push(r === fr.length - 1 ? 0 : model.waterDepthAt(x, z), 0);
        }
      for (let s = 0; s < SEG; s++) idx.push(0, 1 + s, 1 + ((s + 1) % SEG));
      for (let r = 0; r < fr.length - 1; r++)
        for (let s = 0; s < SEG; s++) {
          const a = 1 + r * SEG + s, b = 1 + r * SEG + ((s + 1) % SEG), c = a + SEG, d = b + SEG;
          idx.push(a, c, b, b, c, d);
        }
      add('tds.lake', pos, uv, idx);
    }
    if (t.river && t.river.points.length > 1) {
      const rv = t.river, lens = polyLens(rv.points), total = lens[lens.length - 1];
      const offs = [-1.1, -0.88, -0.5, 0, 0.5, 0.88, 1.1], W = offs.length;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const n = Math.max(2, Math.ceil(total / 4));
      const at = (d: number) => {
        let i = 1;
        while (i < lens.length - 1 && lens[i] < d) i++;
        const f = (d - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
        return { x: mix(rv.points[i - 1].x, rv.points[i].x, f), z: mix(rv.points[i - 1].z, rv.points[i].z, f) };
      };
      for (let k = 0; k <= n; k++) {
        const d = (k / n) * total, p = at(d), a = at(Math.max(0, d - 2)), b = at(Math.min(total, d + 2));
        let tx = b.x - a.x, tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const y = mix(rv.levelStart, rv.levelEnd, k / n) + 0.02;
        for (let w = 0; w < W; w++) {
          const x = p.x - tz * offs[w] * rv.halfWidth, z = p.z + tx * offs[w] * rv.halfWidth;
          pos.push(x, y, z);
          uv.push(w === 0 || w === W - 1 ? 0 : Math.max(model.waterDepthAt(x, z), Math.abs(offs[w]) < 0.6 ? 0.5 : 0), 1);
        }
      }
      for (let k = 0; k < n; k++)
        for (let w = 0; w < W - 1; w++) {
          const a = k * W + w, b = a + 1, c = a + W, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      add('tds.river', pos, uv, idx);
    }
  }

  update(time: number, cam: { x: number; y: number; z: number }, pal: SkyPalette, moonDir: RGB, moonAmount: number, reflectionShift: number,
    torchPos: Vector3, torchDir: Vector3, torchI: number, fogMode: number, fogDensity: number, fogStart: number, fogEnd: number, strip: number): void {
    if (!this.meshes.length) return;
    const u = this.u;
    u.uCam.set(cam.x, cam.y, cam.z);
    set3(u.uZenith, pal.zenith); set3(u.uHorizon, pal.horizon); set3(u.uFog, pal.fog); set3(u.uMoonDir, moonDir);
    u.uMoonCol.set(0.75 * moonAmount, 0.85 * moonAmount, 1.0 * moonAmount);
    u.uTorchPos.copyFrom(torchPos); u.uTorchDir.copyFrom(torchDir);
    this.uP.set(time % 3600, reflectionShift, torchI, strip);
    this.uF.set(fogMode, fogDensity, fogStart, fogEnd);
  }

  dispose(): void { for (const m of this.meshes) m.dispose(); this.meshes.length = 0; this.mat.dispose(); }
}

// Cupola del cielo procedurale: gradienti, bagliore del sole, stelle, luna con fase, nuvole fbm, modalità "cielo impossibile".
import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import type { SkyState, WeatherState } from '../core/api';
import { clamp01, dirFromAzEl, sstep, type RGB, type SkyPalette } from './envMath';

Effect.ShadersStore['tdsSkyVertexShader'] = `
precision highp float;
attribute vec3 position;
uniform mat4 viewProjection;
uniform vec3 uCam;
varying vec3 vDir;
void main(void){
  vDir=position;
  vec4 p=viewProjection*vec4(position*50.0+uCam,1.0);
  gl_Position=vec4(p.xy,p.w*0.99995,p.w);
}`;

Effect.ShadersStore['tdsSkyFragmentShader'] = `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith,uHorizon,uFog,uCloud,uCloudLit,uSunGlow,uSunDir,uMoonDir;
uniform vec4 uA; // sunGlowAmount, starVis, cloud, time
uniform vec4 uB; // moonPhase, moonVis, starSeed, fogSky
uniform vec4 uC; // cloudOffset.xy, extreme, strip
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float h31(vec3 p){p=fract(p*vec3(0.1031,0.1030,0.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=0.5,s=0.0;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.2);a*=0.5;}return s;}
float stars(vec3 d,float scale,float thr,float seed){
  vec3 p=d*scale;vec3 c=floor(p);vec3 f=fract(p)-0.5;
  float h=h31(c+seed);
  vec3 o=(vec3(h31(c+seed+7.1),h31(c+seed+13.7),h31(c+seed+23.3))-0.5)*0.6;
  float m=smoothstep(0.11,0.0,length(f-o));
  float tw=0.8+0.2*sin(uA.w*(1.5+h*3.0)+h*40.0);
  return m*step(thr,h)*tw*(0.35+0.65*fract(h*91.7));
}
void main(void){
  vec3 d=normalize(vDir);
  float y=max(d.y,0.0);
  vec3 col=mix(uHorizon,uZenith,pow(y,0.42));
  // bagliore del sole al crepuscolo
  float sd=max(dot(normalize(vec3(d.x,0.0,d.z)+1e-5),normalize(vec3(uSunDir.x,0.0,uSunDir.z)+1e-5)),0.0);
  float hb=exp(-y*5.5);
  col+=uSunGlow*uA.x*(pow(sd,3.0)*0.55*hb+pow(sd,24.0)*0.5*exp(-y*10.0));
  float s3=max(dot(d,uSunDir),0.0);
  col+=uSunGlow*uA.x*pow(s3,180.0)*1.2*step(0.0,uSunDir.y+0.02);
  // nuvole
  vec2 cuv=d.xz/(y+0.16)*0.75+uC.xy;
  float n=fbm(cuv)+0.35*fbm(cuv*2.7-uC.xy*0.4)-0.175;
  float cov=uA.z;
  float ca=smoothstep(1.0-cov*1.15,1.22-cov*0.95,n+0.08);
  ca*=smoothstep(-0.02,0.10,d.y);
  float thick=smoothstep(1.0-cov*1.15,1.6-cov*0.9,n);
  // stelle
  float sv=uA.y*(1.0-ca)*smoothstep(0.0,0.22,d.y+0.04);
  if(sv>0.003){
    float st=stars(d,150.0,0.90,uB.z)+0.6*stars(d,330.0,0.93,uB.z+31.0);
    vec3 sc=mix(vec3(0.75,0.85,1.0),vec3(1.0,0.9,0.75),h31(floor(d*150.0)));
    col+=sc*st*sv*1.5;
    // fascia lattiginosa
    vec3 ax=normalize(vec3(sin(uB.z),0.45,cos(uB.z)));
    float band=exp(-abs(dot(d,ax))*6.0);
    col+=vec3(0.035,0.04,0.06)*band*sv*(0.5+fbm(d.xz*6.0+d.y*3.0));
  }
  // luna
  float mv=uB.y;
  if(mv>0.001){
    vec3 md=uMoonDir;
    vec3 mr=normalize(cross(vec3(0.0,1.0,0.0),md));vec3 mu=cross(md,mr);
    vec3 rel=d-md*dot(d,md);
    vec2 q=vec2(dot(rel,mr),dot(rel,mu))/0.034;
    float r2=dot(q,q);
    float ang=acos(clamp(dot(d,md),-1.0,1.0));
    float veil=1.0-0.93*ca;
    float lit=0.5-0.5*cos(uB.x*6.2831853);
    col+=vec3(0.55,0.68,1.0)*mv*lit*(0.16*exp(-ang*9.0)+0.05*exp(-ang*2.6))*(0.35+0.65*veil+0.5*ca*(1.0-thick));
    if(r2<1.0&&dot(d,md)>0.0){
      vec3 nrm=vec3(q,sqrt(1.0-r2));
      float a=uB.x*6.2831853;
      vec3 L=vec3(sin(a),0.0,-cos(a));
      float l=smoothstep(-0.03,0.12,dot(nrm,L));
      float mar=0.78+0.22*vn(q*2.3+3.0)-0.18*smoothstep(0.55,0.75,vn(q*1.4+9.0));
      vec3 mc=vec3(0.96,0.94,0.86)*mar*(l+0.018);
      float edge=smoothstep(1.0,0.92,r2);
      col=mix(col,max(col,mc*mv),edge*veil*clamp(l+0.25,0.0,1.0));
    }
  }
  // composizione nuvole: scure e pesanti da coperto, orlate di luce verso sole/luna
  float lite=pow(sd,2.0)*hb*uA.x+0.35*pow(max(dot(d,uMoonDir),0.0),6.0)*uB.y;
  vec3 cc=mix(uCloud,uCloudLit,clamp(lite*(1.0-0.6*thick)+0.12*(1.0-thick),0.0,1.0));
  col=mix(col,cc,ca*0.97);
  // foschia all'orizzonte e sotto: stesso colore della nebbia di scena
  float hz=exp(-max(d.y,0.0)*mix(22.0,1.6,uB.w));
  col=mix(col,uFog,clamp(hz*(0.55+0.45*uB.w)+uB.w*0.6,0.0,1.0));
  if(d.y<0.0)col=mix(col,uFog,smoothstep(0.0,-0.05,d.y));
  // cielo impossibile
  float ex=uC.z;
  if(ex>0.0){
    vec3 ax=normalize(vec3(0.3,0.8,-0.5));
    float an=acos(clamp(dot(d,ax),-1.0,1.0));
    float rings=smoothstep(0.42,0.5,abs(fract(an*7.0-uA.w*0.11)-0.5));
    vec3 ad=abs(d);float mx=max(ad.x,max(ad.y,ad.z));
    vec2 g=(ad.x==mx?d.yz:(ad.y==mx?d.xz:d.xy))/mx;
    vec2 gf=abs(fract(g*6.0+0.5*floor(uA.w*0.5))-0.5);
    float grid=smoothstep(0.47,0.495,max(gf.x,gf.y));
    vec3 inv=vec3(1.0)-clamp(col*6.0,0.0,1.0);
    vec3 alt=mix(inv*vec3(0.92,0.96,1.0),vec3(0.02,0.0,0.05),rings);
    alt+=grid*vec3(0.6,1.0,0.85);
    float bleed=smoothstep(1.0-ex*1.4,1.15-ex*1.2,fbm(d.xz*2.0+d.y*3.0+uA.w*0.05)+ex*0.2);
    col=mix(col,alt,clamp(bleed*ex*1.3,0.0,1.0));
  }
  col=mix(col,vec3(1.0),uC.w);
  gl_FragColor=vec4(col,1.0);
}`;

/** Uniform vettoriali persistenti: registrati una volta e poi mutati (nessuna allocazione per frame). */
export function u3(mat: ShaderMaterial, name: string): Vector3 { const v = new Vector3(); mat.setVector3(name, v); return v; }
export function u4(mat: ShaderMaterial, name: string): Vector4 { const v = new Vector4(); mat.setVector4(name, v); return v; }
export const set3 = (v: Vector3, c: RGB) => v.set(c[0], c[1], c[2]);

export class SkyRenderer {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  private offX = 0; private offZ = 0;
  private tmp: RGB = [0, 0, 0];
  private u: Record<string, Vector3> = {};
  private uA: Vector4; private uB: Vector4; private uC: Vector4;

  constructor(scene: Scene) {
    const m = new Mesh('tds.sky', scene);
    const vd = new VertexData();
    vd.positions = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
    vd.indices = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
    vd.applyToMesh(m, false);
    const names = ['uCam', 'uZenith', 'uHorizon', 'uFog', 'uCloud', 'uCloudLit', 'uSunGlow', 'uSunDir', 'uMoonDir'];
    this.mat = new ShaderMaterial('tds.sky', scene, { vertex: 'tdsSky', fragment: 'tdsSky' }, {
      attributes: ['position'], uniforms: ['viewProjection', ...names, 'uA', 'uB', 'uC'],
    });
    for (const n of names) this.u[n] = u3(this.mat, n);
    this.uA = u4(this.mat, 'uA'); this.uB = u4(this.mat, 'uB'); this.uC = u4(this.mat, 'uC');
    this.mat.backFaceCulling = false;
    this.mat.disableDepthWrite = true;
    this.mat.fogEnabled = false;
    m.material = this.mat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
    m.applyFog = false;
    this.mesh = m;
  }

  update(dt: number, time: number, cam: { x: number; y: number; z: number }, sky: SkyState, weather: WeatherState, pal: SkyPalette, extremeSky: number, strip: number): void {
    const w = 0.004 + 0.03 * weather.wind;
    this.offX += Math.sin(weather.windDir) * w * dt; this.offZ += Math.cos(weather.windDir) * w * dt;
    if (Math.abs(this.offX) > 512) this.offX = 0;
    if (Math.abs(this.offZ) > 512) this.offZ = 0;
    const u = this.u;
    u.uCam.set(cam.x, cam.y, cam.z);
    set3(u.uZenith, pal.zenith); set3(u.uHorizon, pal.horizon); set3(u.uFog, pal.fog); set3(u.uCloud, pal.cloud);
    set3(u.uCloudLit, pal.cloudLit); set3(u.uSunGlow, pal.sunGlow);
    set3(u.uSunDir, dirFromAzEl(sky.sunAzimuth, sky.sunElevation, this.tmp));
    set3(u.uMoonDir, dirFromAzEl(sky.moonAzimuth, sky.moonElevation, this.tmp));
    const precip = weather.precipType === 'none' ? 0 : weather.precip;
    this.uA.set(pal.sunGlowAmount, clamp01(sky.starVisibility), clamp01(weather.cloud), time % 3600);
    this.uB.set(sky.moonPhase, sstep(-0.06, 0.03, sky.moonElevation), (sky.starSeed % 997) * 0.37, clamp01(Math.pow(clamp01(weather.fog), 0.8) + precip * 0.35));
    this.uC.set(this.offX, this.offZ, extremeSky, strip);
  }

  dispose(): void { this.mesh.dispose(); this.mat.dispose(); }
}

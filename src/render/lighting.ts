// Luci dell'ambiente: emisferica, luna/sole con ombre che seguono la camera, torcia con fascio volumetrico,
// bagliore del telefono, luci anomale, post-process finale (calibrazione display, vignettatura, grana, FXAA).
import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { FxaaPostProcess } from '@babylonjs/core/PostProcesses/fxaaPostProcess';
import { Vector3, type Vector4 } from '@babylonjs/core/Maths/math.vector';
import type { LocalAlterations, TorchRender } from '../core/api';
import type { GraphicsSettings } from '../core/contracts';
import { calibration, clamp01, type QualityParams, type SkyPalette } from './envMath';
import { makeSpriteMesh, setSprite } from './distant';
import { u3, u4 } from './sky';

Effect.ShadersStore['tdsBeamVertexShader'] = `
precision highp float;
attribute vec3 position;
uniform mat4 world,view,projection;
varying vec3 vP;
void main(void){
  vec4 p=view*world*vec4(position,1.0);
  vP=p.xyz;
  gl_Position=projection*p;
}`;
// Diffusione analitica: per ogni raggio di vista, distanza minima dall'asse del fascio (costante nello spazio camera).
Effect.ShadersStore['tdsBeamFragmentShader'] = `
precision highp float;
varying vec3 vP;
uniform vec4 uBeam; // rgb, intensity
void main(void){
  vec3 r=normalize(vP);
  vec3 A=vec3(0.22,-0.2,0.12);
  vec3 D=normalize(vec3(-0.035,0.03,1.0));
  vec3 w0=-A;
  float b=dot(r,D),d=dot(r,w0),e=dot(D,w0);
  float den=max(1.0-b*b,1e-4);
  float tr=(b*e-d)/den,sa=(e-b*d)/den;
  sa=max(sa,0.0);tr=max(tr,0.0);
  float dist=length(r*tr-(A+D*sa));
  float rad=sa*0.36+0.03;
  float g=exp(-2.2*dist*dist/(rad*rad))*exp(-sa/9.0)*smoothstep(0.05,1.2,sa);
  g+=0.35*exp(-0.6*dist*dist/(rad*rad))*exp(-sa/5.0)*smoothstep(0.05,1.2,sa);
  float a=g*uBeam.a;
  gl_FragColor=vec4(uBeam.rgb*a,a);
}`;
Effect.ShadersStore['tdsFinalFragmentShader'] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec4 uCal; // gain, 1/gamma, vignette, grain
uniform float uTime;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(void){
  vec3 c=texture2D(textureSampler,vUV).rgb;
  c=pow(max(c,vec3(0.0)),vec3(uCal.y))*uCal.x;
  vec2 q=vUV-0.5;
  c*=1.0-uCal.z*dot(q,q)*1.5;
  c+=(h21(vUV*917.0+fract(uTime)*31.0)-0.5)*uCal.w*(0.35+c);
  gl_FragColor=vec4(c,1.0);
}`;

const MAX_ANOM = 8;
const SHADOW_DIST = 260;

export class LightingRig {
  readonly hemi: HemisphericLight;
  readonly moonLight: DirectionalLight;
  readonly torch: SpotLight;
  readonly phone: PointLight;
  shadowGenerator: ShadowGenerator | null = null;
  /** Posizione e direzione mondo della torcia (per acqua e precipitazioni). */
  readonly torchPos = new Vector3();
  readonly torchDir = new Vector3(0, 0, 1);
  torchLevel = 0;
  private anomLight: PointLight | null = null;
  private beam: Mesh; private beamMat: ShaderMaterial; private uBeam: Vector4;
  private anom: ReturnType<typeof makeSpriteMesh>;
  private fxaa: FxaaPostProcess | null = null;
  private final: PostProcess | null = null;
  private casters: AbstractMesh[] = [];
  private shadowRange = 75;
  private right = new Vector3(); private up = new Vector3(); private dir = new Vector3();
  private cal = { gain: 1, gamma: 1 };
  private time = 0;

  constructor(private scene: Scene, private camera: Camera) {
    this.anom = makeSpriteMesh(scene, 'tds.anomLights', MAX_ANOM, true);
    this.hemi = new HemisphericLight('tds.hemi', new Vector3(0, 1, 0), scene);
    this.hemi.specular.set(0, 0, 0);
    this.moonLight = new DirectionalLight('tds.moon', new Vector3(-0.4, -0.8, 0.3), scene);
    this.moonLight.autoUpdateExtends = false;
    this.moonLight.shadowMinZ = 1; this.moonLight.shadowMaxZ = SHADOW_DIST * 2;
    this.torch = new SpotLight('tds.torch', new Vector3(0.22, -0.2, 0.12), new Vector3(-0.035, 0.03, 1), 1.2, 24, scene);
    this.torch.parent = camera;
    this.torch.range = 45;
    this.torch.diffuse.set(1, 0.93, 0.8); this.torch.specular.set(0.6, 0.56, 0.48);
    this.torch.intensity = 0;
    this.phone = new PointLight('tds.phone', new Vector3(0, -0.28, 0.32), scene);
    this.phone.parent = camera;
    this.phone.range = 6.5;
    this.phone.diffuse.set(0.55, 0.7, 1); this.phone.specular.set(0, 0, 0);
    this.phone.intensity = 0;

    // fascio volumetrico: quad additivo davanti alla camera, diffusione calcolata nel fragment shader
    const pos = [-0.6, -0.4, 0.25, 0.6, -0.4, 0.25, 0.6, 0.4, 0.25, -0.6, 0.4, 0.25], idx = [0, 1, 2, 0, 2, 3];
    this.beam = new Mesh('tds.torchBeam', scene);
    const vd = new VertexData();
    vd.positions = pos; vd.indices = idx;
    vd.applyToMesh(this.beam, false);
    this.beamMat = new ShaderMaterial('tds.torchBeam', scene, { vertex: 'tdsBeam', fragment: 'tdsBeam' }, {
      attributes: ['position'], uniforms: ['world', 'view', 'projection', 'uBeam'], needAlphaBlending: true,
    });
    this.beamMat.alphaMode = 6; this.beamMat.backFaceCulling = false; this.beamMat.disableDepthWrite = true;
    this.uBeam = u4(this.beamMat, 'uBeam');
    this.beam.material = this.beamMat; this.beam.isPickable = false; this.beam.applyFog = false; this.beam.alwaysSelectAsActiveMesh = true;
    this.beam.parent = camera;
    this.beam.setEnabled(false);
    this.anom.mesh.setEnabled(false);
    this.anom.mesh.applyFog = false;
  }

  // ------------------------------------------------------------ impostazioni

  applySettings(gfx: GraphicsSettings, q: QualityParams): void {
    this.cal = calibration(gfx.brightness);
    this.shadowRange = q.shadowRange;
    const engine = this.scene.getEngine();
    // post-process: ordine FXAA → finale
    const wantFxaa = gfx.antialias;
    if (!this.final || wantFxaa !== !!this.fxaa) {
      this.final?.dispose(this.camera); this.final = null;
      this.fxaa?.dispose(this.camera); this.fxaa = null;
      if (wantFxaa) this.fxaa = new FxaaPostProcess('tds.fxaa', 1.0, this.camera, Texture.BILINEAR_SAMPLINGMODE, engine);
      this.final = new PostProcess('tds.final', 'tdsFinal', ['uCal', 'uTime'], null, 1.0, this.camera, Texture.BILINEAR_SAMPLINGMODE, engine);
      this.final.onApply = (effect) => {
        effect.setFloat4('uCal', this.cal.gain, 1 / this.cal.gamma, 0.55, 0.018);
        effect.setFloat('uTime', this.time);
      };
    }
    // ombre
    const size = q.shadowMap;
    if (!gfx.shadows) { this.shadowGenerator?.dispose(); this.shadowGenerator = null; }
    else if (!this.shadowGenerator || this.shadowGenerator.getShadowMap()?.getSize().width !== size) {
      this.shadowGenerator?.dispose();
      const sg = new ShadowGenerator(size, this.moonLight);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      sg.bias = 0.004; sg.normalBias = 0.05;
      sg.setDarkness(0.3);
      this.shadowGenerator = sg;
      this.syncCasters(null);
    }
  }

  addShadowCaster(mesh: AbstractMesh): void {
    if (this.casters.indexOf(mesh) < 0) this.casters.push(mesh);
    const list = this.shadowGenerator?.getShadowMap()?.renderList;
    if (list && list.indexOf(mesh) < 0) list.push(mesh);
  }

  /** Ricompone la lista dei proiettori: chunk di alberi vicini + mesh registrate (ancora vive). */
  syncCasters(nearTrees: Mesh[] | null): void {
    const list = this.shadowGenerator?.getShadowMap()?.renderList;
    if (!list) return;
    list.length = 0;
    if (nearTrees) for (const m of nearTrees) list.push(m);
    for (let i = this.casters.length - 1; i >= 0; i--) {
      if (this.casters[i].isDisposed()) this.casters.splice(i, 1); else list.push(this.casters[i]);
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt: number, cam: { x: number; y: number; z: number }, pal: SkyPalette, alter: LocalAlterations, torch: TorchRender, fogAmount: number, precip: number, flash: number, strip: number): void {
    this.time += dt;
    const ai = pal.ambientIntensity + flash;
    this.hemi.intensity = ai;
    this.hemi.diffuse.set(pal.ambientColor[0], pal.ambientColor[1], pal.ambientColor[2]);
    this.hemi.groundColor.set(pal.groundColor[0], pal.groundColor[1], pal.groundColor[2]);
    // luna / sole, con deviazione locale delle ombre
    const sk = alter.shadowSkew, c = Math.cos(sk), s = Math.sin(sk);
    const lx = pal.lightDir[0] * c + pal.lightDir[2] * s, lz = -pal.lightDir[0] * s + pal.lightDir[2] * c, ly = pal.lightDir[1];
    this.dir.set(-lx, -ly, -lz).normalize();
    this.moonLight.direction.copyFrom(this.dir);
    this.moonLight.intensity = pal.lightIntensity;
    this.moonLight.diffuse.set(pal.lightColor[0], pal.lightColor[1], pal.lightColor[2]);
    this.moonLight.specular.set(pal.lightColor[0] * 0.6, pal.lightColor[1] * 0.6, pal.lightColor[2] * 0.6);
    // frustum ortografico centrato sulla camera, agganciato ai texel per ombre stabili
    const R = this.shadowRange;
    Vector3.CrossToRef(Vector3.UpReadOnly, this.dir, this.right); this.right.normalize();
    Vector3.CrossToRef(this.dir, this.right, this.up);
    const texel = (2 * R) / (this.shadowGenerator?.getShadowMap()?.getSize().width ?? 2048);
    const pr = Math.round((cam.x * this.right.x + cam.y * this.right.y + cam.z * this.right.z) / texel) * texel;
    const pu = Math.round((cam.x * this.up.x + cam.y * this.up.y + cam.z * this.up.z) / texel) * texel;
    const pd = Math.round((cam.x * this.dir.x + cam.y * this.dir.y + cam.z * this.dir.z) / 4) * 4 - SHADOW_DIST;
    this.moonLight.position.set(
      this.right.x * pr + this.up.x * pu + this.dir.x * pd,
      this.right.y * pr + this.up.y * pu + this.dir.y * pd,
      this.right.z * pr + this.up.z * pu + this.dir.z * pd);
    this.moonLight.orthoLeft = -R; this.moonLight.orthoRight = R; this.moonLight.orthoBottom = -R; this.moonLight.orthoTop = R;
    const wantShadow = pal.lightIntensity > 0.02;
    if (this.moonLight.shadowEnabled !== wantShadow) this.moonLight.shadowEnabled = wantShadow;

    // torcia e telefono
    const ti = torch.on ? clamp01(torch.intensity) : 0;
    this.torchLevel = ti;
    this.torch.intensity = ti * 3.8;
    this.phone.intensity = clamp01(torch.phoneGlow) * 0.3;
    const wm = this.camera.getWorldMatrix();
    Vector3.TransformCoordinatesFromFloatsToRef(0.22, -0.2, 0.12, wm, this.torchPos);
    Vector3.TransformNormalFromFloatsToRef(-0.035, 0.03, 1, wm, this.torchDir);
    this.torchDir.normalize();
    const beamI = ti * (0.01 + 0.16 * Math.pow(clamp01(fogAmount), 0.7) + 0.06 * precip) * (1 - strip);
    const beamOn = beamI > 0.002;
    if (beamOn !== this.beam.isEnabled()) this.beam.setEnabled(beamOn);
    this.uBeam.set(1, 0.93, 0.8, beamI);

    // luci anomale
    const n = Math.min(MAX_ANOM, alter.lights.length);
    if (n > 0 !== this.anom.mesh.isEnabled()) this.anom.mesh.setEnabled(n > 0);
    if (n > 0) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < MAX_ANOM; i++) {
        if (i < n) {
          const l = alter.lights[i];
          const k = clamp01(l.intensity);
          setSprite(this.anom.pos, this.anom.col, i, l.pos.x, l.pos.y, l.pos.z, l.color[0] * k, l.color[1] * k, l.color[2] * k, Math.max(0.2, l.radius));
          const d = Math.hypot(l.pos.x - cam.x, l.pos.y - cam.y, l.pos.z - cam.z);
          if (d < bd && k > 0.01) { bd = d; best = i; }
        } else setSprite(this.anom.pos, this.anom.col, i, 0, -9999, 0, 0, 0, 0, 0);
      }
      this.anom.mesh.updateVerticesData('position', this.anom.pos);
      this.anom.mesh.updateVerticesData('color', this.anom.col);
      this.anom.uS.set(1.6 * (1 - strip), this.time, this.scene.fogDensity * 0.6, 0.3);
      if (best >= 0 && bd < 120) {
        const l = alter.lights[best];
        if (!this.anomLight) { this.anomLight = new PointLight('tds.anomLight', new Vector3(), this.scene); this.anomLight.specular.set(0, 0, 0); }
        this.anomLight.setEnabled(true);
        this.anomLight.position.set(l.pos.x, l.pos.y, l.pos.z);
        this.anomLight.diffuse.set(l.color[0], l.color[1], l.color[2]);
        this.anomLight.intensity = clamp01(l.intensity) * 0.9;
        this.anomLight.range = Math.max(6, l.radius * 14);
      } else if (this.anomLight?.isEnabled()) this.anomLight.setEnabled(false);
    } else if (this.anomLight?.isEnabled()) this.anomLight.setEnabled(false);
  }

  dispose(): void {
    this.final?.dispose(this.camera); this.fxaa?.dispose(this.camera);
    this.final = null; this.fxaa = null;
    this.shadowGenerator?.dispose(); this.shadowGenerator = null;
    this.beam.dispose(); this.beamMat.dispose();
    this.anom.mesh.dispose(); this.anom.mat.dispose();
    this.anomLight?.dispose();
    this.torch.dispose(); this.phone.dispose(); this.moonLight.dispose(); this.hemi.dispose();
    this.casters.length = 0;
  }
}

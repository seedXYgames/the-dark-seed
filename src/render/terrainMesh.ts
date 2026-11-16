// Terreno a tasselli, texture del suolo dipinta proceduralmente, grembiule esterno e plugin dei materiali
// (neve, bagnato, "perdita dei materiali").
import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines';
import { fbm2, hash2, valueNoise2 } from '../core/rng';
import { GRID_MAX, GRID_MIN, GRID_N, GRID_STEP, distToSegment } from '../world/terrain';
import { MASK_N, MASK_STEP, type WorldModel } from '../world/model';
import { clamp01, mix, sstep } from './envMath';

/** Stato condiviso da tutti i materiali dell'ambiente (aggiornato una volta per frame). */
export const envShared = { snow: 0, wet: 0, strip: 0, windX: 0, windZ: 0, time: 0 };

export class EnvMaterialPlugin extends MaterialPluginBase {
  /** Soglia della normale oltre cui si deposita la neve. */
  snowThreshold = 0.35;
  /** Quanto il vento piega la geometria (0 = rigida). Lo spostamento cresce con l'altezza locale del vertice. */
  sway = 0;
  constructor(material: Material) {
    super(material, 'TdsEnv', 210, { TDSENV: false });
    this._enable(true);
  }
  override getClassName(): string { return 'TdsEnvPlugin'; }
  override prepareDefines(defines: MaterialDefines): void { (defines as unknown as Record<string, boolean>).TDSENV = true; }
  override getUniforms() {
    return {
      ubo: [{ name: 'tdsEnv', size: 4, type: 'vec4' }, { name: 'tdsWind', size: 4, type: 'vec4' }],
      fragment: '#ifdef TDSENV\nuniform vec4 tdsEnv;\n#endif\n', vertex: '#ifdef TDSENV\nuniform vec4 tdsWind;\n#endif\n',
    };
  }
  override bindForSubMesh(ubo: UniformBuffer): void {
    ubo.updateFloat4('tdsEnv', envShared.snow, envShared.wet, envShared.strip, this.snowThreshold);
    ubo.updateFloat4('tdsWind', envShared.windX, envShared.windZ, envShared.time, this.sway);
  }
  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === 'vertex') return {
      // vento: oscillazione lenta sottovento più un tremolio rapido, sfasati per posizione (ogni pianta si muove per conto suo)
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef TDSENV
if(tdsWind.w>0.0){
  float tdsH=max(positionUpdated.y,0.0);
  float tdsK=tdsWind.w*tdsH*sqrt(tdsH);
  float tdsP=dot(worldPos.xz,vec2(0.113,0.071));
  float tdsG=0.55+sin(tdsWind.z*1.15+tdsP)+0.45*sin(tdsWind.z*2.7+tdsP*2.3);
  float tdsF=sin(tdsWind.z*6.3+worldPos.x*2.1+worldPos.z*1.7+worldPos.y*1.3);
  vec2 tdsW=tdsWind.xy;
  float tdsA=length(tdsW)+1e-4;
  worldPos.xz+=tdsW*tdsG*tdsK+vec2(-tdsW.y,tdsW.x)*tdsF*tdsK*0.22;
  worldPos.y-=tdsA*abs(tdsG)*tdsK*0.12;
}
#endif`,
    };
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
#ifdef TDSENV
float tdsSnowM=tdsEnv.x*smoothstep(tdsEnv.w,tdsEnv.w+0.3,normalW.y);
baseColor.rgb=mix(baseColor.rgb*(1.0-0.38*tdsEnv.y),vec3(0.80,0.85,0.93),tdsSnowM*0.92);
#endif`,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef TDSENV
color.rgb=mix(color.rgb,vec3(1.0),tdsEnv.z);
#endif`,
    };
  }
}

/** Materiale standard dell'ambiente: budget luci 8, plugin meteo, non pickable lato mesh. */
export function makeEnvMaterial(name: string, scene: Scene, snowThreshold = 0.35, sway = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.maxSimultaneousLights = 8;
  m.specularColor = new Color3(0.02, 0.02, 0.02);
  m.specularPower = 24;
  const p = new EnvMaterialPlugin(m);
  p.snowThreshold = snowThreshold; p.sway = sway;
  return m;
}

// ---------------------------------------------------------------- campi a griglia

export interface TerrainFields {
  /** forestDensityAt campionata sulla griglia delle quote (include sentieri e POI). */
  forest: Float32Array;
  slope: Float32Array;
}
export function buildFields(model: WorldModel): TerrainFields {
  const forest = new Float32Array(GRID_N * GRID_N), slope = new Float32Array(GRID_N * GRID_N);
  const h = model.heights;
  for (let j = 0; j < GRID_N; j++)
    for (let i = 0; i < GRID_N; i++) {
      const k = j * GRID_N + i;
      forest[k] = model.forestDensityAt(GRID_MIN + i * GRID_STEP, GRID_MIN + j * GRID_STEP);
      const i0 = Math.max(0, i - 1), i1 = Math.min(GRID_N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(GRID_N - 1, j + 1);
      slope[k] = Math.hypot((h[j * GRID_N + i1] - h[j * GRID_N + i0]) / ((i1 - i0) * GRID_STEP), (h[j1 * GRID_N + i] - h[j0 * GRID_N + i]) / ((j1 - j0) * GRID_STEP));
    }
  return { forest, slope };
}
export function sampleField(f: Float32Array, x: number, z: number): number {
  let fx = (x - GRID_MIN) / GRID_STEP, fz = (z - GRID_MIN) / GRID_STEP;
  fx = fx < 0 ? 0 : fx > GRID_N - 1.001 ? GRID_N - 1.001 : fx;
  fz = fz < 0 ? 0 : fz > GRID_N - 1.001 ? GRID_N - 1.001 : fz;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * GRID_N + i;
  const a = f[k], b = f[k + 1], c = f[k + GRID_N], d = f[k + GRID_N + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

// ---------------------------------------------------------------- texture del suolo

export const GROUND_TEX = 2048;

function paintGround(model: WorldModel, fields: TerrainFields): Uint8Array {
  const N = GROUND_TEX;
  const data = new Uint8Array(N * N * 4);
  const salt = model.spec.terrain.salt | 0;
  const road = model.spec.terrain.entryRoad;
  const span = GRID_MAX - GRID_MIN;
  const pm = model.pathMask, pk = model.pathKind;
  // rumori a bassa frequenza precalcolati su griglia grossolana (1 campione ogni 8 texel)
  const C = N / 8 + 1;
  const lowA = new Float32Array(C * C), lowB = new Float32Array(C * C);
  for (let j = 0; j < C; j++)
    for (let i = 0; i < C; i++) {
      const x = GRID_MIN + (i / (C - 1)) * span, z = GRID_MIN + (j / (C - 1)) * span;
      lowA[j * C + i] = fbm2(x / 38, z / 38, salt + 401, 3);
      lowB[j * C + i] = fbm2(x / 11, z / 11, salt + 733, 2);
    }
  const low = (f: Float32Array, px: number, pz: number) => {
    const fx = px / 8, fz = pz / 8, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * C + i;
    return f[k] + (f[k + 1] - f[k]) * tx + (f[k + C] - f[k]) * tz + (f[k] - f[k + 1] - f[k + C] + f[k + C + 1]) * tx * tz;
  };
  for (let pz = 0; pz < N; pz++) {
    const z = GRID_MIN + ((pz + 0.5) / N) * span;
    for (let px = 0; px < N; px++) {
      const x = GRID_MIN + ((px + 0.5) / N) * span;
      const fd = sampleField(fields.forest, x, z);
      const sl = sampleField(fields.slope, x, z);
      const nA = low(lowA, px, pz), nB = low(lowB, px, pz);
      const grain = hash2(px, pz, salt + 5);
      // suolo del bosco ↔ prato
      const open = 1 - sstep(0.18, 0.55, fd + (nB - 0.5) * 0.25);
      let r = mix(mix(0.105, 0.150, nA), mix(0.150, 0.215, nA), open);
      let g = mix(mix(0.115, 0.135, nA), mix(0.225, 0.300, nB), open);
      let b = mix(mix(0.060, 0.075, nB), mix(0.085, 0.110, nA), open);
      // chiazze di aghi/foglie morte nel bosco
      const litter = sstep(0.55, 0.75, nB) * (1 - open) * 0.6;
      r = mix(r, 0.20, litter); g = mix(g, 0.145, litter); b = mix(b, 0.08, litter);
      // roccia e ghiaione sui pendii e sul bordo
      const m = Math.max(Math.abs(x), Math.abs(z));
      const rock = clamp01(sstep(0.55, 0.95, sl + (nB - 0.5) * 0.3) + sstep(0.9, 1.4, sl) * 0.5) * (m > 690 ? 0.75 : 1);
      const rv = 0.24 + 0.16 * nA + 0.05 * (grain - 0.5);
      r = mix(r, rv * 1.02, rock); g = mix(g, rv, rock); b = mix(b, rv * 0.98, rock);
      // riva: sabbia e fango
      const wd = model.waterDepthAt(x, z);
      if (wd > 0 || model.waterDepthAt(x + 6, z) + model.waterDepthAt(x - 6, z) + model.waterDepthAt(x, z + 6) + model.waterDepthAt(x, z - 6) > 0) {
        const s = wd > 0 ? 1 : 0.6;
        const deep = sstep(0.1, 1.2, wd);
        r = mix(r, mix(0.36, 0.10, deep), s); g = mix(g, mix(0.32, 0.105, deep), s); b = mix(b, mix(0.23, 0.09, deep), s);
      }
      // sentieri e strade (maschera a 2 m, interpolata)
      let pmask = 0, kind = 0;
      if (Math.abs(x) <= 700 && Math.abs(z) <= 700) {
        const fx = (x + 700) / MASK_STEP, fz = (z + 700) / MASK_STEP;
        const i = Math.min(MASK_N - 2, Math.floor(fx)), j = Math.min(MASK_N - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, k = j * MASK_N + i;
        pmask = (pm[k] * (1 - tx) * (1 - tz) + pm[k + 1] * tx * (1 - tz) + pm[k + MASK_N] * (1 - tx) * tz + pm[k + MASK_N + 1] * tx * tz) / 255;
        kind = Math.max(pk[k], pk[k + 1], pk[k + MASK_N], pk[k + MASK_N + 1]);
      }
      if (m > 690) {
        const d = distToSegment(x, z, road.from, road.to);
        const v = clamp01((3.7 - d) / 1.6);
        if (v > pmask) { pmask = v; kind = 2; }
      }
      if (pmask > 0) {
        const w = sstep(0.12, 0.6, pmask + (grain - 0.5) * 0.25);
        if (kind === 2) {
          const c = 0.30 + 0.07 * nB + 0.06 * (grain - 0.5);
          const edge = 1 - sstep(0.3, 0.75, pmask); // banchina di ghiaia più chiara
          r = mix(r, c + 0.08 * edge, w); g = mix(g, c + 0.07 * edge, w); b = mix(b, c * 1.04 + 0.05 * edge, w);
        } else {
          const c = 0.86 + 0.3 * (nB - 0.5) + 0.2 * (grain - 0.5);
          r = mix(r, 0.47 * c, w); g = mix(g, 0.37 * c, w); b = mix(b, 0.24 * c, w);
        }
      }
      const gr = 0.9 + 0.2 * grain;
      const o = (pz * N + px) * 4;
      data[o] = Math.min(255, r * gr * 255); data[o + 1] = Math.min(255, g * gr * 255); data[o + 2] = Math.min(255, b * gr * 255); data[o + 3] = 255;
    }
  }
  return data;
}

/** Texture di dettaglio ripetibile: R = variazione di albedo centrata su 0.5. */
function paintDetail(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const wrapNoise = (x: number, y: number, period: number, salt: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const h = (a: number, b: number) => hash2(((a % period) + period) % period, ((b % period) + period) % period, salt);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      v += 0.15 + wrapNoise((x / size) * 32, (y / size) * 32, 32, 12) * 0.3;
      v += wrapNoise((x / size) * 96, (y / size) * 96, 96, 13) * 0.25;
      v += hash2(x, y, 14) * 0.15;
      // sassolini/aghi: punti chiari e scuri radi
      const sp = hash2(x >> 1, y >> 1, 15);
      if (sp > 0.975) v += 0.22; else if (sp < 0.03) v -= 0.2;
      const o = (y * size + x) * 4;
      data[o] = Math.max(0, Math.min(255, (0.5 + (v - 0.5) * 1.5) * 255));
      data[o + 1] = 128; data[o + 2] = 128; data[o + 3] = 128;
    }
  return data;
}

// ---------------------------------------------------------------- mesh

export interface TerrainChunk { mesh: Mesh; x: number; y: number; z: number }

export class TerrainRenderer {
  readonly chunks: TerrainChunk[] = [];
  readonly material: StandardMaterial;
  readonly fields: TerrainFields;
  private groundTex: RawTexture;
  private detailTex: RawTexture;
  private drySpec = 0.03;

  constructor(private scene: Scene, model: WorldModel) {
    this.fields = buildFields(model);
    this.groundTex = RawTexture.CreateRGBATexture(paintGround(model, this.fields), GROUND_TEX, GROUND_TEX, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    this.groundTex.wrapU = this.groundTex.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.groundTex.anisotropicFilteringLevel = 8;
    this.detailTex = RawTexture.CreateRGBATexture(paintDetail(256), 256, 256, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    this.detailTex.wrapU = this.detailTex.wrapV = Texture.WRAP_ADDRESSMODE;
    this.detailTex.uScale = this.detailTex.vScale = (GRID_MAX - GRID_MIN) / 3.5;
    this.detailTex.anisotropicFilteringLevel = 4;
    const mat = makeEnvMaterial('tds.terrain', scene, 0.2);
    mat.diffuseTexture = this.groundTex;
    mat.detailMap.texture = this.detailTex;
    mat.detailMap.isEnabled = true;
    mat.detailMap.diffuseBlendLevel = 0.6;
    mat.detailMap.bumpLevel = 0;
    this.material = mat;

    const h = model.heights;
    const CH = 8, CELLS = (GRID_N - 1) / CH; // 40 celle per tassello
    const span = GRID_MAX - GRID_MIN;
    const hAt = (i: number, j: number) => h[Math.max(0, Math.min(GRID_N - 1, j)) * GRID_N + Math.max(0, Math.min(GRID_N - 1, i))];
    for (let cj = 0; cj < CH; cj++)
      for (let ci = 0; ci < CH; ci++) {
        const n = CELLS + 1;
        const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
        const idx = new Uint32Array(CELLS * CELLS * 6);
        const cx = GRID_MIN + (ci + 0.5) * CELLS * GRID_STEP, cz = GRID_MIN + (cj + 0.5) * CELLS * GRID_STEP;
        let ymin = Infinity, ymax = -Infinity;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const y = hAt(ci * CELLS + i, cj * CELLS + j); if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
        const cy = (ymin + ymax) / 2;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const gi = ci * CELLS + i, gj = cj * CELLS + j, k = j * n + i;
            const x = GRID_MIN + gi * GRID_STEP, z = GRID_MIN + gj * GRID_STEP;
            pos[k * 3] = x - cx; pos[k * 3 + 1] = hAt(gi, gj) - cy; pos[k * 3 + 2] = z - cz;
            const nx = hAt(gi - 1, gj) - hAt(gi + 1, gj), nz = hAt(gi, gj - 1) - hAt(gi, gj + 1), ny = 2 * GRID_STEP;
            const l = Math.hypot(nx, ny, nz);
            nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
            uv[k * 2] = (x - GRID_MIN) / span; uv[k * 2 + 1] = (z - GRID_MIN) / span;
          }
        let o = 0;
        for (let j = 0; j < CELLS; j++)
          for (let i = 0; i < CELLS; i++) {
            const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
            idx[o++] = b; idx[o++] = d; idx[o++] = c;
            idx[o++] = a; idx[o++] = b; idx[o++] = c;
          }
        const mesh = new Mesh(`tds.terrain.${ci}.${cj}`, scene);
        const vd = new VertexData();
        vd.positions = pos; vd.normals = nor; vd.uvs = uv; vd.indices = idx;
        vd.applyToMesh(mesh, false);
        mesh.material = mat;
        mesh.position.set(cx, cy, cz);
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        mesh.freezeWorldMatrix();
        this.chunks.push({ mesh, x: cx, y: cy, z: cz });
      }
  }

  setReceiveShadows(on: boolean): void { for (const c of this.chunks) c.mesh.receiveShadows = on; }

  update(wet: number): void {
    const s = mix(this.drySpec, 0.3, wet);
    this.material.specularColor.set(s, s, s * 1.05);
    this.material.specularPower = mix(18, 56, wet);
  }

  dispose(): void {
    for (const c of this.chunks) c.mesh.dispose();
    this.chunks.length = 0;
    this.material.dispose();
    this.groundTex.dispose();
    this.detailTex.dispose();
  }
}

/** Dati del grembiule esterno (fascia di colline boscose oltre la griglia): posizioni, normali, colori (a = prospettiva aerea). */
export function buildApron(model: WorldModel): { positions: Float32Array; normals: Float32Array; colors: Float32Array; indices: Uint32Array } {
  const rows = [800, 812, 830, 860, 910, 980, 1060];
  const salt = model.spec.terrain.salt | 0;
  const road = model.spec.terrain.entryRoad;
  const perSide = GRID_N, R = rows.length;
  const nv = perSide * R * 4;
  const positions = new Float32Array(nv * 3), colors = new Float32Array(nv * 4), normals = new Float32Array(nv * 3);
  const indices = new Uint32Array((perSide - 1) * (R - 1) * 6 * 4);
  let o = 0;
  for (let s = 0; s < 4; s++) {
    for (let c = 0; c < perSide; c++) {
      const tt = GRID_MIN + c * GRID_STEP;
      const ex = s === 0 ? tt : s === 1 ? GRID_MAX : s === 2 ? -tt : GRID_MIN;
      const ez = s === 0 ? GRID_MIN : s === 1 ? tt : s === 2 ? GRID_MAX : -tt;
      const eh = model.heightAt(ex, ez);
      for (let r = 0; r < R; r++) {
        const k = rows[r] / 800, x = ex * k, z = ez * k;
        const w = sstep(800, 930, rows[r]);
        const hills = (fbm2(x / 260, z / 260, salt + 91, 3) - 0.35) * 150 + (valueNoise2(x / 40, z / 40, salt + 93) - 0.5) * 16;
        const nearRoad = 1 - sstep(10, 60, distToSegment(x, z, road.from, { x: road.to.x * 2 - road.from.x, z: road.to.z * 2 - road.from.z }));
        let y = mix(eh, mix(hills, eh * 0.4 - 6, nearRoad), w);
        if (r === R - 1) y -= 140;
        const v = (s * perSide + c) * R + r;
        positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
        const n = 0.8 + 0.4 * hash2(c + s * 400, r, salt + 95);
        colors[v * 4] = 0.050 * n; colors[v * 4 + 1] = 0.085 * n; colors[v * 4 + 2] = 0.055 * n;
        colors[v * 4 + 3] = mix(0.12, 0.34, w);
      }
    }
    for (let c = 0; c < perSide - 1; c++)
      for (let r = 0; r < R - 1; r++) {
        const a = (s * perSide + c) * R + r, b = a + R, cc = a + 1, d = b + 1;
        indices[o++] = a; indices[o++] = cc; indices[o++] = b;
        indices[o++] = b; indices[o++] = cc; indices[o++] = d;
      }
  }
  VertexData.ComputeNormals(positions, indices, normals);
  // normali verso l'alto garantite (l'orientamento dei triangoli dipende dal lato)
  let flip = 0;
  for (let v = 0; v < nv; v++) if (normals[v * 3 + 1] < 0) flip++;
  if (flip > nv / 2) {
    for (let v = 0; v < nv * 3; v++) normals[v] = -normals[v];
    for (let t = 0; t < indices.length; t += 3) { const q = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = q; }
  }
  return { positions, normals, colors, indices };
}

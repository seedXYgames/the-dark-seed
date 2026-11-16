// Piccoli oggetti: mesh nel mondo e mesh dettagliate da ispezione (fronte, retro, lati reali).
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { ItemKind, Lang, WorldObjectSpec, WorldSpec } from '../core/contracts';
import { Geo, type Ctx, makeCanvasTexture } from './meshUtil';
import { hashStr, ITEM_FLAT, WORLD_ITEM_RADIUS, wrapText } from './objMath';

type Ctx2 = CanvasRenderingContext2D;
const PAPER = 0xd9d2bd;

/** Geometria «da esposizione»: fronte verso -z, y in alto, unità arbitrarie (poi normalizzata con fit). */
export function itemGeo(g: Geo, kind: ItemKind | 'battery', h: number): void {
  switch (kind) {
    case 'key': {
      const br = 0xa58a4a;
      g.ring(-0.9, 0, 0, 0.42, 0.16, br, 10).beam([-0.5, 0, 0], [1.45, 0, 0], 0.15, br, 0.1);
      g.box(0.9, -0.17, 0, 0.12, 0.2, 0.08, br).box(1.12, -0.21, 0, 0.1, 0.28, 0.08, br).box(1.33, -0.15, 0, 0.1, 0.16, 0.08, br);
      g.ring(-1.5, 0.05, 0.03, 0.3, 0.045, 0x9a9a9a, 9).box(-2.05, -0.38, 0.03, 0.55, 0.85, 0.05, 0x8a3a2a).cyl(-2.05, -0.08, 0.03, 0.07, 0.07, 0.07, 0x222222, 'z', 6);
      break;
    }
    case 'radio': {
      g.box(0, 0, 0, 1, 1.8, 0.5, 0x2b2f2b).cyl(0.3, 1.6, 0, 0.05, 0.035, 1.4, 0x111111).cyl(0.3, 2.32, 0, 0.06, 0.06, 0.08, 0x111111);
      for (let i = 0; i < 6; i++) g.box(0, -0.15 - i * 0.11, -0.255, 0.7, 0.045, 0.02, 0x0c0c0c);
      g.box(0, 0.45, -0.255, 0.7, 0.3, 0.02, 0x6f8a6a).cyl(-0.3, 1.0, 0, 0.14, 0.12, 0.22, 0x555555).box(-0.3, 1.12, -0.1, 0.03, 0.02, 0.1, 0xd8d2c0);
      g.box(0.53, 0.3, 0, 0.08, 0.42, 0.22, 0x8a3a2a).box(0, 0.2, 0.28, 0.32, 1.0, 0.06, 0x444444).box(0, 0.68, 0.29, 0.34, 0.08, 0.1, 0x444444);
      break;
    }
    case 'tool': {
      const v = h % 3, st = 0x8d9396;
      if (v === 0) { // chiave inglese
        g.beam([-1.15, 0, 0], [1.1, 0, 0], 0.24, st, 0.08).ring(1.42, 0, 0, 0.3, 0.16, st, 8, -2.25, 2.25).ring(-1.4, 0, 0, 0.24, 0.14, st, 8);
        g.box(0, 0, -0.045, 1.2, 0.08, 0.01, 0x5f6466);
      } else if (v === 1) { // accetta
        g.beam([0, -1.5, 0], [0.04, 1.0, 0], 0.17, 0x7a5a3a, 0.11).box(0.02, -1.45, 0, 0.2, 0.25, 0.13, 0x5f4428);
        g.box(0.2, 0.85, 0, 0.6, 0.46, 0.14, 0x60656a).frustum(0.62, 0, 0.5, 0.3, 0.12, 1.2, 0.34, 0.02, 0x9aa0a4, 0.17, 0);
        g.box(-0.2, 0.85, 0, 0.22, 0.36, 0.16, 0x60656a);
      } else { // pinza multiuso
        for (const s of [-1, 1]) g.beam([s * 0.17, -1.2, 0], [s * 0.1, 0.25, 0], 0.2, 0x8a3a2a, 0.12).beam([s * 0.08, 0.3, 0], [s * 0.02, 1.0, 0], 0.12, st, 0.09);
        g.cyl(0, 0.3, 0, 0.13, 0.13, 0.16, 0x555555, 'z', 8).beam([0.26, -0.9, 0], [0.75, 0.1, 0], 0.03, 0xb4b8ba, 0.12);
      }
      break;
    }
    case 'mug': {
      const en = 0x2f4f6b, rim = 0xe6e2d6;
      g.cyl(0, 0, 0, 0.47, 0.5, 1.0, en, 'y', 12).cyl(0, 0.47, 0, 0.43, 0.43, 0.075, 0x15191c, 'y', 12);
      g.push().tr(0, 0.5, 0).rx(Math.PI / 2).ring(0, 0, 0, 0.47, 0.07, rim, 12).pop();
      g.box(0.3, 0.52, -0.36, 0.1, 0.05, 0.08, 0x1c1c1c).box(-0.42, 0.52, 0.2, 0.07, 0.05, 0.11, 0x1c1c1c).box(0.1, -0.2, -0.49, 0.12, 0.09, 0.02, 0x1c1c1c);
      g.ring(0.66, 0, 0, 0.3, 0.1, en, 7, -1.75, 1.75);
      for (let i = 0; i < 7; i++) g.box(Math.cos(i * 2.4) * 0.3, -0.35 + i * 0.11, -Math.abs(Math.sin(i * 2.4)) * 0.38 - 0.1, 0.03, 0.03, 0.03, rim);
      break;
    }
    case 'lantern': {
      const red = 0x7a2f25;
      g.cyl(0, -0.72, 0, 0.5, 0.44, 0.34, red, 'y', 10).cyl(0, 0, 0, 0.34, 0.34, 1.1, 0xc9c6a8, 'y', 10).cyl(0, 0.7, 0, 0.44, 0.3, 0.3, red, 'y', 10).cyl(0, 0.93, 0, 0.15, 0.1, 0.16, 0x333333);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; g.beam([Math.cos(a) * 0.4, -0.55, Math.sin(a) * 0.4], [Math.cos(a) * 0.4, 0.56, Math.sin(a) * 0.4], 0.035, 0x333333); }
      g.ring(0, 0.72, 0, 0.58, 0.04, 0x333333, 8, 0, Math.PI).cyl(0.52, -0.72, 0, 0.07, 0.07, 0.1, 0x222222, 'x', 6);
      break;
    }
    case 'boot': {
      const le = 0x6a4a30, dk = 0x1c1a18;
      g.box(0, -0.55, -0.1, 0.62, 0.14, 1.75, dk).box(0, -0.68, 0.5, 0.6, 0.12, 0.5, dk);
      for (let i = 0; i < 5; i++) g.box(0, -0.65, -0.85 + i * 0.22, 0.56, 0.06, 0.1, 0x0c0b0a);
      g.box(0, -0.28, -0.2, 0.56, 0.42, 1.1, le).sphere(0, -0.3, -0.78, 0.29, 0.24, 0.33, le);
      g.frustum(0, 0.38, -0.1, 0.56, 0.72, 0.95, 0.5, 0.62, le).box(0, 0.98, 0.38, 0.54, 0.1, 0.66, 0x3a2a1c).box(0, 0.5, 0.0, 0.2, 1.0, 0.06, 0x3a2a1c);
      for (let i = 0; i < 4; i++) {
        const y = 0.05 + i * 0.22, z = -0.03 - (i === 0 ? 0.25 : 0);
        g.beam([-0.16, y, z], [0.16, y + 0.2, z], 0.03, 0xc9b98a).beam([0.16, y, z], [-0.16, y + 0.2, z], 0.03, 0xc9b98a);
      }
      g.box(0, 1.1, 0.72, 0.1, 0.22, 0.03, 0x3a2a1c);
      break;
    }
    case 'phone': {
      g.box(0, 0, 0, 0.75, 1.5, 0.09, 0x1a1a1c).box(0, 0, -0.05, 0.68, 1.4, 0.012, 0x06080a);
      const cr: [number, number][] = [[0.34, 0.7], [-0.34, 0.5], [0.3, -0.1], [-0.2, -0.7], [0.05, 0.7], [-0.34, 0.05]];
      for (const [x, y] of cr) g.beam([-0.1, 0.3, -0.058], [x, y, -0.058], 0.012, 0x7d8690);
      g.beam([0.3, -0.1, -0.058], [0.34, -0.5, -0.058], 0.01, 0x7d8690).beam([-0.2, -0.7, -0.058], [0.1, -0.7, -0.058], 0.01, 0x7d8690);
      g.box(0.2, 0.5, 0.055, 0.22, 0.22, 0.03, 0x2c2c2e).cyl(0.2, 0.5, 0.075, 0.07, 0.07, 0.02, 0x0a0a0a, 'z', 8).box(0.39, 0.25, 0, 0.03, 0.2, 0.04, 0x333333).box(-0.39, 0.3, 0, 0.03, 0.34, 0.04, 0x333333);
      break;
    }
    case 'bottle': {
      g.cyl(0, 0, 0, 0.36, 0.36, 1.4, 0x4a6a7a, 'y', 10).cyl(0, 0.85, 0, 0.36, 0.2, 0.3, 0x4a6a7a, 'y', 10).cyl(0, 1.1, 0, 0.2, 0.2, 0.2, 0x9a9a9a, 'y', 10);
      g.cyl(0, 1.27, 0, 0.25, 0.25, 0.16, 0x222222, 'y', 10).cyl(0, 0.1, 0, 0.372, 0.372, 0.32, 0x8a8778, 'y', 10).ring(0.3, 1.36, 0, 0.16, 0.035, 0x9a9a9a, 7);
      g.box(0.25, -0.45, -0.28, 0.1, 0.14, 0.05, 0x2f4450);
      break;
    }
    case 'battery': {
      for (const s of [-1, 1]) {
        g.cyl(0, 0, s * 0.19, 0.18, 0.18, 0.62, 0x26282a, 'x', 10).cyl(-0.06, 0, s * 0.19, 0.186, 0.186, 0.3, 0xb08a2a, 'x', 10);
        g.cyl(0.34, 0, s * 0.19, 0.06, 0.06, 0.06, 0xc9c6a8, 'x', 6);
      }
      g.box(0.12, 0, 0, 0.1, 0.39, 0.78, 0xd8d8d2);
      break;
    }
    case 'note': case 'map': {
      g.box(0, 0, 0, 1, 1.3, 0.012, kind === 'map' ? 0xb9c2a0 : PAPER);
      if (kind === 'map') g.box(0, 0, -0.008, 0.02, 1.3, 0.004, 0x8a947a).box(0, 0, -0.008, 1, 0.02, 0.004, 0x8a947a).beam([-0.35, -0.4, -0.009], [0.3, 0.45, -0.009], 0.03, 0x7a5a3a, 0.004);
      else for (let i = 0; i < 5; i++) g.box(-0.05 + (i % 2) * 0.06, 0.4 - i * 0.18, -0.008, 0.7 - (i % 3) * 0.12, 0.035, 0.004, 0x3a4660);
      break;
    }
    case 'photo': {
      g.box(0, 0, 0, 1.3, 1.0, 0.014, 0xe2ddd0).box(0, 0.04, -0.009, 1.14, 0.78, 0.004, 0x3f4a44).box(0, -0.15, -0.012, 1.14, 0.4, 0.004, 0x55604f).box(0.2, 0.2, -0.012, 0.3, 0.2, 0.004, 0xa59a80);
      break;
    }
    case 'tag': {
      g.box(0, 0, 0, 0.6, 0.9, 0.05, 0x8a3a2a).box(0, -0.05, -0.028, 0.44, 0.5, 0.006, 0xd8d2c0).push().tr(0, 0.33, 0).ring(0, 0, 0, 0.07, 0.04, 0x9a9a9a, 7).pop();
      g.beam([0, 0.36, 0], [0.25, 0.75, 0.02], 0.025, 0xc9b98a).beam([0.25, 0.75, 0.02], [-0.1, 0.95, 0], 0.025, 0xc9b98a);
      break;
    }
  }
}

/** Mesh dell'oggetto appoggiato nel mondo (base a y = 0). */
export function buildWorldItem(c: Ctx, kind: ItemKind | 'battery', id: string, parent: TransformNode): Mesh {
  const g = new Geo(hashStr(id, 7));
  itemGeo(g, kind, Math.abs(hashStr(id, 3)));
  if (kind === 'battery') { g.fit(0.065, true); return g.build('item.' + id, c.scene, c.mats.faint, parent); }
  if (ITEM_FLAT[kind]) g.layFlat();
  g.fit(WORLD_ITEM_RADIUS[kind], true);
  return g.build('item.' + id, c.scene, c.mats.vc, parent);
}

// ---------------------------------------------------------------- ispezione

/** Foglio con pieghe; `back` = faccia posteriore (verso +z) con u specchiata. */
function sheet(c: Ctx, name: string, w: number, h: number, mat: StandardMaterial, back: boolean, fold: number, parent: Mesh, zoff: number): Mesh {
  const nx = 2, ny = 3, pos: number[] = [], uv: number[] = [], idx: number[] = [], nor: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny;
    const z = fold * ((j === 1 || j === 2 ? 1 : 0) - (i === 1 ? 0.6 : 0));
    pos.push((u - 0.5) * w, (v - 0.5) * h, z + zoff); uv.push(back ? 1 - u : u, v); nor.push(0, 0, back ? 1 : -1);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
    if (back) idx.push(a, e, b, a, d, e); else idx.push(a, b, e, a, e, d);
  }
  const mesh = new Mesh(name, c.scene);
  const vd = new VertexData();
  vd.positions = pos; vd.uvs = uv; vd.indices = idx; vd.normals = nor;
  vd.applyToMesh(mesh);
  mesh.material = mat; mesh.parent = parent; mesh.isPickable = false;
  return mesh;
}

function paperBg(x: Ctx2, w: number, h: number, base: string, seed: number): void {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  let s = seed | 1;
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) | 0; return ((s >>> 8) & 0xffff) / 65536; };
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${90 + r() * 40},${70 + r() * 30},${40 + r() * 20},${0.03 + r() * 0.05})`; x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(120,90,50,0.05)'; x.beginPath(); x.ellipse(r() * w, r() * h, 30 + r() * 60, 20 + r() * 40, r() * 3, 0, 6.3); x.fill(); }
  x.strokeStyle = 'rgba(60,45,30,0.16)'; x.lineWidth = 2;
  for (const v of [1 / 3, 2 / 3]) { x.beginPath(); x.moveTo(0, h * v); x.lineTo(w, h * v); x.stroke(); }
  x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
}

function drawNote(x: Ctx2, w: number, h: number, text: string, seed: number): void {
  paperBg(x, w, h, '#e9e2cc', seed);
  x.strokeStyle = 'rgba(70,100,150,0.22)'; x.lineWidth = 1;
  for (let y = 96; y < h - 30; y += 46) { x.beginPath(); x.moveTo(30, y); x.lineTo(w - 30, y); x.stroke(); }
  let fs = 38;
  const font = (n: number) => `italic 600 ${n}px "Segoe Script", "Bradley Hand", "Comic Sans MS", "Georgia", cursive`;
  x.font = font(fs);
  let lines = wrapText(text, w - 90, (s) => x.measureText(s).width);
  while (lines.length * 46 > h - 130 && fs > 20) { fs -= 3; x.font = font(fs); lines = wrapText(text, w - 90, (s) => x.measureText(s).width); }
  x.fillStyle = '#1d2a4a'; x.textBaseline = 'alphabetic';
  lines.forEach((l, i) => x.fillText(l, 46 + ((seed >> i) & 3) * 3, 92 + i * 46));
}

function drawPhoto(x: Ctx2, w: number, h: number, cap: string, seed: number): void {
  x.fillStyle = '#e6e1d4'; x.fillRect(0, 0, w, h);
  const m = 26, iw = w - m * 2, ih = h - m * 2 - 22;
  x.save(); x.beginPath(); x.rect(m, m, iw, ih); x.clip(); x.translate(m, m);
  const k = /tent|tenda/i.test(cap) ? 0 : /dog|cane/i.test(cap) ? 1 : /snow|neve/i.test(cap) ? 2 : /dawn|alba/i.test(cap) ? 3 : 4;
  const sky = x.createLinearGradient(0, 0, 0, ih * 0.6);
  const skies = [['#9db4c4', '#d8d6c0'], ['#f2d9a0', '#f6efd2'], ['#b9c2cc', '#e4e6e8'], ['#e2a27a', '#f0d8b0'], ['#a8c0cf', '#dfe4d6']][k];
  sky.addColorStop(0, skies[0]); sky.addColorStop(1, skies[1]);
  x.fillStyle = sky; x.fillRect(0, 0, iw, ih);
  x.fillStyle = k === 2 ? '#7f8a8c' : '#4f6456';
  x.beginPath(); x.moveTo(0, ih * 0.5);
  for (let i = 0; i <= 10; i++) x.lineTo((i / 10) * iw, ih * (0.42 + 0.08 * Math.sin(i * 1.7 + seed)));
  x.lineTo(iw, ih); x.lineTo(0, ih); x.fill();
  x.fillStyle = k === 2 ? '#39453f' : '#2f4636';
  for (let i = 0; i < 16; i++) { const tx = (i / 16) * iw + 8, ty = ih * 0.56, th = 40 + ((i * 37 + seed) % 30); x.beginPath(); x.moveTo(tx - 16, ty); x.lineTo(tx, ty - th); x.lineTo(tx + 16, ty); x.fill(); }
  const ground = ['#6f7a52', '#5f8296', '#eceff0', '#6d8fa6', '#7a8458'][k];
  x.fillStyle = ground; x.fillRect(0, ih * 0.56, iw, ih);
  const person = (px: number, py: number, s: number, col: string) => {
    x.fillStyle = col; x.fillRect(px - 9 * s, py - 44 * s, 18 * s, 30 * s); x.fillRect(px - 8 * s, py - 14 * s, 6 * s, 16 * s); x.fillRect(px + 2 * s, py - 14 * s, 6 * s, 16 * s);
    x.fillStyle = '#d2a986'; x.beginPath(); x.arc(px, py - 52 * s, 8 * s, 0, 6.3); x.fill();
    x.strokeStyle = '#4a2a20'; x.lineWidth = 1.5; x.beginPath(); x.arc(px, py - 51 * s, 4 * s, 0.3, 2.8); x.stroke();
  };
  if (k === 0) {
    x.fillStyle = '#b06a3a'; x.beginPath(); x.moveTo(iw * 0.5, ih * 0.9); x.lineTo(iw * 0.72, ih * 0.5); x.lineTo(iw * 0.95, ih * 0.9); x.fill();
    x.fillStyle = '#3a2418'; x.beginPath(); x.moveTo(iw * 0.67, ih * 0.9); x.lineTo(iw * 0.72, ih * 0.62); x.lineTo(iw * 0.78, ih * 0.9); x.fill();
    person(iw * 0.16, ih * 0.92, 1.5, '#8a3a2a'); person(iw * 0.29, ih * 0.94, 1.6, '#35506e'); person(iw * 0.42, ih * 0.92, 1.4, '#c9a23a');
  } else if (k === 1) {
    x.fillStyle = 'rgba(255,244,200,0.9)'; x.beginPath(); x.arc(iw * 0.62, ih * 0.3, 34, 0, 6.3); x.fill();
    x.fillStyle = '#5a4a38'; x.beginPath(); x.moveTo(iw * 0.3, ih); x.lineTo(iw * 0.46, ih * 0.6); x.lineTo(iw * 0.66, ih * 0.6); x.lineTo(iw * 0.86, ih); x.fill();
    x.fillStyle = '#17120e'; x.fillRect(iw * 0.5, ih * 0.5, 52, 22); x.fillRect(iw * 0.5, ih * 0.54, 7, 30); x.fillRect(iw * 0.5 + 42, ih * 0.54, 7, 30);
    x.beginPath(); x.arc(iw * 0.5 + 60, ih * 0.47, 13, 0, 6.3); x.fill(); x.fillRect(iw * 0.5 + 62, ih * 0.4, 6, 12); x.fillRect(iw * 0.5 - 12, ih * 0.46, 14, 5);
  } else if (k === 2) {
    x.fillStyle = '#5a4636'; x.fillRect(iw * 0.3, ih * 0.5, iw * 0.4, ih * 0.26);
    x.fillStyle = '#f4f6f6'; x.beginPath(); x.moveTo(iw * 0.25, ih * 0.52); x.lineTo(iw * 0.5, ih * 0.3); x.lineTo(iw * 0.75, ih * 0.52); x.fill();
    x.fillStyle = '#e9c070'; x.fillRect(iw * 0.37, ih * 0.58, 26, 24); x.fillStyle = '#2c2018'; x.fillRect(iw * 0.54, ih * 0.58, 24, ih * 0.18);
    x.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 70; i++) x.fillRect((i * 97 + seed * 13) % iw, (i * 53 + seed * 7) % ih, 2.5, 2.5);
  } else if (k === 3) {
    x.fillStyle = 'rgba(255,220,170,0.45)'; x.fillRect(0, ih * 0.56, iw, 16);
    x.strokeStyle = '#27409a'; x.lineWidth = 3.5; x.beginPath(); x.ellipse(iw * 0.63, ih * 0.7, 40, 26, 0.2, 0.3, 6.6); x.stroke();
  } else {
    person(iw * 0.45, ih * 0.95, 2.0, '#b0483a');
    x.fillStyle = '#8fa0a0'; x.beginPath(); x.ellipse(iw * 0.62, ih * 0.62, 62, 17, -0.25, 0, 6.3); x.fill();
    x.beginPath(); x.moveTo(iw * 0.72, ih * 0.57); x.lineTo(iw * 0.82, ih * 0.5); x.lineTo(iw * 0.8, ih * 0.66); x.fill();
    x.fillStyle = '#222'; x.beginPath(); x.arc(iw * 0.52, ih * 0.64, 2.5, 0, 6.3); x.fill();
  }
  x.fillStyle = 'rgba(150,110,60,0.2)'; x.fillRect(0, 0, iw, ih);
  x.restore();
}

function drawMap(x: Ctx2, w: number, h: number, spec: WorldSpec, lang: Lang): void {
  paperBg(x, w, h, '#d5d8b4', spec.seed + 5);
  const half = spec.size / 2, P = (p: { x: number; z: number }): [number, number] => [24 + ((p.x + half) / spec.size) * (w - 48), h - 24 - ((p.z + half) / spec.size) * (h - 48)];
  const t = spec.terrain;
  x.fillStyle = '#8fb3c2';
  if (t.lake) { const [cx, cy] = P(t.lake.center); x.beginPath(); x.arc(cx, cy, (t.lake.radius / spec.size) * (w - 48), 0, 6.3); x.fill(); }
  if (t.river) { x.strokeStyle = '#8fb3c2'; x.lineWidth = 5; x.beginPath(); t.river.points.forEach((p, i) => { const q = P(p); if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }); x.stroke(); }
  for (const e of spec.edges) {
    x.strokeStyle = e.kind === 'road' ? '#5a4634' : '#7a3a2a'; x.lineWidth = e.kind === 'road' ? 3.5 : 1.8; x.setLineDash(e.kind === 'road' ? [] : [6, 4]);
    x.beginPath(); e.points.forEach((p, i) => { const q = P(p); if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }); x.stroke();
  }
  x.setLineDash([]); x.font = '13px Georgia, serif'; x.textAlign = 'center';
  for (const p of spec.pois) { const [px, py] = P(p.pos); x.fillStyle = '#2a2018'; x.beginPath(); x.arc(px, py, 3.5, 0, 6.3); x.fill(); x.fillText(p.name[lang], px, py - 7); }
  x.strokeStyle = '#2a2018'; x.lineWidth = 1.5; x.strokeRect(12, 12, w - 24, h - 24);
  x.beginPath(); x.moveTo(w - 44, 66); x.lineTo(w - 44, 30); x.lineTo(w - 50, 42); x.moveTo(w - 44, 30); x.lineTo(w - 38, 42); x.stroke();
  x.fillStyle = '#2a2018'; x.fillText('N', w - 44, 26);
}

/** Mesh dettagliata per l'ispezione: radice nell'origine, entro una sfera di ~0,25 m, materiali propri. */
export function buildInspect(c: Ctx, o: WorldObjectSpec, lang: Lang, spec: WorldSpec): Mesh {
  const root = new Mesh('inspect.' + o.id, c.scene);
  root.isPickable = false;
  const mats: StandardMaterial[] = [];
  const seed = Math.abs(hashStr(o.id, 11));
  const mk = (tex?: (x: Ctx2, w: number, h: number) => void, tw = 512, th = 640): StandardMaterial => {
    const m = new StandardMaterial('inspect.m', c.scene);
    m.specularColor = new Color3(0.05, 0.05, 0.05); m.emissiveColor = new Color3(0.42, 0.41, 0.39); m.maxSimultaneousLights = 8; m.backFaceCulling = !tex;
    if (tex) m.diffuseTexture = makeCanvasTexture(c.scene, 'inspect.t', tw, th, tex);
    mats.push(m);
    return m;
  };
  const kind: ItemKind | 'battery' = o.kind === 'battery' ? 'battery' : o.item?.kind ?? 'note';
  const text = o.item?.text?.[lang] ?? '';
  const g = new Geo(seed);
  if (kind === 'note') {
    sheet(c, 'f', 0.3, 0.38, mk((x, w, h) => drawNote(x, w, h, text || '…', seed)), false, 0.012, root, 0);
    sheet(c, 'b', 0.3, 0.38, mk((x, w, h) => paperBg(x, w, h, '#ddd5bd', seed + 3), 256, 320), true, 0.012, root, 0.0012);
  } else if (kind === 'map') {
    sheet(c, 'f', 0.36, 0.36, mk((x, w, h) => drawMap(x, w, h, spec, lang), 768, 768), false, 0.01, root, 0);
    sheet(c, 'b', 0.36, 0.36, mk((x, w, h) => { paperBg(x, w, h, '#cfd2b0', seed); x.fillStyle = '#3a4a34'; x.font = 'bold 22px Georgia, serif'; x.textAlign = 'center'; x.fillText(lang === 'it' ? 'CARTA DEI SENTIERI' : 'TRAIL MAP', w / 2, h / 6); }, 256, 256), true, 0.01, root, 0.0012);
  } else if (kind === 'photo') {
    sheet(c, 'f', 0.34, 0.255, mk((x, w, h) => drawPhoto(x, w, h, o.item?.text?.en ?? '', seed), 512, 384), false, 0, root, -0.0022);
    sheet(c, 'b', 0.34, 0.255, mk((x, w, h) => { paperBg(x, w, h, '#e4dfd2', seed); x.fillStyle = 'rgba(40,50,90,0.55)'; x.font = 'italic 22px Georgia, serif'; x.fillText(String(1987 + (seed % 30)), w * 0.62, h * 0.8); }, 256, 192), true, 0, root, 0.0022);
    g.jit = 0; g.box(0, 0, 0, 0.339, 0.254, 0.004, 0xe2ddd0);
  } else if (kind === 'tag') {
    itemGeo(g, 'tag', seed); g.fit(0.19);
    const m = mk((x, w, h) => { x.fillStyle = '#d8d2c0'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a2018'; x.textAlign = 'center'; x.textBaseline = 'middle';
      let fs = 58; x.font = `bold ${fs}px Georgia, serif`; while (x.measureText(text).width > w - 20 && fs > 14) { fs -= 4; x.font = `bold ${fs}px Georgia, serif`; } x.fillText(text, w / 2, h / 2); }, 256, 128);
    const s = sheet(c, 't', 0.105, 0.052, m, false, 0, root, 0);
    s.position.set(0.021, -0.065, -0.0105);
  } else { itemGeo(g, kind, seed); g.fit(0.22); }
  if (!g.empty) g.build('inspect.g', c.scene, mk(), root);
  root.onDisposeObservable.add(() => { for (const m of mats) { m.diffuseTexture?.dispose(); m.dispose(); } });
  return root;
}

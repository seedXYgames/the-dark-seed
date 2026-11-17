// Edifici, ponti e pontili procedurali. Le forme seguono esattamente i collisori di `buildingColliders` e `model.platforms`.
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { BuildingSpec } from '../core/contracts';
import { toWorld, type Platform } from '../world/model';
import { Geo, type Ctx, type V3, mixHex } from './meshUtil';
import { cabinWallSegments, DOOR_GAP, DOOR_H, WALL_T } from './objMath';

export const PAL_WALL = [0x6b5540, 0x7a6a55, 0x5c6657, 0x80684e, 0x7a4f43, 0x86806c];
export const PAL_HOUSE = [0xb9b3a0, 0x8fa39a, 0xa9a39b, 0xb59a84, 0x8e9aa6, 0xa88f8a];
export const PAL_ROOF = [0x3b3a36, 0x4a3a30, 0x2f3d35, 0x55423a, 0x3a3f46, 0x4b4b3f];
export const PAL_TRIM = [0xcfc6b0, 0xb8b09a, 0xd8d2c0, 0x9c8f78, 0xc9c0b0, 0xe0dccd];
export const PAL_DOOR = [0x4a3526, 0x2f4a3a, 0x6e2a25, 0x3b3f4a, 0x5a4a30, 0x3d4d45];
const STONE = 0x77756c, PLANK = 0x7b6a52, DARK = 0x191613, STEEL = 0x3d4a40, CONCRETE = 0x8c8a80;

export interface Built { node: TransformNode; drift: TransformNode; meshes: Mesh[]; win?: Mesh }

function holder(c: Ctx, name: string, x: number, y: number, z: number, rot: number, parent: TransformNode): { node: TransformNode; drift: TransformNode } {
  const node = new TransformNode(name, c.scene);
  node.parent = parent; node.position.set(x, y, z); node.rotation.y = rot;
  const drift = new TransformNode(name + '.d', c.scene);
  drift.parent = node;
  return { node, drift };
}

/** Finestra rivolta verso +z locale dopo la trasformazione (x,y,z,ang). Telaio in `g`, vetro in `gw`. */
function windowAt(g: Geo, gw: Geo, x: number, y: number, z: number, ang: number, w: number, h: number, trim: number, shutters = 0): void {
  for (const q of [g, gw]) q.push().tr(x, y, z).ry(ang);
  const t = 0.07;
  g.box(0, h / 2 + t / 2, 0.02, w + 2 * t, t, 0.06, trim).box(0, -h / 2 - t / 2, 0.035, w + 2 * t + 0.06, t, 0.1, trim);
  g.box(-w / 2 - t / 2, 0, 0.02, t, h, 0.06, trim).box(w / 2 + t / 2, 0, 0.02, t, h, 0.06, trim);
  g.box(0, 0, 0.02, 0.035, h, 0.04, trim);
  if (h > 0.6) g.box(0, 0, 0.02, w, 0.035, 0.04, trim);
  if (shutters) for (const s of [-1, 1]) g.box(s * (w / 2 + t + 0.17), 0, 0.015, 0.3, h + 0.08, 0.03, shutters);
  gw.quad([-w / 2, -h / 2, 0.012], [w / 2, -h / 2, 0.012], [w / 2, h / 2, 0.012], [-w / 2, h / 2, 0.012], 0xffffff, [0, 0, 1]);
  for (const q of [g, gw]) q.pop();
}

/** Tetto a due falde con colmo lungo x. `half` = semi-luce fino al filo esterno del muro. */
function gableRoof(g: Geo, w: number, half: number, h: number, rise: number, over: number, col: number, capCol: number): void {
  const k = rise / half, ey = h - over * k + 0.04, len = w + 2 * over;
  for (const s of [-1, 1]) g.beam([0, h + rise + 0.04, 0], [0, ey, s * (half + over)], len, col, 0.1);
  g.box(0, h + rise + 0.1, 0, len + 0.06, 0.09, 0.34, capCol);
  for (const s of [-1, 1]) g.box(0, ey - 0.03, s * (half + over), len, 0.14, 0.05, capCol); // gronda
}

function doorFrame(g: Geo, x: number, z: number, trim: number): void {
  g.box(x - DOOR_GAP - 0.05, DOOR_H / 2, z, 0.1, DOOR_H, 0.05, trim).box(x + DOOR_GAP + 0.05, DOOR_H / 2, z, 0.1, DOOR_H, 0.05, trim);
  g.box(x, DOOR_H + 0.05, z, DOOR_GAP * 2 + 0.2, 0.1, 0.05, trim);
}

export function buildBuilding(c: Ctx, b: BuildingSpec, parent: TransformNode): Built {
  const { node, drift } = holder(c, 'bld.' + b.id, b.pos.x, b.floorY, b.pos.z, b.rotY, parent);
  const g = new Geo(b.palette * 77 + 5), gw = new Geo(3);
  gw.jit = 0;
  const p = b.palette % 6, w = b.w, d = b.d, h = b.h, hw = w / 2, hd = d / 2;
  const wall = PAL_WALL[p], roof = PAL_ROOF[p], trim = PAL_TRIM[p];
  switch (b.kind) {
    case 'cabin': {
      if (!b.enterable) { // variante non visitabile: volume pieno
        g.box(0, (h - 0.3) / 2, 0, w, h + 0.3, d, wall);
        gableRoof(g, w, hd, h, hd * 0.5, 0.5, roof, mixHex(roof, 0, 0.3));
        for (const s of [-1, 1]) g.tri([s * hw, h, -hd], [s * hw, h, hd], [s * hw, h + hd * 0.5, 0], wall, [s, 0, 0]);
        g.box(0, 1.02, hd + 0.004, DOOR_GAP * 2, DOOR_H, 0.008, DARK);
        doorFrame(g, 0, hd + 0.02, trim);
        break;
      }
      const T = WALL_T, ho = hd + T;
      g.box(0, -0.34, 0, w + 0.6, 0.52, d + 0.6, STONE);
      g.jit = 0.1;
      for (let i = 0; i < 8; i++) g.box(-hw + (i + 0.5) * (w / 8), -0.04, 0, w / 8 - 0.015, 0.08, d - 0.02, PLANK, 1);
      g.jit = 0.06;
      for (const s of cabinWallSegments(b)) if (!s.door) g.box(s.lx, (h - 0.1) / 2, s.lz, s.hx * 2, h + 0.1, s.hz * 2, wall);
      g.box(b.doorOffset, (DOOR_H + h) / 2, hd, DOOR_GAP * 2, h - DOOR_H, T * 2, wall);
      // corsi di tronchi (esterno) e cantonali
      const logc = mixHex(wall, 0, 0.35);
      for (let y = 0.28; y < h; y += 0.42) {
        g.box(0, y, -ho, w + 2 * T, 0.035, 0.03, logc);
        for (const s of [-1, 1]) g.box(s * (hw + T), y, 0, 0.03, 0.035, d + 2 * T, logc);
        const l = b.doorOffset - DOOR_GAP - 0.1, r = b.doorOffset + DOOR_GAP + 0.1;
        if (l > -hw) g.box((-hw - T + l) / 2, y, ho, l + hw + T, 0.035, 0.03, logc);
        if (r < hw) g.box((hw + T + r) / 2, y, ho, hw + T - r, 0.035, 0.03, logc);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * (hw + 0.02), h / 2 - 0.05, sz * (hd + 0.02), 0.44, h + 0.1, 0.44, mixHex(wall, 0, 0.22));
      const rise = ho * 0.46;
      gableRoof(g, w + 2 * T, ho, h, rise, 0.5, roof, mixHex(roof, 0, 0.3));
      for (const s of [-1, 1]) {
        g.tri([s * (hw + T), h, -ho], [s * (hw + T), h, ho], [s * (hw + T), h + rise, 0], wall, [s, 0, 0]);
        g.tri([s * (hw - T), h, -ho], [s * (hw - T), h, ho], [s * (hw - T), h + rise, 0], mixHex(wall, 0, 0.15), [-s, 0, 0]);
      }
      for (const x of [-hw * 0.5, 0, hw * 0.5]) g.box(x, h + 0.07, 0, 0.14, 0.14, d, mixHex(wall, 0, 0.3));
      g.box(hw * 0.5, h + rise * 0.5 + 0.55, -hd * 0.45, 0.55, 1.5, 0.55, STONE).box(hw * 0.5, h + rise * 0.5 + 1.34, -hd * 0.45, 0.68, 0.09, 0.68, mixHex(STONE, 0, 0.3));
      g.box(b.doorOffset, -0.075, ho + 0.5, 1.8, 0.13, 1.0, PLANK);
      doorFrame(g, b.doorOffset, ho + 0.012, trim);
      // finestre: esterno + interno
      const pair = (x: number, z: number, ang: number, ww: number) => {
        const nx = Math.sin(ang), nz = Math.cos(ang);
        windowAt(g, gw, x + nx * (T + 0.006), 1.45, z + nz * (T + 0.006), ang, ww, 0.9, trim);
        windowAt(g, gw, x - nx * (T + 0.006), 1.45, z - nz * (T + 0.006), ang + Math.PI, ww, 0.9, trim);
      };
      pair(0, -hd, Math.PI, 1.1);
      pair(-hw, 0.3, -Math.PI / 2, 1.0);
      pair(hw, 0.3, Math.PI / 2, 1.0);
      const lLen = b.doorOffset - DOOR_GAP + hw, rA = b.doorOffset + 1.25, rB = hw - 0.3;
      if (rB - rA >= 0.55 && rB - rA >= lLen - 0.6) pair((rA + rB) / 2, hd, 0, Math.min(1.0, rB - rA));
      else if (lLen >= 1.15) pair(-hw + lLen / 2 + 0.05, hd, 0, Math.min(1.0, lLen - 0.6));
      break;
    }
    case 'house': {
      const hc = PAL_HOUSE[p], dk = mixHex(hc, 0, 0.18), sh = PAL_DOOR[(p + 2) % 6];
      const T = WALL_T, open = b.enterable, fz = open ? hd + T : hd;
      g.box(0, -0.3, 0, w + 0.16 + (open ? 2 * T : 0), 0.5, d + 0.16 + (open ? 2 * T : 0), STONE);
      if (!open) {
        g.box(0, h / 2, 0, w, h, d, hc, 1);
        for (let y = 0.3; y < h; y += 0.3) g.box(0, y, 0, w + 0.03, 0.022, d + 0.03, dk, 3);
      } else {
        // casa visitabile: muri cavi come la baita, pavimento di assi, intonaco chiaro all'interno
        g.jit = 0.08;
        for (let i = 0; i < 9; i++) g.box(-hw + (i + 0.5) * (w / 9), -0.04, 0, w / 9 - 0.015, 0.08, d - 0.02, PLANK, 1);
        g.jit = 0.04;
        for (const sg of cabinWallSegments(b)) if (!sg.door) g.box(sg.lx, h / 2, sg.lz, sg.hx * 2, h, sg.hz * 2, hc, 1);
        g.box(b.doorOffset, (DOOR_H + h) / 2, hd, DOOR_GAP * 2, h - DOOR_H, T * 2, hc);
        const inner = mixHex(hc, 0xffffff, 0.25);
        g.box(0, h / 2, -hd + T + 0.004, w - 2 * T, h, 0.008, inner);
        for (const sx of [-1, 1]) g.box(sx * (hw - T - 0.004), h / 2, 0, 0.008, h, d - 2 * T, inner);
        g.box(0, h - 0.02, 0, w, 0.06, d, mixHex(inner, 0, 0.15)); // soffitto
        for (let y = 0.3; y < h; y += 0.3) {
          g.box(0, y, -hd - T - 0.012, w + 2 * T, 0.022, 0.02, dk, 3);
          for (const sx of [-1, 1]) g.box(sx * (hw + T + 0.012), y, 0, 0.02, 0.022, d + 2 * T, dk, 3);
          const l = b.doorOffset - DOOR_GAP - 0.1, r = b.doorOffset + DOOR_GAP + 0.1;
          if (y > DOOR_H + 0.05) g.box(0, y, hd + T + 0.012, w + 2 * T, 0.022, 0.02, dk, 3);
          else {
            g.box((-hw - T + l) / 2, y, hd + T + 0.012, l + hw + T, 0.022, 0.02, dk, 3);
            g.box((hw + T + r) / 2, y, hd + T + 0.012, hw + T - r, 0.022, 0.02, dk, 3);
          }
        }
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * hw, h / 2, sz * hd, 0.16, h, 0.16, trim);
      const rise = hd * 0.6;
      gableRoof(g, w, hd, h, rise, 0.55, roof, mixHex(roof, 0, 0.3));
      for (const s of [-1, 1]) {
        g.tri([s * hw, h, -hd], [s * hw, h, hd], [s * hw, h + rise, 0], hc, [s, 0, 0]);
        g.box(s * (hw + 0.012), h + rise * 0.42, 0, 0.02, 0.5, 0.4, dk);
      }
      g.box(-hw * 0.45, h + rise * 0.6 + 0.6, -hd * 0.3, 0.6, 1.5, 0.6, 0x7a5348).box(-hw * 0.45, h + rise * 0.6 + 1.38, -hd * 0.3, 0.72, 0.08, 0.72, STONE);
      // portico
      const pw = Math.min(w * 0.62, 5.2);
      g.box(0, -0.07, hd + 0.85, pw, 0.14, 1.7, PLANK).box(0, -0.16, hd + 1.9, 1.5, 0.12, 0.42, PLANK);
      g.beam([0, 2.78, hd], [0, 2.42, hd + 1.95], pw + 0.4, roof, 0.08);
      g.box(0, 2.4, hd + 1.6, pw, 0.12, 0.1, trim);
      for (const s of [-1, 1]) {
        g.box(s * (pw / 2 - 0.08), 1.2, hd + 1.6, 0.12, 2.4, 0.12, trim);
        g.box(s * (pw / 2 - 0.08), 0.85, hd + 0.8, 0.05, 0.06, 1.55, trim);
        for (let i = 0; i < 5; i++) g.box(s * (pw / 2 - 0.08), 0.43, hd + 0.2 + i * 0.3, 0.035, 0.82, 0.035, trim);
      }
      if (!open) g.box(0, 1.02, hd + 0.004, DOOR_GAP * 2, DOOR_H, 0.008, DARK);
      doorFrame(g, 0, fz + 0.025, trim);
      const fx = Math.max(hw * 0.62, 2.0), ow = open ? T : 0;
      for (const s of [-1, 1]) {
        windowAt(g, gw, s * fx, 1.5, fz + 0.006, 0, 1.0, 1.2, trim, sh);
        windowAt(g, gw, s * hw * 0.5, 1.5, -hd - ow - 0.006, Math.PI, 1.0, 1.2, trim);
        windowAt(g, gw, s * (hw + ow + 0.006), 1.5, 0, s * Math.PI / 2, 1.0, 1.2, trim, sh);
        if (open) { // le stesse finestre viste da dentro
          windowAt(g, gw, s * fx, 1.5, hd - T - 0.012, Math.PI, 1.0, 1.2, trim);
          windowAt(g, gw, s * hw * 0.5, 1.5, -hd + T + 0.012, 0, 1.0, 1.2, trim);
          windowAt(g, gw, s * (hw - T - 0.012), 1.5, 0, -s * Math.PI / 2, 1.0, 1.2, trim);
        }
      }
      break;
    }
    case 'kiosk': {
      const hc = PAL_HOUSE[(p + 1) % 6], band = [0x8a3a2a, 0x2f5a4a, 0x35506e][p % 3];
      g.box(0, h / 2 - 0.15, 0, w, h + 0.3, d, hc);
      g.box(0, 0.35, 0, w + 0.04, 0.9, d + 0.04, mixHex(hc, 0, 0.3), 3);
      g.box(0, h + 0.1, 0.3, w + 0.7, 0.2, d + 1.3, 0xb8b4a6);
      g.box(0, h + 0.1, hd + 0.96, w + 0.72, 0.24, 0.03, band).box(0, h + 0.55, hd * 0.3, w * 0.6, 0.7, 0.14, band).box(0, h + 0.55, hd * 0.3 + 0.08, w * 0.6 - 0.2, 0.2, 0.02, 0xd8d2c0);
      windowAt(g, gw, -1.9, 1.6, hd + 0.006, 0, 2.0, 1.25, trim);
      windowAt(g, gw, 1.72, 1.65, hd + 0.006, 0, 0.7, 0.9, trim);
      g.box(0, 1.02, hd + 0.004, DOOR_GAP * 2, DOOR_H, 0.008, DARK);
      doorFrame(g, 0, hd + 0.025, trim);
      g.box(-2.2, 0.4, hd + 0.3, 1.1, 0.93 + 0.12, 0.55, 0xc9cdd0).box(-2.2, 0.6, hd + 0.58, 0.9, 0.3, 0.012, 0x4a6a8a); // cassone del ghiaccio
      break;
    }
    case 'shed': {
      const mc = [0x56605a, 0x5d5a52, 0x4a5560][p % 3];
      g.box(0, h / 2 - 0.15, 0, w, h + 0.3, d, mc);
      const rib = mixHex(mc, 0, 0.25);
      for (let x = -hw + 0.2; x < hw; x += 0.4) { if (Math.abs(x) > DOOR_GAP + 0.15) g.box(x, h / 2, hd + 0.012, 0.05, h, 0.024, rib); g.box(x, h / 2, -hd - 0.012, 0.05, h, 0.024, rib); }
      for (let z = -hd + 0.2; z < hd; z += 0.4) for (const s of [-1, 1]) g.box(s * (hw + 0.012), h / 2, z, 0.024, h, 0.05, rib);
      g.beam([0, h + 0.42, -hd - 0.3], [0, h + 0.04, hd + 0.4], w + 0.5, mixHex(roof, 0x556055, 0.4), 0.07);
      for (const s of [-1, 1]) g.tri([s * hw, h, -hd], [s * hw, h, hd], [s * hw, h + 0.36, -hd], mc, [s, 0, 0]);
      g.quad([-hw, h, -hd], [hw, h, -hd], [hw, h + 0.36, -hd], [-hw, h + 0.36, -hd], mc, [0, 0, -1]);
      g.box(0, 1.02, hd + 0.004, DOOR_GAP * 2, DOOR_H, 0.008, DARK);
      doorFrame(g, 0, hd + 0.025, rib);
      g.box(hw - 0.5, h - 0.4, hd + 0.015, 0.45, 0.3, 0.03, rib);
      for (let i = 0; i < 3; i++) g.box(hw - 0.5, h - 0.48 + i * 0.08, hd + 0.035, 0.4, 0.02, 0.03, DARK);
      break;
    }
    case 'restroom': {
      g.box(0, 0.4, 0, w, 1.4, d, CONCRETE).box(0, (1.1 + h) / 2, 0, w - 0.04, h - 1.1, d - 0.04, wall);
      g.box(0, 1.1, 0, w + 0.05, 0.06, d + 0.05, trim, 3);
      gableRoof(g, w, hd, h, 0.85, 0.5, roof, mixHex(roof, 0, 0.3));
      for (const s of [-1, 1]) {
        g.tri([s * hw, h, -hd], [s * hw, h, hd], [s * hw, h + 0.85, 0], wall, [s, 0, 0]);
        windowAt(g, gw, s * (hw + 0.006), 2.05, 0, s * Math.PI / 2, 0.8, 0.4, trim);
      }
      g.box(0, 1.02, hd + 0.004, DOOR_GAP * 2, DOOR_H, 0.008, DARK);
      doorFrame(g, 0, hd + 0.025, trim);
      g.box(-1.0, 1.6, hd + 0.012, 0.26, 0.3, 0.02, 0xe6e2d6).box(-1.0, 1.56, hd + 0.025, 0.07, 0.14, 0.01, 0x2a3a52).box(-1.0, 1.68, hd + 0.025, 0.06, 0.06, 0.01, 0x2a3a52);
      g.box(-1.4, 1.02, hd + 0.2, 0.55, 0.05, 0.4, PLANK).beam([-1.4, 0.75, hd], [-1.4, 1.0, hd + 0.32], 0.04, STEEL);
      break;
    }
    case 'church': {
      // navata con tetto a capanna lungo z, campanile in facciata con cuspide e croce
      const hc = mixHex(PAL_HOUSE[p], 0xd8d2c4, 0.45), dk = mixHex(hc, 0, 0.2), rise = hw * 0.75;
      g.box(0, -0.3, 0, w + 0.3, 0.5, d + 0.3, STONE);
      g.box(0, h / 2, 0, w, h, d, hc, 1);
      g.box(0, 0.45, 0, w + 0.04, 0.9, d + 0.04, mixHex(STONE, hc, 0.3), 3);
      g.push().ry(Math.PI / 2);
      gableRoof(g, d, hw, h, rise, 0.4, roof, mixHex(roof, 0, 0.3));
      g.pop();
      g.tri([-hw, h, -hd], [hw, h, -hd], [0, h + rise, -hd], hc, [0, 0, -1]);
      g.tri([-hw, h, hd], [hw, h, hd], [0, h + rise, hd], hc, [0, 0, 1]);
      // finestre alte e strette sui fianchi, rosone in facciata
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) windowAt(g, gw, sx * (hw + 0.006), 3.0, -hd + 2 + i * ((d - 6) / 3), sx * Math.PI / 2, 0.7, 2.4, dk);
      windowAt(g, gw, 0, h - 0.6 + rise * 0.35, hd + 0.006, 0, 1.0, 1.0, dk);
      // campanile sul fianco della facciata
      const tw = 2.6, tx = hw - tw / 2 - 0.05, tz = hd - tw / 2 - 0.05, th = h + 8;
      g.box(tx, th / 2, tz, tw + 0.1, th, tw + 0.1, mixHex(hc, 0, 0.08));
      for (let y = 3; y < th - 1; y += 3) g.box(tx, y, tz, tw + 0.16, 0.12, tw + 0.16, dk, 3);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, ox = Math.sin(a) * (tw / 2 + 0.06), oz = Math.cos(a) * (tw / 2 + 0.06);
        g.box(tx + ox, th - 1.4, tz + oz, Math.abs(ox) > 0.1 ? 0.02 : 1.0, 1.6, Math.abs(ox) > 0.1 ? 1.0 : 0.02, DARK); // cella campanaria
      }
      g.frustum(tx, tz, th, tw + 0.5, tw + 0.5, th + 3.6, 0.1, 0.1, roof);
      g.box(tx, th + 4.2, tz, 0.09, 1.2, 0.09, 0x8a8478).box(tx, th + 4.4, tz, 0.6, 0.09, 0.09, 0x8a8478);
      // portale a due battenti e gradini
      g.box(-0.9, 1.35, hd + 0.004, 2.0, 2.7, 0.01, DARK);
      g.box(-0.9, 2.85, hd + 0.02, 2.4, 0.18, 0.06, trim).box(-2.05, 1.4, hd + 0.02, 0.18, 2.8, 0.06, trim).box(0.25, 1.4, hd + 0.02, 0.18, 2.8, 0.06, trim);
      g.box(-0.9, -0.1, hd + 0.6, 3.2, 0.2, 1.2, STONE).box(-0.9, -0.25, hd + 1.4, 3.6, 0.2, 0.6, STONE);
      break;
    }
    case 'barn': {
      // fienile di legno scuro con portone scorrevole
      const wood = mixHex(0x6e3a2c, PAL_WALL[p], 0.35), dk = mixHex(wood, 0, 0.3);
      g.box(0, h / 2 - 0.1, 0, w, h + 0.2, d, wood, 1);
      for (let x = -hw + 0.3; x < hw; x += 0.3) for (const sz of [-1, 1]) g.box(x, h / 2, sz * (hd + 0.01), 0.03, h, 0.02, dk);
      const rise = hd * 0.8;
      gableRoof(g, w, hd, h, rise, 0.45, roof, mixHex(roof, 0, 0.3));
      for (const sx of [-1, 1]) g.tri([sx * hw, h, -hd], [sx * hw, h, hd], [sx * hw, h + rise, 0], wood, [sx, 0, 0]);
      g.box(0, 1.5, hd + 0.02, 3.2, 3.0, 0.03, dk).box(0, 1.5, hd + 0.04, 3.2, 0.12, 0.02, mixHex(dk, 0xffffff, 0.2));
      g.beam([-1.6, 0.05, hd + 0.05], [1.6, 2.95, hd + 0.05], 0.1, mixHex(dk, 0xffffff, 0.2), 0.02);
      g.beam([1.6, 0.05, hd + 0.05], [-1.6, 2.95, hd + 0.05], 0.1, mixHex(dk, 0xffffff, 0.2), 0.02);
      g.box(0, 3.3, hd + 0.1, 3.6, 0.1, 0.2, STEEL);
      windowAt(g, gw, 0, h + rise * 0.3, hd + 0.006, 0, 0.9, 0.7, dk);
      break;
    }
    case 'tower': {
      const yb = -0.5, yc = h - 2.5, wood = 0x5f4f3c;
      const leg = (sx: number, sz: number, y: number): V3 => { const k = 1 + 0.16 * (1 - (y - yb) / (yc - yb)); return [sx * hw * 0.92 * k, y, sz * hd * 0.92 * k]; };
      const C: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [sx, sz] of C) g.beam(leg(sx, sz, yb), leg(sx, sz, yc), 0.22, STEEL);
      const tiers = 4;
      for (let t = 0; t < tiers; t++) {
        const y0 = -0.1 + ((yc + 0.1) * t) / tiers, y1 = -0.1 + ((yc + 0.1) * (t + 1)) / tiers;
        for (let i = 0; i < 4; i++) {
          const a = C[i], bq = C[(i + 1) % 4];
          g.beam(leg(a[0], a[1], y1), leg(bq[0], bq[1], y1), 0.1, STEEL);
          g.beam(leg(a[0], a[1], y0), leg(bq[0], bq[1], y1), 0.07, STEEL).beam(leg(bq[0], bq[1], y0), leg(a[0], a[1], y1), 0.07, STEEL);
        }
        // scala a rampe alternate
        const dir = t % 2 ? -1 : 1, zz = t % 2 ? 0.55 : -0.55;
        g.beam([-dir * 1.25, y0 + 0.05, zz], [dir * 1.25, y1 + 0.05, zz], 0.75, wood, 0.06);
        for (const o of [-0.38, 0.38]) g.beam([-dir * 1.25, y0 + 0.95, zz + o], [dir * 1.25, y1 + 0.95, zz + o], 0.04, STEEL);
        g.box(dir * 1.45, y1 + 0.03, 0, 0.6, 0.06, 1.9, wood);
      }
      g.box(0, yc, 0, w + 1.7, 0.14, d + 1.7, wood);
      g.box(0, yc + 0.07 + 0.5, 0, w, 1.0, d, wall).box(0, yc + 1.57, 0, w, 1.0, d, mixHex(wall, 0, 0.12)).box(0, h - 0.22, 0, w + 0.1, 0.36, d + 0.1, trim);
      for (let i = 0; i < 4; i++) windowAt(g, gw, Math.sin(i * Math.PI / 2) * (hw + 0.006), yc + 1.55, Math.cos(i * Math.PI / 2) * (hd + 0.006), i * Math.PI / 2, w - 0.9, 0.8, trim);
      g.frustum(0, 0, h - 0.04, w + 1.3, d + 1.3, h + 1.25, 0.25, 0.25, roof);
      const rr = hw + 0.8;
      for (let i = 0; i < 4; i++) {
        const a = C[i], bq = C[(i + 1) % 4];
        g.beam([a[0] * rr, yc + 1.0, a[1] * rr], [bq[0] * rr, yc + 1.0, bq[1] * rr], 0.06, STEEL).beam([a[0] * rr, yc + 0.55, a[1] * rr], [bq[0] * rr, yc + 0.55, bq[1] * rr], 0.04, STEEL);
        g.box(a[0] * rr, yc + 0.5, a[1] * rr, 0.08, 1.0, 0.08, STEEL).box((a[0] + bq[0]) / 2 * rr, yc + 0.5, (a[1] + bq[1]) / 2 * rr, 0.06, 1.0, 0.06, STEEL);
      }
      g.box(0, -0.2, 0, w + 0.5, 0.2, d + 0.5, CONCRETE);
      break;
    }
    case 'canopy': {
      const band = 0x8a3a2a;
      for (const s of [-1, 1]) g.box(s * (hw - 0.4), h / 2 - 0.2, 0, 0.5, h - 0.3 + 0.4, 0.5, 0xb4b0a4).box(s * (hw - 0.4), 0.35, 0, 0.6, 0.9, 0.6, band);
      g.box(0, h - 0.15, 0, w, 0.3, d, 0xc4c0b4);
      g.box(0, h - 0.15, 0, w + 0.04, 0.12, d + 0.04, band, 3);
      g.box(0, -0.04, 0, 4.8, 0.16, 1.15, CONCRETE);
      break;
    }
  }
  const meshes: Mesh[] = [];
  const main = g.build('bld.' + b.id, c.scene, c.mats.vc, drift);
  c.shadow(main); meshes.push(main);
  let win: Mesh | undefined;
  if (!gw.empty) { win = gw.build('bld.win.' + b.id, c.scene, c.mats.winDark, drift); meshes.push(win); }
  return { node, drift, meshes, win };
}

/** Ponte o pontile a partire dalla piattaforma logica (stesse misure della collisione). */
export function buildPlatform(c: Ctx, p: Platform, parent: TransformNode): Built {
  const { node, drift } = holder(c, 'plat.' + p.id, p.cx, p.y, p.cz, p.rot, parent);
  const g = new Geo(p.id.length * 31 + 7);
  const wood = 0x6f5d47, dk = 0x4a3d30, hx = p.hx, hz = p.hz;
  const gy = (lx: number, lz: number) => { const q = toWorld(lx, lz, p.cx, p.cz, p.rot); return c.heightAt(q.x, q.z) - p.y; };
  g.box(0, -0.07, 0, hx * 2, 0.1, hz * 2, dk);
  g.jit = 0.12;
  const np = Math.max(4, Math.round((hz * 2) / 0.5)), pl = (hz * 2) / np;
  for (let i = 0; i < np; i++) g.box(0, -0.012, -hz + (i + 0.5) * pl, hx * 2 + 0.06, 0.024, pl - 0.03, wood, 1);
  g.jit = 0.06;
  for (const s of [-1, 1]) g.box(s * hx * 0.7, -0.24, 0, 0.16, 0.26, hz * 2, dk);
  if (p.kind === 'bridge') {
    const n = Math.max(1, Math.round((hz * 2 - 2.4) / 2.2)), step = (hz * 2 - 2.4) / n;
    for (const s of [-1, 1]) {
      for (let i = 0; i <= n; i++) g.box(s * hx, 0.4, -hz + 1.2 + i * step, 0.12, 1.4, 0.12, dk);
      g.box(s * hx, 1.06, 0, 0.1, 0.07, hz * 2 - 2.2, wood).box(s * hx, 0.56, 0, 0.05, 0.1, hz * 2 - 2.3, wood);
    }
    for (const s of [-1, 1]) g.box(0, -0.52, s * (hz - 0.25), hx * 2 + 0.7, 1.0, 0.9, STONE);
    const ns = Math.max(1, Math.round((hz * 2) / 4.5));
    for (let i = 1; i < ns; i++) {
      const z = -hz + (i * hz * 2) / ns, b0 = gy(-hx * 0.8, z) - 0.7, b1 = gy(hx * 0.8, z) - 0.7;
      if (Math.min(b0, b1) > -0.6) continue;
      g.beam([-hx * 0.8, -0.2, z], [-hx * 0.95, b0, z], 0.18, dk).beam([hx * 0.8, -0.2, z], [hx * 0.95, b1, z], 0.18, dk);
      g.box(0, -0.42, z, hx * 2 + 0.3, 0.16, 0.16, dk);
      if (Math.min(b0, b1) < -1.8) g.beam([-hx * 0.82, -0.5, z], [hx * 0.9, Math.max(b1, -3.2) + 0.5, z], 0.08, dk).beam([hx * 0.82, -0.5, z], [-hx * 0.9, Math.max(b0, -3.2) + 0.5, z], 0.08, dk);
    }
  } else {
    const n = Math.max(2, Math.round((hz * 2) / 3.3));
    for (let i = 0; i <= n; i++) {
      const z = -hz + 0.15 + (i * (hz * 2 - 0.3)) / n;
      for (const s of [-1, 1]) {
        const top = i % 2 === 0 ? 0.45 : -0.05, bot = Math.min(gy(s * hx, z) - 0.9, -1.2);
        g.cyl(s * (hx + 0.02), (top + bot) / 2, z, 0.1, 0.09, top - bot, dk, 'y', 7);
        if (top > 0) g.cyl(s * (hx + 0.02), top + 0.02, z, 0.115, 0.115, 0.05, 0x8a8778, 'y', 7);
      }
      g.box(0, -0.4, z, hx * 2 + 0.2, 0.14, 0.14, dk);
    }
    for (const s of [-1, 1]) g.box(s * 0.25, -0.75, hz + 0.06, 0.05, 1.7, 0.05, STEEL);
    for (let i = 0; i < 5; i++) g.box(0, -0.1 - i * 0.32, hz + 0.06, 0.5, 0.04, 0.04, STEEL);
    // barche a remi ormeggiate accanto al molo, a pelo d'acqua (0,9 m sotto l'impalcato)
    let hsh = 0;
    for (const ch of p.id) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    const nb = 1 + (hsh % 2), hulls = [0x3d5a6e, 0x7a3b2e, 0x5f6b4a, 0xb8b2a0];
    for (let k = 0; k < nb; k++) {
      const side = (k + hsh) % 2 ? 1 : -1, bz = hz - 2.4 - k * 4.2, col = hulls[(hsh >> (k * 2)) % 4];
      if (bz < -hz + 1.5) break;
      g.push().tr(side * (hx + 1.0), -0.95, bz).ry(((hsh >> 3) % 7 - 3) * 0.03);
      g.frustum(0, 0, -0.35, 0.55, 2.6, 0.1, 1.25, 3.6, col);
      g.box(0, 0.09, 0, 1.15, 0.02, 3.4, 0x1c1a17);
      g.box(0, 0.12, -1.72, 0.9, 0.06, 0.1, mixHex(col, 0xffffff, 0.3)).box(0, 0.12, 1.72, 0.9, 0.06, 0.1, mixHex(col, 0xffffff, 0.3));
      for (const sz of [-0.8, 0.5]) g.box(0, 0.02, sz, 1.1, 0.05, 0.3, PLANK);
      g.beam([0.3, 0.15, -0.3], [0.45, 0.1, 1.4], 0.05, PLANK).beam([-0.3, 0.15, -0.3], [-0.45, 0.1, 1.4], 0.05, PLANK);
      g.beam([-side * 0.2, 0.15, 1.6], [-side * 0.95, 0.9, 1.4], 0.025, 0x8a7a5a); // cima d'ormeggio
      g.pop();
    }
  }
  const main = g.build('plat.' + p.id, c.scene, c.mats.vc, drift);
  c.shadow(main);
  return { node, drift, meshes: [main] };
}

// Veicoli procedurali: auto civili (berlina, pick-up, familiare) e auto di pattuglia generica.
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Geo, type Ctx, type V3, makeCanvasTexture, texPlane, segsFor } from './meshUtil';
import { buildPatrolCar, buildPatrolTrunk } from './patrolCar';

export const CAR_COLORS = [0x6e2a25, 0x2f4a3a, 0x8b8f8a, 0x2a3a52, 0xb9ad8f, 0x3a3a3c];
export interface CarOpts { body: string; color: number; fogged: boolean; police: boolean; plate: string; unit: string }
export interface CarBuilt { meshes: Mesh[]; head: Mesh; amber?: Mesh; beacons?: { red: Mesh; blue: Mesh }; own: StandardMaterial[] }

function texMat(c: Ctx, name: string, w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void): StandardMaterial {
  const m = c.mats.make(name, 0xffffff);
  m.diffuseTexture = makeCanvasTexture(c.scene, name + '.t', w, h, draw);
  return m;
}

export function buildCar(c: Ctx, parent: TransformNode, o: CarOpts): CarBuilt {
  if (o.police) return buildPatrolCar(c, parent, o);
  const g = new Geo(o.plate.length * 13 + o.color), gh = new Geo(1), ga = new Geo(1);
  gh.jit = 0; ga.jit = 0; g.jit = 0.03;
  const col = o.police ? 0x15181d : CAR_COLORS[o.color % 6], glass = o.fogged ? 0x9aa3a6 : 0x1b2428, dk = 0x101010;
  const sg = segsFor(c.gfx) + 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.cyl(sx * 0.8, 0.33, sz * 1.35, 0.33, 0.33, 0.24, 0x141414, 'x', sg).cyl(sx * 0.925, 0.33, sz * 1.35, 0.18, 0.18, 0.02, 0x8a8c8c, 'x', sg);
    g.box(sx * 0.885, 0.5, sz * 1.35, 0.012, 0.42, 0.86, dk);
  }
  g.box(0, 0.53, 0, 1.76, 0.5, 4.4, col);
  g.box(0, 0.36, 2.22, 1.8, 0.16, 0.12, 0x2a2a2a).box(0, 0.36, -2.22, 1.8, 0.16, 0.12, 0x2a2a2a);
  g.box(0, 0.6, 2.206, 0.74, 0.14, 0.02, dk);
  for (const s of [-1, 1]) {
    g.box(s * 0.65, 0.66, -2.206, 0.3, 0.12, 0.02, 0x5a1410);
    gh.box(s * 0.62, 0.66, 2.21, 0.3, 0.13, 0.03, 0xffffff);
    g.box(s * 0.886, 0.56, -0.22, 0.008, 0.52, 0.02, dk).box(s * 0.89, 0.72, 0.05, 0.012, 0.03, 0.13, 0x9a9a9a);
  }
  // abitacolo: tronco vetrato + montanti + tetto
  const cabin = (cz: number, d0: number, y1: number, w1: number, d1: number, oz: number) => {
    const y0 = 0.78, w0 = 1.66;
    g.frustum(0, cz, y0, w0, d0, y1, w1, d1, glass, 0, oz, 3);
    g.box(0, y1 + 0.025, cz + oz, w1 + 0.04, 0.05, d1 + 0.04, col);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) g.beam([sx * w0 / 2, y0, cz + sz * d0 / 2], [sx * w1 / 2, y1, cz + oz + sz * d1 / 2], 0.08, col);
      g.beam([sx * (w0 / 2 + 0.005), y0, cz + oz * 0.5], [sx * (w1 / 2 + 0.005), y1, cz + oz], 0.07, col);
      g.box(sx * 0.95, 0.98, cz + d0 / 2 - 0.12, 0.14, 0.09, 0.06, col);
    }
  };
  const hood = (top: number) => g.frustum(0, 1.5, 0.78, 1.72, 1.4, top, 1.62, 1.32, col, 0, -0.03);
  if (o.body === 'pickup') {
    hood(0.98);
    cabin(0.25, 1.3, 1.5, 1.4, 0.95, -0.05);
    for (const s of [-1, 1]) g.box(s * 0.84, 0.95, -1.3, 0.07, 0.34, 1.75, col);
    g.box(0, 0.95, -2.16, 1.7, 0.34, 0.07, col).box(0, 0.95, -0.43, 1.7, 0.34, 0.07, col).box(0, 0.79, -1.3, 1.62, 0.02, 1.7, 0x1a1a1a);
  } else if (o.body === 'wagon') {
    hood(0.93);
    cabin(-0.65, 3.0, 1.42, 1.4, 2.5, -0.1);
    for (const s of [-1, 1]) g.beam([s * 0.6, 1.5, -1.8], [s * 0.6, 1.5, 0.2], 0.04, 0x2a2a2a);
  } else {
    hood(0.93);
    cabin(-0.2, 2.1, 1.4, 1.36, 1.15, -0.05);
    if (o.police) {
      for (const s of [-1, 1]) g.box(s * 0.82, 0.87, -1.72, 0.07, 0.18, 0.9, col);
      g.box(0, 0.87, -2.15, 1.7, 0.18, 0.06, col).box(0, 0.87, -1.29, 1.7, 0.18, 0.05, col).box(0, 0.787, -1.72, 1.6, 0.012, 0.86, 0x0b0b0b);
    } else g.box(0, 0.87, -1.72, 1.7, 0.18, 0.9, col);
  }
  const own: StandardMaterial[] = [];
  const meshes: Mesh[] = [];
  if (o.police) {
    for (const s of [-1, 1]) g.box(s * 0.887, 0.6, 0.25, 0.012, 0.58, 1.02, 0xd8d8d2);
    g.box(0, 1.5, -0.25, 1.12, 0.09, 0.26, 0x1c1c1c).box(-0.29, 1.51, -0.25, 0.46, 0.1, 0.28, 0x6e1512).box(0.29, 1.51, -0.25, 0.46, 0.1, 0.28, 0x14306e);
    for (const s of [-1, 1]) {
      ga.box(s * 0.6, 1.5, -0.25, 0.08, 0.1, 0.22, 0xffffff);
      g.beam([s * 0.45, 0.3, 2.3], [s * 0.45, 0.82, 2.34], 0.06, 0x1a1a1a);
    }
    g.box(0, 0.6, 2.34, 1.0, 0.06, 0.06, 0x1a1a1a).cyl(-0.86, 1.02, 0.72, 0.07, 0.06, 0.12, 0x9a9a9a, 'z', 7);
    const dm = texMat(c, 'car.decal', 256, 96, (x, w, h) => {
      x.fillStyle = '#d8d8d2'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#16233c'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 50px Arial, Helvetica, sans-serif'; x.fillText('POLICE', w / 2, 36);
      x.font = 'bold 24px Arial, Helvetica, sans-serif'; x.fillText(o.unit, w / 2, 78);
      x.fillRect(16, 60, 70, 4); x.fillRect(w - 86, 60, 70, 4);
    });
    own.push(dm);
    for (const s of [-1, 1]) {
      const pl = texPlane(c.scene, 'car.decal', 0.86, 0.32, dm, parent);
      pl.position.set(s * 0.895, 0.62, 0.25); pl.rotation.y = s * Math.PI / 2;
      meshes.push(pl);
    }
  }
  const pm = texMat(c, 'car.plate', 128, 64, (x, w, h) => {
    x.fillStyle = '#d9d6c6'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#2a3a52'; x.lineWidth = 4; x.strokeRect(3, 3, w - 6, h - 6);
    x.fillStyle = '#1c2a44'; x.textAlign = 'center'; x.textBaseline = 'middle';
    let fs = 34; x.font = `bold ${fs}px "Courier New", monospace`;
    while (x.measureText(o.plate).width > w - 16 && fs > 12) { fs -= 2; x.font = `bold ${fs}px "Courier New", monospace`; }
    x.fillText(o.plate, w / 2, h / 2 + 2);
  });
  own.push(pm);
  const pr = texPlane(c.scene, 'car.plateR', 0.34, 0.17, pm, parent);
  pr.position.set(0, 0.52, -2.285); pr.rotation.y = Math.PI;
  const pf = texPlane(c.scene, 'car.plateF', 0.34, 0.17, pm, parent);
  pf.position.set(0, 0.4, 2.285 + (o.police ? 0.09 : 0));
  meshes.push(pr, pf);
  const body = g.build('car.body', c.scene, c.mats.vc, parent);
  c.shadow(body);
  const head = gh.build('car.head', c.scene, c.mats.bulbOff, parent);
  meshes.push(body, head);
  let amber: Mesh | undefined;
  if (!ga.empty) { amber = ga.build('car.amber', c.scene, c.mats.bulbOff, parent); meshes.push(amber); }
  return { meshes, head, amber, own };
}

/** Cofano del bagagliaio dell'auto di pattuglia, nel sistema dell'oggetto `car_trunk` (cerniera in z=+1.25, y=+0.2). */
export function buildTrunkLid(c: Ctx, hinge: TransformNode): Mesh {
  return buildPatrolTrunk(c, hinge);
}

import { describe, expect, it } from 'vitest';
import car from '../src/render/assets/patrol-car.json';

describe('modello della volante esportato da Blender', () => {
  it('ha geometria valida, normali unitarie e un budget contenuto per un solo veicolo', () => {
    expect(car.triangles).toBeGreaterThan(1000);
    expect(car.triangles).toBeLessThan(35000);
    let triangles = 0;
    for (const [name, part] of Object.entries(car.parts)) {
      const n = part.positions.length / 3;
      expect(Number.isInteger(n), name).toBe(true);
      expect(part.normals.length, name).toBe(part.positions.length);
      expect(part.indices.length % 3, name).toBe(0);
      expect(n, name).toBeGreaterThan(0);
      for (const v of part.positions) expect(Number.isFinite(v), name).toBe(true);
      for (const index of part.indices) expect(Number.isInteger(index) && index >= 0 && index < n, name).toBe(true);
      for (let i = 0; i < part.normals.length; i += 3) expect(Math.hypot(...part.normals.slice(i, i + 3)), name).toBeCloseTo(1, 3);
      triangles += part.indices.length / 3;
    }
    expect(triangles).toBe(car.triangles);
  });
  it('mantiene dimensioni compatibili con il parcheggio e i punti di interazione', () => {
    for (const [name, part] of Object.entries(car.parts)) {
      if (name === 'trunk') continue;
      for (let i = 0; i < part.positions.length; i += 3) {
        expect(Math.abs(part.positions[i]), name).toBeLessThan(1.15);
        expect(part.positions[i + 1], name).toBeGreaterThanOrEqual(-0.01);
        expect(part.positions[i + 1], name).toBeLessThan(2.1);
        expect(Math.abs(part.positions[i + 2]), name).toBeLessThan(2.5);
      }
    }
  });
  it('separa fari e circuiti luminosi e allinea il bagagliaio alla cerniera esistente', () => {
    for (const name of ['head', 'red', 'blue', 'trunk'] as const) expect(car.parts[name].indices.length).toBeGreaterThan(0);
    const trunk = car.parts.trunk.positions;
    for (let i = 0; i < trunk.length; i += 3) {
      expect(Math.abs(trunk[i])).toBeLessThan(0.86);
      expect(trunk[i + 1]).toBeGreaterThan(-0.02);
      expect(trunk[i + 1]).toBeLessThan(0.08);
      expect(trunk[i + 2]).toBeGreaterThan(-0.94);
      expect(trunk[i + 2]).toBeLessThan(0.01);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { canvasToWorld, effectiveSignal, glitchOffset, mapTransform, worldToCanvas, yawToCanvasAngle } from '../src/ui/map';
import { formatDuration } from '../src/ui/screens';

describe('map transform', () => {
  const tr = mapTransform(1400, 300, 300, 10);
  it('puts the world centre at the canvas centre', () => {
    expect(worldToCanvas({ x: 0, z: 0 }, tr)).toEqual({ x: 150, y: 150 });
  });
  it('keeps north up and east right, inside the padding', () => {
    const ne = worldToCanvas({ x: 700, z: 700 }, tr);
    const sw = worldToCanvas({ x: -700, z: -700 }, tr);
    expect(ne.x).toBeCloseTo(290);
    expect(ne.y).toBeCloseTo(10);
    expect(sw.x).toBeCloseTo(10);
    expect(sw.y).toBeCloseTo(290);
    expect(worldToCanvas({ x: 0, z: 100 }, tr).y).toBeLessThan(150);
    expect(worldToCanvas({ x: 100, z: 0 }, tr).x).toBeGreaterThan(150);
  });
  it('stays square and centred on non-square canvases', () => {
    const w = mapTransform(1400, 400, 200, 0);
    expect(w.scale).toBeCloseTo(200 / 1400);
    expect(worldToCanvas({ x: -700, z: 0 }, w).x).toBeCloseTo(100);
    expect(worldToCanvas({ x: 700, z: 0 }, w).x).toBeCloseTo(300);
  });
  it('inverts', () => {
    const p = { x: 123.5, z: -456.25 };
    const c = worldToCanvas(p, tr);
    const back = canvasToWorld(c.x, c.y, tr);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.z).toBeCloseTo(p.z);
  });
  it('maps game yaw to a clockwise canvas angle from north', () => {
    expect(yawToCanvasAngle(0)).toBe(0);
    // yaw +90° guarda verso +x (est): sul canvas la freccia (0,-1) ruotata in senso orario punta a destra
    const a = yawToCanvasAngle(Math.PI / 2);
    const dx = -(-1) * Math.sin(a);
    const dy = -1 * Math.cos(a);
    expect(dx).toBeCloseTo(1);
    expect(dy).toBeCloseTo(0);
  });
});

describe('glitch', () => {
  it('is exactly zero without disturbance', () => {
    expect(glitchOffset(0, 12.3, 1400)).toEqual({ x: 0, z: 0 });
    expect(glitchOffset(NaN, 1, 1400)).toEqual({ x: 0, z: 0 });
  });
  it('grows with the disturbance and stays bounded', () => {
    let maxLow = 0;
    let maxHigh = 0;
    for (let i = 0; i < 400; i++) {
      const lo = glitchOffset(0.2, i * 0.173, 1400);
      const hi = glitchOffset(1, i * 0.173, 1400);
      maxLow = Math.max(maxLow, Math.hypot(lo.x, lo.z));
      maxHigh = Math.max(maxHigh, Math.hypot(hi.x, hi.z));
    }
    expect(maxLow).toBeGreaterThan(0);
    expect(maxHigh).toBeGreaterThan(maxLow * 2);
    expect(maxHigh).toBeLessThan(1400 * 0.25);
  });
  it('drops the signal bars', () => {
    expect(effectiveSignal(4, 0)).toBe(4);
    expect(effectiveSignal(3, 0)).toBe(3);
    expect(effectiveSignal(4, 0.5)).toBe(2);
    expect(effectiveSignal(4, 1)).toBe(0);
    expect(effectiveSignal(1, 0.5)).toBe(1);
    expect(effectiveSignal(9, 0)).toBe(4);
    expect(effectiveSignal(-2, 0)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(59.9)).toBe('00:59');
    expect(formatDuration(61)).toBe('01:01');
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('00:00');
    expect(formatDuration(NaN)).toBe('00:00');
  });
});

import { placeLabels } from '../src/ui/map';
import { GameSession } from '../src/game/session';

describe('map labels and report markers', () => {
  const area = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  it('place names never overlap each other on the phone map (60 seeds)', () => {
    let squeezed = 0, total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = new GameSession({ seed: seed * 7907, lang: 'it' });
      const m = s.mapView();
      const tr = mapTransform(m.size, 600, 600, 18);
      const items = m.pois.map((p) => ({ text: p.name, ...worldToCanvas(p.pos, tr) }));
      const boxes = placeLabels(items, [], (t) => t.length * 9.5, 21, 9.4, { w: 600, h: 600 });
      const ok = boxes.filter((b): b is NonNullable<typeof b> => !!b);
      total += ok.length;
      for (let i = 0; i < ok.length; i++) {
        if (ok[i].squeezed) { squeezed++; continue; }
        for (let j = i + 1; j < ok.length; j++) if (!ok[j].squeezed) expect(area(ok[i], ok[j]), `seed ${seed * 7907}`).toBe(0);
      }
    }
    expect(squeezed / total).toBeLessThan(0.03);
  });
  it('every mission has a numbered marker that turns complete when reported', () => {
    const s = new GameSession({ seed: 4242, lang: 'it' });
    const m = s.mapView();
    expect(m.targets!.length).toBe(s.state.missions.length);
    expect(m.targets!.map((t) => t.n)).toEqual(s.state.missions.map((_, i) => i + 1));
    expect(m.targets!.every((t) => t.state === 'pending')).toBe(true);
    s.state.missions[0].state = 'reported';
    expect(s.mapView().targets![0].state).toBe('reported');
  });
  it('the navigator view follows the player', () => {
    const tr = mapTransform(300, 200, 200, 0, { x: 120, z: -80 });
    const c = worldToCanvas({ x: 120, z: -80 }, tr);
    expect(c.x).toBeCloseTo(100); expect(c.y).toBeCloseTo(100);
    expect(worldToCanvas({ x: 270, z: -80 }, tr).x).toBeCloseTo(200);
  });
});

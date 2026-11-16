// Mappa del telefono: schema cartografico disegnato su canvas 2D a partire da MapView.
// Le funzioni geometriche sono pure e testate; drawMap usa solo il contesto 2D ricevuto.
import type { MapView } from '../core/api';
import type { Vec2 } from '../core/contracts';

export interface MapTransform {
  /** pixel per metro */
  scale: number;
  /** pixel del centro del mondo (0,0) */
  cx: number;
  cy: number;
  size: number;
}

/** Trasformazione mondo→canvas: nord in alto (+z verso l'alto), est a destra, mappa quadrata centrata. */
export function mapTransform(size: number, width: number, height: number, pad = 0): MapTransform {
  const side = Math.max(1, Math.min(width, height) - pad * 2);
  const s = size > 0 ? size : 1;
  return { scale: side / s, cx: width / 2, cy: height / 2, size: s };
}

export function worldToCanvas(p: Vec2, tr: MapTransform): { x: number; y: number } {
  return { x: tr.cx + p.x * tr.scale, y: tr.cy - p.z * tr.scale };
}

export function canvasToWorld(x: number, y: number, tr: MapTransform): Vec2 {
  return { x: (x - tr.cx) / tr.scale, z: (tr.cy - y) / tr.scale };
}

/** Angolo di rotazione sul canvas (orario, 0 = verso l'alto) per uno yaw di gioco (0 = +z, positivo verso +x). */
export function yawToCanvasAngle(yaw: number): number {
  return yaw;
}

/**
 * Scostamento (in metri) del segnaposto del giocatore quando il segnale è disturbato.
 * Deriva lenta più tremolio rapido, entrambi proporzionali a `glitch`; zero quando glitch è 0.
 */
export function glitchOffset(glitch: number, timeSec: number, size: number): Vec2 {
  const g = Math.min(1, Math.max(0, Number.isFinite(glitch) ? glitch : 0));
  if (g === 0) return { x: 0, z: 0 };
  const drift = size * 0.09 * g;
  const jitter = size * 0.012 * g;
  const step = Math.floor(timeSec * 9);
  const jx = (((Math.sin(step * 127.1) * 43758.5453) % 1) + 1) % 1 - 0.5;
  const jz = (((Math.sin(step * 311.7) * 24634.6345) % 1) + 1) % 1 - 0.5;
  return {
    x: Math.sin(timeSec * 0.37) * drift + Math.sin(timeSec * 1.13 + 2) * drift * 0.35 + jx * 2 * jitter,
    z: Math.cos(timeSec * 0.29 + 1) * drift + Math.sin(timeSec * 0.83) * drift * 0.35 + jz * 2 * jitter,
  };
}

/** Tacche di segnale mostrate: calano con il disturbo di posizione. */
export function effectiveSignal(signal: number, glitch: number): number {
  const s = Math.min(4, Math.max(0, Math.round(Number.isFinite(signal) ? signal : 0)));
  const g = Math.min(1, Math.max(0, Number.isFinite(glitch) ? glitch : 0));
  return Math.max(0, Math.min(s, Math.round(4 * (1 - g))));
}

export interface MapLabels {
  car: string;
  north: string;
  /** es. "200 m" */
  scale: string;
  weak: string;
}

const PAPER = '#d6d0bd';
const INK = '#2b2a26';
const INK_SOFT = 'rgba(43,42,38,0.55)';
const WATER = '#9db4bb';
const WATER_EDGE = '#6f8a93';

function trace(ctx: CanvasRenderingContext2D, pts: Vec2[], tr: MapTransform): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = worldToCanvas(pts[i], tr);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function poiGlyph(ctx: CanvasRenderingContext2D, type: string, x: number, y: number, u: number): void {
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, u * 0.28);
  ctx.beginPath();
  switch (type) {
    case 'cabin':
    case 'town':
    case 'gas_station':
    case 'restroom':
    case 'utility':
      ctx.rect(x - u * 0.8, y - u * 0.3, u * 1.6, u * 1.1);
      ctx.moveTo(x - u * 1.05, y - u * 0.3);
      ctx.lineTo(x, y - u * 1.15);
      ctx.lineTo(x + u * 1.05, y - u * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    case 'campsite':
      ctx.moveTo(x, y - u);
      ctx.lineTo(x + u, y + u * 0.8);
      ctx.lineTo(x - u, y + u * 0.8);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'lookout':
      ctx.arc(x, y, u * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, u * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bridge':
      ctx.moveTo(x - u, y - u * 0.5);
      ctx.lineTo(x + u, y - u * 0.5);
      ctx.moveTo(x - u, y + u * 0.5);
      ctx.lineTo(x + u, y + u * 0.5);
      ctx.stroke();
      break;
    case 'car_park':
    case 'roadside':
      ctx.rect(x - u * 0.8, y - u * 0.8, u * 1.6, u * 1.6);
      ctx.stroke();
      break;
    case 'lake_dock':
      ctx.moveTo(x - u, y);
      ctx.lineTo(x + u, y);
      ctx.moveTo(x, y - u * 0.8);
      ctx.lineTo(x, y + u * 0.8);
      ctx.stroke();
      break;
    default:
      ctx.arc(x, y, u * 0.55, 0, Math.PI * 2);
      ctx.fill();
  }
}

interface Box { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Disegna la mappa. `width`/`height` sono in pixel del canvas; `timeSec` anima il disturbo.
 * Non conserva stato: può essere richiamata a ogni aggiornamento.
 */
export function drawMap(
  ctx: CanvasRenderingContext2D,
  view: MapView,
  width: number,
  height: number,
  labels: MapLabels,
  timeSec = 0,
): void {
  const u = Math.max(2.5, Math.min(width, height) / 110); // unità grafica
  const pad = u * 3;
  const tr = mapTransform(view.size, width, height, pad);
  const half = view.size / 2;
  const tl = worldToCanvas({ x: -half, z: half }, tr);
  const side = view.size * tr.scale;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  // area della mappa e reticolo ogni 100 m
  ctx.save();
  ctx.beginPath();
  ctx.rect(tl.x, tl.y, side, side);
  ctx.clip();
  ctx.fillStyle = '#dcd7c6';
  ctx.fillRect(tl.x, tl.y, side, side);
  ctx.strokeStyle = 'rgba(43,42,38,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let m = -Math.floor(half / 100) * 100; m <= half; m += 100) {
    const a = worldToCanvas({ x: m, z: -half }, tr);
    const b = worldToCanvas({ x: -half, z: m }, tr);
    ctx.moveTo(Math.round(a.x) + 0.5, tl.y);
    ctx.lineTo(Math.round(a.x) + 0.5, tl.y + side);
    ctx.moveTo(tl.x, Math.round(b.y) + 0.5);
    ctx.lineTo(tl.x + side, Math.round(b.y) + 0.5);
  }
  ctx.stroke();

  // acqua
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view.river && view.river.length > 1) {
    trace(ctx, view.river, tr);
    ctx.strokeStyle = WATER_EDGE;
    ctx.lineWidth = u * 2.1;
    ctx.stroke();
    trace(ctx, view.river, tr);
    ctx.strokeStyle = WATER;
    ctx.lineWidth = u * 1.5;
    ctx.stroke();
  }
  if (view.lake) {
    const c = worldToCanvas(view.lake.center, tr);
    ctx.beginPath();
    ctx.arc(c.x, c.y, view.lake.radius * tr.scale, 0, Math.PI * 2);
    ctx.fillStyle = WATER;
    ctx.fill();
    ctx.strokeStyle = WATER_EDGE;
    ctx.lineWidth = Math.max(1, u * 0.3);
    ctx.stroke();
  }

  // sentieri (tratteggiati) e strade (doppia linea)
  for (const e of view.edges) {
    if (e.kind !== 'trail' || e.points.length < 2) continue;
    trace(ctx, e.points, tr);
    ctx.setLineDash([u * 1.3, u * 1.1]);
    ctx.strokeStyle = '#6b5a45';
    ctx.lineWidth = Math.max(1, u * 0.42);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const pass of [0, 1]) {
    for (const e of view.edges) {
      if (e.kind !== 'road' || e.points.length < 2) continue;
      trace(ctx, e.points, tr);
      ctx.strokeStyle = pass === 0 ? '#4a4842' : '#efeadb';
      ctx.lineWidth = pass === 0 ? u * 1.35 : u * 0.75;
      ctx.stroke();
    }
  }
  ctx.restore();

  // cornice
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(tl.x) + 0.5, Math.round(tl.y) + 0.5, Math.round(side) - 1, Math.round(side) - 1);

  // auto
  const car = worldToCanvas(view.car, tr);
  ctx.fillStyle = '#31506b';
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = Math.max(1, u * 0.3);
  ctx.beginPath();
  ctx.rect(car.x - u * 1.25, car.y - u * 0.8, u * 2.5, u * 1.6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#dfe6ea';
  ctx.fillRect(car.x - u * 0.55, car.y - u * 0.45, u * 1.1, u * 0.9);

  // POI ed etichette con posizionamento che evita sovrapposizioni
  const fontPx = Math.max(9, Math.round(u * 3.1));
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const placed: Box[] = [{ x: car.x - u * 1.6, y: car.y - u * 1.2, w: u * 3.2, h: u * 2.4 }];
  const items: { name: string; x: number; y: number }[] = [];
  for (const p of view.pois) {
    const c = worldToCanvas(p.pos, tr);
    const nearCar = Math.hypot(c.x - car.x, c.y - car.y) < u * 2.5;
    if (!nearCar) {
      poiGlyph(ctx, p.type, c.x, c.y, u);
      placed.push({ x: c.x - u * 1.2, y: c.y - u * 1.3, w: u * 2.4, h: u * 2.6 });
    }
    items.push({ name: p.name, x: c.x, y: c.y });
  }
  items.push({ name: labels.car, x: car.x, y: car.y + u * 0.2 });
  for (const it of items) {
    if (!it.name) continue;
    const w = ctx.measureText(it.name).width;
    const hgt = fontPx * 1.15;
    const gap = u * 1.7;
    const cands: Box[] = [
      { x: it.x - w / 2, y: it.y + gap, w, h: hgt },
      { x: it.x - w / 2, y: it.y - gap - hgt, w, h: hgt },
      { x: it.x + gap, y: it.y - hgt / 2, w, h: hgt },
      { x: it.x - gap - w, y: it.y - hgt / 2, w, h: hgt },
    ];
    let best: Box | null = null;
    for (const c of cands) {
      c.x = Math.min(Math.max(c.x, 2), width - w - 2);
      c.y = Math.min(Math.max(c.y, 2), height - hgt - 2);
      if (!placed.some((b) => overlaps(b, c))) { best = c; break; }
    }
    if (!best) best = cands[0];
    placed.push(best);
    ctx.lineWidth = Math.max(2, fontPx * 0.3);
    ctx.strokeStyle = 'rgba(220,215,198,0.92)';
    ctx.lineJoin = 'round';
    ctx.strokeText(it.name, best.x, best.y + hgt / 2);
    ctx.fillStyle = INK;
    ctx.fillText(it.name, best.x, best.y + hgt / 2);
  }

  // giocatore: freccia orientata; con disturbo il segnaposto deriva e compare l'alone d'incertezza
  const g = Math.min(1, Math.max(0, view.glitch || 0));
  const off = glitchOffset(g, timeSec, view.size);
  const pl = worldToCanvas({ x: view.player.pos.x + off.x, z: view.player.pos.z + off.z }, tr);
  if (g > 0) {
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, u * (3 + g * 14), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(160,52,40,${0.07 + g * 0.08})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(160,52,40,${0.25 + g * 0.2})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(pl.x, pl.y);
  ctx.rotate(yawToCanvasAngle(view.player.yaw) + (g > 0 ? Math.sin(timeSec * 7.3) * g * 0.9 : 0));
  ctx.beginPath();
  ctx.moveTo(0, -u * 3.2);
  ctx.lineTo(u * 2.1, u * 2.4);
  ctx.lineTo(0, u * 1.1);
  ctx.lineTo(-u * 2.1, u * 2.4);
  ctx.closePath();
  ctx.fillStyle = '#a03428';
  ctx.fill();
  ctx.strokeStyle = '#f4efe2';
  ctx.lineWidth = Math.max(1, u * 0.35);
  ctx.stroke();
  ctx.restore();

  // nord e scala
  const nx = width - pad - u * 2.2;
  const ny = pad + u * 4.2;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(nx, ny - u * 2.6);
  ctx.lineTo(nx + u * 1.1, ny + u * 0.6);
  ctx.lineTo(nx, ny);
  ctx.lineTo(nx - u * 1.1, ny + u * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(220,215,198,0.92)';
  ctx.lineWidth = Math.max(2, fontPx * 0.3);
  ctx.strokeText(labels.north, nx, ny + u * 2.4);
  ctx.fillText(labels.north, nx, ny + u * 2.4);

  const barM = 200;
  const bx = pad + u * 1.5;
  const by = height - pad - u * 1.8;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, u * 0.35);
  ctx.beginPath();
  ctx.moveTo(bx, by - u * 0.8);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + barM * tr.scale, by);
  ctx.lineTo(bx + barM * tr.scale, by - u * 0.8);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(220,215,198,0.92)';
  ctx.lineWidth = Math.max(2, fontPx * 0.3);
  ctx.strokeText(labels.scale, bx + u * 0.8, by - u * 2);
  ctx.fillStyle = INK;
  ctx.fillText(labels.scale, bx + u * 0.8, by - u * 2);

  if (g > 0.15) {
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(220,215,198,0.92)';
    ctx.strokeText(labels.weak, width / 2, pad + u * 2.2);
    ctx.fillStyle = '#7c2a20';
    ctx.fillText(labels.weak, width / 2, pad + u * 2.2);
  }
  ctx.restore();
}

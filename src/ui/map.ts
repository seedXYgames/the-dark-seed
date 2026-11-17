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

/** Trasformazione mondo→canvas: nord in alto (+z verso l'alto), est a destra, mappa quadrata centrata.
 *  Con `center` la vista segue quel punto (navigatore): `size` è allora il lato inquadrato in metri. */
export function mapTransform(size: number, width: number, height: number, pad = 0, center?: Vec2): MapTransform {
  const side = Math.max(1, Math.min(width, height) - pad * 2);
  const s = size > 0 ? size : 1;
  const scale = side / s;
  return { scale, cx: width / 2 - (center ? center.x * scale : 0), cy: height / 2 + (center ? center.z * scale : 0), size: s };
}

export interface LabelBox { x: number; y: number; w: number; h: number }
const overlapArea = (a: LabelBox, b: LabelBox) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Posiziona le etichette attorno ai loro punti senza sovrapporle tra loro né agli ostacoli (simboli, auto, giocatore).
 * Prova 8 direzioni a due distanze; se nessuna è libera prende quella che copre meno e la segnala come `squeezed`
 * (va disegnata più piccola). Pura: misura il testo tramite `measure`.
 */
export function placeLabels(
  items: { text: string; x: number; y: number }[], obstacles: LabelBox[], measure: (text: string) => number,
  lineH: number, gap: number, bounds: { w: number; h: number },
): ({ x: number; y: number; w: number; h: number; squeezed: boolean } | null)[] {
  const placed = obstacles.slice();
  // prima i punti più affollati: hanno meno posti liberi
  const crowd = items.map((it, i) => ({ i, n: items.reduce((k, o) => k + (Math.hypot(o.x - it.x, o.y - it.y) < gap * 8 ? 1 : 0), 0) }));
  crowd.sort((a, b) => b.n - a.n || a.i - b.i);
  const out: ({ x: number; y: number; w: number; h: number; squeezed: boolean } | null)[] = items.map(() => null);
  for (const { i } of crowd) {
    const it = items[i];
    if (!it.text) continue;
    const w = measure(it.text), h = lineH;
    let best: LabelBox | null = null, bestCost = Infinity;
    for (const k of [1, 1.9]) {
      const g = gap * k, d = g * 0.72;
      const cands: LabelBox[] = [
        { x: it.x - w / 2, y: it.y + g, w, h }, { x: it.x - w / 2, y: it.y - g - h, w, h },
        { x: it.x + g, y: it.y - h / 2, w, h }, { x: it.x - g - w, y: it.y - h / 2, w, h },
        { x: it.x + d, y: it.y + d * 0.6, w, h }, { x: it.x - d - w, y: it.y + d * 0.6, w, h },
        { x: it.x + d, y: it.y - d * 0.6 - h, w, h }, { x: it.x - d - w, y: it.y - d * 0.6 - h, w, h },
      ];
      for (const c of cands) {
        c.x = Math.min(Math.max(c.x, 2), bounds.w - w - 2);
        c.y = Math.min(Math.max(c.y, 2), bounds.h - h - 2);
        let cost = 0;
        for (const b of placed) cost += overlapArea(b, c);
        cost += Math.hypot(c.x + w / 2 - it.x, c.y + h / 2 - it.y) * 0.01; // a parità, la più vicina
        if (cost < bestCost) { bestCost = cost; best = c; }
      }
      if (bestCost < 1) break;
    }
    if (!best) continue;
    const squeezed = bestCost >= 1;
    placed.push(best);
    out[i] = { ...best, squeezed };
  }
  return out;
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

type Box = LabelBox;

/** Segnalino a goccia di un rapporto: rosso da fare, ambra da inviare, verde con spunta se completato. */
function targetPin(ctx: CanvasRenderingContext2D, state: 'pending' | 'inspected' | 'reported', n: number, x: number, y: number, u: number): void {
  const r = u * 1.75, top = y - u * 4.6;
  const col = state === 'reported' ? '#3f7d4a' : state === 'inspected' ? '#c98a1c' : '#b3352a';
  ctx.save();
  ctx.globalAlpha = state === 'reported' ? 0.8 : 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - r * 0.4, y - u * 1.4, x - r, top + r * 0.9, x - r, top + r * 0.1);
  ctx.arc(x, top + r * 0.1, r, Math.PI, 0);
  ctx.bezierCurveTo(x + r, top + r * 0.9, x + r * 0.4, y - u * 1.4, x, y);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = '#f4efe2';
  ctx.lineWidth = Math.max(1, u * 0.32);
  ctx.stroke();
  const cy = top + r * 0.1;
  if (state === 'reported') {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.48, cy + r * 0.02);
    ctx.lineTo(x - r * 0.1, cy + r * 0.4);
    ctx.lineTo(x + r * 0.52, cy - r * 0.38);
    ctx.lineWidth = Math.max(1.4, u * 0.45);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#f4efe2';
    ctx.font = `700 ${Math.round(r * 1.25)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, cy + r * 0.06);
  }
  ctx.restore();
}

export interface MapOptions {
  /** Vista da navigatore: centrata sul giocatore, `span` metri di lato. */
  follow?: { span: number };
}

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
  opts: MapOptions = {},
): void {
  const follow = opts.follow;
  const u = Math.max(2.5, Math.min(width, height) / (follow ? 80 : 110)); // unità grafica
  const pad = follow ? 0 : u * 3;
  const g = Math.min(1, Math.max(0, view.glitch || 0));
  const off = glitchOffset(g, timeSec, view.size);
  const plPos = { x: view.player.pos.x + off.x, z: view.player.pos.z + off.z };
  const tr = follow ? mapTransform(follow.span, width, height, 0, plPos) : mapTransform(view.size, width, height, pad);
  const half = view.size / 2;
  const tl = worldToCanvas({ x: -half, z: half }, tr);
  const side = view.size * tr.scale;
  const onCanvas = (x: number, y: number, m = 0) => x > -m && y > -m && x < width + m && y < height + m;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = follow ? '#bdb7a5' : PAPER;
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
  const pl = worldToCanvas(plPos, tr);
  const fontPx = Math.max(9, Math.round(u * 3.1));
  const font = (px: number) => `600 ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.font = font(fontPx);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const obstacles: Box[] = [
    { x: car.x - u * 1.6, y: car.y - u * 1.2, w: u * 3.2, h: u * 2.4 },
    { x: pl.x - u * 2.6, y: pl.y - u * 3.4, w: u * 5.2, h: u * 6 },
  ];
  const items: { text: string; x: number; y: number }[] = [];
  for (const p of view.pois) {
    const c = worldToCanvas(p.pos, tr);
    if (!onCanvas(c.x, c.y, u * 4)) continue;
    const nearCar = Math.hypot(c.x - car.x, c.y - car.y) < u * 2.5;
    if (!nearCar) {
      poiGlyph(ctx, p.type, c.x, c.y, u);
      obstacles.push({ x: c.x - u * 1.2, y: c.y - u * 1.3, w: u * 2.4, h: u * 2.6 });
    }
    items.push({ text: p.name, x: c.x, y: c.y });
  }
  if (onCanvas(car.x, car.y)) items.push({ text: labels.car, x: car.x, y: car.y + u * 0.2 });
  // segnalini dei rapporti: occupano spazio anche loro
  const pins = (view.targets ?? []).map((t) => ({ t, c: worldToCanvas(t.pos, tr) }));
  for (const { c } of pins) obstacles.push({ x: c.x - u * 1.9, y: c.y - u * 6.5, w: u * 3.8, h: u * 6.5 });
  const hgt = fontPx * 1.15;
  const boxes = placeLabels(items, obstacles, (s) => ctx.measureText(s).width, hgt, u * 1.7, { w: width, h: height });
  ctx.lineJoin = 'round';
  boxes.forEach((b, i) => {
    if (!b) return;
    const px = b.squeezed ? Math.max(8, Math.round(fontPx * 0.8)) : fontPx;
    ctx.font = font(px);
    ctx.lineWidth = Math.max(2, px * 0.3);
    ctx.strokeStyle = 'rgba(220,215,198,0.92)';
    ctx.strokeText(items[i].text, b.x, b.y + hgt / 2);
    ctx.fillStyle = INK;
    ctx.fillText(items[i].text, b.x, b.y + hgt / 2);
  });
  ctx.font = font(fontPx);

  // segnalini: quelli fuori inquadratura (navigatore) diventano frecce sul bordo
  const order = pins.slice().sort((a, b) => (a.t.state === 'reported' ? 0 : 1) - (b.t.state === 'reported' ? 0 : 1));
  for (const { t, c } of order) {
    if (onCanvas(c.x, c.y, -u)) { targetPin(ctx, t.state, t.n, c.x, c.y, u); continue; }
    if (!follow || t.state === 'reported') continue;
    const dx = c.x - pl.x, dy = c.y - pl.y, k = Math.min((width / 2 - u * 3) / Math.max(1e-6, Math.abs(dx)), (height / 2 - u * 3) / Math.max(1e-6, Math.abs(dy)));
    const ex = width / 2 + dx * k, ey = height / 2 + dy * k, a = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(u * 2.2, 0); ctx.lineTo(-u * 1.2, -u * 1.6); ctx.lineTo(-u * 1.2, u * 1.6); ctx.closePath();
    ctx.fillStyle = t.state === 'inspected' ? '#c98a1c' : '#b3352a';
    ctx.fill();
    ctx.strokeStyle = '#f4efe2'; ctx.lineWidth = Math.max(1, u * 0.3); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = INK; ctx.textAlign = 'center';
    ctx.font = font(Math.round(fontPx * 0.9));
    const lx = ex - Math.cos(a) * u * 4.2, ly = ey - Math.sin(a) * u * 3.4;
    ctx.strokeStyle = 'rgba(220,215,198,0.92)'; ctx.lineWidth = Math.max(2, fontPx * 0.3);
    const label = `${t.n} · ${Math.round(Math.hypot(t.pos.x - plPos.x, t.pos.z - plPos.z))} m`;
    ctx.strokeText(label, lx, ly); ctx.fillText(label, lx, ly);
    ctx.textAlign = 'left'; ctx.font = font(fontPx);
  }

  // giocatore: freccia orientata; con disturbo il segnaposto deriva e compare l'alone d'incertezza
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
  ctx.font = font(fontPx);
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

  const barM = follow ? (follow.span > 300 ? 100 : 50) : 200;
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
  const scaleText = follow ? labels.scale.replace(/\d+/, String(barM)) : labels.scale;
  ctx.strokeText(scaleText, bx + u * 0.8, by - u * 2);
  ctx.fillStyle = INK;
  ctx.fillText(scaleText, bx + u * 0.8, by - u * 2);

  if (g > 0.15) {
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(220,215,198,0.92)';
    ctx.strokeText(labels.weak, width / 2, pad + u * 2.2);
    ctx.fillStyle = '#7c2a20';
    ctx.fillText(labels.weak, width / 2, pad + u * 2.2);
  }
  ctx.restore();
}

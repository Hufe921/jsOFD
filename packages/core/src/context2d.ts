/**
 * Canvas-like 2D rendering context (`doc.context2d`).
 *
 * Mirrors the `CanvasRenderingContext2D` subset that maps onto OFD objects:
 * paths (lines / Béziers / arcs), rects, text, images, transforms, colors and
 * alpha. Draw calls are transformed by the current matrix and emitted into the
 * page object model — the output is vector, not rasterized.
 *
 * Coordinate space: **the document's active unit** (`mm` by default) for all
 * coordinates, sizes and line widths. Font sizes follow the canvas shorthand
 * and are CSS px (1px = 0.75pt).
 *
 * Unsupported APIs (`createLinearGradient`, `getImageData`, …) throw a
 * descriptive error so ported code fails loudly instead of silently no-oping.
 */

import { parseColor } from './core/colors';
import type { PathOp } from './model';
import type { RGB } from './types';
import type { jsOFD } from './jsofd';

type Mat = [number, number, number, number, number, number]; // a b c d e f

const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Quarter-circle Bézier constant. */
const K = 0.5523;

interface CtxState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: 'left' | 'center' | 'right';
  textBaseline: 'alphabetic' | 'top' | 'middle' | 'bottom' | 'hanging';
}

/** Parse a canvas font shorthand: `[style] [weight] sizepx family`. */
function parseFont(font: string): { italic: boolean; bold: boolean; px: number; family: string } {
  const m =
    /^\s*(italic|oblique)?\s*(bold)?\s*([\d.]+)(px|pt)\s*(.*)$/.exec(font) ||
    /^\s*(italic|oblique)?\s*(bold)?\s*([\d.]+)(px|pt)\s*$/.exec(font);
  if (!m) return { italic: false, bold: false, px: 16, family: 'sans-serif' };
  return {
    italic: !!m[1],
    bold: !!m[2],
    px: parseFloat(m[3]!),
    family: (m[5] || '').trim(),
  };
}

export function createContext2d(doc: jsOFD): CanvasRenderingContext2D & { __jsofd: true } {
  type PathSeg = { pts: number[]; kind: 'M' | 'L' | 'C' };
  let matrix: Mat = IDENT.slice() as Mat;
  const stack: { matrix: Mat; state: CtxState }[] = [];
  let path: PathSeg[] = [];
  let cur: [number, number] = [0, 0];
  let lastMove: [number, number] = [0, 0];

  const state: CtxState = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };

  const unsupported = (name: string): never => {
    throw new Error(`context2d: ${name} is not supported by the OFD vector model`);
  };

  const ctx = {
    __jsofd: true as const,

    // ---- state ----
    save(): void {
      stack.push({ matrix: matrix.slice() as Mat, state: { ...state } });
    },
    restore(): void {
      const s = stack.pop();
      if (s) {
        matrix = s.matrix;
        Object.assign(state, s.state);
      }
    },
    get fillStyle(): string {
      return state.fillStyle;
    },
    set fillStyle(v: string | number | CanvasGradient | CanvasPattern) {
      if (typeof v === 'object') unsupported('gradient/pattern fill styles');
      state.fillStyle =
        typeof v === 'number' ? `#${(v as number).toString(16).padStart(6, '0')}` : String(v);
    },
    get strokeStyle(): string {
      return state.strokeStyle;
    },
    set strokeStyle(v: string | number | CanvasGradient | CanvasPattern) {
      if (typeof v === 'object') unsupported('gradient/pattern stroke styles');
      state.strokeStyle =
        typeof v === 'number' ? `#${(v as number).toString(16).padStart(6, '0')}` : String(v);
    },
    get lineWidth(): number {
      return state.lineWidth;
    },
    set lineWidth(v: number) {
      state.lineWidth = v;
    },
    get globalAlpha(): number {
      return state.globalAlpha;
    },
    set globalAlpha(v: number) {
      state.globalAlpha = Math.max(0, Math.min(1, v));
    },
    get font(): string {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    get textAlign(): string {
      return state.textAlign;
    },
    set textAlign(v: string) {
      state.textAlign = v as CtxState['textAlign'];
    },
    get textBaseline(): string {
      return state.textBaseline;
    },
    set textBaseline(v: string) {
      state.textBaseline = v as CtxState['textBaseline'];
    },

    // ---- transforms ----
    translate(x: number, y: number): void {
      matrix = mul(matrix, [1, 0, 0, 1, x, y]);
    },
    rotate(a: number): void {
      const c = Math.cos(a);
      const s = Math.sin(a);
      matrix = mul(matrix, [c, s, -s, c, 0, 0]);
    },
    scale(x: number, y: number): void {
      matrix = mul(matrix, [x, 0, 0, y, 0, 0]);
    },
    transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
      matrix = mul(matrix, [a, b, c, d, e, f]);
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
      matrix = [a, b, c, d, e, f];
    },
    resetTransform(): void {
      matrix = IDENT.slice() as Mat;
    },

    // ---- paths ----
    beginPath(): void {
      path = [];
      cur = [0, 0];
      lastMove = [0, 0];
    },
    closePath(): void {
      // Emulate by drawing back to the last move (OFD Z would close subpath).
      path.push({ kind: 'L', pts: [...lastMove] });
      cur = [...lastMove];
    },
    moveTo(x: number, y: number): void {
      const [tx, ty] = apply(matrix, x, y);
      path.push({ kind: 'M', pts: [tx, ty] });
      cur = [x, y];
      lastMove = [x, y];
    },
    lineTo(x: number, y: number): void {
      const [tx, ty] = apply(matrix, x, y);
      if (path.length === 0) path.push({ kind: 'M', pts: [tx, ty] });
      else path.push({ kind: 'L', pts: [tx, ty] });
      cur = [x, y];
    },
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
      const a1 = apply(matrix, c1x, c1y);
      const a2 = apply(matrix, c2x, c2y);
      const a3 = apply(matrix, x, y);
      if (path.length === 0) path.push({ kind: 'M', pts: a1 });
      path.push({ kind: 'C', pts: [...a1, ...a2, ...a3] });
      cur = [x, y];
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
      // Elevate the quadratic to a cubic.
      const c1x = cur[0]! + (2 / 3) * (cx - cur[0]!);
      const c1y = cur[1]! + (2 / 3) * (cy - cur[1]!);
      const c2x = x + (2 / 3) * (cx - x);
      const c2y = y + (2 / 3) * (cy - y);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
    },
    arc(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): void {
      let delta = end - start;
      if (anticlockwise) {
        while (delta > 0) delta -= Math.PI * 2;
      } else {
        while (delta < 0) delta += Math.PI * 2;
      }
      const abs = Math.abs(delta);
      if (abs < 1e-9) return;
      const steps = Math.max(1, Math.ceil(abs / (Math.PI / 2)));
      const step = delta / steps;
      let a = start;
      if (path.length === 0) {
        const t0 = apply(matrix, x + r * Math.cos(a), y + r * Math.sin(a));
        path.push({ kind: 'M', pts: t0 });
      }
      for (let i = 0; i < steps; i++) {
        // Circular-arc Bézier approximation: control points on the tangents.
        const k = (4 / 3) * Math.tan(step / 4);
        const tx1 = -Math.sin(a);
        const ty1 = Math.cos(a);
        const a3 = a + step;
        const tx3 = -Math.sin(a3);
        const ty3 = Math.cos(a3);
        const p1x = x + r * Math.cos(a);
        const p1y = y + r * Math.sin(a);
        const p3x = x + r * Math.cos(a3);
        const p3y = y + r * Math.sin(a3);
        const c1 = apply(matrix, p1x + k * r * tx1, p1y + k * r * ty1);
        const c2 = apply(matrix, p3x - k * r * tx3, p3y - k * r * ty3);
        const p3 = apply(matrix, p3x, p3y);
        path.push({ kind: 'C', pts: [...c1, ...c2, ...p3] });
        cur = [p3x, p3y];
        a = a3;
      }
    },
    ellipse(
      x: number,
      y: number,
      rx: number,
      ry: number,
      rotation: number,
      start: number,
      end: number,
      anticlockwise = false,
    ): void {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation || 0);
      ctx.scale(1, ry / (rx || 1));
      ctx.arc(0, 0, rx, start, end, anticlockwise);
      ctx.restore();
    },
    rect(x: number, y: number, w: number, h: number): void {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
    },
    roundRect(x: number, y: number, w: number, h: number, r: number | number[]): void {
      const rad = Math.min(typeof r === 'number' ? r : (r[0] ?? 0), w / 2, h / 2);
      const k = K;
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + w - rad, y);
      ctx.bezierCurveTo(x + w - rad + rad * k, y, x + w, y + rad - rad * k, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad);
      ctx.bezierCurveTo(
        x + w,
        y + h - rad + rad * k,
        x + w - rad + rad * k,
        y + h,
        x + w - rad,
        y + h,
      );
      ctx.lineTo(x + rad, y + h);
      ctx.bezierCurveTo(x + rad - rad * k, y + h, x, y + h - rad + rad * k, x, y + h - rad);
      ctx.lineTo(x, y + rad);
      ctx.bezierCurveTo(x, y + rad - rad * k, x + rad - rad * k, y, x + rad, y);
      ctx.closePath();
    },

    // ---- painting ----
    fill(path2?: Path2D): void {
      if (path2) unsupported('Path2D arguments');
      if (!path.length) return;
      doc.pages[doc.page]!.objects.push({
        t: 'path',
        ops: toOps(path, true),
        fill: true,
        stroke: false,
        fillColor: rgb(state.fillStyle),
        strokeColor: rgb(state.strokeStyle),
        lineWidth: 0,
        dash: null,
        cap: 0,
        join: 0,
        miterLimit: 0,
        opacity: state.globalAlpha < 1 ? state.globalAlpha : null,
      });
    },
    stroke(path2?: Path2D): void {
      if (path2) unsupported('Path2D arguments');
      if (!path.length) return;
      doc.pages[doc.page]!.objects.push({
        t: 'path',
        ops: toOps(path, false),
        fill: false,
        stroke: true,
        fillColor: rgb(state.fillStyle),
        strokeColor: rgb(state.strokeStyle),
        lineWidth: state.lineWidth * Math.hypot(matrix[0], matrix[1]),
        dash: null,
        cap: 0,
        join: 0,
        miterLimit: 0,
        opacity: state.globalAlpha < 1 ? state.globalAlpha : null,
      });
    },
    clip(): void {
      // OFD clip follows the path of the *last* emitted object; a standalone
      // clip has no persistent model representation — no-op by design.
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
    },
    strokeRect(x: number, y: number, w: number, h: number): void {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.stroke();
    },
    clearRect(): void {
      // Raster-only concept; ignored.
    },
    fillText(text: string, x: number, y: number): void {
      emitText(String(text), x, y, true);
    },
    strokeText(text: string, x: number, y: number): void {
      emitText(String(text), x, y, false);
    },
    measureText(text: string): TextMetrics {
      const f = parseFont(state.font);
      const sizePt = f.px * 0.75;
      const key = mapFamily(f.family);
      const w =
        doc.measure(
          String(text),
          doc.getFontDef(key),
          f.bold ? 'bold' : f.italic ? 'italic' : 'normal',
          sizePt,
          0,
        ) / doc.scaleFactor;
      return {
        width: w,
        actualBoundingBoxAscent: (sizePt * 0.8) / doc.scaleFactor,
        actualBoundingBoxDescent: (sizePt * 0.2) / doc.scaleFactor,
        fontBoundingBoxAscent: (sizePt * 0.9) / doc.scaleFactor,
        fontBoundingBoxDescent: (sizePt * 0.25) / doc.scaleFactor,
      } as TextMetrics;
    },
    drawImage(img: CanvasImageSource, dx: number, dy: number, dw?: number, dh?: number): void {
      const w = dw ?? ('width' in img ? Number((img as HTMLImageElement).width) || 0 : 0);
      const h = dh ?? ('height' in img ? Number((img as HTMLImageElement).height) || 0 : 0);
      if (!w || !h) return;
      const sx = Math.hypot(matrix[0], matrix[1]);
      const sy = Math.hypot(matrix[2], matrix[3]);
      const angle = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
      // Center of the destination rect, transformed (active units in/out).
      const [cx, cy] = apply(matrix, dx + w / 2, dy + h / 2);
      const prev = doc.opacity;
      if (state.globalAlpha < 1) doc.opacity = state.globalAlpha;
      doc.addImage(img as unknown as HTMLCanvasElement, {
        x: cx - (w * sx) / 2,
        y: cy - (h * sy) / 2,
        w: w * sx,
        h: h * sy,
        rotation: angle,
      });
      doc.opacity = prev;
    },

    // ---- intentionally unsupported raster/gradient APIs ----
    createLinearGradient: (): never => unsupported('createLinearGradient (use solid fills)'),
    createRadialGradient: (): never => unsupported('createRadialGradient (use solid fills)'),
    createPattern: (): never => unsupported('createPattern'),
    getImageData: (): never => unsupported('getImageData'),
    putImageData: (): never => unsupported('putImageData'),
    isPointInPath: (): boolean => false,
  } as unknown as CanvasRenderingContext2D & { __jsofd: true };

  function rgb(css: string): RGB {
    return parseColor([css]);
  }

  function toOps(segs: PathSeg[], close: boolean): PathOp[] {
    const ops: PathOp[] = [];
    for (const s of segs) {
      if (s.kind === 'M') ops.push({ op: 'M', x: s.pts[0]!, y: s.pts[1]! });
      else if (s.kind === 'L') ops.push({ op: 'L', x: s.pts[0]!, y: s.pts[1]! });
      else
        ops.push({
          op: 'C',
          x1: s.pts[0]!,
          y1: s.pts[1]!,
          x2: s.pts[2]!,
          y2: s.pts[3]!,
          x: s.pts[4]!,
          y: s.pts[5]!,
        });
    }
    // Merge a trailing "back to start" line into a real close.
    if (close) ops.push({ op: 'Z' });
    return ops;
  }

  function mapFamily(family: string): string {
    const f = family.toLowerCase();
    if (f.includes('song') || f.includes('宋') || f.includes('serif')) return 'simsun';
    if (f.includes('hei') || f.includes('黑')) return 'simhei';
    if (f.includes('kai') || f.includes('楷')) return 'kaiti';
    if (f.includes('fang') || f.includes('仿')) return 'fangsong';
    if (f.includes('mono')) return 'courier';
    if (f.includes('times')) return 'times';
    return 'helvetica';
  }

  function emitText(text: string, x: number, y: number, fill: boolean): void {
    const f = parseFont(state.font);
    const sizePt = f.px * 0.75;
    const sf = doc.scaleFactor;
    const angle = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
    const [tx, ty] = apply(matrix, x, y);
    const key = mapFamily(f.family);
    const def = doc.getFontDef(key);
    const ascPt = (def.ascent / 1000) * sizePt;
    const descPt = (-def.descent / 1000) * sizePt;

    // Anchor adjustments (canvas semantics) in active units, rotated by the
    // matrix angle around the anchor.
    const wU = doc.measure(text, def, f.bold ? 'bold' : 'normal', sizePt, 0) / sf;
    let ax = 0;
    if (state.textAlign === 'center') ax = -wU / 2;
    else if (state.textAlign === 'right') ax = -wU;
    let ay = 0;
    if (state.textBaseline === 'top') ay = ascPt / sf;
    else if (state.textBaseline === 'middle') ay = (ascPt - descPt) / 2 / sf;
    else if (state.textBaseline === 'bottom') ay = -descPt / sf;
    else if (state.textBaseline === 'hanging') ay = (ascPt * 0.8) / sf;

    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const anchor: [number, number] = [tx + ax * cos - ay * sin, ty + ax * sin + ay * cos];

    const prevFont = doc.activeFontKey;
    const prevStyle = doc.activeFontStyle;
    const prevColor = doc.textColor.slice() as RGB;
    doc.activeFontKey = key;
    doc.activeFontStyle = f.bold ? 'bold' : f.italic ? 'italic' : 'normal';
    doc.textColor = rgb(fill ? state.fillStyle : state.strokeStyle);
    doc.text(text, anchor[0], anchor[1], {
      angle,
      fontSize: sizePt,
      renderingMode: fill ? 'fill' : 'stroke',
      opacity: state.globalAlpha < 1 ? state.globalAlpha : undefined,
    });
    doc.activeFontKey = prevFont;
    doc.activeFontStyle = prevStyle;
    doc.textColor = prevColor;
  }

  return ctx;
}

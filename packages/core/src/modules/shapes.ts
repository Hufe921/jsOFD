/** Vector shape primitives: lines, polylines, curves and closed shapes. */

import { styleFlags } from '../core/colors';
import type { PathOp } from '../model';
import type { jsOFD } from '../jsofd';

/** Cubic-Bézier approximation constant for a quarter circle. */
const KAPPA = 0.5523;

export const ShapeApi = {
  /**
   * @internal Push a path onto the current page using the active graphics
   * state. All public shape helpers funnel through this single entry point.
   */
  _pushPath(this: jsOFD, ops: PathOp[], style?: string): jsOFD {
    const flags = styleFlags(style);
    this.pages[this.page]!.objects.push({
      t: 'path',
      ops,
      fill: flags.fill,
      stroke: flags.stroke,
      fillColor: this.fillColor.slice() as [number, number, number],
      strokeColor: this.drawColor.slice() as [number, number, number],
      lineWidth: this.lineWidth,
      dash: this.lineDash
        ? { pattern: this.lineDash.pattern.slice(), phase: this.lineDash.phase }
        : null,
      cap: this.lineCap,
      join: this.lineJoin,
      miterLimit: this.miterLimit,
      opacity: this.opacity,
    });
    return this;
  },

  /** Draw a straight line from `(x1, y1)` to `(x2, y2)`. */
  line(this: jsOFD, x1: number, y1: number, x2: number, y2: number, style?: string): jsOFD {
    return this._pushPath(
      [
        { op: 'M', x: this._u(x1), y: this._u(y1) },
        { op: 'L', x: this._u(x2), y: this._u(y2) },
      ],
      style,
    );
  },

  /**
   * Draw a polyline or curve through relative segments (jsPDF `lines`).
   *
   * The path starts with `M` at the anchor `(x, y)`. Each segment is a
   * cumulative delta relative to the current point:
   * `[dx, dy]` draws a straight line, `[x1, y1, x2, y2, x3, y3]` a cubic
   * Bézier through three delta points.
   *
   * Supports the legacy signature `lines(x, y, lines, scale, style, closed)`.
   */
  lines(
    this: jsOFD,
    linesOrX: number[][] | number,
    xOrY: number | number[][],
    yOrLines?: number | number[][],
    scale1OrStyle?: number | number[] | string,
    scale2?: number | string,
    styleOrClosed?: string | boolean,
    _closedArg?: boolean,
  ): jsOFD {
    let segs: number[][];
    let x: number;
    let y: number;
    let s1 = 1;
    let s2 = 1;
    let style: string | undefined;
    let closed: boolean;
    if (typeof linesOrX === 'number') {
      // Legacy signature: lines(x, y, lines, scale, style, closed)
      segs = yOrLines as number[][];
      x = linesOrX;
      y = Number(xOrY);
      const sc = scale1OrStyle;
      if (Array.isArray(sc)) {
        s1 = Number(sc[0]) || 1;
        s2 = Number(sc[1]) || 1;
      } else if (typeof sc === 'number') {
        s1 = sc;
        s2 = typeof scale2 === 'number' ? scale2 : sc;
      }
      style = typeof scale2 === 'string' ? scale2 : undefined;
      closed = Boolean(styleOrClosed);
    } else {
      segs = linesOrX;
      x = Number(xOrY);
      y = Number(yOrLines);
      const sc = scale1OrStyle;
      if (Array.isArray(sc)) {
        s1 = Number(sc[0]) || 1;
        s2 = Number(sc[1]) || 1;
      } else {
        s1 = typeof sc === 'number' ? sc : 1;
        s2 = typeof scale2 === 'number' ? scale2 : s1;
      }
      style = typeof scale2 === 'string' ? scale2 : undefined;
      closed = Boolean(styleOrClosed);
    }
    const cx = this._u(x);
    const cy = this._u(y);
    const sf = this.scaleFactor;
    const ops: PathOp[] = [{ op: 'M', x: cx, y: cy }];
    let curX = cx;
    let curY = cy;
    for (const seg of segs) {
      if (seg.length === 2) {
        curX += seg[0]! * sf * s1;
        curY += seg[1]! * sf * s2;
        ops.push({ op: 'L', x: curX, y: curY });
      } else if (seg.length === 6) {
        ops.push({
          op: 'C',
          x1: curX + seg[0]! * sf * s1,
          y1: curY + seg[1]! * sf * s2,
          x2: curX + seg[2]! * sf * s1,
          y2: curY + seg[3]! * sf * s2,
          x: curX + seg[4]! * sf * s1,
          y: curY + seg[5]! * sf * s2,
        });
        curX += seg[4]! * sf * s1;
        curY += seg[5]! * sf * s2;
      }
    }
    if (closed) ops.push({ op: 'Z' });
    return this._pushPath(ops, style);
  },

  /** Draw a triangle through three vertices. */
  triangle(
    this: jsOFD,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    style?: string,
  ): jsOFD {
    return this._pushPath(
      [
        { op: 'M', x: this._u(x1), y: this._u(y1) },
        { op: 'L', x: this._u(x2), y: this._u(y2) },
        { op: 'L', x: this._u(x3), y: this._u(y3) },
        { op: 'Z' },
      ],
      style,
    );
  },

  /** Draw a rectangle; `(x, y)` is the top-left corner. */
  rect(this: jsOFD, x: number, y: number, w: number, h: number, style?: string): jsOFD {
    const X = this._u(x);
    const Y = this._u(y);
    const W = this._u(w);
    const H = this._u(h);
    return this._pushPath(
      [
        { op: 'M', x: X, y: Y },
        { op: 'L', x: X + W, y: Y },
        { op: 'L', x: X + W, y: Y + H },
        { op: 'L', x: X, y: Y + H },
        { op: 'Z' },
      ],
      style,
    );
  },

  /**
   * Draw a rounded rectangle; `(x, y)` is the top-left corner.
   *
   * `ry` defaults to `rx`. Corners are quarter circles approximated with
   * cubic Béziers (κ = 0.5523).
   */
  roundedRect(
    this: jsOFD,
    x: number,
    y: number,
    w: number,
    h: number,
    rx: number,
    ry?: number,
    style?: string,
  ): jsOFD {
    const X = this._u(x);
    const Y = this._u(y);
    const W = this._u(w);
    const H = this._u(h);
    const RX = Math.min(this._u(rx), W / 2);
    const RY = Math.min(ry === undefined ? this._u(rx) : this._u(ry), H / 2);
    const k = KAPPA;
    return this._pushPath(
      [
        { op: 'M', x: X + RX, y: Y },
        { op: 'L', x: X + W - RX, y: Y },
        {
          op: 'C',
          x1: X + W - RX + RX * k,
          y1: Y,
          x2: X + W,
          y2: Y + RY - RY * k,
          x: X + W,
          y: Y + RY,
        },
        { op: 'L', x: X + W, y: Y + H - RY },
        {
          op: 'C',
          x1: X + W,
          y1: Y + H - RY + RY * k,
          x2: X + W - RX + RX * k,
          y2: Y + H,
          x: X + W - RX,
          y: Y + H,
        },
        { op: 'L', x: X + RX, y: Y + H },
        {
          op: 'C',
          x1: X + RX - RX * k,
          y1: Y + H,
          x2: X,
          y2: Y + H - RY + RY * k,
          x: X,
          y: Y + H - RY,
        },
        { op: 'L', x: X, y: Y + RY },
        {
          op: 'C',
          x1: X,
          y1: Y + RY - RY * k,
          x2: X + RX - RX * k,
          y2: Y,
          x: X + RX,
          y: Y,
        },
        { op: 'Z' },
      ],
      style,
    );
  },

  /** Draw an ellipse centered at `(x, y)`. */
  ellipse(this: jsOFD, x: number, y: number, rx: number, ry: number, style?: string): jsOFD {
    const cx = this._u(x);
    const cy = this._u(y);
    const RX = this._u(rx);
    const RY = this._u(ry);
    const k = KAPPA;
    return this._pushPath(
      [
        { op: 'M', x: cx - RX, y: cy },
        {
          op: 'C',
          x1: cx - RX,
          y1: cy - RY * k,
          x2: cx - RX * k,
          y2: cy - RY,
          x: cx,
          y: cy - RY,
        },
        {
          op: 'C',
          x1: cx + RX * k,
          y1: cy - RY,
          x2: cx + RX,
          y2: cy - RY * k,
          x: cx + RX,
          y: cy,
        },
        {
          op: 'C',
          x1: cx + RX,
          y1: cy + RY * k,
          x2: cx + RX * k,
          y2: cy + RY,
          x: cx,
          y: cy + RY,
        },
        {
          op: 'C',
          x1: cx - RX * k,
          y1: cy + RY,
          x2: cx - RX,
          y2: cy + RY * k,
          x: cx - RX,
          y: cy,
        },
        { op: 'Z' },
      ],
      style,
    );
  },

  /** Draw a circle centered at `(x, y)` with radius `r`. */
  circle(this: jsOFD, x: number, y: number, r: number, style?: string): jsOFD {
    return this.ellipse(x, y, r, r, style);
  },
};

export type ShapeApi = typeof ShapeApi;

// Declaration merging attaches the mixin's members to jsOFD.

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends ShapeApi {}
}

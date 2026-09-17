/**
 * Visual annotations: highlight, underline, strikeout, squiggly, freehand
 * ink, free text and stamp-like boxes.
 *
 * They are emitted as ordinary page objects (translucent fills, strokes,
 * text), so every OFD reader renders them without needing the optional
 * annotation sidecar of the standard.
 */

import type { RGB } from '../types';
import type { jsOFD } from '../jsofd';

export type AnnotationType =
  'highlight' | 'underline' | 'strikeout' | 'squiggly' | 'ink' | 'freetext' | 'box';

export interface AnnotationOptions {
  /** Annotation color (default per type) */
  color?: RGB;
  /** Opacity 0-1 (default 0.35 for highlight, 1 otherwise) */
  opacity?: number;
  /** Line thickness (active unit, default 0.6) */
  lineWidth?: number;
  /** Font size in pt for freetext (default 11) */
  fontSize?: number;
  /** Font key for freetext (default: current font) */
  fontKey?: string;
  /** Text for freetext */
  text?: string;
  /** Fill color for box (default: transparent — stroke only) */
  fill?: RGB;
  /** Freehand point list for `ink` (active units) */
  points?: [number, number][];
}

export const AnnotationVisualApi = {
  /**
   * Draw a visual annotation over the rectangle `(x, y, w, h)` and return the
   * doc for chaining.
   *
   * - `highlight`  translucent marker behind/over text (default yellow)
   * - `underline`  straight line at the bottom edge
   * - `strikeout`  line through the vertical middle
   * - `squiggly`   hand-drawn style zigzag along the bottom edge
   * - `box`        rectangle outline (optionally filled via `options.fill`)
   * - `ink`        `options.points` as a freehand polyline (`[[x,y],…]`)
   * - `freetext`   `options.text` wrapped inside the rectangle
   */
  addAnnotation(
    this: jsOFD,
    type: AnnotationType,
    x: number,
    y: number,
    w: number,
    h: number,
    options: AnnotationOptions = {},
  ): jsOFD {
    const lw = options.lineWidth ?? 0.6;
    const prevLw = this.lineWidth;
    const prevDraw = this.drawColor.slice() as RGB;
    const prevFill = this.fillColor.slice() as RGB;
    const prevOpacity = this.opacity;
    const prevFontKey = this.activeFontKey;
    const prevFontStyle = this.activeFontStyle;
    const prevFontSize = this.fontSize;
    const prevText = this.textColor.slice() as RGB;

    const setDraw = (c: RGB): void => {
      this.drawColor = c;
      this.lineWidth = lw;
    };

    switch (type) {
      case 'highlight': {
        this.fillColor = options.color ?? [255, 221, 40];
        this.opacity = options.opacity ?? 0.35;
        this.rect(x, y, w, h, 'F');
        break;
      }
      case 'underline': {
        setDraw(options.color ?? [224, 62, 62]);
        this.opacity = options.opacity ?? 1;
        this.line(x, y + h, x + w, y + h, 'S');
        break;
      }
      case 'strikeout': {
        setDraw(options.color ?? [224, 62, 62]);
        this.opacity = options.opacity ?? 1;
        this.line(x, y + h / 2, x + w, y + h / 2, 'S');
        break;
      }
      case 'squiggly': {
        setDraw(options.color ?? [224, 62, 62]);
        this.opacity = options.opacity ?? 1;
        const seg = Math.max(w / 12, 1.2);
        const amp = Math.max(lw * 1.2, 0.5);
        const steps = Math.max(2, Math.round(w / seg));
        const s = seg * 1;
        const yy = y + h;
        for (let i = 0; i < steps; i++) {
          const x1 = x + i * s;
          const x2 = Math.min(x1 + s, x + w);
          const mid = (x1 + x2) / 2;
          const up = i % 2 === 0 ? -amp : amp;
          this.lines(
            [
              [mid - x1, up],
              [x2 - mid, -up],
            ],
            x1,
            yy,
            1,
            'S',
          );
        }
        break;
      }
      case 'box': {
        if (options.fill) {
          this.fillColor = options.fill;
          this.opacity = options.opacity ?? 1;
          this.rect(x, y, w, h, 'F');
        }
        setDraw(options.color ?? [53, 101, 224]);
        this.rect(x, y, w, h, 'S');
        break;
      }
      case 'ink': {
        const pts = options.points;
        if (!pts || pts.length < 2)
          throw new Error("addAnnotation('ink'): options.points required");
        setDraw(options.color ?? [31, 41, 55]);
        this.opacity = options.opacity ?? 1;
        let cx = pts[0]![0];
        let cy = pts[0]![1];
        const segs: number[][] = [];
        for (let i = 1; i < pts.length; i++) {
          segs.push([pts[i]![0] - cx, pts[i]![1] - cy]);
          cx = pts[i]![0];
          cy = pts[i]![1];
        }
        this.lines(segs, pts[0]![0], pts[0]![1], 1, 'S');
        break;
      }
      case 'freetext': {
        if (!options.text) throw new Error("addAnnotation('freetext'): options.text required");
        if (options.fill) {
          this.fillColor = options.fill;
          this.opacity = options.opacity ?? 1;
          this.rect(x, y, w, h, 'F');
        }
        if (options.fontKey) this.setFont(options.fontKey);
        this.setFontSize(options.fontSize ?? 11);
        this.textColor = options.color ?? [224, 62, 62];
        this.text(options.text, x + 1, y + ((options.fontSize ?? 11) * 0.9) / this.scaleFactor, {
          maxWidth: w - 2,
        });
        break;
      }
      default:
        throw new Error('addAnnotation: unknown type ' + String(type));
    }

    this.lineWidth = prevLw;
    this.drawColor = prevDraw;
    this.fillColor = prevFill;
    this.opacity = prevOpacity;
    this.activeFontKey = prevFontKey;
    this.activeFontStyle = prevFontStyle;
    this.fontSize = prevFontSize;
    this.textColor = prevText;
    return this;
  },
};

export type AnnotationVisualApi = typeof AnnotationVisualApi;

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends AnnotationVisualApi {}
}

/**
 * Watermarks: text or image stamps applied to pages (15.2.4).
 *
 * Two placements — a single centred stamp or a tiled grid — rendered as
 * ordinary page objects (rotated translucent text / images) either above or
 * below the existing content ("over" appends, "under" prepends the page's
 * object list).
 */

import type { jsOFD } from '../jsofd';
import type { ImageRun, PathRun, TextRun } from '../model';
import type { RGB } from '../types';
import { sniffImage } from '../image';
import { glyphWidth } from '../metrics';

export interface WatermarkOptions {
  /** Text watermark content (type "text"). Rendered with the named font. */
  text?: string;
  /** Image watermark bytes (type "image"). PNG/JPEG recommended (alpha). */
  image?: Uint8Array;
  /** Image format when `image` is used (default sniffed). */
  imageFormat?: 'PNG' | 'JPEG';
  /** Font registry key for text watermarks (default the active font). */
  fontKey?: string;
  /** Text size in points (default 48). */
  fontSize?: number;
  /** Text colour (default light grey). */
  color?: RGB;
  /** Opacity 0–1 (default 0.15). */
  opacity?: number;
  /** Rotation in degrees, clockwise (default 45). */
  angle?: number;
  /** 'center' places one stamp per page; 'tile' fills the page (default center). */
  mode?: 'center' | 'tile';
  /** Tiling pitch in points (default 1.6 × fontSize). */
  tile?: { dx?: number; dy?: number };
  /** Which pages receive the watermark (default 'all'). */
  pages?: 'all' | 'current' | number[];
  /** Draw above (default) or below the existing page content. */
  layer?: 'over' | 'under';
  /** Image stamp width in points; height follows the pixel aspect (default 40% page width). */
  imageWidth?: number;
}

export interface WatermarkApi {
  /**
   * Add a text or image watermark to pages. Returns the number of pages stamped.
   *
   * @example
   * doc.addWatermark({ text: '绝密', opacity: 0.12 });
   * doc.addWatermark({ image: pngBytes, mode: 'tile', pages: [1] });
   */
  addWatermark(this: jsOFD, options: WatermarkOptions | string): number;
}

function resolvePages(this: jsOFD, sel: WatermarkOptions['pages']): number[] {
  if (typeof sel === 'number') return [sel - 1];
  if (Array.isArray(sel)) return sel.map((n) => n - 1);
  if (sel === 'current') return [this.page];
  return this.pages.map((_, i) => i);
}

function textWidthPt(
  this: jsOFD,
  text: string,
  fontKey: string,
  style: 'normal',
  size: number,
): number {
  const def = this.getFontDef(fontKey);
  let w = 0;
  for (const ch of text) w += (glyphWidth(def, style, ch) / 1000) * size;
  return w;
}

export const WatermarkApi = {
  addWatermark(this: jsOFD, options: WatermarkOptions | string): number {
    const o: WatermarkOptions = typeof options === 'string' ? { text: options } : options;
    const type = o.image ? 'image' : 'text';
    const text = (o.text ?? '').toString();
    const fontKey = o.fontKey ?? this.activeFontKey ?? 'simsun';
    const fontSize = o.fontSize ?? 48;
    const color: RGB = o.color ?? [176, 176, 176];
    const opacity = o.opacity ?? 0.15;
    const angle = o.angle ?? 45;
    const mode = o.mode ?? 'center';
    const layer = o.layer ?? 'over';
    const rad = (angle * Math.PI) / 180;
    const targets = resolvePages.call(this, o.pages);
    let stamped = 0;

    for (const idx of targets) {
      const page = this.pages[idx];
      if (!page) continue;
      const created: (TextRun | PathRun | ImageRun)[] = [];

      if (type === 'image' && o.image) {
        const info = sniffImage(o.image) ?? { format: undefined, ext: 'png', width: 1, height: 1 };
        const pw = ptWidth(page);
        const ph = ptHeight(page);
        const w = o.imageWidth ?? pw * 0.4;
        const h = info.width && info.height ? (w * info.height) / info.width : w;
        const stamp = (x: number, y: number): void => {
          created.push({
            t: 'image',
            x,
            y,
            w,
            h,
            imageRef: {
              alias: `wm${created.length}`,
              resId: 0,
              data: o.image!,
              format: o.imageFormat ?? info.format ?? 'PNG',
              ext: (info?.ext ?? 'png') as string,
              width: info.width,
              height: info.height,
            },
            angle,
            opacity,
          });
        };
        if (mode === 'tile') {
          const dx = o.tile?.dx ?? w * 1.6;
          const dy = o.tile?.dy ?? h * 2.2;
          for (let y = -h; y < ph; y += dy) {
            for (let x = -w; x < pw; x += dx) stamp(x, y);
          }
        } else {
          stamp((pw - w) / 2, (ph - h) / 2);
        }
      } else if (text) {
        const style = 'normal' as const;
        const wPt = textWidthPt.call(this, text, fontKey, style, fontSize);
        const pw = ptWidth(page);
        const ph = ptHeight(page);
        const stamp = (cx: number, cy: number): void => {
          // Baseline origin so the rotated text centres on (cx, cy):
          // rotate the half-extent vector by the angle.
          const hx = (wPt / 2) * Math.cos(rad);
          const hy = (wPt / 2) * Math.sin(rad);
          created.push({
            t: 'text',
            x: cx - hx,
            y: cy - hy,
            text,
            size: fontSize,
            fontKey,
            style,
            color,
            charSpace: 0,
            angle,
            ascent: fontSize * 0.8,
            descent: fontSize * 0.2,
            renderingMode: 'fill',
            opacity,
            justifyWidth: null,
            hScale: 1,
          });
        };
        if (mode === 'tile') {
          const dx = o.tile?.dx ?? fontSize * 3;
          const dy = o.tile?.dy ?? fontSize * 3;
          for (let y = fontSize; y < ph + fontSize; y += dy) {
            for (let x = -wPt; x < pw; x += dx) stamp(x + wPt / 2, y);
          }
        } else {
          stamp(pw / 2, ph / 2);
        }
      }

      if (created.length) {
        if (layer === 'under') page.objects.unshift(...created);
        else page.objects.push(...created);
        stamped++;
      }
    }
    return stamped;
  },
};

function ptWidth(page: { width: number }): number {
  return page.width; // pages are stored in pt when created via the public API
}
function ptHeight(page: { height: number }): number {
  return page.height;
}

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends WatermarkApi {}
}

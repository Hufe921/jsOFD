/**
 * `doc.svg()` — embed an SVG by rasterizing it through the browser canvas.
 *
 * The SVG is loaded into an `Image` via a blob URL, drawn to a canvas at a
 * 2× device scale for crispness, and embedded as PNG. Requires a browser
 * (jsPDF's `addSvgAsImage` has the same constraint); Node throws a clear
 * error suggesting pre-rasterized bytes via `addImage`.
 */

import type { jsOFD } from '../jsofd';

export interface SvgOptions {
  x: number;
  y: number;
  /** Width (active unit); defaults to the intrinsic size at 72dpi */
  w?: number;
  /** Height (active unit); defaults to w scaled by the viewBox ratio */
  h?: number;
  /** Raster scale factor (default 2 — retina-crisp) */
  scale?: number;
  rotation?: number;
  opacity?: number;
  /** Background color painted behind transparent areas (CSS color) */
  background?: string;
}

async function svgToPng(
  svg: string,
  widthPx: number,
  heightPx: number,
  scale: number,
  background?: string,
): Promise<Uint8Array> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg(): failed to parse the SVG markup'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthPx * scale));
    canvas.height = Math.max(1, Math.round(heightPx * scale));
    const g = canvas.getContext('2d')!;
    if (background) {
      g.fillStyle = background;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob2: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob2) throw new Error('svg(): canvas.toBlob returned null');
    return new Uint8Array(await blob2.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Pull an intrinsic pixel size out of the SVG root (width/height/viewBox). */
function intrinsicSize(svg: string): { w: number; h: number } | null {
  const root = /<svg\b([^>]*)>/i.exec(svg);
  if (!root) return null;
  const attrs = root[1]!;
  const num = (re: RegExp): number | null => {
    const m = re.exec(attrs);
    return m ? parseFloat(m[1]!) : null;
  };
  let w = num(/\bwidth\s*=\s*["']([\d.]+)/i);
  let h = num(/\bheight\s*=\s*["']([\d.]+)/i);
  const vb = /\bviewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)/i.exec(attrs);
  if (vb) {
    if (!w) w = parseFloat(vb[1]!);
    if (!h) h = parseFloat(vb[2]!);
  }
  return w && h ? { w, h } : null;
}

export const SvgApi = {
  /**
   * Rasterize an SVG markup string and embed it as a PNG image.
   *
   * Browser only (uses `Image` + canvas). The SVG is rendered at `scale`
   * (default 2×) for crisp output. Use `addImage` when you already have
   * raster bytes.
   */
  async svg(this: jsOFD, svgMarkup: string, options: SvgOptions): Promise<void> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      throw new Error(
        'svg() requires a browser (Image + canvas). In Node, rasterize first and pass bytes to addImage().',
      );
    }
    const size = intrinsicSize(svgMarkup) ?? { w: 300, h: 150 };
    const wPx = options.w !== undefined ? options.w * this.scaleFactor : size.w;
    const hPx = options.h !== undefined ? options.h * this.scaleFactor : (wPx * size.h) / size.w;
    const png = await svgToPng(svgMarkup, wPx, hPx, options.scale ?? 2, options.background);
    const wU = options.w ?? wPx / this.scaleFactor;
    const hU = options.h ?? hPx / this.scaleFactor;
    this.addImage(png, {
      x: options.x,
      y: options.y,
      w: wU,
      h: hU,
      format: 'PNG',
      rotation: options.rotation,
      opacity: options.opacity,
    });
  },
};

export type SvgApi = typeof SvgApi;

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends SvgApi {}
}

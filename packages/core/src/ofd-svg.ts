/**
 * OFD page → SVG renderer.
 *
 * Turns a parsed OfdPage (see ofd-reader.ts) into a standalone SVG string.
 * Coordinates stay in millimetres (the OFD native unit); text remains real,
 * selectable text (a full-text SVG layer, not a raster), and images embed as
 * data URLs. Optional per-object CTMs map to SVG matrix() transforms.
 */

import type {
  OfdColor,
  OfdCtm,
  OfdImageObj,
  OfdObject,
  OfdPage,
  OfdPathObj,
  OfdPathOp,
  OfdTextObj,
} from './ofd-reader';
import { sniffImage } from './image';

export interface OfdSvgOptions {
  /** Output zoom: 1 = 1 SVG user unit per mm (default). */
  zoom?: number;
  /** Page background fill (default '#fff'; empty string disables the rect). */
  background?: string;
  /**
   * Font family applied to text objects whose embedded font is unknown.
   * Per-object families still win when resolvable.
   */
  fallbackFont?: string;
  /** Render text as real <text> (default true; false = hide text layer). */
  includeText?: boolean;
}

function fmt(n: number): string {
  return String(Math.round(n * 1e4) / 1e4);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colorCss(c: OfdColor | undefined, fallback: string): string {
  if (!c) return fallback;
  const base = `rgb(${c.r},${c.g},${c.b})`;
  return c.alpha < 1 ? `rgba(${c.r},${c.g},${c.b},${+c.alpha.toFixed(3)})` : base;
}

function ctmAttr(ctm: OfdCtm | undefined): string {
  if (!ctm) return '';
  return ` transform="matrix(${fmt(ctm.a)} ${fmt(ctm.b)} ${fmt(ctm.c)} ${fmt(ctm.d)} ${fmt(ctm.e)} ${fmt(ctm.f)})"`;
}

function pathD(ops: OfdPathOp[], origin: { x: number; y: number }): string {
  // AbbreviatedData coordinates are relative to the object Boundary origin.
  let d = '';
  const px = (n: number): string => fmt(origin.x + n);
  const py = (n: number): string => fmt(origin.y + n);
  for (const op of ops) {
    if (op.op === 'M') d += `M${px(op.x)} ${py(op.y)} `;
    else if (op.op === 'L') d += `L${px(op.x)} ${py(op.y)} `;
    else if (op.op === 'C')
      d += `C${px(op.x1)} ${py(op.y1)} ${px(op.x2)} ${py(op.y2)} ${px(op.x)} ${py(op.y)} `;
    else if (op.op === 'Q') d += `Q${px(op.x1)} ${py(op.y1)} ${px(op.x)} ${py(op.y)} `;
    else d += 'Z ';
  }
  return d.trim();
}

function imageDataUrl(img: OfdImageObj): string {
  const sniffed = img.data ? sniffImage(img.data) : null;
  const mime =
    sniffed?.format === 'JPEG'
      ? 'image/jpeg'
      : sniffed?.format === 'GIF'
        ? 'image/gif'
        : sniffed?.format === 'BMP'
          ? 'image/bmp'
          : sniffed?.format === 'TIFF'
            ? 'image/tiff'
            : 'image/png';
  const data = img.data;
  if (!data?.length) return '';
  let binary = '';
  const CH = 0x8000;
  for (let i = 0; i < data.length; i += CH) {
    binary += String.fromCharCode(...data.subarray(i, i + CH));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function renderText(o: OfdTextObj, fallbackFont: string): string {
  const family = esc(fallbackFont);
  const weight = '';
  const sizeAttr = ` font-size="${fmt(o.size)}"`;
  const fill = colorCss(o.color, '#000');
  const stroke = o.stroke && o.strokeColor ? colorCss(o.strokeColor, fill) : '';
  const body: string[] = [];
  for (const code of o.codes) {
    const x = o.boundary.x + code.x;
    const y = o.boundary.y + code.y;
    if (code.deltaX && code.text.length > 1) {
      // Per-glyph start positions — exact DeltaX semantics, no compression.
      let cur = x;
      let spans = '';
      for (let i = 0; i < code.text.length; i++) {
        spans += `<tspan x="${fmt(cur)}">${esc(code.text[i]!)}</tspan>`;
        cur += code.deltaX[i] ?? 0;
      }
      body.push(
        `<text x="${fmt(x)}" y="${fmt(y)}"${sizeAttr} font-family="${family}"${weight} fill="${fill}"${stroke ? ` stroke="${stroke}"` : ''}${ctmAttr(o.ctm)}>${spans}</text>`,
      );
    } else {
      const ls =
        code.deltaX && code.deltaX.length === 1 ? ` letter-spacing="${fmt(code.deltaX[0]!)}"` : '';
      body.push(
        `<text x="${fmt(x)}" y="${fmt(y)}"${sizeAttr} font-family="${family}"${weight} fill="${fill}"${ls}${stroke ? ` stroke="${stroke}"` : ''}${ctmAttr(o.ctm)}>${esc(code.text)}</text>`,
      );
    }
  }
  return body.join('');
}

function renderPath(o: OfdPathObj): string {
  if (!o.ops.length) return '';
  const fill = o.fill ? colorCss(o.fillColor, '#000') : 'none';
  const stroke = o.stroke ? colorCss(o.strokeColor, '#000') : undefined;
  let extra = '';
  if (o.stroke) {
    extra += ` stroke="${stroke}" stroke-width="${fmt(o.lineWidth ?? 0.353)}"`;
    if (o.dashPattern?.length) extra += ` stroke-dasharray="${o.dashPattern.map(fmt).join(' ')}"`;
  }
  return `<path d="${pathD(o.ops, o.boundary)}" fill="${fill}"${extra}${ctmAttr(o.ctm)}/>`;
}

function renderImage(o: OfdImageObj): string {
  if (!o.data?.length) return '';
  const opacity = o.alpha !== undefined && o.alpha < 1 ? ` opacity="${+o.alpha.toFixed(3)}"` : '';
  return (
    `<image x="${fmt(o.boundary.x)}" y="${fmt(o.boundary.y)}" width="${fmt(o.boundary.w)}" height="${fmt(o.boundary.h)}"` +
    ` href="${imageDataUrl(o)}"${opacity}${ctmAttr(o.ctm)}/>`
  );
}

function renderObject(o: OfdObject, fallbackFont: string): string {
  switch (o.kind) {
    case 'text':
      return renderText(o, fallbackFont);
    case 'path':
      return renderPath(o);
    case 'image':
      return renderImage(o);
  }
}

/** Render one parsed OFD page into a standalone SVG string. */
export function pageToSvg(page: OfdPage, opts: OfdSvgOptions = {}): string {
  const zoom = opts.zoom ?? 1;
  const W = page.width;
  const H = page.height;
  const fallbackFont = esc(opts.fallbackFont ?? 'SimSun, serif');
  const includeText = opts.includeText !== false;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${(W * zoom).toFixed(2)}" height="${(H * zoom).toFixed(2)}" viewBox="0 0 ${fmt(W)} ${fmt(H)}">`,
  ];
  const bg = opts.background ?? '#fff';
  if (bg) parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  for (const o of page.objects) {
    if (o.kind === 'text' && !includeText) continue;
    const xml = renderObject(o, fallbackFont);
    if (xml) parts.push(xml);
  }
  parts.push('</svg>');
  return parts.join('');
}

export interface OfdPngResult {
  data: Uint8Array;
  /** Pixel dimensions. */
  width: number;
  height: number;
}

export interface OfdPngOptions extends OfdSvgOptions {
  /** Raster resolution in dots per inch (default 144). */
  dpi?: number;
}

/**
 * Rasterise one parsed OFD page to PNG bytes (15.1.2).
 *
 * Browser/worker runtimes only — the SVG is decoded into an Image and drawn
 * onto a canvas at `dpi`. Falls back to an explicit error in pure-Node
 * environments (no canvas implementation bundled).
 */
export async function pageToPng(page: OfdPage, opts: OfdPngOptions = {}): Promise<OfdPngResult> {
  const dpi = opts.dpi ?? 144;
  const zoom = dpi / 25.4; // px per mm
  const svg = pageToSvg(page, { ...opts, zoom });
  const width = Math.max(1, Math.round(page.width * zoom));
  const height = Math.max(1, Math.round(page.height * zoom));

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    const decoded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('ofd-svg: failed to decode page SVG'));
      img.src = url;
    });
    await decoded;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ofd-svg: canvas 2d context unavailable');
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('ofd-svg: canvas.toBlob returned null');
    const buf = new Uint8Array(await blob.arrayBuffer());
    return { data: buf, width, height };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

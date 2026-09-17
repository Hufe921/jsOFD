/**
 * PDF to OFD conversion by replaying the pdfjs-dist operator list.
 *
 * Converts: text (position, size, color, weight/style, advances per glyph),
 * fonts (embedded font files are carried over and embedded into the OFD),
 * vector paths (lines, rectangles, Bezier, fills, strokes, dashes, caps,
 * miter), raster images (RGB/RGBA/grayscale re-encoded as PNG), opacity,
 * multiple pages and page rotation.
 *
 * Not converted: clipping paths, blend modes, pattern and shading fills,
 * Type 3 fonts, and annotations.
 *
 * Usage: `const doc = await pdfToOfd(pdfBytes); doc.save("out.ofd");`
 */

import { jsOFD } from './jsofd';
import type { PathOp, PathRun, TextRun } from './model';
import type { RGB } from './types';
import { BUILTIN_FONTS, hasCJK } from './metrics';
import { parseFont } from './font-parse';
import { encodePng } from './png-encode';

/* ---------------- Minimal pdfjs typings (no hard dependency on its types) ---------------- */

interface PdfGlyph {
  unicode?: string;
  fontChar?: string;
  width?: number;
  isSpace?: boolean;
}
interface PdfFontObj {
  name?: string;
  bold?: boolean;
  italic?: boolean;
  ascent?: number;
  descent?: number;
  /** Font program bytes; present only with `fontExtraProperties: true`. */
  data?: Uint8Array | null;
  mimetype?: string;
  isType3Font?: boolean;
  missingFile?: boolean;
}
interface PdfImgData {
  width: number;
  height: number;
  kind?: number;
  data: Uint8Array | Uint8ClampedArray;
  bitmap?: unknown;
}
interface PdfPage {
  view: number[];
  rotate: number;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: {
    get(id: string | number, cb?: (v: unknown) => void): unknown;
    has?(id: string | number): boolean;
  };
  commonObjs: { get(id: string, cb?: (v: unknown) => void): PdfFontObj };
}
interface PdfjsModule {
  getDocument(src: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
    fontExtraProperties?: boolean;
    standardFontDataUrl?: string;
    cMapUrl?: string;
    cMapPacked?: boolean;
  }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<PdfPage> }> };
  OPS: Record<string, number>;
}

let pdfjsCache: PdfjsModule | null = null;
async function loadPdfjs(): Promise<PdfjsModule> {
  if (pdfjsCache) return pdfjsCache;
  const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule;
  pdfjsCache = mod;
  return mod;
}

/* ---------------- Transform helpers ---------------- */

type Mat = [number, number, number, number, number, number]; // [a b c d e f], PDF row-major

const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function mul(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function translate(m: Mat, tx: number, ty: number): Mat {
  return mul(m, [1, 0, 0, 1, tx, ty]);
}
function avgScale(m: Mat): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

/* ---------------- Font mapping ---------------- */

const CJK_FONT_MAP: [RegExp, string][] = [
  [/simsun|songti|serif\(sim|stsong|nsimsun/i, 'simsun'],
  [/simhei|heiti|sthei/i, 'simhei'],
  [/kaiti|stkaiti/i, 'kaiti'],
  [/fangsong|stfangsong/i, 'fangsong'],
];

function mapFont(
  font: PdfFontObj,
  sample: string,
): { key: string; style: 'normal' | 'bold' | 'italic' | 'bolditalic' } {
  const name = String(font.name || '');
  let key = 'helvetica';
  if (/times|georgia|roman|mingti|simsun|song/i.test(name)) key = 'times';
  if (/courier|mono|consol/i.test(name)) key = 'courier';
  for (const [re, k] of CJK_FONT_MAP) {
    if (re.test(name)) key = k;
  }
  if (hasCJK(sample)) key = BUILTIN_FONTS[key]?.cjk ? key : 'simsun';
  let style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal';
  if (font.bold) style = 'bold';
  if (font.italic) style = style === 'bold' ? 'bolditalic' : 'italic';
  return { key, style };
}

/* ---------------- Embedded font registry ---------------- */

/**
 * Per-document registry of PDF fonts. Fonts that ship a usable program
 * (embedded in the PDF, or loaded from pdfjs standard-font data) are embedded
 * into the OFD as-is — pdfjs already rebuilt a unicode cmap for subset fonts
 * that lack one, so the bytes can be embedded without any table rewriting.
 * Fonts without a usable program fall back to the generic bucket mapping.
 */
interface FontReg {
  key: string;
  embedded: boolean;
  /** Code points present in the embedded font's cmap (coverage checks). */
  glyphs?: Set<number>;
}
type FontRegistry = Map<string, FontReg>;

/** Strip the `XXXXXX+` subset prefix, keeping the real family name. */
function cleanFontName(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '');
}

function registerFont(
  doc: jsOFD,
  registry: FontRegistry,
  fontId: string,
  font: PdfFontObj,
): FontReg {
  const cached = registry.get(fontId);
  if (cached) return cached;
  let reg: FontReg | null = null;
  if (font.data && !font.isType3Font) {
    const data = font.data instanceof Uint8Array ? font.data : new Uint8Array(font.data);
    const parsed = parseFont(data);
    if (parsed) {
      const key = fontId.toLowerCase();
      if (!doc.customFonts[key]) {
        doc.addFontTtf(key, cleanFontName(String(font.name || key)), data);
      }
      reg = { key, embedded: true, glyphs: new Set(parsed.glyphs.keys()) };
    }
  }
  if (!reg) reg = { key: '', embedded: false };
  registry.set(fontId, reg);
  return reg;
}

/* ---------------- Graphics state ---------------- */

interface GState {
  ctm: Mat;
  fill: RGB;
  stroke: RGB;
  lineWidth: number;
  dash: { pattern: number[]; phase: number } | null;
  cap: number;
  join: number;
  miterLimit: number;
  fillAlpha: number;
  strokeAlpha: number;
}

function cloneGs(s: GState): GState {
  return {
    ...s,
    ctm: [...s.ctm] as Mat,
    fill: [...s.fill] as RGB,
    stroke: [...s.stroke] as RGB,
    dash: s.dash ? { pattern: [...s.dash.pattern], phase: s.dash.phase } : null,
  };
}

const GRAYSCALE_1BPP = 1;
const RGB_24BPP = 2;
const RGBA_32BPP = 3;

/** @internal Exposed for tests. */
export async function imgDataToPng(img: PdfImgData): Promise<Uint8Array | null> {
  const w = img.width;
  const h = img.height;

  // Browser path: pdfjs transfers decoded images as ImageBitmap, with
  // `data` left null. Rasterize through a canvas and read RGBA pixels.
  const bitmap = img.bitmap as ImageBitmap | null | undefined;
  if (bitmap && (!img.data || img.data.length === 0)) {
    const rgba = bitmapToRgba(bitmap, w, h);
    if (!rgba) return null;
    return encodePng(rgba, w, h);
  }

  const src = img.data;
  if (!src) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const n = w * h;
  // Trust the declared kind when the payload is large enough; otherwise infer
  // the layout from the byte length (some readers hand out raw buffers).
  let kind = img.kind;
  if (
    kind === undefined ||
    (kind === RGBA_32BPP && src.length < n * 4) ||
    (kind === RGB_24BPP && src.length < n * 3)
  ) {
    kind =
      src.length >= n * 4
        ? RGBA_32BPP
        : src.length >= n * 3
          ? RGB_24BPP
          : src.length >= n
            ? 0 /* 8bpp gray */
            : GRAYSCALE_1BPP;
  }
  if (kind === RGBA_32BPP) {
    rgba.set(src.subarray(0, Math.min(src.length, rgba.length)));
  } else if (kind === RGB_24BPP) {
    for (let i = 0, j = 0; i < n; i++) {
      rgba[j++] = src[i * 3]!;
      rgba[j++] = src[i * 3 + 1]!;
      rgba[j++] = src[i * 3 + 2]!;
      rgba[j++] = 255;
    }
  } else if (kind === GRAYSCALE_1BPP) {
    // 1bpp: packed bits, 1 = opaque; rendered as black foreground
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = (src[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
        const j = (y * w + x) * 4;
        rgba[j] = 0;
        rgba[j + 1] = 0;
        rgba[j + 2] = 0;
        rgba[j + 3] = bit ? 255 : 0;
      }
    }
  } else {
    // Others (e.g. 8bpp grayscale): expand by gray level
    for (let i = 0; i < n; i++) {
      const g = src[i] ?? 0;
      const j = i * 4;
      rgba[j] = g;
      rgba[j + 1] = g;
      rgba[j + 2] = g;
      rgba[j + 3] = 255;
    }
  }
  return encodePng(rgba, w, h);
}

/** Rasterize an ImageBitmap to RGBA via canvas (browsers only). */
function bitmapToRgba(bitmap: ImageBitmap, w: number, h: number): Uint8ClampedArray | null {
  try {
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(w, h)
        : document.createElement('canvas');
    (canvas as HTMLCanvasElement).width = w;
    (canvas as HTMLCanvasElement).height = h;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

/**
 * Pre-scan and await all image objects; some resolve after the operator list.
 */
async function resolvePageImages(
  page: PdfPage,
  opList: { fnArray: number[]; argsArray: unknown[][] },
  OPS: Record<string, number>,
): Promise<Map<string, PdfImgData>> {
  const ids = new Set<string>();
  for (let i = 0; i < opList.fnArray.length; i++) {
    const op = opList.fnArray[i]!;
    if (
      op === OPS.paintImageXObject ||
      op === OPS.paintJpegXObject ||
      op === OPS.paintImageMaskXObject ||
      op === OPS.paintImageXObjectRepeat
    ) {
      const a = opList.argsArray[i]!;
      const raw = a[0];
      const id =
        typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object' && typeof (raw as { data?: string }).data === 'string'
            ? (raw as { data: string }).data
            : null;
      if (id) ids.add(id);
    }
  }
  if (!ids.size) return new Map();
  const map = new Map<string, PdfImgData>();
  await Promise.all(
    [...ids].map(
      (id) =>
        new Promise<void>((resolve) => {
          let done = false;
          const finish = (): void => {
            if (done) return;
            done = true;
            resolve();
          };
          const grab = (): void => {
            try {
              const v = page.objs.get(id) as PdfImgData | null;
              if (v && (v as PdfImgData).width) map.set(id, v);
            } catch {
              /* Not resolved or absent: skip the image */
            }
          };
          try {
            // Callback form: invoked when resolved (never throws)
            (page.objs.get as (id: string, cb: () => void) => unknown)(id, () => {
              grab();
              finish();
            });
          } catch {
            /* ignored */
          }
          // Best effort: try immediately, give up after a timeout
          grab();
          setTimeout(finish, 3000);
        }),
    ),
  );
  return map;
}

/* ---------------- Converter ---------------- */

/** pdfjs extras (browsers should pass workerSrc / standardFontDataUrl). */
export interface PdfToOfdOptions {
  /** Page size scale (default 1; output unit is pt). */
  scale?: number;
  /** Progress callback (0-based page index). */
  onProgress?: (pageIndex: number, totalPages: number) => void;
  /** pdfjs worker URL (recommended in browsers, e.g. a CDN pdf.worker.min.mjs). */
  workerSrc?: string;
  /** Standard-font data directory (optional; silences Base14 warnings). */
  standardFontDataUrl?: string;
  /** CMap directory (required for CJK CID fonts; auto-detected in Node). */
  cMapUrl?: string;
  cMapPacked?: boolean;
}

let globalWorkerSrc: string | null = null;
let globalFontUrl: string | null = null;
let globalCMapUrl: string | null = null;
let warnedWorkerFallback = false;

/** Globally configure pdfjs worker/font asset URLs (browsers). */
export function configurePdfImport(opts: {
  workerSrc?: string;
  standardFontDataUrl?: string;
  cMapUrl?: string;
}): void {
  if (opts.workerSrc !== undefined) globalWorkerSrc = opts.workerSrc;
  if (opts.standardFontDataUrl !== undefined) globalFontUrl = opts.standardFontDataUrl;
  if (opts.cMapUrl !== undefined) globalCMapUrl = opts.cMapUrl;
}

/** Auto-locate the cmaps / standard_fonts directories shipped with pdfjs-dist in Node. */
function nodeAssetDir(sub: string): string | undefined {
  try {
    const req = new Function('m', 'return require(m)') as (m: string) => { paths?: unknown };
    const pkg = req('pdfjs-dist/package.json') as unknown as string;
    void pkg;
    const pathReq = new Function('m', 'return require(m)')('node:path') as {
      dirname: (p: string) => string;
      join: (...p: string[]) => string;
    };
    const resolve = new Function('m', 'return require.resolve(m)') as (m: string) => string;
    const pkgPath = resolve('pdfjs-dist/package.json');
    return pathReq.join(pathReq.dirname(pkgPath), sub) + '/';
  } catch {
    return undefined;
  }
}

export async function pdfToOfd(
  data: Uint8Array | ArrayBuffer,
  options: PdfToOfdOptions = {},
): Promise<jsOFD> {
  const scale = options.scale ?? 1;
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data);
  const pdfjs = await loadPdfjs();
  const mod = pdfjs as unknown as {
    GlobalWorkerOptions?: { workerSrc: string };
    version?: string;
  };
  const isNode =
    typeof process !== 'undefined' &&
    !!(process as { versions?: { node?: string } }).versions?.node;
  let workerSrc = options.workerSrc ?? globalWorkerSrc ?? undefined;
  if (!workerSrc && !isNode && mod.GlobalWorkerOptions && !mod.GlobalWorkerOptions.workerSrc) {
    // pdfjs v4+ requires a worker URL in browsers. Fall back to a version-matched
    // CDN copy so first use works out of the box; warn so apps can self-host.
    const v = mod.version ?? '4.10.38';
    workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
    warnedWorkerFallback =
      warnedWorkerFallback ??
      (console.warn(
        `[jsOFD] pdfjs worker not configured; falling back to ${workerSrc}. ` +
          'Pass `workerSrc` (or configurePdfImport) to avoid the CDN dependency.',
      ),
      true);
  }
  if (workerSrc && mod.GlobalWorkerOptions) mod.GlobalWorkerOptions.workerSrc = workerSrc;
  const cMapUrl = options.cMapUrl ?? globalCMapUrl ?? (isNode ? nodeAssetDir('cmaps') : undefined);
  const standardFontDataUrl =
    options.standardFontDataUrl ??
    globalFontUrl ??
    (isNode ? nodeAssetDir('standard_fonts') : undefined);
  const pdf = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    // Keep font programs accessible on the main thread (pdfjs otherwise
    // clears `data` right after the font loads) so they can be embedded.
    fontExtraProperties: true,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
  }).promise;

  const doc = new jsOFD({ unit: 'pt', format: [612, 792] });
  const OPS = pdfjs.OPS;
  const fonts: FontRegistry = new Map();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    options.onProgress?.(pageNum - 1, pdf.numPages);
    const page = await pdf.getPage(pageNum);
    const [x0, y0, x1, y1] = page.view;
    const W = (x1 - x0) * scale;
    const H = (y1 - y0) * scale;

    // Base CTM: PDF user space to device (pt, y flipped), then page rotation
    let baseCtm: Mat = [scale, 0, 0, -scale, -x0 * scale, y1 * scale];
    const rot = ((page.rotate % 360) + 360) % 360;
    if (rot === 90) baseCtm = mul([0, 1, -1, 0, 0, 0], baseCtm);
    else if (rot === 180) baseCtm = mul([-1, 0, 0, -1, 0, 0], baseCtm);
    else if (rot === 270) baseCtm = mul([0, -1, 1, 0, 0, 0], baseCtm);

    const rotated = rot === 90 || rot === 270;
    const pw = rotated ? H : W;
    const ph = rotated ? W : H;
    if (pageNum === 1) {
      doc.pages[0]!.width = pw;
      doc.pages[0]!.height = ph;
    } else {
      doc.addPage([pw, ph]);
    }

    const opList = await page.getOperatorList();
    const images = await resolvePageImages(page, opList, OPS);
    await convertPage(doc, page, opList, OPS, baseCtm, images, fonts);
  }
  return doc;
}

async function convertPage(
  doc: jsOFD,
  page: PdfPage,
  opList: { fnArray: number[]; argsArray: unknown[][] },
  OPS: Record<string, number>,
  baseCtm: Mat,
  images: Map<string, PdfImgData>,
  fonts: FontRegistry,
): Promise<void> {
  const gs: GState = {
    ctm: [...baseCtm] as Mat,
    fill: [0, 0, 0],
    stroke: [0, 0, 0],
    lineWidth: 1,
    dash: null,
    cap: 0,
    join: 0,
    miterLimit: 10,
    fillAlpha: 1,
    strokeAlpha: 1,
  };
  const stack: GState[] = [];

  // Text state
  let textMatrix: Mat = IDENT;
  let textLine: Mat = IDENT;
  let fontObj: PdfFontObj | null = null;
  let fontReg: FontReg | null = null;
  let fontId: string;
  let fontSize = 12;
  let inText = false;

  // Path under construction (PDF user space)
  let pathOps: PathOp[] = [];

  // Pending text accumulator: consecutive same-style glyphs merge into one TextRun
  let pending: {
    text: string;
    ws: number[];
    startX: number;
    startY: number;
    size: number;
    key: string;
    style: 'normal' | 'bold' | 'italic' | 'bolditalic';
    color: RGB;
    alpha: number;
  } | null = null;

  const pushPageObj = (o: TextRun | PathRun): void => {
    doc.pages[doc.page]!.objects.push(o);
  };

  const flushText = (): void => {
    if (!pending || !pending.text.length) {
      pending = null;
      return;
    }
    const def = doc.getFontDef(pending.key);
    const run: TextRun = {
      t: 'text',
      x: pending.startX,
      y: pending.startY,
      text: pending.text,
      size: pending.size,
      fontKey: pending.key,
      style: pending.style,
      color: [...pending.color] as RGB,
      charSpace: 0,
      angle: 0,
      ascent: ((def.ascent ?? 800) / 1000) * pending.size,
      // Magnitude below the baseline (matches text.ts; the builder derives
      // Boundary metrics from the serialized font def anyway).
      descent: (-(def.descent ?? -200) / 1000) * pending.size,
      renderingMode: 'fill',
      opacity: pending.alpha < 1 ? pending.alpha : null,
      justifyWidth: null,
      hScale: 1,
      glyphWs: pending.ws,
    };
    pushPageObj(run);
    pending = null;
  };

  const emitPath = (fill: boolean, stroke: boolean, close: boolean): void => {
    if (!pathOps.length) return;
    const ops =
      close && pathOps[pathOps.length - 1]!.op !== 'Z'
        ? [...pathOps, { op: 'Z' as const }]
        : pathOps;
    const run: PathRun = {
      t: 'path',
      ops,
      fill,
      stroke,
      fillColor: [...gs.fill] as RGB,
      strokeColor: [...gs.stroke] as RGB,
      lineWidth: Math.max(gs.lineWidth * avgScale(gs.ctm), 0.1),
      dash: gs.dash
        ? { pattern: gs.dash.pattern.map((v) => v * avgScale(gs.ctm)), phase: gs.dash.phase }
        : null,
      cap: gs.cap,
      join: gs.join,
      miterLimit: gs.miterLimit,
      opacity:
        (fill ? gs.fillAlpha : gs.strokeAlpha) < 1 ? (fill ? gs.fillAlpha : gs.strokeAlpha) : null,
    };
    pushPageObj(run);
    pathOps = [];
  };

  const flushPaint = (
    kind: 'fill' | 'stroke' | 'fillStroke',
    _eo: boolean,
    close: boolean,
  ): void => {
    // even-odd and nonzero agree on simple paths; ignored
    if (kind === 'fill') emitPath(true, false, close);
    else if (kind === 'stroke') emitPath(false, true, close);
    else emitPath(true, true, close);
  };

  /**
   * Choose the font per glyph: CJK glyphs must join a CJK-capable run,
   * otherwise readers skip them for missing glyphs.
   */
  const ensureTextPending = (u: string): void => {
    if (!fontObj) return;
    // Embedded fonts keep their own key (glyph coverage is guaranteed by the
    // embedded program); others fall back to the generic bucket mapping.
    const { key, style } = fontReg?.embedded
      ? {
          key: fontReg.key,
          style: (fontObj.bold
            ? fontObj.italic
              ? 'bolditalic'
              : 'bold'
            : fontObj.italic
              ? 'italic'
              : 'normal') as 'normal' | 'bold' | 'italic' | 'bolditalic',
        }
      : mapFont(fontObj, u);
    if (
      pending &&
      pending.key === key &&
      pending.style === style &&
      pending.size ===
        fontSize * (Math.hypot(textMatrix[0], textMatrix[1]) || 1) * avgScale(gs.ctm) &&
      Math.abs(pending.alpha - gs.fillAlpha) < 1e-6 &&
      pending.color[0] === gs.fill[0] &&
      pending.color[1] === gs.fill[1] &&
      pending.color[2] === gs.fill[2]
    ) {
      return; // Continue the current run
    }
    flushText();
    const pos = apply(mul(gs.ctm, textMatrix), 0, 0);
    const tmScale = Math.hypot(textMatrix[0], textMatrix[1]) || 1;
    const effSize = fontSize * tmScale * avgScale(gs.ctm);
    pending = {
      text: '',
      ws: [],
      startX: pos[0],
      startY: pos[1],
      size: effSize,
      key,
      style,
      color: [...gs.fill] as RGB,
      alpha: gs.fillAlpha,
    };
  };

  /** Translate the text matrix (dt in text space units: em x fontSize). */
  const advanceText = (dt: number): void => {
    textMatrix = translate(textMatrix, dt, 0);
  };

  const readColor = (a: unknown[]): RGB => {
    const c = a[0] as unknown;
    if (typeof c === 'string') {
      // pdfjs v6 hands out '#rrggbb' strings.
      const hex = c.slice(1);
      if (hex.length >= 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      }
      return [0, 0, 0];
    }
    const o = a as unknown as { 0: number; 1: number; 2: number };
    if (o && o[0] !== undefined) {
      const g = o[1] === undefined ? o[0] : undefined;
      return g !== undefined ? [g, g, g] : [o[0]!, o[1]!, o[2]!];
    }
    return [0, 0, 0];
  };

  const fn = opList.fnArray;
  const args = opList.argsArray;

  for (let i = 0; i < fn.length; i++) {
    const op = fn[i]!;
    const a = args[i]!;

    if (op === OPS.save) {
      stack.push(cloneGs(gs));
    } else if (op === OPS.restore) {
      const s = stack.pop();
      if (s) Object.assign(gs, s);
    } else if (op === OPS.transform) {
      // v6 flattens multi-arg operators; v4 wrapped them in an array.
      const v = typeof a[0] === 'number' ? (a as number[]) : (numArr(a[0]) as number[]);
      const [ma, mb, mc, md, me, mf] = v;
      gs.ctm = mul(gs.ctm, [ma!, mb!, mc!, md!, me!, mf!]);
    } else if (op === OPS.setLineWidth) {
      gs.lineWidth = Number(a[0]);
    } else if (op === OPS.setDash) {
      const pat = numArr(a[0]);
      gs.dash = pat.length ? { pattern: [...pat], phase: Number(a[1]) || 0 } : null;
    } else if (op === OPS.setLineCap) {
      gs.cap = Number(a[0]) || 0;
    } else if (op === OPS.setLineJoin) {
      gs.join = Number(a[0]) || 0;
    } else if (op === OPS.setMiterLimit) {
      gs.miterLimit = Number(a[0]) || 10;
    } else if (
      op === OPS.setFillRGBColor ||
      op === OPS.setFillGray ||
      op === OPS.setFillCMYKColor
    ) {
      gs.fill = readColor(a);
    } else if (
      op === OPS.setStrokeRGBColor ||
      op === OPS.setStrokeGray ||
      op === OPS.setStrokeCMYKColor
    ) {
      gs.stroke = readColor(a);
    } else if (op === OPS.setFillAlpha) {
      gs.fillAlpha = Number(a[0]);
    } else if (op === OPS.setStrokeAlpha) {
      gs.strokeAlpha = Number(a[0]);
    } else if (op === OPS.setFillTransparent) {
      gs.fillAlpha = 0;
    } else if (op === OPS.setStrokeTransparent) {
      gs.strokeAlpha = 0;
    } else if (op === OPS.setGState) {
      for (const [k, v] of anyArr(a[0]) as [string, unknown][]) {
        // pdfjs keys: ca = fill alpha, CA = stroke alpha
        if (k === 'fillAlpha' || k === 'ca') gs.fillAlpha = Number(v);
        else if (k === 'strokeAlpha' || k === 'CA') gs.strokeAlpha = Number(v);
      }
    } else if (op === OPS.constructPath) {
      if (Array.isArray(a[0])) {
        // pdfjs v4: args = [opsArray, coords]; op codes are OPS.moveTo/lineTo/...
        const [pathOpsRaw, coords] = a as [number[], number[]];
        let ci = 0;
        for (const code of pathOpsRaw!) {
          if (code === OPS.moveTo) {
            pathOps.push({ op: 'M', ...pt(gs.ctm, coords![ci++]!, coords![ci++]!) });
          } else if (code === OPS.lineTo) {
            pathOps.push({ op: 'L', ...pt(gs.ctm, coords![ci++]!, coords![ci++]!) });
          } else if (code === OPS.curveTo) {
            const c1 = pt(gs.ctm, coords![ci++]!, coords![ci++]!);
            const c2 = pt(gs.ctm, coords![ci++]!, coords![ci++]!);
            const e = pt(gs.ctm, coords![ci++]!, coords![ci++]!);
            pathOps.push({ op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y });
          } else if (code === OPS.curveTo2) {
            // x1 y1 x2 y2: the current point acts as the first control point
            const c1 = pathCoords(pathOps);
            const c2 = pt(gs.ctm, coords![ci++]!, coords![ci++]!);
            const e = pt(gs.ctm, coords![ci++]!, coords![ci++]!);
            pathOps.push({ op: 'C', x1: c1[0], y1: c1[1], x2: c2.x, y2: c2.y, x: e.x, y: e.y });
          } else if (code === OPS.curveTo3) {
            const c2 = pt(gs.ctm, coords![ci++]!, coords![ci++]!);
            const e = pt(gs.ctm, coords![ci++]!, coords![ci++]!);
            pathOps.push({ op: 'C', x1: c2.x, y1: c2.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y });
          } else if (code === OPS.closePath) {
            pathOps.push({ op: 'Z' });
          } else if (code === OPS.rectangle) {
            const x = coords![ci++]!;
            const y = coords![ci++]!;
            const w = coords![ci++]!;
            const h = coords![ci++]!;
            const p1 = pt(gs.ctm, x, y);
            const p2 = pt(gs.ctm, x + w, y);
            const p3 = pt(gs.ctm, x + w, y + h);
            const p4 = pt(gs.ctm, x, y + h);
            pathOps.push({ op: 'M', ...p1 });
            pathOps.push({ op: 'L', ...p2 });
            pathOps.push({ op: 'L', ...p3 });
            pathOps.push({ op: 'L', ...p4 });
            pathOps.push({ op: 'Z' });
          }
        }
      } else {
        // pdfjs v6: args = [paintFn, [Float32Array(microCodeStream)], minMax].
        // Path construction is buffered in the worker and emitted together
        // with the painting operator; `endPath` (clip discard) arrives the
        // same way. Micro codes: 0 moveTo, 1 lineTo, 2 curveTo,
        // 3 quadraticCurveTo, 4 closePath (already appended for close* paints).
        const paintFn = a[0] as number;
        const wrapped = a[1] as unknown[] | null;
        const stream = wrapped && wrapped[0] != null ? numArr(wrapped[0]) : [];
        let i = 0;
        while (i < stream.length) {
          switch (stream[i++]) {
            case 0: {
              const p1 = pt(gs.ctm, stream[i++]!, stream[i++]!);
              pathOps.push({ op: 'M', ...p1 });
              break;
            }
            case 1: {
              const p1 = pt(gs.ctm, stream[i++]!, stream[i++]!);
              pathOps.push({ op: 'L', ...p1 });
              break;
            }
            case 2: {
              const c1 = pt(gs.ctm, stream[i++]!, stream[i++]!);
              const c2 = pt(gs.ctm, stream[i++]!, stream[i++]!);
              const e = pt(gs.ctm, stream[i++]!, stream[i++]!);
              pathOps.push({ op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y });
              break;
            }
            case 3: {
              // Quadratic -> cubic: controls at 2/3 towards the pole.
              const q = pt(gs.ctm, stream[i++]!, stream[i++]!);
              const e = pt(gs.ctm, stream[i++]!, stream[i++]!);
              const last = pathCoords(pathOps);
              pathOps.push({
                op: 'C',
                x1: last[0] + (2 / 3) * (q.x - last[0]),
                y1: last[1] + (2 / 3) * (q.y - last[1]),
                x2: e.x + (2 / 3) * (q.x - e.x),
                y2: e.y + (2 / 3) * (q.y - e.y),
                x: e.x,
                y: e.y,
              });
              break;
            }
            case 4:
              pathOps.push({ op: 'Z' });
              break;
            default:
              i = stream.length; // unknown micro op: stop parsing this stream
              break;
          }
        }
        if (paintFn === OPS.endPath) {
          // PDF W n (clip): discard, never paint.
          pathOps = [];
        } else if (paintFn === OPS.fill || paintFn === OPS.eoFill) {
          flushPaint('fill', false, false);
        } else if (paintFn === OPS.stroke || paintFn === OPS.closeStroke) {
          flushPaint('stroke', false, false);
        } else {
          flushPaint('fillStroke', false, false);
        }
      }
    } else if (op === OPS.fill) {
      flushPaint('fill', false, false);
    } else if (op === OPS.eoFill) {
      flushPaint('fill', true, false);
    } else if (op === OPS.stroke) {
      flushPaint('stroke', false, false);
    } else if (op === OPS.endPath) {
      // PDF W n (clip): the path is only for clipping and is discarded at endPath
      pathOps = [];
    } else if (op === OPS.closeStroke) {
      flushPaint('stroke', false, true);
    } else if (op === OPS.fillStroke) {
      flushPaint('fillStroke', false, false);
    } else if (op === OPS.eoFillStroke) {
      flushPaint('fillStroke', true, false);
    } else if (op === OPS.closeFillStroke) {
      flushPaint('fillStroke', false, true);
    } else if (op === OPS.beginText) {
      inText = true;
      textMatrix = IDENT;
      textLine = IDENT;
    } else if (op === OPS.endText) {
      inText = false;
      flushText();
    } else if (op === OPS.setFont) {
      const [id, size] = a as [string, number];
      fontId = String(id);
      fontSize = Number(size);
      try {
        fontObj = page.commonObjs.get(fontId);
        fontReg = fontObj ? registerFont(doc, fonts, fontId, fontObj) : null;
      } catch {
        fontObj = null;
        fontReg = null;
      }
    } else if (op === OPS.setTextMatrix) {
      const [ma, mb, mc, md, me, mf] = numArr(a[0]) as number[];
      textMatrix = [ma!, mb!, mc!, md!, me!, mf!];
      textLine = [...textMatrix] as Mat;
      if (inText) flushText(); // position jump
    } else if (op === OPS.moveText) {
      const tv = typeof a[0] === 'number' ? (a as unknown as number[]) : numArr(a[0]);
      textLine = translate(textLine, tv[0] ?? 0, tv[1] ?? 0);
      textMatrix = [...textLine] as Mat;
      if (inText) flushText();
    } else if (op === OPS.nextLine) {
      // leading arrives via moveText
    } else if (op === OPS.showText || op === OPS.showSpacedText) {
      if (!fontObj) continue;
      const glyphs = anyArr(a[0]) as (PdfGlyph | number)[];
      for (const g of glyphs) {
        if (typeof g === 'number') {
          // TJ adjustment (1/1000 em): break the run to keep positions exact
          flushText();
          advanceText((-g / 1000) * fontSize);
          continue;
        }
        const u = g.unicode ?? '';
        if (!u) {
          advanceText(((g.width ?? 500) / 1000) * fontSize);
          continue;
        }
        // Subset fonts often have no space glyph (PDFs space words with TJ
        // offsets instead): skip such whitespace — DeltaX keeps the gap exact
        // and readers won't render a .notdef box for a missing cmap entry.
        const reg = fontReg;
        if (
          reg?.embedded &&
          reg.glyphs &&
          /^\s+$/.test(u) &&
          ![...u].some((ch) => reg.glyphs!.has(ch.codePointAt(0)!))
        ) {
          advanceText(((g.width ?? 500) / 1000) * fontSize);
          continue;
        }
        ensureTextPending(u);
        // pending is assigned in closures; take an explicit type
        const p = pending as { text: string; ws: number[] } | null;
        if (!p) continue;
        p.text += u;
        // Device-space advance (font size x text matrix x CTM)
        const tmScale = Math.hypot(textMatrix[0], textMatrix[1]) || 1;
        const devAdv = ((g.width ?? 500) / 1000) * fontSize * tmScale * avgScale(gs.ctm);
        p.ws.push(devAdv);
        advanceText(((g.width ?? 500) / 1000) * fontSize);
      }
    } else if (
      op === OPS.paintImageXObject ||
      op === OPS.paintJpegXObject ||
      op === OPS.paintImageXObjectRepeat
    ) {
      const objId = String(a[0]);
      let img = images.get(objId);
      if (!img) {
        try {
          img = page.commonObjs.get(objId) as unknown as PdfImgData | undefined;
        } catch {
          img = undefined;
        }
      }
      if (!img || !img.width) continue; // Skip images that never resolve instead of failing the conversion
      await placeImage(doc, img, gs.ctm, gs.fillAlpha);
    } else if (op === OPS.paintInlineImageXObject) {
      const img = a[0] as unknown as PdfImgData;
      if (img && img.width) {
        await placeImage(doc, img, gs.ctm, gs.fillAlpha);
      }
    } else if (op === OPS.paintImageMaskXObject) {
      const raw = a[0] as { data?: PdfImgData | string } | undefined;
      const direct =
        raw && typeof raw === 'object' && (raw as { width?: number }).width
          ? (raw as unknown as PdfImgData)
          : null;
      const byId =
        raw && typeof (raw as { data?: unknown }).data === 'string'
          ? images.get((raw as unknown as { data: string }).data)
          : null;
      const idStr = typeof a[0] === 'string' ? (a[0] as string) : null;
      const img = direct ?? byId ?? (idStr ? images.get(idStr) : null);
      if (img && img.width) {
        await placeImage(doc, { ...img, kind: GRAYSCALE_1BPP }, gs.ctm, gs.fillAlpha);
      }
    }
    // Remaining operators (clip, groups, Type3, ...) are ignored
  }
  flushText();
}

/** pdfjs v6 hands out array-likes instead of real arrays; normalize once. */
function numArr(v: unknown): number[] {
  return Array.isArray(v) ? v : Array.from(v as ArrayLike<number>);
}

/** Same for mixed arrays such as glyph sequences. */
function anyArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : Array.from(v as ArrayLike<unknown>);
}

function pt(m: Mat, x: number, y: number): { x: number; y: number } {
  // baseCtm already flipped y; device coords are OFD page coords (pt, top-left origin)
  const [dx, dy] = apply(m, x, y);
  return { x: dx, y: dy };
}

/** Last point of the current path (used for the implicit curveTo2 control). */
function pathCoords(ops: PathOp[]): [number, number] {
  for (let i = ops.length - 1; i >= 0; i--) {
    const o = ops[i]!;
    if (o.op === 'M' || o.op === 'L') return [o.x, o.y];
    if (o.op === 'C') return [o.x, o.y];
  }
  return [0, 0];
}

async function placeImage(doc: jsOFD, img: PdfImgData, ctm: Mat, alpha: number): Promise<void> {
  // Images map the unit square (0,0)-(1,1)
  const p00 = pt(ctm, 0, 0);
  const p10 = pt(ctm, 1, 0);
  const p11 = pt(ctm, 1, 1);
  const p01 = pt(ctm, 0, 1);
  const xs = [p00.x, p10.x, p11.x, p01.x];
  const ys = [p00.y, p10.y, p11.y, p01.y];
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  const bw = Math.max(...xs) - bx;
  const bh = Math.max(...ys) - by;
  if (bw <= 0 || bh <= 0) return;

  const png = await imgDataToPng(img);
  if (!png) return; // unsupported payload (no bytes and no bitmap)
  doc.addImage(png, 'PNG', bx, by, bw, bh, undefined, undefined, 0);
  const run = doc.pages[doc.page]!.objects[doc.pages[doc.page]!.objects.length - 1];
  if (run && run.t === 'image' && alpha < 1) {
    run.opacity = alpha;
  }
}

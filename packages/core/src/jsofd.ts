/**
 * jsOFD document class.
 *
 * The public API mirrors jsPDF while the serialized output follows the Chinese
 * national fixed-layout document standard GB/T 33190-2016 (OFD).
 *
 * This module holds document state, the constructor, page management and the
 * graphics-state helpers. Feature methods are contributed by the mixins in
 * `src/modules/` and merged onto the prototype at the bottom of this file:
 *
 * - {@link modules/state.ts}  fonts, colors, metrics, graphics state
 * - {@link modules/text.ts}   measurement, line breaking, `text()`
 * - {@link modules/shapes.ts} vector primitives
 * - {@link modules/images.ts} image embedding
 * - {@link modules/annotations.ts} links and attachments
 * - {@link modules/view.ts}   metadata, viewer preferences, output
 */

import type { AttachmentData } from './model';
import { PAGE_FORMATS_MM, UNIT_FACTORS, isUnit } from './formats';
import type { FontDef } from './metrics';
import type { ImageRun, PageData } from './model';
export type { PageData, ImageRun } from './model';

import type {
  jsOFDOptions,
  Orientation,
  OutlineNode,
  OutlineOptions,
  PageFormat,
  RGB,
  Unit,
} from './types';
import { PT_PER_MM, randomHex32 } from './utils';
import { createContext2d } from './context2d';
import { AnnotationApi } from './modules/annotations';
import { AnnotationVisualApi } from './modules/annotate';
import { FlowApi } from './modules/flow';
import { HtmlApi } from './modules/html';
import { ImageApi } from './modules/images';
import { ShapeApi } from './modules/shapes';
import { StateApi } from './modules/state';
import { SvgApi } from './modules/svg';
import { TableApi } from './modules/table';
import { TextApi } from './modules/text';
import { ViewApi } from './modules/view';

export const JSOFD_VERSION = '1.0.0';

/** Default stroke width (0.2 mm), matching jsPDF. */
const DEFAULT_LINE_WIDTH_PT = 0.2 * PT_PER_MM;

type OrientationResolved = 'p' | 'l';

export class jsOFD {
  /** Active measurement unit. */
  readonly unit: string;
  /** Unit → point scale factor (jsPDF-compatible `internal.scaleFactor`). */
  readonly scaleFactor: number;
  /** Decimal places used when serializing numbers. */
  readonly floatPrecision: number;
  /** @internal Default orientation for `addPage()` without arguments. */
  readonly defaultOrientation: OrientationResolved;

  /** Pages in the document (internal coordinates are points). */
  pages: PageData[] = [];
  /** Zero-based index of the current page. */
  page = 0;

  /** User-registered fonts. */
  customFonts: Record<string, FontDef> = {};

  /** Image resources, keyed by alias, plus insertion order. */
  images: Record<string, ImageRun['imageRef']> = {};
  imageList: ImageRun['imageRef'][] = [];

  /** Embedded file attachments. */
  attachments: AttachmentData[] = [];

  /** Bookmark tree root. */
  outlineRoot: { children: OutlineNode[] } = { children: [] };

  /** Document metadata (see `setProperties`). */
  properties = {
    title: '',
    subject: '',
    author: '',
    keywords: '',
    creator: 'jsOFD ' + JSOFD_VERSION,
    creatorVersion: JSOFD_VERSION,
  };

  /** Random document identifier. */
  docID = randomHex32();
  creationDate = new Date();
  modDate: Date | null = null;
  displayMode: { zoom: number | string; layout: string; pageMode?: string } | null = null;
  viewerPrefs: Record<string, boolean> = {};
  /** Placeholder (e.g. `{total}`) replaced at output time, see `putTotalPages`. */
  totalPagesPattern: string | null = null;

  // ---- Graphics state ----------------------------------------------------
  activeFontKey = 'helvetica';
  activeFontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal';
  /** Font size in points. Like jsPDF, the size is always in pt regardless of unit. */
  fontSize = 16;
  textColor: RGB = [0, 0, 0];
  drawColor: RGB = [0, 0, 0];
  fillColor: RGB = [0, 0, 0];
  lineWidth = DEFAULT_LINE_WIDTH_PT;
  lineDash: { pattern: number[]; phase: number } | null = null;
  lineCap = 0;
  lineJoin = 0;
  /** Miter limit in points; 0 omits the attribute. */
  miterLimit = 0;
  charSpace = 0; // pt
  lineHeightFactor = 1.15;
  opacity: number | null = null;
  r2l = false;

  /** @internal Paper format used by `addPage()` without arguments. */
  _lastFormat: PageFormat = 'a4';

  /** jsPDF-style introspection surface. */
  readonly internal: {
    version: string;
    scaleFactor: number;
    pageSize: { getWidth(): number; getHeight(): number };
    numberOfPages: number;
    pages: PageData[];
    getFileId(): string;
  };

  /** Bookmark API: `doc.outline.add(parent, title, options)`. */
  readonly outline: {
    add(parent: OutlineNode | null, title: string, options?: OutlineOptions): OutlineNode;
  };

  /** Lazily created canvas-2D adapter, see `createContext2d`. */
  #ctx2d: CanvasRenderingContext2D | null = null;

  /**
   * Canvas-style drawing context (subset of `CanvasRenderingContext2D`).
   * Draw calls land on the current page as vector objects.
   */
  get context2d(): CanvasRenderingContext2D {
    if (!this.#ctx2d) this.#ctx2d = createContext2d(this);
    return this.#ctx2d;
  }

  constructor(
    options: jsOFDOptions | Orientation | string = {},
    unitArg?: string,
    formatArg?: PageFormat,
  ) {
    // jsPDF positional form: new jsOFD(orientation, unit, format)
    if (typeof options === 'string') {
      options = {
        orientation: options as Orientation,
        unit: unitArg as Unit | undefined,
        format: formatArg,
      };
    }
    const unit = String(options.unit || 'mm').toLowerCase();
    if (!isUnit(unit)) {
      throw new Error(`Invalid unit: ${unit}`);
    }
    this.unit = unit;
    this.scaleFactor = UNIT_FACTORS[unit]!;

    const ori = String(options.orientation || 'p').toLowerCase();
    this.defaultOrientation = ori === 'landscape' || ori === 'l' ? 'l' : 'p';
    this.floatPrecision = options.floatPrecision || 4;

    const firstSize = this._resolveFormat(options.format || 'a4', this.defaultOrientation);
    this._addPageWithSize(firstSize[0], firstSize[1]);

    const pages = () => this.pages;
    this.internal = {
      version: JSOFD_VERSION,
      scaleFactor: this.scaleFactor,
      pageSize: {
        getWidth: () => this.pages[this.page]!.width / this.scaleFactor,
        getHeight: () => this.pages[this.page]!.height / this.scaleFactor,
      },
      get numberOfPages() {
        return pages().length;
      },
      get pages() {
        return pages();
      },
      getFileId: () => this.docID,
    };

    this.outline = {
      add: (parent, title, options) => {
        const node: OutlineNode = {
          title: String(title),
          parent: parent || null,
          children: [],
          options: options || {},
        };
        (parent || this.outlineRoot).children.push(node);
        return node;
      },
    };
  }

  /* ---------------- Page management ---------------- */

  /** @internal Resolve a named or `[w, h]` format to a pt size pair. */
  _resolveFormat(format: PageFormat, orientation: OrientationResolved): [number, number] {
    let size: [number, number];
    if (typeof format === 'string') {
      const f = PAGE_FORMATS_MM[format.toLowerCase()];
      if (!f) throw new Error('Unknown paper format: ' + format);
      size = [f[0] * PT_PER_MM, f[1] * PT_PER_MM]; // mm → pt
    } else if (Array.isArray(format) && format.length >= 2) {
      size = [Number(format[0]) * this.scaleFactor, Number(format[1]) * this.scaleFactor];
    } else {
      throw new Error('Invalid format: ' + String(format));
    }
    if (orientation === 'l') {
      return [Math.max(size[0], size[1]), Math.min(size[0], size[1])];
    }
    return [Math.min(size[0], size[1]), Math.max(size[0], size[1])];
  }

  /** @internal Convert a coordinate in the active unit to points. */
  _u(v: number): number {
    return v * this.scaleFactor;
  }

  /** @internal Append a page sized in points and make it current. */
  _addPageWithSize(wPt: number, hPt: number): this {
    this.pages.push({ width: wPt, height: hPt, objects: [] });
    this.page = this.pages.length - 1;
    return this;
  }

  /** Append a page, optionally with a different format and orientation. */
  addPage(format?: PageFormat, orientation?: string): this {
    const f = format || this._lastFormat;
    this._lastFormat = f;
    const ori = orientation ? String(orientation).toLowerCase() : this.defaultOrientation;
    const size = this._resolveFormat(f, ori === 'landscape' || ori === 'l' ? 'l' : 'p');
    return this._addPageWithSize(size[0], size[1]);
  }

  /** Switch to a one-based page number. */
  setPage(n: number): this {
    if (n < 1 || n > this.pages.length) {
      throw new Error(`setPage: page number out of range 1-${this.pages.length}`);
    }
    this.page = n - 1;
    return this;
  }

  /** Insert an empty page before the given one-based position. */
  insertPage(beforePage?: number): this {
    const cur = this.pages[this.page]!;
    const page: PageData = { width: cur.width, height: cur.height, objects: [] };
    const at = Math.max(1, Math.min(beforePage || 1, this.pages.length + 1));
    this.pages.splice(at - 1, 0, page);
    this.page = at - 1;
    return this;
  }

  /** Move a page (default: the current one) to before another position. */
  movePage(targetPage?: number, beforePage?: number): this {
    const from = targetPage ?? this.page + 1;
    if (from < 1 || from > this.pages.length) return this;
    const pg = this.pages.splice(from - 1, 1)[0]!;
    const at = Math.max(1, Math.min(beforePage || 1, this.pages.length + 1));
    this.pages.splice(at - 1, 0, pg);
    this.page = at - 1;
    return this;
  }

  /** Delete a page (the last page is replaced by an empty one). */
  deletePage(target?: number): this {
    const at = typeof target === 'number' ? target - 1 : this.page;
    if (at < 0 || at >= this.pages.length) return this;
    if (this.pages.length > 1) {
      this.pages.splice(at, 1);
      this.page = Math.min(this.page, this.pages.length - 1);
    } else {
      this.pages[0]!.objects = [];
      this.page = 0;
    }
    return this;
  }

  /** Number of pages in the document. */
  getNumberOfPages(): number {
    return this.pages.length;
  }

  /** Width of the current page in the active unit. */
  getPageWidth(): number {
    return this.pages[this.page]!.width / this.scaleFactor;
  }

  /** Height of the current page in the active unit. */
  getPageHeight(): number {
    return this.pages[this.page]!.height / this.scaleFactor;
  }
}

// Merge feature mixins onto the prototype (types merge via `interface jsOFD`).
Object.assign(
  jsOFD.prototype,
  StateApi,
  TextApi,
  ShapeApi,
  ImageApi,
  AnnotationApi,
  AnnotationVisualApi,
  FlowApi,
  TableApi,
  HtmlApi,
  SvgApi,
  ViewApi,
);

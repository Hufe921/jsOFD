/**
 * jsOFD public type definitions.
 */

/** RGB color (0-255) */
export type RGB = [number, number, number];

/** Paper format: a name ('a4', 'letter', ...) or [width, height] in the active unit */
export type PageFormat = string | [number, number] | number[];

/** Page orientation */
export type Orientation = 'p' | 'portrait' | 'l' | 'landscape';

/** Measurement unit */
export type Unit = 'pt' | 'mm' | 'cm' | 'in' | 'inch' | 'px' | 'pc' | 'em' | 'ex';

/** Constructor options */
export interface jsOFDOptions {
  /** Page orientation, default 'p' (portrait) */
  orientation?: Orientation;
  /** Measurement unit, default 'mm' */
  unit?: Unit;
  /** Paper format, default 'a4'; may be a [width, height] array */
  format?: PageFormat;
  /** Number serialization precision (decimals), default 4 */
  floatPrecision?: number;
}

export interface EmbeddedFontFile {
  /** Raw TTF/OTF bytes written into `Doc_0/Res/`. */
  data: Uint8Array;
  /** File extension: `ttf` or `otf`. */
  ext: string;
}

/** Font style */
export type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';

/** Text alignment */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** Text baseline */
export type TextBaseline = 'alphabetic' | 'top' | 'middle' | 'bottom' | 'hanging';

/** Text rendering mode */
export type TextRenderingMode = 'fill' | 'stroke' | 'fillThenStroke' | 'invisible';

/** doc.text() options */
export interface TextOptions {
  /** Horizontal alignment, default 'left'; 'justify' requires maxWidth */
  align?: TextAlign;
  /** Rotation in degrees, clockwise around the x,y anchor */
  angle?: number;
  /** Baseline position, default 'alphabetic' (x,y marks the baseline) */
  baseline?: TextBaseline;
  /** Extra spacing between glyphs (active unit) */
  charSpace?: number;
  /** Line height factor, default 1.15 */
  lineHeightFactor?: number;
  /** Maximum line width before wrapping (active unit) */
  maxWidth?: number;
  /** Rendering mode (string or PDF Tr number 0-7) */
  renderingMode?: TextRenderingMode | number | boolean;
  /** Opacity 0-1 */
  opacity?: number;
  /** Font size override in points (jsPDF semantics) */
  fontSize?: number;
  /** Horizontal scale; 1 is unscaled (jsPDF horizontalScale) */
  horizontalScale?: number;
  /** Render right-to-left (jsPDF R2L) */
  R2L?: boolean;
}

/** Link options */
export interface LinkOptions {
  /** External URL */
  url?: string;
  /** In-document target page number (1-based) */
  pageNumber?: number;
  /** Jump magnification */
  magFactor?: 'fit' | 'fitH' | 'fitV' | number | string;
}

/** Document properties */
export interface DocProperties {
  title?: string;
  subject?: string;
  author?: string;
  keywords?: string;
  creator?: string;
  creatorVersion?: string;
}

/** addFont options */
export interface AddFontOptions {
  /** Display family name (defaults to fontName) */
  familyName?: string;
  /** Whether the font is serif */
  serif?: boolean;
  /** Whether the font is monospaced */
  fixed?: boolean;
  /** Whether the font covers CJK (full-width approximation) */
  cjk?: boolean;
  /** Ascent (1/1000 em, default 800) */
  ascent?: number;
  /** Descent (1/1000 em, negative, default -200) */
  descent?: number;
  /** Custom width table (ASCII 32..126, 1/1000 em) */
  widths?: Partial<Record<FontStyle, number[]>>;
  /** Alias for setFont lookups */
  alias?: string;
  /** Embedded font file extension override (`ttf` default, `otf` for CFF). */
  fontExt?: string;
}

/** Bookmark options */
export interface OutlineOptions {
  /** Target page number (1-based, default 1) */
  pageNumber?: number;
  /** Jump position */
  left?: number;
  top?: number;
  zoom?: number;
}

/** Bookmark node returned by doc.outline.add; pass back as parent to nest */
export interface OutlineNode {
  title: string;
  parent: OutlineNode | null;
  children: OutlineNode[];
  options: OutlineOptions;
}

/** Attachment options */
export interface AttachmentOptions {
  /** Attachment format description */
  format?: string;
  /** Description */
  description?: string;
}

/** Accepted addImage inputs */
export type ImageInput =
  | string // dataURL
  | Uint8Array
  | ArrayBuffer
  | HTMLImageElement
  | HTMLCanvasElement;

/** Image properties returned by getImageProperties */
export interface ImageProperties {
  fileType: string;
  width: number | null;
  height: number | null;
  bytes: number;
  data: Uint8Array;
}

/** addImage object-signature options */
export interface AddImageOptions {
  /** Placement and size (active unit) */
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Format PNG/JPEG/GIF/BMP/TIFF (optional for data URLs) */
  format?: string;
  /** Alias; identical data shares one resource */
  alias?: string;
  /** Rotation in degrees around the image center */
  rotation?: number;
  /** Opacity 0-1 (reserved) */
  opacity?: number;
}

/** Graphics state */
export interface GState {
  /** Opacity 0-1 */
  opacity?: number;
}

/** Reader interface preferences (jsPDF viewerPreferences) */
export interface ViewerPreferences {
  HideToolbar?: boolean;
  HideMenubar?: boolean;
  HideWindowUI?: boolean;
  FitWindow?: boolean;
}

/** Initial view (setDisplayMode) */
export interface DisplayMode {
  zoom: number | string;
  layout: string;
  pageMode: string;
}

/** output() return type ('dataurlnewwindow' returns null after opening a window) */
export type OutputResult = ArrayBuffer | Uint8Array | string | Blob | null;

/** Active font info (getFont) */
export interface FontInfo {
  fontName: string;
  fontStyle: FontStyle;
  key: string;
}

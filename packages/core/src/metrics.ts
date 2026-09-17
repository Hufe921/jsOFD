/**
 * Font registry and text metrics.
 *
 * Width tables come from the public Adobe Core 14 AFM metrics (Helvetica/Times/Courier, ASCII 32..126);
 * Chinese fonts (Song/Hei/Kai/FangSong) are approximated as full-width 1000, half-width 500.
 * No font files are embedded; FontName references the reader's local fonts.
 */

import type { EmbeddedFontFile, FontStyle } from './types';

export interface FontWidths {
  normal?: number[];
  bold?: number[];
  italic?: number[];
  bolditalic?: number[];
}

export interface FontDef {
  /** PostScript/reference name (written to FontName) */
  familyName: string;
  /** Display name (written to FamilyName) */
  displayName: string;
  serif: boolean;
  fixed: boolean;
  /** Whether the font covers CJK (full-width CJK, half-width ASCII when true) */
  cjk: boolean;
  /** Ascent (1/1000 em) */
  ascent: number;
  /** Descent (1/1000 em, negative) */
  descent: number;
  widths: FontWidths | null;
  /** Per-code-point widths in 1/1000 em (embedded fonts, exact metrics). */
  unicodeWidths?: Map<number, number>;
  /** Embedded font file; when present readers never fall back to local fonts. */
  fontFile?: EmbeddedFontFile;
}

const W_HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const W_TIMES = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500,
  500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611,
  556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722,
  722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500,
  278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541,
];
const W_TIMES_BOLD = [
  250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500,
  500, 500, 500, 500, 500, 500, 500, 333, 333, 564, 564, 564, 500, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 500, 556, 444, 556, 556, 333, 500, 556, 278, 333, 556,
  278, 833, 556, 556, 556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520,
];
const W_TIMES_ITALIC = [
  250, 333, 420, 500, 500, 833, 778, 214, 333, 333, 500, 675, 250, 333, 250, 278, 500, 500, 500,
  500, 500, 500, 500, 500, 500, 500, 333, 333, 675, 675, 675, 500, 920, 611, 611, 667, 722, 611,
  611, 722, 722, 333, 444, 667, 556, 833, 667, 722, 611, 722, 611, 500, 556, 722, 611, 833, 611,
  556, 556, 389, 278, 389, 422, 500, 333, 500, 500, 444, 500, 444, 278, 500, 500, 278, 278, 444,
  278, 722, 500, 500, 500, 500, 389, 389, 278, 500, 444, 667, 444, 444, 389, 400, 275, 400, 541,
];
const W_TIMES_BI = [
  250, 389, 555, 500, 500, 833, 778, 278, 333, 333, 500, 570, 250, 333, 250, 278, 500, 500, 500,
  500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500, 832, 667, 667, 667, 722, 611,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 667, 722, 667, 1000, 667,
  667, 667, 333, 278, 333, 584, 556, 333, 500, 500, 444, 500, 444, 333, 500, 556, 278, 278, 500,
  278, 778, 556, 500, 500, 500, 389, 389, 278, 556, 444, 667, 500, 444, 389, 348, 220, 348, 570,
];

const CJK_FONT_DEF: Omit<FontDef, 'familyName' | 'displayName'> = {
  serif: true,
  fixed: false,
  cjk: true,
  ascent: 880,
  descent: -120,
  widths: null,
};

export const BUILTIN_FONTS: Record<string, FontDef> = {
  helvetica: {
    familyName: 'Helvetica',
    displayName: 'Helvetica',
    serif: false,
    fixed: false,
    cjk: false,
    ascent: 718,
    descent: -207,
    widths: {
      normal: W_HELV,
      bold: W_HELV_BOLD,
      italic: W_HELV,
      bolditalic: W_HELV_BOLD,
    },
  },
  times: {
    familyName: 'Times New Roman',
    displayName: 'Times New Roman',
    serif: true,
    fixed: false,
    cjk: false,
    ascent: 683,
    descent: -217,
    widths: {
      normal: W_TIMES,
      bold: W_TIMES_BOLD,
      italic: W_TIMES_ITALIC,
      bolditalic: W_TIMES_BI,
    },
  },
  courier: {
    familyName: 'Courier New',
    displayName: 'Courier New',
    serif: false,
    fixed: true,
    cjk: false,
    ascent: 629,
    descent: -157,
    widths: null, // monospace 600
  },
  simsun: { familyName: 'SimSun', displayName: '宋体', ...CJK_FONT_DEF },
  simhei: {
    familyName: 'SimHei',
    displayName: '黑体',
    serif: false,
    cjk: true,
    fixed: false,
    ascent: 880,
    descent: -120,
    widths: null,
  },
  kaiti: { familyName: 'KaiTi', displayName: '楷体', ...CJK_FONT_DEF },
  fangsong: { familyName: 'FangSong', displayName: '仿宋', ...CJK_FONT_DEF },
};

export const FONT_ALIASES: Record<string, string> = {
  arial: 'helvetica',
  'arial unicode ms': 'helvetica',
  helvetica: 'helvetica',
  'helvetica-bold': 'helvetica',
  times: 'times',
  'times new roman': 'times',
  'times-roman': 'times',
  roman: 'times',
  courier: 'courier',
  'courier new': 'courier',
  'courier-new': 'courier',
  simsun: 'simsun',
  sbsimsun: 'simsun',
  宋体: 'simsun',
  songti: 'simsun',
  'song ti': 'simsun',
  simhei: 'simhei',
  黑体: 'simhei',
  hei: 'simhei',
  kaiti: 'kaiti',
  楷体: 'kaiti',
  kai: 'kaiti',
  fangsong: 'fangsong',
  仿宋: 'fangsong',
  fang: 'fangsong',
};

const STYLE_ALIASES: Record<string, FontStyle> = {
  normal: 'normal',
  regular: 'normal',
  '': 'normal',
  bold: 'bold',
  b: 'bold',
  italic: 'italic',
  i: 'italic',
  oblique: 'italic',
  bolditalic: 'bolditalic',
  bi: 'bolditalic',
  boldoblique: 'bolditalic',
  'bold italic': 'bolditalic',
};

export function normalizeStyle(style?: string): FontStyle {
  return STYLE_ALIASES[String(style || '').toLowerCase()] || 'normal';
}

export function resolveFontKey(name: string, customFonts: Record<string, FontDef>): string | null {
  const k = String(name || '')
    .toLowerCase()
    .trim();
  if (FONT_ALIASES[k]) return FONT_ALIASES[k]!;
  if (BUILTIN_FONTS[k]) return k;
  if (customFonts[k]) return k;
  return null;
}

export function isCJKCode(cp: number): boolean {
  return (
    (cp >= 0x2e80 && cp <= 0x9fff) || // CJK radicals / Han
    (cp >= 0x3000 && cp <= 0x303f) || // CJK punctuation
    (cp >= 0xff00 && cp <= 0xffef) || // fullwidth forms
    (cp >= 0x3400 && cp <= 0x4dbf) || // Extension A
    (cp >= 0xf900 && cp <= 0xfaff) || // compatibility ideographs
    (cp >= 0x20000 && cp <= 0x2ffff) // Extension B+
  );
}

export function hasCJK(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isCJKCode(text.charCodeAt(i))) return true;
  }
  return false;
}

/** Glyph width in 1/1000 em units. */
export function glyphWidth(font: FontDef, style: FontStyle, ch: string): number {
  const cp = ch.charCodeAt(0);
  if (font.unicodeWidths) {
    const w = font.unicodeWidths.get(cp);
    if (w !== undefined) return w;
    if (font.cjk && isCJKCode(cp)) return 1000;
  }
  if (font.cjk) {
    return isCJKCode(cp) ? 1000 : 500;
  }
  if (!font.widths) return 600; // Courier monospace
  const table = font.widths[style] || font.widths.normal;
  if (!table) return 556;
  if (cp >= 32 && cp <= 126) return table[cp - 32]!;
  if (cp === 0xa0) return 278;
  if (cp < 0x2000) return 556;
  return 500;
}

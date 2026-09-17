/** Document state accessors: fonts, colors and graphics state. */

import type { FontDef } from '../metrics';
import { parseFont } from '../font-parse';
import { BUILTIN_FONTS, FONT_ALIASES, hasCJK, normalizeStyle, resolveFontKey } from '../metrics';
import { parseColor, rgbToHex } from '../core/colors';
import type { AddFontOptions, FontInfo, GState } from '../types';
import type { jsOFD } from '../jsofd';

export const StateApi = {
  /** Resolve a font key to its definition (custom → builtin → Helvetica). */
  getFontDef(this: jsOFD, key: string): FontDef {
    return this.customFonts[key] || BUILTIN_FONTS[key] || BUILTIN_FONTS.helvetica!;
  },

  /**
   * Register a custom font.
   *
   * Fonts are referenced by `FontName` and resolved by the reader's local
   * font table — no font file is embedded.
   *
   * @param postScriptName unique registry key
   * @param fontName       family name written to the OFD font declaration
   * @param fontStyle      `normal` / `bold` / `italic` / `bolditalic`
   * @param opts           metrics (ascent/descent/widths) and aliases
   */
  addFont(
    this: jsOFD,
    postScriptName: string,
    fontName: string,
    fontStyle: string,
    opts: AddFontOptions = {},
  ): string {
    normalizeStyle(fontStyle); // validated for early failure; style lives per setFont()
    const key = String(postScriptName).toLowerCase();
    this.customFonts[key] = {
      familyName: fontName || postScriptName,
      displayName: opts.familyName || fontName || postScriptName,
      serif: !!opts.serif,
      fixed: !!opts.fixed,
      cjk: !!opts.cjk || hasCJK(String(fontName || '')),
      ascent: opts.ascent ?? 800,
      descent: opts.descent ?? -200,
      widths: (opts.widths as FontDef['widths']) || null,
    };
    if (opts.alias) {
      FONT_ALIASES[String(opts.alias).toLowerCase()] = key;
    }
    return key;
  },

  /**
   * Register a font with an embedded file (recommended for CJK documents).
   *
   * Parses the font for exact metrics (units per em, ascent/descent, per-glyph
   * advance widths via cmap/hmtx) and writes the bytes into the OFD package as
   * `FontFile`. Embedded fonts render identically in every reader — unembedded
   * fonts depend on the reader's local font table and may show garbage glyphs.
   *
   * Registering a key that matches a built-in (`'simsun'`, `'simhei'`, ...)
   * overrides it, so existing code keeps working while gaining embedding.
   *
   * @param postScriptName registry key, e.g. `'simsun'` or `'MyFont'`
   * @param fontName       family name written to the OFD font declaration
   * @param ttfData        TTF/OTF (or TTC) file bytes
   */
  addFontTtf(
    this: jsOFD,
    postScriptName: string,
    fontName: string,
    ttfData: Uint8Array,
    opts: AddFontOptions = {},
  ): string {
    const parsed = parseFont(ttfData);
    const key = String(postScriptName).toLowerCase();
    const scale = (v: number): number => Math.round((v / (parsed?.unitsPerEm || 1000)) * 1000);
    const ext = opts.fontExt || 'ttf';
    const def: FontDef = {
      familyName: fontName || postScriptName,
      displayName: opts.familyName || fontName || postScriptName,
      serif: !!opts.serif,
      fixed: !!opts.fixed,
      cjk: opts.cjk ?? true, // embedded fonts are assumed to cover the glyphs they map
      ascent: opts.ascent ?? (parsed ? scale(parsed.ascent) : 800),
      descent: opts.descent ?? (parsed ? scale(parsed.descent) : -200),
      widths: (opts.widths as FontDef['widths']) || null,
      unicodeWidths: parsed?.widths
        ? new Map([...parsed.widths].map(([cp, w]) => [cp, scale(w)] as const))
        : undefined,
      fontFile: { data: ttfData, ext },
    };
    this.customFonts[key] = def;
    if (opts.alias) {
      FONT_ALIASES[String(opts.alias).toLowerCase()] = key;
    }
    return key;
  },

  /**
   * Select the active font.
   *
   * Accepts PostScript names (`Helvetica-Bold`), family names (`helvetica`,
   * `times`), common Chinese names (`宋体`, `黑体`, `楷体`, `仿宋`) and any
   * previously registered custom key or alias.
   */
  setFont(this: jsOFD, fontName: string, fontStyle?: string): jsOFD {
    if (fontStyle !== undefined) {
      this.activeFontStyle = normalizeStyle(fontStyle);
    }
    const key = resolveFontKey(fontName, this.customFonts) || String(fontName).toLowerCase();
    if (!this.customFonts[key] && !BUILTIN_FONTS[key]) {
      this.addFont(fontName, fontName, this.activeFontStyle);
    }
    this.activeFontKey = key;
    return this;
  },

  /** Set the font size in points (independent of the document unit, like jsPDF). */
  setFontSize(this: jsOFD, size: number): jsOFD {
    this.fontSize = Number(size);
    return this;
  },

  /** Active font size in points (default 16, like jsPDF). */
  getFontSize(this: jsOFD): number {
    return this.fontSize;
  },

  /** Set extra spacing between glyphs, in the active unit. */
  setCharSpace(this: jsOFD, space: number): jsOFD {
    this.charSpace = Number(space) * this.scaleFactor;
    return this;
  },

  /** Active character spacing in the active unit. */
  getCharSpace(this: jsOFD): number {
    return this.charSpace / this.scaleFactor;
  },

  /** Set the line height factor (default 1.15, like jsPDF). */
  setLineHeightFactor(this: jsOFD, f: number): jsOFD {
    this.lineHeightFactor = Number(f) || 1.15;
    return this;
  },

  /** Registered font keys, built-in first. */
  getFontList(this: jsOFD): string[] {
    const list: string[] = Object.keys(BUILTIN_FONTS);
    for (const k of Object.keys(this.customFonts)) {
      list.push(this.customFonts[k]!.familyName);
    }
    return list;
  },

  /** Information about the active font (jsPDF `getFont()`). */
  getFont(this: jsOFD): FontInfo {
    return {
      fontName: this.getFontDef(this.activeFontKey).familyName,
      fontStyle: this.activeFontStyle,
      key: this.activeFontKey,
    };
  },

  /** Set the text fill color (`r` may also be a color name or hex string). */
  setTextColor(this: jsOFD, r: number | string, g?: number, b?: number): jsOFD {
    this.textColor = parseColor([r, g, b]);
    return this;
  },

  /** Active text color as `#rrggbb` (jsPDF getter semantics). */
  getTextColor(this: jsOFD): string {
    return rgbToHex(this.textColor);
  },

  /** Set the stroke color used by shape outlines. */
  setDrawColor(this: jsOFD, r: number | string, g?: number, b?: number): jsOFD {
    this.drawColor = parseColor([r, g, b]);
    return this;
  },

  /** Active stroke color as `#rrggbb`. */
  getDrawColor(this: jsOFD): string {
    return rgbToHex(this.drawColor);
  },

  /** Set the fill color used by filled shapes. */
  setFillColor(this: jsOFD, r: number | string, g?: number, b?: number): jsOFD {
    this.fillColor = parseColor([r, g, b]);
    return this;
  },

  /** Active fill color as `#rrggbb`. */
  getFillColor(this: jsOFD): string {
    return rgbToHex(this.fillColor);
  },

  /** Set the stroke width in the active unit. */
  setLineWidth(this: jsOFD, width: number): jsOFD {
    this.lineWidth = Number(width) * this.scaleFactor;
    return this;
  },

  /** Active stroke width in the active unit. */
  getLineWidth(this: jsOFD): number {
    return this.lineWidth / this.scaleFactor;
  },

  /** Set the dash pattern (active unit); an empty array clears dashing. */
  setLineDashPattern(this: jsOFD, dashArray: number[], dashPhase?: number): jsOFD {
    const sf = this.scaleFactor;
    this.lineDash = {
      pattern: (dashArray || []).map((v) => Number(v) * sf),
      phase: (Number(dashPhase) || 0) * sf,
    };
    return this;
  },

  /** Active dash pattern in the active unit. */
  getLineDashPattern(this: jsOFD): number[] {
    return this.lineDash ? this.lineDash.pattern.map((v) => v / this.scaleFactor) : [];
  },

  /** Set the line cap: 0 butt, 1 round, 2 square (names accepted). */
  setLineCap(this: jsOFD, style: number | 'butt' | 'round' | 'square'): jsOFD {
    if (typeof style === 'number') this.lineCap = style;
    else this.lineCap = style === 'round' ? 1 : style === 'square' ? 2 : 0;
    return this;
  },

  /** Active line cap (0-2). */
  getLineCap(this: jsOFD): number {
    return this.lineCap;
  },

  /** Set the line join: 0 miter, 1 round, 2 bevel (names accepted). */
  setLineJoin(this: jsOFD, style: number | 'miter' | 'round' | 'bevel'): jsOFD {
    if (typeof style === 'number') this.lineJoin = style;
    else this.lineJoin = style === 'round' ? 1 : style === 'bevel' ? 2 : 0;
    return this;
  },

  /** Active line join (0-2). */
  getLineJoin(this: jsOFD): number {
    return this.lineJoin;
  },

  /** Set the miter limit (active unit); values ≤ 1 omit the attribute. */
  setLineMiterLimit(this: jsOFD, limit: number): jsOFD {
    if (typeof limit !== 'number' || isNaN(limit)) {
      throw new Error('Invalid argument passed to jsOFD.setLineMiterLimit');
    }
    this.miterLimit = limit * this.scaleFactor;
    return this;
  },

  /** Active miter limit in the active unit. */
  getLineMiterLimit(this: jsOFD): number {
    return this.miterLimit / this.scaleFactor;
  },

  /** Line height in points: font size × line height factor. */
  getLineHeight(this: jsOFD): number {
    return this.fontSize * this.lineHeightFactor;
  },

  /** Enable or disable right-to-left rendering. */
  setR2L(this: jsOFD, value: boolean): jsOFD {
    this.r2l = Boolean(value);
    return this;
  },

  /** Whether right-to-left rendering is active. */
  getR2L(this: jsOFD): boolean {
    return this.r2l;
  },

  /**
   * Apply a graphics state.
   *
   * Only `opacity` is supported; other GState keys are ignored (OFD models
   * blend modes differently from PDF).
   */
  setGState(this: jsOFD, gs: GState): jsOFD {
    if (gs && typeof gs.opacity === 'number') {
      this.opacity = Math.max(0, Math.min(1, gs.opacity));
    }
    return this;
  },

  /** Set the rendering opacity for subsequent objects (0-1). */
  setOpacity(this: jsOFD, opacity: number): jsOFD {
    this.opacity = Math.max(0, Math.min(1, Number(opacity)));
    return this;
  },
};

export type StateApi = typeof StateApi;

// Declaration merging attaches the mixin's members to jsOFD.

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends StateApi {}
}

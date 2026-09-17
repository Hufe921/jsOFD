/** Text layout and rendering: measurement, line breaking and `text()`. */

import type { FontDef } from '../metrics';
import { BUILTIN_FONTS, glyphWidth, hasCJK } from '../metrics';
import type { FontStyle, LinkOptions, TextOptions } from '../types';
import type { jsOFD } from '../jsofd';

export const TextApi = {
  /**
   * Measure the width of `text` in points for an explicit font and size.
   *
   * Exposed publicly because jsPDF relies on `doc.measure`-style hooks for
   * plugins such as autotable.
   */
  measure(
    this: jsOFD,
    text: string,
    fontDef: FontDef,
    style: FontStyle,
    sizePt: number,
    charSpacePt: number,
  ): number {
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      w += glyphWidth(fontDef, style, text.charAt(i));
    }
    w = (w / 1000) * sizePt;
    if (charSpacePt) w += charSpacePt * text.length;
    return w;
  },

  /** String width in font units (jsPDF `getStringUnitWidth`). */
  getStringUnitWidth(this: jsOFD, text: string): number {
    return this.measure(text, this.getFontDef(this.activeFontKey), this.activeFontStyle, 1, 0);
  },

  /**
   * Per-character widths in points (jsPDF `getCharWidthsArray`).
   *
   * @param options override `fontSize` (default: active) and `charSpace`
   */
  getCharWidthsArray(
    this: jsOFD,
    text: string,
    options?: { fontSize?: number; charSpace?: number },
  ): number[] {
    const size = typeof options?.fontSize === 'number' ? options.fontSize : this.fontSize;
    const cs = typeof options?.charSpace === 'number' ? this._u(options.charSpace) : this.charSpace;
    const def = this.getFontDef(this.activeFontKey);
    const widths: number[] = [];
    for (let i = 0; i < text.length; i++) {
      widths.push((glyphWidth(def, this.activeFontStyle, text.charAt(i)) / 1000) * size + cs);
    }
    return widths;
  },

  /** Width of `text` at the active font and size, in the active unit. */
  getTextWidth(this: jsOFD, text: string): number {
    return (
      this.measure(
        text,
        this.getFontDef(this.activeFontKey),
        this.activeFontStyle,
        this.fontSize,
        this.charSpace,
      ) / this.scaleFactor
    );
  },

  /** Split `text` into lines that fit `maxWidth` (active unit). */
  splitTextToSize(this: jsOFD, text: string, maxWidth: number): string[] {
    return this._splitCore(
      text,
      this._u(Number(maxWidth)),
      this.getFontDef(this.activeFontKey),
      this.activeFontStyle,
    );
  },

  /**
   * Line-breaking core.
   *
   * Breaks Latin text at spaces, CJK text between any two characters, and
   * hard-splits words longer than the line width (jsPDF behaviour).
   *
   * @internal maxWidthPt is in points
   */
  _splitCore(
    this: jsOFD,
    text: string,
    maxWidthPt: number,
    fontDef: FontDef,
    style: FontStyle,
  ): string[] {
    const size = this.fontSize;
    const cs = this.charSpace;
    const width = (s: string) => this.measure(s, fontDef, style, size, cs);
    const out: string[] = [];

    for (const para of String(text).split(/\r\n|\r|\n/)) {
      if (para === '' || width(para) <= maxWidthPt) {
        out.push(para);
        continue;
      }
      // Tokenize: CJK characters break anywhere, Latin runs form words.
      const tokens: string[] = [];
      let buf = '';
      for (const ch of para) {
        const cp = ch.charCodeAt(0);
        if (ch === ' ') {
          if (buf) {
            tokens.push(buf);
            buf = '';
          }
          tokens.push(' ');
        } else if (
          (cp >= 0x2e80 && cp <= 0x9fff) ||
          (cp >= 0x3000 && cp <= 0x303f) ||
          (cp >= 0xff00 && cp <= 0xffef) ||
          (cp >= 0x3400 && cp <= 0x4dbf) ||
          (cp >= 0xf900 && cp <= 0xfaff) ||
          (cp >= 0x20000 && cp <= 0x2ffff)
        ) {
          if (buf) {
            tokens.push(buf);
            buf = '';
          }
          tokens.push(ch);
        } else {
          buf += ch;
        }
      }
      if (buf) tokens.push(buf);

      let line = '';
      for (const tk of tokens) {
        const candidate = line + tk;
        if (width(candidate) <= maxWidthPt) {
          line = candidate;
          continue;
        }
        if (line !== '') {
          out.push(line.replace(/ +$/, ''));
          line = '';
        }
        if (tk === ' ') continue;
        if (width(tk) > maxWidthPt) {
          // Token longer than the line: hard split.
          let piece = '';
          for (const c of tk) {
            if (width(piece + c) <= maxWidthPt) {
              piece += c;
            } else {
              out.push(piece);
              piece = c;
            }
          }
          line = piece;
        } else {
          line = tk;
        }
      }
      if (line !== '') out.push(line.replace(/ +$/, ''));
    }
    return out;
  },

  /**
   * Write text at `(x, y)`.
   *
   * The anchor is the left end of the baseline unless changed through the
   * `baseline` option. Multi-line input is accepted as `\n` separated text
   * or an array of lines; `maxWidth` enables automatic wrapping.
   *
   * Supports the legacy jsPDF argument order `text(x, y, text, options)`.
   */
  text(
    this: jsOFD,
    text: string | string[] | number,
    x: number | string | string[],
    y: number | string | TextOptions,
    optionsOrNothing?: TextOptions,
  ): jsOFD {
    // Legacy jsPDF signature: doc.text(x, y, text, options)
    let textStr: string | string[];
    let xNum: number;
    let yNum: number;
    let options: TextOptions;
    if (typeof text === 'number') {
      xNum = text;
      yNum = Number(x);
      textStr = y as unknown as string;
      options = optionsOrNothing || {};
    } else {
      textStr = text;
      xNum = Number(x);
      yNum = Number(y);
      options = (y as unknown as TextOptions) || {};
      if (optionsOrNothing) options = optionsOrNothing;
    }
    if (typeof textStr !== 'string' && !Array.isArray(textStr)) {
      throw new Error('Invalid arguments passed to jsOFD.text');
    }
    x = this._u(xNum);
    y = this._u(yNum);
    const angle = Number(options.angle || 0);
    const align = String(options.align || 'left').toLowerCase();
    if (!['left', 'center', 'right', 'justify'].includes(align)) {
      throw new Error('Unrecognized alignment option, use "left", "center", "right" or "justify".');
    }
    const baseline = String(options.baseline || 'alphabetic').toLowerCase();
    const charSpace =
      typeof options.charSpace === 'number' ? this._u(options.charSpace) : this.charSpace;
    const lineHeightFactor =
      typeof options.lineHeightFactor === 'number'
        ? options.lineHeightFactor
        : this.lineHeightFactor;
    const size = typeof options.fontSize === 'number' ? options.fontSize : this.fontSize;
    const style = this.activeFontStyle;
    let fontKey = this.activeFontKey;
    let fontDef = this.getFontDef(fontKey);

    // Switch to a CJK-capable font when the active font cannot render CJK
    // (embedded fonts already ship their glyphs, so they always qualify).
    const raw = Array.isArray(textStr) ? textStr.join('\n') : String(textStr);
    if (!fontDef.cjk && !fontDef.fontFile && hasCJK(raw)) {
      fontKey = 'simsun';
      fontDef = BUILTIN_FONTS.simsun!;
    }

    const renderingMode = String(options.renderingMode || 'fill');
    const opacity =
      typeof options.opacity === 'number'
        ? Math.max(0, Math.min(1, options.opacity))
        : this.opacity;
    const hScale =
      typeof options.horizontalScale === 'number' && options.horizontalScale > 0
        ? options.horizontalScale
        : 1;
    const r2l = typeof options.R2L === 'boolean' ? options.R2L : this.r2l;

    // Line breaking.
    let lines: string[];
    if (
      typeof options.maxWidth === 'number' &&
      isFinite(options.maxWidth) &&
      options.maxWidth > 0
    ) {
      lines = this._splitCore(raw, this._u(options.maxWidth) * hScale, fontDef, style);
    } else {
      lines = Array.isArray(textStr) ? textStr.slice() : raw.split(/\r\n|\r|\n/);
    }
    if (r2l) {
      lines = lines.map((l) => Array.from(l).reverse().join(''));
    }

    const ascentPt = (fontDef.ascent / 1000) * size;
    const descentPt = (-fontDef.descent / 1000) * size;
    const leading = size * lineHeightFactor;
    const justify = align === 'justify';
    const alignEff = justify ? 'left' : align;
    const rad = (angle * Math.PI) / 180;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] === undefined || lines[i] === null ? '' : String(lines[i]);
      if (lineText.length === 0 && lines.length > 1) continue; // blank lines collapse
      const w = this.measure(lineText, fontDef, style, size, charSpace) * hScale;
      let lineX = x;
      if (alignEff === 'center') lineX = x - w / 2;
      else if (alignEff === 'right') lineX = x - w;

      // Baseline offset (jsPDF baseline semantics).
      let baseY = y;
      if (baseline === 'top') baseY = y + ascentPt;
      else if (baseline === 'middle') baseY = y + (ascentPt - descentPt) / 2;
      else if (baseline === 'bottom') baseY = y + descentPt;
      else if (baseline === 'hanging') baseY = y + ascentPt * 0.8;

      // Advance along the rotated baseline for subsequent lines.
      baseY += i * leading * Math.cos(rad);
      lineX += -i * leading * Math.sin(rad);

      this.pages[this.page]!.objects.push({
        t: 'text',
        x: lineX,
        y: baseY,
        text: lineText,
        size,
        fontKey,
        style,
        color: this.textColor.slice() as [number, number, number],
        charSpace,
        angle,
        ascent: ascentPt,
        descent: descentPt,
        renderingMode,
        opacity,
        justifyWidth:
          justify && i < lines.length - 1 ? this._u(Number(options.maxWidth)) * hScale : null,
        hScale,
      });
    }
    return this;
  },

  /**
   * Write text wrapped in a clickable link annotation.
   *
   * Pass `url` for an external target or `pageNumber` for an in-document jump.
   */
  textWithLink(
    this: jsOFD,
    text: string,
    x: number,
    y: number,
    options: TextOptions & LinkOptions = {},
  ): jsOFD {
    const sizePt = typeof options.fontSize === 'number' ? options.fontSize : this.fontSize;
    this.text(text, x, y, options);
    const width = this.getTextWidth(String(text));
    const sizeU = sizePt / this.scaleFactor;
    this.link(x, y - sizeU * 0.85, width, sizeU, options);
    return this;
  },
};

/** Structural type of the mixin (merged into jsOFD via declaration merging). */
export type TextApi = typeof TextApi;

// Declaration merging attaches the mixin's members to jsOFD.

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends TextApi {}
}

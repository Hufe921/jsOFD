/**
 * Embedded font support: TTF parsing, registration and OFD packaging.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jsOFD } from '../src/index';
import { parseFont } from '../src/font-parse';
import { readZip, text } from './helpers/zipreader';

/** Arial Unicode MS covers both Latin and CJK; ships with macOS. */
const TTF_PATH = '/Library/Fonts/Arial Unicode.ttf';
const ttf = readFileSync(TTF_PATH);

describe('parseFont', () => {
  it('reads units per em, vertical metrics and cmap widths', () => {
    const f = parseFont(ttf);
    expect(f).not.toBeNull();
    expect(f!.unitsPerEm).toBeGreaterThan(500);
    // Arial Unicode: ascent 1878/2048 ≈ 917 per mille, descent -458 ≈ -224.
    expect(Math.round((f!.ascent / f!.unitsPerEm) * 1000)).toBeGreaterThan(700);
    expect(f!.descent).toBeLessThan(0);
    // Latin 'A' present with a positive advance.
    expect(f!.glyphs.get(0x41)).toBeGreaterThan(0);
    expect(f!.widths.get(0x41)).toBeGreaterThan(0);
    // CJK coverage: U+4E2D (中).
    expect(f!.glyphs.has(0x4e2d)).toBe(true);
  });

  it('returns null for non-font data', () => {
    expect(parseFont(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });
});

describe('addFontTtf / embedding', () => {
  it('registers exact metrics and overrides the builtin key', () => {
    const doc = new jsOFD();
    doc.addFontTtf('simsun', 'Embedded Sans', ttf);
    doc.setFont('simsun');
    const def = doc.getFontDef('simsun');
    expect(def.fontFile).toBeDefined();
    expect(def.unicodeWidths?.get(0x41)).toBeGreaterThan(0);
  });

  it('serializes the font file into Doc_0/Res with a FontFile reference', () => {
    const doc = new jsOFD();
    doc.addFontTtf('simsun', 'Embedded Sans', ttf);
    doc.setFont('simsun');
    doc.text('中文 embedded', 20, 40);
    const zip = readZip(doc.output('uint8array') as Uint8Array);
    const pub = text(zip, 'Doc_0/PublicRes.xml');
    expect(pub).toMatch(/<ofd:FontFile>Font_0\.ttf<\/ofd:FontFile>/);
    const names = [...zip.keys()];
    const fontEntry = names.find((n) => /^Doc_0\/Res\/Font_0\.ttf$/.test(n));
    expect(fontEntry).toBeDefined();
    expect(zip.get(fontEntry!)!.length).toBe(ttf.length);
    const c0 = text(zip, 'Doc_0/Pages/Page_0/Content.xml');
    expect(c0).toContain('中文 embedded');
  });

  it('deduplicates identical font data across registrations', () => {
    const doc = new jsOFD();
    doc.addFontTtf('simsun', 'Font A', ttf);
    doc.addFontTtf('kaiti', 'Font B', ttf);
    doc.setFont('simsun');
    doc.text('甲', 10, 10);
    doc.setFont('kaiti');
    doc.text('乙', 10, 30);
    const zip = readZip(doc.output('uint8array') as Uint8Array);
    const fontFiles = [...zip.keys()].filter((n) => /Res\/Font_\d+\.ttf$/.test(n));
    expect(fontFiles.length).toBe(1);
  });

  it('DeltaX uses exact embedded advance widths', () => {
    const doc = new jsOFD();
    doc.addFontTtf('simsun', 'Embedded Sans', ttf);
    doc.setFont('simsun');
    doc.setFontSize(20);
    doc.text('AB', 10, 10);
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    const parsed = parseFont(ttf)!;
    const scale = 20 / parsed.unitsPerEm; // pt per font unit
    const mm = (25.4 / 72) * scale * parsed.widths.get(0x41)!;
    const expectMm = Number(mm.toFixed(4)).toString();
    expect(c0).toContain(`DeltaX="${expectMm}`);
  });
});

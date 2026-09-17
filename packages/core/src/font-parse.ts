/**
 * Minimal TrueType/OpenType font parser.
 *
 * Extracts just enough data to embed a font and lay out text: units per em,
 * vertical metrics, the cmap (unicode → glyph) table and per-glyph advance
 * widths. CFF-flavoured OTF works as well because hmtx/cmap are shared.
 */

export interface ParsedFont {
  /** Units per em (typically 1000 or 2048). */
  unitsPerEm: number;
  /** Typographic ascent in font units. */
  ascent: number;
  /** Typographic descent in font units (negative). */
  descent: number;
  /** Advance width per unicode code point, in font units. */
  widths: Map<number, number>;
  /** Glyph id per code point (needed by CGTransform in some readers). */
  glyphs: Map<number, number>;
}

interface TableDir {
  tag: string;
  offset: number;
  length: number;
}

function readTables(dv: DataView, base: number): TableDir[] {
  const numTables = dv.getUint16(base + 4);
  const tables: TableDir[] = [];
  for (let i = 0; i < numTables; i++) {
    const at = base + 12 + i * 16;
    tables.push({
      tag: String.fromCharCode(
        dv.getUint8(at),
        dv.getUint8(at + 1),
        dv.getUint8(at + 2),
        dv.getUint8(at + 3),
      ),
      offset: base + dv.getUint32(at + 8),
      length: dv.getUint32(at + 12),
    });
  }
  return tables;
}

function parseCmap(dv: DataView, table: TableDir): Map<number, number> {
  const map = new Map<number, number>();
  const base = table.offset;
  const numTables = dv.getUint16(base + 2);
  for (let i = 0; i < numTables; i++) {
    const subAt = base + 4 + i * 8;
    const platform = dv.getUint16(subAt);
    const encoding = dv.getUint16(subAt + 2);
    const offset = base + dv.getUint32(subAt + 4);
    const format = dv.getUint16(offset);
    // (3, 1) Windows Unicode BMP, (0, x) Unicode, (3, 10) UCS-4.
    const interesting = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!interesting) continue;
    if (format === 4) {
      parseCmap4(dv, offset, map);
    } else if (format === 12) {
      parseCmap12(dv, offset, map);
    }
  }
  return map;
}

function parseCmap4(dv: DataView, offset: number, map: Map<number, number>): void {
  const segCountX2 = dv.getUint16(offset + 6);
  const segCount = segCountX2 / 2;
  const endAt = offset + 14;
  const startAt = endAt + segCountX2 + 2;
  const deltaAt = startAt + segCountX2;
  const rangeAt = deltaAt + segCountX2;
  for (let s = 0; s < segCount; s++) {
    const end = dv.getUint16(endAt + s * 2);
    const start = dv.getUint16(startAt + s * 2);
    const delta = dv.getInt16(deltaAt + s * 2);
    const rangeOffsetPos = rangeAt + s * 2;
    const rangeOffset = dv.getUint16(rangeOffsetPos);
    if (start === 0xffff) continue;
    for (let c = start; c <= end && c - start < 0x400; c++) {
      let gid: number;
      if (rangeOffset === 0) {
        gid = (c + delta) & 0xffff;
      } else {
        const glyphAt = rangeOffsetPos + rangeOffset + (c - start) * 2;
        if (glyphAt + 1 >= dv.byteLength) continue;
        gid = dv.getUint16(glyphAt);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
      }
      if (gid !== 0 && !map.has(c)) map.set(c, gid);
    }
  }
}

function parseCmap12(dv: DataView, offset: number, map: Map<number, number>): void {
  const nGroups = dv.getUint32(offset + 12);
  for (let g = 0; g < nGroups; g++) {
    const at = offset + 16 + g * 12;
    const start = dv.getUint32(at);
    const end = dv.getUint32(at + 4);
    const startGid = dv.getUint32(at + 8);
    for (let c = start; c <= end && c - start < 0x10000; c++) {
      if (!map.has(c)) map.set(c, startGid + (c - start));
    }
  }
}

/**
 * Parse a TTF/OTF/TTC file. For TTC collections the first font is used.
 * Returns null when the file cannot be parsed.
 */
export function parseFont(data: Uint8Array): ParsedFont | null {
  try {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tag = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    const version = dv.getUint32(0);
    let base = 0;
    if (tag === 'ttcf')
      base = dv.getUint32(12); // first font of the collection
    else if (version !== 0x00010000 && tag !== 'OTTO' && tag !== 'true') return null;

    const tables = readTables(dv, base);
    const byTag = (t: string): TableDir | undefined => tables.find((x) => x.tag === t);
    const head = byTag('head');
    const hhea = byTag('hhea');
    const hmtx = byTag('hmtx');
    const cmap = byTag('cmap');
    if (!head || !hhea || !hmtx || !cmap) return null;

    const unitsPerEm = dv.getUint16(head.offset + 18);
    let ascent = dv.getInt16(hhea.offset + 4);
    let descent = dv.getInt16(hhea.offset + 6);
    // OS/2 usWinAscent/usWinDescent is what most renderers actually use;
    // take the larger values to avoid glyph clipping in strict readers.
    const os2 = byTag('OS/2');
    if (os2) {
      const winAscent = dv.getUint16(os2.offset + 74);
      const winDescent = dv.getUint16(os2.offset + 76);
      ascent = Math.max(ascent, winAscent);
      // hhea descent is negative; OS/2 usWinDescent is a positive distance.
      // Take the larger magnitude (more negative) to avoid clipping.
      descent = Math.min(descent, -winDescent);
    }
    const numHMetrics = dv.getUint16(hhea.offset + 34);

    const advanceOf = (gid: number): number => {
      const i = Math.min(gid, numHMetrics - 1);
      return dv.getUint16(hmtx.offset + i * 4);
    };

    const glyphMap = parseCmap(dv, cmap);
    const widths = new Map<number, number>();
    for (const [code, gid] of glyphMap) {
      widths.set(code, advanceOf(gid));
    }
    return { unitsPerEm, ascent, descent, widths, glyphs: glyphMap };
  } catch {
    return null;
  }
}

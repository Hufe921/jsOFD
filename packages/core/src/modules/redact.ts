/**
 * Keyword redaction (15.9.1): locate keywords inside laid-out text runs and
 * mask them without disturbing the layout.
 *
 * Both modes rewrite the run's text in place — block fills the gap with
 * spaces, asterisk replaces the keyword characters with `*` — while the
 * per-glyph advances (glyphWs) stay untouched, so surrounding glyphs keep
 * their exact positions. 'block' additionally draws an opaque rectangle over
 * the keyword's bounding box.
 *
 * Rotated runs (angle ≠ 0) are skipped: their mask would need a rotated
 * rectangle, which PathRun cannot express.
 */

import type { jsOFD } from '../jsofd';
import { glyphWidth } from '../metrics';
import type { PathRun } from '../model';
import type { RGB } from '../types';

export interface RedactOptions {
  /**
   * 'block' draws an opaque rectangle over the keyword and blanks its text
   * (default); 'asterisk' replaces the keyword characters with `*`.
   */
  mode?: 'block' | 'asterisk';
  /** Rectangle fill colour for 'block' (default black). */
  color?: RGB;
  /** Which pages to process (default 'all'). */
  pages?: 'all' | 'current' | number[];
}

export interface RedactionHit {
  keyword: string;
  /** One-based page index; 0 when the keyword never matched. */
  page: number;
  count: number;
}

export interface RedactApi {
  /**
   * Redact keyword occurrences across laid-out text.
   *
   * @example
   * doc.redact(['王小明', '138****8000']);
   * const hits = doc.redact('绝密', { mode: 'asterisk' });
   */
  redact(this: jsOFD, keywords: string | string[], options?: RedactOptions): RedactionHit[];
}

function pageIndices(this: jsOFD, sel: RedactOptions['pages']): number[] {
  if (typeof sel === 'number') return [sel - 1];
  if (Array.isArray(sel)) return sel.map((n) => n - 1);
  if (sel === 'current') return [this.page];
  return this.pages.map((_, i) => i);
}

/** Advance of one character in pt, mirroring the builder's DeltaX formula. */
function charAdvance(
  doc: jsOFD,
  run: { fontKey: string; style: string; size: number; charSpace: number; glyphWs?: number[] },
  index: number,
  ch: string,
): number {
  if (run.glyphWs && run.glyphWs[index] !== undefined) return run.glyphWs[index]!;
  const def = doc.getFontDef(run.fontKey);
  return (glyphWidth(def, run.style as 'normal', ch) / 1000) * run.size + run.charSpace;
}

export const RedactApi = {
  redact(this: jsOFD, keywords: string | string[], options: RedactOptions = {}): RedactionHit[] {
    const list = Array.isArray(keywords) ? keywords : [keywords];
    const mode = options.mode ?? 'block';
    const color: RGB = options.color ?? [0, 0, 0];
    const hits: RedactionHit[] = [];

    for (const keyword of list) {
      if (!keyword) continue;
      const perPage = new Map<number, number>();

      for (const idx of pageIndices.call(this, options.pages)) {
        const page = this.pages[idx];
        if (!page) continue;
        const rects: PathRun[] = [];

        for (const obj of page.objects) {
          if (obj.t !== 'text' || obj.angle) continue;
          let from = 0;
          for (;;) {
            const at = obj.text.indexOf(keyword, from);
            if (at === -1) break;

            // x of the keyword start / end along the baseline
            let startX = 0;
            for (let i = 0; i < at; i++) {
              startX += charAdvance(this, obj, i, obj.text[i]!);
            }
            let width = 0;
            for (let i = at; i < at + keyword.length; i++) {
              width += charAdvance(this, obj, i, obj.text[i]!);
            }
            const hScale = obj.hScale || 1;
            const x0 = obj.x + startX * hScale;
            const w = width * hScale;
            const y0 = obj.y - (obj.ascent || obj.size * 0.8);
            const h = (obj.ascent || obj.size * 0.8) + (obj.descent || obj.size * 0.2);

            if (mode === 'block') {
              rects.push({
                t: 'path',
                ops: [
                  { op: 'M', x: x0, y: y0 },
                  { op: 'L', x: x0 + w, y: y0 },
                  { op: 'L', x: x0 + w, y: y0 + h },
                  { op: 'L', x: x0, y: y0 + h },
                  { op: 'Z' },
                ],
                fill: true,
                stroke: false,
                fillColor: color,
                strokeColor: color,
                lineWidth: 0,
                dash: null,
                cap: 0,
                join: 0,
                miterLimit: 3.528,
                opacity: null,
              });
            }

            // Mask the text itself so extraction/copy no longer leaks it.
            const mask = mode === 'block' ? ' '.repeat(keyword.length) : '*'.repeat(keyword.length);
            obj.text = obj.text.slice(0, at) + mask + obj.text.slice(at + keyword.length);
            from = at + mask.length;
            perPage.set(idx, (perPage.get(idx) ?? 0) + 1);
          }
        }

        // Rects go on top of the (masked) text.
        page.objects.push(...rects);
      }

      for (const [pageIndex, count] of perPage) {
        hits.push({ keyword, page: pageIndex + 1, count });
      }
      if (!perPage.size) hits.push({ keyword, page: 0, count: 0 });
    }

    return hits;
  },
};

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends RedactApi {}
}

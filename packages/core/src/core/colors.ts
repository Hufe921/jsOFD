/**
 * Color parsing and resolution.
 *
 * Accepts the same color input shapes as jsPDF: numeric channels `(r, g, b)`,
 * single-value grayscale, CSS color names, `#rgb` / `#rrggbb` hex strings and
 * grayscale strings such as `"0.502"`.
 */

import { CSS_COLORS } from '../css-colors';
import type { RGB } from '../types';

/** Parse a jsPDF-style color argument list into an RGB triple (0-255). */
export function parseColor(args: unknown[]): RGB {
  const a0 = args[0];
  if (typeof a0 === 'string') {
    const m = a0.trim().toLowerCase();
    if (m.charAt(0) === '#') {
      let hex = m.slice(1);
      if (hex.length === 3) {
        hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;
      }
      if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return [0, 0, 0];
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    const named = CSS_COLORS[m];
    if (named) {
      return [
        parseInt(named.slice(0, 2), 16),
        parseInt(named.slice(2, 4), 16),
        parseInt(named.slice(4, 6), 16),
      ];
    }
    // Grayscale string, e.g. "0.502" (jsPDF semantics).
    const g = Number(m);
    if (!isNaN(g) && m !== '') {
      const v = Math.max(0, Math.min(255, Math.round(g * 255)));
      return [v, v, v];
    }
    return [0, 0, 0];
  }
  const defined = args.filter((v) => v !== undefined && v !== null && v !== '');
  const n = defined.map((v) => Number(v) | 0);
  if (n.length >= 3) return [n[0]!, n[1]!, n[2]!];
  const g = n[0] ?? 0;
  return [g, g, g];
}

/** Format an RGB triple as `#rrggbb` (jsPDF color getter semantics). */
export function rgbToHex(c: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/**
 * Decode a jsPDF draw style string into fill/stroke flags.
 *
 * Styles: `"S"` stroke, `"F"` fill, `"FD"` / `"DF"` fill + stroke
 * (`D` = drawn). Unknown input falls back to stroke-only, like jsPDF.
 */
export function styleFlags(style?: string): { fill: boolean; stroke: boolean } {
  const s = String(style || 'S')
    .toUpperCase()
    .replace(/\*/g, '');
  const fill = s.includes('F');
  const stroke = s.includes('S') || s.includes('D');
  if (!fill && !stroke) return { fill: false, stroke: true };
  return { fill, stroke };
}

/**
 * XML generation helpers (GB/T 33190 uses the `ofd:` namespace prefix).
 */

import { escapeXmlAttr, fmt } from './utils';
import type { RGB } from './types';

export const OFD_NAMESPACE = 'http://www.ofdspec.org/2016';

export type XmlAttrs = Record<string, string | number | boolean | undefined | null>;

/** Serialize an attribute string (numbers via fmt, strings escaped; nullish skipped). */
export function attrs(obj: XmlAttrs): string {
  let s = '';
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    s += ` ${k}="${typeof v === 'number' ? fmt(v) : escapeXmlAttr(String(v))}"`;
  }
  return s;
}

export function xmlHeader(): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n';
}

export function colorValue(rgb: RGB): string {
  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
}

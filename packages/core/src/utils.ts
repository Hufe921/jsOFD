/**
 * Shared utilities: number formatting, XML escaping, bytes and Base64, hashes.
 */

export const MM_PER_PT = 25.4 / 72; // 1pt = 0.352778mm
export const PT_PER_MM = 72 / 25.4; // 1mm = 2.834646pt

export const IS_NODE =
  typeof process !== 'undefined' && !!process.versions && !!process.versions.node;

/**
 * Lazy access to Node built-ins.
 * Uses new Function so bundlers (webpack/rollup) do not statically analyse a require call into browser builds.
 */
export function nodeRequire(name: string): unknown | null {
  try {
    const req = new Function('m', 'return require(m)') as (m: string) => unknown;
    return req(name);
  } catch {
    return null;
  }
}

/** Serialize a number with at most 4 decimals, trailing zeros stripped. */
export function fmt(n: number): string {
  if (typeof n !== 'number' || !isFinite(n)) n = 0;
  let s = n.toFixed(4);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  if (s === '-0') s = '0';
  return s;
}

export function escapeXmlText(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeXmlAttr(s: string): string {
  return escapeXmlText(s).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 32-hex-digit document ID. */
export function randomHex32(): string {
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += '0123456789abcdef'[(Math.random() * 16) | 0];
  }
  return s;
}

/** YYYY-MM-DD (OFD date field format). */
export function todayStr(d?: Date): string {
  const date = d instanceof Date ? d : new Date();
  const m = date.getMonth() + 1;
  const day = date.getDate();
  const mm = m < 10 ? '0' + m : String(m);
  const dd = day < 10 ? '0' + day : String(day);
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/* ---------------- Bytes and Base64 ---------------- */

export function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  // Fallback (very old environments).
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      const c2 = str.charCodeAt(++i);
      const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

export function u8FromBuffer(buf: Uint8Array | ArrayBuffer): Uint8Array {
  if (buf instanceof Uint8Array) return buf;
  if (typeof ArrayBuffer !== 'undefined' && buf instanceof ArrayBuffer) {
    return new Uint8Array(buf);
  }
  throw new Error('jsofd: unrecognized binary data type');
}

export function b64Encode(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function b64Decode(str: string): Uint8Array {
  const s = String(str)
    .replace(/^data:.*?;base64,/, '')
    .replace(/[=\s]+$/, '');
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/* ---------------- CRC32 / FNV hashing ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) {
    c = CRC_TABLE[(c ^ u8[i]) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** FNV-1a 32-bit hash as hex (used to deduplicate images). */
export function fnv1a(u8: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) {
    h ^= u8[i]!;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const value = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(value >>> 18) & 63];
    out += ALPHABET[(value >>> 12) & 63];
    out += b === undefined ? '=' : ALPHABET[(value >>> 6) & 63];
    out += c === undefined ? '=' : ALPHABET[value & 63];
  }
  return out;
}

export function base64Decode(text: string): Uint8Array {
  if (!BASE64_PATTERN.test(text)) throw new Error('Invalid Base64 input');
  const out = new Uint8Array((text.length / 4) * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0));
  let offset = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = ALPHABET.indexOf(text[i]!);
    const b = ALPHABET.indexOf(text[i + 1]!);
    const c = text[i + 2] === '=' ? 0 : ALPHABET.indexOf(text[i + 2]!);
    const d = text[i + 3] === '=' ? 0 : ALPHABET.indexOf(text[i + 3]!);
    const value = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < out.length) out[offset++] = (value >>> 16) & 0xff;
    if (offset < out.length) out[offset++] = (value >>> 8) & 0xff;
    if (offset < out.length) out[offset++] = value & 0xff;
  }
  return out;
}

/**
 * SM3 cryptographic hash (GB/T 32905-2016).
 *
 * Pure TypeScript, Uint32 core — no dependencies. Output is a 256-bit digest.
 */

const IV = [
  0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
];
const T0 = 0x79cc4519;
const T1 = 0x7a879d8a;

const rotl = (x: number, n: number): number => ((x << n) | (x >>> (32 - n))) >>> 0;

function p0(x: number): number {
  return (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0;
}
function p1(x: number): number {
  return (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0;
}

/** Compress one 512-bit block into the state. */
function compress(state: Uint32Array, block: Uint8Array, blockOff: number): void {
  const w = new Uint32Array(68);
  const w1 = new Uint32Array(64);
  for (let i = 0; i < 16; i++) {
    const at = blockOff + i * 4;
    w[i] =
      ((block[at]! << 24) | (block[at + 1]! << 16) | (block[at + 2]! << 8) | block[at + 3]!) >>> 0;
  }
  for (let j = 16; j < 68; j++) {
    w[j] =
      (p1(w[j - 16]! ^ w[j - 9]! ^ rotl(w[j - 3]!, 15)) ^ rotl(w[j - 13]!, 7) ^ w[j - 6]!) >>> 0;
  }
  for (let j = 0; j < 64; j++) w1[j] = (w[j]! ^ w[j + 4]!) >>> 0;

  let [a, b, c, d, e, f, g, h] = state;
  for (let j = 0; j < 64; j++) {
    const t = j < 16 ? T0 : T1;
    const ss1 = rotl((rotl(a, 12) + e + rotl(t, j % 32)) >>> 0, 7);
    const ss2 = (ss1 ^ rotl(a, 12)) >>> 0;
    const ff = j < 16 ? a ^ b ^ c : (a & b) | (a & c) | (b & c);
    const gg = j < 16 ? e ^ f ^ g : (e & f) | (~e & g);
    const tt1 = (ff + d + ss2 + w1[j]!) >>> 0;
    const tt2 = (gg + h + ss1 + w[j]!) >>> 0;
    d = c;
    c = rotl(b, 9);
    b = a;
    a = tt1;
    h = g;
    g = rotl(f, 19);
    f = e;
    e = p0(tt2);
  }
  const next = [a, b, c, d, e, f, g, h];
  for (let i = 0; i < 8; i++) state[i] = (state[i]! ^ next[i]!) >>> 0;
}

export class Sm3 {
  private state = new Uint32Array(IV);
  private buffer = new Uint8Array(64);
  private buffered = 0;
  private total = 0;

  update(data: Uint8Array | string): this {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this.total += bytes.length;
    let pos = 0;
    if (this.buffered) {
      const need = 64 - this.buffered;
      const take = Math.min(need, bytes.length);
      this.buffer.set(bytes.subarray(0, take), this.buffered);
      this.buffered += take;
      pos = take;
      if (this.buffered === 64) {
        compress(this.state, this.buffer, 0);
        this.buffered = 0;
      }
    }
    for (; pos + 64 <= bytes.length; pos += 64) compress(this.state, bytes, pos);
    if (pos < bytes.length) {
      this.buffer.set(bytes.subarray(pos), 0);
      this.buffered = bytes.length - pos;
    }
    return this;
  }

  digest(): Uint8Array {
    const bitLenHi = Math.floor((this.total / 0x20000000) >>> 0);
    const bitLenLo = (this.total << 3) >>> 0;
    const pad = new Uint8Array(this.buffered < 56 ? 64 - this.buffered : 128 - this.buffered);
    pad[0] = 0x80;
    const tail = pad.length - 8;
    const dv = new DataView(pad.buffer);
    dv.setUint32(tail, bitLenHi >>> 0);
    dv.setUint32(tail + 4, bitLenLo >>> 0);
    const final = new Uint8Array(this.buffered + pad.length);
    final.set(this.buffer.subarray(0, this.buffered));
    final.set(pad, this.buffered);
    const state = Uint32Array.from(this.state);
    for (let off = 0; off < final.length; off += 64) compress(state, final, off);

    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      out[i * 4] = state[i]! >>> 24;
      out[i * 4 + 1] = (state[i]! >>> 16) & 0xff;
      out[i * 4 + 2] = (state[i]! >>> 8) & 0xff;
      out[i * 4 + 3] = state[i]! & 0xff;
    }
    return out;
  }
}

/** SM3 digest of a string (UTF-8) or bytes, hex-encoded. */
export function sm3(data: Uint8Array | string, hex = true): string | Uint8Array {
  const out = new Sm3().update(data).digest();
  return hex ? Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('') : out;
}

/** SM3-based key derivation per GB/T 32918 §5.4.3. */
export function kdf(z: Uint8Array, klenBytes: number): Uint8Array {
  const out = new Uint8Array(klenBytes);
  const ct = new Uint8Array(4);
  let off = 0;
  for (let ctv = 1; off < klenBytes; ctv++) {
    ct[0] = (ctv >>> 24) & 0xff;
    ct[1] = (ctv >>> 16) & 0xff;
    ct[2] = (ctv >>> 8) & 0xff;
    ct[3] = ctv & 0xff;
    const h = new Sm3().update(z).update(ct).digest();
    const take = Math.min(32, klenBytes - off);
    out.set(h.subarray(0, take), off);
    off += take;
  }
  return out;
}

export const hexToBytes = (hex: string): Uint8Array => {
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Invalid hexadecimal input');
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export const bytesToBig = (b: Uint8Array): bigint => BigInt('0x' + (bytesToHex(b) || '0'));
export const bytesToHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

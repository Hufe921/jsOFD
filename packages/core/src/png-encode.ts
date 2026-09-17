/**
 * Dependency-free PNG encoder (RGBA pixels to PNG bytes).
 * Node uses node:zlib; browsers use CompressionStream.
 */

import { crc32 } from './utils';

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  // Node: use the real zlib. Bundlers substitute a stub module for
  // `node:zlib` in browser builds — it resolves without error but has no
  // functions, so verify `deflateSync` actually exists before using it.
  const isNode =
    typeof process !== 'undefined' &&
    !!(process as { versions?: { node?: string } }).versions?.node;
  if (isNode) {
    try {
      const zlib = await import('node:zlib');
      if (typeof zlib?.deflateSync === 'function') {
        return new Uint8Array(zlib.deflateSync(bytes, { level: 6 }));
      }
    } catch {
      /* fall through to CompressionStream */
    }
  }
  // Browser: CompressionStream (zlib-wrapped deflate, RFC 1950)
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([bytes as unknown as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('deflate'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error('PNG encoding requires node:zlib or CompressionStream');
}

/**
 * Encode RGBA pixels as a PNG (color type 6).
 */
export async function encodePng(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8Array> {
  // Prefix each scanline with filter byte 0 (None).
  const raw = new Uint8Array(height * (1 + width * 4));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0;
    for (let x = 0; x < width * 4; x++) {
      raw[p++] = rgba[y * width * 4 + x]!;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = await deflate(raw);
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const part of parts) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

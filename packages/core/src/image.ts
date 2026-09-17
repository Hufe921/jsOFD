/**
 * Image format sniffing and dimension parsing (PNG/JPEG/GIF/BMP/TIFF).
 *
 * OFD embeds all of these formats as-is, without re-encoding.
 */

export interface ImageInfo {
  /** OFD MultiMedia Format value */
  format: 'PNG' | 'JPEG' | 'GIF' | 'BMP' | 'TIFF';
  /** File extension (lowercase) */
  ext: string;
  width: number | null;
  height: number | null;
}

function jpegSize(u8: Uint8Array): [number | null, number | null] {
  let i = 2;
  while (i + 9 < u8.length) {
    if (u8[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = u8[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = (u8[i + 5]! << 8) | u8[i + 6]!;
      const w = (u8[i + 7]! << 8) | u8[i + 8]!;
      return [w, h];
    }
    const len = (u8[i + 2]! << 8) | u8[i + 3]!;
    i += 2 + len;
  }
  return [null, null];
}

/** Sniff the image format and pixel dimensions from the header bytes */
export function sniffImage(u8: Uint8Array): ImageInfo | null {
  if (u8.length < 8) return null;
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
    const w = ((u8[16]! << 24) | (u8[17]! << 16) | (u8[18]! << 8) | u8[19]!) >>> 0;
    const h = ((u8[20]! << 24) | (u8[21]! << 16) | (u8[22]! << 8) | u8[23]!) >>> 0;
    return { format: 'PNG', ext: 'png', width: w, height: h };
  }
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    const [w, h] = jpegSize(u8);
    return { format: 'JPEG', ext: 'jpg', width: w, height: h };
  }
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) {
    return {
      format: 'GIF',
      ext: 'gif',
      width: u8[6]! | (u8[7]! << 8),
      height: u8[8]! | (u8[9]! << 8),
    };
  }
  if (u8[0] === 0x42 && u8[1] === 0x4d) {
    return {
      format: 'BMP',
      ext: 'bmp',
      width: (u8[18]! | (u8[19]! << 8) | (u8[20]! << 16) | (u8[21]! << 24)) >>> 0,
      height: (u8[22]! | (u8[23]! << 8) | (u8[24]! << 16) | (u8[25]! << 24)) >>> 0,
    };
  }
  if (
    (u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2a) ||
    (u8[0] === 0x4d && u8[1] === 0x4d && u8[2] === 0x00)
  ) {
    return { format: 'TIFF', ext: 'tif', width: null, height: null };
  }
  return null;
}

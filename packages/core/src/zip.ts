/**
 * Dependency-free ZIP writer (STORE method).
 *
 * An OFD package is a ZIP container; stored (uncompressed) entries are accepted by every
 * unzip implementation and keep output() synchronous. OFD.xml is written as the first entry.
 */

import { crc32, utf8Encode } from './utils';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const d = date instanceof Date ? date : new Date();
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    (Math.floor(d.getSeconds() / 2) & 0x1f);
  const day =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { time: time >>> 0, date: day >>> 0 };
}

class ByteWriter {
  private buf = new Uint8Array(1024);
  private len = 0;

  private ensure(extra: number) {
    if (this.len + extra <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + extra) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }

  byte(v: number) {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  u16(v: number) {
    this.byte(v);
    this.byte(v >>> 8);
  }

  u32(v: number) {
    this.byte(v);
    this.byte(v >>> 8);
    this.byte(v >>> 16);
    this.byte(v >>> 24);
  }

  bytes(b: Uint8Array) {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/** Pack the file list into a ZIP byte stream (entry order preserved). */
export function zipStore(files: ZipEntry[], date?: Date): Uint8Array {
  const dos = dosDateTime(date || new Date());
  const local = new ByteWriter();
  const central = new ByteWriter();
  const cdOffsets: number[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = utf8Encode(f.name);
    const data = f.data || new Uint8Array(0);
    const crc = crc32(data);

    // Local File Header
    local.u32(0x04034b50);
    local.u16(20); // version needed
    local.u16(0x0800); // general-purpose flag: UTF-8 file names
    local.u16(0); // method: STORE
    local.u16(dos.time);
    local.u16(dos.date);
    local.u32(crc);
    local.u32(data.length);
    local.u32(data.length);
    local.u16(nameBytes.length);
    local.u16(0); // extra len
    local.bytes(nameBytes);
    local.bytes(data);

    // Central Directory Record
    cdOffsets.push(offset);
    central.u32(0x02014b50);
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(0x0800);
    central.u16(0);
    central.u16(dos.time);
    central.u16(dos.date);
    central.u32(crc);
    central.u32(data.length);
    central.u32(data.length);
    central.u16(nameBytes.length);
    central.u16(0); // extra
    central.u16(0); // comment
    central.u16(0); // disk number
    central.u16(0); // internal attrs
    central.u32(0); // external attrs
    central.u32(offset);
    central.bytes(nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const cdStart = offset;
  const cdSize = central.toUint8Array().length;

  const eocd = new ByteWriter();
  eocd.u32(0x06054b50);
  eocd.u16(0);
  eocd.u16(0);
  eocd.u16(files.length);
  eocd.u16(files.length);
  eocd.u32(cdSize);
  eocd.u32(cdStart);
  eocd.u16(0);

  const parts = [local.toUint8Array(), central.toUint8Array(), eocd.toUint8Array()];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

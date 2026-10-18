/**
 * Dependency-free ZIP reader.
 *
 * Reads central-directory listings and entry bytes. STORE entries pass
 * through; DEFLATE entries inflate via DecompressionStream('deflate-raw')
 * (Node ≥ 18, Chrome ≥ 103, Safari ≥ 16.4). This is the read counterpart of
 * zip.ts, which only writes STORE — other OFD producers emit compressed
 * packages, so inflate is required for real-world files.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

interface CentralRecord {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const U16 = (b: Uint8Array, at: number): number => b[at]! | (b[at + 1]! << 8);
const U32 = (b: Uint8Array, at: number): number =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

function findEocd(b: Uint8Array): number {
  // EOCD is at least 22 bytes; the comment can add up to 65535.
  const min = Math.max(0, b.length - 22 - 65535);
  for (let i = b.length - 22; i >= min; i--) {
    if (U32(b, i) === 0x06054b50) return i;
  }
  throw new Error('zip: end-of-central-directory not found (not a ZIP file?)');
}

function readCentral(b: Uint8Array): CentralRecord[] {
  const eocd = findEocd(b);
  const count = U16(b, eocd + 10);
  const cdStart = U32(b, eocd + 16);
  const records: CentralRecord[] = [];
  let at = cdStart;
  for (let i = 0; i < count; i++) {
    if (U32(b, at) !== 0x02014b50) throw new Error('zip: bad central directory record');
    const flags = U16(b, at + 8);
    const method = U16(b, at + 10);
    const compressedSize = U32(b, at + 20);
    const nameLen = U16(b, at + 28);
    const extraLen = U16(b, at + 30);
    const commentLen = U16(b, at + 32);
    const localOffset = U32(b, at + 42);
    const rawName = b.subarray(at + 46, at + 46 + nameLen);
    const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'latin1').decode(rawName);
    records.push({ name, method, compressedSize, uncompressedSize: U32(b, at + 24), localOffset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return records;
}

async function inflateRaw(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!DS) {
    throw new Error(
      'zip: DecompressionStream is unavailable in this runtime; ' +
        'only stored (uncompressed) ZIP entries can be read',
    );
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DS('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const buf = await new Response(stream).arrayBuffer();
  const out = new Uint8Array(buf);
  if (expected && out.length !== expected) {
    throw new Error(`zip: inflate size mismatch (${out.length} vs ${expected})`);
  }
  return out;
}

export interface UnzipOptions {
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  rejectDuplicates?: boolean;
}

/** Read all file entries of a ZIP package. Directory entries are skipped. */
export async function unzip(
  data: Uint8Array,
  options: UnzipOptions = {},
): Promise<Map<string, Uint8Array>> {
  const records = readCentral(data);
  if (options.maxEntries !== undefined && records.length > options.maxEntries) {
    throw new Error('zip: too many entries');
  }
  const out = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const rec of records) {
    if (rec.name.endsWith('/')) continue;
    if (options.rejectDuplicates && out.has(rec.name)) {
      throw new Error(`zip: duplicate entry ${rec.name}`);
    }
    if (options.maxEntryBytes !== undefined && rec.uncompressedSize > options.maxEntryBytes) {
      throw new Error(`zip: entry too large ${rec.name}`);
    }
    const lo = rec.localOffset;
    if (U32(data, lo) !== 0x04034b50) throw new Error(`zip: bad local header for ${rec.name}`);
    const nameLen = U16(data, lo + 26);
    const extraLen = U16(data, lo + 28);
    const start = lo + 30 + nameLen + extraLen;
    const raw = data.subarray(start, start + rec.compressedSize);
    let content: Uint8Array;
    if (rec.method === 0) {
      content = raw.slice();
    } else if (rec.method === 8) {
      content = await inflateRaw(raw, rec.uncompressedSize);
    } else {
      throw new Error(`zip: unsupported compression method ${rec.method} for ${rec.name}`);
    }
    totalBytes += content.length;
    if (options.maxTotalBytes !== undefined && totalBytes > options.maxTotalBytes) {
      throw new Error('zip: total uncompressed size limit exceeded');
    }
    out.set(rec.name, content);
  }
  return out;
}

/** Look up an entry by path, case-insensitive and tolerant to a leading '/'. */
export function findEntry(entries: Map<string, Uint8Array>, path: string): Uint8Array | undefined {
  const norm = path.replace(/^\/+/, '');
  const direct = entries.get(norm) ?? entries.get('/' + norm);
  if (direct) return direct;
  const lower = norm.toLowerCase();
  for (const [name, bytes] of entries) {
    if (name.toLowerCase() === lower || '/' + name.toLowerCase() === '/' + lower) return bytes;
  }
  return undefined;
}

/** Resolve a relative path against a base directory (`Doc_0/`, `Pages/`…). */
export function resolvePath(baseDir: string, loc: string): string {
  const clean = loc.replace(/^\/+/, '');
  if (!baseDir) return clean;
  return baseDir.replace(/\/+$/, '') + '/' + clean;
}

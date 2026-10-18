import { unzip } from '../zip-read';
import { kid, kids, parseXml, textOf } from '../xml-parse';

export interface OfdDocBody {
  index: number;
  docRoot: string;
  signaturesLoc?: string;
}

export interface ProtectedEntry {
  name: string;
  data: Uint8Array;
}

export function resolveOfdPath(baseFile: string, loc: string): string {
  if (!loc || loc.includes('\\') || loc.includes('\0') || /^[a-zA-Z]:/.test(loc)) {
    throw new Error('OFD invalid package path');
  }
  const rootRelative = loc.startsWith('/');
  const baseDir = rootRelative ? '' : baseFile.split('/').slice(0, -1).join('/');
  const input = `${baseDir}/${loc.replace(/^\/+/, '')}`;
  const parts: string[] = [];
  for (const part of input.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('OFD path traversal is not allowed');
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  if (!parts.length) throw new Error('OFD invalid empty package path');
  return parts.join('/');
}

export async function readOfdPackage(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = await unzip(data, {
    maxEntries: 10000,
    maxEntryBytes: 64 * 1024 * 1024,
    maxTotalBytes: 256 * 1024 * 1024,
    rejectDuplicates: true,
  });
  for (const name of entries.keys()) {
    if (resolveOfdPath('', name) !== name) throw new Error(`OFD unsafe package entry name: ${name}`);
  }
  return entries;
}

export function selectDocBody(entries: Map<string, Uint8Array>, index = 0): OfdDocBody {
  const bytes = entries.get('OFD.xml');
  if (!bytes) throw new Error('OFD.xml is missing');
  const root = parseXml(new TextDecoder().decode(bytes));
  if (root.name !== 'OFD') throw new Error('OFD main entry has an invalid root');
  const bodies = kids(root, 'DocBody');
  const body = bodies[index];
  if (!body) throw new Error(`OFD DocBody index out of range: ${index}`);
  const docRoot = kid(body, 'DocRoot');
  if (!docRoot) throw new Error('OFD DocRoot is missing');
  const signatures = kid(body, 'Signatures');
  return {
    index,
    docRoot: resolveOfdPath('OFD.xml', textOf(docRoot)),
    signaturesLoc: signatures ? resolveOfdPath('OFD.xml', textOf(signatures)) : undefined,
  };
}

export function collectProtectedEntries(
  entries: Map<string, Uint8Array>,
  signaturesLoc: string,
  allowAdditional: boolean,
): ProtectedEntry[] {
  const out: ProtectedEntry[] = [];
  for (const [name, data] of entries) {
    if (allowAdditional && name === signaturesLoc) continue;
    out.push({ name, data });
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

import { base64Decode, base64Encode } from './base64';
import { readOfdPackage, resolveOfdPath } from './ofd-package';
import { sm4CbcDecrypt, sm4CbcEncrypt } from './sm4';
import { kdf } from './sm3';
import { zipStore } from '../zip';
import { escapeXmlAttr, utf8Encode } from '../utils';
import { kid, kids, parseXml, textOf } from '../xml-parse';
import { OFD_NAMESPACE } from '../xml';

const PASSWORD_CASE_ID = '1.1.1';

export interface OfdPasswordEncryptionOptions {
  userName: string;
  userType?: 'Owner' | 'User';
  password: string;
  filter?: (name: string) => boolean;
  provider?: { name: string; company?: string; version?: string };
}

export interface OfdPasswordDecryptionOptions {
  userName?: string;
  password: string;
}

function repack(entries: Map<string, Uint8Array>): Uint8Array {
  const files = [...entries].map(([name, data]) => ({ name, data }));
  files.sort((a, b) => (a.name === 'OFD.xml' ? -1 : b.name === 'OFD.xml' ? 1 : 0));
  return zipStore(files);
}

function passwordKey(password: string): Uint8Array {
  if (!password) throw new Error('OFD encryption password must not be empty');
  return kdf(new TextEncoder().encode(password), 16);
}

function buildEncryptions(options: OfdPasswordEncryptionOptions, partial: boolean): Uint8Array {
  const provider = options.provider ?? { name: 'jsOFD', version: '1.0' };
  const attrs =
    `ProviderName="${escapeXmlAttr(provider.name)}"` +
    (provider.company ? ` Company="${escapeXmlAttr(provider.company)}"` : '') +
    (provider.version ? ` Version="${escapeXmlAttr(provider.version)}"` : '');
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<ofd:Encryptions xmlns:ofd="${OFD_NAMESPACE}">\n` +
    `  <ofd:EncryptInfo ID="1">\n    <ofd:Provider ${attrs}/>\n` +
    `    <ofd:EncryptScope>${partial ? 'Custom' : 'All'}</ofd:EncryptScope>\n` +
    '    <ofd:DecryptSeedLoc>/decryptseed.dat</ofd:DecryptSeedLoc>\n' +
    '    <ofd:EntriesMapLoc>/entriesmap.dat</ofd:EntriesMapLoc>\n' +
    '  </ofd:EncryptInfo>\n</ofd:Encryptions>\n';
  return utf8Encode(xml);
}

function buildDecryptSeed(
  options: OfdPasswordEncryptionOptions,
  encryptedWk: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  const userType = options.userType ? ` UserType="${options.userType}"` : '';
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ofd:DecyptSeed xmlns:ofd="${OFD_NAMESPACE}" ID="1" EncryptCaseId="${PASSWORD_CASE_ID}">\n` +
    `  <ofd:UserInfo UserName="${escapeXmlAttr(options.userName)}"${userType}>\n` +
    `    <ofd:EncryptedWK>${base64Encode(encryptedWk)}</ofd:EncryptedWK>\n` +
    `    <ofd:IVValue>${base64Encode(iv)}</ofd:IVValue>\n` +
    '  </ofd:UserInfo>\n  <ofd:ExtendParams/>\n</ofd:DecyptSeed>\n';
  return utf8Encode(xml);
}

function buildEntriesMap(entries: { path: string; encryptedPath: string }[]): Uint8Array {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ofd:EncryptEntries xmlns:ofd="${OFD_NAMESPACE}" ID="1">\n`;
  for (const entry of entries) {
    xml += `  <ofd:EncryptEntry Path="${escapeXmlAttr(entry.path)}" EPath="${escapeXmlAttr(entry.encryptedPath)}"/>\n`;
  }
  return utf8Encode(xml + '</ofd:EncryptEntries>\n');
}

function encryptedName(plaintext: string, used: Set<string>): string {
  const parts = plaintext.split('/');
  const base = parts.pop()!.toLowerCase();
  const dir = parts.join('/');
  let index = 0;
  for (;;) {
    const name = `${base}${index ? `_${index}` : ''}.dat`;
    const candidate = dir ? `${dir}/${name}` : name;
    if (!used.has(candidate)) return candidate;
    index++;
  }
}

export async function encryptOfdPassword(
  bytes: Uint8Array | ArrayBuffer,
  options: OfdPasswordEncryptionOptions,
): Promise<Uint8Array> {
  if (!options.userName) throw new Error('OFD encryption userName must not be empty');
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const entries = await readOfdPackage(input);
  if (entries.has('Encryptions.xml')) throw new Error('OFD package is already encrypted');
  const wrappingKey = passwordKey(options.password);
  const fek = new Uint8Array(16);
  const iv = new Uint8Array(16);
  crypto.getRandomValues(fek);
  crypto.getRandomValues(iv);
  const filter = options.filter ?? (() => true);
  const selected = [...entries.keys()].filter(filter).sort();
  if (!selected.length) throw new Error('OFD encryption selected no files');
  const used = new Set(entries.keys());
  const mappings: { path: string; encryptedPath: string }[] = [];
  for (const name of selected) {
    const encryptedPath = encryptedName(name, used);
    const ciphertext = sm4CbcEncrypt(entries.get(name)!, fek, iv);
    entries.delete(name);
    entries.set(encryptedPath, ciphertext);
    used.add(encryptedPath);
    mappings.push({ path: `/${name}`, encryptedPath: `/${encryptedPath}` });
  }
  const mapXml = buildEntriesMap(mappings);
  entries.set('entriesmap.dat', sm4CbcEncrypt(mapXml, fek, iv));
  entries.set('Encryptions.xml', buildEncryptions(options, Boolean(options.filter)));
  entries.set(
    'decryptseed.dat',
    buildDecryptSeed(options, sm4CbcEncrypt(fek, wrappingKey, iv), iv),
  );
  return repack(entries);
}

export async function decryptOfdPassword(
  bytes: Uint8Array | ArrayBuffer,
  options: OfdPasswordDecryptionOptions,
): Promise<Uint8Array> {
  try {
    const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const entries = await readOfdPackage(input);
    const encryptionXml = entries.get('Encryptions.xml');
    if (!encryptionXml) throw new Error('Encryptions.xml is missing');
    const encryptions = parseXml(new TextDecoder().decode(encryptionXml));
    const info = kids(encryptions, 'EncryptInfo')[0];
    if (!info) throw new Error('EncryptInfo is missing');
    const seedLoc = textOf(kid(info, 'DecryptSeedLoc')!);
    const mapLoc = textOf(kid(info, 'EntriesMapLoc')!);
    const seedPath = resolveOfdPath('Encryptions.xml', seedLoc);
    const mapPath = resolveOfdPath('Encryptions.xml', mapLoc);
    const seed = parseXml(new TextDecoder().decode(entries.get(seedPath)));
    if (seed.name !== 'DecyptSeed' || seed.attrs.EncryptCaseId !== PASSWORD_CASE_ID) {
      throw new Error('Unsupported OFD encryption scheme');
    }
    const users = kids(seed, 'UserInfo');
    const user = options.userName
      ? users.find((item) => item.attrs.UserName === options.userName)
      : users[0];
    if (!user) throw new Error('OFD decryption user was not found');
    const ivElement = kid(user, 'IVValue');
    const iv = ivElement ? base64Decode(textOf(ivElement)) : new Uint8Array(16);
    const encryptedWk = base64Decode(textOf(kid(user, 'EncryptedWK')!));
    const fek = sm4CbcDecrypt(encryptedWk, passwordKey(options.password), iv);
    if (fek.length !== 16) throw new Error('OFD invalid file encryption key');
    const mapXml = sm4CbcDecrypt(entries.get(mapPath)!, fek, iv);
    const map = parseXml(new TextDecoder().decode(mapXml));
    const mappings = kids(map, 'EncryptEntry');
    const result = new Map(entries);
    result.delete('Encryptions.xml');
    result.delete(seedPath);
    result.delete(mapPath);
    for (const mapping of mappings) {
      const plaintextPath = resolveOfdPath('', mapping.attrs.Path!);
      const encryptedPath = resolveOfdPath('', mapping.attrs.EPath!);
      const ciphertext = result.get(encryptedPath);
      if (!ciphertext) throw new Error(`OFD encrypted entry is missing: ${encryptedPath}`);
      result.delete(encryptedPath);
      result.set(plaintextPath, sm4CbcDecrypt(ciphertext, fek, iv));
    }
    return repack(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`OFD password decryption failed: ${message}`, { cause: error });
  }
}

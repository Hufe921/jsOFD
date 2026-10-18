import { base64Encode } from './base64';
import {
  collectProtectedEntries,
  readOfdPackage,
  resolveOfdPath,
  selectDocBody,
} from './ofd-package';
import { buildSignatureXml, updateSignatureList } from './ofd-signature-xml';
import {
  encodeSesSignature,
  encodeTbsSign,
  parseSesSeal,
} from './ses-v4';
import { requestSm2Signature, type Sm2Signer } from './signer';
import { Sm3 } from './sm3';
import { zipStore } from '../zip';
import { kid, kids, parseXml } from '../xml-parse';
import { fmt, utf8Encode } from '../utils';

const OID_SM2_SIGN = '1.2.156.10197.1.501';
const OID_SM3 = '1.2.156.10197.1.401';

export interface SignOfdOptions {
  eSeal: Uint8Array;
  signingCertificate: Uint8Array;
  signer: Sm2Signer;
  stamp?: { page: number; x: number; y: number; w: number; h: number; clip?: string };
  allowAdditionalSignatures?: boolean;
  docBodyIndex?: number;
  provider?: { name: string; company?: string; version?: string };
  now?: () => Date;
  userId?: string;
  signal?: AbortSignal;
}

function signatureDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

function repack(entries: Map<string, Uint8Array>): Uint8Array {
  const files = [...entries].map(([name, data]) => ({ name, data }));
  files.sort((a, b) => (a.name === 'OFD.xml' ? -1 : b.name === 'OFD.xml' ? 1 : 0));
  return zipStore(files);
}

function addSignaturesEntry(
  entries: Map<string, Uint8Array>,
  docBodyIndex: number,
  signaturesLoc: string,
): void {
  const source = new TextDecoder().decode(entries.get('OFD.xml'));
  const pattern = /<((?:[A-Za-z_][\w.-]*:)?)DocBody\b[^>]*>/g;
  let match: RegExpExecArray | null;
  let current = 0;
  let selected: RegExpExecArray | null = null;
  while ((match = pattern.exec(source))) {
    if (current++ === docBodyIndex) {
      selected = match;
      break;
    }
  }
  if (!selected) throw new Error(`OFD DocBody index out of range: ${docBodyIndex}`);
  const prefix = selected[1]!;
  const close = `</${prefix}DocBody>`;
  const closeAt = source.indexOf(close, selected.index + selected[0].length);
  if (closeAt < 0) throw new Error('OFD DocBody closing tag is missing');
  const insertion = `    <${prefix}Signatures>${signaturesLoc}</${prefix}Signatures>\n  `;
  const updated = source.slice(0, closeAt) + insertion + source.slice(closeAt);
  entries.set('OFD.xml', utf8Encode(updated));
  const body = selectDocBody(entries, docBodyIndex);
  if (body.signaturesLoc !== signaturesLoc) throw new Error('OFD signatures entry could not be added');
}

function signatureListEntries(entries: Map<string, Uint8Array>, signaturesLoc: string) {
  const bytes = entries.get(signaturesLoc);
  if (!bytes) return [] as { id: string; baseLoc: string }[];
  const root = parseXml(new TextDecoder().decode(bytes));
  return kids(root, 'Signature').map((signature) => ({
    id: signature.attrs.ID ?? '',
    baseLoc: signature.attrs.BaseLoc ?? '',
  }));
}

function assertAdditionalSignatureAllowed(
  entries: Map<string, Uint8Array>,
  signaturesLoc: string,
): void {
  for (const signature of signatureListEntries(entries, signaturesLoc)) {
    const signaturePath = resolveOfdPath(signaturesLoc, signature.baseLoc);
    const bytes = entries.get(signaturePath);
    if (!bytes) throw new Error(`OFD existing signature is missing: ${signaturePath}`);
    const root = parseXml(new TextDecoder().decode(bytes));
    const signedInfo = kid(root, 'SignedInfo');
    const references = signedInfo && kid(signedInfo, 'References');
    for (const reference of references ? kids(references, 'Reference') : []) {
      const fileRef = reference.attrs.FileRef;
      if (fileRef && resolveOfdPath('', fileRef) === signaturesLoc) {
        throw new Error('OFD additional signatures are not allowed: the signature list is protected');
      }
    }
  }
}

function nextSignatureLocation(
  entries: Map<string, Uint8Array>,
  signaturesLoc: string,
): { directory: string; id: string; maxSignId: string } {
  const list = signatureListEntries(entries, signaturesLoc);
  let maxNumericId = 0;
  for (const item of list) {
    const match = /^s?(\d+)$/i.exec(item.id);
    if (match) maxNumericId = Math.max(maxNumericId, Number(match[1]));
  }
  const root = signaturesLoc.split('/').slice(0, -1).join('/');
  let maxDirectory = -1;
  const expression = new RegExp(`^${root ? root + '/' : ''}Sign_(\\d+)/`);
  for (const name of entries.keys()) {
    const match = expression.exec(name);
    if (match) maxDirectory = Math.max(maxDirectory, Number(match[1]));
  }
  const numericId = maxNumericId + 1;
  return {
    directory: `${root ? root + '/' : ''}Sign_${maxDirectory + 1}`,
    id: `s${String(numericId).padStart(3, '0')}`,
    maxSignId: `s${String(numericId + 1).padStart(3, '0')}`,
  };
}

function pageIdAt(entries: Map<string, Uint8Array>, docRoot: string, page: number): string {
  if (!Number.isInteger(page) || page < 1) throw new Error('OFD stamp page must be a positive integer');
  const bytes = entries.get(docRoot);
  if (!bytes) throw new Error(`OFD document root is missing: ${docRoot}`);
  const document = parseXml(new TextDecoder().decode(bytes));
  const pages = kid(document, 'Pages');
  const target = (pages ? kids(pages, 'Page') : [])[page - 1];
  if (!target?.attrs.ID) throw new Error(`OFD stamp page does not exist: ${page}`);
  return target.attrs.ID;
}

export async function signOfd(
  bytes: Uint8Array | ArrayBuffer,
  options: SignOfdOptions,
): Promise<Uint8Array> {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const entries = await readOfdPackage(input);
  parseSesSeal(options.eSeal);
  const body = selectDocBody(entries, options.docBodyIndex ?? 0);
  const signaturesLoc = body.signaturesLoc ?? 'Signs/Signatures.xml';
  assertAdditionalSignatureAllowed(entries, signaturesLoc);
  if (!body.signaturesLoc) addSignaturesEntry(entries, body.index, signaturesLoc);

  const allowAdditional = options.allowAdditionalSignatures ?? true;
  const location = nextSignatureLocation(entries, signaturesLoc);
  const signaturePath = `${location.directory}/Signature.xml`;
  const sealPath = `${location.directory}/Seal.esl`;
  const signedValuePath = `${location.directory}/SignedValue.dat`;
  const list = updateSignatureList({
    existing: entries.get(signaturesLoc),
    entry: { id: location.id, type: 'Seal', baseLoc: `/${signaturePath}` },
    maxSignId: location.maxSignId,
  });
  entries.set(signaturesLoc, list);

  const protectedEntries = collectProtectedEntries(entries, signaturesLoc, allowAdditional);
  const now = options.now?.() ?? new Date();
  const signatureXml = buildSignatureXml({
    provider: options.provider ?? { name: 'jsOFD', version: '1.0' },
    signatureMethod: OID_SM2_SIGN,
    signatureDateTime: signatureDateTime(now),
    checkMethod: OID_SM3,
    references: protectedEntries.map((entry) => ({
      fileRef: `/${entry.name}`,
      checkValue: base64Encode(new Sm3().update(entry.data).digest()),
    })),
    stamp: options.stamp
      ? {
          pageRef: pageIdAt(entries, body.docRoot, options.stamp.page),
          id: location.id,
          boundary: `${fmt(options.stamp.x)} ${fmt(options.stamp.y)} ${fmt(options.stamp.w)} ${fmt(options.stamp.h)}`,
          clip: options.stamp.clip,
        }
      : undefined,
    sealLoc: `/${sealPath}`,
    signedValueLoc: `/${signedValuePath}`,
  });

  const toSign = {
    version: 4,
    eseal: parseSesSeal(options.eSeal),
    timeInfo: now,
    dataHash: new Sm3().update(signatureXml).digest(),
    propertyInfo: 'OFD',
  };
  const signature = await requestSm2Signature(options.signer, {
    tbs: encodeTbsSign(toSign),
    certificate: options.signingCertificate,
    userId: options.userId,
    signal: options.signal,
  });
  const signedValue = encodeSesSignature({
    toSign,
    signingCertificate: options.signingCertificate,
    signatureAlgId: OID_SM2_SIGN,
    signature,
  });

  entries.set(signaturePath, signatureXml);
  entries.set(sealPath, options.eSeal.slice());
  entries.set(signedValuePath, signedValue);
  return repack(entries);
}

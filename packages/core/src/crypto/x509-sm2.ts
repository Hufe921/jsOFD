import * as asn1js from 'asn1js';
import { parseDer, readSequence } from './der';
import { sm2Verify } from './sm2';
import type { RevocationProvider } from './revocation';

const OID_SM2_SIGN = '1.2.156.10197.1.501';
const OID_SM2_ECC = '1.2.156.10197.1.301';
const KEY_CERT_SIGN = 1 << 5;
const KNOWN_EXTENSIONS = new Set([
  '2.5.29.19',
  '2.5.29.15',
  '2.5.29.37',
  '2.5.29.14',
  '2.5.29.35',
  '2.5.29.31',
  '2.5.29.32',
  '1.3.6.1.5.5.7.1.1',
]);

export interface Sm2X509Certificate {
  der: Uint8Array;
  tbsDer: Uint8Array;
  signature: Uint8Array;
  publicKey: Uint8Array;
  subject: string;
  issuer: string;
  subjectDer: Uint8Array;
  issuerDer: Uint8Array;
  notBefore: Date;
  notAfter: Date;
  isCa: boolean;
  pathLength?: number;
  keyUsage: number | null;
  unknownCriticalExtensions: string[];
}

export interface CertificateTrustResult {
  status: 'trusted' | 'untrusted' | 'expired' | 'revoked' | 'indeterminate';
  chain: string[];
  reasons: string[];
}

export interface VerifyCertificateOptions {
  trustAnchors: Uint8Array[];
  intermediates?: Uint8Array[];
  at?: Date;
  revocationProvider?: RevocationProvider;
  requireRevocation?: boolean;
}

function raw(block: asn1js.BaseBlock): Uint8Array {
  return block.valueBeforeDecodeView.slice();
}

function hex(block: asn1js.BaseBlock): Uint8Array {
  return (block.valueBlock as unknown as { valueHexView: Uint8Array }).valueHexView.slice();
}

function tagged(block: asn1js.BaseBlock, tag: number): boolean {
  return block.idBlock.tagClass === 3 && block.idBlock.tagNumber === tag;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function algorithmOid(block: asn1js.BaseBlock): string {
  const sequence = readSequence(block, 1, 2);
  const [oid] = sequence.valueBlock.value;
  if (!(oid instanceof asn1js.ObjectIdentifier)) throw new Error('X.509 algorithm OID expected');
  return oid.getValue();
}

function nameCn(block: asn1js.BaseBlock): string {
  const sequence = readSequence(block, 0, Number.MAX_SAFE_INTEGER);
  for (const rdn of sequence.valueBlock.value) {
    if (!(rdn instanceof asn1js.Set)) continue;
    for (const attribute of rdn.valueBlock.value) {
      const pair = readSequence(attribute, 2, 2);
      const [oid, value] = pair.valueBlock.value;
      if (
        oid instanceof asn1js.ObjectIdentifier &&
        oid.getValue() === '2.5.4.3' &&
        value instanceof asn1js.BaseStringBlock
      ) {
        return value.getValue();
      }
    }
  }
  return '';
}

function parseBasicConstraints(bytes: Uint8Array): { isCa: boolean; pathLength?: number } {
  const sequence = readSequence(parseDer(bytes), 0, 2);
  let isCa = false;
  let pathLength: number | undefined;
  for (const item of sequence.valueBlock.value) {
    if (item instanceof asn1js.Boolean) isCa = item.getValue();
    else if (item instanceof asn1js.Integer) pathLength = Number(item.toBigInt());
    else throw new Error('X.509 invalid BasicConstraints');
  }
  return { isCa, pathLength };
}

function parseKeyUsage(bytes: Uint8Array): number {
  const block = parseDer(bytes);
  if (!(block instanceof asn1js.BitString)) throw new Error('X.509 invalid KeyUsage');
  const data = hex(block);
  let usage = 0;
  for (let bit = 0; bit < data.length * 8 - block.valueBlock.unusedBits; bit++) {
    if (data[bit >> 3]! & (0x80 >> (bit & 7))) usage |= 1 << bit;
  }
  return usage;
}

function parseExtensions(
  block: asn1js.BaseBlock,
  target: { isCa: boolean; pathLength?: number; keyUsage: number | null; unknownCriticalExtensions: string[] },
): void {
  const contents = (block.valueBlock as unknown as { value: asn1js.BaseBlock[] }).value;
  const wrapper = readSequence(contents[0]!, 0, Number.MAX_SAFE_INTEGER);
  for (const item of wrapper.valueBlock.value) {
    const extension = readSequence(item, 2, 3);
    const [oidBlock, ...rest] = extension.valueBlock.value;
    if (!(oidBlock instanceof asn1js.ObjectIdentifier)) throw new Error('X.509 extension OID expected');
    const oid = oidBlock.getValue();
    let critical = false;
    let valueBlock: asn1js.BaseBlock;
    if (rest[0] instanceof asn1js.Boolean) {
      critical = rest[0].getValue();
      valueBlock = rest[1]!;
    } else {
      valueBlock = rest[0]!;
    }
    if (!(valueBlock instanceof asn1js.OctetString)) throw new Error('X.509 extension value expected');
    const value = hex(valueBlock);
    if (oid === '2.5.29.19') {
      const basic = parseBasicConstraints(value);
      target.isCa = basic.isCa;
      target.pathLength = basic.pathLength;
    } else if (oid === '2.5.29.15') {
      target.keyUsage = parseKeyUsage(value);
    } else if (critical && !KNOWN_EXTENSIONS.has(oid)) {
      target.unknownCriticalExtensions.push(oid);
    }
  }
}

export function parseSm2Certificate(der: Uint8Array): Sm2X509Certificate {
  const certificate = readSequence(parseDer(der, { maxBytes: 1024 * 1024 }), 3, 3);
  const [tbs, signatureAlgorithm, signatureBlock] = certificate.valueBlock.value;
  if (algorithmOid(signatureAlgorithm!) !== OID_SM2_SIGN) {
    throw new Error('X.509 unsupported signature algorithm');
  }
  if (!(signatureBlock instanceof asn1js.BitString)) throw new Error('X.509 signature expected');
  const tbsSequence = readSequence(tbs!, 6, 20);
  const fields = tbsSequence.valueBlock.value;
  let index = tagged(fields[0]!, 0) ? 1 : 0;
  if (!(fields[index] instanceof asn1js.Integer)) throw new Error('X.509 serial number expected');
  index++;
  if (algorithmOid(fields[index]!) !== OID_SM2_SIGN) throw new Error('X.509 TBS algorithm mismatch');
  index++;
  const issuerBlock = fields[index++]!;
  const validity = readSequence(fields[index++]!, 2, 2);
  const subjectBlock = fields[index++]!;
  const spki = readSequence(fields[index++]!, 2, 2);
  const [notBeforeBlock, notAfterBlock] = validity.valueBlock.value;
  if (
    !(notBeforeBlock instanceof asn1js.UTCTime) &&
    !(notBeforeBlock instanceof asn1js.GeneralizedTime)
  ) {
    throw new Error('X.509 validity time expected');
  }
  if (
    !(notAfterBlock instanceof asn1js.UTCTime) &&
    !(notAfterBlock instanceof asn1js.GeneralizedTime)
  ) {
    throw new Error('X.509 validity time expected');
  }
  const [spkiAlgorithm, publicKeyBlock] = spki.valueBlock.value;
  if (algorithmOid(spkiAlgorithm!) !== OID_SM2_ECC) throw new Error('X.509 SM2 public key expected');
  if (!(publicKeyBlock instanceof asn1js.BitString)) throw new Error('X.509 public key expected');
  const publicKey = hex(publicKeyBlock);
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('X.509 invalid SM2 public key');
  const extensions = {
    isCa: false,
    pathLength: undefined as number | undefined,
    keyUsage: null as number | null,
    unknownCriticalExtensions: [] as string[],
  };
  for (; index < fields.length; index++) {
    if (tagged(fields[index]!, 3)) parseExtensions(fields[index]!, extensions);
  }
  return {
    der: der.slice(),
    tbsDer: raw(tbs!),
    signature: hex(signatureBlock),
    publicKey,
    subject: nameCn(subjectBlock),
    issuer: nameCn(issuerBlock),
    subjectDer: raw(subjectBlock),
    issuerDer: raw(issuerBlock),
    notBefore: notBeforeBlock.toDate(),
    notAfter: notAfterBlock.toDate(),
    ...extensions,
  };
}

function verifyParsedCertificateSignature(cert: Sm2X509Certificate, issuer: Sm2X509Certificate): boolean {
  try {
    return sm2Verify(issuer.publicKey, cert.tbsDer, cert.signature);
  } catch {
    return false;
  }
}

export function verifySm2CertificateSignature(cert: Uint8Array, issuer: Uint8Array): boolean {
  try {
    return verifyParsedCertificateSignature(parseSm2Certificate(cert), parseSm2Certificate(issuer));
  } catch {
    return false;
  }
}

interface ChainNode {
  cert: Sm2X509Certificate;
  anchor: boolean;
}

interface ChainBuild {
  chain?: Sm2X509Certificate[];
  expired: boolean;
  reasons: string[];
}

function validityProblem(cert: Sm2X509Certificate, at: Date): string | null {
  if (cert.notBefore > at || cert.notAfter < at) return `${cert.subject} is outside its validity period`;
  if (cert.unknownCriticalExtensions.length) {
    return `${cert.subject} has unknown critical extensions: ${cert.unknownCriticalExtensions.join(',')}`;
  }
  return null;
}

function buildChain(
  current: ChainNode,
  nodes: ChainNode[],
  at: Date,
  visited: Set<string>,
  caBelow: number,
): ChainBuild {
  const currentProblem = validityProblem(current.cert, at);
  if (currentProblem) {
    return { expired: /validity period/.test(currentProblem), reasons: [currentProblem] };
  }
  if (current.anchor) return { chain: [current.cert], expired: false, reasons: [] };
  const result: ChainBuild = { expired: false, reasons: [] };
  for (const issuer of nodes) {
    if (issuer === current || !sameBytes(current.cert.issuerDer, issuer.cert.subjectDer)) continue;
    const key = `${issuer.cert.subject}:${issuer.cert.der.length}`;
    if (visited.has(key)) continue;
    if (!issuer.cert.isCa || issuer.cert.keyUsage === null || !(issuer.cert.keyUsage & KEY_CERT_SIGN)) {
      result.reasons.push(`${issuer.cert.subject} cannot issue certificates`);
      continue;
    }
    if (
      issuer.cert.pathLength !== undefined &&
      caBelow + (current.cert.isCa ? 1 : 0) > issuer.cert.pathLength
    ) {
      result.reasons.push(`${issuer.cert.subject} path length constraint exceeded`);
      continue;
    }
    const issuerProblem = validityProblem(issuer.cert, at);
    if (issuerProblem) {
      result.expired ||= /validity period/.test(issuerProblem);
      result.reasons.push(issuerProblem);
      continue;
    }
    if (!verifyParsedCertificateSignature(current.cert, issuer.cert)) {
      result.reasons.push(`${current.cert.subject} issuer signature is invalid`);
      continue;
    }
    visited.add(key);
    const built = buildChain(issuer, nodes, at, visited, caBelow + (current.cert.isCa ? 1 : 0));
    visited.delete(key);
    if (built.chain) return { chain: [current.cert, ...built.chain], expired: false, reasons: [] };
    result.expired ||= built.expired;
    result.reasons.push(...built.reasons);
  }
  if (!result.reasons.length) result.reasons.push(`${current.cert.subject} has no trusted issuer`);
  return result;
}

export async function verifyCertificateChain(
  certificate: Uint8Array,
  options: VerifyCertificateOptions,
): Promise<CertificateTrustResult> {
  const at = options.at ?? new Date();
  try {
    const leaf = parseSm2Certificate(certificate);
    const anchors = options.trustAnchors.map((der) => parseSm2Certificate(der));
    const intermediates = (options.intermediates ?? []).map((der) => parseSm2Certificate(der));
    const nodes = [
      ...anchors.map((cert) => ({ cert, anchor: true })),
      ...intermediates.map((cert) => ({ cert, anchor: false })),
    ];
    const leafIsAnchor = anchors.find((anchor) => sameBytes(anchor.der, leaf.der));
    const built = buildChain(
      { cert: leaf, anchor: Boolean(leafIsAnchor) },
      nodes,
      at,
      new Set(),
      0,
    );
    if (!built.chain) {
      return {
        status: built.expired ? 'expired' : 'untrusted',
        chain: [],
        reasons: built.reasons,
      };
    }
    const chainNames = built.chain.map((cert) => cert.subject);
    if (options.revocationProvider) {
      for (let i = 0; i < built.chain.length - 1; i++) {
        const cert = built.chain[i]!;
        const issuer = built.chain[i + 1]!;
        const status = await options.revocationProvider.check(cert.der, issuer.der, at);
        if (status === 'revoked') {
          return { status: 'revoked', chain: chainNames, reasons: [`${cert.subject} is revoked`] };
        }
        if (status === 'unknown' && options.requireRevocation) {
          return {
            status: 'indeterminate',
            chain: chainNames,
            reasons: [`${cert.subject} revocation status is unknown`],
          };
        }
      }
    } else if (options.requireRevocation) {
      return {
        status: 'indeterminate',
        chain: chainNames,
        reasons: ['Revocation evidence is required but no provider was supplied'],
      };
    }
    return { status: 'trusted', chain: chainNames, reasons: [] };
  } catch (error) {
    return {
      status: 'indeterminate',
      chain: [],
      reasons: [error instanceof Error ? error.message : String(error)],
    };
  }
}

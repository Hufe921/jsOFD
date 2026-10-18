import * as asn1js from 'asn1js';
import { parseDer, readSequence } from './der';
import {
  encodeSesSeal,
  encodeSesSealInfo,
  parseSesSeal,
  type SesPicture,
  type SesSealInfoInput,
} from './ses-v4';
import { requestSm2Signature, type Sm2Signer } from './signer';
import { sm2Verify } from './sm2';
import {
  parseSm2Certificate,
  verifyCertificateChain,
  type CertificateTrustResult,
  type VerifyCertificateOptions,
} from './x509-sm2';

const OID_SM2_SIGN = '1.2.156.10197.1.501';

export interface CreateSesSealOptions {
  info: SesSealInfoInput;
  makerCertificate: Uint8Array;
  signer: Sm2Signer;
  userId?: string;
  signal?: AbortSignal;
}

export interface VerifySesSealOptions extends VerifyCertificateOptions {
  userId?: string;
}

export interface SesSealVerification {
  valid: boolean;
  signatureValid: boolean;
  validity: boolean;
  trust: CertificateTrustResult;
  picture?: SesPicture;
  reasons: string[];
}

function unknownCriticalExtensions(extensions?: Uint8Array): string[] {
  if (!extensions) return [];
  const unknown: string[] = [];
  const sequence = readSequence(parseDer(extensions), 0, Number.MAX_SAFE_INTEGER);
  for (const item of sequence.valueBlock.value) {
    const extension = readSequence(item, 2, 3);
    const [oid, ...rest] = extension.valueBlock.value;
    if (!(oid instanceof asn1js.ObjectIdentifier)) throw new Error('SES extension OID expected');
    const critical = rest[0] instanceof asn1js.Boolean && rest[0].getValue();
    if (critical) unknown.push(oid.getValue());
  }
  return unknown;
}

export async function createSesSeal(options: CreateSesSealOptions): Promise<Uint8Array> {
  if (options.info.header.id !== 'ES' || options.info.header.version !== 4) {
    throw new Error('SES V4 header must use ID ES and version 4');
  }
  const infoDer = encodeSesSealInfo(options.info);
  const signedValue = await requestSm2Signature(options.signer, {
    tbs: infoDer,
    certificate: options.makerCertificate,
    userId: options.userId,
    signal: options.signal,
  });
  return encodeSesSeal({
    info: { ...options.info, rawDer: infoDer },
    makerCertificate: options.makerCertificate,
    signAlgId: OID_SM2_SIGN,
    signedValue,
  });
}

export async function verifySesSeal(
  der: Uint8Array,
  options: VerifySesSealOptions,
): Promise<SesSealVerification> {
  const reasons: string[] = [];
  let trust: CertificateTrustResult = {
    status: 'indeterminate',
    chain: [],
    reasons: [],
  };
  try {
    const seal = parseSesSeal(der);
    const at = options.at ?? new Date();
    const certificate = parseSm2Certificate(seal.makerCertificate);
    const signatureValid =
      seal.signAlgId === OID_SM2_SIGN &&
      sm2Verify(certificate.publicKey, seal.info.rawDer, seal.signedValue, options.userId);
    if (!signatureValid) reasons.push('SES maker signature is invalid');
    const validity = seal.info.property.validStart <= at && seal.info.property.validEnd >= at;
    if (!validity) reasons.push('SES seal is outside its validity period');
    const unknown = unknownCriticalExtensions(seal.info.extensions);
    if (unknown.length) reasons.push(`SES unknown critical extensions: ${unknown.join(',')}`);
    trust = await verifyCertificateChain(seal.makerCertificate, options);
    if (trust.status !== 'trusted') reasons.push(...trust.reasons);
    return {
      valid: signatureValid && validity && !unknown.length && trust.status === 'trusted',
      signatureValid,
      validity,
      trust,
      picture: seal.info.picture,
      reasons,
    };
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
    return {
      valid: false,
      signatureValid: false,
      validity: false,
      trust,
      reasons,
    };
  }
}

import { base64Encode } from './base64';
import { readOfdPackage, resolveOfdPath, selectDocBody } from './ofd-package';
import { verifySesSeal } from './ofd-seal';
import { encodeSesSeal, parseSesSignature } from './ses-v4';
import { sm2Verify } from './sm2';
import { Sm3 } from './sm3';
import {
  parseSm2Certificate,
  verifyCertificateChain,
  type CertificateTrustResult,
  type VerifyCertificateOptions,
} from './x509-sm2';
import { kid, kids, parseXml, textOf } from '../xml-parse';

const OID_SM2_SIGN = '1.2.156.10197.1.501';
const OID_SM3 = '1.2.156.10197.1.401';

export type SignatureStatus = 'valid' | 'invalid' | 'untrusted' | 'indeterminate';

export interface OfdSignatureVerification {
  id: string;
  referencesValid: boolean;
  signatureValid: boolean;
  sealSignatureValid: boolean;
  signerTrust: CertificateTrustResult;
  makerTrust: CertificateTrustResult;
  status: SignatureStatus;
  reasons: string[];
}

export interface OfdVerifyResult {
  signatures: OfdSignatureVerification[];
  errors: string[];
}

export interface OfdVerifyOptions extends VerifyCertificateOptions {
  userId?: string;
  docBodyIndex?: number;
}

function pendingTrust(): CertificateTrustResult {
  return { status: 'indeterminate', chain: [], reasons: [] };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function verifyOne(
  entries: Map<string, Uint8Array>,
  signaturesLoc: string,
  item: { id: string; baseLoc: string },
  options: OfdVerifyOptions,
): Promise<OfdSignatureVerification> {
  let referencesValid = false;
  let signatureValid = false;
  let sealSignatureValid = false;
  let signerTrust = pendingTrust();
  let makerTrust = pendingTrust();
  const reasons: string[] = [];
  let status: SignatureStatus | undefined;
  try {
    const signaturePath = resolveOfdPath(signaturesLoc, item.baseLoc);
    const signatureXml = entries.get(signaturePath);
    if (!signatureXml) throw new Error(`Signature.xml is missing: ${signaturePath}`);
    const root = parseXml(new TextDecoder().decode(signatureXml));
    const signedInfo = kid(root, 'SignedInfo');
    if (!signedInfo) throw new Error('SES SignedInfo is missing');
    const references = kid(signedInfo, 'References');
    if (!references) throw new Error('SES References are missing');
    if (references.attrs.CheckMethod !== OID_SM3) {
      throw new Error(`SES unsupported check method: ${references.attrs.CheckMethod}`);
    }
    referencesValid = true;
    const seen = new Set<string>();
    for (const reference of kids(references, 'Reference')) {
      const fileRef = reference.attrs.FileRef;
      if (!fileRef) throw new Error('SES Reference FileRef is missing');
      const path = resolveOfdPath('', fileRef);
      if (seen.has(path)) throw new Error(`SES duplicate Reference: ${path}`);
      seen.add(path);
      const data = entries.get(path);
      const checkValue = kid(reference, 'CheckValue');
      if (!data || !checkValue || base64Encode(new Sm3().update(data).digest()) !== textOf(checkValue)) {
        referencesValid = false;
        reasons.push(`SES Reference mismatch: ${path}`);
      }
    }

    const signedValueElement = kid(root, 'SignedValue');
    if (!signedValueElement) throw new Error('SES SignedValue location is missing');
    const signedValuePath = resolveOfdPath(signaturePath, textOf(signedValueElement));
    const signedValueBytes = entries.get(signedValuePath);
    if (!signedValueBytes) throw new Error(`SES SignedValue.dat is missing: ${signedValuePath}`);
    const signature = parseSesSignature(signedValueBytes);
    const signingCertificate = parseSm2Certificate(signature.signingCertificate);
    const hashMatches = sameBytes(
      signature.toSign.dataHash,
      new Sm3().update(signatureXml).digest(),
    );
    if (!hashMatches) reasons.push('SES Signature.xml dataHash mismatch');
    signatureValid =
      hashMatches &&
      signature.signatureAlgId === OID_SM2_SIGN &&
      sm2Verify(
        signingCertificate.publicKey,
        signature.toSign.rawDer,
        signature.signature,
        options.userId,
      );
    signerTrust = await verifyCertificateChain(signature.signingCertificate, options);

    const seal = kid(signedInfo, 'Seal');
    const sealLoc = seal && kid(seal, 'BaseLoc');
    if (!sealLoc) throw new Error('SES Seal location is missing');
    const sealPath = resolveOfdPath(signaturePath, textOf(sealLoc));
    const sealBytes = entries.get(sealPath);
    if (!sealBytes) throw new Error(`SES Seal.esl is missing: ${sealPath}`);
    const sealResult = await verifySesSeal(sealBytes, options);
    makerTrust = sealResult.trust;
    const sealMatches = sameBytes(sealBytes, encodeSesSeal(signature.toSign.eseal));
    if (!sealMatches) reasons.push('SES Seal.esl does not match the SignedValue seal');
    sealSignatureValid = sealResult.signatureValid && sealMatches;
    reasons.push(...sealResult.reasons);

    const signingUsageValid =
      signingCertificate.keyUsage !== null && (signingCertificate.keyUsage & 3) !== 0;
    if (!signingUsageValid) reasons.push('SES signing certificate lacks a signing KeyUsage');
    if (!sealResult.validity) reasons.push('SES seal is not valid at the verification time');
    if (signature.toSign.extensions) reasons.push('SES TBS extensions are not supported');

    const trustStates = [signerTrust.status, makerTrust.status];
    const hardFailure =
      !referencesValid ||
      !signatureValid ||
      !sealSignatureValid ||
      !sealResult.validity ||
      !signingUsageValid ||
      Boolean(signature.toSign.extensions) ||
      sealResult.reasons.some((reason) => /unknown critical/i.test(reason));
    if (trustStates.some((state) => state === 'expired' || state === 'revoked')) {
      status = 'invalid';
    } else if (trustStates.includes('untrusted')) {
      status = 'untrusted';
    } else if (hardFailure) {
      status = 'invalid';
    } else if (trustStates.includes('indeterminate')) {
      status = 'indeterminate';
    } else {
      status = 'valid';
    }
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
    status = 'invalid';
  }
  return {
    id: item.id,
    referencesValid,
    signatureValid,
    sealSignatureValid,
    signerTrust,
    makerTrust,
    status: status ?? 'invalid',
    reasons,
  };
}

export async function verifyOfd(
  bytes: Uint8Array | ArrayBuffer,
  options: OfdVerifyOptions,
): Promise<OfdVerifyResult> {
  try {
    const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const entries = await readOfdPackage(input);
    const body = selectDocBody(entries, options.docBodyIndex ?? 0);
    if (!body.signaturesLoc || !entries.has(body.signaturesLoc)) {
      return { signatures: [], errors: ['OFD package contains no signatures'] };
    }
    const list = parseXml(new TextDecoder().decode(entries.get(body.signaturesLoc)));
    const signatures = [];
    for (const signature of kids(list, 'Signature')) {
      signatures.push(
        await verifyOne(
          entries,
          body.signaturesLoc,
          { id: signature.attrs.ID ?? '', baseLoc: signature.attrs.BaseLoc ?? '' },
          options,
        ),
      );
    }
    return { signatures, errors: [] };
  } catch (error) {
    return {
      signatures: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

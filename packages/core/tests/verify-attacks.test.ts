import { beforeAll, describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import { signOfd } from '../src/crypto/ofd-sign';
import { verifyOfd } from '../src/crypto/ofd-verify';
import { unzip } from '../src/zip-read';
import { zipStore } from '../src/zip';
import { createSesTestMaterial, type SesTestMaterial } from './helpers/ses-material';

let victim: SesTestMaterial;
let attacker: SesTestMaterial;

beforeAll(async () => {
  victim = await createSesTestMaterial();
  attacker = await createSesTestMaterial();
});

function sampleDoc(text: string): Uint8Array {
  const doc = new jsOFD({ unit: 'mm', format: 'a4' });
  doc.text(text, 20, 20);
  return doc.output('uint8array') as Uint8Array;
}

function signOptions(material: SesTestMaterial) {
  return {
    eSeal: material.eSeal,
    signingCertificate: material.signingCertificate,
    signer: material.signer,
    now: () => new Date('2026-10-17T12:00:00Z'),
  };
}

describe('OFD SES verification attacks', () => {
  it('does not trust a mathematically valid attacker re-signature', async () => {
    const forged = await signOfd(sampleDoc('攻击者伪造并重签'), signOptions(attacker));
    const result = await verifyOfd(forged, victim.trustOptions());
    expect(result.signatures[0]!.signatureValid).toBe(true);
    expect(result.signatures[0]!.sealSignatureValid).toBe(true);
    expect(result.signatures[0]!.signerTrust.status).toBe('untrusted');
    expect(result.signatures[0]!.makerTrust.status).toBe('untrusted');
    expect(result.signatures[0]!.status).toBe('untrusted');
  });

  it('detects Signature.xml changes and reports malformed packages without throwing', async () => {
    const signed = await signOfd(sampleDoc('签名描述篡改'), signOptions(victim));
    const entries = await unzip(signed);
    const signatureXml = entries.get('Signs/Sign_0/Signature.xml')!;
    signatureXml[signatureXml.length - 2] ^= 1;
    entries.set('Signs/Sign_0/Signature.xml', signatureXml);
    const changed = zipStore([...entries].map(([name, data]) => ({ name, data })));
    const changedResult = await verifyOfd(changed, victim.trustOptions());
    expect(changedResult.signatures[0]!.status).toBe('invalid');

    const malformed = await verifyOfd(new Uint8Array([1, 2, 3]), victim.trustOptions());
    expect(malformed.signatures).toEqual([]);
    expect(malformed.errors.length).toBeGreaterThan(0);
  });

  it('treats revoked certificates as invalid', async () => {
    const signed = await signOfd(sampleDoc('吊销证书'), signOptions(victim));
    const result = await verifyOfd(signed, {
      ...victim.trustOptions(),
      revocationProvider: { check: async () => 'revoked' },
    });
    expect(result.signatures[0]!.signerTrust.status).toBe('revoked');
    expect(result.signatures[0]!.status).toBe('invalid');
  });
});

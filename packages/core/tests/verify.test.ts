import { beforeAll, describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import { signOfd } from '../src/crypto/ofd-sign';
import { verifyOfd } from '../src/crypto/ofd-verify';
import { unzip } from '../src/zip-read';
import { zipStore } from '../src/zip';
import { createSesTestMaterial, type SesTestMaterial } from './helpers/ses-material';

let material: SesTestMaterial;

beforeAll(async () => {
  material = await createSesTestMaterial();
});

function sampleDoc(text = '可信验签'): Uint8Array {
  const doc = new jsOFD({ unit: 'mm', format: 'a4' });
  doc.text(text, 20, 20);
  return doc.output('uint8array') as Uint8Array;
}

function signOptions() {
  return {
    eSeal: material.eSeal,
    signingCertificate: material.signingCertificate,
    signer: material.signer,
    now: () => new Date('2026-10-17T12:00:00Z'),
  };
}

async function replaceEntry(bytes: Uint8Array, name: string, data: Uint8Array): Promise<Uint8Array> {
  const entries = await unzip(bytes);
  entries.set(name, data);
  return zipStore([...entries].map(([entryName, entryData]) => ({ name: entryName, data: entryData })));
}

describe('OFD SES verification', () => {
  it('accepts a trusted seal and detects protected content tampering', async () => {
    const signed = await signOfd(sampleDoc(), signOptions());
    const valid = await verifyOfd(signed, material.trustOptions());
    expect(valid.errors).toEqual([]);
    expect(valid.signatures).toHaveLength(1);
    expect(valid.signatures[0]).toMatchObject({
      status: 'valid',
      referencesValid: true,
      signatureValid: true,
      sealSignatureValid: true,
    });

    const entries = await unzip(signed);
    const content = entries.get('Doc_0/Pages/Page_0/Content.xml')!.slice();
    content[content.length - 2] ^= 1;
    const tampered = await replaceEntry(signed, 'Doc_0/Pages/Page_0/Content.xml', content);
    const result = await verifyOfd(tampered, material.trustOptions());
    expect(result.signatures[0]!.referencesValid).toBe(false);
    expect(result.signatures[0]!.signatureValid).toBe(true);
    expect(result.signatures[0]!.status).toBe('invalid');
  });

  it('verifies every signature in a multi-seal package', async () => {
    const first = await signOfd(sampleDoc('第一次'), signOptions());
    const second = await signOfd(first, signOptions());
    const result = await verifyOfd(second, material.trustOptions());
    expect(result.signatures).toHaveLength(2);
    expect(result.signatures.map((signature) => signature.status)).toEqual(['valid', 'valid']);
  });

  it('returns an empty report for an unsigned document', async () => {
    const result = await verifyOfd(sampleDoc(), material.trustOptions());
    expect(result.signatures).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

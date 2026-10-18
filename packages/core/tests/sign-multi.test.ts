import { beforeAll, describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import { signOfd } from '../src/crypto/ofd-sign';
import { unzip } from '../src/zip-read';
import { kids, parseXml } from '../src/xml-parse';
import { createSesTestMaterial, type SesTestMaterial } from './helpers/ses-material';

let material: SesTestMaterial;

beforeAll(async () => {
  material = await createSesTestMaterial();
});

function sampleDoc(): Uint8Array {
  const doc = new jsOFD({ unit: 'mm', format: 'a4' });
  doc.text('多次签章', 20, 20);
  return doc.output('uint8array') as Uint8Array;
}

function options() {
  return {
    eSeal: material.eSeal,
    signingCertificate: material.signingCertificate,
    signer: material.signer,
    now: () => new Date('2026-10-17T12:00:00Z'),
  };
}

describe('multiple SES signatures', () => {
  it('preserves old signature files and does not modify OFD.xml again', async () => {
    const first = await signOfd(sampleDoc(), options());
    const firstEntries = await unzip(first);
    const second = await signOfd(first, options());
    const secondEntries = await unzip(second);
    for (const name of [
      'Signs/Sign_0/Signature.xml',
      'Signs/Sign_0/Seal.esl',
      'Signs/Sign_0/SignedValue.dat',
    ]) {
      expect(secondEntries.get(name)).toEqual(firstEntries.get(name));
    }
    expect(secondEntries.get('OFD.xml')).toEqual(firstEntries.get('OFD.xml'));
    expect(secondEntries.has('Signs/Sign_1/Signature.xml')).toBe(true);
    const list = parseXml(new TextDecoder().decode(secondEntries.get('Signs/Signatures.xml')));
    expect(kids(list, 'Signature')).toHaveLength(2);
  });

  it('rejects another signature after complete-protection mode', async () => {
    const first = await signOfd(sampleDoc(), { ...options(), allowAdditionalSignatures: false });
    await expect(signOfd(first, options())).rejects.toThrow(/additional|protected|signature/i);
  });
});

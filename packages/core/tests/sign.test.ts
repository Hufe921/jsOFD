import { beforeAll, describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import { signOfd } from '../src/crypto/ofd-sign';
import { parseSesSignature } from '../src/crypto/ses-v4';
import { Sm3 } from '../src/crypto/sm3';
import { unzip } from '../src/zip-read';
import { parseXml, textOf } from '../src/xml-parse';
import { createSesTestMaterial, type SesTestMaterial } from './helpers/ses-material';

let material: SesTestMaterial;

beforeAll(async () => {
  material = await createSesTestMaterial();
});

function sampleDoc(): Uint8Array {
  const doc = new jsOFD({ unit: 'mm', format: 'a4' });
  doc.text('签章验证文档', 20, 20);
  return doc.output('uint8array') as Uint8Array;
}

function options(): Parameters<typeof signOfd>[1] {
  return {
    eSeal: material.eSeal,
    signingCertificate: material.signingCertificate,
    signer: material.signer,
    stamp: { page: 1, x: 120, y: 240, w: 40, h: 40 },
    provider: { name: 'A&B <Provider>', company: '测试', version: '1' },
    now: () => new Date('2026-10-17T12:00:00Z'),
  };
}

describe('SES OFD signing', () => {
  it('writes the standard signature list, seal, and SES signed value', async () => {
    const signed = await signOfd(sampleDoc(), options());
    const entries = await unzip(signed);
    for (const name of [
      'Signs/Signatures.xml',
      'Signs/Sign_0/Signature.xml',
      'Signs/Sign_0/Seal.esl',
      'Signs/Sign_0/SignedValue.dat',
    ]) {
      expect(entries.has(name)).toBe(true);
    }
    expect(entries.get('Signs/Sign_0/Seal.esl')).toEqual(material.eSeal);

    const signatureXml = entries.get('Signs/Sign_0/Signature.xml')!;
    const signature = parseSesSignature(entries.get('Signs/Sign_0/SignedValue.dat')!);
    expect(signature.toSign.dataHash).toEqual(new Sm3().update(signatureXml).digest());
    expect(signature.toSign.eseal.info.esId).toBe('SEAL-001');
    expect(signature.signingCertificate).toEqual(material.signingCertificate);

    const root = parseXml(new TextDecoder().decode(signatureXml));
    const signedInfo = root.children[0]!;
    expect(signedInfo.children.find((child) => child.name === 'Provider')?.attrs.ProviderName).toBe(
      'A&B <Provider>',
    );
    expect(textOf(signedInfo.children.find((child) => child.name === 'SignatureDateTime')!)).toBe(
      '20261017120000',
    );
    const stamp = signedInfo.children.find((child) => child.name === 'StampAnnot');
    const document = parseXml(new TextDecoder().decode(entries.get('Doc_0/Document.xml')));
    const pageId = document.children.find((child) => child.name === 'Pages')?.children[0]?.attrs.ID;
    expect(stamp?.attrs).toMatchObject({ PageRef: pageId, ID: 's001', Boundary: '120 240 40 40' });
    const references = signedInfo.children.find((child) => child.name === 'References')!;
    expect(references.children.length).toBeGreaterThan(3);
    expect(references.children.some((reference) => reference.attrs.FileRef === '/OFD.xml')).toBe(true);
    expect(references.children.some((reference) => reference.attrs.FileRef === '/Signs/Signatures.xml')).toBe(false);
  });

  it('includes the signature list in complete-protection mode', async () => {
    const signed = await signOfd(sampleDoc(), { ...options(), allowAdditionalSignatures: false });
    const entries = await unzip(signed);
    const root = parseXml(new TextDecoder().decode(entries.get('Signs/Sign_0/Signature.xml')));
    const references = root.children[0]!.children.find((child) => child.name === 'References')!;
    expect(references.children.some((reference) => reference.attrs.FileRef === '/Signs/Signatures.xml')).toBe(true);
  });
});

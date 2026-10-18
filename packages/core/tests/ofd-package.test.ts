import { describe, expect, it } from 'vitest';
import {
  collectProtectedEntries,
  readOfdPackage,
  resolveOfdPath,
  selectDocBody,
} from '../src/crypto/ofd-package';
import {
  buildSignatureXml,
  updateSignatureList,
} from '../src/crypto/ofd-signature-xml';
import { parseXml, textOf } from '../src/xml-parse';
import { utf8Encode } from '../src/utils';
import { zipStore } from '../src/zip';

describe('OFD signature package paths', () => {
  it('resolves absolute and relative package locations safely', () => {
    expect(resolveOfdPath('Signs/Sign_0/Signature.xml', 'SignedValue.dat')).toBe(
      'Signs/Sign_0/SignedValue.dat',
    );
    expect(resolveOfdPath('Signs/Sign_0/Signature.xml', '/OFD.xml')).toBe('OFD.xml');
    expect(resolveOfdPath('Doc_0/Document.xml', '../OFD.xml')).toBe('OFD.xml');
    expect(() => resolveOfdPath('Doc_0/Document.xml', '../../etc/passwd')).toThrow(/path|traversal/i);
    expect(() => resolveOfdPath('Doc_0/Document.xml', 'C:\\secret')).toThrow(/path/i);
  });

  it('selects a DocBody and existing signatures entry', () => {
    const entries = new Map([
      ['OFD.xml', utf8Encode(`<?xml version="1.0"?><ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody><ofd:DocBody><ofd:DocRoot>Doc_1/Document.xml</ofd:DocRoot><ofd:Signatures>Doc_1/Signs/Signatures.xml</ofd:Signatures></ofd:DocBody></ofd:OFD>`)],
    ]);
    const body = selectDocBody(entries, 1);
    expect(body.docRoot).toBe('Doc_1/Document.xml');
    expect(body.signaturesLoc).toBe('Doc_1/Signs/Signatures.xml');
    expect(() => selectDocBody(entries, 2)).toThrow(/DocBody|index/i);
  });

  it('excludes only the signature list when additional signatures are allowed', () => {
    const entries = new Map([
      ['OFD.xml', new Uint8Array([1])],
      ['Signs/Signatures.xml', new Uint8Array([2])],
      ['Signs/Sign_0/Signature.xml', new Uint8Array([3])],
      ['Signs/Sign_0/SignedValue.dat', new Uint8Array([4])],
    ]);
    const incremental = collectProtectedEntries(entries, 'Signs/Signatures.xml', true);
    expect(incremental.map((entry) => entry.name)).toEqual([
      'OFD.xml',
      'Signs/Sign_0/Signature.xml',
      'Signs/Sign_0/SignedValue.dat',
    ]);
    const complete = collectProtectedEntries(entries, 'Signs/Signatures.xml', false);
    expect(complete.map((entry) => entry.name)).toContain('Signs/Signatures.xml');
  });

  it('rejects duplicate ZIP entries and unsafe package names', async () => {
    const duplicate = zipStore([
      { name: 'OFD.xml', data: utf8Encode('<a/>') },
      { name: 'OFD.xml', data: utf8Encode('<b/>') },
    ]);
    await expect(readOfdPackage(duplicate)).rejects.toThrow(/duplicate/i);
    const traversal = zipStore([{ name: '../secret', data: new Uint8Array([1]) }]);
    await expect(readOfdPackage(traversal)).rejects.toThrow(/path/i);
  });
});

describe('OFD signature XML', () => {
  it('builds standard references, seal, and stamp appearance with escaping', () => {
    const bytes = buildSignatureXml({
      provider: { name: 'A&B <Provider>', company: '测试', version: '1' },
      signatureMethod: '1.2.156.10197.1.501',
      signatureDateTime: '20261017120000',
      checkMethod: '1.2.156.10197.1.401',
      references: [{ fileRef: '/OFD.xml', checkValue: 'AAEC/f7/' }],
      stamp: { pageRef: '1', id: 's001', boundary: '120 240 40 40' },
      sealLoc: '/Signs/Sign_0/Seal.esl',
      signedValueLoc: '/Signs/Sign_0/SignedValue.dat',
    });
    const xml = new TextDecoder().decode(bytes);
    expect(xml).toContain('A&amp;B &lt;Provider&gt;');
    const root = parseXml(xml);
    expect(root.name).toBe('Signature');
    expect(root.children.find((child) => child.name === 'SignedValue')?.text).toBe(
      '/Signs/Sign_0/SignedValue.dat',
    );
    const references = root.children[0]?.children.find((child) => child.name === 'References');
    expect(references?.attrs.CheckMethod).toBe('1.2.156.10197.1.401');
    expect(textOf(references!.children[0]!.children[0]!)).toBe('AAEC/f7/');
    const stamp = root.children[0]?.children.find((child) => child.name === 'StampAnnot');
    expect(stamp?.attrs).toMatchObject({ PageRef: '1', ID: 's001', Boundary: '120 240 40 40' });
  });

  it('updates signature lists with either prefixed or default namespaces', () => {
    const updated = updateSignatureList({
      entry: { id: 's002', type: 'Seal', baseLoc: '/Signs/Sign_1/Signature.xml' },
      maxSignId: 's003',
    });
    const root = parseXml(new TextDecoder().decode(updated));
    expect(root.name).toBe('Signatures');
    expect(root.children[0]?.attrs).toMatchObject({ ID: 's002', Type: 'Seal' });
    expect(root.children.find((child) => child.name === 'MaxSignId')?.text).toBe('s003');

    const existing = utf8Encode(`<Signatures xmlns="http://www.ofdspec.org/2016"><Signature ID="s001" Type="Seal" BaseLoc="/Signs/Sign_0/Signature.xml"/><MaxSignId>s002</MaxSignId></Signatures>`);
    const merged = new TextDecoder().decode(
      updateSignatureList({
        existing,
        entry: { id: 's002', type: 'Seal', baseLoc: '/Signs/Sign_1/Signature.xml' },
        maxSignId: 's003',
      }),
    );
    expect(merged).toContain('<Signature');
    expect(merged).not.toContain('<ofd:Signature');
    expect(parseXml(merged).children.filter((child) => child.name === 'Signature')).toHaveLength(2);
  });
});

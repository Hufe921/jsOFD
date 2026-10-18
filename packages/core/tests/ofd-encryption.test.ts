import { describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import { decryptOfdPassword, encryptOfdPassword } from '../src/crypto/ofd-encryption';
import { unzip } from '../src/zip-read';
import { parseXml } from '../src/xml-parse';

function sampleDoc(): Uint8Array {
  const doc = new jsOFD({ unit: 'mm', format: 'a4' });
  doc.text('需要保密的 OFD 内容', 20, 20);
  return doc.output('uint8array') as Uint8Array;
}

async function expectSameEntries(actual: Uint8Array, expected: Uint8Array): Promise<void> {
  const a = await unzip(actual);
  const e = await unzip(expected);
  expect([...a.keys()].sort()).toEqual([...e.keys()].sort());
  for (const [name, data] of e) expect(a.get(name)).toEqual(data);
}

describe('OFD password encryption', () => {
  it('writes the standard encryption files and removes full-package plaintext', async () => {
    const encrypted = await encryptOfdPassword(sampleDoc(), {
      userName: 'demo',
      password: '12345678',
    });
    const entries = await unzip(encrypted);
    expect(entries.has('Encryptions.xml')).toBe(true);
    expect(entries.has('decryptseed.dat')).toBe(true);
    expect(entries.has('entriesmap.dat')).toBe(true);
    expect(entries.has('OFD.xml')).toBe(false);
    expect(entries.has('Doc_0/Pages/Page_0/Content.xml')).toBe(false);

    const seed = parseXml(new TextDecoder().decode(entries.get('decryptseed.dat')));
    expect(seed.name).toBe('DecyptSeed');
    expect(seed.attrs.EncryptCaseId).toBe('1.1.1');
    expect(seed.children[0]?.attrs.UserName).toBe('demo');
    expect(new TextDecoder().decode(entries.get('entriesmap.dat'))).not.toContain('EncryptEntries');
  });

  it('round-trips the complete package and rejects a wrong password', async () => {
    const original = sampleDoc();
    const encrypted = await encryptOfdPassword(original, {
      userName: 'demo',
      password: '12345678',
    });
    const decrypted = await decryptOfdPassword(encrypted, {
      userName: 'demo',
      password: '12345678',
    });
    await expectSameEntries(decrypted, original);
    await expect(
      decryptOfdPassword(encrypted, { userName: 'demo', password: 'wrong-password' }),
    ).rejects.toThrow(/decrypt|password|padding|XML/i);
  });

  it('supports partial encryption without changing unselected plaintext', async () => {
    const original = sampleDoc();
    const encrypted = await encryptOfdPassword(original, {
      userName: 'demo',
      password: '12345678',
      filter: (name) => name === 'Doc_0/Pages/Page_0/Content.xml',
    });
    const entries = await unzip(encrypted);
    expect(entries.has('OFD.xml')).toBe(true);
    expect(entries.has('Doc_0/Document.xml')).toBe(true);
    expect(entries.has('Doc_0/Pages/Page_0/Content.xml')).toBe(false);
    const decrypted = await decryptOfdPassword(encrypted, {
      userName: 'demo',
      password: '12345678',
    });
    await expectSameEntries(decrypted, original);
  });
});

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsOFD } from '../../src/jsofd';
import { createSesSeal } from '../../src/crypto/ofd-seal';
import { signOfd } from '../../src/crypto/ofd-sign';
import { verifyOfd } from '../../src/crypto/ofd-verify';
import { createLocalTestSm2Signer } from '../../src/crypto/signer';
import { hexToBytes } from '../../src/crypto/sm3';
import { unzip } from '../../src/zip-read';
import { zipStore } from '../../src/zip';

const directory = process.env.JSOFD_SES_TEST_DIR;
const itWithMaterials = directory ? it : it.skip;

function sampleDoc(): Uint8Array {
  const doc = new jsOFD({ unit: 'mm', format: 'a4' });
  doc.text('jsOFD SES interoperability', 20, 20);
  return doc.output('uint8array') as Uint8Array;
}

describe('external SES interoperability materials', () => {
  itWithMaterials('generates single, multiple, and tampered packages', async () => {
    const root = directory!;
    const read = (name: string): Uint8Array => readFileSync(join(root, name));
    const readKey = (name: string): Uint8Array =>
      hexToBytes(readFileSync(join(root, name), 'utf8').trim());
    const optional = (name: string): Uint8Array | undefined => {
      try {
        return read(name);
      } catch {
        return undefined;
      }
    };
    const makerRoot = optional('maker-root.der') ?? read('root.der');
    const signerRoot = optional('signer-root.der') ?? read('root.der');
    const makerIntermediate = optional('maker-intermediate.der') ?? optional('intermediate.der');
    const signerIntermediate = optional('signer-intermediate.der') ?? optional('intermediate.der');
    const makerCertificate = read('maker.der');
    const signingCertificate = read('signer.der');
    const now = new Date();
    const day = 86400000;
    const eSeal = await createSesSeal({
      info: {
        header: { id: 'ES', version: 4, vid: 'JSOFD' },
        esId: `JSOFD-${now.getTime()}`,
        property: {
          type: 1,
          name: 'jsOFD Interop Seal',
          certList: [signingCertificate],
          createDate: now,
          validStart: new Date(now.getTime() - day),
          validEnd: new Date(now.getTime() + 365 * day),
        },
        picture: {
          type: 'PNG',
          data: read('seal.png'),
          width: 40,
          height: 40,
        },
      },
      makerCertificate,
      signer: createLocalTestSm2Signer(readKey('maker-key.hex')),
    });
    const options = {
      eSeal,
      signingCertificate,
      signer: createLocalTestSm2Signer(readKey('signer-key.hex')),
      stamp: { page: 1, x: 120, y: 240, w: 40, h: 40 },
    };
    const trustOptions = {
      trustAnchors: [...new Map([makerRoot, signerRoot].map((der) => [der.join(','), der])).values()],
      intermediates: [makerIntermediate, signerIntermediate].filter(
        (der): der is Uint8Array => Boolean(der),
      ),
      at: now,
    };
    const single = await signOfd(sampleDoc(), options);
    const multiple = await signOfd(single, options);
    const singleReport = await verifyOfd(single, trustOptions);
    const multipleReport = await verifyOfd(multiple, trustOptions);
    expect(singleReport.signatures.map((item) => item.status)).toEqual(['valid']);
    expect(multipleReport.signatures.map((item) => item.status)).toEqual(['valid', 'valid']);

    const entries = await unzip(single);
    const content = entries.get('Doc_0/Pages/Page_0/Content.xml')!.slice();
    content[content.length - 2] ^= 1;
    entries.set('Doc_0/Pages/Page_0/Content.xml', content);
    const tampered = zipStore([...entries].map(([name, data]) => ({ name, data })));
    const tamperedReport = await verifyOfd(tampered, trustOptions);
    expect(tamperedReport.signatures[0]!.status).toBe('invalid');

    const output = mkdtempSync(join(tmpdir(), 'jsofd-ses-interop-'));
    writeFileSync(join(output, 'single.ofd'), single);
    writeFileSync(join(output, 'multiple.ofd'), multiple);
    writeFileSync(join(output, 'tampered.ofd'), tampered);
    console.info(`SES interoperability samples written to ${output}`);
  });
});

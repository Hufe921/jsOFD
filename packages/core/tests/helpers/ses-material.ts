import { createSesSeal } from '../../src/crypto/ofd-seal';
import type { SesSealInfoInput } from '../../src/crypto/ses-v4';
import { createLocalTestSm2Signer, type Sm2Signer } from '../../src/crypto/signer';
import { createTestChain, type TestChain } from './test-ca';

export interface SesTestMaterial {
  chain: TestChain;
  eSeal: Uint8Array;
  signingCertificate: Uint8Array;
  signer: Sm2Signer;
  trustOptions: () => {
    trustAnchors: Uint8Array[];
    intermediates: Uint8Array[];
    at: Date;
  };
}

export async function createSesTestMaterial(
  picture?: SesSealInfoInput['picture'],
): Promise<SesTestMaterial> {
  const chain = createTestChain();
  const info: SesSealInfoInput = {
    header: { id: 'ES', version: 4, vid: 'JSOFD' },
    esId: 'SEAL-001',
    property: {
      type: 1,
      name: '测试印章',
      certList: [chain.leaf.der],
      createDate: new Date('2026-01-01T00:00:00Z'),
      validStart: new Date('2026-01-01T00:00:00Z'),
      validEnd: new Date('2027-01-01T00:00:00Z'),
    },
    picture: picture ?? {
      type: 'PNG',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      width: 40,
      height: 40,
    },
  };
  const eSeal = await createSesSeal({
    info,
    makerCertificate: chain.leaf.der,
    signer: createLocalTestSm2Signer(chain.leaf.privateKey),
  });
  return {
    chain,
    eSeal,
    signingCertificate: chain.leaf.der,
    signer: createLocalTestSm2Signer(chain.leaf.privateKey),
    trustOptions: () => ({
      trustAnchors: [chain.root.der],
      intermediates: [chain.intermediate.der],
      at: new Date('2026-10-17T00:00:00Z'),
    }),
  };
}

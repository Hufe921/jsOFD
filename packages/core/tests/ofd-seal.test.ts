import { beforeAll, describe, expect, it } from 'vitest';
import { createSesSeal, verifySesSeal } from '../src/crypto/ofd-seal';
import { parseSesSeal, type SesSealInfoInput } from '../src/crypto/ses-v4';
import { createLocalTestSm2Signer } from '../src/crypto/signer';
import { createTestChain, createTestRoot, type TestChain } from './helpers/test-ca';

const AT = new Date('2026-10-17T00:00:00Z');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const CRITICAL_EXTENSIONS = new Uint8Array([
  0x30, 0x0d, 0x30, 0x0b, 0x06, 0x03, 0x2a, 0x03, 0x04, 0x01, 0x01, 0xff, 0x04, 0x01, 0x00,
]);
let chain: TestChain;

beforeAll(() => {
  chain = createTestChain();
});

function sealInfo(): SesSealInfoInput {
  return {
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
    picture: { type: 'PNG', data: PNG, width: 40, height: 40 },
  };
}

async function makeSeal(info = sealInfo()): Promise<Uint8Array> {
  return createSesSeal({
    info,
    makerCertificate: chain.leaf.der,
    signer: createLocalTestSm2Signer(chain.leaf.privateKey),
  });
}

function trustOptions() {
  return {
    trustAnchors: [chain.root.der],
    intermediates: [chain.intermediate.der],
    at: AT,
  };
}

describe('SES electronic seal', () => {
  it('creates a seal, verifies its maker signature and trust, and extracts the picture', async () => {
    const der = await makeSeal();
    const seal = parseSesSeal(der);
    expect(seal.makerCertificate).toEqual(chain.leaf.der);
    const result = await verifySesSeal(der, trustOptions());
    expect(result.valid).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.trust.status).toBe('trusted');
    expect(result.validity).toBe(true);
    expect(result.picture?.data).toEqual(PNG);
  });

  it('detects eSealInfo tampering', async () => {
    const der = await makeSeal();
    const seal = parseSesSeal(der);
    seal.info.property.name = '被篡改的印章';
    const tampered = await verifySesSeal(seal.info.rawDer.length ? der.slice() : der, trustOptions());
    expect(tampered.valid).toBe(true);

    const { encodeSesSeal } = await import('../src/crypto/ses-v4');
    const changed = encodeSesSeal(seal);
    const result = await verifySesSeal(changed, trustOptions());
    expect(result.signatureValid).toBe(false);
    expect(result.valid).toBe(false);
  });

  it('separates mathematical validity from certificate trust', async () => {
    const der = await makeSeal();
    const result = await verifySesSeal(der, {
      trustAnchors: [createTestRoot('Wrong Root').der],
      intermediates: [chain.intermediate.der],
      at: AT,
    });
    expect(result.signatureValid).toBe(true);
    expect(result.trust.status).toBe('untrusted');
    expect(result.valid).toBe(false);
  });

  it('rejects expired seals and unknown critical extensions', async () => {
    const expiredInfo = sealInfo();
    expiredInfo.property.validEnd = new Date('2026-02-01T00:00:00Z');
    const expired = await verifySesSeal(await makeSeal(expiredInfo), trustOptions());
    expect(expired.validity).toBe(false);
    expect(expired.valid).toBe(false);

    const extendedInfo = { ...sealInfo(), extensions: CRITICAL_EXTENSIONS };
    const extended = await verifySesSeal(await makeSeal(extendedInfo), trustOptions());
    expect(extended.valid).toBe(false);
    expect(extended.reasons.join(' ')).toMatch(/critical/i);
  });
});

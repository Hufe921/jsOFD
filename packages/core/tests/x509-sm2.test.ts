import { beforeAll, describe, expect, it } from 'vitest';
import {
  parseSm2Certificate,
  verifyCertificateChain,
  verifySm2CertificateSignature,
} from '../src/crypto/x509-sm2';
import {
  createTestChain,
  createTestRoot,
  issueTestCertificate,
  type TestChain,
} from './helpers/test-ca';
import { sm2Generate } from '../src/crypto/sm2';

const AT = new Date('2026-10-17T00:00:00Z');
let chain: TestChain;

beforeAll(() => {
  chain = createTestChain();
});

describe('SM2 X.509 certificates', () => {
  it('parses standard fields and verifies the issuer signature', () => {
    const cert = parseSm2Certificate(chain.leaf.der);
    expect(cert.subject).toBe('Test Signer');
    expect(cert.issuer).toBe('Test Intermediate');
    expect(cert.isCa).toBe(false);
    expect(cert.publicKey).toEqual(chain.leaf.publicKey);
    expect(verifySm2CertificateSignature(chain.leaf.der, chain.intermediate.der)).toBe(true);
    expect(verifySm2CertificateSignature(chain.leaf.der, chain.root.der)).toBe(false);
  });

  it('trusts a valid Root → Intermediate → Leaf chain', async () => {
    const result = await verifyCertificateChain(chain.leaf.der, {
      trustAnchors: [chain.root.der],
      intermediates: [chain.intermediate.der],
      at: AT,
    });
    expect(result.status).toBe('trusted');
    expect(result.chain).toEqual(['Test Signer', 'Test Intermediate', 'Test Root']);
  });

  it('rejects a wrong trust anchor and a tampered certificate', async () => {
    const otherRoot = createTestRoot('Other Root');
    const wrong = await verifyCertificateChain(chain.leaf.der, {
      trustAnchors: [otherRoot.der],
      intermediates: [chain.intermediate.der],
      at: AT,
    });
    expect(wrong.status).toBe('untrusted');

    const tampered = chain.leaf.der.slice();
    tampered[tampered.length - 1] ^= 1;
    const attacked = await verifyCertificateChain(tampered, {
      trustAnchors: [chain.root.der],
      intermediates: [chain.intermediate.der],
      at: AT,
    });
    expect(attacked.status).toBe('untrusted');
  });

  it('rejects expired certificates, non-CA issuers, missing keyCertSign, and pathLen violations', async () => {
    const expired = issueTestCertificate({
      subject: 'Expired Signer',
      subjectKeys: sm2Generate(),
      issuer: chain.intermediate,
      notAfter: new Date('2026-01-01T00:00:00Z'),
    });
    const expiredResult = await verifyCertificateChain(expired.der, {
      trustAnchors: [chain.root.der],
      intermediates: [chain.intermediate.der],
      at: AT,
    });
    expect(expiredResult.status).toBe('expired');

    const nonCa = issueTestCertificate({
      subject: 'Not CA',
      subjectKeys: sm2Generate(),
      issuer: chain.root,
      ca: false,
    });
    const nonCaLeaf = issueTestCertificate({
      subject: 'Leaf Below Not CA',
      subjectKeys: sm2Generate(),
      issuer: nonCa,
    });
    const nonCaResult = await verifyCertificateChain(nonCaLeaf.der, {
      trustAnchors: [chain.root.der],
      intermediates: [nonCa.der],
      at: AT,
    });
    expect(nonCaResult.status).toBe('untrusted');

    const noCertSign = issueTestCertificate({
      subject: 'No Cert Sign',
      subjectKeys: sm2Generate(),
      issuer: chain.root,
      ca: true,
      usage: 'no-cert-sign',
    });
    const noCertSignLeaf = issueTestCertificate({
      subject: 'Leaf Below No Cert Sign',
      subjectKeys: sm2Generate(),
      issuer: noCertSign,
    });
    const usageResult = await verifyCertificateChain(noCertSignLeaf.der, {
      trustAnchors: [chain.root.der],
      intermediates: [noCertSign.der],
      at: AT,
    });
    expect(usageResult.status).toBe('untrusted');

    const limitedRoot = createTestRoot('Limited Root', 0);
    const limitedIntermediate = issueTestCertificate({
      subject: 'Limited Intermediate',
      subjectKeys: sm2Generate(),
      issuer: limitedRoot,
      ca: true,
    });
    const limitedLeaf = issueTestCertificate({
      subject: 'Limited Leaf',
      subjectKeys: sm2Generate(),
      issuer: limitedIntermediate,
    });
    const pathResult = await verifyCertificateChain(limitedLeaf.der, {
      trustAnchors: [limitedRoot.der],
      intermediates: [limitedIntermediate.der],
      at: AT,
    });
    expect(pathResult.status).toBe('untrusted');
  });

  it('rejects unknown critical extensions', async () => {
    const leaf = issueTestCertificate({
      subject: 'Critical Extension',
      subjectKeys: sm2Generate(),
      issuer: chain.intermediate,
      unknownCriticalExtension: true,
    });
    const result = await verifyCertificateChain(leaf.der, {
      trustAnchors: [chain.root.der],
      intermediates: [chain.intermediate.der],
      at: AT,
    });
    expect(result.status).toBe('untrusted');
  });

  it('handles revoked, unknown, and required revocation states', async () => {
    const revoked = await verifyCertificateChain(chain.leaf.der, {
      trustAnchors: [chain.root.der],
      intermediates: [chain.intermediate.der],
      at: AT,
      revocationProvider: { check: async () => 'revoked' },
    });
    expect(revoked.status).toBe('revoked');

    const unknown = await verifyCertificateChain(chain.leaf.der, {
      trustAnchors: [chain.root.der],
      intermediates: [chain.intermediate.der],
      at: AT,
      revocationProvider: { check: async () => 'unknown' },
      requireRevocation: true,
    });
    expect(unknown.status).toBe('indeterminate');

    const optional = await verifyCertificateChain(chain.leaf.der, {
      trustAnchors: [chain.root.der],
      intermediates: [chain.intermediate.der],
      at: AT,
      revocationProvider: { check: async () => 'unknown' },
    });
    expect(optional.status).toBe('trusted');
  });

  it('returns indeterminate for malformed certificates', async () => {
    const result = await verifyCertificateChain(new Uint8Array([0x30, 0x00]), {
      trustAnchors: [chain.root.der],
      at: AT,
    });
    expect(result.status).toBe('indeterminate');
  });
});

import * as asn1js from 'asn1js';
import {
  sm2Generate,
  sm2Sign,
  sm2SignatureToDer,
  type Sm2KeyPair,
} from '../../src/crypto/sm2';

const OID_SM2_SIGN = '1.2.156.10197.1.501';
const OID_SM2_ECC = '1.2.156.10197.1.301';

export interface TestCertificate extends Sm2KeyPair {
  der: Uint8Array;
  subject: string;
}

export interface IssueCertificateOptions {
  subject: string;
  subjectKeys: Sm2KeyPair;
  issuer: TestCertificate;
  notBefore?: Date;
  notAfter?: Date;
  ca?: boolean;
  pathLength?: number;
  usage?: 'ca' | 'sign' | 'no-cert-sign';
  unknownCriticalExtension?: boolean;
}

function seq(...items: asn1js.BaseBlock[]): asn1js.Sequence {
  return new asn1js.Sequence({ value: items });
}

function name(cn: string): asn1js.Sequence {
  return seq(
    new asn1js.Set({
      value: [seq(new asn1js.ObjectIdentifier({ value: '2.5.4.3' }), new asn1js.Utf8String({ value: cn }))],
    }),
  );
}

function algorithm(oid: string): asn1js.Sequence {
  return seq(new asn1js.ObjectIdentifier({ value: oid }));
}

function extension(oid: string, critical: boolean, value: Uint8Array): asn1js.Sequence {
  const items: asn1js.BaseBlock[] = [new asn1js.ObjectIdentifier({ value: oid })];
  if (critical) items.push(new asn1js.Boolean({ value: true }));
  items.push(new asn1js.OctetString({ valueHex: value }));
  return seq(...items);
}

function encoded(block: asn1js.BaseBlock): Uint8Array {
  return new Uint8Array(block.toBER());
}

export function issueTestCertificate(options: IssueCertificateOptions): TestCertificate {
  const notBefore = options.notBefore ?? new Date('2026-01-01T00:00:00Z');
  const notAfter = options.notAfter ?? new Date('2027-01-01T00:00:00Z');
  const usage = options.usage ?? (options.ca ? 'ca' : 'sign');
  const basicConstraints = seq(
    new asn1js.Boolean({ value: options.ca ?? false }),
    ...(options.pathLength === undefined ? [] : [asn1js.Integer.fromBigInt(options.pathLength)]),
  );
  const keyUsageBits = usage === 'sign' || usage === 'no-cert-sign' ? 0xc0 : 0x06;
  const keyUsageUnused = usage === 'sign' || usage === 'no-cert-sign' ? 6 : 1;
  const extensions = [
    extension('2.5.29.19', true, encoded(basicConstraints)),
    extension(
      '2.5.29.15',
      true,
      encoded(new asn1js.BitString({ valueHex: new Uint8Array([keyUsageBits]), unusedBits: keyUsageUnused })),
    ),
  ];
  if (options.unknownCriticalExtension) {
    extensions.push(extension('1.3.6.1.4.1.55555.1', true, new Uint8Array([1])));
  }
  const serialBytes = new Uint8Array(8);
  crypto.getRandomValues(serialBytes);
  const serial = BigInt('0x' + Array.from(serialBytes, (b) => b.toString(16).padStart(2, '0')).join(''));
  const tbs = seq(
    new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: [asn1js.Integer.fromBigInt(2)] }),
    asn1js.Integer.fromBigInt(serial),
    algorithm(OID_SM2_SIGN),
    name(options.issuer.subject),
    seq(new asn1js.UTCTime({ valueDate: notBefore }), new asn1js.UTCTime({ valueDate: notAfter })),
    name(options.subject),
    seq(
      algorithm(OID_SM2_ECC),
      new asn1js.BitString({ valueHex: options.subjectKeys.publicKey }),
    ),
    new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 3 }, value: [seq(...extensions)] }),
  );
  const tbsDer = encoded(tbs);
  const signature = sm2SignatureToDer(sm2Sign(options.issuer.privateKey, tbsDer));
  const der = encoded(
    seq(tbs, algorithm(OID_SM2_SIGN), new asn1js.BitString({ valueHex: signature })),
  );
  return {
    der,
    subject: options.subject,
    privateKey: options.subjectKeys.privateKey,
    publicKey: options.subjectKeys.publicKey,
  };
}

export function createTestRoot(subject = 'Test Root', pathLength?: number): TestCertificate {
  const keys = sm2Generate();
  const placeholder = { ...keys, der: new Uint8Array(), subject } as TestCertificate;
  return issueTestCertificate({
    subject,
    subjectKeys: keys,
    issuer: placeholder,
    ca: true,
    pathLength,
  });
}

export interface TestChain {
  root: TestCertificate;
  intermediate: TestCertificate;
  leaf: TestCertificate;
}

export function createTestChain(): TestChain {
  const root = createTestRoot('Test Root', 1);
  const intermediate = issueTestCertificate({
    subject: 'Test Intermediate',
    subjectKeys: sm2Generate(),
    issuer: root,
    ca: true,
    pathLength: 0,
  });
  const leaf = issueTestCertificate({
    subject: 'Test Signer',
    subjectKeys: sm2Generate(),
    issuer: intermediate,
  });
  return { root, intermediate, leaf };
}

import { describe, expect, it } from 'vitest';
import {
  encodeSesSeal,
  encodeSesSignature,
  parseSesSeal,
  parseSesSignature,
} from '../src/crypto/ses-v4';
import { SES_V4_SEAL_DER, SES_V4_SIGNATURE_DER } from './fixtures/ses-v4';

describe('SES V4 DER', () => {
  it('parses and re-encodes an electronic seal byte-for-byte', () => {
    const seal = parseSesSeal(SES_V4_SEAL_DER);
    expect(seal.info.header.id).toBe('ES');
    expect(seal.info.header.version).toBe(4);
    expect(seal.info.header.vid).toBe('JSOFD');
    expect(seal.info.esId).toBe('SEAL-001');
    expect(seal.info.property.name).toBe('Test Seal');
    expect(seal.info.property.certList).toHaveLength(1);
    expect(seal.info.picture.type).toBe('PNG');
    expect(seal.info.picture.width).toBe(40);
    expect(seal.info.picture.height).toBe(40);
    expect(seal.signAlgId).toBe('1.2.156.10197.1.501');
    expect(encodeSesSeal(seal)).toEqual(SES_V4_SEAL_DER);
  });

  it('parses and re-encodes an electronic signature with a timestamp', () => {
    const signature = parseSesSignature(SES_V4_SIGNATURE_DER);
    expect(signature.toSign.version).toBe(4);
    expect(signature.toSign.timeInfo.toISOString()).toBe('2026-10-17T00:00:00.000Z');
    expect(signature.toSign.dataHash).toHaveLength(32);
    expect(signature.toSign.propertyInfo).toBe('OFD');
    expect(signature.toSign.eseal.info.esId).toBe('SEAL-001');
    expect(signature.timeStamp).toEqual(new Uint8Array([1, 2]));
    expect(encodeSesSignature(signature)).toEqual(SES_V4_SIGNATURE_DER);
  });

  it('retains the original TBS DER for signature verification', () => {
    const signature = parseSesSignature(SES_V4_SIGNATURE_DER);
    expect(signature.toSign.rawDer[0]).toBe(0x30);
    expect(signature.toSign.eseal.info.rawDer[0]).toBe(0x30);
  });

  it('rejects truncated, empty, and trailing data', () => {
    expect(() => parseSesSignature(new Uint8Array([0x30, 0x00]))).toThrow(/SES|field|SEQUENCE/i);
    expect(() => parseSesSeal(SES_V4_SEAL_DER.slice(0, 20))).toThrow(/DER|SES/i);
    expect(() =>
      parseSesSeal(new Uint8Array([...SES_V4_SEAL_DER, 0])),
    ).toThrow(/trailing/i);
  });
});

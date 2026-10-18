import { describe, expect, it } from 'vitest';
import {
  sm2Generate,
  sm2Sign,
  sm2SignWithK,
  sm2SignatureFromDer,
  sm2SignatureToDer,
  sm2Verify,
} from '../src/crypto/sm2';
import { bytesToHex, hexToBytes } from '../src/crypto/sm3';
import { base64Decode, base64Encode } from '../src/crypto/base64';

const N = BigInt('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123');
const MSG = new TextEncoder().encode('SM2 boundary tests');

function scalar(value: bigint): Uint8Array {
  return hexToBytes(value.toString(16).padStart(64, '0'));
}

describe('SM2 boundary validation', () => {
  it('rejects private keys outside the signing range', () => {
    expect(() => sm2SignWithK(scalar(0n), MSG, 1n)).toThrow(/private key/i);
    expect(() => sm2SignWithK(scalar(N - 1n), MSG, 1n)).toThrow(/private key/i);
    expect(() => sm2SignWithK(scalar(N), MSG, 1n)).toThrow(/private key/i);
  });

  it('rejects invalid nonces instead of reducing them modulo N', () => {
    const { privateKey } = sm2Generate();
    for (const k of [0n, N, N + 1n, -1n]) {
      expect(() => sm2SignWithK(privateKey, MSG, k)).toThrow(/nonce|range/i);
    }
  });

  it('rejects malformed keys and signatures', () => {
    const { publicKey, privateKey } = sm2Generate();
    const sig = sm2Sign(privateKey, MSG);
    const raw = new Uint8Array([...sig.r, ...sig.s]);
    expect(sm2Verify(publicKey.subarray(1), MSG, raw)).toBe(false);
    expect(sm2Verify(new Uint8Array(65), MSG, raw)).toBe(false);
    expect(sm2Verify(publicKey, MSG, new Uint8Array(1))).toBe(false);
  });
});

describe('SM2 DER signatures', () => {
  it('encodes r and s as a canonical DER sequence', () => {
    const r = new Uint8Array(32);
    const s = new Uint8Array(32);
    r[31] = 1;
    s[31] = 2;
    const der = sm2SignatureToDer({ r, s });
    expect(bytesToHex(der)).toBe('3006020101020102');
    const decoded = sm2SignatureFromDer(der);
    expect(decoded.r).toEqual(r);
    expect(decoded.s).toEqual(s);
  });

  it('verifies a DER signature and rejects malformed DER', () => {
    const { publicKey, privateKey } = sm2Generate();
    const sig = sm2Sign(privateKey, MSG);
    const der = sm2SignatureToDer(sig);
    expect(sm2Verify(publicKey, MSG, der)).toBe(true);
    expect(() => sm2SignatureFromDer(new Uint8Array([0x30, 0x00]))).toThrow(/DER|SEQUENCE/i);
    expect(sm2Verify(publicKey, MSG, new Uint8Array([0x30, 0x00]))).toBe(false);
  });
});

describe('strict binary encodings', () => {
  it('rejects invalid hexadecimal input', () => {
    expect(() => hexToBytes('zz')).toThrow(/hex/i);
    expect(() => hexToBytes('00xz')).toThrow(/hex/i);
  });

  it('encodes and decodes Base64 without platform-specific APIs', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(base64Encode(bytes)).toBe('AAEC/f7/');
    expect(base64Decode('AAEC/f7/')).toEqual(bytes);
    expect(() => base64Decode('AA$=')).toThrow(/base64/i);
  });
});

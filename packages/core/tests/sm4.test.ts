import { describe, expect, it } from 'vitest';
import { sm4CbcDecrypt, sm4CbcEncrypt } from '../src/crypto/sm4';
import { hexToBytes } from '../src/crypto/sm3';

describe('SM4 CBC', () => {
  it('matches the GB/T 32907 CBC example and round-trips PKCS#7', () => {
    const key = hexToBytes('0123456789abcdeffedcba9876543210');
    const iv = hexToBytes('000102030405060708090a0b0c0d0e0f');
    const plaintext = hexToBytes('0123456789abcdeffedcba9876543210');
    const encrypted = sm4CbcEncrypt(plaintext, key, iv);
    expect(encrypted).toHaveLength(32);
    expect(Buffer.from(encrypted.subarray(0, 16)).toString('hex')).toBe(
      'a9a268883a336315bac0c9c9ff350ab1',
    );
    expect(sm4CbcDecrypt(encrypted, key, iv)).toEqual(plaintext);
  });

  it('rejects invalid key, IV, ciphertext, and padding', () => {
    const key = new Uint8Array(16);
    const iv = new Uint8Array(16);
    expect(() => sm4CbcEncrypt(new Uint8Array(), new Uint8Array(15), iv)).toThrow(/key/i);
    expect(() => sm4CbcEncrypt(new Uint8Array(), key, new Uint8Array(15))).toThrow(/IV/i);
    expect(() => sm4CbcDecrypt(new Uint8Array(15), key, iv)).toThrow(/ciphertext|block/i);
    const encrypted = sm4CbcEncrypt(new Uint8Array([1, 2, 3]), key, iv);
    encrypted[encrypted.length - 1] ^= 0xff;
    expect(() => sm4CbcDecrypt(encrypted, key, iv)).toThrow(/padding/i);
  });
});

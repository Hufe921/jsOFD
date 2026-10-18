import { describe, expect, it } from 'vitest';
import {
  createLocalTestSm2Signer,
  requestSm2Signature,
  type Sm2Signer,
} from '../src/crypto/signer';
import { sm2Generate, sm2Verify } from '../src/crypto/sm2';

const certificate = new Uint8Array([1, 2, 3]);
const tbs = new TextEncoder().encode('exact TBS DER bytes');

describe('external SM2 signer', () => {
  it('signs the exact TBS bytes with the local test adapter', async () => {
    const { privateKey, publicKey } = sm2Generate();
    const signer = createLocalTestSm2Signer(privateKey);
    const signature = await requestSm2Signature(signer, { tbs, certificate });
    expect(sm2Verify(publicKey, tbs, signature)).toBe(true);
    expect(sm2Verify(publicKey, new TextEncoder().encode('other'), signature)).toBe(false);
  });

  it('rejects a malformed signer result', async () => {
    const signer: Sm2Signer = { sign: async () => new Uint8Array([0x30, 0x00]) };
    await expect(requestSm2Signature(signer, { tbs, certificate })).rejects.toThrow(/DER|signature/i);
  });

  it('propagates signer failures', async () => {
    const signer: Sm2Signer = { sign: async () => { throw new Error('boom'); } };
    await expect(requestSm2Signature(signer, { tbs, certificate })).rejects.toThrow('boom');
  });

  it('times out even when a signer ignores cancellation', async () => {
    const signer: Sm2Signer = { sign: () => new Promise(() => undefined) };
    await expect(requestSm2Signature(signer, { tbs, certificate }, 5)).rejects.toThrow(/timed out/i);
  });
});

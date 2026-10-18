/**
 * 国密算法测试：SM3 官方向量 + SM2 与 sm-crypto 参照实现双向互验。
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error 参照实现（devDependency，交叉互验用）
import { sm2 as smcrypto } from 'sm-crypto';
import { sm3, Sm3, kdf, hexToBytes, bytesToHex } from '../src/crypto/sm3';
import { sm2Generate, sm2Sign, sm2Verify, sm2ScalarMult, sm2IsOnCurve } from '../src/crypto/sm2';

const MSG = new TextEncoder().encode('jsOFD 电子签章互验测试');
const USER_ID = '1234567812345678';

describe('sm3', () => {
  it('GB/T 32905-2016 标准向量 A.1/A.2', () => {
    expect(sm3('abc')).toBe('66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0');
    expect(sm3('abcd'.repeat(16))).toBe(
      'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732',
    );
  });

  it('长消息（1,000,000 个 "a"，官方 A.3 全量）', () => {
    const hex = bytesToHex(new Sm3().update(new Uint8Array(1000000).fill(0x61)).digest());
    expect(hex.startsWith('c8aaf89429554029')).toBe(true);
  });

  it('流式与一次性更新一致', () => {
    const data = hexToBytes('6162636465661234567890');
    const one = new Sm3().update(data).digest();
    const stream = new Sm3().update(data.subarray(0, 4)).update(data.subarray(4)).digest();
    expect(bytesToHex(one)).toBe(bytesToHex(stream));
  });

  it('kdf 输出长度', () => {
    expect(kdf(new Uint8Array(32), 16).length).toBe(16);
    expect(kdf(new Uint8Array(32), 100).length).toBe(100);
  });
});

describe('sm2 与 sm-crypto 参照实现互验', () => {
  it('曲线：基点在曲线上且 [n]G 为无穷远', () => {
    const g = {
      x: 0x32c4ae2c1f1981195f9904466a39c9948fe30bbff2660be1715a4589334c74c7n,
      y: 0xbc3736a2f4f6779c59bdcee36b692153d0a9877cc62a474002df32e52139f0a0n,
    };
    expect(sm2IsOnCurve(g)).toBe(true);
    const n = BigInt('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123');
    expect(sm2ScalarMult(n, g)).toBeNull();
  });

  it('公钥推导：随机私钥的 [d]G 与 sm-crypto 一致', () => {
    for (const d of [
      '01',
      '02',
      '3945208F7B2144B13F36E38AC6D39F9588AEE0F3E5D4B7AF8A5A8CBB8FDB2068',
    ]) {
      const dh = d.padStart(64, '0');
      const mine = sm2ScalarMult(BigInt('0x' + dh), {
        x: 0x32c4ae2c1f1981195f9904466a39c9948fe30bbff2660be1715a4589334c74c7n,
        y: 0xbc3736a2f4f6779c59bdcee36b692153d0a9877cc62a474002df32e52139f0a0n,
      })!;
      const mineHex = bytesToHex(
        hexToBytes(
          '04' + mine.x.toString(16).padStart(64, '0') + mine.y.toString(16).padStart(64, '0'),
        ),
      );
      const ref = smcrypto.getPublicKeyFromPrivateKey(dh);
      expect(mineHex).toBe(ref);
    }
  });

  it('签名互验①：我的签名 → sm-crypto 验签通过', () => {
    const { privateKey, publicKey } = sm2Generate();
    const sig = sm2Sign(privateKey, MSG, USER_ID);
    const sigHex = bytesToHex(sig.r) + bytesToHex(sig.s);
    expect(
      smcrypto.doVerifySignature(Array.from(MSG), sigHex, bytesToHex(publicKey), {
        hash: true,
        userId: USER_ID,
        der: false,
      }),
    ).toBe(true);
  });

  it('签名互验②：sm-crypto 签名 → 我的验签通过，篡改失败', () => {
    const privateKey = '2b8b7a1a6a9c4b8f7c2e1d0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c';
    const pubHex = smcrypto.getPublicKeyFromPrivateKey(privateKey);
    const sigHex = smcrypto.doSignature(Array.from(MSG), privateKey, {
      hash: true,
      userId: USER_ID,
      der: false,
    });
    expect(sm2Verify(hexToBytes(pubHex), MSG, hexToBytes(sigHex), USER_ID)).toBe(true);
    const bad = sigHex.slice(0, -2) + (sigHex.endsWith('00') ? '01' : '00');
    expect(sm2Verify(hexToBytes(pubHex), MSG, hexToBytes(bad), USER_ID)).toBe(false);
  });

  it('签名互验③：我的签名 + 我验签 + 篡改/错钥检测', () => {
    const { privateKey, publicKey } = sm2Generate();
    const sig = sm2Sign(privateKey, MSG, USER_ID);
    expect(sm2Verify(publicKey, MSG, sig, USER_ID)).toBe(true);
    const tampered = new TextEncoder().encode('jsOFD 电子签章互验测试!');
    expect(sm2Verify(publicKey, tampered, sig, USER_ID)).toBe(false);
    const other = sm2Generate();
    expect(sm2Verify(other.publicKey, MSG, sig, USER_ID)).toBe(false);
  });

  it('自定义 UserID：签名与验签须使用相同 ID，且与参照实现互通', () => {
    const { privateKey, publicKey } = sm2Generate();
    const sig = sm2Sign(privateKey, MSG, 'client-001');
    expect(sm2Verify(publicKey, MSG, sig, 'client-001')).toBe(true);
    expect(sm2Verify(publicKey, MSG, sig, 'client-002')).toBe(false);
    const sigHex = bytesToHex(sig.r) + bytesToHex(sig.s);
    expect(
      smcrypto.doVerifySignature(Array.from(MSG), sigHex, bytesToHex(publicKey), {
        hash: true,
        userId: 'client-001',
        der: false,
      }),
    ).toBe(true);
  });

  it('随机密钥对：100 轮签名/验签全通过', () => {
    for (let i = 0; i < 100; i++) {
      const { privateKey, publicKey } = sm2Generate();
      const sig = sm2Sign(privateKey, MSG, USER_ID);
      if (!sm2Verify(publicKey, MSG, sig, USER_ID)) throw new Error(`round ${i} failed`);
    }
    expect(true).toBe(true);
  }, 60000);
});

import smCrypto from 'sm-crypto';

const { sm4 } = smCrypto;

function validate(key: Uint8Array, iv: Uint8Array): void {
  if (key.length !== 16) throw new Error('SM4 key must be 16 bytes');
  if (iv.length !== 16) throw new Error('SM4 IV must be 16 bytes');
}

export function sm4CbcEncrypt(plaintext: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  validate(key, iv);
  const padding = 16 - (plaintext.length % 16);
  const padded = new Uint8Array(plaintext.length + padding);
  padded.set(plaintext);
  padded.fill(padding, plaintext.length);
  return Uint8Array.from(sm4.encrypt(padded, key, { mode: 'cbc', iv, padding: 'none', output: 'array' }));
}

export function sm4CbcDecrypt(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  validate(key, iv);
  if (!ciphertext.length || ciphertext.length % 16) {
    throw new Error('SM4 ciphertext must contain complete blocks');
  }
  const padded = Uint8Array.from(
    sm4.decrypt(ciphertext, key, { mode: 'cbc', iv, padding: 'none', output: 'array' }),
  );
  const padding = padded[padded.length - 1]!;
  if (padding < 1 || padding > 16 || padding > padded.length) {
    throw new Error('SM4 invalid PKCS#7 padding');
  }
  for (let i = padded.length - padding; i < padded.length; i++) {
    if (padded[i] !== padding) throw new Error('SM4 invalid PKCS#7 padding');
  }
  return padded.slice(0, padded.length - padding);
}

/**
 * SM2 digital signature (GB/T 32918-2016) over the sm2p256v1 curve.
 *
 * Pure TypeScript on BigInt field arithmetic. Exposes key generation, sign,
 * verify, and conversions between raw r‖s and DER signatures.
 */

import * as asn1js from 'asn1js';
import { Sm3, kdf, hexToBytes, bytesToHex } from './sm3';
import { derSequence, parseDer, readSequence } from './der';

/* ---- sm2p256v1 curve parameters (GB/T 32918 §5) ---- */
const P = BigInt('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF');
const A = BigInt('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFC');
const B = BigInt('0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93');
const N = BigInt('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123');
const GX = BigInt('0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7');
const GY = BigInt('0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0');

export interface Sm2Point {
  x: bigint;
  y: bigint;
}
export interface Sm2KeyPair {
  /** Private scalar d as 32-byte big-endian. */
  privateKey: Uint8Array;
  /** Public key P = [d]G as uncompressed point (0x04 ‖ x ‖ y). */
  publicKey: Uint8Array;
}
export interface Sm2Signature {
  r: Uint8Array;
  s: Uint8Array;
}

const mod = (n: bigint, m: bigint = P): bigint => ((n % m) + m) % m;

/** Modular inverse modulo a prime via extended Euclid. */
function inverse(n: bigint, m: bigint = P): bigint {
  let [a, b] = [mod(n, m), m];
  // 不变量：a ≡ x0·n（mod m），b ≡ x1·n（mod m）
  let [x0, x1] = [1n, 0n];
  while (b !== 0n) {
    const q = a / b;
    [a, b] = [b, a - q * b];
    [x0, x1] = [x1, x0 - q * x1];
  }
  return mod(x0, m);
}

/** Affine point; null is the point at infinity. */
type Affine = Sm2Point | null;

function addPoints(p: Affine, q: Sm2Point): Affine {
  if (!p) return q;
  if (p.x === q.x) {
    if (mod(p.y + q.y) === 0n) return null; // p + (−p)
    return doublePoint(p);
  }
  const slope = mod((q.y - p.y) * inverse(mod(q.x - p.x)));
  const x = mod(slope * slope - p.x - q.x);
  const y = mod(slope * (p.x - x) - p.y);
  return { x, y };
}

function doublePoint(p: Sm2Point): Affine {
  if (mod(p.y) === 0n) return null;
  const slope = mod((3n * p.x * p.x + A) * inverse(mod(2n * p.y)));
  const x = mod(slope * slope - 2n * p.x);
  const y = mod(slope * (p.x - x) - p.y);
  return { x, y };
}

/** Elliptic-curve scalar multiplication [k]P. Returns null for [0]P. */
export function sm2ScalarMult(k: bigint, p: Sm2Point): Affine {
  let result: Affine = null;
  let addend: Sm2Point = p;
  let scalar = mod(k, N);
  while (scalar > 0n) {
    if (scalar & 1n) result = addPoints(result, addend);
    addend = doublePoint(addend) ?? { x: 0n, y: 0n };
    scalar >>= 1n;
  }
  return result;
}

export function sm2IsOnCurve(p: Sm2Point): boolean {
  return mod(p.y * p.y) === mod(p.x * p.x * p.x + A * p.x + B);
}

const pad32 = (hex: string): Uint8Array => hexToBytes(hex.padStart(64, '0'));
const bigTo32 = (n: bigint): Uint8Array => pad32(n.toString(16));
const bytesToBig = (b: Uint8Array): bigint => BigInt('0x' + (bytesToHex(b) || '0'));
const pubToBytes = (p: Sm2Point): Uint8Array => {
  const out = new Uint8Array(65);
  out[0] = 0x04;
  out.set(bigTo32(p.x), 1);
  out.set(bigTo32(p.y), 33);
  return out;
};

/* ---- user identity / ZA per GB/T 32918 §5.5 ---- */

/** ZA = SM3(ENTL ‖ ID ‖ a ‖ b ‖ xG ‖ yG ‖ xA ‖ yA). */
export function za(pub: Uint8Array, userId: Uint8Array | string = '1234567812345678'): Uint8Array {
  const id = typeof userId === 'string' ? new TextEncoder().encode(userId) : userId;
  const entl = new Uint8Array([(id.length * 8) >> 8, (id.length * 8) & 0xff]);
  const fields = [
    hexToBytes(A.toString(16).padStart(64, '0')),
    hexToBytes(B.toString(16).padStart(64, '0')),
    hexToBytes(GX.toString(16).padStart(64, '0')),
    hexToBytes(GY.toString(16).padStart(64, '0')),
    pub.subarray(1, 33),
    pub.subarray(33, 65),
  ];
  const abxy = new Uint8Array(192);
  let off = 0;
  for (const f of fields) {
    abxy.set(f, off);
    off += f.length;
  }
  return new Sm3().update(entl).update(id).update(abxy).digest();
}

/* ---- public API ---- */

function randomScalar(maxInclusive: bigint): bigint {
  for (;;) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const candidate = bytesToBig(bytes);
    if (candidate < maxInclusive) return candidate + 1n;
  }
}

/** Generate an SM2 key pair. */
export function sm2Generate(): Sm2KeyPair {
  for (;;) {
    const d = randomScalar(N - 2n);
    const pub = sm2ScalarMult(d, { x: GX, y: GY });
    if (pub) return { privateKey: bigTo32(d), publicKey: pubToBytes(pub) };
  }
}

/**
 * Sign a message (SM2, default ID '1234567812345678').
 * Returns the 64-byte r‖s signature.
 */
export function sm2Sign(
  privateKey: Uint8Array,
  message: Uint8Array,
  userId: Uint8Array | string = '1234567812345678',
): Sm2Signature {
  for (;;) {
    const sig = sm2SignWithK(privateKey, message, randomScalar(N - 1n), userId);
    if (sig) return sig;
  }
}

/** Deterministic signing with a caller-provided nonce k. */
export function sm2SignWithK(
  privateKey: Uint8Array,
  message: Uint8Array,
  k: bigint,
  userId: Uint8Array | string = '1234567812345678',
): Sm2Signature | null {
  const d = bytesToBig(privateKey);
  if (privateKey.length !== 32 || d < 1n || d >= N - 1n) {
    throw new Error('sm2: private key out of range');
  }
  if (k < 1n || k >= N) throw new Error('sm2: nonce out of range');
  const pub = sm2ScalarMult(d, { x: GX, y: GY });
  if (!pub) throw new Error('sm2: invalid private key');
  const z = za(pubToBytes(pub), userId);
  const e = bytesToBig(new Sm3().update(z).update(message).digest());

  const point = sm2ScalarMult(k, { x: GX, y: GY });
  if (!point) return null;
  const r = mod(e + point.x, N);
  if (r === 0n || r + k === N) return null;
  const s = mod(inverse(1n + d, N) * (k - r * d), N);
  if (s === 0n) return null;
  return { r: bigTo32(r), s: bigTo32(s) };
}

export function sm2SignatureToDer(sig: Sm2Signature): Uint8Array {
  if (sig.r.length !== 32 || sig.s.length !== 32) {
    throw new Error('sm2: signature components must be 32 bytes');
  }
  const r = bytesToBig(sig.r);
  const s = bytesToBig(sig.s);
  if (r < 1n || r >= N || s < 1n || s >= N) throw new Error('sm2: signature out of range');
  return derSequence([asn1js.Integer.fromBigInt(r), asn1js.Integer.fromBigInt(s)]);
}

export function sm2SignatureFromDer(der: Uint8Array): Sm2Signature {
  const sequence = readSequence(parseDer(der, { maxBytes: 80 }), 2, 2);
  const [rBlock, sBlock] = sequence.valueBlock.value;
  if (!(rBlock instanceof asn1js.Integer) || !(sBlock instanceof asn1js.Integer)) {
    throw new Error('sm2: DER signature must contain two INTEGER values');
  }
  const r = rBlock.toBigInt();
  const s = sBlock.toBigInt();
  if (r < 1n || r >= N || s < 1n || s >= N) throw new Error('sm2: signature out of range');
  return { r: bigTo32(r), s: bigTo32(s) };
}

/** Verify a raw 64-byte r‖s or DER signature over a message. */
export function sm2Verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  sig: Sm2Signature | Uint8Array,
  userId: Uint8Array | string = '1234567812345678',
): boolean {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) return false;
  let parts: Sm2Signature;
  if (sig instanceof Uint8Array) {
    if (sig.length === 64) {
      parts = { r: sig.subarray(0, 32), s: sig.subarray(32, 64) };
    } else {
      try {
        parts = sm2SignatureFromDer(sig);
      } catch {
        return false;
      }
    }
  } else {
    parts = sig;
  }
  if (parts.r.length !== 32 || parts.s.length !== 32) return false;
  const r = bytesToBig(parts.r);
  const s = bytesToBig(parts.s);
  if (r < 1n || r >= N || s < 1n || s >= N) return false;

  const point = {
    x: bytesToBig(publicKey.subarray(1, 33)),
    y: bytesToBig(publicKey.subarray(33, 65)),
  };
  if (point.x >= P || point.y >= P || !sm2IsOnCurve(point)) return false;

  const z = za(publicKey, userId);
  const e = bytesToBig(new Sm3().update(z).update(message).digest());
  const t = mod(r + s, N);
  if (t === 0n) return false;
  const sG = sm2ScalarMult(s, { x: GX, y: GY });
  const tP = sm2ScalarMult(t, point);
  if (!sG || !tP) return false;
  const sum = addPoints(sG, tP);
  if (!sum) return false;
  return mod(e + sum.x, N) === r;
}

export { Sm3, kdf, bytesToHex, hexToBytes };

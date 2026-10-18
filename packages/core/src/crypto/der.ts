import * as asn1js from 'asn1js';

export interface DerLimits {
  maxBytes: number;
  maxDepth: number;
  maxElements: number;
}

export const DEFAULT_DER_LIMITS: DerLimits = {
  maxBytes: 16 * 1024 * 1024,
  maxDepth: 32,
  maxElements: 10000,
};

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function expectDerReencode(block: asn1js.BaseBlock, original: Uint8Array): void {
  const encoded = new Uint8Array(block.toBER());
  if (!equalBytes(encoded, original)) {
    throw new Error('DER value is not canonically encoded');
  }
}

function assertCanonicalLengths(block: asn1js.BaseBlock): void {
  const { lenBlock } = block;
  if (lenBlock.isIndefiniteForm) {
    throw new Error('DER length must use definite form');
  }
  if (lenBlock.longFormUsed) {
    let length = BigInt(lenBlock.length);
    let minimumBytes = 0;
    while (length > 0n) {
      minimumBytes++;
      length >>= 8n;
    }
    if (lenBlock.length < 128 || lenBlock.blockLength - 1 !== minimumBytes) {
      throw new Error('DER length is not minimally encoded');
    }
  }
  const children = (block.valueBlock as unknown as { value?: unknown }).value;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child instanceof asn1js.BaseBlock) assertCanonicalLengths(child);
    }
  }
}

export function parseDer(
  bytes: Uint8Array,
  limits: Partial<DerLimits> = {},
): asn1js.BaseBlock {
  const resolved = { ...DEFAULT_DER_LIMITS, ...limits };
  if (bytes.length > resolved.maxBytes) {
    throw new Error('DER size limit exceeded');
  }
  if (resolved.maxDepth < 1 || resolved.maxElements < 1) {
    throw new Error('DER limits must be positive');
  }
  const parsed = asn1js.fromBER(bytes, {
    maxDepth: resolved.maxDepth - 1,
    maxNodes: resolved.maxElements,
    maxContentLength: resolved.maxBytes,
    copyInput: true,
  });
  if (parsed.offset < 0 || parsed.result.error) {
    const reason = parsed.result.error || 'invalid DER';
    if (/depth/i.test(reason)) throw new Error(`DER depth limit exceeded: ${reason}`);
    if (/node|element/i.test(reason)) throw new Error(`DER elements limit exceeded: ${reason}`);
    throw new Error(`DER parse error: ${reason}`);
  }
  if (parsed.offset !== bytes.length) {
    throw new Error('DER trailing bytes are not allowed');
  }
  assertCanonicalLengths(parsed.result);
  expectDerReencode(parsed.result, bytes);
  return parsed.result;
}

export function readSequence(
  block: asn1js.BaseBlock,
  min: number,
  max = min,
): asn1js.Sequence {
  if (!(block instanceof asn1js.Sequence)) {
    throw new Error('DER SEQUENCE expected');
  }
  const length = block.valueBlock.value.length;
  if (length < min || length > max) {
    throw new Error(`DER SEQUENCE children length must be between ${min} and ${max}`);
  }
  return block;
}

export function derSequence(items: asn1js.BaseBlock[]): Uint8Array {
  return new Uint8Array(new asn1js.Sequence({ value: items }).toBER());
}

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DER_LIMITS,
  derSequence,
  expectDerReencode,
  parseDer,
  readSequence,
} from '../src/crypto/der';

describe('strict DER', () => {
  it('encodes and reads a sequence', () => {
    const encoded = derSequence([]);
    expect(Array.from(encoded)).toEqual([0x30, 0x00]);
    const sequence = readSequence(parseDer(encoded), 0, 0);
    expect(sequence.valueBlock.value).toHaveLength(0);
    expect(() => expectDerReencode(sequence, encoded)).not.toThrow();
  });

  it('rejects trailing bytes', () => {
    const encoded = derSequence([]);
    expect(() => parseDer(new Uint8Array([...encoded, 0]))).toThrow(/trailing/i);
  });

  it('rejects non-canonical DER lengths', () => {
    expect(() => parseDer(new Uint8Array([0x30, 0x81, 0x00]))).toThrow(/DER|length/i);
    expect(() =>
      parseDer(new Uint8Array([0x30, 0x04, 0x02, 0x81, 0x01, 0x01])),
    ).toThrow(/DER|length/i);
  });

  it('enforces byte, depth, and element limits', () => {
    const empty = derSequence([]);
    expect(() => parseDer(empty, { maxBytes: 1 })).toThrow(/size|limit/i);

    const nested = new Uint8Array([0x30, 0x02, 0x30, 0x00]);
    expect(() => parseDer(nested, { maxDepth: 1 })).toThrow(/depth/i);

    const twoIntegers = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
    expect(() => parseDer(twoIntegers, { maxElements: 2 })).toThrow(/elements|limit/i);
  });

  it('checks sequence type and child counts', () => {
    const sequence = parseDer(derSequence([]));
    expect(() => readSequence(sequence, 1)).toThrow(/children|length/i);
    expect(() => readSequence(sequence, 0, 0)).not.toThrow();
    expect(() => readSequence(parseDer(new Uint8Array([0x02, 0x01, 0x01])), 1)).toThrow(
      /sequence/i,
    );
  });

  it('has defensive default limits', () => {
    expect(DEFAULT_DER_LIMITS.maxBytes).toBeGreaterThan(0);
    expect(DEFAULT_DER_LIMITS.maxDepth).toBeGreaterThan(0);
    expect(DEFAULT_DER_LIMITS.maxElements).toBeGreaterThan(0);
  });
});

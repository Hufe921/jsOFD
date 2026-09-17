/**
 * Image payload → PNG conversion (covers the browser ImageBitmap path that
 * crashed with `null.subarray` before pdfjs hands over `data: null` images).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { imgDataToPng } from '../src/pdf-import';

class FakeCtx {
  constructor(private pixels: Uint8ClampedArray) {}
  drawImage(): void {}
  getImageData(): { data: Uint8ClampedArray } {
    return { data: this.pixels };
  }
}

class FakeOffscreenCanvas {
  width = 0;
  height = 0;
  private pixels: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.pixels = new Uint8ClampedArray(w * h * 4).fill(128);
  }
  getContext(): FakeCtx {
    return new FakeCtx(this.pixels);
  }
}

describe('imgDataToPng', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).OffscreenCanvas;
  });

  it('browser ImageBitmap with data=null → PNG via canvas', async () => {
    (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
    const png = await imgDataToPng({
      width: 4,
      height: 2,
      kind: undefined,
      data: null as unknown as Uint8Array,
      bitmap: {} as ImageBitmap,
    });
    expect(png).not.toBeNull();
    // PNG signature + IHDR with the right dimensions
    expect(png![0]).toBe(0x89);
    const dv = new DataView(png!.buffer, png!.byteOffset, png!.byteLength);
    expect(dv.getUint32(16)).toBe(4);
    expect(dv.getUint32(20)).toBe(2);
  });

  it('raw RGBA without kind → inferred from length', async () => {
    const data = new Uint8Array(3 * 2 * 4).fill(200);
    const png = await imgDataToPng({ width: 3, height: 2, data });
    expect(png!.subarray(0, 8)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('declared RGB_24BPP honored', async () => {
    const data = new Uint8Array(2 * 2 * 3).fill(90);
    const png = await imgDataToPng({ width: 2, height: 2, kind: 2, data });
    expect(png).not.toBeNull();
  });

  it('neither data nor bitmap → null (skipped, no crash)', async () => {
    const out = await imgDataToPng({
      width: 2,
      height: 2,
      data: null as unknown as Uint8Array,
    });
    expect(out).toBeNull();
  });
});

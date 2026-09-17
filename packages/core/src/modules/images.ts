/** Image embedding and inspection. */

import { sniffImage } from '../image';
import type { AddImageOptions, ImageInput, ImageProperties } from '../types';
import { b64Decode, fnv1a, u8FromBuffer } from '../utils';
import type { jsOFD } from '../jsofd';

export const ImageApi = {
  /**
   * Embed an image and place it on the current page.
   *
   * Binary data (PNG/JPEG/GIF/BMP/TIFF) is embedded byte-for-byte; data URLs,
   * bare base64 strings (with `format`), `HTMLImageElement` and
   * `HTMLCanvasElement` inputs are also accepted.
   *
   * When `w`/`h` are omitted the natural size at 72 dpi is used. Identical
   * data is stored once and referenced multiple times.
   */
  addImage(
    this: jsOFD,
    a: unknown,
    b: unknown,
    c?: unknown,
    d?: unknown,
    e?: unknown,
    f?: unknown,
    g?: unknown,
    h?: unknown,
    i?: unknown,
  ): jsOFD {
    let format: unknown;
    let px: unknown;
    let py: unknown;
    let pw: unknown;
    let ph: unknown;
    let alias: unknown;
    let rotation: number;
    if (typeof b === 'object' && b !== null) {
      // addImage(data, { x, y, w, h, format?, alias?, rotation? })
      const o = b as AddImageOptions;
      format = o.format;
      px = o.x;
      py = o.y;
      pw = o.w;
      ph = o.h;
      alias = o.alias;
      rotation = o.rotation || 0;
    } else if (typeof b === 'number') {
      // addImage(data, x, y, w, h, alias?, compression?, rotation?)
      px = b;
      py = c;
      pw = d;
      ph = e;
      alias = typeof f === 'string' ? f : undefined;
      rotation = (typeof g === 'number' ? g : 0) || (typeof h === 'number' ? h : 0);
    } else {
      // addImage(data, format, x, y, w, h, alias?, compression?, rotation?)
      format = b;
      px = c;
      py = d;
      pw = e;
      ph = f;
      alias = typeof g === 'string' ? g : undefined;
      rotation = (typeof h === 'number' ? h : 0) || (typeof i === 'number' ? i : 0);
    }

    const imageData = a as ImageInput;
    let u8: Uint8Array | null = null;
    let detectedFormat = format as string | undefined;

    if (typeof imageData === 'string') {
      if (/^data:/i.test(imageData)) {
        u8 = b64Decode(imageData);
        if (!detectedFormat) {
          const mime = /^data:image\/([a-z0-9]+?)(?:;|$)/i.exec(imageData);
          if (mime) detectedFormat = mime[1];
        }
      } else if (
        /^[A-Za-z0-9+/=\s]+$/.test(imageData) &&
        imageData.replace(/\s/g, '').length >= 8
      ) {
        // Bare base64 (jsPDF-compatible; pair with an explicit format).
        u8 = b64Decode(imageData.replace(/\s/g, ''));
      } else {
        throw new Error(
          'addImage: strings must be data URLs or base64; pass a Uint8Array with an explicit format otherwise',
        );
      }
    } else if (typeof HTMLImageElement !== 'undefined' && imageData instanceof HTMLImageElement) {
      const cv = document.createElement('canvas');
      cv.width = imageData.naturalWidth || imageData.width || 1;
      cv.height = imageData.naturalHeight || imageData.height || 1;
      cv.getContext('2d')!.drawImage(imageData, 0, 0);
      u8 = b64Decode(cv.toDataURL('image/png'));
      detectedFormat = 'PNG';
    } else if (typeof HTMLCanvasElement !== 'undefined' && imageData instanceof HTMLCanvasElement) {
      u8 = b64Decode(imageData.toDataURL('image/png'));
      detectedFormat = 'PNG';
    } else if (imageData instanceof Uint8Array || imageData instanceof ArrayBuffer) {
      u8 = u8FromBuffer(imageData as Uint8Array | ArrayBuffer);
    }
    if (!u8 || !u8.length) throw new Error('addImage: unable to parse image data');

    const sniff = sniffImage(u8);
    if (!sniff) {
      throw new Error('addImage: unsupported image format (PNG/JPEG/GIF/BMP/TIFF)');
    }
    if (detectedFormat) {
      let f = String(detectedFormat).toUpperCase();
      if (f === 'JPG') f = 'JPEG';
      if (f === 'PNG' || f === 'JPEG') {
        sniff.format = f;
        sniff.ext = f === 'JPEG' ? 'jpg' : 'png';
      }
    }

    // Deduplicate identical content (hash + length), share one resource.
    const key = (alias as string) || `${fnv1a(u8)}-${u8.length}`;
    let img = this.images[key];
    if (!img) {
      img = {
        alias: key,
        data: u8,
        format: sniff.format,
        ext: sniff.ext,
        width: sniff.width,
        height: sniff.height,
        resId: 0,
      };
      this.images[key] = img;
      this.imageList.push(img);
    }

    let W: number;
    let H: number;
    if (pw === undefined || pw === null || ph === undefined || ph === null) {
      if (img.width && img.height) {
        // Default placement: natural size at 72 dpi.
        W = img.width * 0.75;
        H = img.height * 0.75;
      } else {
        throw new Error('addImage: image dimensions unknown; provide w/h explicitly');
      }
    } else {
      W = this._u(Number(pw));
      H = this._u(Number(ph));
    }

    this.pages[this.page]!.objects.push({
      t: 'image',
      x: this._u(Number(px)),
      y: this._u(Number(py)),
      w: W,
      h: H,
      imageRef: img,
      angle: Number(rotation) || 0,
      opacity: this.opacity,
    });
    return this;
  },

  /**
   * Inspect an image without embedding it.
   *
   * @returns format, pixel dimensions, byte count and the raw data
   */
  getImageProperties(this: jsOFD, imageData: ImageInput): ImageProperties {
    let u8: Uint8Array;
    if (typeof imageData === 'string') {
      u8 = b64Decode(imageData);
    } else if (imageData instanceof Uint8Array || imageData instanceof ArrayBuffer) {
      u8 = u8FromBuffer(imageData as Uint8Array | ArrayBuffer);
    } else {
      throw new Error(
        'getImageProperties: only data URLs, Uint8Array and ArrayBuffer are supported',
      );
    }
    const info = sniffImage(u8);
    if (!info) throw new Error('getImageProperties: unrecognized image');
    return {
      fileType: info.format,
      width: info.width,
      height: info.height,
      bytes: u8.length,
      data: u8,
    };
  },
};

/** Structural type of the mixin (merged into jsOFD via declaration merging). */
export type ImageApi = typeof ImageApi;

// Declaration merging attaches the mixin's members to jsOFD.

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends ImageApi {}
}

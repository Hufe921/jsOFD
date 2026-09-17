/** Interactive annotations: link areas and file attachments. */

import type { AttachmentOptions, LinkOptions } from '../types';
import { b64Decode, u8FromBuffer, utf8Encode } from '../utils';
import type { jsOFD } from '../jsofd';

export const AnnotationApi = {
  /**
   * Add a clickable rectangular area.
   *
   * Pass `url` for an external target or `pageNumber` (1-based) for an
   * in-document jump. The area itself is invisible.
   */
  link(this: jsOFD, x: number, y: number, w: number, h: number, options: LinkOptions = {}): jsOFD {
    this.pages[this.page]!.objects.push({
      t: 'link',
      x: this._u(Number(x)),
      y: this._u(Number(y)),
      w: this._u(Number(w)),
      h: this._u(Number(h)),
      url: options.url || null,
      pageNumber: options.pageNumber || null,
      magFactor: options.magFactor || null,
    });
    return this;
  },

  /**
   * Embed a file as an OFD attachment.
   *
   * @param data UTF-8 text, a base64 data URL, or binary bytes
   */
  addFileAsAttachment(
    this: jsOFD,
    filename: string,
    data: string | Uint8Array | ArrayBuffer,
    options: AttachmentOptions = {},
  ): jsOFD {
    let u8: Uint8Array;
    if (typeof data === 'string') {
      if (/^data:.*?;base64,/i.test(data)) u8 = b64Decode(data);
      else u8 = utf8Encode(data);
    } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      u8 = u8FromBuffer(data);
    } else {
      throw new Error('addFileAsAttachment: unsupported data type');
    }
    this.attachments.push({
      name: String(filename),
      data: u8,
      format: options.format || '',
      description: options.description || '',
      creationDate: new Date(),
    });
    return this;
  },
};

export type AnnotationApi = typeof AnnotationApi;

// Declaration merging attaches the mixin's members to jsOFD.

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends AnnotationApi {}
}

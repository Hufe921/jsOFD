/** Document metadata, viewer preferences and output/serialization. */

import { buildOFDPackage } from '../builder';
import type { DocProperties, OutputResult, ViewerPreferences } from '../types';
import { IS_NODE, b64Encode, nodeRequire } from '../utils';
import { zipStore } from '../zip';
import type { jsOFD } from '../jsofd';

export const ViewApi = {
  /** Set document metadata (title, subject, author, keywords, creator). */
  setProperties(this: jsOFD, properties: DocProperties): jsOFD {
    for (const k of Object.keys(properties)) {
      const v = (properties as Record<string, unknown>)[k];
      if (v !== undefined && k in this.properties) {
        (this.properties as unknown as Record<string, string>)[k] = String(v);
      }
    }
    return this;
  },

  /** Override the document creation date. */
  setCreationDate(this: jsOFD, date: Date | string | number): jsOFD {
    this.creationDate = date instanceof Date ? date : new Date(date);
    return this;
  },

  /**
   * Read the creation date.
   *
   * @param type `'array'` returns `[y, m, d, h, min, s]`; anything else
   *              returns a `Date` (jsPDF `'jsDate'` semantics)
   */
  getCreationDate(this: jsOFD, type?: 'jsDate' | 'array'): Date | number[] {
    if (type === 'array') {
      const d = this.creationDate;
      return [
        d.getFullYear(),
        d.getMonth() + 1,
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds(),
      ];
    }
    return this.creationDate;
  },

  /**
   * Configure the initial viewer presentation.
   *
   * @param zoom     numeric multiplier, `'N%'`, or `'fullwidth'` /
   *                 `'fullheight'` / `'fullpage'` / `'original'`
   * @param layout   `'continuous'` / `'single'` / `'twoleft'` / `'tworight'` / `'two'`
   * @param pageMode `'UseNone'` / `'UseOutlines'` / `'UseThumbs'` / `'FullScreen'`
   * @throws on unrecognized values, mirroring jsPDF
   */
  setDisplayMode(
    this: jsOFD,
    zoom?: number | string,
    layout?: 'continuous' | 'single' | 'twoleft' | 'tworight' | 'two' | string,
    pageMode?: string,
  ): jsOFD {
    if (zoom !== undefined && zoom !== null) {
      const z = String(zoom).toLowerCase();
      const num = Number(zoom);
      const valid =
        ['fullheight', 'fullwidth', 'fullpage', 'original'].includes(z) ||
        (typeof zoom === 'number' && !isNaN(num) && num > 0) ||
        (typeof zoom === 'string' && /^\d+(\.\d+)?%$/.test(zoom));
      if (!valid) {
        throw new Error(
          `zoom must be Integer (e.g. 2), a percentage Value (e.g. 300%) or fullwidth, fullheight, fullpage, original. "${zoom}" is not recognized.`,
        );
      }
    }
    const layouts = ['continuous', 'single', 'twoleft', 'tworight', 'two'];
    if (layout !== undefined && layout !== null && !layouts.includes(String(layout))) {
      throw new Error(
        `Layout mode must be one of ${layouts.join(', ')}. "${layout}" is not recognized.`,
      );
    }
    const pageModes = ['UseNone', 'UseOutlines', 'UseThumbs', 'FullScreen'];
    if (pageMode !== undefined && pageMode !== null && !pageModes.includes(String(pageMode))) {
      throw new Error(
        `Page mode must be one of ${pageModes.join(', ')}. "${pageMode}" is not recognized.`,
      );
    }
    this.displayMode = {
      zoom: zoom ?? 1,
      layout: layout || 'continuous',
      pageMode: pageMode || '',
    };
    return this;
  },

  /**
   * Set reader interface preferences.
   *
   * Supported flags: `HideToolbar`, `HideMenubar`, `HideWindowUI`, `FitWindow`.
   * Pass `doReset` to clear previously set flags first.
   */
  viewerPreferences(this: jsOFD, options: ViewerPreferences, doReset?: boolean): jsOFD {
    if (doReset) {
      this.viewerPrefs = {};
    }
    if (options && typeof options === 'object') {
      for (const k of ['HideToolbar', 'HideMenubar', 'HideWindowUI', 'FitWindow']) {
        if (typeof (options as Record<string, unknown>)[k] === 'boolean') {
          this.viewerPrefs[k] = Boolean((options as Record<string, unknown>)[k]);
        }
      }
    }
    return this;
  },

  /**
   * Register a total-page-count placeholder (jsPDF `putTotalPages`).
   *
   * At output time every occurrence of `pageIndicator` in text objects is
   * replaced with the page count.
   */
  putTotalPages(this: jsOFD, pageIndicator = '{total}'): jsOFD {
    this.totalPagesPattern = String(pageIndicator);
    return this;
  },

  /** API-compatibility no-op (OFD carries no language field). */
  setLanguage(this: jsOFD): jsOFD {
    return this;
  },

  /**
   * @internal Serialize to OFD ZIP entries (`OFD.xml` first).
   *
   * Applies the `putTotalPages` substitution on a copy, leaving the live
   * document untouched so `output()` stays repeatable.
   */
  _buildFiles(this: jsOFD) {
    let pages = this.pages;
    if (this.totalPagesPattern) {
      const total = String(this.pages.length);
      pages = this.pages.map((p) => ({
        ...p,
        objects: p.objects.map((o) =>
          o.t === 'text' && o.text.includes(this.totalPagesPattern!)
            ? { ...o, text: o.text.split(this.totalPagesPattern!).join(total) }
            : o,
        ),
      }));
    }
    return buildOFDPackage({
      pages,
      customFonts: this.customFonts,
      imageList: this.imageList,
      attachments: this.attachments,
      outlineRoot: this.outlineRoot,
      properties: this.properties,
      docID: this.docID,
      creationDate: this.creationDate,
      modDate: this.modDate,
      displayMode: this.displayMode,
      viewerPrefs: this.viewerPrefs,
      measure: (text, fontDef, style, sizePt, charSpacePt) =>
        this.measure(text, fontDef, style, sizePt, charSpacePt),
      getFontDef: (key) => this.getFontDef(key),
    });
  },

  /**
   * Serialize the document.
   *
   * @param type `'arraybuffer'` (default) / `'uint8array'` / `'blob'` /
   *             `'dataurlstring'` / `'dataurlnewwindow'` / `'binarystring'` /
   *             `'bloburl'`
   */
  output(this: jsOFD, type = 'arraybuffer'): OutputResult {
    const t = String(type).toLowerCase();
    const zipBytes = zipStore(this._buildFiles(), this.creationDate);
    switch (t) {
      case 'arraybuffer':
        return zipBytes.buffer.slice(
          zipBytes.byteOffset,
          zipBytes.byteOffset + zipBytes.byteLength,
        ) as ArrayBuffer;
      case 'uint8array':
        return zipBytes;
      case 'binarystring':
      case 'binary': {
        let s = '';
        for (let i = 0; i < zipBytes.length; i++) s += String.fromCharCode(zipBytes[i]!);
        return s;
      }
      case 'dataurlstring':
      case 'datauristring':
      case 'dataurl':
      case 'datauri':
        return 'data:application/ofd;base64,' + b64Encode(zipBytes);
      case 'blob':
        if (typeof Blob === 'undefined') {
          throw new Error('output("blob") requires Blob support; use output("arraybuffer")');
        }
        return new Blob([zipBytes as unknown as BlobPart], { type: 'application/ofd' });
      case 'bloburl':
      case 'blobobject':
        if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
          throw new Error('output("bloburl") requires Blob URL support');
        }
        return URL.createObjectURL(
          new Blob([zipBytes as unknown as BlobPart], { type: 'application/ofd' }),
        );
      case 'dataurlnewwindow':
        if (typeof window === 'undefined' || !window.open) {
          throw new Error('output("dataurlnewwindow") requires window.open');
        }
        window.open('data:application/ofd;base64,' + b64Encode(zipBytes), '_blank');
        return null;
      default:
        throw new Error('output: unknown output type ' + type);
    }
  },

  /** Shorthand for `output('dataurlstring')`. */
  getDataUrl(this: jsOFD): string {
    return this.output('dataurlstring') as string;
  },

  /**
   * Save the document to a file.
   *
   * Browser: triggers a download. Node (CJS): writes into the working
   * directory. Node ESM has no synchronous `require` — use
   * `output('arraybuffer')` and write the bytes yourself.
   */
  save(this: jsOFD, filename?: string): jsOFD {
    let name = filename || 'document.ofd';
    if (!/\.ofd$/i.test(name)) name += '.ofd';

    if (IS_NODE) {
      const fs = nodeRequire('fs') as {
        writeFileSync: (p: string, d: Uint8Array) => void;
      } | null;
      const path = nodeRequire('path') as { join: (...p: string[]) => string } | null;
      if (fs) {
        const p = path ? path.join(process.cwd(), name) : name;
        fs.writeFileSync(p, this.output('uint8array') as Uint8Array);
        return this;
      }
      throw new Error('Node ESM: use output("arraybuffer") and write the file yourself');
    }
    const blob = this.output('blob') as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return this;
  },
};

export type ViewApi = typeof ViewApi;

// Declaration merging attaches the mixin's members to jsOFD.

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends ViewApi {}
}

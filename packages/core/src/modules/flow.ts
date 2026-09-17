/**
 * Page-flow helpers: automatic multi-page text flow (`autoPaging`) and
 * header/footer hooks applied to every page (`headerFooter`).
 */

import type { jsOFD } from '../jsofd';

/** Info passed to page hooks. */
export interface PageInfo {
  /** One-based page number */
  pageNumber: number;
  /** Total page count at the time of the call */
  pageCount: number;
}

export type PageHook = (doc: jsOFD, info: PageInfo) => void;

export interface HeaderFooterOptions {
  /** Drawn on every page in `startPage..end` */
  header?: PageHook;
  /** Drawn on every page in `startPage..end` */
  footer?: PageHook;
  /** First one-based page to draw on (default 1) */
  startPage?: number;
  /** Last one-based page to draw on (default: last page) */
  endPage?: number;
}

export interface AutoPagingOptions {
  /** Left edge of the text block (active unit) */
  x?: number;
  /** First baseline (active unit); defaults to `topMargin` + first line */
  y?: number;
  /** Wrap width (active unit); defaults to page width − `x` − `rightMargin` */
  maxWidth?: number;
  /** Page top margin used when a new page starts (active unit, default 20) */
  topMargin?: number;
  /** Page bottom margin; flow breaks before crossing it (default 20) */
  bottomMargin?: number;
  /** Right margin when `maxWidth` is omitted (default 20) */
  rightMargin?: number;
  /** Line height factor (default: current global) */
  lineHeightFactor?: number;
  /** Alignment of every line (default 'left') */
  align?: 'left' | 'center' | 'right' | 'justify';
  /** Called after each automatic `addPage()` */
  onNewPage?: PageHook;
}

export const FlowApi = {
  /**
   * Flow long text across as many pages as needed.
   *
   * Lines wrap at `maxWidth` (same CJK/Latin rules as `text()`); when the
   * next line would cross the bottom margin a new page is appended and
   * `onNewPage` fires (for headers, page numbers, …).
   *
   * @returns the Y coordinate (active unit) after the last line — chain more
   * content from there
   */
  autoPaging(this: jsOFD, text: string, options: AutoPagingOptions = {}): number {
    const pageW = this.getPageWidth();
    const pageH = this.getPageHeight();
    const x = options.x ?? 20;
    const topMargin = options.topMargin ?? 20;
    const bottomMargin = options.bottomMargin ?? 20;
    const rightMargin = options.rightMargin ?? 20;
    const maxWidth = options.maxWidth ?? pageW - x - rightMargin;
    const startPage = this.page;

    if (typeof options.lineHeightFactor === 'number')
      this.setLineHeightFactor(options.lineHeightFactor);
    const lines = this.splitTextToSize(String(text), maxWidth);
    const leading = this.getLineHeight(); // active unit
    const maxBottom = pageH - bottomMargin;

    // First baseline: default puts the first line's ascent below topMargin.
    let y =
      options.y !== undefined
        ? options.y
        : topMargin + (this.getFontSize() / this.scaleFactor) * 0.85;

    for (const line of lines) {
      if (y > maxBottom) {
        this.addPage();
        y = topMargin + (this.getFontSize() / this.scaleFactor) * 0.85;
        options.onNewPage?.(this, { pageNumber: this.pages.length, pageCount: this.pages.length });
      }
      this.text(line, x, y, { align: options.align });
      y += leading;
    }
    this.page = startPage;
    return y;
  },

  /**
   * Draw headers and footers on a page range.
   *
   * Hooks receive the document (positioned on the target page — use
   * `text`/`line`/… normally) and `{ pageNumber, pageCount }`. Common use:
   *
   * ```ts
   * doc.headerFooter({
   *   header: (d, { pageNumber }) => d.text('季度报告', 20, 12),
   *   footer: (d, { pageNumber, pageCount }) =>
   *     d.text(`第 ${pageNumber} 页 / 共 ${pageCount} 页`, 105, 285, { align: 'center' }),
   * });
   * ```
   */
  headerFooter(this: jsOFD, options: HeaderFooterOptions): jsOFD {
    const start = Math.max(1, options.startPage ?? 1);
    const end = Math.min(this.pages.length, options.endPage ?? this.pages.length);
    const cur = this.page;
    for (let n = start; n <= end; n++) {
      this.setPage(n);
      const info: PageInfo = { pageNumber: n, pageCount: this.pages.length };
      options.header?.(this, info);
      options.footer?.(this, info);
    }
    this.page = cur;
    return this;
  },
};

export type FlowApi = typeof FlowApi;

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends FlowApi {}
}

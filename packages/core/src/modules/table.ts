/**
 * `doc.table()` — a lightweight table engine in the spirit of jspdf-autotable:
 * grid lines, header row with fill, per-column width/align, zebra striping and
 * automatic pagination with a repeated header.
 *
 * All internal computation uses points (the model unit); public inputs and the
 * return value use the active unit.
 */

import type { RGB } from '../types';
import type { jsOFD } from '../jsofd';

export interface TableColumn {
  /** Header caption */
  header?: string;
  /** Column width (active unit); omitted columns share the remaining width */
  width?: number;
  /** Cell text alignment (default 'left') */
  align?: 'left' | 'center' | 'right';
}

export interface TableCell {
  text: string;
  bold?: boolean;
  align?: TableColumn['align'];
  /** Horizontal span (skip the covered cells in the row data) */
  colSpan?: number;
}

export type TableCellInput = string | TableCell;

export interface TableStyle {
  /** Body font size (pt) */
  fontSize?: number;
  /** Header font size (pt); defaults to fontSize */
  headFontSize?: number;
  /** Header fill; null disables the fill (default: blue) */
  headFill?: RGB | null;
  /** Header text color (default white) */
  headColor?: RGB;
  /** Body text color (default: current text color) */
  textColor?: RGB;
  /** Grid line color (default light gray); null disables all grid lines */
  borderColor?: RGB | null;
  /** Grid line width (active unit, default 0.2) */
  lineWidth?: number;
  /** Cell padding (active unit, default 2) */
  cellPadding?: number;
  /** Fixed row height (active unit); default: fits the tallest cell */
  rowHeight?: number;
  /** Alternating [even, odd] row fills; enables zebra striping */
  zebra?: [RGB, RGB] | null;
}

export interface TableOptions {
  columns: TableColumn[];
  rows?: TableCellInput[][];
  style?: TableStyle;
  /** Append pages as needed, repeating the header row (default true) */
  autoPage?: boolean;
  /** Page margin of the flow area when autoPage (active unit, default 20) */
  bottomMargin?: number;
  /** Called after each automatic page break */
  onNewPage?: (doc: jsOFD, info: { pageNumber: number; pageCount: number }) => void;
}

export const TableApi = {
  /**
   * Render a table at `(x, y)` and return the bottom Y (active unit).
   *
   * Column widths: explicit `width`, otherwise the remaining page width is
   * shared equally. With `autoPage` (default) rows that would cross the
   * bottom margin continue on a fresh page under a repeated header.
   */
  table(this: jsOFD, x: number, y: number, options: TableOptions): number {
    const st: TableStyle = options.style || {};
    const cols = options.columns;
    const sf = this.scaleFactor;
    const xU = this._u(x);
    const yU = this._u(y);
    const padPt = this._u(st.cellPadding ?? 2);
    const bodySize = st.fontSize ?? this.fontSize;
    const headSize = st.headFontSize ?? bodySize;
    const autoPage = options.autoPage !== false;
    const marginU = options.bottomMargin ?? 20;
    const hasHeader = cols.some((c) => c.header !== undefined);
    const zebra = st.zebra ?? null;
    const gridColor = st.borderColor === null ? null : (st.borderColor ?? [191, 197, 205]);
    const gridW = this._u(st.lineWidth ?? 0.2);

    // Column widths: explicit, or share what is left of the page width.
    const pageW = this.pages[this.page]!.width;
    const widths = cols.map((c) => (c.width !== undefined ? this._u(c.width) : null));
    const used = widths.reduce<number>((s, w) => s + (w ?? 0), 0);
    const flexCount = widths.filter((w) => w === null).length;
    const flexW = flexCount ? Math.max((pageW - xU - used) / flexCount, 20) : 0;
    const W = widths.map((w) => w ?? flexW);
    const totalW = W.reduce((s, w) => s + w, 0);

    // State we mutate while drawing; restored before returning.
    const save = {
      fontSize: this.fontSize,
      fill: this.fillColor.slice() as RGB,
      draw: this.drawColor.slice() as RGB,
      text: this.textColor.slice() as RGB,
      lineW: this.lineWidth,
      fontKey: this.activeFontKey,
      fontSt: this.activeFontStyle,
    };
    const restore = (): void => {
      this.fontSize = save.fontSize;
      this.fillColor = save.fill;
      this.drawColor = save.draw;
      this.textColor = save.text;
      this.lineWidth = save.lineW;
      this.activeFontKey = save.fontKey;
      this.activeFontStyle = save.fontSt;
    };

    const cellLines = (text: string, wPt: number, size: number, bold: boolean): string[] => {
      this.fontSize = size;
      this.activeFontStyle = bold ? 'bold' : 'normal';
      return this._splitCore(
        text,
        wPt - padPt * 2,
        this.getFontDef(this.activeFontKey),
        this.activeFontStyle,
      );
    };

    const rowHeight = (row: TableCellInput[]): number => {
      if (st.rowHeight !== undefined) return this._u(st.rowHeight);
      let lines = 1;
      row.forEach((cell, ci) => {
        const spec: TableCell = typeof cell === 'string' ? { text: cell } : cell;
        const span = Math.max(1, spec.colSpan ?? 1);
        const wPt = W.slice(ci, ci + span).reduce((s, ww) => s + ww, 0);
        lines = Math.max(lines, cellLines(spec.text, wPt, bodySize, !!spec.bold).length);
      });
      return padPt * 2 + lines * bodySize * this.lineHeightFactor;
    };

    const drawCellText = (
      cell: TableCellInput,
      cxPt: number,
      cyPt: number,
      wPt: number,
      hPt: number,
      header: boolean,
      align: TableColumn['align'] | undefined,
      fill: RGB | null,
    ): void => {
      const spec: TableCell = typeof cell === 'string' ? { text: cell } : cell;
      const size = header ? headSize : bodySize;
      const bold = header || !!spec.bold;
      if (fill) {
        this.fillColor = fill;
        this.rect(cxPt / sf, cyPt / sf, wPt / sf, hPt / sf, 'F');
      }
      this.fontSize = size;
      this.activeFontStyle = bold ? 'bold' : 'normal';
      this.textColor = header ? (st.headColor ?? [255, 255, 255]) : (st.textColor ?? save.text);
      const def = this.getFontDef(this.activeFontKey);
      const lines = cellLines(spec.text, wPt, size, bold);
      const ascPt = (def.ascent / 1000) * size;
      let ty = cyPt + padPt + ascPt;
      for (const line of lines) {
        const w = this.measure(line, def, this.activeFontStyle, size, 0);
        let tx = cxPt + padPt;
        if (align === 'center') tx = cxPt + (wPt - w) / 2;
        else if (align === 'right') tx = cxPt + wPt - padPt - w;
        this.text(line, tx / sf, ty / sf);
        ty += size * this.lineHeightFactor;
      }
    };

    const hLine = (x1: number, y1: number, x2: number, y2: number): void => {
      if (!gridColor) return;
      this.drawColor = gridColor;
      this.lineWidth = gridW;
      this.line(x1 / sf, y1 / sf, x2 / sf, y2 / sf, 'S');
    };

    const headerHeightPt = hasHeader
      ? st.rowHeight !== undefined
        ? this._u(st.rowHeight)
        : padPt * 2 + headSize * this.lineHeightFactor
      : 0;

    const drawHeader = (topPt: number): void => {
      if (!hasHeader) return;
      let cx = xU;
      cols.forEach((col, i) => {
        drawCellText(
          col.header ?? '',
          cx,
          topPt,
          W[i]!,
          headerHeightPt,
          true,
          col.align,
          st.headFill === null ? null : (st.headFill ?? [53, 101, 224]),
        );
        cx += W[i]!;
      });
      let gx = xU;
      for (let i = 0; i < W.length; i++) {
        hLine(gx, topPt, gx, topPt + headerHeightPt);
        gx += W[i]!;
      }
      hLine(gx, topPt, gx, topPt + headerHeightPt);
      hLine(xU, topPt, xU + totalW, topPt);
      hLine(xU, topPt + headerHeightPt, xU + totalW, topPt + headerHeightPt);
    };

    if (hasHeader) drawHeader(yU);
    let curY = yU + headerHeightPt;

    for (let r = 0; r < (options.rows ?? []).length; r++) {
      const row = (options.rows ?? [])[r]!;
      const rowH = rowHeight(row);
      const pageBottom = this.pages[this.page]!.height - this._u(marginU);
      if (autoPage && curY + rowH > pageBottom && this.pages[this.page]!.height > 0) {
        this.addPage();
        options.onNewPage?.(this, { pageNumber: this.pages.length, pageCount: this.pages.length });
        const topPt = this._u(marginU);
        drawHeader(topPt);
        curY = topPt + headerHeightPt;
      }
      const fill = zebra ? zebra[r % 2] : null;
      let cx = xU;
      row.forEach((cell, ci) => {
        const spec: TableCell = typeof cell === 'string' ? { text: cell } : cell;
        const span = Math.max(1, spec.colSpan ?? 1);
        const cw = W.slice(ci, ci + span).reduce((s, ww) => s + ww, 0);
        drawCellText(cell, cx, curY, cw, rowH, false, spec.align ?? cols[ci]?.align, fill);
        cx += cw;
      });
      // Row grid: verticals per column + top edge; bottom edge by next row/finish.
      let gx = xU;
      for (let i = 0; i < W.length; i++) {
        hLine(gx, curY, gx, curY + rowH);
        gx += W[i]!;
      }
      hLine(gx, curY, gx, curY + rowH);
      hLine(xU, curY, xU + totalW, curY);
      curY += rowH;
    }
    if (gridColor) hLine(xU, curY, xU + totalW, curY);

    restore();
    return curY / sf;
  },
};

export type TableApi = typeof TableApi;

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends TableApi {}
}

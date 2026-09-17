/**
 * `doc.html()` — render simple HTML into the document.
 *
 * A dependency-free tag-stream parser (works in Node and browsers) walks the
 * markup and lays out block elements — headings, paragraphs, lists, breaks —
 * flowing across pages at the bottom margin. Inline styling covers bold and
 * italic (`b`, `strong`, `i`, `em`), entities are decoded.
 *
 * This is deliberately not a CSS engine: layout attributes come from the tag
 * semantics, not stylesheets.
 */

import type { jsOFD } from '../jsofd';

export interface HtmlOptions {
  /** Left edge of the text block (active unit, default 20) */
  x?: number;
  /** Top of the content (active unit, default 20) */
  y?: number;
  /** Wrap width (default: page width − x − `rightMargin`) */
  width?: number;
  /** Bottom margin of the flow area (default 20) */
  bottomMargin?: number;
  /** Top margin used on continuation pages (default 20) */
  topMargin?: number;
  /** Base font size in pt (default 11) */
  fontSize?: number;
  /** Heading scale factor per level: h1 = base × 2, h2 = × 1.5, … */
  headingScale?: number;
  /** Line height factor (default 1.5) */
  lineHeightFactor?: number;
  /** Called after each automatic page break */
  onNewPage?: (doc: jsOFD, info: { pageNumber: number; pageCount: number }) => void;
}

interface Block {
  text: string;
  /** 0 = paragraph, 1..6 = heading level, 7 = list item */
  kind: number;
  bold: boolean;
  italic: boolean;
  gapBefore: number; // pt of extra space above the block
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  laquo: '\u00ab',
  raquo: '\u00bb',
  middot: '\u00b7',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X'))
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body.toLowerCase()] ?? all;
  });
}

/** Very small tag-stream parser producing styled block candidates. */
function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  let text = '';
  let bold = false;
  let italic = false;
  // Heading (1-6) / list item (7); 0 while in plain flow.
  let container = 0;
  const containerStack: number[] = [];

  const flush = (gapBefore = 0): void => {
    const t = decodeEntities(text.replace(/\s+/g, ' ').trim());
    if (t) blocks.push({ text: t, kind: container, bold, italic, gapBefore });
    text = '';
  };

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>|<!--[\s\S]*?-->/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    text += html.slice(last, m.index);
    last = tagRe.lastIndex;
    if (!m[1]) continue; // comment
    const closing = m[0].startsWith('</');
    const tag = m[1]!.toLowerCase();

    if (!closing) {
      switch (tag) {
        case 'b':
        case 'strong':
          bold = true;
          break;
        case 'i':
        case 'em':
          italic = true;
          break;
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          flush();
          containerStack.push(container);
          container = Number(tag.charAt(1));
          break;
        case 'p':
          flush(6);
          containerStack.push(container);
          container = 0;
          break;
        case 'li':
          flush(2);
          containerStack.push(container);
          container = 7;
          break;
        case 'br':
          flush();
          break;
        case 'ul':
        case 'ol':
        case 'div':
        case 'blockquote':
          flush(4);
          break;
        default:
          break; // unknown/inline tags: keep the text flow
      }
      if (m[2] === '/') {
        // self-closing open tag
        if (tag === 'br') {
          /* already flushed */
        }
      }
    } else {
      switch (tag) {
        case 'b':
        case 'strong':
          bold = false;
          break;
        case 'i':
        case 'em':
          italic = false;
          break;
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
        case 'p':
        case 'li':
          flush();
          container = containerStack.pop() ?? 0;
          break;
        default:
          break;
      }
    }
  }
  text += html.slice(last);
  flush();
  return blocks;
}

/** Style of each block kind: [size factor, bold, gapBefore pt]. */
function blockStyle(
  b: Block,
  base: number,
  headingScale: number,
): { size: number; bold: boolean; gap: number } {
  if (b.kind >= 1 && b.kind <= 6) {
    const factor = [0, 2, 1.5, 1.25, 1.1, 1, 1][b.kind]! * headingScale;
    return { size: base * factor, bold: true, gap: b.gapBefore + 8 };
  }
  if (b.kind === 7) return { size: base, bold: b.bold, gap: b.gapBefore };
  return { size: base, bold: b.bold, gap: b.gapBefore };
}

export const HtmlApi = {
  /**
   * Render an HTML fragment and return the final Y (active unit).
   *
   * Supported: `h1–h6`, `p`, `div`, `br`, `ul/ol` + `li`, `b/strong`,
   * `i/em`, entities. Inline `span` text is preserved. Attributes and CSS
   * are ignored by design.
   */
  html(this: jsOFD, html: string, options: HtmlOptions = {}): number {
    const pageW = this.getPageWidth();
    const pageH = this.getPageHeight();
    const x = options.x ?? 20;
    const topMargin = options.topMargin ?? 20;
    const bottomMargin = options.bottomMargin ?? 20;
    const width = options.width ?? pageW - x - 20;
    const base = options.fontSize ?? 11;
    const headingScale = options.headingScale ?? 1;
    const lh = options.lineHeightFactor ?? 1.5;

    const prevLh = this.lineHeightFactor;
    this.setLineHeightFactor(lh);

    let y = options.y ?? topMargin + base * 0.85;
    const maxBottom = pageH - bottomMargin;
    const sf = this.scaleFactor;

    const ensureRoom = (neededPt: number, gapPt: number): void => {
      if (y + (neededPt + gapPt) / sf > maxBottom) {
        this.addPage();
        y = topMargin + base * 0.85;
        options.onNewPage?.(this, { pageNumber: this.pages.length, pageCount: this.pages.length });
      }
    };

    for (const block of parseBlocks(String(html))) {
      const { size, bold, gap } = blockStyle(block, base, headingScale);
      this.setFontSize(size);
      this.activeFontStyle = bold ? 'bold' : block.italic ? 'italic' : 'normal';
      const lines = this.splitTextToSize(block.text, width);
      ensureRoom(size * lh, gap);
      y += gap / sf;
      const bullet = block.kind === 7 ? '•  ' : '';
      lines.forEach((line, i) => {
        if (y + size / sf > maxBottom && i > 0) {
          this.addPage();
          y = topMargin + base * 0.85;
          options.onNewPage?.(this, {
            pageNumber: this.pages.length,
            pageCount: this.pages.length,
          });
        }
        const prefix = i === 0 ? bullet : '   ';
        this.text(prefix + line, x, y);
        y += (size * lh) / sf;
      });
    }

    this.setLineHeightFactor(prevLh);
    return y;
  },
};

export type HtmlApi = typeof HtmlApi;

declare module '../jsofd' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface jsOFD extends HtmlApi {}
}

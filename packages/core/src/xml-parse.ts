/**
 * Minimal XML DOM parser — dependency-free, works in Node and browsers.
 *
 * Sufficient for well-formed machine-generated XML (OFD packages). Namespace
 * prefixes are stripped: `<ofd:TextObject>` parses as name "TextObject".
 */

export interface XmlElement {
  /** Local tag name (namespace prefix removed). */
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Direct text inside this element (entities decoded, whitespace kept). */
  text: string;
}

const DECODE: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(lt|gt|amp|quot|apos);/g, (m) => DECODE[m] ?? m);
}

/** Local name of a possibly prefixed tag (`ofd:TextObject` → `TextObject`). */
function localName(raw: string): string {
  const i = raw.indexOf(':');
  return i === -1 ? raw : raw.slice(i + 1);
}

class P {
  i = 0;
  constructor(readonly s: string) {}

  /** Skip comments, PIs, doctype and CDATA; CDATA text lands in the return. */
  misc(): string {
    let text = '';
    const s = this.s;
    for (;;) {
      if (s.startsWith('<!--', this.i)) {
        const end = s.indexOf('-->', this.i);
        this.i = end === -1 ? s.length : end + 3;
      } else if (s.startsWith('<![CDATA[', this.i)) {
        const end = s.indexOf(']]>', this.i);
        text += s.slice(this.i + 9, end === -1 ? s.length : end);
        this.i = end === -1 ? s.length : end + 3;
      } else if (s[this.i] === '<' && (s[this.i + 1] === '?' || s.startsWith('<!', this.i))) {
        const end = s.indexOf('>', this.i);
        this.i = end === -1 ? s.length : end + 1;
      } else break;
    }
    return text;
  }

  atTag(): boolean {
    return this.s[this.i] === '<' && this.s[this.i + 1] !== '!' && this.s[this.i + 1] !== '?';
  }

  eof(): boolean {
    this.misc();
    return this.i >= this.s.length;
  }

  /** Consume character data up to the next '<' (decoded). */
  takeText(): string {
    const next = this.s.indexOf('<', this.i);
    const end = next === -1 ? this.s.length : next;
    const raw = this.s.slice(this.i, end);
    this.i = end;
    return decodeEntities(raw);
  }

  /** Parse a tag at '<' — returns { name, attrs, selfClosing }. */
  tag(): { name: string; attrs: Record<string, string>; selfClosing: boolean } {
    this.i++; // '<'
    const m = /^[^\s/>]+/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`xml: bad tag at offset ${this.i}`);
    const name = localName(m[0]);
    this.i += m[0].length;
    const attrs: Record<string, string> = {};
    for (;;) {
      while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
      if (this.s[this.i] === '/') {
        this.i++;
        if (this.s[this.i] !== '>') throw new Error(`xml: expected '>' at offset ${this.i}`);
        this.i++;
        return { name, attrs, selfClosing: true };
      }
      if (this.s[this.i] === '>') {
        this.i++;
        return { name, attrs, selfClosing: false };
      }
      const am = /^[^\s=/>]+/.exec(this.s.slice(this.i));
      if (!am) throw new Error(`xml: bad attribute at offset ${this.i}`);
      const key = am[0];
      this.i += key.length;
      while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
      if (this.s[this.i] !== '=') throw new Error(`xml: expected '=' at offset ${this.i}`);
      this.i++;
      while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
      const quote = this.s[this.i];
      if (quote !== '"' && quote !== "'")
        throw new Error(`xml: bad attribute value at offset ${this.i}`);
      this.i++;
      const close = this.s.indexOf(quote, this.i);
      if (close === -1) throw new Error('xml: unterminated attribute value');
      attrs[localName(key)] = decodeEntities(this.s.slice(this.i, close));
      this.i = close + 1;
    }
  }

  closeTag(): void {
    this.i += 2; // '</'
    const m = /^[^\s>]+/.exec(this.s.slice(this.i));
    this.i += m ? m[0].length : 0;
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
    if (this.s[this.i] !== '>') throw new Error(`xml: expected '>' at offset ${this.i}`);
    this.i++;
  }
}

/** Parse an XML string into a root element. Throws on malformed input. */
export function parseXml(xml: string): XmlElement {
  const src = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const p = new P(src);
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  for (;;) {
    const cd = p.misc();
    if (cd) {
      const top = stack[stack.length - 1];
      if (top) top.text += cd;
    }
    if (p.i >= src.length) break;
    if (root && stack.length === 0) break; // trailing junk after the root
    if (!p.atTag()) {
      const top = stack[stack.length - 1];
      const text = p.takeText();
      if (top && text) top.text += text;
      continue;
    }
    if (src.startsWith('</', p.i)) {
      const top = stack.pop();
      if (!top) throw new Error(`xml: unexpected close tag at offset ${p.i}`);
      p.closeTag();
      continue;
    }
    const t = p.tag();
    const el: XmlElement = { name: t.name, attrs: t.attrs, children: [], text: '' };
    const top = stack[stack.length - 1];
    if (top) top.children.push(el);
    if (!root) root = el;
    if (!t.selfClosing) stack.push(el);
  }
  if (!root) throw new Error('xml: no root element found');
  return root;
}

/** Direct children, optionally filtered by local name. */
export function kids(el: XmlElement, name?: string): XmlElement[] {
  return name ? el.children.filter((c) => c.name === name) : el.children;
}

/** First direct child with the given local name. */
export function kid(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}

/** All descendants in document order, optionally filtered by local name. */
export function all(el: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (n: XmlElement): void => {
    for (const c of n.children) {
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** Concatenated text of the element subtree, trimmed. */
export function textOf(el: XmlElement): string {
  return (el.text + el.children.map((c) => textOf(c)).join('')).trim();
}

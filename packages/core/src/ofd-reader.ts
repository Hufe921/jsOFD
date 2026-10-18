/**
 * OFD package reader — parse GB/T 33190-2016 files into a plain object model.
 *
 * Counterpart of builder.ts (write side). Supported today:
 *   - package structure: OFD.xml → Doc_N/Document.xml → Pages/Page_N/Content.xml
 *   - page objects: TextObject / PathObject / ImageObject (with CTM, colors)
 *   - metadata (DocInfo), DocType (OFD / OFD-H), Outlines, Attachments,
 *     embedded font resources, signature names
 * Skipped (recorded in `limitations`): CompositeObject nesting, clips, page
 * annotations (StampAnnot appearance), Actions other than GoTo.
 */

import { parseXml, all, kid, kids, textOf, type XmlElement } from './xml-parse';
import { unzip, findEntry, resolvePath } from './zip-read';

/* ---------------- public model ---------------- */

export interface OfdColor {
  r: number;
  g: number;
  b: number;
  /** 0–1, from the Alpha attribute (default 1). */
  alpha: number;
}

export interface OfdCtm {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type OfdPathOp =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Q'; x1: number; y1: number; x: number; y: number }
  | { op: 'Z' };

export interface OfdBoundary {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OfdTextCode {
  /** Text content, entities decoded. */
  text: string;
  /** Offset of the first glyph from the Boundary origin, in mm. */
  x: number;
  y: number;
  /** Per-glyph x offsets (length = char count − 1) in mm, when pinned. */
  deltaX?: number[];
  deltaY?: number[];
}

export interface OfdTextObj {
  kind: 'text';
  boundary: OfdBoundary;
  size: number;
  fontId?: string;
  fill: boolean;
  stroke: boolean;
  color: OfdColor;
  strokeColor?: OfdColor;
  alpha?: number;
  ctm?: OfdCtm;
  codes: OfdTextCode[];
}

export interface OfdPathObj {
  kind: 'path';
  boundary: OfdBoundary;
  ops: OfdPathOp[];
  fill: boolean;
  stroke: boolean;
  fillColor?: OfdColor;
  strokeColor?: OfdColor;
  lineWidth?: number;
  dashPattern?: number[];
  alpha?: number;
  ctm?: OfdCtm;
}

export interface OfdImageObj {
  kind: 'image';
  boundary: OfdBoundary;
  resId: string;
  format?: string;
  /** Image bytes, resolved from the package resources. */
  data?: Uint8Array;
  alpha?: number;
  ctm?: OfdCtm;
}

export type OfdObject = OfdTextObj | OfdPathObj | OfdImageObj;

export interface OfdOutlineNode {
  title: string;
  /** Zero-based page index the outline entry points to. */
  pageIndex: number;
  children: OfdOutlineNode[];
}

export interface OfdAttachment {
  id: number;
  name: string;
  format?: string;
  data: Uint8Array;
}

export interface OfdSignatureInfo {
  /** Signature.xml location inside the package. */
  name: string;
  /** Base name (SES_Signature / SES_Profile / ...). */
  baseName: string;
}

export interface OfdPage {
  index: number;
  /** Page box in mm. */
  width: number;
  height: number;
  objects: OfdObject[];
}

export interface OfdDocument {
  /** DocType from OFD.xml — "OFD" or "OFD-H" (GB/T XXXXX archive profile). */
  docType: string;
  meta: {
    docId?: string;
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    creationDate?: string;
    modDate?: string;
  };
  pages: OfdPage[];
  outlines: OfdOutlineNode[];
  attachments: OfdAttachment[];
  signatures: OfdSignatureInfo[];
  /** Embedded font programs by resource id (FontName + raw bytes). */
  fonts: Record<string, { name: string; data: Uint8Array }>;
  /** Features present in the file but not modelled by this reader. */
  limitations: string[];
}

/* ---------------- helpers ---------------- */

const SVG_NS_RE = /^-?\d+(\.\d+)?$/;

function nums(s: string | undefined): number[] {
  if (!s) return [];
  return s
    .trim()
    .split(/\s+/)
    .filter((t) => SVG_NS_RE.test(t))
    .map(Number);
}

function boundary(el: XmlElement): OfdBoundary {
  const v = nums(el.attrs.Boundary);
  return { x: v[0] ?? 0, y: v[1] ?? 0, w: v[2] ?? 0, h: v[3] ?? 0 };
}

function ctm(el: XmlElement): OfdCtm | undefined {
  const v = nums(el.attrs.CTM);
  if (v.length < 6) return undefined;
  return { a: v[0]!, b: v[1]!, c: v[2]!, d: v[3]!, e: v[4]!, f: v[5]! };
}

/** Parse a FillColor/StrokeColor element (RGB / CMYK / gray → RGB + alpha). */
function ofdColor(el: XmlElement | undefined): OfdColor | undefined {
  if (!el) return undefined;
  const v = nums(el.attrs.Value);
  const cs = Number(el.attrs.ColorSpace ?? '1');
  let r: number;
  let g: number;
  let b: number;
  if (cs === 2 && v.length >= 4) {
    // CMYK (0–255 each) → RGB
    const c = v[0]! / 255;
    const m = v[1]! / 255;
    const y = v[2]! / 255;
    const k = v[3]! / 255;
    r = Math.round(255 * (1 - c) * (1 - k));
    g = Math.round(255 * (1 - m) * (1 - k));
    b = Math.round(255 * (1 - y) * (1 - k));
  } else if (v.length === 1) {
    r = g = b = v[0]!;
  } else {
    r = v[0] ?? 0;
    g = v[1] ?? 0;
    b = v[2] ?? 0;
  }
  const alpha = el.attrs.Alpha !== undefined ? Number(el.attrs.Alpha) / 255 : 1;
  return { r, g, b, alpha };
}

/** Parse OFD AbbreviatedData. Note the OFD operators differ from SVG:
 *  `B` is the cubic Bézier (6 numbers) and `C` (bare) closes the path. */
function parseAbbreviated(data: string): OfdPathOp[] {
  const tokens = data.trim().split(/\s+/).filter(Boolean);
  const ops: OfdPathOp[] = [];
  let i = 0;
  const num = (): number => {
    const t = tokens[i++];
    if (t === undefined || !SVG_NS_RE.test(t)) throw new Error(`path: bad number '${t}'`);
    return Number(t);
  };
  const nextIsNumber = (): boolean => i < tokens.length && SVG_NS_RE.test(tokens[i]!);
  while (i < tokens.length) {
    const op = tokens[i++];
    if (op === 'M' || op === 'L') ops.push({ op, x: num(), y: num() });
    else if (op === 'B' || (op === 'C' && nextIsNumber()))
      ops.push({ op: 'C', x1: num(), y1: num(), x2: num(), y2: num(), x: num(), y: num() });
    else if (op === 'Q') ops.push({ op: 'Q', x1: num(), y1: num(), x: num(), y: num() });
    else if (op === 'Z' || op === 'C') ops.push({ op: 'Z' });
    else throw new Error(`path: unsupported operator '${op}'`);
  }
  return ops;
}

/** OFD TextObject → text codes (content + offsets). */
function parseTextCodes(el: XmlElement): OfdTextCode[] {
  return kids(el, 'TextCode').map((code) => {
    const deltaX = nums(code.attrs.DeltaX);
    const deltaY = nums(code.attrs.DeltaY);
    return {
      text: textOf(code),
      x: Number(code.attrs.X ?? 0) || 0,
      y: Number(code.attrs.Y ?? 0) || 0,
      deltaX: deltaX.length ? deltaX : undefined,
      deltaY: deltaY.length ? deltaY : undefined,
    };
  });
}

/* ---------------- reader ---------------- */

export async function parseOfd(data: Uint8Array | ArrayBuffer): Promise<OfdDocument> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const entries = await unzip(bytes);
  const limitations: string[] = [];

  // ---- OFD.xml: entry point, DocInfo, DocRoot, DocType ----
  const ofdXmlBytes = findEntry(entries, 'OFD.xml');
  if (!ofdXmlBytes) throw new Error('OFD: OFD.xml not found in package');
  const ofdXml = parseXml(new TextDecoder('utf-8').decode(ofdXmlBytes));
  const docType = ofdXml.attrs.DocType ?? 'OFD';
  const docBody = kid(ofdXml, 'DocBody');
  const docInfoEl = docBody ? kid(docBody, 'DocInfo') : undefined;
  const meta: OfdDocument['meta'] = {};
  if (docInfoEl) {
    for (const field of [
      'DocID',
      'Title',
      'Author',
      'Subject',
      'Keywords',
      'Creator',
      'CreationDate',
      'ModDate',
    ] as const) {
      const el = kid(docInfoEl, field);
      if (el) {
        const value = textOf(el);
        meta[
          field === 'DocID'
            ? 'docId'
            : field === 'CreationDate'
              ? 'creationDate'
              : field === 'ModDate'
                ? 'modDate'
                : (field.toLowerCase() as 'title')
        ] = value;
      }
    }
  }
  const docRoot = (
    docBody && kid(docBody, 'DocRoot') ? textOf(kid(docBody, 'DocRoot')!) : 'Doc_0/Document.xml'
  ).replace(/^\/+/, '');
  const docDir = docRoot.includes('/') ? docRoot.slice(0, docRoot.lastIndexOf('/') + 1) : '';

  const readXml = (loc: string, relativeToDoc = true): XmlElement | undefined => {
    const path =
      loc.startsWith('/') || !relativeToDoc ? loc.replace(/^\/+/, '') : resolvePath(docDir, loc);
    const bytes = findEntry(entries, path);
    return bytes ? parseXml(new TextDecoder('utf-8').decode(bytes)) : undefined;
  };

  const documentXml = readXml(docRoot, false);
  if (!documentXml) throw new Error(`OFD: document root '${docRoot}' not found in package`);

  // ---- CommonData: page box + resource locations ----
  const common = kid(documentXml, 'CommonData');
  const pageArea = common ? kid(common, 'PageArea') : undefined;
  const boxEl = pageArea
    ? (kid(pageArea, 'ApplicationBox') ?? kid(pageArea, 'PhysicalBox'))
    : undefined;
  const box = nums(boxEl?.attrs.Value ?? boxEl?.text);
  const pw = Math.abs((box[2] ?? 0) - (box[0] ?? 0)) || 210;
  const ph = Math.abs((box[3] ?? 0) - (box[1] ?? 0)) || 297;
  const publicResLoc =
    common && kid(common, 'PublicRes') ? textOf(kid(common, 'PublicRes')!) : undefined;
  const documentResLoc =
    common && kid(common, 'DocumentRes') ? textOf(kid(common, 'DocumentRes')!) : undefined;

  // ---- resources: fonts (public) + multimedia (document) ----
  const fonts: OfdDocument['fonts'] = {};
  const media = new Map<string, { format?: string; data: Uint8Array }>();
  const fontLocs = new Map<string, { name: string; loc: string }>();

  if (publicResLoc) {
    const res = readXml(publicResLoc);
    const resBase = resolvePath(docDir, res?.attrs.BaseLoc ?? '');
    if (res) {
      const fontsEl = kid(res, 'Fonts');
      for (const f of fontsEl ? kids(fontsEl, 'Font') : []) {
        const id = f.attrs.ID ?? '';
        const name = f.attrs.FontName ?? id;
        const fileEl = kid(f, 'FontFile');
        const loc = fileEl ? textOf(fileEl) : undefined;
        if (loc) {
          fontLocs.set(id, { name, loc: resolvePath(resBase, loc) });
        } else {
          fonts[id] = { name, data: new Uint8Array(0) };
        }
      }
    }
  }
  for (const [id, { name, loc }] of fontLocs) {
    const bytes = findEntry(entries, loc);
    if (bytes) fonts[id] = { name, data: bytes };
    else limitations.push(`font resource '${loc}' missing from package`);
  }

  if (documentResLoc) {
    const res = readXml(documentResLoc);
    const resBase = resolvePath(docDir, res?.attrs.BaseLoc ?? '');
    const mmEl = res ? kid(res, 'MultiMedias') : undefined;
    for (const m of mmEl ? kids(mmEl, 'MultiMedia') : []) {
      const id = m.attrs.ID ?? '';
      const fileEl = kid(m, 'MediaFile');
      const loc = fileEl ? textOf(fileEl) : undefined;
      if (!loc) continue;
      const bytes = findEntry(entries, resolvePath(resBase, loc));
      if (bytes) media.set(id, { format: m.attrs.Format, data: bytes });
    }
  }

  // ---- page objects ----
  const pagesEl = kid(documentXml, 'Pages');
  const pageEls = pagesEl ? kids(pagesEl, 'Page') : [];
  const pageIdToIndex = new Map<string, number>();
  pageEls.forEach((p, i) => pageIdToIndex.set(p.attrs.ID ?? String(i + 1), i));

  const parseObject = (el: XmlElement): OfdObject | undefined => {
    if (el.name === 'TextObject') {
      return {
        kind: 'text',
        boundary: boundary(el),
        size: Number(el.attrs.Size ?? 0) || 0,
        fontId: el.attrs.Font,
        fill: el.attrs.Fill !== 'false',
        stroke: el.attrs.Stroke === 'true',
        color: ofdColor(kid(el, 'FillColor')) ?? { r: 0, g: 0, b: 0, alpha: 1 },
        strokeColor: ofdColor(kid(el, 'StrokeColor')),
        alpha: el.attrs.Alpha !== undefined ? Number(el.attrs.Alpha) / 255 : undefined,
        ctm: ctm(el),
        codes: parseTextCodes(el),
      };
    }
    if (el.name === 'PathObject') {
      let ops: OfdPathOp[] = [];
      const abbr = kid(el, 'AbbreviatedData');
      if (abbr) {
        try {
          ops = parseAbbreviated(textOf(abbr));
        } catch (e) {
          limitations.push(`path ops skipped: ${(e as Error).message}`);
        }
      }
      const dash = nums(el.attrs.DashPattern);
      return {
        kind: 'path',
        boundary: boundary(el),
        ops,
        fill: el.attrs.Fill !== 'false',
        stroke: el.attrs.Stroke === 'true',
        fillColor: ofdColor(kid(el, 'FillColor')),
        strokeColor: ofdColor(kid(el, 'StrokeColor')),
        lineWidth: el.attrs.LineWidth !== undefined ? Number(el.attrs.LineWidth) : undefined,
        dashPattern: dash.length ? dash : undefined,
        alpha: el.attrs.Alpha !== undefined ? Number(el.attrs.Alpha) / 255 : undefined,
        ctm: ctm(el),
      };
    }
    if (el.name === 'ImageObject') {
      const resId = el.attrs.ResourceID ?? '';
      const res = media.get(resId);
      if (!res && resId) {
        limitations.push(`image resource '${resId}' missing from package resources`);
      }
      return {
        kind: 'image',
        boundary: boundary(el),
        resId,
        format: res?.format,
        data: res?.data,
        alpha: el.attrs.Alpha !== undefined ? Number(el.attrs.Alpha) / 255 : undefined,
        ctm: ctm(el),
      };
    }
    if (el.name !== 'CompositeObject') limitations.push(`page object '${el.name}' skipped`);
    return undefined;
  };

  const pages: OfdDocument['pages'] = pageEls.map((p, index) => {
    const loc = p.attrs.BaseLoc ?? `Pages/Page_${index}/Content.xml`;
    const content = readXml(loc);
    // Per-page Area overrides the CommonData template size (GB/T 33190 7.5).
    const areaEl = kid(p, 'Area');
    const areaBox = areaEl
      ? nums(kid(areaEl, 'PhysicalBox')?.attrs.Value ?? kid(areaEl, 'PhysicalBox')?.text)
      : [];
    const width = areaBox.length >= 4 ? Math.abs(areaBox[2]! - areaBox[0]!) : pw;
    const height = areaBox.length >= 4 ? Math.abs(areaBox[3]! - areaBox[1]!) : ph;
    const objects: OfdObject[] = [];
    if (content) {
      for (const layer of all(content, 'Layer')) {
        for (const child of layer.children) {
          const obj = parseObject(child);
          if (obj) objects.push(obj);
        }
      }
    } else {
      limitations.push(`page ${index + 1} content '${loc}' missing from package`);
    }
    return { index, width, height, objects };
  });

  // ---- outlines (bookmarks) ----
  let outlines: OfdOutlineNode[] = [];
  const outlinesEl = kid(documentXml, 'Outlines');
  if (outlinesEl) {
    const parseNode = (el: XmlElement): OfdOutlineNode => {
      let pageIndex = 0;
      for (const action of all(el, 'Goto')) {
        const dest = kid(action, 'Dest');
        if (!dest) continue;
        const pageId =
          dest.attrs.PageID ?? (kid(dest, 'PageRef') ? kid(dest, 'PageRef')!.attrs.ID : undefined);
        if (pageId !== undefined && pageId !== '') {
          const idx = pageIdToIndex.get(pageId);
          if (idx !== undefined) pageIndex = idx;
        }
        break;
      }
      return {
        title: el.attrs.Title ?? '',
        pageIndex,
        children: kids(el, 'Outline').map(parseNode),
      };
    };
    outlines = kids(outlinesEl, 'Outline').map(parseNode);
  }

  // ---- attachments ----
  const attachments: OfdAttachment[] = [];
  const attachmentsLoc =
    kid(documentXml, 'Attachments') !== undefined
      ? textOf(kid(documentXml, 'Attachments')!)
      : undefined;
  if (attachmentsLoc) {
    const attXml = readXml(attachmentsLoc);
    const baseDir = attachmentsLoc.includes('/')
      ? attachmentsLoc.slice(0, attachmentsLoc.lastIndexOf('/') + 1)
      : '';
    if (attXml) {
      for (const a of kids(attXml, 'Attachment')) {
        const fileEl = kid(a, 'FileLoc');
        const loc = fileEl ? textOf(fileEl) : undefined;
        const bytes = loc
          ? findEntry(entries, loc.startsWith('/') ? loc : resolvePath(baseDir, loc))
          : undefined;
        attachments.push({
          id: Number(a.attrs.ID ?? 0) || attachments.length + 1,
          name: a.attrs.Name ?? '',
          format: a.attrs.Format,
          data: bytes ?? new Uint8Array(0),
        });
        if (!bytes) limitations.push(`attachment '${a.attrs.Name}' file '${loc}' missing`);
      }
    }
  }

  // ---- signatures: list Sign*/Signature.xml entries ----
  const signatures: OfdSignatureInfo[] = [];
  for (const name of entries.keys()) {
    if (/Signs\/.*Signature\.xml$/i.test(name)) {
      signatures.push({ name, baseName: name.slice(name.lastIndexOf('/') + 1) });
    }
  }

  return { docType, meta, pages, outlines, attachments, signatures, fonts, limitations };
}

/* ---------------- text extraction ---------------- */

/** Per-page plain text (TextObject contents in draw order). */
export function extractText(ofd: OfdDocument): string[] {
  return ofd.pages.map((page) => {
    const parts: string[] = [];
    for (const o of page.objects) {
      if (o.kind !== 'text') continue;
      for (const code of o.codes) parts.push(code.text);
    }
    return parts.join('');
  });
}

/**
 * OFD package serializer: page object model to GB/T 33190-2016 XML to ZIP entries.
 *
 * Package layout:
 *   OFD.xml                          entry point (must be the first file in the package)
 *   Doc_0/Document.xml               CommonData(PageArea/MaxUnitID)/Pages/Outlines/VPreferences
 *   Doc_0/PublicRes.xml              color spaces + fonts (BaseLoc="Res")
 *   Doc_0/DocumentRes.xml            image resources (BaseLoc="Res")
 *   Doc_0/Pages/Page_N/Content.xml   page content (Layer/TextObject/PathObject/ImageObject)
 *   Doc_0/Attachments.xml            attachment list
 *   Doc_0/Res/Image_N.*              image files
 *   Doc_0/Attachments/Attach_N/*     attachment files
 */

import type { ImageResource, ImageRun, LinkRun, PageData, PathOp, PathRun, TextRun } from './model';
import type { FontDef } from './metrics';
import { glyphWidth } from './metrics';
import type { FontStyle, OutlineNode, RGB } from './types';
import type { AttachmentData } from './model';
import { MM_PER_PT, escapeXmlAttr, escapeXmlText, fmt, fnv1a, todayStr, utf8Encode } from './utils';
import type { ZipEntry } from './zip';
import { OFD_NAMESPACE, colorValue, xmlHeader } from './xml';

export interface BuildContext {
  pages: PageData[];
  customFonts: Record<string, FontDef>;
  imageList: ImageResource[];
  attachments: AttachmentData[];
  outlineRoot: { children: OutlineNode[] };
  properties: {
    title: string;
    subject: string;
    author: string;
    keywords: string;
    creator: string;
    creatorVersion: string;
  };
  docID: string;
  creationDate: Date;
  modDate: Date | null;
  displayMode: { zoom: number | string; layout: string; pageMode?: string } | null;
  viewerPrefs?: Record<string, boolean>;
  measure(
    text: string,
    fontDef: FontDef,
    style: FontStyle,
    sizePt: number,
    charSpacePt: number,
  ): number;
  getFontDef(key: string): FontDef;
}

interface FontUse {
  key: string;
  style: FontStyle;
  def: FontDef;
  id: number;
  /** File name of the embedded font inside `Doc_0/Res/`, when present. */
  file?: { name: string; data: Uint8Array };
}

const CAP_NAMES = ['Butt', 'Round', 'Square'] as const;
const JOIN_NAMES = ['Miter', 'Round', 'Bevel'] as const;

export function buildOFDPackage(ctx: BuildContext): ZipEntry[] {
  const files: ZipEntry[] = [];
  const xmlFiles: Record<string, string> = {};

  // ---- 1. Collect fonts actually used ----
  const fontsUsed: Record<string, FontUse> = {};
  for (const page of ctx.pages) {
    for (const obj of page.objects) {
      if (obj.t === 'text') {
        const k = `${obj.fontKey}#${obj.style}`;
        if (!fontsUsed[k]) {
          fontsUsed[k] = {
            key: obj.fontKey,
            style: obj.style,
            def: ctx.getFontDef(obj.fontKey),
            id: 0,
          };
        }
      }
    }
  }

  // ---- 2. Assign document-wide unique IDs and collect embedded fonts ----
  let nextId = 1;
  const colorSpaceId = nextId++;
  const embeddedFiles = new Map<string, { name: string; data: Uint8Array }>();
  let embeddedIdx = 0;
  const hashOf = (data: Uint8Array): string => `${data.length}:${fnv1a(data)}`;
  for (const k of Object.keys(fontsUsed)) {
    fontsUsed[k]!.id = nextId++;
    const file = fontsUsed[k]!.def.fontFile;
    if (file) {
      const hash = hashOf(file.data);
      let entry = embeddedFiles.get(hash);
      if (!entry) {
        entry = { name: `Font_${embeddedIdx++}.${file.ext}`, data: file.data };
        embeddedFiles.set(hash, entry);
      }
      fontsUsed[k]!.file = entry;
    }
  }
  for (const img of ctx.imageList) {
    img.resId = nextId++;
  }
  const pageIds = ctx.pages.map(() => nextId++);

  // ---- 3. PublicRes.xml (color spaces + fonts) ----
  {
    let pub = xmlHeader();
    pub += `<ofd:Res xmlns:ofd="${OFD_NAMESPACE}" BaseLoc="Res">\n`;
    pub += `  <ofd:ColorSpaces>\n`;
    pub += `    <ofd:ColorSpace ID="${colorSpaceId}" Type="RGB" BitsPerComponent="8"/>\n`;
    pub += `  </ofd:ColorSpaces>\n`;
    if (Object.keys(fontsUsed).length) {
      pub += `  <ofd:Fonts>\n`;
      for (const fu of Object.values(fontsUsed)) {
        if (fu.file) {
          // Embedded: minimal declaration (matches golden samples from real
          // generators; extra attributes can confuse strict readers).
          pub += `    <ofd:Font ID="${fu.id}" FontName="${escapeXmlAttr(fu.def.familyName)}">\n`;
          if (fu.style === 'bold' || fu.style === 'bolditalic') pub += ` Bold="true"`;
          if (fu.style === 'italic' || fu.style === 'bolditalic') pub += ` Italic="true"`;
          pub += `      <ofd:FontFile>${fu.file.name}</ofd:FontFile>\n`;
          pub += `    </ofd:Font>\n`;
        } else {
          pub += `    <ofd:Font ID="${fu.id}" FontName="${escapeXmlAttr(fu.def.familyName)}" FamilyName="${escapeXmlAttr(fu.def.displayName)}"`;
          pub += ` Serif="${fu.def.serif ? 'true' : 'false'}"`;
          if (fu.def.fixed) pub += ` FixedWidth="true"`;
          pub += ` Charset="unicode"`;
          if (fu.style === 'bold' || fu.style === 'bolditalic') pub += ` Bold="true"`;
          if (fu.style === 'italic' || fu.style === 'bolditalic') pub += ` Italic="true"`;
          pub += `/>\n`;
        }
      }
      pub += `  </ofd:Fonts>\n`;
    }
    pub += `</ofd:Res>\n`;
    xmlFiles['Doc_0/PublicRes.xml'] = pub;
  }

  // ---- 4. DocumentRes.xml (images) ----
  if (ctx.imageList.length) {
    let dres = xmlHeader();
    dres += `<ofd:Res xmlns:ofd="${OFD_NAMESPACE}" BaseLoc="Res">\n`;
    dres += `  <ofd:MultiMedias>\n`;
    ctx.imageList.forEach((img, idx) => {
      dres += `    <ofd:MultiMedia ID="${img.resId}" Type="Image" Format="${img.format}">\n`;
      dres += `      <ofd:MediaFile>Image_${idx}.${img.ext}</ofd:MediaFile>\n`;
      dres += `    </ofd:MultiMedia>\n`;
    });
    dres += `  </ofd:MultiMedias>\n`;
    dres += `</ofd:Res>\n`;
    xmlFiles['Doc_0/DocumentRes.xml'] = dres;
  }

  // ---- 5. Per-page Content.xml ----
  let maxUnitId = nextId - 1;
  ctx.pages.forEach((page, idx) => {
    const layerId = nextId++;
    maxUnitId = Math.max(maxUnitId, layerId);
    let content = xmlHeader();
    content += `<ofd:Page xmlns:ofd="${OFD_NAMESPACE}">\n`;
    // Pages sized differently from the first override the page area
    if (page.width !== ctx.pages[0]!.width || page.height !== ctx.pages[0]!.height) {
      content += `  <ofd:Area>\n`;
      content += `    <ofd:PhysicalBox>0 0 ${fmt(page.width * MM_PER_PT)} ${fmt(page.height * MM_PER_PT)}</ofd:PhysicalBox>\n`;
      content += `  </ofd:Area>\n`;
    }
    content += `  <ofd:Content>\n`;
    content += `    <ofd:Layer ID="${layerId}">\n`;
    for (const obj of page.objects) {
      content += objectXml(ctx, fontsUsed, obj, colorSpaceId, pageIds, () => nextId++);
    }
    content += `    </ofd:Layer>\n`;
    content += `  </ofd:Content>\n`;
    content += `</ofd:Page>\n`;
    xmlFiles[`Doc_0/Pages/Page_${idx}/Content.xml`] = content;
  });
  maxUnitId = Math.max(maxUnitId, nextId - 1);

  // ---- 6. Document.xml ----
  {
    const w0 = fmt(ctx.pages[0]!.width * MM_PER_PT);
    const h0 = fmt(ctx.pages[0]!.height * MM_PER_PT);
    let doc = xmlHeader();
    doc += `<ofd:Document xmlns:ofd="${OFD_NAMESPACE}">\n`;
    doc += `  <ofd:CommonData>\n`;
    doc += `    <ofd:MaxUnitID>${maxUnitId}</ofd:MaxUnitID>\n`;
    doc += `    <ofd:PageArea>\n`;
    doc += `      <ofd:PhysicalBox>0 0 ${w0} ${h0}</ofd:PhysicalBox>\n`;
    doc += `      <ofd:ApplicationBox>0 0 ${w0} ${h0}</ofd:ApplicationBox>\n`;
    doc += `    </ofd:PageArea>\n`;
    doc += `    <ofd:PublicRes>PublicRes.xml</ofd:PublicRes>\n`;
    if (ctx.imageList.length) {
      doc += `    <ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>\n`;
    }
    doc += `  </ofd:CommonData>\n`;
    doc += `  <ofd:Pages>\n`;
    ctx.pages.forEach((_page, idx) => {
      doc += `    <ofd:Page ID="${pageIds[idx]}" BaseLoc="Pages/Page_${idx}/Content.xml"/>\n`;
    });
    doc += `  </ofd:Pages>\n`;
    if (ctx.outlineRoot.children.length) {
      doc += `  <ofd:Outlines>\n`;
      doc += outlineXml(ctx.outlineRoot.children, pageIds, '    ', () => nextId++);
      doc += `  </ofd:Outlines>\n`;
      maxUnitId = Math.max(maxUnitId, nextId - 1);
    }
    if (ctx.displayMode || Object.keys(ctx.viewerPrefs || {}).length) {
      doc += `  <ofd:VPreferences>\n`;
      const pm = ctx.displayMode?.pageMode;
      const pageMode = pm
        ? pm === 'UseNone'
          ? 'None'
          : pm
        : ctx.outlineRoot.children.length
          ? 'UseOutlines'
          : 'None';
      doc += `    <ofd:PageMode>${pageMode}</ofd:PageMode>\n`;
      const layoutMap: Record<string, string> = {
        continuous: 'OneColumn',
        single: 'OnePage',
        twoleft: 'TwoPageL',
        tworight: 'TwoPageR',
        two: 'TwoPageL',
      };
      if (ctx.displayMode) {
        doc += `    <ofd:PageLayout>${layoutMap[ctx.displayMode.layout] || 'OneColumn'}</ofd:PageLayout>\n`;
        const zoomMap: Record<string, string> = {
          fullheight: 'FitHeight',
          fullwidth: 'FitWidth',
          fullpage: 'FitRect',
          original: 'Default',
        };
        const z = ctx.displayMode.zoom;
        if (typeof z === 'number') {
          doc += `    <ofd:Zoom>${fmt(z)}</ofd:Zoom>\n`;
        } else if (zoomMap[z]) {
          doc += `    <ofd:ZoomMode>${zoomMap[z]}</ofd:ZoomMode>\n`;
        } else if (typeof z === 'string' && /^\d+(\.\d+)?%$/.test(z)) {
          // jsPDF '200%' means 2x
          doc += `    <ofd:Zoom>${fmt(parseFloat(z) / 100)}</ofd:Zoom>\n`;
        }
      }
      // viewerPreferences (jsPDF-compatible)
      for (const k of ['HideToolbar', 'HideMenubar', 'HideWindowUI', 'FitWindow']) {
        if (ctx.viewerPrefs?.[k]) doc += `    <ofd:${k}>true</ofd:${k}>\n`;
      }
      doc += `  </ofd:VPreferences>\n`;
    }
    if (ctx.attachments.length) {
      doc += `  <ofd:Attachments>Attachments.xml</ofd:Attachments>\n`;
    }
    doc += `</ofd:Document>\n`;
    xmlFiles['Doc_0/Document.xml'] = doc;
  }

  // ---- 7. OFD.xml (entry point) ----
  {
    const p = ctx.properties;
    let ofd = xmlHeader();
    ofd += `<ofd:OFD xmlns:ofd="${OFD_NAMESPACE}" Version="1.0" DocType="OFD">\n`;
    ofd += `  <ofd:DocBody>\n`;
    ofd += `    <ofd:DocInfo>\n`;
    ofd += `      <ofd:DocID>${ctx.docID}</ofd:DocID>\n`;
    if (p.title) ofd += `      <ofd:Title>${escapeXmlText(p.title)}</ofd:Title>\n`;
    if (p.author) ofd += `      <ofd:Author>${escapeXmlText(p.author)}</ofd:Author>\n`;
    if (p.subject) ofd += `      <ofd:Subject>${escapeXmlText(p.subject)}</ofd:Subject>\n`;
    if (p.keywords) ofd += `      <ofd:Keywords>${escapeXmlText(p.keywords)}</ofd:Keywords>\n`;
    ofd += `      <ofd:Creator>${escapeXmlText(p.creator)}</ofd:Creator>\n`;
    if (p.creatorVersion)
      ofd += `      <ofd:CreatorVersion>${escapeXmlText(p.creatorVersion)}</ofd:CreatorVersion>\n`;
    ofd += `      <ofd:CreationDate>${todayStr(ctx.creationDate)}</ofd:CreationDate>\n`;
    ofd += `      <ofd:ModDate>${todayStr(ctx.modDate || ctx.creationDate)}</ofd:ModDate>\n`;
    ofd += `    </ofd:DocInfo>\n`;
    ofd += `    <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>\n`;
    ofd += `  </ofd:DocBody>\n`;
    ofd += `</ofd:OFD>\n`;
    xmlFiles['OFD.xml'] = ofd;
  }

  // ---- 8. Attachments.xml + attachment files ----
  if (ctx.attachments.length) {
    let att = xmlHeader();
    att += `<ofd:Attachments xmlns:ofd="${OFD_NAMESPACE}">\n`;
    ctx.attachments.forEach((a, i) => {
      att += `  <ofd:Attachment ID="${i + 1}" Name="${escapeXmlAttr(a.name)}"`;
      if (a.format) att += ` Format="${escapeXmlAttr(a.format)}"`;
      att += ` CreationDate="${todayStr(a.creationDate)}" Size="${(a.data.length / 1024).toFixed(6)}">\n`;
      att += `    <ofd:FileLoc>/Doc_0/Attachments/Attach_${i}/${escapeXmlText(a.name)}</ofd:FileLoc>\n`;
      att += `  </ofd:Attachment>\n`;
      files.push({
        name: `Doc_0/Attachments/Attach_${i}/${a.name}`,
        data: a.data,
      });
    });
    att += `</ofd:Attachments>\n`;
    xmlFiles['Doc_0/Attachments.xml'] = att;
  }

  // ---- 9. image files ----
  ctx.imageList.forEach((img, idx) => {
    files.push({ name: `Doc_0/Res/Image_${idx}.${img.ext}`, data: img.data });
  });

  // ---- 9b. Embedded font files ----
  for (const entry of embeddedFiles.values()) {
    files.push({ name: `Doc_0/Res/${entry.name}`, data: entry.data });
  }

  // ---- 10. Assemble (OFD.xml must be the first entry) ----
  const preferredOrder = [
    'OFD.xml',
    'Doc_0/Document.xml',
    'Doc_0/PublicRes.xml',
    'Doc_0/DocumentRes.xml',
    'Doc_0/Attachments.xml',
  ];
  const names = Object.keys(xmlFiles);
  names.sort((a, b) => {
    const ia = preferredOrder.indexOf(a);
    const ib = preferredOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a < b ? -1 : a > b ? 1 : 0; // Pages/Page_0... lexicographic order equals page order
  });
  const zipFiles: ZipEntry[] = [];
  for (const name of names) {
    zipFiles.push({ name, data: utf8Encode(xmlFiles[name]!) });
  }
  for (const f of files) zipFiles.push(f);
  return zipFiles;
}

/* ====================================================================
 * Object serialization
 * ==================================================================== */

type AllocId = () => number;

function colorEl(name: 'FillColor' | 'StrokeColor', rgb: RGB, csId: number): string {
  return `      <ofd:${name} Value="${colorValue(rgb)}" ColorSpace="${csId}"/>\n`;
}

function objectXml(
  ctx: BuildContext,
  fontsUsed: Record<string, FontUse>,
  obj: PageData['objects'][number],
  colorSpaceId: number,
  pageIds: number[],
  allocId: AllocId,
): string {
  switch (obj.t) {
    case 'text':
      return textObjectXml(ctx, fontsUsed, obj, colorSpaceId, allocId);
    case 'path':
      return pathObjectXml(obj, colorSpaceId, allocId);
    case 'image':
      return imageObjectXml(obj, colorSpaceId, allocId);
    case 'link':
      return linkObjectXml(obj, colorSpaceId, allocId, pageIds);
  }
  return '';
}

function textObjectXml(
  ctx: BuildContext,
  fontsUsed: Record<string, FontUse>,
  obj: TextRun,
  colorSpaceId: number,
  allocId: AllocId,
): string {
  // A 2-glyph run serialises to a single-entry DeltaX ("1.5") — no spaces —
  // and some readers then parse it as a scalar instead of an array, apply no
  // per-glyph offsets and stack both glyphs on the run origin. Split such
  // runs into two absolutely positioned single-glyph objects: no DeltaX, so
  // there is nothing to mis-parse. (Runs with ≥3 glyphs emit ≥2 DeltaX
  // entries, which every reader treats as an array.)
  if (
    obj.glyphWs &&
    obj.glyphWs.length === 2 &&
    obj.text.length === 2 &&
    obj.glyphWs.every((w) => Number.isFinite(w)) &&
    !obj.angle &&
    !(obj.hScale && obj.hScale !== 1) &&
    obj.justifyWidth === null
  ) {
    const [w0, w1] = obj.glyphWs;
    const first: TextRun = { ...obj, text: obj.text[0]!, glyphWs: [w0!] };
    const second: TextRun = {
      ...obj,
      x: obj.x + w0! + obj.charSpace,
      text: obj.text[1]!,
      glyphWs: [w1!],
    };
    return (
      textObjectXml(ctx, fontsUsed, first, colorSpaceId, allocId) +
      textObjectXml(ctx, fontsUsed, second, colorSpaceId, allocId)
    );
  }
  const M = MM_PER_PT;
  const id = allocId();
  const fu = fontsUsed[`${obj.fontKey}#${obj.style}`];
  if (!fu) return '';

  const { x, y } = obj; // baseline origin (pt)
  const hS = obj.hScale && obj.hScale !== 1 ? obj.hScale : 1;
  const naturalWidth = obj.glyphWs
    ? obj.glyphWs.reduce((s, w) => s + w, 0) + obj.charSpace * Math.max(obj.text.length - 1, 0)
    : ctx.measure(obj.text, fu.def, obj.style, obj.size, obj.charSpace);
  // Readers clip to Boundary: with DeltaX-pinned runs the last glyph still
  // advances by its own width in the embedded font, which can exceed the
  // pinned sum — reserve the wider of the two.
  const wPt = Math.max(
    naturalWidth,
    ctx.measure(obj.text, fu.def, obj.style, obj.size, obj.charSpace),
  );
  const wEff = wPt * hS; // effective width after horizontal scaling
  // Boundary metrics MUST come from the font that will be rendered at
  // serialisation time (fu.def), not from the values captured on the run —
  // PDF-import captures builtin approximations before the caller registers
  // the embedded fonts, and the reader draws with the embedded metrics
  // (ascent 1151 vs builtin 880 for Noto Serif SC ⇒ top-clipped otherwise).
  // obj.descent is negative (below baseline); desc is its magnitude.
  const asc = (fu.def.ascent / 1000) * obj.size;
  const desc = (-fu.def.descent / 1000) * obj.size;

  let bx: number, by: number, bw: number, bh: number;
  let ctm: number[] | null = null;
  let textCodeX = 0;
  let textCodeY: number;

  if (obj.angle || hS !== 1) {
    // Rotation / horizontal scale: local origin is the baseline start; page = TL + CTM * local
    const rad = (obj.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners: [number, number][] = [
      [0, -asc],
      [wEff, -asc],
      [wEff, desc],
      [0, desc],
    ];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [px0, py0] of corners) {
      const px = x + hS * (px0 * cos) - py0 * sin;
      const py = y + hS * (px0 * sin) + py0 * cos;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    // Expand bounding box (same safety margin idea as unrotated): readers may
    // substitute a fallback font for missing glyphs, whose vertical metrics
    // can exceed the embedded font's — pad generously on every side.
    const pad = (asc + desc) * 0.18;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
    bx = minX;
    by = minY;
    bw = Math.max(maxX - minX, 0.01);
    bh = Math.max(maxY - minY, 0.01);
    // CTM translation components are page units (mm); linear parts are unitless
    ctm = [hS * cos, hS * sin, -sin, cos, (x - bx) * M, (y - by) * M];
    textCodeX = 0;
    textCodeY = 0;
  } else {
    bx = x;
    const ascPadded = asc * 1.08;
    by = y - ascPadded;
    bw = Math.max(wPt, 0.01);
    // Readers clip to Boundary. Beyond the font's own ascent/descent, leave
    // deep headroom below the baseline: substituted fallback fonts (and
    // renderer-specific line metrics) routinely descend further than hhea.
    // Floor at 1.4em: fonts with small declared metrics (Courier 0.63em
    // ascent) would otherwise under-serve substituted glyphs.
    bh = Math.max(ascPadded + desc * 2.2, obj.size * 1.4);
    textCodeY = ascPadded;
  }

  let xml = `      <ofd:TextObject ID="${id}"`;
  xml += ` Boundary="${fmt(bx * M)} ${fmt(by * M)} ${fmt(bw * M)} ${fmt(bh * M)}"`;
  xml += ` Font="${fu.id}"`;
  xml += ` Size="${fmt(obj.size * M)}"`;
  if (ctm) xml += ` CTM="${ctm.map((v) => fmt(v)).join(' ')}"`;
  if (obj.style === 'bold' || obj.style === 'bolditalic') xml += ` Weight="700"`;
  if (obj.style === 'italic' || obj.style === 'bolditalic') xml += ` Italic="true"`;
  // Fill/Stroke are always explicit: readers differ on the defaults when the
  // attributes are absent, and a fill+stroke double draw reads as smeared,
  // faux-bold text.
  if (obj.renderingMode === 'stroke') xml += ` Fill="false" Stroke="true"`;
  else if (obj.renderingMode === 'fillThenStroke') xml += ` Fill="true" Stroke="true"`;
  else if (obj.renderingMode === 'invisible') xml += ` Visible="false"`;
  else xml += ` Fill="true" Stroke="false"`;
  if (obj.opacity !== null && obj.opacity < 1) {
    xml += ` Alpha="${Math.round(obj.opacity * 255)}"`;
  }
  xml += `>\n`;
  if (obj.renderingMode === 'stroke' || obj.renderingMode === 'fillThenStroke') {
    xml += colorEl('StrokeColor', obj.color, colorSpaceId);
  }
  xml += colorEl('FillColor', obj.color, colorSpaceId);

  // DeltaX: per-glyph advances (char spacing / justification) pin the layout width
  let deltaAttr = '';
  if (obj.text.length > 1) {
    const deltas: string[] = [];
    let extra = 0;
    if (obj.justifyWidth !== null) {
      const natural = obj.glyphWs
        ? obj.glyphWs.reduce((s, w) => s + w, 0) + obj.charSpace * Math.max(obj.text.length - 1, 0)
        : ctx.measure(obj.text, fu.def, obj.style, obj.size, obj.charSpace);
      extra = (obj.justifyWidth - natural) / (obj.text.length - 1);
    }
    for (let i = 0; i < obj.text.length - 1; i++) {
      const adv = obj.glyphWs
        ? obj.glyphWs[i]! + obj.charSpace + extra
        : (glyphWidth(fu.def, obj.style, obj.text.charAt(i)) / 1000) * obj.size +
          obj.charSpace +
          extra;
      deltas.push(fmt(adv * M));
    }
    deltaAttr = ` DeltaX="${deltas.join(' ')}"`;
  }

  xml += `        <ofd:TextCode X="${fmt(textCodeX * M)}" Y="${fmt(textCodeY * M)}"${deltaAttr}>`;
  xml += `${escapeXmlText(obj.text)}</ofd:TextCode>\n`;
  xml += `      </ofd:TextObject>\n`;
  return xml;
}

function pathBoundary(ops: PathOp[], stroke: boolean, lineWidth: number) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const pad = stroke ? lineWidth / 2 : 0;
  const consider = (x: number, y: number) => {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  };
  for (const op of ops) {
    if (op.op === 'M' || op.op === 'L') consider(op.x, op.y);
    else if (op.op === 'C') {
      consider(op.x1, op.y1);
      consider(op.x2, op.y2);
      consider(op.x, op.y);
    }
  }
  return { bx: minX, by: minY, bw: maxX - minX, bh: maxY - minY };
}

function pathObjectXml(obj: PathRun, colorSpaceId: number, allocId: AllocId): string {
  const M = MM_PER_PT;
  const id = allocId();
  const { bx, by, bw, bh } = pathBoundary(obj.ops, obj.stroke, obj.lineWidth);
  if (!isFinite(bx)) return ''; // empty path

  let xml = `      <ofd:PathObject ID="${id}"`;
  xml += ` Boundary="${fmt(bx * M)} ${fmt(by * M)} ${fmt(Math.max(bw, 0.01) * M)} ${fmt(Math.max(bh, 0.01) * M)}"`;
  xml += ` Fill="${obj.fill ? 'true' : 'false'}"`;
  xml += ` Stroke="${obj.stroke ? 'true' : 'false'}"`;
  if (obj.stroke) {
    xml += ` LineWidth="${fmt(obj.lineWidth * M)}"`;
    if (obj.cap) xml += ` Cap="${CAP_NAMES[obj.cap] || 'Butt'}"`;
    if (obj.join) xml += ` Join="${JOIN_NAMES[obj.join] || 'Miter'}"`;
    if (obj.miterLimit > 1) xml += ` MiterLimit="${fmt(obj.miterLimit * M)}"`;
    if (obj.dash && obj.dash.pattern.length) {
      xml += ` DashPattern="${obj.dash.pattern.map((v) => fmt(v * M)).join(' ')}"`;
      if (obj.dash.phase) xml += ` DashOffset="${fmt(obj.dash.phase * M)}"`;
    }
  }
  if (obj.opacity !== null && obj.opacity < 1) {
    xml += ` Alpha="${Math.round(obj.opacity * 255)}"`;
  }
  xml += `>\n`;
  if (obj.fill) xml += colorEl('FillColor', obj.fillColor, colorSpaceId);
  if (obj.stroke) xml += colorEl('StrokeColor', obj.strokeColor, colorSpaceId);

  const d: string[] = [];
  for (const op of obj.ops) {
    switch (op.op) {
      case 'M':
        d.push(`M ${fmt((op.x - bx) * M)} ${fmt((op.y - by) * M)}`);
        break;
      case 'L':
        d.push(`L ${fmt((op.x - bx) * M)} ${fmt((op.y - by) * M)}`);
        break;
      case 'C':
        // OFD abbreviated paths: cubic Bezier is B (C closes)
        d.push(
          `B ${fmt((op.x1 - bx) * M)} ${fmt((op.y1 - by) * M)} ${fmt((op.x2 - bx) * M)} ${fmt((op.y2 - by) * M)} ${fmt((op.x - bx) * M)} ${fmt((op.y - by) * M)}`,
        );
        break;
      case 'Z':
        d.push('C');
        break;
    }
  }
  xml += `        <ofd:AbbreviatedData>${d.join(' ')} </ofd:AbbreviatedData>\n`;
  xml += `      </ofd:PathObject>\n`;
  return xml;
}

function imageObjectXml(obj: ImageRun, _colorSpaceId: number, allocId: AllocId): string {
  const M = MM_PER_PT;
  const id = allocId();
  const img = obj.imageRef;
  if (!img) return '';

  // OFD image content lives in the unit square (0,0)-(1,1); a CTM must map it to the page size
  const w = obj.w * M;
  const h = obj.h * M;
  const rad = ((obj.angle || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  if (!obj.angle) {
    // Unrotated: Boundary is the image rectangle; the CTM only scales
    const bx = obj.x * M;
    const by = obj.y * M;
    let xml = `      <ofd:ImageObject ID="${id}"`;
    xml += ` Boundary="${fmt(bx)} ${fmt(by)} ${fmt(Math.max(w, 0.01))} ${fmt(Math.max(h, 0.01))}"`;
    xml += ` ResourceID="${img.resId}"`;
    xml += ` CTM="${fmt(w)} 0 0 ${fmt(h)} 0 0"`;
    if (obj.opacity !== null && obj.opacity < 1) {
      xml += ` Alpha="${Math.round(obj.opacity * 255)}"`;
    }
    xml += `/>\n`;
    return xml;
  }

  // Rotated: Boundary is the rotated bounding box; CTM scales the unit square, rotates around the center, offsets from the Boundary top-left
  const cx = (obj.x + obj.w / 2) * M;
  const cy = (obj.y + obj.h / 2) * M;
  const corners: [number, number][] = [
    [obj.x, obj.y],
    [obj.x + obj.w, obj.y],
    [obj.x + obj.w, obj.y + obj.h],
    [obj.x, obj.y + obj.h],
  ];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [px0, py0] of corners) {
    const px = cx + (px0 * M - cx) * cos - (py0 * M - cy) * sin;
    const py = cy + (px0 * M - cx) * sin + (py0 * M - cy) * cos;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  const bx = minX;
  const by = minY;
  const bw = Math.max(maxX - minX, 0.01);
  const bh = Math.max(maxY - minY, 0.01);
  // page = BoundaryTL + CTM * unit_square: scale to w*h, rotate around the center, translate
  const e = cx - (cos * w) / 2 + (sin * h) / 2 - bx;
  const f = cy - (sin * w) / 2 - (cos * h) / 2 - by;
  const ctm = [cos * w, sin * w, -sin * h, cos * h, e, f];

  let xml = `      <ofd:ImageObject ID="${id}"`;
  xml += ` Boundary="${fmt(bx)} ${fmt(by)} ${fmt(bw)} ${fmt(bh)}"`;
  xml += ` ResourceID="${img.resId}"`;
  xml += ` CTM="${ctm.map((v) => fmt(v)).join(' ')}"`;
  if (obj.opacity !== null && obj.opacity < 1) {
    xml += ` Alpha="${Math.round(obj.opacity * 255)}"`;
  }
  xml += `/>\n`;
  return xml;
}

function gotoActionXml(pageId: number, indent: string): string {
  return (
    `${indent}<ofd:Actions>\n` +
    `${indent}  <ofd:Action Event="Click">\n` +
    `${indent}    <ofd:Goto>\n` +
    `${indent}      <ofd:Dest Type="XYZ" PageID="${pageId}">\n` +
    `${indent}        <ofd:Left>0</ofd:Left>\n` +
    `${indent}        <ofd:Top>0</ofd:Top>\n` +
    `${indent}        <ofd:Zoom>0</ofd:Zoom>\n` +
    `${indent}      </ofd:Dest>\n` +
    `${indent}    </ofd:Goto>\n` +
    `${indent}  </ofd:Action>\n` +
    `${indent}</ofd:Actions>\n`
  );
}

function linkObjectXml(
  obj: LinkRun,
  colorSpaceId: number,
  allocId: AllocId,
  pageIds: number[],
): string {
  // Invisible rectangular path + Actions (the Boundary is the click area, cf. clauses 9.3/13.2)
  let action = '';
  if (obj.url) {
    action =
      `        <ofd:Actions>\n` +
      `          <ofd:Action Event="Click">\n` +
      `            <ofd:URI URI="${escapeXmlAttr(obj.url)}"/>\n` +
      `          </ofd:Action>\n` +
      `        </ofd:Actions>\n`;
  } else if (obj.pageNumber && pageIds[obj.pageNumber - 1]) {
    action = gotoActionXml(pageIds[obj.pageNumber - 1]!, '        ');
  }
  if (!action) return '';

  const pathObj: PathRun = {
    t: 'path',
    miterLimit: 0,
    ops: [
      { op: 'M', x: obj.x, y: obj.y },
      { op: 'L', x: obj.x + obj.w, y: obj.y },
      { op: 'L', x: obj.x + obj.w, y: obj.y + obj.h },
      { op: 'L', x: obj.x, y: obj.y + obj.h },
      { op: 'Z' },
    ],
    fill: false,
    stroke: false,
    fillColor: [0, 0, 0],
    strokeColor: [0, 0, 0],
    lineWidth: 0,
    dash: null,
    cap: 0,
    join: 0,
    opacity: null,
  };
  const xml = pathObjectXml(pathObj, colorSpaceId, allocId);
  return xml.replace('      </ofd:PathObject>\n', action + '      </ofd:PathObject>\n');
}

function outlineXml(
  nodes: OutlineNode[],
  pageIds: number[],
  indent: string,
  allocId: () => number,
): string {
  let out = '';
  for (const n of nodes) {
    const pageNo = n.options.pageNumber || 1;
    const pageId = pageIds[pageNo - 1] || pageIds[0]!;
    out += `${indent}<ofd:Outline ID="${allocId()}" Title="${escapeXmlAttr(n.title)}">\n`;
    out += gotoActionXml(pageId, indent + '  ');
    if (n.children.length) {
      out += outlineXml(n.children, pageIds, indent + '  ', allocId);
    }
    out += `${indent}</ofd:Outline>\n`;
  }
  return out;
}

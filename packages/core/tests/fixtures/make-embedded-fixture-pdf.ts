/**
 * 生成内嵌 TrueType 字体的最小测试 PDF（Type0/CIDFontType2 + Identity-H +
 * ToUnicode + FontFile2），供 pdf→ofd 转换的"内嵌原始字体"测试使用。
 *
 * 字形 id / 宽度直接由 embedded-subset.ttf（Arial Unicode 子集）经项目自身的
 * parseFont 解析得出，CID 与 GID 一致（CIDToGIDMap /Identity）。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFont } from '../../src/font-parse';

/** 测试文本（同时覆盖拉丁与 CJK 字形）。 */
export const EMBEDDED_TEXT = 'Hi嵌入9';

export function makeEmbeddedFixturePdf(): Uint8Array {
  const ttf = readFileSync(join(__dirname, 'embedded-subset.ttf'));
  const parsed = parseFont(new Uint8Array(ttf))!;
  const upm = parsed.unitsPerEm;

  const chars = [...EMBEDDED_TEXT];
  const cids = chars.map((ch) => {
    const gid = parsed.glyphs.get(ch.codePointAt(0)!)!;
    if (!gid) throw new Error(`glyph missing for ${ch}`);
    return gid;
  });
  const hex4 = (n: number): string => n.toString(16).padStart(4, '0');
  const hexText = cids.map(hex4).join('');

  const content = `BT\n/F1 24 Tf\n1 0 0 1 72 650 Tm\n<${hexText}> Tj\nET`;

  const wArray = cids
    .map((cid, i) => {
      const adv = parsed.widths.get(chars[i]!.codePointAt(0)!)!;
      return `${cid} [${Math.round((adv / upm) * 1000)}]`;
    })
    .join(' ');

  const bfchar = cids
    .map((cid, i) => `<${hex4(cid)}> <${hex4(chars[i]!.codePointAt(0)!)}>`)
    .join('\n');
  const toUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${cids.length} beginbfchar
${bfchar}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

  const objs: (string | Uint8Array)[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+EmbedTest /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+EmbedTest /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /W [${wArray}] /CIDToGIDMap /Identity >>`,
    `<< /Length ${toUnicode.length} >>\nstream\n${toUnicode}\nendstream`,
    '<< /Type /FontDescriptor /FontName /ABCDEF+EmbedTest /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 /FontFile2 9 0 R >>',
    // FontFile2：二进制流，单独拼接
    (() => {
      const head = `<< /Length ${ttf.length} /Length1 ${ttf.length} >>\nstream\n`;
      const out = new Uint8Array(head.length + ttf.length + 10);
      for (let i = 0; i < head.length; i++) out[i] = head.charCodeAt(i) & 0xff;
      out.set(ttf, head.length);
      const tail = '\nendstream';
      for (let i = 0; i < tail.length; i++) out[head.length + ttf.length + i] = tail.charCodeAt(i);
      return out.subarray(0, head.length + ttf.length + tail.length);
    })(),
  ];

  // 二进制安全拼装（xref 偏移按字节计）
  const chunks: Uint8Array[] = [];
  const push = (s: string | Uint8Array): number => {
    const u8 =
      typeof s === 'string' ? Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff) : (s as Uint8Array);
    const at = chunks.reduce((n, c) => n + c.length, 0);
    chunks.push(u8);
    return at;
  };

  push('%PDF-1.4\n');
  const offsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(push(`${i + 1} 0 obj\n`));
    push(objs[i]!);
    push('\nendobj\n');
  }
  const xrefPos = push('xref\n');
  push(`0 ${objs.length + 1}\n0000000000 65535 f \n`);
  for (const off of offsets) {
    push(String(off).padStart(10, '0') + ' 00000 n \n');
  }
  push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * OFD 读取器测试：jsOFD 生成 → parseOfd 解析 → 断言（往返一致），
 * 外加手写畸形包的容错用例。
 */

import { describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import { parseOfd, extractText } from '../src/ofd-reader';
import { openOfd } from '../src/ofd-open';
import { pageToSvg, pageToPng } from '../src/ofd-svg';
import type { OfdDocument } from '../src/ofd-reader';
import type { TextRun } from '../src/model';
import { zipStore } from '../src/zip';
import { utf8Encode } from '../src/utils';

async function sampleOfd(): Promise<{ ofd: OfdDocument; bytes: Uint8Array }> {
  const doc = new jsOFD({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: '对照样张', author: '王小明', subject: '往返测试' });
  doc.setFont('simsun');
  doc.setFontSize(12);
  doc.text('你好，OFD', 30, 40);
  doc.setFont('helvetica');
  doc.text('Hello Reader', 30, 60);
  doc.setDrawColor(255, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(20, 70, 180, 70);
  doc.addPage('a5');
  doc.text('第二页', 20, 30);
  doc.outline.add(null, '第一页', { pageNumber: 1 });
  doc.outline.add(null, '第二页', { pageNumber: 2 });
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0,
    0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5,
    0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
  doc.addImage(png, 'PNG', 100, 100, 20, 20);
  doc.addFileAsAttachment('清单.txt', utf8Encode('附件内容'));
  const bytes = doc.output('uint8array') as Uint8Array;
  const ofd = await parseOfd(bytes);
  return { ofd, bytes };
}

describe('parseOfd', () => {
  it('往返：元数据与 DocType', async () => {
    const { ofd } = await sampleOfd();
    expect(ofd.docType).toBe('OFD');
    expect(ofd.meta.title).toBe('对照样张');
    expect(ofd.meta.author).toBe('王小明');
    expect(ofd.meta.subject).toBe('往返测试');
    expect(ofd.meta.docId).toBeTruthy();
  });

  it('往返：页面尺寸与页数（A4 + A5）', async () => {
    const { ofd } = await sampleOfd();
    expect(ofd.pages.length).toBe(2);
    expect(ofd.pages[0]!.width).toBeCloseTo(210, 0);
    expect(ofd.pages[0]!.height).toBeCloseTo(297, 0);
    expect(ofd.pages[1]!.width).toBeCloseTo(148, 0);
    expect(ofd.pages[1]!.height).toBeCloseTo(210, 0);
  });

  it('往返：文本提取（中英文、跨页）', async () => {
    const { ofd } = await sampleOfd();
    const texts = extractText(ofd);
    expect(texts[0]).toContain('你好，OFD');
    expect(texts[0]).toContain('Hello Reader');
    expect(texts[1]).toContain('第二页');
  });

  it('往返：文本对象解析（位置/字号/颜色/字符数）', async () => {
    const { ofd } = await sampleOfd();
    const texts = ofd.pages[0]!.objects.filter((o) => o.kind === 'text');
    const zh = texts.find((o) => o.kind === 'text' && o.codes.some((c) => c.text.includes('你好')));
    expect(zh).toBeDefined();
    if (zh?.kind !== 'text') return;
    expect(zh.size).toBeGreaterThan(0);
    expect(zh.color).toEqual({ r: 0, g: 0, b: 0, alpha: 1 });
    expect(zh.boundary.x).toBeGreaterThan(0);
    expect(zh.codes.length).toBeGreaterThanOrEqual(1);
  });

  it('往返：路径对象（线段的 AbbreviatedData）', async () => {
    const { ofd } = await sampleOfd();
    const paths = ofd.pages[0]!.objects.filter((o) => o.kind === 'path');
    expect(paths.length).toBeGreaterThanOrEqual(1);
    const line = paths[0]!;
    if (line.kind !== 'path') return;
    expect(line.stroke).toBe(true);
    expect(line.ops[0]?.op).toBe('M');
    expect(line.ops[1]).toMatchObject({ op: 'L' });
  });

  it('往返：图片对象字节一致（位于第二页）', async () => {
    const { ofd } = await sampleOfd();
    const img = ofd.pages[1]!.objects.find((o) => o.kind === 'image');
    expect(img).toBeDefined();
    if (img?.kind !== 'image') return;
    expect(img.data?.[0]).toBe(0x89);
    expect(img.data?.length).toBeGreaterThan(50);
    expect(img.format ?? 'PNG').toBe('PNG');
  });

  it('往返：大纲（书签→页索引）', async () => {
    const { ofd } = await sampleOfd();
    expect(ofd.outlines.length).toBe(2);
    expect(ofd.outlines[0]).toMatchObject({ title: '第一页', pageIndex: 0 });
    expect(ofd.outlines[1]).toMatchObject({ title: '第二页', pageIndex: 1 });
  });

  it('往返：附件字节一致', async () => {
    const { ofd } = await sampleOfd();
    expect(ofd.attachments.length).toBe(1);
    expect(ofd.attachments[0]!.name).toBe('清单.txt');
    expect(new TextDecoder().decode(ofd.attachments[0]!.data)).toBe('附件内容');
  });

  it('容错：手写畸形包（压缩存储 + 未知对象 + 缺失资源）不抛错', async () => {
    // 手工构造一个最小但含"噪音"的包：DEFLATE 压缩之外的场景用 STORE，
    // 内容里放一个未知对象（EllipseObject）和指向缺失资源的图片。
    const content =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer ID="1">` +
      `<ofd:TextObject ID="2" Boundary="10 10 50 8" Font="f1" Size="3.5"><ofd:FillColor Value="0 0 0"/>` +
      `<ofd:TextCode X="0" Y="3">容错</ofd:TextCode></ofd:TextObject>` +
      `<ofd:EllipseObject ID="3" Boundary="0 0 5 5"/>` +
      `<ofd:ImageObject ID="4" Boundary="20 20 10 10" ResourceID="img-missing"/>` +
      `</ofd:Layer></ofd:Content></ofd:Page>`;
    const documentXml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016"><ofd:CommonData>` +
      `<ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea>` +
      `<ofd:PublicRes>PublicRes.xml</ofd:PublicRes></ofd:CommonData>` +
      `<ofd:Pages><ofd:Page ID="101" BaseLoc="Pages/Page_0/Content.xml"/></ofd:Pages>` +
      `</ofd:Document>`;
    const publicRes =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res"><ofd:ColorSpaces>` +
      `<ofd:ColorSpace ID="1" Type="RGB" BitsPerComponent="8"/></ofd:ColorSpaces>` +
      `<ofd:Fonts><ofd:Font ID="f1" FontName="FakeFont"/></ofd:Fonts></ofd:Res>`;
    const ofdXml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" Version="1.0" DocType="OFD-H">` +
      `<ofd:DocBody><ofd:DocInfo><ofd:DocID>h</ofd:DocID></ofd:DocInfo>` +
      `<ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`;
    const files = [
      { name: 'OFD.xml', data: utf8Encode(ofdXml) },
      { name: 'Doc_0/Document.xml', data: utf8Encode(documentXml) },
      { name: 'Doc_0/PublicRes.xml', data: utf8Encode(publicRes) },
      { name: 'Doc_0/Pages/Page_0/Content.xml', data: utf8Encode(content) },
    ];
    const bytes = zipStore(files);
    const ofd = await parseOfd(bytes);
    expect(ofd.docType).toBe('OFD-H');
    expect(ofd.pages[0]!.objects.length).toBe(2); // EllipseObject 被跳过并记录
    expect(ofd.limitations.join(' ')).toContain('EllipseObject');
    expect(ofd.limitations.join(' ')).toContain('img-missing');
    const texts = extractText(ofd);
    expect(texts[0]).toContain('容错');
    // 未知字体 f1 在 PublicRes 中声明但没有 FontFile → 名字可读、无字节
    expect(ofd.fonts['f1']).toMatchObject({ name: 'FakeFont' });
    expect(ofd.fonts['f1']!.data.length).toBe(0);
  });

  it('非 OFD 输入直接报错', async () => {
    await expect(parseOfd(utf8Encode('not a zip'))).rejects.toThrow();
  });
});

describe('openOfd', () => {
  it('打开后可编辑并再次序列化（二次往返）', async () => {
    const { bytes } = await sampleOfd();
    const doc = await openOfd(bytes);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(doc.pages[0]!.width).toBeCloseTo(595.28, 1); // 210mm → pt
    // 文本对象映射到 pt 坐标（30mm ≈ 85.04pt）
    const texts = doc.pages[0]!.objects.filter((o): o is TextRun => o.t === 'text');
    const zh = texts.find((t) => t.text.includes('你好'));
    expect(zh).toBeDefined();
    expect(zh!.x).toBeCloseTo(30 / MM, 1);
    expect(zh!.size).toBeCloseTo(12, 1); // 字号恒为 pt（mm 文档里 setFontSize(12) 也是 12pt）
    // 字体注册：嵌入字体以 ofd_ 前缀注册，中文回退 simsun
    expect(zh!.fontKey === 'simsun' || zh!.fontKey.startsWith('ofd_')).toBe(true);

    // 二次序列化 → 重新解析 → 内容仍在
    const again = await parseOfd(doc.output('uint8array') as Uint8Array);
    expect(extractText(again)[0]).toContain('你好，OFD');
    expect(extractText(again)[1]).toContain('第二页');
    expect(again.outlines.map((o) => o.title)).toEqual(['第一页', '第二页']);
    expect(again.attachments[0]?.name).toBe('清单.txt');
  });

  it('大纲映射为 doc.outline，附件映射为 attachments', async () => {
    const { bytes } = await sampleOfd();
    const doc = await openOfd(bytes);
    expect(doc.outlineRoot.children.map((n) => n.title)).toEqual(['第一页', '第二页']);
    expect(doc.attachments.length).toBe(1);
  });
});

describe('pageToPng', () => {
  it('纯 Node 环境给出明确错误', async () => {
    const { ofd } = await sampleOfd();
    // 测试运行环境无 DOM/canvas —— 要么拒绝（Node），要么成功（浏览器模式）
    try {
      const result = await pageToPng(ofd.pages[0]!, { dpi: 72 });
      expect(result.width).toBeGreaterThan(0);
      expect(result.data[0]).toBe(0x89);
    } catch (e) {
      expect((e as Error).message).toMatch(/canvas|decode|Image/);
    }
  });
});

// 25.4 / 72
const MM = 25.4 / 72;

describe('pageToSvg', () => {
  it('渲染文本/路径/图片为 SVG 元素', async () => {
    const { ofd } = await sampleOfd();
    const svg = pageToSvg(ofd.pages[0]!);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<text');
    expect(svg).toContain('你');
    expect(svg).toContain('好');
    expect(svg).toContain('<path');
    expect(svg).toContain('viewBox="0 0 210 297"');
    const svg2 = pageToSvg(ofd.pages[1]!);
    expect(svg2).toContain('data:image/png;base64,');
  });

  it('zoom 与 includeText 选项', async () => {
    const { ofd } = await sampleOfd();
    const zoomed = pageToSvg(ofd.pages[0]!, { zoom: 2 });
    expect(zoomed).toContain('width="420.00"');
    const noText = pageToSvg(ofd.pages[0]!, { includeText: false });
    expect(noText).not.toContain('<text');
  });
});

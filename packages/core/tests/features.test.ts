import { describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import { readZip, text } from './helpers/zipreader';

describe('链接与书签', () => {
  it('doc.link → 隐形路径 + URI 动作', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.text('官网', 10, 20);
    doc.link(10, 15, 20, 6, { url: 'https://example.com?a=1&b=2' });
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    expect(c0).toContain('<ofd:Action Event="Click">');
    expect(c0).toContain('<ofd:URI URI="https://example.com?a=1&amp;b=2"/>');
    expect(c0).toContain('Fill="false"');
  });

  it('pageNumber → Goto/Dest 跳转', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.addPage();
    doc.setPage(1);
    doc.link(10, 15, 20, 6, { pageNumber: 2 });
    const files = readZip(doc.output('uint8array') as Uint8Array);
    const c0 = text(files, 'Doc_0/Pages/Page_0/Content.xml');
    const docXml = text(files, 'Doc_0/Document.xml');
    expect(c0).toContain('<ofd:Goto>');
    expect(c0).toMatch(/<ofd:Dest Type="XYZ" PageID="\d+">/);
    // PageID 指向第二页注册的 ID
    const pageIds = [...docXml.matchAll(/<ofd:Page ID="(\d+)" BaseLoc="Pages\/Page_1\//g)].map(
      (m) => m[1],
    );
    const destId = c0.match(/<ofd:Dest Type="XYZ" PageID="(\d+)">/)![1];
    expect(destId).toBe(pageIds[0]);
  });

  it('textWithLink', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('helvetica');
    doc.setFontSize(10);
    doc.textWithLink('click me', 10, 20, { url: 'https://example.com' });
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    expect(c0).toContain('click me');
    expect(c0).toContain('<ofd:URI URI="https://example.com"/>');
  });

  it('书签 Outlines（含层级）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.addPage();
    doc.addPage();
    const ch1 = doc.outline.add(null, '第一章', { pageNumber: 1 });
    doc.outline.add(ch1, '1.1 概述', { pageNumber: 2 });
    doc.outline.add(null, '附录', { pageNumber: 3 });
    const docXml = text(readZip(doc.output('uint8array') as Uint8Array), 'Doc_0/Document.xml');
    expect(docXml).toContain('<ofd:Outlines>');
    expect(docXml).toMatch(/<ofd:Outline ID="[0-9]+" Title="第一章">/);
    expect(docXml).toMatch(/<ofd:Outline ID="[0-9]+" Title="1.1 概述">/);
    expect(docXml).toMatch(/<ofd:Outline ID="[0-9]+" Title="附录">/);
    expect((docXml.match(/<ofd:Goto>/g) || []).length).toBe(3);
  });
});

describe('对齐与排版', () => {
  it('居中/右对齐通过偏移实现（Boundary X 移动）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('helvetica');
    doc.setFontSize(10); // pt
    doc.text('ABC', 50, 20, { align: 'center' });
    doc.text('ABC', 50, 40, { align: 'right' });
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    const bounds = [...c0.matchAll(/Boundary="([\d.]+) [\d.]+/g)].map((m) => Number(m[1]));
    const w = doc.getTextWidth('ABC');
    expect(bounds[0]).toBeCloseTo(50 - w / 2, 3);
    expect(bounds[1]).toBeCloseTo(50 - w, 3);
  });

  it('justify：首行 DeltaX 步进拉伸至 maxWidth', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('helvetica');
    doc.setFontSize(10);
    doc.text('the quick brown fox jumps over the lazy dog far away', 10, 20, {
      align: 'justify',
      maxWidth: 30,
    });
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    const firstLine = c0.match(/<ofd:TextCode[^>]*>([^<]+)<\/ofd:TextCode>/)![1];
    const deltas = c0
      .match(/DeltaX="([^"]+)"/)![1]
      .split(' ')
      .map(Number);
    const sum = deltas.reduce((a, b) => a + b, 0);
    // Σ步进 + 末字宽 = 30mm（首行为非末行，两端对齐拉伸到 maxWidth）
    const lastCharW = doc.getStringUnitWidth(firstLine.charAt(firstLine.length - 1)) * 10;
    expect(sum + lastCharW * (25.4 / 72)).toBeCloseTo(30, 3);
    expect(deltas.length).toBe(firstLine.length - 1);
  });

  it('maxWidth 断行生成多个 TextObject', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('simsun');
    doc.setFontSize(10);
    doc.text('这是一段比较长的中文文本需要自动换行排版处理', 10, 10, { maxWidth: 50 });
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    expect((c0.match(/<ofd:TextObject/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('旋转文本输出 CTM（45°）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('helvetica');
    doc.setFontSize(10);
    doc.text('Rotated', 50, 50, { angle: 45 });
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    expect(c0).toMatch(/CTM="0\.7071 0\.7071 -0\.7071 0\.7071 [-\d.]+ [-\d.]+"/);
    expect(c0).toContain('<ofd:TextCode X="0" Y="0"');
  });

  it('基线选项：top/middle/bottom 影响 Boundary Y', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('helvetica');
    doc.setFontSize(10); // pt
    doc.text('A', 10, 30, { baseline: 'alphabetic' });
    doc.text('A', 10, 30, { baseline: 'top' });
    doc.text('A', 10, 30, { baseline: 'middle' });
    doc.text('A', 10, 30, { baseline: 'bottom' });
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    const ys = [...c0.matchAll(/Boundary="[\d.]+ ([\d.-]+) /g)].map((m) => Number(m[1]));
    const asc = (718 / 1000) * 10 * (25.4 / 72); // 2.5309mm
    const desc = (207 / 1000) * 10 * (25.4 / 72); // 0.7303mm
    const top = asc * 1.08; // builder pads the ascent (fallback-font headroom)
    expect(ys[0]).toBeCloseTo(30 - top, 3); // alphabetic: 上边界=基线-asc(含余量)
    expect(ys[1]).toBeCloseTo(30 - (top - asc), 3); // top: 基线下移 asc 后，上边界回到 30-余量
    expect(ys[2]).toBeCloseTo(30 + (asc - desc) / 2 - top, 2); // middle
    expect(ys[3]).toBeCloseTo(30 + desc - top, 2); // bottom: y 为文本底边
  });
});

describe('元数据/附件/视图', () => {
  it('附件：Attachments.xml + 文件嵌入', () => {
    const doc = new jsOFD();
    doc.addFileAsAttachment('notes.txt', '附件内容 hello', { format: 'text/plain' });
    const files = readZip(doc.output('uint8array') as Uint8Array);
    expect([...files.keys()]).toContain('Doc_0/Attachments.xml');
    expect([...files.keys()]).toContain('Doc_0/Attachments/Attach_0/notes.txt');
    expect(new TextDecoder().decode(files.get('Doc_0/Attachments/Attach_0/notes.txt')!)).toBe(
      '附件内容 hello',
    );
    const att = text(files, 'Doc_0/Attachments.xml');
    expect(att).toContain('Name="notes.txt"');
    expect(att).toContain('<ofd:FileLoc>/Doc_0/Attachments/Attach_0/notes.txt</ofd:FileLoc>');
    expect(text(files, 'Doc_0/Document.xml')).toContain(
      '<ofd:Attachments>Attachments.xml</ofd:Attachments>',
    );
  });

  it('setDisplayMode → VPreferences', () => {
    const doc = new jsOFD();
    doc.setDisplayMode(2, 'single');
    const docXml = text(readZip(doc.output('uint8array') as Uint8Array), 'Doc_0/Document.xml');
    expect(docXml).toContain('<ofd:PageLayout>OnePage</ofd:PageLayout>');
    expect(docXml).toContain('<ofd:Zoom>2</ofd:Zoom>');
  });

  it('setDisplayMode("fullwidth") → ZoomMode FitWidth', () => {
    const doc = new jsOFD();
    doc.setDisplayMode('fullwidth');
    const docXml = text(readZip(doc.output('uint8array') as Uint8Array), 'Doc_0/Document.xml');
    expect(docXml).toContain('<ofd:ZoomMode>FitWidth</ofd:ZoomMode>');
  });

  it('中文字体自动切换（helvetica + 中文 → 宋体）', () => {
    const doc = new jsOFD();
    doc.setFont('helvetica');
    doc.text('中文内容', 10, 10);
    const files = readZip(doc.output('uint8array') as Uint8Array);
    const pub = text(files, 'Doc_0/PublicRes.xml');
    expect(pub).toContain('FontName="SimSun"');
    expect(pub).toContain('FamilyName="宋体"');
  });

  it('粗体/斜体样式：Weight/Italic 属性', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('helvetica', 'bold');
    doc.text('Bold', 10, 10);
    doc.setFont('helvetica', 'italic');
    doc.text('Italic', 10, 20);
    const files = readZip(doc.output('uint8array') as Uint8Array);
    const c0 = text(files, 'Doc_0/Pages/Page_0/Content.xml');
    expect(c0).toContain('Weight="700"');
    expect(c0).toContain('Italic="true"');
    const pub = text(files, 'Doc_0/PublicRes.xml');
    expect(pub).toContain('FontName="Helvetica"');
    expect(pub).toContain('Bold="true"');
    expect(pub).toContain('Italic="true"');
  });

  it('透明度 → Alpha', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setOpacity(0.5);
    doc.text('半透明', 10, 10);
    doc.rect(10, 20, 30, 10, 'F');
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    expect((c0.match(/Alpha="128"/g) || []).length).toBe(2);
  });

  it('线帽/连接样式', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setLineCap('round');
    doc.setLineJoin('bevel');
    doc.rect(10, 10, 30, 20, 'S');
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    expect(c0).toContain('Cap="Round"');
    expect(c0).toContain('Join="Bevel"');
  });

  it('FD/DF 组合样式：同时填充与描边（回归）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.circle(50, 50, 10, 'FD');
    doc.rect(10, 10, 20, 10, 'DF');
    doc.rect(10, 30, 20, 10, 'F'); // 仅填充
    const c0 = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_0/Content.xml',
    );
    expect(c0).toContain('Fill="true" Stroke="true"');
    expect(c0).toContain('<ofd:FillColor');
    expect(c0).toContain('<ofd:StrokeColor');
    expect(c0).toContain('Fill="true" Stroke="false"');
    expect(c0).not.toContain('Fill="false" Stroke="false"'); // 不应出现空样式
  });
});

describe('输出类型', () => {
  it('arraybuffer / uint8array / dataurlstring', () => {
    const doc = new jsOFD();
    doc.text('hi', 1, 1);
    const ab = doc.output('arraybuffer') as ArrayBuffer;
    expect(ab).toBeInstanceOf(ArrayBuffer);
    const u8 = doc.output('uint8array') as Uint8Array;
    expect(u8.length).toBe(ab.byteLength);
    const url = doc.output('dataurlstring') as string;
    expect(url.startsWith('data:application/ofd;base64,')).toBe(true);
    expect(doc.getDataUrl()).toBe(url);
  });

  it('Node 环境提供 Blob（Node 18+）', () => {
    const doc = new jsOFD();
    doc.text('hi', 1, 1);
    const blob = doc.output('blob') as Blob;
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/ofd');
  });
});

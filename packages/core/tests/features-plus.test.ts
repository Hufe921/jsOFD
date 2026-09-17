/** Tests for the page-flow, table, html, context2d and annotation features. */

import { describe, expect, it } from 'vitest';

import { jsOFD } from '../src/jsofd';
import type { PageData, PathRun, TextRun } from '../src/model';

const texts = (p: PageData): string[] =>
  p.objects.filter((o): o is TextRun => o.t === 'text').map((o) => o.text);

describe('autoPaging 与 headerFooter', () => {
  it('长文本自动分页且 onNewPage 触发', () => {
    const doc = new jsOFD({ unit: 'mm' });
    const newPages: number[] = [];
    const end = doc.autoPaging(Array(400).fill('自动分页内容测试段').join('，'), {
      x: 20,
      y: 30,
      maxWidth: 170,
      onNewPage: (_d, info) => newPages.push(info.pageNumber),
    });
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    expect(newPages.length).toBe(doc.getNumberOfPages() - 1);
    expect(end).toBeLessThan(doc.getPageHeight());
    // every page carries flow text
    for (const p of doc.pages) expect(texts(p).length).toBeGreaterThan(0);
  });

  it('headerFooter 在指定页范围绘制并还原当前页', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.text('p1', 20, 40);
    doc.addPage();
    doc.text('p2', 20, 40);
    doc.setPage(2);
    doc.headerFooter({
      header: (d, info) => d.text(`H${info.pageNumber}`, 20, 12),
      footer: (d, info) =>
        d.text(`F${info.pageNumber}/${info.pageCount}`, 105, 285, { align: 'center' }),
      startPage: 2,
    });
    expect(texts(doc.pages[0]!)).toEqual(['p1']);
    expect(texts(doc.pages[1]!)).toContain('p2');
    expect(texts(doc.pages[1]!)).toContain('H2');
    expect(texts(doc.pages[1]!)).toContain('F2/2');
    expect(doc.page).toBe(1); // restored
  });
});

describe('doc.table()', () => {
  it('绘制表头 + 行 + 网格，返回底边 Y', () => {
    const doc = new jsOFD({ unit: 'mm' });
    const end = doc.table(20, 30, {
      columns: [
        { header: '项目', width: 60 },
        { header: '金额', width: 40, align: 'right' },
      ],
      rows: [
        ['软件开发服务', '10000.00'],
        [{ text: '合计', bold: true }, '10000.00'],
      ],
      style: {
        headFill: [53, 101, 224],
        zebra: [
          [255, 255, 255],
          [246, 248, 252],
        ],
      },
    });
    expect(end).toBeGreaterThan(30);
    const texts0 = texts(doc.pages[0]!);
    expect(texts0).toContain('项目');
    expect(texts0).toContain('软件开发服务');
    expect(texts0).toContain('10000.00');
    const paths = doc.pages[0]!.objects.filter((o): o is PathRun => o.t === 'path');
    expect(paths.length).toBeGreaterThanOrEqual(3); // header fill + grid + zebra
  });

  it('autoPage：超高表格续页并重复表头', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.table(15, 25, {
      columns: [
        { header: '#', width: 10 },
        { header: '内容', width: 60 },
      ],
      rows: Array.from({ length: 60 }, (_, i) => [String(i + 1), `第 ${i + 1} 行数据内容`]),
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    // header repeated on later pages
    for (const p of doc.pages) expect(texts(p)).toContain('#');
  });
});

describe('doc.html()', () => {
  it('解析标题/段落/加粗/实体并排版', () => {
    const doc = new jsOFD({ unit: 'mm' });
    const end = doc.html(
      '<h1>季度报告</h1><p>这是<strong>加粗</strong>与<i>斜体</i>混排 &amp; 实体。</p><ul><li>第一项</li><li>第二项</li></ul>',
      { x: 20, y: 25, width: 170 },
    );
    const t = texts(doc.pages[0]!);
    expect(t.some((s) => s.includes('季度报告'))).toBe(true);
    expect(t.some((s) => s.includes('加粗'))).toBe(true);
    expect(t.some((s) => s.includes('&'))).toBe(true); // &amp; decoded
    expect(t.some((s) => s.startsWith('•'))).toBe(true);
    expect(end).toBeGreaterThan(25);
  });

  it('超长 HTML 跨页续排', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.html(
      Array(120).fill('<p>HTML 分页排版验证段落，内容足够长以触发自动分页逻辑。</p>').join(''),
      { y: 25 },
    );
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
  });
});

describe('doc.context2d', () => {
  it('fillRect / path fill / stroke 落成矢量对象', () => {
    const doc = new jsOFD({ unit: 'mm' });
    const ctx = doc.context2d;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(10, 10, 30, 20);
    ctx.strokeStyle = '#00f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 50);
    ctx.lineTo(60, 50);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(40, 80, 10, 0, Math.PI * 2);
    ctx.fill();

    const paths = doc.pages[0]!.objects.filter((o): o is PathRun => o.t === 'path');
    expect(paths.length).toBe(3);
    expect(paths[0]!.fill).toBe(true);
    expect(paths[0]!.fillColor).toEqual([255, 0, 0]);
    expect(paths[1]!.stroke).toBe(true);
    expect(paths[1]!.strokeColor).toEqual([0, 0, 255]);
    // circle approximated by bezier segments
    expect(paths[2]!.ops.filter((o) => o.op === 'C').length).toBeGreaterThanOrEqual(4);
  });

  it('translate/rotate 变换作用于几何与文本', () => {
    const doc = new jsOFD({ unit: 'mm' });
    const ctx = doc.context2d;
    ctx.translate(50, 50);
    ctx.rotate(Math.PI / 2);
    ctx.font = '16px serif';
    ctx.fillText('旋转文本', 0, 0);
    const run = doc.pages[0]!.objects.find((o): o is TextRun => o.t === 'text')!;
    expect(run.angle).toBeCloseTo(90, 0);
    expect(run.x).toBeCloseTo(50 * doc.scaleFactor, 1);
  });

  it('fillText 使用 textAlign 居中并切到中文字体', () => {
    const doc = new jsOFD({ unit: 'mm' });
    const ctx = doc.context2d;
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.fillText('中文居中', 105, 30);
    const run = doc.pages[0]!.objects.find((o): o is TextRun => o.t === 'text')!;
    expect(run.fontKey).toBe('simsun');
    expect(run.size).toBe(12); // 16px = 12pt
  });

  it('不支持的 API 抛出明确错误', () => {
    const doc = new jsOFD();
    expect(() => doc.context2d.createLinearGradient(0, 0, 1, 1)).toThrow(/not supported/);
  });
});

describe('addAnnotation()', () => {
  it('highlight 为半透明填充矩形', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.addAnnotation('highlight', 20, 30, 60, 8);
    const p = doc.pages[0]!.objects.find((o): o is PathRun => o.t === 'path')!;
    expect(p.fill).toBe(true);
    expect(p.fillColor).toEqual([255, 221, 40]);
    expect(p.opacity).toBeCloseTo(0.35, 2);
  });

  it('underline / strikeout / squiggly 生成描边路径', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.addAnnotation('underline', 20, 30, 60, 8);
    doc.addAnnotation('strikeout', 20, 42, 60, 8);
    doc.addAnnotation('squiggly', 20, 54, 60, 8);
    const paths = doc.pages[0]!.objects.filter((o): o is PathRun => o.t === 'path');
    expect(paths.length).toBeGreaterThanOrEqual(5); // squiggly contributes multiple segments
    for (const p of paths) expect(p.stroke).toBe(true);
  });

  it('freetext 写入文本并恢复字体状态', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('simhei');
    doc.addAnnotation('freetext', 20, 30, 80, 10, {
      text: '批注：请核对金额',
      color: [200, 30, 30],
    });
    const run = doc.pages[0]!.objects.find((o): o is TextRun => o.t === 'text')!;
    expect(run.text).toContain('批注');
    expect(run.color).toEqual([200, 30, 30]);
    expect(doc.activeFontKey).toBe('simhei'); // state restored
  });

  it('ink 自由手绘 + box 边框', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.addAnnotation('ink', 0, 0, 0, 0, {
      points: [
        [10, 10],
        [30, 40],
        [60, 20],
      ],
    });
    doc.addAnnotation('box', 20, 60, 50, 20, { fill: [255, 242, 204] });
    const paths = doc.pages[0]!.objects.filter((o): o is PathRun => o.t === 'path');
    expect(paths.length).toBeGreaterThanOrEqual(3);
    expect(() => doc.addAnnotation('ink', 0, 0, 0, 0)).toThrow(/points required/);
  });
});

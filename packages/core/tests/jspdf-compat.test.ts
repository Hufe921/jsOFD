/**
 * jsPDF 官方测试用例对齐套件
 *
 * 用例结构与断言语义对照 jsPDF 2.5.2 test/specs/：
 *   init.spec.js / jspdf.unit.spec.js / text.spec.js / shapes.spec.js /
 *   pages.spec.js / fontmetrics.spec.js / split_text_to_size.spec.js /
 *   outline.spec.js / display-mode.spec.js / viewerpreferences.spec.js /
 *   filetypeRecognition.spec.js / putTotalPages.spec.js / rgba.spec.js
 * 字节级 PDF 断言改为 jsOFD 内部模型 / OFD XML 断言。
 */

import { describe, expect, it } from 'vitest';
import { jsOFD } from '../src/index';
import type { PathRun, TextRun } from '../src/model';
import { readZip, text } from './helpers/zipreader';

const MM = 72 / 25.4;

function content(doc: jsOFD): string {
  return text(readZip(doc.output('uint8array') as Uint8Array), 'Doc_0/Pages/Page_0/Content.xml');
}

function documentXml(doc: jsOFD): string {
  return text(readZip(doc.output('uint8array') as Uint8Array), 'Doc_0/Document.xml');
}

function firstText(doc: jsOFD): TextRun {
  return doc.pages[0]!.objects.find((o) => o.t === 'text') as TextRun;
}

function firstPath(doc: jsOFD): PathRun {
  return doc.pages[0]!.objects.find((o) => o.t === 'path') as PathRun;
}

/* ================= init.spec.js ================= */

describe('init（对照 init.spec.js）', () => {
  it('默认 a4 纵向，毫米单位', () => {
    const doc = new jsOFD();
    expect(doc.getPageWidth()).toBeCloseTo(210, 5);
    expect(doc.getPageHeight()).toBeCloseTo(297, 5);
  });

  it('横向文档（对照 should make a landscape document）', () => {
    const doc = new jsOFD({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    expect(doc.getPageWidth()).toBeCloseTo(841.89, 1);
    expect(doc.getPageHeight()).toBeCloseTo(595.28, 1);
  });

  it('位置参数构造 jsOFD(orientation, unit, format)', () => {
    const doc = new jsOFD('p', 'pt', 'a4');
    expect(doc.getPageWidth()).toBeCloseTo(595.28, 1);
    expect(doc.getPageHeight()).toBeCloseTo(841.89, 1);
  });

  it('设置文档属性（对照 should set document properties）', () => {
    const doc = new jsOFD();
    doc.setProperties({ title: 'Title', author: 'Author X' });
    const ofdXml = text(readZip(doc.output('uint8array') as Uint8Array), 'OFD.xml');
    expect(ofdXml).toContain('<ofd:Title>Title</ofd:Title>');
    expect(ofdXml).toContain('<ofd:Author>Author X</ofd:Author>');
  });

  it('字体列表（对照 should return font list）', () => {
    const doc = new jsOFD();
    const list = doc.getFontList();
    expect(list).toContain('helvetica');
    expect(list).toContain('times');
    expect(list).toContain('courier');
    expect(list).toContain('simsun');
  });

  it('各单位下文本坐标（对照 render text 100pt/100mm/100cm/2in/2px away）', () => {
    // 100pt
    let run = firstText(new jsOFD({ unit: 'pt' }).text('X', 100, 100) as jsOFD);
    expect(run.x).toBeCloseTo(100, 5);
    // 100mm → 283.46pt
    run = firstText(new jsOFD({ unit: 'mm' }).text('X', 100, 100) as jsOFD);
    expect(run.x).toBeCloseTo(100 * MM, 4);
    // 100cm
    run = firstText(new jsOFD({ unit: 'cm' }).text('X', 100, 100) as jsOFD);
    expect(run.x).toBeCloseTo(1000 * MM, 3);
    // 2in → 144pt
    run = firstText(new jsOFD({ unit: 'in' }).text('X', 2, 2) as jsOFD);
    expect(run.x).toBeCloseTo(144, 5);
    // 2px → 1.5pt
    run = firstText(new jsOFD({ unit: 'px' }).text('X', 2, 2) as jsOFD);
    expect(run.x).toBeCloseTo(1.5, 5);
  });

  it('非法单位抛错（对照 should warn me about an invalid unit）', () => {
    expect(() => new jsOFD({ unit: 'invalid' as never })).toThrow('Invalid unit: invalid');
  });

  it('output 返回 ArrayBuffer / dataURL（对照 init.spec 输出类型）', () => {
    const doc = new jsOFD();
    doc.text('hi', 10, 10);
    expect(doc.output('arraybuffer')).toBeInstanceOf(ArrayBuffer);
    expect(String(doc.output('datauristring'))).toMatch(/^data:application\/ofd;base64,/);
    expect(String(doc.getDataUrl())).toMatch(/^data:application\/ofd;base64,/);
  });

  it('setCreationDate / getCreationDate（对照 init.spec）', () => {
    const doc = new jsOFD();
    const d = new Date(2020, 5, 15, 10, 30, 0);
    doc.setCreationDate(d);
    expect((doc.getCreationDate('jsDate') as Date).getFullYear()).toBe(2020);
    expect((doc.getCreationDate('array') as number[])[3]).toBe(10);
  });
});

/* ================= jspdf.unit.spec.js：状态与参数 ================= */

describe('文档状态（对照 jspdf.unit.spec.js）', () => {
  it('默认字号 16（对照 getFontSize）', () => {
    expect(new jsOFD().getFontSize()).toBe(16);
  });

  it('setFontSize（对照 jsPDF public function setFontSize）', () => {
    const doc = new jsOFD();
    doc.setFontSize(20);
    expect(doc.getFontSize()).toBe(20);
  });

  it('字号固定 pt 不随单位换算（jsPDF Tf 语义）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFontSize(20);
    const run = firstText(doc.text('X', 10, 10) as jsOFD);
    expect(run.size).toBe(20);
    expect(content(doc)).toContain('Size="7.0556"'); // 20pt = 7.0556mm
  });

  it('charSpace get/set（对照 getCharSpace/setCharSpace）', () => {
    const doc = new jsOFD();
    expect(doc.getCharSpace()).toBe(0);
    doc.setCharSpace(2);
    expect(doc.getCharSpace()).toBe(2);
  });

  it('lineWidth get/set（对照 getLineWidth）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.setLineWidth(595.28);
    expect(doc.getLineWidth()).toBeCloseTo(595.28, 4);
  });

  it('lineDashPattern（对照 setLineDash：[] 0 d 与 [1,1] 缩放）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setLineDashPattern([1, 1], 1);
    expect(doc.getLineDashPattern()).toEqual([1, 1]);
    const c = content(doc.line(0, 0, 10, 10) as jsOFD);
    // 1mm 原样输出（OFD 单位 mm）
    expect(c).toContain('DashPattern="1 1"');
    expect(c).toContain('DashOffset="1"');
  });

  it('setLineCap/setLineJoin 名称与数字（对照 unit.spec）', () => {
    const doc = new jsOFD();
    doc.setLineCap('round');
    expect(doc.getLineCap()).toBe(1);
    doc.setLineCap(2);
    expect(doc.getLineCap()).toBe(2);
    doc.setLineJoin('bevel');
    expect(doc.getLineJoin()).toBe(2);
    doc.setLineJoin(0);
    expect(doc.getLineJoin()).toBe(0);
    const c = content(doc.line(0, 0, 10, 10) as jsOFD);
    expect(c).toContain('Cap="Square"'); // 最后一次 setLineCap(2)
  });

  it('setLineMiterLimit（对照 setLineMiterLimit）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setLineMiterLimit(2);
    expect(doc.getLineMiterLimit()).toBe(2);
    const c = content(doc.line(0, 0, 10, 10) as jsOFD);
    expect(c).toContain('MiterLimit="2"');
    expect(() => doc.setLineMiterLimit('invalid' as unknown as number)).toThrow();
  });

  it('getLineHeight / setLineHeightFactor（对照 16*1.15）', () => {
    const doc = new jsOFD();
    expect(doc.getLineHeight()).toBeCloseTo(16 * 1.15, 6);
    doc.setLineHeightFactor(1.0);
    expect(doc.getLineHeight()).toBe(16);
  });

  it('颜色 getter 返回 hex 字符串（对照 getTextColor → "#ff0000"）', () => {
    const doc = new jsOFD();
    expect(doc.getTextColor()).toBe('#000000');
    doc.setTextColor(255, 0, 0);
    expect(doc.getTextColor()).toBe('#ff0000');
    expect(doc.getFillColor()).toBe('#000000');
    doc.setFillColor(255, 0, 0);
    expect(doc.getFillColor()).toBe('#ff0000');
    doc.setDrawColor(255, 0, 0);
    expect(doc.getDrawColor()).toBe('#ff0000');
  });

  it('R2L 开关（对照 setR2L/getR2L 与文本反转）', () => {
    const doc = new jsOFD();
    expect(doc.getR2L()).toBe(false);
    doc.setR2L(true);
    expect(doc.getR2L()).toBe(true);
    const run = firstText(doc.text('(This is a test.)', 10, 10) as jsOFD);
    expect(run.text).toBe(').tset a si sihT(');
  });

  it('R2L 选项级覆盖', () => {
    const doc = new jsOFD();
    const run = firstText(doc.text('abc', 10, 10, { R2L: true }) as jsOFD);
    expect(run.text).toBe('cba');
  });

  it('setGState 透明度（对照 rgba.spec）', () => {
    const doc = new jsOFD();
    doc.setGState({ opacity: 0.5 });
    const c = content(doc.text('X', 10, 10) as jsOFD);
    expect(c).toContain('Alpha="128"'); // round(0.5*255)
  });

  it('putTotalPages 占位替换（对照 putTotalPages.spec standardfont）', () => {
    const doc = new jsOFD();
    doc.text('共 {total} 页', 10, 10);
    doc.addPage();
    doc.addPage();
    doc.putTotalPages('{total}');
    const c = content(doc);
    expect(c).toContain('共 3 页');
    // 原文本对象不被污染（可重复 output）
    expect(firstText(doc).text).toBe('共 {total} 页');
    expect(content(doc)).toContain('共 3 页');
  });
});

/* ================= jspdf.unit.spec.js：text ================= */

describe('text（对照 unit.spec text 与 text.spec.js）', () => {
  it('默认基线 alphabetic：x,y 即基线起点', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const run = firstText(doc.text('This is a test.', 10, 10) as jsOFD);
    expect(run.x).toBe(10);
    expect(run.y).toBe(10);
  });

  it('旧签名 text(x, y, text) 等价（对照 old method header）', () => {
    const d1 = new jsOFD({ unit: 'pt' });
    (d1 as unknown as { text: (a: number, b: number, c: string) => jsOFD }).text(
      10,
      10,
      'This is a test.',
    );
    const d2 = new jsOFD({ unit: 'pt' });
    d2.text('This is a test.', 10, 10);
    const r1 = firstText(d1);
    const r2 = firstText(d2);
    expect(r1.x).toBeCloseTo(r2.x, 6);
    expect(r1.y).toBeCloseTo(r2.y, 6);
    expect(r1.text).toBe(r2.text);
  });

  it('数组文本（对照 text is Array）', () => {
    const doc = new jsOFD();
    doc.text(['line1', 'line2'], 10, 10);
    const texts = doc.pages[0]!.objects.filter((o) => o.t === 'text');
    expect(texts.length).toBe(2);
  });

  it('\\n 多行拆分（对照 multiline）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.text('This is a line\nbreak', 10, 10);
    const texts = doc.pages[0]!.objects.filter((o) => o.t === 'text') as TextRun[];
    expect(texts.map((t) => t.text)).toEqual(['This is a line', 'break']);
    expect(texts[1]!.y - texts[0]!.y).toBeCloseTo(16 * 1.15, 4);
  });

  it('angle 旋转输出 CTM（对照 angle-functionality: 0.98 0.17 -0.17 0.98）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.text('This is a test.', 10, 10, { angle: 10 });
    const c = content(doc);
    expect(c).toMatch(/CTM="0.9848 0.1736 -0.1736 0.9848/);
  });

  it('charSpace 选项（对照 charSpace 10 → 28.35 Tc）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const run = firstText(doc.text('ab', 10, 10, { charSpace: 10 }) as jsOFD);
    expect(run.charSpace).toBe(10);
  });

  it('renderingMode 全量映射（对照 Tr 0-7）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const modes = ['fill', 0, false, 'stroke', 1, true, 'fillThenStroke', 2, 'invisible', 3];
    for (const m of modes) {
      doc.text('x', 10, 10, { renderingMode: m as never });
    }
    const c = content(doc);
    expect(c).toContain('Fill="false" Stroke="true"'); // stroke
    expect(c).toContain('Visible="false"'); // invisible
    expect(c).toContain('StrokeColor'); // fillThenStroke 带 StrokeColor
  });

  it('align center/right 位置偏移（对照 align-functionality）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.setFontSize(16);
    const w = doc.getTextWidth('This is a test.');
    const dr = new jsOFD({ unit: 'pt' });
    dr.setFontSize(16);
    const r = firstText(dr.text('This is a test.', 200, 10, { align: 'right' }) as jsOFD);
    expect(r.x).toBeCloseTo(200 - w, 4);
    const dc = new jsOFD({ unit: 'pt' });
    dc.setFontSize(16);
    const rc = firstText(dc.text('This is a test.', 200, 30, { align: 'center' }) as jsOFD);
    expect(rc.x).toBeCloseTo(200 - w / 2, 4);
  });

  it('align 非法值抛错（对照 throw an error）', () => {
    const doc = new jsOFD();
    expect(() => doc.text('x', 10, 10, { align: 'invalid' as never })).toThrow(
      'Unrecognized alignment option, use "left", "center", "right" or "justify".',
    );
  });

  it('maxWidth 断行 "This is a" / "test."（对照 maxWidth 30mm 16pt）', () => {
    const doc = new jsOFD({ floatPrecision: 2 });
    doc.text('This is a test.', 10, 10, { maxWidth: 30 });
    const texts = doc.pages[0]!.objects.filter((o) => o.t === 'text') as TextRun[];
    expect(texts.map((t) => t.text)).toEqual(['This is a', 'test.']);
  });

  it('maxWidth 保留原有换行（对照 preserving multiline）', () => {
    const doc = new jsOFD();
    doc.text('This is a test.\nThis is a test too.', 10, 10, { maxWidth: 30 });
    const texts = doc.pages[0]!.objects.filter((o) => o.t === 'text') as TextRun[];
    expect(texts.map((t) => t.text)).toEqual(['This is a', 'test.', 'This is a', 'test too.']);
  });

  it('maxWidth 超宽不拆（对照 too wide 600）', () => {
    const doc = new jsOFD();
    doc.text('This is a test.', 10, 10, { maxWidth: 600 });
    const texts = doc.pages[0]!.objects.filter((o) => o.t === 'text');
    expect(texts.length).toBe(1);
  });

  it('justify 两端对齐（对照 justify + maxWidth 30）', () => {
    const doc = new jsOFD();
    doc.setFontSize(16);
    doc.text('This is a test.', 10, 10, { align: 'justify', maxWidth: 30 });
    const texts = doc.pages[0]!.objects.filter((o) => o.t === 'text') as TextRun[];
    expect(texts[0]!.justifyWidth).toBeCloseTo(30 * MM, 4); // 末行不对齐
    expect(texts[1]!.justifyWidth).toBeNull();
    // DeltaX 均匀拉伸：Σ(步进)+末字宽 = maxWidth
    const c = content(doc);
    expect(c).toMatch(/DeltaX="/);
  });

  it('baseline 五种（对照 top/bottom/middle/alphabetic/hanging）', () => {
    const mk = (opts: { baseline?: string }) => {
      const doc = new jsOFD({ unit: 'pt' });
      doc.setFontSize(100);
      doc.setFont('helvetica');
      doc.text('X', 10, 100, opts as never);
      return firstText(doc);
    };
    // Helvetica ascent 718, descent -207
    expect(mk({}).y).toBe(100);
    expect(mk({ baseline: 'alphabetic' }).y).toBe(100);
    expect(mk({ baseline: 'top' }).y).toBeCloseTo(100 + 71.8, 3);
    expect(mk({ baseline: 'bottom' }).y).toBeCloseTo(100 + 20.7, 3);
    expect(mk({ baseline: 'middle' }).y).toBeCloseTo(100 + (71.8 - 20.7) / 2, 3);
    expect(mk({ baseline: 'hanging' }).y).toBeCloseTo(100 + 71.8 * 0.8, 3);
  });

  it('horizontalScale（对照 text-horizontal-scaling）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const run = firstText(doc.text('hello', 10, 10, { horizontalScale: 0.5 }) as jsOFD);
    expect(run.hScale).toBe(0.5);
    // CTM=[0.5,0,0,1, tx,ty]：宽度/字形水平压缩，基线起点不动；tx/ty 含
    // 边界外扩余量（(asc+desc)·0.18，防阅读器回退字体裁剪）
    expect(content(doc)).toMatch(/CTM="0\.5 0 0 1 0\.9398 4\.9925"/);
    // 对齐按缩放后宽度计算
    const d2 = new jsOFD({ unit: 'pt' });
    d2.setFontSize(16);
    const w = d2.getTextWidth('hello');
    const rr = firstText(
      d2.text('hello', 100, 50, { align: 'right', horizontalScale: 0.5 }) as jsOFD,
    );
    expect(rr.x).toBeCloseTo(100 - w * 0.5, 3);
  });

  it('行距因子等效（对照 text with line height：全局=选项）', () => {
    const d1 = new jsOFD();
    d1.setLineHeightFactor(1.5);
    d1.text('l1\nl2', 10, 10);
    const d2 = new jsOFD();
    d2.text('l1\nl2', 10, 10, { lineHeightFactor: 1.5 });
    const t1 = d1.pages[0]!.objects as TextRun[];
    const t2 = d2.pages[0]!.objects as TextRun[];
    expect(t1[1]!.y - t1[0]!.y).toBeCloseTo(t2[1]!.y - t2[0]!.y, 6);
  });

  it('非字符串抛错（对照 should throw an error if not a string）', () => {
    const doc = new jsOFD();
    expect(() => doc.text(undefined as unknown as string, 10, 10)).toThrow();
  });
});

/* ================= shapes.spec.js / unit.spec lines ================= */

describe('图形（对照 shapes.spec.js 与 unit.spec）', () => {
  it('直线（对照 should draw a line）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.setDrawColor(0, 0, 0);
    const run = firstPath(doc.line(20, 30, 210, 30) as jsOFD);
    expect(run.stroke).toBe(true);
    expect(run.ops[0]).toMatchObject({ op: 'M', x: 20, y: 30 });
    expect(run.ops[1]).toMatchObject({ op: 'L', x: 210, y: 30 });
  });

  it('lines 直线+贝塞尔（对照 unit.spec lines：M/L/L/C/L）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.lines(
      [
        [2, 2],
        [-2, 2],
        [1, 1, 2, 2, 3, 3],
        [2, 1],
      ],
      212,
      110,
    );
    const run = firstPath(doc);
    expect(run.ops.map((o) => o.op)).toEqual(['M', 'L', 'L', 'C', 'L']);
    // 与官方 spec 数值一致：锚点(212,110)，累计增量
    expect(run.ops[1]).toMatchObject({ op: 'L', x: 214, y: 112 });
    expect(run.ops[2]).toMatchObject({ op: 'L', x: 212, y: 114 });
    expect(run.ops[3]).toMatchObject({
      op: 'C',
      x1: 213,
      y1: 115,
      x2: 214,
      y2: 116,
      x: 215,
      y: 117,
    });
    expect(run.ops[4]).toMatchObject({ op: 'L', x: 217, y: 118 });
  });

  it('lines 旧签名 (x, y, lines, scale)（对照 old method header）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const l: number[][] = [
      [2, 2],
      [-2, 2],
    ];
    (
      doc as unknown as { lines: (a: number, b: number, c: number[][], d: number[]) => jsOFD }
    ).lines(212, 110, l, [1, 1]);
    const run = firstPath(doc);
    expect(run.ops[0]).toMatchObject({ op: 'M', x: 212, y: 110 });
    expect(run.ops[1]).toMatchObject({ op: 'L', x: 214, y: 112 });
    expect(run.ops[2]).toMatchObject({ op: 'L', x: 212, y: 114 });
  });

  it('lines closed 补闭合（对照 closed 参数）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.lines(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      0,
      0,
      1,
      1,
      'S',
      true,
    );
    const run = firstPath(doc);
    expect(run.ops[run.ops.length - 1]).toEqual({ op: 'Z' });
    expect(content(doc)).toContain(' C ');
  });

  it('矩形填充（对照 should draw rectangles）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.setFillColor(255, 0, 0);
    const run = firstPath(doc.rect(10, 10, 105, 100, 'F') as jsOFD);
    expect(run.fill).toBe(true);
    expect(run.stroke).toBe(false);
    expect(run.fillColor).toEqual([255, 0, 0]);
    expect(run.ops.length).toBe(5); // M L L L Z
  });

  it('圆（对照 should draw circles）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const run = firstPath(doc.circle(100, 70, 50, 'F') as jsOFD);
    expect(run.fill).toBe(true);
    // 4 段贝塞尔 + 闭合
    expect(run.ops.filter((o) => o.op === 'C').length).toBe(4);
    expect(run.ops[run.ops.length - 1]).toEqual({ op: 'Z' });
  });

  it('椭圆（对照 unit.spec ellipse 输出 4 段贝塞尔）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const run = firstPath(doc.ellipse(1, 2, 3, 4, 'F') as jsOFD);
    expect(run.ops.filter((o) => o.op === 'C').length).toBe(4);
    const c = content(doc);
    expect((c.match(/B /g) || []).length).toBe(4);
  });

  it('三角形 FD 填充+描边（对照 triangle + getStyle "FD"→B）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const run = firstPath(doc.triangle(1, 2, 3, 4, 5, 6, 'FD') as jsOFD);
    expect(run.fill).toBe(true);
    expect(run.stroke).toBe(true);
  });

  it('圆角矩形（对照 roundedRect）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    const run = firstPath(doc.roundedRect(1, 2, 30, 40, 3, 4, 'FD') as jsOFD);
    expect(run.fill && run.stroke).toBe(true);
    expect(run.ops.filter((o) => o.op === 'C').length).toBe(4);
  });

  it('灰色单通道颜色（对照 should use grey color mode）', () => {
    const doc = new jsOFD();
    doc.setFillColor(128);
    const run = firstPath(doc.rect(10, 10, 5, 5, 'F') as jsOFD);
    expect(run.fillColor).toEqual([128, 128, 128]);
    expect(content(doc)).toContain('Value="128 128 128"');
  });

  it('颜色名字符串（对照 colors directly passed by colorNames）', () => {
    const doc = new jsOFD();
    doc.setFillColor('red');
    expect(doc.getFillColor()).toBe('#ff0000');
    doc.setFillColor('#0f0');
    expect(doc.getFillColor()).toBe('#00ff00');
    doc.setFillColor('#0000ff');
    expect(doc.getFillColor()).toBe('#0000ff');
  });
});

/* ================= pages.spec.js ================= */

describe('页面（对照 pages.spec.js）', () => {
  it('新增页（对照 should add new page）', () => {
    const doc = new jsOFD();
    doc.text('p1', 10, 10);
    doc.addPage();
    expect(doc.getNumberOfPages()).toBe(2);
    doc.text('p2', 10, 10);
    expect(doc.pages[0]!.objects.length).toBe(1);
    expect(doc.pages[1]!.objects.length).toBe(1);
  });

  it('首页插入（对照 insert new page at the beginning）', () => {
    const doc = new jsOFD();
    doc.text('p1', 10, 10);
    doc.insertPage(1);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(doc.pages[0]!.objects.length).toBe(0);
    expect(doc.pages[1]!.objects.length).toBe(1);
  });

  it('中间插入（对照 insert in the middle / delete in the middle）', () => {
    const doc = new jsOFD();
    doc.addPage();
    doc.addPage(); // 3 页
    doc.setPage(2);
    doc.text('mid', 10, 10);
    doc.insertPage(2); // 在第 2 页前插入
    expect(doc.getNumberOfPages()).toBe(4);
    expect(doc.pages[1]!.objects.length).toBe(0);
    expect(doc.pages[2]!.objects[0]).toMatchObject({ t: 'text', text: 'mid' });
    doc.deletePage(2);
    expect(doc.getNumberOfPages()).toBe(3);
    expect(doc.pages[1]!.objects[0]).toMatchObject({ text: 'mid' });
  });

  it('movePage 交换（对照 make them swap places）', () => {
    const doc = new jsOFD();
    doc.text('a', 10, 10);
    doc.addPage();
    doc.text('b', 10, 10);
    doc.movePage(1, 3);
    expect((doc.pages[0]!.objects[0] as TextRun).text).toBe('b');
    expect((doc.pages[1]!.objects[0] as TextRun).text).toBe('a');
  });

  it('横竖向不互切（对照 portrait mode and landscape mode should not switch）', () => {
    const doc = new jsOFD({ orientation: 'p', unit: 'pt', format: 'a4' });
    expect(doc.getPageWidth()).toBeCloseTo(595.28, 1);
    doc.addPage();
    expect(doc.getPageWidth()).toBeCloseTo(595.28, 1);
    const ldoc = new jsOFD({ orientation: 'l', unit: 'pt', format: 'a4' });
    expect(ldoc.getPageWidth()).toBeCloseTo(841.89, 1);
    ldoc.addPage();
    expect(ldoc.getPageWidth()).toBeCloseTo(841.89, 1);
  });
});

/* ================= split_text_to_size.spec.js / fontmetrics ================= */

describe('文本度量（对照 split_text_to_size.spec.js）', () => {
  it('getStringUnitWidth 已知字宽（Helvetica l=222, H=722）', () => {
    const doc = new jsOFD();
    doc.setFont('helvetica');
    expect(doc.getStringUnitWidth('l')).toBeCloseTo(0.222, 4);
    expect(doc.getStringUnitWidth('H')).toBeCloseTo(0.722, 4);
    expect(doc.getStringUnitWidth('ll')).toBeCloseTo(0.444, 4);
  });

  it('getTextWidth = 单位宽×字号（对照 getTextWidth）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.setFont('helvetica');
    doc.setFontSize(16);
    expect(doc.getTextWidth('l')).toBeCloseTo(0.222 * 16, 4);
  });

  it('getCharWidthsArray（对照 getCharWidthsArray）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.setFont('helvetica');
    doc.setFontSize(16);
    const arr = doc.getCharWidthsArray('ll');
    expect(arr).toEqual([0.222 * 16, 0.222 * 16]);
    const arr10 = doc.getCharWidthsArray('ll', { fontSize: 10 });
    expect(arr10).toEqual([2.22, 2.22]);
  });

  it('splitTextToSize 断行（对照 splitTextToSize）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.setFontSize(16);
    const parts = doc.splitTextToSize('This is a test.', 85); // 30mm≈85pt
    expect(parts).toEqual(['This is a', 'test.']);
  });

  it('splitTextToSize 超长词硬切且内容无损（jsPDF 行为）', () => {
    const doc = new jsOFD({ unit: 'pt' });
    doc.setFontSize(16);
    const parts = doc.splitTextToSize('abcdefghijklmnop qrst', 60);
    // 长词超宽按字硬切；空格在行尾丢弃，内容除空格外完整保留
    expect(parts.join('').replace(/ /g, '')).toBe('abcdefghijklmnopqrst');
    for (const p of parts) {
      expect(doc.getTextWidth(p)).toBeLessThanOrEqual(60 + 0.001);
    }
  });
});

/* ================= outline / display-mode / viewerpreferences ================= */

describe('书签与视图（对照 outline/display-mode/viewerpreferences.spec.js）', () => {
  it('书签（对照 should create a bookmark，pt/in/mm 三种单位）', () => {
    for (const unit of ['pt', 'in', 'mm'] as const) {
      const doc = new jsOFD({ unit });
      doc.text('page1', 10, 10);
      doc.addPage();
      doc.text('page2', 10, 10);
      doc.outline.add(null, '第二章', { pageNumber: 2 });
      const xml = documentXml(doc);
      expect(xml).toMatch(/<ofd:Outline ID="\d+" Title="第二章">/);
    }
  });

  it('嵌套书签', () => {
    const doc = new jsOFD();
    const p = doc.outline.add(null, 'parent');
    doc.outline.add(p, 'child');
    expect(documentXml(doc)).toContain('Title="child"');
  });

  it('displayMode：zoom/layout/pageMode 全量（对照 display-mode.spec.js）', () => {
    const doc = new jsOFD();
    doc.setDisplayMode(2, 'continuous', 'UseNone');
    expect(documentXml(doc)).toContain('<ofd:Zoom>2</ofd:Zoom>');
    doc.setDisplayMode('200%', 'single', 'UseOutlines');
    expect(documentXml(doc)).toContain('<ofd:Zoom>2</ofd:Zoom>');
    doc.setDisplayMode('fullwidth', 'twoleft', 'UseThumbs');
    expect(documentXml(doc)).toContain('<ofd:ZoomMode>FitWidth</ofd:ZoomMode>');
    doc.setDisplayMode('fullheight', 'tworight', 'FullScreen');
    expect(documentXml(doc)).toContain('<ofd:ZoomMode>FitHeight</ofd:ZoomMode>');
    doc.setDisplayMode('fullpage', 'continuous');
    expect(documentXml(doc)).toContain('<ofd:ZoomMode>FitRect</ofd:ZoomMode>');
    doc.setDisplayMode('original', 'continuous');
    expect(documentXml(doc)).toContain('<ofd:ZoomMode>Default</ofd:ZoomMode>');
  });

  it('displayMode 非法值抛错（对照 should throw an error for invalid page modes）', () => {
    const doc = new jsOFD();
    expect(() => doc.setDisplayMode('invalid' as never)).toThrow(/zoom must be/);
    expect(() => doc.setDisplayMode(1, 'invalid' as never)).toThrow(/Layout mode must be/);
    expect(() => doc.setDisplayMode(1, 'continuous', 'invalid')).toThrow(/Page mode must be/);
  });

  it('viewerPreferences（对照 viewerpreferences.spec.js HideToolbar 等）', () => {
    const doc = new jsOFD();
    doc.viewerPreferences({
      HideToolbar: true,
      HideMenubar: true,
      HideWindowUI: true,
      FitWindow: true,
    });
    const xml = documentXml(doc);
    expect(xml).toContain('<ofd:HideToolbar>true</ofd:HideToolbar>');
    expect(xml).toContain('<ofd:HideMenubar>true</ofd:HideMenubar>');
    expect(xml).toContain('<ofd:HideWindowUI>true</ofd:HideWindowUI>');
    expect(xml).toContain('<ofd:FitWindow>true</ofd:FitWindow>');
  });

  it('viewerPreferences reset（对照 check if reset works）', () => {
    const doc = new jsOFD();
    doc.viewerPreferences({ HideToolbar: true });
    doc.viewerPreferences({ HideMenubar: true }, true);
    const xml = documentXml(doc);
    expect(xml).not.toContain('HideToolbar');
    expect(xml).toContain('<ofd:HideMenubar>true</ofd:HideMenubar>');
  });
});

/* ================= filetypeRecognition.spec.js / base64 ================= */

describe('图像输入识别（对照 filetypeRecognition.spec.js）', () => {
  function pngHeader(w: number, h: number): Uint8Array {
    const u8 = new Uint8Array(33);
    u8.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dv = new DataView(u8.buffer);
    u8.set([0x49, 0x48, 0x44, 0x52], 8); // "IHDR"
    dv.setUint32(16, w);
    dv.setUint32(20, h);
    return u8;
  }
  function b64(u8: Uint8Array): string {
    let s = '';
    for (const b of u8) s += String.fromCharCode(b);
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(u8).toString('base64');
  }

  it('png/jpeg/gif/bmp/tiff dataUrl 识别（对照 filetype dataUrl 系列）', () => {
    const doc = new jsOFD();
    const png = 'data:image/png;base64,' + b64(pngHeader(10, 10));
    doc.addImage(png, 'PNG', 0, 0, 10, 10);
    expect(doc.imageList[0]!.format).toBe('PNG');

    // JPEG SOF0
    const jpeg = new Uint8Array(200);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
    jpeg.set([0xff, 0xc0, 0, 17, 8], 20);
    const dv = new DataView(jpeg.buffer);
    dv.setUint16(25, 10);
    dv.setUint16(27, 20);
    doc.addImage('data:image/jpeg;base64,' + b64(jpeg), 'JPEG', 0, 0, 10, 10);
    expect(doc.imageList[1]!.format).toBe('JPEG');
  });

  it('裸 base64 + format（对照 jpeg base64 / png base64）', () => {
    const doc = new jsOFD();
    doc.addImage(b64(pngHeader(10, 10)), 'PNG', 0, 0, 10, 10);
    expect(doc.imageList[0]!.format).toBe('PNG');
  });

  it('UNKNOWN 数据抛错（对照 UNKNOWN base64）', () => {
    const doc = new jsOFD();
    const junk = b64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(() => doc.addImage(junk, 'PNG', 0, 0, 10, 10)).toThrow(
      /unsupported image format|unable to parse/,
    );
  });

  it('getImageProperties 从 dataUrl 提取（对照 extractImageFromDataUrl）', () => {
    const doc = new jsOFD();
    const props = doc.getImageProperties('data:image/png;base64,' + b64(pngHeader(320, 240)));
    expect(props.fileType).toBe('PNG');
    expect(props.width).toBe(320);
    expect(props.height).toBe(240);
    expect(props.bytes).toBeGreaterThan(0);
  });
});

/* ================= annotations.spec.js（链接） ================= */

describe('链接（对照 annotations.spec.js）', () => {
  it('textWithLink 输出 URI 动作（对照 should draw a link on the text）', () => {
    const doc = new jsOFD();
    doc.textWithLink('Open site', 10, 10, { url: 'https://example.com' });
    const c = content(doc);
    expect(c).toContain('URI="https://example.com"');
  });

  it('链接跨页页码（对照 link after add page）', () => {
    const doc = new jsOFD();
    doc.addPage();
    doc.setPage(2);
    doc.textWithLink('跳转', 10, 10, { pageNumber: 1 });
    const c = text(
      readZip(doc.output('uint8array') as Uint8Array),
      'Doc_0/Pages/Page_1/Content.xml',
    );
    expect(c).toContain('<ofd:Goto');
  });

  it('rect 链接区域（对照 should add a multiline link）', () => {
    const doc = new jsOFD();
    doc.link(10, 20, 50, 30, { url: 'https://example.com' });
    const run = doc.pages[0]!.objects.find((o) => o.t === 'link');
    expect(run).toBeDefined();
  });
});

/* ================= 返回 this 链式（unit.spec 惯例） ================= */

describe('链式调用（对照 unit.spec ...).toBe(doc.__private__)）', () => {
  it('绘图方法均返回 this', () => {
    const doc = new jsOFD();
    expect(doc.line(1, 2, 3, 4)).toBe(doc);
    expect(doc.triangle(1, 2, 3, 4, 5, 6, 'F')).toBe(doc);
    expect(doc.roundedRect(1, 2, 3, 4, 5, 6, 'F')).toBe(doc);
    expect(doc.ellipse(1, 2, 3, 4, 'F')).toBe(doc);
    expect(doc.circle(1, 2, 3, 'F')).toBe(doc);
    expect(doc.rect(1, 2, 3, 4, 'F')).toBe(doc);
    expect(doc.text('x', 1, 2)).toBe(doc);
    expect(doc.setFontSize(20)).toBe(doc);
    expect(doc.setLineWidth(1)).toBe(doc);
  });
});

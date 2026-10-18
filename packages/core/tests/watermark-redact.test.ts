/**
 * 水印与关键字脱敏测试。
 */

import { describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import type { ImageRun, PathRun, TextRun } from '../src/model';
import { extractText } from '../src/ofd-reader';

describe('addWatermark', () => {
  it('文字水印：居中、旋转、透明度，绘制在内容之上', () => {
    const doc = new jsOFD({ unit: 'mm', format: 'a4' });
    doc.text('机密文件', 20, 20);
    const before = doc.pages[0]!.objects.length;
    const stamped = doc.addWatermark({ text: '绝密', opacity: 0.2 });
    expect(stamped).toBe(1);
    const objs = doc.pages[0]!.objects;
    expect(objs.length).toBe(before + 1);
    const wm = objs[objs.length - 1] as TextRun;
    expect(wm.t).toBe('text');
    expect(wm.text).toBe('绝密');
    expect(wm.angle).toBe(45);
    expect(wm.opacity).toBeCloseTo(0.2, 3);
    // 居中：基线原点在页面中心左上方（旋转半宽补偿）
    expect(wm.x).toBeLessThan(doc.pages[0]!.width / 2);
    expect(wm.y).toBeLessThan(doc.pages[0]!.height / 2);
  });

  it('平铺模式产生多个水印，under 模式绘制在内容之下', () => {
    const doc = new jsOFD({ unit: 'mm', format: 'a4' });
    doc.text('正文', 20, 20);
    doc.addWatermark({ text: '草稿', mode: 'tile', fontSize: 24, layer: 'under' });
    const objs = doc.pages[0]!.objects;
    expect(objs.length).toBeGreaterThan(2);
    // under：水印对象在最前，正文在所有水印之后
    expect((objs[0] as TextRun).text).toBe('草稿');
    expect(objs.some((o) => (o as TextRun).text === '正文')).toBe(true);
  });

  it('指定页码（1-based）与多页', () => {
    const doc = new jsOFD({ unit: 'mm', format: 'a4' });
    doc.addPage('a4');
    doc.addPage('a4');
    doc.addWatermark({ text: 'W', pages: [2] });
    expect(doc.pages[0]!.objects.length).toBe(0);
    expect(doc.pages[1]!.objects.length).toBe(1);
    expect(doc.pages[2]!.objects.length).toBe(0);
  });

  it('图片水印：默认宽度 40% 页宽，纵横比保持', async () => {
    const doc = new jsOFD({ unit: 'mm', format: 'a4' });
    // 真实 2×1 PNG（encodePng 生成，sniffImage 可读出尺寸）
    const { encodePng } = await import('../src/png-encode');
    const png = await encodePng(new Uint8Array(2 * 1 * 4), 2, 1);
    doc.addWatermark({ image: png, imageFormat: 'PNG' });
    const img = doc.pages[0]!.objects[0] as ImageRun;
    expect(img.t).toBe('image');
    expect(img.w).toBeCloseTo(doc.pages[0]!.width * 0.4, 1);
    expect(img.h).toBeCloseTo(img.w / 2, 1); // 2:1 纵横比
  });
});

describe('redact', () => {
  it('block 模式：加黑色矩形 + 文本替换为空格，其余字形位置不变', () => {
    const doc = new jsOFD({ unit: 'mm', format: 'a4' });
    doc.setFont('simsun');
    doc.setFontSize(12);
    doc.text('姓名：王小明 电话：13800138000', 20, 30);
    const run = doc.pages[0]!.objects[0] as TextRun;
    const glyphWsBefore = run.glyphWs;

    const hits = doc.redact('王小明');
    expect(hits).toEqual([{ keyword: '王小明', page: 1, count: 1 }]);

    // 文本被空格替换（提取不再泄漏），长度不变
    const masked = doc.pages[0]!.objects[0] as TextRun;
    expect(masked.text).toBe('姓名：    电话：13800138000');
    expect(masked.text.length).toBe(run.text.length);
    expect(extractText(doc as never)[0]).not.toContain('王小明');

    // 版面不错位：字形推进数组保持原样
    expect(masked.glyphWs).toEqual(glyphWsBefore);

    // 增加一个覆盖矩形
    const rects = doc.pages[0]!.objects.filter((o): o is PathRun => o.t === 'path');
    expect(rects.length).toBe(1);
    expect(rects[0]!.fill).toBe(true);
    expect(rects[0]!.fillColor).toEqual([0, 0, 0]);
    expect(rects[0]!.ops.length).toBe(5);
    // 矩形起点在"姓名："之后
    expect(rects[0]!.ops[0]!.op === 'M' && rects[0]!.ops[0]!.x).toBeGreaterThan(masked.x);
  });

  it('asterisk 模式：关键字替换为 *', () => {
    const doc = new jsOFD({ unit: 'mm', format: 'a4' });
    doc.text('手机号 13800138000 有效', 20, 30);
    const hits = doc.redact('1380013', { mode: 'asterisk' });
    expect(hits[0]!.count).toBe(1);
    const run = doc.pages[0]!.objects[0] as TextRun;
    expect(run.text).toContain('*******8000');
  });

  it('多次出现与未命中关键字', () => {
    const doc = new jsOFD({ unit: 'mm', format: 'a4' });
    doc.text('绝密A', 20, 20);
    doc.text('绝密B', 20, 40);
    const hits = doc.redact('绝密', { mode: 'asterisk' });
    expect(hits[0]!.count).toBe(2);
    const texts = doc.pages[0]!.objects.map((o) => (o as TextRun).text);
    expect(texts).toContain('**A');
    expect(texts).toContain('**B');
    const miss = doc.redact('不存在');
    expect(miss).toEqual([{ keyword: '不存在', page: 0, count: 0 }]);
  });

  it('页码筛选', () => {
    const doc = new jsOFD({ unit: 'mm', format: 'a4' });
    doc.text('秘密一', 20, 20);
    doc.addPage('a4');
    doc.text('秘密二', 20, 20);
    doc.redact('秘密', { pages: [1], mode: 'asterisk' });
    expect((doc.pages[0]!.objects[0] as TextRun).text).toBe('**一');
    expect((doc.pages[1]!.objects[0] as TextRun).text).toBe('秘密二');
  });
});

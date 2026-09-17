import { describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';

describe('文本测量', () => {
  it('Helvetica 度量：getStringUnitWidth("Hello") = 2.278', () => {
    const doc = new jsOFD();
    // H=722 e=556 l=222 l=222 o=556 → 2278/1000
    expect(doc.getStringUnitWidth('Hello')).toBeCloseTo(2.278, 5);
  });

  it('Courier 等宽 600', () => {
    const doc = new jsOFD();
    doc.setFont('courier');
    expect(doc.getStringUnitWidth('Hello')).toBeCloseTo(3.0, 5);
  });

  it('中文全角宽度（宋体）', () => {
    const doc = new jsOFD();
    doc.setFont('simsun');
    expect(doc.getStringUnitWidth('你好')).toBeCloseTo(2.0, 5);
  });

  it('getTextWidth 按单位换算（mm，字号固定 pt）', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('simsun');
    doc.setFontSize(10); // 10pt
    // 2 × 10pt × 0.352778 = 7.0556mm
    expect(doc.getTextWidth('你好')).toBeCloseTo(7.0556, 4);
  });

  it('setFontSize/getFontSize 以 pt 计', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFontSize(18);
    expect(doc.getFontSize()).toBe(18);
  });
});

describe('splitTextToSize', () => {
  it('拉丁文按词断行', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('helvetica');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize('the quick brown fox jumps', 30);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(doc.getTextWidth(line)).toBeLessThanOrEqual(30.0001);
    }
    expect(lines.join(' ').replace(/\s+/g, ' ')).toContain('quick brown');
  });

  it('中文按字断行', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('simsun');
    doc.setFontSize(10); // 10pt → 全角 3.5278mm，30mm 每行 8 字
    const lines = doc.splitTextToSize('中华人民共和国国家版式文档标准', 30);
    expect(lines).toEqual(['中华人民共和国国', '家版式文档标准']);
  });

  it('换行符优先', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('simsun');
    doc.setFontSize(10);
    expect(doc.splitTextToSize('第一行\n第二行', 100)).toEqual(['第一行', '第二行']);
  });

  it('超长 token 硬切', () => {
    const doc = new jsOFD({ unit: 'mm' });
    doc.setFont('helvetica');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize('aaaaaaaaaaaaaaaaaaaaaaaa', 20);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(doc.getTextWidth(line)).toBeLessThanOrEqual(20.0001);
    }
  });
});

describe('页面与单位', () => {
  it('默认 A4 纵向 mm', () => {
    const doc = new jsOFD();
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 5);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 5);
  });

  it('横向 A4', () => {
    const doc = new jsOFD({ orientation: 'landscape' });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 5);
  });

  it('pt 单位 letter', () => {
    const doc = new jsOFD({ unit: 'pt', format: 'letter' });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(612, 3);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(792, 3);
  });

  it('自定义尺寸数组（默认竖向归一化，与 jsPDF 一致）', () => {
    const doc = new jsOFD({ unit: 'mm', format: [100, 60] });
    expect(doc.getPageWidth()).toBeCloseTo(60, 8);
    expect(doc.getPageHeight()).toBeCloseTo(100, 8);
    const doc2 = new jsOFD({ unit: 'mm', format: [100, 60], orientation: 'l' });
    expect(doc2.getPageWidth()).toBeCloseTo(100, 8);
    expect(doc2.getPageHeight()).toBeCloseTo(60, 8);
  });

  it('无效单位抛错', () => {
    expect(() => new jsOFD({ unit: 'xx' as never })).toThrow();
  });

  it('页面管理：add/set/insert/move/delete', () => {
    const doc = new jsOFD();
    doc.addPage();
    doc.addPage();
    expect(doc.getNumberOfPages()).toBe(3);
    doc.setPage(2);
    expect(doc.page).toBe(1);
    doc.insertPage(1);
    expect(doc.getNumberOfPages()).toBe(4);
    doc.movePage(4, 1);
    doc.deletePage(1);
    expect(doc.getNumberOfPages()).toBe(3);
  });
});

import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsOFD } from '../src/jsofd';
import { readZip, text } from './helpers/zipreader';

function buildSample(): Uint8Array {
  const doc = new jsOFD(); // A4 纵向 mm
  doc.setProperties({ title: 'jsOFD 冒烟测试', author: 'jsOFD' });
  doc.setFont('simsun');
  doc.setFontSize(12);
  doc.text('你好，OFD！', 10, 20);
  doc.setFont('helvetica');
  doc.setTextColor(255, 0, 0);
  doc.text('Hello jsOFD', 10, 30);
  doc.setDrawColor(0, 0, 255);
  doc.setFillColor(255, 255, 0);
  doc.setLineWidth(0.5);
  doc.rect(10, 40, 60, 30, 'FD');
  doc.setLineDashPattern([2, 1]);
  doc.line(10, 75, 70, 75);
  doc.addPage();
  doc.circle(50, 50, 20, 'S');
  doc.setFont('simsun');
  doc.text('第二页', 10, 20);
  doc.addPage([100, 60], 'l');
  doc.text('第三页', 5, 10);
  return doc.output('uint8array') as Uint8Array;
}

describe('OFD 包结构（GB/T 33190-2016）', () => {
  const zip = buildSample();
  const files = readZip(zip);

  it('包含全部结构文件（OFD.xml 首位，顺序对齐常规 OFD 包）', () => {
    expect([...files.keys()]).toEqual([
      'OFD.xml',
      'Doc_0/Document.xml',
      'Doc_0/PublicRes.xml',
      'Doc_0/Pages/Page_0/Content.xml',
      'Doc_0/Pages/Page_1/Content.xml',
      'Doc_0/Pages/Page_2/Content.xml',
    ]);
  });

  const ofd = text(files, 'OFD.xml');
  const doc = text(files, 'Doc_0/Document.xml');
  const pub = text(files, 'Doc_0/PublicRes.xml');
  const c0 = text(files, 'Doc_0/Pages/Page_0/Content.xml');
  const c1 = text(files, 'Doc_0/Pages/Page_1/Content.xml');
  const c2 = text(files, 'Doc_0/Pages/Page_2/Content.xml');

  it('OFD.xml：命名空间/版本/DocRoot/元数据', () => {
    expect(ofd).toContain('xmlns:ofd="http://www.ofdspec.org/2016"');
    expect(ofd).toContain('Version="1.0"');
    expect(ofd).toContain('DocType="OFD"');
    expect(ofd).toContain('<ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>');
    expect(ofd).toContain('<ofd:Title>jsOFD 冒烟测试</ofd:Title>');
    expect(ofd).toContain('<ofd:Author>jsOFD</ofd:Author>');
    expect(ofd).toMatch(/<ofd:DocID>[0-9a-f]{32}<\/ofd:DocID>/);
    expect(ofd).toContain('<ofd:CreationDate>');
  });

  it('Document.xml：A4 尺寸精确为 210×297mm，页面树完整', () => {
    expect(doc).toContain('<ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox>');
    expect(doc).toContain('<ofd:ApplicationBox>0 0 210 297</ofd:ApplicationBox>');
    expect(doc).toContain('<ofd:PublicRes>PublicRes.xml</ofd:PublicRes>');
    expect((doc.match(/<ofd:Page ID=/g) || []).length).toBe(3);
    expect(doc).toContain('BaseLoc="Pages/Page_0/Content.xml"');
    expect(doc).toContain('BaseLoc="Pages/Page_2/Content.xml"');
  });

  it('MaxUnitID ≥ 所有已分配 ID', () => {
    const maxId = Number(doc.match(/<ofd:MaxUnitID>(\d+)</)![1]);
    let maxSeen = 0;
    for (const xml of [doc, pub, c0, c1, c2]) {
      for (const m of xml.matchAll(/ID="(\d+)"/g)) {
        maxSeen = Math.max(maxSeen, Number(m[1]));
      }
    }
    expect(maxId).toBeGreaterThanOrEqual(maxSeen);
  });

  it('PublicRes.xml：颜色空间与字体声明', () => {
    expect(pub).toContain('<ofd:ColorSpace ID="1" Type="RGB" BitsPerComponent="8"/>');
    expect(pub).toContain('FontName="SimSun"');
    expect(pub).toContain('FamilyName="宋体"');
    expect(pub).toContain('FontName="Helvetica"');
    expect(pub).toContain('Charset="unicode"');
    expect(pub).toContain('BaseLoc="Res"');
  });

  it('Content.xml：文本对象（Boundary/Font/Size/TextCode/DeltaX）', () => {
    expect(c0).toContain('<ofd:TextObject');
    expect(c0).toContain('你好，OFD！');
    expect(c0).toMatch(/<ofd:TextCode X="0" Y="[^"]+" DeltaX="/);
    // 12pt 字号 → 12 × 0.352778 ≈ 4.2333mm
    expect(c0).toContain('Size="4.2333"');
    // 中文 12pt 步进 4.2333mm
    expect(c0).toContain('DeltaX="4.2333 4.2333');
  });

  it('文本颜色与字形样式', () => {
    expect(c0).toContain('<ofd:FillColor Value="255 0 0" ColorSpace="1"/>');
  });

  it('Content.xml：路径对象（矩形/虚线）', () => {
    expect(c0).toContain('<ofd:PathObject');
    expect(c0).toContain('Fill="true"');
    expect(c0).toContain('Stroke="true"');
    expect(c0).toContain('LineWidth="0.5"'); // 0.5mm 精确往返
    expect(c0).toContain('DashPattern="2 1"');
    expect(c0).toMatch(/<ofd:AbbreviatedData>M [\d.]+ [\d.]+ L /);
  });

  it('Page_1：圆（贝塞尔 B 命令近似，线宽 0.5mm 外扩 0.25）', () => {
    expect(c1).toMatch(/<ofd:AbbreviatedData>M 0\.25 20\.25 B /);
    expect((c1.match(/ B /g) || []).length).toBeGreaterThanOrEqual(4); // 4 段贝塞尔
    expect(/ C </.test(c1)).toBe(true); // 闭合命令
  });

  it('Page_2：自定义尺寸触发 Area 覆盖', () => {
    expect(c2).toContain('<ofd:Area>');
    expect(c2).toContain('<ofd:PhysicalBox>0 0 100 60</ofd:PhysicalBox>');
  });

  it('生成的 XML 全部 well-formed（xmllint，若可用）', () => {
    // Windows runner 上 `which` 来自 Git Bash，返回 cmd 无法解析的
    // MSYS 风格路径（/c/...），直接跳过；Ubuntu 任务仍会做此校验。
    if (process.platform === 'win32') {
      console.warn('跳过 xmllint 校验（Windows 上路径不可用）');
      return;
    }
    let xmllint: string;
    try {
      xmllint = execSync('which xmllint').toString().trim();
    } catch {
      console.warn('跳过 xmllint 校验（命令不可用）');
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'jsofd-xml-'));
    for (const [name, data] of files) {
      const p = join(dir, name.replace(/\//g, '_'));
      writeFileSync(p, data);
      execSync(`"${xmllint}" --noout "${p}"`);
    }
  });
});

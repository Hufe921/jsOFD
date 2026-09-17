/**
 * jsOFD playground application.
 *
 * Workspace (left): example presets with editable code, or PDF drag & drop
 * conversion. Preview (right): stacked pages with zoom; the SVG is a
 * projection of the same object model that serializes into the .ofd.
 */
import { jsOFD, version } from '@hufe921/jsofd';
import type { PageData } from '@hufe921/jsofd';
// pdfjs worker served as a local Vite asset (no CDN dependency).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const PT2MM = 25.4 / 72;

/* ---------------- example presets ---------------- */

const PRESETS: Record<string, string> = {
  文档排版: `// 报告式排版：字距 / 对齐 / 分栏线 / 页眉页脚
doc.setProperties({ title: 'jsOFD 排版样张', author: 'jsOFD' });

// —— 报头 ——
doc.setFont('helvetica');
doc.setTextColor(35, 74, 178);
doc.setFontSize(9);
doc.text('jsOFD · GB/T 33190-2016', 20, 16);
doc.setTextColor(56, 63, 72);
doc.text('Typography Specimen', 190, 16, { align: 'right' });
doc.setDrawColor(53, 101, 224);
doc.setLineWidth(0.6);
doc.line(20, 20, 190, 20);

doc.setTextColor(17, 24, 34);
doc.setFont('simhei');
doc.setFontSize(26);
doc.text('版式文档排版样张', 105, 36, { align: 'center', charSpace: 1.5 });

doc.setFont('simsun');
doc.setFontSize(10.5);
doc.setTextColor(56, 63, 72);
doc.text('宋体正文 · 黑体标题 · 楷体引文 · Helvetica 数字', 105, 46, { align: 'center', charSpace: 0.5 });

// —— 引言（楷体 + 缩进）——
doc.setFont('kaiti');
doc.setTextColor(50, 57, 66);
const 引言 = '版式文档（Fixed-layout Document）保持原始排版恒定不变，是电子公文、电子发票、电子证照与电子档案的法定载体。jsOFD 以与 jsPDF 相似的编程接口，生成符合国家标准的 OFD 文件。';
doc.text(引言, 24, 60, { maxWidth: 162, lineHeightFactor: 1.7 });

// —— 章节一 ——
doc.setDrawColor(53, 101, 224);
doc.setLineWidth(1.4);
doc.line(20, 88, 26, 88);
doc.setLineWidth(0.2);
doc.line(26, 88, 190, 88);
doc.setFont('simhei');
doc.setTextColor(17, 24, 34);
doc.setFontSize(13);
doc.text('1  对齐与字距', 20, 96);

doc.setFont('simsun');
doc.setFontSize(11);
doc.setTextColor(28, 35, 46);
const 正文 = 'jsOFD 支持左对齐、居中、右对齐与两端对齐四种对齐方式，并可通过 charSpace 精确控制字距。两端对齐会自动在整行范围内均匀分配字间空隙，与中文出版规范一致，适用于正文段落排版。';
doc.text(正文, 20, 106, { maxWidth: 165, align: 'justify', lineHeightFactor: 1.75 });

doc.setFontSize(10);
doc.setTextColor(62, 69, 78);
doc.text('left aligned', 20, 136);
doc.text('center aligned', 102.5, 136, { align: 'center' });
doc.text('right aligned', 190, 136, { align: 'right' });

// —— 章节二 ——
doc.setDrawColor(53, 101, 224);
doc.setLineWidth(1.4);
doc.line(20, 152, 26, 152);
doc.setLineWidth(0.2);
doc.line(26, 152, 190, 152);
doc.setFont('simhei');
doc.setTextColor(17, 24, 34);
doc.setFontSize(13);
doc.text('2  字体与数字', 20, 160);

doc.setFont('simsun');
doc.setFontSize(11);
doc.setTextColor(28, 35, 46);
doc.text('中文宋体 与 Latin 混排 2026-09-15', 20, 172);
doc.setFont('kaiti');
doc.text('中文楷体 引文样式', 20, 184);
doc.setFont('simhei');
doc.text('中文黑体 强调样式', 20, 196);
doc.setFont('helvetica');
doc.text('Helvetica 0123456789', 20, 208);
doc.setFont('courier');
doc.text('Courier mono 0123456789', 20, 220);

// —— 页脚 ——
doc.setFont('simsun');
doc.setFontSize(8.5);
doc.setTextColor(72, 79, 88);
doc.setDrawColor(201, 206, 214);
doc.setLineWidth(0.3);
doc.line(20, 276, 190, 276);
doc.text('jsOFD Typography Specimen', 20, 283);
doc.putTotalPages();
doc.text('第 1 页 / 共 {total} 页', 190, 283, { align: 'right' });
`,

  图形绘制: `// 矩形/圆角矩形/圆/椭圆/三角/虚线/线帽/贝塞尔
doc.setFont('simhei');
doc.setFontSize(16);
doc.text('图形绘制', 105, 25, { align: 'center' });
doc.setFont('simsun');
doc.setFontSize(10);

doc.setLineWidth(0.4);
doc.setFillColor(255, 242, 204);
doc.setDrawColor(160, 100, 20);
doc.rect(30, 40, 50, 30, 'FD');
doc.text('矩形', 55, 80, { align: 'center' });

doc.setFillColor(204, 235, 255);
doc.setDrawColor(30, 90, 180);
doc.roundedRect(100, 40, 50, 30, 5, 5, 'FD');
doc.text('圆角矩形', 125, 80, { align: 'center' });

doc.setFillColor(220, 245, 220);
doc.setDrawColor(30, 140, 60);
doc.circle(55, 110, 15, 'FD');
doc.ellipse(125, 110, 22, 13, 'FD');
doc.text('圆 / 椭圆', 90, 135, { align: 'center' });

doc.setFillColor(245, 220, 240);
doc.setDrawColor(170, 40, 150);
doc.triangle(40, 175, 65, 145, 90, 175, 'FD');
doc.text('三角形', 65, 185, { align: 'center' });

doc.setDrawColor(60, 60, 60);
doc.setLineWidth(0.3);
doc.line(105, 150, 160, 150);
doc.setLineDashPattern([3, 1.5], 1);
doc.line(105, 160, 160, 160);
doc.setLineDashPattern([1, 1], 0);
doc.line(105, 170, 160, 170);
doc.setLineDashPattern([]);
doc.text('实线 / 虚线 / 点线', 132, 182, { align: 'center' });

doc.setLineWidth(1.2);
doc.setDrawColor(200, 40, 40);
doc.setLineCap('round');
doc.line(35, 200, 75, 200);
doc.setDrawColor(40, 40, 200);
doc.setLineCap('square');
doc.line(35, 208, 75, 208);

doc.setDrawColor(20, 130, 200);
doc.setLineWidth(0.6);
doc.lines([[10, 30], [25, -20], [40, 10], [55, -25], [70, 20]], 100, 225, 1, 1, 'S', false);
`,

  图片嵌入: `// Canvas 动态生图 → 原样嵌入 PNG（旋转/透明/去重）
doc.setFont('simhei');
doc.setFontSize(16);
doc.text('图片嵌入', 105, 25, { align: 'center' });
doc.setFont('simsun');
doc.setFontSize(10);
doc.text('图片由 Canvas 动态生成，PNG 原样嵌入无需转码：', 30, 40);

const c1 = document.createElement('canvas');
c1.width = 320; c1.height = 200;
const g = c1.getContext('2d');
const grad = g.createLinearGradient(0, 0, 320, 200);
grad.addColorStop(0, '#3f6fd8'); grad.addColorStop(1, '#7ec8ff');
g.fillStyle = grad; g.fillRect(0, 0, 320, 200);
g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif';
g.fillText('jsOFD', 20, 60);
g.font = '16px sans-serif';
g.fillText('Image embedded as PNG', 20, 95);
g.beginPath(); g.arc(260, 140, 40, 0, Math.PI * 2);
g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();

const c2 = document.createElement('canvas');
c2.width = 120; c2.height = 120;
const g2 = c2.getContext('2d');
g2.fillStyle = '#fff'; g2.fillRect(0, 0, 120, 120);
g2.fillStyle = '#111';
for (let i = 0; i < 8; i++) {
  for (let j = 0; j < 8; j++) {
    if ((i * 7 + j * 13 + (i * j) % 5) % 3 !== 0) {
      g2.fillRect(10 + i * 13, 10 + j * 13, 11, 11);
    }
  }
}

doc.addImage(c1, { x: 30, y: 50, w: 90, h: 56 });
doc.addImage(c2, { x: 130, y: 50, w: 30, h: 30 });
doc.text('旋转 30°：', 30, 130);
doc.addImage(c1, { x: 70, y: 122, w: 60, h: 37.5, rotation: 30 });
doc.addImage(c1, { x: 30, y: 195, w: 60, h: 37.5, opacity: 0.5 });
doc.text('半透明 opacity 0.5', 100, 218);
doc.text('同一图片多次引用只存一份资源。', 30, 185);
`,

  电子发票: `// 横版发票版式（自定义纸张 210×120mm）
doc.setProperties({ title: '电子发票（普通发票）' });
doc.setFont('simhei');
doc.setFontSize(7);
doc.text('电子发票（普通发票）', 105, 8, { align: 'center' });
doc.setLineWidth(0.5);
doc.setDrawColor(150, 60, 20);
doc.line(10, 11, 200, 11);

doc.setFont('simsun');
doc.setFontSize(4.2);
doc.text('购买方', 14, 18);
doc.text('名    称：某某科技有限公司', 64, 18);
doc.text('纳税人识别号：91110108MA01XXXXXX', 64, 23);
doc.text('地    址：北京市海淀区中关村大街 1 号', 64, 28);
doc.text('价税合计（大写）壹万零陆佰圆整', 136, 18);
doc.setFont('courier');
doc.setFontSize(5);
doc.text('(小写) ¥10600.00', 168, 25);
doc.setFont('simsun');
doc.setFontSize(4.2);

const rows = [
  ['货物或应税劳务、服务名称', '规格型号', '单位', '数量', '单价', '金额', '税率/税额'],
  ['*信息技术服务*软件开发服务', '—', '次', '1', '10000.00', '10000.00', '6% / 600.00'],
  ['*信息技术服务*运维服务', '—', '年', '1', '0.00', '0.00', '—'],
  ['合    计', '', '', '', '', '10000.00', '600.00'],
];
const cols = [12, 72, 96, 106, 116, 134, 158];
doc.setFillColor(252, 246, 236);
rows.forEach((row, r) => {
  const y = 38 + r * 8;
  if (r === 0) doc.rect(12, y - 5, 186, 8, 'F');
  row.forEach((cell, ci) => doc.text(cell, cols[ci] + (ci === 0 ? 2 : 0), y));
  doc.setDrawColor(180, 150, 120);
  doc.setLineWidth(0.2);
  doc.line(12, y + 3, 198, y + 3);
});
doc.setDrawColor(150, 60, 20);
doc.setLineWidth(0.5);
doc.rect(12, 33, 186, 35, 'S');

doc.setFontSize(4.2);
doc.text('销售方', 14, 78);
doc.text('名    称：云服务股份有限公司', 64, 78);
doc.text('纳税人识别号：91110000MA02YYYYYY', 64, 83);
doc.text('备    注：本发票由 jsOFD 生成，仅作格式演示。', 136, 78);
doc.text('开票人：jsOFD    开票日期：2026-09-15', 150, 95);
`,

  综合演示: `// 多页 / 链接 / 书签 / 附件 / 视图
doc.setProperties({ title: 'jsOFD 综合演示', author: 'jsOFD', keywords: 'OFD,GB/T 33190' });

doc.setFont('simsun');
doc.setFontSize(20);
doc.text('jsOFD 综合演示文档', 105, 30, { align: 'center' });
doc.setFontSize(10);
doc.setTextColor(60, 64, 70);
doc.text('多页 · 超链接 · 书签大纲 · 附件 · 视图设置', 105, 40, { align: 'center' });
doc.setTextColor(0, 0, 0);
doc.setDrawColor(31, 119, 180);
doc.line(40, 46, 170, 46);

const 简介 = 'OFD（Open Fixed-layout Document）是我国自主研发的版式文档国家标准 GB/T 33190-2016，广泛应用于电子发票、电子公文、电子证照、电子合同等领域。jsOFD 参照 jsPDF 的 API 设计，让前端与 Node 开发者以极低的成本切换到国产版式标准。';
doc.setFontSize(11);
doc.text(简介, 40, 58, { maxWidth: 130, lineHeightFactor: 1.6 });

doc.setTextColor(0, 0, 255);
doc.textWithLink('→ 打开 jsPDF（GitHub 超链接）', 40, 110, { url: 'https://github.com/parallax/jsPDF' });
doc.setTextColor(0, 0, 0);

doc.addPage();
doc.setFontSize(14);
doc.text('页面管理', 30, 30);
doc.setFontSize(11);
doc.text('本页由 addPage() 添加；支持 setPage / insertPage / deletePage / movePage。', 30, 42);
doc.setTextColor(0, 0, 255);
doc.textWithLink('→ 返回第一页（文档内跳转）', 30, 56, { pageNumber: 1 });
doc.setTextColor(0, 0, 0);

const 章 = doc.outline.add(null, '封面与简介', { pageNumber: 1 });
doc.outline.add(章, '超链接示例', { pageNumber: 1 });
doc.outline.add(null, '页面管理', { pageNumber: 2 });

doc.addFileAsAttachment('说明.txt', 'jsOFD 综合演示生成的附件。', { format: 'txt' });
doc.setDisplayMode('fullwidth');
`,

  表格报告: `// 自动分页表格 + 页眉页脚 + 批注（新功能一览）
doc.setProperties({ title: '项目月度报表' });

const rows = Array.from({ length: 38 }, (_, i) => [
  String(i + 1).padStart(2, '0'),
  ['平台研发', '数据治理', '安全加固', '运维保障'][i % 4],
  ['进行中', '已完成', '已排期'][i % 3],
  (Math.random() * 90 + 10).toFixed(1) + '%',
]);

let pageRuns = 0;
const endY = doc.table(15, 30, {
  columns: [
    { header: '编号', width: 18 },
    { header: '项目线', width: 60 },
    { header: '状态', width: 40, align: 'center' },
    { header: '完成度', align: 'right' },
  ],
  rows,
  style: {
    fontSize: 10.5,
    headFill: [31, 64, 158],
    zebra: [[255, 255, 255], [242, 246, 252]],
    cellPadding: 2.5,
  },
  autoPage: true,
  bottomMargin: 24,
  onNewPage: () => pageRuns++,
});

// 页眉页脚：覆盖每一页
doc.headerFooter({
  header: (d, { pageNumber }) => {
    d.setFont('simhei').setFontSize(9).setTextColor(90, 98, 110);
    d.text('项目月度报表 · 机密', 15, 14);
    d.setTextColor(0, 0, 0);
    d.setDrawColor(200, 208, 220).setLineWidth(0.3).line(15, 17, 195, 17);
  },
  footer: (d, { pageNumber, pageCount }) => {
    d.setFont('simsun').setFontSize(9).setTextColor(90, 98, 110);
    d.text('第 ' + pageNumber + ' 页 / 共 ' + pageCount + ' 页', 105, 288, { align: 'center' });
    d.setTextColor(0, 0, 0);
  },
});

// 批注：高亮最后一行 + 自由文本说明
doc.addAnnotation('highlight', 15, endY - 8, 180, 7);
doc.addAnnotation('freetext', 15, endY + 6, 180, 8, {
  text: '注：完成度为系统自动统计，如有疑问请联系 PMO。',
  color: [200, 40, 40],
  fontSize: 10,
});

log('表格结束 Y = ' + endY.toFixed(1) + 'mm，自动分页 ' + pageRuns + ' 次');
`,
};
/* ---------------- preset descriptions ---------------- */

const PRESET_DESC: Record<string, string> = {
  文档排版: '标题 / 对齐 / 字距 / 两端对齐 / 页脚总页数',
  图形绘制: '矩形 / 圆 / 椭圆 / 三角 / 虚线 / 线帽 / 贝塞尔',
  图片嵌入: 'Canvas 生成 → PNG 原样嵌入 / 旋转 / 透明 / 去重',
  电子发票: '横版发票版式（自定义纸张 + 表格线）',
  综合演示: '多页 / 超链接 / 书签大纲 / 附件 / 初始视图',
  表格报告: 'doc.table 自动分页表格 / 页眉页脚 / 批注',
};

/* ---------------- embedded CJK font ---------------- */

/**
 * Two embedded fonts keep the visual distinction of Chinese typography:
 * serif (Noto Serif SC ≈ 宋体) for body styles and sans (Noto Sans SC ≈
 * 黑体) for headings — matching what readers would use for the original
 * font names. Both are TrueType as GB/T 33190 requires for FontFile.
 */
const SERIF_FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSerifSC-Regular.ttf`;
const SANS_FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansSC-Regular.ttf`;
const SERIF_FAMILY = 'Noto Serif SC';
const SANS_FAMILY = 'Noto Sans SC';
let serifFont: Uint8Array | null = null;
let sansFont: Uint8Array | null = null;

async function fetchFont(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    console.warn('[jsOFD playground] font unavailable:', url, e);
    return null;
  }
}

async function loadEmbeddedFont(): Promise<void> {
  [serifFont, sansFont] = await Promise.all([fetchFont(SERIF_FONT_URL), fetchFont(SANS_FONT_URL)]);
}

/** Register the embedded fonts (serif keys shadow 宋体/楷体/仿宋, sans shadows 黑体). */
function registerEmbeddedFont(d: jsOFD): void {
  if (serifFont) {
    for (const key of ['simsun', 'kaiti', 'fangsong']) {
      d.addFontTtf(key, SERIF_FAMILY, serifFont);
    }
  }
  if (sansFont) {
    d.addFontTtf('simhei', SANS_FAMILY, sansFont);
  }
}

/* ---------------- state ---------------- */

let doc: jsOFD | null = null;
let fileName = 'playground.ofd';
let pageIdx = 0;
let zoom: number | null = null; // null = fit width

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/* ---------------- log ---------------- */

function log(msg: string, cls = ''): void {
  const el = $('log');
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = msg + '\n';
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
  updateLogCount();
}

function updateLogCount(): void {
  const n = $('log').querySelectorAll('span').length;
  $('logCount').textContent = n ? `${n} 条` : '';
}

/* ---------------- SVG page rendering ---------------- */

const FONT_MAP: Record<string, string> = {
  helvetica: 'Helvetica, Arial, sans-serif',
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", monospace',
  simsun: '"Noto Serif SC", SimSun, 宋体, serif',
  simhei: '"Noto Sans SC", SimHei, 黑体, sans-serif',
  kaiti: '"Noto Serif SC", KaiTi, 楷体, serif',
  fangsong: '"Noto Serif SC", FangSong, 仿宋, serif',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toDataUrl(u8: Uint8Array, format: string): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode(...u8.subarray(i, i + CH));
  }
  const mime = format === 'JPEG' ? 'jpeg' : format.toLowerCase();
  return `data:image/${mime};base64,${btoa(s)}`;
}

function pageSvg(page: PageData, z: number): string {
  const W = page.width * PT2MM;
  const H = page.height * PT2MM;
  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * z).toFixed(1)}" height="${(H * z).toFixed(1)}" ` +
    `viewBox="0 0 ${W.toFixed(3)} ${H.toFixed(3)}">` +
    `<rect width="100%" height="100%" fill="#fff"/>`;
  for (const o of page.objects) {
    if (o.t === 'text') {
      const x = o.x * PT2MM;
      const y = o.y * PT2MM;
      // Attribute values go through esc(): the font list contains double
      // quotes, and an unescaped font-family="" broke the attribute and
      // silently dropped the intended font (fallback metrics ⇒ drifted text).
      const family = esc(FONT_MAP[o.fontKey] || 'sans-serif');
      const weight = o.style === 'bold' || o.style === 'bolditalic' ? ' font-weight="bold"' : '';
      const italic = o.style === 'italic' || o.style === 'bolditalic' ? ' font-style="italic"' : '';
      // Per-glyph advances (PDF import / justify) pin the run width exactly —
      // without textLength the browser's fallback font metrics drift and the
      // run overflows the position the .ofd reader would place it at.
      const adv = o.glyphWs ? o.glyphWs.reduce((s, w) => s + w, 0) * (o.hScale ?? 1) : null;
      const tl =
        adv !== null && o.text.length > 1
          ? ` textLength="${(adv * PT2MM).toFixed(4)}" lengthAdjust="spacing"`
          : '';
      const ls = !tl && o.charSpace ? ` letter-spacing="${(o.charSpace * PT2MM).toFixed(4)}"` : '';
      const tr = o.angle ? ` transform="rotate(${o.angle} ${x} ${y})"` : '';
      svg +=
        `<text x="${x}" y="${y}" font-size="${(o.size * PT2MM).toFixed(3)}" font-family="${family}"` +
        weight +
        italic +
        ls +
        tl +
        ` fill="rgb(${o.color.join(',')})"` +
        tr +
        `>${esc(o.text)}</text>`;
    } else if (o.t === 'path') {
      let d = '';
      for (const op of o.ops) {
        if (op.op === 'M') d += `M${op.x * PT2MM} ${op.y * PT2MM} `;
        else if (op.op === 'L') d += `L${op.x * PT2MM} ${op.y * PT2MM} `;
        else if (op.op === 'C')
          d += `C${op.x1 * PT2MM} ${op.y1 * PT2MM} ${op.x2 * PT2MM} ${op.y2 * PT2MM} ${op.x * PT2MM} ${op.y * PT2MM} `;
        else if (op.op === 'Z') d += 'Z ';
      }
      const fill = o.fill ? ` fill="rgb(${o.fillColor.join(',')})"` : ' fill="none"';
      const stroke = o.stroke
        ? ` stroke="rgb(${o.strokeColor.join(',')})" stroke-width="${(o.lineWidth * PT2MM).toFixed(3)}"` +
          (o.dash ? ` stroke-dasharray="${o.dash.pattern.map((v) => v * PT2MM).join(' ')}"` : '')
        : ' stroke="none"';
      svg += `<path d="${d.trim()}"${fill}${stroke}/>`;
    } else if (o.t === 'image') {
      const url = toDataUrl(o.imageRef.data, o.imageRef.format);
      const ix = o.x * PT2MM;
      const iy = o.y * PT2MM;
      const iw = o.w * PT2MM;
      const ih = o.h * PT2MM;
      const tr = o.angle
        ? ` transform="rotate(${o.angle} ${(ix + iw / 2).toFixed(3)} ${(iy + ih / 2).toFixed(3)})"`
        : '';
      svg += `<image x="${ix}" y="${iy}" width="${iw}" height="${ih}" href="${url}"${tr}/>`;
    } else if (o.t === 'link') {
      svg +=
        `<rect x="${o.x * PT2MM}" y="${o.y * PT2MM}" width="${o.w * PT2MM}" height="${o.h * PT2MM}" ` +
        `fill="rgba(59,110,245,.06)" stroke="#3b6ef5" stroke-width="0.2" stroke-dasharray="1 1"/>`;
    }
  }
  return svg + '</svg>';
}

/* ---------------- preview ---------------- */

function fitZoom(): number {
  if (!doc) return 1;
  const wrap = $('pvScroll');
  const W = doc.pages[0]!.width * PT2MM;
  // Fill the pane width — the paper is the main content, not a thumbnail.
  return Math.min(6, Math.max(0.5, (wrap.clientWidth - 56) / W));
}

function render(): void {
  if (!doc) return;
  if (pageIdx >= doc.pages.length) pageIdx = doc.pages.length - 1;
  const z = zoom ?? fitZoom();
  const pages = doc.pages;
  $('pvEmpty').style.display = 'none';
  const stack = document.createElement('div');
  stack.id = 'pvStack';
  pages.forEach((page, i) => {
    const slot = document.createElement('div');
    slot.className = 'page-slot';
    slot.dataset.page = String(i);
    const tag = document.createElement('div');
    tag.className = 'page-tag';
    tag.textContent = `第 ${i + 1} 页 · ${(page.width * PT2MM).toFixed(0)}×${(page.height * PT2MM).toFixed(0)} mm`;
    slot.appendChild(tag);
    slot.insertAdjacentHTML('beforeend', pageSvg(page, z));
    stack.appendChild(slot);
    if (i < pages.length - 1) {
      const gap = document.createElement('div');
      gap.className = 'page-gap';
      stack.appendChild(gap);
    }
  });
  const scroll = $('pvScroll');
  scroll.querySelectorAll('.page-slot,.page-gap,#pvStack').forEach((n) => n.remove());
  scroll.appendChild(stack);
  $('docInfo').textContent = fileName;
  updatePager();
  scrollToPage(pageIdx, false);
}

function updatePager(): void {
  $('pageInfo').textContent = `${pageIdx + 1} / ${doc ? doc.pages.length : '–'}`;
  const page = doc?.pages[pageIdx];
  $('objInfo').textContent = page ? `${page.objects.length} 对象` : '';
  ($('pgPrev') as HTMLButtonElement).disabled = pageIdx === 0;
  ($('pgNext') as HTMLButtonElement).disabled = !doc || pageIdx >= doc.pages.length - 1;
}

function scrollToPage(idx: number, smooth = true): void {
  const scroll = $('pvScroll');
  const slot = document.querySelector(`.page-slot[data-page="${idx}"]`) as HTMLElement | null;
  if (!slot) {
    scroll.scrollTop = 0;
    return;
  }
  // Offset relative to the scroll container (getBoundingClientRect works
  // regardless of which ancestor is the CSS offsetParent).
  const top =
    slot.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 16;
  scroll.scrollTo({ top: Math.max(top, 0), behavior: smooth ? 'smooth' : 'auto' });
  updatePager();
}

/* ---------------- run examples ---------------- */

function run(): void {
  const code = ($('code') as HTMLTextAreaElement).value;
  const d = new jsOFD({ unit: 'mm', format: 'a4' });
  registerEmbeddedFont(d);
  try {
    const fn = new Function('doc', 'jsOFD', 'log', code) as (
      dd: jsOFD,
      J: typeof jsOFD,
      l: typeof log,
    ) => void;
    fn(d, jsOFD, log);
  } catch (e) {
    log('✗ 运行出错: ' + (e as Error).message, 'err');
    return;
  }
  doc = d;
  pageIdx = 0;
  fileName = currentPreset === '电子发票' ? '发票演示.ofd' : 'playground.ofd';
  render();
  const objects = d.pages.reduce((s, p) => s + p.objects.length, 0);
  const bytes = (d.output('uint8array') as Uint8Array).length;
  log(`✓ 生成成功: ${d.pages.length} 页 / ${objects} 个对象 / ${bytes} 字节`, 'ok');
}

let currentPreset = '文档排版';

function selectPreset(name: string): void {
  currentPreset = name;
  document.querySelectorAll('.preset').forEach((n) => n.classList.remove('on'));
  document.querySelector(`.preset[data-name="${name}"]`)?.classList.add('on');
  ($('code') as HTMLTextAreaElement).value = PRESETS[name]!;
}

/* ---------------- PDF conversion ---------------- */

let selectedPdf: File | null = null;

async function convertPdf(): Promise<void> {
  if (!selectedPdf) return;
  const btn = $('convert') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = '转换中…';
  log(`⏳ 解析 ${selectedPdf.name} (${(selectedPdf.size / 1024).toFixed(1)} KB)`, 'dim');
  try {
    const { pdfToOfd } = await import('@hufe921/jsofd/pdf');
    const buf = new Uint8Array(await selectedPdf.arrayBuffer());
    const t0 = performance.now();
    // Dev serves pdfjs assets from the workspace node_modules; the production
    // bundle carries a copy under assets/pdfjs (see copyPdfjsAssets plugin).
    const base = import.meta.env.BASE_URL;
    const pdfAssets = import.meta.env.DEV
      ? `${base}node_modules/pdfjs-dist/`
      : `${base}assets/pdfjs/`;
    const converted = await pdfToOfd(buf, {
      workerSrc: workerUrl,
      cMapUrl: `${pdfAssets}cmaps/`,
      standardFontDataUrl: `${pdfAssets}standard_fonts/`,
      onProgress: (i, n) => log(`  第 ${i + 1}/${n} 页…`, 'dim'),
    });
    registerEmbeddedFont(converted);
    doc = converted;
    pageIdx = 0;
    fileName = selectedPdf.name.replace(/\.pdf$/i, '') + '.ofd';
    render();
    const objects = converted.pages.reduce((s, p) => s + p.objects.length, 0);
    const bytes = (converted.output('uint8array') as Uint8Array).length;
    log(
      `✓ 转换完成: ${converted.pages.length} 页 / ${objects} 个对象 / ${bytes} 字节 / ${Math.round(performance.now() - t0)}ms`,
      'ok',
    );
  } catch (e) {
    log('✗ 转换失败: ' + (e as Error).message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '▸ 转换为 OFD';
  }
}

function setPdfFile(file: File | null): void {
  selectedPdf = file;
  const chip = $('fileChip');
  const has = !!file;
  chip.style.display = has ? 'flex' : 'none';
  ($('clearFile') as HTMLButtonElement).style.display = has ? 'inline-flex' : 'none';
  ($('convert') as HTMLButtonElement).disabled = !has;
  if (file) {
    $('fileName').textContent = file.name;
    $('fileSize').textContent = `${(file.size / 1024).toFixed(1)} KB`;
  }
}

/* ---------------- init ---------------- */

function switchTab(name: 'examples' | 'pdf'): void {
  $('tab-examples').classList.toggle('on', name === 'examples');
  $('tab-pdf').classList.toggle('on', name === 'pdf');
  $('panel-examples').classList.toggle('hidden', name !== 'examples');
  $('panel-pdf').classList.toggle('hidden', name !== 'pdf');
}

async function bootstrap(): Promise<void> {
  // Browsers restore per-container scroll offsets after a reload, which left
  // the preview half-scrolled under the toolbar. Disable that and let
  // render()/scrollToPage() own the position.
  history.scrollRestoration = 'manual';
  $('pvScroll').scrollTop = 0;

  $('ver').textContent = 'v' + version;
  await loadEmbeddedFont();
  const loaded = [serifFont && '宋体系', sansFont && '黑体'].filter(Boolean).join(' + ');
  log(
    loaded
      ? `字体已嵌入（TrueType · 全部 GB2312 汉字与常用符号 · ${loaded}）：生成的 .ofd 在任何阅读器中中文显示一致`
      : '内置字体加载失败，中文将依赖阅读器本地字体',
    loaded ? 'dim' : 'err',
  );

  // presets
  const wanted = new URLSearchParams(location.search).get('preset');
  if (wanted && PRESETS[wanted]) currentPreset = wanted;
  const presetsEl = $('presets');
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'preset';
    b.dataset.name = name;
    const t = document.createElement('b');
    t.textContent = name;
    const d = document.createElement('span');
    d.textContent = PRESET_DESC[name] ?? '';
    b.append(t, d);
    b.addEventListener('click', () => {
      selectPreset(name);
      run();
    });
    presetsEl.appendChild(b);
  }
  selectPreset(currentPreset);

  // tabs
  $('tab-examples').addEventListener('click', () => switchTab('examples'));
  $('tab-pdf').addEventListener('click', () => switchTab('pdf'));

  // run / download
  $('run').addEventListener('click', run);
  $('download').addEventListener('click', () => {
    if (!doc) {
      log('✗ 请先运行示例或转换 PDF', 'err');
      return;
    }
    doc.save(fileName);
    log(`⤓ 已触发下载 ${fileName}`);
  });

  // pager + zoom
  const setZoom = (z: number | null): void => {
    zoom = z === null ? null : Math.min(5, Math.max(0.5, z));
    $('zoomPct').textContent = zoom ? `${Math.round(zoom * 100)}%` : '适应';
    if (doc) render();
  };
  $('zoomIn').addEventListener('click', () => setZoom((zoom ?? fitZoom()) + 0.15));
  $('zoomOut').addEventListener('click', () => setZoom((zoom ?? fitZoom()) - 0.15));
  $('zoomFit').addEventListener('click', () => setZoom(null));
  window.addEventListener('resize', () => {
    if (zoom === null && doc) render();
  });

  // Page navigation: wheel of the pager + keyboard.
  const goPage = (delta: number): void => {
    if (!doc) return;
    const next = Math.min(Math.max(pageIdx + delta, 0), doc.pages.length - 1);
    if (next !== pageIdx) {
      pageIdx = next;
      scrollToPage(pageIdx);
    }
  };
  $('pgPrev').addEventListener('click', () => goPage(-1));
  $('pgNext').addEventListener('click', () => goPage(1));
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
      return;
    }
    const inField = (e.target as HTMLElement)?.matches?.('input, textarea');
    if (inField) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      goPage(1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      goPage(-1);
    }
  });

  // log bar
  $('logbar').addEventListener('click', () => {
    $('logbar').classList.toggle('open');
    $('log').classList.toggle('open');
  });

  // drag & drop
  const drop = $('drop');
  const fileInput = $('pdfFile') as HTMLInputElement;
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f && /\.pdf$/i.test(f.name)) setPdfFile(f);
    else log('✗ 请拖入 .pdf 文件', 'err');
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) setPdfFile(f);
  });
  $('convert').addEventListener('click', () => void convertPdf());
  $('clearFile').addEventListener('click', () => {
    setPdfFile(null);
    fileInput.value = '';
  });

  run();
}

void bootstrap();

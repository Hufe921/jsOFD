/**
 * 生成最小测试 PDF（文本 + 矩形 + 直线 + 贝塞尔 + 颜色/线宽/虚线）
 * 供 pdf→ofd 转换测试使用。PDF 1.4，Base14 字体，无压缩。
 */
export function makeFixturePdf(): Uint8Array {
  const content = [
    'q',
    // 红色填充矩形
    '1 0 0 rg',
    '50 700 200 100 re',
    'f',
    // 蓝色描边直线（粗线+虚线）
    '2 w',
    '[6 3] 0 d',
    '0 0 1 RG',
    '50 700 m 250 800 l',
    'S',
    '[] 0 d',
    // 绿色贝塞尔填充
    '0 1 0 rg',
    '300 700 m',
    '400 800 500 600 600 700 c',
    'h',
    'f',
    // 文本：Helvetica 24pt 黑色
    'BT',
    '/F1 24 Tf',
    '0 0 0 rg',
    '1 0 0 1 72 650 Tm',
    '(Hello PDF) Tj',
    '0 20 Td',
    '(Second line) Tj',
    'ET',
    // 大号粗体文本
    'BT',
    '/F2 36 Tf',
    '0.5 g',
    '72 560 Td',
    '(Bold Gray 36) Tj',
    'ET',
    'Q',
  ].join('\n');

  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const u8 = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 0xff;
  return u8;
}

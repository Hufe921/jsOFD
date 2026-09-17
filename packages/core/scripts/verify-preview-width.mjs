/**
 * E2E verification for preview width pinning:
 * 1. build a 210×140mm PDF whose text sits flush against the right margin
 * 2. convert via pdfToOfd (real pdfjs)
 * 3. assert every run still fits the page (DeltaX contract)
 * 4. emit two SVG previews (legacy free-layout vs textLength-pinned)
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { jsOFD } from '../dist/jsofd.esm.js';
import { pdfToOfd } from '../dist/pdf.esm.js';

// ---- 1. minimal PDF, 595.28×396.85pt, digits near the right edge ----
function makePdf() {
  const lines = [
    ['BT /F1 10 Tf 1 0 0 1 350 360 Tm (26347000000175952923) Tj ET', 10, 350, 20],
    ['BT /F1 9 Tf 1 0 0 1 30 300 Tm (\\u540d\\u79f0 CJK fallback width test) Tj ET', 9, 30, 120],
    ['BT /F1 8 Tf 1 0 0 1 480 40 Tm (999999999999) Tj ET', 8, 480, 12],
  ];
  let content = '';
  for (const [s] of lines) content += s + '\n';
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 396.85] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>';
  objs[4] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

const PT2MM = 25.4 / 72;

function pageSvg(page, pinned) {
  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${(page.width * PT2MM * 3).toFixed(0)}" height="${(page.height * PT2MM * 3).toFixed(0)}" viewBox="0 0 ${(page.width * PT2MM).toFixed(3)} ${(page.height * PT2MM).toFixed(3)}"><rect width="100%" height="100%" fill="#fff"/>` +
    `<rect x="0" y="0" width="${(page.width * PT2MM).toFixed(3)}" height="${(page.height * PT2MM).toFixed(3)}" fill="none" stroke="red" stroke-width="0.5"/>`;
  for (const o of page.objects) {
    if (o.t !== 'text') continue;
    const x = o.x * PT2MM;
    const y = o.y * PT2MM;
    // Deliberately wide rendering font to simulate fallback-metric drift.
    const tl =
      pinned && o.glyphWs
        ? ` textLength="${(o.glyphWs.reduce((s, w) => s + w, 0) * PT2MM).toFixed(4)}" lengthAdjust="spacing"`
        : '';
    svg += `<text x="${x}" y="${y}" font-size="${(o.size * PT2MM).toFixed(3)}" font-family="Georgia, serif"${tl} fill="#000">${o.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</text>`;
  }
  return svg + '</svg>';
}

const doc = await pdfToOfd(makePdf());
const page = doc.pages[0];
console.log('page:', (page.width * PT2MM).toFixed(2), 'x', (page.height * PT2MM).toFixed(2), 'mm');
let worst = 0;
for (const o of page.objects) {
  if (o.t === 'text' && o.glyphWs) {
    const over = o.x + o.glyphWs.reduce((s, w) => s + w, 0) - page.width;
    worst = Math.max(worst, over);
  }
}
console.log(
  'max run overflow beyond right edge (pt):',
  worst.toFixed(2),
  worst <= 0.5 ? 'OK' : 'OVERFLOW',
);

writeFileSync(
  '/tmp/preview-legacy.svg',
  pageSvg(page, false).replace('<svg', '<svg style="background:#fff"'),
);
writeFileSync('/tmp/preview-pinned.svg', pageSvg(page, true));
const html =
  '<html><body style="margin:0;display:flex;gap:8px;background:#888">' +
  `<div style="text-align:center;color:#fff"><div>LEGACY (free layout)</div><img src="data:image/svg+xml;base64,${Buffer.from(
    readFileSync('/tmp/preview-legacy.svg'),
  ).toString('base64')}" width="595"></div>` +
  `<div style="text-align:center;color:#fff"><div>PINNED (textLength)</div><img src="data:image/svg+xml;base64,${Buffer.from(
    readFileSync('/tmp/preview-pinned.svg'),
  ).toString('base64')}" width="595"></div>` +
  '</body></html>';
writeFileSync('/tmp/preview-compare.html', html);
console.log('compare page written');

# 高级功能

本页覆盖版式排版的进阶能力：自动分页流式排版、页眉页脚、表格引擎、Canvas 上下文、HTML 渲染、SVG 嵌入与批注。

## 自动分页 autoPaging()

长文本按页高自动断页，返回排完后的 Y 坐标（可继续衔接后续内容）：

```ts
const endY = doc.autoPaging(longText, {
  x: 20, // 左边界（活动单位）
  maxWidth: 170, // 换行宽度；默认页宽 - x - rightMargin
  topMargin: 25, // 续页顶部留白
  bottomMargin: 25, // 底部留白，越界即 addPage()
  lineHeightFactor: 1.7,
  onNewPage: (d, { pageNumber }) => {
    // 新页刚创建，适合画页眉
  },
});
doc.text('—— 全文完 ——', 105, endY + 10, { align: 'center' });
```

## 页眉页脚 headerFooter()

对已有页面（或指定页区间）批量绘制，回调里可用全部绘制 API：

```ts
doc.headerFooter({
  header: (d, { pageNumber }) => {
    d.setFont('simhei').setFontSize(9).setTextColor(90, 98, 110);
    d.text('季度报告 · 机密', 20, 12);
  },
  footer: (d, { pageNumber, pageCount }) => {
    d.setFont('simsun').setFontSize(9);
    d.text(`第 ${pageNumber} 页 / 共 ${pageCount} 页`, 105, 288, { align: 'center' });
  },
  startPage: 2, // 可选：从第 2 页开始画（封面跳过）
});
```

## 表格 doc.table()

autotable 风格的表格引擎：表头填充、网格线、斑马纹、自动分页并重复表头，返回表格底边 Y：

```ts
const endY = doc.table(15, 30, {
  columns: [
    { header: '编号', width: 18 },
    { header: '项目线', width: 60 },
    { header: '完成度', align: 'right' }, // 未给 width 的列均分剩余宽度
  ],
  rows: [
    ['01', '平台研发', '92.5%'],
    [{ text: '合计', bold: true, colSpan: 2 }, '92.5%'],
  ],
  style: {
    fontSize: 10.5,
    headFill: [31, 64, 158], // 表头底色；null 关闭填充
    headColor: [255, 255, 255],
    zebra: [
      [255, 255, 255],
      [242, 246, 252],
    ], // 斑马纹
    borderColor: [191, 197, 205], // 网格线；null 关闭
    cellPadding: 2.5,
  },
  autoPage: true, // 越过 bottomMargin 自动续页
  bottomMargin: 24,
  onNewPage: (d, info) => {
    /* 续页页眉 */
  },
});
```

单元格支持 `string` 或 `{ text, bold, align, colSpan }`。

## Canvas 上下文 doc.context2d

`CanvasRenderingContext2D` 的矢量子集，移植 Canvas 绘图代码时使用。**坐标与线宽使用文档活动单位**，字号走 CSS px 语法（1px = 0.75pt）：

```ts
const ctx = doc.context2d;
ctx.fillStyle = '#2f5fe8';
ctx.fillRect(20, 20, 50, 30); // mm
ctx.beginPath();
ctx.arc(60, 60, 15, 0, Math.PI * 2);
ctx.fill();
ctx.font = '16px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('标题', 105, 100); // 中文字符自动切中文字体
ctx.translate(50, 50);
ctx.rotate(Math.PI / 2);
ctx.fillText('旋转文本', 0, 0);
```

支持：save/restore、translate/rotate/scale/transform/setTransform、路径（moveTo/lineTo/bezierCurveTo/quadraticCurveTo/arc/ellipse/rect/roundRect）、fill/stroke/fillText/strokeText/measureText、drawImage、globalAlpha。

不支持（抛出明确错误）：渐变（`createLinearGradient` 等，用纯色代替）、`getImageData`/`putImageData` 等位图操作。

## HTML 渲染 doc.html()

语义化 HTML → 排版输出（内置零依赖解析器，Node 与浏览器通用）：

```ts
const endY = doc.html(
  '<h1>季度报告</h1>' +
    '<p>支持<strong>加粗</strong>、<i>斜体</i>与实体 &amp; &copy;。</p>' +
    '<ul><li>要点一</li><li>要点二</li></ul>',
  { x: 20, y: 25, width: 170, fontSize: 11 },
);
```

支持标签：`h1–h6`（按级别放大加粗）、`p`、`div`、`br`、`ul/ol`+`li`（自动项目符号）、`b/strong`、`i/em`、常见 HTML 实体。属性与 CSS 样式**不解析**——这是语义渲染器，不是 CSS 排版引擎。

## SVG 嵌入 doc.svg()

把 SVG 栅格化（2× 高清）后以 PNG 嵌入（浏览器 only，与 jsPDF 的 addSvgAsImage 相同限制）：

```ts
await doc.svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">…</svg>', {
  x: 30,
  y: 40,
  w: 60, // 省略时用 SVG 声明的尺寸
  scale: 3, // 栅格倍率（默认 2）
  background: '#fff', // 透明区域底色（可选）
});
```

## 批注 addAnnotation()

视觉批注以普通页面对象渲染，所有阅读器直接显示：

```ts
doc.addAnnotation('highlight', 20, 40, 80, 7); // 荧光笔（默认黄色 35% 透明）
doc.addAnnotation('underline', 20, 52, 80, 7); // 下划线
doc.addAnnotation('strikeout', 20, 64, 80, 7); // 删除线
doc.addAnnotation('squiggly', 20, 76, 80, 7); // 波浪线
doc.addAnnotation('box', 20, 88, 60, 20, { fill: [255, 242, 204] }); // 边框盒
doc.addAnnotation('freetext', 110, 88, 80, 10, {
  text: '批注：请核对金额',
  color: [200, 40, 40],
});
doc.addAnnotation('ink', 0, 0, 0, 0, {
  points: [
    [10, 10],
    [30, 40],
    [60, 20],
  ],
}); // 手绘
```

全部支持 `{ color, opacity, lineWidth }` 定制。

## 组合示例：长报告

```ts
// 自动分页正文 + 页眉页脚 + 结尾表格
doc.autoPaging(chapters.join('\n\n'), { x: 20, topMargin: 28, bottomMargin: 28 });
const endY = doc.table(20, doc.autoPaging 返回值 + 10, { columns, rows });
doc.headerFooter({ footer: (d, i) => d.text(`${i.pageNumber} / ${i.pageCount}`, 105, 288, { align: 'center' }) });
```

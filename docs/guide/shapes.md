# 图形绘制

## 基元

所有图形 API 的坐标 / 尺寸均为活动单位（默认毫米）。路径在 OFD 中以 `AbbreviatedData`（M/L/B/C 简记路径）矢量序列化，放大不失真。

```ts
doc.line(x1, y1, x2, y2);                          // 直线
doc.rect(x, y, w, h, style?);                      // 矩形
doc.roundedRect(x, y, w, h, rx, ry?, style?);      // 圆角矩形（Bézier 圆弧近似）
doc.circle(cx, cy, r, style?);                     // 圆
doc.ellipse(cx, cy, rx, ry, style?);               // 椭圆
doc.triangle(x1, y1, x2, y2, x3, y3, style?);      // 三角形
doc.lines(pts, x, y, scale?, style?, closed?);     // 折线/曲线（见下）
```

## 样式参数

`style` 决定绘制模式，与 jsPDF 语义一致：

| style         | 效果                                                   |
| ------------- | ------------------------------------------------------ |
| `'S'`（默认） | 仅描边（stroke），使用 `setDrawColor` / `setLineWidth` |
| `'F'`         | 仅填充（fill），使用 `setFillColor`                    |
| `'DF'`        | 先填充后描边                                           |
| `'FD'`        | 同 `'DF'`（顺序换写，兼容 jsPDF）                      |

```ts
doc.setFillColor(220, 245, 220);
doc.setDrawColor(30, 140, 60);
doc.setLineWidth(0.4);
doc.roundedRect(30, 40, 50, 30, 5, 5, 'FD'); // 填充 + 描边的圆角卡片
```

## 描边控制（线宽 / 虚线 / 线帽 / 转角）

```ts
doc.setLineWidth(0.8); // 线宽（活动单位）
doc.setLineDashPattern([3, 1.5], 1); // 虚线：段长 3、间隔 1.5，相位 1
doc.setLineDashPattern([]); // 恢复实线
doc.setLineCap('butt' | 'round' | 'square');
doc.setLineJoin('miter' | 'round' | 'bevel');
doc.setLineMiterLimit(2); // miter 斜接上限

doc.getLineDashPattern(); // 读取当前虚线状态
```

## 多段线与贝塞尔曲线

`lines()` 与 jsPDF 同名 API 兼容，点为**相对当前起点的累计增量**（不是绝对坐标）：

```ts
// 从 (100, 60) 出发的折线（scale = 1）
doc.lines(
  [
    [10, 0],
    [0, 10],
    [-10, 0],
  ],
  100,
  60,
  1,
  1,
  'S',
  false,
);

// 6 元组点会被解释为三次贝塞尔控制点：[dx1,dy1, dx2,dy2, dx,dy]
doc.lines(
  [
    [10, 0], // lineTo 相对增量
    [5, -5, 15, -5, 20, 0], // bezierTo（两组控制点 + 终点增量）
  ],
  100,
  100,
  1,
  1,
  'S',
  false,
);
```

最后一个参数 `closed = true` 时路径自动闭合（填充图形必闭合）。

## 填充与透明度

```ts
doc.setOpacity(0.6); // 全局不透明度（同时影响图形与文本）
doc.setGState({ opacity: 0.5 }); // jsPDF 风格；目前仅 opacity 生效
```

透明度序列化为 OFD 的 `Alpha` 属性（0-255），所有主流阅读器支持。

## 表格线示例

```ts
// 发票式表格：表头浅底 + 行分隔线 + 外框
const cols = [12, 72, 96, 106, 116, 134, 158];
const rows = [
  ['货物或应税劳务、服务名称', '规格型号', '单位', '数量', '单价', '金额', '税率/税额'],
  ['*信息技术服务*软件开发服务', '—', '次', '1', '10000.00', '10000.00', '6% / 600.00'],
];

doc.setFontSize(4.5);
rows.forEach((row, r) => {
  const y = 38 + r * 8;
  if (r === 0) {
    doc.setFillColor(252, 246, 236);
    doc.rect(12, y - 5, 186, 8, 'F');
  }
  row.forEach((cell, ci) => doc.text(cell, cols[ci] + 2, y));
  doc.setDrawColor(180, 150, 120);
  doc.setLineWidth(0.2);
  doc.line(12, y + 3, 198, y + 3);
});
doc.setLineWidth(0.5);
doc.rect(12, 33, 186, 19, 'S'); // 外框
```

## 坐标系提醒

- 原点在页面**左上角**，y 向下；
- `rect(x, y, w, h)` 的 y 是**顶边**；
- 与文本混排时，文字基线通常放在行分隔线上方 4-5 磅处视觉居中。

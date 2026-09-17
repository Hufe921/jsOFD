# 文本与排版

## 基本用法

`text()` 的现代签名是 `text(text, x, y, options)`；也兼容 jsPDF 旧参数顺序 `text(x, y, text, options)`。`x, y` 默认是**基线**（alphabetic baseline）位置：

```ts
doc.setFont('simsun');
doc.setFontSize(11);
doc.text('你好 OFD', 25, 60); // 左对齐，基线锚点
doc.text('居中', 105, 80, { align: 'center' }); // x 为行的几何中心
doc.text('右对齐', 185, 100, { align: 'right' }); // x 为右边界
```

## text() 选项一览

| 选项               | 类型                                                           | 默认                  | 说明                                                    |
| ------------------ | -------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| `align`            | `'left' \| 'center'                                            | 'right' \| 'justify'` | `'left'`                                                | `justify`（两端对齐）要求同时给 `maxWidth`，通过拉伸字间空隙铺满整行 |
| `maxWidth`         | `number`                                                       | —                     | 行宽上限（活动单位）；超行自动断行，逐行绘制            |
| `lineHeightFactor` | `number`                                                       | `1.15`                | 断行时的行距倍数（相对字号）                            |
| `baseline`         | `'alphabetic' \| 'top' \| 'middle' \| 'bottom' \| 'hanging'`   | `'alphabetic'`        | 锚点相对文本的位置：`top` 表示 x,y 是文本顶边，依此类推 |
| `angle`            | `number`                                                       | `0`                   | 顺时针旋转角度（度），绕 x,y 锚点                       |
| `charSpace`        | `number`                                                       | `0`                   | 额外字间距（活动单位），可用于标题拉宽                  |
| `renderingMode`    | `'fill' \| 'stroke' \| 'fillThenStroke' \| 'invisible'` 或 0-7 | `'fill'`              | 描边/填充渲染模式（数字与 PDF Tr 操作符一致）           |
| `opacity`          | `number`                                                       | `1`                   | 不透明度 0-1                                            |
| `fontSize`         | `number`                                                       | 当前字号              | 单次调用覆盖字号（磅）                                  |
| `horizontalScale`  | `number`                                                       | `1`                   | 水平缩放（jsPDF 同名选项），0.5 = 压缩为半宽            |
| `R2L`              | `boolean`                                                      | `false`               | 从右向左渲染                                            |

## 对齐与两端对齐

```ts
const para =
  'jsOFD 支持左对齐、居中、右对齐与两端对齐四种对齐方式。' +
  '两端对齐会自动在整行范围内均匀分配字间空隙，与中文出版规范一致。';

doc.setFont('simsun');
doc.setFontSize(11);
doc.text(para, 25, 60, { maxWidth: 160, align: 'justify', lineHeightFactor: 1.75 });
```

实现说明：`center` / `right` 通过把 Boundary X 平移半个 / 整个行宽实现（jsPDF 语义）；`justify` 只作用于非末行，末行保持自然宽度。

## 自动断行与度量

带 `maxWidth` 的 `text()` 自动断行，断行规则针对中英混排优化：CJK 字符任意位置可断、拉丁单词整词不断（可断连字符）、标点避头尾。

三个度量 API 配合手动排版：

```ts
doc.getTextWidth('你好 OFD'); // 当前字体+字号下的宽度（活动单位）
doc.splitTextToSize(longText, 160); // 返回 string[]，按 160 宽断行（不绘制）
doc.getStringUnitWidth('abc'); // 单位宽度（1000/em 基准），jsPDF 兼容
doc.getCharWidthsArray('abc', { fontSize: 12 }); // 每字符宽度数组
doc.getLineHeight(); // 当前行高（字号 × lineHeightFactor）
```

内建字体的宽度数据来自 AFM 度量（Helvetica/Times/Courier 精确到每个 ASCII 字形）；中文字符按 1000/em 全宽近似；**嵌入 TTF 后按字体 hmtx 表的真实步进逐字计量**，与阅读器渲染完全一致。

## 字体与字号

```ts
doc.setFont('simsun'); // 或 'simhei' / 'kaiti' / 'fangsong'
doc.setFont('helvetica', 'bold'); // 第二参数：normal/bold/italic/bolditalic
doc.setFontSize(10.5);
doc.setCharSpace(0.5); // 全局字距（可被选项覆盖）

doc.getFontList(); // 已注册字体键列表
doc.getFont(); // 当前字体键 + 样式
doc.getFontDef('simsun'); // 字体定义（度量、嵌入信息）
```

内建字体键：`helvetica` / `times` / `courier`（拉丁，含粗斜变体）与 `simsun` / `simhei` / `kaiti` / `fangsong`（中文四款，未嵌入时按字体名引用阅读器本地字体）。中文别名（`宋体`、`黑体`…）同样可识别。**当前字体缺少某字形时自动换用中文字体**（如 helvetica 遇到中文自动切 simsun），不会丢字。

自定义字体注册见 [嵌入字体](./fonts.md)。

## 颜色

与 jsPDF 一致的三种传法，文本 / 填充 / 描边各自独立：

```ts
doc.setTextColor(255, 0, 0); // (r, g, b)
doc.setTextColor(128); // 灰度单值
doc.setTextColor('#2b4dcc'); // 十六进制
doc.setTextColor('steelblue'); // CSS 色名（含 CSS3 扩展色）

doc.setFillColor(252, 246, 236);
doc.setDrawColor(53, 101, 224);
doc.getTextColor();
doc.getFillColor();
doc.getDrawColor(); // 读取当前值
```

## 基线锚点

排版表格或混排不同字号文本时，`baseline` 选项比手工计算基线方便得多：

```ts
doc.setFontSize(18);
doc.text('大标题', 25, 60, { baseline: 'top' }); // y 是文本顶边
doc.setFontSize(11);
doc.text('说明文字', 25, 84, { baseline: 'middle' }); // y 是文本垂直中心
doc.text('底边对齐', 185, 100, { baseline: 'bottom', align: 'right' });
```

## 旋转文本

```ts
doc.setFontSize(9);
doc.text('侧边标签', 12, 150, { angle: 90 }); // 绕锚点顺时针旋转 90°
```

旋转通过 OFD TextObject 的 `CTM` 矩阵实现，阅读器按矢量渲染不失真；Boundary 自动取旋转后的外接矩形并留安全余量。

## 页脚总页数

```ts
doc.text('第 1 页 / 共 {total} 页', 185, 285, { align: 'right' });
doc.putTotalPages(); // 输出时把 {total} 替换为真实页数（占位符可自定义）
```

注意与 jsPDF 相同的限制：`putTotalPages()` 只影响**已绘制**文本，需在输出前调用。

# 快速开始

## 安装

```sh
pnpm add @hufe921/jsofd                    # 核心库（零依赖）
pnpm add @hufe921/jsofd pdfjs-dist         # 如需 PDF → OFD 转换，加装可选 peer 依赖
```

npm / yarn 同理：`npm i @hufe921/jsofd`。CDN（浏览器，UMD 全局变量 `jsOFD`）：

```html
<script src="https://unpkg.com/jsofd/dist/jsofd.umd.js"></script>
```

## 第一个文档

```ts
import { jsOFD } from '@hufe921/jsofd';

// 构造参数全部可选；默认 A4 纵向、毫米单位
const doc = new jsOFD({ unit: 'mm', format: 'a4' });

// 页边距内的标题（x=105 为 A4 水平中心）
doc.setFont('simhei'); // 黑体做标题
doc.setFontSize(16); // 字号单位恒为磅（pt）
doc.text('会议纪要', 105, 40, { align: 'center' });

// 正文：宋体、11 磅、限宽自动断行、两端对齐
doc.setFont('simsun');
doc.setFontSize(11);
doc.text(
  'OFD 是中国国家标准 GB/T 33190-2016 定义的版式文档格式，' +
    '广泛应用于电子发票、电子公文与电子档案领域。',
  25, // x：左边界（mm）
  60, // y：基线位置（mm）
  { maxWidth: 160, align: 'justify', lineHeightFactor: 1.6 },
);

// 输出
doc.save('meeting.ofd'); // 浏览器：触发下载
// const bytes = doc.output('uint8array');  // 任何环境：拿到字节自行处理
```

### 构造选项

`new jsOFD(options)` 的 `options` 字段：

| 字段             | 类型                                                           | 默认   | 说明                       |
| ---------------- | -------------------------------------------------------------- | ------ | -------------------------- |
| `orientation`    | `'p' \| 'portrait' \| 'l' \| 'landscape'`                      | `'p'`  | 纵向 / 横向                |
| `unit`           | `'mm' \| 'pt' \| 'px' \| 'in' \| 'cm' \| 'pc' \| 'ex' \| 'em'` | `'mm'` | 之后所有坐标的单位         |
| `format`         | `'a4' \| 'a3' \| 'a5' \| 'b5' \| 'letter' \| ...` 或 `[w, h]`  | `'a4'` | 纸张格式；数组时用活动单位 |
| `floatPrecision` | `number`                                                       | `4`    | XML 数值序列化的小数位数   |

也支持 jsPDF 的位置参数形式：`new jsOFD('p', 'mm', 'a4')`。

## Node.js

```js
// ESM
import { jsOFD } from '@hufe921/jsofd';
import { writeFileSync } from 'node:fs';

const doc = new jsOFD('p', 'pt', 'a4');
doc.text('Hello OFD', 72, 720);

// Node ESM 没有同步 require，save() 的自动下载也仅限浏览器——
// 用 output() 拿字节自己写盘：
writeFileSync('hello.ofd', Buffer.from(doc.output('arraybuffer')));

// CJS: const { jsOFD } = require('@hufe921/jsofd');
```

## 单位与换算

所有绘图 API 的坐标 / 尺寸参数都使用构造时的 `unit`：

```ts
const mm = new jsOFD({ unit: 'mm' }); // 默认
mm.text('A', 105, 100); // 毫米

const pt = new jsOFD({ unit: 'pt' });
pt.text('A', 297.6, 283.5); // 同一位置的磅值表示
```

| 单位 | 1 单位 =     |     | 单位 | 1 单位 =  |
| ---- | ------------ | --- | ---- | --------- |
| `mm` | 1 毫米       |     | `in` | 25.4 毫米 |
| `pt` | 25.4/72 毫米 |     | `cm` | 10 毫米   |
| `px` | 25.4/96 毫米 |     | `pc` | 12 磅     |

字号例外：`setFontSize(n)` 与 `fontSize` 选项始终按**磅**解释，与 jsPDF 行为一致。

## 页面管理

```ts
doc.addPage(); // 追加一页（沿用当前页面尺寸）
doc.addPage('a5', 'l'); // 追加 A5 横向
doc.setPage(2); // 跳到第 2 页（1 基）
const n = doc.getNumberOfPages();
const w = doc.getPageWidth(); // 活动单位
const h = doc.getPageHeight();
doc.insertPage(1); // 在第 1 页前插入
doc.deletePage(3); // 删除第 3 页
doc.movePage(2, 5); // 把第 2 页移动到第 5 页的位置
```

## 输出方式

`output(type)` 支持与 jsPDF 相同的类型字符串：

| type                                                                         | 返回             | 说明                        |
| ---------------------------------------------------------------------------- | ---------------- | --------------------------- |
| `'arraybuffer'`（默认）                                                      | `ArrayBuffer`    | 通用                        |
| `'uint8array'` / `'dataurlstring'` / `'dataurlnewwindow'` / `'binarystring'` | 对应类型         |                             |
| `'bloburl'`                                                                  | `string \| null` | 浏览器临时 URL，供预览/下载 |

浏览器快捷方式 `doc.save('文件.ofd')` 内部等价于构造 Blob 并触发 `<a download>` 点击。

## TypeScript

全部 API 带完整类型与 TSDoc；公共类型（`TextOptions`、`jsOFDOptions`、`PageData` 等）从包根导出，可直接导入：

```ts
import { jsOFD } from '@hufe921/jsofd';
import type { TextOptions, jsOFDOptions } from '@hufe921/jsofd';
```

## 下一步

- [文本与排版](./text.md)：对齐、断行、字距、基线与旋转
- [嵌入字体](./fonts.md)：让中文在任何阅读器中显示一致
- [PDF → OFD 转换](./pdf-import.md)
- [Playground 在线演示](https://github.com/Hufe921/jsOFD)：本仓库 `pnpm dev` 启动

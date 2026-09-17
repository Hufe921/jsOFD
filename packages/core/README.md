# jsofd

Generate OFD fixed-layout documents (Chinese national standard **GB/T 33190-2016**) in JavaScript / TypeScript — with a **jsPDF-compatible API**.

[![CI](https://github.com/Hufe921/jsOFD/actions/workflows/ci.yml/badge.svg)](https://github.com/Hufe921/jsOFD/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Hufe921/jsOFD/blob/main/LICENSE)

```ts
import { jsOFD } from '@hufe921/jsofd';

const doc = new jsOFD({ unit: 'mm', format: 'a4' });
doc.setFont('simhei');
doc.setFontSize(16);
doc.text('会议纪要', 105, 40, { align: 'center' });
doc.setFont('simsun');
doc.text('jsOFD 把 jsPDF 的编程模型移植到国产版式标准上。', 25, 60, { maxWidth: 160 });
doc.save('meeting.ofd');
```

## 特性

- **jsPDF 兼容 API** — `text` / `rect` / `addImage` / `addPage` / `output` / `save` 等方法名、参数、选项一一对应，已有代码改一个 import 即可迁移
- **完整文本排版** — 对齐（含两端对齐）、自动断行（中英混排）、字距、行距、基线锚点、旋转、渲染模式
- **矢量图形与图像** — 线条 / 矩形 / 圆 / 椭圆 / 贝塞尔，PNG / JPEG 原样嵌入不转码，自动去重
- **中文字体嵌入** — `addFontTtf()` 解析 TTF/TTC（cmap / hmtx / OS-2）并按 GB/T 33190 要求嵌入 TrueType 文件，任何阅读器中渲染一致
- **PDF → OFD 转换** — `jsofd/pdf` 子路径，基于 pdfjs 算子重放（v4 / v6 均适配）
- **高级排版** — `autoPaging` 自动分页、`headerFooter` 页眉页脚、`table` 表格引擎（自动分页重复表头）、`context2d` Canvas 适配器、`html` 语义渲染、`addAnnotation` 批注
- **零依赖核心** — ZIP / PNG 编码 / 字体解析全部自研；pdfjs 仅在转换时作为可选 peer 依赖引入
- **交互与元数据** — 超链接、书签大纲、附件、文档属性、阅读器初始视图

## 安装

```sh
npm install @hufe921/jsofd
```

PDF → OFD 转换需要同时安装可选 peer 依赖：

```sh
npm install @hufe921/jsofd pdfjs-dist
```

## 输出

```ts
doc.save('file.ofd'); // 浏览器：触发下载
doc.output('arraybuffer'); // 任何环境：返回字节（还有 uint8array / bloburl / dataurlstring …）
```

Node.js（ESM 下 `save()` 仅浏览器可用，写盘请用 `output()`）：

```js
import { writeFileSync } from 'node:fs';
writeFileSync('file.ofd', Buffer.from(doc.output('arraybuffer')));
```

## 文档

完整文档（中文）：[指南与 API 参考](https://github.com/Hufe921/jsOFD#readme)。

## 许可

[MIT](./LICENSE)

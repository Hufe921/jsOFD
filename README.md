<div align="center">

# jsOFD

**用 JavaScript / TypeScript 生成 OFD 版式文档（GB/T 33190-2016）— API 对齐 jsPDF**

[![CI](https://github.com/Hufe921/jsOFD/actions/workflows/ci.yml/badge.svg)](https://github.com/Hufe921/jsOFD/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Tests](https://img.shields.io/badge/tests-149%20passed-brightgreen)](packages/core/tests)

零依赖核心 · 浏览器与 Node 同构 · 含 PDF → OFD 转换

**[English](README.en.md)** | 中文

</div>

---

## 快速开始

```ts
import { jsOFD } from '@hufe921/jsofd';

const doc = new jsOFD({ unit: 'mm', format: 'a4' });
doc.setFont('simsun');
doc.text('你好，OFD', 105, 30, { align: 'center' });
doc.save('hello.ofd');
```

## 安装

```sh
pnpm add @hufe921/jsofd                 # 核心库
pnpm add @hufe921/jsofd pdfjs-dist      # + PDF → OFD 转换
```

## 核心能力

| 类别     | 说明                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 文本     | 字体/字号/颜色、对齐（含两端）、自动断行（中英混排）、基线、旋转、字距 |
| 中文字体 | 内置宋/黑/楷/仿宋 + **TTF 嵌入**（任何阅读器渲染一致）                 |
| 图形     | 直线、贝塞尔、矩形、圆角矩形、圆、椭圆、三角形、虚线、透明度           |
| 图像     | PNG/JPEG/GIF/BMP/TIFF 原样嵌入、旋转、去重                             |
| 交互     | 超链接、层级书签、附件                                                 |
| PDF 转换 | 逐条重放绘制指令流，保留真实排版数据                                   |
| 输出     | 全同步：`arraybuffer` · `blob` · `dataurlstring` 等                    |

## 嵌入字体（中文推荐）

```ts
const ttf = new Uint8Array(await (await fetch('/fonts/MyFont.ttf')).arrayBuffer());
doc.addFontTtf('simsun', 'My Font', ttf);
doc.setFont('simsun');
```

> 必须使用 **TrueType（.ttf）** 格式。推荐 [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC)。

## PDF → OFD

```ts
import { pdfToOfd } from '@hufe921/jsofd/pdf';
const doc = await pdfToOfd(pdfBytes, { workerSrc: '/pdf.worker.min.mjs' });
doc.save('converted.ofd');
```

## 开发

```sh
nvm use 24 && pnpm install
pnpm dev         # Playground → http://127.0.0.1:5173/jsofd-playground/
pnpm test        # 全部测试
pnpm docs        # 文档站 → http://127.0.0.1:5174/jsofd-docs/
pnpm lint · pnpm typecheck · pnpm build
```

## 部署

两个站点都按**子路径**构建，产物可直接放入 nginx 的 `html/` 目录：

```sh
pnpm build       # packages/playground/dist → html/jsofd-playground/
pnpm docs:build  # docs/.vitepress/dist   → html/jsofd-docs/
```

基础路径在 `packages/playground/vite.config.ts`（`base: '/jsofd-playground/'`）与
`docs/.vitepress/config.ts`（`base: '/jsofd-docs/'`）中定义；Playground 的
PDF 转换依赖（pdfjs cmaps / 标准字体）会随构建自动拷入 `dist/assets/pdfjs/`。

## 文档

- [快速开始](docs/guide/getting-started.md)
- [文本排版](docs/guide/text.md) · [图形](docs/guide/shapes.md) · [图像](docs/guide/images.md)
- [嵌入字体](docs/guide/fonts.md) · [PDF 转换](docs/guide/pdf-import.md)
- [API 参考](docs/api/index.md)
- [与 jsPDF 的差异](docs/guide/differences.md)

## 项目结构

```text
packages/
├── core/          # jsofd 发布包（库源码 + 150 项测试）
└── playground/    # 交互演示
```

## 许可

[MIT](LICENSE) © hufe

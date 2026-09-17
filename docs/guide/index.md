# 简介

jsOFD 是一个用 TypeScript 编写的 **OFD 版式文档生成库**：它提供与 [jsPDF](https://github.com/parallax/jsPDF) 几乎一致的编程接口，但输出的是中国国家标准 **GB/T 33190-2016**（《电子文件存储与交换格式——版式文档》）定义的 OFD 文件。

## 什么是 OFD？

OFD（Open Fixed-layout Document）是我国自主研发的版式文档标准，地位等同于 PDF。它具有如下特点：

- **版式固定**：在任何设备、任何阅读器中呈现完全一致，不发生重排；
- **法定效力**：数电发票、电子公文、电子证照、电子合同、电子档案的法定载体；
- **国家标准**：文档结构、字体嵌入、签章、加密均有明确规范，阅读器实现可严格校验；
- **包结构**：一个 `.ofd` 文件本质是一个 ZIP 包，内含若干 XML 描述页面内容与资源。

一个典型的 OFD 包结构如下：

```text
OFD.xml                    ← 入口：文档定位信息
Doc_0/
├── Document.xml           ← 文档元数据与页树
├── PublicRes.xml          ← 公共资源：色空间、字体声明
├── DocumentRes.xml        ← 文档资源：图像、嵌入字体文件
├── Attachments.xml        ← 附件清单（如有）
├── Pages/
│   ├── Page_0/Content.xml ← 第 1 页内容（文本/图形/图像对象）
│   └── Page_1/Content.xml ← 第 2 页内容
└── Res/                   ← 字体文件、图片等二进制资源
```

jsOFD 负责：把你在 JS 里调用的 `text()`、`rect()`、`addImage()` 等操作映射为页面对象模型；输出时序列化为符合上述结构的 XML，并将字体、图片等资源打包成 ZIP —— 也就是最终的 `.ofd` 文件。

## 快速体验

```ts
import { jsOFD } from '@hufe921/jsofd';

const doc = new jsOFD({ unit: 'mm', format: 'a4' });
doc.setFont('simhei');
doc.setFontSize(16);
doc.text('会议纪要', 105, 40, { align: 'center' });
doc.setFont('simsun');
doc.text('jsOFD 把 jsPDF 的编程模型移植到国产版式标准上。', 25, 60, { maxWidth: 160 });
doc.save('hello.ofd'); // 浏览器中触发下载
```

## 为什么用 jsOFD？

| 场景             | 说明                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- |
| 从 jsPDF 迁移    | 方法名、参数、选项字段一一对应，多数代码只需把 `jsPDF` 换成 `jsOFD`，输出从 PDF 变为 OFD |
| 前端直接生成 OFD | 零依赖核心（ZIP / PNG 编码 / 字体解析全部自研），浏览器与 Node 18+ 均开箱即用            |
| 存量 PDF 转 OFD  | 内置 `pdfToOfd()`：基于 pdfjs 算子重放，保留逐字形步进、矢量图形、位图与透明度           |
| 中文一致性       | 嵌入 TrueType 字体后，生成的文件在任何 OFD 阅读器（数科、WPS、福昕等）中中文显示一致     |

## 核心概念

- **单位制**：构造时通过 `unit` 指定 `'mm' | 'pt' | 'px' | 'in' | 'cm' | 'pc' | 'ex' | 'em'`（默认 `'mm'`，与 jsPDF 相同）。内部模型一律以 pt 存储，序列化时按 1 pt = 25.4/72 mm 换算为 OFD 要求的毫米。**字号 `setFontSize` 始终以磅（pt）为单位**，不受 `unit` 影响。
- **坐标系**：原点在页面**左上角**，x 向右、y 向下 —— 与 canvas、jsPDF 默认行为一致。
- **页面**：A4 / B5 / Letter 等预设格式或 `[宽, 高]` 自定义（活动单位），支持横竖向、多页增删改与移动。
- **对象模型**：每个页面对象是 `TextRun | PathRun | ImageRun | LinkRun` 之一，Playground 的 SVG 预览与 OFD 的 XML 序列化都从同一个模型投影，所见即所得。

## 运行环境

| 环境                                           | 支持 | 说明                                                               |
| ---------------------------------------------- | ---- | ------------------------------------------------------------------ |
| Chrome / Edge / Firefox / Safari（近两年版本） | ✅   | 核心 API 零依赖，不触碰 DOM                                        |
| Node.js 18+                                    | ✅   | `output()` 返回字节由调用方写盘；`save()` 仅浏览器（内部调用下载） |
| PDF → OFD 转换                                 | ✅   | 需安装可选 peer 依赖 `pdfjs-dist`（v4 与 v6 均已适配）             |
| WebWorker / 小程序                             | ✅   | 图像解码走 `OffscreenCanvas`，无 DOM 依赖                          |

## 仓库结构

本仓库是 pnpm monorepo：

```text
packages/
├── core/         # 发布到 npm 的 jsofd 包（零依赖核心 + 可选 pdfjs 集成）
└── playground/   # 在线演示：示例代码编辑、SVG 多页预览、PDF 拖拽转换
```

下一步 → [快速开始](./getting-started.md)

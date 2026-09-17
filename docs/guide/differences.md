# 与 jsPDF 的差异

jsOFD 的目标是**让 jsPDF 代码零成本迁移到 OFD**：方法名、参数顺序、选项字段、返回值语义全部对齐（75 项用例对照 jsPDF 官方测试规范验证）。剩余差异分三类——格式必然差异、尚未实现、有意不做。

## 迁移速查

绝大多数代码只需要：

```diff
- import { jsPDF } from 'jspdf';
- const doc = new jsPDF();
+ import { jsOFD } from '@hufe921/jsofd';
+ const doc = new jsOFD();
```

`doc.text / rect / addImage / addPage / output / save` 等调用不需要任何改动。

## 格式必然差异

| jsPDF                                                         | jsOFD                                                                                          | 原因                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 输出 PDF（1.7）                                               | 输出 OFD（GB/T 33190-2016 ZIP 包）                                                             | 目标格式不同                                                     |
| `output('bloburl')` 生成 `.pdf` 临时 URL                      | 同名方法生成 `.ofd` 临时 URL                                                                   | —                                                                |
| 内部坐标 pt、页面原点左上                                     | 完全相同                                                                                       | 我们刻意保持，模型层零差异                                       |
| `doc.internal` 暴露 PDF 内部结构                              | `doc.pages` 直接暴露对象模型（`TextRun / PathRun / ImageRun / LinkRun`），序列化细节在 builder | OFD 没有对应 PDF 对象树；页面模型是公开 API，预览 / 后处理都靠它 |
| 14 款标准 PDF 字体（Helvetica 等）实际嵌入 AFM 度量、不嵌文件 | 同样不嵌文件，按 `FontName` 引用阅读器字体；**嵌入 TTF 是保证中文一致性的推荐做法**            | OFD 阅读器没有"标准 14 字体必须内置"的约定                       |
| 压缩选项 `compression: 'FAST'` 等                             | 无此参数；OFD 的 ZIP 与 PNG 本身已压缩                                                         | 格式差异                                                         |
| `setR2L` 等全局开关                                           | 作为 `text()` 的 `R2L` 选项                                                                    | 精简全局状态                                                     |

## 已补齐的高级能力（详见 [高级功能](./advanced.md)）

以下 jsPDF 生态常用能力 jsOFD 已原生提供，语义对齐、开箱即用：

| 能力             | jsOFD API                              | 说明                                                       |
| ---------------- | -------------------------------------- | ---------------------------------------------------------- |
| 自动分页流式排版 | `doc.autoPaging(text, options)`        | 长文本按页高自动断页，`onNewPage` 钩子                     |
| 页眉页脚         | `doc.headerFooter({ header, footer })` | 批量应用到页区间，回调可用全部绘制 API                     |
| 表格引擎         | `doc.table(x, y, options)`             | autotable 风格：表头/网格/斑马纹/自动分页重复表头          |
| Canvas 接口      | `doc.context2d`                        | `CanvasRenderingContext2D` 矢量子集（路径/文本/图像/变换） |
| HTML 渲染        | `doc.html(html, options)`              | 语义标签排版（h1–h6/p/li/b/i/实体），零依赖解析器          |
| SVG 嵌入         | `await doc.svg(markup, options)`       | 浏览器内栅格化 2× 后嵌入（Node 需先栅格化）                |
| 批注             | `doc.addAnnotation(type, …)`           | 高亮/下划线/删除线/波浪线/自由文本/手绘/边框盒             |

与 jsPDF 生态的差异：`context2d` 不支持渐变与位图读取（抛出明确错误）；`html()` 是语义渲染器而非 CSS 引擎；批注以视觉对象渲染（不依赖阅读器注释面板）。

## 有意不做的

| API                                          | 原因                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `doc.addFont()` 的 postScriptName 三段式重载 | 保留 jsPDF 的 `(postScriptName, fontName, fontStyle)` 签名，同时推荐更明确的 `addFontTtf` |
| `doc.setLanguage` 写入 /Lang                 | OFD 的语言标记挂在附件与元数据上，仅保留方法兼容、无渲染影响                              |
| 加密 / 权限（`encryption` 选项）             | OFD 加密是独立的标准分册（GB/T 33190.7），涉及证书体系，不适合轻量库内置                  |
| `html()` 的 CSS 布局引擎                     | 完整 CSS 排版是一个浏览器级工程；`html()` 定位为语义标签渲染器，需要精确版式请用原生 API  |

## 行为差异细节

- **`save()`**：浏览器端行为一致（触发下载）；Node 端 jsPDF 的同步 `require('fs')` 写盘在 ESM 下不可用，jsOFD 统一用 `output('uint8array')` + 自行写盘的推荐姿势（见[快速开始](./getting-started.md)）。
- **`putTotalPages()`**：语义一致，占位符默认同为 `{total}`。
- **`setGState()`**：目前仅 `opacity` 生效；OFD 的混合模式与 PDF 模型不同，其余键忽略。
- **颜色**：`setTextColor` 等支持 jsPDF 的三种传法并额外支持 CSS 色名与十六进制字符串。
- **`getImageProperties` / `getStringUnitWidth` / `getCharWidthsArray`** 等工具方法与 jsPDF 同名同义。

发现缺了你在用的 API？欢迎[提 issue](https://github.com/hufe921/jsOFD/issues)，附上 jsPDF 中的最小复现代码即可。

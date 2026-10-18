# 读取 OFD 文件

jsOFD 不仅能生成 OFD，也能**读取**符合 GB/T 33190-2016 的 OFD 包，解析为对象模型后做提取、渲染或二次加工。

```ts
import { parseOfd, extractText, pageToSvg } from '@hufe921/jsofd';

const ofd = await parseOfd(fileBytes); // Uint8Array | ArrayBuffer

ofd.docType; // "OFD" | "OFD-H"
ofd.meta; // { docId, title, author, subject, ... }
ofd.pages.length; // 页数
ofd.pages[0].width; // 页宽（mm）
ofd.outlines; // 书签树（含目标页码）
ofd.attachments; // 附件（文件名字节）
ofd.signatures; // 签名文件清单
ofd.fonts; // 嵌入字体（名字 + 字节）
ofd.limitations; // 未支持特性的清单
```

## 页面对象

每页的 `objects` 是按绘制顺序排列的对象数组：

```ts
for (const o of ofd.pages[0].objects) {
  if (o.kind === 'text') o.codes; // TextCode：文本 + 每字符偏移
  if (o.kind === 'path') o.ops; // M / L / C(三次) / Q(二次) / Z
  if (o.kind === 'image') o.data; // 图片字节（PNG/JPEG/GIF/BMP/TIFF）
}
```

所有坐标单位为 **毫米**，与 OFD 原生单位一致；颜色统一转成 RGB（灰度/CMYK 自动换算），`alpha` 为 0–1。

## 文本提取

```ts
const perPage = extractText(ofd); // string[]，每页一段
```

## 渲染为 SVG

```ts
const svg = pageToSvg(ofd.pages[0], { zoom: 3 });
document.querySelector('#preview').innerHTML = svg;
```

- 文字保持为可选中的真实 `<text>`（逐字 tspan 按 DeltaX 定位）；
- 图片内嵌为 data URL；
- `zoom` 控制输出像素尺寸，`includeText: false` 可隐藏文字层（双层预览场景）。

## 当前限制

解析器聚焦生成侧往返与主流阅读场景，以下特性会跳过并记录在 `limitations` 中：
复合对象（CompositeObject）嵌套、裁剪区（Clip）、页面注解外观（StampAnnot）、GoTo 之外的动作。`parseOfd` 只列出签名文件清单；SES 制章、签章与可信验签见[电子签章与可信验签](./signatures.md)。

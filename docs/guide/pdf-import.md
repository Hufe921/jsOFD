# PDF → OFD 转换

## 原理

jsOFD 不把 PDF 渲染成图片（那样会失去文字可搜索性且体积巨大），而是通过 **pdfjs 的绘制指令流（operator list）重放**：

```text
PDF 页 → pdfjs getOperatorList() → 逐条翻译 → jsOFD 页面对象 → OFD 包
```

翻译器针对 pdfjs **v4 与 v6 两代指令格式**都做了适配（v6 重构了 `constructPath`、把多参数算子拆平、颜色改为十六进制字符串），因此你可以锁定任一大版本。

## 基本用法

```ts
import { pdfToOfd } from '@hufe921/jsofd/pdf'; // 注意子路径导入

const doc = await pdfToOfd(pdfBytes, {
  workerSrc: '/pdf.worker.min.mjs', // 浏览器必填（见下）
  cMapUrl: '/cmaps/', // 含中文的 PDF 需要
  standardFontDataUrl: '/standard_fonts/',
  onProgress: (page, total) => console.log(`${page}/${total}`),
});
doc.save('converted.ofd');
```

返回值就是一个普通 `jsOFD` 实例——转换完可以继续 `setFont`、`addPage`、`text()` 追加内容（比如加水印、盖电子章占位），再输出。

## pdfToOfd 选项

| 选项                  | 类型                    | 说明                                                                                                                                             |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workerSrc`           | `string`                | 浏览器环境必填：pdfjs worker 脚本 URL。Vite 项目推荐 `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` 传入，本地资源零 CDN 依赖 |
| `cMapUrl`             | `string`                | CMap 目录（`node_modules/pdfjs-dist/cmaps/`），PDF 内嵌 CJK 编码字体时必需                                                                       |
| `standardFontDataUrl` | `string`                | 14 款标准字体的数据目录                                                                                                                          |
| `onProgress`          | `(page, total) => void` | 每页转换回调                                                                                                                                     |
| `renderForms` / 其他  | —                       | 透传给 pdfjs `getDocument` 的选项（密码 `password`、禁用字体 `disableFontFace` 等）                                                              |

## 各环境配置

**Vite / Webpack（浏览器）**：

```ts
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'; // Vite
const doc = await pdfToOfd(bytes, {
  workerSrc: workerUrl,
  cMapUrl: '/node_modules/pdfjs-dist/cmaps/',
});
```

未配置 worker 时会回退到 unpkg CDN 并给出一次性警告，仅建议本地调试使用。

**Node.js**：无需 worker，pdfjs 自动走伪 worker 模式：

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { pdfToOfd } from '@hufe921/jsofd/pdf';

const doc = await pdfToOfd(new Uint8Array(readFileSync('in.pdf')));
writeFileSync('out.ofd', Buffer.from(doc.output('arraybuffer')));
```

## 中文渲染一致（重要）

转换后的文本会按字形自动分配字体：CJK 字符分配给中文字体键，拉丁字符保持原字体。若希望中文**在任何阅读器中都渲染一致**，需要给转换结果注册嵌入 TTF：

```ts
const ttf = new Uint8Array(await (await fetch('/fonts/NotoSansSC-subset.ttf')).arrayBuffer());
for (const key of ['simsun', 'simhei', 'kaiti', 'fangsong']) {
  doc.addFontTtf(key, 'Noto Sans SC', ttf);
}
```

见 [嵌入字体](./fonts.md)——字体子集务必覆盖文档实际用字（发票里的罗马数字 Ⅵ、弯引号等容易被遗漏）。

## 支持范围

**转换保留**：

- 文本：逐字形真实步进（`showText` / `showSpacedText`）、字号、颜色、旋转与矩阵变换（CTM）、透明度；
- 图形：填充 / 描边路径、贝塞尔、虚线、线宽线帽、`W n` 裁剪隔离；
- 图像：内嵌与行内位图、ImageBitmap（浏览器 worker 传输格式）、图像遮罩（1bpp stencil）；
- 页面：多页、页面旋转（90° 步进）、MediaBox 裁切。

**不转换**（OFD 模型差异或低频）：混合模式、图案 / 网格渐变、Type 3 字体、PDF 注释（批注 / 表单）。

## 常见问题

| 现象                                           | 原因与处理                                                   |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `No 'GlobalWorkerOptions.workerSrc' specified` | 浏览器未传 `workerSrc`，或未走 `jsofd/pdf` 子路径导入        |
| 中文 PDF 报字体错误 / 乱码                     | 缺 `cMapUrl`；或转换后未注册嵌入 TTF（见上节）               |
| 图片空白                                       | 极少数 JPEG2000 / JBIG2 编码 pdfjs 本身不支持，与转换器无关  |
| 文件比 PDF 大                                  | 通常是嵌入了完整中文字体；做子集化（[字体指南](./fonts.md)） |

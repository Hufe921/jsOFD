# API 参考

按模块分类的完整方法参考。所有方法都在 `jsOFD` 实例上（`import { jsOFD } from '@hufe921/jsofd'`）；坐标单位为构造时的 `unit`（默认毫米），字号恒为磅。各方法完整的 TSDoc 也可在 IDE 中悬停查看。

## 目录

- [构造与页面](#构造与页面)
- [文本](#文本)
- [字体](#字体)
- [颜色与状态](#颜色与状态)
- [图形](#图形)
- [图像](#图像)
- [链接与书签](#链接与书签)
- [附件](#附件)
- [元数据与视图](#元数据与视图)
- [自动分页与页眉页脚](#自动分页与页眉页脚)
- [表格](#表格)
- [高级渲染（context2d / html / svg）](#高级渲染)
- [批注](#批注)
- [度量工具](#度量工具)
- [输出](#输出)
- [PDF 转换（jsofd/pdf 子路径）](#pdf-转换)

---

## 构造与页面

| 方法                                       | 说明                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `new jsOFD(options?)`                      | 构造：`{ orientation?, unit?, format?, floatPrecision? }`；也支持 jsPDF 位置参数 `('p', 'mm', 'a4')`         |
| `addPage(format?, orientation?)`           | 追加页面并跳转到它；省略参数沿用当前尺寸                                                                     |
| `setPage(n)`                               | 跳转到第 n 页（1 基）                                                                                        |
| `insertPage(n)`                            | 在第 n 页之前插入空页                                                                                        |
| `deletePage(n)`                            | 删除第 n 页                                                                                                  |
| `movePage(from, to)`                       | 移动页面顺序                                                                                                 |
| `getNumberOfPages(): number`               | 总页数                                                                                                       |
| `getPageWidth() / getPageHeight(): number` | 当前页面尺寸（活动单位）                                                                                     |
| `doc.pages: PageData[]`                    | 页面对象模型（只读使用）：`{ width, height, objects }`，对象为 `TextRun / PathRun / ImageRun / LinkRun` 之一 |

## 文本

| 方法                                | 说明                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `text(text, x, y, options?)`        | 绘制文本；`x,y` 默认为基线。选项见下表；兼容旧签名 `text(x, y, text, options)` |
| `textWithLink(text, x, y, options)` | 绘制带超链接的文本（选项同 `link`）                                            |

`text()` 的 `TextOptions`：

| 字段               | 类型                                                             | 默认           | 说明                               |
| ------------------ | ---------------------------------------------------------------- | -------------- | ---------------------------------- |
| `align`            | `'left' \| 'center' \| 'right' \| 'justify'`                     | `'left'`       | `justify` 需配合 `maxWidth`        |
| `maxWidth`         | `number`                                                         | —              | 行宽上限，超行自动断行绘制多行     |
| `lineHeightFactor` | `number`                                                         | `1.15`         | 断行行距（× 字号）                 |
| `baseline`         | `'alphabetic' \| 'top' \| 'middle' \| 'bottom' \| 'hanging'`     | `'alphabetic'` | 锚点语义                           |
| `angle`            | `number`                                                         | `0`            | 绕锚点顺时针旋转（度）             |
| `charSpace`        | `number`                                                         | `0`            | 额外字间距                         |
| `renderingMode`    | `'fill' \| 'stroke' \| 'fillThenStroke' \| 'invisible'` 或 `0-7` | `'fill'`       | 渲染模式（数字对应 PDF Tr 操作符） |
| `opacity`          | `number`                                                         | `1`            | 不透明度                           |
| `fontSize`         | `number`                                                         | 当前字号       | 单次字号覆盖（磅）                 |
| `horizontalScale`  | `number`                                                         | `1`            | 水平缩放                           |
| `R2L`              | `boolean`                                                        | `false`        | 从右向左渲染                       |

## 字体

| 方法                                          | 说明                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `setFont(name, style?)`                       | 切换字体；接受字体键、中文名或自定义别名；style 为 `normal/bold/italic/bolditalic`。当前字体缺字形时自动换用中文字体 |
| `setFontSize(size)`                           | 字号（磅）                                                                                                           |
| `setCharSpace(n)`                             | 全局字距                                                                                                             |
| `setLineHeightFactor(n)`                      | 全局默认行距因子                                                                                                     |
| `addFontTtf(key, familyName, ttfData, opts?)` | 注册并**嵌入** TrueType 字体（TTF/TTC，OTF 需 TrueType 轮廓）；解析 cmap/hmtx/OS-2 获得真实度量，同字节自动去重      |
| `addFont(key, name, style?, opts?)`           | 仅注册声明与度量（不嵌文件）；opts：`{ familyName?, serif?, fixed?, cjk?, ascent?, descent?, widths?, alias? }`      |
| `getFontList(): string[]`                     | 已注册字体键                                                                                                         |
| `getFont(): { key, style }`                   | 当前字体                                                                                                             |
| `getFontDef(key?)`                            | 字体定义（度量、嵌入文件信息）                                                                                       |

内建键：`helvetica` `times` `courier` `simsun` `simhei` `kaiti` `fangsong`（含中文别名 `宋体` `黑体` `楷体` `仿宋`）。详见[嵌入字体指南](../guide/fonts.md)。

## 颜色与状态

| 方法                                                   | 说明                                         |
| ------------------------------------------------------ | -------------------------------------------- |
| `setTextColor(r,g,b \| gray \| '#hex' \| 'name')`      | 文本颜色（十六进制与 CSS 色名为 jsOFD 扩展） |
| `setFillColor(...)` / `setDrawColor(...)`              | 填充 / 描边颜色，传法同上                    |
| `getTextColor()` / `getFillColor()` / `getDrawColor()` | 读取当前颜色 `[r,g,b]`                       |
| `setLineWidth(w)`                                      | 线宽（活动单位）                             |
| `setLineDashPattern(segments, phase)`                  | 虚线；`[]` 恢复实线                          |
| `setLineCap('butt'\|'round'\|'square')`                | 线帽                                         |
| `setLineJoin('miter'\|'round'\|'bevel')`               | 转角                                         |
| `setLineMiterLimit(n)`                                 | 斜接上限                                     |
| `getLineDashPattern()`                                 | 当前虚线状态                                 |
| `setOpacity(a)`                                        | 全局不透明度 0-1（文本与图形）               |
| `setGState({ opacity })`                               | jsPDF 风格；当前仅 opacity 生效              |

## 图形

| 方法                                        | 说明                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `line(x1, y1, x2, y2)`                      | 直线                                                                                  |
| `rect(x, y, w, h, style?)`                  | 矩形；style：`'S'`（描边，默认）/`'F'`（填充）/`'DF'`/`'FD'`                          |
| `roundedRect(x, y, w, h, rx, ry?, style?)`  | 圆角矩形，`ry` 省略取 `rx`                                                            |
| `circle(cx, cy, r, style?)`                 | 圆                                                                                    |
| `ellipse(cx, cy, rx, ry, style?)`           | 椭圆                                                                                  |
| `triangle(x1, y1, x2, y2, x3, y3, style?)`  | 三角形                                                                                |
| `lines(pts, x, y, scale?, style?, closed?)` | 多段线 / 贝塞尔；点为**相对起点的累计增量**，6 元组点为 bezierTo（两组控制点 + 终点） |

## 图像

| 方法                                                                    | 说明                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `addImage(data, options)`                                               | 对象签名：`{ x, y, w?, h?, format?, rotation?, opacity?, alias? }`，`w/h` 至少给一个，另一个按像素比推算 |
| `addImage(data, format, x, y, w?, h?, alias?, compression?, rotation?)` | jsPDF 位置参数签名                                                                                       |
| `getImageProperties(data): ImageProperties`                             | `{ fileType, width, height, bytes, data }`                                                               |

`data` 接受 dataURL / `Uint8Array` / `ArrayBuffer` / `HTMLImageElement` / `HTMLCanvasElement`。PNG、JPEG 原样嵌入不转码；相同内容自动去重。详见[图像指南](../guide/images.md)。

## 链接与书签

| 方法                                                 | 说明                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `link(x, y, w, h, options)`                          | 不可见链接区域；`{ url }` 外部跳转或 `{ pageNumber, magFactor? }` 文内跳转  |
| `textWithLink(text, x, y, options)`                  | 可见文本 + 链接                                                             |
| `outline.add(parent?, title, options?): OutlineNode` | 添加书签；`parent` 传上次返回值即嵌套；`{ pageNumber, left?, top?, zoom? }` |

## 附件

| 方法                                            | 说明                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `addFileAsAttachment(filename, data, options?)` | 嵌入附件；`data` 为 UTF-8 文本 / base64 dataURL / 字节；`options: { format?, description? }` |

## 元数据与视图

| 方法                                                                                 | 说明                                                                                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `setProperties({ title?, subject?, author?, keywords?, creator?, creatorVersion? })` | 文档元数据                                                                                                                    |
| `setCreationDate(date)` / `getCreationDate(type?)`                                   | 创建时间读写                                                                                                                  |
| `setDisplayMode(zoom, layout?, pmode?)`                                              | 初始视图：`zoom` 为数值或 `'fullwidth' 'fullheight' 'fullpage'`；`pmode: 'UseNone' 'UseOutlines' 'UseThumbs' 'FullScreen'` 等 |
| `viewerPreferences(options, reset?)`                                                 | 阅读器偏好：`HideToolbar / HideMenubar / HideWindowUI / FitWindow`                                                            |
| `setLanguage(lang)`                                                                  | 兼容方法（写入元数据）                                                                                                        |
| `putTotalPages(indicator?)`                                                          | 把已绘制文本中的占位符（默认 `{total}`）替换为总页数                                                                          |

## 自动分页与页眉页脚

| 方法                                                       | 说明                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `autoPaging(text, options?): number`                       | 长文本按页高自动断页；`options: { x?, y?, maxWidth?, topMargin?, bottomMargin?, lineHeightFactor?, align?, onNewPage? }`；返回结束 Y（活动单位） |
| `headerFooter({ header?, footer?, startPage?, endPage? })` | 页眉页脚钩子；回调 `(doc, { pageNumber, pageCount })` 内可用全部绘制 API                                                                         |

## 表格

| 方法                           | 说明                                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table(x, y, options): number` | autotable 风格表格，返回底边 Y。`options: { columns: { header?, width?, align? }[], rows: (string \| { text, bold?, align?, colSpan? })[][], style?, autoPage?, bottomMargin?, onNewPage? }` |
| `style` 子项                   | `{ fontSize?, headFontSize?, headFill?, headColor?, textColor?, borderColor?, lineWidth?, cellPadding?, rowHeight?, zebra?: [偶,奇], }`；`headFill`/`borderColor` 传 `null` 关闭             |

## 高级渲染

| 方法                                  | 说明                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `doc.context2d`                       | Canvas 2D 适配器（坐标 = 活动单位，字号 CSS px）。支持路径/贝塞尔/圆弧/文本/`drawImage`/变换矩阵/`globalAlpha`；渐变与位图读取抛出明确错误 |
| `html(html, options?): number`        | 语义 HTML 渲染（h1–h6/p/div/br/ul+ol+li/b/strong/i/em/实体），零依赖解析器；不支持 CSS                                                     |
| `svg(markup, options): Promise<void>` | SVG 栅格化（默认 2×）后嵌入；`options: { x, y, w?, h?, scale?, rotation?, opacity?, background? }`；仅浏览器                               |

## 批注

| 方法                                        | 说明                                                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `addAnnotation(type, x, y, w, h, options?)` | `type: 'highlight' \| 'underline' \| 'strikeout' \| 'squiggly' \| 'box' \| 'ink' \| 'freetext'`；`options: { color?, opacity?, lineWidth?, text?, points?, fill?, fontSize?, fontKey? }`。以视觉对象渲染，所有阅读器可见 |

## 度量工具

| 方法                                                                                                             | 说明                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `getTextWidth(text): number`                                                                                     | 当前字体 + 字号下的宽度（活动单位） |
| `splitTextToSize(text, maxWidth): string[]`                                                                      | 按宽度断行（不绘制）                |
| `getStringUnitWidth(text): number`                                                                               | 单位宽度（1/1000 em 累计）          |
| `getCharWidthsArray(text, options?): number[]`                                                                   | 逐字符宽度数组                      |
| `getLineHeight(): number`                                                                                        | 字号 × 行距因子                     |
| `getFontSize()` / `getCharSpace()` / `getLineWidth()` / `getLineCap()` / `getLineJoin()` / `getLineMiterLimit()` | 读取当前状态                        |
| `measure(text, fontKey, style, size, charSpace?)`                                                                | 底层度量（autotable 类插件使用）    |

## 输出

| 方法                   | 说明                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `output(type?)`        | `'arraybuffer'`（默认）/ `'uint8array'` / `'binarystring'` / `'dataurlstring'` / `'dataurlnewwindow'` / `'bloburl'` |
| `save(filename?)`      | 浏览器触发 `.ofd` 下载；Node 用 `output()` 自行写盘                                                                 |
| `getDataUrl(): string` | dataURL 快捷方式                                                                                                    |

## PDF 转换

独立子路径导入：`import { pdfToOfd, configurePdfImport } from '@hufe921/jsofd/pdf'`

| 导出                                       | 说明                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `pdfToOfd(data, options?): Promise<jsOFD>` | 转换 PDF 字节为 jsOFD 实例；`options: { workerSrc?, cMapUrl?, standardFontDataUrl?, onProgress?, ...pdfjs 透传选项 }` |
| `configurePdfImport(options)`              | 预设全局默认（如统一的 workerSrc）                                                                                    |

返回值是标准 jsOFD 实例，可继续追加内容再输出。详见 [PDF 转换指南](../guide/pdf-import.md)。

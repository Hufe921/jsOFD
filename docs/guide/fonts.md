# 嵌入字体

## 为什么需要嵌入

不嵌入字体时，OFD 里的 `Font` 元素只声明 `FontName`，实际渲染依赖**阅读器本机的字体表**。不同阅读器、不同操作系统的字体覆盖差异很大——缺字时轻则替换成别的字形（显示不一致），重则出现乱码 / 空白（用户在数科、WPS 中遇到的中文问题多属于此）。

**嵌入字体文件后**，文档自带全部字形数据，任何设备渲染完全一致。这是电子发票、电子公文等法定场景的通行做法。

## 快速使用

```ts
// 1. 拿到 TTF 字节（本例：浏览器 fetch 静态资源）
const ttf = new Uint8Array(await (await fetch('/fonts/NotoSansSC-Regular.ttf')).arrayBuffer());

// 2. 注册到指定字体键下（覆盖内建的非嵌入声明）
doc.addFontTtf('simsun', 'Noto Sans SC', ttf);

// 3. 正常使用
doc.setFont('simsun');
doc.text('嵌入字体渲染一致', 25, 60);
```

`addFontTtf(key, familyName, ttfData)` 内部会解析字体的 `head / hhea / hmtx / cmap / OS-2` 表：

- **逐字真实步进**：从 `hmtx` 读取每个字形的 advance width，文本宽度计量与阅读器渲染严格一致（内建非嵌入字体只能按 1000/em 近似）；
- **精确边界**：ascent / descent 取 `hhea` 与 `OS/2 usWin` 度量的更保守值，避免阅读器把字形裁剪在文本边界框外；
- **多键共享**：同一份字节注册到多个键（如 simsun / simhei / kaiti）时按内容哈希去重，OFD 包内只存一份字体文件。

## 必须使用 TrueType 格式

GB/T 33190 规定嵌入字体为 **TrueType（.ttf）**。CFF 轮廓的 OTF（如思源黑体 OTF 版）虽然部分阅读器能打开，但**数科、WPS 等严格阅读器会拒绝加载**，表现为整篇中文回退或乱码。因此：

- 推荐 **Noto Sans SC**（[Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+SC)）等 TrueType 版本；
- 手上有 OTF 时先转换：`fonttools ttLib.__main__` 或在线转换均可，但要确认输出为 TrueType 轮廓；
- TTC 集合字体取第一个字体解析，同样支持。

## 字体子集（控制文件体积）

完整中文字体动辄 10 MB，直接嵌入会让每个 OFD 都巨大。常规做法是**按需子集化**：

```sh
pip install fonttools

# 以“全 GB2312 常用集”为例（约 2 MB，覆盖绝大多数业务文档）
pyftsubset NotoSansSC-Regular.ttf \
  --unicodes=U+0020-007E,U+00A0-00FF,U+2013-2026,U+3001-3017,U+4E00-9FFF,U+FF01-FF5E,U+2160-216F \
  --output-file=NotoSansSC-subset.ttf \
  --drop-tables+=BASE,GDEF \
  --layout-features=''
```

常用 Unicode 区段：

| 区段          | 内容                                         |
| ------------- | -------------------------------------------- |
| `U+0020-007E` | ASCII（字母数字标点）                        |
| `U+2013-2026` | 破折号、省略号、弯引号                       |
| `U+2160-216F` | 罗马数字 Ⅰ-Ⅻ（发票常见）                     |
| `U+3001-3017` | 中文标点（、。《》【】）                     |
| `U+4E00-9FFF` | CJK 统一表意文字（按需收窄为 GB2312 常用字） |
| `U+FF01-FF5E` | 全角形式（！？￥……）                         |

注意两点：

1. **可变字体先实例化为静态**：`fonttools varLib.instancer NotoSansSC[wght].ttf wght=400`，部分阅读器不支持 fvar；
2. **name 表家族名要与 `addFontTtf` 的 familyName 一致**，避免阅读器按名字二次匹配失败。

子集之外的字符仍会正常写入文本内容，只是阅读器端按本地字体回退渲染该字形——因此业务上建议按目标文档字符集一次性收全。

## addFont()（非嵌入注册）

仅注册度量与声明（不嵌文件）时使用，选项与 jsPDF 的 addFont 对齐：

```ts
doc.addFont('myfont', 'My Font', 'normal', {
  ascent: 880,        // 1/1000 em，默认 800
  descent: -120,      // 1/1000 em，负值，默认 -200
  cjk: true,          // 按 CJK 全宽近似计量
  widths: { normal: [278, 278, ...] },  // ASCII 32..126 宽度表
  alias: '备用键名',
});
```

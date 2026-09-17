# 图像嵌入

## 支持的格式

| 格式             | 说明                                 |
| ---------------- | ------------------------------------ |
| **PNG**          | 原样字节嵌入，不重编码，透明通道保留 |
| **JPEG**         | 原样字节嵌入                         |
| GIF / BMP / TIFF | 解码后重编码为 PNG 嵌入              |

PNG / JPEG **不经任何转码**：`addImage()` 直接把源字节写进 OFD 包的 `Doc_0/Res/`，既不损失质量也不再消耗 CPU 解码。同一份图片数据（按内容哈希判定）无论 `addImage` 多少次只存一份资源，页面间也共享。

## addImage()

对象签名（推荐）：

```ts
doc.addImage(imageData, {
  x: 30,
  y: 50, // 左上角位置（活动单位）
  w: 90, // 宽度；省略 h 时按宽高比推算
  h: 56,
  format: 'PNG', // dataURL 可自动识别，可省略
  rotation: 30, // 绕图片中心旋转（度）
  opacity: 0.8, // 不透明度 0-1
});
```

| 字段       | 类型     | 必填         | 说明                               |
| ---------- | -------- | ------------ | ---------------------------------- |
| `x`, `y`   | `number` | ✅           | 图片左上角                         |
| `w`, `h`   | `number` | 至少一个     | 省略者按像素宽高比（72 dpi）推算   |
| `format`   | `string` | dataURL 可省 | `'PNG'                             | 'JPEG' | 'GIF' | 'BMP' | 'TIFF'` |
| `rotation` | `number` | —            | 绕中心顺时针旋转                   |
| `opacity`  | `number` | —            | 0-1                                |
| `alias`    | `string` | —            | 手动指定去重别名（默认按内容哈希） |

`imageData` 接受：dataURL 字符串、`Uint8Array`、`ArrayBuffer`、`HTMLImageElement`、`HTMLCanvasElement`。

兼容 jsPDF 的位置参数签名同样支持：`addImage(data, format, x, y, w, h, alias, compression, rotation)`。

## 浏览器：Canvas 动态生图

```ts
const canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 200;
const g = canvas.getContext('2d')!;
const grad = g.createLinearGradient(0, 0, 320, 200);
grad.addColorStop(0, '#3f6fd8');
grad.addColorStop(1, '#7ec8ff');
g.fillStyle = grad;
g.fillRect(0, 0, 320, 200);
g.fillStyle = '#fff';
g.font = 'bold 28px sans-serif';
g.fillText('jsOFD', 20, 60);

doc.addImage(canvas, { x: 30, y: 50, w: 90, h: 56 });
```

Canvas 走浏览器原生 `canvas.toBlob('image/png')`，无损且异步高效。

## 读取图片信息

```ts
const props = doc.getImageProperties(dataUrl);
// { fileType: 'PNG', width: 320, height: 200, bytes: 8421, data: Uint8Array }
```

可用于排版前计算等比尺寸。

## 技术说明

- **单位方形映射**：OFD 的 ImageObject 内容定义在单位正方形 (0,0)-(1,1) 上，jsOFD 自动生成 `CTM` 把它映射到目标矩形，旋转 / 翻转由矩阵乘法完成；
- **去重**：内容哈希（FNV-1a）一致的图片共享同一 `Doc_0/Res/` 资源与 `DocumentRes.xml` 声明，发票多页盖章这类重复图不膨胀文件；
- **Node 环境**：`Uint8Array` 输入直接嵌入；GIF/BMP/TIFF 的重编码依赖内置 PNG 编码器（Node 走 `node:zlib`，浏览器走 `CompressionStream`），无第三方依赖。

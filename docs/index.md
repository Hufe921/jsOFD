---
layout: home

hero:
  name: jsOFD
  text: OFD 版式文档生成库
  tagline: API 对齐 jsPDF · 输出中国国家标准 GB/T 33190-2016 · 零依赖核心 · 含 PDF → OFD 转换
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 查看指南
      link: /guide/
    - theme: alt
      text: API 参考
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/Hufe921/jsOFD

features:
  - icon: 🔤
    title: 完整文本排版
    details: 四种对齐（含两端对齐）、自动断行、字距、行距、基线锚点、旋转文本、描边/填充渲染模式，中英文混排度量精确到每个字形。
  - icon: 🖼
    title: 矢量图形与图像
    details: 线条 / 矩形 / 圆角矩形 / 圆 / 椭圆 / 三角形 / 贝塞尔曲线，PNG / JPEG 原样嵌入不转码，自动去重，支持旋转与透明度。
  - icon: 🈶
    title: 中文无乱码
    details: 内嵌 TTF/OTF/TTC 字体解析（cmap/hmtx/OS-2），GB/T 33190 要求的 TrueType 字体文件直接嵌入，任何阅读器中显示一致。
  - icon: 🔄
    title: PDF → OFD 转换
    details: 基于 pdfjs 算子重放：逐字真实步进、矢量路径、位图、透明度、多页与页面旋转全部保留，浏览器与 Node 均可运行。
  - icon: 📎
    title: 交互与元数据
    details: 超链接（外部 URL / 文内跳转）、书签大纲、附件嵌入、文档属性、阅读器初始视图与偏好设置。
  - icon: 🧩
    title: jsPDF 兼容 API
    details: 方法名、参数顺序、选项字段与 jsPDF 一一对应，已有代码改一个 import 即可迁移；75 项用例对照官方测试规范验证。
---

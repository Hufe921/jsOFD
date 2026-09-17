import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'zh-CN',
  title: 'jsOFD',
  description:
    '在 JavaScript / TypeScript 中生成 OFD（GB/T 33190-2016）版式文档 —— API 对齐 jsPDF，零依赖核心，支持 PDF → OFD 转换。',
  // Deployed under nginx at a sub-path (html/jsofd-docs/).
  base: '/jsofd-docs/',

  head: [
    [
      'meta',
      { name: 'keywords', content: 'OFD, GB/T 33190, 版式文档, jsPDF, PDF 转换, TypeScript' },
    ],
  ],

  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/' },
      { text: 'API 参考', link: '/api/' },
      { text: '在线演示', link: 'https://hufe.club/jsofd-playground' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '简介', link: '/guide/' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '文本与排版', link: '/guide/text' },
            { text: '图形绘制', link: '/guide/shapes' },
            { text: '图像嵌入', link: '/guide/images' },
            { text: '嵌入字体', link: '/guide/fonts' },
            { text: 'PDF → OFD 转换', link: '/guide/pdf-import' },
            { text: '高级功能', link: '/guide/advanced' },
            { text: '与 jsPDF 的差异', link: '/guide/differences' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/Hufe921/jsOFD' }],

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    externalLinkIcon: true,

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除查询',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },
  },
});

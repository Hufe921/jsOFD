import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { jsofd: 'src/index.ts' },
    outDir: 'dist',
    format: ['esm', 'cjs', 'iife'],
    globalName: 'jsOFD',
    dts: true,
    sourcemap: false,
    target: 'es2018',
    platform: 'browser',
    clean: true,
    outExtension({ format }) {
      if (format === 'esm') return { js: '.esm.js' };
      if (format === 'cjs') return { js: '.cjs' };
      return { js: '.umd.js' };
    },
  },
  {
    // PDF → OFD 转换（依赖 pdfjs-dist，独立入口避免污染主包）
    entry: { pdf: 'src/pdf-import.ts' },
    outDir: 'dist',
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: false,
    target: 'es2018',
    platform: 'browser',
    clean: false,
    external: ['pdfjs-dist'],
    outExtension({ format }) {
      if (format === 'esm') return { js: '.esm.js' };
      return { js: '.cjs' };
    },
  },
]);

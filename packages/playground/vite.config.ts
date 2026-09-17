import { cpSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * jsOFD playground.
 *
 * `jsofd` resolves to the workspace *sources* (`packages/core/src`), so library
 * edits hot-reload without a prior build. The build output goes to `dist/`
 * inside this package.
 */

/**
 * Copies the pdfjs static assets (cmaps for CJK CID fonts, standard fonts)
 * next to the built playground so the production bundle works offline.
 */
function copyPdfjsAssets(): Plugin {
  return {
    name: 'copy-pdfjs-assets',
    apply: 'build',
    closeBundle() {
      // pnpm installs pdfjs-dist in this package's node_modules.
      const src = resolve(here, 'node_modules/pdfjs-dist');
      const out = resolve(here, 'dist/assets/pdfjs');
      cpSync(`${src}/cmaps`, `${out}/cmaps`, { recursive: true, dereference: true });
      cpSync(`${src}/standard_fonts`, `${out}/standard_fonts`, {
        recursive: true,
        dereference: true,
      });
    },
  };
}

export default defineConfig({
  // Deployed under nginx at a sub-path (html/jsofd-playground/). The same
  // base applies to `vite dev`: http://127.0.0.1:5173/jsofd-playground/.
  base: '/jsofd-playground/',
  server: { port: 5173, host: '127.0.0.1' },
  plugins: [copyPdfjsAssets()],
  resolve: {
    alias: [
      {
        find: /^@hufe921\/jsofd\/pdf$/,
        replacement: resolve(__dirname, '../core/src/pdf-import.ts'),
      },
      { find: /^@hufe921\/jsofd$/, replacement: resolve(__dirname, '../core/src/index.ts') },
    ],
  },
  build: { outDir: 'dist' },
});

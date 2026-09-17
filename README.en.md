<div align="center">

# jsOFD

**OFD (GB/T 33190-2016) generation for JavaScript/TypeScript — a jsPDF-compatible API**

[![CI](https://github.com/Hufe921/jsOFD/actions/workflows/ci.yml/badge.svg)](https://github.com/Hufe921/jsOFD/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Tests](https://img.shields.io/badge/tests-157%20passed-brightgreen)](packages/core/tests)
[![Standard](https://img.shields.io/badge/GB%2FT%2033190--2016-OFD-red)](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=3AF6682D939116B6F5EED53D01A9DB5D)

Zero-dependency core · Browser & Node · PDF → OFD conversion

</div>

---

[OFD](https://en.wikipedia.org/wiki/Open_Fixed-layout_Document) is China's
national fixed-layout document standard — the mandated carrier for electronic
invoices, official documents, licenses and archives. jsOFD mirrors the jsPDF
programming model (method names, parameter semantics, units, chaining) and
serializes to a standards-compliant OFD package instead of PDF:

```ts
import { jsOFD } from '@hufe921/jsofd';

const doc = new jsOFD({ unit: 'mm', format: 'a4' });
doc.setFont('simsun');
doc.text('你好，OFD', 105, 30, { align: 'center' });
doc.save('hello.ofd');
```

## Features

| Area           | Coverage                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages          | Standard paper sizes + custom, portrait/landscape, insert/delete/move, page rotation                                                       |
| Text           | Fonts, sizes, colors, align (incl. justified), `maxWidth` wrapping (CJK-aware), baselines, rotation, char spacing, horizontal scaling, R2L |
| Chinese fonts  | Song/Hei/Kai/FangSong built-ins with automatic CJK fallback; TTF/OTF embedding for identical rendering everywhere                          |
| Graphics       | Lines, curves, rectangles, rounded rects, circles, ellipses, triangles; dash, caps, joins, miter limit; opacity                            |
| Images         | PNG/JPEG/GIF/BMP/TIFF embedded byte-for-byte; rotation, opacity, deduplication                                                             |
| Interactivity  | Hyperlinks (URI + in-document), nested bookmarks, attachments                                                                              |
| View           | Metadata, initial view, viewer preferences                                                                                                 |
| PDF conversion | `jsofd/pdf` replays the pdfjs operator list: text with exact per-glyph advances, vectors, rasters, opacity, multi-page, `/Rotate`          |
| Output         | `arraybuffer` · `uint8array` · `blob` · `dataurlstring` · `bloburl` · `binarystring` — fully synchronous                                   |

Package layout follows GB/T 33190-2016: `OFD.xml` (first entry) →
`Doc_0/Document.xml` → `PublicRes.xml` / `DocumentRes.xml` →
`Pages/Page_N/Content.xml`, with `TextObject` / `PathObject` / `ImageObject`
content and `Res/` assets.

## Installation

```sh
pnpm add @hufe921/jsofd                 # core, zero runtime dependencies
pnpm add @hufe921/jsofd pdfjs-dist      # + PDF → OFD conversion
```

| Artifact            | Format  | Use                         |
| ------------------- | ------- | --------------------------- |
| `dist/jsofd.esm.js` | ESM     | Vite / Webpack / Node ESM   |
| `dist/jsofd.cjs`    | CJS     | Node `require()`            |
| `dist/jsofd.umd.js` | UMD     | `<script>` (global `jsOFD`) |
| `dist/pdf.*`        | ESM/CJS | `import 'jsofd/pdf'`        |

## Usage

### Browser

```ts
const doc = new jsOFD(); // A4 portrait, millimetres
doc.setFont('simhei');
doc.text('会议纪要', 105, 40, { align: 'center' });
doc.setFont('simsun');
doc.text(intro, 30, 60, { maxWidth: 150, align: 'justify' });
doc.save('meeting.ofd');
```

### Node

```js
const { jsOFD } = require('@hufe921/jsofd');
const doc = new jsOFD('p', 'pt', 'a4'); // positional args also work
doc.text('Hello OFD', 72, 720);
doc.save('hello.ofd');
```

### Embedded fonts (recommended for CJK)

Unembedded fonts resolve through the reader's local font table and can garble
in readers without matching fonts. Embed one to make output render identically
everywhere:

```ts
const ttf = new Uint8Array(await (await fetch('/fonts/MyFont.otf')).arrayBuffer());
doc.addFontTtf('simsun', 'My Font', ttf); // overrides the builtin key
doc.setFont('simsun');
```

Metrics (cmap/hmtx) are parsed for exact layout, and identical data registered
under multiple keys is stored once. TTF / TTC (and OTF) parse, but
**GB/T 33190 requires embedded fonts in TrueType format** — CFF-flavoured OTF
files are rejected by strict readers (WPS, 数科). Prefer `.ttf` fonts such as
[Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC).

### PDF → OFD

```ts
import { pdfToOfd } from '@hufe921/jsofd/pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const doc = await pdfToOfd(pdfBytes, {
  workerSrc: workerUrl, // required in browsers (Vite example)
  cMapUrl: '/cmaps/', // CJK CID fonts
  standardFontDataUrl: '/standard_fonts/',
});
doc.save('converted.ofd');
```

Both pdfjs v4 and v6 operator-list formats are supported. Not converted:
clipping paths, blend modes, pattern/shading fills, Type 3 fonts, annotations.

## API

Full generated reference: [docs/api](docs/api). Highlights:

<details>
<summary><b>Text</b></summary>

```ts
doc.setFont(name, style?) // 'simsun' | '宋体' | 'Helvetica-Bold' | custom
doc.setFontSize(16) // points, unit-independent
doc.setTextColor(r | '#f00' | 'red')
doc.text(text, x, y, options?)
//   options: align · angle · baseline · charSpace · maxWidth · lineHeightFactor
//            renderingMode · horizontalScale · R2L · opacity · fontSize
doc.splitTextToSize(text, maxWidth)
doc.getTextWidth(text) / getStringUnitWidth / getCharWidthsArray
doc.textWithLink(text, x, y, { url | pageNumber })
doc.putTotalPages('{total}')
```

</details>

<details>
<summary><b>Graphics & images</b></summary>

```ts
doc.setLineWidth(w) · setLineDashPattern([6, 3], 0)
doc.setLineCap('round') · setLineJoin('bevel') · setLineMiterLimit(4)
doc.setDrawColor(...) · setFillColor(...)
doc.line / lines / triangle / rect / roundedRect / circle / ellipse // 'S' | 'F' | 'FD'
doc.addImage(data, { x, y, w, h, rotation?, alias? })
doc.getImageProperties(dataUrl)
doc.setGState({ opacity })
```

</details>

<details>
<summary><b>Pages, navigation, output</b></summary>

```ts
doc.addPage(format?, orientation?) · setPage(n) · insertPage(before?)
doc.movePage(target, before) · deletePage(n?)
doc.link(x, y, w, h, { url | pageNumber })
const ch = doc.outline.add(null, '第一章', { pageNumber: 1 })
doc.outline.add(ch, '1.1 概述', { pageNumber: 2 })
doc.addFileAsAttachment('readme.txt', '内容', { format: 'txt' })
doc.setProperties({ title, author }) · setDisplayMode('fullwidth')
doc.output('arraybuffer') · save('file.ofd')
```

</details>

Units: `pt / mm / cm / in / px / pc / em / ex` — factors identical to jsPDF.

## Differences from jsPDF

- Output is an OFD ZIP with MIME `application/ofd`.
- Fonts are referenced, not embedded, unless `addFontTtf` is used.
- ZIP entries are STOREd so `output()` stays synchronous.
- PDF-specific internals are out of scope: PubSub, xref tables, encryption,
  XMP, AcroForm, html/svg/canvas plugins, the advanced-API transform stack.
- `save()` is unavailable under Node ESM (no sync require); use
  `output('arraybuffer')`.

## Quality

157 tests, including a 75-case mirror of the official jsPDF test suite,
OFD package-structure assertions (`xmllint`-checked), CRC32 vectors, CJK
line-breaking, and PDF conversion on synthetic and real-world files. Output is
cross-validated by rendering with [ofdrw](https://github.com/ofdrw/ofdrw) — an
independent Java GB/T 33190 implementation.

## Development

```sh
nvm use 24 && pnpm install
pnpm dev # playground → http://127.0.0.1:5173/jsofd-playground/
pnpm test # all workspaces
pnpm lint · pnpm typecheck · pnpm build
pnpm docs # documentation site → http://127.0.0.1:5174/jsofd-docs/
```

## Deployment

Both sites build for **sub-path** hosting; drop the output straight into
nginx's `html/` directory:

```sh
pnpm build # packages/playground/dist → html/jsofd-playground/
pnpm docs:build # docs/.vitepress/dist → html/jsofd-docs/
```

Base paths live in `packages/playground/vite.config.ts`
(`/jsofd-playground/`) and `docs/.vitepress/config.ts` (`/jsofd-docs/`).
The playground's PDF-conversion assets (pdfjs cmaps / standard fonts) are
copied into `dist/assets/pdfjs/` during the build.

The [playground](packages/playground) offers editable examples, PDF drag &
drop conversion, a stacked multi-page preview with zoom, and one-click download
of real `.ofd` files. It consumes library sources through Vite aliases, so
edits hot-reload.

## Project structure

```text
packages/
├── core/                      # the publishable jsofd package
│   ├── src/
│   │   ├── index.ts           # public exports
│   │   ├── jsofd.ts           # jsOFD class: state, constructor, pages
│   │   ├── core/colors.ts     # color parsing
│   │   ├── modules/           # feature mixins merged onto the prototype
│   │   │   ├── state.ts       #   fonts, colors, graphics state
│   │   │   ├── text.ts        #   metrics, wrapping, text()
│   │   │   ├── shapes.ts      #   vector primitives
│   │   │   ├── images.ts      #   image embedding
│   │   │   ├── annotations.ts #   links, attachments
│   │   │   └── view.ts        #   metadata, output
│   │   ├── builder.ts         # object model → GB/T 33190 XML → ZIP
│   │   ├── model.ts           # page-object model (points)
│   │   ├── metrics.ts         # AFM widths, CJK registry
│   │   ├── font-parse.ts      # TTF/OTF/TTC parser (cmap/hmtx)
│   │   ├── pdf-import.ts      # PDF → OFD (pdfjs v4/v6 operator replay)
│   │   └── png-encode.ts      # dependency-free PNG encoder
│   └── tests/                 # 150 tests
└── playground/                # @jsofd/playground (private demo app)
```

## Contributing & license

[CONTRIBUTING](CONTRIBUTING.md) · [CHANGELOG](CHANGELOG.md) ·
[SECURITY](SECURITY.md) · [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md)

MIT © hufe

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- High-level layout APIs: `doc.autoPaging()` (flow text across pages),
  `doc.headerFooter()` (page-range header/footer hooks), `doc.table()`
  (autotable-style engine: header fill, grid, zebra, auto pagination with a
  repeated header), `doc.html()` (semantic HTML renderer with a dependency-
  free parser, Node + browser), `doc.context2d` (Canvas 2D vector adapter),
  `doc.svg()` (rasterize-and-embed, browser) and `doc.addAnnotation()`
  (highlight / underline / strikeout / squiggly / box / ink / freetext).
- Playground: new preset 表格报告 exercising table + header/footer +
  annotations; sandbox exposes `log()` to preset code.
- Playground now embeds two font families: Noto Serif SC (宋体/楷体/仿宋 keys)
  and Noto Sans SC (黑体), both TrueType full-GB2312 subsets, so converted
  documents keep the serif/sans distinction of the source PDF. The preview
  loads the same families via @font-face — WYSIWYG against real readers.

### Fixed

- Embedded font subsets shipped WITHOUT ASCII letters: the subset charset
  was built from a string whose `\uXXXX-range` escapes never expanded, so
  only space and hyphen survived from Latin — readers substituted a local
  font per glyph (wrong look, smudged) and laid Latin out at the flat 0.5em
  DeltaX fallback ("l eft al i gned"). Subsets now genuinely include ASCII,
  Latin-1, dashes/quotes, roman numerals, CJK symbols and fullwidth forms
  alongside GB2312; per-glyph DeltaX advances for Latin are real hmtx values.
- TextObjects now always emit explicit Fill/Stroke attributes (readers
  differ on the omitted-attribute default; a fill+stroke double draw reads
  as smeared faux-bold text).
- Embedded font files slimmed to the tables readers actually use (core +
  gasp/prep; GSUB/GPOS/STAT/vhea/vmtx/BASE/GDEF dropped).
- Converted documents clipped at the bottom in OFD readers: the Boundary
  height formula added the descender term with the raw (negative) sign, so
  the "headroom below baseline" shrank the box — for PDF-imported runs the
  baseline itself fell outside the Boundary and readers cut every glyph's
  lower half. Boundary metrics are now derived from the serialized font
  definition (embedded-font metrics, not builtin approximations), descent is
  treated as a magnitude, the box is floored at 1.4em, and the width also
  reserves room for the last glyph's natural advance when DeltaX pins a
  narrower sum.
- PDF-import preview overflow: the SVG preview ignored per-glyph advances
  (DeltaX), so fallback font metrics drifted cumulatively and long runs
  (invoice numbers, amounts) escaped the page. The preview now pins each run
  with textLength from the glyph advances, exactly like OFD readers place
  them. A regression test asserts converted runs never exceed the page.

### Fixed

- CJK tofu/fallback in readers: the playground's embedded Noto Sans SC subset
  covered only ~3.5k characters and missed 5k+ GB2312 hanzi (爱/税/账/…), all
  GB2312 symbols (±×÷≤≥★→), Roman numerals (Ⅵ) and curly quotes — readers
  substituted a local fallback font whose metrics differ, producing both
  mojibake and bottom clipping. The subset is rebuilt to full GB2312 +
  Latin/punctuation extras (7,464 chars, 2.11 MB).
- Text bottom clipping in strict readers: TextObject Boundary now reserves
  deep headroom below the baseline (descent × 2.2) and pads rotated boxes by
  18%, defending against reader-side font substitution and metric drift.
- Variable-font instancer left a stale "Noto Sans SC Thin" family name on the
  embedded font; name records are now pinned to Noto Sans SC / Regular.

### Changed

- Playground preview: paper fills the pane width by default (fit-width cap
  raised to 6×, zoom range 0.5–5), example text colours darkened for
  readability.
- Documentation site rewritten: all guide pages are now complete (text,
  shapes, images, fonts, PDF import, jsPDF differences) with option tables
  and runnable examples, plus a full hand-written API reference.
- Removed dead config: TypeDoc (unlinked generated output), stale
  `packages/core` docs scripts, legacy `packages/playground/examples/`
  demo, redundant npm `workspaces` field; `vitepress` moved to the root and
  `pnpm-workspace.yaml` build approval fixed (`allowBuilds: esbuild: true`).

### Added

- Embedded font support: `doc.addFontTtf()` parses font metrics (cmap/hmtx)
  and embeds the file via `FontFile`, eliminating CJK mojibake in readers
  without matching local fonts. Identical data registered under multiple keys
  is deduplicated. Embedded fonts must be TrueType (`.ttf`) — the standard
  does not accept CFF OTF; the playground now ships Noto Sans SC TTF.

### Changed

- Repository restructured into an npm-workspaces monorepo:
  `packages/core` (the publishable `jsofd` library) and
  `packages/playground` (the interactive demo, private).
- Migrated to pnpm workspaces; all dependencies upgraded to latest
  (TypeScript 6, Vite 8, Vitest 5, ESLint 10, pdfjs-dist 6, tsup 8.5).
  PDF import now supports both pdfjs v4 and v6 operator-list formats.
- Playground rebuilt around a tabbed workspace (examples / PDF drag & drop
  conversion), a stacked multi-page preview with zoom, and a collapsible log.

## [1.0.0] - 2026-09-15

### Added

- jsPDF-compatible API for generating OFD (GB/T 33190-2016) documents.
- Text: fonts, sizes, colors, alignment, `maxWidth` line breaking (CJK-aware),
  justified text, baselines, rotation, char spacing, horizontal scaling, R2L.
- Vector graphics: lines, curves, rectangles, rounded rectangles, circles,
  ellipses, triangles, dash patterns, caps, joins, miter limit, opacity.
- Images: PNG/JPEG/GIF/BMP/TIFF embedded as-is, rotation, opacity, deduplication.
- Bookmarks (nested outlines), hyperlinks (URI + in-document goto), attachments.
- Document metadata, initial view (`setDisplayMode`), viewer preferences.
- `jsofd/pdf` sub-entry: PDF → OFD conversion powered by pdfjs-dist
  (operator-list replay: text with per-glyph advances, vector paths, raster
  images re-encoded to PNG, transparency, multi-page, page rotation).
- Interactive dev playground (`npm run dev`).
- 145 tests, including a 75-case mirror of the official jsPDF test suite
  and ofdrw (Java) cross-render validation.

### Fixed

- ImageObject emits a unit-square CTM (images were invisible at 1×1 mm in
  strict readers); text CTM translations are now in page units.
- `baseline: 'bottom'` direction; `doc.lines()` segments as cumulative deltas.
- PDF import: clip-rectangle leaks, CJK font-run assignment, `ca`/`CA` alpha
  keys, late-resolving images, browser ImageBitmap payloads.

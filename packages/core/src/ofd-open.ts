/**
 * Open an OFD package as an editable jsOFD document.
 *
 * parseOfd() produces the read-only object model; openOfd() goes one step
 * further and maps it back onto the jsOFD writing API (pages, runs, embedded
 * fonts, outlines, attachments, metadata). The returned document previews,
 * edits and re-serialises like any hand-built jsOFD document — enabling
 * OFD → preview → modify → OFD round-trips.
 *
 * All model coordinates are points (pt); the OFD native millimetres convert
 * via PT_PER_MM. Object-level CTMs decompose into per-point transforms
 * (paths) and rotation + centre re-anchoring (text/images).
 */

import { jsOFD } from './jsofd';
import { parseOfd, type OfdCtm, type OfdPage, type OfdPathOp } from './ofd-reader';
import { hasCJK } from './metrics';
import type { PathOp, PathRun, TextRun } from './model';

const PT_PER_MM = 72 / 25.4;

const pt = (mm: number): number => mm * PT_PER_MM;

/** Apply an OFD CTM to a point (OFD row-major [a b c d e f]). */
function applyCtm(ctm: OfdCtm, x: number, y: number): [number, number] {
  return [ctm.a * x + ctm.c * y + ctm.e, ctm.b * x + ctm.d * y + ctm.f];
}

/** Rotation-like CTM: [a b; -b a] (possibly scaled). */
function isRotationLike(ctm: OfdCtm): boolean {
  const eps = 1e-6;
  return (
    Math.abs(ctm.c + ctm.b) < eps &&
    Math.abs(ctm.a - ctm.d) < eps &&
    (Math.abs(ctm.a) > eps || Math.abs(ctm.b) > eps)
  );
}

/** Convert OFD path ops (boundary-relative mm) into page-space pt PathOps. */
function toPathOps(ops: OfdPathOp[], boundary: { x: number; y: number }, ctm?: OfdCtm): PathOp[] {
  const out: PathOp[] = [];
  const map = (x: number, y: number): [number, number] => {
    const px = boundary.x + x;
    const py = boundary.y + y;
    const [tx, ty] = ctm ? applyCtm(ctm, px, py) : [px, py];
    return [pt(tx), pt(ty)];
  };
  for (const op of ops) {
    if (op.op === 'M' || op.op === 'L') {
      const [x, y] = map(op.x, op.y);
      out.push({ op: op.op, x, y });
    } else if (op.op === 'Q') {
      const [x1, y1] = map(op.x1, op.y1);
      const [x, y] = map(op.x, op.y);
      // Quadratic → cubic (control points at 2/3 towards the pole).
      const last = out[out.length - 1];
      const lx = last && last.op !== 'Z' ? last.x : 0;
      const ly = last && last.op !== 'Z' ? last.y : 0;
      out.push({
        op: 'C',
        x1: lx + (2 / 3) * (x1 - lx),
        y1: ly + (2 / 3) * (y1 - ly),
        x2: x + (2 / 3) * (x1 - x),
        y2: y + (2 / 3) * (y1 - y),
        x,
        y,
      });
    } else if (op.op === 'C') {
      const [x1, y1] = map(op.x1, op.y1);
      const [x2, y2] = map(op.x2, op.y2);
      const [x, y] = map(op.x, op.y);
      out.push({ op: 'C', x1, y1, x2, y2, x, y });
    } else out.push({ op: 'Z' });
  }
  return out;
}

/**
 * Open an OFD package as an editable jsOFD document.
 *
 * @example
 * const doc = await openOfd(fileBytes);
 * doc.save('edited.ofd');
 */
export async function openOfd(
  data: Uint8Array | ArrayBuffer,
  options: {
    /** Invoked per parsed page. */ onProgress?: (page: number, total: number) => void;
  } = {},
): Promise<jsOFD> {
  const ofd = await parseOfd(data);
  const first = ofd.pages[0];
  const doc = new jsOFD({
    unit: 'pt',
    format: first ? [pt(first.width), pt(first.height)] : 'a4',
  });

  // ---- metadata ----
  doc.setProperties({
    title: ofd.meta.title,
    author: ofd.meta.author,
    subject: ofd.meta.subject,
    keywords: ofd.meta.keywords,
    creator: ofd.meta.creator ?? 'jsOFD',
  });

  // ---- embedded fonts: register under namespaced keys ----
  const fontKeys = new Map<string, string>();
  for (const [id, font] of Object.entries(ofd.fonts)) {
    if (!font.data.length) continue;
    const key = `ofd_${id.toLowerCase()}`;
    try {
      doc.addFontTtf(key, font.name, font.data);
      fontKeys.set(id, key);
    } catch {
      // Malformed font program: runs fall back to builtin metrics below.
    }
  }

  // ---- pages ----
  ofd.pages.forEach((page: OfdPage, index: number) => {
    options.onProgress?.(index, ofd.pages.length);
    if (index > 0) doc.addPage([pt(page.width), pt(page.height)]);
    const target = doc.pages[doc.page]!;

    for (const obj of page.objects) {
      if (obj.kind === 'text') {
        const rot = obj.ctm && isRotationLike(obj.ctm) ? Math.atan2(obj.ctm.b, obj.ctm.a) : 0;
        const scale = obj.ctm && isRotationLike(obj.ctm) ? Math.hypot(obj.ctm.a, obj.ctm.b) : 1;
        for (const code of obj.codes) {
          const fallbackKey = hasCJK(code.text) ? 'simsun' : 'helvetica';
          const fontKey = (obj.fontId && fontKeys.get(obj.fontId)) || fallbackKey;
          const run: TextRun = {
            t: 'text',
            x: pt(obj.boundary.x + code.x),
            y: pt(obj.boundary.y + code.y),
            text: code.text,
            size: pt(obj.size) * (scale === 1 ? 1 : scale),
            fontKey,
            style: 'normal',
            color: [Math.round(obj.color.r), Math.round(obj.color.g), Math.round(obj.color.b)],
            charSpace: 0,
            angle: rot ? +((rot * 180) / Math.PI).toFixed(4) : 0,
            ascent: obj.size * PT_PER_MM * 0.8,
            descent: -obj.size * PT_PER_MM * 0.2,
            renderingMode:
              obj.stroke && !obj.fill ? 'stroke' : obj.stroke ? 'fillThenStroke' : 'fill',
            opacity: obj.alpha ?? (obj.color.alpha < 1 ? obj.color.alpha : null),
            justifyWidth: null,
            hScale: 1,
            glyphWs: code.deltaX?.map((d) => pt(d)),
          };
          target.objects.push(run);
        }
      } else if (obj.kind === 'path') {
        const run: PathRun = {
          t: 'path',
          ops: toPathOps(obj.ops, obj.boundary, obj.ctm),
          fill: obj.fill,
          stroke: obj.stroke,
          fillColor: obj.fillColor
            ? [
                Math.round(obj.fillColor.r),
                Math.round(obj.fillColor.g),
                Math.round(obj.fillColor.b),
              ]
            : [0, 0, 0],
          strokeColor: obj.strokeColor
            ? [
                Math.round(obj.strokeColor.r),
                Math.round(obj.strokeColor.g),
                Math.round(obj.strokeColor.b),
              ]
            : [0, 0, 0],
          lineWidth: pt(obj.lineWidth ?? 0.353),
          dash: obj.dashPattern ? { pattern: obj.dashPattern.map((v) => pt(v)), phase: 0 } : null,
          cap: 0,
          join: 0,
          miterLimit: 3.528,
          opacity: obj.alpha ?? null,
        };
        target.objects.push(run);
      } else if (obj.kind === 'image' && obj.data?.length) {
        // Rotation-like CTM: unrotated size = column/row scales, centre from
        // the CTM applied to the unit-square centre.
        let w = pt(obj.boundary.w);
        let h = pt(obj.boundary.h);
        let angle = 0;
        let x = pt(obj.boundary.x);
        let y = pt(obj.boundary.y);
        if (obj.ctm && isRotationLike(obj.ctm)) {
          angle = +((Math.atan2(obj.ctm.b, obj.ctm.a) * 180) / Math.PI).toFixed(4);
          const sx = Math.hypot(obj.ctm.a, obj.ctm.b);
          const sy = Math.hypot(obj.ctm.c, obj.ctm.d);
          const [cx, cy] = applyCtm(obj.ctm, 0.5, 0.5);
          w = pt(sx);
          h = pt(sy);
          x = pt(cx) - w / 2;
          y = pt(cy) - h / 2;
        }
        doc.addImage(obj.data, obj.format ?? 'PNG', x, y, w, h);
        const last = target.objects[target.objects.length - 1];
        if (last && last.t === 'image') {
          last.angle = angle;
          if (obj.alpha !== undefined && obj.alpha < 1) last.opacity = obj.alpha;
        }
      }
    }
  });

  // ---- outlines ----
  const addOutlines = (
    nodes: typeof ofd.outlines,
    parent: Parameters<jsOFD['outline']['add']>[0],
  ): void => {
    for (const n of nodes) {
      const node = doc.outline.add(parent, n.title, { pageNumber: n.pageIndex + 1 });
      if (n.children.length) addOutlines(n.children, node);
    }
  };
  addOutlines(ofd.outlines, null);

  // ---- attachments ----
  for (const a of ofd.attachments) {
    if (a.data.length) doc.addFileAsAttachment(a.name, a.data, { format: a.format });
  }

  return doc;
}

// Re-exported so one import serves the whole read path.
export { parseOfd, extractText } from './ofd-reader';

/**
 * Internal page object model (points; converted to mm at serialisation time).
 */

import type { FontStyle, RGB } from './types';

export interface PageData {
  /** Page width in points */
  width: number;
  /** Page height in points */
  height: number;
  objects: PageObject[];
}

export type PageObject = TextRun | PathRun | ImageRun | LinkRun;

export interface TextRun {
  t: 'text';
  /** Baseline start X in points */
  x: number;
  /** Baseline start Y in points */
  y: number;
  text: string;
  /** Font size in points */
  size: number;
  fontKey: string;
  style: FontStyle;
  color: RGB;
  charSpace: number;
  /** Rotation in degrees */
  angle: number;
  ascent: number;
  descent: number;
  renderingMode: string;
  opacity: number | null;
  /** Justification target width in points; null disables stretching */
  justifyWidth: number | null;
  /** Horizontal scale (jsPDF horizontalScale; 1 is unscaled) */
  hScale: number;
  /** Per-glyph advances in points (PDF import); falls back to font metrics */
  glyphWs?: number[];
}

export type PathOp =
  | { op: 'M'; x: number; y: number }
  | { op: 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Z' };

export interface DashState {
  pattern: number[];
  phase: number;
}

export interface PathRun {
  t: 'path';
  ops: PathOp[];
  fill: boolean;
  stroke: boolean;
  fillColor: RGB;
  strokeColor: RGB;
  /** Stroke width in points */
  lineWidth: number;
  dash: DashState | null;
  cap: number;
  join: number;
  /** Miter limit in points (emitted when > 1) */
  miterLimit: number;
  opacity: number | null;
}

export interface AttachmentData {
  name: string;
  data: Uint8Array;
  format: string;
  description: string;
  creationDate: Date;
}

/** Registered image resources (deduplicated). */
export interface ImageResource {
  alias: string;
  data: Uint8Array;
  /** OFD MultiMedia Format value (PNG/JPEG/GIF/BMP/TIFF) */
  format: string;
  /** File extension (lowercase) */
  ext: string;
  width: number | null;
  height: number | null;
  /** Resource ID assigned at serialisation time */
  resId: number;
}

export interface ImageRun {
  t: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Image resource reference */
  imageRef: ImageResource;
  angle: number;
  opacity: number | null;
}

export interface LinkRun {
  t: 'link';
  x: number;
  y: number;
  w: number;
  h: number;
  url: string | null;
  pageNumber: number | null;
  magFactor: string | number | null;
}

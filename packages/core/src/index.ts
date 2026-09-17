/**
 * jsOFD - generate OFD fixed-layout documents (GB/T 33190-2016) with JavaScript/TypeScript.
 *
 * The API mirrors jsPDF (https://github.com/parallax/jsPDF);
 * the output target is the Chinese national standard OFD (Open Fixed-layout Document) instead of PDF.
 */

import { jsOFD, JSOFD_VERSION } from './jsofd';

export { jsOFD, JSOFD_VERSION };

export type {
  PageData,
  PageObject,
  TextRun,
  PathRun,
  PathOp,
  DashState,
  ImageRun,
  LinkRun,
  ImageResource,
  AttachmentData,
} from './model';

export type {
  AddFontOptions,
  EmbeddedFontFile,
  AddImageOptions,
  AttachmentOptions,
  DisplayMode,
  DocProperties,
  FontInfo,
  FontStyle,
  GState,
  ImageInput,
  ImageProperties,
  jsOFDOptions,
  LinkOptions,
  Orientation,
  OutlineNode,
  OutlineOptions,
  OutputResult,
  PageFormat,
  RGB,
  TextAlign,
  TextBaseline,
  TextOptions,
  TextRenderingMode,
  Unit,
  ViewerPreferences,
} from './types';

export type { AnnotationOptions, AnnotationType } from './modules/annotate';
export type { AutoPagingOptions, HeaderFooterOptions, PageInfo } from './modules/flow';
export type { HtmlOptions } from './modules/html';
export type { SvgOptions } from './modules/svg';
export type {
  TableCell,
  TableCellInput,
  TableColumn,
  TableOptions,
  TableStyle,
} from './modules/table';

export { BUILTIN_FONTS, FONT_ALIASES } from './metrics';
export type { FontDef, FontWidths } from './metrics';
export { PAGE_FORMATS_MM, UNIT_FACTORS } from './formats';
export { OFD_NAMESPACE } from './xml';
export const version = JSOFD_VERSION;

export default jsOFD;

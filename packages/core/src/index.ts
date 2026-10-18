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
export type { RedactOptions, RedactionHit } from './modules/redact';
export type { WatermarkOptions } from './modules/watermark';
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

// ---- OFD reading (GB/T 33190 packages → object model) ----
export { parseOfd, extractText } from './ofd-reader';
export { openOfd } from './ofd-open';
export { pageToSvg, pageToPng } from './ofd-svg';
export type {
  OfdDocument,
  OfdPage,
  OfdObject,
  OfdTextObj,
  OfdPathObj,
  OfdImageObj,
  OfdTextCode,
  OfdPathOp,
  OfdColor,
  OfdCtm,
  OfdBoundary,
  OfdOutlineNode,
  OfdAttachment,
  OfdSignatureInfo,
} from './ofd-reader';
export type { OfdSvgOptions, OfdPngOptions, OfdPngResult } from './ofd-svg';

// ---- SES V4 electronic seals and trusted OFD signing ----
export { signOfd } from './crypto/ofd-sign';
export type { SignOfdOptions } from './crypto/ofd-sign';
export { verifyOfd } from './crypto/ofd-verify';
export type {
  OfdVerifyOptions,
  OfdVerifyResult,
  OfdSignatureVerification,
  SignatureStatus,
} from './crypto/ofd-verify';
export { createSesSeal, verifySesSeal } from './crypto/ofd-seal';
export type {
  CreateSesSealOptions,
  VerifySesSealOptions,
  SesSealVerification,
} from './crypto/ofd-seal';
export type {
  SesHeader,
  SesProperty,
  SesPicture,
  SesSealInfo,
  SesSealInfoInput,
  SesSeal,
  SesSignature,
} from './crypto/ses-v4';
export { createLocalTestSm2Signer, requestSm2Signature } from './crypto/signer';
export type { Sm2Signer, Sm2SignRequest } from './crypto/signer';
export { parseSm2Certificate, verifyCertificateChain } from './crypto/x509-sm2';
export type {
  Sm2X509Certificate,
  CertificateTrustResult,
  VerifyCertificateOptions,
} from './crypto/x509-sm2';
export type { RevocationProvider, RevocationStatus } from './crypto/revocation';

// ---- OFD password encryption (GM/T 0099, SM4-CBC) ----
export { encryptOfdPassword, decryptOfdPassword } from './crypto/ofd-encryption';
export type {
  OfdPasswordEncryptionOptions,
  OfdPasswordDecryptionOptions,
} from './crypto/ofd-encryption';

export const version = JSOFD_VERSION;

export default jsOFD;

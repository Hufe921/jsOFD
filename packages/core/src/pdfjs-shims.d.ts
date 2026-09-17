/** The pdfjs-dist legacy subpath ships no type declarations. */
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export const OPS: Record<string, number>;
  export function getDocument(src: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<unknown>;
    }>;
  };
}

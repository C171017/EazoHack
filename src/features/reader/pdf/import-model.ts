import { assessText, PDF_PIPELINE_VERSION, TextSourceSchema, type TextSource } from './model';

export const PDF_IMPORT_VERSION = `pdf-import-embedded-v2:${PDF_PIPELINE_VERSION}`;
export class IncompatiblePdfError extends Error {
  constructor(detail: string) {
    super(`This PDF isn’t compatible yet. ${detail} Try a text-based PDF or upload a TXT file.`);
    this.name = 'IncompatiblePdfError';
  }
}
export type ImportProgress = { percent: number; stage: string; completed?: number; total?: number };
export type ImportState = ImportProgress & { title: string; status: 'processing' | 'ready' | 'failed' | 'cancelled'; error?: string; note?: string };
export type ImportPage = {
  pageIndex: number;
  status: 'text' | 'no-text-detected' | 'damaged-text' | 'extraction-failed';
  method: 'embedded' | 'geometry';
  native: TextSource;
  source: TextSource;
  warnings: string[];
  startOffset: number;
  endOffset: number;
};
export type PdfImportManifest = {
  version: string;
  fileHash: string;
  offsetUnit: 'UTF-16';
  nonTextContent: 'retained-in-original-pdf';
  pages: ImportPage[];
};

/** Missing embedded text is explicitly uncertain, never proof of a blank page.
 * Damaged pages retain their extraction evidence and explicit warnings. No OCR is attempted.
 */
export function classifyImportPage(pageIndex: number, raw: TextSource, repaired: TextSource): Omit<ImportPage, 'startOffset' | 'endOffset'> {
  const source = TextSourceSchema.parse(repaired);
  const native = TextSourceSchema.parse(raw);
  const quality = assessText(source);
  const damaged = quality.status === 'damaged' || (quality.status === 'missing' && Boolean(
    native.text.trim() || source.rawText?.trim()
  ));
  return {
    pageIndex, status: damaged ? 'damaged-text' : quality.status === 'missing' ? 'no-text-detected' : 'text',
    method: native.text === source.text ? 'embedded' : 'geometry',
    native, source,
    warnings: damaged ? ['Unreliable text omitted from reader; original page retained. OCR not attempted.', ...quality.reasons]
      : quality.status === 'missing' ? ['No embedded text detected; page retained, not verified blank. OCR not attempted.']
      : quality.ambiguousLayout ? ['Reading order may need review.'] : [],
  };
}

/** The derived text has its own immutable offsets; each page also retains its
 * original fragments/rectangles. Omissions do not manufacture placeholder text.
 */
export async function convertPdfPages(fileHash: string, pageCount: number,
  extract: (pageIndex: number, signal: AbortSignal) => Promise<Omit<ImportPage, 'startOffset' | 'endOffset'>>,
  signal: AbortSignal, progress: (value: ImportProgress) => void,
) {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 10000) throw new IncompatiblePdfError('This PDF has an unsupported page count.');
  const pages: ImportPage[] = [];
  let sourceText = '';
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    signal.throwIfAborted();
    progress({ percent: Math.floor(pageIndex / pageCount * 95), stage: 'Extracting text', completed: pageIndex, total: pageCount });
    let page: Omit<ImportPage, 'startOffset' | 'endOffset'>;
    try {
      page = await extract(pageIndex, signal);
    } catch (error) {
      signal.throwIfAborted();
      // PDF.js can wrap a page-local FormatError across its worker boundary.
      // Unknown worker/network/programming failures must remain retryable errors.
      if (!(error instanceof Error) || !(error.name === 'FormatError' ||
        (error.name === 'UnknownErrorException' && 'details' in error &&
          typeof error.details === 'string' && error.details.startsWith('FormatError:')))) throw error;
      page = { pageIndex, status: 'extraction-failed', method: 'embedded',
        native: { text: '', fragments: [] }, source: { text: '', fragments: [] },
        warnings: [`Page extraction failed: ${error.message}`, 'Page omitted from reader; original page retained. OCR not attempted.'] };
    }
    signal.throwIfAborted();
    if (page.pageIndex !== pageIndex) throw new Error('Page extraction returned a different page. Please retry.');
    if (page.status === 'text' && sourceText) sourceText += '\n\n';
    const startOffset = sourceText.length;
    if (page.status === 'text') sourceText += page.source.text;
    pages.push({ ...page, startOffset, endOffset: sourceText.length });
    progress({ percent: Math.floor((pageIndex + 1) / pageCount * 95), stage: 'Extracting text', completed: pageIndex + 1, total: pageCount });
  }
  if (!sourceText.trim()) throw new IncompatiblePdfError('No readable embedded text was detected across the document. Pages may be scanned or damaged; OCR is not supported during import.');
  return { sourceText, manifest: { version: PDF_IMPORT_VERSION, fileHash, offsetUnit: 'UTF-16', nonTextContent: 'retained-in-original-pdf', pages } satisfies PdfImportManifest };
}

export function pdfImportNote(manifest: PdfImportManifest) {
  const omitted = manifest.pages.filter(page => page.status === 'no-text-detected').length;
  const failed = manifest.pages.filter(page => page.status === 'damaged-text' || page.status === 'extraction-failed');
  const pageNumbers = failed.slice(0, 20).map(page => page.pageIndex + 1).join(', ') + (failed.length > 20 ? ', …' : '');
  const review = manifest.pages.filter(page => page.status === 'text' && page.warnings.length).length;
  return ['Original PDF saved. Illustrations are not shown in the text reader.',
    failed.length ? `Partial text: ${failed.length} ${failed.length === 1 ? 'page was' : 'pages were'} omitted because text could not be extracted reliably (PDF pages: ${pageNumbers}). These pages remain in the original PDF.` : '',
    omitted ? `${omitted} ${omitted === 1 ? 'page had' : 'pages had'} no embedded text. Those pages remain in the PDF; any scanned text on them is not included in this reader.` : '',
    review ? `Reading order may need review on ${review} ${review === 1 ? 'page' : 'pages'}.` : '',
  ].filter(Boolean).join(' ');
}

import { assessText, PDF_PIPELINE_VERSION, TextSourceSchema, type TextSource } from './model';

export const PDF_IMPORT_VERSION = `pdf-import-embedded-v1:${PDF_PIPELINE_VERSION}`;
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
  status: 'text' | 'no-text-detected';
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
 * Damaged textual content cannot be silently discarded. No OCR is attempted.
 */
export function classifyImportPage(pageIndex: number, raw: TextSource, repaired: TextSource): Omit<ImportPage, 'startOffset' | 'endOffset'> {
  const source = TextSourceSchema.parse(repaired);
  const native = TextSourceSchema.parse(raw);
  const quality = assessText(source);
  if (quality.status === 'damaged' || (quality.status === 'missing' && (
    native.text.trim() || source.rawText?.trim()
  ))) throw new IncompatiblePdfError(`We couldn’t extract reliable text from page ${pageIndex + 1}.`);
  return {
    pageIndex, status: quality.status === 'missing' ? 'no-text-detected' : 'text',
    method: native.text === source.text ? 'embedded' : 'geometry',
    native, source,
    warnings: quality.status === 'missing' ? ['No embedded text detected; page retained, not verified blank. OCR not attempted.']
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
    const page = await extract(pageIndex, signal);
    signal.throwIfAborted();
    if (page.pageIndex !== pageIndex) throw new Error('Page extraction returned a different page. Please retry.');
    if (page.status === 'text' && sourceText) sourceText += '\n\n';
    const startOffset = sourceText.length;
    if (page.status === 'text') sourceText += page.source.text;
    pages.push({ ...page, startOffset, endOffset: sourceText.length });
    progress({ percent: Math.floor((pageIndex + 1) / pageCount * 95), stage: 'Extracting text', completed: pageIndex + 1, total: pageCount });
  }
  if (!sourceText.trim()) throw new IncompatiblePdfError('No readable embedded text was detected. Scanned PDFs need OCR, which is not supported during import.');
  return { sourceText, manifest: { version: PDF_IMPORT_VERSION, fileHash, offsetUnit: 'UTF-16', nonTextContent: 'retained-in-original-pdf', pages } satisfies PdfImportManifest };
}

export function pdfImportNote(manifest: PdfImportManifest) {
  const omitted = manifest.pages.filter(page => page.status === 'no-text-detected').length;
  const review = manifest.pages.filter(page => page.status === 'text' && page.warnings.length).length;
  return ['Original PDF saved. Illustrations are not shown in the text reader.',
    omitted ? `${omitted} ${omitted === 1 ? 'page had' : 'pages had'} no embedded text. Those pages remain in the PDF; any scanned text on them is not included in this reader.` : '',
    review ? `Reading order may need review on ${review} ${review === 1 ? 'page' : 'pages'}.` : '',
  ].filter(Boolean).join(' ');
}

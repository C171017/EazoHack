import type { PdfBook, TextBook } from '../upload-book';
import { repairNativeSpacing } from './geometry';
import { classifyImportPage, convertPdfPages, IncompatiblePdfError, PDF_IMPORT_VERSION, type ImportProgress } from './import-model';
import { extractNative, loadPdfRuntime, nativeItems } from './runtime';
import { readPdfTextContent } from './text-content';

/** Browser-only import. The PDF renderer remains in the repository but is not
 * part of the active reader route. Copy bytes because PDF.js transfers buffers.
 */
export async function importPdfBook(book: PdfBook, signal: AbortSignal, progress: (value: ImportProgress) => void): Promise<TextBook> {
  signal.throwIfAborted();
  progress({ percent: 0, stage: 'Opening PDF' });
  const pdfjs = await loadPdfRuntime();
  signal.throwIfAborted();
  const task = pdfjs.getDocument({ data: book.data.slice(),
    cMapUrl: '/api/pdf/assets/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/api/pdf/assets/standard_fonts/', wasmUrl: '/api/pdf/assets/wasm/',
    enableXfa: false,
  });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise.catch(error => {
      signal.throwIfAborted();
      if (error?.name === 'PasswordException') throw new IncompatiblePdfError('Please remove password protection before uploading.');
      if (error?.name === 'InvalidPDFException') throw new IncompatiblePdfError('The PDF file could not be read.');
      throw error;
    });
    const result = await convertPdfPages(book.hash, doc.numPages, async (index, pageSignal) => {
      const page = await doc.getPage(index + 1);
      try {
        pageSignal.throwIfAborted();
        const content = await readPdfTextContent(page, pageSignal);
        const raw = extractNative(content, page);
        const native = repairNativeSpacing(raw, nativeItems(content));
        pageSignal.throwIfAborted();
        // Lightweight import only: no rendering, OCR, OCR caches, or model calls.
        return classifyImportPage(index, raw, native);
      } finally { page.cleanup(); }
    }, signal, progress);
    signal.throwIfAborted();
    // Content hash isolates anchors if extraction rules change the derived text.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(result.sourceText));
    const textHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { kind: 'txt', title: book.title, bookId: `pdf-text:${book.hash}`,
      preview: { sourceText: result.sourceText, text: result.sourceText.slice(0, 6000), startOffset: 0,
        totalCharacters: result.sourceText.length, fileHash: book.hash, extractionVersion: `${PDF_IMPORT_VERSION}:${textHash}` },
      originalPdf: { hash: book.hash, data: book.data, manifest: result.manifest },
    };
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy().catch(() => {});
  }
}

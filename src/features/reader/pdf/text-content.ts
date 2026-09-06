import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';
import { throwIfAborted } from '../../browser/abort';

/** Same aggregation as PDF.js getTextContent, without requiring streams to
 * implement Symbol.asyncIterator (absent in the tested Safari runtime).
 */
export async function readPdfTextContent(page: Pick<PDFPageProxy, 'streamTextContent'>, signal: AbortSignal): Promise<TextContent> {
  throwIfAborted(signal);
  const reader = page.streamTextContent().getReader();
  const result: TextContent = { items: [], styles: Object.create(null), lang: null };
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) return result;
      result.lang ??= value.lang;
      Object.assign(result.styles, value.styles);
      result.items.push(...value.items);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

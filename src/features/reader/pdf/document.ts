import { assessText, PDF_PIPELINE_VERSION, TextSourceSchema, type PageText, type TextSource } from './model';

export const DOCUMENT_TEXT_VERSION = 'pdf-document-text-v2';
export type DocumentPage = {
  pageIndex: number;
  status: 'pending' | 'ready' | 'needs-review' | 'ocr-deferred' | 'failed';
  method?: 'embedded' | 'geometry' | 'ocr';
  native?: TextSource;
  source?: TextSource;
  extractionVersion?: string;
  reasons: string[];
};
export type DocumentText = {
  version: typeof DOCUMENT_TEXT_VERSION;
  fileHash: string;
  status: 'idle' | 'running' | 'cancelled' | 'finished';
  pages: DocumentPage[];
};

export function createDocumentText(fileHash: string, pageCount: number): DocumentText {
  if (!/^[a-f0-9]{64}$/.test(fileHash) || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 10000) throw new Error('Invalid PDF identity or page count');
  return {version:DOCUMENT_TEXT_VERSION,fileHash,status:'idle',pages:Array.from({length:pageCount},(_,pageIndex)=>({pageIndex,status:'pending',reasons:[]}))};
}

/** No OCR invocation here. Completed local OCR may be reused, but never silently
 * launch full-book recognition. A future server task is deliberately absent.
 */
export function prepareDocumentPage(pageIndex: number, native: TextSource, repaired: TextSource, cached?: PageText | null): DocumentPage {
  TextSourceSchema.parse(native);
  TextSourceSchema.parse(repaired);
  const useOcr = cached?.method === 'ocr' && cached.pageIndex === pageIndex;
  const source = useOcr ? TextSourceSchema.parse(cached.source) : repaired;
  const quality = assessText(source);
  const status = quality.status !== 'usable' ? (useOcr ? 'needs-review' : 'ocr-deferred') : quality.ambiguousLayout ? 'needs-review' : 'ready';
  return {pageIndex,status,method:useOcr?'ocr':native.text===repaired.text?'embedded':'geometry',native,source,
    extractionVersion:useOcr?cached.version:PDF_PIPELINE_VERSION,
    reasons:[...quality.reasons,...(quality.ambiguousLayout?['Reading order needs review']:[]),...(status==='ocr-deferred'?['OCR deferred; original page retained']:[])]};
}

/** Sequential traversal bounds parsing pressure; cancellation retains completed
 * pages. Resume skips ready pages and retries failed/review/deferred pages.
 */
export async function extractDocumentText(initial: DocumentText, extract: (pageIndex:number,signal:AbortSignal)=>Promise<DocumentPage>, signal:AbortSignal, onProgress:(value:DocumentText)=>void): Promise<DocumentText> {
  let result: DocumentText = {...initial,status:'running',pages:[...initial.pages]};
  onProgress(result);
  for (const entry of initial.pages) {
    if (signal.aborted) break;
    if (entry.status === 'ready') continue;
    let page: DocumentPage;
    try {
      page = await extract(entry.pageIndex,signal);
      if (signal.aborted) break;
      if (page.pageIndex !== entry.pageIndex || page.status === 'pending') throw new Error('Invalid page extraction result');
    } catch (error) {
      if (signal.aborted) break;
      page = {pageIndex:entry.pageIndex,status:'failed',reasons:[error instanceof Error?error.message.slice(0,500):'Page extraction failed']};
    }
    const pages = [...result.pages];
    pages[entry.pageIndex] = page;
    result = {...result,pages};
    onProgress(result);
  }
  result = {...result,status:signal.aborted?'cancelled':'finished'};
  onProgress(result);
  return result;
}

export function documentCoverage(document: DocumentText) {
  const count = (status:DocumentPage['status'])=>document.pages.filter(p=>p.status===status).length;
  return {total:document.pages.length,processed:document.pages.length-count('pending'),ready:count('ready'),review:count('needs-review'),deferred:count('ocr-deferred'),failed:count('failed'),pending:count('pending')};
}

/** Form-feed separators keep every page slot, including unavailable pages.
 * The companion manifest is required to distinguish empty from unrecognized.
 * Offsets are UTF-16, matching the existing PDF SourceAnchor contract.
 */
export function exportDocumentText(document: DocumentText) {
  let text = '';
  const pages = document.pages.map((page,i)=>{
    if (i) text += '\n\f\n';
    const startOffset = text.length;
    text += page.source?.text ?? '';
    return {...page,startOffset,endOffset:text.length};
  });
  return {text,manifest:{...document,coverage:documentCoverage(document),nonTextContent:'not-analyzed',offsetUnit:'UTF-16',pages}};
}

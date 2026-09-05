import { SelectionSchema, SourceAnchorSchema, type Selection, type SourceAnchor } from '@/shared/schemas';
import type { PageText, Rect } from './model';
import { selectionTimestamp } from '../../persistence/selection-activity';

export type PdfSelection = { selection: Selection; anchors: SourceAnchor[]; provenance: { pageIndex: number; method: string; reviewRequired: boolean }[] };
export async function extractionId(page: PageText): Promise<string> {
  const bytes = new TextEncoder().encode(page.source.text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
  return `${page.version}:${page.method}:${page.language}:${hash.slice(0,24)}`;
}

export async function createPdfSelection(hash: string, pages: PageText[], start: { page: number; offset: number }, end: { page: number; offset: number }, rectangles?: Map<number, Rect[]>, selectedAt = selectionTimestamp()): Promise<PdfSelection> {
  if (start.page > end.page || (start.page===end.page && start.offset>=end.offset)) throw new Error('Select a nonempty passage.');
  if(end.page-start.page>=100) throw new Error('Select a passage of fewer than 100 pages.');
  const anchors: SourceAnchor[] = [];
  const provenance: PdfSelection['provenance'] = [];
  for(let index=start.page;index<=end.page;index++) {
    const page=pages.find(p=>p.pageIndex===index && p.fileHash===hash);
    if(!page) throw new Error('Wait for text on every selected page to become ready.');
    const from=index===start.page?start.offset:0, to=index===end.page?end.offset:page.source.text.length;
    if(from<0 || to>page.source.text.length || from>to) throw new Error('Selection falls outside source text.');
    const quote=page.source.text.slice(from,to);
    if(!quote.trim()) continue;
    const rects=rectangles?.get(index) ?? page.source.fragments.filter(f=>f.end>from&&f.start<to).map(f=>f.rect);
    if(rects.length>200) throw new Error('Select a shorter passage (at most 200 text rectangles per page).');
    anchors.push(SourceAnchorSchema.parse({ id:crypto.randomUUID(),bookId:`pdf:${hash}`,fileHash:hash,extractionVersion:await extractionId(page),
      locators:[{kind:'pdf',pageIndex:index,startOffset:from,endOffset:to,rects}],quote,prefix:page.source.text.slice(Math.max(0,from-80),from),suffix:page.source.text.slice(to,to+80),resolution:'exact' }));
    provenance.push({pageIndex:index,method:page.method,reviewRequired:page.reviewRequired});
  }
  const selectedText=anchors.map(a=>a.quote).join('\n');
  if(!selectedText.trim()||selectedText.length>20000) throw new Error('Choose a passage of 1–20,000 characters.');
  const selection=SelectionSchema.parse({ id:crypto.randomUUID(),bookId:`pdf:${hash}`,anchorIds:anchors.map(a=>a.id),selectedText,contextSnapshot:JSON.stringify({format:'pdf',provenance}),createdAt:selectedAt });
  return {selection,anchors,provenance};
}

export function selectionEndpoint(node: Node, offset: number): {page: number; offset: number} | null {
  const element=node instanceof Element?node:node.parentElement;
  let span=element?.closest<HTMLElement>('[data-pdf-start]');
  // Native ranges can end between spans (e.g. after a PDF.js line break), not inside a text node.
  if(!span && node instanceof Element && node.closest('.pdf-text-layer')) {
    const child=node.childNodes[offset];
    const next=child instanceof Element?(child.matches('[data-pdf-start]')?child:child.querySelector('[data-pdf-start]')):null;
    if(next) {
      const page=next.closest<HTMLElement>('[data-pdf-page]');
      return page?{page:Number(page.dataset.pdfPage),offset:Number((next as HTMLElement).dataset.pdfStart)}:null;
    }
    const previous=node.childNodes[offset-1];
    if(previous instanceof Element) {
      span=previous.matches('[data-pdf-start]')?previous as HTMLElement:previous.querySelector<HTMLElement>('[data-pdf-start]:last-child');
      if(!span && previous.tagName==='BR')span=previous.previousElementSibling as HTMLElement|null;
      if(span?.hasAttribute('data-pdf-start')) {
        const page=span.closest<HTMLElement>('[data-pdf-page]');
        return page?{page:Number(page.dataset.pdfPage),offset:Number(span.dataset.pdfStart)+(span.textContent?.length??0)}:null;
      }
    }
  }
  const page=span?.closest<HTMLElement>('[data-pdf-page]');
  if(!span||!page) return null;
  const before=document.createRange(); before.selectNodeContents(span); before.setEnd(node,offset);
  return {page:Number(page.dataset.pdfPage),offset:Number(span.dataset.pdfStart)+before.toString().length};
}

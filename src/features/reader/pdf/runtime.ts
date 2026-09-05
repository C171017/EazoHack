import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PageViewport } from 'pdfjs-dist/types/src/display/page_viewport';
import type { Worker as OcrWorker } from 'tesseract.js';
import type { Rect, TextSource } from './model';

export async function loadPdfRuntime() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/api/pdf/assets/pdf.worker.mjs';
  return pdfjs;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Store rectangles in unrotated, top-left page coordinates regardless of display rotation. */
export function sourceRect(viewport: PageViewport, base: PageViewport, box: number[]): Rect {
  const corners = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(([x,y]) => {
    const [px, py] = viewport.convertToPdfPoint(x,y);
    return base.convertToViewportPoint(px,py);
  });
  const x = clamp(Math.min(...corners.map(p => p[0])) / base.width);
  const y = clamp(Math.min(...corners.map(p => p[1])) / base.height);
  return { x, y, width: Math.max(0.000001, clamp(Math.max(...corners.map(p => p[0])) / base.width) - x), height: Math.max(0.000001, clamp(Math.max(...corners.map(p => p[1])) / base.height) - y) };
}
export function displayRect(rect: Rect, base: PageViewport, viewport: PageViewport): number[] {
  const points = [[rect.x, rect.y], [rect.x+rect.width, rect.y+rect.height]].map(([x,y]) => {
    const [px,py] = base.convertToPdfPoint(x*base.width,y*base.height);
    return viewport.convertToViewportPoint(px,py);
  });
  return [Math.min(points[0][0],points[1][0]), Math.min(points[0][1],points[1][1]), Math.abs(points[1][0]-points[0][0]), Math.abs(points[1][1]-points[0][1])];
}

export function extractNative(content: TextContent, page: PDFPageProxy): TextSource {
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  let text = '';
  const fragments: TextSource['fragments'] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const start = text.length;
    text += item.str;
    const [a,b,c,d,e,f] = item.transform;
    // A conservative quad from baseline direction and font ascent/descent; live selection uses DOM rects.
    const h = Math.hypot(c,d) || item.height || 1;
    const w = item.width || Math.hypot(a,b) || 1;
    const angle = Math.atan2(b,a), ux=Math.cos(angle), uy=Math.sin(angle);
    const ascent = content.styles[item.fontName]?.ascent ?? 0.8;
    const points = [[0,-h*(1-ascent)],[w,-h*(1-ascent)],[0,h*ascent],[w,h*ascent]].map(([x,y]) => viewport.convertToViewportPoint(e+x*ux-y*uy,f+x*uy+y*ux));
    const box=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
    fragments.push({ id: `n${fragments.length}`, text: item.str, start, end: text.length, rect: sourceRect(viewport,viewport,box), confidence: null });
    if (item.hasEOL) text += '\n';
  }
  return { text, fragments };
}

export function nativeItems(content: TextContent): TextItem[] { return content.items.filter((i): i is TextItem => 'str' in i); }

/** One worker per reader. OCR work is serialized, aborted on page departure, released after idle. */
export class LocalOcr {
  private tail: Promise<unknown> = Promise.resolve();
  private worker: OcrWorker | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  activate() { this.disposed=false; }
  async recognize(page: PDFPageProxy, signal: AbortSignal): Promise<TextSource> {
    const job = this.tail.catch(() => {}).then(() => this.run(page,signal));
    this.tail = job;
    return job;
  }
  private async run(page: PDFPageProxy, signal: AbortSignal): Promise<TextSource> {
    signal.throwIfAborted();
    if (this.disposed) throw new Error('Reader closed');
    if (this.idle) clearTimeout(this.idle);
    const canvas = document.createElement('canvas');
    const base = page.getViewport({ scale: 1, rotation: 0 });
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 2400 / Math.max(natural.width,natural.height), Math.sqrt(5_000_000 / (natural.width*natural.height)));
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const render = page.render({ canvas, viewport });
    let abort: () => void = () => {};
    const timeout = AbortSignal.timeout(90000);
    const combined = AbortSignal.any([signal, timeout]);
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => { render.cancel(); this.release(); reject(combined.reason); };
      combined.addEventListener('abort', abort, { once: true });
    });
    try {
      return await Promise.race([cancelled, (async () => {
        await render.promise;
        combined.throwIfAborted();
        if (!this.worker) {
          const { createWorker, PSM } = await import('tesseract.js');
          const worker = await createWorker('eng', 1, {
            workerPath: '/api/pdf/assets/ocr/worker.min.js', corePath: '/api/pdf/assets/ocr',
            langPath: '/api/pdf/assets/ocr', workerBlobURL: false,
          });
          if (combined.aborted || this.disposed) { await worker.terminate(); combined.throwIfAborted(); throw new Error('Reader closed'); }
          await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
          this.worker = worker;
        }
        const { data } = await this.worker.recognize(canvas, {}, { text: true, blocks: true });
        combined.throwIfAborted();
        let text = '';
        const fragments: TextSource['fragments'] = [];
        for (const block of data.blocks ?? []) for (const para of block.paragraphs) for (const line of para.lines) {
          for (const word of line.words) {
            const start = text.length;
            text += word.text;
            fragments.push({ id: `o${fragments.length}`, text: word.text, start, end: text.length,
              rect: sourceRect(viewport, base, [word.bbox.x0,word.bbox.y0,word.bbox.x1,word.bbox.y1]), confidence: Math.max(0,Math.min(100,word.confidence)) });
            text += ' ';
          }
          text += '\n';
        }
        return { text, fragments };
      })()]);
    } finally {
      combined.removeEventListener('abort', abort);
      canvas.width = canvas.height = 0;
      this.idle = setTimeout(() => this.release(), 15000);
    }
  }
  private release() { const w=this.worker; this.worker=null; if(w) void w.terminate(); }
  dispose() { this.disposed=true; if(this.idle) clearTimeout(this.idle); this.release(); }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import { readPdfTextContent } from '../src/features/reader/pdf/text-content';

const item = (str: string): TextItem => ({ str, dir: 'ltr', width: 10, height: 10, transform: [1, 0, 0, 1, 0, 0], fontName: 'font', hasEOL: false });

test('PDF text aggregation works with a non-iterable Safari-style stream and retains styles and order', async () => {
  const chunks: TextContent[] = [
    { items: [item('Exact 😀')], styles: { font: { fontFamily: 'serif', ascent: .9, descent: -.2, vertical: false } }, lang: null },
    { items: [item('源文')], styles: {}, lang: 'zh' },
  ];
  const stream = new ReadableStream<TextContent>({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); } });
  Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined });
  const result = await readPdfTextContent({ streamTextContent: () => stream }, new AbortController().signal);
  assert.deepEqual(result.items, chunks.flatMap(chunk => chunk.items));
  assert.deepEqual({ ...result.styles }, chunks[0].styles);
  assert.equal(result.lang, 'zh');
  assert.equal(stream.locked, false);
});

test('PDF text cancellation cancels a pending read, releases its lock, and never returns partial text', async () => {
  let cancelled = 0;
  const stream = new ReadableStream<TextContent>({ cancel() { cancelled++; } });
  const controller = new AbortController();
  const result = readPdfTextContent({ streamTextContent: () => stream }, controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(cancelled, 1);
  assert.equal(stream.locked, false);
  await assert.rejects(readPdfTextContent({ streamTextContent() { throw new Error('Should not start'); } }, controller.signal), { name: 'AbortError' });
});

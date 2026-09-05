import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { classifyImportPage, convertPdfPages, IncompatiblePdfError, pdfImportNote, type ImportProgress } from '../src/features/reader/pdf/import-model';
import { type TextSource } from '../src/features/reader/pdf/model';
import { createBookLibrary, uploadedBookId } from '../src/features/reader/book-library-store';
import { resolveTxtAnchor } from '../src/features/reader/source-anchor';
import type { TextBook, PdfBook } from '../src/features/reader/upload-book';
import type { SourceAnchor } from '../src/shared/schemas';

const hash = 'a'.repeat(64);
const text = (value: string, confidence: number | null = null): TextSource => ({ text: value, fragments: value ? [{ id: 'n0', text: value, start: 0, end: value.length, rect: {x: .1, y: .1, width: .8, height: .1}, confidence }] : [] });
async function page(index: number, native: TextSource, repaired = native) {
  return classifyImportPage(index, native, repaired);
}

test('PDF import processes every page, preserves exact Unicode text and original page mappings, and allows no-text pages', async () => {
  const inputs = [await page(0, text('First 😀 page.')), await page(1, text(''), text('')), await page(2, text('Final words.'))];
  const visited: number[] = [], progress: ImportProgress[] = [];
  const result = await convertPdfPages(hash, 3, async index => { visited.push(index); return inputs[index]; }, new AbortController().signal, value => progress.push(value));
  assert.deepEqual(visited, [0, 1, 2]);
  assert.equal(result.sourceText, 'First 😀 page.\n\nFinal words.');
  assert.equal(result.manifest.pages[1].status, 'no-text-detected');
  assert.equal(result.manifest.pages[1].startOffset, result.manifest.pages[1].endOffset);
  for (const item of result.manifest.pages) assert.equal(result.sourceText.slice(item.startOffset, item.endOffset), item.source.text);
  assert.equal(progress.at(-1)?.percent, 95, '100% is reserved for successful persistence');
  assert.ok(progress.every((item, index) => index === 0 || item.percent >= progress[index - 1].percent));
  assert.match(pdfImportNote(result.manifest), /any scanned text on them is not included/);
});

test('damaged embedded text blocks conversion rather than dropping text or requesting OCR', async () => {
  await assert.rejects(page(0, text('\uFFFD\uFFFD bad')), IncompatiblePdfError);
  await assert.rejects(page(0, text('\uFFFD\uFFFD bad'), text('')), IncompatiblePdfError);
  await assert.rejects(page(0, text(''), {text: '', fragments: [], rawText: 'Text without positions'}), IncompatiblePdfError);
  const repaired = await page(0, text('Joinedwords.'), text('Joined words.'));
  assert.equal(repaired.method, 'geometry');
  assert.equal(repaired.native.text, 'Joinedwords.');
});

test('no-text documents are incompatible; operational failures remain retryable errors', async () => {
  await assert.rejects(convertPdfPages(hash, 2, async index => page(index, text(''), text('')), new AbortController().signal, () => {}), /No readable embedded text/);
  const unavailable = new Error('PDF worker unavailable');
  await assert.rejects(convertPdfPages(hash, 2, async () => { throw unavailable; }, new AbortController().signal, () => {}), error => error === unavailable && !(error instanceof IncompatiblePdfError));
});

test('cancelled imports do not finish or advance beyond the cancelled page', async () => {
  const controller = new AbortController();
  const visited: number[] = [];
  await assert.rejects(convertPdfPages(hash, 3, async index => {
    visited.push(index);
    controller.abort();
    return page(index, text('Words'));
  }, controller.signal, () => {}), { name: 'AbortError' });
  assert.deepEqual(visited, [0]);
});

test('converted PDF replaces legacy library entry, keeps original bytes, and supports exact text anchors after reopening', async () => {
  const library = createBookLibrary(new IDBFactory());
  const original: PdfBook = { kind: 'pdf', title: 'Book.pdf', hash, data: new TextEncoder().encode('%PDF-original bytes') };
  await library.save(original);
  const converted = await convertPdfPages(hash, 1, async index => page(index, text('Exact source words.')), new AbortController().signal, () => {});
  const book: TextBook = { kind: 'txt', title: original.title, bookId: `pdf-text:${hash}`,
    preview: { sourceText: converted.sourceText, text: converted.sourceText, fileHash: hash, extractionVersion: 'derived-content-hash', startOffset: 0, totalCharacters: converted.sourceText.length },
    originalPdf: { hash, data: original.data, manifest: converted.manifest },
  };
  assert.equal(uploadedBookId(book), uploadedBookId(original));
  await library.save(book);
  const catalogue = await library.list();
  assert.equal(catalogue.length, 1);
  assert.equal(catalogue[0].kind, 'pdf');
  assert.equal(catalogue[0].ready, true);
  assert.ok(!('originalPdf' in catalogue[0]));
  const reopened = await library.load(uploadedBookId(original));
  assert.deepEqual(reopened, book);
  if (reopened.kind !== 'txt') assert.fail('must reopen in text reader');
  const anchor: SourceAnchor = { id: 'anchor', bookId: book.bookId, fileHash: hash, extractionVersion: book.preview.extractionVersion,
    locators: [{ kind: 'txt', startOffset: 6, endOffset: 12 }], quote: 'source', prefix: 'Exact ', suffix: ' words.', resolution: 'exact' };
  assert.ok(resolveTxtAnchor(anchor, { ...reopened.preview, bookId: reopened.bookId }));
  assert.equal(resolveTxtAnchor({...anchor, extractionVersion: 'changed-extraction'}, reopened.preview), null);
});

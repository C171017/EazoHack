import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readUploadedBook } from '../src/features/reader/upload-book';

test('TXT uploads preserve content, normalize line endings and use independent source identities', async () => {
  const result = await readUploadedBook(new File(['你好\r\nA paragraph.\rNext.'], 'book.txt'));
  assert.equal(result.kind, 'txt');
  if (result.kind !== 'txt') return;
  assert.equal(result.preview.sourceText, '你好\nA paragraph.\nNext.');
  assert.equal(result.preview.totalCharacters, result.preview.sourceText.length);
  assert.equal(result.bookId, `txt:${result.preview.fileHash}`);
  const renamed = await readUploadedBook(new File(['你好\r\nA paragraph.\rNext.'], 'renamed.txt'));
  assert.equal(renamed.kind === 'txt' && renamed.bookId, result.bookId);
  const other = await readUploadedBook(new File(['Other book'], 'book.txt'));
  assert.notEqual(other.kind === 'txt' && other.bookId, result.bookId);
});

test('invalid, empty, binary and unsupported uploads fail without a book result', async () => {
  for (const file of [new File([], 'empty.txt'), new File(['   '], 'blank.txt'), new File(['x\0y'], 'binary.txt'), new File([new Uint8Array([255])], 'encoding.txt'), new File(['text'], 'book.epub'), new File(['not a PDF'], 'book.pdf')]) {
    await assert.rejects(readUploadedBook(file));
  }
  const oversized = { name: 'huge.txt', size: 21 * 1024 * 1024, arrayBuffer: () => { throw new Error('should not read'); } } as unknown as File;
  await assert.rejects(readUploadedBook(oversized), /20 MB/);
});

test('PDF upload retains original bytes for the PDF reader', async () => {
  const result = await readUploadedBook(new File(['%PDF-1.7\nsource'], 'book.pdf'));
  assert.equal(result.kind, 'pdf');
  if (result.kind === 'pdf') assert.equal(new TextDecoder().decode(result.data), '%PDF-1.7\nsource');
});

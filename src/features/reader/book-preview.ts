import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export async function getBookPreview() {
  const raw = await readFile(path.join(process.cwd(), 'data/books/plato-republic/raw/republic-jowett-3rd-edition.txt'));
  const fileHash = createHash('sha256').update(raw).digest('hex');
  const normalized = raw.toString('utf8').replace(/\r\n?/g, '\n');
  const startOffset = normalized.indexOf('I went down yesterday to the Piraeus');
  if (startOffset < 0) throw new Error('Book I opening not found in the source.');
  const endOffset = normalized.indexOf('\n\n', startOffset + 6000);
  return {
    text: normalized.slice(startOffset, endOffset),
    sourceText: normalized,
    startOffset,
    fileHash,
    extractionVersion:'txt-lf-v1',
    totalCharacters:normalized.length,
  };
}
export type BookPreview = Awaited<ReturnType<typeof getBookPreview>>;

/** The raw download is immutable; the reader uses the versioned body-only derivative. */
export async function getChineseBookPreview(): Promise<BookPreview> {
  const raw = await readFile(path.join(process.cwd(), 'data/books/hong-lou-meng/derived/hong-lou-meng-reading.txt'));
  const sourceText = raw.toString('utf8');
  return { sourceText, text: sourceText.slice(0, 6000), startOffset: 0,
    fileHash: createHash('sha256').update(raw).digest('hex'),
    extractionVersion: 'txt-lf-v1', totalCharacters: sourceText.length };
}

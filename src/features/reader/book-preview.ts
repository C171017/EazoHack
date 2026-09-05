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
  return { text: normalized.slice(startOffset, endOffset), startOffset, fileHash, extractionVersion:'txt-lf-v1', totalCharacters:normalized.length };
}
export type BookPreview = Awaited<ReturnType<typeof getBookPreview>>;

import { BookEmblemSchema, emblemExcerpt } from '@/shared/book-emblem';
import { bookLibrary, uploadedBookId } from './book-library-store';
import type { TextBook } from './upload-book';

const pending = new Map<string, Promise<void>>();

/** Decoration never blocks reading, and duplicate uploads reuse the saved mark. */
export function ensureBookEmblem(book: TextBook): Promise<void> {
  const id = uploadedBookId(book);
  const existing = pending.get(id);
  if (existing) return existing;
  const work = (async () => {
    const entry = (await bookLibrary.list()).find(item => item.id === id);
    if (entry?.emblem) return;
    const response = await fetch('/api/book-emblem', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(55000),
      body: JSON.stringify({ title: book.title.slice(0, 500), excerpt: emblemExcerpt(book.preview.sourceText) }),
    });
    if (!response.ok) throw new Error('Custom emblem unavailable.');
    const body = await response.json();
    await bookLibrary.setEmblem(id, BookEmblemSchema.parse(body.emblem));
  })().finally(() => pending.delete(id));
  pending.set(id, work);
  return work;
}

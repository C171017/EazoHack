import { sampleBook } from '@/shared/sample-books';
import { libraryForOwner } from '../reader/book-library-store';
import type { ShelfBook } from './library';
import { cloudRequest } from './request';

/** Compute the landing synchronously; persistence must never hold the drag ghost. */
export function placeShelfBook(books: ShelfBook[], id: string, slot: number): ShelfBook[] {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= 10000) throw new Error('Choose an available shelf space.');
  const moving = books.find(book => book.id === id);
  if (!moving?.shelf || moving.shelf.slot === slot) return books;
  return books.map(book => book.id === id ? { ...book, shelf: { ...book.shelf!, slot } }
    : book.shelf?.slot === slot ? { ...book, shelf: { ...book.shelf, slot: moving.shelf!.slot } } : book);
}

export async function persistShelfMove(before: ShelfBook[], after: ShelfBook[]) {
  for (const book of after) {
    if (book.shelf?.slot === before.find(entry => entry.id === book.id)?.shelf?.slot) continue;
    if (book.cloud && !book.localId && !sampleBook(book.id)) {
      await cloudRequest('shelf', { book: book.cloud.book, slot: book.shelf!.slot }, book.cloud.owner);
    } else {
      await libraryForOwner(book.deviceOwner).move(book.localId ?? book.id, book.shelf!.slot);
    }
  }
}

import { bookLibrary, libraryForOwner, type LibraryEntry } from '../reader/book-library-store';
import { nextShelfPosition } from '../reader/bookshelf-model';
import { sampleBook } from '@/shared/sample-books';
import { cloudRequest } from './request';

export type CloudBook = { id: string; title: string; local_book_id: string; created_at: string; metadata?: { shelf?: { slot: number; variant: number } }; book_sources: { id: string; file_hash: string; extraction_version: string; created_at?: string }[] };
export type ShelfBook = LibraryEntry & { cloud?: { owner: string; book: string; source: string }; localId?: string };

/** Account records only enter the visible shelf after a fresh authenticated request. */
export function combineLibrary(local: LibraryEntry[], remote: CloudBook[], owner?: string): ShelfBook[] {
  const occupied = new Set<number>();
  const result: ShelfBook[] = local.filter(book => !book.deviceOwner || book.deviceOwner === owner).map(book => {
    const shelf = book.shelf && !occupied.has(book.shelf.slot) ? book.shelf : nextShelfPosition(book.id, occupied, book.shelf?.slot);
    occupied.add(shelf.slot);
    return { ...book, shelf, localId: sampleBook(book.id) ? undefined : book.id };
  });
  if (!owner) return result;
  for (const book of remote) {
    for (const source of [...book.book_sources].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))) {
      const existing = result.find(entry => !entry.cloud && (entry.sourceBookId ?? (entry.ready ? entry.id.replace(/^pdf:/, 'pdf-text:') : entry.id)) === book.local_book_id && (!entry.extractionVersion || entry.extractionVersion === source.extraction_version));
      const cloud = { owner, book: book.id, source: source.id };
      if (existing) { existing.cloud = cloud; continue; }
      const id = `cloud:${source.id}`;
      const shelf = nextShelfPosition(id, occupied, book.metadata?.shelf?.slot);
      occupied.add(shelf.slot);
      result.push({ id, title: book.title, kind: 'txt', ready: true, addedAt: book.created_at, shelf, cloud });
    }
  }
  return result.sort((a, b) => a.shelf!.slot - b.shelf!.slot);
}

export async function readShelf() {
  const local = await bookLibrary.list(true);
  try {
    const session = await cloudRequest('session');
    if (!session.id) return { books: combineLibrary(local, []), owner: undefined };
    const [remote, cached]: [CloudBook[], LibraryEntry[]] = await Promise.all([cloudRequest('books', undefined, session.id), libraryForOwner(session.id).list()]);
    const visible = [...new Map([...local, ...cached.map(book => ({ ...book, deviceOwner: session.id as string }))].map(book => [book.id, book])).values()];
    return { books: combineLibrary(visible, remote, session.id), owner: session.id as string };
  } catch (error) {
    return { books: combineLibrary(local, []), owner: undefined, error: error instanceof Error ? error.message : 'Account books could not be loaded.' };
  }
}

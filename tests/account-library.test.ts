import test from 'node:test';
import assert from 'node:assert/strict';
import { combineLibrary, type CloudBook } from '../src/features/cloud/library';
import type { LibraryEntry } from '../src/features/reader/book-library-store';
const local: LibraryEntry[] = [
  { id: 'plato-republic', title: 'Republic', kind: 'txt', addedAt: '', shelf: { slot: 0, variant: 0 } },
  { id: 'hong-lou-meng', title: '红楼梦', kind: 'txt', addedAt: '', shelf: { slot: 1, variant: 3 } },
  { id: 'pdf:original', sourceBookId: 'pdf-text:hash', extractionVersion: 'v2', title: 'Local PDF', kind: 'txt', addedAt: '', shelf: { slot: 2, variant: 1 } },
];
const cloud = (id: string, localId: string, source = id): CloudBook => ({ id, local_book_id: localId, title: 'Account book', created_at: '', book_sources: [{ id: source, file_hash: 'hash', extraction_version: 'v2' }] });
test('signed-out shelf cannot include account books even with old remote data', () => {
  const shelf = combineLibrary(local, [cloud('private', 'private')]);
  assert.equal(shelf.length, 3); assert.ok(shelf.every(book => !book.cloud));
});
test('signed-in shelf combines defaults, local-only books and account books without PDF duplicates', () => {
  const shelf = combineLibrary(local, [cloud('sample', 'plato-republic'), cloud('pdf', 'pdf-text:hash'), cloud('other', 'remote-only')], 'alice');
  assert.equal(shelf.length, 4);
  assert.equal(shelf.find(book => book.id === 'plato-republic')?.cloud?.owner, 'alice');
  assert.equal(shelf.find(book => book.id === 'pdf:original')?.cloud?.source, 'pdf');
  assert.equal(shelf.find(book => book.id === 'pdf:original')?.localId, 'pdf:original');
  assert.ok(shelf.find(book => book.id === 'hong-lou-meng'));
  assert.equal(new Set(shelf.map(book => book.shelf?.slot)).size, shelf.length);
  assert.ok(local.every(book => !('cloud' in book)), 'Guest catalogue remains untouched');
});
test('different extraction versions remain distinct instead of opening mismatched reading', () => {
  const remote = cloud('pdf', 'pdf-text:hash'); remote.book_sources[0].extraction_version = 'v3';
  const shelf = combineLibrary(local, [remote], 'alice');
  assert.equal(shelf.length, 4); assert.equal(shelf[2].cloud, undefined);
});

test('account-only device caches cannot appear in guest or another account shelf', () => {
 const privateCache: LibraryEntry = {id:'private-cache',deviceOwner:'alice',title:'Private',kind:'txt',addedAt:'',shelf:{slot:3,variant:0}};
 assert.ok(!combineLibrary([...local,privateCache],[]).some(book=>book.id==='private-cache'));
 assert.ok(!combineLibrary([...local,privateCache],[],'bob').some(book=>book.id==='private-cache'));
 assert.ok(combineLibrary([...local,privateCache],[],'alice').some(book=>book.id==='private-cache'));
});

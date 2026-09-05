import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTxtAnchor } from '../src/features/reader/source-anchor';
import { fixtureAnchors, fixtureBook, FIXTURE_TEXT } from '../src/shared/fixtures';
import { loadMapStore, nodeDetail } from '../src/server/book-map/store';
import { getBookPreview } from '../src/features/reader/book-preview';
import { createTxtRenderChunks, findTxtBlock } from '../src/features/reader/txt-document';

const anchor=fixtureAnchors[0];
const source={sourceText:FIXTURE_TEXT,...fixtureBook,bookId:fixtureBook.id};
test('exact source resolution rejects stale, ambiguous, corrupted and out-of-bounds evidence',()=>{
  assert.deepEqual(resolveTxtAnchor(anchor,source),anchor.locators[0]);
  for(const patch of [
    {fileHash:'other'}, {extractionVersion:'other'}, {bookId:'other'},
    {quote:'Invented'}, {resolution:'unresolved' as const},
    {locators:[...anchor.locators,...anchor.locators]},
    {locators:[{kind:'txt' as const,startOffset:0,endOffset:FIXTURE_TEXT.length+1}]},
    {locators:[{kind:'txt' as const,startOffset:-1,endOffset:FIXTURE_TEXT.length}]},
  ]) assert.equal(resolveTxtAnchor({...anchor,...patch},source),null);
  assert.equal(resolveTxtAnchor(null,source),null);
});

test('duplicate text resolves by saved UTF-16 offsets, including non-BMP characters',()=>{
  const sourceText='😀 same\n\nsame';
  const a={...anchor,quote:'same',locators:[{kind:'txt' as const,startOffset:9,endOffset:13}]};
  assert.equal(resolveTxtAnchor(a,{...source,sourceText})?.startOffset,9);
});

test('every published leaf retains resolvable source evidence through hierarchy detail loading',async()=>{
  const [store,preview]=await Promise.all([loadMapStore(),getBookPreview()]);
  const chunks=createTxtRenderChunks(preview.sourceText);
  assert.ok(store.graph.nodes.length>0);
  for(const node of store.graph.nodes){
    const detail=nodeDetail(store,node.id)!;
    assert.equal(store.entries.get(node.id)?.kind,'occurrence');
    for(const id of node.anchorIds){
      const anchor=detail.anchors.find(a=>a.id===id);
      assert.ok(anchor,`${node.id}: missing ${id}`);
      const locator=resolveTxtAnchor(anchor,{...preview,bookId:store.graph.bookId});
      assert.ok(locator,`${node.id}: unresolved ${id}`);
      const block=findTxtBlock(chunks,locator.startOffset)!;
      assert.ok(block.startOffset<=locator.startOffset&&block.endOffset>locator.startOffset);
    }
  }
});

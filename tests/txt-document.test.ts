import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createTxtRenderChunks, findTxtBlock, findTxtChunkIndex } from '../src/features/reader/txt-document';

test('TXT render chunks cover every source character exactly once', async () => {
  const text=(await readFile('data/books/plato-republic/raw/republic-jowett-3rd-edition.txt','utf8')).replace(/\r\n?/g,'\n');
  const chunks=createTxtRenderChunks(text);
  assert.ok(chunks.length>20);
  assert.equal(chunks[0].startOffset,0);
  assert.equal(chunks.at(-1)?.endOffset,text.length);
  for(let index=1;index<chunks.length;index++)assert.equal(chunks[index].startOffset,chunks[index-1].endOffset);
  const blocks=chunks.flatMap(chunk=>chunk.blocks);
  assert.equal(blocks[0].startOffset,0);
  assert.equal(blocks.at(-1)?.endOffset,text.length);
  for(let index=1;index<blocks.length;index++)assert.equal(blocks[index].startOffset,blocks[index-1].endOffset);
  assert.equal(blocks.map(block=>text.slice(block.startOffset,block.endOffset)).join(''),text);
});

test('TXT location lookup handles source boundaries and out-of-range offsets', () => {
  const text='First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
  const chunks=createTxtRenderChunks(text,1_000);
  assert.equal(findTxtChunkIndex(chunks,-100),0);
  assert.equal(findTxtChunkIndex(chunks,text.length+100),chunks.length-1);
  assert.equal(findTxtBlock(chunks,0)?.startOffset,0);
  const second=text.indexOf('Second');
  const secondBlock=findTxtBlock(chunks,second);
  assert.equal(secondBlock?.startOffset,second);
  assert.equal(text.slice(secondBlock!.startOffset,secondBlock!.endOffset),'Second paragraph.\n\n');
  assert.equal(findTxtBlock([],0),null);
});

test('very long TXT paragraphs split without changing their content', () => {
  const text=`${'a'.repeat(2_500)}\n${'b'.repeat(2_500)}\n${'c'.repeat(2_500)}`;
  const chunks=createTxtRenderChunks(text,1_000);
  const blocks=chunks.flatMap(chunk=>chunk.blocks);
  assert.ok(blocks.length>1);
  assert.equal(blocks.map(block=>text.slice(block.startOffset,block.endOffset)).join(''),text);
  assert.ok(blocks.slice(1).some(block=>block.continuation));
});

test('invalid TXT render chunk sizes fail explicitly', () => {
  assert.throws(()=>createTxtRenderChunks('text',999),/at least 1,000/);
  assert.deepEqual(createTxtRenderChunks(''),[]);
});

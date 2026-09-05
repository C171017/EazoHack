import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getBookPreview } from '../src/features/reader/book-preview';
test('Republic TXT reader retains the complete normalized source and exact sample offsets',async()=>{
  const preview=await getBookPreview();
  const raw=await readFile('data/books/plato-republic/raw/republic-jowett-3rd-edition.txt','utf8');
  const normalized=raw.replace(/\r\n?/g,'\n');
  assert.equal(preview.fileHash,'19d6e62b3cebec70f7704700655052d906f02be75bcc9b3b2140ba5b2df66883');
  assert.equal(preview.sourceText,normalized);
  assert.equal(preview.totalCharacters,normalized.length);
  assert.equal(preview.sourceText.slice(preview.startOffset,preview.startOffset+preview.text.length),preview.text);
  assert.match(preview.sourceText,/^\*\*\* START OF THE PROJECT GUTENBERG EBOOK 55201 \*\*\*/);
  assert.match(preview.sourceText,/\*\*\* END OF THE PROJECT GUTENBERG EBOOK 55201 \*\*\*\n?$/);
  assert.ok(preview.text.startsWith('I went down yesterday'));
  assert.ok(preview.totalCharacters>preview.text.length);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getBookPreview } from '../src/features/reader/book-preview';
test('Republic preview retains exact normalized source offsets and immutable source hash',async()=>{
  const preview=await getBookPreview();
  const raw=await readFile('data/books/plato-republic/raw/republic-jowett-3rd-edition.txt','utf8');
  assert.equal(preview.fileHash,'19d6e62b3cebec70f7704700655052d906f02be75bcc9b3b2140ba5b2df66883');
  assert.equal(raw.replace(/\r\n?/g,'\n').slice(preview.startOffset,preview.startOffset+preview.text.length),preview.text);
  assert.ok(preview.text.startsWith('I went down yesterday'));
  assert.ok(preview.totalCharacters>preview.text.length);
});

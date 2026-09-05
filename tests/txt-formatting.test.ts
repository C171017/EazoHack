import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { formatTxtRanges } from '../src/features/reader/txt-formatting';
import { createTxtRenderChunks, findTxtBlock } from '../src/features/reader/txt-document';

test('Republic front matter, preface, chapters and prose receive distinct presentation roles', () => {
  const source = readFileSync('data/books/plato-republic/raw/republic-jowett-3rd-edition.txt', 'utf8').replace(/\r\n?/g, '\n');
  const chunks = createTxtRenderChunks(source, undefined, 'The Republic of Plato.');
  const kindAt = (quote: string) => findTxtBlock(chunks, source.indexOf(quote))?.kind;
  assert.equal(kindAt('*** START'), 'metadata');
  assert.equal(kindAt('THE\nREPUBLIC OF PLATO'), 'title');
  assert.equal(kindAt('HENRY FROWDE'), 'frontmatter');
  assert.equal(kindAt('TO MY FORMER PUPILS'), 'dedication');
  assert.equal(kindAt('PREFACE.'), 'heading');
  assert.equal(kindAt('IN publishing a third edition'), 'body');
  assert.equal(kindAt('INTRODUCTION AND ANALYSIS.'), 'heading');
  assert.equal(kindAt('[Sidenote: _Republic._ Introduction.]'), 'note');
  assert.equal(kindAt('I went down yesterday to the Piraeus'), 'body');
  const blocks = chunks.flatMap(chunk => chunk.blocks);
  assert.equal(blocks.map(block => source.slice(block.startOffset, block.endOffset)).join(''), source);
  assert.deepEqual(chunks, createTxtRenderChunks(source, undefined, 'The Republic of Plato.'));
});

test('English, Chinese and Markdown headings work without a blank line before prose', () => {
  for (const heading of ['Preface', 'CHAPTER IV.', 'Chapter 2: A new beginning', '第一章 起点', '前言', '# My heading', '### Subsection']) {
    const source = `${heading}\nThis paragraph is ordinary body text.\n \t\nAnother paragraph.`;
    const blocks = createTxtRenderChunks(source).flatMap(chunk => chunk.blocks);
    assert.equal(blocks[0].kind, heading.startsWith('###') ? 'subheading' : 'heading', heading);
    assert.equal(blocks[1].kind, 'body');
    assert.equal(blocks[2].kind, 'body');
    assert.equal(blocks.map(block => source.slice(block.startOffset, block.endOffset)).join(''), source);
  }
});

test('short dialogue, chapter references, and ordinary prose are not promoted to headings', () => {
  for (const source of ['Yes.', 'NO!', 'Book I describes justice.', 'Introduction to a difficult question is useful.', 'NASA', 'First paragraph.\nContinued on a new line.']) {
    assert.equal(formatTxtRanges(source, 'Unrelated title')[0].kind, 'body', source);
  }
  const source = 'MY BOOK\n\nThis is a short opening paragraph.\n\nLONDON';
  assert.deepEqual(formatTxtRanges(source, 'My Book').map(block => block.kind), ['title', 'body', 'body']);
});

test('notes, dividers, indented verse and lists retain distinct layout hints', () => {
  const source = '[Footnote 1: A note.]\n\n* * *\n\n  First verse\n  Second verse\n\n- First item\n- Second item';
  assert.deepEqual(formatTxtRanges(source).map(block => block.kind), ['note', 'separator', 'verse', 'list']);
});

test('formatting and chunk splitting keep UTF-16 offsets and boundary lookups intact', () => {
  const source = `前言\n\n${'😀 Source text. '.repeat(600)}\n\nCHAPTER II.\n\nThe next paragraph.`;
  const chunks = createTxtRenderChunks(source, 1_000);
  const blocks = chunks.flatMap(chunk => chunk.blocks);
  assert.equal(blocks.map(block => source.slice(block.startOffset, block.endOffset)).join(''), source);
  for (const block of blocks) {
    assert.equal(findTxtBlock(chunks, block.startOffset)?.id, block.id);
    assert.equal(findTxtBlock(chunks, block.endOffset - 1)?.id, block.id);
    if (block.continuation) assert.equal(block.kind, 'body');
  }
});

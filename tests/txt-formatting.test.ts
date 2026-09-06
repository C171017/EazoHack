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

test('dense extracted contents retain wrapped entries and separate page references from folios', () => {
  const source = 'xi C O N T E N T S\nCHAPTER 9: Trade and the\nWorld Economy 298\n9.1 International Trade 300\nThe Importance of Trade 301\nComparative Advantage 303\nThe Policy Response to the 2020\nRecession 305\nPART 4 Consumers and Firms\nCHAPTER 10: Consumer Choice 336\nOnline Appendix: An Extended\nDiscussion of Choice\nGlossary G-1\nCompany Index I-1\n\n';
  const blocks = createTxtRenderChunks(source).flatMap(chunk => chunk.blocks);
  const blockAt = (quote: string) => findTxtBlock(createTxtRenderChunks(source), source.indexOf(quote))!;
  assert.equal(blocks[0].kind, 'page-marker');
  assert.equal(blockAt('CHAPTER 9').kind, 'contents-heading');
  assert.equal(blockAt('World Economy').id, blockAt('CHAPTER 9').id);
  assert.equal(blockAt('Recession').id, blockAt('The Policy').id);
  assert.equal(blockAt('Discussion of Choice').pageNumberStart, undefined);
  assert.notEqual(blockAt('Glossary').id, blockAt('Discussion of Choice').id);
  assert.equal(source.slice(blockAt('Glossary').pageNumberStart!, blockAt('Glossary').endOffset).trim(), 'G-1');
  assert.equal(blocks.map(block => source.slice(block.startOffset, block.endOffset)).join(''), source);
  assert.ok(blocks.every(block => source.slice(block.startOffset, block.endOffset).trim()));
});

test('preface pages recover paragraphs, wrapped subheadings and individual wrapped bullets', () => {
  const source = 'P-1\nPREFACE\nOur approach gives readers a detailed introduction to the economy and its many\napplications in everyday life and the decisions that people make each day.\nThis is the end.\nThe next paragraph describes changes in the economy and how we teach them\nusing examples.\n• A first resource with a description long enough to wrap onto another line\nand finish here.\n• A second resource\nNew to This Edition\nThis edition introduces a range of improvements for students and teachers.\nSolving Teaching and Learning\nChallenges\nMany students find the subject unfamiliar, so we use concrete examples and\nexplanations to help them learn.\n';
  const chunks = createTxtRenderChunks(source);
  const at = (quote: string) => findTxtBlock(chunks, source.indexOf(quote))!;
  assert.equal(at('P-1').kind, 'page-marker');
  assert.equal(at('PREFACE').kind, 'heading');
  assert.notEqual(at('Our approach').id, at('The next paragraph').id);
  assert.equal(at('• A first').kind, 'list-item');
  assert.equal(at('and finish').id, at('• A first').id);
  assert.notEqual(at('• A first').id, at('• A second').id);
  assert.equal(at('New to This Edition').kind, 'subheading');
  assert.equal(at('Challenges').id, at('Solving Teaching').id);
  assert.equal(at('Many students').kind, 'body');
});

test('running heads in either order are retained as quiet page markers', () => {
  for (const head of ['P-2 P R E F A C E', 'P R E F A C E P-3', 'xii C O N T E N T S', 'C O N T E N T S xiii']) {
    const source = `${head}\n${'This is a long line of ordinary prose that continues onto the following line\n'.repeat(6)}`;
    assert.equal(formatTxtRanges(source)[0].kind, 'page-marker', head);
  }
});

test('numbers and chart labels within prose do not become folios or headings', () => {
  const source = 'This paragraph discusses an equation and its quantities in a familiar setting.\nThe values below are measurements and should not be mistaken for page numbers.\n2020\nQ1Q2\nP1\nP2\nThe discussion continues with ordinary text explaining how the values change.\nThese labels belong to the explanation, with the final sentence ending here.';
  assert.ok(formatTxtRanges(source).every(block => block.kind === 'body'));
});

test('title-page lines are separated from the book title without rewriting the source', () => {
  const source = 'Economics\nNinth Edition\nFirst Author\nFirst University\nSecond Author\nSecond University\n\nA normal paragraph.';
  const ranges = formatTxtRanges(source, 'Economics 9th Edition - First Author');
  assert.deepEqual(ranges.map(range => range.kind), ['title', 'frontmatter', 'body']);
  assert.equal(ranges.map(range => source.slice(range.startOffset, range.endOffset)).join(''), source);
});

test('ordinary hard-wrapped prose remains joined and uncertain flattened text is not invented', () => {
  const wrapped = Array.from({ length: 8 }, () => 'An ordinary line continues here without a typographic boundary or a new topic').join('\n');
  assert.equal(formatTxtRanges(wrapped).length, 1);
  const flattened = 'Preface Everything has been flattened into a single line. 2020 may be a year. Chapter 2 may be a reference.';
  assert.equal(formatTxtRanges(flattened)[0].kind, 'body');
});

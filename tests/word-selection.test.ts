import assert from 'node:assert/strict';
import test from 'node:test';
import { snapSelectionToWords } from '../src/features/reader/word-selection';

function quote(text: string, start: number, end: number) {
  const range = snapSelectionToWords(text, start, end);
  return range && text.slice(range.startOffset, range.endOffset);
}

test('every partial selection within a word expands to the complete word', () => {
  const text = 'The philosopher speaks.';
  for (let start = 4; start < 15; start++) {
    for (let end = start + 1; end <= 15; end++) {
      assert.equal(quote(text, start, end), 'philosopher');
    }
  }
  assert.equal(quote(text, 7, 19), 'philosopher speaks');
  assert.equal(quote(text, 4, 15), 'philosopher');
  assert.equal(quote(text, 3, 16), 'philosopher');
});

test('punctuation does not pull in adjacent words; internal apostrophes stay intact', () => {
  assert.equal(quote("don't stop", 2, 3), "don't");
  assert.equal(quote('Plato’s ideas', 1, 4), 'Plato’s');
  assert.equal(quote('alpha,beta', 2, 4), 'alpha');
  assert.equal(quote('alpha,beta', 6, 8), 'beta');
  assert.equal(quote('alpha, beta!', 2, 12), 'alpha, beta!');
});

test('preserves source offsets across paragraphs, combining marks and non-BMP letters', () => {
  assert.equal(quote('first\n\nsecond', 2, 10), 'first\n\nsecond');
  assert.equal(quote('😀 cafe\u0301 𐐀test', 5, 7), 'cafe\u0301');
  assert.equal(quote('😀 cafe\u0301 𐐀test', 10, 12), '𐐀test');
  assert.equal(quote('我喜欢阅读书籍。', 4, 5), '阅读');
});

test('ignores clicks, whitespace-only selections and invalid ranges', () => {
  assert.equal(quote('one two', 1, 1), null);
  assert.equal(quote('one two', 3, 4), null);
  assert.equal(quote('one two', -1, 2), null);
  assert.equal(quote('one two', 0, 8), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { detectReadingLanguage } from '../src/features/reader/reading-language';

const english = 'This is a story about a young man who lived in the city. He went to the library every day to read books and learn about the world. ';
const chinese = '第一回，甄士隐梦幻识通灵，贾雨村风尘怀闺秀。此开卷第一回也。作者自云，因曾历过一番梦幻之后，故将真事隐去，而借通灵之说，撰此石头记一书也。';

test('detects supported book languages from source text', () => {
  assert.equal(detectReadingLanguage(english), 'english');
  assert.equal(detectReadingLanguage(chinese), 'chinese');
});

test('does not mistake Japanese Han or other Latin languages for supported languages', () => {
  for (const source of [
    'これは日本語で書かれた物語です。主人公は毎日図書館に行って本を読みます。静かな町で暮らしている人々について、長い物語が始まります。',
    'Ceci est une histoire écrite en français. Chaque jour, le jeune homme se rend à la bibliothèque pour lire des livres et découvrir le monde.',
    '', '12345', 'Hello',
  ]) assert.equal(detectReadingLanguage(source), 'unsupported');
});

test('uses the body language despite a foreign preface', () => {
  assert.equal(detectReadingLanguage(english.repeat(20) + chinese.repeat(500)), 'chinese');
  assert.equal(detectReadingLanguage(chinese.repeat(30) + english.repeat(500)), 'english');
});

import { franc } from 'franc-min';

export type ReadingLanguage = 'english' | 'chinese' | 'unsupported';

// Sample across the book so a translated title or publisher's preface does not
// decide the menu language. Bound the work even for very large source files.
export function detectReadingLanguage(source: string): ReadingLanguage {
  const size = 2000;
  const count = Math.min(5, Math.ceil(source.length / size));
  if (!count) return 'unsupported';
  const votes = { english: 0, chinese: 0, unsupported: 0 };
  for (let i = 0; i < count; i++) {
    const start = count === 1 ? 0 : Math.floor(i * Math.max(0, source.length - size) / (count - 1));
    const sample = source.slice(start, start + size);
    const letters = sample.match(/\p{L}/gu)?.length ?? 0;
    const kana = sample.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
    // Han characters are shared by Chinese and Japanese. Kana is evidence that
    // a Han-heavy passage must not receive the Chinese font menu.
    const code = letters < 40 || kana / letters > 0.02 ? 'und' : franc(sample, { minLength: 40 });
    votes[code === 'eng' ? 'english' : code === 'cmn' ? 'chinese' : 'unsupported']++;
  }
  if (votes.english > count / 2) return 'english';
  if (votes.chinese > count / 2) return 'chinese';
  return 'unsupported';
}

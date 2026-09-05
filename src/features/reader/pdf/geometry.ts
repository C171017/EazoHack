import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { TextSource } from './model';

/** Insert separators only. Never guess words, remove hyphens, or reorder columns.
 * Keep one fragment per PDF.js item for reversible source offsets.
 */
export function repairNativeSpacing(native: TextSource, items: TextItem[]): TextSource {
  if (items.length !== native.fragments.length) throw new Error('PDF item mapping mismatch');
  let text = '';
  const fragments: TextSource['fragments'] = [];
  let previous: TextItem | null = null;
  for (const [i, item] of items.entries()) {
    if (previous && item.str && text && !/\s$/u.test(text) && !/^\s/u.test(item.str)) {
      const [a,b,,,x,y] = previous.transform;
      const height = Math.hypot(a,b) || previous.height || 1;
      const angle = Math.atan2(b,a);
      const dx = item.transform[4]-x, dy = item.transform[5]-y;
      const along = dx*Math.cos(angle)+dy*Math.sin(angle);
      const across = Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));
      const parallel = Math.abs(Math.sin(Math.atan2(item.transform[1],item.transform[0])-angle)) < 0.05;
      if (parallel && previous.dir === 'ltr' && item.dir === 'ltr') {
        if (across > height*0.6) text += '\n';
        else if (along-previous.width > height*0.12) {
          const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(previous.str)
            && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(item.str);
          if (!cjk) text += ' ';
        }
      }
    }
    const start = text.length;
    text += item.str;
    fragments.push({...native.fragments[i], start, end:text.length});
    if (item.hasEOL) text += '\n';
    if (item.str) previous = item;
  }
  return {text, rawText:native.text, fragments};
}

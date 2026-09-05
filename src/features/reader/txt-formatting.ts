/** Presentation hints only: all ranges still address the unchanged TXT source. */
export type TxtBlockKind = 'body' | 'title' | 'heading' | 'subheading' | 'frontmatter' | 'dedication' | 'metadata' | 'note' | 'separator' | 'verse' | 'list';
export type FormattedTxtRange = { startOffset: number; endOffset: number; kind: TxtBlockKind };

function plain(text: string) {
  return text.trim().replace(/^[_*#]+\s*|\s*[_*#]+$/g, '').replace(/\s+/g, ' ');
}

function titleKey(text: string) {
  return plain(text).replace(/\.(txt|md)$/i, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
}

function headingKind(text: string): 'heading' | 'subheading' | null {
  if (text.trim().includes('\n')) return null;
  const value = plain(text);
  if (value.length > 110 || value.split(' ').length > 16) return null;
  if (/^#{1,6}\s+\S/.test(text.trim())) return /^#{1,2}\s/.test(text.trim()) ? 'heading' : 'subheading';
  if (/^(preface|foreword|introduction(?: and analysis)?|prologue|epilogue|afterword|contents|table of contents|acknowledg(?:e)?ments|appendix|index|notes|序言|前言|序章|引言|目录|目錄|后记|後記|附录|附錄)[.。:]?$/i.test(value)) return 'heading';
  if (/^(book|part|chapter|section|appendix)\s+(?:[IVXLCDM]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:[.:—–-]\s*[^.!?]+|[.:]?)$/i.test(value)
    || /^第[一二三四五六七八九十百零〇两兩\d]+[卷部篇章节章節](?:\s+.{1,60})?$/.test(value)) return 'heading';
  return null;
}

/** Conservative, deterministic rules; uncertain paragraphs remain prose. */
export function formatTxtRanges(text: string, title?: string): FormattedTxtRange[] {
  if (!text) return [];
  const boundaries = new Set([0, text.length]);
  for (const match of text.matchAll(/\n[\t ]*\n(?:[\t ]*\n)*/g)) boundaries.add(match.index + match[0].length);
  // Gutenberg markers often share a paragraph with the title. Isolate the
  // marker, including its newline, without dropping or moving any characters.
  for (const match of text.matchAll(/^\*\*\* (?:START|END) OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*(?:\n|$)/gm)) {
    boundaries.add(match.index);
    boundaries.add(match.index + match[0].length);
  }
  // Also accept an explicit heading immediately followed by prose, as is
  // common in uploaded TXT/Markdown. Only inspect paragraph-leading lines.
  const paragraphs = [...boundaries].sort((a, b) => a - b);
  for (let index = 0; index < paragraphs.length - 1; index++) {
    let cursor = paragraphs[index];
    const end = paragraphs[index + 1];
    while (cursor < end) {
      const newline = text.indexOf('\n', cursor);
      if (newline < 0 || newline >= end || !headingKind(text.slice(cursor, newline))) break;
      if (!text.slice(newline + 1, end).trim()) break;
      boundaries.add(newline + 1);
      cursor = newline + 1;
    }
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const ranges: FormattedTxtRange[] = [];
  let frontmatter = false;
  let bodyStarted = false;
  let contentCount = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const startOffset = points[index], endOffset = points[index + 1];
    const raw = text.slice(startOffset, endOffset).trim();
    const value = plain(raw);
    const lines = text.slice(startOffset, endOffset).replace(/^\n+|\s+$/g, '').split('\n');
    const heading = headingKind(raw);
    let kind: TxtBlockKind = 'body';
    if (/^\*\*\* (?:START|END) OF (?:THE|THIS) PROJECT GUTENBERG/.test(raw)) kind = 'metadata';
    else if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(raw)) kind = 'separator';
    else if (/^\[(?:Sidenote|Footnote|Note|Illustration)\b[\s\S]*\]$/i.test(raw)) kind = 'note';
    else if (heading) {
      kind = heading;
      bodyStarted = true;
      frontmatter = false;
    } else if (!bodyStarted && value.length <= 160 && (
      (title && titleKey(value) === titleKey(title)) ||
      (!title && contentCount === 0 && value.length <= 80 && /[A-Z]/.test(value) && value === value.toUpperCase() && !/[.!?]/.test(value))
    )) {
      kind = 'title';
      frontmatter = true;
    } else if (frontmatter && startOffset < 8_000 && value.length < 500 && lines.every(line => line.length < 85)
      && (value === value.toUpperCase() || (value.length < 85 && value.split(' ').length <= 8 && !/[.!?]$/.test(value)))) {
      kind = /^(?:TO\b|DEDICATED\b|献给|獻給)/.test(value) ? 'dedication' : 'frontmatter';
    } else if (lines.length > 1 && lines.every(line => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(line))) kind = 'list';
    else if (lines.length > 1 && lines.every(line => /^ {2,}\S/.test(line) && line.trim().length < 85)) kind = 'verse';
    else {
      bodyStarted = true;
      frontmatter = false;
    }
    if (value && kind !== 'metadata' && kind !== 'separator') contentCount++;
    ranges.push({ startOffset, endOffset, kind });
  }
  return ranges;
}

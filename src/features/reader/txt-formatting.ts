/** Presentation hints only: all ranges still address the unchanged TXT source. */
export type TxtBlockKind = 'body' | 'title' | 'heading' | 'subheading' | 'frontmatter' | 'dedication' | 'metadata' | 'note' | 'separator' | 'verse' | 'list' | 'list-item' | 'page-marker' | 'contents' | 'contents-heading';
export type FormattedTxtRange = { startOffset: number; endOffset: number; kind: TxtBlockKind; pageNumberStart?: number };

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
  if (/^(?:about the authors?|a word of thanks|brief contents)$/i.test(value)) return 'heading';
  if (/^\d+(?:\.\d+){1,3}\s+\p{Lu}[^.!?]{0,90}$/u.test(value)) return 'subheading';
  if (/^(preface|foreword|introduction(?: and analysis)?|prologue|epilogue|afterword|contents|table of contents|acknowledg(?:e)?ments|appendix|index|notes|序言|前言|序章|引言|目录|目錄|后记|後記|附录|附錄)[.。:]?$/i.test(value)) return 'heading';
  if (/^(book|part|chapter|section|appendix)\s+(?:[IVXLCDM]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:[.:—–-]\s*[^.!?]+|[.:]?)$/i.test(value)
    || /^第[一二三四五六七八九十百零〇两兩\d]+[卷部篇章节章節回](?:\s+.{1,60})?$/.test(value)) return 'heading';
  return null;
}

const PAGE_LABEL = '(?:[A-Z]-)?\\d{1,4}|[ivxlcdm]{1,8}';
const contentsPage = new RegExp(`\\s+(${PAGE_LABEL})\\s*$`);
const pageOnly = new RegExp(`^(?:${PAGE_LABEL})$`);
const listStart = /^\s*(?:[•●▪◦*-]|\d+[.)])\s+\S/;

/** Typography inferred from surviving line structure, never rewritten text.
 * Dense PDF pages need different rules from already paragraph-separated TXT.
 * In particular, a contents reference is not a number to strip from prose.
 */
function lineStructure(text: string, start: number, end: number): FormattedTxtRange[] | null {
  const lines = [...text.slice(start, end).matchAll(/[^\n]+(?:\n|$)/g)]
    .map(match => ({ value: match[0].trim(), start: start + match.index, end: start + match.index + match[0].length }))
    .filter(line => line.value);
  if (lines.length < 6) return null;
  const roles = new Map<number, TxtBlockKind>();
  const cuts = new Set([start, end]);
  const mark = (from: number, to: number, kind: TxtBlockKind) => {
    cuts.add(from); cuts.add(to); roles.set(from, kind);
  };
  // Folios and running heads are only recognized at the edges of a dense
  // page/paragraph. Numbers inside economics prose, equations and lists stay.
  for (const index of [0, lines.length - 1]) {
    const line = lines[index];
    const runningHead = new RegExp(`^(?:(?:${PAGE_LABEL})\\s+[A-Z](?:\\s+[A-Z]){3,}|[A-Z](?:\\s+[A-Z]){3,}\\s+(?:${PAGE_LABEL}))$`);
    if (pageOnly.test(line.value) || runningHead.test(line.value)) mark(line.start, line.end, 'page-marker');
  }
  const contentLines = lines.filter(line => roles.get(line.start) !== 'page-marker');
  const references = contentLines.filter(line => contentsPage.test(line.value));
  const isContents = references.length >= 5 && references.length / contentLines.length >= 0.28
    && contentLines.some(line => /^(?:(?:BRIEF |TABLE OF )?CONTENTS|CHAPTER\s+\d|Chapter\s+\d|\d+\.\d+\s)/.test(line.value));
  if (isContents) {
    let entryStart = contentLines[0].start;
    let entryKind: TxtBlockKind = 'contents';
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      const label = /^(?:(?:BRIEF |TABLE OF )?CONTENTS|PART\s+\d+\b)/.test(line.value);
      const chapter = /^(?:CHAPTER|Chapter)\s+\d+\b/.test(line.value);
      if (label || chapter || /^(?:\*?Online Appendix:|Appendix:|Glossary\b|Company Index\b|Subject Index\b|Credits\b)/i.test(line.value)) {
        if (line.start > entryStart) mark(entryStart, line.start, entryKind);
        entryStart = line.start;
        entryKind = label || chapter ? 'contents-heading' : 'contents';
      }
      const next = contentLines[i + 1];
      const reference = contentsPage.exec(line.value);
      const nextReference = next && contentsPage.exec(next.value);
      const wrappedYear = reference && /^(?:19|20)\d{2}$/.test(reference[1]) && nextReference
        && Number(nextReference[1]) < Number(reference[1]);
      if ((reference && !wrappedYear) || /^(?:BRIEF |TABLE OF )?CONTENTS$/.test(line.value)
        || (entryKind === 'contents-heading' && next && /^(?:CHAPTER|Chapter|Appendix|Preface)\b/.test(next.value))) {
        mark(entryStart, line.end, entryKind);
        entryStart = line.end;
        entryKind = 'contents';
      }
    }
    if (entryStart < contentLines.at(-1)!.end) mark(entryStart, contentLines.at(-1)!.end, entryKind);
  } else {
    const lengths = contentLines.map(line => line.value.length).sort((a, b) => a - b);
    const fullLine = lengths[Math.floor(lengths.length * 0.7)];
    const titleLine = (value: string) => {
      if (value.length > 80 || /[.!?;“”"•\d]|https?:|[—–-]$/.test(value)) return false;
      const words = value.split(/\s+/);
      return words.length <= 12 && words.every(word => /^(?:\p{Lu}[\p{L}’'/-]*[:,]?|and|or|of|the|to|in|for|a|an|on|with|as|at|by)$/u.test(word))
        && /\p{Lu}/u.test(value);
    };
    let listActive = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (roles.has(line.start)) continue;
      const explicit = headingKind(line.value);
      let headingEnd = i;
      // Join up to three short title-case lines only when followed by body.
      if (!explicit && titleLine(line.value)) {
        while (headingEnd + 1 < lines.length && headingEnd - i < 2 && titleLine(lines[headingEnd + 1].value)) headingEnd++;
      }
      const next = lines[headingEnd + 1];
      const inferred = titleLine(line.value) && next && next.value.length >= 55
        && !titleLine(next.value) && !listStart.test(next.value)
        && (i === 0 || roles.has(lines[i - 1].start) || /[.!?:][”’"']?$/.test(lines[i - 1].value)
          || lines[i - 1].value.length < fullLine * 0.8);
      if (explicit || inferred) {
        mark(line.start, lines[explicit ? i : headingEnd].end, explicit ?? 'subheading');
        i = explicit ? i : headingEnd;
        listActive = false;
      } else if (listStart.test(line.value)) {
        cuts.add(line.start); roles.set(line.start, 'list-item');
        listActive = true;
      } else if (!listActive && i > 0 && fullLine >= 55 && lines.length >= 8
        && lines[i - 1].value.length < fullLine * 0.82
        && /[.!?。！？][”’"']?$/.test(lines[i - 1].value)
        && /^[\p{Lu}\p{Script=Han}“‘]/u.test(line.value)) {
        // A short terminal line followed by a new sentence is evidence of a
        // paragraph boundary; ordinary full-width hard wraps remain joined.
        cuts.add(line.start);
      }
    }
  }
  // Keep trailing blank lines in the final source block, not an empty visual row.
  if (lines.at(-1)!.end < end) cuts.delete(lines.at(-1)!.end);
  if (cuts.size === 2) return null;
  const points = [...cuts].sort((a, b) => a - b);
  return points.slice(0, -1).map((startOffset, index) => {
    const endOffset = points[index + 1];
    const kind = roles.get(startOffset) ?? 'body';
    const reference = (kind === 'contents' || kind === 'contents-heading')
      ? contentsPage.exec(text.slice(startOffset, endOffset)) : null;
    return { startOffset, endOffset, kind, ...(reference ? {
      pageNumberStart: startOffset + reference.index + reference[0].indexOf(reference[1]),
    } : {}) };
  });
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
    const opening = text.slice(startOffset, endOffset).trim().split('\n');
    if (startOffset === 0 && title && opening.length >= 2 && opening.length <= 8
      && opening.every(line => line.length < 85) && titleKey(opening[0]).length >= 4
      && titleKey(title).startsWith(titleKey(opening[0])) && !/[.!?]/.test(opening[0])) {
      const titleEnd = text.indexOf('\n', startOffset) + 1;
      ranges.push({ startOffset, endOffset: titleEnd, kind: 'title' },
        { startOffset: titleEnd, endOffset, kind: 'frontmatter' });
      frontmatter = true;
      contentCount += 2;
      continue;
    }
    const structured = lineStructure(text, startOffset, endOffset);
    if (structured) {
      ranges.push(...structured);
      bodyStarted = true;
      frontmatter = false;
      contentCount += structured.length;
      continue;
    }
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

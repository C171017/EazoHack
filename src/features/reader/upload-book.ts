import type { BookPreview } from './book-preview';

export type UploadedBook = { kind: 'txt'; title: string; bookId: string; preview: BookPreview } | { kind: 'pdf'; title: string; hash: string; data: Uint8Array };

/** Validate before replacing the active book. Source identity always uses raw bytes. */
export async function readUploadedBook(file: File): Promise<UploadedBook> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'txt' && extension !== 'pdf') throw new Error('Choose a TXT or PDF book.');
  const limit = (extension === 'txt' ? 20 : 100) * 1024 * 1024;
  if (!file.size) throw new Error('This file is empty. Choose a book with content.');
  if (file.size > limit) throw new Error(`${extension.toUpperCase()} books must be under ${limit / 1024 / 1024} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (extension === 'pdf') {
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-')) throw new Error('This file is not a valid PDF.');
    return { kind: 'pdf', title: file.name, hash, data: bytes };
  }
  let sourceText: string;
  try { sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Save this text file as UTF-8, then upload it again.'); }
  if (sourceText.includes('\0')) throw new Error('This appears to be a binary file. Choose a UTF-8 TXT book.');
  if (!sourceText.trim()) throw new Error('This text file contains no readable content.');
  sourceText = sourceText.replace(/\r\n?/g, '\n');
  return { kind: 'txt', title: file.name, bookId: `txt:${hash}`, preview: { sourceText, text: sourceText.slice(0, 6000), startOffset: 0, totalCharacters: sourceText.length, fileHash: hash, extractionVersion: 'txt-lf-v1' } };
}

import type { SourceAnchor } from '../../shared/schemas';

/** Resolve only against the exact extraction that supplied the evidence. */
export function resolveTxtAnchor(anchor: SourceAnchor | null | undefined, source: {
  sourceText: string; fileHash: string; extractionVersion: string; bookId?: string;
}) {
  if (!anchor || anchor.resolution !== 'exact'
    || anchor.fileHash !== source.fileHash || anchor.extractionVersion !== source.extractionVersion
    || (source.bookId !== undefined && anchor.bookId !== source.bookId)
    || anchor.locators.length !== 1) return null;
  const locator = anchor.locators[0];
  if (locator.kind !== 'txt' || !Number.isSafeInteger(locator.startOffset)
    || !Number.isSafeInteger(locator.endOffset) || locator.startOffset < 0
    || locator.endOffset <= locator.startOffset || locator.endOffset > source.sourceText.length
    || source.sourceText.slice(locator.startOffset, locator.endOffset) !== anchor.quote) return null;
  return locator;
}

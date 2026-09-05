import { z } from 'zod';

export const PDF_PIPELINE_VERSION = 'pdf-text-v1';
export const RectSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict()
  .refine(r => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001, 'Rectangle exceeds page');
export type Rect = z.infer<typeof RectSchema>;
export const FragmentSchema = z.object({
  id: z.string().min(1).max(100), text: z.string().max(20000), start: z.number().int().nonnegative(), end: z.number().int().nonnegative(),
  rect: RectSchema, confidence: z.number().min(0).max(100).nullable(),
}).strict();
export type Fragment = z.infer<typeof FragmentSchema>;
export const TextSourceSchema = z.object({ text: z.string().max(200000), fragments: z.array(FragmentSchema).max(20000) }).strict().superRefine((s, ctx) => {
  const ids = new Set<string>();
  for (const f of s.fragments) {
    if (ids.has(f.id) || f.end < f.start || s.text.slice(f.start, f.end) !== f.text) ctx.addIssue({ code: 'custom', message: 'Invalid fragment binding' });
    ids.add(f.id);
  }
});
export type TextSource = z.infer<typeof TextSourceSchema>;
export type Quality = { status: 'usable' | 'missing' | 'damaged'; reasons: string[]; ambiguousLayout: boolean };
export const LayoutProposalSchema = z.object({
  order: z.array(z.string().max(100)).max(2000),
  headings: z.array(z.object({ fragmentId: z.string().max(100), level: z.number().int().min(1).max(6) }).strict()).max(100),
}).strict();
export type LayoutProposal = z.infer<typeof LayoutProposalSchema>;
export type PageText = {
  pageIndex: number; fileHash: string; language: string; version: string;
  method: 'embedded' | 'ocr'; reason: 'good-embedded' | 'damaged-embedded' | 'missing-embedded' | 'manual-ocr';
  native: TextSource; ocr: TextSource | null; source: TextSource; quality: Quality;
  reviewRequired: boolean; layout: { proposal: LayoutProposal; provider: string } | null;
};

/** Heuristics are warnings, never a guarantee of transcription accuracy. No Latin word test for CJK. */
export function assessText(source: TextSource): Quality {
  const text = source.text.trim();
  const reasons: string[] = [];
  if (!text) return { status: 'missing', reasons: ['No embedded text'], ambiguousLayout: false };
  if ((text.match(/[\uFFFD\u0000-\u0008\uE000-\uF8FF]/g)?.length ?? 0) / text.length > 0.01) reasons.push('Unmapped or damaged characters');
  const latin = text.match(/[A-Za-z]+/g) ?? [];
  if (latin.length > 4 && latin.filter(word => word.length > 30).length / latin.length > 0.12) reasons.push('Suspiciously joined words');
  if (latin.length > 60 && latin.filter(word => word.length === 1).length / latin.length > 0.65) reasons.push('Suspiciously fragmented letters');
  const measured = source.fragments.filter(f => f.confidence !== null);
  if (measured.length && measured.reduce((n, f) => n + f.confidence!, 0) / measured.length < 65) reasons.push('Low OCR confidence');
  // Coexisting left/right runs with a gutter suggest columns or marginal notes.
  const left = source.fragments.filter(f => f.text.trim() && f.rect.x < 0.45 && f.rect.x + f.rect.width < 0.62);
  const right = source.fragments.filter(f => f.text.trim() && f.rect.x > 0.56);
  const ambiguousLayout = left.length > 3 && right.length > 3 && right.some(r => left.some(l => Math.abs(l.rect.y - r.rect.y) < 0.025));
  return { status: reasons.length ? 'damaged' : 'usable', reasons, ambiguousLayout };
}

export function validateLayout(source: TextSource, input: unknown): LayoutProposal {
  const result = LayoutProposalSchema.parse(input);
  const ids = new Set(source.fragments.map(f => f.id));
  if (result.order.length !== ids.size || new Set(result.order).size !== ids.size || result.order.some(id => !ids.has(id))) throw new Error('Layout must retain every fragment exactly once.');
  if (result.headings.some(h => !ids.has(h.fragmentId)) || new Set(result.headings.map(h => h.fragmentId)).size !== result.headings.length) throw new Error('Invalid heading references.');
  return result;
}

export type OcrProvider = (signal: AbortSignal) => Promise<TextSource>;
export async function preparePage(input: { fileHash: string; pageIndex: number; language: string; native: TextSource; forceOcr?: boolean }, ocr: OcrProvider, signal: AbortSignal): Promise<PageText> {
  signal.throwIfAborted();
  const native = TextSourceSchema.parse(input.native);
  const checked = assessText(native);
  const useOcr = input.forceOcr || checked.status !== 'usable';
  const recognized = useOcr ? TextSourceSchema.parse(await ocr(signal)) : null;
  signal.throwIfAborted();
  const source = recognized ?? native;
  const quality = assessText(source);
  // An empty OCR result may be a blank page, illustration, or recognition failure. Do not invent a quote.
  return { fileHash: input.fileHash, pageIndex: input.pageIndex, language: input.language, version: PDF_PIPELINE_VERSION,
    native, ocr: recognized, source, method: useOcr ? 'ocr' : 'embedded',
    reason: input.forceOcr ? 'manual-ocr' : checked.status === 'usable' ? 'good-embedded' : checked.status === 'missing' ? 'missing-embedded' : 'damaged-embedded',
    quality, reviewRequired: quality.status !== 'usable', layout: null };
}

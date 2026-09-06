import { z } from 'zod';

export const PROMPT_VERSION = 'text-graph-v3-batched';
export const RELATIONS = ['defines', 'supports', 'challenges', 'exemplifies', 'develops'] as const;
const Label = z.string().min(1).max(180);
const Note = z.string().min(1).max(1500);
const Ids = z.array(z.string().min(1).max(160));
export const Role = z.enum(['dialogue', 'commentary', 'paratext']);
export const ExtractSchema = z.object({
  summary: Note,
  nodes: z.array(z.object({
    label: Label, identityLabel: Label, summary: Note, sourceRole: Role,
    speaker: Label.nullable(), reasoningHint: Note, generalityHint: Note,
    rationale: Note, passageIds: Ids.min(1).max(3),
  }).strict()).max(8),
  edges: z.array(z.object({
    sourceIndex: z.number().int().nonnegative(), targetIndex: z.number().int().nonnegative(),
    type: z.enum(RELATIONS), rationale: Note, passageIds: Ids.min(1).max(3),
  }).strict()).max(12),
}).strict();
export type Extraction = z.infer<typeof ExtractSchema>;

export const SynthesisSchema = z.object({
  themes: z.array(z.object({ label: Label, rationale: Note, nodeIds: Ids.min(1) }).strict()).min(1).max(7),
  identities: z.array(z.object({ label: Label, nodeIds: Ids.min(1) }).strict()).min(1).max(500),
  crossEdges: z.array(z.object({
    source: z.string(), target: z.string(), type: z.enum(RELATIONS), rationale: Note,
  }).strict()).max(30),
}).strict();
export type Synthesis = z.infer<typeof SynthesisSchema>;
export const IdentityRepairSchema = z.object({ assignments: z.array(z.object({ nodeId: z.string(), identityIndex: z.number().int().nonnegative().nullable() }).strict()).min(1).max(500) }).strict();
export const ReviewSchema = z.object({
  rejectedNodes: z.array(z.object({ id: z.string(), reason: Note }).strict()),
  rejectedEdges: z.array(z.object({ id: z.string(), reason: Note }).strict()),
  notes: z.string().max(3000),
}).strict();
export type Review = z.infer<typeof ReviewSchema>;

export type Passage = { id: string; start: number; end: number; text: string; section: string; role: z.infer<typeof Role> };
export type TextChunk = { id: string; start: number; end: number; passages: Passage[]; context: Passage[]; section: string };
export type Candidate = Extraction['nodes'][number] & { id: string; chunkId: string };
export type CandidateEdge = { id: string; source: string; target: string; type: typeof RELATIONS[number]; rationale: string; passageIds: string[] };
export type ModelReply = { value: unknown; model: string; modelVersion: string; responseId?: string; usage: Record<string, number>; durationMs: number; requestHash?: string };
export type Generate = (system: string, prompt: string, schema: z.ZodType, maxOutputTokens?: number, options?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<ModelReply>;

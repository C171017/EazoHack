import { z } from 'zod';

export const BOOK_AXIS_VERSION = 'reasoning-generality-v1' as const;
const References = z.array(z.string().min(1).max(160)).max(12).refine(ids => new Set(ids).size === ids.length, 'Duplicate axis evidence');
const Rating = z.object({
  value: z.number().finite().min(0).max(4).nullable(),
  rationale: z.string().min(1).max(1500),
  anchorIds: References.min(1),
}).strict();
export const AxisAssessmentSchema = z.object({
  reasoningDepth: Rating.extend({ prerequisiteNodeIds: References }).strict(),
  generality: Rating,
}).strict();
export type AxisAssessment = z.infer<typeof AxisAssessmentSchema>;
export const AXIS_LABELS = ['X · Reasoning depth', 'Y · Generality', 'Z · Source'] as const;
export const LEGACY_AXIS_LABELS = ['X · Themes (legacy)', 'Y · Structure (legacy)', 'Z · Source'] as const;
export function axisValue(value: number | null) { return value === null ? 'Unknown' : `${Number(value.toFixed(2))} / 4`; }
export function axisRange(min:number,max:number) {return `${Number(min.toFixed(2))}–${Number(max.toFixed(2))} / 4`;}

// These are rubric anchors, not buckets or an interval measurement of meaning.
export const AXIS_RUBRIC = `X = reasoning depth: how much prior reasoning WITHIN THIS BOOK the particular claim depends on.
0 = directly introduced observation, assumption or definition; 1 = one local inferential step; 2 = a short linked argument; 3 = several linked results; 4 = an extended chain across arguments.
Y = generality: how broad a class of cases THIS PARTICULAR CLAIM purports to cover.
0 = a specific instance or depicted scene; 1 = a small bounded set; 2 = a restricted class/domain; 3 = a broadly reusable claim; 4 = a very general principle within the work's subject.
Both values range from 0 to 4. Intermediate values are permitted ONLY when the cited content warrants a distinction between anchors. Do not manufacture decimal differences, spread points evenly, or force every level to appear. Genuine ties are valid.
Use null with a reason when a coordinate cannot be established. Missing extracted edges do NOT establish depth 0. An explicitly introduced starting point CAN be 0. A general definition may have depth 0; a specific prediction may have high depth.
Depth is not chapter order, prerequisite background knowledge for a particular reader, difficulty, abstraction, importance, confidence or truth. Generality is not abstractness, physical scale, repetition, popularity, book reach or zoom-group height.
Assess the actual occurrence, not the title's fame or every meaning of its shared concept. Distinguish a literal story from its interpretation, a proposed claim from endorsement, and editor commentary from the author's argument. For a genuinely mixed unit, explain the scope you rate or use null; do not change the accepted claim.
prerequisiteNodeIds names only supported direct reasoning prerequisites among supplied accepted nodes, not related topics, objections or every incoming edge. Explain internal reasoning in the cited passage when no separate prerequisite node exists. Never invent a dependency or infer one from source order. Do not create cyclic prerequisite chains. Cite exact supplied anchor IDs and explain both ratings separately. Z is source order, computed by the application; topics remain metadata/color and never determine X.`;

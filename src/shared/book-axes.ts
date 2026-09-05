import { z } from 'zod';

export const LEGACY_BOOK_AXIS_VERSION = 'reasoning-generality-v1' as const;
export const BOOK_AXIS_VERSION = 'reasoning-generality-v2' as const;
export type BookAxisVersion = typeof BOOK_AXIS_VERSION | typeof LEGACY_BOOK_AXIS_VERSION;
export const AXIS_MAX = 10;
// Geometry stays in its established X 0–1 / Y 0–4 units. Ratings are versioned
// separately so old snapshots, projections, heat fields and bounds stay readable.
export function axisMaximum(version?: BookAxisVersion) { return version === BOOK_AXIS_VERSION ? AXIS_MAX : 4; }
export function axisCoordinate(value:number|null, axis:'x'|'y', version:BookAxisVersion=BOOK_AXIS_VERSION) {
  return value === null ? null : axis === 'x' ? value/axisMaximum(version) : value*4/axisMaximum(version);
}
export function coordinateRating(value:number,axis:'x'|'y',version?:BookAxisVersion) {
  return value*axisMaximum(version)/(axis==='x'?1:4);
}
export function isTenth(value:number) { return Math.abs(value*10-Math.round(value*10))<1e-8; }
const References = z.array(z.string().min(1).max(160)).max(12).refine(ids => new Set(ids).size === ids.length, 'Duplicate axis evidence');
const StoredRating = z.object({
  value: z.number().finite().min(0).max(AXIS_MAX).nullable(),
  rationale: z.string().min(1).max(1500),
  anchorIds: References.min(1),
}).strict();
export const StoredAxisAssessmentSchema = z.object({
  reasoningDepth: StoredRating.extend({ prerequisiteNodeIds: References }).strict(),
  generality: StoredRating,
}).strict();
const Rating = StoredRating.extend({value:z.number().finite().min(0).max(AXIS_MAX).refine(isTenth,'Use at most one decimal place').nullable()});
export const AxisAssessmentSchema = z.object({
  reasoningDepth: Rating.extend({prerequisiteNodeIds:References}).strict(),
  generality: Rating,
}).strict();
export type AxisAssessment = z.infer<typeof AxisAssessmentSchema>;
export const AXIS_LABELS = ['X · Reasoning depth', 'Y · Generality', 'Z · Source'] as const;
export const LEGACY_AXIS_LABELS = ['X · Themes (legacy)', 'Y · Structure (legacy)', 'Z · Source'] as const;
export function axisValue(value: number | null, version?:BookAxisVersion) { return value === null ? 'Unknown' : `${Number(value.toFixed(2))} / ${axisMaximum(version)}`; }
export function axisRange(min:number,max:number,version?:BookAxisVersion) {return `${Number(min.toFixed(2))}–${Number(max.toFixed(2))} / ${axisMaximum(version)}`;}

// These are rubric anchors, not buckets or an interval measurement of meaning.
export const AXIS_RUBRIC = `X = reasoning depth: how much prior reasoning WITHIN THIS BOOK the particular claim depends on.
0 = directly introduced observation, assumption, definition or starting claim with no inference;
1 = immediate inference from an explicit starting point;
2 = one developed local inference with its justification;
3 = a short sequence of local inferences;
4 = a complete local argument whose conclusion depends on that sequence;
5 = a result that uses an earlier established argument;
6 = a linked argument combining multiple established results;
7 = a synthesis of several linked arguments;
8 = a conclusion requiring an extended chain across distinct arguments;
9 = a culminating synthesis requiring multiple extended chains;
10 = a work-wide conclusion dependent on the most extended integrated reasoning in the work.
Rate total required reasoning, including the prior chain; these anchors describe inferential structure, not a mechanical count of edges or chapters.
Y = generality: how broad a class of cases THIS PARTICULAR CLAIM purports to cover.
0 = one particular event, object or depicted scene;
1 = a claim about a named individual or case beyond one moment;
2 = a small explicitly bounded collection of cases;
3 = a narrow subtype under specific conditions;
4 = a defined class within one restricted setting;
5 = a domain-wide claim with substantial conditions or exceptions;
6 = a principle spanning related classes within a domain;
7 = a broadly reusable claim across varied settings in that domain;
8 = a cross-domain principle unifying several kinds of cases;
9 = a near-universal principle with an explicit scope limitation;
10 = a maximally general principle asserted across the work's subject without a narrower class restriction.
Both values range from 0 to 10, with at most ONE decimal place (101 possible positions). Select the best two adjacent anchors, then locate the claim between them using the actual inferential structure or scope: for example 3.2 is close to anchor 3, 3.8 close to anchor 4. Use tenths when the evidence distinguishes an intermediate position; do not default to integers or halves merely because anchors have integer labels. Explain the distinction in the rationale. Do not mechanically multiply an old 0–4 score, manufacture differences, spread points evenly, or force every level to appear. Genuine ties, especially starting points at 0, are valid. The visual grid is only a spatial reference and NEVER constrains scores.
Use null with a reason when a coordinate cannot be established. Missing extracted edges do NOT establish depth 0. An explicitly introduced starting point CAN be 0. A general definition may have depth 0; a specific prediction may have high depth.
Depth is not chapter order, prerequisite background knowledge for a particular reader, difficulty, abstraction, importance, confidence or truth. Generality is not abstractness, physical scale, repetition, popularity, book reach or zoom-group height.
Assess the actual occurrence, not the title's fame or every meaning of its shared concept. Distinguish a literal story from its interpretation, a proposed claim from endorsement, and editor commentary from the author's argument. For a genuinely mixed unit, explain the scope you rate or use null; do not change the accepted claim.
prerequisiteNodeIds names only supported direct reasoning prerequisites among supplied accepted nodes, not related topics, objections or every incoming edge. Explain internal reasoning in the cited passage when no separate prerequisite node exists. Never invent a dependency or infer one from source order. Do not create cyclic prerequisite chains. Cite exact supplied anchor IDs and explain both ratings separately. Z is source order, computed by the application; topics remain metadata/color and never determine X.`;

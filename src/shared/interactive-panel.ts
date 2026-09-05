import { z } from 'zod';

const Copy = z.string().trim().min(1).max(1200);
const Label = z.string().trim().min(1).max(160);
export const INTERACTIVE_PROMPT_VERSION = 'passage-explorer-v1';

/** Finite, authored states: no executable expressions, markup, or remote assets. */
export const InteractivePanelResponseSchema = z.object({
  title: Label,
  goal: Copy,
  mode: z.enum(['compare', 'sequence']),
  controlLabel: Label,
  states: z.array(z.object({
    label: Label,
    premise: Copy,
    outcome: Copy,
    explanation: Copy,
    evidenceQuote: z.string().trim().min(1).max(600),
    basis: z.enum(['passage', 'hypothesis']),
  }).strict()).min(2).max(6),
  takeaway: Copy,
  limitations: z.array(Copy).min(1).max(5),
}).strict().superRefine((panel, ctx) => {
  const labels = panel.states.map(state => state.label.toLocaleLowerCase());
  if (new Set(labels).size !== labels.length) ctx.addIssue({ code: 'custom', path: ['states'], message: 'State labels must be distinct' });
  if (!panel.states.some(state => state.basis === 'passage')) ctx.addIssue({ code: 'custom', path: ['states'], message: 'At least one state must be grounded in the passage' });
  if (panel.states[0]?.basis !== 'passage') ctx.addIssue({ code: 'custom', path: ['states', 0, 'basis'], message: 'The baseline must be grounded in the passage' });
  if (panel.mode === 'sequence' && panel.states.some(state => state.basis !== 'passage')) ctx.addIssue({ code: 'custom', path: ['states'], message: 'Sequence steps must follow the passage' });
});

export const InteractivePanelSchema = z.object({
  schemaVersion: z.literal('1'),
  promptVersion: z.literal(INTERACTIVE_PROMPT_VERSION),
  explorer: InteractivePanelResponseSchema,
  validationStatus: z.enum(['mock_unverified', 'unverified', 'reviewed']),
}).strict();
export type InteractivePanel = z.infer<typeof InteractivePanelSchema>;
export type Explorer = z.infer<typeof InteractivePanelResponseSchema>;
export type PanelState = Record<string, string | number | boolean | null>;

/** Reject invented quotations before attaching any model result to the source. */
export function parsePassageExplorer(raw: unknown, selectedText: string): Explorer {
  const explorer = InteractivePanelResponseSchema.parse(raw);
  // Whitespace normalization permits line wrapping but never changes source offsets.
  const normalize = (text: string) => text.replace(/\s+/gu, ' ').trim();
  const source = normalize(selectedText);
  explorer.states.forEach((state, index) => {
    if (!source.includes(normalize(state.evidenceQuote))) {
      throw new z.ZodError([{ code: 'custom', path: ['states', index, 'evidenceQuote'], message: 'Evidence quote is absent from the selected passage' }]);
    }
  });
  return explorer;
}

export function activeExplorerIndex(explorer: Explorer, state: PanelState): number {
  const value = state.activeIndex;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < explorer.states.length ? value : 0;
}

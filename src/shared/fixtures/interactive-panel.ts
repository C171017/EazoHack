import { INTERACTIVE_PROMPT_VERSION, type InteractivePanel } from '../interactive-panel';

export function mockInteractivePanel(selectedText: string): InteractivePanel {
  const evidenceQuote = selectedText.trim().slice(0, 600);
  return {
    schemaVersion: '1', promptVersion: INTERACTIVE_PROMPT_VERSION, validationStatus: 'mock_unverified',
    explorer: {
      title: 'Explore a passage with its evidence', goal: 'What changes when an interpretation keeps its source nearby?',
      mode: 'compare', controlLabel: 'Choose a reading scenario',
      states: [
        { label: 'Read the passage', premise: 'The selected text is available to inspect.', outcome: 'You can see the wording before considering an interpretation.', explanation: 'This fixed fixture demonstrates a source-backed reading state; it does not interpret this book.', evidenceQuote, basis: 'passage' },
        { label: 'Imagine no source link', premise: 'Imagine an explanation saved without its selected text.', outcome: 'Checking the original wording would require finding the passage again.', explanation: 'This is an invented interface scenario, not an assertion by the author.', evidenceQuote, basis: 'hypothesis' },
      ],
      takeaway: 'Switch cases to explore how the visible result changes, then return to the source.',
      limitations: ['Deterministic demo content, not an AI interpretation of your selection.', 'A qualitative reading aid, not a verified causal model.'],
    },
  };
}

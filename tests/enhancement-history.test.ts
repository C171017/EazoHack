import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enhancementHistoryReducer as reduce, emptyEnhancementHistory as empty } from '../src/features/assistance/enhancement-history';
import { fixtureSelection, fixtureAnchors, makeMockArtifact } from '../src/shared/fixtures';
import { placementsFor } from '../src/features/reader/artifact-placement';

function generation(id: string) {
  const artifacts = [{ ...makeMockArtifact('interactive_ui', fixtureSelection, id), id }];
  return { type: 'generate' as const, artifacts, placements: placementsFor(artifacts, fixtureAnchors) };
}

test('undo removes latest generation; redo restores placement, collapse and interaction state', () => {
  let history = reduce(reduce(empty, generation('first')), generation('second'));
  history = reduce(history, { type: 'update', update: state => ({ ...state, placements: state.placements.map(p => ({ ...p, collapsed: true })), interactionState: { second: { steps: 4 } } }) });
  const before = history.present;
  history = reduce(history, { type: 'undo' });
  assert.deepEqual(history.present.artifacts.map(a => a.id), ['first']);
  assert.equal(history.present.interactionState.second, undefined);
  assert.equal(history.present.placements.length, 1);
  history = reduce(history, { type: 'redo' });
  assert.deepEqual(history.present, before);
  history = reduce(reduce(history, { type: 'undo' }), { type: 'undo' });
  assert.deepEqual(history.present, empty.present);
  history = reduce(reduce(history, { type: 'redo' }), { type: 'redo' });
  assert.deepEqual(history.present, before);
});

test('new successful generation clears redo, empty failures do not, and checkpoints reset history', () => {
  let history = reduce(reduce(empty, generation('first')), { type: 'undo' });
  assert.equal(reduce(history, { type: 'generate', artifacts: [], placements: [] }), history);
  history = reduce(history, generation('replacement'));
  assert.equal(history.future.length, 0);
  assert.equal(reduce(history, { type: 'redo' }), history);
  history = reduce(history, { type: 'reset', state: history.present });
  assert.equal(reduce(history, { type: 'undo' }), history);
  assert.equal(history.past.length, 0);
});

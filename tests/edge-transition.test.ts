import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeTransitionPlan, edgeVisibility } from '../src/features/book-graph/edge-transition';
import { ZOOM_POLICY, type MapLink } from '../src/shared/zoom-hierarchy';

const link = (id: string): MapLink => ({id, source: `${id}-a`, target: `${id}-b`, type: 'supports', count: 1, relationIds: [id]});

test('layer changes retain outgoing relations and fade incoming relations from zero', () => {
  const parent = link('parent'), child = link('child'), shared = link('shared');
  const plan = edgeTransitionPlan([{link: parent, opacity: 1}, {link: shared, opacity: 1}], [child, shared]);
  assert.deepEqual(plan.find(p => p.link.id === 'parent'), {link: parent, from: 1, to: 0});
  assert.deepEqual(plan.find(p => p.link.id === 'child'), {link: child, from: 0, to: 1});
  assert.deepEqual(plan.find(p => p.link.id === 'shared'), {link: shared, from: 1, to: 1});
});

test('rapid reversal resumes each relation at its current opacity without duplicating it', () => {
  const parent = link('parent'), child = link('child');
  const reverse = edgeTransitionPlan([{link: parent, opacity: .4}, {link: child, opacity: .6}], [parent]);
  assert.deepEqual(reverse, [{link: parent, from: .4, to: 1}, {link: child, from: .6, to: 0}]);
  assert.equal(new Set(reverse.map(p => p.link.id)).size, reverse.length);
  const empty = edgeTransitionPlan([{link: parent, opacity: .4}], []);
  assert.equal(empty[0].to, 0);
});

test('edges follow both endpoint fades and suppress coincident arrowheads', () => {
  const a = {x: 10, y: 10, opacity: 1}, b = {x: 110, y: 10, opacity: 1};
  assert.equal(edgeVisibility(1, a, b), 1);
  assert.equal(edgeVisibility(1, a, {...b, opacity: 0}), 0);
  assert.equal(edgeVisibility(.8, {...a, opacity: .5}, b), .4);
  assert.equal(edgeVisibility(1, a, a), 0);
  const separation = [0, 1, 6, 12, 18, 24].map(x => edgeVisibility(1, {...a, x: 0}, {...b, x}));
  assert.deepEqual(separation, [...separation].sort((a, b) => a - b));
  assert.equal(separation.at(-1), 1);
});

test('interrupted transitions remain bounded and preserve the strongest outgoing edges', () => {
  const previous = Array.from({length: 4 * ZOOM_POLICY.edges}, (_, i) => ({link: link(`old-${i}`), opacity: i / (4 * ZOOM_POLICY.edges)}));
  const incoming = Array.from({length: ZOOM_POLICY.edges}, (_, i) => link(`new-${i}`));
  const plan = edgeTransitionPlan(previous, incoming);
  assert.equal(plan.length, 2 * ZOOM_POLICY.edges);
  assert.equal(plan.filter(p => p.to === 1).length, ZOOM_POLICY.edges);
  assert.ok(plan.filter(p => p.to === 0).every(p => p.from >= .75));
});

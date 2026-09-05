import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisRunSchema, ArtifactSchema, ConceptDiagramSchema, GraphSchema, InteractiveUiConfigSchema, ReferenceSchema, ROUTE_KINDS, RoutePlanSchema, SelectionSchema, SourceAnchorSchema } from "../src/shared/schemas";
import { FIXTURE_DATE, fixtureAnchors, fixtureSelection, makeMockArtifact } from "../src/shared/fixtures";

const plan = { id: "plan-test", selectionId: fixtureSelection.id, routes: [...ROUTE_KINDS], reasonByRoute: Object.fromEntries(ROUTE_KINDS.map((route) => [route, "Explicit mock test"])), dependsOn: {}, trigger: { mode: "mock_manual", requestedRoutes: [...ROUTE_KINDS], requestedAt: FIXTURE_DATE }, routerVersion: "mock-v1" };

test("selection rejects empty text and anchors; cross-page anchors remain explicit", () => {
  assert.equal(SelectionSchema.safeParse({ ...fixtureSelection, selectedText: "  " }).success, false);
  assert.equal(SelectionSchema.safeParse({ ...fixtureSelection, anchorIds: [] }).success, false);
  const pdf = { ...fixtureAnchors[0], locators: [{ kind: "pdf", pageIndex: 0, startOffset: 2, endOffset: 8 }, { kind: "pdf", pageIndex: 1, startOffset: 0, endOffset: 5 }] };
  assert.equal(SourceAnchorSchema.parse(pdf).locators.length, 2);
  assert.equal(SourceAnchorSchema.safeParse({ ...fixtureAnchors[0], resolution: "page_only" }).success, false);
  assert.equal(SourceAnchorSchema.safeParse({ ...fixtureAnchors[0], locators: [{ kind: "txt", startOffset: 3, endOffset: 1 }] }).success, false);
});

test("route plans allow all four routes and reject duplicate, unknown and cyclic dependencies", () => {
  assert.equal(RoutePlanSchema.parse(plan).routes.length, 4);
  assert.equal(RoutePlanSchema.safeParse({ ...plan, routes: ["interactive_ui", "interactive_ui"] }).success, false);
  assert.equal(RoutePlanSchema.safeParse({ ...plan, dependsOn: { interactive_ui: ["generated_image"], generated_image: ["interactive_ui"] } }).success, false);
  assert.equal(RoutePlanSchema.safeParse({ ...plan, routes: ["interactive_ui"], reasonByRoute: { interactive_ui: "Test" }, dependsOn: { interactive_ui: ["generated_image"] } }).success, false);
  assert.equal(RoutePlanSchema.safeParse({ ...plan, reasonByRoute: {} }).success, false);
  assert.equal(RoutePlanSchema.safeParse({ ...plan, trigger: { ...plan.trigger, requestedRoutes: ["interactive_ui"] } }).success, false);
});

test("four mock artifacts retain selection binding and honest provenance", () => {
  for (const kind of ROUTE_KINDS) {
    const artifact = ArtifactSchema.parse(makeMockArtifact(kind, fixtureSelection, `run-${kind}`));
    assert.equal(artifact.selectionId, fixtureSelection.id);
    assert.deepEqual(artifact.anchorIds, fixtureSelection.anchorIds);
    assert.equal(artifact.provenance.provider, "mock");
  }
});

test("interactive configs reject executable fields and invalid parameters", () => {
  const artifact = makeMockArtifact("interactive_ui", fixtureSelection, "run-ui");
  assert.equal(artifact.kind, "interactive_ui");
  if (artifact.kind !== "interactive_ui") return;
  for (const key of ["code", "html", "script", "className"]) {
    assert.equal(InteractiveUiConfigSchema.safeParse({ ...artifact.payload, [key]: "unsafe" }).success, false);
    assert.equal(InteractiveUiConfigSchema.safeParse({ ...artifact.payload, components: [{ component: "ExplanationCard", props: { title: "x", body: "x", [key]: "unsafe" } }] }).success, false);
  }
  assert.equal(InteractiveUiConfigSchema.safeParse({ ...artifact.payload, components: [{ component: "Unregistered", props: {} }] }).success, false);
  assert.equal(InteractiveUiConfigSchema.safeParse({ ...artifact.payload, components: [{ component: "ParameterSlider", props: { label: "x", min: 0, max: 1, value: 2, step: 1, unit: "" } }] }).success, false);
});

test("diagram and graph integrity reject dangling endpoints, duplicate IDs and ungrounded facts", () => {
  const artifact = makeMockArtifact("concept_diagram", fixtureSelection, "run-diagram");
  if (artifact.kind !== "concept_diagram") throw new Error("Wrong fixture kind");
  assert.equal(ConceptDiagramSchema.safeParse({ ...artifact.payload, edges: [{ ...artifact.payload.edges[0], target: "missing" }] }).success, false);
  assert.equal(ConceptDiagramSchema.safeParse({ ...artifact.payload, nodes: [artifact.payload.nodes[0], artifact.payload.nodes[0]] }).success, false);
  assert.equal(ArtifactSchema.safeParse({ ...artifact, payload: { ...artifact.payload, nodes: [{ ...artifact.payload.nodes[0], anchorIds: ["unrelated-selection-anchor"] }, ...artifact.payload.nodes.slice(1)] } }).success, false);
  const graph = { id: "g", bookId: fixtureSelection.bookId, version: "1", anchorIds: fixtureSelection.anchorIds, nodes: [{ id: "n", label: "Node", summary: "Test", anchorIds: fixtureSelection.anchorIds, position: { x: 0, y: 0 } }], edges: [{ id: "e", source: "n", target: "n", type: "test", evidenceAnchorIds: [], rationale: "Test", provenance: "book_supported" }] };
  assert.equal(GraphSchema.safeParse(graph).success, false);
  assert.equal(GraphSchema.safeParse({ ...graph, edges: [] }).success, true);
});

test("references require the correct locator and reject executable URLs", () => {
  const ref = { id: "r", title: "Test", supportRelation: "context", verificationStatus: "unverified", retrievedAt: FIXTURE_DATE };
  assert.equal(ReferenceSchema.safeParse({ ...ref, scope: "book" }).success, false);
  assert.equal(ReferenceSchema.safeParse({ ...ref, scope: "external", url: "javascript:alert(1)" }).success, false);
  assert.equal(ReferenceSchema.safeParse({ ...ref, scope: "book", anchorId: fixtureAnchors[0].id }).success, true);
});

test("analysis coverage cannot silently omit declared chunks or add unknown chunks", () => {
  const analysis = { id: "analysis", bookId: fixtureSelection.bookId, chunkIds: ["chunk-1", "chunk-2"], completedChunkIds: ["chunk-1"], status: "complete", modelLabel: "mock", promptVersion: "fixture-v1" };
  assert.equal(AnalysisRunSchema.safeParse(analysis).success, false);
  assert.equal(AnalysisRunSchema.safeParse({ ...analysis, completedChunkIds: ["chunk-1", "unknown"] }).success, false);
  assert.equal(AnalysisRunSchema.safeParse({ ...analysis, completedChunkIds: ["chunk-1", "chunk-2"] }).success, true);
});

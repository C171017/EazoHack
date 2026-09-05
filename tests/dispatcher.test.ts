import assert from "node:assert/strict";
import test from "node:test";
import { dispatchRoutePlan, retryRoutePlan } from "../src/server/dispatcher";
import { createMockRoutePlan, RoutingNotConfiguredError } from "../src/server/routing";
import { createProvider, type Provider } from "../src/server/providers";
import { fixtureSelection, makeMockArtifact } from "../src/shared/fixtures";
import { ROUTE_KINDS, type Artifact, type RouteKind, type Selection } from "../src/shared/schemas";
import { POST as planPost } from "../src/app/api/route-plan/route";
import { POST as assistPost } from "../src/app/api/assist/[kind]/route";

function input(routes: RouteKind[] = [...ROUTE_KINDS]) {
  const selection = structuredClone(fixtureSelection);
  return { selection, plan: createMockRoutePlan({ selection, routes }), mode: "mock" as const };
}

test("all four mock routes complete independently and bind to the selection", async () => {
  const request = input();
  const result = await dispatchRoutePlan(request);
  assert.equal(result.provider, "mock");
  assert.deepEqual(result.runs.map((run) => run.status), ["complete", "complete", "complete", "complete"]);
  assert.equal(result.artifacts.length, 4);
  for (const artifact of result.artifacts) {
    assert.equal(artifact.selectionId, request.selection.id);
    assert.deepEqual(artifact.anchorIds, request.selection.anchorIds);
    assert.equal(artifact.provider, "mock");
  }
});

test("a failed route leaves sibling results intact and can be retried alone", async () => {
  const request = input();
  const first = await dispatchRoutePlan({ ...request, failKinds: ["generated_image"] });
  assert.equal(first.runs.find((run) => run.route === "generated_image")?.error?.code, "provider_failed");
  assert.equal(first.artifacts.length, 3);
  const retried = await retryRoutePlan(request, first, ["generated_image"]);
  assert.equal(retried.artifacts.length, 4);
  for (const artifact of first.artifacts) assert.ok(retried.artifacts.some((item) => item.id === artifact.id));
  assert.ok(retried.runs.every((run) => run.status === "complete"));
  await assert.rejects(retryRoutePlan(request, retried, ["generated_image"]), /Only failed or cancelled/);
  const changed = structuredClone(request);
  changed.selection.selectedText = "Changed text using the same selection ID";
  await assert.rejects(retryRoutePlan(changed, first, ["generated_image"]), /original selection and plan snapshots/);
});

test("dependencies start after completion; failure blocks only dependent routes", async () => {
  const request = input();
  request.plan.dependsOn = { concept_diagram: ["interactive_ui"] };
  const transitions: string[] = [];
  await dispatchRoutePlan(request, { onRunChange: (run) => transitions.push(`${run.route}:${run.status}`) });
  assert.ok(transitions.indexOf("concept_diagram:running") > transitions.indexOf("interactive_ui:complete"));
  const failed = await dispatchRoutePlan({ ...request, failKinds: ["interactive_ui"] });
  assert.equal(failed.runs.find((run) => run.route === "concept_diagram")?.error?.code, "dependency_failed");
  assert.equal(failed.artifacts.length, 2);
});

test("cycle, empty selection and mismatched selection are rejected before providers", async () => {
  const request = input();
  let invoked = 0;
  const options = { providerFactory: (kind: RouteKind) => { invoked++; return createProvider(kind, "mock"); } };
  request.plan.dependsOn = { interactive_ui: ["concept_diagram"], concept_diagram: ["interactive_ui"] };
  await assert.rejects(dispatchRoutePlan(request, options));
  const mismatch = input();
  mismatch.selection.id = "another-selection";
  await assert.rejects(dispatchRoutePlan(mismatch, options), /Selection does not match/);
  const empty = input();
  empty.selection.selectedText = "  ";
  await assert.rejects(dispatchRoutePlan(empty, options));
  assert.equal(invoked, 0);
});

test("real adapters use the Vertex boundary and fail closed without credentials", async () => {
  assert.throws(() => createMockRoutePlan({ selection: fixtureSelection, routes: ["interactive_ui"], mode: "real" }), RoutingNotConfiguredError);
  const result = await dispatchRoutePlan({ ...input(), mode: "real" });
  assert.equal(result.provider, "vertex_ai");
  assert.deepEqual(result.artifacts, []);
  assert.ok(result.runs.every((run) => run.status === "failed"));
  assert.equal(result.runs.find((run) => run.route === "generated_image")?.error?.code, "not_configured");
});

test("cancelled runs discard late provider output and permit a new retry", async () => {
  const request = input(["interactive_ui"]);
  const controller = new AbortController();
  const result = await dispatchRoutePlan(request, {
    signal: controller.signal,
    providerFactory: (kind) => ({
      async run(selection, context) {
        controller.abort();
        return createProvider(kind, "mock").run(selection, { ...context, signal: undefined });
      },
    }),
  });
  assert.equal(result.runs[0].status, "cancelled");
  assert.deepEqual(result.artifacts, []);
  const retried = await retryRoutePlan(request, result, ["interactive_ui"]);
  assert.equal(retried.runs[0].status, "complete");
});

test("cancellation settles even when a future provider has not returned", async () => {
  const controller = new AbortController();
  const result = await dispatchRoutePlan(input(["interactive_ui"]), {
    signal: controller.signal,
    providerFactory: () => ({
      run() {
        queueMicrotask(() => controller.abort());
        return new Promise(() => {});
      },
    }),
  });
  assert.equal(result.runs[0].status, "cancelled");
  assert.deepEqual(result.artifacts, []);
});

test("provider output cannot switch source bindings and input is frozen", async () => {
  const request = input(["interactive_ui"]);
  const malicious: Provider<Selection, Artifact> = {
    async run(selection, context) {
      assert.ok(Object.isFrozen(selection));
      assert.ok(Object.isFrozen(selection.anchorIds));
      const artifact = makeMockArtifact("interactive_ui", selection, context.routeRunId);
      artifact.selectionId = "wrong-selection";
      return { ok: true, payload: artifact, provenance: { provider: "mock", label: "fixture" }, timing: { startedAt: new Date().toISOString(), durationMs: 0 } };
    },
  };
  const result = await dispatchRoutePlan(request, { providerFactory: () => malicious });
  assert.equal(result.runs[0].error?.code, "invalid_output");
  assert.deepEqual(result.artifacts, []);
});

test("selection changes during a request cannot rebind late output", async () => {
  const request = input(["interactive_ui"]);
  const originalId = request.selection.id;
  const pending = dispatchRoutePlan(request);
  request.selection.id = "new-selection";
  request.selection.anchorIds = ["new-anchor"];
  const result = await pending;
  assert.equal(result.artifacts[0].selectionId, originalId);
  assert.deepEqual(result.artifacts[0].anchorIds, fixtureSelection.anchorIds);
});

test("HTTP handlers enforce schema, route identity and body-size limits", async () => {
  const json = (body: unknown) => new Request("http://localhost/api/route-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const planned = await planPost(json({ selection: fixtureSelection, routes: ["interactive_ui"] }));
  assert.equal(planned.status, 200);
  const { plan } = await planned.json();
  const response = await assistPost(json({ selection: fixtureSelection, plan, mode: "mock" }), { params: Promise.resolve({ kind: "interactive_ui" }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).artifacts.length, 1);
  const wrongKind = await assistPost(json({ selection: fixtureSelection, plan }), { params: Promise.resolve({ kind: "generated_image" }) });
  assert.equal(wrongKind.status, 400);
  assert.equal((await planPost(json({ selection: fixtureSelection, routes: ["interactive_ui"], code: "run()" }))).status, 400);
  const realPlanResponse = await planPost(json({ selection: fixtureSelection, routes: ["interactive_ui"], mode: "real" }));
  assert.equal(realPlanResponse.status, 200);
  assert.equal((await realPlanResponse.json()).provider, "vertex_ai");
  assert.equal((await planPost(json({ padding: "x".repeat(129 * 1024) }))).status, 413);
});

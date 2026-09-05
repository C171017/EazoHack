import { z } from "zod";
import {
  ArtifactSchema,
  RouteKindSchema,
  ROUTE_KINDS,
  RoutePlanSchema,
  RouteRunSchema,
  RunErrorSchema,
  SelectionSchema,
  type Artifact,
  type RouteKind,
  type RoutePlan,
  type RouteRun,
  type Selection,
} from "../../shared/schemas";
import { dispatchProvider, createProvider, type Provider, type ProviderError, type ProviderMode } from "../providers";
import { validateDependencies } from "../routing";
import { parsePassageExplorer } from '../../shared/interactive-panel';

export const DispatchRequestSchema = z.object({
  selection: SelectionSchema,
  plan: RoutePlanSchema,
  mode: z.enum(["mock", "real"]).default("mock"),
  failKinds: z.array(RouteKindSchema).max(ROUTE_KINDS.length).default([]),
}).strict();
export type DispatchRequest = z.input<typeof DispatchRequestSchema>;
export type DispatchResult = {
  runs: RouteRun[];
  artifacts: Artifact[];
  provider: "mock" | "vertex_ai" | "fal" | "mixed" | "not_configured";
  requestSnapshot: { selection: Selection; plan: RoutePlan };
};
export interface DispatchOptions {
  signal?: AbortSignal;
  onRunChange?: (run: RouteRun) => void;
  /** Internal seam for future adapters and contract tests, never supplied over HTTP. */
  providerFactory?: (kind: RouteKind, mode: ProviderMode) => Provider<Selection, Artifact>;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function withCancellation<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Run cancelled.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      signal.removeEventListener("abort", abort);
      abort();
    }
    // Keep a rejection handler on late work even after cancellation wins the race.
    pending.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

function validateArtifact(artifact: unknown, selection: Selection, run: RouteRun): Artifact {
  const parsed = ArtifactSchema.parse(artifact);
  const actualAnchors = [...parsed.anchorIds].sort();
  const expectedAnchors = [...selection.anchorIds].sort();
  if (
    parsed.selectionId !== selection.id || parsed.bookId !== selection.bookId ||
    parsed.kind !== run.route || parsed.routeRunId !== run.id ||
    JSON.stringify(actualAnchors) !== JSON.stringify(expectedAnchors)
  ) throw new Error("Provider output does not match the frozen selection and route.");
  if (parsed.kind === 'interactive_panel') parsePassageExplorer(parsed.payload.explorer, selection.selectedText);
  return parsed;
}

export async function dispatchRoutePlan(input: DispatchRequest, options: DispatchOptions = {}): Promise<DispatchResult> {
  return execute(input, options);
}

/** Retry only explicit failed/cancelled routes; keep completed sibling artifacts intact. */
export async function retryRoutePlan(
  input: DispatchRequest,
  previous: DispatchResult,
  retryKinds: RouteKind[],
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  return execute(input, options, { previous, retryKinds });
}

async function execute(
  input: DispatchRequest,
  options: DispatchOptions,
  retry?: { previous: DispatchResult; retryKinds: RouteKind[] },
): Promise<DispatchResult> {
  // Parsing clones nested data; freeze it before the first await or provider invocation.
  const request = freeze(DispatchRequestSchema.parse(input));
  const { selection, plan, mode } = request;
  if (selection.id !== plan.selectionId) throw new Error("Selection does not match the route plan.");
  if (request.failKinds.some((kind) => !plan.routes.includes(kind))) throw new Error("Failure fixture references an unrequested route.");
  if (mode !== "mock" && request.failKinds.length) throw new Error("Failure fixtures are available in mock mode only.");
  validateDependencies(plan);

  const runs = new Map<RouteKind, RouteRun>();
  const artifacts: Artifact[] = [];
  const retained = new Set<RouteKind>();
  if (retry) {
    const priorSelection = SelectionSchema.parse(retry.previous.requestSnapshot.selection);
    const priorPlan = RoutePlanSchema.parse(retry.previous.requestSnapshot.plan);
    if (JSON.stringify(priorSelection) !== JSON.stringify(selection) || JSON.stringify(priorPlan) !== JSON.stringify(plan)) throw new Error("Retry must preserve the original selection and plan snapshots.");
    if (retry.previous.provider !== dispatchProvider(mode, plan.routes)) throw new Error("Retry mode must match the original run.");
    if (!retry.retryKinds.length || new Set(retry.retryKinds).size !== retry.retryKinds.length) throw new Error("Choose unique failed or cancelled routes to retry.");
    const priorRuns = retry.previous.runs.map((run) => RouteRunSchema.parse(run));
    if (priorRuns.length !== plan.routes.length || new Set(priorRuns.map((run) => run.route)).size !== priorRuns.length) throw new Error("Retry requires the complete previous route result.");
    for (const prior of priorRuns) {
      if (prior.planId !== plan.id || !plan.routes.includes(prior.route)) throw new Error("Previous run belongs to another plan.");
      if (prior.status === "pending" || prior.status === "running") throw new Error("Wait for the previous dispatch before retrying.");
      if (retry.retryKinds.includes(prior.route)) {
        if (prior.status !== "failed" && prior.status !== "cancelled") throw new Error("Only failed or cancelled routes can be retried.");
      } else {
        retained.add(prior.route);
        runs.set(prior.route, prior);
      }
    }
    if (retry.retryKinds.some((kind) => !plan.routes.includes(kind))) throw new Error("Retry references an unrequested route.");
    for (const artifact of retry.previous.artifacts) {
      const prior = priorRuns.find((run) => run.id === artifact.routeRunId);
      if (!prior || prior.status !== "complete" || !prior.artifactIds.includes(artifact.id)) throw new Error("Previous artifact has no completed run.");
      const parsed = validateArtifact(artifact, selection, prior);
      if (retained.has(prior.route)) artifacts.push(parsed);
    }
    for (const run of runs.values()) {
      if (run.status === "complete" && run.artifactIds.some((id) => !artifacts.some((artifact) => artifact.id === id))) throw new Error("Previous completed run is missing an artifact.");
    }
  }

  const emit = (run: RouteRun) => options.onRunChange?.(structuredClone(run));
  for (const route of plan.routes) {
    if (retained.has(route)) continue;
    const run = RouteRunSchema.parse({ id: crypto.randomUUID(), planId: plan.id, route, status: "pending", dependsOn: plan.dependsOn[route] ?? [], artifactIds: [] });
    runs.set(route, run);
    emit(run);
  }
  const finishError = (run: RouteRun, error: ProviderError) => {
    const checked = RunErrorSchema.safeParse(error);
    const validated = checked.success ? checked.data : {
      code: "invalid_output" as const,
      message: "Provider returned an invalid error response.",
      retryable: false,
    };
    run.status = validated.code === "cancelled" ? "cancelled" : "failed";
    run.error = validated;
    emit(run);
  };
  const work = new Map<RouteKind, Promise<void>>();
  const start = (kind: RouteKind): Promise<void> => {
    const existing = work.get(kind);
    if (existing) return existing;
    const task = (async () => {
      if (retained.has(kind)) return;
      const run = runs.get(kind)!;
      await Promise.all(run.dependsOn.map(start));
      if (options.signal?.aborted) {
        finishError(run, { code: "cancelled", message: "Run cancelled.", retryable: true });
        return;
      }
      if (run.dependsOn.some((dependency) => runs.get(dependency)?.status !== "complete")) {
        finishError(run, { code: "dependency_failed", message: "A required route did not complete. Independent routes were allowed to continue.", retryable: true });
        return;
      }
      run.status = "running";
      emit(run);
      try {
        const provider = (options.providerFactory ?? createProvider)(kind, mode);
        const result = await withCancellation(provider.run(selection, { routeRunId: run.id, signal: options.signal, simulateFailure: request.failKinds.includes(kind) }), options.signal);
        if (options.signal?.aborted) {
          finishError(run, { code: "cancelled", message: "Run cancelled; late output was discarded.", retryable: true });
        } else if (!result.ok) {
          finishError(run, result.error);
        } else {
          const artifact = validateArtifact(result.payload, selection, run);
          if (mode === "mock" && (result.provenance.provider !== "mock" || artifact.provider !== "mock")) throw new Error("Mock mode returned non-mock output.");
          if (mode === "real" && (result.provenance.provider !== (kind === "generated_image" ? "fal" : "vertex_ai") || artifact.provider !== result.provenance.provider || artifact.provenance.provider !== result.provenance.provider)) throw new Error("Real mode returned output from the wrong provider.");
          artifacts.push(artifact);
          run.artifactIds = [artifact.id];
          run.status = "complete";
          emit(run);
        }
      } catch {
        finishError(run, options.signal?.aborted
          ? { code: "cancelled", message: "Run cancelled; late output will be discarded.", retryable: true }
          : { code: "invalid_output", message: "The provider failed or returned output outside the validated selection contract.", retryable: false });
      }
    })();
    work.set(kind, task);
    return task;
  };
  await Promise.all(plan.routes.map(start));
  return {
    runs: plan.routes.map((kind) => RouteRunSchema.parse(runs.get(kind))),
    artifacts,
    provider: dispatchProvider(mode, plan.routes),
    requestSnapshot: structuredClone({ selection, plan }),
  };
}

import {
  type Artifact,
  type RouteKind,
  type RunError,
  type Selection,
} from "../../shared/schemas";
import { makeMockArtifact } from "../../shared/fixtures";
import { createFalImageProvider } from "./fal-z-image";
import { createVertexGeminiProvider } from "./vertex-gemini";

export type ProviderMode = "mock" | "real";
export type ProviderError = RunError;
export type ProviderResult<T> = {
  provenance: { provider: "mock" | "vertex_ai" | "fal" | "not_configured"; label: string };
  timing: { startedAt: string; durationMs: number };
} & ({ ok: true; payload: T } | { ok: false; error: ProviderError });

export interface ProviderContext {
  routeRunId: string;
  signal?: AbortSignal;
  simulateFailure?: boolean;
}

/** Providers return data only. They do not execute configuration or update UI/storage. */
export interface Provider<I, O> {
  run(input: I, context: ProviderContext): Promise<ProviderResult<O>>;
}

export function createProvider(
  kind: RouteKind,
  mode: ProviderMode,
): Provider<Selection, Artifact> {
  if (mode === "real") return kind === "generated_image" ? createFalImageProvider() : createVertexGeminiProvider(kind);
  return {
    async run(selection, context) {
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const metadata = () => ({
        provenance: {
          provider: "mock" as const,
          label: "Fixture / mock — no service called",
        },
        timing: { startedAt, durationMs: Math.round(performance.now() - started) },
      });
      // Yield so cancellation and independent route scheduling can be observed.
      await Promise.resolve();
      if (context.signal?.aborted) {
        return { ...metadata(), ok: false, error: { code: "cancelled", message: "Run cancelled.", retryable: true } };
      }
      if (context.simulateFailure) {
        return { ...metadata(), ok: false, error: { code: "provider_failed", message: "Intentional fixture failure. Other routes remain independent.", retryable: true } };
      }
      return { ...metadata(), ok: true, payload: makeMockArtifact(kind, selection, context.routeRunId) };
    },
  };
}

/** A dispatch may combine independent text and image providers. */
export function dispatchProvider(mode: ProviderMode, routes: RouteKind[]): "mock" | "vertex_ai" | "fal" | "mixed" {
  if (mode === "mock") return "mock";
  if (!routes.includes("generated_image")) return "vertex_ai";
  return routes.length === 1 ? "fal" : "mixed";
}

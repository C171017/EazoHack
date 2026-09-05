import {
  type Artifact,
  type RouteKind,
  type RunError,
  type Selection,
} from "../../shared/schemas";
import { makeMockArtifact } from "../../shared/fixtures";

export type ProviderMode = "mock" | "real";
export type ProviderError = RunError;
export type ProviderResult<T> = {
  provenance: { provider: "mock" | "not_configured"; label: string };
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
  return {
    async run(selection, context) {
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const metadata = () => ({
        provenance: {
          provider: mode === "mock" ? ("mock" as const) : ("not_configured" as const),
          label: mode === "mock" ? "Fixture / mock — no service called" : "Real provider not configured",
        },
        timing: { startedAt, durationMs: Math.round(performance.now() - started) },
      });
      // Yield so cancellation and independent route scheduling can be observed.
      await Promise.resolve();
      if (context.signal?.aborted) {
        return { ...metadata(), ok: false, error: { code: "cancelled", message: "Run cancelled.", retryable: true } };
      }
      if (mode === "real") {
        return { ...metadata(), ok: false, error: { code: "not_configured", message: "No real provider is configured for this route.", retryable: false } };
      }
      if (context.simulateFailure) {
        return { ...metadata(), ok: false, error: { code: "provider_failed", message: "Intentional fixture failure. Other routes remain independent.", retryable: true } };
      }
      return { ...metadata(), ok: true, payload: makeMockArtifact(kind, selection, context.routeRunId) };
    },
  };
}

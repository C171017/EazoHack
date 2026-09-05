import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient, GoogleAuth } from "google-auth-library";
import { z } from "zod";
import type { Artifact, RouteKind, Selection } from "../../shared/schemas";
import type { Provider, ProviderContext, ProviderResult } from "./index";
import { INTERACTIVE_SYSTEM_PROMPT } from "./interactive-prompt";
import { makeTextArtifact as makeGeminiArtifact, prompt, responseSchema } from "./text-artifact";
export { makeTextArtifact as makeGeminiArtifact } from "./text-artifact";

const MODEL_DEFAULT = "gemini-3.8-flash";
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
class VertexConfigurationError extends Error {}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new VertexConfigurationError(`Missing server configuration: ${name}.`);
  return value;
}

function safeSegment(value: string, label: string, pattern: RegExp): string {
  if (!pattern.test(value)) throw new VertexConfigurationError(`Invalid ${label} configuration.`);
  return value;
}

export async function vertexAccessToken(): Promise<string> {
  if (!process.env.VERCEL) {
    const token = await new GoogleAuth({ scopes: [CLOUD_SCOPE] }).getAccessToken();
    if (!token) throw new VertexConfigurationError("Google Application Default Credentials are unavailable.");
    return token;
  }
  const projectNumber = safeSegment(required("GCP_PROJECT_NUMBER"), "project number", /^\d+$/);
  const pool = safeSegment(required("GCP_WORKLOAD_IDENTITY_POOL_ID"), "identity pool", /^[a-z0-9-]{4,32}$/);
  const provider = safeSegment(required("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID"), "identity provider", /^[a-z0-9-]{4,32}$/);
  const serviceAccount = safeSegment(required("GCP_SERVICE_ACCOUNT_EMAIL"), "service account", /^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/);
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken({ expirationBufferMs: 5 * 60 * 1000 }) },
  });
  const token = (await client?.getAccessToken())?.token;
  if (!token) throw new VertexConfigurationError("Vercel OIDC could not obtain a Google Cloud access token.");
  return token;
}

async function generate(kind: RouteKind, selection: Selection, context: ProviderContext): Promise<ProviderResult<Artifact>> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const model = safeSegment(process.env.GEMINI_MODEL?.trim() || MODEL_DEFAULT, "model", /^[a-z0-9.-]+$/);
  const metadata = () => ({ provenance: { provider: "vertex_ai" as const, label: `Vertex AI · ${model}` }, timing: { startedAt, durationMs: Math.round(performance.now() - started) } });
  try {
    context.signal?.throwIfAborted();
    if (kind !== "interactive_ui" && kind !== "concept_diagram" && kind !== 'interactive_panel') throw new VertexConfigurationError(`${kind} is not provided by Gemini 3.8 Flash.`);
    const project = safeSegment(process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCP_PROJECT_ID?.trim() || required("GOOGLE_CLOUD_PROJECT"), "project", /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/);
    const location = safeSegment(process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global", "location", /^[a-z0-9-]+$/);
    const response = await fetch(`https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`, {
      method: "POST", signal: context.signal, headers: { authorization: `Bearer ${await vertexAccessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({
        ...(kind === 'interactive_panel' ? { systemInstruction: { parts: [{ text: INTERACTIVE_SYSTEM_PROMPT }] } } : {}),
        contents: [{ role: "user", parts: [{ text: prompt(kind, selection) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema(kind), thinkingConfig: { thinkingLevel: "LOW" }, maxOutputTokens: kind === 'interactive_panel' ? 6144 : 4096 },
      }),
    });
    const body = await response.json() as { error?: { message?: string }; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    context.signal?.throwIfAborted();
    if (!response.ok) return { ...metadata(), ok: false, error: { code: "provider_failed", message: response.status === 401 || response.status === 403 ? "Vertex AI authentication or permission was denied." : `Vertex AI request failed (${response.status}).`, retryable: response.status === 429 || response.status >= 500 } };
    const text = body.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) return { ...metadata(), ok: false, error: { code: "invalid_output", message: "Vertex AI returned no structured text.", retryable: true } };
    return { ...metadata(), ok: true, payload: makeGeminiArtifact(kind, selection, context.routeRunId, JSON.parse(text), model) };
  } catch (error) {
    if (context.signal?.aborted) return { ...metadata(), ok: false, error: { code: "cancelled", message: "Run cancelled.", retryable: true } };
    if (error instanceof VertexConfigurationError) return { ...metadata(), ok: false, error: { code: "not_configured", message: error.message, retryable: false } };
    return { ...metadata(), ok: false, error: { code: error instanceof z.ZodError || error instanceof SyntaxError ? "invalid_output" : "provider_failed", message: error instanceof z.ZodError || error instanceof SyntaxError ? "Gemini returned data outside the validated artifact contract." : "Vertex AI request failed.", retryable: !(error instanceof z.ZodError || error instanceof SyntaxError) } };
  }
}

export function createVertexGeminiProvider(kind: RouteKind): Provider<Selection, Artifact> {
  return { run: (selection, context) => generate(kind, selection, context) };
}

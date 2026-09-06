import { ZodError } from "zod";

const MAX_JSON_BYTES = 128 * 1024;
export class RequestBodyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Bound body reads before parsing; selections/configurations cannot grow without limit. */
export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new RequestBodyError("Use application/json.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("A JSON request body is required.", 400);
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError(`Request exceeds the ${Math.floor(maxBytes / 1024)} KiB input limit.`, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text) as unknown; }
    catch { throw new RequestBodyError("Invalid JSON.", 400); }
  } finally {
    reader.releaseLock();
  }
}

export function requestError(error: unknown): Response {
  const status = error instanceof RequestBodyError ? error.status : 400;
  const message = error instanceof ZodError
    ? "Request does not match the allowed schema."
    : error instanceof Error ? error.message : "Invalid request.";
  return Response.json({ error: { code: "invalid_request", message } }, { status });
}

import { RequestBodyError } from '../http';

/** Bound allocation and stop the upstream stream as soon as it exceeds policy. */
export async function readObjectBody(response: Response, maxBytes: number, oversizedMessage: string): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid object byte limit');
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new RequestBodyError(oversizedMessage, 400);
  }
  if (!response.body) throw new Error('Private object response has no body.');
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyError(oversizedMessage, 400);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}

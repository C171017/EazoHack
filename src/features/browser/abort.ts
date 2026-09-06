export type RequestDeadlineOptions = {
  signal?: AbortSignal;
  /** Milliseconds for the whole operation, including body decoding. Defaults to 30 seconds. */
  timeoutMs?: number;
};

function abortReason(signal: AbortSignal): unknown {
  return signal.reason === undefined ? new DOMException('The operation was aborted.', 'AbortError') : signal.reason;
}

/** Avoid requiring AbortSignal.throwIfAborted in older browsers. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

/** Compose caller cancellation and a deadline without static AbortSignal APIs or a polyfill. */
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  { signal, timeoutMs = 30_000 }: RequestDeadlineOptions = {},
): Promise<T> {
  throwIfAborted(signal);
  // Reject values that would disable the bound or overflow browser timers.
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError('Request timeout must be between 0 and 2147483647 milliseconds.');
  }
  const controller = new AbortController();
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = (reason: unknown) => {
    if (controller.signal.aborted) return;
    rejectAbort(reason);
    controller.abort(reason);
  };
  const callerAbort = () => abort(abortReason(signal!));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    signal?.addEventListener('abort', callerAbort, { once: true });
    timer = setTimeout(() => abort(new DOMException('The request timed out.', 'TimeoutError')), timeoutMs);
    // Racing also bounds a body decoder or transport that does not honor the signal.
    return await Promise.race([aborted, Promise.resolve().then(() => {
      throwIfAborted(controller.signal);
      return operation(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', callerAbort);
  }
}

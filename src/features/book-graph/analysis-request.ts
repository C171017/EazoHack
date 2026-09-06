function wait(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Retry transport failures against the same idempotent job endpoint. */
export async function analysisRequest<T>(url: string, options: {
  signal: AbortSignal; body?: object; reconnect: (attempt: number) => void;
  fetch?: typeof fetch; wait?: typeof wait;
}): Promise<T> {
  const serialized = options.body ? JSON.stringify(options.body) : undefined;
  for (let attempt = 0; ; attempt++) {
    options.signal.throwIfAborted();
    try {
      const response = await (options.fetch ?? fetch)(url, {
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]),
        ...(serialized ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serialized } : {}),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw Object.assign(new Error(data?.error?.message ?? `Could not check map analysis (${response.status}).`), { status: response.status });
      }
      return await response.json() as T;
    } catch (error) {
      options.signal.throwIfAborted();
      const status = error instanceof Error && 'status' in error ? error.status : undefined;
      // 503 on this endpoint means local analysis is disabled; do not loop on it.
      const transient = status === undefined || [408, 429, 500, 502, 504].includes(status as number);
      if (!transient || attempt >= 7) throw error;
      options.reconnect(attempt + 1);
      await (options.wait ?? wait)(Math.min(30_000, 1000 * 2 ** attempt), options.signal);
    }
  }
}

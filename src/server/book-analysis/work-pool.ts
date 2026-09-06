/** Keep slots occupied without letting a slow request block unrelated work.
 * Stop scheduling after a failure, drain in-flight checkpoints, preserve input order.
 */
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  async function worker() {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await task(items[index], index); }
      catch (error) { if (!failed) failure = error; failed = true; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) }, worker));
  if (failed) throw failure;
  return results;
}

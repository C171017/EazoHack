import { withRequestDeadline, type RequestDeadlineOptions } from '../browser/abort';

export class CloudRequestError extends Error {
  constructor(message: string, public status: number, public details?: unknown) { super(message); }
}
/** The optional fourth argument bounds fetch and decoding; existing owner arguments stay positional. */
export async function cloudRequest(action: string, body?: unknown, owner?: string, options?: RequestDeadlineOptions) {
  // Recursive deletion and analysis submission/resumption span multiple 30s backend hops.
  // Allow two minutes for their HTTP response (not the background analysis job).
  const actionName = action.split(/[?#]/, 1)[0];
  const timeoutMs = options?.timeoutMs ?? (['delete-account', 'analyze', 'resume'].includes(actionName) ? 120_000 : 30_000);
  return withRequestDeadline(async signal => {
    const response = await fetch('/api/cloud/' + action, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal,
      headers: { ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...(owner ? {'x-eazo-owner': owner} : {}) },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    const result = await response.json();
    if (!response.ok) throw new CloudRequestError(result.error?.message ?? 'Cloud request failed.', response.status, result);
    return result;
  }, { ...options, timeoutMs });
}
export function announceAccountChange() {
  window.dispatchEvent(new Event('eazo-auth-changed'));
  try { localStorage.setItem('eazo-auth-change', crypto.randomUUID()); } catch { /* Focus checks cover unavailable storage. */ }
}

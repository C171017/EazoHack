export class CloudRequestError extends Error {
  constructor(message: string, public status: number, public details?: unknown) { super(message); }
}
export async function cloudRequest(action: string, body?: unknown, owner?: string) {
  const response = await fetch('/api/cloud/' + action, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...(owner ? {'x-eazo-owner': owner} : {}) },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  const result = await response.json();
  if (!response.ok) throw new CloudRequestError(result.error?.message ?? 'Cloud request failed.', response.status, result);
  return result;
}
export function announceAccountChange() {
  window.dispatchEvent(new Event('eazo-auth-changed'));
  try { localStorage.setItem('eazo-auth-change', crypto.randomUUID()); } catch { /* Focus checks cover unavailable storage. */ }
}

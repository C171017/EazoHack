import { cookies } from 'next/headers';
import { RequestBodyError } from '../http';
import { clearSessionCookies, resolveCloudUser, writeSession, type CloudSession, type CloudIdentity } from './auth';
export function cloudConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new RequestBodyError('Cloud library is not configured yet.', 503);
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid cloud origin');
  return {url: origin.origin, key};
}
export async function backend<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const {url,key} = cloudConfig();
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, { ...init, cache:'no-store', signal:AbortSignal.timeout(30_000),
      headers:{apikey:token === process.env.SUPABASE_SECRET_KEY ? token : key, ...(token.startsWith('sb_') ? {} : {Authorization:`Bearer ${token}`}), 'Content-Type':'application/json', ...init.headers} });
  } catch { throw new RequestBodyError('Cloud is temporarily unavailable. Your local changes are safe; please retry.', 503); }
  if (!response.ok) {
    if(path.startsWith('/storage/v1/object/sign/')) {
      const failure=await response.clone().json().catch(()=>null) as {error?:string;message?:string;statusCode?:string}|null;
      if(response.status===404 || failure?.error==='not_found' || failure?.message==='Object not found')throw new RequestBodyError('This file has not been uploaded or is no longer available.',404);
    }
    // Translate only known database exception messages; never expose SQL details.
    if (path.startsWith('/rest/v1/')) {
      const failure = await response.json().catch(() => null) as {message?: string} | null;
      const controlled: Record<string, [string, number]> = {
        book_limit: ['Your account has reached its book limit.', 429],
        source_version_limit: ['This book has reached its saved version limit.', 429],
        source_size_required: ['The source file size is required. Please retry importing the book.', 400],
        source_file_limit: ['Cloud text files can be up to 50 MiB.', 429],
        source_storage_limit: ['Your account has reached its source storage limit.', 429],
        snapshot_storage_limit: ['Your account has reached its saved reading storage limit. Export your reading before removing data.', 429],
        account_deleting: ['Account deletion is in progress. Retry deletion from account settings.', 409],
        idempotency_conflict: ['This save attempt conflicts with an earlier request. Reopen the book before retrying.', 409],
      };
      const known = failure?.message && Object.hasOwn(controlled, failure.message) ? controlled[failure.message] : undefined;
      if (known) throw new RequestBodyError(known[0], known[1]);
    }
    const rejectedAuth = response.status === 401 || (path.startsWith('/auth/v1/') && [400,403].includes(response.status));
    throw new RequestBodyError(rejectedAuth ? 'Please sign in again.' : response.status === 429 ? 'Too many requests. Please try again shortly.' : 'Cloud request failed. Please retry.', rejectedAuth ? 401 : response.status === 429 ? 429 : 502);
  }
  const text=await response.text();return text?JSON.parse(text) as T:undefined as T;
}
export function serviceKey() { const value=process.env.SUPABASE_SECRET_KEY; if(!value)throw new RequestBodyError('Cloud service is not configured.',503); return value; }
/** Route handlers renew sessions; Server Components must opt into read-only access. */
export async function cloudUser({refresh = true}: {refresh?: boolean} = {}) {
  const jar = await cookies();
  if (!jar.get('eazo-access') && !jar.get('eazo-refresh')) throw new RequestBodyError('Sign in to your cloud library first.', 401);
  return resolveCloudUser(jar, cloudConfig().key, backend, refresh);
}
export async function setSession(session: CloudSession, identity?: CloudIdentity) {
  const user = identity ?? await backend<CloudIdentity>('/auth/v1/user', session.access_token);
  writeSession(await cookies(), session, user);
}
export async function clearSession() {
  clearSessionCookies(await cookies());
}
export async function signOut() {
  const jar = await cookies();
  let revoked = false;
  try {
    const user = await cloudUser();
    await backend('/auth/v1/logout?scope=local', user.token, {method:'POST'});
    revoked = true;
  } catch { /* Always clear this browser, including when offline or already expired. */ }
  finally { clearSessionCookies(jar); }
  return {revoked};
}
export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  let parsed: URL;try {parsed=new URL(origin??'');}catch {throw new RequestBodyError('Unrecognized request origin.',403);}
  // Next's internal Request URL can use localhost behind a reverse proxy. Host is
  // the browser-facing authority; never accept an arbitrary forwarded-host header.
  const host=request.headers.get('host')??new URL(request.url).host;
  if(origin!==parsed.origin||parsed.host!==host||!['http:','https:'].includes(parsed.protocol))throw new RequestBodyError('Unrecognized request origin.',403);
}
export async function guardGeneration(request:Request) {
  if(!process.env.VERCEL && !process.env.SUPABASE_URL)return;
  sameOrigin(request); const user=await cloudUser();
  const allowed=await backend<boolean>('/rest/v1/rpc/eazo_generation_quota',serviceKey(),{method:'POST',body:JSON.stringify({p_owner:user.id})});
  if(!allowed)throw new RequestBodyError('Daily generation allowance reached. Try again later.',429);
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { RequestBodyError } from '../http';

export type CloudIdentity = { id: string; email?: string };
export type CloudSession = { access_token: string; refresh_token: string; expires_in: number };
export type CookieOptions = { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge?: number };
export type AuthCookies = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(name: string): unknown;
};
export type AuthBackend = <T>(path: string, token: string, init?: RequestInit) => Promise<T>;
export const sessionCookieNames = ['eazo-access', 'eazo-refresh', 'eazo-account', 'eazo-book', 'eazo-oauth'] as const;
export const cookieOptions = (): CookieOptions => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });

/** Accept only local document paths, including after URL normalization. */
export function safeReturnPath(value: string | null | undefined) {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return '/';
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\x00-\x20]/.test(decoded)) return '/';
    const url = new URL(value, 'https://eazo.invalid');
    if (url.origin !== 'https://eazo.invalid' || /^\/(?:auth|api)(?:\/|$)/.test(new URL(decoded, 'https://eazo.invalid').pathname)) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}

/** Never construct OAuth redirect targets from arbitrary forwarded headers. */
export function authOrigin(request: Request, configured = process.env.EAZO_SITE_URL, production = process.env.NODE_ENV === 'production') {
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (configured) {
    let url: URL;
    try { url = new URL(configured); } catch { throw new RequestBodyError('The sign-in address is not configured correctly.', 503); }
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password || (production ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol))) throw new RequestBodyError('The sign-in address is not configured correctly.', 503);
    if (host !== url.host) throw new RequestBodyError('Open the main Eazo address to sign in.', 403);
    return url.origin;
  }
  if (production || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) throw new RequestBodyError('Google sign-in needs EAZO_SITE_URL configured.', 503);
  return `http://${host}`;
}

export function createGoogleFlow(supabaseUrl: string, origin: string, next?: string | null, now = Date.now()) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const callback = new URL('/auth/callback', origin);
  callback.searchParams.set('state', state);
  const authorize = new URL('/auth/v1/authorize', supabaseUrl);
  authorize.searchParams.set('provider', 'google');
  authorize.searchParams.set('redirect_to', callback.toString());
  authorize.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
  authorize.searchParams.set('code_challenge_method', 's256');
  // Supabase's Google provider already supplies email and profile.
  authorize.searchParams.set('scopes', 'openid');
  authorize.searchParams.set('prompt', 'select_account');
  return { url: authorize.toString(), cookie: JSON.stringify({ verifier, state, next: safeReturnPath(next), createdAt: now }) };
}

export function readGoogleFlow(value: string | undefined, state: string | null, now = Date.now()) {
  try {
    const flow = JSON.parse(value ?? '') as { verifier: string; state: string; next: string; createdAt: number };
    if (!/^[\w-]{43}$/.test(flow.verifier) || !state || !/^[\w-]{43}$/.test(flow.state) || state.length !== flow.state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(flow.state)) || !Number.isFinite(flow.createdAt) || now - flow.createdAt > 600_000 || flow.createdAt > now + 5000) throw new Error();
    return { verifier: flow.verifier, next: safeReturnPath(flow.next) };
  } catch { throw new RequestBodyError('Sign-in expired. Please try Google again.', 401); }
}

/** Expiry is only a scheduling hint. Authenticated identity always comes from /user. */
export function accessNeedsRefresh(token: string | undefined, now = Date.now()) {
  try {
    const payload = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString()) as { exp?: number };
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= now + 60_000;
  } catch { return true; }
}

export function clearSessionCookies(jar: AuthCookies) {
  for (const name of sessionCookieNames) jar.delete(name);
}

export function writeSession(jar: AuthCookies, session: CloudSession, user: CloudIdentity) {
  if (!session.access_token || !session.refresh_token || !Number.isFinite(session.expires_in) || session.expires_in <= 0 || !user.id) throw new RequestBodyError('Invalid sign-in response. Please retry.', 502);
  if (jar.get('eazo-account')?.value !== user.id) jar.delete('eazo-book');
  const options = cookieOptions();
  jar.set('eazo-access', session.access_token, { ...options, maxAge: session.expires_in });
  jar.set('eazo-refresh', session.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
  jar.set('eazo-account', user.id, { ...options, maxAge: 60 * 60 * 24 * 30 });
}

// Coalesce concurrent refreshes in this process, briefly retaining successful
// rotations for requests that arrived with the same old cookie. Supabase's
// refresh-token reuse interval also handles requests landing on other instances.
const rotations = new Map<string, { promise: Promise<CloudSession>; expires: number }>();
export async function refreshSession(refresh: string, key: string, backend: AuthBackend) {
  const now = Date.now();
  for (const [id, value] of rotations) if (value.expires <= now) rotations.delete(id);
  const id = createHash('sha256').update(refresh).digest('hex');
  const existing = rotations.get(id);
  if (existing) return existing.promise;
  if (rotations.size >= 1000) rotations.delete(rotations.keys().next().value!);
  const promise = backend<CloudSession>('/auth/v1/token?grant_type=refresh_token', key, { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) });
  rotations.set(id, { promise, expires: now + 10_000 });
  try { return await promise; } catch (error) { rotations.delete(id); throw error; }
}

export async function resolveCloudUser(jar: AuthCookies, key: string, backend: AuthBackend, refresh = true) {
  const token = jar.get('eazo-access')?.value;
  const refreshToken = jar.get('eazo-refresh')?.value;
  if (token && (!refresh || !refreshToken || !accessNeedsRefresh(token))) {
    try { return { ...await backend<CloudIdentity>('/auth/v1/user', token), token }; }
    catch (error) { if (!(error instanceof RequestBodyError) || error.status !== 401 || !refresh) throw error; }
  }
  if (!refresh || !refreshToken) throw new RequestBodyError('Sign in to your cloud library first.', 401);
  try {
    const session = await refreshSession(refreshToken, key, backend);
    const user = await backend<CloudIdentity>('/auth/v1/user', session.access_token);
    writeSession(jar, session, user);
    return { ...user, token: session.access_token };
  } catch (error) {
    if (error instanceof RequestBodyError && error.status === 401) clearSessionCookies(jar);
    throw error;
  }
}

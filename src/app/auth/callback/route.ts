import { cookies } from 'next/headers';
import { authOrigin, readGoogleFlow, type CloudSession } from '@/server/cloud/auth';
import { backend, cloudConfig, setSession } from '@/server/cloud/backend';
import { RequestBodyError, requestError } from '@/server/http';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  let origin: string;
  try { origin = authOrigin(request); } catch (error) { return requestError(error); }
  const jar = await cookies();
  const params = new URL(request.url).searchParams;
  const redirect = (path: string) => new Response(null, { status: 303, headers: { Location: new URL(path, origin).toString(), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  try {
    const flow = readGoogleFlow(jar.get('eazo-oauth')?.value, params.get('state'));
    // One attempt consumes the browser-bound flow, including provider denial.
    jar.delete('eazo-oauth');
    if (params.has('error')) return redirect('/cloud?auth_error=cancelled');
    const code = params.get('code');
    if (!code || code.length > 4096) throw new RequestBodyError('Sign-in expired.', 401);
    const session = await backend<CloudSession>('/auth/v1/token?grant_type=pkce', cloudConfig().key, { method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: flow.verifier }) });
    await setSession(session);
    return redirect(flow.next);
  } catch (error) {
    jar.delete('eazo-oauth');
    return redirect(`/cloud?auth_error=${error instanceof RequestBodyError && error.status === 401 ? 'expired' : 'unavailable'}`);
  }
}

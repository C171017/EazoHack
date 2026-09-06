import { cookies } from 'next/headers';
import { authOrigin, cookieOptions, createGoogleFlow } from '@/server/cloud/auth';
import { cloudConfig } from '@/server/cloud/backend';
import { RequestBodyError, requestError } from '@/server/http';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const origin = authOrigin(request);
    const { url } = cloudConfig();
    const flow = createGoogleFlow(url, origin, new URL(request.url).searchParams.get('next'));
    (await cookies()).set('eazo-oauth', flow.cookie, { ...cookieOptions(), maxAge: 600 });
    return new Response(null, { status: 303, headers: { Location: flow.url, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    if (error instanceof RequestBodyError && error.status === 503) return new Response(null, { status: 303, headers: { Location: '/cloud?auth_error=unavailable', 'Cache-Control': 'private, no-store' } });
    return requestError(error);
  }
}

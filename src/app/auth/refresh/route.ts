import { authOrigin, safeReturnPath } from '@/server/cloud/auth';
import { cloudUser, clearSession } from '@/server/cloud/backend';
import { RequestBodyError, requestError } from '@/server/http';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  let origin: string;
  try { origin = authOrigin(request); } catch (error) { return requestError(error); }
  let path = safeReturnPath(new URL(request.url).searchParams.get('next'));
  try { await cloudUser(); }
  catch (error) {
    if (!(error instanceof RequestBodyError) || error.status !== 401) return requestError(error);
    await clearSession();
    path = '/cloud?auth_error=expired';
  }
  return new Response(null, { status: 303, headers: { Location: new URL(path, origin).toString(), 'Cache-Control': 'private, no-store' } });
}

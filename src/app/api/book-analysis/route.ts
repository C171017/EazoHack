import { requireLocalAnalysis } from '@/server/book-analysis/local-access';
import { LocalSourceSchema, localJobStatus, startLocalJob, loadLocalMap } from '@/server/book-analysis/local-jobs';
import { mapBootstrap } from '@/server/book-map/store';
import { readJson, requestError } from '@/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireLocalAnalysis(request);
    const source = LocalSourceSchema.parse(await readJson(request, 24 * 1024 * 1024));
    return Response.json(await startLocalJob(source), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}
export async function GET(request: Request) {
  try {
    requireLocalAnalysis(request);
    const key = new URL(request.url).searchParams.get('key') ?? '';
    const status = await localJobStatus(key);
    return Response.json({ key, ...status, ...(status.status === 'ready' ? { graph: mapBootstrap(await loadLocalMap(key)) } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return requestError(error); }
}

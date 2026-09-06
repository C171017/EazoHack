import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEV_DIRECTORY, isLocalDevelopment, readDevModels, saveDevModels } from '../../../../server/providers/dev-models';
import { readJson } from '../../../../server/http';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
function state() {
  return {
    settings: readDevModels(),
    defaults: { text: 'GLM 5.3 Flash · Inco', vertex: process.env.GEMINI_MODEL || 'gemini-3.8-flash', image: process.env.IMAGE_PROVIDER === 'bfl' ? 'FLUX.2 [klein] 9B' : 'Z-Image Turbo' },
    available: { vertex_ai: true, inco: Boolean(process.env.INCO_API_KEY), bfl: Boolean(process.env.BFL_API_KEY), fal: Boolean(process.env.FAL_KEY) },
  };
}
export async function GET(request: Request) {
  if (!isLocalDevelopment(request)) return new Response(null, { status: 404 });
  if (new URL(request.url).searchParams.get('asset') === 'panel') {
    try { return new Response(await readFile(path.join(DEV_DIRECTORY, 'model-panel.js'), 'utf8'), { headers: { ...headers, 'Content-Type': 'text/javascript', 'X-Content-Type-Options': 'nosniff' } }); }
    catch { return new Response('', { headers: { ...headers, 'Content-Type': 'text/javascript' } }); }
  }
  return Response.json(state(), { headers });
}
export async function POST(request: Request) {
  if (!isLocalDevelopment(request)) return new Response(null, { status: 404 });
  if (request.headers.get('origin') !== `${new URL(request.url).protocol}//${request.headers.get('host') || new URL(request.url).host}`) return new Response(null, { status: 403 });
  try { saveDevModels(await readJson(request)); return Response.json(state(), { headers }); }
  catch { return Response.json({ error: 'Choose a supported model for each action.' }, { status: 400, headers }); }
}

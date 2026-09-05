import { TextSourceSchema } from '@/features/reader/pdf/model';
import { readJson, requestError } from '@/server/http';
import { layoutConfiguration, requestLayout } from '@/server/pdf/layout';

export const runtime = 'nodejs';
export function GET() {
  const c = layoutConfiguration();
  return Response.json({ available: !!c.url, label: c.url ? c.label : null }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: { message: 'Same-origin request required.' } }, { status: 403 });
  if (!layoutConfiguration().url) return Response.json({ error: { message: 'Optional layout service is not configured.' } }, { status: 503 });
  try {
    const source = TextSourceSchema.parse(await readJson(request));
    if (source.fragments.length > 2000) return Response.json({ error: { message: 'This page exceeds the layout service fragment limit.' } }, { status: 413 });
    return Response.json(await requestLayout(source, request.signal));
  } catch (error) { return requestError(error); }
}

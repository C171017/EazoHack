# Supabase client templates

These are integration templates, not activated application code. No packages or reader routes were changed. Install `@supabase/supabase-js`, `@supabase/ssr`, and `server-only` in the integration checkout and lock versions before adapting these snippets. The SSR flow also requires the official refresh Proxy and auth callback; do not expose protected routes until those are implemented/tested. Read the installed Next.js Proxy documentation when integrating.

Browser module (`src/lib/supabase/browser.ts`):

```ts
'use client';
import { createBrowserClient } from '@supabase/ssr';
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Cloud account configuration is missing');
  return createBrowserClient(url, key);
}
```

Server module, for cookie-writable Route Handlers/Server Actions (`src/lib/supabase/server.ts`):

```ts
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function createClient() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Cloud account configuration is missing');
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  });
}
```

Do not use this writable adapter inside a Server Component. Implement the documented Proxy cookie-refresh flow first and a read adapter for those components. Authenticate with `auth.getClaims()` or `auth.getUser()` and handle errors; never authorize from the user object returned by `getSession()`. The user-scoped client carries the user's JWT so RLS applies. Use `Cache-Control: private, no-store` on personalized responses and session-refresh responses; never cache them across users. Validate redirect destinations against a same-origin allowlist.

Trusted worker module (outside the browser import graph):

```ts
import { createClient } from '@supabase/supabase-js';
export function createWorkerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Worker database configuration is missing');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
```

In Next.js add `import 'server-only'` to its worker/admin module. A standalone Cloud Run Node process must not import Next's server-only guard. Secret keys bypass RLS: derive job owner from verified identity in the dispatcher and from the stored job in workers. Never accept an arbitrary owner, object URL or SQL from clients. Use a separate worker client without user cookies. New secret keys are API keys, not JWT bearer tokens; the SDK handles headers. Store them only in Vercel server environment/Google Secret Manager. Supabase CLI management access tokens and database passwords belong in the operator's local credential flow, not application runtime variables.

Source: [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [API keys](https://supabase.com/docs/guides/getting-started/api-keys). Installed Next.js 16.3.4 `use-client` and async `cookies` references were read from the original checkout because this worktree has no node_modules.

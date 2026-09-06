# Google sign-in setup and verification

Eazo uses Google through Supabase Auth. Eazo keeps Supabase access and refresh tokens in `HttpOnly`, `SameSite=Lax` cookies (`Secure` in production). It does not store Google access/refresh tokens or request Drive/Gmail access. Private records belong to the stable Supabase user UUID, never the email address.

## External setup required

The application code alone cannot activate Google sign-in. These settings must be completed in the project owner's provider consoles. Do not put the Google client secret in browser code or a public environment variable.

1. In Google Auth Platform, configure Eazo's audience and branding: application name, support contact, homepage, privacy policy, authorized domains, and developer contact. For a beta, keep the external audience in Testing and explicitly add test users; publish the audience when ready for public users. Follow any branding verification requested by Google.
2. Create a **Web application** OAuth client. Use the application's origin under Authorized JavaScript origins. Under Authorized redirect URIs, enter the callback displayed in the Supabase Google provider settings: normally `https://<project-ref>.supabase.co/auth/v1/callback`. This Google callback is different from Eazo's callback below.
3. Request only `openid`, email, and profile scopes. Put the client ID and secret in **Supabase → Authentication → Sign In / Providers → Google**, and enable Google. Enable new-user signups so a first Google login can create an Eazo account. Disable Email/password sign-in, phone, anonymous sign-in, and other providers for a Google-only launch. Remove unused test accounts separately after confirming their data is no longer needed.
4. In Supabase Auth URL configuration, set **Site URL** to the deployed Eazo origin. Add the exact Eazo callback URL `https://<eazo-host>/auth/callback` and a callback query pattern `https://<eazo-host>/auth/callback\?state=*` to the redirect allow list. The query pattern accepts the random browser-bound state parameter; do not use an unrestricted production hostname wildcard. For local work against hosted Supabase, add the corresponding `http://127.0.0.1:<port>/auth/callback` entries. Use the same browser hostname throughout the flow.
5. Add server-only deployment variables:

   ```dotenv
   EAZO_SITE_URL=https://<eazo-host>
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=<project publishable key>
   SUPABASE_SECRET_KEY=<project server secret key>
   ```

   `SUPABASE_SECRET_KEY` supports server account/data management and existing hosted jobs; it is never sent to the browser. Google OAuth credentials belong in Supabase, not these Eazo variables. `EAZO_SITE_URL` must be an HTTPS origin with no path in production. Local development can omit it when using `localhost` or `127.0.0.1`.

6. Redeploy after setting variables. Ensure Supabase refresh-token rotation and its standard reuse interval remain enabled; simultaneous requests across server instances depend on that interval. Apply all repository migrations before enabling synchronization.

Current local inspection found no Supabase or site-origin variable names in `.env.local`; deployed configuration was not inspected. No provider-console settings were changed by this implementation.

## Application contract

- `GET /auth/google?next=/cloud`: starts Google PKCE with a ten-minute, browser-bound verifier and state cookie. One pending flow is supported per browser; starting a second flow replaces the first.
- `GET /auth/callback`: exchanges the one-time code server-side, validates the user with Supabase, writes the session, and clears the selected-book cookie if the account changed. Return paths must stay within Eazo and cannot point into auth/API routes.
- Failures return to `/cloud?auth_error=cancelled`, `expired`, or `unavailable`; provider error descriptions and tokens are not exposed.
- `cloudUser()` validates identity at `/auth/v1/user` and renews expired sessions in Route Handlers. Temporary provider/network failures preserve the refresh cookie; confirmed invalid sessions clear local session cookies.
- Server Components call `cloudUser({refresh:false})`. Page requests with an expiring token first pass through `/auth/refresh`, where cookies can be changed before rendering. The proxy performs only an expiry check; it does not grant access based on JWT claims.
- `signOut()` revokes this Supabase session where reachable and always clears this browser's session/selected-book cookies. `{revoked:false}` means the remote session could not be confirmed revoked; sign-out on this device still completes.
- Browser persistence must be namespaced by the verified `session.id`. Reconcile account changes before saving or importing data. Requests from old tabs must not save their previous account's workspace into the current account.

## Acceptance checks before launch

Run `node --import tsx --test tests/cloud-auth.test.ts tests/cloud-auth-routes.test.ts tests/cloud-origin.test.ts`, followed by the project's typecheck, lint, and integration tests.

Complete these live checks with two Google test accounts and two browsers/devices:

- Google consent → Eazo → refresh → reopen browser preserves the expected account and restores only its books.
- Cancel consent, replay an already-consumed callback, and use an expired verifier. Each returns a recoverable sign-in error.
- Let access expire, then read a book and save a highlight without visiting the cloud account page first.
- Sign out, sign into the second account, and check that the first account's selected book and cached private workspace do not appear.
- Test simultaneous requests near expiry and a temporary Supabase outage; retries must not silently create a new account or erase local progress.
- Verify RLS and storage with account A's and B's real access tokens: cross-account reads, writes, and object downloads must fail.
- Delete a disposable test account, confirm its objects and records are removed, and confirm its old session cannot continue accessing data.

These provider/device checks remain required even when local tests pass. Google account recovery is handled by Google; Eazo has no password-reset flow.

Sources checked during implementation: [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [redirect allow-list rules](https://supabase.com/docs/guides/auth/redirect-urls), and the [Supabase Auth client protocol](https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts). Also read the installed Next.js Route Handler, cookies, and Proxy guides before implementing the routes.

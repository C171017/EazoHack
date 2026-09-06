# Expired-session page error fixed

The live homepage returned plain `Internal Server Error` whenever an
`eazo-refresh` cookie was present and the access token was missing or expired.
Fresh sessions and signed-out requests returned 200, making this appear to be
an iPhone-only issue. Vercel logs confirmed `ERR_INVALID_URL` with input
`/auth/refresh?next=%2F` in the Next proxy adapter.

`src/proxy.ts` now returns `NextResponse.redirect` with an absolute URL built
from the validated public authentication origin. The original destination and
private/no-store cache policy are preserved. Internal server hostnames are not
exposed to the browser.

Validation:

- All 25 authentication and route tests passed; scoped ESLint and diff checks passed.
- An isolated `VERCEL=1 npm run build:vercel` passed, including TypeScript and asset checks.
- The built Next server returned 307 for the previously failing cookie request.
- Production deployment `dpl_4w9LromKCpC6rPzYdYYT7o3f4AYn` is READY and aliased
  to `https://read.vin` (deployment URL `https://eazo-hack-fs03o2jc6-c171017.vercel.app`).
- `node scripts/smoke-session-redirect.mjs https://read.vin` passed all ten
  requests: eight expired-session redirects across four URLs, plus signed-out
  and unexpired-session homepage requests, using an iPhone Safari user agent.
- With a cookie jar that honors cookie deletion, a rejected synthetic refresh
  token recovered through 307 -> 303 -> 307 -> 200 at `/?auth_error=expired`.

Physical iPhone confirmation remains with the user. No real account tokens were
used in the synthetic HTTP checks. The previous production deployment was
`dpl_2jkUVVAvz54efzduPuLwDuLjVMHL`.

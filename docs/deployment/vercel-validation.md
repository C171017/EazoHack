# Vercel preparation validation — 2026-09-06

Scope: local worktree at base `7888dfa6ced33550ef01118e0d8eff13acb3179a`. No remote deployment or paid provider request.

| Check | Observed result |
| --- | --- |
| Source comparison | Initially matched; final recheck advanced to `e21e595` with library UI changes, plus an uncommitted reader-heading edit. Validation here covers the original base plus this deployment patch, not those newer UI edits |
| Dependency installation | Sandboxed `npm ci --ignore-scripts --no-audit --no-fund` failed with npm “Exit handler never called” and unwritable default log directory; validation used a local copy of the original checkout's installed `node_modules` |
| Dependency versions | Next 16.3.4, React 19.2.8, Node 22.22.3; `npm ls --depth=0` reported no missing direct dependencies, with extra optional native/WASM packages from the copy |
| Tests | `npm test`: 183 passed, 0 failed |
| Lint | `npm run lint`: passed after ignoring generated `public/_pdf/**` third-party files |
| Build | `NODE_OPTIONS=--dns-result-order=ipv4first VERCEL=1 npm run build:vercel`: passed, including TypeScript and post-build asset/trace checks |
| Build network qualification | First sandbox build failed DNS for Google Fonts; ordinary network-enabled retry stalled and was cancelled. IPv4-first retry completed after two transient TLS retries. No mock fonts or placeholder responses were used. This does not establish Shanghai hosting reliability |
| Source/map trace | Root 25.80 MB; book-map API 24.78 MB. Exact current-map pointer, selected graph/hierarchy and Republic source present |
| PDF trace | Runtime assets 47.40 MB; PDF source API 47.67 MB. These are Next trace sums, not final Vercel package measurements |
| Hosted rewrite manifest | Before-files rewrite to static demo PDF and allowlisted PDF/OCR assets present |
| HTTP smoke | 11/11 passed on loopback production server: root 200, map heat-index 200 with nonempty data, stale map 409, PDF 206 with exact 1 KiB range, worker JS 200, 4.75 MB OCR JS 200, OCR language 200, disallowed asset 404, dev panel 404, layout availability 200, invalid assist body 400 |
| Browser | Chrome on loopback production build: Republic source and populated 3D map visible; activating Early Debates and Civic Design displayed its summary and child groups; captured warning/error log was empty |
| Vercel account | Read-only dashboard: authenticated `c171017` Hobby scope, no projects displayed. No project/import/settings action taken |

Not yet verified:

- A clean locked installation in a fresh Vercel Linux builder; copied macOS dependencies are not a substitute for that check.
- Actual Vercel packaging, routing, CDN range/MIME behavior and function size enforcement.
- Supabase login/private storage/RLS, Cloud Run execution/status/publication, or application integration with either.
- WIF trust, Vertex entitlement, live generation, image response sizes and paid-operation quotas.
- Cloud upload and actual browser PDF/OCR import after deployment (HTTP delivery is checked locally).
- Shanghai venue Wi-Fi/mobile performance, final domain/DNS and production visibility.

Approval boundary and exact next actions are in `vercel.md`. The local server was stopped after verification. No Git commit, merge or push was made.

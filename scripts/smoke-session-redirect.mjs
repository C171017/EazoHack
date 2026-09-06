import assert from 'node:assert/strict';

// Exercise the deployed Next proxy adapter, which unit calls do not pass through.
// Only synthetic cookies are sent; no real account or refresh token is used.
const base = new URL(process.argv[2] || 'http://127.0.0.1:3106');
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const fresh = `header.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString('base64url')}.signature`;
for (const route of ['/', '/?book=plato-republic&library=1', '/account', '/cloud']) {
  for (const cookie of ['eazo-refresh=invalid-smoke-token', 'eazo-access=expired;eazo-refresh=invalid-smoke-token']) {
    const response = await fetch(new URL(route, base), {
      headers: { cookie, 'user-agent': iphone }, redirect: 'manual', signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 307, `${route}: expired session must redirect, not crash`);
    const target = new URL(response.headers.get('location'), base);
    assert.equal(target.origin, base.origin);
    assert.equal(target.pathname, '/auth/refresh');
    assert.equal(target.searchParams.get('next'), route);
    assert.match(response.headers.get('cache-control'), /no-store/);
    await response.arrayBuffer();
  }
  console.log(`PASS expired-session redirect: ${route}`);
}
for (const cookie of ['', `eazo-access=${fresh};eazo-refresh=invalid-smoke-token`]) {
  const response = await fetch(base, { headers: { cookie, 'user-agent': iphone }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, 'Library must load without triggering unnecessary renewal');
  await response.arrayBuffer();
}
console.log('PASS signed-out and unexpired-session library requests');

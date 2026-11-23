import assert from 'node:assert/strict';
import {
  applyNoStoreHeaders,
  clearSessionCookies,
  extractCookie,
  setSessionCookies,
} from '../src/utils/session-cookie';

function main() {
  // 1. Cookie parser
  const parsed = extractCookie({ headers: { cookie: 'foo=bar; access_token=jwt.abc.123; theme=dark' } } as any, 'access_token');
  assert.equal(parsed, 'jwt.abc.123');
  assert.equal(extractCookie({ headers: {} } as any, 'access_token'), null);

  // 2. HttpOnly + Secure + SameSite=Lax on HTTPS
  const cookies: Array<{ name: string; value: string; options: any }> = [];
  const cleared: Array<{ name: string; options: any }> = [];
  const headers: Record<string, string> = {};
  const varyHeaders: string[] = [];

  const mockRes = {
    cookie: (name: string, value: string, options: any) => cookies.push({ name, value, options }),
    clearCookie: (name: string, options: any) => cleared.push({ name, options }),
    setHeader: (k: string, v: string) => { headers[k] = v; },
    vary: (k: string) => { varyHeaders.push(k); },
  } as any;

  setSessionCookies(
    { secure: false, headers: { 'x-forwarded-proto': 'https' } } as any,
    mockRes,
    { access: 'acc-1', refresh: 'ref-1' },
  );
  assert.equal(cookies.length, 2);
  assert.equal(cookies[0].name, 'access_token');
  assert.equal(cookies[0].options.httpOnly, true);
  assert.equal(cookies[0].options.secure, true);
  assert.equal(cookies[0].options.sameSite, 'lax');
  assert.equal(cookies[0].options.path, '/');

  assert.equal(cookies[1].name, 'refresh_token');
  assert.equal(cookies[1].options.httpOnly, true);
  assert.equal(cookies[1].options.secure, true);
  assert.equal(cookies[1].options.path, '/api/v1/auth');

  // 3. Clear cookies
  clearSessionCookies({ secure: false, headers: { 'x-forwarded-proto': 'https' } } as any, mockRes);
  assert.equal(cleared.length, 2);

  // 4. No-store headers
  applyNoStoreHeaders(mockRes);
  assert.equal(headers['Cache-Control'], 'private, no-store, no-cache, must-revalidate');
  assert.equal(headers['Pragma'], 'no-cache');
  assert.ok(varyHeaders.includes('Authorization'));
  assert.ok(varyHeaders.includes('Cookie'));
  assert.ok(varyHeaders.includes('X-Company-ID'));

  console.log('session-cookie.unit.ts: ALL PASSED');
}

main();

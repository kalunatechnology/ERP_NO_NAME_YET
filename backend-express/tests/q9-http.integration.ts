/**
 * Q9 HTTP regression for Director access, Company Admin governance, role
 * switching without re-authentication, and forged-company rejection.
 *
 * The only mutation is Laode's temporary active-role switch; the test restores
 * Company Admin in a finally block so the approved baseline is retained.
 */
import assert from 'node:assert/strict';

const baseUrl = process.env.Q9_BASE_URL ?? 'http://localhost:8001';
const password = process.env.Q9_DEMO_PASSWORD ?? 'DummyPass123!';

type Session = { access: string; user: { company_id: string | null; active_role_code: string } };

/** Sends an HTTP request with the same bearer-token contract used by Next. */
async function request(path: string, token?: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

/** Authenticates one approved demo identity and returns its API session. */
async function login(email: string): Promise<Session> {
  const response = await request('/api/v1/auth/token', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, `${email}: login returned ${response.status}`);
  return response.json() as Promise<Session>;
}

/** Executes the Q9 request-flow assertions and restores Laode's active role. */
async function main(): Promise<void> {
  assert.equal((await request('/health')).status, 200, 'Health must remain public');
  const [rian, laode, ghost] = await Promise.all([
    login('rian@arsalynk.com'), login('laode@arsalynk.com'), login('admin.director@arsalynk.id'),
  ]);
  assert.equal(rian.user.active_role_code, 'ROLE-DIRECTOR');
  assert.equal(laode.user.active_role_code, 'ROLE-COMPANY-ADMIN');
  assert(rian.user.company_id && laode.user.company_id && ghost.user.company_id);
  assert.equal(rian.user.company_id, laode.user.company_id);
  assert.notEqual(laode.user.company_id, ghost.user.company_id);

  const checks: Array<[string, Promise<Response>]> = [
    ['Rian projects', request('/api/v1/projects/projects/?page_size=50', rian.access)],
    ['Rian reports', request('/api/v1/reporting/periodic-project-summary', rian.access)],
    ['Laode company users', request('/api/v1/accounts/users/?page_size=100', laode.access)],
    ['Laode module controls', request('/api/v1/core/company-modules/my-modules', laode.access)],
    ['anonymous protected route', request('/api/v1/projects/projects/?page_size=1')],
    ['forged company', request('/api/v1/accounts/users/?page_size=1', laode.access, { headers: { 'x-company-id': ghost.user.company_id! } })],
  ];
  const responses = await Promise.all(checks.map(([, response]) => response));
  assert.equal(responses[0].status, 200, `Rian projects returned ${responses[0].status}`);
  assert.equal(responses[1].status, 200, `Rian reports returned ${responses[1].status}`);
  assert.equal(responses[2].status, 200, `Laode users returned ${responses[2].status}`);
  assert.equal(responses[3].status, 200, `Laode modules returned ${responses[3].status}`);
  assert.equal(responses[4].status, 401, `anonymous request returned ${responses[4].status}`);
  assert.equal(responses[5].status, 403, `forged company returned ${responses[5].status}`);

  try {
    const switched = await request('/api/v1/auth/active-role', laode.access, { method: 'PATCH', body: JSON.stringify({ role_code: 'ROLE-STAFF' }) });
    assert.equal(switched.status, 200, `Laode role switch returned ${switched.status}`);
    const switchedPayload = await switched.json() as { active_role_code?: string };
    assert.equal(switchedPayload.active_role_code, 'ROLE-STAFF');
  } finally {
    const restored = await request('/api/v1/auth/active-role', laode.access, { method: 'PATCH', body: JSON.stringify({ role_code: 'ROLE-COMPANY-ADMIN' }) });
    assert.equal(restored.status, 200, `Laode role restore returned ${restored.status}`);
  }

  console.log(JSON.stringify({ status: 'PASS', rian_projects: 200, rian_reports: 200, laode_access_management: 200, role_switch_without_relogin: true, forged_company: 403, anonymous: 401 }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

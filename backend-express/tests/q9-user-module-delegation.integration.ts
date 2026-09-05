/**
 * Q9 regression proving the two-layer module model:
 * Super Admin enables a company module, then Company Admin delegates it to a
 * specific user. The test restores the target's prior override afterwards.
 */
import assert from 'node:assert/strict';
import prisma from '../src/config/database';

const baseUrl = process.env.Q9_BASE_URL ?? 'http://localhost:8001';
const password = process.env.Q9_DEMO_PASSWORD ?? 'DummyPass123!';

/** Performs an authenticated API request using the production bearer contract. */
async function request(path: string, token?: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

/** Logs in a deterministic Q9 fixture without disclosing its password in output. */
async function login(email: string): Promise<{ access: string; user: { id: string; company_id: string } }> {
  const response = await request('/api/v1/auth/token', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, `${email} login failed`);
  return response.json() as Promise<{ access: string; user: { id: string; company_id: string } }>;
}

/** Verifies targeted Finance delegation and restores the exact prior database state. */
async function main(): Promise<void> {
  const [laode, jundy] = await Promise.all([login('laode@arsalynk.com'), login('jundy@arsalynk.com')]);
  const previous = await prisma.iam_user_module_access.findUnique({ where: { user_id_module_code: { user_id: jundy.user.id, module_code: 'FINANCE' } } });
  try {
    const deniedBefore = await request('/api/v1/finance/project-fundings/?page_size=1', jundy.access);
    assert.equal(deniedBefore.status, 403, 'Jundy must not have Finance access before delegation');

    const grant = await request(`/api/v1/accounts/users/${jundy.user.id}/module-access/FINANCE`, laode.access, {
      method: 'PUT', body: JSON.stringify({ allow_read: true, allow_write: true }),
    });
    assert.equal(grant.status, 200, 'Company Admin could not grant approved Finance module');

    const granted = await request('/api/v1/finance/project-fundings/?page_size=1', jundy.access);
    assert.equal(granted.status, 200, 'Personal Finance delegation was not enforced by API');
    console.log(JSON.stringify({ status: 'PASS', company_admin_delegation: 'FINANCE read/write', target: 'jundy@arsalynk.com', before: 403, after: 200 }, null, 2));
  } finally {
    if (previous) {
      await prisma.iam_user_module_access.update({ where: { id: previous.id }, data: { allow_read: previous.allow_read, allow_write: previous.allow_write, granted_by_id: previous.granted_by_id } });
    } else {
      await prisma.iam_user_module_access.deleteMany({ where: { user_id: jundy.user.id, module_code: 'FINANCE' } });
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

/**
 * Q10 Company Admin access-matrix BDD suite.
 *
 * Exercises the real Express authorization pipeline and database. Jundy's
 * Finance override is snapshotted and restored exactly, even when an assertion
 * fails, so repeated test runs do not alter the approved access baseline.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import prisma from '../src/config/database';
import { createApp } from '../src/app';

const password = process.env.Q10_DEMO_PASSWORD ?? 'DummyPass123!';
type Session = { access: string; user: { id: string; company_id: string | null; active_role_code: string } };

/** Runs the access-matrix system scenarios on an ephemeral Express listener. */
async function main(): Promise<void> {
  const feature = await readFile(`${__dirname}/features/q10-company-admin-access.feature`, 'utf8');
  assert(feature.includes('Scenario Outline: Company Admin selects an explicit access level'));
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const passed: string[] = [];

  /** Sends a request using the same bearer and company-header contract as Next. */
  async function request(path: string, token?: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      // Preserve a realistic remote-database window while preventing a stalled
      // route from leaving the BDD listener open indefinitely.
      signal: options.signal ?? AbortSignal.timeout(30_000),
    });
  }

  /** Authenticates a canonical Q10 fixture. */
  async function login(email: string): Promise<Session> {
    const response = await request('/api/v1/auth/token', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, 200, `${email}: login ${response.status}`);
    return response.json() as Promise<Session>;
  }

  /** Records a successful Given–When–Then behavior. */
  function pass(name: string): void {
    passed.push(name);
    process.stdout.write(`PASS: ${name}\n`);
  }

  let priorOverride: Awaited<ReturnType<typeof prisma.iam_user_module_access.findUnique>> = null;
  let jundyId = '';
  try {
    // These personas are fixtures for authorization behavior, not a login load
    // test. Authenticate sequentially so each receives its own agreed 15-second
    // budget without competing for the remote serverless-pooler connection.
    const laode = await login('laode@arsalynk.com');
    const jundy = await login('jundy@arsalynk.com');
    const ghost = await login('admin.director@arsalynk.id');
    assert.equal(laode.user.active_role_code, 'ROLE-COMPANY-ADMIN');
    assert(laode.user.company_id && jundy.user.company_id && ghost.user.company_id);
    assert.equal(laode.user.company_id, jundy.user.company_id);
    assert.notEqual(laode.user.company_id, ghost.user.company_id);
    jundyId = jundy.user.id;
    priorOverride = await prisma.iam_user_module_access.findUnique({
      where: { user_id_module_code: { user_id: jundyId, module_code: 'FINANCE' } },
    });

    const [users, modules, access] = await Promise.all([
      request('/api/v1/accounts/users/?page_size=100', laode.access),
      request('/api/v1/core/company-modules/my-modules', laode.access),
      request('/api/v1/accounts/user-module-access', laode.access),
    ]);
    assert.deepEqual([users.status, modules.status, access.status], [200, 200, 200]);
    pass('Company Admin loads users, entitlements, and overrides');

    const financeCompanyAccess = await prisma.iam_company_module_access.findUnique({
      where: { company_id_module_code: { company_id: laode.user.company_id, module_code: 'FINANCE' } },
    });
    assert(financeCompanyAccess?.enabled && financeCompanyAccess.allow_read && financeCompanyAccess.allow_write, 'Finance company entitlement must be enabled for matrix tests');

    const levels = [
      { name: 'blocked', allow_read: false, allow_write: false },
      { name: 'view-only', allow_read: true, allow_write: false },
      { name: 'full-write', allow_read: true, allow_write: true },
    ];
    for (const level of levels) {
      const response = await request(`/api/v1/accounts/users/${jundyId}/module-access/FINANCE`, laode.access, {
        method: 'PUT', body: JSON.stringify(level),
      });
      assert.equal(response.status, 200, `${level.name}: ${await response.text()}`);
      const saved = await prisma.iam_user_module_access.findUnique({ where: { user_id_module_code: { user_id: jundyId, module_code: 'FINANCE' } } });
      assert.equal(saved?.allow_read, level.allow_read);
      assert.equal(saved?.allow_write, level.allow_write);
      pass(`Explicit access level: ${level.name}`);
    }

    const writeImpliesRead = await request(`/api/v1/accounts/users/${jundyId}/module-access/FINANCE`, laode.access, {
      method: 'PUT', body: JSON.stringify({ allow_read: false, allow_write: true }),
    });
    assert.equal(writeImpliesRead.status, 200);
    const normalized = await writeImpliesRead.json() as { allow_read: boolean; allow_write: boolean };
    assert.equal(normalized.allow_read, true);
    assert.equal(normalized.allow_write, true);
    pass('Write access implies read access');

    const reloaded = await request('/api/v1/accounts/user-module-access', laode.access);
    const reloadBody = await reloaded.json() as { results: Array<{ user_id: string; module_code: string; allow_read: boolean; allow_write: boolean }> };
    const persisted = reloadBody.results.find((row) => row.user_id === jundyId && row.module_code === 'FINANCE');
    assert(persisted?.allow_read && persisted.allow_write);
    pass('Saved access survives reload');

    const reset = await request(`/api/v1/accounts/users/${jundyId}/module-access/FINANCE`, laode.access, { method: 'DELETE' });
    assert.equal(reset.status, 204);
    assert.equal(await prisma.iam_user_module_access.findUnique({ where: { user_id_module_code: { user_id: jundyId, module_code: 'FINANCE' } } }), null);
    assert.equal((await request('/api/v1/finance/project-fundings/?page_size=1', jundy.access)).status, 403, 'Role-default Jundy must not acquire Finance');
    pass('Role default removes override and restores role authorization');

    const selfChange = await request(`/api/v1/accounts/users/${laode.user.id}/module-access/FINANCE`, laode.access, {
      method: 'PUT', body: JSON.stringify({ allow_read: true, allow_write: true }),
    });
    assert.equal(selfChange.status, 403);
    pass('Company Admin self-change rejected');

    const crossCompany = await request(`/api/v1/accounts/users/${ghost.user.id}/module-access/FINANCE`, laode.access, {
      method: 'PUT', body: JSON.stringify({ allow_read: true, allow_write: true }),
    });
    assert.equal(crossCompany.status, 403);
    pass('Cross-company target rejected');

    const ordinaryAdminAttempt = await request(`/api/v1/accounts/users/${laode.user.id}/module-access/FINANCE`, jundy.access, {
      method: 'PUT', body: JSON.stringify({ allow_read: true, allow_write: true }),
    });
    assert.equal(ordinaryAdminAttempt.status, 403);
    pass('Ordinary user administration rejected');

    const unknownCode = `Q10_UNKNOWN_${Date.now()}`;
    const unknownModule = await request(`/api/v1/accounts/users/${jundyId}/module-access/${unknownCode}`, laode.access, {
      method: 'PUT', body: JSON.stringify({ allow_read: true, allow_write: true }),
    });
    assert.equal(unknownModule.status, 403);
    assert.equal(await prisma.iam_user_module_access.count({ where: { user_id: jundyId, module_code: unknownCode } }), 0);
    pass('Unapproved module rejected without persistence');

    const companyEscalation = await request(`/api/v1/core/companies/${laode.user.company_id}/modules/FINANCE`, laode.access, {
      method: 'PATCH', body: JSON.stringify({ enabled: false, allow_read: false, allow_write: false }),
    });
    assert.equal(companyEscalation.status, 403);
    const companyAfter = await prisma.iam_company_module_access.findUnique({
      where: { company_id_module_code: { company_id: laode.user.company_id, module_code: 'FINANCE' } },
    });
    assert.equal(companyAfter?.enabled, true);
    pass('Company entitlement remains Super Admin controlled');

    console.log(JSON.stringify({ status: 'PASS', suite: 'Q10 Company Admin Access Matrix', behaviors: passed.length, cases: passed }, null, 2));
  } finally {
    if (jundyId) {
      if (priorOverride) {
        await prisma.iam_user_module_access.upsert({
          where: { user_id_module_code: { user_id: jundyId, module_code: 'FINANCE' } },
          create: {
            id: priorOverride.id, tenant_id: priorOverride.tenant_id, company_id: priorOverride.company_id,
            user_id: priorOverride.user_id, module_code: priorOverride.module_code, allow_read: priorOverride.allow_read,
            allow_write: priorOverride.allow_write, granted_by_id: priorOverride.granted_by_id,
          },
          update: { allow_read: priorOverride.allow_read, allow_write: priorOverride.allow_write, granted_by_id: priorOverride.granted_by_id },
        });
      } else {
        await prisma.iam_user_module_access.deleteMany({ where: { user_id: jundyId, module_code: 'FINANCE' } });
      }
    }
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

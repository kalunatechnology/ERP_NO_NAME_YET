/**
 * File: backend-express/tests/q6.integration.ts
 *
 * Purpose: Implements integration verification responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import assert from 'node:assert/strict';
import prisma from '../src/config/database';

const BASE_URL = process.env.Q6_BASE_URL ?? 'http://localhost:8001';
const PASSWORD = process.env.Q6_DEMO_PASSWORD ?? 'DummyPass123!';

type Login = { access: string; refresh: string; user: any };
const failures: Array<{ test: string; error: string }> = [];
let passed = 0;

/**
 * request implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
async function request(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (options.method && options.method !== 'GET' && !headers.has('idempotency-key')) {
    headers.set('idempotency-key', crypto.randomUUID());
  }
  if (token) headers.set('authorization', `Bearer ${token}`);
  // A test must fail deterministically when the remote pooler/API stalls;
  // leaving fetch unbounded can skip the finally-based fixture restoration.
  return fetch(`${BASE_URL}${path}`, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(30_000) });
}

/**
 * login implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
async function login(email: string): Promise<Login> {
  const response = await request('/api/v1/auth/token', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(response.status, 200, `${email} login returned ${response.status}`);
  return response.json() as Promise<Login>;
}

/**
 * check implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: no direct Prisma operation is present in this function; persistence may be delegated to an imported service.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    passed += 1;
  } catch (error) {
    failures.push({ test: name, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * main implements this file's named function contract.
 *
 * @param input - Uses the typed parameters declared by the signature.
 * @returns The value or Promise declared by the implementation.
 * Database: reads or mutates `iam_company_module_access`, `iam_user` exactly as shown; no wider transaction is implied.
 * Failure/side effects: propagates validation, authorization, persistence, or dependency failures according to the existing caller contract.
 */
async function main() {
  const demoEmails = [
    'dummy.admin@example.com', 'rian@arsalynk.com', 'melika@arsalynk.com',
    'melika.ops@arsalynk.com', 'arof@arsalynk.com', 'laode@arsalynk.com',
    'crm.lead@arsalynk.id', 'sales@arsalynk.id', 'finance.lead@arsalynk.id',
    'staff.dev@arsalynk.id', 'pm.lead@arsalynk.id',
  ];
  const sessions = new Map<string, Login>();
  for (const email of demoEmails) sessions.set(email, await login(email));

  const superAdmin = sessions.get('dummy.admin@example.com')!;
  // Rian is intentionally Director-only. Laode is the canonical SMA Company
  // Admin and is therefore the identity that must exercise company governance.
  const companyAdmin = sessions.get('laode@arsalynk.com')!;
  const crm = sessions.get('crm.lead@arsalynk.id')!;
  const sales = sessions.get('sales@arsalynk.id')!;
  const finance = sessions.get('finance.lead@arsalynk.id')!;
  const staff = sessions.get('staff.dev@arsalynk.id')!;
  const pm = sessions.get('pm.lead@arsalynk.id')!;
  const arof = sessions.get('arof@arsalynk.com')!;
  const ghostCompanyId = crm.user.company_id as string;
  const smaCompanyId = companyAdmin.user.company_id as string;
  const moduleCodes = ['CRM', 'SALES', 'PROJECTS', 'FINANCE', 'REQUESTS'];
  const companyIds = [ghostCompanyId, smaCompanyId];
  const snapshots = await prisma.iam_company_module_access.findMany({
    where: { company_id: { in: companyIds }, module_code: { in: moduleCodes } },
  });
  const arofBefore = await prisma.iam_user.findFirstOrThrow({ where: { email: 'arof@arsalynk.com' } });

  try {
    await check('health endpoint remains public', async () => {
      assert.equal((await request('/health')).status, 200);
    });
    await check('protected endpoint rejects anonymous request', async () => {
      assert.equal((await request('/api/v1/auth/me')).status, 401);
    });
    await check('invalid password is rejected', async () => {
      const response = await request('/api/v1/auth/token', {
        method: 'POST', body: JSON.stringify({ email: 'rian@arsalynk.com', password: 'wrong-password' }),
      });
      assert.equal(response.status, 401);
    });
    await check('all representative demo accounts can login', async () => {
      assert.equal(sessions.size, demoEmails.length);
    });
    await check('only designated account is Super Admin', async () => {
      assert.equal(superAdmin.user.is_superuser, true);
      for (const [email, session] of sessions) {
        if (email !== 'dummy.admin@example.com') assert.equal(session.user.is_superuser, false, email);
      }
    });
    await check('Super Admin has no company membership context', async () => {
      assert.equal(superAdmin.user.company_id, null);
    });
    await check('Super Admin can list companies', async () => {
      assert.equal((await request('/api/v1/core/companies/?page_size=100', {}, superAdmin.access)).status, 200);
    });
    await check('company user cannot forge X-Company-ID', async () => {
      const response = await request('/api/v1/accounts/users/', { headers: { 'x-company-id': ghostCompanyId } }, companyAdmin.access);
      assert.equal(response.status, 403);
    });
    await check('Company Admin cannot grant Company Admin role', async () => {
      const response = await request('/api/v1/accounts/users/invite', {
        method: 'POST',
        body: JSON.stringify({ name: 'Q6 Rejected', email: 'q6-rejected@example.invalid', password: PASSWORD, role_codes: ['ROLE-COMPANY-ADMIN'] }),
      }, companyAdmin.access);
      assert.equal(response.status, 403);
    });

    await prisma.iam_company_module_access.updateMany({
      where: { company_id: { in: companyIds }, module_code: { in: moduleCodes } },
      data: { enabled: true, allow_read: true, allow_write: true, source: 'Q6_TEMPORARY_TEST' },
    });

    await check('CRM role can read CRM after entitlement is enabled', async () => {
      assert.equal((await request('/api/v1/crm/opportunities/?page_size=1', {}, crm.access)).status, 200);
    });
    await check('Finance role cannot read CRM despite entitlement', async () => {
      assert.equal((await request('/api/v1/crm/opportunities/?page_size=1', {}, finance.access)).status, 403);
    });
    await check('Finance role can read finance', async () => {
      assert.equal((await request('/api/v1/finance/project-fundings/?page_size=1', {}, finance.access)).status, 200);
    });
    await check('Staff cannot read finance despite entitlement', async () => {
      assert.equal((await request('/api/v1/finance/project-fundings/?page_size=1', {}, staff.access)).status, 403);
    });
    await check('Sales endpoint requires SALES entitlement and role', async () => {
      assert.equal((await request('/api/v1/sales/quotations/?page_size=1', {}, sales.access)).status, 200);
      assert.equal((await request('/api/v1/sales/quotations/?page_size=1', {}, finance.access)).status, 403);
    });
    await check('Super Admin operational writes remain read-only', async () => {
      const response = await request('/api/v1/finance/project-fundings/', {
        method: 'POST', body: JSON.stringify({ status: 'DRAFT' }),
      }, superAdmin.access);
      assert.equal(response.status, 403);
    });
    await check('CRM record persists end-to-end and can be removed', async () => {
      const created = await request('/api/v1/crm/opportunities/', {
        method: 'POST',
        body: JSON.stringify({
          pipeline_stage: 'QUALIFICATION', opportunity_name: 'Q6 Temporary Opportunity',
          lost_reason: '', expected_amount: 1000000, expected_margin: 250000,
          probability_percent: 25, status: 'OPEN',
        }),
      }, crm.access);
      assert.equal(created.status, 201);
      const record = await created.json() as any;
      assert.equal(record.company_id, ghostCompanyId);
      assert.equal((await request(`/api/v1/crm/opportunities/${record.id}/`, {}, crm.access)).status, 200);
      assert.ok([200, 204].includes((await request(`/api/v1/crm/opportunities/${record.id}/`, { method: 'DELETE' }, crm.access)).status));
    });
    await check('Project record persists end-to-end and can be removed', async () => {
      const created = await request('/api/v1/projects/projects/', {
        method: 'POST',
        body: JSON.stringify({
          project_code: `Q6-${Date.now()}`, project_name: 'Q6 Temporary Project',
          customer_name: 'Q6 Customer', manager_name: 'Q6 PM', description: 'Temporary integration test',
          budget_amount: 1000000, contract_amount: 1250000, target_margin_percent: 20,
          progress_percent: 0, status: 'DRAFT', lifecycle_status: 'DRAFT',
          health_status: 'ON_TRACK', source_type: 'Q6_TEST',
        }),
      }, pm.access);
      assert.equal(created.status, 201);
      const record = await created.json() as any;
      assert.equal(record.company_id, ghostCompanyId);
      assert.ok([200, 204].includes((await request(`/api/v1/projects/projects/${record.id}/`, { method: 'DELETE' }, pm.access)).status));
    });
    await check('Finance billing record persists end-to-end and can be removed', async () => {
      const created = await request('/api/v1/finance/billing-documents/', {
        method: 'POST',
        body: JSON.stringify({
          billing_type: 'SUPPLIER_INVOICE', invoice_number: `Q6-${Date.now()}`,
          subtotal: 1000000, tax_amount: 110000, total_amount: 1110000,
          paid_amount: 0, outstanding_amount: 1110000, payment_status: 'UNPAID',
          status: 'DRAFT', rejection_reason: '',
        }),
      }, finance.access);
      assert.equal(created.status, 201);
      const record = await created.json() as any;
      assert.equal(record.company_id, ghostCompanyId);
      assert.ok([200, 204].includes((await request(`/api/v1/finance/billing-documents/${record.id}/`, { method: 'DELETE' }, finance.access)).status));
    });
    await check('active role changes without relogin', async () => {
      const changed = await request('/api/v1/auth/active-role', {
        method: 'PATCH', body: JSON.stringify({ role_code: 'ROLE-FINANCE' }),
      }, arof.access);
      assert.equal(changed.status, 200);
      const me = await request('/api/v1/auth/me', {}, arof.access);
      assert.equal(me.status, 200);
      assert.equal((await me.json() as any).active_role_code, 'ROLE-FINANCE');
    });
    await check('concurrent authorized reads remain isolated and stable', async () => {
      const responses = await Promise.all(Array.from({ length: 5 }, () =>
        request('/api/v1/finance/project-fundings/?page_size=1', {}, finance.access)));
      assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200]);
    });
  } finally {
    for (const snapshot of snapshots) {
      await prisma.iam_company_module_access.update({
        where: { id: snapshot.id },
        data: {
          enabled: snapshot.enabled,
          allow_read: snapshot.allow_read,
          allow_write: snapshot.allow_write,
          source: snapshot.source,
          effective_from: snapshot.effective_from,
          effective_until: snapshot.effective_until,
          enabled_by_id: snapshot.enabled_by_id,
        },
      });
    }
    await prisma.iam_user.update({
      where: { id: arofBefore.id },
      data: { active_role_id: arofBefore.active_role_id },
    });
  }

  console.log(JSON.stringify({ passed, failed: failures.length, failures }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

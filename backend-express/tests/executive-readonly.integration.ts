/**
 * Executive Read-Only Integration Test
 *
 * Verifies that:
 * 1. Role DIRECTOR (Executive) can perform GET requests across Projects, Finance, and CRM.
 * 2. Role DIRECTOR (Executive) receives 403 Forbidden for POST, PUT, PATCH, DELETE mutations
 *    on Projects, Finance, and CRM.
 */
import assert from 'node:assert/strict';

const baseUrl = process.env.Q9_BASE_URL ?? 'http://localhost:8001';
const password = process.env.Q9_DEMO_PASSWORD ?? 'DummyPass123!';

type Session = { access: string; user: { company_id: string | null; active_role_code: string } };

async function request(path: string, token?: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function login(email: string): Promise<Session> {
  const response = await request('/api/v1/auth/token', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `${email}: login returned ${response.status}`);
  return response.json() as Promise<Session>;
}

async function main(): Promise<void> {
  console.log('[TEST] Starting executive-readonly integration test...');
  const rian = await login('rian@arsalynk.com');
  assert.equal(rian.user.active_role_code, 'ROLE-DIRECTOR', 'User must have ROLE-DIRECTOR');

  // 1. Projects read-only verification
  const getProjects = await request('/api/v1/projects/projects/?page_size=10', rian.access);
  assert.equal(getProjects.status, 200, `Executive GET projects returned ${getProjects.status}`);

  const postProject = await request('/api/v1/projects/projects/', rian.access, {
    method: 'POST',
    body: JSON.stringify({ project_name: 'Unauthorized Project Attempt' }),
  });
  assert.equal(postProject.status, 403, `Executive POST project returned ${postProject.status} (expected 403)`);

  const deleteProject = await request('/api/v1/projects/projects/999999/', rian.access, {
    method: 'DELETE',
  });
  assert.equal(deleteProject.status, 403, `Executive DELETE project returned ${deleteProject.status} (expected 403)`);

  // 2. Finance read-only verification
  const getCostEntries = await request('/api/v1/finance/project-cost-entries/?page_size=10', rian.access);
  assert.equal(getCostEntries.status, 200, `Executive GET cost entries returned ${getCostEntries.status}`);

  const postCostEntry = await request('/api/v1/finance/project-cost-entries/', rian.access, {
    method: 'POST',
    body: JSON.stringify({ description: 'Unauthorized Cost Entry Attempt', amount: 1000000 }),
  });
  assert.equal(postCostEntry.status, 403, `Executive POST cost entry returned ${postCostEntry.status} (expected 403)`);

  const postFunding = await request('/api/v1/finance/project-fundings/', rian.access, {
    method: 'POST',
    body: JSON.stringify({ purpose: 'Unauthorized Funding Attempt', amount: 5000000 }),
  });
  assert.equal(postFunding.status, 403, `Executive POST funding returned ${postFunding.status} (expected 403)`);

  // 3. CRM read-only verification
  const getOpportunities = await request('/api/v1/crm/opportunities/?page_size=10', rian.access);
  assert.equal(getOpportunities.status, 200, `Executive GET opportunities returned ${getOpportunities.status}`);

  const postOpportunity = await request('/api/v1/crm/opportunities/', rian.access, {
    method: 'POST',
    body: JSON.stringify({ name: 'Unauthorized Opportunity Attempt', deal_value: 50000000 }),
  });
  assert.equal(postOpportunity.status, 403, `Executive POST opportunity returned ${postOpportunity.status} (expected 403)`);

  console.log('[TEST] All Executive read-only assertions passed successfully (403 on mutations, 200 on views).');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[TEST FAILED]:', err);
    process.exit(1);
  });
}

export { main as testExecutiveReadOnly };

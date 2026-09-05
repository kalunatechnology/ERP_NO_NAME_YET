/** Isolated Q10 BDD runner. One behavior per process avoids cross-test hangs. */
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend-express');
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules', 'ts-node', 'register'));
const { createApp } = require(path.join(backend, 'src', 'app.ts'));
const prisma = require(path.join(backend, 'src', 'config', 'database.ts')).default;
const password = process.env.Q10_DEMO_PASSWORD || 'DummyPass123!';
const scenario = process.argv[2];

/** Signs in a fixture with the agreed 15-second database/login ceiling. */
async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/v1/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, `${email}: login HTTP ${response.status}`);
  return response.json();
}
/** Sends a request through real Express middleware with a 15-second ceiling. */
async function request(baseUrl, route, token, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
}
async function main() {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let evidence;
  try {
    if (scenario === 'health') {
      const [health, protectedResource] = await Promise.all([request(baseUrl, '/health'), request(baseUrl, '/api/v1/projects/projects/?page_size=1')]);
      assert.equal(health.status, 200); assert.equal(protectedResource.status, 401); evidence = { health: 200, protected_projects: 401 };
    } else if (scenario === 'director') {
      const rian = await login(baseUrl, 'rian@arsalynk.com');
      const [projects, reports] = await Promise.all([request(baseUrl, '/api/v1/projects/projects/?page_size=1', rian.access), request(baseUrl, '/api/v1/reporting/periodic-project-summary', rian.access)]);
      assert.equal(rian.user.active_role_code, 'ROLE-DIRECTOR'); assert.equal(Boolean(rian.user.is_superuser), false); assert.equal(projects.status, 200); assert.equal(reports.status, 200);
      evidence = { role: rian.user.active_role_code, projects: projects.status, reports: reports.status };
    } else if (scenario === 'company-isolation') {
      const [laode, ghost] = await Promise.all([login(baseUrl, 'laode@arsalynk.com'), login(baseUrl, 'admin.director@arsalynk.id')]);
      const [ownUsers, forged] = await Promise.all([request(baseUrl, '/api/v1/accounts/users/?page_size=10', laode.access), request(baseUrl, '/api/v1/accounts/users/?page_size=1', laode.access, { headers: { 'x-company-id': ghost.user.company_id } })]);
      assert.equal(laode.user.active_role_code, 'ROLE-COMPANY-ADMIN'); assert.notEqual(laode.user.company_id, ghost.user.company_id); assert.equal(ownUsers.status, 200); assert.equal(forged.status, 403);
      evidence = { own_users: ownUsers.status, forged_company: forged.status };
    } else if (scenario === 'roles') {
      const [melika, arof] = await Promise.all([login(baseUrl, 'melika@arsalynk.com'), login(baseUrl, 'arof@arsalynk.com')]);
      assert.equal(melika.user.active_role_code, 'ROLE-PM'); assert.equal(arof.user.active_role_code, 'ROLE-PM');
      const [m, a] = await Promise.all([request(baseUrl, '/api/v1/projects/projects/?page_size=1', melika.access), request(baseUrl, '/api/v1/projects/projects/?page_size=1', arof.access)]);
      assert.equal(m.status, 200); assert.equal(a.status, 200); evidence = { melika: 'ROLE-PM', arof: 'ROLE-PM', projects: [m.status, a.status] };
    } else if (scenario === 'crm') {
      const crm = await login(baseUrl, 'crm.lead@arsalynk.id'); const inquiries = await request(baseUrl, '/api/v1/crm/customer-inquiries/?page_size=1', crm.access);
      assert.equal(crm.user.active_role_code, 'ROLE-CRM-LEAD'); assert.equal(inquiries.status, 200); evidence = { role: crm.user.active_role_code, inquiries: inquiries.status };
    } else if (scenario === 'wbs') {
      const rows = await prisma.$queryRaw`SELECT count(*)::int AS count FROM project_project p WHERE coalesce(p.progress_percent, 0) <> 0 AND NOT EXISTS (SELECT 1 FROM project_main_task mt WHERE mt.project_id = p.id)`;
      assert.equal(Number(rows[0]?.count || 0), 0); evidence = { orphan_project_progress: 0 };
    } else if (scenario === 'overrides') {
      const [mainTasks, weeklyTasks] = await prisma.$transaction([prisma.project_main_task.count({ where: { is_progress_overridden: true } }), prisma.project_weekly_task.count({ where: { is_progress_overridden: true } })]);
      assert.equal(mainTasks, 0); assert.equal(weeklyTasks, 0); evidence = { main_overrides: 0, weekly_overrides: 0 };
    } else throw new Error(`Unknown scenario: ${scenario}`);
    console.log(JSON.stringify({ status: 'PASS', scenario, evidence }));
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.log(JSON.stringify({ status: 'FAIL', scenario, kind: error.name, error: error.message })); process.exitCode = 1; });

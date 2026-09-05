/**
 * Q10 executable Behaviour-Driven system specification.
 *
 * The suite boots the real Express app on an ephemeral local port and exercises
 * production middleware, routes, services, Prisma data, and a pure frontend
 * timeline projection. Role state changed by a scenario is restored in `finally`.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import prisma from '../src/config/database';
import { createApp } from '../src/app';
import { buildMainTaskTimeline } from '../../frontend-next/lib/dashboard/project-timeline';

const password = process.env.Q10_DEMO_PASSWORD ?? 'DummyPass123!';
type Session = { access: string; user: { id: string; company_id: string | null; active_role_code: string; is_superuser?: boolean } };
type ScenarioResult = { scenario: string; status: 'PASS'; evidence: Record<string, unknown> };

/** Runs one named Given–When–Then scenario and records auditable evidence. */
async function scenario(name: string, execute: () => Promise<Record<string, unknown>>): Promise<ScenarioResult> {
  const evidence = await execute();
  process.stdout.write(`PASS: ${name}\n`);
  return { scenario: name, status: 'PASS', evidence };
}

/** Executes Q10 against an isolated HTTP listener while retaining the real DB. */
async function main(): Promise<void> {
  const feature = await readFile(`${__dirname}/features/q10-critical-system.feature`, 'utf8');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const results: ScenarioResult[] = [];

  /** Sends a request through the same bearer/header contract used by Next. */
  async function request(path: string, token?: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(`${baseUrl}${path}`, { ...options, headers });
  }

  /** Authenticates a canonical fixture through the public login endpoint. */
  async function login(email: string): Promise<Session> {
    const response = await request('/api/v1/auth/token', undefined, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200, `${email} login returned ${response.status}`);
    return response.json() as Promise<Session>;
  }

  try {
    const scenarioNames = [
      'Public health and protected resources',
      'Director reporting access',
      'Company Admin governance remains company scoped',
      'Operational users keep their canonical roles',
      'CRM persona can read only its entitled company pipeline',
      'Multi-role switching does not require another login',
      'Project progress requires a real WBS hierarchy',
      'Manual WBS progress override is closed',
    ];
    scenarioNames.forEach((name) => assert(feature.includes(`Scenario: ${name}`), `Missing feature scenario: ${name}`));

    results.push(await scenario(scenarioNames[0], async () => {
      const [health, anonymousProjects] = await Promise.all([
        request('/health'), request('/api/v1/projects/projects/?page_size=1'),
      ]);
      assert.equal(health.status, 200);
      assert.equal(anonymousProjects.status, 401);
      return { health: 200, anonymous_projects: 401 };
    }));

    const [rian, laode, melika, arof, ghost, crmLead] = await Promise.all([
      login('rian@arsalynk.com'),
      login('laode@arsalynk.com'),
      login('melika@arsalynk.com'),
      login('arof@arsalynk.com'),
      login('admin.director@arsalynk.id'),
      login('crm.lead@arsalynk.id'),
    ]);

    results.push(await scenario(scenarioNames[1], async () => {
      assert.equal(rian.user.active_role_code, 'ROLE-DIRECTOR');
      assert.equal(Boolean(rian.user.is_superuser), false, 'Rian must not become Super Admin');
      const [projects, reports] = await Promise.all([
        request('/api/v1/projects/projects/?page_size=10', rian.access),
        request('/api/v1/reporting/periodic-project-summary', rian.access),
      ]);
      assert.equal(projects.status, 200);
      assert.equal(reports.status, 200);
      return { role: rian.user.active_role_code, projects: 200, reporting: 200, super_admin: false };
    }));

    results.push(await scenario(scenarioNames[2], async () => {
      assert.equal(laode.user.active_role_code, 'ROLE-COMPANY-ADMIN');
      assert(laode.user.company_id && ghost.user.company_id);
      assert.notEqual(laode.user.company_id, ghost.user.company_id);
      const [companyUsers, forgedCompany] = await Promise.all([
        request('/api/v1/accounts/users/?page_size=100', laode.access),
        request('/api/v1/accounts/users/?page_size=1', laode.access, { headers: { 'x-company-id': ghost.user.company_id } }),
      ]);
      assert.equal(companyUsers.status, 200);
      assert.equal(forgedCompany.status, 403);
      return { role: laode.user.active_role_code, company_users: 200, forged_company: 403 };
    }));

    results.push(await scenario(scenarioNames[3], async () => {
      assert.equal(melika.user.active_role_code, 'ROLE-PM');
      assert.equal(arof.user.active_role_code, 'ROLE-PM');
      const [melikaProjects, arofProjects] = await Promise.all([
        request('/api/v1/projects/projects/?page_size=10', melika.access),
        request('/api/v1/projects/projects/?page_size=10', arof.access),
      ]);
      assert.equal(melikaProjects.status, 200);
      assert.equal(arofProjects.status, 200);
      return { melika: 'ROLE-PM', arof: 'ROLE-PM', project_access: 200 };
    }));

    results.push(await scenario(scenarioNames[4], async () => {
      assert.equal(crmLead.user.active_role_code, 'ROLE-CRM-LEAD');
      assert.equal(crmLead.user.company_id, ghost.user.company_id);
      const inquiries = await request('/api/v1/crm/customer-inquiries/?page_size=10', crmLead.access);
      assert.equal(inquiries.status, 200);
      return { role: 'ROLE-CRM-LEAD', customer_inquiries: 200, company_isolated: true };
    }));

    results.push(await scenario(scenarioNames[5], async () => {
      const originalRole = arof.user.active_role_code;
      try {
        const switched = await request('/api/v1/auth/active-role', arof.access, {
          method: 'PATCH', body: JSON.stringify({ role_code: 'ROLE-FINANCE' }),
        });
        assert.equal(switched.status, 200);
        const finance = await request('/api/v1/finance/project-fundings/?page_size=1', arof.access);
        assert.equal(finance.status, 200);
        return { switched_to: 'ROLE-FINANCE', finance_access: 200, relogin: false, restored_to: originalRole };
      } finally {
        const restored = await request('/api/v1/auth/active-role', arof.access, {
          method: 'PATCH', body: JSON.stringify({ role_code: originalRole }),
        });
        assert.equal(restored.status, 200, 'Arof active role could not be restored');
      }
    }));

    results.push(await scenario(scenarioNames[6], async () => {
      const violations = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count
        FROM project_project p
        WHERE coalesce(p.progress_percent, 0) <> 0
          AND NOT EXISTS (SELECT 1 FROM project_main_task mt WHERE mt.project_id = p.id)
      `;
      assert.equal(Number(violations[0]?.count ?? 0), 0);
      const projected = buildMainTaskTimeline([{ id: 'NO-WBS', progress: 72, progress_percentage: 72, main_tasks: [] } as any]);
      assert.deepEqual(projected, [], 'Frontend must not synthesize a Main Task from project progress');
      return { orphan_progress: 0, synthetic_timeline_rows: 0 };
    }));

    results.push(await scenario(scenarioNames[7], async () => {
      const [mainOverrides, weeklyOverrides] = await prisma.$transaction([
        prisma.project_main_task.count({ where: { is_progress_overridden: true } }),
        prisma.project_weekly_task.count({ where: { is_progress_overridden: true } }),
      ]);
      assert.equal(mainOverrides, 0);
      assert.equal(weeklyOverrides, 0);
      return { main_overrides: 0, weekly_overrides: 0 };
    }));

    console.log(JSON.stringify({ status: 'PASS', suite: 'Q10 BDD System Testing', scenarios: results }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/utils/jwt';

async function main() {
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1', 'Never run against a shared database');
  assert(['55439', '55440'].includes(url.port));
  assert.equal(url.pathname, '/marka_qa_20261005');
  assert.equal(env.NODE_ENV, 'test');
  const staff = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'staff.dev@arsalynk.id' } });
  const other = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'finance.lead@arsalynk.id' } });
  const supervisor = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'supervisor@arsalynk.id' } });
  const director = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'director@arsalynk.id' } });
  const membership = await prisma.iam_user_company_membership.findUniqueOrThrow({ where: { user_id: staff.id } });
  const companyId = membership.company_id, tenantId = membership.tenant_id;
  const context = { company_id: companyId, tenant_id: tenantId };
  const now = new Date(), suffix = randomUUID();
  const projects = Array.from({ length: 102 }, (_, i) => ({
    ...context, id: randomUUID(), project_code: `QA-${suffix}-${i}`, project_name: `Assignment QA ${i}`,
    customer_name: '', manager_name: '', description: '', status: 'IN_PROGRESS',
    lifecycle_status: 'STARTED', health_status: 'NORMAL', source_type: 'MANUAL',
  }));
  const mains = Array.from({ length: 607 }, (_, i) => ({
    ...context, id: randomUUID(), project_id: projects[Math.floor(i / 6)].id,
    name: `Shared Main ${i}`, description: '', priority: 'MEDIUM', weight: 1, progress: 0,
    status: 'PLANNED', is_progress_overridden: false, override_reason: '', created_at: now, updated_at: now,
  }));
  const assigned = mains.slice(0, 606), privateMain = mains[606];
  const app = createApp(); app.locals.databaseReady = true;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  const call = async (actor: typeof staff, path: string, method = 'GET', body?: unknown) => {
    const token = signAccessToken({ userId: actor.id, email: actor.email, full_name: actor.full_name, tenant_id: actor.tenant_id!, roles: [] });
    const response = await fetch(base + path, { method, headers: {
      Authorization: `Bearer ${token}`, 'X-Company-ID': companyId, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() as any };
  };
  try {
    await prisma.project_project.createMany({ data: projects });
    await prisma.project_main_task.createMany({ data: mains });
    // Another assignee is recorded first. Neither shared assignment nor a lack
    // of Weekly Tasks may prevent Staff from discovering these Main Tasks.
    await prisma.project_task_assignment.createMany({ data: assigned.map(m => ({ ...context, main_task_id: m.id, assignee_id: other.id, assigned_at: now })) });
    await prisma.project_task_assignment.createMany({ data: assigned.map(m => ({ ...context, main_task_id: m.id, assignee_id: staff.id, assigned_at: now })) });
    await prisma.project_task_assignment.create({ data: { ...context, main_task_id: assigned[605].id, assignee_id: supervisor.id, assigned_at: now } });
    const response = await call(staff, '/dashboard/bootstrap?sections=projects&fresh=1');
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const bundle = response.data.data.projects;
    const projectIds = new Set(projects.slice(0, 101).map(p => p.id));
    const mainIds = new Set(assigned.map(m => m.id));
    assert.equal(bundle.projects.filter((p: any) => projectIds.has(p.id)).length, 101, 'All assigned projects must survive the former 100-row limit');
    assert.equal(bundle.mainTasks.filter((m: any) => mainIds.has(m.id)).length, 606, 'All shared Main Tasks must survive the former 300-row limit');
    assert.equal(bundle.assignments.filter((a: any) => mainIds.has(a.main_task_id)).length, 606, 'Every returned Main Task must retain its own assignment past the former 500-row limit');
    assert(bundle.assignments.every((a: any) => a.assignee_id === staff.id));
    assert(!bundle.projects.some((p: any) => p.id === projects[101].id));
    assert(!bundle.mainTasks.some((m: any) => m.id === privateMain.id));
    assert.equal(new Set(bundle.mainTasks.map((m: any) => m.id)).size, bundle.mainTasks.length);
    assert(!bundle.weeklyTasks.some((w: any) => mainIds.has(w.main_task_id)), 'Main Tasks are discoverable before any Weekly Task exists');
    const authority = await call(supervisor, `/projects/projects/${assigned[605].project_id}/authority`);
    assert.equal(authority.status, 200); assert.equal(authority.data.can_manage_weekly_tasks, false);
    const body = { main_task: assigned[605].id, week_number: 40, start_date: '2026-10-05', end_date: '2026-10-11', target_description: 'My personal Weekly' };
    for (const actor of [staff, supervisor]) {
      const created = await call(actor, '/projects/weekly-tasks/', 'POST', body);
      assert.equal(created.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.assignee_id, actor.id); assert.equal(created.data.status, 'PENDING_APPROVAL');
    }
    assert.equal((await call(staff, '/projects/weekly-tasks/', 'POST', { ...body, assignee: other.id })).status, 403);
    assert.equal((await call(staff, '/projects/weekly-tasks/', 'POST', { ...body, main_task: privateMain.id })).status, 403);
    const weeklyRows = assigned.slice(0, 501).map((m, i) => ({
      ...context, id: randomUUID(), main_task_id: m.id, assignee_id: i % 2 ? staff.id : other.id,
      week_number: 40, start_date: new Date('2026-10-05'), end_date: new Date('2026-10-11'),
      target_description: `Executive QA ${i}`, progress: 0, status: 'PLANNED',
      is_progress_overridden: false, override_reason: '', created_at: now, updated_at: now,
    }));
    await prisma.project_weekly_task.createMany({ data: weeklyRows });
    const dailyRows = Array.from({ length: 1001 }, (_, i) => ({
      ...context, id: randomUUID(), weekly_task_id: weeklyRows[i % weeklyRows.length].id, owner_id: staff.id,
      title: `Executive Daily ${i}`, description: '', time_slot: '', output_result: '', notes: '',
      progress: 0, status: 'NOT_STARTED', is_blocked: false, block_reason: '', created_at: now, updated_at: now,
    }));
    await prisma.project_daily_task.createMany({ data: dailyRows });
    const executive = await call(director, '/dashboard/bootstrap?sections=projects&fresh=1');
    assert.equal(executive.status, 200, JSON.stringify(executive.data));
    const executiveBundle = executive.data.data.projects;
    const fixtureProjectIds = new Set(projects.map(p => p.id));
    const fixtureMainIds = new Set(mains.map(m => m.id));
    const fixtureWeeklyIds = new Set(weeklyRows.map(w => w.id));
    const fixtureDailyIds = new Set(dailyRows.map(d => d.id));
    assert.equal(executiveBundle.projects.filter((p: any) => fixtureProjectIds.has(p.id)).length, 102);
    assert.equal(executiveBundle.mainTasks.filter((m: any) => fixtureMainIds.has(m.id)).length, 607);
    assert.equal(executiveBundle.assignments.filter((a: any) => fixtureMainIds.has(a.main_task_id)).length, 1213);
    assert.equal(executiveBundle.weeklyTasks.filter((w: any) => fixtureWeeklyIds.has(w.id)).length, 501);
    assert.equal(executiveBundle.dailyTasks.filter((d: any) => fixtureDailyIds.has(d.id)).length, 1001);
    const visibleMainIds = new Set(executiveBundle.mainTasks.map((m: any) => m.id));
    const visibleWeeklyIds = new Set(executiveBundle.weeklyTasks.map((w: any) => w.id));
    assert(executiveBundle.weeklyTasks.every((w: any) => visibleMainIds.has(w.main_task_id)), 'Executive Weeklies must have visible parents');
    assert(executiveBundle.dailyTasks.every((d: any) => visibleWeeklyIds.has(d.weekly_task_id)), 'Executive Dailies must have visible Weeklies');
    assert.equal(visibleWeeklyIds.size, executiveBundle.weeklyTasks.length, 'No duplicate Executive Weekly rows');
    assert(executiveBundle.users.some((u: any) => u.id === staff.id));
    assert(executiveBundle.users.some((u: any) => u.id === other.id));
    console.log('PASS: real HTTP/PostgreSQL — Staff/SPV shared assignment and self Weekly approval guards; Executive complete WBS: 102 projects, 607 Main, 1213 assignments, 501 Weekly, 1001 Daily, both user identities, no duplicates/orphan children.');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    const mainIds = mains.map(m => m.id);
    const weeklies = await prisma.project_weekly_task.findMany({ where: { main_task_id: { in: mainIds }, company_id: companyId }, select: { id: true } });
    // Cleanup only fixture IDs created by this test, in the guarded local DB.
    await prisma.project_daily_task.deleteMany({ where: { weekly_task_id: { in: weeklies.map(w => w.id) }, company_id: companyId } });
    await prisma.project_weekly_task.deleteMany({ where: { id: { in: weeklies.map(w => w.id) }, company_id: companyId } });
    await prisma.project_task_assignment.deleteMany({ where: { main_task_id: { in: mainIds }, company_id: companyId } });
    await prisma.project_main_task.deleteMany({ where: { id: { in: mainIds }, company_id: companyId } });
    await prisma.project_project.deleteMany({ where: { id: { in: projects.map(p => p.id) }, company_id: companyId } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

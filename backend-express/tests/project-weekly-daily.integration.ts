import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/utils/jwt';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { RequestService } from '../src/modules/core/request.service';

async function main() {
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1', 'Never run against a shared database');
  assert(['55439', '55440'].includes(url.port));
  assert.equal(url.pathname, '/marka_qa_20261005');
  assert.equal(env.NODE_ENV, 'test');
  const pm = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'pm.lead@arsalynk.id' } });
  const staff = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'staff.dev@arsalynk.id' } });
  const finance = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'finance.lead@arsalynk.id' } });
  const supervisor = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'supervisor@arsalynk.id' } });
  const director = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'director@arsalynk.id' } });
  const membership = await prisma.iam_user_company_membership.findUniqueOrThrow({ where: { user_id: pm.id } });
  const companyId = membership.company_id;
  const tenantId = membership.tenant_id;
  // The existing assignee policy requires the baseline Staff role even while
  // Finance/Supervisor is active. Provision that existing baseline in QA only.
  for (const actor of [finance, supervisor]) {
    if (!await prisma.iam_user_role.findFirst({ where: { user_id: actor.id, company_id: companyId, role_id: staff.active_role_id } })) {
      await prisma.iam_user_role.create({ data: { user_id: actor.id, company_id: companyId, tenant_id: tenantId, role_id: staff.active_role_id } });
    }
  }
  await prisma.iam_company_module_access.upsert({
    where: { company_id_module_code: { company_id: companyId, module_code: 'PROJECTS' } },
    create: { tenant_id: tenantId, company_id: companyId, module_code: 'PROJECTS', enabled: true, allow_read: true, allow_write: true },
    update: { enabled: true, allow_read: true, allow_write: true },
  });
  const suffix = randomUUID();
  const otherPm = await prisma.iam_user.create({ data: { ...pm, id: randomUUID(), username: `pm-${suffix}`, email: `pm-${suffix}@qa.invalid` } });
  await prisma.iam_user_company_membership.create({ data: { tenant_id: tenantId, company_id: companyId, user_id: otherPm.id } });
  const pmRoles = await prisma.iam_user_role.findMany({ where: { user_id: pm.id, company_id: companyId } });
  for (const role of pmRoles) await prisma.iam_user_role.create({ data: { ...role, id: randomUUID(), user_id: otherPm.id } });

  const app = createApp(); app.locals.databaseReady = true;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1/projects`;
  const call = async (actor: typeof pm, path: string, method = 'GET', body?: unknown, scopeCompany = companyId) => {
    const token = signAccessToken({ userId: actor.id, email: actor.email, full_name: actor.full_name, tenant_id: actor.tenant_id!, roles: [] });
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Company-ID': scopeCompany, 'Idempotency-Key': randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null, text };
  };
  const ok = (r: Awaited<ReturnType<typeof call>>, status: number) => { assert.equal(r.status, status, r.text); return r.data; };
  const weeklyBody = (mainId: string, ownerId: string) => ({ main_task: mainId, assignee: ownerId, week_number: 40, start_date: '2026-10-05', end_date: '2026-10-11', target_description: `Weekly ${suffix}`, status: 'COMPLETED', progress: 100, is_progress_overridden: true, created_by_id: pm.id });
  const dailyBody = (weeklyId: string) => ({ weekly_task: weeklyId, title: 'Daily fixture', time_slot: '09:00-10:00', planned_date: '2026-10-06', output_target: 'Report fixture', output_result: 'Report fixture', status: 'COMPLETED' });
  try {
    const project = ok(await call(pm, '/projects/', 'POST', { project_name: `Approval QA ${suffix}`, customer_name: 'QA', manager_name: pm.full_name, budget_amount: 0 }), 201);
    const otherProject = ok(await call(pm, '/projects/', 'POST', { project_name: `Other QA ${suffix}`, customer_name: 'QA', manager_name: pm.full_name, budget_amount: 0 }), 201);
    const main = ok(await call(pm, '/main-tasks/', 'POST', { project: project.id, title: 'Main fixture', weight: 100 }), 201);
    const otherMain = ok(await call(pm, '/main-tasks/', 'POST', { project: otherProject.id, title: 'Other fixture', weight: 100 }), 201);
    ok(await call(pm, `/main-tasks/${main.id}/assign-members`, 'POST', { user_ids: [staff.id, finance.id, supervisor.id] }), 200);

    const weekly = ok(await call(staff, '/weekly-tasks/', 'POST', weeklyBody(main.id, staff.id)), 201);
    assert.equal(weekly.status, 'PENDING_APPROVAL'); assert.equal(weekly.created_by_id, staff.id);
    assert.equal(Number(weekly.progress), 0); assert.equal(weekly.is_progress_overridden, false);
    const listing = ok(await call(pm, '/weekly-tasks/?page_size=500'), 200);
    assert((listing.results || listing.data).some((w: any) => w.id === weekly.id), 'Related PM must receive the proposal in existing Weekly listing');
    ok(await call(staff, '/weekly-tasks/', 'POST', weeklyBody(main.id, finance.id)), 403);
    ok(await call(staff, '/weekly-tasks/', 'POST', weeklyBody(otherMain.id, staff.id)), 403);
    ok(await call(staff, '/weekly-tasks/', 'POST', weeklyBody(main.id, staff.id), randomUUID()), 403);
    ok(await call(director, '/weekly-tasks/', 'POST', weeklyBody(main.id, director.id)), 403);
    ok(await call(staff, '/daily-tasks/', 'POST', dailyBody(weekly.id)), 400);
    ok(await call(staff, `/weekly-tasks/${weekly.id}/review`, 'POST', { decision: 'APPROVE' }), 403);
    ok(await call(otherPm, `/weekly-tasks/${weekly.id}/review`, 'POST', { decision: 'APPROVE' }), 403);
    ok(await call(pm, `/weekly-tasks/${weekly.id}/`, 'PATCH', { status: 'PLANNED' }), 400);
    assert.equal(ok(await call(pm, `/weekly-tasks/${weekly.id}/review`, 'POST', { decision: 'APPROVE' }), 200).status, 'PLANNED');
    ok(await call(pm, `/weekly-tasks/${weekly.id}/review`, 'POST', { decision: 'REJECT' }), 409);
    ok(await call(staff, `/weekly-tasks/${weekly.id}/`, 'PATCH', { target_description: 'Unauthorized edit' }), 403);
    ok(await call(pm, `/weekly-tasks/${weekly.id}/`, 'PATCH', { target_description: 'PM controlled target' }), 200);

    const daily = ok(await call(staff, '/daily-tasks/', 'POST', dailyBody(weekly.id)), 201);
    const rejected = ok(await call(staff, '/weekly-tasks/', 'POST', weeklyBody(main.id, staff.id)), 201);
    assert.equal(Number((await prisma.project_main_task.findUniqueOrThrow({ where: { id: main.id } })).progress), 100, 'Pending proposal cannot dilute approved progress');
    assert.equal(ok(await call(pm, `/weekly-tasks/${rejected.id}/review`, 'POST', { decision: 'REJECT' }), 200).status, 'REJECTED');
    ok(await call(staff, '/daily-tasks/', 'POST', dailyBody(rejected.id)), 400);
    await ProjectsService.recalculateTaskTree({ weeklyTaskId: rejected.id, companyId });
    assert.equal((await prisma.project_weekly_task.findUniqueOrThrow({ where: { id: rejected.id } })).status, 'REJECTED');
    ok(await call(pm, `/weekly-tasks/${rejected.id}/`, 'DELETE'), 409);

    for (const actor of [finance, supervisor]) {
      const proposal = ok(await call(actor, '/weekly-tasks/', 'POST', weeklyBody(main.id, actor.id)), 201);
      assert.equal(proposal.status, 'PENDING_APPROVAL');
      ok(await call(pm, `/weekly-tasks/${proposal.id}/review`, 'POST', { decision: 'APPROVE' }), 200);
      ok(await call(actor, '/daily-tasks/', 'POST', { ...dailyBody(proposal.id), status: 'IN_PROGRESS' }), 201);
    }
    const direct = ok(await call(pm, '/weekly-tasks/', 'POST', { ...weeklyBody(main.id, staff.id), status: 'PLANNED' }), 201);
    assert.equal(direct.status, 'PLANNED', 'Existing PM create flow remains active');

    ok(await call(pm, `/daily-tasks/${daily.id}/update-progress`, 'PATCH', { notes: 'PM cannot edit another owner' }), 403);
    ok(await call(finance, `/daily-tasks/${daily.id}/update-progress`, 'PATCH', { notes: 'Other owner' }), 403);
    ok(await call(pm, `/daily-tasks/${daily.id}/`, 'DELETE'), 403);
    const edit = ok(await call(staff, `/daily-tasks/${daily.id}/update-progress`, 'PATCH', { title: 'Edited fixture', time_slot: '11:00-12:00', planned_date: '2026-10-07', output_result: 'Edited report', notes: 'Edited notes', owner_id: finance.id, weekly_task_id: direct.id }), 200);
    assert.equal(edit.title, 'Edited fixture'); assert.equal(edit.time_slot, '11:00-12:00');
    assert.equal(edit.planned_date.slice(0, 10), '2026-10-07'); assert.equal(edit.owner_id, staff.id); assert.equal(edit.weekly_task_id, weekly.id);
    ok(await call(staff, `/daily-tasks/${daily.id}/update-progress`, 'PATCH', { planned_date: '2026-02-30' }), 400);
    const checklist = await prisma.project_control_item.create({ data: { tenant_id: tenantId, company_id: companyId, project_id: project.id, daily_task_id: daily.id, item_type: 'TASK_CHECKLIST', title: 'Checklist', owner_name: '', status: 'COMPLETED', description: '', created_at: new Date(), updated_at: new Date() } });
    const transfer = await prisma.project_task_transfer_request.create({ data: { tenant_id: tenantId, company_id: companyId, daily_task_id: daily.id, requested_by_id: staff.id, target_user_id: finance.id, status: 'PENDING', reason: 'Fixture', review_note: '', created_at: new Date() } });
    const meetingRequest = await RequestService.createRequest({ request_type: 'MEETING', title: `Daily link QA ${suffix}`, is_draft: true, start_at: '2026-10-06T02:00:00Z', end_at: '2026-10-06T03:00:00Z', organizer_user_id: pm.id, notetaker_user_id: staff.id, tagged_users: [{ id: staff.id, name: staff.full_name }] }, pm.id, companyId, tenantId);
    const meeting = await prisma.request_meeting.findUniqueOrThrow({ where: { request_id: meetingRequest.id } });
    const minutes = await prisma.request_meeting_minutes.create({ data: { tenant_id: tenantId, company_id: companyId, created_by_id: staff.id, meeting_id: meeting.id, occurrence_date: new Date('2026-10-06'), prepared_by_id: staff.id } });
    const actionItem = await prisma.request_meeting_action_item.create({ data: { tenant_id: tenantId, company_id: companyId, created_by_id: staff.id, meeting_id: meeting.id, minutes_id: minutes.id, title: 'Linked action remains', project_id: project.id, daily_task_id: daily.id } });
    ok(await call(staff, `/daily-tasks/${daily.id}/`, 'DELETE'), 204);
    assert.equal(await prisma.project_daily_task.findUnique({ where: { id: daily.id } }), null);
    assert.equal(await prisma.project_control_item.findUnique({ where: { id: checklist.id } }), null);
    assert.equal(await prisma.project_task_transfer_request.findUnique({ where: { id: transfer.id } }), null);
    const keptAction = await prisma.request_meeting_action_item.findUniqueOrThrow({ where: { id: actionItem.id } });
    assert.equal(keptAction.daily_task_id, null); assert.equal(keptAction.status, actionItem.status); assert.equal(keptAction.title, actionItem.title);
    assert.deepEqual(await prisma.request_meeting.findUniqueOrThrow({ where: { id: meeting.id } }), meeting, 'Deleting Daily preserves the meeting');
    assert.deepEqual(await prisma.request_meeting_minutes.findUniqueOrThrow({ where: { id: minutes.id } }), minutes, 'Deleting Daily preserves minutes');
    assert.equal(Number((await prisma.project_weekly_task.findUniqueOrThrow({ where: { id: weekly.id } })).progress), 0);
    assert(await prisma.project_project.findUnique({ where: { id: project.id } }));
    assert(await prisma.project_main_task.findUnique({ where: { id: main.id } }));
    console.log('PASS: real HTTP/QA database — Staff, Supervisor, Finance submissions; scoped PM approve/reject; pending gates; immutable ownership; owner edit/delete; cleanup and progress rollup.');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

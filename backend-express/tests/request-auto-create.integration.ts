import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/utils/jwt';

async function main() {
  const database = new URL(env.DATABASE_URL);
  assert.equal(database.hostname, '127.0.0.1', 'Use isolated local QA only');
  assert.equal(database.port, '55440');
  assert.equal(database.pathname, '/marka_qa_20261005');
  assert.equal(env.NODE_ENV, 'test');
  const pm = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'pm.lead@arsalynk.id' } });
  const staff = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'staff.dev@arsalynk.id' } });
  const director = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'director@arsalynk.id' } });
  const finance = await prisma.iam_user.findUniqueOrThrow({ where: { email: 'finance.lead@arsalynk.id' } });
  const membership = await prisma.iam_user_company_membership.findUniqueOrThrow({ where: { user_id: pm.id } });
  const companyId = membership.company_id;
  const suffix = randomUUID();
  const staffRole = await prisma.iam_role.findUniqueOrThrow({ where: { id: staff.active_role_id! } });
  const omRole = await prisma.iam_role.findFirst({ where: { role_code: 'OPERATIONAL_MANAGER', tenant_id: staff.tenant_id } })
    ?? await prisma.iam_role.create({ data: { ...staffRole, id: randomUUID(), role_code: 'OPERATIONAL_MANAGER', role_name: `QA OM ${suffix}` } });
  // Provision an OM in the QA company only; the seed has no active OM there.
  const om = await prisma.iam_user.create({ data: { ...staff, id: randomUUID(), username: `om-${suffix}`,
    email: `om-${suffix}@qa.invalid`, active_role_id: omRole.id } });
  await prisma.iam_user_company_membership.create({ data: { user_id: om.id, tenant_id: membership.tenant_id, company_id: companyId } });
  await prisma.iam_user_role.create({ data: { user_id: om.id, role_id: omRole.id, tenant_id: membership.tenant_id, company_id: companyId } });
  await prisma.iam_company_module_access.upsert({
    where: { company_id_module_code: { company_id: companyId, module_code: 'REQUESTS' } },
    create: { tenant_id: membership.tenant_id, company_id: companyId, module_code: 'REQUESTS', enabled: true, allow_read: true, allow_write: true },
    update: { enabled: true, allow_read: true, allow_write: true },
  });
  const app = createApp(); app.locals.databaseReady = true;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1/requests`;
  const call = async (actor: typeof pm, path: string, method = 'GET', body?: unknown, company = companyId) => {
    const token = signAccessToken({ userId: actor.id, email: actor.email, full_name: actor.full_name, tenant_id: actor.tenant_id!, roles: [] });
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      'X-Company-ID': company, 'Idempotency-Key': randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text(); return { status: response.status, data: text ? JSON.parse(text) : null, text };
  };
  const ok = (response: Awaited<ReturnType<typeof call>>, status: number) => {
    assert.equal(response.status, status, response.text); return response.data?.data ?? response.data;
  };
  const meetingBody = { request_type: 'MEETING', title: `Automatic meeting ${suffix}`, start_at: '2026-10-06T02:00:00Z', end_at: '2026-10-06T03:00:00Z',
    organizer_user_id: staff.id, notetaker_user_id: staff.id, tagged_users: [{ id: staff.id, name: staff.full_name }], agenda_items: [{ title: 'QA agenda' }] };
  try {
    const tickets: any[] = [];
    for (const type of ['OTHER', 'LEAVE', 'FUND_REQUEST', 'MEETING']) {
      const ticket = ok(await call(staff, '/', 'POST', type === 'MEETING' ? meetingBody : {
        request_type: type, title: `Automatic ${type} ${suffix}`, ...(type === 'FUND_REQUEST' ? { amount: 10000 } : {}),
      }), 201);
      tickets.push(ticket);
      assert.equal(ticket.status, 'REGISTERED');
      assert.equal((await prisma.request_ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status, 'REGISTERED');
      const workflow = await prisma.core_workflow_instance.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(workflow.current_state, 'REGISTERED'); assert.equal(workflow.status, 'COMPLETED');
      assert.equal(await prisma.core_workflow_approval.count({ where: { workflow_instance_id: ticket.id } }), 0);
      assert.equal(await prisma.core_app_notification.count({ where: { company_id: companyId, category: 'EXECUTIVE_APPROVAL',
        target_url: `/dashboard?tab=requests&id=${ticket.id}` } }), 0);
    }
    const meeting = await prisma.request_meeting.findUniqueOrThrow({ where: { request_id: tickets[3].id } });
    assert.equal(meeting.status, 'SCHEDULED');
    const pmView = ok(await call(pm, `/meetings/${meeting.id}`), 200);
    assert.equal(pmView.permissions.can_delete, true);
    assert.equal(pmView.permissions.can_edit_minutes, false, 'Deletion permission must not grant PM editing someone else\'s minutes');
    assert(ok(await call(pm, '/meetings'), 200).some((row: any) => row.id === meeting.id));
    assert(ok(await call(pm, '/?page_size=100'), 200).rows.some((row: any) => row.id === tickets[3].id));
    assert.equal(ok(await call(staff, `/meetings/${meeting.id}`), 200).permissions.can_delete, false);
    ok(await call(pm, `/${tickets[0].id}/approve-exec`, 'POST', { decision: 'APPROVE' }), 400);
    ok(await call(om, `/${tickets[0].id}/validate-om`, 'POST', { decision: 'APPROVE' }), 400);
    assert.equal((await prisma.request_ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).status, 'REGISTERED');

    const draft = ok(await call(staff, '/meetings', 'POST', { ...meetingBody, title: `Optional draft ${suffix}`, is_draft: true }), 201);
    const draftMeeting = await prisma.request_meeting.findUniqueOrThrow({ where: { request_id: draft.id } });
    assert.equal(draft.status, 'DRAFT');
    const published = ok(await call(staff, `/meetings/${draftMeeting.id}/submit`, 'POST', {}), 200);
    assert.equal(published.status, 'SCHEDULED'); assert.equal(published.request.status, 'REGISTERED');
    assert.equal((await prisma.core_workflow_instance.findUniqueOrThrow({ where: { id: draft.id } })).current_state, 'REGISTERED');
    ok(await call(staff, `/meetings/${draftMeeting.id}/submit`, 'POST', {}), 400);

    const otherCompanyId = randomUUID();
    const unrelated = await prisma.core_workflow_instance.create({ data: { company_id: otherCompanyId, workflow_code: 'INTERNAL_OTHER',
      current_state: 'PENDING_OM', status: 'IN_PROGRESS' } });
    for (const state of ['PENDING_OM', 'PENDING_EXEC', 'RE_CHECKING']) {
      await prisma.$transaction([
        prisma.core_workflow_instance.update({ where: { id: draft.id }, data: { current_state: state, status: 'IN_PROGRESS' } }),
        prisma.request_ticket.update({ where: { id: draft.id }, data: { status: state } }),
      ]);
      assert.equal(ok(await call(staff, `/meetings/${draftMeeting.id}`), 200).request.status, 'REGISTERED');
      assert.equal((await prisma.request_ticket.findUniqueOrThrow({ where: { id: draft.id } })).status, 'REGISTERED');
      assert.equal((await prisma.core_workflow_instance.findUniqueOrThrow({ where: { id: draft.id } })).current_state, 'REGISTERED');
      assert.equal((await prisma.core_workflow_instance.findUniqueOrThrow({ where: { id: unrelated.id } })).current_state, 'PENDING_OM');
    }

    const notes = ok(await call(staff, `/meetings/${meeting.id}/minutes`, 'PUT', { occurrence_date: '2026-10-06', summary: 'Saved notes',
      decisions: [{ text: 'Keep decision history' }], action_items: [{ title: 'Keep task relationship' }] }), 200);
    const minutesBefore = await prisma.request_meeting_minutes.findUniqueOrThrow({ where: { id: notes.minutes.id } });
    const taskScope = { tenant_id: membership.tenant_id, company_id: companyId, created_by_id: staff.id };
    const now = new Date();
    const project = await prisma.project_project.create({ data: { ...taskScope, project_code: `QA-${suffix}`, project_name: 'Meeting link QA',
      customer_name: 'QA', manager_name: pm.full_name, description: '', status: 'IN_PROGRESS', lifecycle_status: 'STARTED', health_status: 'HEALTHY', source_type: 'MANUAL' } });
    const mainTask = await prisma.project_main_task.create({ data: { ...taskScope, project_id: project.id, name: 'Link QA', description: '',
      priority: 'MEDIUM', weight: 100, progress: 0, status: 'PLANNED', is_progress_overridden: false, override_reason: '', created_at: now, updated_at: now } });
    const weekly = await prisma.project_weekly_task.create({ data: { ...taskScope, main_task_id: mainTask.id, assignee_id: staff.id, week_number: 40,
      target_description: 'Link QA', progress: 0, status: 'PLANNED', is_progress_overridden: false, override_reason: '', created_at: now, updated_at: now } });
    const daily = await prisma.project_daily_task.create({ data: { ...taskScope, weekly_task_id: weekly.id, owner_id: staff.id, title: 'Linked Daily QA',
      description: '', time_slot: '09:00-10:00', output_result: '', notes: '', progress: 0, status: 'IN_PROGRESS', is_blocked: false,
      block_reason: '', created_at: now, updated_at: now } });
    await prisma.request_meeting_action_item.update({ where: { id: notes.minutes.action_items[0].id }, data: { daily_task_id: daily.id } });
    const actionBefore = await prisma.request_meeting_action_item.findUniqueOrThrow({ where: { id: notes.minutes.action_items[0].id } });
    for (const actor of [staff, om, finance]) ok(await call(actor, `/meetings/${meeting.id}`, 'DELETE'), 403);
    ok(await call(pm, `/meetings/${meeting.id}`, 'DELETE', undefined, otherCompanyId), 403);
    ok(await call(pm, `/meetings/${meeting.id}`, 'DELETE'), 204);
    assert.equal((await prisma.request_ticket.findUniqueOrThrow({ where: { id: tickets[3].id } })).status, 'CANCELLED');
    assert((await prisma.request_ticket.findUniqueOrThrow({ where: { id: tickets[3].id } })).cancelled_at);
    assert(!ok(await call(pm, '/meetings'), 200).some((row: any) => row.id === meeting.id));
    assert(!ok(await call(staff, '/?page_size=100'), 200).rows.some((row: any) => row.id === tickets[3].id));
    ok(await call(pm, `/meetings/${meeting.id}`), 404);
    ok(await call(pm, `/meetings/${meeting.id}`, 'DELETE'), 404);
    assert.deepEqual(await prisma.request_meeting_minutes.findUniqueOrThrow({ where: { id: minutesBefore.id } }), minutesBefore);
    assert.deepEqual(await prisma.request_meeting_action_item.findUniqueOrThrow({ where: { id: actionBefore.id } }), actionBefore);
    assert.deepEqual(await prisma.project_daily_task.findUniqueOrThrow({ where: { id: daily.id } }), daily);
    assert(await prisma.project_weekly_task.findUnique({ where: { id: weekly.id } }));
    assert(await prisma.project_main_task.findUnique({ where: { id: mainTask.id } }));
    assert(await prisma.project_project.findUnique({ where: { id: project.id } }));
    assert(await prisma.core_audit_event.findFirst({ where: { entity_id: tickets[3].id, company_id: companyId, event_type: 'DELETE_MEETING_REQUEST', user_id: pm.id } }));
    ok(await call(director, `/${draft.id}`, 'DELETE'), 204);
    ok(await call(director, `/${tickets[0].id}`, 'DELETE'), 404);
    assert.equal((await prisma.request_ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).status, 'REGISTERED');
    console.log('PASS: automatic requests, no OM/PM approval, company-scoped legacy activation, optional draft publication, PM/Executive meeting deletion, denied Staff/OM/Finance deletion, and intact minutes/Daily relationships.');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

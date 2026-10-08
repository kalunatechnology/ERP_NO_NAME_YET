import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import * as auth from '../src/middlewares/auth.middleware';
import { RoleCode } from '../src/types/roles';
import { NotificationMaintenanceService, jakartaDayWindow, notificationCutoff } from '../src/modules/core/notification-maintenance.service';

async function main() {
  const db = prisma as any;
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = db[model.name[0].toLowerCase() + model.name.slice(1)];
    for (const method of ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy', 'create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
      delegate[method] = async () => { throw new Error(`Unexpected persistence call ${model.name}.${method}`); };
    }
  }
  db.$connect = async () => { throw new Error('Must not connect to ERP data'); };
  const company = 'company-a', tenant = 'tenant-a';
  const users: Record<string, any> = Object.fromEntries([
    ['pm', RoleCode.PROJECT_MANAGER], ['spv', RoleCode.SUPERVISOR], ['staff', RoleCode.STAFF], ['outsider', RoleCode.SUPERVISOR],
  ].map(([id, role]) => [id, { id, full_name: `${id} QA`, roles: [role, RoleCode.STAFF], active_role_code: role, tenant_id: tenant, company_id: company, accessible_company_ids: [company], enabled_modules: ['PROJECTS'], delegated_modules: [], module_access: [], is_superuser: false, is_active: true, status: 'ACTIVE' }]));
  const projects = [
    { id: 'project-a', company_id: company, tenant_id: tenant, created_by_id: 'pm', project_name: 'Shared project', budget_amount: 'private', progress_percent: 0 },
    { id: 'project-b', company_id: company, tenant_id: tenant, created_by_id: 'other-pm', project_name: 'Unassigned project' },
    { id: 'project-c', company_id: 'company-b', tenant_id: 'tenant-b', created_by_id: 'pm', project_name: 'Other company' },
  ];
  const mains = projects.map(project => ({ id: `main-${project.id}`, project_id: project.id, company_id: project.company_id, tenant_id: project.tenant_id, name: `Main ${project.id}`, weight: 100, progress: 0, status: 'PLANNED', is_progress_overridden: false }));
  const assignments = [{ id: 'assign-spv', company_id: company, tenant_id: tenant, main_task_id: 'main-project-a', assignee_id: 'spv' }];
  const weeklies = ['approve', 'reject', 'own', 'outside', 'foreign'].map(id => ({ id, main_task_id: id === 'outside' ? 'main-project-b' : id === 'foreign' ? 'main-project-c' : 'main-project-a', company_id: id === 'foreign' ? 'company-b' : company, tenant_id: id === 'foreign' ? 'tenant-b' : tenant, created_by_id: id === 'own' ? 'spv' : 'staff', assignee_id: 'staff', target_description: `Weekly ${id}`, week_number: 1, status: 'PENDING_APPROVAL', progress: 0, is_progress_overridden: false, created_at: new Date() }));
  const matches = (row: any, where: any): boolean => !where || Object.entries(where).every(([key, value]: any) => {
    if (key === 'AND') return value.every((condition: any) => matches(row, condition));
    if (key === 'OR') return value.some((condition: any) => matches(row, condition));
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    if (value && typeof value === 'object' && 'notIn' in value) return !value.notIn.includes(row[key]);
    if (value instanceof Date) return new Date(row[key]).getTime() === value.getTime();
    if (value && typeof value === 'object' && ['gt', 'gte', 'lt', 'lte'].some(op => op in value)) {
      const comparable = (item: any) => key === 'created_at' ? new Date(item).getTime() : item;
      const actual = comparable(row[key]);
      return Object.entries(value).every(([op, expected]) => op === 'gt' ? actual > comparable(expected) : op === 'gte' ? actual >= comparable(expected) : op === 'lt' ? actual < comparable(expected) : actual <= comparable(expected));
    }
    return value === undefined || row[key] === value;
  });
  const project = (row: any, select: any) => row && select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : row;
  const read = (rows: any[]) => ({ where, select, orderBy, take }: any) => {
    const sorted = rows.filter(row => matches(row, where));
    if (orderBy) sorted.sort((a, b) => {
      for (const item of Array.isArray(orderBy) ? orderBy : [orderBy]) for (const [key, direction] of Object.entries(item)) {
        const av = key === 'created_at' ? new Date(a[key]).getTime() : a[key], bv = key === 'created_at' ? new Date(b[key]).getTime() : b[key];
        if (av !== bv) return (av < bv ? -1 : 1) * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
    return sorted.slice(0, take ?? sorted.length).map(row => project(row, select));
  };
  for (const [name, rows] of [['project_project', projects], ['project_main_task', mains], ['project_weekly_task', weeklies], ['project_task_assignment', assignments]] as const) {
    db[name].findMany = async (input: any) => read(rows)(input);
    db[name].findFirst = async (input: any) => read(rows)(input)[0] ?? null;
    db[name].update = async ({ where, data }: any) => Object.assign(rows.find(row => row.id === where.id)!, data);
    db[name].updateMany = async ({ where, data }: any) => { const selected = rows.filter(row => matches(row, where)); selected.forEach(row => Object.assign(row, data)); return { count: selected.length }; };
  }
  db.project_member.findMany = async () => [];
  db.project_member.findFirst = async () => null; // SPV has no Acting PM grant.
  db.project_daily_task.findMany = async () => [];
  db.iam_user.findMany = async (input: any) => read(Object.values(users))(input);
  db.iam_user.findFirst = async (input: any) => read(Object.values(users))(input)[0] ?? null;
  const roleRows = [RoleCode.SUPERVISOR, RoleCode.STAFF, RoleCode.PROJECT_MANAGER].map(role => ({ id: `role-${role}`, tenant_id: tenant, company_id: null, role_code: role }));
  const userRoles = Object.values(users).flatMap(user => [...new Set(user.roles)].map(role => ({ user_id: user.id, company_id: company, tenant_id: tenant, role_id: `role-${role}` })));
  db.iam_role.findMany = async (input: any) => read(roleRows)(input);
  db.iam_role.findFirst = async (input: any) => read(roleRows)(input)[0] ?? null;
  db.iam_user_role.findMany = async (input: any) => read(userRoles)(input);
  db.project_task_assignment.findFirst = async (input: any) => read(assignments)(input)[0] ?? null;
  db.project_weekly_task.create = async ({ data }: any) => { const row = { ...data, id: data.id || randomUUID() }; weeklies.push(row); return row; };
  db.iam_company_module_access.findUnique = async () => ({ enabled: true, allow_read: true, allow_write: true });
  db.iam_user_module_access.findUnique = async () => null;
  db.iam_user_company_membership.findFirst = async () => ({ id: 'member-a', tenant_id: tenant });
  const membershipRows = Object.values(users).map(user => ({ id: `member-${user.id}`, user_id: user.id, tenant_id: tenant, company_id: company, status: 'ACTIVE' }));
  db.iam_user_company_membership.findMany = async (input: any) => read(membershipRows)(input);
  db.core_idempotency_key.create = async ({ data }: any) => ({ id: randomUUID(), ...data });
  db.core_idempotency_key.update = async () => ({});
  db.core_audit_event.create = async () => ({});
  const logs: any[] = [];
  const notifications: any[] = [];
  let notificationFailure = false;
  db.core_app_notification.createMany = async ({ data, skipDuplicates }: any) => {
    assert.equal(skipDuplicates, true);
    if (notificationFailure) throw new Error('Fixture notification failure');
    let count = 0;
    for (const row of data) if (!notifications.some(existing => existing.id === row.id)) { notifications.push(row); count++; }
    return { count };
  };
  db.core_app_notification.findMany = async (input: any) => read(notifications)(input);
  db.core_app_notification.findFirst = async (input: any) => read(notifications)(input)[0] ?? null;
  db.core_app_notification.count = async (input: any) => read(notifications)(input).length;
  db.core_app_notification.deleteMany = async ({ where }: any) => { const removed = notifications.filter(row => matches(row, where)); for (const row of removed) notifications.splice(notifications.indexOf(row), 1); return { count: removed.length }; };
  db.core_activity_feed.findMany = async () => [];
  db.project_task_activity_log.create = async ({ data }: any) => { logs.push(data); return data; };
  db.project_task_activity_log.findMany = async (input: any) => read(logs)(input);
  db.$transaction = async (callback: any) => {
    const arrays = [projects, mains, weeklies, logs, notifications];
    const snapshots = arrays.map(rows => JSON.parse(JSON.stringify(rows)));
    try { return await callback(db); }
    catch (error) { arrays.forEach((rows, index) => rows.splice(0, rows.length, ...snapshots[index])); throw error; }
  };
  (auth as any).authenticate = (req: Request, _res: Response, next: NextFunction) => { req.user = users[String(req.headers['x-actor'] ?? 'spv')]; next(); };
  (env as any).NODE_ENV = 'test';
  const app = require('../src/app').createApp(); app.locals.databaseReady = true;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/projects`;
  const get = (path: string, actor = 'spv') => fetch(base + path, { headers: { 'x-actor': actor } });
  const review = (id: string, decision: string, actor = 'spv') => fetch(`${base}/weekly-tasks/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-actor': actor, 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ decision }) });
  try {
    const workspaceResponse = await get('/weekly-tasks/review-workspace');
    assert.equal(workspaceResponse.status, 200, await workspaceResponse.clone().text());
    const workspace = await workspaceResponse.json() as any;
    assert.deepEqual(workspace.projects.map((row: any) => row.id), ['project-a']);
    assert.deepEqual(workspace.weeklyTasks.map((row: any) => row.id).sort(), ['approve', 'own', 'reject']);
    assert(!('budget_amount' in workspace.projects[0])); assert.deepEqual(workspace.fundings, []);
    const authorityResponse = await get('/projects/project-a/authority');
    assert.equal(authorityResponse.status, 200, await authorityResponse.clone().text());
    const authority = await authorityResponse.json() as any;
    assert.equal(authority.can_review_weekly_tasks, true); assert.equal(authority.can_manage_project, false); assert.equal(authority.can_manage_weekly_tasks, false); assert.equal(authority.can_view_financials, false);
    assert.equal((await review('approve', 'APPROVE', 'staff')).status, 403);
    assert.equal((await review('approve', 'APPROVE', 'outsider')).status, 403);
    assert.equal((await review('outside', 'APPROVE')).status, 403);
    assert.equal((await review('foreign', 'APPROVE')).status, 404);
    assert.equal((await review('own', 'APPROVE')).status, 403);
    assert.equal((await review('approve', 'INVALID')).status, 400);
    const approved = await review('approve', 'APPROVE'); assert.equal(approved.status, 200, await approved.clone().text());
    assert.equal((await approved.json() as any).status, 'PLANNED');
    assert.deepEqual(notifications.map(row => row.recipient_id).sort(), ['pm', 'staff']);
    assert(notifications.every(row => row.category === 'WEEKLY_TARGET_APPROVED' && row.target_url === '/projects?project=project-a&tab=TREE&weekly=approve' && row.is_read === false));
    const pmWorkspace = await (await get('/weekly-tasks/review-workspace', 'pm')).json() as any;
    assert.equal(pmWorkspace.weeklyTasks.find((row: any) => row.id === 'approve').status, 'PLANNED', 'PM sees the same SPV decision');
    assert.equal((await review('approve', 'REJECT', 'pm')).status, 409, 'Second reviewer cannot overwrite a decision');
    assert.equal(notifications.length, 2, 'A repeated/conflicting decision must not send notifications');
    const rejected = await review('reject', 'REJECT', 'pm'); assert.equal(rejected.status, 200, await rejected.clone().text());
    const spvWorkspace = await (await get('/weekly-tasks/review-workspace')).json() as any;
    assert.equal(spvWorkspace.weeklyTasks.find((row: any) => row.id === 'reject').status, 'REJECTED', 'SPV sees the same PM decision');
    assert.deepEqual(notifications.filter(row => row.category === 'WEEKLY_TARGET_REJECTED').map(row => row.recipient_id).sort(), ['spv', 'staff']);
    assert.deepEqual(logs.map(log => [log.actor_id, log.action]), [['spv', 'WEEKLY_APPROVED'], ['pm', 'WEEKLY_REJECTED']]);
    users.spv.module_access = [{ module_code: 'PROJECTS', allow_read: true, allow_write: false }];
    assert.equal((await review('own', 'REJECT')).status, 403);
    users.spv.module_access = [];
    const create = (body: any, bulk = false, actor = 'spv') => fetch(`${base}/weekly-tasks/${bulk ? 'bulk-create' : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-actor': actor, 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) });
    const payload = { main_task: 'main-project-a', assignee: 'spv', target_description: 'SPV proposal', week_number: 2, start_date: '2026-10-05', end_date: '2026-10-11' };
    const created = await create(payload); assert.equal(created.status, 201, await created.clone().text());
    const createdRow = await created.json() as any; assert.equal(createdRow.status, 'PENDING_APPROVAL');
    const createdNotices = notifications.filter(row => row.target_url.endsWith(`weekly=${createdRow.id}`));
    assert.deepEqual(createdNotices.map(row => row.recipient_id), ['pm']); assert.equal(createdNotices[0].category, 'WEEKLY_TARGET_CREATED');
    assert.match(createdNotices[0].description, /spv QA mengajukan/);
    const decision = await review(createdRow.id, 'APPROVE', 'pm'); assert.equal(decision.status, 200, await decision.clone().text());
    assert(notifications.some(row => row.recipient_id === 'spv' && row.category === 'WEEKLY_TARGET_APPROVED' && row.target_url.endsWith(`weekly=${createdRow.id}`)));
    const before = notifications.length;
    notificationFailure = true;
    const failedDecision = await review('own', 'REJECT', 'pm'); assert.equal(failedDecision.status, 500);
    assert.equal(weeklies.find(row => row.id === 'own')!.status, 'PENDING_APPROVAL'); assert.equal(notifications.length, before);
    const beforeWeeklyCount = weeklies.length;
    assert.equal((await create({ ...payload, week_number: 3 })).status, 500);
    assert.equal(weeklies.length, beforeWeeklyCount, 'Creation rolls back if its notification cannot be saved');
    notificationFailure = false;
    const bulk = await create([{ ...payload, week_number: 4 }, { ...payload, week_number: 5 }], true, 'pm');
    assert.equal(bulk.status, 201, await bulk.clone().text());
    assert.equal(notifications.length, before + 2, 'Bulk submissions also emit notifications in the create transaction');
    assert(!notifications.some(row => row.recipient_id === 'outsider' || row.company_id !== company));
    for (const actor of ['pm', 'spv', 'outsider']) {
      const feedResponse = await fetch(base.replace('/projects', '/core/sidebar-feed'), { headers: { 'x-actor': actor } });
      assert.equal(feedResponse.status, 200, await feedResponse.clone().text());
      const feed = await feedResponse.json() as any;
      assert.deepEqual(feed.notifications.map((row: any) => row.id).sort(), notifications.filter(row => row.recipient_id === actor).map(row => row.id).sort());
      assert(feed.notifications.every((row: any) => row.target_url.includes('&weekly=') && row.company_id === company));
    }
    const now = new Date();
    assert.equal(jakartaDayWindow(new Date('2026-10-08T00:30:00+07:00')).start.toISOString(), '2026-10-07T17:00:00.000Z');
    assert.throws(() => jakartaDayWindow(now, '2026-02-30'));
    assert.throws(() => jakartaDayWindow(now, '2000-01-01'));
    notifications[0].is_read = true;
    const preserved = JSON.stringify(notifications[0]);
    const missing = notifications.find(row => row.category === 'WEEKLY_TARGET_REJECTED' && row.recipient_id === 'spv');
    notifications.splice(notifications.indexOf(missing), 1);
    const sizeBefore = notifications.length;
    const preview = await NotificationMaintenanceService.backfillWeeklyDay(db, { now, companyId: company, dryRun: true });
    assert(preview.inserted >= 1); assert.equal(notifications.length, sizeBefore, 'Dry run never writes');
    const backfill = await NotificationMaintenanceService.backfillWeeklyDay(db, { now, companyId: company });
    assert.equal(backfill.inserted, preview.inserted); assert.equal(JSON.stringify(notifications.find(row => row.id === JSON.parse(preserved).id)), preserved, 'Backfill preserves existing read state and timestamps');
    assert.equal((await NotificationMaintenanceService.backfillWeeklyDay(db, { now, companyId: company })).inserted, 0, 'Repeated backfill does not duplicate events');
    const recovered = notifications.find(row => row.id === missing.id)!;
    assert.equal(new Date(recovered.created_at).getTime(), new Date(logs.find(row => row.action === 'WEEKLY_REJECTED').created_at).getTime(), 'Historical notifications retain the real event timestamp');
    const weeklySnapshot = JSON.stringify(weeklies), logSnapshot = JSON.stringify(logs);
    const cutoff = notificationCutoff(now);
    for (const [id, timestamp, recipient, scopeCompany] of [['expired-read', new Date(cutoff.getTime() - 1), 'pm', company], ['expired-unread', cutoff, 'pm', company], ['retained', new Date(now.getTime() - 3600000), 'pm', company], ['other-company-old', cutoff, 'outsider', 'company-b']] as const) {
      notifications.push({ id, company_id: scopeCompany, recipient_id: recipient, created_at: timestamp, is_read: id === 'expired-read', target_url: '/projects', title: id });
    }
    assert.equal(await NotificationMaintenanceService.cleanup(db, now, company, true), 2);
    assert(notifications.some(row => row.id === 'expired-read'));
    assert.equal(await NotificationMaintenanceService.cleanup(db, now, company), 2);
    assert(notifications.some(row => row.id === 'retained')); assert(notifications.some(row => row.id === 'other-company-old'));
    assert.equal(await NotificationMaintenanceService.cleanup(db, now), 1);
    assert.equal(JSON.stringify(weeklies), weeklySnapshot); assert.equal(JSON.stringify(logs), logSnapshot, 'Cleanup only deletes notifications');
    for (let index = 0; index < 60; index++) notifications.push({ id: `page-${String(index).padStart(3, '0')}`, company_id: company, recipient_id: 'pm', created_at: now, target_url: '/projects', title: 'History notice' });
    const history = (cursor?: string, actor = 'pm') => fetch(base.replace('/projects', '/core/app-notifications') + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''), { headers: { 'x-actor': actor } });
    const firstResponse = await history(); assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
    const first = await firstResponse.json() as any; assert.equal(first.results.length, 50); assert(first.next_cursor);
    const secondResponse = await history(first.next_cursor); assert.equal(secondResponse.status, 200, await secondResponse.clone().text());
    const second = await secondResponse.json() as any; assert.equal(second.next_cursor, null);
    const ids = [...first.results, ...second.results].map((row: any) => row.id);
    assert.equal(new Set(ids).size, ids.length); assert.equal(ids.length, notifications.filter(row => row.recipient_id === 'pm').length);
    assert.equal((await history(first.next_cursor, 'spv')).status, 400, 'Another recipient cannot reuse a cursor');
    assert(first.results.every((row: any) => row.recipient_id === 'pm' && row.company_id === company));
    const afterMidnight = new Date('2026-10-09T00:30:00+07:00');
    const beforeMidnight = new Date('2026-10-08T23:30:00+07:00');
    weeklies.push({ ...weeklies[0], id: 'missed-before-midnight', created_by_id: 'spv', assignee_id: 'spv', created_at: beforeMidnight, status: 'PLANNED' });
    weeklies.push({ ...weeklies[0], id: 'old-reviewed-recently', created_at: new Date('2026-09-01T00:00:00+07:00'), status: 'PLANNED' });
    weeklies.push({ ...weeklies[0], id: 'expired-event', created_at: new Date('2026-09-01T00:00:00+07:00') });
    weeklies.push({ ...weeklies[0], id: 'status-without-evidence', created_at: beforeMidnight, status: 'REJECTED' });
    for (const id of ['missed-before-midnight', 'old-reviewed-recently', 'deleted-target']) logs.push({ tenant_id: tenant, company_id: company, task_id: id, task_level: 'WEEKLY', actor_id: 'pm', action: 'WEEKLY_APPROVED', task_title: `Historic approval ${id}`, created_at: new Date('2026-10-08T23:50:00+07:00') });
    const syncPreview = await NotificationMaintenanceService.reconcileWeeklyNotifications(db, { now: afterMidnight, companyId: company, dryRun: true });
    const sync = await NotificationMaintenanceService.reconcileWeeklyNotifications(db, { now: afterMidnight, companyId: company });
    assert.equal(sync.inserted, syncPreview.inserted); assert(sync.skipped >= 1);
    const forWeekly = (id: string) => notifications.filter(row => row.target_url?.endsWith(`weekly=${id}`));
    assert.deepEqual(forWeekly('missed-before-midnight').map(row => row.category).sort(), ['WEEKLY_TARGET_APPROVED', 'WEEKLY_TARGET_CREATED']);
    assert.equal(new Date(forWeekly('missed-before-midnight').find(row => row.category === 'WEEKLY_TARGET_CREATED').created_at).getTime(), beforeMidnight.getTime());
    assert(forWeekly('old-reviewed-recently').length > 0); assert(forWeekly('old-reviewed-recently').every(row => row.category === 'WEEKLY_TARGET_APPROVED'), 'A recent decision on an old target is recovered without reviving its expired creation');
    assert.equal(forWeekly('expired-event').length, 0); assert.equal(forWeekly('deleted-target').length, 0);
    assert(forWeekly('status-without-evidence').every(row => row.category === 'WEEKLY_TARGET_CREATED'), 'A status without an audit event cannot fabricate an approval/rejection notice');
    assert.equal((await NotificationMaintenanceService.reconcileWeeklyNotifications(db, { now: afterMidnight, companyId: company })).inserted, 0);
    console.log('PASS: weekly notification workflow, rollback, scoped history and 72-hour cleanup; automatic reconciliation recovers pre-midnight events and recent decisions on old targets, preserves timestamps/read state, skips deleted targets and never fabricates status changes or duplicate notifications. Persistence uses fixtures.');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

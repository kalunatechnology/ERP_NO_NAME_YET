import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import prisma from '../src/config/database';
import { env } from '../src/config/env';
import * as auth from '../src/middlewares/auth.middleware';
import { RoleCode } from '../src/types/roles';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { canAccessRoute } from '../../frontend-next/lib/access/module-contract';
import { getNavigationEntries } from '../../frontend-next/lib/access/navigation-contract';

async function main() {
  // Real HTTP routing and authorization, with all persistence replaced by fixtures.
  const db = prisma as any;
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = db[model.name[0].toLowerCase() + model.name.slice(1)];
    for (const method of ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
      delegate[method] = async () => { throw new Error(`Unexpected persistence call: ${model.name}.${method}`); };
    }
  }
  const companyId = 'company-a', tenantId = 'tenant-a', staffId = 'staff-a';
  const project = { id: 'project-a', created_by_id: 'pm-a' };
  const staff = {
    id: staffId, email: 'staff@example.test', full_name: 'Staff fixture',
    roles: [RoleCode.STAFF], active_role_code: RoleCode.STAFF, tenant_id: tenantId,
    company_id: companyId, accessible_company_ids: [companyId],
    enabled_modules: ['PROJECTS'], delegated_modules: [], module_access: [],
    is_superuser: false, is_staff: false, status: 'ACTIVE',
  };
  const bundle = {
    projects: [project], mainTasks: [{ id: 'main-a', project_id: project.id }],
    assignments: [{ id: 'assignment-a', main_task_id: 'main-a', assignee_id: staffId }],
    weeklyTasks: [], dailyTasks: [], tasks: [], milestones: [], stages: [],
    costEntries: [], proposals: [], fundings: [], users: [],
  };
  let personalQueries = 0;
  db.$connect = async () => { throw new Error('Must not connect to live data'); };
  db.$executeRaw = db.$executeRawUnsafe = db.$queryRawUnsafe = async () => { throw new Error('Unexpected raw database call'); };
  db.$queryRaw = async (query: any) => {
    assert(query.strings.join('').includes('staff_main_tasks'), 'Ordinary Staff must use the personal SQL projection');
    assert(query.values.includes(staffId)); assert(query.values.includes(companyId));
    personalQueries++;
    return [{ bundle }];
  };
  db.iam_company_module_access.findUnique = async () => ({ enabled: true, allow_read: true, allow_write: true });
  db.iam_user_module_access.findUnique = async () => null;
  db.core_idempotency_key.create = async ({ data }: any) => ({ id: randomUUID(), ...data });
  db.core_idempotency_key.update = async () => ({});
  db.core_audit_event.create = async () => ({});
  db.project_member.findMany = async () => [];
  db.project_member.findFirst = async () => null;
  db.project_task_assignment.findMany = async () => [{ main_task_id: 'main-a' }];
  db.project_weekly_task.findMany = async () => [];
  db.project_task_assignment.findFirst = async ({ where }: any) => where.main_task_id === 'main-a' && where.assignee_id === staffId ? { id: 'assignment-a' } : null;
  db.project_main_task.findMany = async () => [{ project_id: project.id }];
  db.project_project.findFirst = async ({ where }: any) => {
    assert.equal(where.company_id, companyId);
    const id = where.id ?? where.AND?.[0]?.id;
    if (where.AND) assert(where.AND[1].id.in.includes(project.id));
    return id === project.id ? project : null;
  };
  db.iam_user_company_membership.findFirst = async () => ({ id: 'membership-a', tenant_id: tenantId });
  (auth as any).authenticate = (req: Request, _res: Response, next: NextFunction) => { req.user = staff; next(); };
  (env as any).NODE_ENV = 'test';
  const app = require('../src/app').createApp();
  app.locals.databaseReady = true;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const get = (path: string) => fetch(base + path);
  try {
    const access = { enabledModules: ['PROJECTS'], delegatedModules: [], activeRoleCode: 'ROLE-STAFF' };
    assert.equal(canAccessRoute({ pathname: '/projects', ...access }), true);
    assert(getNavigationEntries(access).some(item => item.href === '/projects'));
    assert.equal(canAccessRoute({ pathname: '/projects', ...access, enabledModules: [] }), false);
    const bootstrap = await get('/dashboard/bootstrap?sections=projects&fresh=1');
    assert.equal(bootstrap.status, 200);
    assert.deepEqual((await bootstrap.json() as any).data.projects.mainTasks, bundle.mainTasks);
    assert.equal(personalQueries, 1);
    const response = await get('/projects/projects/project-a/authority');
    assert.equal(response.status, 200, await response.clone().text());
    const authority = await response.json() as any;
    assert.equal(authority.can_manage_project, false);
    assert.equal(authority.can_manage_weekly_tasks, false);
    assert.equal((await get('/projects/projects/project-a/supervisor')).status, 200);
    assert.equal((await get('/projects/projects/project-b/authority')).status, 403);
    assert.equal((await get('/projects/projects/project-a/hierarchy')).status, 403, 'Full management hierarchy remains restricted');
    assert.equal((await fetch(base + '/projects/projects/project-a/supervisor', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ user_id: staffId }),
    })).status, 403);
    assert.equal(await ProjectsService.weeklyCreationStatus(staff, { id: 'main-a', project_id: project.id }, companyId, staffId, db), 'PENDING_APPROVAL');
    await assert.rejects(() => ProjectsService.weeklyCreationStatus(staff, { id: 'main-a', project_id: project.id }, companyId, 'someone-else', db), /diri sendiri/);
    assert.throws(() => ProjectsService.assertWeeklyTaskActive('PENDING_APPROVAL'), /belum disetujui/);
    // An owned Weekly remains a valid read path when its Main Task assignment is missing.
    db.project_task_assignment.findMany = async () => [];
    db.project_weekly_task.findMany = async () => [{ id: 'weekly-a', main_task_id: 'main-a', assignee_id: staffId }];
    await ProjectsService.assertCanViewProject(staff, project.id, companyId, db);
    console.log('PASS: Ordinary Staff see Project navigation, load assigned data, read authority and submit Pending Weekly without PM rights.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

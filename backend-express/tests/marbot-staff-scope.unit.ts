import assert from 'node:assert/strict';
import { RoleCode } from '@prisma/client';
import prisma from '../src/config/database';
import { buildResourceScope, applyAndValidateWriteScope } from '../src/modules/accounts/resource-scope.service';
import { resourceDefinition, validateResourcePlan } from '../src/modules/marbot/marbot-resource.service';
import type { NativeScope } from '../src/modules/marbot/marbot-native.service';

async function main() {
  const originals: Array<() => void> = [];
  const mock = (model: any, fn: any) => { const old = model.findMany; model.findMany = fn; originals.push(() => { model.findMany = old; }); };
  let revoked = false;
  mock(prisma.project_member, async ({ where }: any) => {
    assert.equal(where.user_id, 'staff'); assert.equal(where.status, 'ACTIVE');
    assert.equal(where.company_id, 'company');
    return revoked ? [] : [{ project_id: 'member-project' }];
  });
  mock(prisma.project_task_assignment, async ({ where }: any) => {
    assert.equal(where.assignee_id, 'staff'); assert.equal(where.company_id, 'company');
    return revoked ? [] : [{ main_task_id: 'assigned-main' }];
  });
  mock(prisma.project_main_task, async ({ where }: any) => {
    if (where.id) return [{ project_id: 'assigned-project' }];
    assert.deepEqual(where.project_id.in, revoked ? [] : ['member-project', 'assigned-project']);
    return revoked ? [] : [{ id: 'main' }];
  });
  mock(prisma.project_project, async ({ where }: any) => {
    assert.equal(where.company_id, 'company'); assert.equal(where.tenant_id, 'tenant');
    const rows = ['member-project', 'assigned-project', 'forbidden-project'];
    return rows.filter(id => where.id.in.includes(id)).map(id => ({ id }));
  });
  mock(prisma.project_weekly_task, async ({ where }: any) => {
    assert.deepEqual(where.main_task_id.in, ['main']); return [{ id: 'weekly' }];
  });
  try {
    for (const role of [RoleCode.STAFF, RoleCode.SUPERVISOR]) {
      const req: any = { companyId: 'company', user: { id: 'staff', tenant_id: 'tenant', roles: [RoleCode.STAFF, role], active_role_code: role } };
      const fields = new Set(['id', 'tenant_id', 'company_id', 'project_id']);
      const scope = await buildResourceScope(req, 'project_task', fields);
      assert.deepEqual(scope.project_id, { in: ['member-project', 'assigned-project'] });
      assert.deepEqual((await buildResourceScope(req, 'project_project', new Set(['id', 'company_id', 'tenant_id']))).id, scope.project_id);
      assert.deepEqual((await buildResourceScope(req, 'project_daily_task', new Set(['id', 'company_id', 'weekly_task_id']))).weekly_task_id, { in: ['weekly'] });
      await assert.rejects(() => applyAndValidateWriteScope(req, 'project_task', fields, { project_id: 'forbidden-project' }));
      assert.equal((await applyAndValidateWriteScope(req, 'project_task', fields, { project_id: 'member-project' })).project_id, 'member-project');
      await assert.rejects(() => applyAndValidateWriteScope(req, 'project_task_dependency', new Set(['id', 'company_id', 'task_id']), { task_id: 'unknown' }));
      revoked = true;
      assert.deepEqual((await buildResourceScope(req, 'project_task', fields)).project_id, { in: [] });
      revoked = false;
    }
    const scope: NativeScope = { userId: 'staff', tenantId: 'tenant', companyId: 'company', roleId: 'role', roleCode: RoleCode.STAFF,
      enabledModules: ['MARBOT', 'PROJECTS'], permissions: ['USE_MARBOT', 'READ_PROJECT', 'READ_TASK'], projectScope: { mode: 'LIST', projectIds: ['member-project'] } };
    assert.throws(() => resourceDefinition('projects.expenses', scope));
    assert(!resourceDefinition('projects.projects', scope).fields.some(field => field.name === 'budget_amount'));
    assert.throws(() => validateResourcePlan({ resource: 'projects.projects', operation: 'aggregate', sum: 'budget_amount' }, scope));
    assert.throws(() => validateResourcePlan({ resource: 'projects.tasks', operation: 'list', filters: { company_id: 'other' } }, scope));
    assert.throws(() => resourceDefinition('projects.tasks', { ...scope, permissions: ['USE_MARBOT'] }));
    assert.throws(() => resourceDefinition('projects.tasks', { ...scope, blockedReadModules: ['PROJECTS'] }));
    assert(resourceDefinition('projects.expenses', { ...scope, enabledModules: [...scope.enabledModules, 'FINANCE'], permissions: [...scope.permissions, 'READ_PROJECT_FINANCE'] }));
    console.log('Staff/Supervisor scope passed: membership, assignments, project ancestry, cross-project writes, revoked access, finance fields and permissions.');
  } finally { originals.reverse().forEach(restore => restore()); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

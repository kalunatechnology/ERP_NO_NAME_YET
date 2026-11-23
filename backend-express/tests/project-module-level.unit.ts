import assert from 'node:assert/strict';
import { RoleCode } from '../src/types/roles';
import {
  getUserModuleAccessLevel,
  hasModuleRoleOrLevel,
  hasUserModuleManagerWrite,
  hasUserModuleWrite,
  ModuleAccessLevel,
} from '../src/utils/module-permissions';
import { restrictProjectMutationsByAuthority } from '../src/modules/projects/project-authority.middleware';
import { canAccessRoute, canRequestDashboardSection } from '../../frontend-next/lib/access/module-contract';
import { getNavigationEntries } from '../../frontend-next/lib/access/navigation-contract';

async function main() {
  // 1. Default role = PROJECT_MANAGER without module_assignments -> allowed
  const pmByBaseRole = {
    id: 'user-pm',
    active_role_code: null,
    roles: [RoleCode.PROJECT_MANAGER],
    module_access: [],
    module_assignments: [],
  };
  assert.equal(
    hasModuleRoleOrLevel(
      pmByBaseRole,
      'PROJECTS',
      [RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.COMPANY_ADMIN],
      ModuleAccessLevel.MANAGER,
    ),
    true,
  );

  // 2. Default role = STAFF, Quick Access PROJECTS = Manager (tier_level = 1),
  //    entitlement.middleware cleared module_access = [] & active_role_code = null
  const staffWithManagerLevel = {
    id: 'user-arof',
    active_role_code: null,
    roles: [RoleCode.STAFF],
    module_access: [],
    module_assignments: [
      {
        module_code: 'PROJECTS',
        profile_id: null,
        profile_code: null,
        tier_level: ModuleAccessLevel.MANAGER,
        data_scope: 'ALL',
        status: 'ACTIVE',
        allow_read: true,
        allow_write: true,
      },
    ],
  };
  assert.equal(getUserModuleAccessLevel(staffWithManagerLevel, 'PROJECTS'), ModuleAccessLevel.MANAGER);
  assert.equal(hasUserModuleWrite(staffWithManagerLevel, 'PROJECTS'), true);
  assert.equal(hasUserModuleManagerWrite(staffWithManagerLevel, 'PROJECTS'), true);
  assert.equal(
    hasModuleRoleOrLevel(
      staffWithManagerLevel,
      'PROJECTS',
      [RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.COMPANY_ADMIN],
      ModuleAccessLevel.MANAGER,
    ),
    true,
  );

  // 3. Default role = STAFF, Quick Access PROJECTS = Supervisor (tier_level = 2) -> denied create project
  const staffWithSupervisorLevel = {
    ...staffWithManagerLevel,
    module_assignments: [
      {
        module_code: 'PROJECTS',
        profile_id: null,
        profile_code: null,
        tier_level: ModuleAccessLevel.SUPERVISOR,
        data_scope: 'TEAM',
        status: 'ACTIVE',
        allow_read: true,
        allow_write: true,
      },
    ],
  };
  assert.equal(hasUserModuleManagerWrite(staffWithSupervisorLevel, 'PROJECTS'), false);
  assert.equal(
    hasModuleRoleOrLevel(
      staffWithSupervisorLevel,
      'PROJECTS',
      [RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER, RoleCode.COMPANY_ADMIN],
      ModuleAccessLevel.MANAGER,
    ),
    false,
  );

  // 4. restrictProjectMutationsByAuthority allows POST /projects for tier_level = 1
  let passedError: unknown = null;
  await restrictProjectMutationsByAuthority(
    {
      method: 'POST',
      path: '/projects/',
      companyId: 'company-a',
      user: staffWithManagerLevel,
      moduleAccess: { moduleCode: 'PROJECTS', delegated: false, allowRead: true, allowWrite: true, accessMode: 'ASSIGNMENT' },
    } as any,
    {} as any,
    (err?: unknown) => {
      passedError = err ?? null;
    },
  );
  assert.equal(passedError, null, 'Tier 1 Manager on PROJECTS must pass restrictProjectMutationsByAuthority');

  // 5. restrictProjectMutationsByAuthority still blocks POST /projects for tier_level = 2
  let blockedError: any = null;
  await restrictProjectMutationsByAuthority(
    {
      method: 'POST',
      path: '/projects/',
      companyId: 'company-a',
      user: staffWithSupervisorLevel,
      moduleAccess: { moduleCode: 'PROJECTS', delegated: false, allowRead: true, allowWrite: true, accessMode: 'ASSIGNMENT' },
    } as any,
    {} as any,
    (err?: unknown) => {
      blockedError = err ?? null;
    },
  );
  assert.ok(blockedError, 'Tier 2 Supervisor on PROJECTS must be blocked from POST /projects');

  // 6. Frontend contract: legacy role CRM_LEAD with PROJECTS (Tier 1) + REQUESTS (Tier 2), no CRM
  const arofFrontendAccess = {
    activeRoleCode: 'CRM_LEAD',
    enabledModules: ['PROJECTS', 'REQUESTS', 'CRM', 'REPORTING'],
    moduleAccessModes: [
      { module_code: 'PROJECTS', access_mode: 'ASSIGNMENT' },
      { module_code: 'CRM', access_mode: 'ASSIGNMENT' },
      { module_code: 'REQUESTS', access_mode: 'ASSIGNMENT' },
    ],
    moduleAssignments: [
      { module_code: 'PROJECTS', tier_level: 1, status: 'ACTIVE', allow_read: true, allow_write: true },
      { module_code: 'REQUESTS', tier_level: 2, status: 'ACTIVE', allow_read: true, allow_write: true },
    ],
  };
  assert.equal(canAccessRoute({ pathname: '/projects', ...arofFrontendAccess }), true);
  assert.equal(canAccessRoute({ pathname: '/tasks', ...arofFrontendAccess }), true);
  assert.equal(canAccessRoute({ pathname: '/crm', ...arofFrontendAccess }), false);
  assert.equal(canRequestDashboardSection('projects', arofFrontendAccess), true);
  assert.equal(canRequestDashboardSection('crm', arofFrontendAccess), false);
  const navHrefs = getNavigationEntries(arofFrontendAccess).map((entry) => entry.href);
  assert.ok(navHrefs.includes('/projects'), 'Sidebar must include /projects');
  assert.ok(navHrefs.includes('/tasks'), 'Sidebar must include /tasks');
  assert.ok(navHrefs.includes('/requests'), 'Sidebar must include /requests');
  assert.ok(!navHrefs.includes('/crm'), 'Sidebar must exclude /crm when CRM is not assigned');

  console.log('project-module-level.unit.ts: ALL PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

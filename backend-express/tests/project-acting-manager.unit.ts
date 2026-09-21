import assert from 'node:assert/strict';
import { RoleCode } from '../src/types/roles';
import { ProjectsService } from '../src/modules/projects/projects.service';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';
const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';
const STAFF_ID = 'staff-b';

function user(id: string, role: RoleCode, roles: RoleCode[] = [role]) {
  return { id, active_role_code: role, roles, tenant_id: 'tenant-a' };
}

function fakeDb(options: { actingActive?: boolean; originalPmId?: string } = {}) {
  const actingActive = options.actingActive ?? true;
  const originalPmId = options.originalPmId ?? 'pm-a';
  return {
    project_member: {
      findMany: async ({ where }: any) => {
        if (where.company_id !== COMPANY_A || where.user_id !== STAFF_ID || !actingActive) return [];
        return [{ project_id: PROJECT_A }];
      },
      findFirst: async ({ where }: any) => {
        if (where.company_id !== COMPANY_A || where.project_id !== PROJECT_A || where.user_id !== STAFF_ID || !actingActive) return null;
        return { project_role: 'ACTING_PROJECT_MANAGER' };
      },
    },
    project_project: {
      findMany: async ({ where }: any) => {
        if (where.company_id !== COMPANY_A) return [];
        const membershipIds = where.OR?.flatMap((clause: any) => clause.id?.in ?? []) ?? [];
        const ownsProject = where.OR?.some((clause: any) => clause.project_manager_id === originalPmId);
        return membershipIds.includes(PROJECT_A) || ownsProject ? [{ id: PROJECT_A }] : [];
      },
      findFirst: async ({ where }: any) => {
        const id = where.id ?? where.AND?.[0]?.id;
        if (where.company_id !== COMPANY_A || id !== PROJECT_A) return null;
        return { id: PROJECT_A, project_manager_id: originalPmId };
      },
    },
    project_task_assignment: { findMany: async () => [] },
    project_main_task: { findMany: async () => [] },
  } as any;
}

async function main() {
  const staff = user(STAFF_ID, RoleCode.STAFF);
  const supervisor = user(STAFF_ID, RoleCode.SUPERVISOR);
  const db = fakeDb();

  assert.deepEqual(await ProjectsService.managedProjectIds(staff, COMPANY_A, db), [PROJECT_A]);
  await ProjectsService.assertCanManageProject(staff, PROJECT_A, COMPANY_A, db);
  await assert.rejects(() => ProjectsService.assertCanManageProject(staff, PROJECT_B, COMPANY_A, db));
  await assert.rejects(() => ProjectsService.assertCanManageProject(staff, PROJECT_A, COMPANY_B, db));

  const inactiveDb = fakeDb({ actingActive: false });
  assert.deepEqual(await ProjectsService.managedProjectIds(staff, COMPANY_A, inactiveDb), []);
  await assert.rejects(() => ProjectsService.assertCanManageProject(staff, PROJECT_A, COMPANY_A, inactiveDb));

  const authority = await ProjectsService.getProjectAuthority(staff, PROJECT_A, COMPANY_A, db);
  assert.equal(authority.effective_role, 'ACTING_PROJECT_MANAGER');
  assert.equal(authority.is_acting_project_manager, true);
  assert.equal(authority.can_manage_project, true);
  assert.equal(authority.can_delegate_supervisor, false);
  assert.equal(authority.can_create_project, false);
  assert.equal(authority.can_delete_project, false);

  const ordinaryMemberDb = {
    project_member: {
      findMany: async ({ where }: any) => where.project_role ? [] : [{ project_id: PROJECT_A }],
      findFirst: async () => null,
    },
    project_project: {
      findMany: async () => [],
      findFirst: async ({ where }: any) => {
        const id = where.id ?? where.AND?.[0]?.id;
        return where.company_id === COMPANY_A && id === PROJECT_A
          ? { id: PROJECT_A, project_manager_id: 'pm-a' }
          : null;
      },
    },
    project_task_assignment: { findMany: async () => [] },
    project_main_task: { findMany: async () => [] },
  } as any;
  const ordinaryAuthority = await ProjectsService.getProjectAuthority(staff, PROJECT_A, COMPANY_A, ordinaryMemberDb);
  assert.equal(ordinaryAuthority.can_manage_project, false);
  assert.equal(ordinaryAuthority.can_manage_wbs, false);
  assert.equal(ordinaryAuthority.can_create_project, false);

  await assert.rejects(() => ProjectsService.assertCanDelegateProjectAuthority(staff, PROJECT_A, COMPANY_A, db));
  await assert.rejects(() => ProjectsService.assertCanDelegateProjectAuthority(supervisor, PROJECT_A, COMPANY_A, db));
  await assert.rejects(() => ProjectsService.assertCanDelegateProjectAuthority(
    user('root', RoleCode.SUPER_ADMIN), PROJECT_A, COMPANY_A, db,
  ));

  await ProjectsService.assertCanDelegateProjectAuthority(user('pm-a', RoleCode.PROJECT_MANAGER), PROJECT_A, COMPANY_A, db);
  await ProjectsService.assertCanDelegateProjectAuthority(user('om-a', RoleCode.OPERATIONAL_MANAGER), PROJECT_A, COMPANY_A, db);
  await ProjectsService.assertCanDelegateProjectAuthority(user('admin-a', RoleCode.COMPANY_ADMIN), PROJECT_A, COMPANY_A, db);
  await assert.rejects(() => ProjectsService.assertCanDelegateProjectAuthority(
    user('pm-other', RoleCode.PROJECT_MANAGER), PROJECT_A, COMPANY_A, db,
  ));

  assert.equal(staff.active_role_code, RoleCode.STAFF, 'Project authority must not mutate the global IAM role');
  console.log(JSON.stringify({
    status: 'PASS',
    acting_project_scope: PROJECT_A,
    cross_project_denied: true,
    cross_company_denied: true,
    delegation_by_acting_denied: true,
    global_role_unchanged: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

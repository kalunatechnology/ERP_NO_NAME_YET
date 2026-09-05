/**
 * Q9 final IAM, tenant-isolation, and module-entitlement regression audit.
 *
 * This test is read-only. It validates the approved canonical demo identities,
 * proves that active roles belong to the user, enforces exactly one active
 * company membership for ordinary users, and confirms the SMA module baseline.
 */
import assert from 'node:assert/strict';
import prisma from '../src/config/database';
import { CoreService } from '../src/modules/core/core.service';

const expected = new Map<string, { company: string | null; active: string; roles: string[] }>([
  ['rian@arsalynk.com', { company: 'SMA', active: 'DIRECTOR', roles: ['DIRECTOR'] }],
  ['melika@arsalynk.com', { company: 'SMA', active: 'PROJECT_MANAGER', roles: ['OPERATIONAL_MANAGER', 'PROJECT_MANAGER'] }],
  ['melika.ops@arsalynk.com', { company: 'SMA', active: 'OPERATIONAL_MANAGER', roles: ['OPERATIONAL_MANAGER', 'SUPERVISOR'] }],
  ['arof@arsalynk.com', { company: 'SMA', active: 'PROJECT_MANAGER', roles: ['FINANCE', 'PROJECT_MANAGER'] }],
  ['arof.finance@arsalynk.com', { company: 'SMA', active: 'FINANCE', roles: ['FINANCE'] }],
  ['laode@arsalynk.com', { company: 'SMA', active: 'COMPANY_ADMIN', roles: ['COMPANY_ADMIN', 'STAFF', 'SUPERVISOR'] }],
  ['jundy@arsalynk.com', { company: 'SMA', active: 'SUPERVISOR', roles: ['STAFF', 'SUPERVISOR'] }],
  ['noorman@arsalynk.com', { company: 'SMA', active: 'SUPERVISOR', roles: ['STAFF', 'SUPERVISOR'] }],
  ['dummy.admin@example.com', { company: null, active: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'] }],
  ['admin.director@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'COMPANY_ADMIN', roles: ['COMPANY_ADMIN'] }],
  ['director@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'DIRECTOR', roles: ['DIRECTOR'] }],
  ['pm.lead@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'PROJECT_MANAGER', roles: ['PROJECT_MANAGER'] }],
  ['supervisor@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'SUPERVISOR', roles: ['STAFF', 'SUPERVISOR'] }],
  ['crm.lead@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'CRM_LEAD', roles: ['CRM_LEAD'] }],
  ['sales@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'SALES', roles: ['SALES'] }],
  ['finance.lead@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'FINANCE', roles: ['FINANCE'] }],
  ['dummy.finance@example.com', { company: 'GHOST-ARSALYNK', active: 'FINANCE', roles: ['FINANCE'] }],
  ['estimator@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'CRM_LEAD', roles: ['CRM_LEAD'] }],
  ['staff.dev@arsalynk.id', { company: 'GHOST-ARSALYNK', active: 'STAFF', roles: ['STAFF'] }],
]);

/** Runs all Q9 database invariants without changing persistence. */
async function main(): Promise<void> {
  const users = await prisma.iam_user.findMany({ where: { email: { in: [...expected.keys()] } } });
  assert.equal(users.length, expected.size, 'All canonical identities must exist');

  const userIds = users.map((user) => user.id);
  const roleIds = new Set<string>();
  const assignments = await prisma.iam_user_role.findMany({ where: { user_id: { in: userIds } } });
  for (const user of users) if (user.active_role_id) roleIds.add(user.active_role_id);
  for (const assignment of assignments) if (assignment.role_id) roleIds.add(assignment.role_id);
  const roles = await prisma.iam_role.findMany({ where: { id: { in: [...roleIds] } } });
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const memberships = await prisma.iam_user_company_membership.findMany({ where: { user_id: { in: userIds }, status: 'ACTIVE' } });
  const companies = await prisma.core_company.findMany({ where: { id: { in: memberships.map((item) => item.company_id) } } });
  const companyById = new Map(companies.map((company) => [company.id, company]));

  for (const user of users) {
    const contract = expected.get(user.email)!;
    const userAssignments = assignments.filter((item) => item.user_id === user.id);
    const userMemberships = memberships.filter((item) => item.user_id === user.id);
    assert.equal(roleById.get(user.active_role_id || '')?.role_code, contract.active, `${user.email}: active role mismatch`);
    assert.deepEqual(userAssignments.map((item) => roleById.get(item.role_id || '')?.role_code).sort(), [...contract.roles].sort(), `${user.email}: assigned roles mismatch`);
    assert(userAssignments.some((item) => item.role_id === user.active_role_id), `${user.email}: active role is not assigned`);
    if (contract.company === null) {
      assert.equal(userMemberships.length, 0, `${user.email}: global identity must not have company membership`);
    } else {
      assert.equal(userMemberships.length, 1, `${user.email}: ordinary identity must have exactly one company`);
      assert.equal(companyById.get(userMemberships[0].company_id)?.company_code, contract.company, `${user.email}: company mismatch`);
      assert(userAssignments.every((item) => item.company_id === userMemberships[0].company_id), `${user.email}: cross-company role assignment`);
    }
  }

  const superusers = await prisma.iam_user.findMany({ where: { is_superuser: true }, select: { email: true } });
  assert.deepEqual(superusers.map((item) => item.email), ['dummy.admin@example.com'], 'There must be exactly one approved Super Admin');

  const sma = await prisma.core_company.findFirstOrThrow({ where: { company_code: 'SMA' } });
  const modules = await prisma.iam_company_module_access.findMany({ where: { company_id: sma.id } });
  const byCode = new Map(modules.map((item) => [item.module_code, item]));
  for (const moduleCode of CoreService.ALL_MODULE_CODES) {
    const access = byCode.get(moduleCode);
    assert(access, `SMA module entitlement missing: ${moduleCode}`);
    assert(access.enabled && access.allow_read && access.allow_write, `SMA module is not read/write enabled: ${moduleCode}`);
  }

  console.log(JSON.stringify({ status: 'PASS', canonical_users: users.length, sole_super_admin: superusers[0].email, sma_modules_read_write: CoreService.ALL_MODULE_CODES.length, cross_company_role_assignments: 0 }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

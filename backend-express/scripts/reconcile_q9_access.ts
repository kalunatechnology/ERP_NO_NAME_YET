/**
 * Q9 canonical IAM and module-entitlement reconciliation.
 *
 * Scope:
 * - Replaces role assignments only for the 19 approved demo identities.
 * - Enforces `dummy.admin@example.com` as the sole Super Admin globally.
 * - Preserves every non-canonical account and all business records.
 * - Enables the complete SMA module catalog for read and write access as the
 *   approved Q9 baseline. The SMA Company Admin can subsequently narrow either
 *   capability per module from the access-management UI.
 *
 * Run manually after reviewing the canonical catalog. This is intentionally
 * separate from the broad seed so IAM repair cannot create unrelated demo data.
 */
import crypto from 'crypto';
import prisma from '../src/config/database';
import { CoreService } from '../src/modules/core/core.service';
import { RoleCode } from '@prisma/client';

type Identity = {
  email: string;
  companyCode: string | null;
  roleCodes: RoleCode[];
  activeRoleCode: RoleCode;
};

const identities: Identity[] = [
  { email: 'rian@arsalynk.com', companyCode: 'SMA', roleCodes: [RoleCode.DIRECTOR], activeRoleCode: RoleCode.DIRECTOR },
  { email: 'melika@arsalynk.com', companyCode: 'SMA', roleCodes: [RoleCode.PROJECT_MANAGER, RoleCode.OPERATIONAL_MANAGER], activeRoleCode: RoleCode.PROJECT_MANAGER },
  { email: 'melika.ops@arsalynk.com', companyCode: 'SMA', roleCodes: [RoleCode.OPERATIONAL_MANAGER, RoleCode.SUPERVISOR], activeRoleCode: RoleCode.OPERATIONAL_MANAGER },
  { email: 'arof@arsalynk.com', companyCode: 'SMA', roleCodes: [RoleCode.PROJECT_MANAGER, RoleCode.FINANCE], activeRoleCode: RoleCode.PROJECT_MANAGER },
  { email: 'arof.finance@arsalynk.com', companyCode: 'SMA', roleCodes: [RoleCode.FINANCE], activeRoleCode: RoleCode.FINANCE },
  { email: 'laode@arsalynk.com', companyCode: 'SMA', roleCodes: [RoleCode.COMPANY_ADMIN, RoleCode.SUPERVISOR, RoleCode.STAFF], activeRoleCode: RoleCode.COMPANY_ADMIN },
  { email: 'jundy@arsalynk.com', companyCode: 'SMA', roleCodes: [RoleCode.SUPERVISOR, RoleCode.STAFF], activeRoleCode: RoleCode.SUPERVISOR },
  { email: 'noorman@arsalynk.com', companyCode: 'SMA', roleCodes: [RoleCode.SUPERVISOR, RoleCode.STAFF], activeRoleCode: RoleCode.SUPERVISOR },
  { email: 'dummy.admin@example.com', companyCode: null, roleCodes: [RoleCode.SUPER_ADMIN], activeRoleCode: RoleCode.SUPER_ADMIN },
  { email: 'admin.director@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.COMPANY_ADMIN], activeRoleCode: RoleCode.COMPANY_ADMIN },
  { email: 'director@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.DIRECTOR], activeRoleCode: RoleCode.DIRECTOR },
  { email: 'pm.lead@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.PROJECT_MANAGER], activeRoleCode: RoleCode.PROJECT_MANAGER },
  { email: 'supervisor@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.SUPERVISOR, RoleCode.STAFF], activeRoleCode: RoleCode.SUPERVISOR },
  { email: 'crm.lead@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.CRM_LEAD], activeRoleCode: RoleCode.CRM_LEAD },
  { email: 'sales@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.SALES], activeRoleCode: RoleCode.SALES },
  { email: 'finance.lead@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.FINANCE], activeRoleCode: RoleCode.FINANCE },
  { email: 'dummy.finance@example.com', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.FINANCE], activeRoleCode: RoleCode.FINANCE },
  { email: 'estimator@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.CRM_LEAD], activeRoleCode: RoleCode.CRM_LEAD },
  { email: 'staff.dev@arsalynk.id', companyCode: 'GHOST-ARSALYNK', roleCodes: [RoleCode.STAFF], activeRoleCode: RoleCode.STAFF },
];

/** Reconciles the approved identities atomically, then validates invariants. */
async function reconcileQ9Access(): Promise<void> {
  const companies = await prisma.core_company.findMany({
    where: { company_code: { in: ['SMA', 'GHOST-ARSALYNK'] } },
    select: { id: true, tenant_id: true, company_code: true },
  });
  const companyByCode = new Map(companies.map((company) => [company.company_code, company]));
  const sma = companyByCode.get('SMA');
  if (!sma?.tenant_id) throw new Error('Company SMA atau tenant-nya tidak ditemukan.');

  await prisma.$transaction(async (tx) => {
    // Email must never become an authorization fallback; these flags and the
    // canonical assignment together establish the single global superuser.
    await tx.iam_user.updateMany({ data: { is_superuser: false } });

    for (const identity of identities) {
      const user = await tx.iam_user.findUnique({ where: { email: identity.email } });
      if (!user) throw new Error(`User kanonis tidak ditemukan: ${identity.email}`);
      const company = identity.companyCode ? companyByCode.get(identity.companyCode) : null;
      if (identity.companyCode && !company?.tenant_id) throw new Error(`Company ${identity.companyCode} tidak ditemukan.`);
      const tenantId = company?.tenant_id ?? user.tenant_id;
      if (!tenantId) throw new Error(`Tenant user tidak ditemukan: ${identity.email}`);

      const roles = await tx.iam_role.findMany({
        where: { tenant_id: tenantId, role_code: { in: identity.roleCodes } },
      });
      if (roles.length !== identity.roleCodes.length) throw new Error(`Katalog role tidak lengkap: ${identity.email}`);
      const activeRole = roles.find((role) => role.role_code === identity.activeRoleCode);
      if (!activeRole) throw new Error(`Active role tidak ditemukan: ${identity.email}`);

      await tx.iam_user_role.deleteMany({ where: { user_id: user.id } });
      await tx.iam_user_role.createMany({
        data: roles.map((role) => ({
          id: crypto.randomUUID(), user_id: user.id, role_id: role.id,
          tenant_id: tenantId, company_id: company?.id ?? null,
        })),
      });
      await tx.iam_user.update({
        where: { id: user.id },
        data: {
          tenant_id: tenantId,
          active_role_id: activeRole.id,
          is_superuser: identity.email === 'dummy.admin@example.com',
        },
      });

      await tx.iam_user_company_membership.deleteMany({ where: { user_id: user.id } });
      if (company?.tenant_id) {
        await tx.iam_user_company_membership.create({
          data: { id: crypto.randomUUID(), tenant_id: company.tenant_id, company_id: company.id, user_id: user.id, status: 'ACTIVE' },
        });
      }
    }

    const superRoleAssignments = await tx.iam_user_role.findMany({
      where: { role_id: { in: (await tx.iam_role.findMany({ where: { role_code: RoleCode.SUPER_ADMIN }, select: { id: true } })).map((role) => role.id) } },
      select: { id: true, user_id: true },
    });
    const approvedSuper = await tx.iam_user.findUniqueOrThrow({ where: { email: 'dummy.admin@example.com' } });
    await tx.iam_user_role.deleteMany({
      where: { id: { in: superRoleAssignments.filter((assignment) => assignment.user_id !== approvedSuper.id).map((assignment) => assignment.id) } },
    });
  }, { maxWait: 20_000, timeout: 120_000 });

  for (const moduleCode of CoreService.ALL_MODULE_CODES) {
    await CoreService.setCompanyModuleAccess(sma.id, moduleCode, { enabled: true, allow_read: true, allow_write: true });
  }

  const violations = await prisma.$queryRaw<Array<{ issue: string; count: bigint }>>`
    SELECT 'superuser_count' AS issue, count(*) AS count FROM iam_user WHERE is_superuser = true
    UNION ALL
    SELECT 'ordinary_without_one_membership', count(*) FROM iam_user u
      WHERE lower(u.email) <> 'dummy.admin@example.com'
      AND (SELECT count(*) FROM iam_user_company_membership m WHERE m.user_id=u.id AND m.status='ACTIVE') <> 1
    UNION ALL
    SELECT 'cross_company_role', count(*) FROM iam_user_role ur
      JOIN iam_user_company_membership m ON m.user_id=ur.user_id
      WHERE ur.company_id IS DISTINCT FROM m.company_id
  `;
  console.table(violations.map((row) => ({ issue: row.issue, count: Number(row.count) })));
  if (violations.some((row) => Number(row.count) !== (row.issue === 'superuser_count' ? 1 : 0))) {
    throw new Error('Q9 IAM invariant validation gagal.');
  }
}

reconcileQ9Access()
  .then(() => console.log('Q9 access reconciliation completed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

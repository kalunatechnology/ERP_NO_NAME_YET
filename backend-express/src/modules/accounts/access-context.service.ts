/**
 * File: backend-express/src/modules/accounts/access-context.service.ts
 *
 * Purpose: Implements domain service responsibilities for the accounts domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';
import { ForbiddenError } from '../../utils/errors';
import { isSuperAdmin, RoleCode } from '../../types/roles';

export interface UserAccessContext {
  roles: RoleCode[];
  activeRoleId: string | null;
  activeRoleCode: RoleCode | null;
  companyId: string | null;
  companyIds: string[];
  isSuperAdmin: boolean;
  enabledModules: string[];
}

/**
 * loadUserAccessContext implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user`, `iam_user_role`, `iam_role`, `iam_user_company_membership`, `iam_company_module_access`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
export async function loadUserAccessContext(userId: string): Promise<UserAccessContext> {
  const user = await prisma.iam_user.findUnique({
    where: { id: userId },
    select: { tenant_id: true, active_role_id: true },
  });
  if (!user) {
    throw new ForbiddenError('Konfigurasi akses user tidak valid: user tidak ditemukan.');
  }

  const assignments = await prisma.iam_user_role.findMany({ where: { user_id: userId } });
  const roleIds = assignments
    .map((assignment) => assignment.role_id)
    .filter((id): id is string => Boolean(id));
  const roleRecords = roleIds.length
    ? await prisma.iam_role.findMany({
        where: {
          id: { in: roleIds },
          tenant_id: user.tenant_id,
        },
      })
    : [];
  if (roleRecords.length !== new Set(roleIds).size) {
    throw new ForbiddenError('Konfigurasi akses user tidak valid: role berada di luar tenant user.');
  }
  const roles = [...new Set(roleRecords.map((role) => role.role_code))];
  const superAdmin = isSuperAdmin(roles);
  const membership = await prisma.iam_user_company_membership.findUnique({
    where: { user_id: userId },
  });
  if (superAdmin && membership) {
    throw new ForbiddenError('Konfigurasi akses tidak valid: Super Admin tidak boleh memiliki membership company.');
  }
  if (!superAdmin && (!membership || membership.status !== 'ACTIVE')) {
    throw new ForbiddenError('Konfigurasi akses tidak valid: user wajib memiliki satu membership company aktif.');
  }
  if (membership && membership.tenant_id !== user.tenant_id) {
    throw new ForbiddenError('Konfigurasi akses tidak valid: membership berada di luar tenant user.');
  }
  const companyIds = membership ? [membership.company_id] : [];
  if (!superAdmin && assignments.some((item) => item.company_id !== membership?.company_id)) {
    throw new ForbiddenError('Konfigurasi akses tidak valid: assignment role tidak sesuai membership company.');
  }

  let activeRoleId: string | null = null;
  let activeRoleCode: RoleCode | null = null;

  if (user.active_role_id && roleIds.includes(user.active_role_id)) {
    const activeRole = roleRecords.find((r) => r.id === user.active_role_id);
    if (activeRole) {
      activeRoleId = activeRole.id;
      activeRoleCode = activeRole.role_code;
    }
  }

  if (!activeRoleCode && roleRecords.length > 0) {
    activeRoleId = roleRecords[0].id;
    activeRoleCode = roleRecords[0].role_code;
  }

  const now = new Date();
  const moduleAccess = membership
    ? await prisma.iam_company_module_access.findMany({
        where: {
          company_id: membership.company_id,
          tenant_id: membership.tenant_id,
          enabled: true,
          allow_read: true,
          AND: [
            { OR: [{ effective_from: null }, { effective_from: { lte: now } }] },
            { OR: [{ effective_until: null }, { effective_until: { gte: now } }] },
          ],
        },
        select: { module_code: true },
      })
    : [];

  return {
    roles,
    activeRoleId,
    activeRoleCode,
    companyId: superAdmin ? null : companyIds[0] ?? null,
    companyIds,
    isSuperAdmin: superAdmin,
    enabledModules: moduleAccess.map((item) => item.module_code.toUpperCase()),
  };
}

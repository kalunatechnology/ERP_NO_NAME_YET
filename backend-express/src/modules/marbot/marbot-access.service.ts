import { RoleCode } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError } from '../../utils/errors';
import { loadUserAccessContext } from '../accounts/access-context.service';
import { MarbotTenantConfig } from './marbot.types';

export const roleDefaults: Partial<Record<RoleCode, string>> = { DIRECTOR: 'EXECUTIVE' };

export const toolModules: Record<string, string> = {
  'project.summary': 'PROJECTS',
  'project.task_overview': 'PROJECTS',
  'finance.expense_summary': 'FINANCE',
  'crm.open_tickets': 'CRM',
};

export const toolPermissions: Record<string, string> = {
  'project.summary': 'READ_PROJECT',
  'project.task_overview': 'READ_TASK',
  'finance.expense_summary': 'READ_FINANCE_SUMMARY',
  'crm.open_tickets': 'READ_TICKET',
};

export const toolQueryKeys: Record<string, string[]> = {
  'project.summary': ['projectId'],
  'project.task_overview': ['projectId', 'status'],
  'finance.expense_summary': ['period'],
  'crm.open_tickets': ['customerId', 'priority'],
};

/**
 * Maps an ERP internal role code to the chatbot's recognized role code.
 */
export function mapRoleForChatbot(role: RoleCode, config: MarbotTenantConfig): string {
  return config.roleMap?.[role] || roleDefaults[role] || role;
}

export const signedRole = mapRoleForChatbot;

/**
 * Validates that a user is active, belongs to the company and tenant, has MARBOT module enabled,
 * and possesses the USE_MARBOT permission.
 */
export async function checkedUser(
  userId: string,
  companyId: string,
  tenantId: string,
  db: any = prisma,
) {
  const user = await db.iam_user.findFirst({
    where: { id: userId, tenant_id: tenantId, is_active: true },
    select: { id: true, tenant_id: true, active_role_id: true },
  });
  if (!user) throw new ForbiddenError();

  const access = await loadUserAccessContext(userId, user);
  if (access.isSuperAdmin || access.companyId !== companyId || !access.activeRoleCode) {
    throw new ForbiddenError();
  }

  const company = await db.core_company.findFirst({
    where: { id: companyId, tenant_id: tenantId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!company || !access.enabledModules.includes('MARBOT')) {
    throw new ForbiddenError();
  }

  await requirePermission(access.activeRoleId!, tenantId, companyId, 'USE_MARBOT', db);
  return access;
}

/**
 * Checks if a role has been granted a specific permission in a company/tenant.
 */
export async function hasPermission(
  roleId: string,
  tenantId: string,
  companyId: string,
  code: string,
  db: any = prisma,
): Promise<boolean> {
  const permission = await db.iam_permission.findUnique({
    where: { permission_code: code },
    select: { id: true },
  });
  if (!permission) return false;

  const grant = await db.iam_role_permission.findFirst({
    where: {
      role_id: roleId,
      permission_id: permission.id,
      tenant_id: tenantId,
      company_id: companyId,
      allowed: true,
    },
    select: { id: true },
  });
  return Boolean(grant);
}

/**
 * Asserts that a role has been granted a specific permission, throwing ForbiddenError if not.
 */
export async function requirePermission(
  roleId: string,
  tenantId: string,
  companyId: string,
  code: string,
  db: any = prisma,
) {
  if (!(await hasPermission(roleId, tenantId, companyId, code, db))) {
    throw new ForbiddenError();
  }
}

/**
 * Validates that a user has access to a specific module in addition to USE_MARBOT.
 */
export async function checkedModule(
  userId: string,
  companyId: string,
  tenantId: string,
  module: string,
  db: any = prisma,
) {
  const access = await checkedUser(userId, companyId, tenantId, db);
  if (!access.enabledModules.includes(module)) {
    throw new ForbiddenError();
  }
  return access;
}

/**
 * Returns the list of visible project IDs for a given user and role, or null if unrestricted.
 * NOTE: Preserves exact MarBot read scope semantics:
 * - DIRECTOR / OPERATIONAL_MANAGER: null (full company portfolio)
 * - FINANCE: project IDs on fin_project_cost_entry WITHOUT status = POSTED filter
 * - PM / others: managed + explicit access window + active project member
 */
export async function getVisibleProjectIds(
  tenantId: string,
  companyId: string,
  userId: string,
  role: RoleCode,
  db: any = prisma,
): Promise<string[] | null> {
  if (new Set<RoleCode>([RoleCode.DIRECTOR, RoleCode.OPERATIONAL_MANAGER]).has(role)) {
    return null;
  }

  if (role === RoleCode.FINANCE) {
    const costs = await db.fin_project_cost_entry.findMany({
      where: { tenant_id: tenantId, company_id: companyId },
      select: { project_id: true },
      distinct: ['project_id'],
    });
    return costs.map((row: { project_id: string }) => row.project_id);
  }

  const now = new Date();
  const [managed, explicit, member] = await Promise.all([
    db.project_project.findMany({
      where: { tenant_id: tenantId, company_id: companyId, project_manager_id: userId },
      select: { id: true },
    }),
    db.iam_user_project_access.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        user_id: userId,
        access_level: { notIn: ['DENY', 'NONE', 'REVOKED'] },
        AND: [
          { OR: [{ valid_from: null }, { valid_from: { lte: now } }] },
          { OR: [{ valid_to: null }, { valid_to: { gte: now } }] },
        ],
      },
      select: { project_id: true },
    }),
    db.project_member.findMany({
      where: { tenant_id: tenantId, company_id: companyId, user_id: userId, status: 'ACTIVE' },
      select: { project_id: true },
    }),
  ]);

  const all = [
    ...managed.map((row: { id: string }) => row.id),
    ...explicit.map((row: { project_id: string }) => row.project_id),
    ...member.map((row: { project_id: string }) => row.project_id),
  ];

  return [...new Set(all.filter((id): id is string => Boolean(id)))];
}

export const visibleProjectIds = getVisibleProjectIds;

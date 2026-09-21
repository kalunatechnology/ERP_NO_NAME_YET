import { Prisma, RoleCode } from '@prisma/client';
import prisma from '../../config/database';
import { ForbiddenError } from '../../utils/errors';
import { loadAuthenticationSnapshot, loadUserAccessContext } from '../accounts/access-context.service';
import { MarbotTenantConfig } from './marbot.types';
import { MarbotProjectScope, MarbotRuntimeAuthority } from './marbot.types';
import { ProjectsService } from '../projects/projects.service';

export const MARBOT_PERMISSION_CODES = [
  'USE_MARBOT', 'READ_GENERAL', 'READ_PROJECT', 'READ_TASK',
  'READ_FINANCE_SUMMARY', 'READ_PROJECT_FINANCE', 'READ_COMPANY_FINANCE',
  'READ_TICKET', 'READ_CRM_DEALS',
] as const;

const PERMISSION_MODULE: Record<string, string> = {
  USE_MARBOT: 'MARBOT', READ_GENERAL: 'GENERAL', READ_PROJECT: 'PROJECTS', READ_TASK: 'PROJECTS',
  READ_FINANCE_SUMMARY: 'FINANCE', READ_PROJECT_FINANCE: 'FINANCE', READ_COMPANY_FINANCE: 'FINANCE',
  READ_TICKET: 'CRM', READ_CRM_DEALS: 'CRM',
};

export const roleDefaults: Partial<Record<RoleCode, string>> = { DIRECTOR: 'EXECUTIVE' };

export const toolModules: Record<string, string> = {
  'project.summary': 'PROJECTS',
  'project.task_overview': 'PROJECTS',
  'finance.expense_summary': 'FINANCE',
  'crm.open_tickets': 'CRM',
};

export const toolPermissions: Record<string, string[]> = {
  'project.summary': ['READ_PROJECT'],
  'project.task_overview': ['READ_TASK'],
  'finance.expense_summary': ['READ_PROJECT_FINANCE', 'READ_COMPANY_FINANCE', 'READ_FINANCE_SUMMARY'],
  'crm.open_tickets': ['READ_TICKET'],
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
  assertMarbotPermission = true,
) {
  const snapshot = db === prisma ? await loadAuthenticationSnapshot(userId) : null;
  const user = snapshot?.user ?? await db.iam_user.findFirst({
      where: { id: userId, tenant_id: tenantId, is_active: true },
      select: { id: true, tenant_id: true, active_role_id: true, is_active: true },
    });
  if (!user) throw new ForbiddenError();
  if (user.tenant_id !== tenantId || !user.is_active) throw new ForbiddenError();

  const access = await loadUserAccessContext(userId, user, snapshot?.rows);
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

  if (assertMarbotPermission) {
    await requirePermission(access.activeRoleId!, tenantId, companyId, 'USE_MARBOT', db);
  }
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

/** Loads all requested grants in one database snapshot. */
export async function getGrantedPermissions(
  roleId: string,
  tenantId: string,
  companyId: string,
  codes: readonly string[],
  db: any = prisma,
): Promise<string[]> {
  if (!codes.length) return [];
  if (typeof db.$queryRaw === 'function') {
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT DISTINCT p.permission_code
      FROM iam_role_permission rp
      JOIN iam_permission p ON p.id = rp.permission_id
      WHERE rp.role_id = ${roleId}::uuid
        AND rp.tenant_id = ${tenantId}::uuid
        AND rp.company_id = ${companyId}::uuid
        AND rp.allowed = true
        AND p.permission_code IN (${Prisma.join([...codes])})
      ORDER BY p.permission_code
    `) as Array<{ permission_code: string }>;
    return rows.map((row: { permission_code: string }) => row.permission_code);
  }
  const permissions = await db.iam_permission.findMany({
    where: { permission_code: { in: [...codes] } },
    select: { id: true, permission_code: true },
  });
  const grants = await db.iam_role_permission.findMany({
    where: {
      role_id: roleId, tenant_id: tenantId, company_id: companyId, allowed: true,
      permission_id: { in: permissions.map((item: any) => item.id) },
    },
    select: { permission_id: true },
  });
  const grantedIds = new Set(grants.map((item: any) => item.permission_id));
  return permissions.filter((item: any) => grantedIds.has(item.id)).map((item: any) => item.permission_code).sort();
}

export function normalizeProjectScope(value: unknown): MarbotProjectScope {
  if (!value || typeof value !== 'object') throw new ForbiddenError('Project scope MarBot tidak valid.');
  const input = value as { mode?: unknown; projectIds?: unknown };
  if (input.mode === 'ALL') return { mode: 'ALL', projectIds: [] };
  if (input.mode !== 'LIST' || !Array.isArray(input.projectIds)) throw new ForbiddenError('Project scope MarBot tidak valid.');
  return { mode: 'LIST', projectIds: [...new Set(input.projectIds.map(String).filter(Boolean))].sort() };
}

/** Builds one deterministic authority snapshot using canonical ERP project visibility. */
export async function buildMarbotRuntimeAuthority(
  userId: string,
  tenantId: string,
  companyId: string,
  db: any = prisma,
): Promise<MarbotRuntimeAuthority> {
  const access = await checkedUser(userId, companyId, tenantId, db, false);
  const permissions = await getGrantedPermissions(
    access.activeRoleId!, tenantId, companyId, MARBOT_PERMISSION_CODES, db,
  );
  if (!permissions.includes('USE_MARBOT')) throw new ForbiddenError();
  const enabledModuleSet = new Set<string>(access.enabledModules.map(String));
  const effectivePermissions = permissions.filter((code) => enabledModuleSet.has(PERMISSION_MODULE[code]));
  const user = { id: userId, roles: access.roles, active_role_code: access.activeRoleCode };
  const accessWhere = await ProjectsService.projectAccessWhere(user, companyId, db);
  let projectScope: MarbotProjectScope;
  if (Object.keys(accessWhere).length === 0) {
    projectScope = { mode: 'ALL', projectIds: [] };
  } else {
    const projects = await db.project_project.findMany({
      where: { tenant_id: tenantId, company_id: companyId, ...accessWhere },
      select: { id: true },
    });
    const projectIds = (projects as Array<{ id: string }>).map((row) => String(row.id));
    projectScope = { mode: 'LIST', projectIds: [...new Set<string>(projectIds)].sort() };
  }
  return {
    roleCode: access.activeRoleCode!,
    roleId: access.activeRoleId!,
    enabledModules: [...new Set<string>(access.enabledModules.map(String))].sort(),
    permissions: effectivePermissions,
    projectScope,
  };
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

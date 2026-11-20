/**
 * File: backend-express/src/modules/accounts/access-context.service.ts
 *
 * Purpose: Implements domain service responsibilities for the accounts domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import prisma from '../../config/database';
import { Prisma, type iam_role, type iam_user, type iam_user_company_membership, type iam_user_role } from '@prisma/client';
import { ForbiddenError } from '../../utils/errors';
import { isSuperAdmin, parseRoleCode, RoleCode } from '../../types/roles';
import { effectiveModuleOverrides, ModulePermission } from '../../utils/module-permissions';
import { DASHBOARD_WIDGET_CATALOG, mergeLegacyRoleTranslations } from './org-policy-sync.service';

export type DepartmentRoleLevelType = 'GM' | 'SPV' | 'STAFF';

export interface UserModuleAssignmentContext {
  id: string;
  module_code: string;
  profile_id?: string | null;
  profile_code?: string | null;
  legacy_role_code?: string | null;
  profile_active?: boolean;
  capability_codes?: string[];
  tier_level: number;
  position_title: string;
  data_scope: string;
  department_id?: string | null;
  scope_resource_ids?: string[];
  reports_to_user_id: string | null;
  status: string;
  allow_read: boolean;
  allow_write: boolean;
  allow_approve: boolean;
  allow_delete: boolean;
  allow_manage_users: boolean;
}

export interface UserPermissionOverrideContext {
  module_code: string;
  action_code: string;
  effect: 'ALLOW' | 'DENY' | string;
}

export interface CrossModuleCapabilityContext {
  id: string;
  source_module_code: string;
  target_module_code: string;
  capability_code: string;
  allowed_actions: string[];
  status: string;
}

export interface UserAccessContext {
  roles: RoleCode[];
  activeRoleId: string | null;
  activeRoleCode: RoleCode | null;
  companyId: string | null;
  companyIds: string[];
  isSuperAdmin: boolean;
  enabledModules: string[];
  delegatedModules: string[];
  moduleAccess: ModulePermission[];
  moduleAccessModes: Array<{ module_code: string; access_mode: string }>;
  moduleAssignments?: UserModuleAssignmentContext[];
  permissionOverrides?: UserPermissionOverrideContext[];
  crossModuleCapabilities?: CrossModuleCapabilityContext[];
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  departmentUnitType: string | null;
  roleLevel: DepartmentRoleLevelType;
  reportsToUserId?: string | null;
  jobTitle?: string;
  dashboardWidgets?: string[];
  canApproveDivisionScope: boolean;
  canOverrideBudget: boolean;
}

export function resolveEffectiveRoleLevel(
  explicitRoleLevel?: string | null,
): DepartmentRoleLevelType {
  const normalizedExplicit = String(explicitRoleLevel ?? '').trim().toUpperCase();
  if (normalizedExplicit === 'GM' || normalizedExplicit === 'SPV' || normalizedExplicit === 'STAFF') {
    return normalizedExplicit;
  }
  return 'STAFF';
}

export interface KnownAccessRows {
  assignments?: iam_user_role[];
  membership?: iam_user_company_membership | null;
  roleRecords?: iam_role[];
  moduleAccess?: Array<{ module_code: string; access_mode?: string; allow_write?: boolean }>;
  userModuleAccess?: Array<{ module_code: string; allow_read: boolean; allow_write: boolean }>;
  projectDelegated?: boolean;
}

type AccessSnapshot = {
  assignments: iam_user_role[];
  membership: iam_user_company_membership | null;
  roles: Array<iam_role & { role_code: string }>;
  company_modules: Array<{ module_code: string; access_mode: string; allow_write: boolean }>;
  user_modules: Array<{ module_code: string; allow_read: boolean; allow_write: boolean }>;
  project_delegated: boolean;
};

export type AuthenticationUser = Pick<iam_user, 'id' | 'email' | 'full_name' | 'is_staff' | 'status' | 'tenant_id' | 'is_active' | 'active_role_id'>;

type AuthenticationSnapshot = { user: AuthenticationUser; rows: KnownAccessRows } | null;
const pendingAuthenticationSnapshots = new Map<string, Promise<AuthenticationSnapshot>>();

/** Loads the active user and every authorization input in one consistent SQL snapshot. */
export async function loadAuthenticationSnapshot(userId: string): Promise<AuthenticationSnapshot> {
  const now = new Date();
  const results = await prisma.$queryRaw<Array<{ user_record: AuthenticationUser; snapshot: AccessSnapshot }>>(Prisma.sql`
    WITH selected_user AS (
      SELECT id,email,full_name,is_staff,status,tenant_id,is_active,active_role_id
      FROM iam_user WHERE id=${userId}::text LIMIT 1
    ), membership AS (
      SELECT m.* FROM iam_user_company_membership m WHERE m.user_id=${userId}::text LIMIT 1
    )
    SELECT to_jsonb(u) AS user_record, jsonb_build_object(
      'assignments', COALESCE((SELECT jsonb_agg(to_jsonb(ur)) FROM iam_user_role ur WHERE ur.user_id=u.id), '[]'::jsonb),
      'membership', (SELECT to_jsonb(m) FROM membership m),
      'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM iam_role r JOIN iam_user_role ur ON ur.role_id=r.id WHERE ur.user_id=u.id AND r.tenant_id IS NOT DISTINCT FROM u.tenant_id), '[]'::jsonb),
      'company_modules', COALESCE((SELECT jsonb_agg(jsonb_build_object('module_code',cma.module_code,'access_mode',cma.access_mode,'allow_write',cma.allow_write)) FROM iam_company_module_access cma JOIN membership m ON m.company_id=cma.company_id AND m.tenant_id=cma.tenant_id WHERE cma.enabled=true AND cma.allow_read=true AND (cma.effective_from IS NULL OR cma.effective_from<=${now}) AND (cma.effective_until IS NULL OR cma.effective_until>=${now})), '[]'::jsonb),
      'user_modules', COALESCE((SELECT jsonb_agg(jsonb_build_object('module_code',uma.module_code,'allow_read',uma.allow_read,'allow_write',uma.allow_write)) FROM iam_user_module_access uma JOIN membership m ON m.company_id=uma.company_id AND m.tenant_id=uma.tenant_id WHERE uma.user_id=u.id), '[]'::jsonb),
      'project_delegated', EXISTS (
        SELECT 1 FROM project_member pm JOIN membership m ON m.company_id=pm.company_id AND m.tenant_id=pm.tenant_id
        WHERE pm.user_id=u.id AND pm.project_role='ACTING_PROJECT_MANAGER' AND UPPER(pm.status)='ACTIVE'
      )
    ) AS snapshot
    FROM selected_user u
  `);
  const result = results[0];
  if (!result) return null;
  return {
    user: result.user_record,
    rows: {
      assignments: result.snapshot.assignments,
      membership: result.snapshot.membership,
      roleRecords: result.snapshot.roles.map((role) => ({ ...role, role_code: parseRoleCode(role.role_code) })).filter((role): role is iam_role => role.role_code !== null),
      moduleAccess: result.snapshot.company_modules,
      userModuleAccess: result.snapshot.user_modules,
      projectDelegated: result.snapshot.project_delegated,
    },
  };
}

/**
 * Coalesces concurrent checks for the same user without retaining an access
 * decision after the request wave completes. Parallel dashboard calls share
 * one fresh database snapshot; later requests still revalidate account state.
 */
export function loadAuthenticationSnapshotCoalesced(userId: string): Promise<AuthenticationSnapshot> {
  const active = pendingAuthenticationSnapshots.get(userId);
  if (active) return active;
  const pending = loadAuthenticationSnapshot(userId)
    .finally(() => pendingAuthenticationSnapshots.delete(userId));
  pendingAuthenticationSnapshots.set(userId, pending);
  return pending;
}

/**
 * loadUserAccessContext implements a named function within this file's domain service boundary.
 *
 * Input/output: Uses the typed parameters in the signature and returns the value or Promise produced by the implementation.
 * Dependencies: Calls only the imported services/utilities and local helpers referenced in its body.
 * Data/side effects: Reads or mutates Prisma model(s) `iam_user`, `iam_user_role`, `iam_role`, `iam_user_company_membership`, `iam_company_module_access`; transaction boundaries are exactly those visible in the body.
 * Failure behavior: Validation, authorization, persistence, or dependency errors are returned/thrown according to the existing caller contract.
 */
export async function loadUserAccessContext(
  userId: string,
  knownUser?: { tenant_id: string | null; active_role_id: string | null },
  knownRows: KnownAccessRows = {},
): Promise<UserAccessContext> {
  const user = knownUser ?? await prisma.iam_user.findUnique({
    where: { id: userId },
    select: { tenant_id: true, active_role_id: true },
  });
  if (!user) {
    throw new ForbiddenError('Konfigurasi akses user tidak valid: user tidak ditemukan.');
  }

  // The normal authenticated-request path must cross the remote database only
  // once. PostgreSQL builds the complete authorization snapshot atomically;
  // no role, membership, tenant, or module check is skipped or cached.
  const useAtomicSnapshot = knownRows.assignments === undefined
    && knownRows.membership === undefined
    && knownRows.roleRecords === undefined
    && knownRows.moduleAccess === undefined
    && knownRows.userModuleAccess === undefined
    && knownRows.projectDelegated === undefined;
  const now = new Date();
  const rawSnapshots = useAtomicSnapshot
    ? await prisma.$queryRaw<Array<{ snapshot: AccessSnapshot }>>(Prisma.sql`
        WITH membership AS (
          SELECT m.* FROM iam_user_company_membership m
          WHERE m.user_id = ${userId}::text LIMIT 1
        )
        SELECT jsonb_build_object(
          'assignments', COALESCE((SELECT jsonb_agg(to_jsonb(ur)) FROM iam_user_role ur WHERE ur.user_id = ${userId}::text), '[]'::jsonb),
          'membership', (SELECT to_jsonb(m) FROM membership m),
          'roles', COALESCE((
            SELECT jsonb_agg(to_jsonb(r)) FROM iam_role r
            JOIN iam_user_role ur ON ur.role_id = r.id
            WHERE ur.user_id = ${userId}::text AND r.tenant_id IS NOT DISTINCT FROM ${user.tenant_id}::text
          ), '[]'::jsonb),
          'company_modules', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('module_code', cma.module_code, 'access_mode', cma.access_mode, 'allow_write', cma.allow_write))
            FROM iam_company_module_access cma JOIN membership m ON m.company_id = cma.company_id AND m.tenant_id = cma.tenant_id
            WHERE cma.enabled = true AND cma.allow_read = true
              AND (cma.effective_from IS NULL OR cma.effective_from <= ${now})
              AND (cma.effective_until IS NULL OR cma.effective_until >= ${now})
          ), '[]'::jsonb),
          'user_modules', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('module_code', uma.module_code, 'allow_read', uma.allow_read, 'allow_write', uma.allow_write))
            FROM iam_user_module_access uma JOIN membership m ON m.company_id = uma.company_id AND m.tenant_id = uma.tenant_id
            WHERE uma.user_id = ${userId}::text
          ), '[]'::jsonb),
          'project_delegated', EXISTS (
            SELECT 1 FROM project_member pm JOIN membership m ON m.company_id=pm.company_id AND m.tenant_id=pm.tenant_id
            WHERE pm.user_id=${userId}::text AND pm.project_role='ACTING_PROJECT_MANAGER' AND UPPER(pm.status)='ACTIVE'
          )
        ) AS snapshot
      `)
    : [];
  const snapshot = rawSnapshots[0]?.snapshot;
  const [assignments, membership] = snapshot
    ? [snapshot.assignments, snapshot.membership]
    : await Promise.all([
        knownRows.assignments ?? prisma.iam_user_role.findMany({ where: { user_id: userId } }),
        knownRows.membership !== undefined
          ? Promise.resolve(knownRows.membership)
          : prisma.iam_user_company_membership.findUnique({ where: { user_id: userId } }),
      ]);
  const roleIds = assignments
    .map((assignment) => assignment.role_id)
    .filter((id): id is string => Boolean(id));
  const roleRecords = snapshot
    ? snapshot.roles.map((role) => ({ ...role, role_code: parseRoleCode(role.role_code) })).filter((role): role is iam_role => role.role_code !== null)
    : knownRows.roleRecords ?? (roleIds.length
    ? await prisma.iam_role.findMany({
        where: {
          id: { in: roleIds },
          tenant_id: user.tenant_id,
        },
      })
    : []);
  if (roleRecords.length !== new Set(roleIds).size) {
    throw new ForbiddenError('Konfigurasi akses user tidak valid: role berada di luar tenant user.');
  }
  const roles = [...new Set(roleRecords.map((role) => role.role_code))];
  const superAdmin = isSuperAdmin(roles);
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

  // Company entitlement and per-user overrides are independent projections of
  // the same membership and can be loaded concurrently.
  const [moduleAccess, userModuleAccess] = snapshot
    ? [snapshot.company_modules, snapshot.user_modules]
    : knownRows.moduleAccess !== undefined && knownRows.userModuleAccess !== undefined
      ? [knownRows.moduleAccess, knownRows.userModuleAccess]
    : membership
    ? await Promise.all([
        prisma.iam_company_module_access.findMany({
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
          select: { module_code: true, access_mode: true, allow_write: true },
        }),
        // A missing record deliberately preserves inheritance from company access.
        prisma.iam_user_module_access.findMany({
          where: { user_id: userId, company_id: membership.company_id, tenant_id: membership.tenant_id },
          select: { module_code: true, allow_read: true, allow_write: true },
        }),
      ])
    : [[], []];
  const overrideByModule = new Map(userModuleAccess.map((item) => [item.module_code.toUpperCase(), item]));
  const moduleAccessModeByCode = new Map(moduleAccess.map((item: any) => [
    String(item.module_code || '').toUpperCase(),
    String(item.access_mode || 'LEGACY').trim().toUpperCase(),
  ]));

  // Load user's department, parent department, and role_level hierarchy safely
  const userWithDept = await (prisma.iam_user as any)
    .findUnique({
      where: { id: userId },
      select: {
        department_id: true,
        role_level: true,
        reports_to_user_id: true,
        job_title: true,
        department: { select: { code: true, name: true, unit_type: true } },
      },
    })
    .catch(() => null);

  const roleLevel = resolveEffectiveRoleLevel(userWithDept?.role_level);
  const deptRecord = userWithDept?.department ?? null;
  // Department membership provides organizational context and data scope only.
  // Operational module access is granted by an active module assignment (or a
  // company-admin user override in legacy mode), never by department membership.
  const mergedOverridesMap = new Map<string, ModulePermission>();

  // Dynamic module assignments + explicit permission overrides are the
  // operational access sources. Department data remains available below for
  // reporting and resource scoping, but does not create module grants.
  const activeCompanyId = superAdmin ? null : companyIds[0] ?? null;
  const [rawModuleAssignments, rawTierPermissions, rawPermOverrides, rawCrossCapabilities, rawDashboardWidgets] = activeCompanyId
    ? await Promise.all([
        (prisma as any).iam_user_module_assignment?.findMany?.({
          where: {
            company_id: activeCompanyId,
            user_id: userId,
            status: 'ACTIVE',
            AND: [
              { OR: [{ effective_from: null }, { effective_from: { lte: now } }] },
              { OR: [{ effective_until: null }, { effective_until: { gte: now } }] },
            ],
          },
          include: { role_profile: { include: { capabilities: true } } },
        }).catch(() => []) ?? [],
        (prisma as any).iam_module_tier_permission?.findMany?.({
          where: { company_id: activeCompanyId },
        }).catch(() => []) ?? [],
        (prisma as any).iam_user_permission_override?.findMany?.({
          where: { company_id: activeCompanyId, user_id: userId },
        }).catch(() => []) ?? [],
        (prisma as any).iam_cross_module_capability?.findMany?.({
          where: { company_id: activeCompanyId, user_id: userId, status: 'ACTIVE' },
        }).catch(() => []) ?? [],
        (prisma as any).iam_user_dashboard_access?.findMany?.({
          where: { company_id: activeCompanyId, user_id: userId },
        }).catch(() => []) ?? [],
      ])
    : [[], [], [], [], []];

  const dashboardWidgets: string[] =
    Array.isArray(rawDashboardWidgets) && rawDashboardWidgets.length > 0
      ? Array.from(
          new Set([
            'DASH_PERSONAL',
            ...rawDashboardWidgets
              .filter((w: any) => Boolean(w.is_enabled))
              .map((w: any) => String(w.widget_code || '').toUpperCase()),
          ])
        )
      : mergeLegacyRoleTranslations(roles).dashboard_widgets;

  const permissionOverrides: UserPermissionOverrideContext[] = (Array.isArray(rawPermOverrides) ? rawPermOverrides : []).map((po: any) => ({
    module_code: String(po.module_code || '').trim().toUpperCase(),
    action_code: String(po.action_code || '').trim().toUpperCase(),
    effect: String(po.effect || 'ALLOW').trim().toUpperCase(),
  }));

  const overrideEffectMap = new Map<string, string>();
  for (const po of permissionOverrides) {
    if (po.module_code && po.action_code) {
      overrideEffectMap.set(`${po.module_code}:${po.action_code}`, po.effect);
    }
  }

  const crossModuleCapabilities: CrossModuleCapabilityContext[] = (Array.isArray(rawCrossCapabilities) ? rawCrossCapabilities : []).map((cc: any) => {
    let actions: string[] = [];
    try {
      const parsed = JSON.parse(cc.allowed_actions || '[]');
      if (Array.isArray(parsed)) actions = parsed.map((a) => String(a).trim().toUpperCase());
    } catch {
      actions = [];
    }
    return {
      id: String(cc.id),
      source_module_code: String(cc.source_module_code || '').trim().toUpperCase(),
      target_module_code: String(cc.target_module_code || '').trim().toUpperCase(),
      capability_code: String(cc.capability_code || '').trim().toUpperCase(),
      allowed_actions: actions,
      status: String(cc.status || 'ACTIVE'),
    };
  });

  const tierPermMap = new Map<string, any>(
    (Array.isArray(rawTierPermissions) ? rawTierPermissions : []).map((tp: any) => [
      `${String(tp.module_code || '').toUpperCase()}:${Number(tp.tier_level)}`,
      tp,
    ])
  );

  const applyOverride = (modCode: string, actionKey: string, base: boolean): boolean => {
    const eff = overrideEffectMap.get(`${modCode}:${actionKey}`);
    if (eff === 'DENY') return false;
    if (eff === 'ALLOW') return true;
    return base;
  };

  const moduleAssignments: UserModuleAssignmentContext[] = (Array.isArray(rawModuleAssignments) ? rawModuleAssignments : []).map((ma: any) => {
    const code = String(ma.module_code || '').trim().toUpperCase();
    const tier = Number(ma.tier_level ?? 3);
    const tp = tierPermMap.get(`${code}:${tier}`);
    const profileCapabilities = new Set<string>(Array.isArray(ma.role_profile?.capabilities)
      ? ma.role_profile.capabilities
          .filter((capability: any) => String(capability.effect || 'ALLOW').toUpperCase() === 'ALLOW')
          .map((capability: any) => String(capability.capability_code || '').trim().toUpperCase())
      : []);
    const profileHas = (action: string) => profileCapabilities.has(action) || profileCapabilities.has(`${code}:${action}`);
    const hasProfile = Boolean(ma.profile_id && ma.role_profile?.is_active);
    const allowRead = hasProfile ? profileHas('READ') : applyOverride(code, 'READ', tp ? Boolean(tp.allow_read) : true);
    const allowWrite = hasProfile ? profileHas('WRITE') : applyOverride(code, 'WRITE', tp ? Boolean(tp.allow_write) : (tier === 0 ? code !== 'FINANCE' : tier >= 1));
    const allowApprove = hasProfile ? profileHas('APPROVE') : applyOverride(code, 'APPROVE', tp ? Boolean(tp.allow_approve) : tier <= 2);
    const allowDelete = hasProfile ? profileHas('DELETE') : applyOverride(code, 'DELETE', tp ? Boolean(tp.allow_delete) : tier === 1);
    const allowManageUsers = hasProfile ? profileHas('MANAGE_USERS') : applyOverride(code, 'MANAGE_USERS', tp ? Boolean(tp.allow_manage_users) : tier <= 1);
    return {
      id: String(ma.id),
      module_code: code,
      profile_id: ma.profile_id ? String(ma.profile_id) : null,
      profile_code: ma.role_profile?.profile_code ? String(ma.role_profile.profile_code) : ma.profile_code ? String(ma.profile_code) : null,
      legacy_role_code: ma.role_profile?.legacy_role_code ? String(ma.role_profile.legacy_role_code) : null,
      profile_active: Boolean(ma.role_profile?.is_active),
      capability_codes: Array.isArray(ma.role_profile?.capabilities)
        ? ma.role_profile.capabilities
            .filter((capability: any) => String(capability.effect || 'ALLOW').toUpperCase() === 'ALLOW')
            .map((capability: any) => String(capability.capability_code || '').trim().toUpperCase())
        : [],
      tier_level: tier,
      position_title: String(ma.position_title || (tier === 0 ? 'General Manager Oversight' : tier === 1 ? 'Module Head' : tier === 2 ? 'Supervisor / Lead' : 'Staff / Executor')),
      data_scope: String(ma.data_scope || (tier <= 1 ? 'ALL' : tier === 2 ? 'TEAM' : 'OWN')),
      department_id: ma.department_id ? String(ma.department_id) : null,
      scope_resource_ids: Array.isArray(ma.scope_resource_ids) ? ma.scope_resource_ids.map(String) : [],
      reports_to_user_id: ma.reports_to_user_id ?? null,
      status: String(ma.status || 'ACTIVE'),
      allow_read: allowRead,
      allow_write: allowWrite,
      allow_approve: allowApprove,
      allow_delete: allowDelete,
      allow_manage_users: allowManageUsers,
    };
  });

  // Module assignments are the only operational source of module access.
  for (const ma of moduleAssignments) {
    if (!ma.module_code) continue;
    mergedOverridesMap.set(ma.module_code, {
      module_code: ma.module_code,
      allow_read: ma.allow_read,
      allow_write: ma.allow_write,
    });
  }

  // 5. Explicit company-admin user overrides are applied last in legacy access mode.
  for (const uo of userModuleAccess) {
    const code = uo.module_code.toUpperCase();
    if (moduleAccessModeByCode.get(code) === 'ASSIGNMENT') continue;
    mergedOverridesMap.set(code, {
      module_code: code,
      allow_read: uo.allow_read,
      allow_write: uo.allow_write,
    });
  }

  const combinedUserAndDeptOverrides = Array.from(mergedOverridesMap.values());

  const enabledModules = moduleAccess
    .map((item) => item.module_code.toUpperCase())
    .filter((moduleCode) => moduleAccessModeByCode.get(moduleCode) === 'ASSIGNMENT'
      || (overrideByModule.get(moduleCode)?.allow_read ?? true));
  const filteredDashboardWidgets = dashboardWidgets.filter((widgetCode) => {
    const requiredModule = DASHBOARD_WIDGET_CATALOG.find((widget) => widget.code === widgetCode)?.required_module;
    if (!requiredModule) return true;
    const normalizedModule = requiredModule.toUpperCase();
    return enabledModules.includes(normalizedModule)
      && moduleAssignments.some((assignment) => assignment.module_code === normalizedModule && assignment.status === 'ACTIVE');
  });
  const projectDelegated = snapshot?.project_delegated
    ?? knownRows.projectDelegated
    ?? Boolean(membership && await prisma.project_member.findFirst({
      where: {
        tenant_id: membership.tenant_id,
        company_id: membership.company_id,
        user_id: userId,
        project_role: 'ACTING_PROJECT_MANAGER',
        status: 'ACTIVE',
      },
      select: { id: true },
    }));
  const delegatedModules = new Set(
    combinedUserAndDeptOverrides
      .filter((item) => item.allow_read && enabledModules.includes(item.module_code.toUpperCase()))
      .map((item) => item.module_code.toUpperCase()),
  );
  if (projectDelegated && enabledModules.includes('PROJECTS')) delegatedModules.add('PROJECTS');

  return {
    roles,
    activeRoleId,
    activeRoleCode,
    companyId: superAdmin ? null : companyIds[0] ?? null,
    companyIds,
    isSuperAdmin: superAdmin,
    enabledModules,
    delegatedModules: [...delegatedModules],
    moduleAccess: effectiveModuleOverrides(moduleAccess, combinedUserAndDeptOverrides),
    moduleAccessModes: moduleAccess.map((item: any) => ({
      module_code: String(item.module_code || '').toUpperCase(),
      access_mode: String(item.access_mode || 'LEGACY').trim().toUpperCase(),
    })),
    moduleAssignments,
    permissionOverrides,
    crossModuleCapabilities,
    departmentId: userWithDept?.department_id ?? null,
    departmentCode: deptRecord?.code ?? null,
    departmentName: deptRecord?.name ?? null,
    departmentUnitType: deptRecord?.unit_type ?? null,
    roleLevel,
    reportsToUserId: userWithDept?.reports_to_user_id ?? null,
    jobTitle: userWithDept?.job_title ?? '',
    dashboardWidgets: filteredDashboardWidgets,
    canApproveDivisionScope: moduleAssignments.some((m) => m.allow_approve),
    canOverrideBudget: moduleAssignments.some((m) => m.module_code === 'FINANCE' && m.allow_approve),
  };
}

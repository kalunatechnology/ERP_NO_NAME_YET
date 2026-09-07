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

export interface UserAccessContext {
  roles: RoleCode[];
  activeRoleId: string | null;
  activeRoleCode: RoleCode | null;
  companyId: string | null;
  companyIds: string[];
  isSuperAdmin: boolean;
  enabledModules: string[];
  delegatedModules: string[];
}

export interface KnownAccessRows {
  assignments?: iam_user_role[];
  membership?: iam_user_company_membership | null;
  roleRecords?: iam_role[];
  moduleAccess?: Array<{ module_code: string }>;
  userModuleAccess?: Array<{ module_code: string; allow_read: boolean; allow_write: boolean }>;
}

type AccessSnapshot = {
  assignments: iam_user_role[];
  membership: iam_user_company_membership | null;
  roles: Array<iam_role & { role_code: string }>;
  company_modules: Array<{ module_code: string }>;
  user_modules: Array<{ module_code: string; allow_read: boolean; allow_write: boolean }>;
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
      FROM iam_user WHERE id=${userId}::uuid LIMIT 1
    ), membership AS (
      SELECT m.* FROM iam_user_company_membership m WHERE m.user_id=${userId}::uuid LIMIT 1
    )
    SELECT to_jsonb(u) AS user_record, jsonb_build_object(
      'assignments', COALESCE((SELECT jsonb_agg(to_jsonb(ur)) FROM iam_user_role ur WHERE ur.user_id=u.id), '[]'::jsonb),
      'membership', (SELECT to_jsonb(m) FROM membership m),
      'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM iam_role r JOIN iam_user_role ur ON ur.role_id=r.id WHERE ur.user_id=u.id AND r.tenant_id IS NOT DISTINCT FROM u.tenant_id), '[]'::jsonb),
      'company_modules', COALESCE((SELECT jsonb_agg(jsonb_build_object('module_code',cma.module_code)) FROM iam_company_module_access cma JOIN membership m ON m.company_id=cma.company_id AND m.tenant_id=cma.tenant_id WHERE cma.enabled=true AND cma.allow_read=true AND (cma.effective_from IS NULL OR cma.effective_from<=${now}) AND (cma.effective_until IS NULL OR cma.effective_until>=${now})), '[]'::jsonb),
      'user_modules', COALESCE((SELECT jsonb_agg(jsonb_build_object('module_code',uma.module_code,'allow_read',uma.allow_read,'allow_write',uma.allow_write)) FROM iam_user_module_access uma JOIN membership m ON m.company_id=uma.company_id AND m.tenant_id=uma.tenant_id WHERE uma.user_id=u.id), '[]'::jsonb)
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
    && knownRows.userModuleAccess === undefined;
  const now = new Date();
  const rawSnapshots = useAtomicSnapshot
    ? await prisma.$queryRaw<Array<{ snapshot: AccessSnapshot }>>(Prisma.sql`
        WITH membership AS (
          SELECT m.* FROM iam_user_company_membership m
          WHERE m.user_id = ${userId}::uuid LIMIT 1
        )
        SELECT jsonb_build_object(
          'assignments', COALESCE((SELECT jsonb_agg(to_jsonb(ur)) FROM iam_user_role ur WHERE ur.user_id = ${userId}::uuid), '[]'::jsonb),
          'membership', (SELECT to_jsonb(m) FROM membership m),
          'roles', COALESCE((
            SELECT jsonb_agg(to_jsonb(r)) FROM iam_role r
            JOIN iam_user_role ur ON ur.role_id = r.id
            WHERE ur.user_id = ${userId}::uuid AND r.tenant_id IS NOT DISTINCT FROM ${user.tenant_id}::uuid
          ), '[]'::jsonb),
          'company_modules', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('module_code', cma.module_code))
            FROM iam_company_module_access cma JOIN membership m ON m.company_id = cma.company_id AND m.tenant_id = cma.tenant_id
            WHERE cma.enabled = true AND cma.allow_read = true
              AND (cma.effective_from IS NULL OR cma.effective_from <= ${now})
              AND (cma.effective_until IS NULL OR cma.effective_until >= ${now})
          ), '[]'::jsonb),
          'user_modules', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('module_code', uma.module_code, 'allow_read', uma.allow_read, 'allow_write', uma.allow_write))
            FROM iam_user_module_access uma JOIN membership m ON m.company_id = uma.company_id AND m.tenant_id = uma.tenant_id
            WHERE uma.user_id = ${userId}::uuid
          ), '[]'::jsonb)
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
          select: { module_code: true },
        }),
        // A missing record deliberately preserves inheritance from company access.
        prisma.iam_user_module_access.findMany({
          where: { user_id: userId, company_id: membership.company_id, tenant_id: membership.tenant_id },
          select: { module_code: true, allow_read: true, allow_write: true },
        }),
      ])
    : [[], []];
  const overrideByModule = new Map(userModuleAccess.map((item) => [item.module_code.toUpperCase(), item]));
  const enabledModules = moduleAccess
    .map((item) => item.module_code.toUpperCase())
    .filter((moduleCode) => overrideByModule.get(moduleCode)?.allow_read ?? true);

  return {
    roles,
    activeRoleId,
    activeRoleCode,
    companyId: superAdmin ? null : companyIds[0] ?? null,
    companyIds,
    isSuperAdmin: superAdmin,
    enabledModules,
    delegatedModules: userModuleAccess.filter((item) => item.allow_read).map((item) => item.module_code.toUpperCase()),
  };
}

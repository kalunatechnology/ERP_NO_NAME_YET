import { Request } from 'express';
import { hasModuleAssignmentCapability, isUsableModuleAssignment } from './module-assignments';

export enum ModuleAccessLevel {
  DIRECTOR = 0,
  MANAGER = 1,
  SUPERVISOR = 2,
  STAFF = 3,
}

export interface ModulePermission {
  module_code: string;
  allow_read: boolean;
  allow_write: boolean;
}

export interface ModuleAssignmentSummary {
  module_code: string;
  tier_level: number;
  data_scope?: string;
  profile_id?: string | null;
  profile_active?: boolean;
  capability_codes?: string[];
  allow_write?: boolean;
  allow_read?: boolean;
  status?: string;
}

/** Only the entitlement middleware may establish a module permission override. */
export function hasModuleOverride(req: Request, moduleCode?: string): boolean {
  const access = req.moduleAccess;
  if (!access?.delegated || !access.moduleCode || (moduleCode && access.moduleCode !== moduleCode)) return false;
  return ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())
    ? access.allowRead
    : access.allowRead && access.allowWrite;
}

/** Project domain checks use the same verified, company-bounded auth projection. */
export function getUserModuleOverride(user: { module_access?: ModulePermission[] } | undefined, moduleCode: string): ModulePermission | undefined {
  return user?.module_access?.find((item) => item.module_code === moduleCode);
}

export function hasUserModuleWrite(
  user: {
    module_access?: ModulePermission[];
    module_assignments?: ModuleAssignmentSummary[];
  } | undefined,
  moduleCode: string,
): boolean {
  const code = moduleCode.toUpperCase();
  const override = getUserModuleOverride(user, code);
  if (override) {
    return Boolean(override.allow_read && override.allow_write);
  }
  const assignments = user?.module_assignments?.filter(
    (item) => String(item.module_code || '').toUpperCase() === code,
  ) ?? [];
  return assignments.some((assignment) =>
    isUsableModuleAssignment(assignment, code)
    && assignment.allow_read !== false
    && hasModuleAssignmentCapability(assignment, 'WRITE'),
  );
}

/**
 * Returns the highest-authority (lowest numeric) active ModuleAccessLevel
 * assigned to the user for the given module, or null if none is active.
 */
export function getUserModuleAccessLevel(
  user: {
    module_assignments?: ModuleAssignmentSummary[];
  } | undefined,
  moduleCode: string,
): ModuleAccessLevel | null {
  const code = moduleCode.toUpperCase();
  const levels = (user?.module_assignments ?? [])
    .filter((assignment) => isUsableModuleAssignment(assignment, code))
    .map((assignment) => Number(assignment.tier_level))
    .filter((tier) => Number.isInteger(tier) && tier >= ModuleAccessLevel.DIRECTOR && tier <= ModuleAccessLevel.STAFF);
  if (!levels.length) return null;
  return Math.min(...levels) as ModuleAccessLevel;
}

/**
 * Returns true ONLY when the user holds explicit Manager-level (tier_level === 1)
 * write assignment on the module. Baseline Tier 3 (OWN) or Tier 2 (TEAM) task
 * grants must never confer Project Manager / module-wide management authority.
 */
export function hasUserModuleManagerWrite(
  user: {
    module_access?: ModulePermission[];
    module_assignments?: ModuleAssignmentSummary[];
  } | undefined,
  moduleCode: string,
): boolean {
  const code = moduleCode.toUpperCase();
  const assignments = user?.module_assignments?.filter(
    (item) => String(item.module_code || '').toUpperCase() === code,
  ) ?? [];
  if (assignments.some((assignment) => assignment.profile_id)) {
    return assignments.some((assignment) =>
      isUsableModuleAssignment(assignment, code)
      && hasModuleAssignmentCapability(assignment, 'WRITE')
      && String(assignment.data_scope || '').toUpperCase() === 'ALL'
      && hasModuleAssignmentCapability(assignment, 'MANAGE_USERS'),
    );
  }
  const override = getUserModuleOverride(user, code);
  if (override && (!override.allow_read || !override.allow_write)) return false;
  return assignments.some((assignment) =>
    isUsableModuleAssignment(assignment, code)
    && Number(assignment.tier_level) === ModuleAccessLevel.MANAGER
    && assignment.allow_read !== false
    && assignment.allow_write !== false,
  );
}

/**
 * Evaluates module authorization using default/base role OR module access level:
 * e.g. if module == PROJECTS: role_base in [PROJECT_MANAGER, ...] || level == MANAGER (1).
 */
export function hasModuleRoleOrLevel(
  user: {
    active_role_code?: string | null;
    roles?: string[];
    module_access?: ModulePermission[];
    module_assignments?: ModuleAssignmentSummary[];
  } | undefined,
  moduleCode: string,
  allowedBaseRoles: readonly string[],
  requiredLevel: ModuleAccessLevel = ModuleAccessLevel.MANAGER,
): boolean {
  if (!user) return false;
  const activeRole = String(user.active_role_code || '').trim().toUpperCase();
  const normalizedAllowed = new Set(allowedBaseRoles.map((r) => String(r).trim().toUpperCase()));
  const hasBaseRole = activeRole
    ? normalizedAllowed.has(activeRole)
    : (user.roles ?? []).some((r) => normalizedAllowed.has(String(r).trim().toUpperCase()));
  if (hasBaseRole) return true;

  if (requiredLevel === ModuleAccessLevel.MANAGER) {
    return hasUserModuleManagerWrite(user, moduleCode);
  }
  const level = getUserModuleAccessLevel(user, moduleCode);
  return level !== null && level <= requiredLevel && hasUserModuleWrite(user, moduleCode);
}

export function effectiveModuleOverrides(
  companyModules: Array<{ module_code: string; allow_write?: boolean }>,
  overrides: ModulePermission[],
): ModulePermission[] {
  const companyByCode = new Map(companyModules.map((item) => [item.module_code.toUpperCase(), item]));
  return overrides.map((item) => {
    const code = item.module_code.toUpperCase();
    const company = companyByCode.get(code);
    const allowRead = Boolean(company && item.allow_read);
    return { module_code: code, allow_read: allowRead, allow_write: allowRead && item.allow_write && company?.allow_write === true };
  });
}

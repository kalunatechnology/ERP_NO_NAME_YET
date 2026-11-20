/**
 * Shared validation for module assignments during the role-profile migration.
 * Profile assignments are authoritative when profile_id exists. Older
 * company-scoped assignments without a profile remain usable through their
 * module tier permission projection until administrators replace them.
 */
export function isUsableModuleAssignment(assignment: any, moduleCode?: string): boolean {
  const code = String(assignment?.module_code || '').trim().toUpperCase();
  if (!code || (moduleCode && code !== String(moduleCode).trim().toUpperCase())) return false;
  if (String(assignment?.status || '').trim().toUpperCase() !== 'ACTIVE') return false;

  if (assignment.profile_id) {
    return Boolean(assignment.profile_active)
      && String(assignment.profile_code || '').trim().toUpperCase().startsWith(`${code}:`);
  }

  // Legacy module-tier assignment. A stale profile_code without a linked
  // profile is not trusted; only tier rows with a valid tier can fall back.
  if (assignment.tier_level === null || assignment.tier_level === undefined
    || String(assignment.tier_level).trim() === '') return false;
  const tier = Number(assignment.tier_level);
  return !assignment.profile_code
    && Number.isInteger(tier)
    && tier >= 0
    && tier <= 3
    && assignment.allow_read !== false;
}

export function hasModuleAssignmentCapability(assignment: any, capabilityCode: string): boolean {
  const capability = String(capabilityCode || '').trim().toUpperCase();
  const fieldByCapability: Record<string, string> = {
    READ: 'allow_read',
    WRITE: 'allow_write',
    APPROVE: 'allow_approve',
    DELETE: 'allow_delete',
    MANAGE_USERS: 'allow_manage_users',
    EXPORT: 'allow_export',
  };
  const field = fieldByCapability[capability];
  if (field && typeof assignment?.[field] === 'boolean') return assignment[field];

  const moduleCode = String(assignment?.module_code || '').trim().toUpperCase();
  const capabilities = new Set((assignment?.capability_codes ?? []).map((item: unknown) => String(item).trim().toUpperCase()));
  return capabilities.has(capability) || capabilities.has(`${moduleCode}:${capability}`);
}

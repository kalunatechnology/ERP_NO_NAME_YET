import { Request } from 'express';

export interface ModulePermission {
  module_code: string;
  allow_read: boolean;
  allow_write: boolean;
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

export function hasUserModuleWrite(user: { module_access?: ModulePermission[] } | undefined, moduleCode: string): boolean {
  const override = getUserModuleOverride(user, moduleCode);
  return Boolean(override?.allow_read && override.allow_write);
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

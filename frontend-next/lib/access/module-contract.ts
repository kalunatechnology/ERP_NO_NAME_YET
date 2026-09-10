/**
 * Canonical frontend mirror of the module boundaries mounted in
 * `backend-express/src/app.ts`. UI routing, navigation, and API preflight must
 * consume this registry instead of deriving module codes from URL labels.
 */

export const MODULE_CODES = [
  "CORE", "REQUESTS", "CRM", "SALES", "PROJECTS", "FINANCE",
  "PROCUREMENT", "INVENTORY", "MANUFACTURING", "QUALITY", "ASSETS",
  "SERVICE", "LOGISTICS", "ANALYTICS", "IMPLEMENTATION", "REPORTING",
] as const;

export type ModuleCode = typeof MODULE_CODES[number];

export const ROLE_CODES = {
  superAdmin: "ROLE-SUPER-ADMIN",
  companyAdmin: "ROLE-COMPANY-ADMIN",
  director: "ROLE-DIRECTOR",
  operationalManager: "ROLE-OM",
  projectManager: "ROLE-PM",
  supervisor: "ROLE-SUPERVISOR",
  crmLead: "ROLE-CRM-LEAD",
  sales: "ROLE-SALES",
  finance: "ROLE-FINANCE",
  staff: "ROLE-STAFF",
} as const;

export function normalizeRoleCode(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  const aliases: Record<string, string> = {
    SUPER_ADMIN: ROLE_CODES.superAdmin,
    COMPANY_ADMIN: ROLE_CODES.companyAdmin,
    DIRECTOR: ROLE_CODES.director,
    OPERATIONAL_MANAGER: ROLE_CODES.operationalManager,
    PROJECT_MANAGER: ROLE_CODES.projectManager,
    SUPERVISOR: ROLE_CODES.supervisor,
    CRM_LEAD: ROLE_CODES.crmLead,
    SALES: ROLE_CODES.sales,
    FINANCE: ROLE_CODES.finance,
    STAFF: ROLE_CODES.staff,
  };
  return aliases[raw] ?? raw;
}

export function normalizeModuleCodes(values: readonly string[] | null | undefined): Set<ModuleCode> {
  const valid = new Set<string>(MODULE_CODES);
  return new Set(
    (values ?? [])
      .map((value) => String(value).trim().toUpperCase())
      .filter((value): value is ModuleCode => valid.has(value)),
  );
}

export interface RouteAccessContract {
  prefix: string;
  module: ModuleCode | null;
  roles: readonly string[] | null;
  moduleBypassRoles?: readonly string[];
}

/** Route contracts are ordered from the most specific route to the broadest. */
export const ROUTE_ACCESS_CONTRACTS: readonly RouteAccessContract[] = [
  { prefix: "/resources", module: "ANALYTICS", roles: [ROLE_CODES.superAdmin, ROLE_CODES.companyAdmin, ROLE_CODES.director], moduleBypassRoles: [ROLE_CODES.superAdmin, ROLE_CODES.companyAdmin] },
  { prefix: "/reporting", module: "REPORTING", roles: null },
  { prefix: "/projects", module: "PROJECTS", roles: [ROLE_CODES.projectManager, ROLE_CODES.operationalManager, ROLE_CODES.director, ROLE_CODES.supervisor, ROLE_CODES.staff] },
  { prefix: "/tasks", module: "PROJECTS", roles: [ROLE_CODES.projectManager, ROLE_CODES.operationalManager, ROLE_CODES.director, ROLE_CODES.supervisor, ROLE_CODES.staff] },
  { prefix: "/finance", module: "FINANCE", roles: [ROLE_CODES.finance, ROLE_CODES.director] },
  { prefix: "/crm", module: "CRM", roles: [ROLE_CODES.projectManager, ROLE_CODES.crmLead, ROLE_CODES.sales, ROLE_CODES.director] },
  { prefix: "/dashboard", module: null, roles: null },
] as const;

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function getRouteAccessContract(pathname: string): RouteAccessContract | undefined {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return ROUTE_ACCESS_CONTRACTS.find((contract) => matchesPrefix(path, contract.prefix));
}

export function hasModuleEntitlement(
  enabledModules: readonly string[] | null | undefined,
  module: ModuleCode | null | undefined,
  isSuperAdmin = false,
): boolean {
  if (!module || isSuperAdmin) return true;
  return normalizeModuleCodes(enabledModules).has(module);
}

export function canAccessRoute(input: {
  pathname: string;
  enabledModules?: readonly string[] | null;
  delegatedModules?: readonly string[] | null;
  activeRoleCode?: unknown;
  isSuperAdmin?: boolean;
}): boolean {
  const contract = getRouteAccessContract(input.pathname);
  if (!contract) return true;
  const activeRole = normalizeRoleCode(input.activeRoleCode);
  const superAdmin = Boolean(input.isSuperAdmin || activeRole === ROLE_CODES.superAdmin);
  if (superAdmin) return true;

  const bypassesModule = Boolean(contract.moduleBypassRoles?.includes(activeRole));
  if (!bypassesModule && !hasModuleEntitlement(input.enabledModules, contract.module)) return false;
  if (!contract.roles || contract.roles.includes(activeRole)) return true;

  // Backend requireRole accepts an explicit per-user module delegation after
  // requireModuleAccess. Preserve that exact exception on frontend routes.
  return Boolean(contract.module && normalizeModuleCodes(input.delegatedModules).has(contract.module));
}

export interface ApiAccessContract {
  prefix: string;
  module: ModuleCode;
  roles?: readonly string[];
  allowDelegation?: boolean;
}

const CRM_ROLES = [ROLE_CODES.crmLead, ROLE_CODES.sales, ROLE_CODES.projectManager, ROLE_CODES.director] as const;
const PROJECT_ROLES = [ROLE_CODES.projectManager, ROLE_CODES.operationalManager, ROLE_CODES.director, ROLE_CODES.supervisor, ROLE_CODES.staff] as const;
const FINANCE_ROLES = [ROLE_CODES.finance, ROLE_CODES.director] as const;

const API_ACCESS_CONTRACTS: readonly ApiAccessContract[] = [
  { prefix: "/api/v1/commands/reporting/crm-sales-dashboard", module: "CRM", roles: CRM_ROLES },
  { prefix: "/api/v1/commands/reporting/finance-main-dashboard", module: "FINANCE", roles: FINANCE_ROLES },
  { prefix: "/api/v1/commands/reporting/portfolio-financial-performance", module: "PROJECTS", roles: [ROLE_CODES.projectManager, ROLE_CODES.operationalManager, ROLE_CODES.director, ROLE_CODES.finance] },
  { prefix: "/api/v1/commands/sales", module: "SALES", roles: [ROLE_CODES.crmLead, ROLE_CODES.sales, ROLE_CODES.projectManager] },
  { prefix: "/api/v1/commands/projects", module: "PROJECTS", roles: PROJECT_ROLES },
  { prefix: "/api/v1/commands/finance", module: "FINANCE", roles: FINANCE_ROLES },
  { prefix: "/api/v1/requests", module: "REQUESTS" },
  { prefix: "/api/v1/crm", module: "CRM", roles: CRM_ROLES },
  { prefix: "/api/v1/sales", module: "SALES", roles: CRM_ROLES },
  { prefix: "/api/v1/projects", module: "PROJECTS", roles: PROJECT_ROLES },
  { prefix: "/api/v1/finance", module: "FINANCE", roles: FINANCE_ROLES },
  { prefix: "/api/v1/procurement", module: "PROCUREMENT" },
  { prefix: "/api/v1/inventory", module: "INVENTORY" },
  { prefix: "/api/v1/manufacturing", module: "MANUFACTURING" },
  { prefix: "/api/v1/quality", module: "QUALITY" },
  { prefix: "/api/v1/assets", module: "ASSETS" },
  { prefix: "/api/v1/service", module: "SERVICE" },
  { prefix: "/api/v1/logistics", module: "LOGISTICS" },
  { prefix: "/api/v1/analytics", module: "ANALYTICS" },
  { prefix: "/api/v1/implementation", module: "IMPLEMENTATION" },
  { prefix: "/api/v1/reporting", module: "REPORTING" },
] as const;

function requestPath(url: string): string {
  try {
    return new URL(url, "http://frontend.local").pathname;
  } catch {
    return url.split(/[?#]/, 1)[0];
  }
}

/** Resolves the module enforced by Backend for a concrete API endpoint. */
export function getApiAccessContract(url: string): ApiAccessContract | undefined {
  const path = requestPath(url);
  if (/^\/api\/v1\/requests\/[^/]+\/(?:validate-om|verify-lpj-om)\/?$/i.test(path)) {
    return { prefix: path, module: "REQUESTS", roles: [ROLE_CODES.operationalManager], allowDelegation: false };
  }
  if (/^\/api\/v1\/requests\/[^/]+\/approve-exec\/?$/i.test(path)) {
    return { prefix: path, module: "REQUESTS", roles: [ROLE_CODES.projectManager, ROLE_CODES.director], allowDelegation: false };
  }
  if (/^\/api\/v1\/requests\/[^/]+\/disburse\/?$/i.test(path)) {
    return { prefix: path, module: "REQUESTS", roles: [ROLE_CODES.finance], allowDelegation: false };
  }
  if (/^\/api\/v1\/crm\/opportunities\/[^/]+\/executive-override\/?$/i.test(path)
      || /^\/api\/v1\/crm\/executive-approvals\/[^/]+\/(?:decide|approve|reject)\/?$/i.test(path)) {
    return { prefix: path, module: "CRM", roles: [ROLE_CODES.director], allowDelegation: false };
  }
  const workflow = path.match(/^\/api\/v1\/commands\/workflow\/(?:transitions|execute)\/([^/]+)/i)?.[1]?.toUpperCase();
  if (workflow === "PROJECT") return { prefix: path, module: "PROJECTS" };
  if (workflow === "SALES_ORDER") return { prefix: path, module: "SALES" };
  if (workflow === "PURCHASE_ORDER") return { prefix: path, module: "PROCUREMENT" };
  return API_ACCESS_CONTRACTS.find((contract) => matchesPrefix(path, contract.prefix));
}

export interface FrontendAccessContext {
  enabledModules?: readonly string[] | null;
  delegatedModules?: readonly string[] | null;
  activeRoleCode?: unknown;
  isSuperAdmin?: boolean;
}

export function canRequestApi(url: string, access: FrontendAccessContext): boolean {
  const contract = getApiAccessContract(url);
  if (!contract) return true;
  const activeRole = normalizeRoleCode(access.activeRoleCode);
  const superAdmin = Boolean(access.isSuperAdmin || activeRole === ROLE_CODES.superAdmin);
  if (!hasModuleEntitlement(access.enabledModules, contract.module, superAdmin)) return false;
  if (superAdmin || !contract.roles || contract.roles.includes(activeRole)) return true;
  return contract.allowDelegation !== false && normalizeModuleCodes(access.delegatedModules).has(contract.module);
}

export type DashboardSection = "projects" | "finance" | "crm";

const DASHBOARD_SECTION_CONTRACTS: Record<DashboardSection, { module: ModuleCode; roles: readonly string[] }> = {
  projects: { module: "PROJECTS", roles: [...PROJECT_ROLES, ROLE_CODES.crmLead, ROLE_CODES.sales] },
  finance: { module: "FINANCE", roles: FINANCE_ROLES },
  crm: { module: "CRM", roles: CRM_ROLES },
};

/** Mirrors Dashboard BFF `SECTION_ROLES` without treating its sections as direct module URLs. */
export function canRequestDashboardSection(section: DashboardSection, access: FrontendAccessContext): boolean {
  const contract = DASHBOARD_SECTION_CONTRACTS[section];
  const activeRole = normalizeRoleCode(access.activeRoleCode);
  const superAdmin = Boolean(access.isSuperAdmin || activeRole === ROLE_CODES.superAdmin);
  if (!hasModuleEntitlement(access.enabledModules, contract.module, superAdmin)) return false;
  // Dashboard BFF canReadSection deliberately does not accept module delegation.
  return superAdmin || contract.roles.includes(activeRole);
}

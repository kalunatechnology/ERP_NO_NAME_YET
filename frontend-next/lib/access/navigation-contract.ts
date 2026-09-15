import { canAccessRoute, FrontendAccessContext, normalizeModuleCodes, normalizeRoleCode, ROLE_CODES } from "./module-contract";

export interface NavigationEntry {
  href: string;
  label: string;
}

const ROLE_NAVIGATION: Record<string, readonly NavigationEntry[]> = {
  [ROLE_CODES.superAdmin]: [
    { href: "/dashboard", label: "Governance Dashboard" },
    { href: "/administration", label: "Company & Access" },
    { href: "/reporting", label: "Global Reports" },
    { href: "/resources", label: "Data Explorer" },
  ],
  [ROLE_CODES.companyAdmin]: [
    { href: "/dashboard", label: "Company Dashboard" },
    { href: "/administration", label: "User & Access" },
    { href: "/reporting", label: "Reports" },
    { href: "/resources", label: "Data Explorer" },
  ],
  [ROLE_CODES.director]: [
    { href: "/dashboard", label: "Executive Dashboard" },
    { href: "/projects", label: "All Projects" },
    { href: "/finance", label: "Finance Preview" },
    { href: "/crm", label: "CRM Preview" },
    { href: "/reporting", label: "Performance" },
    { href: "/resources", label: "Data Explorer" },
  ],
  [ROLE_CODES.operationalManager]: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/projects", label: "Projects" },
    { href: "/tasks", label: "Daily Tasks" },
    { href: "/reporting", label: "Reports" },
  ],
  [ROLE_CODES.projectManager]: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/projects", label: "Projects" },
    { href: "/tasks", label: "Daily Tasks" },
    { href: "/crm", label: "CRM" },
    { href: "/reporting", label: "Reports" },
  ],
  [ROLE_CODES.supervisor]: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/projects", label: "Assigned Projects" },
    { href: "/tasks", label: "Daily Tasks" },
    { href: "/reporting", label: "Reports" },
  ],
  [ROLE_CODES.staff]: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/projects", label: "Assigned Projects" },
    { href: "/tasks", label: "Daily Tasks" },
    { href: "/reporting", label: "Reports" },
  ],
  [ROLE_CODES.finance]: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/finance", label: "Finance" },
    { href: "/reporting", label: "Reports" },
  ],
  [ROLE_CODES.crmLead]: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/crm", label: "CRM & Sales" },
    { href: "/reporting", label: "Reports" },
  ],
  [ROLE_CODES.sales]: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/crm", label: "CRM & Sales" },
    { href: "/reporting", label: "Reports" },
  ],
};

const DELEGATED_NAVIGATION: Partial<Record<string, readonly NavigationEntry[]>> = {
  PROJECTS: [{ href: "/projects", label: "Projects" }, { href: "/tasks", label: "Daily Tasks" }],
  CRM: [{ href: "/crm", label: "CRM & Sales" }],
  FINANCE: [{ href: "/finance", label: "Finance" }],
  REPORTING: [{ href: "/reporting", label: "Reports" }],
  ANALYTICS: [{ href: "/resources", label: "Data Explorer" }],
};

/** Keeps navigation discoverability aligned with the active route contract. */
export function getNavigationEntries(access: FrontendAccessContext): NavigationEntry[] {
  const role = access.isSuperAdmin ? ROLE_CODES.superAdmin : normalizeRoleCode(access.activeRoleCode);
  const base = ROLE_NAVIGATION[role] ?? [{ href: "/dashboard", label: "Dashboard" }];
  const delegated = Array.from(normalizeModuleCodes(access.delegatedModules))
    .flatMap((module) => DELEGATED_NAVIGATION[module] ?? []);
  const unique = [...base, ...delegated]
    .filter((entry, index, entries) => entries.findIndex((item) => item.href === entry.href) === index);
  return unique.filter((entry) => canAccessRoute({ pathname: entry.href, ...access }));
}

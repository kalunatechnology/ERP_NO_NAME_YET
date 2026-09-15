/**
 * File: frontend-next/lib/access/capability-contract.ts
 *
 * Canonical frontend capability contract for fine-grained action authorization.
 * Governs what an authenticated user can do inside a module (create, update, delete, operate).
 * Separation of concerns:
 * - Module Access (who can visit the route): managed by module-contract.ts
 * - Action Capability (what user can do inside): managed by this contract
 */

import { normalizeRoleCode, ROLE_CODES } from "./module-contract";

export type AppCapability =
  | "project:view"
  | "project:create"
  | "project:update"
  | "project:delete"
  | "finance:view"
  | "finance:operate"
  | "crm:view"
  | "crm:operate"
  | "attendance:view-team"
  | "attendance:self-input"
  | "repository:view"
  | "repository:technical";

/**
 * Normalizes any role input (UserRoleType or active_role_code) to standard key.
 */
export function resolveRoleKey(role?: string | null): string {
  if (!role) return "staff";
  const str = String(role).trim().toLowerCase();
  if (str === "executive" || str === "director" || str === "role-director") return "executive";
  if (str === "super_admin" || str === "role-super-admin") return "super_admin";
  if (str === "company_admin" || str === "role-company-admin") return "company_admin";
  if (str === "pm" || str === "project_manager" || str === "role-pm") return "pm";
  if (str === "om" || str === "operational_manager" || str === "role-om") return "om";
  if (str === "finance" || str === "role-finance") return "finance";
  if (str === "crm" || str === "crm_lead" || str === "sales" || str === "role-crm-lead" || str === "role-sales") return "crm";
  if (str === "staff" || str === "supervisor" || str === "role-staff" || str === "role-supervisor") return "staff";

  const norm = normalizeRoleCode(role);
  if (norm === ROLE_CODES.director) return "executive";
  if (norm === ROLE_CODES.superAdmin) return "super_admin";
  if (norm === ROLE_CODES.companyAdmin) return "company_admin";
  if (norm === ROLE_CODES.projectManager) return "pm";
  if (norm === ROLE_CODES.operationalManager) return "om";
  if (norm === ROLE_CODES.finance) return "finance";
  if (norm === ROLE_CODES.crmLead || norm === ROLE_CODES.sales) return "crm";
  return "staff";
}

/**
 * Evaluates whether a role has capability to perform an action.
 * Central single source of truth for UI mutation and oversight permissions.
 */
export function canPerform(
  capability: AppCapability,
  activeRoleOrRoleCode?: string | null
): boolean {
  const role = resolveRoleKey(activeRoleOrRoleCode);

  switch (capability) {
    case "project:view":
      return ["super_admin", "company_admin", "executive", "om", "pm", "staff", "crm", "finance"].includes(role);

    case "project:create":
      // Executive is an overseer - CANNOT create projects!
      // Super Admin is operationally read-only even though it can open the page.
      return ["company_admin", "om", "pm"].includes(role);

    case "project:update":
    case "project:delete":
      // Executive is an overseer - CANNOT modify or delete projects!
      return ["company_admin", "om", "pm"].includes(role);

    case "finance:view":
      return ["super_admin", "company_admin", "executive", "finance", "om", "pm"].includes(role);

    case "finance:operate":
      // Executive is view-only in Finance (cannot create cost entries, fund requests, approve, post to WIP, billing)
      return role === "finance";

    case "crm:view":
      return ["super_admin", "company_admin", "executive", "crm", "pm"].includes(role);

    case "crm:operate":
      // Executive is view-only in CRM (cannot create deals, edit limits, estimates, tickets, inquiries)
      return ["company_admin", "crm"].includes(role);

    case "attendance:view-team":
      // Executive, PM, OM, Super Admin can view team attendance
      return ["super_admin", "company_admin", "executive", "om", "pm"].includes(role);

    case "attendance:self-input":
      // Executive does not input personal timesheet/attendance from executive dashboard
      return ["staff", "pm", "om", "supervisor"].includes(role);

    case "repository:view":
      // Business repository is accessible to executive, managers, admins
      return ["super_admin", "company_admin", "executive", "om", "pm", "finance", "crm", "staff"].includes(role);

    case "repository:technical":
      // Technical raw OpenAPI explorer is strictly for super_admin
      return ["super_admin"].includes(role);

    default:
      return false;
  }
}

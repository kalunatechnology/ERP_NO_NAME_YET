import type { UserRoleType } from "@/contexts/AuthContext";
import { canRequestApi, FrontendAccessContext } from "./module-contract";

const ROLE_REPORT_TABS: Record<UserRoleType, readonly string[]> = {
  super_admin: ["executive", "periodic", "attendance"],
  company_admin: ["executive", "periodic", "attendance"],
  executive: ["executive", "project-pnl", "periodic", "attendance"],
  pm: ["executive", "project-pnl", "journals", "periodic", "attendance"],
  om: ["operational", "periodic", "attendance"],
  finance: ["executive", "project-pnl", "journals", "periodic", "attendance"],
  crm: ["executive", "periodic", "attendance"],
  staff: ["periodic", "attendance"],
};

export function canOpenReportTab(tabId: string, role: UserRoleType, access: FrontendAccessContext): boolean {
  if (!ROLE_REPORT_TABS[role].includes(tabId)) return false;
  const canReadProjects = canRequestApi("/api/v1/projects/projects/", access);
  const canReadFinance = canRequestApi("/api/v1/finance/project-cost-entries/", access);
  if (tabId === "project-pnl") return canReadProjects && canReadFinance;
  if (tabId === "executive") return canReadProjects;
  if (tabId === "journals") return canReadFinance;
  return true;
}

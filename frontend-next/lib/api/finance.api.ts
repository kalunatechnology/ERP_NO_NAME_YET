/**
 * Finance Dashboard API
 * Consolidated data fetching for Finance and Executive dashboards
 */

import api from "./axios";
import { normalizeList } from "./auth.api";

export interface FinanceKPIs {
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  pendingRequests: number;
  pendingAmount: number;
  approvedRequests: number;
  approvedAmount: number;
  rejectedRequests: number;
  budgetUtilization: number; // 0-100%
}

export interface FinancePendingItem {
  id: string | number;
  type: "funding" | "billing" | "cost";
  label: string;
  project?: string;
  amount: number;
  status: string;
  date?: string;
  urgency: "urgent" | "normal";
}

export interface FinanceSummaryByProject {
  projectId: string | number;
  projectName: string;
  budget: number;
  spent: number;
  utilization: number;
  pendingAmount: number;
}

export interface FinanceDashboardData {
  kpis: FinanceKPIs;
  pendingItems: FinancePendingItem[];
  recentTransactions: any[];
  projectSummaries: FinanceSummaryByProject[];
  rawCostEntries: any[];
  rawFundings: any[];
  rawBillingProposals: any[];
  rawProjects: any[];
}

export async function loadFinanceDashboard(): Promise<FinanceDashboardData> {
  const [costRes, fundRes, propRes, projRes] = await Promise.all([
    api.get("/api/v1/finance/project-cost-entries/?page_size=200").catch(() => ({ data: [] })),
    api.get("/api/v1/finance/project-fundings/?page_size=200").catch(() => ({ data: [] })),
    api.get("/api/v1/finance/billing-proposals/?page_size=200").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/projects/?page_size=100").catch(() => ({ data: [] })),
  ]);

  const rawCostEntries     = normalizeList<any>(costRes.data).rows;
  const rawFundings        = normalizeList<any>(fundRes.data).rows;
  const rawBillingProposals = normalizeList<any>(propRes.data).rows;
  const rawProjects        = normalizeList<any>(projRes.data).rows;

  /* ── KPI calculations ─────────────────────── */
  // Total budget = sum of project budgets
  const totalBudget = rawProjects.reduce((acc, p) => acc + (Number(p.budget_amount || p.total_budget || p.budget || 0)), 0);

  // Used budget = sum of validated cost entries
  const validatedCosts = rawCostEntries.filter(c => c.is_validated || c.status === "VALIDATED" || c.status === "APPROVED");
  const usedBudget = validatedCosts.reduce((acc, c) => acc + Number(c.amount || 0), 0);

  const remainingBudget = Math.max(0, totalBudget - usedBudget);
  const budgetUtilization = totalBudget > 0 ? Math.min(100, Math.round((usedBudget / totalBudget) * 100)) : 0;

  // Pending items (fundings + billing not yet approved)
  const pendingFundings  = rawFundings.filter(f => !["APPROVED", "DISBURSED", "COMPLETED"].includes((f.status || "").toUpperCase()));
  const pendingBillings  = rawBillingProposals.filter(b => !["APPROVED", "PAID", "COMPLETED"].includes((b.status || "").toUpperCase()));
  const approvedFundings = rawFundings.filter(f => ["APPROVED", "DISBURSED"].includes((f.status || "").toUpperCase()));
  const approvedBillings = rawBillingProposals.filter(b => ["APPROVED", "PAID"].includes((b.status || "").toUpperCase()));
  const rejectedFundings = rawFundings.filter(f => ["REJECTED", "CANCELLED"].includes((f.status || "").toUpperCase()));
  const rejectedBillings = rawBillingProposals.filter(b => ["REJECTED", "CANCELLED"].includes((b.status || "").toUpperCase()));

  const pendingRequests  = pendingFundings.length + pendingBillings.length;
  const pendingAmount    = [...pendingFundings, ...pendingBillings].reduce((acc, x) => acc + Number(x.amount || 0), 0);
  const approvedRequests = approvedFundings.length + approvedBillings.length;
  const approvedAmount   = [...approvedFundings, ...approvedBillings].reduce((acc, x) => acc + Number(x.amount || 0), 0);
  const rejectedRequests = rejectedFundings.length + rejectedBillings.length;

  const kpis: FinanceKPIs = {
    totalBudget, usedBudget, remainingBudget, pendingRequests, pendingAmount,
    approvedRequests, approvedAmount, rejectedRequests, budgetUtilization,
  };

  /* ── Pending items list (for Need Action panel) ─ */
  const pendingItems: FinancePendingItem[] = [];

  pendingFundings.forEach(f => {
    const amt = Number(f.amount || 0);
    pendingItems.push({
      id: f.id,
      type: "funding",
      label: f.purpose || `Pengajuan Dana #${String(f.id).slice(0, 6)}`,
      project: f.project_name || String(f.project || ""),
      amount: amt,
      status: f.status || "PENDING",
      date: f.created_at || f.date,
      urgency: amt > 50_000_000 ? "urgent" : "normal",
    });
  });

  pendingBillings.forEach(b => {
    const amt = Number(b.amount || 0);
    pendingItems.push({
      id: b.id,
      type: "billing",
      label: b.description || `Billing Termin #${String(b.id).slice(0, 6)}`,
      project: b.project_name || String(b.project || ""),
      amount: amt,
      status: b.status || "PENDING",
      date: b.created_at || b.date,
      urgency: amt > 50_000_000 ? "urgent" : "normal",
    });
  });

  // Sort: urgent first, then by date desc
  pendingItems.sort((a, b) => {
    if (a.urgency === "urgent" && b.urgency !== "urgent") return -1;
    if (b.urgency === "urgent" && a.urgency !== "urgent") return 1;
    return (b.date || "").localeCompare(a.date || "");
  });

  /* ── Recent transactions ─────────────────── */
  const recentTransactions = [
    ...rawCostEntries.map(c => ({
      id: c.id, type: "cost", label: c.description || `Biaya ${c.category || ""}`,
      amount: Number(c.amount || 0), date: c.date || c.created_at,
      status: c.is_validated ? "VALIDATED" : "PENDING",
      project: c.project_name || String(c.project || ""),
    })),
    ...rawFundings.map(f => ({
      id: f.id, type: "funding", label: f.purpose || "Pengajuan Dana",
      amount: Number(f.amount || 0), date: f.created_at,
      status: f.status || "PENDING",
      project: f.project_name || String(f.project || ""),
    })),
    ...rawBillingProposals.map(b => ({
      id: b.id, type: "billing", label: b.description || "Billing Termin",
      amount: Number(b.amount || 0), date: b.created_at,
      status: b.status || "PENDING",
      project: b.project_name || String(b.project || ""),
    })),
  ]
    .filter(t => t.date)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 20);

  /* ── Per-project financial summary ──────── */
  const projectSummaries: FinanceSummaryByProject[] = rawProjects.map(p => {
    const pid = String(p.id);
    const budget = Number(p.budget_amount || p.total_budget || p.budget || 0);
    const projectCosts = rawCostEntries
      .filter(c => String(c.project) === pid)
      .reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const projectPending = [...rawFundings, ...rawBillingProposals]
      .filter(x => String(x.project) === pid && !["APPROVED", "PAID", "DISBURSED"].includes((x.status || "").toUpperCase()))
      .reduce((acc, x) => acc + Number(x.amount || 0), 0);

    return {
      projectId: p.id,
      projectName: p.project_name || p.name || `Project #${pid.slice(0, 6)}`,
      budget,
      spent: projectCosts,
      utilization: budget > 0 ? Math.min(100, Math.round((projectCosts / budget) * 100)) : 0,
      pendingAmount: projectPending,
    };
  });

  return {
    kpis, pendingItems, recentTransactions, projectSummaries,
    rawCostEntries, rawFundings, rawBillingProposals, rawProjects,
  };
}

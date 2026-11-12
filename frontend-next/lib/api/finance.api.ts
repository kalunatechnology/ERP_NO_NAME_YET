/**
 * Purpose: Defines frontend API adapter contracts and their integration boundary for the frontend application.
 * Responsibility: Documents and exposes only the behavior implemented in this file; function comments identify inputs, outputs, dependencies, and side effects.
 * Finance Dashboard API
 * Consolidated data fetching for Finance and Executive dashboards
 */

import api from "./axios";
import { normalizeList } from "./auth.api";
import { canRequestApi, FrontendAccessContext } from "@/lib/access/module-contract";

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

export interface FinanceDashboardBundle {
  view?: FinanceDashboardData;
  costEntries?: any[];
  fundings?: any[];
  billingProposals?: any[];
  projects?: any[];
}

/**
 * loadFinanceDashboard adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/finance/project-cost-entries/?page_size=200`, `/api/v1/finance/project-fundings/?page_size=200`, `/api/v1/finance/billing-proposals/?page_size=200`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function loadFinanceDashboard(enabledModules: string[] = [], bundle?: FinanceDashboardBundle, access?: Omit<FrontendAccessContext, "enabledModules">): Promise<FinanceDashboardData> {
  if (bundle?.view) return bundle.view;
  const canReadProjects = canRequestApi("/api/v1/projects/projects/", { ...access, enabledModules });
  const [costRes, fundRes, propRes, projRes] = bundle
    ? [{ data: bundle.costEntries || [] }, { data: bundle.fundings || [] }, { data: bundle.billingProposals || [] }, { data: bundle.projects || [] }]
    : await Promise.all([
        api.get("/api/v1/finance/project-cost-entries/?page_size=200"),
        api.get("/api/v1/finance/project-fundings/?page_size=200"),
        api.get("/api/v1/finance/billing-proposals/?page_size=200"),
        canReadProjects ? api.get("/api/v1/projects/projects/?page_size=100") : Promise.resolve({ data: [] }),
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
      label: f.purpose || (f.project_name ? `Pengajuan Dana - ${f.project_name}` : "Pengajuan Dana Proyek"),
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

export interface RealMonthlyStackedDataPoint {
  month: string;
  bottomValue: number;
  topValue: number;
  hasData?: boolean;
  fullDate?: string;
  notes?: string;
}

export interface RealMonthlyStackedResponse {
  data: RealMonthlyStackedDataPoint[];
  maxValue: number;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface BuildMonthlyStackedOptions {
  receipts?: any[];
  costs?: any[];
  proposals?: any[];
  includeProposalsInTop?: boolean;
  startDate?: string;
  endDate?: string;
}

function formatMonthNoteAmount(valueInJt: number): string {
  if (valueInJt <= 0) return "Rp 0";
  if (valueInJt >= 1) return `Rp ${valueInJt.toLocaleString("id-ID", { maximumFractionDigits: 2 })} Jt`;
  const valueInRp = Math.round(valueInJt * 1_000_000);
  if (valueInRp >= 1_000) return `Rp ${(valueInRp / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} rb`;
  return `Rp ${valueInRp.toLocaleString("id-ID")}`;
}

/** Build monthly chart values from finance rows already loaded by the caller. */
export function buildMonthlyStackedData({
  receipts = [],
  costs = [],
  proposals = [],
  includeProposalsInTop = false,
  startDate,
  endDate,
}: BuildMonthlyStackedOptions): RealMonthlyStackedResponse {
  const monthlyBottomRp = new Array(12).fill(0) as number[];
  const monthlyTopRp = new Array(12).fill(0) as number[];
  const startBound = startDate?.slice(0, 10) || "";
  const endBound = endDate?.slice(0, 10) || "";

  const addToMonth = (target: number[], dateValue: unknown, amountValue: unknown) => {
    if (!dateValue || amountValue == null) return;
    const dateText = String(dateValue);
    const dateKey = dateText.slice(0, 10);
    if ((startBound && dateKey < startBound) || (endBound && dateKey > endBound)) return;
    const date = new Date(dateText);
    const amount = Number(amountValue);
    if (Number.isNaN(date.getTime()) || !Number.isFinite(amount) || amount <= 0) return;
    const month = date.getMonth();
    if (month >= 0 && month < 12) target[month] += amount;
  };

  receipts
    .filter((receipt) => ["POSTED", "PAID", "COMPLETED", "SETTLED"].includes(String(receipt?.status || "").toUpperCase()))
    .forEach((receipt) => addToMonth(
      monthlyBottomRp,
      receipt.payment_date ?? receipt.receipt_date ?? receipt.transaction_date ?? receipt.created_at,
      receipt.amount ?? receipt.total_amount ?? receipt.paid_amount,
    ));

  costs
    .filter((cost) => !["REJECTED", "CANCELLED", "VOID"].includes(String(cost?.status || "").toUpperCase()))
    .forEach((cost) => addToMonth(
      monthlyTopRp,
      cost.transaction_date ?? cost.date ?? cost.created_at,
      cost.total_cost ?? cost.amount ?? cost.cost_amount ?? cost.total_amount,
    ));

  if (includeProposalsInTop) {
    proposals
      .filter((proposal) => !["REJECTED", "CANCELLED"].includes(String(proposal?.status || "").toUpperCase()))
      .forEach((proposal) => addToMonth(
        monthlyTopRp,
        proposal.approved_at ?? proposal.submitted_at ?? proposal.created_at,
        proposal.total_amount ?? proposal.amount ?? proposal.subtotal,
      ));
  }

  let highestTotalJt = 0;
  const data: RealMonthlyStackedDataPoint[] = MONTH_NAMES.map((month, index) => {
    const rawBottomRp = monthlyBottomRp[index];
    const rawTopRp = monthlyTopRp[index];
    const hasData = rawBottomRp > 0 || rawTopRp > 0;
    const bottomValue = rawBottomRp > 0 ? Number((rawBottomRp / 1_000_000).toFixed(4)) : 0;
    const topValue = rawTopRp > 0 ? Number((rawTopRp / 1_000_000).toFixed(4)) : 0;
    highestTotalJt = Math.max(highestTotalJt, bottomValue + topValue);
    return {
      month,
      bottomValue,
      topValue,
      hasData,
      notes: hasData
        ? `Realisasi: ${formatMonthNoteAmount(bottomValue)} · Biaya Proyek: ${formatMonthNoteAmount(topValue)}`
        : "Belum ada data transaksi tercatat",
    };
  });

  return { data, maxValue: Math.max(500, Math.ceil((highestTotalJt || 500) / 100) * 100) };
}

/**
 * fetchRealMonthlyStackedData adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: loads billing proposals, customer receipts, fallback customer payments, and project cost entries through the shared Axios client. Authentication, company scope, timeout, and idempotency are inherited from that client.
 * Failure behavior: tolerates an individual endpoint failure, but rejects when every source needed for the chart fails so the UI can report the load problem.
 */
export async function fetchRealMonthlyStackedData(params?: {
  startDate?: string;
  endDate?: string;
  includeProposalsInTop?: boolean;
}): Promise<RealMonthlyStackedResponse> {
  const dateFilter = (field: string) => params?.startDate && params?.endDate
    ? `&${field}__gte=${encodeURIComponent(params.startDate)}&${field}__lte=${encodeURIComponent(params.endDate)}`
    : "";
  const [proposalsResult, receiptsResult, paymentsResult, costsResult] = await Promise.allSettled([
    api.get(`/api/v1/finance/billing-proposals/?page_size=200${dateFilter("created_at")}`),
    api.get(`/api/v1/finance/customer-receipts/?page_size=200${dateFilter("payment_date")}`),
    api.get(`/api/v1/finance/payments/?payment_type=CUSTOMER_RECEIPT&page_size=200${dateFilter("payment_date")}`),
    api.get(`/api/v1/finance/project-cost-entries/?page_size=200${dateFilter("transaction_date")}`),
  ]);
  const proposals = proposalsResult.status === "fulfilled" ? normalizeList<any>(proposalsResult.value.data).rows : [];
  const customerReceipts = receiptsResult.status === "fulfilled" ? normalizeList<any>(receiptsResult.value.data).rows : [];
  const incomingPayments = paymentsResult.status === "fulfilled" ? normalizeList<any>(paymentsResult.value.data).rows : [];
  const costs = costsResult.status === "fulfilled" ? normalizeList<any>(costsResult.value.data).rows : [];

  if (receiptsResult.status === "rejected" && paymentsResult.status === "rejected" && costsResult.status === "rejected") {
    throw new Error("Data penerimaan dan biaya proyek gagal dimuat.");
  }

  return buildMonthlyStackedData({
    receipts: customerReceipts.length > 0 ? customerReceipts : incomingPayments,
    costs,
    proposals,
    includeProposalsInTop: params?.includeProposalsInTop ?? false,
    startDate: params?.startDate,
    endDate: params?.endDate,
  });
}

/**
 * CRM & Sales API — Consolidated service matching uji_prototype/js/services/crm.service.js
 * All endpoints and workflow actions from the validated prototype
 */

import api from "./axios";
import { normalizeList } from "./auth.api";

/* ── Types ───────────────────────────────────────── */
export interface CRMData {
  inquiries: any[];
  requirements: any[];
  opportunities: any[];
  stages: any[];
  estimates: any[];
  estimateLines: any[];
  quotations: any[];
  approvals: any[];
  deliveries: any[];
  contracts: any[];
  orders: any[];
  conversations: any[];
  feedback: any[];
  credit: any[];
  cases: any[];
  resolutions: any[];
  products: any[];
  parties: any[];
}

export interface CRMDashboard {
  weighted_project_value?: number;
  win_rate_percent?: number;
  average_sales_cycle_days?: number;
  offering_margin_percent?: number;
  quotation_pending_approval_count?: number;
  [key: string]: any;
}

/* ── Endpoints map ───────────────────────────────── */
const CRM_SOURCES: Record<keyof CRMData, string> = {
  inquiries:    "/api/v1/crm/customer-inquiries/?page_size=100",
  requirements: "/api/v1/crm/inquiry-requirements/?page_size=200",
  opportunities:"/api/v1/crm/opportunities/?page_size=100",
  stages:       "/api/v1/crm/pipeline-stages/?page_size=100",
  estimates:    "/api/v1/crm/cost-estimates/?page_size=100",
  estimateLines:"/api/v1/crm/cost-estimate-lines/?page_size=200",
  quotations:   "/api/v1/sales/quotations/?page_size=100",
  approvals:    "/api/v1/crm/executive-approvals/?page_size=100",
  deliveries:   "/api/v1/crm/quotation-deliveries/?page_size=100",
  contracts:    "/api/v1/sales/contracts/?page_size=100",
  orders:       "/api/v1/sales/orders/?page_size=100",
  conversations:"/api/v1/crm/conversations/?page_size=100",
  feedback:     "/api/v1/crm/feedbacks/?page_size=100",
  credit:       "/api/v1/crm/credit-status-snapshots/?page_size=100",
  cases:        "/api/v1/service/cases/?page_size=100",
  resolutions:  "/api/v1/service/resolutions/?page_size=100",
  products:     "/api/v1/master-data/products/?page_size=200",
  parties:      "/api/v1/master-data/parties/?page_size=300",
};

/* ── Data Loading ─────────────────────────────────── */
export async function loadCRMData(): Promise<{ data: CRMData; dashboard: CRMDashboard }> {
  const entries = await Promise.all(
    Object.entries(CRM_SOURCES).map(async ([key, path]) => {
      try {
        const res = await api.get(path);
        return [key, normalizeList<any>(res.data).rows];
      } catch {
        return [key, []];
      }
    })
  );

  let dashboard: CRMDashboard = {};
  try {
    const dashRes = await api.get("/api/v1/commands/reporting/crm-sales-dashboard/");
    dashboard = dashRes.data?.data || dashRes.data || {};
  } catch {
    dashboard = {};
  }

  return {
    data: Object.fromEntries(entries) as CRMData,
    dashboard,
  };
}

/* ── Opportunity Actions ─────────────────────────── */
export async function processDealWon(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/opportunities/${id}/process-deal-won/`, {});
  return data;
}

export async function executiveOverrideCredit(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/opportunities/${id}/executive-override/`, {});
  return data;
}

export async function createOpportunity(payload: {
  opportunity_name: string;
  customer_party?: string | number | null;
  expected_amount?: number;
  expected_margin?: number;
  probability_percent?: number;
  pipeline_stage?: string;
}) {
  const { data } = await api.post("/api/v1/crm/opportunities/", {
    opportunity_name: payload.opportunity_name,
    customer_party: payload.customer_party || null,
    expected_amount: payload.expected_amount || 0,
    expected_margin: payload.expected_margin || 0,
    probability_percent: payload.probability_percent || 50,
    pipeline_stage: payload.pipeline_stage || "OPEN",
    status: "OPEN",
  });
  return data;
}

export async function deleteOpportunity(id: string | number) {
  await api.delete(`/api/v1/crm/opportunities/${id}/`);
}

/* ── Customer Inquiry Actions ────────────────────── */
export async function qualifyInquiry(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/customer-inquiries/${id}/qualify/`, {});
  return data;
}

export async function createCustomerInquiry(payload: {
  subject: string;
  customer_name: string;
  customer_email?: string;
  customer_party?: string | number | null;
  description?: string;
  expected_delivery_date?: string | null;
}) {
  const { data } = await api.post("/api/v1/crm/customer-inquiries/", {
    subject: payload.subject,
    customer_name: payload.customer_name,
    customer_email: payload.customer_email || "",
    customer_party: payload.customer_party || null,
    description: payload.description || "",
    expected_delivery_date: payload.expected_delivery_date || null,
    status: "NEW",
  });
  return data;
}

export async function createInquiryRequirement(payload: {
  inquiry: string | number;
  product?: string | number | null;
  description?: string;
  quantity?: number;
  target_unit_price?: number;
  requirement_type?: string;
}) {
  const { data } = await api.post("/api/v1/crm/inquiry-requirements/", {
    inquiry: payload.inquiry,
    product: payload.product || null,
    description: payload.description || "Item Spesifikasi Kebutuhan",
    quantity: payload.quantity || 1,
    target_unit_price: payload.target_unit_price || 0,
    requirement_type: payload.requirement_type || "PRODUCT",
    status: "QUALIFIED",
  });
  return data;
}

export async function deleteCustomerInquiry(id: string | number) {
  await api.delete(`/api/v1/crm/customer-inquiries/${id}/`);
}

/* ── Cost Estimate Actions ───────────────────────── */
export async function createCostEstimate(payload: {
  opportunity?: string | number | null;
  inquiry?: string | number | null;
  direct_cost: number;
  overhead_cost?: number;
  markup_percent?: number;
  description?: string;
}) {
  const directCost   = Number(payload.direct_cost || 0);
  const overheadCost = Number(payload.overhead_cost || 0);
  const totalCost    = directCost + overheadCost;
  const markupPct    = Number(payload.markup_percent || 30);
  const offeredAmt   = totalCost * (1 + markupPct / 100);

  const { data } = await api.post("/api/v1/crm/cost-estimates/", {
    opportunity:     payload.opportunity || null,
    inquiry:         payload.inquiry || null,
    estimate_number: `EST-${Date.now().toString().slice(-6)}`,
    direct_cost:     directCost,
    overhead_cost:   overheadCost,
    total_cost:      totalCost,
    markup_percent:  markupPct,
    offered_amount:  offeredAmt,
    status:          "DRAFT",
  });

  // Auto-create lines
  if (data?.id) {
    try {
      await api.post("/api/v1/crm/cost-estimate-lines/", {
        estimate: data.id, cost_element: "MATERIAL",
        description: payload.description || "Biaya Langsung Pengadaan / Produksi",
        quantity: 1, unit_cost: directCost, amount: directCost,
      });
      if (overheadCost > 0) {
        await api.post("/api/v1/crm/cost-estimate-lines/", {
          estimate: data.id, cost_element: "OVERHEAD",
          description: "Biaya Operasional & Overhead",
          quantity: 1, unit_cost: overheadCost, amount: overheadCost,
        });
      }
    } catch { /* ignore line provisioning errors */ }
  }
  return data;
}

export async function calculateCostEstimate(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/cost-estimates/${id}/calculate/`, {});
  return data;
}

export async function createQuotationFromEstimate(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/cost-estimates/${id}/create-quotation/`, {});
  return data;
}

export async function deleteCostEstimate(id: string | number) {
  await api.delete(`/api/v1/crm/cost-estimates/${id}/`);
}

/* ── Quotation Workflow ──────────────────────────── */
export async function submitQuotationApproval(id: string | number) {
  const { data } = await api.post(`/api/v1/sales/quotations/${id}/submit-approval/`, {});
  return data;
}

export async function approveQuotation(quotationId: string | number, approvalsData: any[] = []) {
  // Find pending approval record for this quotation
  let approvalId: string | number | null = null;
  const localApproval = approvalsData.find(
    a => String(a.quotation) === String(quotationId) && a.decision === "PENDING"
  );
  if (localApproval) {
    approvalId = localApproval.id;
  } else {
    try {
      const res = await api.get(`/api/v1/crm/executive-approvals/?quotation=${quotationId}`);
      const rows = normalizeList<any>(res.data).rows;
      const pending = rows.find(a => a.decision === "PENDING") || rows[0];
      if (pending) approvalId = pending.id;
    } catch { /* ignore */ }
  }
  if (!approvalId) throw new Error("Record Executive Approval tidak ditemukan untuk Quotation ini.");

  const { data } = await api.post(`/api/v1/crm/executive-approvals/${approvalId}/decide/`, {
    decision: "APPROVED",
    remarks: "Disetujui oleh Operations Manager",
  });
  return data;
}

export async function sendQuotation(id: string | number) {
  const { data } = await api.post(`/api/v1/sales/quotations/${id}/send/`, {
    channel: "EMAIL",
    recipient: "customer@example.com",
  });
  return data;
}

export async function acceptQuotation(id: string | number) {
  const { data } = await api.post(`/api/v1/sales/quotations/${id}/customer-decision/`, { accepted: true });
  return data;
}

export async function rejectQuotation(id: string | number, reason = "Customer menolak penawaran harga") {
  const { data } = await api.post(`/api/v1/sales/quotations/${id}/customer-decision/`, {
    accepted: false, reason,
  });
  return data;
}

export async function convertQuotationToOrder(id: string | number) {
  const { data } = await api.post(`/api/v1/commands/sales/quotations/${id}/convert-to-order/`, {
    fulfillment_method: "PROJECT",
  });
  return data;
}

/* ── Support Tickets ─────────────────────────────── */
export async function createSupportTicket(payload: {
  subject: string;
  customer_party?: string | number | null;
  priority?: string;
  case_type?: string;
  description?: string;
}) {
  const { data } = await api.post("/api/v1/service/cases/", {
    subject: payload.subject,
    customer_party: payload.customer_party || null,
    priority: payload.priority || "NORMAL",
    case_type: payload.case_type || "WARRANTY_CLAIM",
    description: payload.description || "",
    status: "OPEN",
  });
  return data;
}

export async function checkTicketWarrantyStatus(id: string | number) {
  const { data } = await api.post(`/api/v1/service/cases/${id}/check-status/`, {});
  return data;
}

export async function deleteSupportTicket(id: string | number) {
  await api.delete(`/api/v1/service/cases/${id}/`);
}

/* ── Credit Management ───────────────────────────── */
export async function updateCustomerCreditLimit(payload: {
  party_id: string | number;
  credit_limit: number;
  credit_hold?: boolean;
  risk_category?: string;
}) {
  const { data } = await api.post("/api/v1/master-data/customer-profiles/set-credit-limit/", {
    party_id: payload.party_id,
    credit_limit: payload.credit_limit,
    credit_hold: payload.credit_hold || false,
    risk_category: payload.risk_category || "LOW",
  });
  return data;
}

export async function calculateCreditSnapshot(customerPartyId: string | number) {
  const { data } = await api.post("/api/v1/crm/credit-status-snapshots/calculate/", {
    customer_party: customerPartyId,
  });
  return data;
}

export async function deleteInquiryRequirement(id: string | number) {
  await api.delete(`/api/v1/crm/inquiry-requirements/${id}/`);
}

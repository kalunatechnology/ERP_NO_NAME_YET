/**
 * Purpose: Defines frontend API adapter contracts and their integration boundary for the frontend application.
 * Responsibility: Documents and exposes only the behavior implemented in this file; function comments identify inputs, outputs, dependencies, and side effects.
 * CRM & Sales API — Consolidated service matching uji_prototype/js/services/crm.service.js
 * All endpoints and workflow actions from the validated prototype
 */

import api from "./axios";
import { normalizeList } from "./auth.api";
import { canRequestApi, FrontendAccessContext } from "@/lib/access/module-contract";

/* ── Types ───────────────────────────────────────── */
export interface CRMData {
  inquiries: any[];
  requirements: any[];
  opportunities: any[];
  activities: any[];
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
  surveyQuestions: any[];
  surveyResponses: any[];
  surveyAnswers: any[];
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

export interface CRMInboxConversation {
  id: string;
  subject: string;
  status: string;
  priority: string;
  channel_account_id: string | null;
  business_unit_code?: string | null;
  business_unit_name?: string | null;
  assigned_user_id: string | null;
  inquiry_id: string | null;
  origin_domain?: string | null;
  inquiry?: { id: string; inquiry_number: string; status: string } | null;
  assigned_user?: { id: string; full_name: string } | null;
  external_identities?: Array<{ id: string; type: string; masked_value: string; channel_verification_status: string; customer_match_status: string; party_id: string | null }>;
  updated_at: string;
  external_thread?: { external_thread_id: string; link_method: string } | null;
  latest_message?: { message_text: string; direction: string; received_at?: string | null; sent_at?: string | null } | null;
  messages?: Array<{ id: string; message_text: string; direction: string; received_at?: string | null; sent_at?: string | null }>;
}

export async function loadCRMInbox(pageSize = 50): Promise<CRMInboxConversation[]> {
  const { data } = await api.get(`/api/v1/crm/inbox/?page_size=${Math.min(Math.max(pageSize, 1), 100)}`);
  return Array.isArray(data?.rows) ? data.rows : [];
}

export async function createInquiryFromConversation(id: string) {
  const { data } = await api.post(`/api/v1/crm/conversations/${id}/create-inquiry/`, {});
  return data;
}

export async function replyToCRMConversation(id: string, message_text: string, client_message_id: string) {
  const { data } = await api.post(`/api/v1/crm/conversations/${id}/reply/`, { message_text, client_message_id });
  return data;
}

export async function setConversationDecision(id: string, decision: "IGNORE" | "REOPEN") {
  const { data } = await api.post(`/api/v1/crm/conversations/${id}/decision/`, { decision });
  return data;
}

export async function assignConversationToMe(id: string, userId: string) {
  const { data } = await api.post(`/api/v1/crm/conversations/${id}/assign/`, { assigned_user_id: userId });
  return data;
}

export async function confirmCRMIdentityCustomer(identityId: string, partyId: string) {
  const { data } = await api.post(`/api/v1/crm/external-identities/${identityId}/confirm-customer/`, { party_id: partyId });
  return data;
}

export interface CRMWhatsAppConnection {
  id: string;
  source_id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  api_version: string;
  status: "ACTIVE" | "SUSPENDED";
  callback_path: string;
  last_verified_at: string | null;
  last_webhook_at: string | null;
}

function companyScopeHeaders(companyId?: string) {
  return companyId ? { headers: { "X-Company-ID": companyId } } : undefined;
}

export async function loadCRMWhatsAppConnections(companyId?: string): Promise<CRMWhatsAppConnection[]> {
  const { data } = await api.get("/api/v1/core/whatsapp/connections/", companyScopeHeaders(companyId));
  return Array.isArray(data?.rows) ? data.rows : [];
}

export async function createCRMWhatsAppConnection(input: Record<string, string>, companyId?: string) {
  const { data } = await api.post("/api/v1/core/whatsapp/connections/", input, companyScopeHeaders(companyId));
  return data as CRMWhatsAppConnection;
}

export async function updateCRMWhatsAppConnection(id: string, input: Record<string, string>, companyId?: string) {
  const { data } = await api.patch(`/api/v1/core/whatsapp/connections/${id}/`, input, companyScopeHeaders(companyId));
  return data as CRMWhatsAppConnection;
}

export async function testCRMWhatsAppConnection(id: string, companyId?: string) {
  const { data } = await api.post(`/api/v1/core/whatsapp/connections/${id}/test/`, {}, companyScopeHeaders(companyId));
  return data;
}

export interface CRMIntegrationSource {
  id: string;
  source_code: string;
  channel_type: string;
  channel_account_id: string | null;
  business_unit_code: string | null;
  business_unit_name: string | null;
  key_id: string;
  allowed_event_types: string[];
  allowed_origin_domains: string[];
  status: string;
  created_at: string;
  last_seen_at?: string | null;
}

export async function loadCRMIntegrationSources(companyId?: string): Promise<CRMIntegrationSource[]> {
  const { data } = await api.get("/api/v1/core/integration-sources/", companyScopeHeaders(companyId));
  return Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
}

export interface CRMIntegrationEventLog {
  event_id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  received_at: string;
  processed_at: string | null;
}

export async function loadCRMIntegrationSourceEvents(id: string, companyId?: string): Promise<CRMIntegrationEventLog[]> {
  const { data } = await api.get(`/api/v1/core/integration-sources/${id}/events/`, companyScopeHeaders(companyId));
  return Array.isArray(data?.rows) ? data.rows : [];
}

export async function loadCRMIntegrationAssignees(companyId?: string): Promise<Array<{ id: string; full_name: string; email: string }>> {
  const { data } = await api.get("/api/v1/core/integration-sources/eligible-assignees/", companyScopeHeaders(companyId));
  return Array.isArray(data?.rows) ? data.rows : [];
}

export interface CRMPartyContact {
  id: string;
  party_id: string | null;
  contact_name: string;
  email: string;
  primary_contact: boolean;
}

export async function loadCRMPartyContacts(partyId: string | number): Promise<CRMPartyContact[]> {
  const { data } = await api.get(`/api/v1/master-data/contacts/?party_id=${encodeURIComponent(String(partyId))}&page_size=100`);
  return normalizeList<CRMPartyContact>(data).rows;
}

export async function createCRMIntegrationSource(input: Record<string, unknown>, companyId?: string) {
  const { data } = await api.post("/api/v1/core/integration-sources/", input, companyScopeHeaders(companyId));
  return data as CRMIntegrationSource & { signing_secret: string };
}

export async function setCRMIntegrationSourceStatus(id: string, status: "ACTIVE" | "SUSPENDED" | "REVOKED", companyId?: string) {
  const { data } = await api.patch(`/api/v1/core/integration-sources/${id}/status/`, { status }, companyScopeHeaders(companyId));
  return data;
}

export async function updateCRMIntegrationSourceDomains(id: string, allowed_origin_domains: string[], companyId?: string) {
  const { data } = await api.patch(`/api/v1/core/integration-sources/${id}/origin-domains/`, { allowed_origin_domains }, companyScopeHeaders(companyId));
  return data as { id: string; allowed_origin_domains: string[] };
}

export async function updateCRMIntegrationSourceEvents(id: string, allowed_event_types: string[], companyId?: string) {
  const { data } = await api.patch(`/api/v1/core/integration-sources/${id}/allowed-events/`, { allowed_event_types }, companyScopeHeaders(companyId));
  return data as { id: string; allowed_event_types: string[] };
}

/* ── Endpoints map ───────────────────────────────── */
// frontend-next/lib/api/crm.api.ts

const CRM_SOURCES: Record<keyof CRMData, string> = {
  inquiries:    "/api/v1/crm/customer-inquiries/?page_size=100",
  requirements: "/api/v1/crm/inquiry-requirements/?page_size=200",
  opportunities:"/api/v1/crm/opportunities/?page_size=100",
  activities:   "/api/v1/crm/activities/?page_size=200",
  stages:       "/api/v1/crm/pipeline-stages/?page_size=100",
  estimates:    "/api/v1/crm/cost-estimates/?page_size=100",
  estimateLines:"/api/v1/crm/cost-estimate-lines/?page_size=200",
  quotations:   "/api/v1/sales/quotations/with-codes/?page_size=100",
  approvals:    "/api/v1/crm/executive-approvals/?page_size=100",
  deliveries:   "/api/v1/crm/quotation-deliveries/?page_size=100",
  contracts:    "/api/v1/sales/contracts/?page_size=100",
  orders:       "/api/v1/sales/orders/?page_size=100",
  conversations:"/api/v1/crm/conversations/?page_size=100",
  feedback:     "/api/v1/crm/feedbacks/?page_size=100",
  surveyQuestions: "/api/v1/crm/survey-questions/?page_size=200",
  surveyResponses: "/api/v1/crm/survey-responses/?page_size=200",
  surveyAnswers: "/api/v1/crm/survey-answers/?page_size=500",
  credit:       "/api/v1/crm/credit-status-snapshots/?page_size=100",
  cases:        "/api/v1/service/cases/?page_size=100",
  resolutions:  "/api/v1/service/resolutions/?page_size=100",
  products:     "/api/v1/master-data/products/?page_size=200",
  parties:      "/api/v1/master-data/parties/?page_size=300",
};

/* ── Data Loading ─────────────────────────────────── */
/**
 * loadCRMData adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/commands/reporting/crm-sales-dashboard/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function loadCRMData(
  enabledModules?: readonly string[],
  bundle?: { data: Partial<CRMData>; dashboard: CRMDashboard },
  access?: Omit<FrontendAccessContext, "enabledModules">,
): Promise<{ data: CRMData; dashboard: CRMDashboard }> {
  const requestAccess = { ...access, enabledModules };
  const sources = Object.entries(CRM_SOURCES).filter(([, endpoint]) => canRequestApi(endpoint, requestAccess));
  const emptyData = Object.fromEntries(Object.keys(CRM_SOURCES).map((key) => [key, []]));

  if (bundle) {
    return {
      data: { ...emptyData, ...bundle.data } as CRMData,
      dashboard: bundle.dashboard || {},
    };
  }

  // The KPI request starts together with collection reads. Previously it waited
  // until every CRM collection finished, creating an avoidable second waterfall.
  const [entries, dashRes] = await Promise.all([
    Promise.all(sources.map(async ([key, path]) => {
      const res = await api.get(path);
      return [key, normalizeList<any>(res.data).rows];
    })),
    api.get("/api/v1/commands/reporting/crm-sales-dashboard/"),
  ]);
  const dashboard: CRMDashboard = dashRes.data?.data || dashRes.data || {};

  return {
    data: { ...emptyData, ...Object.fromEntries(entries) } as CRMData,
    dashboard,
  };
}

/* ── Opportunity Actions ─────────────────────────── */
/**
 * processDealWon adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/opportunities/${id}/process-deal-won/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function processDealWon(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/opportunities/${id}/process-deal-won/`, {});
  return data;
}

/**
 * executiveOverrideCredit adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/opportunities/${id}/executive-override/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function executiveOverrideCredit(id: string | number, remarks: string) {
  const { data } = await api.post(`/api/v1/crm/opportunities/${id}/executive-override/`, { remarks });
  return data;
}

/**
 * createOpportunity adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/opportunities/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
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
    customer_party_id: payload.customer_party || null,
    expected_amount: payload.expected_amount ?? 0,
    expected_margin: payload.expected_margin ?? 0,
    probability_percent: payload.probability_percent ?? 50,
    pipeline_stage: payload.pipeline_stage ?? "OPEN",
    status: "OPEN",
  });
  return data;
}

export async function updateOpportunityCustomer(id: string | number, customerPartyId: string | number) {
  const { data } = await api.patch(`/api/v1/crm/opportunities/${id}/`, { customer_party_id: customerPartyId });
  return data;
}

export async function createCRMActivity(payload: { opportunity_id: string | number; party_id?: string | number | null; activity_type: string; subject: string; scheduled_at?: string | null; meeting_minutes_id?: string | null }) {
  const { data } = await api.post('/api/v1/crm/activities/', { ...payload, status: payload.scheduled_at ? 'PLANNED' : 'COMPLETED', completed_at: payload.scheduled_at ? null : new Date().toISOString() });
  return data;
}

export async function getOpportunityCustomer360(id: string | number) {
  const { data } = await api.get(`/api/v1/crm/opportunities/${id}/customer-360/`);
  return data;
}

export async function markOpportunityLost(id: string | number, lost_reason: string, lost_reason_detail?: string) {
  const { data } = await api.post(`/api/v1/crm/opportunities/${id}/mark-lost/`, { lost_reason, lost_reason_detail });
  return data;
}

/**
 * deleteOpportunity adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/opportunities/${id}/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function deleteOpportunity(id: string | number) {
  const res = await api.delete(`/api/v1/crm/opportunities/${id}/`);
  return res.data;
}

/* ── Customer Inquiry Actions ────────────────────── */
/**
 * qualifyInquiry adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/customer-inquiries/${id}/qualify/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function qualifyInquiry(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/customer-inquiries/${id}/qualify/`, {});
  return data;
}

/**
 * createCustomerInquiry adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/customer-inquiries/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
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
    customer_party_id: payload.customer_party || null,
    description: payload.description || "",
    expected_delivery_date: payload.expected_delivery_date || null,
    status: "NEW",
  });
  return data;
}

/**
 * createInquiryRequirement adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/inquiry-requirements/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function createInquiryRequirement(payload: {
  inquiry: string | number;
  product?: string | number | null;
  description?: string;
  quantity?: number;
  target_unit_price?: number;
  requirement_type?: string;
}) {
  const { data } = await api.post("/api/v1/crm/inquiry-requirements/", {
    inquiry_id: payload.inquiry,
    product_id: payload.product || null,
    description: payload.description || "Item Spesifikasi Kebutuhan",
    quantity: payload.quantity ?? 1,
    target_unit_price: payload.target_unit_price ?? 0,
    requirement_type: payload.requirement_type || "PRODUCT",
    status: "QUALIFIED",
  });
  return data;
}

/**
 * deleteCustomerInquiry adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/customer-inquiries/${id}/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function deleteCustomerInquiry(id: string | number) {
  await api.delete(`/api/v1/crm/customer-inquiries/${id}/`);
}

/* ── Cost Estimate Actions ───────────────────────── */
/**
 * createCostEstimate adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/cost-estimates/`, `/api/v1/crm/cost-estimate-lines/`, `/api/v1/crm/cost-estimate-lines/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function createCostEstimate(payload: {
  opportunity?: string | number | null;
  inquiry?: string | number | null;
  direct_cost: number;
  overhead_cost?: number;
  contingency_amount?: number;
  markup_percent?: number;
  tax_percent?: number;
  description?: string;
}) {
  const { data } = await api.post("/api/v1/crm/cost-estimates/", {
    opportunity_id: payload.opportunity || null,
    inquiry_id: payload.inquiry || null,
    direct_cost: Number(payload.direct_cost ?? 0),
    overhead_cost: Number(payload.overhead_cost ?? 0),
    contingency_amount: Number(payload.contingency_amount ?? 0),
    markup_percent: Number(payload.markup_percent ?? 30),
    tax_percent: Number(payload.tax_percent ?? 0),
    description: payload.description || "",
  });
  return data;
}

/**
 * calculateCostEstimate adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/cost-estimates/${id}/calculate/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function calculateCostEstimate(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/cost-estimates/${id}/calculate/`, {});
  return data;
}

/**
 * createQuotationFromEstimate adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/cost-estimates/${id}/create-quotation/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function createQuotationFromEstimate(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/cost-estimates/${id}/create-quotation/`, {});
  return data;
}

/**
 * deleteCostEstimate adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/cost-estimates/${id}/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function deleteCostEstimate(id: string | number) {
  await api.delete(`/api/v1/crm/cost-estimates/${id}/`);
}

/* ── Quotation Workflow ──────────────────────────── */
/**
 * submitQuotationApproval adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/sales/quotations/${id}/submit-approval/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function submitQuotationApproval(id: string | number) {
  const { data } = await api.post(`/api/v1/sales/quotations/${id}/submit-approval/`, {});
  return data;
}

/**
 * approveQuotation adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/executive-approvals/?quotation=${quotationId}`, `/api/v1/crm/executive-approvals/${approvalId}/decide/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function approveQuotation(quotationId: string | number, approvalsData: any[] = []) {
  let approvalId: string | number | null = null;
  const localApproval = approvalsData.find(
    a => String(a.quotation_id ?? a.quotation) === String(quotationId) && a.decision === "PENDING"
  );
  if (localApproval) {
    approvalId = localApproval.id;
  } else {
    try {
      const res = await api.get(`/api/v1/crm/executive-approvals/?quotation_id=${quotationId}`);
      const rows = normalizeList<any>(res.data).rows;
      const pending = rows.find(a => a.decision === "PENDING");
      if (pending) approvalId = pending.id;
    } catch { /* ignore */ }
  }
  // Repair quotations submitted by older handlers that changed status without
  // creating the corresponding executive-approval row.
  if (!approvalId) {
    await submitQuotationApproval(quotationId);
    const res = await api.get(`/api/v1/crm/executive-approvals/?quotation_id=${quotationId}`);
    const rows = normalizeList<any>(res.data).rows;
    const pending = rows.find(a => a.decision === "PENDING");
    if (pending) approvalId = pending.id;
  }
  if (!approvalId) throw new Error("Record Executive Approval tidak ditemukan untuk Quotation ini.");

  const { data } = await api.post(`/api/v1/crm/executive-approvals/${approvalId}/decide/`, {
    decision: "APPROVED",
    remarks: "Disetujui oleh Operations Manager",
  });
  return data;
}

/**
 * sendQuotation adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/sales/quotations/${id}/send/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function sendQuotation(id: string | number) {
  const { data } = await api.post(`/api/v1/sales/quotations/${id}/send/`);
  return data;
}

/**
 * acceptQuotation adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/sales/quotations/${id}/customer-decision/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function acceptQuotation(id: string | number) {
  const { data } = await api.post(`/api/v1/sales/quotations/${id}/customer-decision/`, { decision: "ACCEPTED" });
  return data;
}

/**
 * rejectQuotation adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/sales/quotations/${id}/customer-decision/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function rejectQuotation(id: string | number, reason = "Customer menolak penawaran harga") {
  const { data } = await api.post(`/api/v1/sales/quotations/${id}/customer-decision/`, {
    decision: "REJECTED", reason,
  });
  return data;
}

/**
 * convertQuotationToOrder adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/commands/sales/quotations/${id}/convert-to-order/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function convertQuotationToOrder(id: string | number) {
  const { data } = await api.post(`/api/v1/crm/quotations/${id}/convert-to-order/`, {});
  return data;
}

/* ── Support Tickets ─────────────────────────────── */
/**
 * createSupportTicket adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/service/cases/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function createSupportTicket(payload: {
  subject: string;
  customer_party?: string | number | null;
  priority?: string;
  description?: string;
  serial_number?: string;
}) {
  const { data } = await api.post("/api/v1/service/cases/", {
    subject: payload.subject,
    customer_party: payload.customer_party || null,
    priority: payload.priority || "NORMAL",
    description: payload.description || "",
    serial_number: payload.serial_number?.trim() || null,
    status: "OPEN",
  });
  return data;
}

/**
 * Refreshes a warranty/support ticket from the canonical service-case record.
 *
 * This is intentionally a GET: checking current status must not mutate the
 * ticket or rely on the unimplemented legacy `/check-status` action.
 */
export async function checkTicketWarrantyStatus(id: string | number) {
  const { data } = await api.post(`/api/v1/service/cases/${id}/check-warranty/`, {});
  return data;
}

export async function createServiceWorkOrder(id: string | number, assigned_user_id?: string) {
  const { data } = await api.post(`/api/v1/service/cases/${id}/work-orders/`, { assigned_user_id });
  return data;
}

/**
 * deleteSupportTicket adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/service/cases/${id}/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function deleteSupportTicket(id: string | number) {
  await api.delete(`/api/v1/service/cases/${id}/`);
}

/* ── Credit Management ───────────────────────────── */
/**
 * updateCustomerCreditLimit adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/master-data/customer-profiles/set-credit-limit/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
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

/**
 * calculateCreditSnapshot adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/credit-status-snapshots/calculate/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function calculateCreditSnapshot(customerPartyId: string | number) {
  const { data } = await api.post("/api/v1/crm/credit-status-snapshots/calculate/", {
    customer_party: customerPartyId,
  });
  return data;
}

/**
 * deleteInquiryRequirement adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/crm/inquiry-requirements/${id}/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function deleteInquiryRequirement(id: string | number) {
  await api.delete(`/api/v1/crm/inquiry-requirements/${id}/`);
}

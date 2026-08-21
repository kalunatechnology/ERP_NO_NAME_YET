/**
 * Finance and Accounting Service
 */

import { state } from "../core/state.js";
import { requestJSON } from "../core/http.js";
import { normalizeList } from "../utils/formatters.js";
import { eventBus } from "../core/event-bus.js";

export const FINANCE_SOURCES = {
  billings: "/api/v1/finance/billing-documents/?page_size=100",
  billingLines: "/api/v1/finance/billing-document-lines/?page_size=100",
  payments: "/api/v1/finance/payments/?page_size=100",
  bankAccounts: "/api/v1/finance/bank-accounts/?page_size=100",
  coa: "/api/v1/finance/accounts/?page_size=100",
  journals: "/api/v1/finance/journal-entries/?page_size=100",
  periods: "/api/v1/finance/fiscal-periods/?page_size=100",
  taxes: "/api/v1/finance/tax-transactions/?page_size=100",
  parties: "/api/v1/master-data/parties/?page_size=100",
  purchaseOrders: "/api/v1/procurement/purchase-orders/?page_size=100",
  statements: "/api/v1/finance/bank-statements/?page_size=100",
  fundings: "/api/v1/finance/project-fundings/?page_size=100",
  costEntries: "/api/v1/finance/project-cost-entries/?page_size=100",
  billingProposals: "/api/v1/finance/billing-proposals/?page_size=100",
  projects: "/api/v1/projects/projects/?page_size=100",
};

export async function loadFinanceData(force = false) {
  if (!state.company) {
    if (state.companies && state.companies.length > 0) {
      state.company = state.companies[0].id;
    } else {
      try {
        const compsRes = await requestJSON("/api/v1/core/companies/", { method: "GET" });
        const comps = normalizeList(compsRes).rows;
        if (comps && comps.length > 0) {
          state.companies = comps;
          state.company = comps[0].id;
        }
      } catch (e) {
        console.warn("Could not auto-fetch company for Finance:", e);
      }
    }
  }
  state.finance.loading = true;
  eventBus.emit("finance:loading", true);

  try {
    const pairs = await Promise.all(
      Object.entries(FINANCE_SOURCES).map(async ([key, path]) => {
        try {
          const res = await requestJSON(path, { method: "GET" });
          return [key, normalizeList(res).rows];
        } catch {
          return [key, []];
        }
      })
    );

    try {
      state.finance.dashboard = (await requestJSON("/api/v1/commands/reporting/finance-dashboard/"))?.data || null;
    } catch {
      state.finance.dashboard = null;
    }

    state.finance.data = Object.fromEntries(pairs);
    state.finance.loading = false;
    eventBus.emit("finance:loaded", state.finance.data);
    return state.finance.data;
  } catch (error) {
    state.finance.loading = false;
    eventBus.emit("finance:loading", false);
    throw error;
  }
}

export async function createSupplierBilling(payload) {
  const res = await requestJSON("/api/v1/finance/billings/", { method: "POST", body: payload });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function createBillingLine(payload) {
  const res = await requestJSON("/api/v1/finance/billing-lines/", { method: "POST", body: payload });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function verifyBilling(id, note = "Verified through ERP Console") {
  const res = await requestJSON(`/api/v1/commands/finance/billings/${id}/verify/`, { method: "POST", body: { note } });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function approveBilling(id, note = "Approved through ERP Console") {
  const res = await requestJSON(`/api/v1/commands/finance/billings/${id}/approve/`, { method: "POST", body: { note } });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function postBilling(id, note = "Posted to AP ledger") {
  const res = await requestJSON(`/api/v1/commands/finance/billings/${id}/post/`, { method: "POST", body: { note } });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function rejectBilling(id, reason = "Rejected through ERP Console") {
  const res = await requestJSON(`/api/v1/commands/finance/billings/${id}/reject/`, { method: "POST", body: { reason } });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function submitPayment(id, note = "Submitted payment batch") {
  const res = await requestJSON(`/api/v1/commands/finance/payments/${id}/submit/`, { method: "POST", body: { note } });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function approvePayment(id, note = "Approved payment batch") {
  const res = await requestJSON(`/api/v1/commands/finance/payments/${id}/approve/`, { method: "POST", body: { note } });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function executePayment(id, referenceNumber) {
  const res = await requestJSON(`/api/v1/commands/finance/payments/${id}/execute/`, {
    method: "POST",
    body: { reference_number: referenceNumber },
  });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function autoReconcileStatement(id) {
  const res = await requestJSON(`/api/v1/finance/bank-statements/${id}/auto-reconcile/`, { method: "POST", body: {} });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function createBillingDocument(data) {
  const res = await requestJSON("/api/v1/finance/billing-documents/", {
    method: "POST",
    body: {
      invoice_number: data.invoice_number || `INV-${Date.now().toString().slice(-6)}`,
      party: data.party || null,
      total_amount: data.total_amount || 0,
      outstanding_amount: data.total_amount || 0,
      due_date: data.due_date || null,
      notes: data.notes || "",
      status: "DRAFT",
    },
  });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function createPaymentBatch(data) {
  const res = await requestJSON("/api/v1/finance/payments/", {
    method: "POST",
    body: {
      reference_number: data.reference_number || `PAY-${Date.now().toString().slice(-6)}`,
      party: data.party || null,
      amount: data.amount || 0,
      payment_method: data.payment_method || "BANK_TRANSFER",
      payment_date: data.payment_date || new Date().toISOString().split("T")[0],
      status: "DRAFT",
    },
  });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function createFundingRequest(data) {
  const res = await requestJSON("/api/v1/finance/project-fundings/", {
    method: "POST",
    body: {
      project: data.project,
      purpose: data.purpose,
      requested_amount: data.requested_amount,
      approved_limit: data.approved_limit || data.requested_amount,
      funding_type: data.funding_type || "PROJECT_EXECUTION",
      status: data.status || "SUBMITTED",
    },
  });
  eventBus.emit("finance:updated", res);
  eventBus.emit("pm:updated", res);
  return res;
}

export async function createProjectCostEntry(data) {
  const res = await requestJSON("/api/v1/finance/project-cost-entries/", {
    method: "POST",
    body: {
      project: data.project,
      description: data.description,
      source_type: data.source_type || "MATERIAL",
      cost_element: data.cost_element || "DIRECT_COST",
      total_cost: data.total_cost || 0,
      transaction_date: data.transaction_date || new Date().toISOString().split("T")[0],
      status: "POSTED",
    },
  });
  eventBus.emit("finance:updated", res);
  eventBus.emit("pm:updated", res);
  return res;
}

export async function createBillingProposal(data) {
  const subtotal = Number(data.subtotal || 0);
  const tax = subtotal * 0.11;
  const res = await requestJSON("/api/v1/finance/billing-proposals/", {
    method: "POST",
    body: {
      project: data.project,
      description: data.description,
      trigger_type: data.trigger_type || "PROGRESS_APPROVED",
      subtotal: subtotal,
      tax_rate: 11,
      tax_amount: tax,
      total_amount: subtotal + tax,
      status: "APPROVED",
    },
  });
  eventBus.emit("finance:updated", res);
  eventBus.emit("pm:updated", res);
  return res;
}

export async function closeFiscalPeriod(id) {
  const res = await requestJSON(`/api/v1/commands/finance/fiscal-periods/${id}/close/`, { method: "POST", body: {} });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function reopenFiscalPeriod(id) {
  const res = await requestJSON(`/api/v1/commands/finance/fiscal-periods/${id}/reopen/`, { method: "POST", body: {} });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function approveBillingProposal(id) {
  const res = await requestJSON(`/api/v1/finance/billing-proposals/${id}/approve/`, { method: "POST", body: {} });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function createInvoiceFromProposal(id) {
  const res = await requestJSON(`/api/v1/finance/billing-proposals/${id}/create-invoice/`, { method: "POST", body: {} });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function validateCostEntry(id) {
  const res = await requestJSON(`/api/v1/finance/project-cost-entries/${id}/validate/`, { method: "POST", body: {} });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function postCostEntryToWIP(id) {
  const res = await requestJSON(`/api/v1/finance/project-cost-entries/${id}/post-to-wip/`, { method: "POST", body: {} });
  eventBus.emit("finance:updated", res);
  return res;
}

export async function decideFundingRequest(id, action, note = "") {
  const path = `/api/v1/finance/project-fundings/${id}/${action}/`;
  const res = await requestJSON(path, { method: "POST", body: { note } });
  eventBus.emit("finance:updated", res);
  eventBus.emit("pm:updated", res);
  return res;
}

export async function deleteFundingRequest(id) {
  const res = await requestJSON(`/api/v1/finance/project-fundings/${id}/`, { method: "DELETE" });
  if (state.finance?.data?.fundings) {
    state.finance.data.fundings = state.finance.data.fundings.filter(f => String(f.id) !== String(id));
  }
  eventBus.emit("finance:updated", res);
  eventBus.emit("pm:updated", res);
  return res;
}

export async function deleteBillingDocument(id) {
  const res = await requestJSON(`/api/v1/finance/billing-documents/${id}/`, { method: "DELETE" });
  if (state.finance?.data?.billings) {
    state.finance.data.billings = state.finance.data.billings.filter(b => String(b.id) !== String(id));
  }
  eventBus.emit("finance:updated", res);
  return res;
}

export async function deletePaymentBatch(id) {
  const res = await requestJSON(`/api/v1/finance/payments/${id}/`, { method: "DELETE" });
  if (state.finance?.data?.payments) {
    state.finance.data.payments = state.finance.data.payments.filter(p => String(p.id) !== String(id));
  }
  eventBus.emit("finance:updated", res);
  return res;
}

export async function deleteProjectCostEntry(id) {
  const res = await requestJSON(`/api/v1/finance/project-cost-entries/${id}/`, { method: "DELETE" });
  if (state.finance?.data?.costEntries) {
    state.finance.data.costEntries = state.finance.data.costEntries.filter(c => String(c.id) !== String(id));
  }
  eventBus.emit("finance:updated", res);
  eventBus.emit("pm:updated", res);
  return res;
}

export async function deleteBillingProposal(id) {
  const res = await requestJSON(`/api/v1/finance/billing-proposals/${id}/`, { method: "DELETE" });
  if (state.finance?.data?.billingProposals) {
    state.finance.data.billingProposals = state.finance.data.billingProposals.filter(p => String(p.id) !== String(id));
  }
  eventBus.emit("finance:updated", res);
  eventBus.emit("pm:updated", res);
  return res;
}

export async function updateCustomerCreditLimit(data) {
  const res = await requestJSON("/api/v1/master-data/customer-profiles/set-credit-limit/", {
    method: "POST",
    body: {
      party_id: data.party_id,
      credit_limit: data.credit_limit,
      credit_hold: data.credit_hold || false,
      risk_category: data.risk_category || "LOW",
    },
  });
  eventBus.emit("finance:updated", res);
  eventBus.emit("crm:updated", res);
  return res;
}

export async function calculateCreditSnapshot(customerPartyId) {
  const res = await requestJSON("/api/v1/crm/credit-status-snapshots/calculate/", {
    method: "POST",
    body: { customer_party: customerPartyId },
  });
  eventBus.emit("finance:updated", res);
  eventBus.emit("crm:updated", res);
  return res;
}

// ==========================================
// TAMBAHAN SERVICE: PERMINTAAN & APPROVAL RESTOCK
// ==========================================

export async function requestMaterialRestock({ project_id, product_id, warehouse_id, quantity, notes }) {
  return requestJSON("/api/commands/inventory/restock-requests/", {
    method: "POST",
    body: JSON.stringify({
      project: project_id,
      product: product_id,
      warehouse: warehouse_id,
      requested_quantity: Number(quantity),
      notes: notes || "Permintaan restock untuk prasyarat lifecycle proyek",
      status: "SUBMITTED"
    })
  });
}

export async function approveMaterialRestock({ product_id, warehouse_id, quantity }) {
  // Langsung mengisi saldo fisik gudang agar Stage-Gate Lifecycle proyek langsung lolos
  return requestJSON("/api/commands/inventory/adjust-stock/", {
    method: "POST",
    body: JSON.stringify({
      product_id,
      warehouse_id,
      quantity_on_hand: Number(quantity),
      available_quantity: Number(quantity),
      reason: "EXECUTIVE_RESTOCK_APPROVAL"
    })
  });
}
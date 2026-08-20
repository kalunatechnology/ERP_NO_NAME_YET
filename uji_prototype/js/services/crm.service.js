/**
 * CRM and Sales Commercial Service
 */

import { state } from "../core/state.js";
import { requestJSON } from "../core/http.js";
import { normalizeList } from "../utils/formatters.js";
import { eventBus } from "../core/event-bus.js";

export const CRM_SOURCES = {
  inquiries: "/api/v1/crm/customer-inquiries/?page_size=100",
  requirements: "/api/v1/crm/inquiry-requirements/?page_size=200",
  opportunities: "/api/v1/crm/opportunities/?page_size=100",
  stages: "/api/v1/crm/pipeline-stages/?page_size=100",
  estimates: "/api/v1/crm/cost-estimates/?page_size=100",
  estimateLines: "/api/v1/crm/cost-estimate-lines/?page_size=200",
  quotations: "/api/v1/sales/quotations/?page_size=100",
  approvals: "/api/v1/crm/executive-approvals/?page_size=100",
  deliveries: "/api/v1/crm/quotation-deliveries/?page_size=100",
  contracts: "/api/v1/sales/contracts/?page_size=100",
  orders: "/api/v1/sales/orders/?page_size=100",
  conversations: "/api/v1/crm/conversations/?page_size=100",
  feedback: "/api/v1/crm/feedbacks/?page_size=100",
  credit: "/api/v1/crm/credit-status-snapshots/?page_size=100",
  cases: "/api/v1/service/cases/?page_size=100",
  resolutions: "/api/v1/service/resolutions/?page_size=100",
  products: "/api/v1/master-data/products/?page_size=200",
  parties: "/api/v1/master-data/parties/?page_size=300",
};

export async function loadCRMData() {
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
        console.warn("Could not auto-fetch company for CRM:", e);
      }
    }
  }

  state.crm.loading = true;
  eventBus.emit("crm:loading", true);

  try {
    const pairs = await Promise.all(
      Object.entries(CRM_SOURCES).map(async ([k, p]) => {
        try {
          const res = await requestJSON(p, { method: "GET" });
          return [k, normalizeList(res).rows];
        } catch {
          return [k, []];
        }
      })
    );

    try {
      state.crm.dashboard = (await requestJSON("/api/v1/commands/reporting/crm-sales-dashboard/"))?.data || {};
    } catch {
      state.crm.dashboard = {};
    }

    state.crm.data = Object.fromEntries(pairs);
    state.crm.loading = false;
    state.crm.loaded = true;
    eventBus.emit("crm:loaded", state.crm.data);
    return state.crm.data;
  } catch (error) {
    state.crm.loading = false;
    eventBus.emit("crm:loading", false);
    return state.crm.data || {};
  }
}

export async function processDealWon(id) {
  const res = await requestJSON(`/api/v1/crm/opportunities/${id}/process-deal-won/`, { method: "POST", body: {} });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function executiveOverrideCredit(id) {
  const res = await requestJSON(`/api/v1/crm/opportunities/${id}/executive-override/`, { method: "POST", body: {} });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function checkTicketWarrantyStatus(id) {
  return requestJSON(`/api/v1/service/cases/${id}/check-status/`, { method: "POST", body: {} });
}

export async function qualifyInquiry(id) {
  const res = await requestJSON(`/api/v1/crm/customer-inquiries/${id}/qualify/`, { method: "POST", body: {} });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function calculateCostEstimate(id) {
  const res = await requestJSON(`/api/v1/crm/cost-estimates/${id}/calculate/`, { method: "POST", body: {} });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function createQuotationFromEstimate(id) {
  const res = await requestJSON(`/api/v1/crm/cost-estimates/${id}/create-quotation/`, { method: "POST", body: {} });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function submitQuotationApproval(id) {
  const res = await requestJSON(`/api/v1/sales/quotations/${id}/submit-approval/`, { method: "POST", body: {} });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function approveQuotation(id) {
  const approvals = state.crm.data.approvals || [];
  let app = approvals.find(a => String(a.quotation) === String(id) && a.decision === "PENDING");
  if (!app) {
    const res = await requestJSON(`/api/v1/crm/executive-approvals/?quotation=${id}`);
    app = normalizeList(res).rows.find(a => a.decision === "PENDING") || normalizeList(res).rows[0];
  }
  if (!app) throw new Error("Record Executive Approval tidak ditemukan untuk Quotation ini.");
  const res = await requestJSON(`/api/v1/crm/executive-approvals/${app.id}/decide/`, {
    method: "POST",
    body: { decision: "APPROVED", remarks: "Disetujui oleh Operations Manager" },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function sendQuotation(id) {
  const res = await requestJSON(`/api/v1/sales/quotations/${id}/send/`, {
    method: "POST",
    body: { channel: "EMAIL", recipient: "customer@example.com" },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function acceptQuotation(id) {
  const res = await requestJSON(`/api/v1/sales/quotations/${id}/customer-decision/`, {
    method: "POST",
    body: { accepted: true },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function rejectQuotation(id) {
  const res = await requestJSON(`/api/v1/sales/quotations/${id}/customer-decision/`, {
    method: "POST",
    body: { accepted: false, reason: "Customer menolak penawaran harga" },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function convertQuotationToOrder(id) {
  const res = await requestJSON(`/api/v1/commands/sales/quotations/${id}/convert-to-order/`, {
    method: "POST",
    body: { fulfillment_method: "PROJECT" },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function createCustomerInquiry(data) {
  const res = await requestJSON("/api/v1/crm/customer-inquiries/", {
    method: "POST",
    body: {
      subject: data.subject,
      customer_name: data.customer_name,
      customer_email: data.customer_email || "",
      customer_party: data.customer_party || null,
      description: data.description || "",
      expected_delivery_date: data.expected_delivery_date || null,
      status: "NEW",
    },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function createInquiryRequirement(data) {
  const res = await requestJSON("/api/v1/crm/inquiry-requirements/", {
    method: "POST",
    body: {
      inquiry: data.inquiry,
      product: data.product || null,
      description: data.description || "Item Spesifikasi Kebutuhan",
      quantity: data.quantity || 1,
      target_unit_price: data.target_unit_price || 0,
      requirement_type: data.requirement_type || "PRODUCT",
      status: "QUALIFIED",
    },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function createOpportunity(data) {
  const res = await requestJSON("/api/v1/crm/opportunities/", {
    method: "POST",
    body: {
      opportunity_name: data.opportunity_name,
      customer_party: data.customer_party || null,
      expected_amount: data.expected_amount || 0,
      expected_margin: data.expected_margin || 0,
      probability_percent: data.probability_percent || 50,
      pipeline_stage: data.pipeline_stage || "OPEN",
      status: "OPEN",
    },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function createCostEstimate(data) {
  const direct_cost = Number(data.direct_cost || 0);
  const overhead_cost = Number(data.overhead_cost || 0);
  const total_cost = direct_cost + overhead_cost;
  const markup_percent = Number(data.markup_percent || 30);
  const offered_amount = total_cost * (1 + markup_percent / 100);

  const res = await requestJSON("/api/v1/crm/cost-estimates/", {
    method: "POST",
    body: {
      opportunity: data.opportunity || null,
      inquiry: data.inquiry || null,
      estimate_number: data.estimate_number || `EST-${Date.now().toString().slice(-6)}`,
      direct_cost: direct_cost,
      overhead_cost: overhead_cost,
      total_cost: total_cost,
      markup_percent: markup_percent,
      offered_amount: offered_amount,
      status: "DRAFT",
    },
  });

  if (res?.id) {
    try {
      await requestJSON("/api/v1/crm/cost-estimate-lines/", {
        method: "POST",
        body: {
          estimate: res.id,
          cost_element: "MATERIAL",
          description: data.description || "Biaya Langsung Pengadaan / Produksi",
          quantity: 1,
          unit_cost: direct_cost || 100000000,
          amount: direct_cost || 100000000,
        },
      });
      if (overhead_cost > 0) {
        await requestJSON("/api/v1/crm/cost-estimate-lines/", {
          method: "POST",
          body: {
            estimate: res.id,
            cost_element: "OVERHEAD",
            description: "Biaya Operasional & Overhead",
            quantity: 1,
            unit_cost: overhead_cost,
            amount: overhead_cost,
          },
        });
      }
    } catch (e) {
      console.warn("Cost line auto-provision:", e);
    }
  }

  eventBus.emit("crm:updated", res);
  return res;
}

export async function createCostEstimateLine(data) {
  const qty = Number(data.quantity || 1);
  const unit_cost = Number(data.unit_cost || 0);
  const res = await requestJSON("/api/v1/crm/cost-estimate-lines/", {
    method: "POST",
    body: {
      estimate: data.estimate,
      cost_element: data.cost_element || "MATERIAL",
      description: data.description || "Item Biaya Estimasi",
      quantity: qty,
      unit_cost: unit_cost,
      amount: qty * unit_cost,
    },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function createSupportTicket(data) {
  const res = await requestJSON("/api/v1/service/cases/", {
    method: "POST",
    body: {
      subject: data.subject,
      customer_party: data.customer_party || null,
      priority: data.priority || "NORMAL",
      case_type: data.case_type || "WARRANTY_CLAIM",
      description: data.description || "",
      status: "OPEN",
    },
  });
  eventBus.emit("crm:updated", res);
  return res;
}

export async function deleteCustomerInquiry(id) {
  const res = await requestJSON(`/api/v1/crm/customer-inquiries/${id}/`, { method: "DELETE" });
  if (state.crm?.data?.inquiries) {
    state.crm.data.inquiries = state.crm.data.inquiries.filter(i => String(i.id) !== String(id));
  }
  eventBus.emit("crm:updated", res);
  return res;
}

export async function deleteOpportunity(id) {
  const res = await requestJSON(`/api/v1/crm/opportunities/${id}/`, { method: "DELETE" });
  if (state.crm?.data?.opportunities) {
    state.crm.data.opportunities = state.crm.data.opportunities.filter(o => String(o.id) !== String(id));
  }
  eventBus.emit("crm:updated", res);
  return res;
}

export async function deleteCostEstimate(id) {
  const res = await requestJSON(`/api/v1/crm/cost-estimates/${id}/`, { method: "DELETE" });
  if (state.crm?.data?.estimates) {
    state.crm.data.estimates = state.crm.data.estimates.filter(e => String(e.id) !== String(id));
  }
  eventBus.emit("crm:updated", res);
  return res;
}

export async function deleteSupportTicket(id) {
  const res = await requestJSON(`/api/v1/service/cases/${id}/`, { method: "DELETE" });
  if (state.crm?.data?.cases) {
    state.crm.data.cases = state.crm.data.cases.filter(c => String(c.id) !== String(id));
  }
  eventBus.emit("crm:updated", res);
  return res;
}

export async function deleteInquiryRequirement(id) {
  const res = await requestJSON(`/api/v1/crm/inquiry-requirements/${id}/`, { method: "DELETE" });
  if (state.crm?.data?.requirements) {
    state.crm.data.requirements = state.crm.data.requirements.filter(r => String(r.id) !== String(id));
  }
  eventBus.emit("crm:updated", res);
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
  eventBus.emit("crm:updated", res);
  eventBus.emit("finance:updated", res);
  return res;
}

export async function calculateCreditSnapshot(customerPartyId) {
  const res = await requestJSON("/api/v1/crm/credit-status-snapshots/calculate/", {
    method: "POST",
    body: { customer_party: customerPartyId },
  });
  eventBus.emit("crm:updated", res);
  eventBus.emit("finance:updated", res);
  return res;
}

/**
 * Reporting and Financial Observability Service
 */

import { state } from "../core/state.js";
import { requestJSON } from "../core/http.js";
import { normalizeList } from "../utils/formatters.js";
import { eventBus } from "../core/event-bus.js";

export const REPORTING_SOURCES = {
  projects: "/api/v1/projects/projects/?page_size=100",
  journals: "/api/v1/finance/journal-entries/?page_size=300",
  journalLines: "/api/v1/finance/journal-lines/?page_size=500",
  costEntries: "/api/v1/finance/project-cost-entries/?page_size=300",
  billings: "/api/v1/finance/billing-documents/?page_size=100",
  billingProposals: "/api/v1/finance/billing-proposals/?page_size=100",
  payments: "/api/v1/finance/payments/?page_size=100",
  coa: "/api/v1/finance/accounts/?page_size=200",
  quotations: "/api/v1/sales/quotations/?page_size=100",
  orders: "/api/v1/sales/orders/?page_size=100",
};

export async function loadReportingData(force = false) {
  if (state.reporting.loaded && !force) return state.reporting.data;
  state.reporting.loading = true;
  eventBus.emit("reporting:loading", true);

  try {
    const pairs = await Promise.all(
      Object.entries(REPORTING_SOURCES).map(async ([k, path]) => {
        try {
          return [k, normalizeList(await requestJSON(path, { method: "GET" })).rows];
        } catch {
          return [k, []];
        }
      })
    );

    state.reporting.data = Object.fromEntries(pairs);
    state.reporting.loading = false;
    state.reporting.loaded = true;
    eventBus.emit("reporting:loaded", state.reporting.data);
    return state.reporting.data;
  } catch (error) {
    state.reporting.loading = false;
    eventBus.emit("reporting:loading", false);
    throw error;
  }
}

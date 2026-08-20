/**
 * Central State Store with reactive change notifications
 */

import { STORE_KEYS, DEFAULT_BASE_URL } from "../config/constants.js";
import { parseJSON } from "../utils/dom.js";
import { eventBus } from "./event-bus.js";

const initialLogs = parseJSON(localStorage.getItem(STORE_KEYS.logs), []);

export const state = {
  base: localStorage.getItem(STORE_KEYS.base) || DEFAULT_BASE_URL,
  access: localStorage.getItem(STORE_KEYS.access) || "",
  refresh: localStorage.getItem(STORE_KEYS.refresh) || "",
  company: localStorage.getItem(STORE_KEYS.company) || "",
  companies: [],
  logs: initialLogs,

  // OpenAPI schema & catalog
  schema: null,
  schemaSource: "offline",
  operations: [],
  resources: [],
  modules: [],
  module: "",
  resource: null,
  operation: null,

  // Active View & Router
  view: "dashboard",
  routeParams: {},

  // User session
  user: null,
  offline: false,

  // Sub-domains state
  pagination: { page: 1, pageSize: 20, count: 0, next: null, previous: null, search: "", ordering: "" },
  rows: [],
  console: { query: "", method: "all" },

  finance: {
    loading: false,
    data: {},
    results: [],
    dashboard: null,
    tab: "overview",
    billingFilter: "",
    paymentFilter: "",
    selectedBills: new Set(),
  },

  projectFlow: {
    loading: false,
    data: {},
    projectId: "",
    dashboard: null,
    flowStatus: null,
    simulation: false,
    results: [],
  },

  crm: {
    loading: false,
    loaded: false,
    tab: "dashboard",
    data: {},
    dashboard: {},
    selectedInquiry: "",
  },

  pm: {
    projects: [],
    fundings: [],
    fundingLoaded: false,
    costEntries: [],
    billingProposals: [],
    accountingLoaded: false,
    operationalLoaded: false,
    operationalTab: "incoming",
    orders: [],
    documents: [],
    parties: [],
    changes: [],
    changeMaterials: [],
    issues: [],
    issueActions: [],
    dispatches: [],
    requisitions: [],
    productionOrders: [],
    workOrders: [],
    members: [],
    users: [],
    products: [],
    warehouses: [],
    machines: [],
    selectedId: "",
    filter: "ALL",
    tab: "overview",
    loading: false,
    loaded: false,
    live: false,
    error: "",
  },

  reporting: {
    loading: false,
    loaded: false,
    tab: "project-pnl",
    selectedProjectId: "",
    data: {},
  },
};

export function setTokens(access, refresh) {
  state.access = access || "";
  state.refresh = refresh || "";
  if (state.access) {
    localStorage.setItem(STORE_KEYS.access, state.access);
  } else {
    localStorage.removeItem(STORE_KEYS.access);
  }
  if (state.refresh) {
    localStorage.setItem(STORE_KEYS.refresh, state.refresh);
  } else {
    localStorage.removeItem(STORE_KEYS.refresh);
  }
  eventBus.emit("auth:tokenChanged", { access: state.access, refresh: state.refresh });
}

export function setCompany(companyId) {
  state.company = (companyId || "").trim();
  localStorage.setItem(STORE_KEYS.company, state.company);
  eventBus.emit("company:changed", state.company);
}

export function setBaseUrl(url) {
  state.base = (url || DEFAULT_BASE_URL).trim();
  localStorage.setItem(STORE_KEYS.base, state.base);
  eventBus.emit("base:changed", state.base);
}

export function addLog(entry) {
  const logItem = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toLocaleTimeString("id-ID"),
    ...entry,
  };
  state.logs.unshift(logItem);
  if (state.logs.length > 200) state.logs.pop();
  persistLogs();
  eventBus.emit("logs:updated", state.logs);
}

export function clearLogs() {
  state.logs = [];
  persistLogs();
  eventBus.emit("logs:updated", state.logs);
}

function persistLogs() {
  try {
    localStorage.setItem(STORE_KEYS.logs, JSON.stringify(state.logs.slice(0, 100)));
  } catch {
    // Ignore storage quota limits
  }
}

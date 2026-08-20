/**
 * Global Constants & Configurations
 */

export const METHODS = ["get", "post", "put", "patch", "delete"];

export const STORE_KEYS = {
  base: "erpPrototype.base",
  access: "erpPrototype.access",
  refresh: "erpPrototype.refresh",
  company: "erpPrototype.company",
  logs: "erpPrototype.logs",
};

export const AUTH_ENDPOINTS = {
  token: "/api/v1/auth/token/",
  refresh: "/api/v1/auth/token/refresh/",
  verify: "/api/v1/auth/token/verify/",
  me: "/api/v1/auth/me/",
  logout: "/api/v1/auth/logout/",
  change: "/api/v1/auth/change-password/",
};

export const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

/**
 * HTTP Client with Token Interceptor, X-Company-ID, Logging, and Auto-Refresh
 */

import { AUTH_ENDPOINTS } from "../config/constants.js";
import { state, setTokens, addLog } from "./state.js";
import { normalizeBase } from "../utils/formatters.js";
import { sanitize, truncate } from "../utils/dom.js";

export async function rawRequest(path, { method = "GET", body, headers = {}, auth = true, retry = true } = {}) {
  const url = path.startsWith("http") ? path : `${normalizeBase(state.base)}${path}`;
  const h = { Accept: "application/json", ...headers };

  if (auth && state.access) {
    h.Authorization = `Bearer ${state.access}`;
  }

  if (state.company && !Object.keys(h).some(k => k.toLowerCase() === "x-company-id")) {
    h["X-Company-ID"] = state.company;
  }

  const opts = { method, headers: h };

  if (body !== undefined && body !== null && method !== "GET" && method !== "HEAD") {
    if (body instanceof FormData) {
      opts.body = body;
      delete h["Content-Type"];
    } else {
      h["Content-Type"] = "application/json";
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }
  }

  const start = performance.now();
  let response;

  try {
    response = await fetch(url, opts);
  } catch (error) {
    const duration = Math.round(performance.now() - start);
    addLog({
      method,
      path,
      status: 0,
      ok: false,
      duration,
      requestBody: sanitize(body),
      responseBody: { detail: error.message },
    });
    throw new Error(`Tidak dapat terhubung ke API: ${error.message}`);
  }

  // Handle Token Expiry & Refresh
  if (response.status === 401 && retry && auth && state.refresh && !path.includes(AUTH_ENDPOINTS.refresh)) {
    try {
      await refreshAccessToken();
      return rawRequest(path, { method, body, headers, auth, retry: false });
    } catch {
      setTokens("", "");
    }
  }

  const data = await parseResponse(response);
  const duration = Math.round(performance.now() - start);

  addLog({
    method,
    path,
    status: response.status,
    ok: response.ok,
    duration,
    requestBody: sanitize(body),
    responseBody: data,
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

export async function requestJSON(path, options = {}) {
  const res = await rawRequest(path, options);
  if (!res.ok) {
    const error = new Error(errorMessage(res.data, res.status));
    error.status = res.status;
    error.payload = res.data;
    throw error;
  }
  return res.data;
}

export async function parseResponse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function errorMessage(payload, status) {
  if (!payload) return `Request gagal dengan status ${status}.`;
  if (typeof payload === "string") return truncate(payload, 300);
  if (payload.detail) return String(payload.detail);
  if (payload.message) return String(payload.message);
  return (
    Object.entries(payload)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(" · ") || `Request gagal ${status}.`
  );
}

export async function refreshAccessToken() {
  if (!state.refresh) throw new Error("Refresh token tidak tersedia.");
  const response = await fetch(`${normalizeBase(state.base)}${AUTH_ENDPOINTS.refresh}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: state.refresh }),
  });
  const payload = await parseResponse(response);
  if (!response.ok || !payload?.access) throw new Error(errorMessage(payload, response.status));
  setTokens(payload.access, payload.refresh || state.refresh);
  return payload.access;
}

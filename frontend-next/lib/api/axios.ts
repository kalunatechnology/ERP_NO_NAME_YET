/**
 * Purpose: Defines frontend API adapter contracts and their integration boundary for the frontend application.
 * Responsibility: Documents and exposes only the behavior implemented in this file; function comments identify inputs, outputs, dependencies, and side effects.
 * Axios instance dengan JWT interceptor & Cookie Sync
 * Ported dari uji_prototype/js/core/http.js
 */

import axios from "axios";
import { canRequestApi, getApiAccessContract } from "@/lib/access/module-contract";

// Express defaults to port 8001 in local development. Keeping this fallback
// aligned with the backend prevents an otherwise valid login from waiting on
// Axios' network timeout when no frontend environment override is present.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8001";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

/* ── Helper Regex UUID ── */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Helper Cookie ── */
function syncCookie(token?: string) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `access_token=${token}; path=/; max-age=86400; SameSite=Lax`;
  } else {
    document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
  }
}

/* ── Request Interceptor: tambah Authorization & Company header ── */
api.interceptors.request.use(
  (config) => {
    const method = String(config.method || 'get').toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && config.headers && !config.headers["Idempotency-Key"]) {
      config.headers["Idempotency-Key"] = crypto.randomUUID();
    }
    if (typeof window !== "undefined") {
      const access =
        localStorage.getItem("erp.access") ||
        localStorage.getItem("access_token") ||
        localStorage.getItem("token");

      if (access && config.headers) {
        config.headers.Authorization = `Bearer ${access}`;
      }

      // Validasi Company ID: Hanya pasang header jika nilainya adalah format UUID valid
      const company =
        localStorage.getItem("erp.company") ||
        localStorage.getItem("active_company_id");

      if (company && company !== "all" && UUID_REGEX.test(company.trim()) && config.headers) {
        config.headers["X-Company-ID"] = company.trim();
      } else if (config.headers && config.headers["X-Company-ID"]) {
        delete config.headers["X-Company-ID"];
      }

      // Local fail-closed preflight. Backend remains authoritative, but known
      // module requests are not sent when the current profile has no matching
      // entitlement. This prevents background loaders from generating expected
      // 403 traffic and keeps route/module/request contracts consistent.
      const apiContract = getApiAccessContract(String(config.url ?? ""));
      if (apiContract) {
        let storedUser: { enabled_modules?: string[]; delegated_modules?: string[]; active_role_code?: string | null; is_superuser?: boolean } | null = null;
        try {
          storedUser = JSON.parse(localStorage.getItem("erp.user") || "null");
        } catch {
          storedUser = null;
        }
        if (!storedUser || !canRequestApi(config.url || "", {
          enabledModules: storedUser.enabled_modules,
          delegatedModules: storedUser.delegated_modules,
          activeRoleCode: storedUser.active_role_code,
          isSuperAdmin: storedUser.is_superuser,
        })) {
          throw new axios.AxiosError(
            `Request dibatalkan: modul ${apiContract.module} tidak tersedia pada konteks akses aktif.`,
            "ERR_FRONTEND_MODULE_ACCESS",
            config,
          );
        }
      }
    }
    return config;
  },
  (err) => Promise.reject(err)
);

/* ── Response Interceptor: handle 401 → refresh token with Mutex Singleton ── */
let refreshPromise: Promise<string | null> | null = null;

/** Clears invalid browser credentials and lets the active app shell render an
 * in-place re-authentication state without changing the current URL. */
function expireSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("erp.access");
  localStorage.removeItem("erp.refresh");
  localStorage.removeItem("access_token");
  localStorage.removeItem("token");
  localStorage.removeItem("erp.company");
  localStorage.removeItem("active_company_id");
  syncCookie();
  window.dispatchEvent(new CustomEvent("erp:session-expired"));
}

/**
 * refreshTokenOnce adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: uses the configured API client/base URL referenced below. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
function refreshTokenOnce(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  if (typeof window === "undefined") return Promise.resolve(null);
  const refresh = localStorage.getItem("erp.refresh");
  if (!refresh) {
    return Promise.resolve(null);
  }

  refreshPromise = axios
    .post(`${API_BASE}/api/v1/auth/token/refresh/`, { refresh })
    .then((res) => {
      const payload = res.data?.data || res.data;
      const newAccess = payload?.access || payload?.token;
      if (newAccess) {
        localStorage.setItem("erp.access", newAccess);
        localStorage.setItem("access_token", newAccess);
        syncCookie(newAccess);
        return newAccess;
      }
      return null;
    })
    .catch((err) => {
      // Jika refresh token benar-benar invalid / expired
      expireSession();
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (
      status === 401 &&
      !original?._retry &&
      typeof window !== "undefined"
    ) {
      original._retry = true;

      try {
        const newAccess = await refreshTokenOnce();
        if (newAccess && original.headers) {
          original.headers.Authorization = `Bearer ${newAccess}`;
          return api(original);
        }
        expireSession();
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    // 403 — do NOT redirect globally; let the calling component handle it inline
    // with a graceful AccessDenied state so the user stays on the current page.

    return Promise.reject(error);
  }
);

export default api;

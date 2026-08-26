/**
 * Axios instance dengan JWT interceptor & Cookie Sync
 * Ported dari uji_prototype/js/core/http.js
 */

import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

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
    }
    return config;
  },
  (err) => Promise.reject(err)
);

/* ── Response Interceptor: handle 401 → refresh token with Mutex Singleton ── */
let refreshPromise: Promise<string | null> | null = null;

function refreshTokenOnce(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  if (typeof window === "undefined") return Promise.resolve(null);
  const refresh = localStorage.getItem("erp.refresh");
  if (!refresh || refresh.startsWith("demo-")) {
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
      localStorage.removeItem("erp.access");
      localStorage.removeItem("erp.refresh");
      localStorage.removeItem("access_token");
      localStorage.removeItem("token");
      localStorage.removeItem("erp.company");
      localStorage.removeItem("active_company_id");
      syncCookie();

      if (
        typeof window !== "undefined" &&
        !window.location.pathname.includes("/login") &&
        !window.location.pathname.includes("/error/")
      ) {
        window.location.href = "/error/401";
      }
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
      } catch (refreshErr) {
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.includes("/login") &&
          !window.location.pathname.includes("/error/")
        ) {
          window.location.href = "/error/401";
        }
        return Promise.reject(refreshErr);
      }
    }

    if (
      status === 403 &&
      typeof window !== "undefined" &&
      !window.location.pathname.includes("/error/")
    ) {
      window.location.href = "/error/403";
    }

    return Promise.reject(error);
  }
);

export default api;
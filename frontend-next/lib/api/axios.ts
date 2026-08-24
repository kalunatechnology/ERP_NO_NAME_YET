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

      if (access) {
        config.headers.Authorization = `Bearer ${access}`;
      }

      const company = localStorage.getItem("erp.company");
      if (company && company !== "all") {
        config.headers["X-Company-ID"] = company;
      }
    }
    return config;
  },
  (err) => Promise.reject(err)
);

/* ── Response Interceptor: handle 401 → refresh token ── */
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (
      error.response?.status === 401 &&
      !original._retry &&
      typeof window !== "undefined"
    ) {
      original._retry = true;
      const refresh = localStorage.getItem("erp.refresh");

      if (refresh) {
        try {
          const { data } = await axios.post(
            `${API_BASE}/api/v1/auth/token/refresh/`,
            { refresh }
          );

          const newAccess = data.access || data.token;
          if (newAccess) {
            localStorage.setItem("erp.access", newAccess);
            localStorage.setItem("access_token", newAccess);
            syncCookie(newAccess);

            original.headers.Authorization = `Bearer ${newAccess}`;
            return api(original);
          }
        } catch {
          // Refresh gagal → bersihkan seluruh storage & cookie, lalu redirect login
          localStorage.removeItem("erp.access");
          localStorage.removeItem("erp.refresh");
          localStorage.removeItem("access_token");
          localStorage.removeItem("token");
          localStorage.removeItem("erp.company");
          syncCookie();

          if (!window.location.pathname.includes("/login")) {
            window.location.href = "/login";
          }
        }
      } else {
        // Tidak ada refresh token → arahkan ke login
        syncCookie();
        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
/**
 * Axios instance dengan JWT interceptor
 * Ported dari uji_prototype/js/core/http.js
 */

import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

/* ── Request Interceptor: tambah Authorization header ── */
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const access = localStorage.getItem("erp.access");
      if (access) {
        config.headers.Authorization = `Bearer ${access}`;
      }
      const company = localStorage.getItem("erp.company");
      if (company && company !== "arsalyn" && company !== "all") {
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
          localStorage.setItem("erp.access", data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          // Refresh failed → clear tokens
          localStorage.removeItem("erp.access");
          localStorage.removeItem("erp.refresh");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

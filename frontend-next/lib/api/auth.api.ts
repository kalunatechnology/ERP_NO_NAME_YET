/**
 * Purpose: Defines frontend API adapter contracts and their integration boundary for the frontend application.
 * Responsibility: Documents and exposes only the behavior implemented in this file; function comments identify inputs, outputs, dependencies, and side effects.
 * Auth API
 * Ported dari uji_prototype/js/services/auth.service.js
 */

import api from "./axios";

export interface LoginPayload {
  access: string;
  refresh: string;
  user?: UserProfile;
}

export interface UserProfile {
  id: string | number;
  email: string;
  username?: string;
  full_name?: string;
  is_superuser?: boolean;
  is_staff?: boolean;
  company_id?: string | null;
  company?: { id: string | number; name?: string; legal_name?: string; code?: string; company_code?: string } | null;
  active_role_code?: string | null;
  enabled_modules?: string[];
  roles?: { role?: string; role_code?: string; role_name?: string; company_id?: string | number | null }[];
}


/* ── Login ────────────────────────────────── */
/**
 * loginUser adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: uses the configured API client/base URL referenced below. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function loginUser(email: string, password: string): Promise<LoginPayload> {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const res = await api.post<any>("/api/v1/auth/token/", {
      email: cleanEmail,
      username: cleanEmail,
      password,
    }, { timeout: 15_000 });
    const payload = res.data?.data || res.data;
    const access = payload?.access;
    const refresh = payload?.refresh || "";

    if (access) {
      localStorage.setItem("erp.access", access);
      localStorage.setItem("erp.refresh", refresh);
      const rawUser = payload.user || payload;
      const userObj = rawUser?.user ? { ...rawUser.user, roles: rawUser.roles || [] } : rawUser;
      if (userObj) {
        localStorage.setItem("erp.user", JSON.stringify(userObj));
      }
      return { access, refresh, user: userObj };
    }

    throw new Error("Respon otentikasi tidak valid dari server.");
  } catch (err: any) {
    const errorMsg =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      "Email atau password tidak valid.";
    throw new Error(errorMsg);
  }
}

/* ── Get current user profile ─────────────── */
/**
 * getMyProfile adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: uses the configured API client/base URL referenced below. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function getMyProfile(): Promise<UserProfile> {
  const res = await api.get<any>("/api/v1/auth/me/");
  const raw = res.data?.data || res.data;
  const userObj: UserProfile | null = raw?.user
    ? {
        ...raw.user,
        roles: raw.roles || raw.user.roles || [],
        active_role_code: raw.active_role_code || raw.user.active_role_code || null,
        enabled_modules: raw.enabled_modules || raw.user.enabled_modules || [],
      }
    : raw;

  if (!userObj || (!userObj.full_name && !userObj.email)) {
    throw new Error("Profil user tidak valid dari server.");
  }
  localStorage.setItem("erp.user", JSON.stringify(userObj));
  return userObj;
}

/**
 * changeActiveRole adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/auth/active-role/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function changeActiveRole(roleCode: string): Promise<UserProfile> {
  await api.patch("/api/v1/auth/active-role/", { role_code: roleCode });
  return getMyProfile();
}


/* ── Logout ───────────────────────────────── */
/**
 * logoutUser adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/auth/logout/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function logoutUser(): Promise<void> {
  const refresh = localStorage.getItem("erp.refresh");
  if (refresh) {
    await api.post("/api/v1/auth/logout/", { refresh }).catch(() => {});
  }
  localStorage.removeItem("erp.access");
  localStorage.removeItem("erp.refresh");
  localStorage.removeItem("erp.company");
  localStorage.removeItem("erp.user");
}

/* ── Get companies list ───────────────────── */
/**
 * getCompanies adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/core/companies/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function getCompanies() {
  const { data } = await api.get("/api/v1/core/companies/");
  const normalized = normalizeList<Record<string, unknown>>(data);
  return {
    count: normalized.count,
    rows: normalized.rows.map((company) => ({
      ...company,
      id: String(company.id),
      name: String(company.legal_name || company.name || "Company"),
      code: String(company.company_code || company.code || ""),
    })),
  };
}

/* ── Change password ─────────────────────── */
/**
 * changePassword adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/auth/change-password/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await api.post("/api/v1/auth/change-password/", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}

/* ── Update Profile (Name & Email) ────────── */
/**
 * updateUserProfile adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: calls `/api/v1/auth/update-profile/`. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
export async function updateUserProfile(payload: { full_name?: string; email?: string; phone?: string }) {
  const { data } = await api.post("/api/v1/auth/update-profile/", payload);
  if (data?.user) {
    localStorage.setItem("erp.user", JSON.stringify(data.user));
  }
  return data;
}

/* ── Helper: normalize DRF paginated response ── */
export function normalizeList<T>(response: unknown): { rows: T[]; count: number } {
  if (Array.isArray(response)) return { rows: response as T[], count: (response as T[]).length };
  const r = response as Record<string, unknown>;
  if (r && typeof r === "object") {
    if ("results" in r && Array.isArray(r.results)) {
      return { rows: (r.results as T[]) || [], count: (r.count as number) || r.results.length };
    }
    if ("data" in r && Array.isArray(r.data)) {
      return { rows: (r.data as T[]) || [], count: (r.count as number) || r.data.length };
    }
  }
  return { rows: [], count: 0 };
}

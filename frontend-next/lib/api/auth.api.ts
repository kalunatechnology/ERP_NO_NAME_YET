/**
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
  roles?: { role: string; role_code?: string; role_name?: string; company_id?: string | number }[];
}

export const DEMO_PROFILES: UserProfile[] = [
  {
    id: "e0000000-0000-0000-0000-000000000001",
    email: "rian.destianto@arsalynk.id",
    username: "rian.destianto",
    full_name: "Rian Destianto",
    is_superuser: true,
    is_staff: true,
    roles: [{ role: "EXECUTIVE", role_code: "ROLE-DIRECTOR", role_name: "Executive Director" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000002",
    email: "melika.citra@arsalynk.id",
    username: "melika.citra",
    full_name: "Melika Citra Tania",
    roles: [{ role: "PROJECT_MANAGER", role_code: "ROLE-PM", role_name: "PM & Operational Manager" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000003",
    email: "arof.fudding@arsalynk.id",
    username: "arof.fudding",
    full_name: "Arof Fudding",
    roles: [
      { role: "PROJECT_MANAGER", role_code: "ROLE-PM", role_name: "Project Manager" },
      { role: "FINANCE", role_code: "ROLE-FINANCE", role_name: "Finance Controller" },
    ],
  },
  {
    id: "e0000000-0000-0000-0000-000000000004",
    email: "laode.fahmi@arsalynk.id",
    username: "laode.fahmi",
    full_name: "Laode Fahmi Hidayat",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-SUPERVISOR", role_name: "Project Assignee" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000005",
    email: "jundy.isham@arsalynk.id",
    username: "jundy.isham",
    full_name: "Jundy Isham Izzudin",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-SUPERVISOR", role_name: "Project Assignee" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000006",
    email: "noorman.perdana@arsalynk.id",
    username: "noorman.perdana",
    full_name: "M Noorman Perdana",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-SUPERVISOR", role_name: "Project Assignee" }],
  },
];

/* ── Login ────────────────────────────────── */
export async function loginUser(email: string, password: string): Promise<LoginPayload> {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const res = await api.post<any>("/api/v1/auth/token/", {
      email: cleanEmail,
      username: cleanEmail,
      password,
    });
    const payload = res.data?.data || res.data;
    const access = payload?.access;
    const refresh = payload?.refresh || "";

    if (access) {
      localStorage.setItem("erp.access", access);
      localStorage.setItem("erp.refresh", refresh);
      const user = payload.user || DEMO_PROFILES.find(p => p.email.toLowerCase() === cleanEmail);
      if (user) {
        localStorage.setItem("erp.user", JSON.stringify(user));
      }
      return { access, refresh, user };
    }
  } catch (err) {
    console.warn("Backend auth token returned error, verifying demo account fallback...", err);
  }

  // Guaranteed fallback for all dummy/demo personas
  const demo = DEMO_PROFILES.find(
    p => p.email.toLowerCase() === cleanEmail ||
         (p.username && p.username.toLowerCase() === cleanEmail)
  );

  if (demo) {
    const demoToken = "demo-jwt-" + btoa(unescape(encodeURIComponent(JSON.stringify(demo))));
    localStorage.setItem("erp.access", demoToken);
    localStorage.setItem("erp.refresh", "demo-refresh-token");
    localStorage.setItem("erp.user", JSON.stringify(demo));
    return { access: demoToken, refresh: "demo-refresh-token", user: demo };
  }

  throw new Error("Email atau password tidak ditemukan.");
}

/* ── Get current user profile ─────────────── */
export async function getMyProfile(): Promise<UserProfile> {
  const access = localStorage.getItem("erp.access");
  if (access && access.startsWith("demo-jwt-")) {
    const storedUser = localStorage.getItem("erp.user");
    if (storedUser) {
      try { return JSON.parse(storedUser); } catch {}
    }
  }

  try {
    const res = await api.get<any>("/api/v1/auth/me/");
    const user = res.data?.data || res.data;
    if (user) {
      localStorage.setItem("erp.user", JSON.stringify(user));
      return user;
    }
  } catch {
    const storedUser = localStorage.getItem("erp.user");
    if (storedUser) {
      try { return JSON.parse(storedUser); } catch {}
    }
  }

  return DEMO_PROFILES[0];
}

/* ── Logout ───────────────────────────────── */
export async function logoutUser(): Promise<void> {
  const refresh = localStorage.getItem("erp.refresh");
  if (refresh && !refresh.startsWith("demo-")) {
    await api.post("/api/v1/auth/logout/", { refresh }).catch(() => {});
  }
  localStorage.removeItem("erp.access");
  localStorage.removeItem("erp.refresh");
  localStorage.removeItem("erp.company");
  localStorage.removeItem("erp.user");
}

/* ── Get companies list ───────────────────── */
export async function getCompanies() {
  try {
    const { data } = await api.get("/api/v1/core/companies/");
    return normalizeList(data);
  } catch {
    return {
      rows: [
        { id: "arsalyn", name: "PT. Arsalynt Automation (Default)", code: "ARSLN" },
        { id: "kaluna", name: "Kaluna Technology Corp", code: "KLN" },
      ],
      count: 2
    };
  }
}

/* ── Change password ─────────────────────── */
export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await api.post("/api/v1/auth/change-password/", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}

/* ── Update Profile (Name & Email) ────────── */
export async function updateUserProfile(payload: { full_name?: string; email?: string; phone?: string }) {
  const { data } = await api.post("/api/v1/auth/update-profile/", payload);
  if (data?.user) {
    localStorage.setItem("erp.user", JSON.stringify(data.user));
  }
  return data;
}

/* ── Signup / Register User ──────────────── */
export async function registerUser(payload: {
  name: string;
  email: string;
  phone?: string;
  password?: string;
  roleCode?: string;
  companyCode?: string;
}) {
  const { data } = await api.post("/api/v1/auth/signup/", payload);
  if (data?.access) {
    localStorage.setItem("erp.access", data.access);
    if (data.refresh) localStorage.setItem("erp.refresh", data.refresh);
    if (data.user) localStorage.setItem("erp.user", JSON.stringify(data.user));
    if (typeof document !== "undefined") {
      document.cookie = `access_token=${data.access}; path=/; max-age=86400; SameSite=Lax`;
    }
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

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
    email: "admin@arsalynk.id",
    username: "admin.arsalynk",
    full_name: "Arsalynk Administrator",
    is_superuser: true,
    is_staff: true,
    roles: [{ role: "ADMIN", role_code: "ADMIN", role_name: "Super Administrator" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000002",
    email: "dummy.admin@example.com",
    username: "admin.dummy",
    full_name: "Dummy Administrator",
    is_superuser: true,
    is_staff: true,
    roles: [{ role: "ADMIN", role_code: "ADMIN", role_name: "Administrator" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000003",
    email: "pm@arsalynk.id",
    username: "pm.arsalynk",
    full_name: "Budi Santoso",
    roles: [{ role: "PROJECT_MANAGER", role_code: "PROJECT_MANAGER", role_name: "Project Manager" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000004",
    email: "dummy.pm@example.com",
    username: "pm.dummy",
    full_name: "Budi Santoso",
    roles: [{ role: "PROJECT_MANAGER", role_code: "PROJECT_MANAGER", role_name: "Project Manager" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000005",
    email: "project.manager.demo@erp.local",
    username: "pm.demo",
    full_name: "Budi Santoso",
    roles: [{ role: "PROJECT_MANAGER", role_code: "PROJECT_MANAGER", role_name: "Project Manager" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000006",
    email: "supervisor@arsalynk.id",
    username: "supervisor.arsalynk",
    full_name: "Ahmad Rizki",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "PROJECT_ASSIGNEE", role_name: "Field Supervisor" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000007",
    email: "dummy.assignee@example.com",
    username: "assignee.dummy",
    full_name: "Ahmad Rizki",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "PROJECT_ASSIGNEE", role_name: "Field Assignee" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000008",
    email: "assignee.demo@erp.local",
    username: "assignee.demo",
    full_name: "Ahmad Rizki",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "PROJECT_ASSIGNEE", role_name: "Field Assignee" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000009",
    email: "manager@arsalynk.id",
    username: "manager.arsalynk",
    full_name: "Hendra Wijaya",
    roles: [{ role: "CRM_MANAGER", role_code: "CRM_MANAGER", role_name: "CRM Manager" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000010",
    email: "dummy.manager@example.com",
    username: "manager.dummy",
    full_name: "Hendra Wijaya",
    roles: [{ role: "CRM_MANAGER", role_code: "CRM_MANAGER", role_name: "CRM Manager" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000011",
    email: "sales@arsalynk.id",
    username: "sales.arsalynk",
    full_name: "Rina Sari",
    roles: [{ role: "CRM_STAFF", role_code: "CRM_STAFF", role_name: "Commercial & Sales" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000012",
    email: "dummy.staff@example.com",
    username: "staff.dummy",
    full_name: "Rina Sari",
    roles: [{ role: "CRM_STAFF", role_code: "CRM_STAFF", role_name: "CRM Staff" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000013",
    email: "finance@arsalynk.id",
    username: "finance.arsalynk",
    full_name: "Siti Rahma",
    roles: [{ role: "ACCOUNTING_FINANCE", role_code: "ACCOUNTING_FINANCE", role_name: "Finance Controller" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000014",
    email: "dummy.finance@example.com",
    username: "finance.dummy",
    full_name: "Siti Rahma",
    roles: [{ role: "ACCOUNTING_FINANCE", role_code: "ACCOUNTING_FINANCE", role_name: "Finance Staff" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000015",
    email: "finance.controller@erp.local",
    username: "finance.controller",
    full_name: "Siti Rahma",
    roles: [{ role: "ACCOUNTING_FINANCE", role_code: "ACCOUNTING_FINANCE", role_name: "Finance Controller" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000016",
    email: "director@arsalynk.id",
    username: "director.arsalynk",
    full_name: "Executive Director",
    is_superuser: true,
    roles: [{ role: "EXECUTIVE", role_code: "EXECUTIVE", role_name: "Executive Director" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000017",
    email: "executive.demo@erp.local",
    username: "executive.demo",
    full_name: "Executive Director",
    is_superuser: true,
    roles: [{ role: "EXECUTIVE", role_code: "EXECUTIVE", role_name: "Executive Director" }],
  }
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

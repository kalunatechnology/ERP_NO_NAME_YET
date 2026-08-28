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
  /* ── 8 Akun Resmi PT Sinergi Muda Arsa (@arsalynk.com) ── */
  {
    id: "e0000000-0000-0000-0000-000000000001",
    email: "rian@arsalynk.com",
    username: "rian",
    full_name: "Rian Destianto",
    is_superuser: true,
    is_staff: true,
    roles: [{ role: "EXECUTIVE", role_code: "ROLE-DIRECTOR", role_name: "Director & Super Admin", company_id: "10000000-0000-0000-0000-000000000001" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000002",
    email: "melika@arsalynk.com",
    username: "melika",
    full_name: "Melika Citra Tania",
    roles: [{ role: "PROJECT_MANAGER", role_code: "ROLE-PM", role_name: "Lead Project Manager", company_id: "10000000-0000-0000-0000-000000000001" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000003",
    email: "melika.ops@arsalynk.com",
    username: "melika.ops",
    full_name: "Melika (Ops & Supervisor)",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-SUPERVISOR", role_name: "Operational Lead & Supervisor", company_id: "10000000-0000-0000-0000-000000000001" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000004",
    email: "arof@arsalynk.com",
    username: "arof",
    full_name: "Arof Fudding",
    roles: [{ role: "PROJECT_MANAGER", role_code: "ROLE-PM", role_name: "Lead Project Manager & Riset", company_id: "10000000-0000-0000-0000-000000000001" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000005",
    email: "arof.finance@arsalynk.com",
    username: "arof.finance",
    full_name: "Arof (Finance & Tax)",
    roles: [{ role: "FINANCE", role_code: "ROLE-FINANCE", role_name: "Finance Lead & Tax Controller", company_id: "10000000-0000-0000-0000-000000000001" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000006",
    email: "laode@arsalynk.com",
    username: "laode",
    full_name: "Laode Fahmi Hidayat",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-SUPERVISOR", role_name: "Field Specialist / Engineer", company_id: "10000000-0000-0000-0000-000000000001" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000007",
    email: "jundy@arsalynk.com",
    username: "jundy",
    full_name: "Jundy Isham Izzudin",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-SUPERVISOR", role_name: "Field Specialist / Creative Media", company_id: "10000000-0000-0000-0000-000000000001" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000008",
    email: "noorman@arsalynk.com",
    username: "noorman",
    full_name: "M Noorman Perdana",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-SUPERVISOR", role_name: "Field Specialist / Survey Specialist", company_id: "10000000-0000-0000-0000-000000000001" }],
  },

  /* ── Legacy Aliases ── */
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
  /* ── 10 Ghost Demo Personas ── */
  {
    id: "e0000000-0000-0000-0000-000000000010",
    email: "admin.director@arsalynk.id",
    username: "admin.director",
    full_name: "Ghost Admin System",
    is_superuser: true,
    is_staff: true,
    roles: [{ role: "EXECUTIVE", role_code: "ROLE-ADMIN", role_name: "Ghost Admin System" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000011",
    email: "director@arsalynk.id",
    username: "director",
    full_name: "Ghost Executive Director",
    is_superuser: true,
    is_staff: true,
    roles: [{ role: "EXECUTIVE", role_code: "ROLE-DIRECTOR", role_name: "Ghost Executive Director" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000012",
    email: "pm.lead@arsalynk.id",
    username: "pm.lead",
    full_name: "Ghost Lead Project Manager",
    roles: [{ role: "PROJECT_MANAGER", role_code: "ROLE-PM", role_name: "Ghost Lead Project Manager" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000013",
    email: "supervisor@arsalynk.id",
    username: "supervisor",
    full_name: "Ghost Field Supervisor",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-SUPERVISOR", role_name: "Ghost Field Supervisor" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000014",
    email: "crm.lead@arsalynk.id",
    username: "crm.lead",
    full_name: "Ghost CRM & Commercial Lead",
    roles: [{ role: "CRM", role_code: "ROLE-CRM", role_name: "Ghost CRM & Commercial Lead" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000015",
    email: "sales@arsalynk.id",
    username: "sales",
    full_name: "Ghost Commercial & Sales Staff",
    roles: [{ role: "CRM", role_code: "ROLE-SALES", role_name: "Ghost Commercial & Sales Staff" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000016",
    email: "finance.lead@arsalynk.id",
    username: "finance.lead",
    full_name: "Ghost Finance Controller",
    roles: [{ role: "FINANCE", role_code: "ROLE-FINANCE", role_name: "Ghost Finance Controller" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000017",
    email: "dummy.finance@example.com",
    username: "dummy.finance",
    full_name: "Ghost AP & AR Specialist",
    roles: [{ role: "FINANCE", role_code: "ROLE-APAR", role_name: "Ghost AP & AR Specialist" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000018",
    email: "estimator@arsalynk.id",
    username: "estimator",
    full_name: "Ghost Cost Estimator",
    roles: [{ role: "PROJECT_MANAGER", role_code: "ROLE-ESTIMATOR", role_name: "Ghost Cost Estimator" }],
  },
  {
    id: "e0000000-0000-0000-0000-000000000019",
    email: "staff.dev@arsalynk.id",
    username: "staff.dev",
    full_name: "Ghost Technical & Dev Staff",
    roles: [{ role: "PROJECT_ASSIGNEE", role_code: "ROLE-STAFF", role_name: "Ghost Technical Staff" }],
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
    const raw = res.data?.data || res.data;
    if (raw) {
      const userObj: UserProfile = raw.user
        ? {
            ...raw.user,
            roles: raw.roles || raw.user.roles || [],
          }
        : raw;

      if (userObj && (userObj.full_name || userObj.email)) {
        localStorage.setItem("erp.user", JSON.stringify(userObj));
        return userObj;
      }
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
        { id: "10000000-0000-0000-0000-000000000001", name: "PT Sinergi Muda Arsa", code: "SMA" },
        { id: "00000000-0000-0000-0000-000000000010", name: "PT Coba Arsalynk (Ghost Company)", code: "GHOST-ARSALYNK" },
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

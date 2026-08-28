/**
 * AuthContext — Global JWT Auth State & Multitenant Company Scoping
 * Provides: user, company, companies, isAdmin, userRole, isAuthenticated, login, logout, setCompany
 */
"use client";

import React, {
  createContext, useContext, useEffect, useReducer, useCallback, ReactNode,
} from "react";
import {
  loginUser, logoutUser, getMyProfile, getCompanies, UserProfile,
} from "@/lib/api/auth.api";

/* ── UUID Regex Helper ───────────────────────── */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Cookie Helpers ──────────────────────────── */
function setAuthCookie(token: string) {
  if (typeof document !== "undefined") {
    document.cookie = `access_token=${token}; path=/; max-age=86400; SameSite=Lax`;
  }
}

function removeAuthCookie() {
  if (typeof document !== "undefined") {
    document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
  }
}

/* ── Role Type ───────────────────────────────── */
export type UserRoleType = "executive" | "pm" | "finance" | "crm" | "staff";

/**
 * Detects user's primary role from their profile (roles array + email pattern fallback).
 * Priority: executive > pm > finance > crm > staff
 */
export function detectRole(user: any): UserRoleType {
  if (!user) return "staff";

  const email = (user.email || "").toLowerCase();
  const username = (user.username || "").toLowerCase();
  const rawRole = (user.role || "").toUpperCase();

  const roles: string[] = [];
  if (Array.isArray(user.roles)) {
    user.roles.forEach((r: any) => {
      if (typeof r === "string") {
        roles.push(r.toUpperCase());
      } else if (r && typeof r === "object") {
        if (r.role) roles.push(String(r.role).toUpperCase());
        if (r.role_code) roles.push(String(r.role_code).toUpperCase());
        if (r.name) roles.push(String(r.name).toUpperCase());
        if (r.code) roles.push(String(r.code).toUpperCase());
      }
    });
  }
  if (rawRole) roles.push(rawRole);

  // Executive / Admin first (highest privilege)
  if (
    user.is_superuser ||
    roles.some(r => ["ADMIN", "EXECUTIVE", "DIRECTOR", "ROLE-ADMIN", "ROLE-DIRECTOR", "SUPERADMIN", "SUPER_ADMIN"].includes(r)) ||
    username.includes("admin") ||
    email.includes("admin") || email.includes("exec") || email.includes("director") ||
    (email.includes("arsalynk") && (email.includes("admin") || email.includes("director")))
  ) return "executive";

  // Project Manager — diperluas untuk menangani format pm.lead, lead.pm, dll.
  if (
    roles.some(r => [
      "PROJECT_MANAGER", "PM", "PROJECT_MANAGEMENT", "SUPERVISOR",
      "QUALITY_CONTROL", "WAREHOUSE", "ROLE-PM", "ROLE_PROJECT_MANAGER",
      "ROLE-SUPERVISOR", "ROLE-ESTIMATOR", "PROJECT_ASSIGNEE",
    ].includes(r)) ||
    username.startsWith("pm") || username.includes(".pm") || username.includes("pm.") ||
    username.includes("project") || username.includes("supervisor") ||
    username.includes("estimator") || username.includes("qc") ||
    email.startsWith("pm") || email.includes("pm@") || email.includes(".pm@") ||
    email.includes("pm.") || email.includes("project") ||
    email.includes("supervisor") || email.includes("estimator") ||
    email.includes("qc") || email.includes("warehouse")
  ) return "pm";

  // Finance
  if (
    roles.some(r => [
      "ACCOUNTING_FINANCE", "FINANCE", "FINANCE_APPROVER",
      "ACCOUNTING", "ROLE-FINANCE", "ROLE-APAR",
    ].includes(r)) ||
    username.includes("finance") || username.includes("accounting") ||
    email.includes("finance") || email.includes("accounting") || email.includes("keuangan")
  ) return "finance";

  // CRM / Sales / Manager
  if (
    roles.some(r => [
      "CRM_MANAGER", "CRM_STAFF", "CRM", "SALES", "MANAGER",
      "ROLE-MANAGER", "ROLE-CRM", "ROLE-SALES",
    ].includes(r)) ||
    username.includes("crm") || username.includes("sales") ||
    email.includes("crm") || email.includes("sales") || email.includes("manager") ||
    email.includes("commercial")
  ) return "crm";

  return "staff";
}

/** Human-readable role label for display */
export function getRoleLabel(role: UserRoleType): string {
  switch (role) {
    case "executive": return "Executive / Director";
    case "pm":        return "Project Manager";
    case "finance":   return "Finance Controller";
    case "crm":       return "CRM & Sales";
    default:          return "Staff";
  }
}

/** Role badge color */
export function getRoleBadgeStyle(role: UserRoleType): { bg: string; text: string } {
  switch (role) {
    case "executive": return { bg: "#F0FDF4", text: "#15803D" };
    case "pm":        return { bg: "#EFF6FF", text: "#1D4ED8" };
    case "finance":   return { bg: "#FFF7ED", text: "#C2410C" };
    case "crm":       return { bg: "#FAF5FF", text: "#7E22CE" };
    default:          return { bg: "#F9FAFB", text: "#374151" };
  }
}

/* ── State ───────────────────────────────────── */
export interface CompanyItem {
  id: string | number;
  name: string;
  code?: string;
}

interface AuthState {
  user: UserProfile | null;
  company: string | null;
  companies: CompanyItem[];
  isAdmin: boolean;
  userRole: UserRoleType;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: "LOADING" }
  | { type: "LOGIN_SUCCESS"; user: UserProfile; company: string | null; companies: CompanyItem[]; isAdmin: boolean; userRole: UserRoleType }
  | { type: "LOGOUT" }
  | { type: "ERROR"; message: string }
  | { type: "SET_COMPANY"; company: string | null }
  | { type: "CLEAR_ERROR" };

function checkIsAdmin(user: any): boolean {
  if (!user) return false;
  if (user.is_superuser || user.is_staff) return true;
  const roles: string[] = [];
  if (Array.isArray(user.roles)) {
    user.roles.forEach((r: any) => {
      if (typeof r === "string") roles.push(r.toUpperCase());
      else if (r && typeof r === "object") {
        if (r.role) roles.push(String(r.role).toUpperCase());
        if (r.name) roles.push(String(r.name).toUpperCase());
      }
    });
  }
  if (roles.some(r => ["ADMIN", "ROLE-ADMIN", "SUPERADMIN", "SUPER_ADMIN", "EXECUTIVE", "DIRECTOR"].includes(r))) return true;
  const email = (user.email || "").toLowerCase();
  const username = (user.username || "").toLowerCase();
  if (email.includes("admin") || email.includes("exec") || email.includes("director") || username.includes("admin")) return true;
  return false;
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOADING":
      return { ...state, isLoading: true, error: null };
    case "LOGIN_SUCCESS":
      return {
        ...state,
        user: action.user,
        company: action.company,
        companies: action.companies,
        isAdmin: action.isAdmin,
        userRole: action.userRole,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case "LOGOUT":
      return { user: null, company: null, companies: [], isAdmin: false, userRole: "staff", isAuthenticated: false, isLoading: false, error: null };
    case "ERROR":
      return { ...state, isLoading: false, error: action.message };
    case "SET_COMPANY":
      return { ...state, company: action.company };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

/* ── Context ────────────────────────────────── */
export interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setCompany: (id: string | null) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Provider ───────────────────────────────── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    company: null,
    companies: [],
    isAdmin: false,
    userRole: "staff",
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  const setCompany = useCallback((id: string | null) => {
    if (id && (UUID_REGEX.test(String(id).trim()) || String(id) === "all")) {
      localStorage.setItem("erp.company", String(id));
      localStorage.setItem("active_company_id", String(id));
    } else {
      localStorage.removeItem("erp.company");
      localStorage.removeItem("active_company_id");
    }
    dispatch({ type: "SET_COMPANY", company: id });
  }, []);

  /* Check existing token on mount */
  useEffect(() => {
    const access = localStorage.getItem("erp.access") || localStorage.getItem("access_token");
    if (!access) {
      removeAuthCookie();
      dispatch({ type: "LOGOUT" });
      return;
    }

    setAuthCookie(access);

    getMyProfile()
      .then(async (user) => {
        let companiesList: CompanyItem[] = [];
        try {
          const compRes = await getCompanies();
          if (compRes.rows?.length) {
            companiesList = compRes.rows.map((c: any) => ({
              id: c.id,
              name: c.legal_name || c.display_name || c.name || "Company",
              code: c.company_code || c.code || "COMP"
            }));
          }
        } catch {/* ignore */}

        const isAdmin = checkIsAdmin(user);
        const userRole = detectRole(user);

        const userEmail = (user?.email || "").toLowerCase();
        const isGhostUser =
          userEmail.endsWith("@arsalynk.id") ||
          userEmail.includes("dummy") ||
          userEmail.includes("demo") ||
          userEmail.endsWith("@example.com") ||
          (user as any)?.tenant_id === "00000000-0000-0000-0000-000000000099";

        const ghostComp = companiesList.find(c =>
          String(c.code).toUpperCase().includes("GHOST") ||
          String(c.name).toLowerCase().includes("ghost") ||
          String(c.name).toLowerCase().includes("coba")
        );
        const smaComp = companiesList.find(c =>
          String(c.code).toUpperCase() === "SMA" ||
          String(c.name).toLowerCase().includes("sinergi") ||
          String(c.name).toLowerCase().includes("arsa")
        );

        const targetComp = isGhostUser ? (ghostComp || companiesList[1] || companiesList[0]) : (smaComp || companiesList[0]);
        const activeCompany = targetComp?.id ? String(targetComp.id) : null;

        if (activeCompany) {
          localStorage.setItem("erp.company", activeCompany);
          localStorage.setItem("active_company_id", activeCompany);
        }

        dispatch({ type: "LOGIN_SUCCESS", user, company: activeCompany, companies: companiesList, isAdmin, userRole });
      })
      .catch(() => {
        localStorage.removeItem("erp.access");
        localStorage.removeItem("erp.refresh");
        localStorage.removeItem("access_token");
        localStorage.removeItem("erp.company");
        localStorage.removeItem("active_company_id");
        removeAuthCookie();
        dispatch({ type: "LOGOUT" });
      });
  }, []);

  /* Login */
  const login = useCallback(async (email: string, password: string) => {
    dispatch({ type: "LOADING" });
    try {
      // Clear previous user's company cache
      localStorage.removeItem("erp.company");
      localStorage.removeItem("active_company_id");

      await loginUser(email, password);
      
      const savedToken = localStorage.getItem("erp.access") || localStorage.getItem("access_token");
      if (savedToken) {
        setAuthCookie(savedToken);
      }

      const user = await getMyProfile();
      let companiesList: CompanyItem[] = [];
      try {
        const compRes = await getCompanies();
        if (compRes.rows?.length) {
          companiesList = compRes.rows.map((c: any) => ({
            id: c.id,
            name: c.legal_name || c.display_name || c.name || "Company",
            code: c.company_code || c.code || "COMP"
          }));
        }
      } catch {/* ignore */}

      const isAdmin = checkIsAdmin(user);
      const userRole = detectRole(user);

      const userEmail = (user?.email || "").toLowerCase();
      const isGhostUser =
        userEmail.endsWith("@arsalynk.id") ||
        userEmail.includes("dummy") ||
        userEmail.includes("demo") ||
        userEmail.endsWith("@example.com") ||
        (user as any)?.tenant_id === "00000000-0000-0000-0000-000000000099";

      const ghostComp = companiesList.find(c =>
        String(c.code).toUpperCase().includes("GHOST") ||
        String(c.name).toLowerCase().includes("ghost") ||
        String(c.name).toLowerCase().includes("coba")
      );
      const smaComp = companiesList.find(c =>
        String(c.code).toUpperCase() === "SMA" ||
        String(c.name).toLowerCase().includes("sinergi") ||
        String(c.name).toLowerCase().includes("arsa")
      );

      const targetComp = isGhostUser ? (ghostComp || companiesList[1] || companiesList[0]) : (smaComp || companiesList[0]);
      const activeCompany = targetComp?.id ? String(targetComp.id) : null;

      if (activeCompany) {
        localStorage.setItem("erp.company", activeCompany);
        localStorage.setItem("active_company_id", activeCompany);
      }

      dispatch({ type: "LOGIN_SUCCESS", user, company: activeCompany, companies: companiesList, isAdmin, userRole });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Gagal masuk sistem";
      dispatch({ type: "ERROR", message: msg });
      throw err;
    }
  }, []);

  /* Logout */
  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {/* ignore */}
    
    localStorage.removeItem("erp.access");
    localStorage.removeItem("erp.refresh");
    localStorage.removeItem("access_token");
    localStorage.removeItem("erp.company");
    localStorage.removeItem("active_company_id");
    removeAuthCookie();
    dispatch({ type: "LOGOUT" });
    window.location.href = "/login";
  }, []);

  const clearError = useCallback(() => dispatch({ type: "CLEAR_ERROR" }), []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        setCompany,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
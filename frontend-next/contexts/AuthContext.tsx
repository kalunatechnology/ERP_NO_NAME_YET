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

/* ── Role Type ───────────────────────────────── */
export type UserRoleType = "executive" | "pm" | "finance" | "crm" | "staff";

/**
 * Detects user's primary role from their profile (roles array + email pattern fallback).
 * Priority: executive > pm > finance > crm > staff
 */
export function detectRole(user: UserProfile | null): UserRoleType {
  if (!user) return "staff";
  const email = (user.email || "").toLowerCase();
  const roles = (user.roles || []).map(r => (r.role || r.role_code || "").toUpperCase());

  // Executive / Admin first (highest privilege)
  if (
    (user as any).is_superuser ||
    roles.some(r => ["ADMIN", "EXECUTIVE", "DIRECTOR", "ROLE-ADMIN", "SUPERADMIN", "SUPER_ADMIN"].includes(r)) ||
    email.includes("admin") || email.includes("exec") || email.includes("director") ||
    email.includes("arsalynk") && (email.includes("admin") || email.includes("director"))
  ) return "executive";

  // Project Manager
  if (
    roles.some(r => ["PROJECT_MANAGER", "PROJECT_MANAGEMENT", "SUPERVISOR", "QUALITY_CONTROL", "WAREHOUSE"].includes(r)) ||
    email.includes("pm@") || email.includes("pm.") || email.includes("project") ||
    email.includes("supervisor") || email.includes("qc") || email.includes("warehouse")
  ) return "pm";

  // Finance
  if (
    roles.some(r => ["ACCOUNTING_FINANCE", "FINANCE", "FINANCE_APPROVER"].includes(r)) ||
    email.includes("finance") || email.includes("accounting") || email.includes("keuangan")
  ) return "finance";

  // CRM / Sales / Manager
  if (
    roles.some(r => ["CRM_MANAGER", "CRM_STAFF", "CRM", "SALES", "MANAGER", "ROLE-MANAGER", "ROLE-STAFF"].includes(r)) ||
    email.includes("crm") || email.includes("sales") || email.includes("manager") ||
    email.includes("staff") || email.includes("commercial")
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

function checkIsAdmin(user: UserProfile | null): boolean {
  if (!user) return false;
  if ((user as any).is_superuser || (user as any).is_staff) return true;
  const roles = (user.roles || []).map(r => (r.role || "").toUpperCase());
  if (roles.some(r => ["ADMIN", "ROLE-ADMIN", "SUPERADMIN", "SUPER_ADMIN", "EXECUTIVE", "DIRECTOR"].includes(r))) return true;
  const email = (user.email || "").toLowerCase();
  if (email.includes("admin") || email.includes("exec") || email.includes("director")) return true;
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
    companies: [
      { id: "arsalyn", name: "PT. Arsalynt Automation (Default)", code: "ARSLN" },
      { id: "kaluna", name: "Kaluna Technology Corp", code: "KLN" },
    ],
    isAdmin: false,
    userRole: "staff",
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  const setCompany = useCallback((id: string | null) => {
    if (id) {
      localStorage.setItem("erp.company", String(id));
    } else {
      localStorage.removeItem("erp.company");
    }
    dispatch({ type: "SET_COMPANY", company: id });
  }, []);

  /* Check existing token on mount */
  useEffect(() => {
    const access = localStorage.getItem("erp.access");
    if (!access) {
      dispatch({ type: "LOGOUT" });
      return;
    }

    getMyProfile()
      .then(async (user) => {
        let companiesList: CompanyItem[] = [
          { id: "arsalyn", name: "PT. Arsalynt Automation", code: "ARSLN" },
          { id: "kaluna", name: "Kaluna Technology", code: "KLN" },
        ];
        try {
          const compRes = await getCompanies();
          if (compRes.rows?.length) {
            companiesList = compRes.rows.map((c: any) => ({
              id: c.id || c.uuid || c.code || "arsalyn",
              name: c.name || c.legal_name || "Company",
              code: c.code || "COMP"
            }));
          }
        } catch {/* ignore */}

        const isAdmin = checkIsAdmin(user);
        const userRole = detectRole(user);
        let activeCompany: string | null = "arsalyn";

        if (isAdmin) {
          const stored = localStorage.getItem("erp.company");
          activeCompany = stored || "arsalyn";
        } else {
          activeCompany = "arsalyn";
          localStorage.setItem("erp.company", "arsalyn");
        }

        dispatch({ type: "LOGIN_SUCCESS", user, company: activeCompany, companies: companiesList, isAdmin, userRole });
      })
      .catch(() => {
        localStorage.removeItem("erp.access");
        localStorage.removeItem("erp.refresh");
        dispatch({ type: "LOGOUT" });
      });
  }, []);

  /* Login */
  const login = useCallback(async (email: string, password: string) => {
    dispatch({ type: "LOADING" });
    try {
      await loginUser(email, password);
      const user = await getMyProfile();
      let companiesList: CompanyItem[] = [
        { id: "arsalyn", name: "PT. Arsalynt Automation", code: "ARSLN" },
        { id: "kaluna", name: "Kaluna Technology", code: "KLN" },
      ];
      try {
        const compRes = await getCompanies();
        if (compRes.rows?.length) {
          companiesList = compRes.rows.map((c: any) => ({
            id: c.id || c.uuid || c.code || "arsalyn",
            name: c.name || c.legal_name || "Company",
            code: c.code || "COMP"
          }));
        }
      } catch {/* ignore */}

      const isAdmin = checkIsAdmin(user);
      const userRole = detectRole(user);
      const activeCompany = isAdmin ? (localStorage.getItem("erp.company") || "arsalyn") : "arsalyn";
      localStorage.setItem("erp.company", activeCompany);

      dispatch({ type: "LOGIN_SUCCESS", user, company: activeCompany, companies: companiesList, isAdmin, userRole });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Gagal masuk sistem";
      dispatch({ type: "ERROR", message: msg });
      throw err;
    }
  }, []);

  /* Logout */
  const logout = useCallback(async () => {
    await logoutUser();
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

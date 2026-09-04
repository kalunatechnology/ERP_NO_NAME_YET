/**
 * Purpose: Defines application infrastructure contracts and their integration boundary for the frontend application.
 * Responsibility: Documents and exposes only the behavior implemented in this file; function comments identify inputs, outputs, dependencies, and side effects.
 * AuthContext — Global JWT Auth State & Multitenant Company Scoping
 * Provides: user, company, companies, isAdmin, userRole, isAuthenticated, login, logout, setCompany
 */
"use client";

import React, {
  createContext, useContext, useEffect, useReducer, useCallback, ReactNode,
} from "react";
import {
  changeActiveRole, loginUser, logoutUser, getMyProfile, getCompanies, UserProfile,
} from "@/lib/api/auth.api";

/* ── UUID Regex Helper ───────────────────────── */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ── Cookie Helpers ──────────────────────────── */
function setAuthCookie(token: string) {
  if (typeof document !== "undefined") {
    document.cookie = `access_token=${token}; path=/; max-age=86400; SameSite=Lax`;
  }
}

/**
 * removeAuthCookie coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function removeAuthCookie() {
  if (typeof document !== "undefined") {
    document.cookie = "access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax";
  }
}

/* ── Role Type ───────────────────────────────── */
export type UserRoleType = "super_admin" | "company_admin" | "executive" | "pm" | "om" | "finance" | "crm" | "staff";

/** Converts legacy Prisma enum names and current API role codes to one UI contract. */
function normalizeRoleCode(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase();
  const aliases: Record<string, string> = {
    SUPER_ADMIN: "ROLE-SUPER-ADMIN",
    COMPANY_ADMIN: "ROLE-COMPANY-ADMIN",
    DIRECTOR: "ROLE-DIRECTOR",
    OPERATIONAL_MANAGER: "ROLE-OM",
    PROJECT_MANAGER: "ROLE-PM",
    SUPERVISOR: "ROLE-SUPERVISOR",
    CRM_LEAD: "ROLE-CRM-LEAD",
    SALES: "ROLE-SALES",
    FINANCE: "ROLE-FINANCE",
    STAFF: "ROLE-STAFF",
  };
  return aliases[normalized] || normalized;
}

/**
 * extractRoleCodes coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function extractRoleCodes(user: any): string[] {
  if (!Array.isArray(user?.roles)) return [];
  const rawCodes = user.roles.flatMap((role: any) => {
    if (typeof role === "string") return [normalizeRoleCode(role)];
    if (role && typeof role === "object") {
      return [role.role_code, role.code, role.role]
        .filter(Boolean)
        .map(normalizeRoleCode);
    }
    return [];
  });
  return Array.from(new Set<string>(rawCodes));
}

/**
 * Detects user's primary role from their profile (roles array + email pattern fallback).
 * Priority: executive > om > pm > finance > crm > staff
 */
export function detectRole(user: any): UserRoleType {
  const roles = extractRoleCodes(user);
  if (roles.includes("ROLE-SUPER-ADMIN")) return "super_admin";
  if (roles.includes("ROLE-COMPANY-ADMIN") && !user?.active_role_code) return "company_admin";

  const selected = normalizeRoleCode(user?.active_role_code);
  const orderedRoles = selected && roles.includes(selected)
    ? [selected, ...roles.filter((role) => role !== selected)]
    : roles;
  const role = orderedRoles[0];
  if (role === "ROLE-COMPANY-ADMIN") return "company_admin";
  if (role === "ROLE-DIRECTOR") return "executive";
  if (role === "ROLE-OM") return "om";
  if (role === "ROLE-PM") return "pm";
  if (role === "ROLE-FINANCE") return "finance";
  if (["ROLE-CRM-LEAD", "ROLE-SALES"].includes(role)) return "crm";

  return "staff";
}

/** Human-readable role label for display */
export function getRoleLabel(role: UserRoleType): string {
  switch (role) {
    case "super_admin": return "Super Administrator";
    case "company_admin": return "Company Administrator";
    case "executive": return "Executive / Director";
    case "om":        return "Operational Manager";
    case "pm":        return "Project Manager";
    case "finance":   return "Finance Controller";
    case "crm":       return "CRM & Sales";
    default:          return "Staff";
  }
}

/** Role badge color */
export function getRoleBadgeStyle(role: UserRoleType): { bg: string; text: string } {
  switch (role) {
    case "super_admin": return { bg: "#FDF2F8", text: "#9D174D" };
    case "company_admin": return { bg: "#ECFDF5", text: "#047857" };
    case "executive": return { bg: "#F0FDF4", text: "#15803D" };
    case "om":        return { bg: "#FEF3C7", text: "#92400E" };
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

/**
 * checkIsAdmin coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function checkIsAdmin(user: any): boolean {
  if (!user) return false;
  const roles = extractRoleCodes(user);
  return roles.includes("ROLE-SUPER-ADMIN") || roles.includes("ROLE-COMPANY-ADMIN");
}

/**
 * authReducer coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
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
  refreshProfile: () => Promise<void>;
  setActiveRole: (roleCode: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Provider ───────────────────────────────── */
/**
 * AuthProvider coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
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

  const refreshProfile = useCallback(async () => {
    const user = await getMyProfile();
    const activeCompany = user.company_id || user.roles?.[0]?.company_id || state.company;
    dispatch({
      type: "LOGIN_SUCCESS",
      user,
      company: activeCompany ? String(activeCompany) : null,
      companies: state.companies,
      isAdmin: checkIsAdmin(user),
      userRole: detectRole(user),
    });
  }, [state.companies, state.company]);

  const setActiveRole = useCallback(async (roleCode: string) => {
    const user = await changeActiveRole(roleCode);
    const activeCompany = user.company_id || user.roles?.[0]?.company_id || state.company;
    dispatch({
      type: "LOGIN_SUCCESS",
      user,
      company: activeCompany ? String(activeCompany) : null,
      companies: state.companies,
      isAdmin: checkIsAdmin(user),
      userRole: detectRole(user),
    });
  }, [state.companies, state.company]);

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

        // Langsung ambil dari relasi foreign key user_role yang dikirim backend
        const activeCompany = user.company_id || user?.roles?.[0]?.company_id || null;

        if (activeCompany) {
          localStorage.setItem("erp.company", String(activeCompany));
          localStorage.setItem("active_company_id", String(activeCompany));
        }

        dispatch({ type: "LOGIN_SUCCESS", user, company: activeCompany ? String(activeCompany) : null, companies: companiesList, isAdmin, userRole });
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

  useEffect(() => {
    if (!state.isAuthenticated) return;
/**
 * handleFocus coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
    const handleFocus = () => { void refreshProfile(); };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshProfile, state.isAuthenticated]);

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

      // Langsung ambil dari relasi foreign key user_role yang dikirim backend
      const activeCompany = user.company_id || user?.roles?.[0]?.company_id || null;

      if (activeCompany) {
        localStorage.setItem("erp.company", String(activeCompany));
        localStorage.setItem("active_company_id", String(activeCompany));
      }

      dispatch({ type: "LOGIN_SUCCESS", user, company: activeCompany ? String(activeCompany) : null, companies: companiesList, isAdmin, userRole });
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
        refreshProfile,
        setActiveRole,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

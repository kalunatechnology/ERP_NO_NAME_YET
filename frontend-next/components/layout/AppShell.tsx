/**
 * File: frontend-next/components/layout/AppShell.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useEffect, ReactNode, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { RightPanel } from "@/components/ui/RightPanel";
import { AccessDeniedState } from "@/components/ui/AccessDeniedState";
import { ChatbotDrawer } from "@/components/chatbot/ChatbotDrawer";
import { PanelRightOpen } from "lucide-react";

interface AppShellProps {
  children: ReactNode;
}

// Role permission mapping — include ALL role code variants from detectRole() and backend
const RESTRICTED_ROUTES: Record<string, string[]> = {
  "/crm": ["ROLE-PM", "ROLE-CRM-LEAD", "ROLE-SALES", "ROLE-DIRECTOR"],
  "/finance": ["ROLE-FINANCE", "ROLE-DIRECTOR"],
  "/projects": ["ROLE-PM", "ROLE-OM", "ROLE-DIRECTOR", "ROLE-SUPERVISOR", "ROLE-STAFF"],
  "/tasks": ["ROLE-PM", "ROLE-OM", "ROLE-SUPERVISOR", "ROLE-STAFF"],
  "/reporting": [],
};


/**
 * AppShell implements the local UI interaction represented by its typed signature.
 *
 * @param input - The declared props/event/value arguments; caller identity and company state come only from imported context/API helpers.
 * @returns The rendered React value, synchronous result, or Promise declared by the implementation.
 * Side effects: updates the local React/browser state or invokes callbacks visible below.
 */
export function AppShell({ children }: AppShellProps) {
  const { user, userRole, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Right panel state (desktop only ≥ lg)
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  // Mobile left sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Mobile right panel (notifications/feed) state
  const [mobileRightPanelOpen, setMobileRightPanelOpen] = useState(false);
  // AI Chatbot drawer state
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  /* Restore persisted right-panel collapse state */
  useEffect(() => {
    const stored = localStorage.getItem("erp.rightPanel");
    if (stored === "false") setRightPanelOpen(false);
  }, []);

  /* Close mobile drawers on route change */
  useEffect(() => {
    setMobileSidebarOpen(false);
    setMobileRightPanelOpen(false);
  }, [pathname]);

  /* Prevent body scroll when either mobile menu/drawer is open */
  useEffect(() => {
    document.body.style.overflow = (mobileSidebarOpen || mobileRightPanelOpen) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileSidebarOpen, mobileRightPanelOpen]);

  const toggleRightPanel = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileRightPanelOpen(prev => !prev);
    } else {
      const next = !rightPanelOpen;
      setRightPanelOpen(next);
      localStorage.setItem("erp.rightPanel", String(next));
    }
  }, [rightPanelOpen]);

  const openMobileSidebar   = useCallback(() => setMobileSidebarOpen(true),  []);
  const closeMobileSidebar  = useCallback(() => setMobileSidebarOpen(false), []);
  const openMobileRight     = useCallback(() => setMobileRightPanelOpen(true), []);
  const closeMobileRight    = useCallback(() => setMobileRightPanelOpen(false), []);

  /* ── Access control ──────────────────────────────────── */
  const isSuperUser = userRole === "super_admin";
/**
 * userRolesList implements the local UI interaction represented by its typed signature.
 *
 * @param input - The declared props/event/value arguments; caller identity and company state come only from imported context/API helpers.
 * @returns The rendered React value, synchronous result, or Promise declared by the implementation.
 * Side effects: updates the local React/browser state or invokes callbacks visible below.
 */
  const userRolesList = (user?.roles || []).map((r: any) =>
    (typeof r === "string" ? r : r.role_code || r.role || r.name || r.code || "").toUpperCase()
  );
  const enabledModules = new Set((user?.enabled_modules ?? []).map((module) => module.toUpperCase()));

  const restrictedRoute = Object.entries(RESTRICTED_ROUTES).find(([route]) =>
    pathname.startsWith(route)
  );
  const requiredRoles = restrictedRoute?.[1];
  const moduleCode = restrictedRoute?.[0].slice(1).toUpperCase();

  const hasAccess =
    !requiredRoles ||
    isSuperUser ||
    (Boolean(moduleCode && enabledModules.has(moduleCode)) &&
      (requiredRoles.length === 0 || requiredRoles.some((role) => userRolesList.includes(role))));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) return null;

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-bg-lighter">

      {/* ── Desktop Sidebar (hidden below lg) ── */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar onChatbotOpen={() => setIsChatbotOpen(true)} />
      </div>

      {/* ── Mobile Left Sidebar Overlay (shown below lg) ── */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={closeMobileSidebar}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative z-10 flex animate-in slide-in-from-left-full duration-200 shadow-2xl">
            <Sidebar
              onClose={closeMobileSidebar}
              isMobile
              onChatbotOpen={() => {
                closeMobileSidebar();
                setIsChatbotOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* ── Mobile Right Sidebar / Notifications Drawer (shown below lg) ── */}
      {mobileRightPanelOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={closeMobileRight}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative z-10 flex h-full shadow-2xl animate-in slide-in-from-right-full duration-200">
            <RightPanel isMobile onClose={closeMobileRight} />
          </div>
        </div>
      )}

      {/* ── Main Application Column ── */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Topbar */}
        <Topbar
          onMenuToggle={openMobileSidebar}
          onNotificationClick={toggleRightPanel}
          onAiChatToggle={() => setIsChatbotOpen((prev) => !prev)}
        />

        {/* Workspace + Right Sidebar Row */}
        <div className="flex flex-row flex-1 overflow-hidden">
          {/* Main Scrollable Canvas */}
          <main
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative"
            id="main-content"
            role="main"
          >
            <div className="p-3.5 sm:p-5 lg:p-6 w-full max-w-[1600px] mx-auto animate-in fade-in-50 duration-500">
              {!hasAccess ? (
                <AccessDeniedState
                  title="Akses Dibatasi"
                  description="Akun Anda saat ini tidak memiliki izin yang cukup untuk mengakses modul ini. Silakan hubungi administrator atau beralih ke modul yang sesuai."
                  backHref="/dashboard"
                  backLabel="Kembali ke Dashboard"
                  section={pathname.replace("/", "").toUpperCase()}
                />
              ) : (
                children
              )}
            </div>
          </main>

          {/* ── Right Panel (visible on lg and xl) ── */}
          <div
            className="hidden lg:flex flex-shrink-0 flex-col border-l border-text-tertiary bg-bg-light transition-all duration-200 overflow-hidden relative h-full"
            style={{ width: rightPanelOpen ? "280px" : "36px" }}
          >
            {rightPanelOpen ? (
              <RightPanel onToggleCollapse={toggleRightPanel} />
            ) : (
              <div className="w-full h-full flex flex-col items-center pt-3">
                <button
                  onClick={toggleRightPanel}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-brand-green hover:bg-brand-light-green transition-colors cursor-pointer"
                  title="Buka panel kanan"
                  aria-label="Buka panel kanan"
                >
                  <PanelRightOpen size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Slide-over Adaptive AI Chatbot Drawer ── */}
      <ChatbotDrawer
        isOpen={isChatbotOpen}
        onClose={() => setIsChatbotOpen(false)}
        currentUser={{
          id: user?.id ? String(user.id) : undefined,
          username: (user as any)?.username,
          email: user?.email,
          companyName: (user as any)?.company?.name || "PT Sinergi Muda Arsa",
        }}
      />
    </div>
  );
}

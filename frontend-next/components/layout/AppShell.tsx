"use client";

import { useEffect, ReactNode, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { RightPanel } from "@/components/ui/RightPanel";
import { PanelRightOpen } from "lucide-react";

interface AppShellProps {
  children: ReactNode;
}

// Role permission mapping
const RESTRICTED_ROUTES: Record<string, string[]> = {
  "/crm":       ["ADMIN", "EXECUTIVE", "DIRECTOR", "SUPERADMIN", "CRM_LEAD", "CRM_MANAGER", "PM", "PROJECT_MANAGER", "ROLE_PROJECT_MANAGER", "ROLE-PM"],
  "/finance":   ["ADMIN", "EXECUTIVE", "DIRECTOR", "SUPERADMIN", "FINANCE_LEAD", "FINANCE_MANAGER"],
  "/reporting": ["ADMIN", "EXECUTIVE", "DIRECTOR", "SUPERADMIN", "PM", "FINANCE_LEAD"],
};

export function AppShell({ children }: AppShellProps) {
  const { user, userRole, isAdmin, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Right panel state (desktop only ≥ xl)
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /* Restore persisted right-panel collapse state */
  useEffect(() => {
    const stored = localStorage.getItem("erp.rightPanel");
    if (stored === "false") setRightPanelOpen(false);
  }, []);

  /* Close mobile sidebar on route change */
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  /* Prevent body scroll when mobile menu is open */
  useEffect(() => {
    document.body.style.overflow = mobileSidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileSidebarOpen]);

  const toggleRightPanel = useCallback(() => {
    const next = !rightPanelOpen;
    setRightPanelOpen(next);
    localStorage.setItem("erp.rightPanel", String(next));
  }, [rightPanelOpen]);

  const openMobileSidebar  = useCallback(() => setMobileSidebarOpen(true),  []);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  /* ── Access control ──────────────────────────────────── */
  const isSuperUser = Boolean((user as any)?.is_superuser) || isAdmin || userRole === "executive";
  const userRolesList = (user?.roles || []).map((r: any) =>
    (typeof r === "string" ? r : r.role_code || r.role || r.name || r.code || "").toUpperCase()
  );
  if (userRole) userRolesList.push(userRole.toUpperCase());

  const requiredRoles = Object.entries(RESTRICTED_ROUTES).find(([route]) =>
    pathname.startsWith(route)
  )?.[1];

  const hasAccess =
    !requiredRoles ||
    isSuperUser ||
    requiredRoles.some((role) => userRolesList.includes(role.toUpperCase()));

  useEffect(() => {
    if (!isLoading && isAuthenticated && !hasAccess) router.replace("/error/403");
  }, [isLoading, isAuthenticated, hasAccess, router]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated || !hasAccess) return null;

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-bg-lighter">

      {/* ── Desktop Sidebar (hidden below lg) ── */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* ── Mobile Sidebar Overlay (shown below lg) ── */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeMobileSidebar}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative z-10 flex animate-in slide-in-from-left-4 duration-200">
            <Sidebar onClose={closeMobileSidebar} isMobile />
          </div>
        </div>
      )}

      {/* ── Main Application Column ── */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Topbar */}
        <Topbar
          onMenuToggle={openMobileSidebar}
          onNotificationClick={toggleRightPanel}
        />

        {/* Workspace + Right Sidebar Row */}
        <div className="flex flex-row flex-1 overflow-hidden">
          {/* Main Scrollable Canvas */}
          <main
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative"
            id="main-content"
            role="main"
          >
            <div className="p-3.5 sm:p-5 lg:p-6 w-full max-w-[1600px] mx-auto">
              {children}
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
                  aria-label="Buka panel kanan"
                  title="Buka panel kanan"
                >
                  <PanelRightOpen size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, ReactNode, useState } from "react";
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
  "/crm": ["ADMIN", "EXECUTIVE", "DIRECTOR", "SUPERADMIN", "CRM_LEAD", "CRM_MANAGER"],
  "/finance": ["ADMIN", "EXECUTIVE", "DIRECTOR", "SUPERADMIN", "FINANCE_LEAD", "FINANCE_MANAGER"],
  "/reporting": ["ADMIN", "EXECUTIVE", "DIRECTOR", "SUPERADMIN", "PM", "FINANCE_LEAD"],
};

export function AppShell({ children }: AppShellProps) {
  const { user, userRole, isAdmin, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  /* Persist collapse state across routes */
  useEffect(() => {
    const stored = localStorage.getItem("erp.rightPanel");
    if (stored === "false") setRightPanelOpen(false);
  }, []);

  const toggleRightPanel = () => {
    const next = !rightPanelOpen;
    setRightPanelOpen(next);
    localStorage.setItem("erp.rightPanel", String(next));
  };

  const isSuperUser = Boolean((user as any)?.is_superuser) || isAdmin || userRole === "executive";
  const userRolesList = (user?.roles || []).map((r: any) =>
    (typeof r === "string" ? r : r.role_code || r.role || r.name || r.code || "").toUpperCase()
  );
  if (userRole) userRolesList.push(userRole.toUpperCase());

  // Cek apakah route saat ini dibatasi untuk role tertentu
  const requiredRoles = Object.entries(RESTRICTED_ROUTES).find(([route]) =>
    pathname.startsWith(route)
  )?.[1];

  const hasAccess =
    !requiredRoles ||
    isSuperUser ||
    requiredRoles.some((role) => userRolesList.includes(role.toUpperCase()));

  useEffect(() => {
    if (!isLoading && isAuthenticated && !hasAccess) {
      router.replace("/error/403");
    }
  }, [isLoading, isAuthenticated, hasAccess, router]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Jika auth masih loading atau user tidak punya hak akses, jangan render AppShell/Sidebar
  if (isLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-bg-lighter">
      {/* ── Fixed Left Sidebar ── */}
      <Sidebar />

      {/* ── Main Application Column ── */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Topbar */}
        <Topbar />

        {/* Workspace + Right Sidebar Row */}
        <div className="flex flex-row flex-1 overflow-hidden h-[calc(100vh-64px)]">
          {/* Main Scrollable Canvas */}
          <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative" id="main-content" role="main">
            <div className="p-4 sm:p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
              {children}
            </div>
          </main>

          {/* ── Fixed Right Sidebar / Panel ── */}
          <div
            className="flex-shrink-0 flex flex-col border-l border-text-tertiary bg-bg-light transition-all duration-200 overflow-hidden relative h-full"
            style={{ width: rightPanelOpen ? "260px" : "36px" }}
          >
            {rightPanelOpen ? (
              <RightPanel onToggleCollapse={toggleRightPanel} />
            ) : (
              <div className="w-full h-full flex flex-col items-center pt-3">
                <button
                  onClick={toggleRightPanel}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-brand-green hover:bg-brand-light-green transition-colors"
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

export default AppShell;

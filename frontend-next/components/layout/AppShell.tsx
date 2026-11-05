/**
 * File: frontend-next/components/layout/AppShell.tsx
 *
 * Purpose: Marka Logistik AppShell layout with Dark Slate collapsible sidebar and slate-100 canvas.
 * Integration: Next.js app router shell with authentication and access boundary.
 */
"use client";

import { useEffect, ReactNode, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { RightPanel } from "@/components/ui/RightPanel";
import { AccessDeniedState } from "@/components/ui/AccessDeniedState";
import { ChatbotDrawer } from "@/components/chatbot/ChatbotDrawer";
import { LogIn, PanelRightOpen } from "lucide-react";
import { canAccessRoute, getRouteAccessContract } from "@/lib/access/module-contract";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, company, userRole, isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();

  // Desktop sidebar expand state (persisted to localStorage)
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  // Dock only when there is room for both navigation and the workspace.
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  // Mobile left sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Mobile right panel (notifications/feed) state
  const [mobileRightPanelOpen, setMobileRightPanelOpen] = useState(false);
  // AI Chatbot drawer state
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  /* Restore persisted states on mount */
  useEffect(() => {
    const storedPanel = localStorage.getItem("erp.rightPanel");
    if (storedPanel === "false") setRightPanelOpen(false);

    const storedSidebar = localStorage.getItem("sidebar-expanded");
    if (storedSidebar !== null) {
      const isExp = storedSidebar === "true";
      setSidebarExpanded(isExp);
      if (typeof document !== "undefined") {
        if (isExp) document.body.classList.add("sidebar-expanded");
        else document.body.classList.remove("sidebar-expanded");
      }
    }
  }, []);

  const toggleSidebarExpand = useCallback(() => {
    setSidebarExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-expanded", String(next));
      if (typeof document !== "undefined") {
        if (next) document.body.classList.add("sidebar-expanded");
        else document.body.classList.remove("sidebar-expanded");
      }
      return next;
    });
  }, []);

  /* Close mobile drawers on route change */
  useEffect(() => {
    setMobileSidebarOpen(false);
    setMobileRightPanelOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1536px)");
    const closeDrawer = () => setMobileRightPanelOpen(false);
    media.addEventListener("change", closeDrawer);
    return () => media.removeEventListener("change", closeDrawer);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen && !mobileRightPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
        setMobileRightPanelOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileSidebarOpen, mobileRightPanelOpen]);

  /* Prevent body scroll when either mobile menu/drawer is open */
  useEffect(() => {
    document.body.style.overflow = (mobileSidebarOpen || mobileRightPanelOpen) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileSidebarOpen, mobileRightPanelOpen]);

  const toggleRightPanel = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1536) {
      setMobileRightPanelOpen((prev) => !prev);
    } else {
      const next = !rightPanelOpen;
      setRightPanelOpen(next);
      localStorage.setItem("erp.rightPanel", String(next));
    }
  }, [rightPanelOpen]);

  const openMobileSidebar   = useCallback(() => setMobileSidebarOpen(true),  []);
  const closeMobileSidebar  = useCallback(() => setMobileSidebarOpen(false), []);
  const closeMobileRight    = useCallback(() => setMobileRightPanelOpen(false), []);

  /* ── Access control ─────────────────────────────────────────────────── */
  const routeContract = getRouteAccessContract(pathname);
  const hasAccess = canAccessRoute({
    pathname,
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
    moduleAccess: user?.module_access,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: userRole === "super_admin",
  });

  if (isLoading) return null;

  if (!isAuthenticated) {
    const loginHref = `/login?callbackUrl=${encodeURIComponent(pathname)}`;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 font-inter">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#4F8CF6]">
            <LogIn size={24} />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-800">Sesi Anda telah berakhir</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Silakan masuk kembali untuk melanjutkan ke Marka Logistik ERP.
          </p>
          <a
            href={loginHref}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-[#4F8CF6] hover:bg-[#3F70C5] px-6 text-sm font-semibold text-white transition-colors shadow-xs"
          >
            Masuk kembali
          </a>
        </section>
      </main>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-100 font-inter">
      {/* ── Desktop Sidebar ───────────────────────────────────────────────── */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar
          expanded={sidebarExpanded}
          onToggleExpand={toggleSidebarExpand}
          onChatbotOpen={() => setIsChatbotOpen(true)}
        />
      </div>

      {/* ── Mobile Sidebar Overlay ────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={closeMobileSidebar}
            aria-hidden="true"
          />
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

      {/* ── Mobile Right Drawer ───────────────────────────────────────────── */}
      {mobileRightPanelOpen && (
        <div className="2xl:hidden fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Notifikasi">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={closeMobileRight}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full shadow-2xl animate-in slide-in-from-right-full duration-200">
            <RightPanel isMobile onClose={closeMobileRight} />
          </div>
        </div>
      )}

      {/* ── Main Application Column ───────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100">
        {/* Topbar */}
        <Topbar
          onMenuToggle={openMobileSidebar}
          onNotificationClick={toggleRightPanel}
          onAiChatToggle={() => setIsChatbotOpen((prev) => !prev)}
        />

        {/* Workspace + Right Sidebar Row */}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Main Scrollable Canvas */}
          <main
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative bg-slate-100"
            id="main-content"
            role="main"
          >
            <div className="p-4 sm:p-6 lg:p-8 w-full max-w-[1600px] mx-auto animate-in fade-in-50 duration-300">
              {!hasAccess ? (
                <AccessDeniedState
                  title="Akses Dibatasi"
                  description="Akun Anda saat ini tidak memiliki izin yang cukup untuk mengakses modul ini. Silakan hubungi administrator atau beralih ke modul yang sesuai."
                  backHref="/dashboard"
                  backLabel="Kembali ke Dashboard"
                  section={routeContract?.module ?? "ROUTE"}
                />
              ) : (
                children
              )}
            </div>
          </main>

          {/* Docked notifications on wide desktop screens */}
          <div
            className="hidden 2xl:flex shrink-0 flex-col border-l border-slate-200 bg-white transition-[width] duration-200 overflow-hidden relative h-full"
            style={{ width: rightPanelOpen ? "260px" : "36px" }}
          >
            {rightPanelOpen ? (
              <RightPanel onToggleCollapse={toggleRightPanel} />
            ) : (
              <div className="w-full h-full flex flex-col items-center pt-3">
                <button
                  onClick={toggleRightPanel}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-[#4F8CF6] hover:bg-blue-50 transition-colors cursor-pointer"
                  title="Buka panel notifikasi"
                  aria-label="Buka panel notifikasi"
                >
                  <PanelRightOpen size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Adaptive AI Chatbot Drawer ────────────────────────────────────── */}
      <ChatbotDrawer
        isOpen={isChatbotOpen}
        onClose={() => setIsChatbotOpen(false)}
        currentUser={{
          id: user?.id ? String(user.id) : undefined,
          username: (user as any)?.username,
          email: user?.email,
          companyName: (user as any)?.company?.name || "Company aktif",
          companyId: company || undefined,
        }}
      />
    </div>
  );
}

export default AppShell;

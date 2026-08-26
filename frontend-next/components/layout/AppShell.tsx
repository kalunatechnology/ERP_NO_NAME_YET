"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { PanelRightClose, PanelRightOpen, ShieldAlert, ArrowLeft } from "lucide-react";
import { useAuth, UserRoleType, getRoleLabel } from "@/contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { RightPanel } from "@/components/ui/RightPanel";

/* ── All Known App Routes for 404 passthrough ────── */
const ALL_KNOWN_APP_ROUTES = [
  "/dashboard", "/projects", "/finance", "/crm", "/reporting",
  "/resources", "/tasks", "/settings", "/notifications"
];
const ALLOWED_ROUTES_BY_ROLE: Record<UserRoleType, string[]> = {
  executive: [
    "/dashboard", "/projects", "/finance", "/crm", "/reporting",
    "/resources", "/tasks", "/settings", "/notifications"
  ],
  pm: [
    "/dashboard", "/projects", "/tasks", "/crm", "/reporting", "/notifications"
  ],
  finance: [
    "/dashboard", "/finance", "/projects", "/reporting", "/notifications"
  ],
  crm: [
    "/dashboard", "/crm", "/projects", "/reporting", "/notifications"
  ],
  staff: [
    "/dashboard", "/projects", "/tasks", "/notifications"
  ],
};

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated, isLoading, userRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
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

  /* Redirect to login if not authenticated */
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-lighter">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(180deg, #7CDA24 0%, #3E9B4B 100%)" }}
          >
            <span className="text-white font-bold text-lg">M+</span>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-brand-green animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
          <p className="text-sm text-text-secondary">Memuat sistem…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  /* ── Check Route Access for Current Role ── */
  const isKnownAppRoute = ALL_KNOWN_APP_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const allowedList = ALLOWED_ROUTES_BY_ROLE[userRole] || ["/dashboard", "/projects"];
  const isRouteAllowed =
    !isKnownAppRoute ||
    userRole === "executive" ||
    pathname === "/" ||
    pathname === "/401" ||
    allowedList.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return (
    <div className="flex flex-row" style={{ minHeight: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main content column */}
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ overflow: "hidden" }}
      >
        {/* Topbar */}
        <Topbar />

        {/* Page content row */}
        <div
          className="flex flex-row flex-1 overflow-hidden"
          style={{ height: "calc(100vh - var(--topbar-h, 64px))" }}
        >
          {/* Main scrollable content */}
          <main
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative"
            id="main-content"
            role="main"
          >
            <div className="p-6 w-full">
              {isRouteAllowed ? (
                children
              ) : (
                /* ── 403 / 401 Restricted Access Screen matching Mockup Design ── */
                <div className="relative min-h-[500px] flex items-center justify-center p-4 overflow-hidden rounded-3xl my-4">
                  {/* Soft Background Mesh Glow */}
                  <div
                    className="absolute top-1/4 left-1/4 w-[380px] h-[380px] rounded-full blur-[110px] opacity-40 pointer-events-none"
                    style={{ background: "#9CCD52" }}
                  />
                  <div
                    className="absolute bottom-1/4 right-1/4 w-[340px] h-[340px] rounded-full blur-[100px] opacity-30 pointer-events-none"
                    style={{ background: "#C5E89B" }}
                  />

                  {/* Centered Content */}
                  <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-md mx-auto py-10">
                    {/* Big Green 403 Number */}
                    <h1
                      className="text-7xl sm:text-8xl font-black tracking-tight leading-none mb-2 select-none"
                      style={{ color: "#547E20" }}
                    >
                      403
                    </h1>

                    {/* Heading */}
                    <h2
                      className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2"
                      style={{ color: "#2E4D12" }}
                    >
                      Access Restricted!
                    </h2>

                    {/* Subtitle */}
                    <p className="text-xs sm:text-sm font-normal text-slate-600 mb-2 max-w-sm">
                      Oops! Peran Anda saat ini sebagai <b>{getRoleLabel(userRole)}</b> tidak memiliki izin untuk membuka <code className="px-1.5 py-0.5 rounded bg-emerald-100/60 font-mono text-[#2E4D12] text-xs">{pathname}</code>
                    </p>
                    <p className="text-2xs text-slate-400 mb-6">
                      Silakan login sebagai <b>Admin / Executive</b> untuk membuka modul ini.
                    </p>

                    {/* Pill Button */}
                    <div className="flex items-center gap-3 flex-wrap justify-center">
                      <Link
                        href={userRole === "pm" ? "/projects" : userRole === "finance" ? "/finance" : "/dashboard"}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold text-white shadow-[0_8px_20px_rgba(83,121,31,0.28)] hover:shadow-[0_12px_26px_rgba(83,121,31,0.36)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                        style={{ background: "#53791F" }}
                      >
                        <span>Back to the Workspace</span>
                        <ArrowLeft size={14} className="rotate-180" />
                      </Link>

                      <Link
                        href="/login"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-xs font-semibold text-[#3B5714] bg-white border border-[#DCEEC8] shadow-xs hover:bg-[#F4F9EE] transition-all"
                      >
                        <span>Ganti Akun Admin</span>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* ── Right Panel (persistent across all routes) ── */}
          <div
            className="flex-shrink-0 flex flex-col border-l border-text-tertiary bg-bg-light transition-all duration-300 overflow-hidden relative"
            style={{ width: rightPanelOpen ? "var(--right-panel-w, 260px)" : "36px" }}
          >
            {/* Toggle button */}
            <button
              onClick={toggleRightPanel}
              className="absolute top-3 z-10 p-1.5 rounded-md text-text-secondary hover:text-brand-green hover:bg-brand-light-green transition-colors flex-shrink-0"
              style={{ left: rightPanelOpen ? "auto" : "4px", right: rightPanelOpen ? "8px" : "auto" }}
              aria-label={rightPanelOpen ? "Tutup panel kanan" : "Buka panel kanan"}
              title={rightPanelOpen ? "Tutup panel" : "Buka panel"}
            >
              {rightPanelOpen
                ? <PanelRightClose size={16} />
                : <PanelRightOpen size={16} />
              }
            </button>

            {/* Panel content — only visible when open */}
            {rightPanelOpen && (
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <RightPanel />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { RightPanel } from "@/components/ui/RightPanel";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated, isLoading } = useAuth();
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
              {children}
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

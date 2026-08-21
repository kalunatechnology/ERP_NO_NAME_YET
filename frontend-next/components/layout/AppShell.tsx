"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

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

        {/* Page content */}
        <div
          className="flex flex-row flex-1 overflow-hidden"
          style={{ height: "calc(100vh - var(--topbar-h, 68px))" }}
        >
          <main
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden"
            id="main-content"
            role="main"
          >
            <div className="p-6 w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

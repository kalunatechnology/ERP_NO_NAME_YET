/**
 * File: frontend-next/app/layout.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: {
    template: "%s — Marka+ ERP",
    default: "Marka+ ERP",
  },
  description: "Sistem ERP terintegrasi: Project Management, Finance, CRM — Marka+",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
                fontSize: "14px",
                borderRadius: "12px",
                border: "1px solid #E8E8E8",
              },
              success: {
                iconTheme: { primary: "#294BB2", secondary: "#EAF6FF" },
              },
              error: {
                iconTheme: { primary: "#EF4444", secondary: "#FEE2E2" },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}

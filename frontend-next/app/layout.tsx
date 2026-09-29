/**
 * File: frontend-next/app/layout.tsx
 *
 * Purpose: Root layout with network-independent system typography and a
 * single Marka+ icon source shared by the browser tab and login page.
 */
import type { Metadata } from "next";

import "./globals.css";

import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: {
    template: "%s — Marka+ ERP",
    default: "Marka+ ERP",
  },
  description:
    "Sistem ERP terintegrasi: Project Management, Finance, CRM — Marka+",
  icons: {
    icon: [{ url: "/brand/marka-logomark-blue.svg?v=legacy", type: "image/svg+xml" }],
    shortcut: "/brand/marka-logomark-blue.svg?v=legacy",
    apple: "/brand/marka-logomark-blue.png?v=legacy",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/brand/marka-logomark-blue.svg?v=legacy" type="image/svg+xml" />
        <link rel="shortcut icon" href="/brand/marka-logomark-blue.svg?v=legacy" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/brand/marka-logomark-blue.png?v=legacy" />
      </head>
      <body>
        <LanguageProvider>
          <AuthProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  fontFamily:
                    "var(--font-fira-sans), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
                  fontSize: "14px",
                  borderRadius: "14px",
                  border: "1px solid #E8E8E8",
                },
                success: {
                  iconTheme: {
                    primary: "#294BB2",
                    secondary: "#EAF6FF",
                  },
                },
                error: {
                  iconTheme: {
                    primary: "#EF4444",
                    secondary: "#FEE2E2",
                  },
                },
              }}
            />
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

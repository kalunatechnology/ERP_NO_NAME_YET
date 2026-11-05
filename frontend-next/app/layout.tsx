/**
 * File: frontend-next/app/layout.tsx
 *
 * Purpose: Root layout with official Marka typography (Inter) and Marka brand identity.
 */
import type { Metadata } from "next";

import "./inter.css";
import "./globals.css";

import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: {
    template: "%s · Marka Logistik ERP",
    default: "Marka Logistik ERP",
  },
  description:
    "Sistem ERP Terintegrasi Marka: Logistik, Project Management, Finance, CRM & Operasional",
  icons: {
    icon: [{ url: "/brand/marka-logomark-blue.svg", type: "image/svg+xml" }],
    shortcut: "/brand/marka-logomark-blue.svg",
    apple: "/brand/marka-logomark-blue.png",
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
        <link rel="icon" href="/brand/marka-logomark-blue.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/brand/marka-logomark-blue.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/brand/marka-logomark-blue.png" />
      </head>
      <body className="font-sans antialiased text-slate-800 bg-slate-100">
        <LanguageProvider>
          <AuthProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  fontFamily: "var(--font-inter), 'Inter', sans-serif",
                  fontSize: "14px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.08)",
                },
                success: {
                  iconTheme: {
                    primary: "#4F8CF6",
                    secondary: "#EBF3FE",
                  },
                },
                error: {
                  iconTheme: {
                    primary: "#F43F5E",
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

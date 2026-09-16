/**
 * File: frontend-next/app/layout.tsx
 *
 * Purpose: Root layout with global Fira Sans typography and a single Marka+
 * icon source shared by the browser tab and login page.
 */
import type { Metadata } from "next";
import { Fira_Sans, Fira_Sans_Condensed } from "next/font/google";

import "./globals.css";

import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Toaster } from "react-hot-toast";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-fira-sans",
  display: "swap",
  preload: true,
});

const firaSansCondensed = Fira_Sans_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-fira-sans-condensed",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    template: "%s — Marka+ ERP",
    default: "Marka+ ERP",
  },
  description:
    "Sistem ERP terintegrasi: Project Management, Finance, CRM — Marka+",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${firaSans.variable} ${firaSansCondensed.variable}`}
    >
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.svg" />
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

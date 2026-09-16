/**
 * File: frontend-next/app/layout.tsx
 *
 * Purpose: Defines the Next App Router root layout and global typography
 * responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing; shared providers and global UI are
 * mounted here.
 * Boundary: This file owns application-wide presentation setup only and
 * relies on shared context modules for identity, language, and persistence.
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
  icons: { icon: "/favicon.ico" },
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
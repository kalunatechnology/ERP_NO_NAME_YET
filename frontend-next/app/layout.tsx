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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                fontFamily: "'Google Sans', Roboto, sans-serif",
                fontSize: "14px",
                borderRadius: "12px",
                border: "1px solid #E8E8E8",
              },
              success: {
                iconTheme: { primary: "#5A861F", secondary: "#F0FEE0" },
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

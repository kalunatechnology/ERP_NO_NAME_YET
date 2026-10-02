import type { ReactNode } from "react";

/**
 * Login-only layout guard.
 *
 * Keeps the desktop login screen fully contained inside the viewport at native
 * 100% browser zoom without transform/scale tricks. The card layout itself is
 * constrained to the available viewport height so the browser does not create
 * an unnecessary vertical scrollbar.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        @media (min-width: 1024px) {
          html:has(.mk-card),
          body:has(.mk-card) {
            height: 100%;
            overflow-y: hidden;
          }

          .mk-card {
            min-height: 0 !important;
            height: min(820px, calc(100dvh - 4rem)) !important;
            max-height: calc(100dvh - 4rem) !important;
          }
        }
      `}</style>
      {children}
    </>
  );
}

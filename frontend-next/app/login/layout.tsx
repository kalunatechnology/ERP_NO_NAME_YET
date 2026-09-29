import type { ReactNode } from "react";

/**
 * Login-only layout guard.
 *
 * Keeps the desktop login screen fully contained inside the viewport at 100%
 * browser zoom. The visual 90% density is handled by the existing `.mk-card`
 * scale rule; these constraints make the layout box itself fit the viewport so
 * the browser does not create a vertical scrollbar for the unscaled box.
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

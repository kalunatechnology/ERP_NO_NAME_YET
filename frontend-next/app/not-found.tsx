/**
 * File: frontend-next/app/not-found.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="relative min-h-screen w-full flex items-center justify-center bg-cover bg-center bg-no-repeat px-4 overflow-hidden select-none"
      style={{ backgroundImage: `url('/Background_not_found.svg')` }}
    >
      <div className="z-10 flex flex-col items-center text-center max-w-md mx-auto">
        <h1 className="text-7xl sm:text-8xl font-black text-[#294BB2] tracking-tight leading-none">
          404
        </h1>

        <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-[#2649B3]">
          Page Not Found!
        </h2>

        <p className="mt-2 text-sm sm:text-base text-neutral-600 font-normal">
          Oops! Halaman yang Anda tuju tidak ditemukan atau telah dipindahkan.
        </p>

        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#294BB2] hover:bg-[#2649B3] text-white text-sm font-medium transition-colors shadow-sm active:scale-95"
        >
          Kembali ke Dashboard →
        </Link>
      </div>
    </main>
  );
}

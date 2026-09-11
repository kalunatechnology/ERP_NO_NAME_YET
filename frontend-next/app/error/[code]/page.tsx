/**
 * File: frontend-next/app/error/[code]/page.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

interface ErrorConfig {
  title: string;
  description: string;
  buttonText: string;
  buttonHref: string;
}

const ERROR_CONFIGS: Record<string, ErrorConfig> = {
  "401": {
    title: "Sesi Berakhir",
    description: "Sesi Anda telah berakhir. Silakan masuk kembali untuk melanjutkan.",
    buttonText: "Masuk Kembali →",
    buttonHref: "/login",
  },
  "403": {
    title: "Akses Ditolak",
    description: "Akun Anda tidak memiliki izin untuk membuka halaman ini pada role yang sedang aktif.",
    buttonText: "Kembali ke Dashboard →",
    buttonHref: "/dashboard",
  },
  "404": {
    title: "Halaman Tidak Ditemukan",
    description: "Halaman yang Anda cari tidak tersedia atau alamatnya sudah berubah.",
    buttonText: "Kembali ke Dashboard →",
    buttonHref: "/dashboard",
  },
  "429": {
    title: "Terlalu Banyak Permintaan",
    description: "Permintaan Anda terlalu cepat atau terlalu banyak. Tunggu sebentar, lalu coba kembali.",
    buttonText: "Kembali ke Dashboard →",
    buttonHref: "/dashboard",
  },
  "500": {
    title: "Terjadi Kesalahan Server",
    description: "Server mengalami kendala saat memproses permintaan. Silakan coba kembali.",
    buttonText: "Kembali ke Dashboard →",
    buttonHref: "/dashboard",
  },
  "503": {
    title: "Layanan Sedang Tidak Tersedia",
    description: "Sistem sedang diperbarui atau sementara tidak tersedia. Silakan coba beberapa saat lagi.",
    buttonText: "Kembali ke Dashboard →",
    buttonHref: "/dashboard",
  },
};

const DEFAULT_CONFIG: ErrorConfig = {
  title: "Terjadi Kendala",
  description: "Terjadi kendala pada sistem. Silakan coba kembali.",
  buttonText: "Kembali ke Dashboard →",
  buttonHref: "/dashboard",
};

/**
 * DynamicErrorPage coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function DynamicErrorPage({
  params,
}: {
  params?: { code?: string };
}) {
  const routeParams = useParams();
  const code = (routeParams?.code as string) || params?.code || "404";
  const config = ERROR_CONFIGS[code] || DEFAULT_CONFIG;

  return (
    <main
      className="relative min-h-screen w-full flex items-center justify-center bg-cover bg-center bg-no-repeat px-4 overflow-hidden select-none"
      style={{ backgroundImage: `url('/Background_not_found.svg')` }}
    >
      <div className="z-10 flex flex-col items-center text-center max-w-md mx-auto">
        <h1 className="text-7xl sm:text-8xl font-black text-[#2649B3] tracking-tight leading-none">
          {code}
        </h1>

        <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-[#294BB2]">
          {config.title}
        </h2>

        <p className="mt-2 text-sm sm:text-base text-neutral-600 font-normal">
          {config.description}
        </p>

        <Link
          href={config.buttonHref}
          className="mt-6 inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#2649B3] hover:bg-[#294BB2] text-white text-sm font-medium transition-colors shadow-sm active:scale-95"
        >
          {config.buttonText}
        </Link>
      </div>
    </main>
  );
}

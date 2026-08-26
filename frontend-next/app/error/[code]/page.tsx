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
    title: "Session Ended!",
    description: "Oops! We think you need to re-login",
    buttonText: "Back to the Homepage →",
    buttonHref: "/login",
  },
  "403": {
    title: "Access Restricted!",
    description: "Oops! Anda tidak memiliki izin untuk membuka modul ini.",
    buttonText: "Back to the Workspace →",
    buttonHref: "/dashboard",
  },
  "404": {
    title: "Page Not Found!",
    description: "Oops! The page you are looking for does not exist",
    buttonText: "Back to the Homepage →",
    buttonHref: "/dashboard",
  },
  "500": {
    title: "Internal Server Error!",
    description: "Oops! Terjadi kesalahan pada server kami.",
    buttonText: "Back to the Workspace →",
    buttonHref: "/dashboard",
  },
};

const DEFAULT_CONFIG: ErrorConfig = {
  title: "Something Went Wrong!",
  description: "Terjadi kendala pada sistem. Silakan coba kembali.",
  buttonText: "Back to the Workspace →",
  buttonHref: "/dashboard",
};

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
        <h1 className="text-7xl sm:text-8xl font-black text-[#52872A] tracking-tight leading-none">
          {code}
        </h1>

        <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-[#3B611D]">
          {config.title}
        </h2>

        <p className="mt-2 text-sm sm:text-base text-neutral-600 font-normal">
          {config.description}
        </p>

        <Link
          href={config.buttonHref}
          className="mt-6 inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#52872A] hover:bg-[#437021] text-white text-sm font-medium transition-colors shadow-sm active:scale-95"
        >
          {config.buttonText}
        </Link>
      </div>
    </main>
  );
}

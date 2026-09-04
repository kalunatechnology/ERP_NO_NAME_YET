/**
 * AccessDeniedState — Inline 403 Forbidden UI Component
 * Renders an elegant, in-page access denied state instead of
 * redirecting the user away from the current page/module.
 */
"use client";
import { ShieldOff, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface AccessDeniedStateProps {
  title?: string;
  description?: string;
  backHref?: string | null;
  backLabel?: string;
  section?: string;
  compact?: boolean;
}

/**
 * AccessDeniedState coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function AccessDeniedState({
  title = "Akses Terbatas",
  description = "Anda tidak memiliki izin untuk mengakses bagian ini. Hubungi administrator sistem untuk mendapatkan hak akses yang diperlukan.",
  backHref = "/dashboard",
  backLabel = "Kembali ke Dashboard",
  section,
  compact = false,
}: AccessDeniedStateProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mb-4">
          <ShieldOff size={24} className="text-[#DC2626]" />
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-xs font-bold text-[#DC2626] mb-3">
          403 — Forbidden
        </span>
        <h3 className="text-base font-bold text-[#0E341F] mb-1.5">{title}</h3>
        {section && (
          <p className="text-xs font-medium text-[#5A861F] mb-2">
            Modul: <span className="font-bold">{section}</span>
          </p>
        )}
        <p className="text-sm text-neutral-500 max-w-sm leading-relaxed mb-5">
          {description}
        </p>
        <div className="flex items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#BBDFA0] bg-[#F0FEE0] text-[#275433] text-xs font-semibold hover:bg-[#E0F7C8] transition-colors"
            >
              <ArrowLeft size={13} />
              {backLabel}
            </Link>
          )}
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#52872A] text-white text-xs font-semibold hover:bg-[#437021] transition-colors"
          >
            Halaman Sebelumnya
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#FEF2F2] to-[#FEE2E2] border border-[#FECACA] flex items-center justify-center shadow-sm">
          <ShieldOff size={40} className="text-[#DC2626]" />
        </div>
        <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#DC2626] text-white text-xs font-black flex items-center justify-center shadow">
          403
        </span>
      </div>
      <h2 className="text-2xl font-black text-[#0E341F] mb-2">{title}</h2>
      {section && (
        <p className="text-sm font-medium text-[#5A861F] mb-2">
          Modul: <span className="font-bold">{section}</span>
        </p>
      )}
      <p className="text-sm text-neutral-500 max-w-md leading-relaxed mb-8">
        {description}
      </p>
      <div className="w-full max-w-sm bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-4 mb-6 text-left">
        <p className="text-xs font-bold text-[#92400E] mb-1.5">
          💡 Apa yang bisa Anda lakukan?
        </p>
        <ul className="text-xs text-[#78350F] space-y-1 list-disc list-inside leading-relaxed">
          <li>Hubungi administrator sistem untuk meminta akses</li>
          <li>Pastikan akun Anda memiliki role yang sesuai</li>
          <li>Kembali ke halaman sebelumnya dan pilih modul lain</li>
        </ul>
      </div>
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#BBDFA0] bg-[#F0FEE0] text-[#275433] text-sm font-semibold hover:bg-[#E0F7C8] transition-colors"
        >
          <ArrowLeft size={15} />
          Halaman Sebelumnya
        </button>
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#52872A] text-white text-sm font-semibold hover:bg-[#437021] transition-colors shadow-sm"
          >
            {backLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * isForbiddenError coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function isForbiddenError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  return (
    e?.response?.status === 403 ||
    e?.status === 403 ||
    String(e?.message || "").includes("403")
  );
}

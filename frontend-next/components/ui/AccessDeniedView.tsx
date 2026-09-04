/**
 * File: frontend-next/components/ui/AccessDeniedView.tsx
 *
 * Purpose: Implements React UI component responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
"use client";

import Link from "next/link";
import { ShieldX, ArrowLeft, Home, Lock } from "lucide-react";

interface AccessDeniedViewProps {
  title?: string;
  description?: string;
  requiredRoles?: string[];
  userRole?: string;
  backHref?: string;
}

/**
 * AccessDeniedView coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function AccessDeniedView({
  title = "Akses Ditolak",
  description = "Anda tidak memiliki izin untuk mengakses modul ini. Hubungi administrator sistem untuk mendapatkan akses.",
  requiredRoles,
  userRole,
  backHref = "/dashboard",
}: AccessDeniedViewProps) {
  return (
    <div className="flex flex-1 items-center justify-center min-h-[70vh] px-6">
      <div className="flex flex-col items-center text-center max-w-md w-full">

        {/* Icon */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-3xl bg-red-50 border border-red-100 flex items-center justify-center shadow-sm">
            <ShieldX size={44} className="text-red-400" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-md">
            <Lock size={14} className="text-white" />
          </div>
        </div>

        {/* Code badge */}
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-bold tracking-widest mb-4 border border-red-200">
          ERROR 403 &middot; FORBIDDEN
        </span>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight leading-tight mb-3">
          {title}
        </h1>

        {/* Description */}
        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          {description}
        </p>

        {/* Role info hint */}
        {(requiredRoles?.length || userRole) && (
          <div className="w-full bg-bg-lighter border border-text-tertiary/30 rounded-xl p-4 mb-6 text-left">
            {userRole && (
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-text-secondary">Role Anda saat ini</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold border border-amber-200 uppercase tracking-wide">
                  {userRole}
                </span>
              </div>
            )}
            {requiredRoles && requiredRoles.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary mb-1">Role yang dibutuhkan</span>
                <div className="flex flex-wrap gap-1.5">
                  {requiredRoles.map((r) => (
                    <span
                      key={r}
                      className="px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green text-xs font-semibold border border-brand-green/20 uppercase"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link
            href={backHref}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#52872A] hover:bg-[#437021] active:scale-95 text-white text-sm font-semibold transition-all shadow-sm"
          >
            <Home size={15} />
            Kembali ke Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-text-tertiary/40 hover:bg-bg-lighter active:scale-95 text-text-secondary text-sm font-medium transition-all"
          >
            <ArrowLeft size={15} />
            Halaman Sebelumnya
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccessDeniedView;

/**
 * File: frontend-next/components/ui/CompletionRateCard.tsx
 *
 * Purpose: Implements React UI component responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RateItem {
  id: string | number;
  industry: string;
  percentage: number;
}

/**
 * CompletionRateCard coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function CompletionRateCard({
  rates = [],
  className,
}: {
  rates?: RateItem[];
  className?: string;
}) {
  const displayRates = rates || [];

  return (
    <div
      className={cn(
        "w-full bg-white border border-[#E5E9E2] rounded-[20px] p-5 shadow-xs flex flex-col justify-between h-full select-none transition-all hover:shadow-card-md",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#EEF2E8]">
        <div>
          <h3 className="text-sm font-extrabold text-[#0E341F] whitespace-nowrap">Completion Rate</h3>
          <p className="text-2xs text-[#637566] font-medium mt-0.5">by Project Cluster</p>
        </div>
        <div className="w-8 h-8 rounded-xl bg-[#F0FEE0] text-[#275433] border border-[#D5ECC2] flex items-center justify-center flex-shrink-0 shadow-2xs">
          <CheckCircle2 size={16} strokeWidth={2.2} />
        </div>
      </div>

      {/* Progress Items */}
      <div
        className={cn(
          "py-3.5 my-auto",
          displayRates.length === 0
            ? "flex flex-col"
            : displayRates.length >= 3
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            : displayRates.length === 2
            ? "grid grid-cols-1 md:grid-cols-2 gap-4"
            : "flex flex-col gap-3.5"
        )}
      >
        {displayRates.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#768779]">
            Belum ada data progres klaster (Proyek baru diinisiasi)
          </div>
        ) : (
          displayRates.map((item) => {
            const val = Math.min(100, Math.max(0, item.percentage || 0));
            return (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-2.5 w-full bg-[#F8FBF5] p-3.5 rounded-2xl border border-[#E5E9E2] transition-all hover:bg-[#F0FEE0]/40"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className="font-bold text-[#0E341F] text-xs leading-snug line-clamp-1"
                    title={item.industry}
                  >
                    {item.industry}
                  </span>
                  <span className="font-extrabold text-[#275433] bg-[#EAF8D6] border border-[#D5ECC2] px-2.5 py-0.5 rounded-full text-2xs tabular-nums flex-shrink-0">
                    {Math.round(val)}%
                  </span>
                </div>

                {/* Progress Bar Track */}
                <div className="w-full h-2.5 bg-[#E5E9E2] rounded-full overflow-hidden p-0.5 shadow-2xs">
                  <div
                    className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-[#275433] to-[#5A861F]"
                    style={{ width: `${val}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footnote */}
      <p className="text-3xs text-[#768779] font-normal leading-tight pt-3 border-t border-[#EEF2E8]">
        *Rasio penyelesaian proyek dihitung berdasarkan realisasi progres per klaster portofolio
      </p>
    </div>
  );
}

export default CompletionRateCard;

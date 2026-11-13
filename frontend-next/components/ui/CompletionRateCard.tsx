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
        "w-full bg-white border border-[#D9E2EE] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col h-full select-none transition-all hover:shadow-card-md",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#EFEFEF]">
        <div>
          <h3 className="text-sm font-extrabold text-[#090909]">Tingkat Penyelesaian Proyek</h3>
          <p className="text-2xs text-[#4F5050] font-medium mt-0.5">Progres aktual tiap proyek</p>
        </div>
        <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE] flex items-center justify-center flex-shrink-0 shadow-2xs">
          <CheckCircle2 size={16} strokeWidth={2.2} />
        </div>
      </div>

      {/* Progress Items */}
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {displayRates.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#4F5050]">
            Belum ada data progres klaster (Proyek baru diinisiasi)
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-[#E2E8F0] text-[10px] uppercase tracking-wide text-[#64748B]">
                <th className="w-[48%] px-2 py-2 font-bold">Proyek</th>
                <th className="px-2 py-2 font-bold">Tingkat Penyelesaian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F7]">
              {displayRates.map((item) => {
                const val = Math.min(100, Math.max(0, item.percentage || 0));
                return (
                  <tr key={item.id} className="group hover:bg-[#F8FBFF]">
                    <td className="px-2 py-3 align-middle">
                      <span className="block truncate text-xs font-semibold text-[#090909]" title={item.industry}>{item.industry}</span>
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <div className="flex items-center gap-2">
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#EFF6FF]">
                          <div className="h-full rounded-full bg-[#1E3A8A] transition-all duration-700" style={{ width: `${val}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs font-extrabold tabular-nums text-[#1E3A8A]">{Math.round(val)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footnote */}
      <p className="text-3xs text-[#4F5050] font-normal leading-tight pt-3 border-t border-[#EFEFEF]">
        *Progres dihitung berdasarkan realisasi terbaru tiap proyek.
      </p>
    </div>
  );
}

export default CompletionRateCard;

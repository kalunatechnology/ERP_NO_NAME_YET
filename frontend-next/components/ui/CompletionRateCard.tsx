"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RateItem {
  id: string | number;
  industry: string;
  percentage: number;
}

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
        "w-full bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between h-full select-none transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-[#0E341F] whitespace-nowrap">Completion Rate</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">by Project Cluster</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shadow-2xs flex-shrink-0">
          <CheckCircle2 size={15} />
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
          <div className="py-6 text-center text-xs text-slate-400">
            Belum ada data progres klaster (Proyek baru diinisiasi)
          </div>
        ) : (
          displayRates.map((item) => {
            const val = Math.min(100, Math.max(0, item.percentage || 0));
            return (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-2 w-full bg-slate-50/70 p-3 rounded-xl border border-slate-200/60 transition-all hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className="font-semibold text-slate-800 text-xs sm:text-[13px] leading-snug line-clamp-1"
                    title={item.industry}
                  >
                    {item.industry}
                  </span>
                  <span className="font-bold text-slate-800 bg-white border border-slate-200/80 px-2 py-0.5 rounded-md text-[11px] tabular-nums flex-shrink-0 shadow-2xs">
                    {Math.round(val)}%
                  </span>
                </div>

                {/* Progress Bar Track */}
                <div className="w-full h-2.5 bg-slate-200/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-emerald-600 to-teal-500 shadow-2xs"
                    style={{ width: `${val}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footnote */}
      <p className="text-[11px] text-slate-400 font-normal leading-tight pt-3 border-t border-slate-100">
        *Rasio penyelesaian proyek dihitung berdasarkan realisasi progres per klaster portofolio
      </p>
    </div>
  );
}

export default CompletionRateCard;

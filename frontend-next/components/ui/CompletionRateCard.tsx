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
      <div className="flex flex-col gap-3.5 py-3 my-auto">
        {displayRates.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Belum ada data progres klaster (Proyek baru diinisiasi)
          </div>
        ) : (
          displayRates.map((item) => {
            const val = Math.min(100, Math.max(0, item.percentage || 0));
            return (
              <div key={item.id} className="flex flex-col gap-1.5 w-full">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 truncate pr-2" title={item.industry}>
                    {item.industry}
                  </span>
                  <span className="font-bold text-slate-800 bg-slate-100/70 border border-slate-200/60 px-2 py-0.5 rounded-md text-[11px] tabular-nums flex-shrink-0">
                    {Math.round(val)}%
                  </span>
                </div>

                {/* Progress Bar Track */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
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

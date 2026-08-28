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
        "w-full bg-white border border-text-tertiary rounded-2xl p-5 shadow-xs flex flex-col justify-between h-full select-none transition-shadow hover:shadow-sm",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-text-tertiary/60">
        <div>
          <h3 className="text-sm font-bold text-text-primary whitespace-nowrap">Completion Rate</h3>
          <p className="text-2xs text-text-secondary font-medium mt-0.5">by Project Cluster</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center flex-shrink-0">
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
          <div className="py-6 text-center text-xs text-text-secondary">
            Belum ada data progres klaster (Proyek baru diinisiasi)
          </div>
        ) : (
          displayRates.map((item) => {
            const val = Math.min(100, Math.max(0, item.percentage || 0));
            return (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-2 w-full bg-bg-light p-3 rounded-xl border border-text-tertiary/60 transition-all hover:bg-bg-lighter"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className="font-semibold text-text-primary text-xs leading-snug line-clamp-1"
                    title={item.industry}
                  >
                    {item.industry}
                  </span>
                  <span className="font-bold text-text-primary bg-white border border-text-tertiary px-2 py-0.5 rounded-md text-2xs tabular-nums flex-shrink-0">
                    {Math.round(val)}%
                  </span>
                </div>

                {/* Progress Bar Track */}
                <div className="w-full h-2 bg-text-tertiary/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-brand-deep-green to-brand-green"
                    style={{ width: `${val}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footnote */}
      <p className="text-3xs text-text-secondary font-normal leading-tight pt-3 border-t border-text-tertiary/60">
        *Rasio penyelesaian proyek dihitung berdasarkan realisasi progres per klaster portofolio
      </p>
    </div>
  );
}

export default CompletionRateCard;

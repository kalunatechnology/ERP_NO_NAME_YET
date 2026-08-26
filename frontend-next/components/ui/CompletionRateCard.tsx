"use client";

import React from "react";
import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RateItem {
  id: string | number;
  industry: string;
  percentage: number;
}

const DEFAULT_RATES: RateItem[] = [
  { id: 1, industry: "Manufacturing", percentage: 89 },
  { id: 2, industry: "Plumbing Service", percentage: 76 },
  { id: 3, industry: "Engineering Processing", percentage: 57 },
];

export function CompletionRateCard({
  rates = DEFAULT_RATES,
  className,
}: {
  rates?: RateItem[];
  className?: string;
}) {
  const displayRates = rates.length > 0 ? rates : DEFAULT_RATES;

  return (
    <div className={cn("w-full bg-white border border-[#C7C7C7] rounded-[24px] p-6 shadow-xs flex flex-col justify-between h-full min-h-[310px] select-none", className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div className="flex items-baseline gap-2">
          <h3 className="text-lg font-bold text-[#0E341F]">Completion Rate</h3>
          <span className="text-xs text-[#637566] font-medium">by Industry</span>
        </div>
        <div className="w-6 h-6 rounded-full bg-[#5A861F] text-white flex items-center justify-center shadow-2xs">
          <CheckCircle size={14} />
        </div>
      </div>

      {/* Progress Items (Label & % on top row, 100% Full-Width Bar on bottom row) */}
      <div className="flex flex-col gap-3.5 my-auto py-2">
        {displayRates.map((item) => (
          <div key={item.id} className="flex flex-col gap-1.5 w-full">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#0E341F] truncate pr-2">
                {item.industry}
              </span>
              <span className="font-bold text-[#0E341F] flex-shrink-0">
                {Math.round(item.percentage)}%
              </span>
            </div>

            {/* 100% Full-Width Track */}
            <div className="w-full h-2.5 bg-[#F2F5EE] rounded-full overflow-hidden p-0.5 border border-gray-100 shadow-2xs">
              <div
                className="h-full bg-[#275433] rounded-full transition-all duration-500 shadow-2xs"
                style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Footnote */}
      <p className="text-[11px] text-[#637566] leading-snug border-t border-gray-100 pt-3">
        *Rasio penyelesaian proyek dihitung berdasarkan WBS progress per klaster industri
      </p>
    </div>
  );
}

export default CompletionRateCard;

"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface ProjectStatusCount {
  label: string;
  count: number;
  color: string;
}

const DEFAULT_DATA: ProjectStatusCount[] = [
  { label: "Completed", count: 70, color: "#3B82F6" },
  { label: "In Progress", count: 32, color: "#38BDF8" },
  { label: "Not Started", count: 180, color: "#063248" },
  { label: "Delayed", count: 18, color: "#EF4444" },
];

export function ProjectDonutSummaryCard({
  data,
  className,
}: {
  data?: ProjectStatusCount[];
  className?: string;
}) {
  const chartData = data && data.length > 0 ? data : DEFAULT_DATA;
  const total = chartData.reduce((acc, curr) => acc + curr.count, 0) || 1;

  let accumulatedPercent = 0;

  return (
    <div className={cn("w-full bg-white border border-[#C7C7C7] rounded-[24px] p-6 shadow-xs flex flex-col justify-between h-full min-h-[310px] select-none", className)}>
      <div className="pb-3 border-b border-gray-100">
        <h3 className="text-lg font-bold text-[#0E341F]">Number of Projects</h3>
        <p className="text-xs text-[#637566] mt-0.5 font-medium">Overall Portfolio Distribution</p>
      </div>

      <div className="grid grid-cols-[100px_1fr] sm:grid-cols-[110px_1fr] items-center gap-4 my-auto py-2">
        {/* SVG Donut */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mx-auto flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="14" fill="transparent" stroke="#E5E7EB" strokeWidth="5.5" />
            {chartData.map((item, idx) => {
              const strokeLength = (item.count / total) * 88;
              const offset = accumulatedPercent * 88;
              accumulatedPercent += item.count / total;

              return (
                <circle
                  key={idx}
                  cx="18"
                  cy="18"
                  r="14"
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="5.5"
                  strokeDasharray={`${strokeLength} 88`}
                  strokeDashoffset={`-${offset}`}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base sm:text-lg font-black text-[#0E341F] leading-none">{total}</span>
            <span className="text-[10px] text-[#637566] uppercase font-bold mt-0.5">Total</span>
          </div>
        </div>

        {/* Legend List with UNTRUNCATED full names */}
        <div className="flex flex-col gap-2.5">
          {chartData.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[#4A5D4E] font-medium whitespace-nowrap">{item.label}</span>
              </div>
              <span className="font-bold text-[#0E341F] flex-shrink-0 ml-auto pl-2">{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-[#637566] leading-snug border-t border-gray-100 pt-3">
        *Data proyek bersumber dari seluruh portofolio aktif pada database ERP
      </p>
    </div>
  );
}

export default ProjectDonutSummaryCard;

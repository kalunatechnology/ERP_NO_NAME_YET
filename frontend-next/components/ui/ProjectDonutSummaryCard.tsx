"use client";

import React from "react";
import { PieChart } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProjectStatusCount {
  label: string;
  count: number;
  color: string;
}

const DEFAULT_DATA: ProjectStatusCount[] = [
  { label: "Completed", count: 70, color: "#10B981" },
  { label: "In Progress", count: 32, color: "#0EA5E9" },
  { label: "Not Started", count: 180, color: "#64748B" },
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
    <div
      className={cn(
        "w-full bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between h-full select-none transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-[#0E341F]">Number of Projects</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">Overall Portfolio Distribution</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-slate-50 text-slate-600 border border-slate-200/60 flex items-center justify-center shadow-2xs flex-shrink-0">
          <PieChart size={15} />
        </div>
      </div>

      {/* Main Chart + Legend */}
      <div className="flex flex-col xs:flex-row sm:flex-row items-center justify-between gap-4 py-3 my-auto">
        {/* SVG Donut */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mx-auto xs:mx-0 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            {/* Background Circle */}
            <circle cx="18" cy="18" r="14" fill="transparent" stroke="#F1F5F9" strokeWidth="4.5" />
            {/* Segments */}
            {chartData.map((item, idx) => {
              const strokeLength = (item.count / total) * 88;
              const offset = accumulatedPercent * 88;
              accumulatedPercent += item.count / total;

              if (item.count <= 0) return null;

              return (
                <circle
                  key={idx}
                  cx="18"
                  cy="18"
                  r="14"
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="4.5"
                  strokeDasharray={`${strokeLength} 88`}
                  strokeDashoffset={`-${offset}`}
                  className="transition-all duration-700"
                />
              );
            })}
          </svg>

          {/* Centered Total */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-black text-slate-800 leading-none tracking-tight">{total}</span>
            <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">Total</span>
          </div>
        </div>

        {/* Legend List */}
        <div className="flex flex-col gap-1.5 w-full xs:w-auto flex-1 pl-0 xs:pl-2">
          {chartData.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-2xs"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-700 font-medium truncate text-xs">{item.label}</span>
              </div>
              <span className="font-bold text-slate-800 bg-slate-100/70 border border-slate-200/60 px-2 py-0.5 rounded-md text-[11px] tabular-nums flex-shrink-0">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footnote */}
      <p className="text-[11px] text-slate-400 font-normal leading-tight pt-3 border-t border-slate-100">
        *Data proyek bersumber dari seluruh portofolio aktif pada database ERP
      </p>
    </div>
  );
}

export default ProjectDonutSummaryCard;

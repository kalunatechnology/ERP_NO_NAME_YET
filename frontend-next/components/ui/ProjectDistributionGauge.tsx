"use client";

import React from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface DistributionProps {
  scorePercent?: number;
  statusLabel?: string;
  onTrackCount?: number;
  cautiousCount?: number;
  offTrackCount?: number;
  className?: string;
}

export function ProjectDistributionGauge({
  scorePercent = 78,
  statusLabel = "On Track",
  onTrackCount = 12,
  cautiousCount = 3,
  offTrackCount = 1,
  className,
}: DistributionProps) {
  const radius = 65;
  const circumference = Math.PI * radius;
  const validScore = Math.min(100, Math.max(0, scorePercent));
  const strokeDashoffset = circumference - (validScore / 100) * circumference;

  // Dynamic status styling
  const isGood = validScore >= 70 || statusLabel.toLowerCase().includes("track") && !statusLabel.toLowerCase().includes("off");
  const isCautious = (validScore >= 40 && validScore < 70) || statusLabel.toLowerCase().includes("cautious");
  const isCritical = validScore < 40 || statusLabel.toLowerCase().includes("off");

  const badgeStyle = isGood
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isCautious
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-rose-50 text-rose-700 border-rose-200";

  return (
    <div
      className={cn(
        "w-full bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between h-full select-none transition-shadow hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-sm sm:text-base font-bold text-[#0E341F]">Project Distribution</h3>
        </div>
        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100/80 px-2.5 py-0.5 rounded-full flex-shrink-0">
          Portfolio Health
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col xs:flex-row sm:flex-row items-center justify-between gap-4 py-4 my-auto">
        {/* Semi-Donut Gauge */}
        <div className="flex flex-col items-center justify-center relative flex-shrink-0 w-36">
          <svg width="144" height="84" viewBox="0 0 150 90" className="overflow-visible">
            {/* Background Track */}
            <path
              d="M 12 80 A 63 63 0 0 1 138 80"
              fill="none"
              stroke="#F1F5F9"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Progress Arc */}
            <path
              d="M 12 80 A 63 63 0 0 1 138 80"
              fill="none"
              stroke="url(#healthGaugeGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="healthGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="35%" stopColor="#F59E0B" />
                <stop offset="70%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
          </svg>

          {/* Centered Percentage */}
          <div className="absolute top-5 flex flex-col items-center">
            <span className="text-2xl font-black text-slate-800 tracking-tight">
              {Math.round(validScore)}%
            </span>
          </div>

          {/* Dynamic Status Badge */}
          <span className={cn("mt-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs", badgeStyle)}>
            {statusLabel}
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 w-full xs:w-auto flex-1 pl-0 xs:pl-3 border-t xs:border-t-0 xs:border-l border-slate-100 pt-3 xs:pt-0">
          <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-50/80 transition-colors">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-2xs flex-shrink-0" />
              <span className="font-medium text-slate-700 whitespace-nowrap">On-track</span>
            </div>
            <span className="font-bold text-slate-800 bg-slate-100/70 border border-slate-200/60 px-2 py-0.5 rounded-md text-[11px] tabular-nums">
              {onTrackCount}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-50/80 transition-colors">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-2xs flex-shrink-0" />
              <span className="font-medium text-slate-700 whitespace-nowrap">Cautious</span>
            </div>
            <span className="font-bold text-slate-800 bg-slate-100/70 border border-slate-200/60 px-2 py-0.5 rounded-md text-[11px] tabular-nums">
              {cautiousCount}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-50/80 transition-colors">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-2xs flex-shrink-0" />
              <span className="font-medium text-slate-700 whitespace-nowrap">Off-track</span>
            </div>
            <span className="font-bold text-slate-800 bg-slate-100/70 border border-slate-200/60 px-2 py-0.5 rounded-md text-[11px] tabular-nums">
              {offTrackCount}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="text-[11px] text-slate-400 font-normal leading-tight pt-3 border-t border-slate-100">
        *Indeks kesehatan proyek dihitung otomatis dari deviasi timeline real-time
      </p>
    </div>
  );
}

export default ProjectDistributionGauge;

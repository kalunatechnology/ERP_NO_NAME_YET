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
  scorePercent = 100,
  statusLabel = "On Track",
  onTrackCount = 0,
  cautiousCount = 0,
  offTrackCount = 0,
  className,
}: DistributionProps) {
  const radius = 65;
  const circumference = Math.PI * radius;
  const validScore = Math.min(100, Math.max(0, scorePercent));
  const strokeDashoffset = circumference - (validScore / 100) * circumference;

  // Dynamic status styling
  const isGood = validScore >= 70 || (statusLabel.toLowerCase().includes("track") && !statusLabel.toLowerCase().includes("off"));
  const isCautious = (validScore >= 40 && validScore < 70) || statusLabel.toLowerCase().includes("cautious");

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
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <h3 className="text-sm font-bold text-[#0E341F] truncate">Project Distribution</h3>
        </div>
        <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100/80 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
          Portfolio Health
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2 my-auto">
        {/* Semi-Donut Gauge */}
        <div className="flex flex-col items-center justify-center relative flex-shrink-0 mx-auto">
          <svg width="125" height="70" viewBox="0 0 150 90" className="overflow-visible">
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
              className="transition-all duration-700 ease-out"
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
          <div className="absolute top-3 flex flex-col items-center">
            <span className="text-xl font-black text-slate-800 tracking-tight">
              {Math.round(validScore)}%
            </span>
          </div>

          {/* Dynamic Status Badge */}
          <span className={cn("mt-0.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs whitespace-nowrap", badgeStyle)}>
            {statusLabel}
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1 w-full min-w-0 sm:pl-2">
          <div className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-slate-50/80 transition-colors">
            <div className="flex items-center gap-1.5 min-w-0 pr-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-2xs flex-shrink-0" />
              <span className="font-medium text-slate-700 text-xs whitespace-nowrap">On-track</span>
            </div>
            <span className="font-bold text-slate-800 bg-slate-100/70 border border-slate-200/60 px-1.5 py-0.2 rounded text-[11px] tabular-nums flex-shrink-0">
              {onTrackCount}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-slate-50/80 transition-colors">
            <div className="flex items-center gap-1.5 min-w-0 pr-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-2xs flex-shrink-0" />
              <span className="font-medium text-slate-700 text-xs whitespace-nowrap">Caution</span>
            </div>
            <span className="font-bold text-slate-800 bg-slate-100/70 border border-slate-200/60 px-1.5 py-0.2 rounded text-[11px] tabular-nums flex-shrink-0">
              {cautiousCount}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-slate-50/80 transition-colors">
            <div className="flex items-center gap-1.5 min-w-0 pr-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 shadow-2xs flex-shrink-0" />
              <span className="font-medium text-slate-700 text-xs whitespace-nowrap">Off-track</span>
            </div>
            <span className="font-bold text-slate-800 bg-slate-100/70 border border-slate-200/60 px-1.5 py-0.2 rounded text-[11px] tabular-nums flex-shrink-0">
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

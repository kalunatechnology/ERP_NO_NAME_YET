"use client";

import React from "react";
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
  const radius = 70;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, scorePercent)) / 100) * circumference;

  return (
    <div className={cn("w-full bg-white border border-[#C7C7C7] rounded-[24px] p-6 shadow-xs flex flex-col justify-between h-full min-h-[310px] select-none", className)}>
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <h3 className="text-lg font-bold text-[#0E341F]">Project Distribution</h3>
        <span className="text-2xs font-bold text-[#5A861F] bg-[#F0FEE0] px-2.5 py-0.5 rounded-full">
          Portfolio Health
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4 my-auto py-2">
        {/* Semi Donut Gauge */}
        <div className="flex flex-col items-center justify-center relative">
          <svg width="150" height="90" viewBox="0 0 160 95" className="overflow-visible">
            <path
              d="M 15 85 A 65 65 0 0 1 145 85"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M 15 85 A 65 65 0 0 1 145 85"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-700"
            />
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="35%" stopColor="#F59E0B" />
                <stop offset="70%" stopColor="#22C55E" />
                <stop offset="100%" stopColor="#15803D" />
              </linearGradient>
            </defs>
          </svg>

          {/* Centered Score */}
          <div className="absolute top-7 flex flex-col items-center">
            <span className="text-2xl sm:text-3xl font-black text-[#0E341F] tracking-tight">
              {Math.round(scorePercent)}%
            </span>
          </div>

          {/* Bottom Badge */}
          <span className="mt-1 px-3.5 py-0.5 rounded-full bg-[#2F8546] text-white text-[11px] font-bold shadow-xs">
            {statusLabel}
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2.5 text-xs font-semibold text-[#0E341F] pl-2 border-t sm:border-t-0 sm:border-l border-gray-100 pt-3 sm:pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
              <span>On-track</span>
            </div>
            <span className="font-mono text-gray-700 font-bold">{onTrackCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
              <span>Cautious</span>
            </div>
            <span className="font-mono text-gray-700 font-bold">{cautiousCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
              <span>Off-track</span>
            </div>
            <span className="font-mono text-gray-700 font-bold">{offTrackCount}</span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[#637566] leading-snug border-t border-gray-100 pt-3">
        *Indikator kesehatan diukur dari variansi jadwal (SV) dan indeks performa biaya (CPI)
      </p>
    </div>
  );
}

export default ProjectDistributionGauge;

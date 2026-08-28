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
  scorePercent = 100,
  statusLabel = "On Track",
  onTrackCount = 0,
  cautiousCount = 0,
  offTrackCount = 0,
  className,
}: DistributionProps) {
  // ── Gauge math ──────────────────────────────────────────
  // Semicircle arc: center (75, 66), radius 50
  // Arc goes from (25, 66) → top (75, 16) → (125, 66)
  const r = 50;
  const cx = 75;
  const cy = 66;
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const pathLength = Math.PI * r; // exact semicircle arc length ≈ 157.08

  const validScore = Math.min(100, Math.max(0, scorePercent));
  const strokeDashoffset = pathLength - (validScore / 100) * pathLength;

  // ── Status badge style ────────────────────────────────
  const isGood =
    validScore >= 70 ||
    (statusLabel.toLowerCase().includes("track") &&
      !statusLabel.toLowerCase().includes("off"));
  const isCautious =
    (validScore >= 40 && validScore < 70) ||
    statusLabel.toLowerCase().includes("cautious") ||
    statusLabel.toLowerCase().includes("caution");

  const badgeFill = isGood ? "#EAF8D6" : isCautious ? "#FEF3C7" : "#FEE2E2";
  const badgeStroke = isGood ? "#B5DDA4" : isCautious ? "#FDE68A" : "#FCA5A5";
  const badgeText = isGood ? "#275433" : isCautious ? "#92400E" : "#991B1B";

  return (
    <div
      className={cn(
        "w-full bg-white border border-[#E5E9E2] rounded-[20px] p-5 shadow-xs flex flex-col justify-between h-full select-none transition-all hover:shadow-card-md",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#EEF2E8] min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-[#5A861F] animate-pulse flex-shrink-0" />
          <h3 className="text-sm font-extrabold text-[#0E341F] truncate">Project Distribution</h3>
        </div>
        <span className="text-3xs font-extrabold text-[#275433] bg-[#EAF8D6] border border-[#D5ECC2] px-2.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
          Portfolio Health
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2 my-auto">

        {/* ── Gauge SVG ── */}
        <div className="flex-shrink-0 mx-auto w-full max-w-[150px]">
          <svg
            viewBox="0 0 150 86"
            className="w-full overflow-visible"
            aria-label={`Portfolio health: ${Math.round(validScore)}%`}
          >
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="35%" stopColor="#F59E0B" />
                <stop offset="70%" stopColor="#5A861F" />
                <stop offset="100%" stopColor="#275433" />
              </linearGradient>
            </defs>

            {/* Background track */}
            <path
              d={arcPath}
              fill="none"
              stroke="#EEF2E8"
              strokeWidth="12"
              strokeLinecap="round"
            />

            {/* Progress arc */}
            <path
              d={arcPath}
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={pathLength}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1)" }}
            />

            {/* Percentage text */}
            <text
              x={cx}
              y={cy - 16}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontSize: "20px",
                fontWeight: 900,
                fill: "#0E341F",
                letterSpacing: "-0.03em",
                fontFamily: "inherit",
              }}
            >
              {Math.round(validScore)}%
            </text>

            {/* Status badge pill */}
            <g transform={`translate(${cx}, ${cy + 4})`}>
              <rect
                x="-30"
                y="-9"
                width="60"
                height="18"
                rx="9"
                fill={badgeFill}
                stroke={badgeStroke}
                strokeWidth="1"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                y="0.5"
                style={{
                  fontSize: "9px",
                  fontWeight: 800,
                  fill: badgeText,
                  fontFamily: "inherit",
                }}
              >
                {statusLabel}
              </text>
            </g>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 w-full min-w-0 sm:pl-2">
          {[
            { color: "#275433", label: "On-track", count: onTrackCount },
            { color: "#F59E0B", label: "Caution", count: cautiousCount },
            { color: "#EF4444", label: "Off-track", count: offTrackCount },
          ].map(({ color, label, count }) => (
            <div
              key={label}
              className="flex items-center justify-between text-xs py-1.5 px-2 rounded-xl bg-[#F8FBF5] border border-[#EEF2E8] hover:bg-[#F0FEE0]/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-bold text-[#0E341F] text-xs whitespace-nowrap">
                  {label}
                </span>
              </div>
              <span className="font-extrabold text-[#275433] bg-[#EAF8D6] border border-[#D5ECC2] px-2 py-0.5 rounded-full text-2xs tabular-nums flex-shrink-0">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="text-3xs text-[#768779] font-normal leading-tight pt-3 border-t border-[#EEF2E8]">
        *Indeks kesehatan proyek dihitung otomatis dari deviasi timeline real-time
      </p>
    </div>
  );
}

export default ProjectDistributionGauge;

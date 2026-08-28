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
  // Semicircle arc: center (75, 78), radius 60
  // Arc goes from (15, 78) → top → (135, 78)
  const r = 60;
  const cx = 75;
  const cy = 78;
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const pathLength = Math.PI * r; // exact semicircle arc length ≈ 188.5

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

  const badgeFill = isGood ? "#F0FDE4" : isCautious ? "#FFFBEB" : "#FEF2F2";
  const badgeStroke = isGood ? "#86EFAC" : isCautious ? "#FCD34D" : "#FCA5A5";
  const badgeText = isGood ? "#166534" : isCautious ? "#92400E" : "#991B1B";

  return (
    <div
      className={cn(
        "w-full bg-white border border-text-tertiary rounded-2xl p-5 shadow-xs flex flex-col justify-between h-full select-none transition-shadow hover:shadow-sm",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-text-tertiary/60 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-brand-green animate-pulse flex-shrink-0" />
          <h3 className="text-sm font-bold text-text-primary truncate">Project Distribution</h3>
        </div>
        <span className="text-3xs font-semibold text-brand-deep-green bg-brand-light-green border border-brand-green/30 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
          Portfolio Health
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2 my-auto">

        {/* ── Gauge SVG ── */}
        {/*
          viewBox "0 14 150 72" reveals the arc from its top (y≈18) down
          to just below the arc base (y≈86), i.e. a 72-unit tall window.
          The score text sits at (cx=75, y≈68) — comfortably inside the arc.
        */}
        <div className="flex-shrink-0 mx-auto w-full max-w-[150px]">
          <svg
            viewBox="0 14 150 72"
            className="w-full"
            aria-label={`Portfolio health: ${Math.round(validScore)}%`}
          >
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="35%" stopColor="#F59E0B" />
                <stop offset="70%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>

            {/* Background track */}
            <path
              d={arcPath}
              fill="none"
              stroke="#F1F5F9"
              strokeWidth="13"
              strokeLinecap="round"
            />

            {/* Progress arc */}
            <path
              d={arcPath}
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray={pathLength}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1)" }}
            />

            {/* Percentage — anchored at arc geometric center */}
            <text
              x={cx}
              y={cy - 10}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: "22px",
                fontWeight: 900,
                fill: "#111827",
                letterSpacing: "-0.03em",
                fontFamily: "inherit",
              }}
            >
              {Math.round(validScore)}%
            </text>

            {/* Status badge — sits just below the percentage, inside arc base */}
            <g transform={`translate(${cx}, ${cy + 7})`}>
              <rect
                x="-26"
                y="-8"
                width="52"
                height="16"
                rx="8"
                fill={badgeFill}
                stroke={badgeStroke}
                strokeWidth="1"
              />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontSize: "8.5px",
                  fontWeight: 700,
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
        <div className="flex flex-col gap-1 w-full min-w-0 sm:pl-2">
          {[
            { color: "#10B981", label: "On-track", count: onTrackCount },
            { color: "#F59E0B", label: "Caution", count: cautiousCount },
            { color: "#EF4444", label: "Off-track", count: offTrackCount },
          ].map(({ color, label, count }) => (
            <div
              key={label}
              className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-bg-light transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0 pr-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-medium text-text-primary text-xs whitespace-nowrap">
                  {label}
                </span>
              </div>
              <span className="font-bold text-text-primary bg-bg-light border border-text-tertiary px-1.5 py-0.5 rounded text-2xs tabular-nums flex-shrink-0">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="text-3xs text-text-secondary font-normal leading-tight pt-3 border-t border-text-tertiary/60">
        *Indeks kesehatan proyek dihitung otomatis dari deviasi timeline real-time
      </p>
    </div>
  );
}

export default ProjectDistributionGauge;

"use client";

import React from "react";
import { Layers, CalendarDays, CheckCircle2, Percent } from "lucide-react";

interface ProjectWbsSummaryProps {
  weeklyCount: number;
  dailyCount: number;
  completedDailyCount?: number;
  progressPercent?: number;
  weightPercent?: number;
  compact?: boolean;
}

export function ProjectWbsSummary({
  weeklyCount,
  dailyCount,
  completedDailyCount = 0,
  progressPercent = 0,
  weightPercent = 10,
  compact = true,
}: ProjectWbsSummaryProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap text-2xs">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold" title="Jumlah Target Mingguan">
          <CalendarDays size={11} />
          {weeklyCount} Mingguan
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" title="Jumlah Tugas Harian">
          <CheckCircle2 size={11} />
          {completedDailyCount}/{dailyCount} Daily Task
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-[#294BB2] border border-blue-200 font-bold" title="Progres Paket Kerja">
          <Percent size={11} />
          {Math.round(progressPercent)}%
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-100">
      <div className="bg-gray-50 rounded-lg p-2 text-center">
        <span className="text-3xs text-text-secondary block">Weekly Plans</span>
        <span className="text-xs font-bold text-text-primary">{weeklyCount}</span>
      </div>
      <div className="bg-gray-50 rounded-lg p-2 text-center">
        <span className="text-3xs text-text-secondary block">Daily Tasks</span>
        <span className="text-xs font-bold text-text-primary">{dailyCount}</span>
      </div>
      <div className="bg-gray-50 rounded-lg p-2 text-center">
        <span className="text-3xs text-text-secondary block">Bobot</span>
        <span className="text-xs font-bold text-amber-600">{weightPercent}%</span>
      </div>
      <div className="bg-gray-50 rounded-lg p-2 text-center">
        <span className="text-3xs text-text-secondary block">Progres</span>
        <span className="text-xs font-bold text-emerald-600">{Math.round(progressPercent)}%</span>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { TrendingDown, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExpenseItem {
  id: string | number;
  label: string;
  amountText: string; // e.g., "Rp 2.32M", "Rp 512jt"
  amountValue?: number;
  percentage: number; // 0 - 100 relative to max scale
  category?: string;
}

interface TopExpensesBarChartProps {
  title?: string;
  expenses?: ExpenseItem[];
  className?: string;
  projectName?: string;
  scales?: string[];
}

const DEFAULT_SCALES = ["200m", "300m", "400m", "600m", "800m", "1B", "2B", "3B"];

export function TopExpensesBarChart({
  title = "Top 5 Expenses",
  expenses,
  className,
  projectName,
  scales = DEFAULT_SCALES,
}: TopExpensesBarChartProps) {
  const [hoveredExpense, setHoveredExpense] = useState<ExpenseItem | null>(null);
  const hasExpenses = expenses && expenses.length > 0;

  return (
    <div className={cn("w-full bg-white border border-[#C7C7C7] rounded-[24px] p-6 sm:p-8 shadow-xs overflow-hidden select-none", className)}>
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#F0FEE0] flex items-center justify-center text-[#275433]">
            <TrendingDown size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-[#0E341F] tracking-tight">{title}</h3>
            {projectName && (
              <p className="text-2xs text-[#637566] font-medium mt-0.5">
                Proyek: <strong>{projectName}</strong> &bull; Rincian Beban Biaya Aktual Terbesar
              </p>
            )}
          </div>
        </div>

        {/* Scale Ticks */}
        <div className="w-full sm:w-[60%] lg:w-[65%] flex justify-between text-xs font-bold text-[#637566] px-1">
          {scales.map((scale) => (
            <span key={scale} className="tracking-wide">
              {scale}
            </span>
          ))}
        </div>
      </div>

      {/* Expense Bars Body */}
      {!hasExpenses ? (
        <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2 text-neutral-400">
          <Receipt size={32} className="opacity-40" />
          <p className="text-xs font-semibold text-neutral-600">
            Belum ada catatan pengeluaran biaya aktual pada proyek ini.
          </p>
          <p className="text-2xs text-neutral-400">
            Catatan biaya operasional, material, dan upah tenaga kerja akan muncul di sini secara otomatis.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {expenses.map((item) => (
            <div
              key={item.id}
              onMouseEnter={() => setHoveredExpense(item)}
              onMouseLeave={() => setHoveredExpense(null)}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-1.5 rounded-xl hover:bg-neutral-50/80 px-2 -mx-2 transition-colors group"
            >
              {/* Left Column: Expense Category Label */}
              <div className="flex items-center gap-2 w-full sm:w-[38%] lg:w-[33%] pr-3 min-w-0">
                <span className="text-sm font-semibold text-[#0E341F] truncate group-hover:text-[#275433] transition-colors">
                  {item.label}
                </span>
              </div>

              {/* Right Column: Full-Width Rounded Pill Track & Fill */}
              <div className="w-full sm:w-[60%] lg:w-[65%] flex items-center">
                <div className="w-full bg-[#F2F5EE] rounded-full h-6 relative overflow-hidden shadow-2xs group-hover:bg-[#EBF2E4] transition-colors p-0.5">
                  <div
                    className="h-full bg-[#275433] group-hover:bg-[#1f452a] rounded-full flex items-center justify-end px-3 transition-all duration-500 shadow-xs cursor-pointer"
                    style={{ width: `${Math.min(100, Math.max(12, item.percentage))}%` }}
                  >
                    <span className="text-xs font-black text-white select-none whitespace-nowrap tracking-tight">
                      {item.amountText}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Hover Card Footer */}
      {hoveredExpense && (
        <div className="mt-5 pt-3.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4A5D4E] animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0E341F]">{hoveredExpense.label}</span>
            {hoveredExpense.category && (
              <span className="text-2xs bg-[#F0FEE0] text-[#275433] px-2.5 py-0.5 rounded-full font-bold">
                {hoveredExpense.category}
              </span>
            )}
          </div>
          <div>
            Total Pengeluaran: <strong className="text-[#275433] text-sm">{hoveredExpense.amountText}</strong> ({hoveredExpense.percentage}% dari alokasi biaya terbesar)
          </div>
        </div>
      )}
    </div>
  );
}

export default TopExpensesBarChart;

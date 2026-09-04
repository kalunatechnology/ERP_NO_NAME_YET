/**
 * File: frontend-next/components/ui/TopExpensesBarChart.tsx
 *
 * Purpose: Implements React UI component responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
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

/**
 * TopExpensesBarChart coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
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
    <div
      className={cn(
        "w-full bg-white border border-[#E5E9E2] rounded-[24px] p-5 sm:p-7 shadow-xs select-none",
        className
      )}
    >
      {/* ── Card Header ── */}
      <div className="flex items-center justify-between gap-4 mb-5 pb-2 border-b border-gray-100/80">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#F0FEE0] flex items-center justify-center text-[#275433] shadow-2xs flex-shrink-0">
            <TrendingDown size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-extrabold text-[#0E341F] tracking-tight truncate">
              {title}
            </h3>
            {projectName && (
              <p className="text-2xs text-[#637566] font-medium mt-0.5 truncate">
                Proyek: <strong className="text-[#0E341F]">{projectName}</strong> &bull; Rincian Beban Biaya Aktual Terbesar
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Bar Chart Body with Adaptive Column Grid ── */}
      {!hasExpenses ? (
        <div className="py-10 px-4 text-center flex flex-col items-center justify-center gap-2 text-neutral-400">
          <Receipt size={32} className="opacity-40" />
          <p className="text-xs font-semibold text-neutral-600">
            Belum ada catatan pengeluaran biaya aktual pada proyek ini.
          </p>
          <p className="text-2xs text-neutral-400">
            Catatan biaya operasional, material, dan upah tenaga kerja akan muncul di sini secara otomatis.
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto no-scrollbar">
          <div className="min-w-[580px] sm:min-w-[660px] flex flex-col">
            {/* Header Scale Grid */}
            <div className="grid grid-cols-[minmax(140px,220px)_1fr] gap-4 sm:gap-6 items-center pb-2.5 border-b border-[#EEF2E8]">
              <span className="text-xs font-bold text-[#637566] uppercase tracking-wider pl-1">
                Kategori Biaya
              </span>
              <div className="flex justify-between text-2xs sm:text-xs font-extrabold text-[#637566] px-1">
                {scales.map((scale) => (
                  <span key={scale} className="tracking-wide">
                    {scale}
                  </span>
                ))}
              </div>
            </div>

            {/* Expense Bar Rows */}
            <div className="flex flex-col divide-y divide-[#F4F6F1] py-1">
              {expenses.map((item) => (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredExpense(item)}
                  onMouseLeave={() => setHoveredExpense(null)}
                  className="grid grid-cols-[minmax(140px,220px)_1fr] gap-4 sm:gap-6 items-center py-2.5 px-2 -mx-2 rounded-xl hover:bg-[#F9FAF7] transition-all group"
                >
                  {/* Left Column: Category Label */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#275433] flex-shrink-0" />
                    <span
                      className="text-xs sm:text-sm font-bold text-[#0E341F] truncate group-hover:text-[#275433] transition-colors"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                  </div>

                  {/* Right Column: Full Width Rounded Pill Track */}
                  <div className="w-full bg-[#F3F6EF] rounded-full h-7 relative overflow-hidden shadow-2xs group-hover:bg-[#EAF0E5] transition-colors p-0.5">
                    <div
                      className="h-full bg-[#275433] group-hover:bg-[#1f452a] rounded-full flex items-center justify-end px-3 transition-all duration-500 shadow-xs cursor-pointer min-w-[60px]"
                      style={{ width: `${Math.min(100, Math.max(12, item.percentage))}%` }}
                    >
                      <span className="text-2xs sm:text-xs font-black text-white select-none whitespace-nowrap tracking-tight">
                        {item.amountText}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Hover Context Footer ── */}
      {hoveredExpense && (
        <div className="mt-4 pt-3 border-t border-[#EEF2E8] flex flex-wrap items-center justify-between gap-3 text-xs text-[#4A5D4E] animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#0E341F]">{hoveredExpense.label}</span>
            {hoveredExpense.category && (
              <span className="text-3xs bg-[#F0FEE0] text-[#275433] px-2.5 py-0.5 rounded-full font-bold border border-[#D5ECC2]">
                {hoveredExpense.category}
              </span>
            )}
          </div>
          <div>
            Total Pengeluaran: <strong className="text-[#275433] text-sm font-extrabold">{hoveredExpense.amountText}</strong> ({hoveredExpense.percentage}% dari alokasi biaya terbesar)
          </div>
        </div>
      )}
    </div>
  );
}

export default TopExpensesBarChart;

/**
 * File: frontend-next/components/ui/BudgetCheckStatusCard.tsx
 *
 * Purpose: Implements React UI component responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
"use client";

import React from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { formatMoney, cn } from "@/lib/utils";

interface BudgetCheckProps {
  projects?: Array<{ id: string | number; project_code?: string; project_name?: string; name?: string }>;
  selectedProjectId?: string;
  onProjectChange?: (projectId: string) => void;
  title?: string;
  statusLabel?: string;
  budgetLabel?: string;
  allocationLabel?: string;
  remainingLabel?: string;
  validLabel?: string;
  invalidLabel?: string;
  materialBudget?: number | string;
  allocationFormula?: string;
  allocationCost?: number | string;
  remainingBudget?: number | string;
  isValid?: boolean;
  className?: string;
}

/**
 * BudgetCheckStatusCard coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function BudgetCheckStatusCard({
  projects = [],
  selectedProjectId = "",
  onProjectChange,
  title = "Budget Check Status",
  statusLabel = "REAL TIME",
  budgetLabel = "Anggaran Proyek",
  allocationLabel = "Biaya Teralokasi:",
  remainingLabel = "Remaining Budget",
  validLabel = "Budget is acceptable",
  invalidLabel = "Budget perlu penyesuaian",
  materialBudget = 0,
  allocationFormula = "(Total biaya proyek tercatat)",
  allocationCost = 0,
  remainingBudget = 0,
  isValid = true,
  className,
}: BudgetCheckProps) {
/**
 * formatVal coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const formatVal = (v: number | string) =>
    typeof v === "number" ? formatMoney(v) : v;

  return (
    <div
      className={cn(
        "w-full bg-white border border-[#EFEFEF] rounded-2xl p-5 shadow-xs flex flex-col justify-between h-full select-none",
        className
      )}
    >
      {/* Header Banner */}
      <div className="bg-[#EAF6FF] rounded-xl px-3.5 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-[#090909]">{title}</span>
        <span className="text-[10px] font-bold text-[#294BB2] tracking-wider">{statusLabel}</span>
      </div>

      {projects.length > 0 && (
        <label className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-[#4F5050]">
          Proyek yang diperiksa
          <select
            value={selectedProjectId || String(projects[0]?.id ?? "")}
            onChange={(event) => onProjectChange?.(event.target.value)}
            className="input mt-1.5 w-full bg-white text-xs normal-case"
            aria-label="Pilih proyek untuk pemeriksaan anggaran"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.project_code ? `${project.project_code} — ` : ""}{project.project_name || project.name || `Proyek #${project.id}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Metric Breakdown */}
      <div className="flex flex-col gap-2.5 text-xs py-2 my-auto">
        <div className="flex justify-between items-center gap-2">
          <span className="text-[#4F5050] font-medium truncate">{budgetLabel}</span>
          <span className="font-bold text-[#090909] flex-shrink-0">{formatVal(materialBudget)}</span>
        </div>

        <div className="flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0 pr-1">
            <span className="text-[#4F5050] font-medium truncate">{allocationLabel}</span>
            <span className="text-[10px] text-[#4F5050] truncate">{allocationFormula}</span>
          </div>
          <span className="font-bold text-[#090909] flex-shrink-0">{formatVal(allocationCost)}</span>
        </div>

        <hr className="border-gray-100 my-0.5" />

        <div className="flex justify-between items-center gap-2">
          <span className="text-[#4F5050] font-medium truncate">{remainingLabel}</span>
          <span className="font-bold text-[#090909] flex-shrink-0">{formatVal(remainingBudget)}</span>
        </div>

        <hr className="border-gray-100 my-0.5" />

        <div className="flex justify-between items-center pt-0.5 gap-2">
          <span className="text-xs text-[#4F5050] font-medium">{isValid ? validLabel : invalidLabel}</span>
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold flex-shrink-0 ${
              isValid
                ? "bg-[#9FD6FF] text-[#2649B3]"
                : "bg-red-100 text-red-700"
            }`}
          >
            <span>{isValid ? "Valid" : "Overbudget"}</span>
            {isValid ? (
              <CheckCircle2 size={13} className="text-[#2649B3]" />
            ) : (
              <AlertTriangle size={13} className="text-red-700" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BudgetCheckStatusCard;

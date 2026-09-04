/**
 * File: frontend-next/components/ui/ProjectTimelineGantt.tsx
 *
 * Purpose: Implements React UI component responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
"use client";

import React, { useState } from "react";
import { Calendar, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GanttTaskItem {
  id: string | number;
  name: string;
  startWeek: number; // 1 - 8
  endWeek: number;   // 1 - 8
  progress: number;  // 0 - 100
  assignee?: string;
  status?: "DONE" | "IN_PROGRESS" | "PENDING" | "COMPLETED" | "ON_PROGRESS" | string;
}

interface ProjectTimelineGanttProps {
  title?: string;
  tasks?: GanttTaskItem[];
  totalWeeks?: number;
  className?: string;
  projectName?: string;
}

/**
 * ProjectTimelineGantt coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function ProjectTimelineGantt({
  title = "Timeline Proyek",
  tasks,
  totalWeeks = 8,
  className,
  projectName,
}: ProjectTimelineGanttProps) {
  const [hoveredTask, setHoveredTask] = useState<GanttTaskItem | null>(null);
  const weeks = Array.from({ length: totalWeeks }, (_, i) => `W${i + 1}`);
  const hasTasks = tasks && tasks.length > 0;

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
            <Calendar size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-extrabold text-[#0E341F] tracking-tight truncate">
              {title}
            </h3>
            {projectName && (
              <p className="text-2xs text-[#637566] font-medium mt-0.5 truncate">
                Proyek: <strong className="text-[#0E341F]">{projectName}</strong> &bull; Jadwal WBS Mingguan (W1–W{totalWeeks})
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Gantt Grid Body with Synchronized Columns ── */}
      {!hasTasks ? (
        <div className="py-10 px-4 text-center flex flex-col items-center justify-center gap-2 text-neutral-400">
          <Layers size={32} className="opacity-40" />
          <p className="text-xs font-semibold text-neutral-600">
            Belum ada paket kerja (WBS Main Task) pada proyek ini.
          </p>
          <p className="text-2xs text-neutral-400">
            Tambahkan Main Task pada tab Hierarki Task untuk mengisi timeline eksekusi.
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto no-scrollbar">
          <div className="min-w-[620px] sm:min-w-[700px] flex flex-col">
            {/* Header Scale Grid */}
            <div className="grid grid-cols-[minmax(140px,220px)_1fr] gap-4 sm:gap-6 items-center pb-2.5 border-b border-[#EEF2E8]">
              <span className="text-xs font-bold text-[#637566] uppercase tracking-wider pl-1">
                Paket Kerja / Task
              </span>
              <div className="grid grid-cols-8 gap-2 text-center text-2xs sm:text-xs font-extrabold text-[#637566] px-1">
                {weeks.map((w) => (
                  <span key={w} className="tracking-wide">
                    {w}
                  </span>
                ))}
              </div>
            </div>

            {/* Task Rows */}
            <div className="flex flex-col divide-y divide-[#F4F6F1] py-1">
              {tasks.map((task) => {
                const colStart = Math.min(Math.max(1, task.startWeek), totalWeeks);
                const spanCount = Math.min(
                  Math.max(1, task.endWeek - task.startWeek + 1),
                  totalWeeks - colStart + 1
                );
                const isCompleted =
                  task.progress >= 100 || task.status === "DONE" || task.status === "COMPLETED";

                return (
                  <div
                    key={task.id}
                    onMouseEnter={() => setHoveredTask(task)}
                    onMouseLeave={() => setHoveredTask(null)}
                    className="grid grid-cols-[minmax(140px,220px)_1fr] gap-4 sm:gap-6 items-center py-2 px-2 -mx-2 rounded-xl hover:bg-[#F9FAF7] transition-all group"
                  >
                    {/* Left Column: Task Name with Indicator Dot */}
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={cn(
                          "w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform group-hover:scale-125",
                          isCompleted
                            ? "bg-[#275433]"
                            : task.progress > 0
                            ? "bg-[#5A861F]"
                            : "bg-[#C7C7C7]"
                        )}
                      />
                      <span
                        className="text-xs sm:text-sm font-bold text-[#0E341F] truncate group-hover:text-[#275433] transition-colors"
                        title={task.name}
                      >
                        {task.name}
                      </span>
                    </div>

                    {/* Right Column: 8-Column Track Container */}
                    <div className="relative h-7 flex items-center">
                      {/* 8 Background Vertical Slots */}
                      <div className="absolute inset-0 grid grid-cols-8 gap-2 pointer-events-none">
                        {weeks.map((_, i) => (
                          <div
                            key={i}
                            className="bg-[#F2F5EE] rounded-full h-full w-full opacity-80"
                          />
                        ))}
                      </div>

                      {/* Dynamic Progress Bar Overlay */}
                      <div className="relative w-full h-full grid grid-cols-8 gap-2 items-center z-10">
                        <div
                          className="relative h-6 rounded-full overflow-hidden flex items-center shadow-xs transition-all cursor-pointer"
                          style={{
                            gridColumnStart: colStart,
                            gridColumnEnd: `span ${spanCount}`,
                          }}
                        >
                          {/* Background Bar Span */}
                          <div className="absolute inset-0 bg-[#F0FEE0] rounded-full" />

                          {/* Progress Fill */}
                          {task.progress > 0 ? (
                            <div
                              className="relative h-full bg-[#275433] rounded-full flex items-center justify-end px-2.5 transition-all duration-500 shadow-2xs min-w-[34px]"
                              style={{ width: `${Math.min(100, Math.max(10, task.progress))}%` }}
                            >
                              <span className="text-[10px] sm:text-[11px] font-black text-white leading-none select-none tracking-tight">
                                {task.progress}%
                              </span>
                            </div>
                          ) : (
                            /* 0% Progress Indicator */
                            <div className="relative h-full w-full flex items-center px-1.5 gap-1.5">
                              <div className="w-3.5 h-3.5 rounded-full bg-[#275433] flex items-center justify-center flex-shrink-0 shadow-2xs">
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              </div>
                              <span className="text-[10px] font-bold text-[#2E8CFF] select-none">
                                0%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Hover Card Footer */}
      {hoveredTask && (
        <div className="mt-4 pt-3 border-t border-[#EEF2E8] flex flex-wrap items-center justify-between gap-3 text-xs text-[#4A5D4E] animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#0E341F]">{hoveredTask.name}</span>
            <span className="text-3xs bg-[#F0FEE0] text-[#275433] px-2 py-0.5 rounded-full font-bold border border-[#D5ECC2]">
              Minggu {hoveredTask.startWeek} – Minggu {hoveredTask.endWeek}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {hoveredTask.assignee && (
              <span>
                Pelaksana: <strong>{hoveredTask.assignee}</strong>
              </span>
            )}
            <span>
              Progres Realisasi: <strong className="text-[#275433]">{hoveredTask.progress}%</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectTimelineGantt;

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

export function ProjectTimelineGantt({
  title = "Timeline",
  tasks,
  totalWeeks = 8,
  className,
  projectName,
}: ProjectTimelineGanttProps) {
  const [hoveredTask, setHoveredTask] = useState<GanttTaskItem | null>(null);
  const weeks = Array.from({ length: totalWeeks }, (_, i) => `W${i + 1}`);

  const hasTasks = tasks && tasks.length > 0;

  return (
    <div className={cn("w-full bg-white border border-[#C7C7C7] rounded-[24px] p-6 sm:p-8 shadow-xs overflow-hidden select-none", className)}>
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#F0FEE0] flex items-center justify-center text-[#275433]">
            <Calendar size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-[#0E341F] tracking-tight">{title}</h3>
            {projectName && (
              <p className="text-2xs text-[#637566] font-medium mt-0.5">
                Proyek: <strong>{projectName}</strong> &bull; Jadwal WBS Mingguan (W1–W{totalWeeks})
              </p>
            )}
          </div>
        </div>

        {/* Column Headers (W1 - W8) */}
        <div className="w-full sm:w-[60%] lg:w-[65%] grid grid-cols-8 gap-2 sm:gap-3 text-center">
          {weeks.map((w) => (
            <span key={w} className="text-xs font-bold text-[#637566] tracking-wider">
              {w}
            </span>
          ))}
        </div>
      </div>

      {/* Gantt Grid Body */}
      {!hasTasks ? (
        <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2 text-neutral-400">
          <Layers size={32} className="opacity-40" />
          <p className="text-xs font-semibold text-neutral-600">
            Belum ada paket kerja (WBS Main Task) pada proyek ini.
          </p>
          <p className="text-2xs text-neutral-400">
            Tambahkan Main Task pada tab Hierarki Task untuk mengisi timeline eksekusi.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {tasks.map((task) => {
            const colStart = Math.min(Math.max(1, task.startWeek), totalWeeks);
            const spanCount = Math.min(
              Math.max(1, task.endWeek - task.startWeek + 1),
              totalWeeks - colStart + 1
            );
            const isCompleted = task.progress >= 100 || task.status === "DONE" || task.status === "COMPLETED";

            return (
              <div
                key={task.id}
                onMouseEnter={() => setHoveredTask(task)}
                onMouseLeave={() => setHoveredTask(null)}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-1.5 rounded-xl hover:bg-neutral-50/80 px-2 -mx-2 transition-colors group"
              >
                {/* Left Column: Task Name with Indicator Dot */}
                <div className="flex items-center gap-3 w-full sm:w-[38%] lg:w-[33%] pr-3 min-w-0">
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
                  <span className="text-sm font-semibold text-[#0E341F] truncate group-hover:text-[#275433] transition-colors">
                    {task.name}
                  </span>
                </div>

                {/* Right Column: 8-Column Track Container */}
                <div className="w-full sm:w-[60%] lg:w-[65%] relative h-7 flex items-center">
                  {/* 8 Background Vertical Slots */}
                  <div className="absolute inset-0 grid grid-cols-8 gap-2 sm:gap-3 pointer-events-none">
                    {weeks.map((_, i) => (
                      <div
                        key={i}
                        className="bg-[#F2F5EE] rounded-full h-full w-full opacity-80"
                      />
                    ))}
                  </div>

                  {/* Dynamic Progress Bar Overlay */}
                  <div className="relative w-full h-full grid grid-cols-8 gap-2 sm:gap-3 items-center z-10">
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
                          className="relative h-full bg-[#275433] rounded-full flex items-center justify-end px-2.5 transition-all duration-500 shadow-2xs"
                          style={{ width: `${Math.min(100, Math.max(8, task.progress))}%` }}
                        >
                          <span className="text-[11px] font-black text-white leading-none select-none tracking-tight">
                            {task.progress}%
                          </span>
                        </div>
                      ) : (
                        /* 0% Progress Indicator */
                        <div className="relative h-full w-full flex items-center px-1.5 gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-[#275433] flex items-center justify-center flex-shrink-0 shadow-2xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                          <span className="text-[11px] font-bold text-[#2E8CFF] select-none">
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
      )}

      {/* Detailed Hover Card Footer */}
      {hoveredTask && (
        <div className="mt-5 pt-3.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4A5D4E] animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0E341F]">{hoveredTask.name}</span>
            <span className="text-2xs bg-[#F0FEE0] text-[#275433] px-2 py-0.5 rounded-full font-bold">
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

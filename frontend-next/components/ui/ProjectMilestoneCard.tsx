"use client";

import React from "react";
import { ChevronRight, Milestone as MilestoneIcon, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProjectSummary {
  id: string | number;
  name: string;
  code?: string;
  status?: string;
}

export interface MilestoneItem {
  id: string | number;
  stepNumber: number;
  title: string;
  points: string[];
  isActive?: boolean;
  status?: "COMPLETED" | "ACTIVE" | "PENDING" | string;
}

interface ProjectMilestoneCardProps {
  projects?: ProjectSummary[];
  selectedProjectId?: string | number;
  onSelectProject?: (projectId: string | number) => void;
  milestones?: MilestoneItem[] | Record<string | number, MilestoneItem[]>;
  className?: string;
}

export function ProjectMilestoneCard({
  projects = [],
  selectedProjectId: controlledSelectedId,
  onSelectProject,
  milestones = [],
  className,
}: ProjectMilestoneCardProps) {
  const [internalSelectedId, setInternalSelectedId] = React.useState<string | number>(
    controlledSelectedId || projects[0]?.id || ""
  );

  const activeId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  const currentMilestones: MilestoneItem[] = Array.isArray(milestones)
    ? milestones
    : milestones[String(activeId)] || milestones[Number(activeId)] || [];

  const handleSelect = (id: string | number) => {
    setInternalSelectedId(id);
    onSelectProject?.(id);
  };

  const activeCount = currentMilestones.filter((m) => m.status === "COMPLETED" || m.status === "PASSED" || m.isActive).length;
  const progressPercent = currentMilestones.length > 0 ? Math.round((activeCount / currentMilestones.length) * 100) : 0;

  return (
    <div className={cn("w-full bg-white border border-[#C7C7C7] rounded-[24px] overflow-hidden grid grid-cols-1 lg:grid-cols-[300px_1fr] shadow-xs select-none", className)}>
      {/* Left Sidebar: Project Lists */}
      <div className="bg-[#F0FEE0]/60 p-5 sm:p-6 flex flex-col gap-2 border-r border-[#E3EBD7]">
        <div className="flex items-center gap-2 mb-2">
          <FolderKanban size={18} className="text-[#5A861F]" />
          <h4 className="text-base font-bold text-[#0E341F]">Project Lists</h4>
        </div>
        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[300px] pr-1">
          {projects.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">Belum ada proyek terdaftar.</div>
          ) : (
            projects.map((prj) => {
              const isSelected = String(activeId) === String(prj.id);
              return (
                <button
                  key={prj.id}
                  onClick={() => handleSelect(prj.id)}
                  className={cn(
                    "w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between group",
                    isSelected
                      ? "bg-white text-[#0E341F] shadow-xs font-bold border border-[#BBDFA0]"
                      : "text-[#637566] hover:bg-white/60 hover:text-[#0E341F]"
                  )}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="truncate">{prj.name}</span>
                    {prj.code && (
                      <span className="text-3xs font-mono text-neutral-400">{prj.code}</span>
                    )}
                  </div>
                  <ChevronRight
                    size={14}
                    className={cn(
                      "flex-shrink-0 transition-transform",
                      isSelected ? "text-[#5A861F] translate-x-0.5" : "opacity-0 group-hover:opacity-100"
                    )}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Content: Milestones Stepper */}
      <div className="p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
        <div>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MilestoneIcon size={18} className="text-[#5A861F]" />
              <h4 className="text-base font-bold text-[#0E341F]">Milestones &amp; Gates Proyek</h4>
            </div>
            {currentMilestones.length > 0 && (
              <span className="text-2xs font-bold text-[#275433] bg-[#F0FEE0] px-2.5 py-0.5 rounded-full">
                {activeCount} dari {currentMilestones.length} Tahap ({progressPercent}%)
              </span>
            )}
          </div>

          {/* Stepper Cards Horizontal Slider */}
          {currentMilestones.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2 text-neutral-400">
              <MilestoneIcon size={32} className="opacity-40" />
              <p className="text-xs font-semibold text-neutral-600">
                Belum ada milestone tercatat pada proyek ini.
              </p>
              <p className="text-2xs text-neutral-400">
                Gunakan tab Milestones &amp; Gates di bawah untuk menambahkan target termin proyek.
              </p>
            </div>
          ) : (
            <div className="flex gap-3.5 overflow-x-auto pb-3">
              {currentMilestones.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "min-w-[260px] sm:min-w-[300px] max-w-[320px] rounded-[18px] p-4 flex flex-col gap-3 transition-all flex-shrink-0 shadow-2xs",
                    m.isActive
                      ? "bg-[#F0FEE0] border border-[#BBDFA0]"
                      : "bg-white border border-[#C7C7C7] hover:border-neutral-400"
                  )}
                >
                  {/* Header Title with Step Badge */}
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-[8px] flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 shadow-2xs",
                        m.isActive || m.status === "COMPLETED"
                          ? "bg-[#275433] text-white"
                          : "bg-neutral-100 text-neutral-600"
                      )}
                    >
                      {m.stepNumber}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-[#0E341F] leading-snug line-clamp-2">
                        {m.title}
                      </h5>
                      <span className="text-3xs font-semibold text-neutral-400 uppercase mt-0.5 block">
                        Status: {m.status || "PENDING"}
                      </span>
                    </div>
                  </div>

                  {/* Sub Points */}
                  <ol className="text-[11px] text-[#4A5D4E] flex flex-col gap-1.5 list-decimal pl-4 leading-relaxed font-medium">
                    {m.points.map((pt, idx) => (
                      <li key={idx}>{pt}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Progress Tracker Line */}
        {currentMilestones.length > 0 && (
          <div className="w-full bg-[#E5E5E5] h-1.5 rounded-full mt-4 overflow-hidden">
            <div
              className="bg-[#275433] h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectMilestoneCard;

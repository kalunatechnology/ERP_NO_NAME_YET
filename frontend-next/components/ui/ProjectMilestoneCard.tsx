/**
 * File: frontend-next/components/ui/ProjectMilestoneCard.tsx
 *
 * Purpose: Defines React UI component responsibilities for the frontend application.
 * Responsibility: Owns the executable contracts declared here and their framework/import integration boundary.
 * Dependencies and side effects: Function comments identify HTTP, persistence, browser-state, and security effects where present.
 */
"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Milestone as MilestoneIcon, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProjectLifecycleLabel, normalizeProjectLifecycleStage } from "@/lib/projects/lifecycle";

export interface ProjectSummary {
  id: string | number;
  name: string;
  code?: string;
  lifecycle_status?: string;
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

/**
 * ProjectMilestoneCard coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
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
  const [pipelineView, setPipelineView] = React.useState<"ALL" | "PRE_PITCHING" | "PITCHING" | "RUNNING">("ALL");
  const [projectPageSize, setProjectPageSize] = React.useState(5);
  const [projectPage, setProjectPage] = React.useState(1);

  const activeId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;
  const filteredProjects = React.useMemo(() => projects.filter((project) => {
    const stage = normalizeProjectLifecycleStage(project.lifecycle_status);
    if (pipelineView === "PRE_PITCHING") return stage === "INCOMING" || stage === "DISCOVERY";
    if (pipelineView === "PITCHING") return stage === "PITCHING";
    if (pipelineView === "RUNNING") return stage === "ACTIVE";
    return true;
  }), [pipelineView, projects]);
  const projectPageCount = Math.max(1, Math.ceil(filteredProjects.length / projectPageSize));
  const visibleProjects = filteredProjects.slice((projectPage - 1) * projectPageSize, projectPage * projectPageSize);
  const pipelineOptions = [
    { key: "PRE_PITCHING", label: "Belum Pitching" },
    { key: "PITCHING", label: "Sedang Pitching" },
    { key: "RUNNING", label: "Proyek Running" },
    { key: "ALL", label: "Semua Proyek" },
  ] as const;

  React.useEffect(() => {
    const selectedIndex = filteredProjects.findIndex((project) => String(project.id) === String(activeId));
    if (selectedIndex >= 0) setProjectPage(Math.floor(selectedIndex / projectPageSize) + 1);
    else setProjectPage((current) => Math.min(current, projectPageCount));
  }, [activeId, filteredProjects, projectPageCount, projectPageSize]);

  const currentMilestones: MilestoneItem[] = filteredProjects.length === 0 ? [] : Array.isArray(milestones)
    ? milestones
    : milestones[String(activeId)] || milestones[Number(activeId)] || [];

/**
 * handleSelect coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleSelect = (id: string | number) => {
    setInternalSelectedId(id);
    onSelectProject?.(id);
  };

  const changePipelineView = (view: "ALL" | "PRE_PITCHING" | "PITCHING" | "RUNNING") => {
    setPipelineView(view);
    setProjectPage(1);
    const nextProjects = projects.filter((project) => {
      const stage = normalizeProjectLifecycleStage(project.lifecycle_status);
      if (view === "PRE_PITCHING") return stage === "INCOMING" || stage === "DISCOVERY";
      if (view === "PITCHING") return stage === "PITCHING";
      if (view === "RUNNING") return stage === "ACTIVE";
      return true;
    });
    if (nextProjects.length && !nextProjects.some((project) => String(project.id) === String(activeId))) {
      handleSelect(nextProjects[0].id);
    }
  };

  const activeCount = currentMilestones.filter(
    (m) => m.status === "COMPLETED" || m.status === "PASSED" || m.isActive
  ).length;
  const progressPercent =
    currentMilestones.length > 0
      ? Math.round((activeCount / currentMilestones.length) * 100)
      : 0;

  return (
    <div
      className={cn(
        "w-full bg-white border border-[#EFEFEF] rounded-[14px] overflow-hidden grid grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[250px_1fr] shadow-xs select-none",
        className
      )}
    >
      {/* Left Sidebar: Project Lists */}
      <div className="bg-[#E7F2FF]/50 p-3 sm:p-4 flex flex-col gap-2 border-b md:border-b-0 md:border-r border-[#E7F2FF]">
        <div className="flex items-center gap-2">
          <FolderKanban size={17} className="text-[#0876CD]" />
          <h4 className="text-sm font-bold text-[#0F172A]">Daftar Proyek</h4>
        </div>
        <label className="sr-only" htmlFor="project-milestone-status-filter">Filter status proyek</label>
        <select
          id="project-milestone-status-filter"
          value={pipelineView}
          onChange={(event) => changePipelineView(event.target.value as typeof pipelineView)}
          className="h-9 w-full rounded-lg border border-[#D5E3F2] bg-white px-2.5 text-xs font-semibold text-[#163D64] outline-none focus:border-[#0876CD] focus:ring-2 focus:ring-[#BAE6FD]/60"
        >
          {pipelineOptions.map((view) => {
            const count = view.key === "ALL"
              ? projects.length
              : projects.filter((project) => {
                const stage = normalizeProjectLifecycleStage(project.lifecycle_status);
                return view.key === "PRE_PITCHING"
                  ? stage === "INCOMING" || stage === "DISCOVERY"
                  : view.key === "PITCHING" ? stage === "PITCHING" : stage === "ACTIVE";
              }).length;
            return <option key={view.key} value={view.key}>{view.label} ({count})</option>;
          })}
        </select>
        <div className="flex flex-col gap-1 overflow-y-auto max-h-[220px] md:max-h-[280px] pr-1 no-scrollbar">
          {filteredProjects.length === 0 ? (
            <div className="p-3 text-center text-xs text-gray-500">Tidak ada proyek pada filter lifecycle ini.</div>
          ) : (
            visibleProjects.map((prj) => {
              const isSelected = String(activeId) === String(prj.id);
              return (
                <button
                  key={prj.id}
                  onClick={() => handleSelect(prj.id)}
                  className={cn(
                    "group flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition-all",
                    isSelected
                      ? "bg-white text-[#0F172A] shadow-xs font-bold border border-[#BAE6FD]"
                      : "text-[#64748B] hover:bg-white/60 hover:text-[#0F172A]"
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col pr-1.5">
                    <span className="whitespace-normal break-words leading-snug" title={prj.name}>{prj.name}</span>
                    {prj.code && (
                      <span className="text-[10px] font-mono text-neutral-400">{prj.code}</span>
                    )}
                    <span className="mt-0.5 w-fit rounded-full bg-[#E7F2FF] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#163D64]">
                      {getProjectLifecycleLabel(prj.lifecycle_status)}
                    </span>
                  </div>
                  <ChevronRight
                    size={14}
                    className={cn(
                      "flex-shrink-0 transition-transform",
                      isSelected ? "text-[#0876CD] translate-x-0.5" : "opacity-0 group-hover:opacity-100"
                    )}
                  />
                </button>
              );
            })
          )}
        </div>
        {projects.length > 0 && (
          <div className="mt-auto flex flex-col gap-1.5 border-t border-[#DCEBFA] pt-2.5 text-2xs text-[#64748B]">
            <label className="flex items-center justify-between gap-2">
              <span>Per halaman</span>
              <select
                value={projectPageSize}
                onChange={(event) => { setProjectPageSize(Number(event.target.value)); setProjectPage(1); }}
                className="h-7 rounded-lg border border-[#E2E8F0] bg-white px-2 py-0.5 text-2xs font-semibold text-[#0F172A] outline-none focus:border-[#163D64]"
              >
                {[5, 10, 20].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setProjectPage((value) => Math.max(1, value - 1))}
                disabled={projectPage === 1}
                className="rounded-lg border border-[#E2E8F0] bg-white p-1 text-[#64748B] transition-colors hover:bg-gray-50 disabled:opacity-40"
                aria-label="Halaman proyek sebelumnya"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="font-semibold">{projectPage} / {projectPageCount}</span>
              <button
                type="button"
                onClick={() => setProjectPage((value) => Math.min(projectPageCount, value + 1))}
                disabled={projectPage === projectPageCount}
                className="rounded-lg border border-[#E2E8F0] bg-white p-1 text-[#64748B] transition-colors hover:bg-gray-50 disabled:opacity-40"
                aria-label="Halaman proyek berikutnya"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Content: Milestones Stepper */}
      <div className="p-4 sm:p-6 flex flex-col justify-between overflow-hidden">
        <div>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100/80 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MilestoneIcon size={18} className="text-[#0876CD] flex-shrink-0" />
              <h4 className="text-sm sm:text-base font-bold text-[#0F172A] truncate">
                Milestones &amp; Gates Proyek
              </h4>
            </div>
            {currentMilestones.length > 0 && (
              <span className="text-2xs font-bold text-[#163D64] bg-[#E7F2FF] px-2.5 py-0.5 rounded-full flex-shrink-0">
                {activeCount} / {currentMilestones.length} Tahap ({progressPercent}%)
              </span>
            )}
          </div>

          {/* Stepper Cards Horizontal Slider */}
          {currentMilestones.length === 0 ? (
            <div className="py-8 px-4 text-center flex flex-col items-center justify-center gap-2 text-neutral-400">
              <MilestoneIcon size={30} className="opacity-40" />
              <p className="text-xs font-semibold text-neutral-600">
                Belum ada milestone tercatat pada proyek ini.
              </p>
              <p className="text-2xs text-neutral-400">
                Gunakan tab Milestones &amp; Gates di bawah untuk menambahkan target termin proyek.
              </p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {currentMilestones.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "w-[240px] sm:w-[270px] rounded-[14px] p-3.5 flex flex-col gap-2.5 transition-all flex-shrink-0 shadow-2xs",
                    m.isActive
                      ? "bg-[#E7F2FF] border border-[#BAE6FD]"
                      : "bg-white border border-[#EFEFEF] hover:border-neutral-300"
                  )}
                >
                  {/* Header Title with Step Badge */}
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-[6px] flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5 shadow-2xs",
                        m.isActive || m.status === "COMPLETED"
                          ? "bg-[#163D64] text-white"
                          : "bg-neutral-100 text-neutral-600"
                      )}
                    >
                      {m.stepNumber}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-[#0F172A] leading-snug line-clamp-2">
                        {m.title}
                      </h5>
                      <span className="text-[10px] font-semibold text-neutral-400 uppercase mt-0.5 block">
                        Status: {m.status || "PENDING"}
                      </span>
                    </div>
                  </div>

                  {/* Sub Points */}
                  <ol className="text-[11px] text-[#64748B] flex flex-col gap-1 list-decimal pl-4 leading-relaxed font-medium">
                    {m.points.map((pt, idx) => (
                      <li key={idx} className="line-clamp-2">{pt}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Progress Tracker Line */}
        {currentMilestones.length > 0 && (
          <div className="w-full bg-[#E5E5E5] h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-[#163D64] h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectMilestoneCard;

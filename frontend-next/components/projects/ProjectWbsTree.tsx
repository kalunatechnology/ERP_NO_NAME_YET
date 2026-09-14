"use client";

import React, { useState, useCallback } from "react";
import { Layers, Plus, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp } from "lucide-react";
import { ProjectWbsNode } from "./ProjectWbsNode";

interface ProjectWbsTreeProps {
  mainTasks: any[];
  canUpdateProject: boolean;
  isPM: boolean;
  currentUserId: string;
  userRole: string;
  onCreateMainTaskClick: () => void;
  onAssignClick: (main: any) => void;
  onRemoveAssignment: (assignmentId: any) => void;
  onCreateWeeklyClick: (main: any) => void;
  onDeleteMainTask: (mainId: any, name: string) => void;
  onCreateDailyClick: (weekly: any) => void;
  onDeleteWeeklyTask: (weeklyId: any, weekNum: number) => void;
  onToggleDailyStatus: (daily: any, canManage: boolean) => void;
  onEditDailyClick: (daily: any) => void;
  onTransferDailyClick: (daily: any) => void;
  onDeleteDailyTask: (dailyId: any, title: string) => void;
}

export function ProjectWbsTree({
  mainTasks,
  canUpdateProject,
  isPM,
  currentUserId,
  userRole,
  onCreateMainTaskClick,
  onAssignClick,
  onRemoveAssignment,
  onCreateWeeklyClick,
  onDeleteMainTask,
  onCreateDailyClick,
  onDeleteWeeklyTask,
  onToggleDailyStatus,
  onEditDailyClick,
  onTransferDailyClick,
  onDeleteDailyTask,
}: ProjectWbsTreeProps) {
  // By default, Main Tasks are collapsed (true means collapsed) to prevent page from looking full/overwhelming
  const [collapsedMain, setCollapsedMain] = useState<Record<string, boolean>>({});
  const [collapsedWeekly, setCollapsedWeekly] = useState<Record<string, boolean>>({});

  // Helper: check if a specific main task is expanded.
  // Note: if not explicitly toggled, by default main tasks are COLLAPSED (false)
  // unless user clicked "Expand All".
  const [defaultAllExpanded, setDefaultAllExpanded] = useState<boolean>(false);

  const isMainExpanded = useCallback((id: string) => {
    if (collapsedMain[id] !== undefined) {
      return !collapsedMain[id];
    }
    return defaultAllExpanded;
  }, [collapsedMain, defaultAllExpanded]);

  const handleToggleMain = useCallback((id: string) => {
    setCollapsedMain((prev) => {
      const current = prev[id] !== undefined ? prev[id] : !defaultAllExpanded;
      return { ...prev, [id]: !current };
    });
  }, [defaultAllExpanded]);

  const handleToggleWeekly = useCallback((id: string) => {
    setCollapsedWeekly((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const handleExpandAll = useCallback(() => {
    setDefaultAllExpanded(true);
    const newCollapsedMain: Record<string, boolean> = {};
    mainTasks.forEach((m) => {
      newCollapsedMain[String(m.id)] = false; // false = not collapsed = expanded
    });
    setCollapsedMain(newCollapsedMain);

    const newCollapsedWeekly: Record<string, boolean> = {};
    mainTasks.forEach((m) => {
      const weeklies = m.weekly_tasks || m.weekly_plans || [];
      weeklies.forEach((w: any) => {
        newCollapsedWeekly[String(w.id)] = false;
      });
    });
    setCollapsedWeekly(newCollapsedWeekly);
  }, [mainTasks]);

  const handleCollapseAll = useCallback(() => {
    setDefaultAllExpanded(false);
    const newCollapsedMain: Record<string, boolean> = {};
    mainTasks.forEach((m) => {
      newCollapsedMain[String(m.id)] = true; // true = collapsed
    });
    setCollapsedMain(newCollapsedMain);
  }, [mainTasks]);

  return (
    <div className="flex flex-col gap-4">
      {/* WBS Action Toolbar & Global Expand/Collapse controls */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 pb-1">
        <div className="flex items-center gap-2">
          <span className="badge badge-success text-xs font-bold">
            {userRole === "staff" ? "Task Terkait Saya" : "Hierarki WBS Proyek"}
          </span>
          <span className="text-xs text-text-secondary hidden sm:inline">
            {userRole === "staff"
              ? "Paket kerja dan aktivitas yang ditugaskan kepada akun Anda."
              : "L1: Main Task → L2: Weekly Plan → L3: Daily Task"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {mainTasks.length > 0 && (
            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-xl border border-gray-200 text-2xs">
              <button
                type="button"
                onClick={handleExpandAll}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white text-text-secondary hover:text-text-primary transition-all font-semibold"
                title="Buka semua paket kerja dan target"
              >
                <ChevronsDown size={13} className="text-[#2649B3]" />
                <span>Buka Semua</span>
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white text-text-secondary hover:text-text-primary transition-all font-semibold"
                title="Tutup semua paket kerja agar ringkas"
              >
                <ChevronsUp size={13} className="text-amber-600" />
                <span>Tutup Semua</span>
              </button>
            </div>
          )}

          {canUpdateProject && isPM && (
            <button
              onClick={onCreateMainTaskClick}
              className="btn-primary py-1.5 px-3 text-xs gap-1.5 shadow-xs"
            >
              <Plus size={14} /> Tambah Main Task
            </button>
          )}
        </div>
      </div>

      {/* Main Tasks List */}
      {mainTasks.length === 0 ? (
        <div className="card p-12 rounded-2xl text-center border-dashed border-2">
          <Layers size={36} className="text-brand-green mx-auto mb-2 opacity-60" />
          <h3 className="text-sm font-bold text-text-primary">Belum ada Paket Kerja (Main Task) pada proyek ini</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
            {canUpdateProject && isPM
              ? "Klik tombol + Tambah Main Task untuk membuat paket kerja WBS tingkat 1."
              : "Menunggu Project Manager (PM) untuk membuat paket kerja WBS Main Task."}
          </p>
          {canUpdateProject && isPM && (
            <button
              onClick={onCreateMainTaskClick}
              className="btn-primary mx-auto mt-4 py-2 px-4 text-xs gap-1.5"
            >
              <Plus size={14} /> Buat Main Task Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {mainTasks.map((main) => (
            <ProjectWbsNode
              key={main.id}
              main={main}
              isExpanded={isMainExpanded(String(main.id))}
              onToggleExpand={() => handleToggleMain(String(main.id))}
              collapsedWeeklyTasks={collapsedWeekly}
              onToggleWeekly={handleToggleWeekly}
              canUpdateProject={canUpdateProject}
              isPM={isPM}
              currentUserId={currentUserId}
              onAssignClick={onAssignClick}
              onRemoveAssignment={onRemoveAssignment}
              onCreateWeeklyClick={onCreateWeeklyClick}
              onDeleteMainTask={onDeleteMainTask}
              onCreateDailyClick={onCreateDailyClick}
              onDeleteWeeklyTask={onDeleteWeeklyTask}
              onToggleDailyStatus={onToggleDailyStatus}
              onEditDailyClick={onEditDailyClick}
              onTransferDailyClick={onTransferDailyClick}
              onDeleteDailyTask={onDeleteDailyTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

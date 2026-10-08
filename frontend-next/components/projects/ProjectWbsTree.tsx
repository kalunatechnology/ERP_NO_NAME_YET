"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Layers, Plus, ChevronsDown, ChevronsUp, Search } from "lucide-react";
import { ProjectWbsNode } from "./ProjectWbsNode";

interface ProjectWbsTreeProps {
  mainTasks: any[];
  focusWeeklyId?: string | null;
  isPM: boolean;
  canManageWbs: boolean;
  canAssignTeam: boolean;
  canManageWeeklyTasks: boolean;
  canReviewWeeklyTasks: boolean;
  onReviewWeeklyTask: (id: string | number, decision: "APPROVE" | "REJECT") => Promise<void>;
  currentUserId: string;
  userRole: string;
  onCreateMainTaskClick: () => void;
  onAssignClick: (main: any) => void;
  onRemoveAssignment: (mainTask: any, assignmentId: any) => void;
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
  focusWeeklyId,
  isPM,
  canManageWbs,
  canAssignTeam,
  canManageWeeklyTasks,
  canReviewWeeklyTasks,
  onReviewWeeklyTask,
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
  const [search, setSearch] = useState("");
  const lastFocusedTarget = useRef("");
  const pendingMainIds = useMemo(() => new Set(mainTasks
    .filter((main) => (main.weekly_tasks || main.weekly_plans || []).some((weekly: any) => weekly.status === "PENDING_APPROVAL"))
    .map((main) => String(main.id))), [mainTasks]);
  const pendingWeeklyCount = useMemo(() => mainTasks.reduce((count, main) => count
    + (main.weekly_tasks || main.weekly_plans || []).filter((weekly: any) => weekly.status === "PENDING_APPROVAL").length, 0), [mainTasks]);
  const query = search.trim().toLocaleLowerCase("id-ID");
  // Keep complete matching branches so progress and parent-child context remain intact.
  const visibleMainTasks = useMemo(() => mainTasks.filter((main) => {
    if (!query) return true;
    const weeklyTasks = main.weekly_tasks || main.weekly_plans || [];
    const values = [main.title, main.name, main.description, main.cost_owner_division_name,
      ...(main.assignments || []).flatMap((assignment: any) => [assignment.assignee_name, assignment.user_name]),
      ...weeklyTasks.flatMap((weekly: any) => [weekly.target_description, weekly.target_output, weekly.assignee_name, `Minggu ${weekly.week_number}`,
        ...(weekly.daily_tasks || []).flatMap((daily: any) => [daily.title, daily.activity_input, daily.description, daily.output_target, daily.owner_name])])];
    return values.some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(query));
  }), [mainTasks, query]);
  // Main Tasks stay collapsed by default, except branches awaiting PM approval.
  const [collapsedMain, setCollapsedMain] = useState<Record<string, boolean>>({});
  const [collapsedWeekly, setCollapsedWeekly] = useState<Record<string, boolean>>({});

  // Helper: check if a specific main task is expanded.
  // Explicit toggles take precedence over the approval and Expand All defaults.
  const [defaultAllExpanded, setDefaultAllExpanded] = useState<boolean>(false);
  useEffect(() => {
    setCollapsedMain({});
    setCollapsedWeekly({});
    setDefaultAllExpanded(Boolean(query));
  }, [query]);

  useEffect(() => {
    if (!focusWeeklyId) { lastFocusedTarget.current = ""; return; }
    const main = mainTasks.find(task => (task.weekly_tasks || task.weekly_plans || []).some((weekly: any) => String(weekly.id) === focusWeeklyId));
    if (!main) return;
    const key = `${main.id}:${focusWeeklyId}`;
    if (lastFocusedTarget.current === key) return;
    if (query) { setSearch(""); return; }
    setCollapsedMain(previous => ({ ...previous, [String(main.id)]: false }));
    setCollapsedWeekly(previous => ({ ...previous, [focusWeeklyId]: false }));
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const target = document.getElementById(`weekly-target-${focusWeeklyId}`);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus({ preventScroll: true });
        lastFocusedTarget.current = key;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusWeeklyId, mainTasks, query]);

  const isMainExpanded = useCallback((id: string) => {
    if (collapsedMain[id] !== undefined) {
      return !collapsedMain[id];
    }
    return defaultAllExpanded || (canReviewWeeklyTasks && pendingMainIds.has(id));
  }, [collapsedMain, defaultAllExpanded, canReviewWeeklyTasks, pendingMainIds]);

  const handleToggleMain = useCallback((id: string) => {
    setCollapsedMain((prev) => {
      const current = prev[id] !== undefined ? prev[id] : !(defaultAllExpanded || (canReviewWeeklyTasks && pendingMainIds.has(id)));
      return { ...prev, [id]: !current };
    });
  }, [defaultAllExpanded, canReviewWeeklyTasks, pendingMainIds]);

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

  const handleOpenPending = () => {
    setSearch("");
    setCollapsedMain((previous) => ({ ...previous, ...Object.fromEntries(Array.from(pendingMainIds).map((id) => [id, false])) }));
    setCollapsedWeekly((previous) => ({ ...previous, ...Object.fromEntries(mainTasks.flatMap((main) =>
      (main.weekly_tasks || main.weekly_plans || []).filter((weekly: any) => weekly.status === "PENDING_APPROVAL")
        .map((weekly: any) => [String(weekly.id), false]))) }));
  };

  return (
    <div id="project-weekly-approval" tabIndex={-1} className="flex min-w-0 scroll-mt-24 flex-col gap-4 focus:outline-none">
      <div className="rounded-2xl border border-text-tertiary bg-white p-4 shadow-sm">
        <label htmlFor="wbs-search" className="block text-sm font-bold text-text-primary">Cari dalam struktur pekerjaan</label>
        <p className="mt-1 mb-3 text-xs text-text-secondary">Cari tugas, target, divisi, atau anggota dalam paket kerja lengkap.</p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-text-secondary" aria-hidden="true" />
          <input id="wbs-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari tugas, target, atau anggota…" className="h-10 w-full min-w-0 rounded-xl border border-text-tertiary bg-gray-50 pl-9 pr-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-green/40" />
        </div>
        <p role="status" className="mt-2 text-xs text-text-secondary">{visibleMainTasks.length} dari {mainTasks.length} paket kerja{query ? " cocok · Hierarki hasil dibuka otomatis" : " · Main Task → Weekly Plan → Daily Task"}</p>
      </div>
      {/* WBS Action Toolbar & Global Expand/Collapse controls */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 pb-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-bold text-text-primary">
            Main Task → Weekly Plan → Daily Task
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {canReviewWeeklyTasks && pendingWeeklyCount > 0 && (
            <button type="button" onClick={handleOpenPending} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">
              {pendingWeeklyCount} Target Menunggu Approval
            </button>
          )}
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

          {canManageWbs && (
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
            {canManageWbs
              ? "Klik tombol + Tambah Main Task untuk membuat paket kerja WBS tingkat 1."
              : "Menunggu Project Manager (PM) untuk membuat paket kerja WBS Main Task."}
          </p>
          {canManageWbs && (
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
          {visibleMainTasks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-text-tertiary bg-gray-50 p-8 text-center">
              <Search size={24} className="mx-auto mb-2 text-text-secondary" />
              <p className="text-sm font-semibold text-text-primary">Tidak ada paket kerja yang cocok</p>
              <button type="button" onClick={() => setSearch("")} className="btn-secondary mt-3 text-xs">Hapus pencarian</button>
            </div>
          )}
          {visibleMainTasks.map((main) => (
            <ProjectWbsNode
              key={main.id}
              main={main}
              focusWeeklyId={focusWeeklyId}
              isExpanded={isMainExpanded(String(main.id))}
              onToggleExpand={() => handleToggleMain(String(main.id))}
              collapsedWeeklyTasks={collapsedWeekly}
              onToggleWeekly={handleToggleWeekly}
              isPM={isPM}
              canManageWbs={canManageWbs}
              canAssignTeam={canAssignTeam}
              canManageWeeklyTasks={canManageWeeklyTasks}
              canReviewWeeklyTasks={canReviewWeeklyTasks}
              onReviewWeeklyTask={async (id, decision) => {
                // Keep the reviewed branch open when its last pending target becomes active.
                setCollapsedMain((previous) => ({ ...previous, [String(main.id)]: false }));
                await onReviewWeeklyTask(id, decision);
              }}
              currentUserId={currentUserId}
              userRole={userRole}
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

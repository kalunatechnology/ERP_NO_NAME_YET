"use client";

import React from "react";
import {
  ChevronRight, UserCheck, Plus, Trash2, Check, Edit, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectWbsSummary } from "./ProjectWbsSummary";

interface ProjectWbsNodeProps {
  main: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  collapsedWeeklyTasks: Record<string, boolean>;
  onToggleWeekly: (weeklyId: string) => void;
  isPM: boolean;
  canManageWbs: boolean;
  canAssignTeam: boolean;
  canManageWeeklyTasks: boolean;
  currentUserId: string;
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

export function ProjectWbsNode({
  main,
  isExpanded,
  onToggleExpand,
  collapsedWeeklyTasks,
  onToggleWeekly,
  isPM,
  canManageWbs,
  canAssignTeam,
  canManageWeeklyTasks,
  currentUserId,
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
}: ProjectWbsNodeProps) {
  const weeklyPlans = main.weekly_tasks || main.weekly_plans || [];

  // Calculate totals for summary pill
  let totalDailies = 0;
  let completedDailies = 0;
  weeklyPlans.forEach((w: any) => {
    const dailies = w.daily_tasks || [];
    totalDailies += dailies.length;
    completedDailies += dailies.filter((d: any) => ["COMPLETED", "DONE"].includes((d.status || "").toUpperCase())).length;
  });

  const canCreateWeekly = canManageWeeklyTasks;

  return (
    <div className="card rounded-2xl border border-text-tertiary overflow-hidden shadow-xs bg-white transition-all duration-200 hover:border-gray-300">
      {/* Level 1 Header: Main Task */}
      <div className="p-3.5 sm:p-4 bg-gray-50/90 border-b border-text-tertiary flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 rounded-lg hover:bg-gray-200/80 text-text-secondary transition-colors"
            title={isExpanded ? "Tutup paket kerja" : "Buka paket kerja"}
          >
            <ChevronRight
              size={18}
              className={cn(
                "transform transition-transform duration-200 ease-out text-[#2649B3]",
                isExpanded ? "rotate-90" : "rotate-0"
              )}
            />
          </button>
          <div className="w-8 h-8 rounded-xl bg-brand-deep-green text-white flex items-center justify-center text-xs font-black shadow-2xs flex-shrink-0">
            {main.weight || 10}%
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-text-primary truncate">{main.name || main.title}</h3>
              <span className="badge badge-info text-2xs">{main.status}</span>
              <span className="badge text-2xs bg-amber-50 text-amber-700 border border-amber-200">Bobot {main.weight || 10}%</span>
              {main.cost_owner_division_name && (
                <span className="badge text-2xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Divisi Biaya: {main.cost_owner_division_name}
                </span>
              )}
            </div>
            <p className="text-2xs text-text-secondary mt-0.5 line-clamp-1">
              {main.description || "Tidak ada catatan deskripsi paket kerja."}
            </p>

            {/* If collapsed, show the compact summary pill right away */}
            {!isExpanded && (
              <div className="mt-1.5">
                <ProjectWbsSummary
                  weeklyCount={weeklyPlans.length}
                  dailyCount={totalDailies}
                  completedDailyCount={completedDailies}
                  progressPercent={totalDailies > 0 ? (completedDailies / totalDailies) * 100 : 0}
                  weightPercent={main.weight || 10}
                  compact={true}
                />
              </div>
            )}

            {main.assignments && main.assignments.length > 0 && isExpanded && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-3xs font-bold text-text-secondary uppercase">Tim ditugaskan:</span>
                {main.assignments.map((a: any) => (
                  <span key={a.id} className="badge bg-indigo-50 text-indigo-800 border border-indigo-200 text-2xs flex items-center gap-1 font-semibold">
                    <span>{a.assignee_name || a.user_name}</span>
                    {canAssignTeam && (
                      <button
                        onClick={() => onRemoveAssignment(main, a.id)}
                        className="hover:text-red-600 font-bold ml-1 text-xs"
                        title="Hapus penugasan (Wewenang PM)"
                      >
                        &times;
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {canAssignTeam && (
            <button
              onClick={() => onAssignClick(main)}
              className="btn-outline py-1 px-2.5 text-2xs gap-1 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
              title="Delegasikan paket kerja ke anggota tim"
            >
              <UserCheck size={12} /> + Assign Tim
            </button>
          )}

          {canCreateWeekly && (
            <button
              onClick={() => onCreateWeeklyClick(main)}
              className="btn-outline py-1 px-2.5 text-2xs gap-1 text-brand-deep-green border-brand-green/40 hover:bg-brand-light-green"
            >
              <Plus size={12} /> + Target Mingguan
            </button>
          )}

          {canManageWbs && (
            <button
              onClick={() => onDeleteMainTask(main.id, main.name || main.title)}
              className="p-1 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50"
              title="Hapus Main Task (Hanya PM)"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Level 2 & 3: Weekly Plans List */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
        )}
      >
        <div className="overflow-hidden">
          <div className="p-3 flex flex-col gap-3 bg-white">
            {weeklyPlans.length === 0 ? (
              <div className="p-5 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center">
                <p className="text-xs text-text-secondary">
                  Belum ada Target Mingguan pada Main Task ini. {canCreateWeekly ? "Klik + Target Mingguan untuk mendelegasikan sprint mingguan tim." : "Menunggu PM membuat dan menugaskan target mingguan."}
                </p>
              </div>
            ) : (
              weeklyPlans.map((weekly: any) => {
                const dailyTasks = weekly.daily_tasks || [];
                const isWeeklyExpanded = !collapsedWeeklyTasks[String(weekly.id)];
                const isWeeklyPic = String(weekly.assignee_id || weekly.assignee || "") === String(currentUserId);
                const canCreateDaily = !isPM && isWeeklyPic;

                return (
                  <div key={weekly.id} className="rounded-xl border border-indigo-100 overflow-hidden bg-white shadow-xs transition-all duration-200">
                    {/* Level 2 Header: Weekly Target */}
                    <div className="p-2.5 sm:p-3 bg-indigo-50/60 border-b border-indigo-100 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onToggleWeekly(String(weekly.id))}
                          className="p-1 rounded hover:bg-indigo-100 text-indigo-700 transition-colors"
                          title={isWeeklyExpanded ? "Tutup target mingguan" : "Buka target mingguan"}
                        >
                          <ChevronRight
                            size={15}
                            className={cn(
                              "transform transition-transform duration-200 ease-out",
                              isWeeklyExpanded ? "rotate-90" : "rotate-0"
                            )}
                          />
                        </button>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-2xs font-extrabold">
                          Minggu #{weekly.week_number}
                        </span>
                        <strong className="text-xs text-indigo-950 font-bold">{weekly.target_description || "Target Mingguan"}</strong>
                        <span className="text-2xs text-text-secondary">
                          (PIC: <b>{weekly.assignee_name || "Assignee"}</b>)
                        </span>
                        {weekly.start_date && (
                          <span className="text-2xs text-text-secondary">{weekly.start_date} s/d {weekly.end_date || "-"}</span>
                        )}
                        <span className="text-2xs text-indigo-700 font-semibold ml-1">
                          · {dailyTasks.length} task
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="badge badge-success text-2xs font-bold">
                          {weekly.status} ({weekly.progress}%)
                        </span>

                        {canCreateDaily && (
                          <button
                            onClick={() => onCreateDailyClick(weekly)}
                            className="btn-primary py-0.5 px-2.5 text-2xs gap-1 bg-brand-green hover:bg-brand-deep-green"
                          >
                            <Plus size={11} /> Daily Task
                          </button>
                        )}

                        {canManageWeeklyTasks && (
                          <button
                            onClick={() => onDeleteWeeklyTask(weekly.id, weekly.week_number)}
                            className="p-1 rounded text-text-secondary hover:text-red-600"
                            title="Hapus Target Mingguan (PM / OM)"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Level 3: Daily Tasks Table */}
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                        isWeeklyExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="p-3 bg-white">
                          {dailyTasks.length === 0 ? (
                            <div className="p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center text-xs text-text-secondary">
                              Belum ada aktivitas harian pada target ini. {canCreateDaily ? "Klik + Daily Task untuk mencatat sesi kerja." : ""}
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-[18px] border border-gray-200 bg-white">
                              <table className="w-full min-w-[920px] table-fixed text-left">
                                <thead>
                                  <tr className="border-b border-gray-200 bg-[#F8F9FB] text-[11px] uppercase tracking-[0.04em] text-[#55585F]">
                                    <th className="w-[17%] px-4 py-3.5 font-bold">Tanggal & Waktu</th>
                                    <th className="w-[31%] px-4 py-3.5 font-bold">Aktivitas / Task</th>
                                    <th className="w-[27%] px-4 py-3.5 font-bold">Output Hasil</th>
                                    <th className="w-[17%] px-4 py-3.5 font-bold">Status</th>
                                    <th className="w-[8%] px-4 py-3.5 text-right font-bold">Aksi</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dailyTasks.map((daily: any) => {
                                    const normalizedStatus = String(daily.status || "IN_PROGRESS").toUpperCase();
                                    const isDone = normalizedStatus === "COMPLETED" || normalizedStatus === "DONE";
                                    const isBlocked = daily.is_blocked || normalizedStatus === "BLOCKED";
                                    const isDailyOwner = String(daily.owner_id || daily.owner || "") === String(currentUserId);
                                    const canManageDaily = isDailyOwner;
                                    const canDeleteDaily = isDailyOwner;
                                    const canTransferDaily = isDailyOwner;

                                    return (
                                      <tr
                                        key={daily.id}
                                        className={cn(
                                          "border-b border-gray-100 last:border-b-0 transition-colors hover:bg-[#F8FBFF]",
                                          isBlocked && "bg-red-50/40"
                                        )}
                                      >
                                        <td className="px-4 py-4 align-top">
                                          <div className="text-[13px] font-bold leading-5 text-[#17191C]">
                                            {daily.planned_date || "-"}
                                          </div>
                                          <div className="mt-0.5 text-[11px] font-medium text-[#6B6F76]">
                                            {daily.time_slot || "Waktu belum diatur"}
                                          </div>
                                        </td>

                                        <td className="px-4 py-4 align-top">
                                          <div className="flex min-w-0 items-start gap-2.5">
                                            <button
                                              type="button"
                                              onClick={() => onToggleDailyStatus(daily, canManageDaily)}
                                              disabled={!canManageDaily}
                                              className={cn(
                                                "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-all",
                                                isDone
                                                  ? "border-[#3157C8] bg-[#3157C8] text-white"
                                                  : "border-gray-300 bg-white",
                                                canManageDaily
                                                  ? "hover:border-[#3157C8]"
                                                  : "cursor-default opacity-70"
                                              )}
                                              title={!canManageDaily ? "Hanya PIC yang dapat mengubah status" : (isDone ? "Tandai belum selesai" : "Tandai selesai")}
                                            >
                                              {isDone && <Check size={12} strokeWidth={3} />}
                                            </button>
                                            <div className="min-w-0">
                                              <div
                                                className={cn(
                                                  "break-words text-[13px] font-bold leading-5 text-[#111318]",
                                                  isDone && "text-[#666A71] line-through"
                                                )}
                                              >
                                                {daily.title || daily.activity_input || "Aktivitas harian"}
                                              </div>
                                              <div className="mt-1 text-[11px] text-[#6B6F76]">
                                                PIC: <span className="font-semibold text-[#4B4F56]">{daily.owner_name || "Belum ditentukan"}</span>
                                              </div>
                                            </div>
                                          </div>
                                        </td>

                                        <td className="px-4 py-4 align-top">
                                          <div className="break-words text-[13px] leading-5 text-[#294BB2]">
                                            {daily.output_result || <span className="italic text-[#9A9DA3]">Belum ada output</span>}
                                          </div>
                                          {isBlocked && (
                                            <div className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold leading-4 text-red-700">
                                              Kendala: {daily.block_reason || "Terkendala"}
                                            </div>
                                          )}
                                          {!isBlocked && daily.notes && (
                                            <div className="mt-1.5 text-[11px] leading-4 text-[#777B82]">
                                              Catatan: {daily.notes}
                                            </div>
                                          )}
                                        </td>

                                        <td className="px-4 py-4 align-top">
                                          <span
                                            className={cn(
                                              "inline-flex max-w-full items-center rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap",
                                              isDone
                                                ? "bg-[#EAF6FF] text-[#3157C8]"
                                                : isBlocked
                                                  ? "bg-red-100 text-red-700"
                                                  : "bg-[#DCEEFF] text-[#2854BF]"
                                            )}
                                          >
                                            {normalizedStatus} ({Number(daily.progress ?? (isDone ? 100 : 0))}%)
                                          </span>
                                        </td>

                                        <td className="px-4 py-4 align-top">
                                          <div className="flex items-center justify-end gap-1">
                                            {canManageDaily ? (
                                              <button
                                                type="button"
                                                onClick={() => onEditDailyClick(daily)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4F5050] transition-colors hover:bg-[#EAF6FF] hover:text-[#294BB2]"
                                                title="Update Daily Task"
                                              >
                                                <Edit size={15} />
                                              </button>
                                            ) : (
                                              <span className="text-[10px] font-semibold text-[#9A9DA3]">View only</span>
                                            )}

                                            {canTransferDaily && (
                                              <button
                                                type="button"
                                                onClick={() => onTransferDailyClick(daily)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-50"
                                                title="Ajukan alih tugas"
                                              >
                                                <RefreshCw size={14} />
                                              </button>
                                            )}

                                            {canDeleteDaily && (
                                              <button
                                                type="button"
                                                onClick={() => onDeleteDailyTask(daily.id, daily.title || daily.activity_input)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#777B82] transition-colors hover:bg-red-50 hover:text-red-600"
                                                title="Hapus Daily Task"
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

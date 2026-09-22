"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Filter,
  FolderKanban,
  UserRound,
} from "lucide-react";
import type { DailyTask, Project } from "@/lib/api/project.api";
import { cn, normalizeDateKey } from "@/lib/utils";

type DailyTaskRecord = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  mainTaskName: string;
  weekNumber: number;
  ownerId: string;
  ownerName: string;
  plannedDate: string;
  timeSlot: string;
  task: DailyTask;
};

function statusClass(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "COMPLETED" || normalized === "DONE") {
    return "bg-[#EAF6FF] text-[#3157C8]";
  }
  if (normalized === "BLOCKED") {
    return "bg-red-100 text-red-700";
  }
  return "bg-[#DCEEFF] text-[#2854BF]";
}

export function ExecutiveDailyTaskMonitor({ projects }: { projects: Project[] }) {
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [selectedProjectId, setSelectedProjectId] = useState("all");

  const records = useMemo<DailyTaskRecord[]>(() => {
    const rows: DailyTaskRecord[] = [];

    projects.forEach((project) => {
      (project.main_tasks || []).forEach((mainTask) => {
        (mainTask.weekly_tasks || mainTask.weekly_plans || []).forEach((weeklyTask) => {
          (weeklyTask.daily_tasks || []).forEach((task) => {
            const ownerId = String(task.owner_id || "");
            rows.push({
              id: String(task.id),
              projectId: String(project.id),
              projectCode: project.project_code || project.code || "PROJECT",
              projectName: project.project_name || project.name || "Project",
              mainTaskName: mainTask.name || mainTask.title || "Main Task",
              weekNumber: Number(weeklyTask.week_number || 1),
              ownerId,
              ownerName: task.owner_name || "Member",
              plannedDate: normalizeDateKey(task.planned_date) || "",
              timeSlot: task.time_slot || "",
              task,
            });
          });
        });
      });
    });

    return rows.sort((a, b) => {
      const dateCompare = b.plannedDate.localeCompare(a.plannedDate);
      if (dateCompare !== 0) return dateCompare;
      return a.projectName.localeCompare(b.projectName);
    });
  }, [projects]);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((row) => {
      if (row.ownerId) map.set(row.ownerId, row.ownerName);
    });
    return Array.from(map, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const projectOptions = useMemo(() => {
    const projectIdsWithDailyTasks = new Set(records.map((row) => row.projectId));
    return projects
      .filter((project) => projectIdsWithDailyTasks.has(String(project.id)))
      .map((project) => ({
        id: String(project.id),
        code: project.project_code || project.code || "PROJECT",
        name: project.project_name || project.name || "Project",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, records]);

  const filteredRecords = useMemo(
    () => records.filter((row) => {
      const userMatches = selectedUserId === "all" || row.ownerId === selectedUserId;
      const projectMatches = selectedProjectId === "all" || row.projectId === selectedProjectId;
      return userMatches && projectMatches;
    }),
    [records, selectedProjectId, selectedUserId],
  );

  const completedCount = filteredRecords.filter((row) =>
    ["COMPLETED", "DONE"].includes(String(row.task.status || "").toUpperCase())
  ).length;
  const blockedCount = filteredRecords.filter((row) =>
    row.task.is_blocked || String(row.task.status || "").toUpperCase() === "BLOCKED"
  ).length;

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#D9D9D9] bg-white shadow-xs">
      <div className="border-b border-[#E5E7EB] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF6FF] text-[#294BB2]">
                <CalendarDays size={18} />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-[#111318]">Daily Task Staff</h2>
                <p className="mt-0.5 text-xs text-[#6B6F76]">
                  Monitoring aktivitas harian staf lintas proyek. Tampilan Executive bersifat read-only.
                </p>
              </div>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto xl:min-w-[560px]">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#777B82]">
                <UserRound size={12} /> User / Staff
              </span>
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="h-10 min-w-0 rounded-xl border border-[#D9D9D9] bg-white px-3 text-xs font-semibold text-[#292B30] outline-none transition focus:border-[#294BB2] focus:ring-2 focus:ring-[#DCEEFF]"
              >
                <option value="all">Semua Staff</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#777B82]">
                <FolderKanban size={12} /> Project
              </span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="h-10 min-w-0 rounded-xl border border-[#D9D9D9] bg-white px-3 text-xs font-semibold text-[#292B30] outline-none transition focus:border-[#294BB2] focus:ring-2 focus:ring-[#DCEEFF]"
              >
                <option value="all">Semua Project</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F6F8] px-3 py-1.5 font-bold text-[#4F5050]">
            <Filter size={12} /> {filteredRecords.length} task terlihat
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF6FF] px-3 py-1.5 font-bold text-[#3157C8]">
            <CheckCircle2 size={12} /> {completedCount} selesai
          </span>
          {blockedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 font-bold text-red-700">
              <AlertTriangle size={12} /> {blockedCount} terkendala
            </span>
          )}
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <CalendarDays size={28} className="mx-auto text-[#B6BAC1]" />
          <p className="mt-3 text-sm font-bold text-[#4F5050]">Tidak ada Daily Task untuk filter ini.</p>
          <p className="mt-1 text-xs text-[#8A8E95]">Pilih user atau project lain untuk melihat aktivitas.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left">
            <thead>
              <tr className="border-b border-[#E1E4E8] bg-[#F8F9FB] text-[11px] uppercase tracking-[0.04em] text-[#55585F]">
                <th className="w-[19%] px-5 py-3.5 font-bold">Project & WBS</th>
                <th className="w-[14%] px-4 py-3.5 font-bold">Staff</th>
                <th className="w-[14%] px-4 py-3.5 font-bold">Tanggal & Waktu</th>
                <th className="w-[23%] px-4 py-3.5 font-bold">Aktivitas / Task</th>
                <th className="w-[19%] px-4 py-3.5 font-bold">Output Hasil</th>
                <th className="w-[11%] px-4 py-3.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row) => {
                const status = String(row.task.status || "IN_PROGRESS").toUpperCase();
                const isDone = status === "COMPLETED" || status === "DONE";
                const isBlocked = row.task.is_blocked || status === "BLOCKED";

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-[#ECEEF1] last:border-b-0 transition-colors hover:bg-[#F8FBFF]",
                      isBlocked && "bg-red-50/30"
                    )}
                  >
                    <td className="px-5 py-4 align-top">
                      <div className="inline-flex rounded-full bg-[#EAF6FF] px-2.5 py-1 text-[10px] font-extrabold text-[#294BB2]">
                        {row.projectCode}
                      </div>
                      <div className="mt-1.5 break-words text-[13px] font-extrabold leading-5 text-[#111318]">
                        {row.projectName}
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-[#777B82]">
                        {row.mainTaskName} · W#{row.weekNumber}
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#55585F]">
                          <UserRound size={13} />
                        </div>
                        <span className="break-words text-[12px] font-bold leading-5 text-[#292B30]">
                          {row.ownerName}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="text-[13px] font-bold text-[#17191C]">{row.plannedDate || "-"}</div>
                      <div className="mt-0.5 text-[11px] font-medium text-[#777B82]">{row.timeSlot || "-"}</div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className={cn(
                        "break-words text-[13px] font-bold leading-5 text-[#111318]",
                        isDone && "text-[#666A71] line-through"
                      )}>
                        {row.task.title || row.task.activity_input || "Aktivitas harian"}
                      </div>
                      {row.task.notes && !isBlocked && (
                        <div className="mt-1 text-[11px] leading-4 text-[#777B82]">
                          Catatan: {row.task.notes}
                        </div>
                      )}
                      {isBlocked && (
                        <div className="mt-1.5 text-[11px] font-semibold leading-4 text-red-700">
                          Kendala: {row.task.block_reason || "Terkendala"}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="break-words text-[13px] leading-5 text-[#294BB2]">
                        {row.task.output_result || <span className="italic text-[#9A9DA3]">Belum ada output</span>}
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <span className={cn(
                        "inline-flex rounded-full px-3 py-1 text-[10px] font-extrabold whitespace-nowrap",
                        statusClass(status)
                      )}>
                        {status} ({Number(row.task.progress ?? (isDone ? 100 : 0))}%)
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Search, Target, UserRound } from "lucide-react";
import type { Project, WeeklyTask } from "@/lib/api/project.api";
import { cn, formatDate, localDateKey, normalizeDateKey } from "@/lib/utils";

type WeeklyTargetState = "ALL" | "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "ATTENTION";

type WeeklyTargetRecord = {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  mainTaskName: string;
  assigneeId: string;
  assigneeName: string;
  startDate: string;
  endDate: string;
  progress: number;
  dailyCount: number;
  completedDailyCount: number;
  hasBlockedDaily: boolean;
  weeklyTask: WeeklyTask;
};

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function recordState(record: WeeklyTargetRecord, today: string): Exclude<WeeklyTargetState, "ALL"> {
  const status = String(record.weeklyTask.status || "").toUpperCase();
  if (record.progress >= 100 || ["COMPLETED", "DONE"].includes(status)) return "COMPLETED";
  if (record.hasBlockedDaily || Boolean(record.endDate && record.endDate < today)) return "ATTENTION";
  if (record.progress > 0 || ["IN_PROGRESS", "ON_PROGRESS", "ACTIVE", "STARTED"].includes(status)) return "IN_PROGRESS";
  return "NOT_STARTED";
}

function statusPresentation(state: Exclude<WeeklyTargetState, "ALL">) {
  if (state === "COMPLETED") return { label: "Selesai", className: "bg-[#E8F8EC] text-[#237A3B]" };
  if (state === "ATTENTION") return { label: "Perlu Dipantau", className: "bg-[#FFF0F0] text-[#B42318]" };
  if (state === "IN_PROGRESS") return { label: "Berjalan", className: "bg-[#EAF6FF] text-[#3157C8]" };
  return { label: "Belum Mulai", className: "bg-[#F1F2F4] text-[#5A5B5D]" };
}

export function ExecutiveWeeklyTargetMonitor({ projects, loading = false }: { projects: Project[]; loading?: boolean }) {
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [selectedState, setSelectedState] = useState<WeeklyTargetState>("ALL");
  const [search, setSearch] = useState("");
  const today = localDateKey();

  const records = useMemo<WeeklyTargetRecord[]>(() => {
    const result: WeeklyTargetRecord[] = [];

    projects.forEach((project) => {
      const projectId = String(project.id);
      const projectCode = project.project_code || project.code || "PROJECT";
      const projectName = project.project_name || project.name || "Project";

      (project.main_tasks || []).forEach((mainTask) => {
        (mainTask.weekly_tasks || mainTask.weekly_plans || []).forEach((weeklyTask) => {
          const dailyTasks = weeklyTask.daily_tasks || [];
          const completedDailyCount = dailyTasks.filter((task) =>
            ["COMPLETED", "DONE"].includes(String(task.status || "").toUpperCase())
          ).length;
          const derivedProgress = dailyTasks.length
            ? Math.round((completedDailyCount / dailyTasks.length) * 100)
            : Number(weeklyTask.progress || 0);
          const assigneeId = String(weeklyTask.assignee_id || "");
          const assignmentName = (mainTask.assignments || []).find((assignment) =>
            String(assignment.assignee_id ?? assignment.assignee ?? "") === assigneeId
          )?.assignee_name;
          const dailyOwnerName = dailyTasks.find((task) => task.owner_name)?.owner_name;

          result.push({
            id: String(weeklyTask.id),
            code: `${projectCode} · W#${weeklyTask.week_number || 1}`,
            projectId,
            projectCode,
            projectName,
            mainTaskName: mainTask.name || mainTask.title || "Main Task",
            assigneeId,
            assigneeName: weeklyTask.assignee_name || assignmentName || dailyOwnerName || "Belum ditentukan",
            startDate: normalizeDateKey(weeklyTask.start_date) || "",
            endDate: normalizeDateKey(weeklyTask.end_date) || "",
            progress: clampProgress(derivedProgress),
            dailyCount: dailyTasks.length,
            completedDailyCount,
            hasBlockedDaily: dailyTasks.some((task) =>
              Boolean(task.is_blocked) || String(task.status || "").toUpperCase() === "BLOCKED"
            ),
            weeklyTask,
          });
        });
      });
    });

    return result.sort((a, b) =>
      a.assigneeName.localeCompare(b.assigneeName) ||
      a.projectName.localeCompare(b.projectName) ||
      a.code.localeCompare(b.code)
    );
  }, [projects]);

  const users = useMemo(() => {
    const values = new Map<string, string>();
    records.forEach((record) => {
      const key = record.assigneeId || `name:${record.assigneeName}`;
      values.set(key, record.assigneeName);
    });
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const projectOptions = useMemo(() => {
    const values = new Map<string, string>();
    records.forEach((record) => values.set(record.projectId, record.projectName));
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const scopedRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return records.filter((record) => {
      const userKey = record.assigneeId || `name:${record.assigneeName}`;
      if (selectedUserId !== "all" && userKey !== selectedUserId) return false;
      if (selectedProjectId !== "all" && record.projectId !== selectedProjectId) return false;
      if (!query) return true;
      return [record.code, record.projectCode, record.projectName, record.mainTaskName, record.assigneeName, record.weeklyTask.target_description, record.weeklyTask.target_output]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("id-ID").includes(query));
    });
  }, [records, search, selectedProjectId, selectedUserId]);

  const counts = useMemo(() => ({
    ALL: scopedRecords.length,
    COMPLETED: scopedRecords.filter((record) => recordState(record, today) === "COMPLETED").length,
    IN_PROGRESS: scopedRecords.filter((record) => recordState(record, today) === "IN_PROGRESS").length,
    NOT_STARTED: scopedRecords.filter((record) => recordState(record, today) === "NOT_STARTED").length,
    ATTENTION: scopedRecords.filter((record) => recordState(record, today) === "ATTENTION").length,
  }), [scopedRecords, today]);

  const filteredRecords = useMemo(() => selectedState === "ALL"
    ? scopedRecords
    : scopedRecords.filter((record) => recordState(record, today) === selectedState),
  [scopedRecords, selectedState, today]);

  const averageProgress = scopedRecords.length
    ? Math.round(scopedRecords.reduce((sum, record) => sum + record.progress, 0) / scopedRecords.length)
    : 0;

  const filters: { id: WeeklyTargetState; label: string }[] = [
    { id: "ALL", label: "Semua" },
    { id: "IN_PROGRESS", label: "Berjalan" },
    { id: "COMPLETED", label: "Selesai" },
    { id: "NOT_STARTED", label: "Belum Mulai" },
    { id: "ATTENTION", label: "Perlu Dipantau" },
  ];

  return (
    <section className="rounded-[24px] border border-[#D9D9D9] bg-white px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#EAF6FF] text-[#3157C8]"><Target size={23} /></span>
            <div>
              <h2 className="text-[28px] font-bold leading-none tracking-[-0.025em] text-black sm:text-[34px]">Weekly Target Staff</h2>
              <p className="mt-2 text-sm text-[#5A5B5D]">Pantau target mingguan dan progres aktual setiap karyawan.</p>
            </div>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-[650px] lg:grid-cols-3">
          <label className="relative">
            <span className="sr-only">Filter staf</span>
            <UserRound size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#3157C8]" />
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[#BDD7FF] bg-white pl-10 pr-3 text-xs font-semibold text-[#3157C8] outline-none focus:ring-2 focus:ring-[#DCEEFF]">
              <option value="all">Semua Staff</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter proyek</span>
            <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[#BDD7FF] bg-white px-4 text-xs font-semibold text-[#3157C8] outline-none focus:ring-2 focus:ring-[#DCEEFF]">
              <option value="all">Semua Project</option>
              {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="relative sm:col-span-2 lg:col-span-1">
            <span className="sr-only">Cari Weekly Target</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari target atau kode" className="h-11 w-full rounded-xl border border-[#BDD7FF] bg-white px-4 pr-10 text-xs outline-none placeholder:text-[#7280A7] focus:ring-2 focus:ring-[#DCEEFF]" />
            <Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#3157C8]" />
          </label>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard value={counts.ALL} label="Total Weekly Target" tone="neutral" />
        <SummaryCard value={`${averageProgress}%`} label="Rata-rata Progress" tone="blue" />
        <SummaryCard value={counts.COMPLETED} label="Target Selesai" tone="green" />
        <SummaryCard value={counts.ATTENTION} label="Perlu Dipantau" tone="red" />
      </div>

      <div className="mt-5 flex max-w-full items-center gap-2 overflow-x-auto pb-1" aria-label="Filter status Weekly Target">
        {filters.map((filter) => (
          <button key={filter.id} type="button" onClick={() => setSelectedState(filter.id)} aria-pressed={selectedState === filter.id} className={cn(
            "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#BDD7FF]",
            selectedState === filter.id ? "bg-[#3157C8] text-white shadow-sm" : "bg-[#F1F2F4] text-[#4F5050] hover:bg-[#E4E8F0]"
          )}>
            {filter.label} ({counts[filter.id]})
          </button>
        ))}
      </div>

      <div className="mt-7 overflow-hidden rounded-[14px] border border-[#D9D9D9]">
        <div className="max-h-[620px] overflow-auto overscroll-contain">
          <table className="w-full min-w-[1050px] text-left">
            <thead className="sticky top-0 z-10 bg-[#F5F5F5]">
              <tr className="h-12 text-xs font-bold uppercase tracking-[0.03em] text-[#4F5050]">
                <th className="w-[160px] px-4">Kode Target</th>
                <th className="min-w-[260px] px-4">Project & Weekly Target</th>
                <th className="w-[180px] px-4">Assigned Staff</th>
                <th className="w-[170px] px-4">Periode</th>
                <th className="w-[220px] px-4">Progress</th>
                <th className="w-[140px] px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, index) => <LoadingRow key={index} />) : filteredRecords.length === 0 ? (
                <tr><td colSpan={6} className="h-56 px-6 text-center"><CalendarDays size={32} className="mx-auto text-[#AEB2B8]" /><p className="mt-3 text-sm font-bold text-[#4F5050]">Tidak ada Weekly Target untuk filter ini.</p><p className="mt-1 text-xs text-[#8A8E95]">Ubah filter staf, proyek, status, atau pencarian.</p></td></tr>
              ) : filteredRecords.map((record) => {
                const state = recordState(record, today);
                const status = statusPresentation(state);
                return (
                  <tr key={record.id} className="border-t border-[#ECEDEF] align-middle transition-colors hover:bg-[#F7FAFF]">
                    <td className="px-4 py-5"><span className="inline-flex rounded-lg bg-[#EAF6FF] px-2.5 py-1.5 text-xs font-extrabold text-[#3157C8]">{record.code}</span></td>
                    <td className="px-4 py-5"><p className="text-sm font-bold text-[#111318]">{record.projectName}</p><p className="mt-1 text-xs font-semibold text-[#4F5050]">{record.mainTaskName}</p><p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#777B82]">{record.weeklyTask.target_description || record.weeklyTask.target_output || "Target mingguan belum memiliki deskripsi."}</p></td>
                    <td className="px-4 py-5"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#3157C8]"><UserRound size={15} /></span><span className="text-xs font-semibold text-[#292B30]">{record.assigneeName}</span></div></td>
                    <td className="px-4 py-5 text-xs text-[#4F5050]"><p>{record.startDate ? formatDate(record.startDate) : "-"}</p><p className="my-1 text-[10px] text-[#9A9DA3]">sampai</p><p>{record.endDate ? formatDate(record.endDate) : "-"}</p></td>
                    <td className="px-4 py-5"><div className="flex items-center justify-between gap-3"><span className="text-xs text-[#5A5B5D]">{record.completedDailyCount}/{record.dailyCount} Daily Task</span><strong className="text-sm text-[#3157C8]">{record.progress}%</strong></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#E7EAF0]" role="progressbar" aria-label={`Progress ${record.code}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={record.progress}><div className={cn("h-full rounded-full transition-all", state === "COMPLETED" ? "bg-[#37A451]" : state === "ATTENTION" ? "bg-[#E14B4B]" : "bg-[#3157C8]")} style={{ width: `${record.progress}%` }} /></div></td>
                    <td className="px-4 py-5"><span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold", status.className)}>{state === "COMPLETED" ? <CheckCircle2 size={13} /> : state === "ATTENTION" ? <AlertTriangle size={13} /> : null}{status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ value, label, tone }: { value: number | string; label: string; tone: "neutral" | "blue" | "green" | "red" }) {
  const styles = {
    neutral: "border-[#D9D9D9] bg-[#FAFAFA] text-[#111318]",
    blue: "border-[#BDD7FF] bg-[#F4F8FF] text-[#3157C8]",
    green: "border-[#BFE8C9] bg-[#F2FFF5] text-[#237A3B]",
    red: "border-[#F5C2C2] bg-[#FFF5F5] text-[#B42318]",
  }[tone];
  return <div className={cn("rounded-[16px] border px-4 py-4 text-center", styles)}><p className="text-[26px] font-extrabold leading-none">{value}</p><p className="mt-2 text-xs font-semibold">{label}</p></div>;
}

function LoadingRow() {
  return <tr className="h-[112px] border-t border-[#ECEDEF]"><td className="px-4"><div className="h-7 w-28 animate-pulse rounded-lg bg-[#E6E8EB]" /></td><td className="px-4"><div className="h-4 w-2/3 animate-pulse rounded bg-[#E6E8EB]" /><div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-[#EEF0F2]" /></td><td className="px-4"><div className="h-8 w-32 animate-pulse rounded bg-[#EEF0F2]" /></td><td className="px-4"><div className="h-9 w-24 animate-pulse rounded bg-[#EEF0F2]" /></td><td className="px-4"><div className="h-3 w-full animate-pulse rounded bg-[#E6E8EB]" /></td><td className="px-4"><div className="h-7 w-24 animate-pulse rounded bg-[#EEF0F2]" /></td></tr>;
}

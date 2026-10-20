"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Search, Target, UserRound, ChevronDown, ChevronRight, X } from "lucide-react";
import type { Project } from "@/lib/api/project.api";
import { cn, formatDate, localDateKey } from "@/lib/utils";
import { weeklyTargetRecords } from "@/lib/weekly-dashboard";
import { filterWeeklyTargets, WEEKLY_GROUPS, weeklyGroup, type WeeklyGroupId } from "@/lib/tasks/weekly-management";
import { useWeeklyPeriodFilter } from "@/components/tasks/useWeeklyPeriodFilter";

type WeeklyTargetState = "ALL" | WeeklyGroupId;

function statusPresentation(state: WeeklyGroupId) {
  const group = WEEKLY_GROUPS.find((item) => item.id === state)!;
  return { label: group.label, style: { backgroundColor: group.soft, color: group.color } };
}

export function ExecutiveWeeklyTargetMonitor({ projects, loading = false }: { projects: Project[]; loading?: boolean }) {
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [selectedState, setSelectedState] = useState<WeeklyTargetState>("ALL");
  const [search, setSearch] = useState("");
  const [allWeeks, setAllWeeks] = useState(false);
  const today = localDateKey();
  const calendar = useWeeklyPeriodFilter(today);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const period = calendar.period;

  const records = useMemo(() => weeklyTargetRecords(projects), [projects]);

  const users = useMemo(() => {
    const values = new Map<string, string>();
    records.forEach((record) => {
      const key = record.assigneeId || "unassigned";
      values.set(key, record.assigneeName);
    });
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const projectOptions = useMemo(() => {
    const values = new Map<string, string>();
    records.forEach((record) => values.set(record.projectId, record.projectName));
    return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const weekCounts = useMemo(() => {
    const map: Record<number, number> = {};
    calendar.periods.forEach(p => { map[p.week] = 0; });
    records.forEach(r => {
      if (r.calendarMonth === calendar.month && r.calendarWeek != null && map[r.calendarWeek] !== undefined) {
        if (selectedProjectId !== "all" && r.projectId !== selectedProjectId) return;
        if (selectedUserId !== "all" && (r.assigneeId || "unassigned") !== selectedUserId) return;
        map[r.calendarWeek]++;
      }
    });
    return map;
  }, [records, calendar.periods, calendar.month, selectedProjectId, selectedUserId]);

  const totalMonthTargets = useMemo(() => {
    return records.filter(r => {
      if (r.calendarMonth !== calendar.month) return false;
      if (selectedProjectId !== "all" && r.projectId !== selectedProjectId) return false;
      if (selectedUserId !== "all" && (r.assigneeId || "unassigned") !== selectedUserId) return false;
      return true;
    }).length;
  }, [records, calendar.month, selectedProjectId, selectedUserId]);

  const scopedRecords = useMemo(() => {
    if (allWeeks) {
      return records.filter((r) => {
        if (r.calendarMonth !== calendar.month) return false;
        if (selectedProjectId !== "all" && r.projectId !== selectedProjectId) return false;
        if (selectedUserId !== "all" && (r.assigneeId || "unassigned") !== selectedUserId) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const match = [r.projectName, r.projectCode, r.mainTaskName, r.code, r.weeklyTask.target_description, r.weeklyTask.target_output, r.assigneeName].some(v => String(v ?? "").toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      });
    }
    if (!period) return [];
    return filterWeeklyTargets(records, {
      query: search,
      projectId: selectedProjectId === "all" ? "" : selectedProjectId,
      period,
      group: "",
      today,
    }).filter((record) => selectedUserId === "all" || (record.assigneeId || "unassigned") === selectedUserId);
  }, [records, search, selectedProjectId, selectedUserId, period, today, allWeeks, calendar.month]);

  const counts = useMemo(() => ({
    ALL: scopedRecords.length,
    PENDING_APPROVAL: scopedRecords.filter((record) => weeklyGroup(record, today) === "PENDING_APPROVAL").length,
    READY: scopedRecords.filter((record) => weeklyGroup(record, today) === "READY").length,
    IN_PROGRESS: scopedRecords.filter((record) => weeklyGroup(record, today) === "IN_PROGRESS").length,
    ATTENTION: scopedRecords.filter((record) => weeklyGroup(record, today) === "ATTENTION").length,
    COMPLETED: scopedRecords.filter((record) => weeklyGroup(record, today) === "COMPLETED").length,
    REJECTED: scopedRecords.filter((record) => weeklyGroup(record, today) === "REJECTED").length,
  }), [scopedRecords, today]);

  const filteredRecords = useMemo(() => selectedState === "ALL"
    ? scopedRecords
    : scopedRecords.filter((record) => weeklyGroup(record, today) === selectedState),
  [scopedRecords, selectedState, today]);

  const averageProgress = scopedRecords.length
    ? Math.round(scopedRecords.reduce((sum, record) => sum + record.progress, 0) / scopedRecords.length)
    : 0;

  const filters: { id: WeeklyTargetState; label: string }[] = [
    { id: "ALL", label: "Semua" },
    ...WEEKLY_GROUPS.map((group) => ({ id: group.id, label: group.label })),
  ];

  return (
    <section className="rounded-[24px] border border-[#D9D9D9] bg-white px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#EAF6FF] text-[#3157C8]"><Target size={23} /></span>
            <div>
              <h2 className="text-[28px] font-bold leading-none tracking-[-0.025em] text-black sm:text-[34px]">Weekly Target Staff</h2>
              <p className="mt-2 text-sm text-[#5A5B5D]">Pantau target dan progres staf dengan periode mingguan yang sama seperti workspace staf.</p>
            </div>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-[900px] lg:grid-cols-5">
          <label className="text-xs font-semibold text-[#3157C8]">
            <span className="sr-only">Bulan Weekly Target</span>
            <input aria-label="Bulan Weekly Target" type="month" value={calendar.month} onChange={event => calendar.changeMonth(event.target.value)} className="h-11 w-full rounded-xl border border-[#BDD7FF] bg-white px-3 outline-none focus:ring-2 focus:ring-[#DCEEFF]" />
            <span className="mt-1 block text-[10px]">{period ? `${formatDate(period.start)} – ${formatDate(period.end)}` : calendar.error || "Memuat periode…"}</span>
          </label>
          <label>
            <span className="sr-only">Weekly dalam bulan</span>
            <select aria-label="Weekly dalam bulan" value={allWeeks ? "all" : (period ? calendar.week : "")} disabled={calendar.loading || Boolean(calendar.error)} onChange={event => { if (event.target.value === "all") { setAllWeeks(true); } else { setAllWeeks(false); calendar.setWeek(Number(event.target.value)); } }} className="h-11 w-full rounded-xl border border-[#BDD7FF] bg-white px-3 text-xs font-semibold text-[#3157C8] outline-none focus:ring-2 focus:ring-[#DCEEFF] disabled:opacity-50">
              <option value="all">Semua Weekly ({calendar.month})</option>
              {calendar.periods.map(item => <option key={item.id} value={item.week}>Weekly {item.week} ({formatDate(item.start)} – {formatDate(item.end)})</option>)}
            </select>
            {period && <span className="mt-1 block text-[10px]">{allWeeks ? "Mode seluruh minggu" : "Rentang kalender terpilih"}</span>}
          </label>
          <label className="relative">
            <span className="sr-only">Filter staf</span>
            <UserRound size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#3157C8]" />
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[#BDD7FF] bg-white pl-10 pr-3 text-xs font-semibold text-[#3157C8] outline-none focus:ring-2 focus:ring-[#DCEEFF]">
              <option value="all">Semua User</option>
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
          <button type="button" onClick={() => { setSelectedUserId("all"); setSelectedProjectId("all"); setSelectedState("ALL"); setSearch(""); setAllWeeks(false); calendar.reset(); }} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#BDD7FF] bg-white px-3 text-xs font-semibold text-[#3157C8] hover:bg-[#F4F8FF]">
            <X size={14} /> Reset filter
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-gray-100 py-3" aria-label="Navigasi Cepat Mingguan">
        <span className="text-xs font-semibold text-[#5A5B5D]">Pilih Minggu:</span>
        <button
          type="button"
          onClick={() => setAllWeeks(true)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition",
            allWeeks
              ? "border-[#3157C8] bg-[#3157C8] text-white shadow-sm"
              : "border-gray-200 bg-white text-[#4F5050] hover:bg-gray-50"
          )}
        >
          Semua Weekly ({calendar.month})
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", allWeeks ? "bg-white/20 text-white" : "bg-gray-100 text-[#5A5B5D]")}>
            {totalMonthTargets}
          </span>
        </button>
        {calendar.periods.map(item => {
          const isSelected = !allWeeks && period?.week === item.week;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { setAllWeeks(false); calendar.setWeek(item.week); }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition",
                isSelected
                  ? "border-[#3157C8] bg-[#3157C8] text-white shadow-sm"
                  : "border-gray-200 bg-white text-[#4F5050] hover:bg-gray-50"
              )}
            >
              <span>Weekly {item.week}</span>
              <span className="text-[10px] font-normal opacity-80">({formatDate(item.start).slice(0, 6)} – {formatDate(item.end)})</span>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", isSelected ? "bg-white/20 text-white" : "bg-[#EAF6FF] text-[#3157C8]")}>
                {weekCounts[item.week] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap justify-between items-center gap-2 text-[10px] text-[#5A5B5D]">
        <span>{allWeeks ? `Menampilkan seluruh Weekly pada bulan ${calendar.month}` : period ? `Weekly ${period.week}: ${formatDate(period.start)} – ${formatDate(period.end)} · filter cut-off Jumat pukul 15.00 WIB.` : ""}</span>
        {calendar.error && <span role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{calendar.error}</span>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          <table className="w-full min-w-[1100px] text-left">
            <thead className="sticky top-0 z-10 bg-[#F5F5F5]">
              <tr className="h-12 text-xs font-bold uppercase tracking-[0.03em] text-[#4F5050]">
                <th className="w-[150px] px-4">Identitas Minggu</th>
                <th className="min-w-[280px] px-4">Weekly Target</th>
                <th className="w-[240px] px-4">Proyek & Main Task</th>
                <th className="w-[170px] px-4">Assigned Staff</th>
                <th className="w-[170px] px-4">Periode Pelaksanaan</th>
                <th className="w-[200px] px-4">Progress</th>
                <th className="w-[140px] px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading || calendar.loading ? Array.from({ length: 5 }).map((_, index) => <LoadingRow key={index} />) : filteredRecords.length === 0 ? (
                <tr><td colSpan={7} className="h-56 px-6 text-center"><CalendarDays size={32} className="mx-auto text-[#AEB2B8]" /><p className="mt-3 text-sm font-bold text-[#4F5050]">Tidak ada Weekly Target untuk filter ini.</p><p className="mt-1 text-xs text-[#8A8E95]">Ubah bulan, minggu, staf, proyek, status, atau pencarian.</p></td></tr>
              ) : filteredRecords.map((record) => {
                const state = weeklyGroup(record, today);
                const status = statusPresentation(state);
                return (
                  <Fragment key={record.id}><tr className="border-t border-[#ECEDEF] align-middle transition-colors hover:bg-[#F7FAFF]">
                    <td className="px-4 py-5">
                      <span className="inline-flex rounded-lg bg-[#EAF6FF] px-2.5 py-1 text-xs font-extrabold text-[#3157C8]">
                        {record.calendarWeekLabel || (period ? `Weekly ${period.week}` : "Weekly")}
                      </span>
                      <p className="mt-1.5 text-[10px] font-semibold text-[#5A5B5D]">
                        {record.projectCode} · {record.sequenceLabel || `Target #${record.weeklyTask.week_number}`} ({record.sequenceCode || `W#${record.weeklyTask.week_number}`})
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-[#5A5B5D]">
                          {record.sequenceCode || `W#${record.weeklyTask.week_number}`}
                        </span>
                        <span className="text-[11px] font-semibold text-[#5A5B5D]">
                          {record.sequenceLabel || `Target #${record.weeklyTask.week_number}`}
                        </span>
                      </div>
                      <p className="text-xs font-semibold leading-5 text-[#111318] line-clamp-3">
                        {record.weeklyTask.target_description || record.weeklyTask.target_output || "Target mingguan belum memiliki deskripsi."}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <span className="inline-block text-[11px] font-bold text-[#3157C8]">{record.projectCode}</span>
                      <p className="mt-0.5 text-sm font-bold text-[#111318]" title={record.projectName}>{record.projectName}</p>
                      <p className="mt-1 text-xs font-semibold text-[#4F5050]">{record.mainTaskName}</p>
                    </td>
                    <td className="px-4 py-5"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#3157C8]"><UserRound size={15} /></span><span className="text-xs font-semibold text-[#292B30]">{record.assigneeName}</span></div></td>
                    <td className="px-4 py-5 text-xs text-[#4F5050]">
                      <span className="inline-block rounded-md bg-[#F4F8FF] px-2 py-0.5 text-[10px] font-bold text-[#3157C8]">
                        {record.calendarWeekLabel || (period ? `Weekly ${period.week}` : "Weekly")} ({record.calendarMonth || calendar.month})
                      </span>
                      <p className="mt-1 font-medium">{record.startDate ? formatDate(record.startDate) : "-"}</p>
                      <p className="my-0.5 text-[10px] text-[#9A9DA3]">sampai</p>
                      <p className="font-medium">{record.endDate ? formatDate(record.endDate) : "-"}</p>
                    </td>
                    <td className="px-4 py-5"><button type="button" aria-expanded={expandedIds.has(record.id)} onClick={() => setExpandedIds(previous => { const next = new Set(previous); if (next.has(record.id)) next.delete(record.id); else next.add(record.id); return next; })} className="mb-2 flex items-center gap-1 text-xs font-semibold text-[#3157C8]">{expandedIds.has(record.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Lihat Daily Task</button><div className="flex items-center justify-between gap-3"><span className="text-xs text-[#5A5B5D]">{record.completedDailyCount}/{record.dailyCount} Daily Task</span><strong className="text-sm text-[#3157C8]">{record.progress}%</strong></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#E7EAF0]" role="progressbar" aria-label={`Progress ${record.code}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={record.progress}><div className={cn("h-full rounded-full transition-all", state === "COMPLETED" ? "bg-[#37A451]" : state === "ATTENTION" ? "bg-[#E14B4B]" : "bg-[#3157C8]")} style={{ width: `${record.progress}%` }} /></div></td>
                    <td className="px-4 py-5"><span style={status.style} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold">{state === "COMPLETED" ? <CheckCircle2 size={13} /> : state === "ATTENTION" ? <AlertTriangle size={13} /> : null}{status.label}</span></td>
                  </tr>
                  {expandedIds.has(record.id) && <tr className="border-t border-[#ECEDEF] bg-[#F7FAFF]"><td colSpan={7} className="px-6 py-4">
                    {record.dailyTasks.length === 0 ? <p className="text-xs text-[#777B82]">Belum ada Daily Task.</p> : <table className="w-full text-xs"><thead><tr className="text-[#4F5050]"><th className="pb-2 text-left">Daily Task</th><th className="pb-2 text-left">Pemilik</th><th className="pb-2 text-left">Tanggal</th><th className="pb-2 text-left">Status</th><th className="pb-2 text-left">Progress</th></tr></thead><tbody>{record.dailyTasks.map(daily => <tr key={daily.id} className="border-t border-[#ECEDEF]"><td className="py-2">{daily.title || daily.activity_input}</td><td>{daily.owner_name || String(daily.owner_id || "Belum ditentukan")}</td><td>{daily.planned_date ? formatDate(daily.planned_date) : "-"}</td><td>{daily.status}</td><td>{daily.progress ?? 0}%</td></tr>)}</tbody></table>}
                  </td></tr>}
                  </Fragment>
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
  return <tr className="h-[112px] border-t border-[#ECEDEF]"><td className="px-4"><div className="h-7 w-28 animate-pulse rounded-lg bg-[#E6E8EB]" /></td><td className="px-4"><div className="h-8 w-44 animate-pulse rounded bg-[#EEF0F2]" /><div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-[#E6E8EB]" /></td><td className="px-4"><div className="h-4 w-2/3 animate-pulse rounded bg-[#E6E8EB]" /><div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-[#EEF0F2]" /></td><td className="px-4"><div className="h-9 w-24 animate-pulse rounded bg-[#EEF0F2]" /></td><td className="px-4"><div className="h-3 w-full animate-pulse rounded bg-[#E6E8EB]" /></td><td className="px-4"><div className="h-7 w-24 animate-pulse rounded bg-[#EEF0F2]" /></td><td className="px-4"><div className="h-7 w-20 animate-pulse rounded bg-[#EEF0F2]" /></td></tr>;
}

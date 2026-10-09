"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, LayoutList, Loader2, Plus, Search, Target, UserRound, Columns3, X } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { createWeeklyTask, getApiErrorDetail, getProjectAuthority, loadWeeklyManagementProjects, type Project, type ProjectAuthority, type WeeklyTask } from "@/lib/api/project.api";
import { cn, formatDate, localDateKey } from "@/lib/utils";
import { calendarWeek, weeklyTargetRecords, type WeeklyTargetRecord } from "@/lib/weekly-dashboard";
import { filterWeeklyTargets, moveWeeklyCard, personalWeeklyTargets, sortWeeklyTargets, weeklyCreationProjects, weeklyGroup, weeklyPermissions, WEEKLY_GROUPS } from "@/lib/tasks/weekly-management";
import { WeeklyTargetDetail } from "./WeeklyTargetDetail";
import { useWeeklyPeriodFilter } from "./useWeeklyPeriodFilter";

interface Props {
  projects: Project[];
  userId?: string | number;
  userName: string;
  canSubmit: boolean;
  loading: boolean;
  loadError?: string;
  onCreated: (projectId: string, weekly: WeeklyTask) => void;
  onOpenDaily: (weeklyId: string) => void;
  onCreateDaily: (record: WeeklyTargetRecord) => void;
  contextKey: string;
  onRefresh: () => Promise<void>;
}

export function WeeklyTaskManagement({ projects, userId, userName, canSubmit, loading, loadError, onCreated, onOpenDaily, onCreateDaily, contextKey, onRefresh }: Props) {
  const [view, setView] = useState<"table" | "board">("table");
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("");
  const today = localDateKey();
  const calendar = useWeeklyPeriodFilter(today);
  const period = calendar.period;
  const [groupFilter, setGroupFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<"personal" | "team">("personal");
  const [teamProjects, setTeamProjects] = useState<Project[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [authorities, setAuthorities] = useState<Record<string, ProjectAuthority>>({});
  const [sort, setSort] = useState("due");
  const [order, setOrder] = useState<string[]>([]);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const preferenceKey = `erp.weekly-view:${contextKey}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) || "null");
      if (saved?.view === "table" || saved?.view === "board") setView(saved.view);
      if (["due", "title", "progress", "manual"].includes(saved?.sort)) setSort(saved.sort);
      if (Array.isArray(saved?.order)) setOrder(saved.order.filter((id: unknown) => typeof id === "string"));
    } catch { /* A malformed personal preference cannot change authorization. */ }
    setPreferencesReady(true);
  }, [preferenceKey]);
  useEffect(() => {
    if (preferencesReady) { try { localStorage.setItem(preferenceKey, JSON.stringify({ view, sort, order })); } catch { /* Storage is optional. */ } }
  }, [preferenceKey, preferencesReady, view, sort, order]);
  const authorityIds = Array.from(new Set([...projects, ...teamProjects].map(project => String(project.id)))).sort().join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = authorityIds ? authorityIds.split(",") : [];
    setAuthorities({});
    void Promise.allSettled(ids.map(id => getProjectAuthority(id))).then(results => {
      if (cancelled) return;
      const next: Record<string, ProjectAuthority> = {};
      results.forEach((result, index) => { if (result.status === "fulfilled" && String(result.value.project_id) === ids[index]) next[ids[index]] = result.value; });
      setAuthorities(next);
    });
    return () => { cancelled = true; };
  }, [authorityIds]);
  const canViewTeam = canSubmit && Object.values(authorities).some(authority => authority.can_review_weekly_tasks);
  async function refreshTeam() {
    setTeamLoading(true); setTeamError("");
    try { const result = await loadWeeklyManagementProjects(); if (alive.current) setTeamProjects(result); }
    catch (failure) { if (alive.current) { setTeamProjects([]); setTeamError(getApiErrorDetail(failure, "Gagal memuat target tim proyek.")); } }
    finally { if (alive.current) setTeamLoading(false); }
  }
  async function refresh() { await Promise.all([onRefresh(), ...(scope === "team" ? [refreshTeam()] : [])]); }
  const records = useMemo(() => scope === "team" ? weeklyTargetRecords(teamProjects) : personalWeeklyTargets(projects, userId), [projects, teamProjects, userId, scope]);
  const creationProjects = useMemo(() => !canSubmit ? [] : scope === "personal" ? weeklyCreationProjects(projects, userId) : teamProjects.filter(project => authorities[String(project.id)]?.can_manage_weekly_tasks).map(project => ({ ...project, main_tasks: (project.main_tasks || []).filter(main => main.assignments?.length) })).filter(project => project.main_tasks.length), [projects, teamProjects, userId, canSubmit, scope, authorities]);
  const filtered = useMemo(() => period ? sortWeeklyTargets(filterWeeklyTargets(records, { query, projectId, period, group: groupFilter, today }).filter(record => !assigneeFilter || record.assigneeId === assigneeFilter), sort, order) : [], [records, query, projectId, period, groupFilter, today, assigneeFilter, sort, order]);
  const selected = records.find(record => record.id === selectedId);
  const projectOptions = (scope === "team" ? teamProjects : projects).filter(project => records.some(record => record.projectId === String(project.id)));
  const assignees = Array.from(new Map(records.map(record => [record.assigneeId, record.assigneeName])).entries());
  function dropCard(source: string, target: WeeklyTargetRecord) {
    const previous = records.find(record => record.id === source);
    if (!previous || source === target.id) return;
    if (weeklyGroup(previous, today) !== weeklyGroup(target, today)) { toast.error("Status Weekly mengikuti approval dan progres Daily Task. Kartu hanya dapat diurutkan di kelompok yang sama."); return; }
    setOrder(moveWeeklyCard(sortWeeklyTargets(records, sort, order), source, target.id, today)); setSort("manual");
  }
  const stats = [
    { label: scope === "team" ? "Weekly Target tim proyek" : "Weekly Target saya", value: records.length, icon: Target, color: "text-brand-deep-green" },
    { label: "Menunggu persetujuan", value: records.filter(record => weeklyGroup(record, today) === "PENDING_APPROVAL").length, icon: CalendarDays, color: "text-amber-700" },
    { label: "Sedang berjalan", value: records.filter(record => weeklyGroup(record, today) === "IN_PROGRESS").length, icon: Columns3, color: "text-blue-600" },
    { label: "Target selesai", value: records.filter(record => weeklyGroup(record, today) === "COMPLETED").length, icon: CheckCircle2, color: "text-indigo-600" },
  ];

  return <section className="flex min-w-0 flex-col gap-5" aria-labelledby="weekly-management-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary"><span className="h-2 w-2 rounded-full bg-brand-green" /> {scope === "team" ? "Perencanaan tim proyek" : "Perencanaan personal"}</div><h2 id="weekly-management-title" className="text-xl font-bold text-text-primary">Weekly Target</h2><p className="mt-1 text-xs leading-5 text-text-secondary">Susun target mingguan, pantau persetujuan, dan lanjutkan menjadi pekerjaan harian.</p></div>
      <button type="button" onClick={() => setCreating(true)} disabled={loading || teamLoading || !creationProjects.length} className="btn-primary gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Buat Weekly Target</button>
    </div>

    {canViewTeam && <div className="flex flex-wrap items-center gap-2" aria-label="Cakupan Weekly Target">
      <button type="button" aria-pressed={scope === "personal"} onClick={() => { setScope("personal"); setProjectId(""); setAssigneeFilter(""); setSelectedId(null); setTeamError(""); }} className={cn("rounded-xl border px-4 py-2 text-xs font-semibold", scope === "personal" ? "border-blue-200 bg-blue-50 text-brand-deep-green" : "border-gray-200 bg-white text-text-secondary")}>Milik saya</button>
      <button type="button" aria-pressed={scope === "team"} onClick={() => { setScope("team"); setProjectId(""); setAssigneeFilter(""); setSelectedId(null); void refreshTeam(); }} className={cn("rounded-xl border px-4 py-2 text-xs font-semibold", scope === "team" ? "border-blue-200 bg-blue-50 text-brand-deep-green" : "border-gray-200 bg-white text-text-secondary")}>Tim proyek</button>
      <span className="text-[11px] text-text-secondary">Target tim dari proyek yang dapat Anda review.</span>
    </div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon, color }) => <div key={label} className="card flex items-center justify-between gap-3 rounded-2xl px-4 py-4"><div><p className="text-[11px] text-text-secondary">{label}</p><p className={cn("mt-2 text-2xl font-bold", color)}>{loading ? "—" : value}</p></div><span className={cn("rounded-xl bg-bg-light p-2.5", color)}><Icon size={19} /></span></div>)}</div>

    {!loading && !loadError && !creationProjects.length && <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-text-secondary"><CircleHelp size={17} className="mt-0.5 shrink-0 text-brand-green" /><p>{canSubmit ? "Untuk membuat Weekly Target, Anda perlu ditugaskan pada Main Task. Assignment tersebut akan menentukan proyek dan Main Task yang bisa dipilih." : "Role aktif Anda dapat melihat target. Gunakan role operasional yang sesuai untuk mengajukan Weekly Target."}</p></div>}

    <div className="card min-w-0 overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1" aria-label="Tampilan Weekly Target">{[{ id: "table", label: "Daftar", icon: LayoutList }, { id: "board", label: "Board", icon: Columns3 }].map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id as "table" | "board")} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition", view === id ? "bg-white text-brand-deep-green shadow-sm" : "text-text-secondary hover:bg-white/50")}><Icon size={15} />{label}</button>)}</div>
        <span className="flex items-center gap-2 text-xs text-text-secondary"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-light-green text-[10px] font-bold text-brand-deep-green">{userName.slice(0, 1).toUpperCase()}</span>{userName}<span className="rounded-full bg-gray-100 px-2 py-1 text-[10px]">{scope === "team" ? "Tim proyek" : "Milik saya"}</span></span>
      </div>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <label className="relative min-w-[180px] flex-1"><span className="sr-only">Cari Weekly Target</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari target, proyek, atau Main Task..." className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-brand-green" /></label>
        <label><span className="sr-only">Filter proyek Weekly Target</span><select value={projectId} onChange={event => setProjectId(event.target.value)} className="h-10 max-w-[220px] rounded-xl border border-gray-200 bg-white px-3 text-xs outline-none focus:border-brand-green"><option value="">Semua proyek</option>{projectOptions.map(project => <option key={project.id} value={project.id}>{project.project_name || project.name}</option>)}</select></label>
        <label><span className="sr-only">Filter status Weekly Target</span><select value={groupFilter} onChange={event => setGroupFilter(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs outline-none focus:border-brand-green"><option value="">Semua status</option>{WEEKLY_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
        <label className="flex items-center gap-2 text-[11px] text-text-secondary">Bulan<input aria-label="Bulan Weekly Target" type="month" required value={calendar.month} onChange={event => calendar.changeMonth(event.target.value)} className="h-10 min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-xs outline-none focus:border-brand-green" /></label>
        <label className="flex items-center gap-2 text-[11px] text-text-secondary">Weekly<select aria-label="Weekly dalam bulan" value={period ? calendar.week : ""} disabled={calendar.loading || Boolean(calendar.error)} onChange={event => calendar.setWeek(Number(event.target.value))} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs disabled:opacity-50">{!period && <option value="">Memuat periode...</option>}{calendar.periods.map(item => <option key={item.id} value={item.week}>Weekly {item.week}</option>)}</select></label>
        {scope === "team" && <label><span className="sr-only">Filter PIC Weekly Target</span><select value={assigneeFilter} onChange={event => setAssigneeFilter(event.target.value)} className="h-10 max-w-[220px] rounded-xl border border-gray-200 bg-white px-3 text-xs"><option value="">Semua PIC</option>{assignees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        <label><span className="sr-only">Urutkan Weekly Target</span><select value={sort} onChange={event => setSort(event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs"><option value="due">Deadline terdekat</option><option value="title">Nama target</option><option value="progress">Progres tertinggi</option><option value="manual">Urutan kartu saya</option></select></label>
        <button type="button" onClick={() => { setQuery(""); setProjectId(""); calendar.reset(); setGroupFilter(""); setAssigneeFilter(""); }} className="flex items-center gap-1 text-xs font-semibold text-brand-green"><X size={13} /> Reset filter</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5 text-[11px] text-text-secondary"><span>{calendar.error ? "Periode belum tersedia" : loading || calendar.loading ? "Memuat target..." : `${filtered.length} target ditampilkan`}</span>{period && <span aria-label="Rentang Weekly terpilih" className="font-semibold text-brand-deep-green">Weekly {period.week}: {formatDate(period.start)} – {formatDate(period.end)} · Senin–Jumat</span>}<span>Progres mengikuti Daily Task</span></div>
      <p className="px-4 pb-3 text-[11px] text-text-secondary">Weekly pada filter mengikuti kalender bulanan. W# pada target mengikuti urutan Main Task proyek.</p>
    </div>

    {calendar.error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"><span>{calendar.error}</span><button type="button" onClick={calendar.retry} className="shrink-0 font-semibold underline">Coba muat periode</button></div>}

    {calendar.error ? null : (loadError || teamError) ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{loadError || teamError}</div> : (loading || teamLoading || calendar.loading) ? <div className="space-y-3" aria-busy="true">{[1, 2, 3].map(index => <div key={index} className="card h-28 animate-pulse rounded-2xl bg-gray-50" />)}</div> : !filtered.length ? <div className="card flex flex-col items-center rounded-2xl px-5 py-14 text-center"><span className="mb-4 rounded-2xl bg-brand-light-green p-4 text-brand-green"><Target size={30} /></span><h3 className="text-base font-bold text-text-primary">{records.length ? "Tidak ada target yang sesuai filter" : "Mulai rencanakan minggu Anda"}</h3><p className="mt-2 max-w-md text-xs leading-6 text-text-secondary">{records.length ? "Coba proyek, tanggal, atau status lain untuk menemukan target Anda." : "Pilih proyek dan Main Task yang ditugaskan kepada Anda, lalu tentukan hasil yang ingin dicapai minggu ini."}</p>{creationProjects.length > 0 && <button type="button" onClick={() => setCreating(true)} className="btn-primary mt-5 gap-2 text-xs"><Plus size={15} />Buat Weekly Target</button>}</div> : view === "table" ? <div className="space-y-5">{WEEKLY_GROUPS.map(group => {
      const rows = filtered.filter(record => weeklyGroup(record, today) === group.id);
      if (!rows.length) return null;
      return <div key={group.id} className="min-w-0"><button type="button" aria-expanded={!collapsed[group.id]} onClick={() => setCollapsed(previous => ({ ...previous, [group.id]: !previous[group.id] }))} className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: group.color }}>{collapsed[group.id] ? <ChevronRight size={17} /> : <ChevronDown size={17} />}<span className="h-2 w-2 rounded-full" style={{ background: group.color }} />{group.label}<span className="ml-1 text-xs font-normal text-text-secondary">{rows.length} target</span></button>{!collapsed[group.id] && <div className="overflow-hidden rounded-xl border border-gray-200 border-l-[4px] bg-white" style={{ borderLeftColor: group.color }}><div className="overflow-x-auto"><table className="w-full min-w-[930px] text-left text-xs"><thead className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-text-secondary"><tr><th className="min-w-[280px] px-4 py-3 font-semibold">Weekly Target / Main Task</th><th className="min-w-[160px] px-4 py-3 font-semibold">Proyek</th><th className="px-4 py-3 font-semibold">Periode</th><th className="min-w-[160px] px-4 py-3 font-semibold">Status</th><th className="min-w-[150px] px-4 py-3 font-semibold">Progres</th><th className="px-4 py-3 font-semibold"><span className="sr-only">Aksi</span></th></tr></thead><tbody>{rows.map(record => <tr key={record.id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30"><td className="px-4 py-4"><button type="button" onClick={() => setSelectedId(record.id)} className="max-w-[360px] text-left font-semibold leading-5 text-text-primary hover:text-brand-green"><span className="mr-2 inline-block rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-text-secondary">W#{record.weeklyTask.week_number}</span>{record.weeklyTask.target_description || record.weeklyTask.target_output || "Target mingguan"}</button><p className="mt-1.5 text-[11px] text-text-secondary">{record.mainTaskName} · {record.assigneeName}</p></td><td className="px-4 py-4"><p className="font-semibold text-brand-deep-green">{record.projectCode}</p><p className="mt-1 max-w-[180px] truncate text-[11px] text-text-secondary">{record.projectName}</p></td><td className="whitespace-nowrap px-4 py-4 text-[11px] text-text-secondary">{record.startDate ? formatDate(record.startDate) : "—"}<br /><span className="mt-1 inline-block">– {record.endDate ? formatDate(record.endDate) : "—"}</span></td><td className="px-4 py-4"><Status record={record} today={today} /></td><td className="px-4 py-4"><Progress record={record} /></td><td className="px-4 py-4"><button type="button" aria-label={`Buka target ${record.weeklyTask.target_description || record.code}`} onClick={() => setSelectedId(record.id)} className="rounded-lg p-2 text-text-secondary hover:bg-brand-light-green hover:text-brand-green"><ArrowRight size={16} /></button></td></tr>)}</tbody></table></div></div>}</div>;
    })}</div> : <div className="min-w-0 overflow-x-auto pb-3"><div className="flex w-max min-w-full items-start gap-4">{WEEKLY_GROUPS.filter(group => !groupFilter || group.id === groupFilter).map(group => {
      const rows = filtered.filter(record => weeklyGroup(record, today) === group.id);
      return <div key={group.id} className="w-[280px] shrink-0 rounded-2xl border border-gray-200 bg-gray-50/70 p-3"><div className="mb-3 flex items-center justify-between border-t-[3px] px-1 pt-3" style={{ borderColor: group.color }}><h3 className="text-xs font-bold" style={{ color: group.color }}>{group.label}</h3><span className="rounded-md bg-white px-2 py-1 text-[10px] text-text-secondary">{rows.length}</span></div><div className="space-y-3">{rows.map(record => <button type="button" key={record.id} draggable data-weekly-card={record.id} onDragStart={event => { event.dataTransfer.setData("text/weekly-id", record.id); event.dataTransfer.effectAllowed = "move"; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); dropCard(event.dataTransfer.getData("text/weekly-id"), record); }} onClick={() => setSelectedId(record.id)} className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-xs transition hover:border-blue-300 hover:shadow-md"><span className="text-[10px] font-bold text-brand-green">{record.projectCode} · W#{record.weeklyTask.week_number}</span><h4 className="mb-2 mt-2 line-clamp-3 text-sm font-semibold leading-5 text-text-primary">{record.weeklyTask.target_description || record.weeklyTask.target_output || "Target mingguan"}</h4><p className="mb-1 line-clamp-1 text-[11px] text-text-secondary">{record.mainTaskName}</p><p className="mb-4 text-[11px] font-semibold text-brand-deep-green">{record.assigneeName}</p><Status record={record} today={today} /><div className="my-4"><Progress record={record} /></div><div className="flex items-center justify-between border-t border-gray-100 pt-3 text-[10px] text-text-secondary"><span className="flex items-center gap-1"><CalendarDays size={12} />{record.endDate ? formatDate(record.endDate) : "Tanpa tanggal"}</span><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-light-green font-bold text-brand-deep-green">{record.assigneeName.slice(0, 1).toUpperCase()}</span></div></button>)}{!rows.length && <p className="rounded-xl border border-dashed border-gray-200 px-3 py-8 text-center text-[11px] text-text-secondary">Belum ada target</p>}</div></div>;
    })}</div></div>}

    {creating && <CreateWeeklyTarget projects={creationProjects} userId={String(userId ?? "")} userName={userName} onClose={() => setCreating(false)} onCreated={(id, weekly) => { onCreated(id, weekly); if (scope === "team") void refreshTeam(); }} teamMode={scope === "team"} />}
    {selected && <WeeklyTargetDetail key={selected.id} record={selected} today={today} permissions={weeklyPermissions(selected, userId, authorities[selected.projectId], canSubmit)} onClose={() => setSelectedId(null)} onChanged={refresh} onOpenDaily={onOpenDaily} onCreateDaily={onCreateDaily} />}
  </section>;
}

function Status({ record, today }: { record: WeeklyTargetRecord; today: string }) {
  const group = WEEKLY_GROUPS.find(item => item.id === weeklyGroup(record, today))!;
  return <span className="inline-flex rounded-md px-2.5 py-1.5 text-[10px] font-semibold" style={{ color: group.color, background: group.soft }}>{group.label}</span>;
}

function Progress({ record }: { record: WeeklyTargetRecord }) {
  return <div><div className="mb-2 flex items-center justify-between gap-3 text-[10px]"><span className="text-text-secondary">{record.completedDailyCount}/{record.dailyCount} Daily Task</span><strong className="text-brand-deep-green">{record.progress}%</strong></div><div role="progressbar" aria-label={`Progres ${record.code}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={record.progress} className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${record.progress}%` }} /></div></div>;
}

function CreateWeeklyTarget({ projects, userId, userName, onClose, onCreated, teamMode = false }: { projects: Project[]; userId: string; userName: string; onClose: () => void; onCreated: Props["onCreated"]; teamMode?: boolean }) {
  const [projectId, setProjectId] = useState("");
  const [mainId, setMainId] = useState("");
  const [weekNumber, setWeekNumber] = useState("1");
  const [description, setDescription] = useState("");
  const period = calendarWeek(localDateKey());
  const [startDate, setStartDate] = useState(period.start);
  const [endDate, setEndDate] = useState(period.end);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [assigneeId, setAssigneeId] = useState(teamMode ? "" : userId);
  const project = projects.find(item => String(item.id) === projectId);
  const main = project?.main_tasks?.find(item => String(item.id) === mainId);
  const assignmentOptions = Array.from(new Map((main?.assignments || []).map(assignment => [String(assignment.assignee_id ?? assignment.assignee ?? ""), assignment.assignee_name || assignment.user_name || String(assignment.assignee_id ?? assignment.assignee ?? "")])).entries()).filter(([id]) => id);
  const assigneeName = assignmentOptions.find(([id]) => id === assigneeId)?.[1] || userName;
  const close = () => { if (!saving) onClose(); };
  const inputClass = "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-green focus:ring-2 focus:ring-blue-50 disabled:bg-gray-50 disabled:text-text-secondary";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!project || !main || !description.trim()) { setError("Pilih proyek, Main Task, dan isi hasil target mingguan."); return; }
    if (!assignmentOptions.some(([id]) => id === assigneeId)) { setError("Pilih PIC dari assignment Main Task yang sama."); return; }
    if (!Number.isInteger(Number(weekNumber)) || Number(weekNumber) < 1 || Number(weekNumber) > 52) { setError("Nomor minggu harus antara 1 sampai 52."); return; }
    if (!startDate || !endDate || endDate < startDate) { setError("Tanggal selesai harus sama atau setelah tanggal mulai."); return; }
    setError(""); setSaving(true);
    try {
      const created = await createWeeklyTask({ main_task: main.id, week_number: Number(weekNumber), target_description: description.trim(), start_date: startDate, end_date: endDate, assignee_id: assigneeId });
      if (!created?.id || !created?.status) throw new Error("Respons Weekly Target tidak lengkap. Muat ulang daftar sebelum mencoba lagi.");
      onCreated(projectId, { id: created.id, created_by_id: created.created_by_id || userId, main_task: main.id, project: project.id, week_number: Number(weekNumber), target_description: created.target_description || description.trim(), target_output: created.target_description || description.trim(), start_date: created.start_date || startDate, end_date: created.end_date || endDate, assignee_id: assigneeId, assignee_name: assigneeName, status: created.status, progress: Number(created.progress ?? 0), daily_tasks: [] });
      toast.success(created.status === "PENDING_APPROVAL" ? "Weekly Target diajukan. Menunggu persetujuan PM / SPV." : "Weekly Target berhasil dibuat.");
      onClose();
    } catch (failure) { setError(getApiErrorDetail(failure, "Gagal membuat Weekly Target.")); }
    finally { setSaving(false); }
  }

  return <Modal isOpen onClose={close} title="Buat Weekly Target" subtitle="Rencanakan hasil kerja pada Main Task yang ditugaskan kepada Anda." maxWidth="2xl"><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-xs font-semibold">Proyek <span className="text-red-500">*</span><select aria-label="Proyek Weekly Target" required autoFocus value={projectId} disabled={saving} onChange={event => { setProjectId(event.target.value); setMainId(""); setWeekNumber("1"); setAssigneeId(teamMode ? "" : userId); }} className={inputClass}><option value="">Pilih proyek</option>{projects.map(item => <option key={item.id} value={item.id}>{item.project_code || item.code} — {item.project_name || item.name}</option>)}</select></label><label className="space-y-2 text-xs font-semibold">Main Task <span className="text-red-500">*</span><select aria-label="Main Task Weekly Target" required value={mainId} disabled={!project || saving} onChange={event => { setMainId(event.target.value); setAssigneeId(teamMode ? "" : userId); const selected = project?.main_tasks?.find(item => String(item.id) === event.target.value); setWeekNumber(String(Math.min(52, Math.max(0, ...(selected?.weekly_tasks || selected?.weekly_plans || []).map(weekly => weekly.week_number || 0)) + 1))); }} className={inputClass}><option value="">{project ? "Pilih Main Task Anda" : "Pilih proyek terlebih dahulu"}</option>{project?.main_tasks?.map(item => <option key={item.id} value={item.id}>{item.name || item.title}</option>)}</select></label></div>
    {teamMode ? <label className="block space-y-2 text-xs font-semibold">PIC Weekly Target <span className="text-red-500">*</span><select aria-label="PIC Weekly Target" required value={assigneeId} disabled={!main || saving} onChange={event => setAssigneeId(event.target.value)} className={inputClass}><option value="">Pilih PIC dari assignment Main Task</option>{assignmentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label> : <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3"><span className="rounded-full bg-white p-2 text-brand-green"><UserRound size={17} /></span><div><p className="text-[10px] text-text-secondary">Pemilik Weekly Target</p><p className="text-xs font-bold text-brand-deep-green">{userName}</p></div></div>}

    <label className="block space-y-2 text-xs font-semibold">Target pekerjaan / hasil yang dicapai <span className="text-red-500">*</span><textarea aria-label="Target pekerjaan mingguan" required rows={4} value={description} disabled={saving} onChange={event => setDescription(event.target.value)} placeholder="Contoh: Selesaikan rancangan modul inventori beserta alur penerimaan dan pengeluaran barang." className="w-full resize-y rounded-xl border border-gray-200 p-3 text-sm leading-6 outline-none focus:border-brand-green focus:ring-2 focus:ring-blue-50" /><span className="block text-[11px] font-normal text-text-secondary">Tuliskan hasil yang jelas agar mudah diuraikan menjadi Daily Task.</span></label>
    <div className="grid gap-4 sm:grid-cols-3"><label className="space-y-2 text-xs font-semibold">Minggu ke <span className="text-red-500">*</span><input aria-label="Minggu ke" type="number" min={1} max={52} required value={weekNumber} disabled={saving} onChange={event => setWeekNumber(event.target.value)} className={inputClass} /></label><label className="space-y-2 text-xs font-semibold">Tanggal mulai <span className="text-red-500">*</span><input aria-label="Tanggal mulai Weekly Target" type="date" required value={startDate} disabled={saving} onChange={event => setStartDate(event.target.value)} className={inputClass} /></label><label className="space-y-2 text-xs font-semibold">Tanggal selesai <span className="text-red-500">*</span><input aria-label="Tanggal selesai Weekly Target" type="date" min={startDate || undefined} required value={endDate} disabled={saving} onChange={event => setEndDate(event.target.value)} className={inputClass} /></label></div>
    <p className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-[11px] leading-5 text-text-secondary"><CircleHelp size={16} className="mt-0.5 shrink-0" />Pengajuan mengikuti persetujuan sesuai kewenangan Anda. Daily Task dapat dibuat setelah Weekly Target disetujui.</p>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>}
    <div className="flex justify-end gap-2 border-t border-gray-100 pt-4"><button type="button" onClick={close} disabled={saving} className="btn-secondary text-xs">Batal</button><button type="submit" disabled={saving || !main} className="btn-primary gap-2 text-xs disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}{saving ? "Menyimpan..." : "Simpan Weekly Target"}</button></div>
  </form></Modal>;
}

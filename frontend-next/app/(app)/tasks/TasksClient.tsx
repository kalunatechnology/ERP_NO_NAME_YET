"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { cn, formatDate, getStatusColor } from "@/lib/utils";
import { loadAllProjects, Project, DailyTask, updateDailyTask } from "@/lib/api/project.api";
import { useAuth, detectRole } from "@/contexts/AuthContext";
import {
  CheckCircle2, Search, Check, Layers, RefreshCw,
  CalendarDays, AlertTriangle, Clock, ChevronDown, ChevronRight, Pencil, X, Save,
} from "lucide-react";
import toast from "react-hot-toast";

/* ── Status helpers ─────────────────────────────── */
function StatusBadge({ status, progress }: { status: string; progress?: number }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-2xs font-semibold", getStatusColor(status))}>
      {status}{progress !== undefined ? ` (${progress}%)` : ""}
    </span>
  );
}

/* ── Quick Edit Overlay ─────────────────────────── */
function QuickEdit({
  task, onSave, onClose,
}: {
  task: DailyTask;
  onSave: (id: string|number, patch: Partial<DailyTask>) => Promise<void>;
  onClose: () => void;
}) {
  const [output, setOutput] = useState(task.output_result || "");
  const [notes, setNotes] = useState(task.notes || "");
  const [progress, setProgress] = useState(task.progress || 0);
  const [status, setStatus] = useState(task.status || "ON_PROGRESS");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(task.id, { output_result: output, notes, progress, status });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-text-tertiary w-full max-w-lg z-10 p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Edit Task</h3>
            <p className="text-xs text-text-secondary mt-0.5 truncate max-w-xs">{task.title || task.activity_input}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-secondary"><X size={15} /></button>
        </div>

        {/* Output Hasil */}
        <div>
          <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Output / Hasil Kerja</label>
          <textarea
            rows={3}
            value={output}
            onChange={e => setOutput(e.target.value)}
            placeholder="Deskripsikan output / deliverable yang diselesaikan..."
            className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green resize-none"
          />
        </div>

        {/* Catatan */}
        <div>
          <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Catatan / Kendala</label>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Catatan, hambatan, atau hal perlu diperhatikan..."
            className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green resize-none"
          />
        </div>

        {/* Progress & Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Progress (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={100} step={5}
                value={progress}
                onChange={e => { const v = Number(e.target.value); setProgress(v); if (v === 100) setStatus("COMPLETED"); else if (v > 0) setStatus("ON_PROGRESS"); }}
                className="flex-1"
              />
              <span className="text-sm font-bold text-brand-green w-10 text-right">{progress}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as "PENDING" | "ON_PROGRESS" | "COMPLETED" | "BLOCKED" | "DONE")}
              className="w-full border border-text-tertiary rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-brand-green"
            >
              {["PENDING","ON_PROGRESS","COMPLETED","BLOCKED","CANCELLED"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="btn-ghost text-xs py-1.5 px-3">Batal</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-xs py-1.5 px-4 gap-1.5"
          >
            <Save size={12} />
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Task Row ───────────────────────────────────── */
function TaskRow({
  projectName, projectCode, mainTaskName, weekNumber, task,
  onToggle, onEdit, isAllowed = true,
}: {
  projectName: string; projectCode: string; mainTaskName: string; weekNumber: number;
  task: DailyTask; onToggle: () => void; onEdit: () => void; isAllowed?: boolean;
}) {
  const isDone = ["COMPLETED","DONE"].includes(task.status || "");
  const isBlocked = task.is_blocked || task.status === "BLOCKED";
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = task.planned_date && task.planned_date < today && !isDone;

  return (
    <tr className={cn(
      "border-b border-gray-100 hover:bg-brand-light-green/20 transition-colors",
      isBlocked && "bg-red-50/50",
      isOverdue && "bg-amber-50/30",
    )}>
      {/* Project & WBS */}
      <td className="py-2.5 px-4 align-top">
        <span className="text-2xs font-extrabold px-1.5 py-0.5 rounded bg-brand-light-green text-brand-deep-green mr-1.5">
          {projectCode}
        </span>
        <strong className="text-xs text-text-primary block mt-0.5 truncate max-w-32">{projectName}</strong>
        <span className="text-2xs text-text-secondary block mt-0.5">
          {mainTaskName} · <b className="text-indigo-600">W#{weekNumber}</b>
        </span>
      </td>

      {/* Date & Time */}
      <td className="py-2.5 px-4 align-top whitespace-nowrap">
        <div className={cn("text-xs font-medium", isOverdue ? "text-red-600 font-bold" : "text-text-primary")}>
          {task.planned_date || "-"}
          {isOverdue && <span className="ml-1">⚠️</span>}
        </div>
        <div className="text-2xs text-text-secondary">{task.time_slot || "-"}</div>
      </td>

      {/* Activity */}
      <td className="py-2.5 px-4 align-top max-w-56">
        <div className="flex items-start gap-2">
          <button
            onClick={isAllowed ? onToggle : () => toast.error("Akses Ditolak: Anda tidak memiliki wewenang pada task ini!")}
            disabled={!isAllowed}
            className={cn(
              "w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-all flex-shrink-0",
              !isAllowed && "cursor-not-allowed opacity-40 bg-gray-100",
              isAllowed && isDone ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300 hover:border-emerald-500"
            )}
            title={!isAllowed ? "🔒 Hanya PIC / Owner atau PM yang dapat mengubah status" : (isDone ? "Buka kembali" : "Tandai selesai")}
          >
            {isDone && <Check size={11} strokeWidth={3} />}
          </button>
          <div className="min-w-0">
            <strong className={cn("text-xs font-semibold block", isDone && "line-through text-text-secondary")}>
              {task.title || task.activity_input || "-"}
            </strong>
            {task.notes && (
              <span className="text-2xs text-text-secondary italic block mt-0.5 truncate">{task.notes}</span>
            )}
          </div>
        </div>
      </td>

      {/* Output */}
      <td className="py-2.5 px-4 align-top max-w-40">
        <span className={cn("text-xs", task.output_result ? "text-emerald-800" : "text-text-secondary italic text-2xs")}>
          {task.output_result || "Belum diisi"}
        </span>
      </td>

      {/* Status */}
      <td className="py-2.5 px-4 align-top">
        <StatusBadge status={task.status || "PENDING"} progress={task.progress} />
      </td>

      {/* Actions */}
      <td className="py-2.5 px-4 align-top">
        {isAllowed ? (
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-text-secondary hover:text-brand-green hover:bg-brand-light-green transition-colors"
            title="Edit output & catatan"
          >
            <Pencil size={13} />
          </button>
        ) : (
          <span className="text-3xs text-text-secondary bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded" title="Hanya PIC / Owner atau PM yang dapat mengedit">
            🔒 Read Only
          </span>
        )}
      </td>
    </tr>
  );
}

/* ══════════════════════════════════════════════════
   MAIN TASKS CLIENT
══════════════════════════════════════════════════ */
export default function TasksClient() {
  const { user, userRole, isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("TODAY");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grouped">("grouped");
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isPM = useMemo(() => {
    if (!user) return false;
    if (userRole === "pm" || userRole === "executive" || isAdmin) return true;
    if ((user as any).is_superuser || (user as any).is_staff) return true;
    const role = detectRole(user);
    if (role === "pm" || role === "executive") return true;
    const email = (user.email || "").toLowerCase();
    const username = (user.username || "").toLowerCase();
    return username.includes("pm") || username.includes("project") || username.includes("admin") || email.includes("pm") || email.includes("project") || email.includes("admin");
  }, [user, userRole, isAdmin]);

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const projs = await loadAllProjects();
      setProjects(projs);
    } catch {
      toast.error("Gagal memuat data task");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  /* Flatten all daily tasks */
  const allTasks = useMemo(() => {
    const list: {
      projectId: string | number;
      projectName: string;
      projectCode: string;
      mainTaskName: string;
      weekNumber: number;
      task: DailyTask;
    }[] = [];

    projects.forEach(p => {
      (p.main_tasks || []).forEach(m => {
        (m.weekly_tasks || m.weekly_plans || []).forEach(w => {
          (w.daily_tasks || []).forEach(d => {
            list.push({
              projectId: p.id,
              projectName: p.project_name || p.name || `Proyek ${p.id}`,
              projectCode: p.project_code || p.code || "PRJ",
              mainTaskName: m.name || m.title || "Main Task",
              weekNumber: w.week_number || 1,
              task: d,
            });
          });
        });
      });
    });

    return list;
  }, [projects]);

  const today = new Date().toISOString().split("T")[0];

  const filteredTasks = useMemo(() => {
    return allTasks.filter(item => {
      const matchSearch = search
        ? (item.task.title || item.task.activity_input || "").toLowerCase().includes(search.toLowerCase()) ||
          item.projectName.toLowerCase().includes(search.toLowerCase())
        : true;
      if (!matchSearch) return false;
      if (activeFilter === "TODAY") return item.task.planned_date === today;
      if (activeFilter === "ACTIVE") return ["ON_PROGRESS","PENDING"].includes(item.task.status || "");
      if (activeFilter === "COMPLETED") return ["COMPLETED","DONE"].includes(item.task.status || "");
      if (activeFilter === "OVERDUE") return item.task.planned_date && item.task.planned_date < today && !["COMPLETED","DONE"].includes(item.task.status || "");
      if (activeFilter === "BLOCKED") return item.task.is_blocked || item.task.status === "BLOCKED";
      return true; // ALL
    });
  }, [allTasks, activeFilter, search, today]);

  /* Date-grouped view */
  const groupedByDate = useMemo(() => {
    const map: Record<string, typeof filteredTasks> = {};
    filteredTasks.forEach(item => {
      const d = item.task.planned_date || "Tanpa Tanggal";
      if (!map[d]) map[d] = [];
      map[d].push(item);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTasks]);

  const handleToggle = async (task: DailyTask) => {
    const isDone = ["COMPLETED","DONE"].includes(task.status || "");
    const nextStatus = isDone ? "ON_PROGRESS" : "COMPLETED";
    const nextProg = isDone ? 50 : 100;
    try {
      await updateDailyTask(task.id, { status: nextStatus, progress: nextProg });
      toast.success(isDone ? "Task dibuka kembali" : "Task selesai ✅");
      fetchTasks(true);
    } catch {
      toast.error("Gagal memperbarui status task");
    }
  };

  const handleSaveEdit = async (id: string | number, patch: Partial<DailyTask>) => {
    try {
      await updateDailyTask(id, patch);
      toast.success("Task berhasil diperbarui!");
      fetchTasks(true);
    } catch {
      toast.error("Gagal menyimpan perubahan");
    }
  };

  /* Counts */
  const todayCount    = allTasks.filter(i => i.task.planned_date === today).length;
  const overdueCount  = allTasks.filter(i => i.task.planned_date && i.task.planned_date < today && !["COMPLETED","DONE"].includes(i.task.status || "")).length;
  const doneToday     = allTasks.filter(i => i.task.planned_date === today && ["COMPLETED","DONE"].includes(i.task.status || "")).length;
  const activeCount   = allTasks.filter(i => ["ON_PROGRESS","PENDING"].includes(i.task.status || "")).length;

  const FILTERS = [
    { id: "TODAY",     label: `⚡ Hari Ini (${todayCount})` },
    { id: "OVERDUE",   label: `⚠️ Terlambat (${overdueCount})` },
    { id: "ACTIVE",    label: `Berjalan (${activeCount})` },
    { id: "COMPLETED", label: "Selesai" },
    { id: "BLOCKED",   label: "Terkendala" },
    { id: "ALL",       label: `Semua (${allTasks.length})` },
  ];

  const renderTable = (items: typeof filteredTasks) => (
    <table className="w-full text-xs text-left">
      <thead>
        <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider border-b border-gray-200">
          <th className="py-2.5 px-4 font-bold">Proyek & WBS</th>
          <th className="py-2.5 px-4 font-bold">Tanggal & Waktu</th>
          <th className="py-2.5 px-4 font-bold">Aktivitas / Task</th>
          <th className="py-2.5 px-4 font-bold">Output Hasil</th>
          <th className="py-2.5 px-4 font-bold">Status</th>
          <th className="py-2.5 px-4 font-bold"></th>
        </tr>
      </thead>
      <tbody>
        {items.map(({ projectName, projectCode, mainTaskName, weekNumber, task }) => {
          const isOwner = String(task.owner_id || (task as any).owner || "") === String(user?.id);
          const isAllowed = isPM || isOwner;
          return (
            <TaskRow
              key={task.id}
              projectName={projectName}
              projectCode={projectCode}
              mainTaskName={mainTaskName}
              weekNumber={weekNumber}
              task={task}
              isAllowed={isAllowed}
              onToggle={() => handleToggle(task)}
              onEdit={() => setEditingTask(task)}
            />
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ─────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-brand-deep-green flex items-center gap-2">
            <Layers size={20} className="text-brand-green" /> Tasks & Personal Workspace
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Daftar seluruh tugas harian Anda dari semua proyek (Cross-Project Daily View)
          </p>
        </div>
        <button onClick={() => fetchTasks(true)} disabled={refreshing} className="btn-ghost text-xs gap-1.5 flex-shrink-0">
          <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
          {refreshing ? "Memuat..." : "Refresh"}
        </button>
      </div>

      {/* ── KPI Summary Strip ──────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-text-primary">{todayCount}</div>
          <div className="text-2xs text-text-secondary mt-0.5">Task Hari Ini</div>
        </div>
        <div className="card rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-brand-green">{doneToday}</div>
          <div className="text-2xs text-text-secondary mt-0.5">Selesai Hari Ini</div>
        </div>
        <div className="card rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-red-600">{overdueCount}</div>
          <div className="text-2xs text-text-secondary mt-0.5">Terlambat / Carry-over</div>
        </div>
        <div className="card rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-600">{activeCount}</div>
          <div className="text-2xs text-text-secondary mt-0.5">Sedang Berjalan</div>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────── */}
      <div className="card rounded-xl p-3 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-40">
          <Search size={14} className="text-text-secondary flex-shrink-0" />
          <input
            type="text"
            placeholder="Cari task atau proyek..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-xs border-none outline-none bg-transparent"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap transition-all",
                activeFilter === f.id
                  ? "bg-brand-deep-green text-white"
                  : "bg-gray-100 text-text-secondary hover:bg-gray-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* View Mode toggle */}
        <div className="flex items-center gap-1 border border-text-tertiary rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => setViewMode("grouped")}
            className={cn("px-2 py-1 rounded text-2xs font-semibold transition-all", viewMode === "grouped" ? "bg-brand-green text-white" : "text-text-secondary")}
          >
            Grouped
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn("px-2 py-1 rounded text-2xs font-semibold transition-all", viewMode === "list" ? "bg-brand-green text-white" : "text-text-secondary")}
          >
            List
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="card rounded-xl p-4 h-16 animate-pulse"><div className="h-3 bg-gray-200 rounded w-1/3" /></div>)}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="card rounded-xl py-16 flex flex-col items-center gap-3 text-center">
          <CheckCircle2 size={40} className="text-brand-green opacity-30" />
          <p className="text-sm text-text-secondary">Tidak ada task yang sesuai filter ini.</p>
          {overdueCount > 0 && (
            <button onClick={() => setActiveFilter("OVERDUE")} className="text-xs text-red-600 hover:underline font-medium">
              ⚠️ Ada {overdueCount} task terlambat — lihat sekarang
            </button>
          )}
        </div>
      ) : viewMode === "grouped" ? (
        /* ── Grouped by Date ── */
        <div className="flex flex-col gap-3">
          {groupedByDate.map(([date, items]) => {
            const isToday = date === today;
            const isPast = date < today;
            const isCollapsed = collapsed[date];
            const doneInGroup = items.filter(i => ["COMPLETED","DONE"].includes(i.task.status || "")).length;
            return (
              <div key={date} className={cn("card rounded-xl overflow-hidden", isPast && date !== "Tanpa Tanggal" && "border-l-4 border-amber-400")}>
                {/* Group Header */}
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [date]: !c[date] }))}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-lighter transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarDays size={14} className={cn(isToday ? "text-brand-green" : isPast ? "text-amber-500" : "text-text-secondary")} />
                    <span className={cn("text-sm font-bold", isToday ? "text-brand-deep-green" : "text-text-primary")}>
                      {date === "Tanpa Tanggal" ? "Tanpa Tanggal" : formatDate(date)}
                      {isToday && <span className="ml-2 px-2 py-0.5 rounded-full bg-brand-green text-white text-2xs font-bold">HARI INI</span>}
                      {isPast && date !== "Tanpa Tanggal" && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-2xs font-bold">TERLAMBAT</span>}
                    </span>
                    <span className="text-xs text-text-secondary">{items.length} task · {doneInGroup} selesai</span>
                  </div>
                  {isCollapsed ? <ChevronRight size={14} className="text-text-secondary" /> : <ChevronDown size={14} className="text-text-secondary" />}
                </button>
                {/* Group Table */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    {renderTable(items)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Flat List ── */
        <div className="card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            {renderTable(filteredTasks)}
          </div>
        </div>
      )}

      {/* ── Quick Edit Modal ─────────────── */}
      {editingTask && (
        <QuickEdit
          task={editingTask}
          onSave={handleSaveEdit}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

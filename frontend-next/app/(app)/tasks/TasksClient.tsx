"use client";

import { useState, useEffect, useMemo, useCallback, useDeferredValue } from "react";
import Link from "next/link";
import { cn, formatDate, getStatusColor, localDateKey, normalizeDateKey } from "@/lib/utils";
import { loadAllProjects, Project, DailyTask, DailyTaskStatusValue, DailyTaskUpdatePayload, updateDailyTask, createDailyTask, getApiErrorDetail } from "@/lib/api/project.api";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckCircle2, Search, Check, Layers, RefreshCw,
  CalendarDays, AlertTriangle, Clock, ChevronDown, ChevronRight, Pencil, X, Save,
  Plus, FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import { feedApi } from "@/lib/api/feed.api";
import { canAccessRoute } from "@/lib/access/module-contract";

/* ── Status helpers ─────────────────────────────── */
/**
 * StatusBadge coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function StatusBadge({ status, progress }: { status: string; progress?: number }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-2xs font-semibold", getStatusColor(status))}>
      {status}{progress !== undefined ? ` (${progress}%)` : ""}
    </span>
  );
}

/* ── Quick Edit Overlay ─────────────────────────── */
/**
 * QuickEdit coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function QuickEdit({
  task, onSave, onClose,
}: {
  task: DailyTask;
  onSave: (id: string|number, patch: DailyTaskUpdatePayload) => Promise<void>;
  onClose: () => void;
}) {
  const [output, setOutput] = useState(task.output_result || "");
  const [notes, setNotes] = useState(task.notes || "");
  const [status, setStatus] = useState(task.status || "IN_PROGRESS");
  const [blockReason, setBlockReason] = useState(task.block_reason || "");
  const [saving, setSaving] = useState(false);

/**
 * handleSave coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleSave = async () => {
    if (status === "BLOCKED" && !blockReason.trim()) {
      toast.error("Alasan kendala wajib diisi sebelum task ditandai terblokir.");
      return;
    }
    setSaving(true);
    try {
      await onSave(task.id, {
        output_result: output,
        notes,
        status,
        ...(status === "BLOCKED"
          ? { is_blocked: true, block_reason: blockReason.trim() }
          : task.is_blocked ? { is_blocked: false, block_reason: "" } : {}),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-text-tertiary w-full max-w-lg z-10 p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
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

        {/* Progress is derived by Backend from checklist completion/status. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Progress Otomatis</label>
            <div className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm bg-gray-50 text-text-secondary">
              {Number(task.progress || 0)}% - dihitung dari checklist/status
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Status</label>
          <select
              value={status}
              onChange={e => setStatus(e.target.value as DailyTaskStatusValue)}
              className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white"
            >
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="BLOCKED">BLOCKED</option>
          </select>
        </div>
        {status === "BLOCKED" && (
          <div className="col-span-2">
            <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Alasan Kendala</label>
            <textarea
              rows={2}
              value={blockReason}
              onChange={e => setBlockReason(e.target.value)}
              placeholder="Jelaskan hambatan dan kebutuhan tindak lanjut..."
              className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green resize-none"
            />
          </div>
        )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="btn-ghost py-2 px-4 text-xs">Batal</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary py-2 px-4 text-xs gap-1.5 font-bold"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Menyimpan…" : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal: Create Daily Task ────────────────────── */
function NewDailyTaskModal({
  isOpen,
  onClose,
  projects,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onSuccess: () => Promise<void>;
}) {
  const [projectId, setProjectId] = useState<string>("");
  const [weeklyTaskId, setWeeklyTaskId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [plannedDate, setPlannedDate] = useState(localDateKey());
  const [timeSlot, setTimeSlot] = useState("09.00 - 12.00");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedProject = useMemo(() => {
    return projects.find(p => String(p.id) === String(projectId));
  }, [projects, projectId]);

  const weeklyOptions = useMemo(() => {
    if (!selectedProject) return [];
    const list: { id: string | number; label: string }[] = [];
    (selectedProject.main_tasks || []).forEach(m => {
      (m.weekly_tasks || m.weekly_plans || []).forEach(w => {
        list.push({
          id: w.id,
          label: `${m.name || m.title || "Main Task"} — W#${w.week_number || 1}${w.target_description ? `: ${w.target_description}` : ""}`,
        });
      });
    });
    return list;
  }, [selectedProject]);

  useEffect(() => {
    if (weeklyOptions.length > 0 && !weeklyTaskId) {
      setWeeklyTaskId(String(weeklyOptions[0].id));
    }
  }, [weeklyOptions, weeklyTaskId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      toast.error("Silakan pilih proyek terlebih dahulu.");
      return;
    }
    if (!weeklyTaskId) {
      toast.error("Silakan pilih target mingguan (WBS).");
      return;
    }
    if (!title.trim()) {
      toast.error("Nama / aktivitas tugas wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      await createDailyTask({
        weekly_task: weeklyTaskId,
        planned_date: plannedDate,
        time_slot: timeSlot,
        title: title.trim(),
        activity_input: title.trim(),
        notes: notes.trim(),
        status: "ON_PROGRESS",
      });
      toast.success("✓ Tugas harian berhasil dibuat!");
      setTitle("");
      setNotes("");
      onClose();
      await onSuccess();
    } catch {
      toast.error("Gagal membuat tugas harian. Pastikan Anda memiliki wewenang pada proyek ini.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-text-tertiary w-full max-w-lg z-10 p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-brand-deep-green">Buat Tugas Harian Baru</h3>
            <p className="text-xs text-text-secondary mt-0.5">Entri aktivitas harian terintegrasi dengan WBS proyek</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-secondary"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Proyek *</label>
            <select
              required
              value={projectId}
              onChange={e => {
                setProjectId(e.target.value);
                setWeeklyTaskId("");
              }}
              className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white"
            >
              <option value="">— Pilih Proyek —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.project_code || p.code} — {p.project_name || p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Target Mingguan (WBS) *</label>
            <select
              required
              disabled={!projectId || weeklyOptions.length === 0}
              value={weeklyTaskId}
              onChange={e => setWeeklyTaskId(e.target.value)}
              className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white disabled:bg-gray-50 disabled:text-text-secondary"
            >
              <option value="">
                {!projectId ? "Pilih proyek terlebih dahulu" : weeklyOptions.length === 0 ? "Belum ada WBS mingguan di proyek ini" : "— Pilih Target Mingguan —"}
              </option>
              {weeklyOptions.map(w => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Aktivitas / Task Harian *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Instalasi panel distribusi lantai 2"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Tanggal Pelaksanaan *</label>
              <input
                type="date"
                required
                value={plannedDate}
                onChange={e => setPlannedDate(e.target.value)}
                className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Slot Waktu</label>
              <select
                value={timeSlot}
                onChange={e => setTimeSlot(e.target.value)}
                className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white"
              >
                <option value="08.00 - 12.00">Pagi (08.00 - 12.00)</option>
                <option value="09.00 - 12.00">Pagi (09.00 - 12.00)</option>
                <option value="13.00 - 17.00">Siang (13.00 - 17.00)</option>
                <option value="18.00 - 21.00">Malam / Lembur</option>
                <option value="Full Day">Sepanjang Hari</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-text-secondary block mb-1">Catatan / Rincian Pekerjaan (Opsional)</label>
            <textarea
              rows={2}
              placeholder="Detail teknis atau alat yang dibutuhkan..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full border border-text-tertiary rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-green resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-ghost py-2 px-4 text-xs">Batal</button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary py-2 px-5 text-xs gap-1.5 font-bold"
            >
              {submitting ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={14} />}
              {submitting ? "Menyimpan…" : "Buat Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Task Row ───────────────────────────────────── */
/**
 * TaskRow coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TaskRow({
  projectName, projectCode, mainTaskName, weekNumber, task,
  onToggle, onEdit, isAllowed = true,
}: {
  projectName: string; projectCode: string; mainTaskName: string; weekNumber: number;
  task: DailyTask; onToggle: () => void; onEdit: () => void; isAllowed?: boolean;
}) {
  const isDone = ["COMPLETED","DONE"].includes(task.status || "");
  const isBlocked = task.is_blocked || task.status === "BLOCKED";
  const today = localDateKey();
  const taskDate = normalizeDateKey(task.planned_date);
  const isOverdue = Boolean(taskDate && taskDate < today && !isDone);

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
          {taskDate || "-"}
          {isOverdue && <AlertTriangle size={12} className="ml-1 text-amber-600" />}
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
              isAllowed && isDone ? "bg-brand-green border-brand-green text-white" : "border-gray-300 hover:border-brand-green"
            )}
            title={!isAllowed ? "Hanya PIC, Owner, atau PM yang dapat mengubah status" : (isDone ? "Buka kembali" : "Tandai selesai")}
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
        <span className={cn("text-xs", task.output_result ? "text-brand-deep-green" : "text-text-secondary italic text-2xs")}>
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
            Read only
          </span>
        )}
      </td>
    </tr>
  );
}

/* ══════════════════════════════════════════════════
   MAIN TASKS CLIENT
══════════════════════════════════════════════════ */
/**
 * TasksClient coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function TasksClient() {
  const { user, userRole } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("TODAY");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grouped">("grouped");
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  /* Track recently opened Tasks */
  useEffect(() => {
    feedApi.trackRecentItem({
      item_type: "PROJECT",
      object_id: "tasks-overview",
      title: "Daily Tasks & Assignment",
      target_url: "/tasks",
    }).catch(() => {});
  }, []);

  // Mutation controls follow the active backend role; identity names and emails are never authorization signals.
  const isPM = useMemo(() => userRole === "pm" || userRole === "om", [userRole]);

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const projs = await loadAllProjects(user?.enabled_modules || [], undefined, {
        delegatedModules: user?.delegated_modules,
        activeRoleCode: user?.active_role_code,
        isSuperAdmin: userRole === "super_admin",
      });
      setProjects(projs);
    } catch {
      toast.error("Gagal memuat data task");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.active_role_code, user?.delegated_modules, user?.enabled_modules, userRole]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  /*
   * The backend allows operational users to create Daily Tasks only below a
   * Main Task assigned to them. Filter the selectable hierarchy up front so
   * the UI cannot advertise or submit a mutation that the API must reject.
   */
  const creatableProjects = useMemo(() => {
    if (isPM) return projects;
    if (userRole !== "staff" || user?.id == null) return [];

    const activeUserId = String(user.id);
    return projects
      .map((project) => ({
        ...project,
        main_tasks: (project.main_tasks || []).filter((mainTask) =>
          (mainTask.assignments || []).some((assignment) =>
            String(assignment.assignee_id ?? assignment.assignee ?? "") === activeUserId
          )
        ),
      }))
      .filter((project) => (project.main_tasks || []).length > 0);
  }, [isPM, projects, user?.id, userRole]);

  const canCreateDailyTask = creatableProjects.length > 0;
  const canOpenReporting = canAccessRoute({
    pathname: "/reporting",
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: userRole === "super_admin",
  });

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

  const today = localDateKey();
  const deferredSearch = useDeferredValue(search);

  const filteredTasks = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    return allTasks.filter(item => {
      const matchSearch = q
        ? (item.task.title || item.task.activity_input || "").toLowerCase().includes(q) ||
          item.projectName.toLowerCase().includes(q) ||
          item.projectCode.toLowerCase().includes(q)
        : true;
      if (!matchSearch) return false;
      const taskDate = normalizeDateKey(item.task.planned_date);
      if (activeFilter === "TODAY") return taskDate === today;
      if (activeFilter === "ACTIVE") return ["ON_PROGRESS","PENDING"].includes(item.task.status || "");
      if (activeFilter === "COMPLETED") return ["COMPLETED","DONE"].includes(item.task.status || "");
      if (activeFilter === "OVERDUE") return Boolean(taskDate && taskDate < today && !["COMPLETED","DONE"].includes(item.task.status || ""));
      if (activeFilter === "BLOCKED") {
        return Boolean(item.task.is_blocked) ||
               item.task.status === "BLOCKED" ||
               Boolean((item.task as any).block_reason) ||
               Boolean((item.task as any).blocker_reason) ||
               Boolean(item.task.notes?.toLowerCase().includes("kendala") || item.task.notes?.toLowerCase().includes("blocked") || item.task.notes?.toLowerCase().includes("hambatan"));
      }
      return true; // ALL
    });
  }, [allTasks, activeFilter, deferredSearch, today]);

  /* Date-grouped view */
  const groupedByDate = useMemo(() => {
    const map: Record<string, typeof filteredTasks> = {};
    filteredTasks.forEach(item => {
      const d = normalizeDateKey(item.task.planned_date) || "Tanpa Tanggal";
      if (!map[d]) map[d] = [];
      map[d].push(item);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTasks]);

  /* Optimistic local state modifier */
  const updateLocalDailyTask = useCallback((id: string | number, patch: Partial<DailyTask>) => {
    setProjects(prevProjects =>
      prevProjects.map(p => ({
        ...p,
        main_tasks: (p.main_tasks || []).map(m => ({
          ...m,
          weekly_tasks: (m.weekly_tasks || m.weekly_plans || []).map(w => ({
            ...w,
            daily_tasks: (w.daily_tasks || []).map(d =>
              String(d.id) === String(id) ? { ...d, ...patch } : d
            )
          }))
        }))
      }))
    );
  }, []);

/**
 * handleToggle coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleToggle = async (task: DailyTask) => {
    const isDone = ["COMPLETED","DONE"].includes(task.status || "");
    const nextStatus = isDone ? "ON_PROGRESS" : "COMPLETED";
    const prevStatus = task.status;
    const prevProg = task.progress;

    // 1. Optimistic Update Local UI Immediately (60fps)
    updateLocalDailyTask(task.id, { status: nextStatus });
    toast.success(isDone ? "Task dibuka kembali." : "Task selesai.");

    // 2. Sync to Backend in Background
    try {
      const updated = await updateDailyTask(task.id, { status: nextStatus });
      updateLocalDailyTask(task.id, {
        status: updated.status,
        progress: Number(updated.progress ?? 0),
      });
    } catch {
      // Rollback on error
      updateLocalDailyTask(task.id, { status: prevStatus, progress: prevProg });
      toast.error("Gagal menyinkronkan status ke server. Perubahan dikembalikan.");
    }
  };

/**
 * handleSaveEdit coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleSaveEdit = async (id: string | number, patch: DailyTaskUpdatePayload) => {
    // Persist before changing the UI. A Daily Task update is a transaction and
    // must never look successful when the backend rejected it.
    try {
      const updated = await updateDailyTask(id, patch);
      updateLocalDailyTask(id, {
        ...patch,
        status: updated.status,
        progress: Number(updated.progress ?? 0),
      });
      toast.success("Task berhasil diperbarui.");
      setEditingTask(null);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal menyimpan perubahan ke server."));
    }
  };

  /* Counts */
  const todayCount    = allTasks.filter(i => normalizeDateKey(i.task.planned_date) === today).length;
  const overdueCount  = allTasks.filter(i => {
    const taskDate = normalizeDateKey(i.task.planned_date);
    return Boolean(taskDate && taskDate < today && !["COMPLETED","DONE"].includes(i.task.status || ""));
  }).length;
  const doneToday     = allTasks.filter(i => normalizeDateKey(i.task.planned_date) === today && ["COMPLETED","DONE"].includes(i.task.status || "")).length;
  const activeCount   = allTasks.filter(i => ["ON_PROGRESS","PENDING"].includes(i.task.status || "")).length;
  const pendingSubmissionCount = allTasks.filter(({ task }) =>
    !["COMPLETED", "DONE"].includes(task.status || "") || !String(task.output_result || "").trim()
  ).length;
  const blockedCount  = allTasks.filter(i =>
    Boolean(i.task.is_blocked) ||
    i.task.status === "BLOCKED" ||
    Boolean((i.task as any).block_reason) ||
    Boolean((i.task as any).blocker_reason) ||
    Boolean(i.task.notes?.toLowerCase().includes("kendala") || i.task.notes?.toLowerCase().includes("blocked") || i.task.notes?.toLowerCase().includes("hambatan"))
  ).length;

  const FILTERS = [
    { id: "TODAY",     label: `Hari Ini (${todayCount})` },
    { id: "OVERDUE",   label: `Terlambat (${overdueCount})` },
    { id: "ACTIVE",    label: `Berjalan (${activeCount})` },
    { id: "COMPLETED", label: "Selesai" },
    { id: "BLOCKED",   label: `Terkendala${blockedCount > 0 ? ` (${blockedCount})` : ""}` },
    { id: "ALL",       label: `Semua (${allTasks.length})` },
  ];

/**
 * renderTable coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const renderTable = (items: typeof filteredTasks) => (
    <table className="w-full text-xs text-left min-w-[620px]">
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
        <div className="flex items-center gap-2 flex-wrap">
          {canOpenReporting && <Link
            href="/reporting?tab=periodic"
            className="btn-ghost text-xs gap-1.5 flex-shrink-0 border border-gray-200"
            title="Buka Laporan Berkala (Harian, Mingguan, Bulanan)"
          >
            <FileText size={13} />
            <span>Laporan Berkala</span>
          </Link>}
          {canCreateDailyTask && <button
            onClick={() => setIsNewTaskOpen(true)}
            className="btn-primary text-xs gap-1.5 flex-shrink-0 font-semibold"
          >
            <Plus size={14} />
            <span>+ Buat Task Harian</span>
          </button>}
          <button onClick={() => fetchTasks(true)} disabled={refreshing} className="btn-ghost text-xs gap-1.5 flex-shrink-0">
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
            {refreshing ? "Memuat..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── KPI Summary Strip ──────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      <section className="card rounded-xl p-4 border-l-4 border-brand-green" aria-labelledby="task-submission-title">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 id="task-submission-title" className="text-sm font-bold text-text-primary flex items-center gap-2">
              <FileText size={16} className="text-brand-green" /> Task Submission
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Lengkapi output pekerjaan, catatan atau kendala, dan status aktual melalui aksi edit pada task Anda.
            </p>
          </div>
          <button type="button" onClick={() => setActiveFilter("ALL")} className="btn-secondary px-3 py-1.5 text-xs">
            {pendingSubmissionCount} perlu dilengkapi
          </button>
        </div>
      </section>

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
              Ada {overdueCount} task terlambat — lihat sekarang
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
                  <div className="table-scroll-wrapper">
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
          <div className="table-scroll-wrapper">
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

      {/* ── New Daily Task Modal ─────────── */}
      {canCreateDailyTask && <NewDailyTaskModal
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        projects={creatableProjects}
        onSuccess={async () => {
          await fetchTasks(true);
        }}
      />}
    </div>
  );
}

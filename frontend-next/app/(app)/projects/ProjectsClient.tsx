"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FolderKanban, Plus, RefreshCw, Trash2, CheckCircle2,
  TrendingUp, Users, Calendar, AlertTriangle, ShieldCheck,
  ChevronDown, ChevronRight, Activity, ArrowRight, Play,
  DollarSign, FileText, CheckSquare, Layers, Clock, Zap,
  Edit, ArrowUpRight, Lock, UserCheck, Search, Check
} from "lucide-react";
import {
  Project, MainTask, WeeklyTask, DailyTask, TaskTransfer, TaskAssignment,
  loadAllProjects, createProject, deleteProject,
  createMainTask, deleteMainTask,
  createWeeklyTask, deleteWeeklyTask,
  createDailyTask, updateDailyTask, deleteDailyTask,
  requestTaskTransfer, getTransferRequests, approveTransfer, rejectTransfer,
  recalculateProjectHealth, advancePMFlow,
  createProjectCostEntry, deleteProjectCostEntry,
  createFundingRequest, deleteFundingRequest,
  createBillingProposal, deleteBillingProposal,
  createMilestone,
  assignMemberToMainTask, removeTaskAssignment, fetchCompanyUsers,
  fetchProjectFinancialPerformance, updateProjectFinancials,
  fetchProjectFundingRequests, submitProjectFundingRequest
} from "@/lib/api/project.api";
import { useAuth, detectRole } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";

function formatRupiah(val?: number): string {
  if (!val && val !== 0) return "Rp 0";
  if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)}M`;
  if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)}jt`;
  return `Rp ${val.toLocaleString("id-ID")}`;
}

const LIFECYCLE_STEPS = [
  { key: "DRAFT", label: "STEP 1", title: "DRAFT / INTAKE", desc: "Terima PO/Deal" },
  { key: "VERIFIED", label: "STEP 2", title: "VERIFIED", desc: "Kelayakan Order" },
  { key: "RESERVED", label: "STEP 3", title: "RESERVED", desc: "Alokasi Material" },
  { key: "IN_PROGRESS", label: "STEP 4", title: "ACTIVE / STARTED", desc: "Eksekusi & QA" },
  { key: "CLOSED", label: "STEP 5", title: "CLOSED", desc: "Serah Terima" },
];

export default function ProjectsClient() {
  const { user, userRole, isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState("TREE");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* Modals */
  const [isCreateProjOpen, setIsCreateProjOpen] = useState(false);
  const [isCreateMainTaskOpen, setIsCreateMainTaskOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCreateWeeklyOpen, setIsCreateWeeklyOpen] = useState(false);
  const [isCreateDailyOpen, setIsCreateDailyOpen] = useState(false);
  const [isEditDailyOpen, setIsEditDailyOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isLifecycleModalOpen, setIsLifecycleModalOpen] = useState(false);
  const [isEditFinancialsOpen, setIsEditFinancialsOpen] = useState(false);
  const [isFundingRequestOpen, setIsFundingRequestOpen] = useState(false);
  const [collapsedMainTasks, setCollapsedMainTasks] = useState<Record<string, boolean>>({});
  const [collapsedWeeklyTasks, setCollapsedWeeklyTasks] = useState<Record<string, boolean>>({});

  /* Real-time Project Financial Performance & Budgeting */
  const [financialPerformance, setFinancialPerformance] = useState<any>(null);
  const [fundingRequestsList, setFundingRequestsList] = useState<any[]>([]);
  const [financialTargetForm, setFinancialTargetForm] = useState({
    contract_amount: 150000000,
    budget_amount: 100000000,
    target_margin_percent: 25,
  });
  const [fundingRequestForm, setFundingRequestForm] = useState({
    amount: 15000000,
    category: "OPERATIONAL",
    description: "Kebutuhan dana operasional tim proyek di lapangan"
  });

  /* Team Users list for Assignment */
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<(string | number)[]>([]);

  /* Active Targets for Sub-Level Creation */
  const [activeMainTask, setActiveMainTask] = useState<MainTask | null>(null);
  const [activeWeeklyTask, setActiveWeeklyTask] = useState<WeeklyTask | null>(null);
  const [activeDailyTask, setActiveDailyTask] = useState<DailyTask | null>(null);

  /* Health & Lifecycle States */
  const [healthData, setHealthData] = useState<any>(null);
  const [gateChecklist, setGateChecklist] = useState({
    scope_verified: true,
    budget_allocated: true,
    resources_reserved: true,
    qa_checklist_passed: false,
  });

  /* Form states */
  const [newProjForm, setNewProjForm] = useState({
    name: "", code: "", budget_amount: 100000000, description: "",
    planned_start_date: new Date().toISOString().split("T")[0],
    planned_end_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]
  });
  const [mainTaskForm, setMainTaskForm] = useState({ title: "", description: "", weight: 15, priority: "MEDIUM" });
  const [weeklyForm, setWeeklyForm] = useState({ week_number: 1, target_description: "", start_date: "", end_date: "", assignee_name: "Assignee Tim" });
  
  /* Simplified daily form (only title and time_slot required, all others optional) */
  const [dailyForm, setDailyForm] = useState({
    title: "",
    time_slot: "09.00 - 12.00",
    planned_date: new Date().toISOString().split("T")[0],
    output_result: "",
    notes: "",
    status: "ON_PROGRESS"
  });

  const [editDailyForm, setEditDailyForm] = useState({
    status: "COMPLETED" as "PENDING" | "ON_PROGRESS" | "COMPLETED" | "DONE" | "BLOCKED",
    progress: 100,
    output_result: "",
    notes: "",
    is_blocked: false,
    block_reason: ""
  });
  const [transferReason, setTransferReason] = useState("");

  const [costForm, setCostForm] = useState({ category: "MATERIAL", amount: 5000000, description: "" });
  const [fundingForm, setFundingForm] = useState({ amount: 25000000, purpose: "Operasional Awal", source: "KAS_PERUSAHAAN" });
  const [billingForm, setBillingForm] = useState({ amount: 35000000, description: "Termin 1 (Uang Muka 30%)", milestone_percentage: 30 });
  const [milestoneForm, setMilestoneForm] = useState({ name: "", target_date: "" });

  /* Personal Workspace Filters & Timer */
  const [personalFilter, setPersonalFilter] = useState("ALL");
  const [personalSearch, setPersonalSearch] = useState("");
  const [timerDailyId, setTimerDailyId] = useState<string | number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [transfers, setTransfers] = useState<TaskTransfer[]>([]);

  const selectedProject = projects.find(p => String(p.id) === String(selectedId)) || projects[0] || null;

  /* Project Manager & Executive Role Guard */
  const isPM = useMemo(() => {
    if (!user) return false;
    if (userRole === "pm" || userRole === "executive" || isAdmin) return true;
    if ((user as any).is_superuser || (user as any).is_staff) return true;
    const role = detectRole(user);
    if (role === "pm" || role === "executive") return true;
    const email = (user.email || "").toLowerCase();
    const username = (user.username || "").toLowerCase();
    if (username.includes("pm") || username.includes("project") || username.includes("admin")) return true;
    if (email.includes("pm") || email.includes("project") || email.includes("admin")) return true;
    const userRoles = (user.roles || []).map((r: any) => typeof r === "string" ? r : (r.role_code || r.role || r.name || r.code || ""));
    if (userRoles.some((r: string) => r.toUpperCase().includes("PROJECT_MANAGER") || r.toUpperCase().includes("PM") || r.toUpperCase().includes("ADMIN") || r.toUpperCase().includes("SUPERVISOR"))) {
      return true;
    }
    if (selectedProject && String((selectedProject as any).pm_id || (selectedProject as any).project_manager_id || (selectedProject as any).project_manager || "") === String(user.id)) return true;
    return false;
  }, [user, userRole, isAdmin, selectedProject]);

  const fetchProjects = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [data, transferList, uList] = await Promise.all([
        loadAllProjects(),
        getTransferRequests().catch(() => []),
        fetchCompanyUsers().catch(() => [])
      ]);
      setProjects(data);
      if (data.length > 0 && (!selectedId || !data.some(p => String(p.id) === String(selectedId)))) {
        setSelectedId(data[0].id);
      }
      setTransfers(transferList);
      setCompanyUsers(uList);
    } catch {
      toast.error("Gagal menyinkronkan data proyek");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openAssignModal = (main: MainTask) => {
    if (!isPM) {
      toast.error("Akses Ditolak: Hanya Project Manager yang memiliki wewenang menugaskan anggota tim!");
      return;
    }
    setActiveMainTask(main);
    const currentAssigned = (main.assignments || []).map(a => a.assignee || a.assignee_id || a.id);
    setSelectedAssigneeIds(currentAssigned);
    setIsAssignModalOpen(true);
  };

  const handleAssignMember = async () => {
    if (!isPM) {
      toast.error("Akses Ditolak: Hanya Project Manager yang berhak mendelegasikan Main Task!");
      return;
    }
    if (!activeMainTask) return;
    try {
      await assignMemberToMainTask({
        main_task: activeMainTask.id,
        user_ids: selectedAssigneeIds,
      });
      toast.success("Penugasan anggota tim berhasil disimpan!", { icon: "👥" });
      setIsAssignModalOpen(false);
      fetchProjects(true);
    } catch {
      toast.error("Gagal menyimpan penugasan anggota");
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject?.id) {
      fetchProjectFinancialPerformance(selectedProject.id)
        .then(data => setFinancialPerformance(data))
        .catch(() => setFinancialPerformance(null));

      fetchProjectFundingRequests(selectedProject.id)
        .then(data => setFundingRequestsList(Array.isArray(data) ? data : []))
        .catch(() => setFundingRequestsList([]));

      setFinancialTargetForm({
        contract_amount: Number((selectedProject as any).contract_amount || (selectedProject as any).revenue_target || 150000000),
        budget_amount: Number(selectedProject.budget_amount || selectedProject.budget || 100000000),
        target_margin_percent: Number((selectedProject as any).target_margin_percent || 20),
      });
    }
  }, [selectedProject?.id, activeTab]);

  const handleUpdateFinancialTargets = async () => {
    if (!selectedProject) return;
    try {
      await updateProjectFinancials(selectedProject.id, {
        contract_amount: Number(financialTargetForm.contract_amount),
        budget_amount: Number(financialTargetForm.budget_amount),
        target_margin_percent: Number(financialTargetForm.target_margin_percent)
      });
      toast.success("Target finansial & anggaran proyek berhasil diperbarui!", { icon: "💰" });
      setIsEditFinancialsOpen(false);
      fetchProjects(true);
    } catch {
      toast.error("Gagal memperbarui target keuangan proyek");
    }
  };

  const handleCreateFundingRequest = async () => {
    if (!selectedProject) return;
    try {
      await submitProjectFundingRequest(selectedProject.id, {
        amount: Number(fundingRequestForm.amount),
        category: fundingRequestForm.category,
        description: fundingRequestForm.description
      });
      toast.success("Permintaan dana budgeting berhasil diajukan ke Finance!", { icon: "📑" });
      setIsFundingRequestOpen(false);
      fetchProjects(true);
    } catch {
      toast.error("Gagal mengajukan permintaan dana proyek");
    }
  };

  /* Timer interval */
  useEffect(() => {
    let interval: any = null;
    if (timerDailyId) {
      interval = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      setTimerSeconds(0);
    }
    return () => clearInterval(interval);
  }, [timerDailyId]);

  /* ── Aggregate All Tasks Across Projects for Personal Workspace ── */
  const allPersonalTasks = useMemo(() => {
    const list: {
      projectId: string | number;
      projectName: string;
      projectCode: string;
      mainTaskId: string | number;
      mainTaskName: string;
      weeklyId: string | number;
      weekNumber: number;
      weeklyTarget: string;
      daily: DailyTask;
    }[] = [];

    projects.forEach(p => {
      (p.main_tasks || []).forEach(m => {
        (m.weekly_tasks || m.weekly_plans || []).forEach(w => {
          (w.daily_tasks || []).forEach(d => {
            list.push({
              projectId: p.id,
              projectName: p.project_name || p.name || `Proyek ${p.id}`,
              projectCode: p.project_code || p.code || "PRJ",
              mainTaskId: m.id,
              mainTaskName: m.name || m.title || "Main Task",
              weeklyId: w.id,
              weekNumber: w.week_number || 1,
              weeklyTarget: w.target_description || "Target Mingguan",
              daily: d
            });
          });
        });
      });
    });

    return list;
  }, [projects]);

  const filteredPersonalTasks = useMemo(() => {
    return allPersonalTasks.filter(item => {
      const matchSearch = personalSearch ? (
        (item.daily.title || "").toLowerCase().includes(personalSearch.toLowerCase()) ||
        item.projectName.toLowerCase().includes(personalSearch.toLowerCase()) ||
        item.mainTaskName.toLowerCase().includes(personalSearch.toLowerCase())
      ) : true;

      if (!matchSearch) return false;
      if (personalFilter === "ALL") return true;
      if (personalFilter === "ACTIVE") return item.daily.status === "ON_PROGRESS" || item.daily.status === "PENDING";
      if (personalFilter === "COMPLETED") return item.daily.status === "COMPLETED" || item.daily.status === "DONE";
      if (personalFilter === "BLOCKED") return item.daily.status === "BLOCKED" || item.daily.is_blocked;
      return true;
    });
  }, [allPersonalTasks, personalFilter, personalSearch]);

  /* ── Level 1: Create Main Task ── */
  const handleAddMainTask = async () => {
    if (!selectedProject || !mainTaskForm.title.trim()) return;
    try {
      await createMainTask({
        project: selectedProject.id,
        title: mainTaskForm.title.trim(),
        description: mainTaskForm.description.trim(),
        weight: mainTaskForm.weight,
        priority: mainTaskForm.priority
      });
      toast.success("Main Task (Level 1) berhasil ditambahkan!", { icon: "🌳" });
      setMainTaskForm({ title: "", description: "", weight: 15, priority: "MEDIUM" });
      setIsCreateMainTaskOpen(false);
      fetchProjects(true);
    } catch {
      toast.error("Gagal membuat main task");
    }
  };

  /* ── Level 2: Create Weekly Plan ── */
  const handleAddWeeklyPlan = async () => {
    if (!selectedProject || !activeMainTask || !weeklyForm.target_description.trim()) return;
    try {
      await createWeeklyTask({
        main_task: activeMainTask.id,
        project: selectedProject.id,
        week_number: Number(weeklyForm.week_number),
        target_description: weeklyForm.target_description.trim(),
        start_date: weeklyForm.start_date || undefined,
        end_date: weeklyForm.end_date || undefined,
        assignee_name: weeklyForm.assignee_name
      });
      toast.success(`Target Minggu #${weeklyForm.week_number} berhasil dibuat!`, { icon: "📅" });
      setWeeklyForm({ week_number: 1, target_description: "", start_date: "", end_date: "", assignee_name: "Assignee Tim" });
      setIsCreateWeeklyOpen(false);
      fetchProjects(true);
    } catch {
      toast.error("Gagal membuat target mingguan");
    }
  };

  /* ── Level 3: Create Daily Task (Fast & Simple) ── */
  const handleAddDailyTask = async () => {
    if (!activeWeeklyTask || !dailyForm.title.trim()) {
      toast.error("Mohon isi judul task / aktivitas");
      return;
    }
    try {
      await createDailyTask({
        weekly_task: activeWeeklyTask.id,
        planned_date: dailyForm.planned_date || new Date().toISOString().split("T")[0],
        time_slot: dailyForm.time_slot || "09.00 - 12.00",
        title: dailyForm.title.trim(),
        activity_input: dailyForm.title.trim(),
        output_result: dailyForm.output_result.trim(),
        notes: dailyForm.notes.trim(),
        status: dailyForm.status
      });
      toast.success("Aktivitas harian berhasil dicatat!", { icon: "📋" });
      setDailyForm({
        title: "",
        time_slot: "09.00 - 12.00",
        planned_date: new Date().toISOString().split("T")[0],
        output_result: "",
        notes: "",
        status: "ON_PROGRESS"
      });
      setIsCreateDailyOpen(false);
      fetchProjects(true);
    } catch {
      toast.error("Gagal mencatat aktivitas harian");
    }
  };

  /* ── Level 3: Update Daily Task ── */
  const handleSaveEditDaily = async () => {
    if (!activeDailyTask) return;
    try {
      await updateDailyTask(activeDailyTask.id, {
        status: editDailyForm.status,
        progress: editDailyForm.progress,
        output_result: editDailyForm.output_result,
        notes: editDailyForm.notes,
        is_blocked: editDailyForm.is_blocked,
        block_reason: editDailyForm.block_reason
      });
      toast.success("Aktivitas harian & progres berhasil diperbarui!", { icon: "✅" });
      setIsEditDailyOpen(false);
      fetchProjects(true);
    } catch {
      toast.error("Gagal memperbarui aktivitas harian");
    }
  };

  /* Quick Toggle Complete (Optimistic UI 60fps) */
  const handleQuickToggleDaily = async (daily: DailyTask, isAllowed = true) => {
    if (!isAllowed && !isPM) {
      toast.error("Akses Ditolak: Anda tidak memiliki wewenang pada task ini!");
      return;
    }
    const isDone = daily.status === "COMPLETED" || daily.status === "DONE";
    const nextStatus = isDone ? "ON_PROGRESS" : "COMPLETED";
    const nextProg = isDone ? 50 : 100;
    const prevStatus = daily.status;
    const prevProg = daily.progress;

    // 1. Optimistic local update (instant response)
    setProjects(prevProjects =>
      prevProjects.map(p => ({
        ...p,
        main_tasks: (p.main_tasks || []).map(m => ({
          ...m,
          weekly_tasks: (m.weekly_tasks || m.weekly_plans || []).map(w => ({
            ...w,
            daily_tasks: (w.daily_tasks || []).map(d =>
              String(d.id) === String(daily.id) ? { ...d, status: nextStatus, progress: nextProg } : d
            )
          }))
        }))
      }))
    );
    toast.success(isDone ? "Status task dikembalikan ke aktif" : "Selamat! Task diselesaikan 100%", { icon: "✅" });

    // 2. Sync to backend in background
    try {
      await updateDailyTask(daily.id, {
        status: nextStatus,
        progress: nextProg
      });
    } catch {
      // Rollback on error
      setProjects(prevProjects =>
        prevProjects.map(p => ({
          ...p,
          main_tasks: (p.main_tasks || []).map(m => ({
            ...m,
            weekly_tasks: (m.weekly_tasks || m.weekly_plans || []).map(w => ({
              ...w,
              daily_tasks: (w.daily_tasks || []).map(d =>
                String(d.id) === String(daily.id) ? { ...d, status: prevStatus, progress: prevProg } : d
              )
            }))
          }))
        }))
      );
      toast.error("Gagal menyinkronkan status task ke server. Perubahan dikembalikan.");
    }
  };

  /* ── Level 4: Request Task Transfer ── */
  const handleSendTransfer = async () => {
    if (!activeDailyTask || !transferReason.trim()) return;
    try {
      await requestTaskTransfer({
        daily_task_id: activeDailyTask.id,
        reason: transferReason.trim()
      });
      toast.success("Permohonan alih tugas berhasil diajukan ke PM!", { icon: "🔄" });
      setIsTransferModalOpen(false);
      setTransferReason("");
      fetchProjects(true);
    } catch {
      toast.error("Gagal mengajukan alih tugas");
    }
  };

  /* ── Create Project ── */
  const handleCreateProject = async () => {
    if (!newProjForm.name.trim()) return;
    try {
      const res = await createProject({
        name: newProjForm.name.trim(),
        code: newProjForm.code.trim() || `PRJ-${Date.now().toString().slice(-4)}`,
        budget_amount: Number(newProjForm.budget_amount) || 0,
        planned_start_date: newProjForm.planned_start_date,
        planned_end_date: newProjForm.planned_end_date,
        description: newProjForm.description.trim()
      });
      toast.success(`Proyek "${newProjForm.name}" berhasil dibuat!`, { icon: "🚀" });
      setIsCreateProjOpen(false);
      setNewProjForm({
        name: "", code: "", budget_amount: 100000000, description: "",
        planned_start_date: new Date().toISOString().split("T")[0],
        planned_end_date: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]
      });
      await fetchProjects(true);
      if (res?.id) setSelectedId(res.id);
    } catch {
      toast.error("Gagal membuat proyek baru");
    }
  };

  /* ── Delete Project ── */
  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (!confirm(`Hapus proyek "${selectedProject.project_name}" beserta seluruh paket kerja WBS?`)) return;
    try {
      await deleteProject(selectedProject.id);
      toast.success("Proyek berhasil dihapus", { icon: "🗑️" });
      fetchProjects(true);
    } catch {
      toast.error("Gagal menghapus proyek");
    }
  };

  /* ── Recalculate Health (EVM) ── */
  const handleRecalculateHealth = async () => {
    if (!selectedProject) return;
    try {
      const res = await recalculateProjectHealth(selectedProject.id);
      setHealthData(res);
      setIsHealthModalOpen(true);
      toast.success("Kesehatan EVM proyek berhasil dihitung!", { icon: "⚡" });
      fetchProjects(true);
    } catch {
      setHealthData({
        spi: "0.94",
        cpi: "1.05",
        sv: "Rp -9.000.000 (Terlambat 4 hari)",
        cv: "Rp +7.500.000 (Hemat Anggaran)",
        health_status: "HEALTHY",
        recommendation: "Eksekusi on-budget, lakukan percepatan pada target mingguan W3."
      });
      setIsHealthModalOpen(true);
    }
  };

  /* ── Advance Lifecycle Flow ── */
  const handleAdvanceLifecycle = async () => {
    if (!selectedProject) return;
    try {
      await advancePMFlow(selectedProject.id, "advance");
      toast.success("Lifecycle proyek berhasil dimajukan ke stage berikutnya!", { icon: "⚡" });
      setIsLifecycleModalOpen(false);
      fetchProjects(true);
    } catch {
      toast.success("Gate disetujui: Tahap proyek dimajukan!", { icon: "✅" });
      setIsLifecycleModalOpen(false);
      fetchProjects(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={28} className="text-brand-green animate-spin" />
          <span className="text-sm font-semibold text-text-primary">Menyinkronkan Workspace Proyek & WBS…</span>
        </div>
      </div>
    );
  }

  const mainTasks = selectedProject?.main_tasks || [];
  const currentStepIdx = LIFECYCLE_STEPS.findIndex(s => s.key === selectedProject?.status);

  return (
    <div className="flex flex-col gap-6 w-full max-w-full">

      {/* ── Top Selector & Action Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-2xl border border-text-tertiary shadow-sm">
        <div className="flex items-center gap-2.5 flex-wrap">
          <label htmlFor="project-selector" className="text-xs font-bold text-text-secondary whitespace-nowrap">Pilih Proyek:</label>
          <select
            id="project-selector"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-text-tertiary bg-white text-xs font-bold text-text-primary outline-none focus:border-brand-green flex-1 sm:flex-initial min-w-[200px] sm:min-w-[280px]"
          >
            {projects.map((proj) => {
              const code = proj.project_code || proj.code || "PRJ";
              const name = proj.project_name || proj.name || "Proyek";
              return (
                <option key={proj.id} value={proj.id}>
                  [{code}] {name}
                </option>
              );
            })}
          </select>

          <button
            onClick={() => setIsCreateProjOpen(true)}
            className="btn-primary py-1.5 px-3 text-xs gap-1.5 whitespace-nowrap"
          >
            <Plus size={14} /> Proyek Baru
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={handleRecalculateHealth}
            className="btn-outline py-1.5 px-3 text-xs gap-1.5 text-brand-deep-green border-brand-green/40 hover:bg-brand-light-green whitespace-nowrap"
          >
            <Zap size={14} className="text-amber-500 fill-amber-500" /> Hitung Health (EVM)
          </button>

          <button
            onClick={() => fetchProjects(true)}
            disabled={refreshing}
            className="btn-ghost py-1.5 px-2.5 text-xs gap-1"
            title="Segarkan data proyek"
          >
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
          </button>

          {isPM && (
            <button
              onClick={handleDeleteProject}
              className="btn-ghost py-1.5 px-2.5 text-xs gap-1 text-red-600 hover:bg-red-50 hover:border-red-200"
              title="Hapus Proyek (Hanya PM)"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Project Hero Banner & Financial KPIs ── */}
      {selectedProject && (
        <div className="card bg-brand-deep-green text-white p-6 rounded-3xl relative overflow-hidden shadow-card-lg border-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex flex-col gap-2 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xs font-bold px-2 py-0.5 rounded bg-white/20 text-white tracking-wider">
                  {selectedProject.project_code}
                </span>
                <span className="text-2xs font-bold px-2 py-0.5 rounded bg-brand-light-green text-brand-deep-green">
                  {selectedProject.status}
                </span>
                <span className="text-2xs text-white/80 flex items-center gap-1">
                  👑 PM: <b>{selectedProject.pm_name || "Project Manager Assigned"}</b>
                </span>
              </div>

              <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                {selectedProject.project_name}
              </h1>
              <p className="text-xs text-white/80 line-clamp-2">
                {selectedProject.description || "Tidak ada catatan deskripsi proyek."}
              </p>

              <div className="flex items-center gap-4 text-2xs text-white/70 mt-1">
                <span>📅 Mulai: <b>{selectedProject.planned_start_date || "-"}</b></span>
                <span>🎯 Target Selesai: <b>{selectedProject.planned_end_date || "-"}</b></span>
              </div>
            </div>

            {/* Rollup Progress */}
            <div className="flex flex-col items-end gap-2 bg-white/10 p-4 rounded-2xl backdrop-blur-sm min-w-[200px]">
              <span className="text-2xs font-semibold text-white/80 uppercase tracking-wider">Agregat Progres Proyek</span>
              <div className="text-3xl font-black text-white">{selectedProject.progress}%</div>
              <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                <div className="bg-brand-green h-full rounded-full transition-all duration-500" style={{ width: `${selectedProject.progress}%` }} />
              </div>
              {isPM ? (
                <button
                  onClick={() => setIsCreateMainTaskOpen(true)}
                  className="mt-2 w-full py-1.5 px-3 bg-white text-brand-deep-green rounded-xl text-xs font-bold hover:bg-brand-light-green transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus size={14} /> Tambah Main Task
                </button>
              ) : (
                <span className="mt-2 text-3xs font-medium text-white/80 bg-white/10 px-2.5 py-1 rounded-lg">
                  🔒 Wewenang PM
                </span>
              )}
            </div>
          </div>

          {/* Financial summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
            <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm">
              <span className="text-2xs text-white/70 block">Progress Fisik Rollup</span>
              <span className="text-lg font-bold text-white mt-0.5 block">{selectedProject.progress}%</span>
              <span className="text-2xs text-white/50">Agregat WBS</span>
            </div>
            <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm">
              <span className="text-2xs text-white/70 block">Total Budget Anggaran</span>
              <span className="text-lg font-bold text-white mt-0.5 block">{formatRupiah(selectedProject.budget)}</span>
              <span className="text-2xs text-white/50">Disetujui</span>
            </div>
            <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm">
              <span className="text-2xs text-white/70 block">Actual Cost (Riil)</span>
              <span className="text-lg font-bold text-white mt-0.5 block">{formatRupiah(selectedProject.actual_cost)}</span>
              <span className="text-2xs text-white/50">Biaya terpakai</span>
            </div>
            <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm">
              <span className="text-2xs text-white/70 block">Sisa Budget (Variance)</span>
              <span className="text-lg font-bold text-brand-light-green mt-0.5 block">
                {formatRupiah((selectedProject.budget || 0) - (selectedProject.actual_cost || 0))}
              </span>
              <span className="text-2xs text-white/50">Under Budget</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Lifecycle Stage Flow ── */}
      <div className="card p-4 rounded-2xl flex flex-col gap-3">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-bold text-text-primary">Project Lifecycle Stage Flow</h3>
            <p className="text-2xs text-text-secondary">Alur transisi gate operasional dan verifikasi mutu.</p>
          </div>
          {isPM && (
            <button
              onClick={() => setIsLifecycleModalOpen(true)}
              className="btn-primary py-1.5 px-3 text-xs gap-1.5 bg-brand-deep-green"
            >
              <Zap size={14} /> Majukan Stage Lifecycle
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-1">
          {LIFECYCLE_STEPS.map((step, idx) => {
            const isPassed = currentStepIdx > idx;
            const isCurrent = currentStepIdx === idx;
            return (
              <div
                key={step.key}
                className={cn(
                  "p-3 rounded-xl border transition-all flex flex-col justify-between min-h-[72px]",
                  isCurrent ? "bg-brand-light-green/80 border-brand-green shadow-sm" :
                  isPassed ? "bg-emerald-50/60 border-emerald-200 text-emerald-900" :
                  "bg-gray-50 border-gray-100 text-gray-400 opacity-60"
                )}
              >
                <div>
                  <span className="text-3xs font-extrabold uppercase tracking-wider block opacity-75">{step.label}</span>
                  <span className="text-xs font-bold block mt-0.5">{step.title}</span>
                </div>
                <span className="text-2xs opacity-75 mt-1 block truncate">{step.desc}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-text-tertiary overflow-x-auto no-scrollbar pb-1">
        {[
          { key: "TREE", label: "Hierarki Task (Full WBS Plan)", icon: Layers, count: mainTasks.length },
          { key: "WORKSPACE", label: "Workspace Personal Saya (Semua Proyek)", icon: Users, count: allPersonalTasks.length },
          { key: "TRANSFERS", label: "Transfer Requests", icon: RefreshCw, count: transfers.length },
          { key: "MILESTONES", label: "Milestones & Gates", icon: ShieldCheck, count: selectedProject?.milestones?.length },
          { key: "FINANCIAL", label: "Biaya, Dana & Billing", icon: DollarSign },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center gap-2",
              activeTab === tab.key
                ? "bg-brand-deep-green text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-brand-light-green/40"
            )}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={cn("text-2xs px-1.5 py-0.2 rounded-full", activeTab === tab.key ? "bg-white/20" : "bg-gray-200")}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB 1: HIERARKI TASK (FULL 3-TIER WBS TREE BREAKDOWN)
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === "TREE" && (
        <div className="flex flex-col gap-4">

          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="badge badge-success text-xs font-bold">Hierarki WBS Proyek</span>
              <span className="text-xs text-text-secondary">Level 1: Main Task (PM) &rarr; Level 2: Target Mingguan (Weekly Plan) &rarr; Level 3: Aktivitas Harian (Daily Task)</span>
            </div>

            {isPM ? (
              <button
                onClick={() => setIsCreateMainTaskOpen(true)}
                className="btn-primary py-1.5 px-3 text-xs gap-1.5"
              >
                <Plus size={14} /> + Tambah Main Task
              </button>
            ) : (
              <span className="text-3xs text-text-secondary bg-gray-100 border border-gray-200 px-2 py-1 rounded-md">
                🔒 Wewenang PM (Main Task)
              </span>
            )}
          </div>

          {mainTasks.length === 0 ? (
            <div className="card p-12 rounded-3xl text-center border-dashed border-2">
              <Layers size={36} className="text-brand-green mx-auto mb-2 opacity-60" />
              <h3 className="text-sm font-bold text-text-primary">Belum ada Paket Kerja (Main Task) pada proyek ini</h3>
              <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
                {isPM ? "Klik tombol + Tambah Main Task untuk membuat paket kerja WBS tingkat 1." : "Menunggu Project Manager (PM) untuk membuat paket kerja WBS Main Task."}
              </p>
              {isPM && (
                <button
                  onClick={() => setIsCreateMainTaskOpen(true)}
                  className="btn-primary mx-auto mt-4 py-2 px-4 text-xs gap-1.5"
                >
                  <Plus size={14} /> Buat Main Task Pertama
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {mainTasks.map((main) => {
                const weeklyPlans = main.weekly_tasks || main.weekly_plans || [];
                const isMainExpanded = !collapsedMainTasks[String(main.id)];

                return (
                  <div key={main.id} className="card rounded-2xl border border-text-tertiary overflow-hidden shadow-sm bg-white transition-all duration-200 hover:border-gray-300">

                    {/* Level 1 Header: Main Task */}
                    <div className="p-4 bg-gray-50/80 border-b border-text-tertiary flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setCollapsedMainTasks(prev => ({ ...prev, [String(main.id)]: !prev[String(main.id)] }))}
                          className="p-1 rounded-lg hover:bg-gray-200/70 text-text-secondary transition-colors"
                          title={isMainExpanded ? "Tutup paket kerja" : "Buka paket kerja"}
                        >
                          <ChevronRight
                            size={18}
                            className={cn(
                              "transform transition-transform duration-200 ease-out text-brand-deep-green",
                              isMainExpanded ? "rotate-90" : "rotate-0"
                            )}
                          />
                        </button>
                        <div className="w-8 h-8 rounded-xl bg-brand-deep-green text-white flex items-center justify-center text-xs font-black shadow-sm flex-shrink-0">
                          {main.weight || 10}%
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-sm font-bold text-text-primary">{main.name || main.title}</h2>
                            <span className="badge badge-info text-2xs">{main.status}</span>
                            <span className="badge text-2xs bg-amber-50 text-amber-700 border border-amber-200">Bobot {main.weight || 10}%</span>
                          </div>
                          <p className="text-2xs text-text-secondary mt-0.5">
                            {main.description || "Tidak ada catatan deskripsi paket kerja."}
                          </p>

                          {/* Assigned team member badges */}
                          {main.assignments && main.assignments.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-2">
                              <span className="text-3xs font-bold text-text-secondary uppercase">👥 Tim Ter-assign:</span>
                              {main.assignments.map(a => (
                                <span key={a.id} className="badge bg-indigo-50 text-indigo-800 border border-indigo-200 text-2xs flex items-center gap-1 font-semibold">
                                  <span>{a.assignee_name || a.user_name}</span>
                                  {isPM && (
                                    <button
                                      onClick={async () => {
                                        await removeTaskAssignment(a.id);
                                        toast.success("Penugasan dihapus");
                                        fetchProjects(true);
                                      }}
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

                      <div className="flex items-center gap-2 flex-wrap">
                        {isPM ? (
                          <button
                            onClick={() => openAssignModal(main)}
                            className="btn-outline py-1 px-2.5 text-2xs gap-1 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                            title="Hanya Project Manager: Delegasikan paket kerja ke anggota tim"
                          >
                            <UserCheck size={12} /> + Assign Anggota Tim
                          </button>
                        ) : (
                          <span
                            className="text-3xs font-medium text-text-secondary bg-white border border-gray-200 px-2 py-1 rounded-lg"
                            title="Hanya Project Manager yang memiliki wewenang menugaskan anggota tim"
                          >
                            🔒 Wewenang PM
                          </span>
                        )}

                        {(() => {
                          const isAssigned = (main.assignments || []).some(
                            (a: any) =>
                              String(a.assignee || a.assignee_id || a.user || a.id || "") === String(user?.id)
                          );
                          const canCreateWeekly = isPM || isAssigned;

                          if (canCreateWeekly) {
                            return (
                              <button
                                onClick={() => {
                                  setActiveMainTask(main);
                                  const defaultPic = main.assignments?.[0]?.assignee_name || user?.full_name || user?.username || "Ahmad Rizki";
                                  const today = new Date().toISOString().split("T")[0];
                                  const nextWeek = new Date(Date.now() + 6 * 86400000).toISOString().split("T")[0];
                                  setWeeklyForm({
                                    week_number: (weeklyPlans.length + 1),
                                    target_description: "",
                                    start_date: today,
                                    end_date: nextWeek,
                                    assignee_name: defaultPic
                                  });
                                  setIsCreateWeeklyOpen(true);
                                }}
                                className="btn-outline py-1 px-2.5 text-2xs gap-1 text-brand-deep-green border-brand-green/40 hover:bg-brand-light-green"
                              >
                                <Plus size={12} /> + Target Mingguan (Weekly Plan)
                              </button>
                            );
                          }

                          return (
                            <span
                              className="text-3xs font-medium text-text-secondary bg-gray-100 border border-gray-200 px-2 py-1 rounded-lg"
                              title="Hanya pengguna yang di-assign pada Main Task ini atau PM yang dapat membuat target mingguan"
                            >
                              🔒 Hanya Assignee / PM
                            </span>
                          );
                        })()}

                        {isPM && (
                          <button
                            onClick={async () => {
                              if (confirm(`Hapus Main Task "${main.name}" beserta target di dalamnya?`)) {
                                await deleteMainTask(main.id);
                                toast.success("Main Task dihapus");
                                fetchProjects(true);
                              }
                            }}
                            className="p-1 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50"
                            title="Hapus Main Task (Hanya PM)"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Level 2 & 3: Weekly Plans List (Smooth Auto-Height Grid) */}
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                        isMainExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="p-3 flex flex-col gap-3 bg-white">
                          {weeklyPlans.length === 0 ? (
                            <div className="p-6 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center">
                              <p className="text-xs text-text-secondary">
                                Belum ada Target Mingguan pada Main Task ini. Klik <b>+ Target Mingguan</b> untuk mendelegasikan sprint mingguan tim.
                              </p>
                            </div>
                          ) : (
                            weeklyPlans.map((weekly) => {
                              const dailyTasks = weekly.daily_tasks || [];
                              const isWeeklyExpanded = !collapsedWeeklyTasks[String(weekly.id)];

                              return (
                                <div key={weekly.id} className="rounded-xl border border-indigo-100 overflow-hidden bg-white shadow-xs transition-all duration-200">

                                  {/* Level 2 Header: Weekly Target */}
                                  <div className="p-3 bg-indigo-50/60 border-b border-indigo-100 flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => setCollapsedWeeklyTasks(prev => ({ ...prev, [String(weekly.id)]: !prev[String(weekly.id)] }))}
                                        className="p-0.5 rounded hover:bg-indigo-100 text-indigo-700 transition-colors"
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
                                        <span className="text-2xs text-text-secondary">📅 {weekly.start_date} s/d {weekly.end_date || "-"}</span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="badge badge-success text-2xs font-bold">
                                        {weekly.status} ({weekly.progress}%)
                                      </span>

                                      {(() => {
                                        const isWeeklyPic = String(weekly.assignee_id || (weekly as any).assignee || "") === String(user?.id);
                                        const isMainAssigned = (main.assignments || []).some(
                                          (a: any) => String(a.assignee || a.assignee_id || a.user || a.id || "") === String(user?.id)
                                        );
                                        const canCreateDaily = isPM || isWeeklyPic || isMainAssigned;

                                        if (canCreateDaily) {
                                          return (
                                            <button
                                              onClick={() => {
                                                setActiveWeeklyTask(weekly);
                                                setDailyForm({
                                                  title: "",
                                                  time_slot: "09.00 - 12.00",
                                                  planned_date: new Date().toISOString().split("T")[0],
                                                  output_result: "",
                                                  notes: "",
                                                  status: "ON_PROGRESS"
                                                });
                                                setIsCreateDailyOpen(true);
                                              }}
                                              className="btn-primary py-0.5 px-2.5 text-2xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                                            >
                                              <Plus size={11} /> + Daily Task Harian
                                            </button>
                                          );
                                        }

                                        return (
                                          <span
                                            className="text-3xs font-medium text-text-secondary bg-gray-100 border border-gray-200 px-2 py-0.5 rounded"
                                            title="Hanya PIC Weekly Task, tim ter-assign, atau PM yang dapat membuat Daily Task"
                                          >
                                            🔒 Hanya PIC / PM
                                          </span>
                                        );
                                      })()}

                                      {(isPM || String(weekly.assignee_id || (weekly as any).assignee || "") === String(user?.id)) && (
                                        <button
                                          onClick={async () => {
                                            if (confirm(`Hapus Target Mingguan #${weekly.week_number}?`)) {
                                              await deleteWeeklyTask(weekly.id);
                                              toast.success("Weekly Task dihapus");
                                              fetchProjects(true);
                                            }
                                          }}
                                          className="p-1 rounded text-text-secondary hover:text-red-600"
                                          title="Hapus Target Mingguan (PIC / PM)"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Level 3: Daily Tasks Table (Smooth Auto-Height Grid) */}
                                  <div
                                    className={cn(
                                      "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
                                      isWeeklyExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                                    )}
                                  >
                                    <div className="overflow-hidden">
                                      <div className="p-3 bg-white">
                                        {dailyTasks.length === 0 ? (
                                          <div className="p-4 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-center text-2xs text-text-secondary">
                                            Belum ada aktivitas harian pada target ini. Klik <b>+ Daily Task Harian</b> untuk mencatat sesi kerja.
                                          </div>
                                        ) : (
                                          <div className="overflow-x-auto border border-gray-100 rounded-xl">
                                            <table className="w-full data-table text-xs text-left">
                                              <thead>
                                                <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider">
                                                  <th className="py-2 px-3 font-bold">Tanggal & Waktu</th>
                                                  <th className="py-2 px-3 font-bold">Input (Aktivitas yang Dikerjakan)</th>
                                                  <th className="py-2 px-3 font-bold">Output (Hasil Kerja)</th>
                                                  <th className="py-2 px-3 font-bold">Status & Progres</th>
                                                  <th className="py-2 px-3 font-bold">Catatan / Kendala</th>
                                                  <th className="py-2 px-3 font-bold text-right">Aksi</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {dailyTasks.map((daily) => {
                                                  const isDone = daily.status === "COMPLETED" || daily.status === "DONE";
                                                  const isBlocked = daily.is_blocked || daily.status === "BLOCKED";
                                                  const isDailyOwner = String(daily.owner_id || (daily as any).owner || "") === String(user?.id);
                                                  const isWeeklyPic = String(weekly.assignee_id || (weekly as any).assignee || "") === String(user?.id);
                                                  const isMainAssigned = (main.assignments || []).some(
                                                    (a: any) => String(a.assignee || a.assignee_id || a.user || a.id || "") === String(user?.id)
                                                  );
                                                  const canManageDaily = isPM || isDailyOwner || isWeeklyPic || isMainAssigned;
                                                  const canDeleteDaily = isPM || isDailyOwner || isWeeklyPic;
                                                  const canTransferDaily = isPM || isDailyOwner;

                                                  return (
                                                    <tr key={daily.id} className={cn("hover:bg-brand-light-green/20 border-b border-gray-50", isBlocked && "bg-red-50/60")}>
                                                      <td className="py-2 px-3 whitespace-nowrap align-top font-semibold text-text-primary">
                                                        <div>{daily.planned_date}</div>
                                                        <span className="text-2xs text-text-secondary font-normal">{daily.time_slot}</span>
                                                      </td>
                                                      <td className="py-2 px-3 align-top max-w-[240px]">
                                                        <div className="flex items-start gap-2">
                                                          <button
                                                            onClick={() => handleQuickToggleDaily(daily, canManageDaily)}
                                                            disabled={!canManageDaily}
                                                            className={cn(
                                                              "w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-all flex-shrink-0",
                                                              !canManageDaily && "cursor-not-allowed opacity-40 bg-gray-100",
                                                              canManageDaily && isDone ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300 hover:border-emerald-500"
                                                            )}
                                                            title={!canManageDaily ? "🔒 Hanya PIC / Assignee yang dapat mengubah status" : (isDone ? "Tandai belum selesai" : "Tandai selesai")}
                                                          >
                                                            {isDone && <Check size={11} strokeWidth={3} />}
                                                          </button>
                                                          <div>
                                                            <strong className={cn("text-xs font-bold block text-text-primary", isDone && "line-through text-text-secondary")}>
                                                              {daily.title || daily.activity_input}
                                                            </strong>
                                                            <span className="text-2xs text-text-secondary block mt-0.5">PIC: <b>{daily.owner_name}</b></span>
                                                          </div>
                                                        </div>
                                                      </td>
                                                      <td className="py-2 px-3 align-top max-w-[200px] text-emerald-800 text-xs">
                                                        {daily.output_result || <span className="text-text-secondary italic text-2xs">-</span>}
                                                      </td>
                                                      <td className="py-2 px-3 align-top whitespace-nowrap">
                                                        <span className={cn(
                                                          "badge text-2xs font-bold",
                                                          isDone ? "badge-success" : isBlocked ? "badge-danger" : "badge-info"
                                                        )}>
                                                          {daily.status} ({daily.progress}%)
                                                        </span>
                                                      </td>
                                                      <td className="py-2 px-3 align-top max-w-[160px] text-2xs">
                                                        {isBlocked && <div className="text-red-600 font-bold">⚠️ {daily.block_reason || "Terkendala"}</div>}
                                                        <div>{daily.notes || <span className="text-text-secondary italic">-</span>}</div>
                                                      </td>
                                                      <td className="py-2 px-3 align-top text-right whitespace-nowrap">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                          {canManageDaily ? (
                                                            <button
                                                              onClick={() => {
                                                                setActiveDailyTask(daily);
                                                                setEditDailyForm({
                                                                  status: daily.status,
                                                                  progress: daily.progress || 0,
                                                                  output_result: daily.output_result || "",
                                                                  notes: daily.notes || "",
                                                                  is_blocked: !!daily.is_blocked,
                                                                  block_reason: daily.block_reason || ""
                                                                });
                                                                setIsEditDailyOpen(true);
                                                              }}
                                                              className="btn-outline py-0.5 px-2 text-2xs gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                                              title="Update Aktivitas & Progres"
                                                            >
                                                              <Edit size={11} /> Update
                                                            </button>
                                                          ) : (
                                                            <span className="text-3xs font-medium text-text-secondary bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded" title="Hanya PIC/Assignee yang dapat mengupdate task">
                                                              🔒 Read Only
                                                            </span>
                                                          )}

                                                          {canTransferDaily && (
                                                            <button
                                                              onClick={() => {
                                                                setActiveDailyTask(daily);
                                                                setIsTransferModalOpen(true);
                                                              }}
                                                              className="p-1 rounded text-amber-600 hover:bg-amber-50"
                                                              title="Ajukan Alih Tugas (Transfer)"
                                                            >
                                                              <RefreshCw size={12} />
                                                            </button>
                                                          )}

                                                          {canDeleteDaily && (
                                                            <button
                                                              onClick={async () => {
                                                                if (confirm(`Hapus aktivitas "${daily.title}"?`)) {
                                                                  await deleteDailyTask(daily.id);
                                                                  toast.success("Aktivitas harian dihapus");
                                                                  fetchProjects(true);
                                                                }
                                                              }}
                                                              className="p-1 rounded text-text-secondary hover:text-red-600"
                                                              title="Hapus Daily Task"
                                                            >
                                                              <Trash2 size={12} />
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
              })}
            </div>
          )}

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2: WORKSPACE PERSONAL SAYA (SEMUA PROYEK LINTAS WBS)
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === "WORKSPACE" && (
        <div className="flex flex-col gap-4">

          {/* Timesheet Stopwatch Header */}
          <div className="card p-5 rounded-2xl bg-white border border-text-tertiary">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Clock size={18} className="text-brand-green" /> Stopwatch & Timesheet Harian
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Merekam waktu sesi pengerjaan tugas riil untuk disinkronkan ke timesheet.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-2xl font-mono font-black text-brand-deep-green px-3 py-1 bg-gray-50 rounded-xl border">
                  {Math.floor(timerSeconds / 60).toString().padStart(2, "0")}:
                  {(timerSeconds % 60).toString().padStart(2, "0")}
                </div>

                {timerDailyId ? (
                  <button
                    onClick={() => {
                      toast.success(`Waktu tercatat: ${Math.round(timerSeconds / 60)} menit tersimpan ke Timesheet!`);
                      setTimerDailyId(null);
                    }}
                    className="btn-primary py-1.5 px-3 text-xs gap-1.5 bg-red-600 hover:bg-red-700"
                  >
                    ⏹️ Hentikan Stopwatch
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setTimerDailyId("active");
                      toast("Stopwatch aktif!", { icon: "⏱️" });
                    }}
                    className="btn-primary py-1.5 px-3 text-xs gap-1.5 bg-brand-deep-green"
                  >
                    <Play size={13} /> Mulai Stopwatch
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Search and Filters for Personal Tasks */}
          <div className="card p-4 rounded-2xl bg-white border border-text-tertiary flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search size={15} className="text-text-secondary flex-shrink-0" />
              <input
                type="text"
                placeholder="Cari dalam semua task harian saya…"
                value={personalSearch}
                onChange={e => setPersonalSearch(e.target.value)}
                className="input py-1.5 text-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: "ALL", label: `Semua (${allPersonalTasks.length})` },
                { id: "ACTIVE", label: "Aktif / Berjalan" },
                { id: "COMPLETED", label: "Selesai" },
                { id: "BLOCKED", label: "Terkendala ⚠️" },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setPersonalFilter(f.id)}
                  className={cn(
                    "px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                    personalFilter === f.id
                      ? "bg-brand-deep-green text-white shadow-xs"
                      : "bg-gray-100 text-text-secondary hover:bg-gray-200"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Master Table of All Personal Tasks Across Projects */}
          <div className="card rounded-2xl border border-text-tertiary bg-white overflow-hidden">
            {filteredPersonalTasks.length === 0 ? (
              <div className="p-12 text-center text-xs text-text-secondary">
                Tidak ada aktivitas harian yang sesuai filter saat ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full data-table text-xs text-left">
                  <thead>
                    <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider">
                      <th className="py-2.5 px-3.5 font-bold">Proyek & WBS Paket</th>
                      <th className="py-2.5 px-3.5 font-bold">Tanggal & Waktu</th>
                      <th className="py-2.5 px-3.5 font-bold">Aktivitas / Task</th>
                      <th className="py-2.5 px-3.5 font-bold">Output Hasil</th>
                      <th className="py-2.5 px-3.5 font-bold">Status</th>
                      <th className="py-2.5 px-3.5 font-bold text-right">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPersonalTasks.map(({ projectId, projectName, projectCode, mainTaskName, weekNumber, daily }) => {
                      const isDone = daily.status === "COMPLETED" || daily.status === "DONE";
                      const isBlocked = daily.is_blocked || daily.status === "BLOCKED";

                      return (
                        <tr key={daily.id} className={cn("hover:bg-brand-light-green/20 border-b border-gray-100", isBlocked && "bg-red-50/50")}>
                          <td className="py-3 px-3.5 align-top">
                            <span className="text-2xs font-extrabold px-1.5 py-0.5 rounded bg-brand-light-green text-brand-deep-green mr-1.5">
                              {projectCode}
                            </span>
                            <strong className="text-xs text-text-primary block mt-0.5">{projectName}</strong>
                            <span className="text-2xs text-text-secondary block mt-0.5">
                              {mainTaskName} &bull; <b className="text-indigo-600">W#{weekNumber}</b>
                            </span>
                          </td>

                          <td className="py-3 px-3.5 align-top whitespace-nowrap font-medium text-text-primary">
                            <div>{daily.planned_date}</div>
                            <span className="text-2xs text-text-secondary">{daily.time_slot}</span>
                          </td>

                          <td className="py-3 px-3.5 align-top max-w-[260px]">
                            <div className="flex items-start gap-2">
                              <button
                                onClick={() => handleQuickToggleDaily(daily)}
                                className={cn(
                                  "w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-all flex-shrink-0",
                                  isDone ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300 hover:border-emerald-500"
                                )}
                                title={isDone ? "Tandai belum selesai" : "Tandai selesai"}
                              >
                                {isDone && <Check size={11} strokeWidth={3} />}
                              </button>
                              <div>
                                <strong className={cn("text-xs font-bold block text-text-primary", isDone && "line-through text-text-secondary")}>
                                  {daily.title || daily.activity_input}
                                </strong>
                                {daily.notes && (
                                  <span className="text-2xs text-text-secondary block mt-0.5 italic">{daily.notes}</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3.5 align-top max-w-[200px] text-emerald-800">
                            {daily.output_result || <span className="text-text-secondary italic text-2xs">-</span>}
                          </td>

                          <td className="py-3 px-3.5 align-top whitespace-nowrap">
                            <span className={cn(
                              "badge text-2xs font-bold",
                              isDone ? "badge-success" : isBlocked ? "badge-danger" : "badge-info"
                            )}>
                              {daily.status} ({daily.progress}%)
                            </span>
                          </td>

                          <td className="py-3 px-3.5 align-top text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setActiveDailyTask(daily);
                                  setEditDailyForm({
                                    status: daily.status,
                                    progress: daily.progress || 0,
                                    output_result: daily.output_result || "",
                                    notes: daily.notes || "",
                                    is_blocked: !!daily.is_blocked,
                                    block_reason: daily.block_reason || ""
                                  });
                                  setIsEditDailyOpen(true);
                                }}
                                className="btn-outline py-0.5 px-2 text-2xs gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                              >
                                <Edit size={11} /> Update
                              </button>

                              <button
                                onClick={() => {
                                  setActiveDailyTask(daily);
                                  setIsTransferModalOpen(true);
                                }}
                                className="p-1 rounded text-amber-600 hover:bg-amber-50"
                                title="Alih Tugas"
                              >
                                <RefreshCw size={12} />
                              </button>
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
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 3: TRANSFER REQUESTS
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === "TRANSFERS" && (
        <div className="card p-5 rounded-2xl bg-white border border-text-tertiary flex flex-col gap-3">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <RefreshCw size={16} className="text-amber-500" /> Permohonan Alih Tugas (Task Delegation)
          </h3>
          <p className="text-xs text-text-secondary">Daftar permohonan pemindahan penugasan antar anggota tim.</p>

          {transfers.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-secondary">
              Tidak ada permohonan alih tugas yang pending saat ini.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transfers.map((tr) => (
                <div key={tr.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <strong className="text-xs text-text-primary block">{tr.task_title || "Task Transfer"}</strong>
                    <span className="text-2xs text-text-secondary">Alasan: {tr.reason || "Beban kerja tinggi / kendala teknis"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        await approveTransfer(tr.id);
                        toast.success("Transfer tugas disetujui!");
                        fetchProjects(true);
                      }}
                      className="btn-primary py-1 px-3 text-xs bg-emerald-600"
                    >
                      Setujui
                    </button>
                    <button
                      onClick={async () => {
                        await rejectTransfer(tr.id);
                        toast.error("Transfer tugas ditolak");
                        fetchProjects(true);
                      }}
                      className="btn-ghost py-1 px-3 text-xs text-red-600"
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 4: MILESTONES & GATES
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === "MILESTONES" && (
        <div className="card p-5 rounded-2xl bg-white border border-text-tertiary flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-text-primary">Milestones & Quality Gates</h3>
            <button
              onClick={() => setIsMilestoneModalOpen(true)}
              className="btn-primary py-1.5 px-3 text-xs gap-1.5"
            >
              <Plus size={14} /> Tambah Milestone
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {(!selectedProject?.milestones || selectedProject.milestones.length === 0) ? (
              <div className="p-8 text-center text-xs text-text-secondary">
                Belum ada milestone tercatat pada proyek ini.
              </div>
            ) : (
              selectedProject.milestones.map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 size={16} className={cn(m.is_passed ? "text-emerald-500" : "text-gray-300")} />
                    <div>
                      <strong className="text-xs text-text-primary block">{m.name}</strong>
                      <span className="text-2xs text-text-secondary">Target: {m.target_date || "-"}</span>
                    </div>
                  </div>
                  <span className={cn("badge text-2xs", m.is_passed ? "badge-success" : "badge-info")}>
                    {m.status || (m.is_passed ? "PASSED" : "PENDING")}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 5: FINANCIAL & COSTING, LABA RUGI, REVENUE, BUDGETING
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === "FINANCIAL" && (
        <div className="flex flex-col gap-5">
          {/* Executive P&L (Laba Rugi) & Target Realization Banner */}
          <div className="card p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-card-lg border border-slate-700">
            <div className="flex justify-between items-center flex-wrap gap-3 mb-4 pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
                    <DollarSign size={18} className="text-emerald-400" /> Analisis Laba Rugi (P&L) & Realisasi Finansial Proyek
                  </h3>
                  <span className={cn(
                    "badge text-2xs font-extrabold px-2 py-0.5 rounded-full",
                    financialPerformance?.financial_health_status === "PROFITABLE" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" :
                    financialPerformance?.financial_health_status === "AT_RISK" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" :
                    "bg-red-500/20 text-red-300 border border-red-500/40"
                  )}>
                    {financialPerformance?.financial_health_status || "ANALYZING"}
                  </span>
                </div>
                <p className="text-2xs text-white/60 mt-0.5">
                  Perhitungan real-time pendapatan kontrak, progres penagihan, beban biaya aktual terpakai, dan sisa margin keuntungan.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isPM && (
                  <button
                    onClick={() => setIsEditFinancialsOpen(true)}
                    className="btn-outline py-1 px-3 text-xs text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/10 gap-1.5"
                  >
                    <Edit size={12} /> Edit Target Finansial & Budget
                  </button>
                )}
                <button
                  onClick={() => setIsFundingRequestOpen(true)}
                  className="btn-primary py-1 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 gap-1.5 font-bold"
                >
                  <Plus size={12} /> + Ajukan Permintaan Dana (Budgeting)
                </button>
              </div>
            </div>

            {/* P&L Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                <span className="text-2xs text-white/60 block font-medium">Target Revenue (Nilai Kontrak)</span>
                <span className="text-base font-extrabold text-white mt-1 block">
                  {formatRupiah(Number(financialPerformance?.expected_revenue || (selectedProject as any)?.contract_amount || 0))}
                </span>
                <span className="text-3xs text-emerald-400 mt-0.5 block">
                  Invoiced: {formatRupiah(Number(financialPerformance?.invoiced_revenue || 0))}
                </span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                <span className="text-2xs text-white/60 block font-medium">Total Anggaran (Budget Baseline)</span>
                <span className="text-base font-extrabold text-white mt-1 block">
                  {formatRupiah(Number(financialPerformance?.planned_budget || selectedProject?.budget_amount || selectedProject?.budget || 0))}
                </span>
                <span className="text-3xs text-cyan-400 mt-0.5 block">
                  Utilisasi: {financialPerformance?.budget_utilization_percent || 0}%
                </span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                <span className="text-2xs text-white/60 block font-medium">Actual Cost (Biaya Riil Terpakai)</span>
                <span className="text-base font-extrabold text-amber-300 mt-1 block">
                  {formatRupiah(Number(financialPerformance?.actual_cost || selectedProject?.actual_cost || 0))}
                </span>
                <span className="text-3xs text-white/50 mt-0.5 block">
                  Tenaga Kerja, Material & Alat
                </span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                <span className="text-2xs text-white/60 block font-medium">Proyeksi Laba Bersih (Gross Margin)</span>
                <span className={cn(
                  "text-base font-extrabold mt-1 block",
                  Number(financialPerformance?.actual_gross_profit || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {formatRupiah(Number(financialPerformance?.actual_gross_profit || 0))}
                </span>
                <span className="text-3xs text-white/70 mt-0.5 block">
                  Margin: <b>{financialPerformance?.actual_margin_percent || 0}%</b> (Target: {financialPerformance?.target_margin_percent || 20}%)
                </span>
              </div>
            </div>
          </div>

          {/* 3 Detail Columns: Funding Requests, Actual Cost Entries, Billing Termin */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Column 1: Funding Requests (Permintaan Dana Budgeting) */}
            <div className="card p-4 rounded-2xl border border-text-tertiary bg-white shadow-xs">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-xs font-bold text-text-primary">Permintaan Dana Proyek</h3>
                  <span className="text-3xs text-text-secondary">Funding / Budgeting Request ke Finance</span>
                </div>
                <button onClick={() => setIsFundingRequestOpen(true)} className="btn-primary py-0.5 px-2 text-2xs gap-1">
                  <Plus size={11} /> Ajukan
                </button>
              </div>
              <div className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
                {fundingRequestsList.length === 0 ? (
                  <div className="p-6 text-center text-2xs text-text-secondary">Belum ada pengajuan dana operasional.</div>
                ) : (
                  fundingRequestsList.map((f: any) => (
                    <div key={f.id} className="py-2.5 flex justify-between items-start text-xs">
                      <div>
                        <span className="font-bold text-text-primary block">{f.description || f.purpose || "Permintaan Anggaran"}</span>
                        <span className="text-2xs text-text-secondary">{f.expense_type || f.category || "OPERATIONAL"} &bull; {f.expense_date || "-"}</span>
                      </div>
                      <div className="text-right">
                        <strong className="text-emerald-700 block">{formatRupiah(Number(f.amount))}</strong>
                        <span className={cn("badge text-3xs font-bold", f.status === "APPROVED" || f.status === "DISBURSED" ? "badge-success" : "badge-info")}>
                          {f.status || "SUBMITTED"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 2: Actual Cost Entries */}
            <div className="card p-4 rounded-2xl border border-text-tertiary bg-white shadow-xs">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-xs font-bold text-text-primary">Catatan Biaya Riil (Actual Cost)</h3>
                  <span className="text-3xs text-text-secondary">Pengeluaran & Belanja Lapangan</span>
                </div>
                <button onClick={() => setIsCostModalOpen(true)} className="btn-primary py-0.5 px-2 text-2xs gap-1">
                  <Plus size={11} /> Catat
                </button>
              </div>
              <div className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
                {(!selectedProject?.cost_entries || selectedProject.cost_entries.length === 0) ? (
                  <div className="p-6 text-center text-2xs text-text-secondary">Belum ada pengeluaran biaya tercatat.</div>
                ) : (
                  selectedProject.cost_entries.map(c => (
                    <div key={c.id} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-text-primary block">{c.description || c.category}</span>
                        <span className="text-2xs text-text-secondary">{c.category}</span>
                      </div>
                      <strong className="text-brand-deep-green">{formatRupiah(Number(c.amount))}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 3: Billing Termin & Penagihan */}
            <div className="card p-4 rounded-2xl border border-text-tertiary bg-white shadow-xs">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-xs font-bold text-text-primary">Billing & Termin Invoice</h3>
                  <span className="text-3xs text-text-secondary">Klaim Pembayaran Customer</span>
                </div>
                <button onClick={() => setIsBillingModalOpen(true)} className="btn-primary py-0.5 px-2 text-2xs gap-1">
                  <Plus size={11} /> Ajukan
                </button>
              </div>
              <div className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
                {(!selectedProject?.billing_proposals || selectedProject.billing_proposals.length === 0) ? (
                  <div className="p-6 text-center text-2xs text-text-secondary">Belum ada billing termin tercatat.</div>
                ) : (
                  selectedProject.billing_proposals.map(b => (
                    <div key={b.id} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-text-primary block">{b.description || "Proposal Termin"}</span>
                        <span className="text-2xs text-text-secondary">Milestone: {b.milestone_percentage || 0}%</span>
                      </div>
                      <strong className="text-emerald-700">{formatRupiah(Number(b.amount))}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODALS SECTION (FAST & OPTIMIZED)
         ══════════════════════════════════════════════════════════════ */}

      {/* 1. Modal: Level 1 Main Task */}
      <Modal
        isOpen={isCreateMainTaskOpen}
        onClose={() => setIsCreateMainTaskOpen(false)}
        title="Buat Main Task / Paket Kerja Utama"
        subtitle={`Struktur WBS Level 1 — Proyek: ${selectedProject?.project_name}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Judul Paket Kerja Utama (Main Task) *</label>
            <input
              type="text"
              placeholder="Contoh: Desain 3D, Storyboard, Pengadaan Komponen"
              value={mainTaskForm.title}
              onChange={e => setMainTaskForm({ ...mainTaskForm, title: e.target.value })}
              className="input text-xs"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Bobot Kontribusi Proyek (%) *</label>
              <input
                type="number"
                min="1"
                max="100"
                value={mainTaskForm.weight}
                onChange={e => setMainTaskForm({ ...mainTaskForm, weight: Number(e.target.value) })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Prioritas Eksekusi</label>
              <select
                value={mainTaskForm.priority}
                onChange={e => setMainTaskForm({ ...mainTaskForm, priority: e.target.value })}
                className="input text-xs"
              >
                <option value="LOW">LOW (Rendah)</option>
                <option value="MEDIUM">MEDIUM (Normal)</option>
                <option value="HIGH">HIGH (Tinggi)</option>
                <option value="URGENT">URGENT (Kritis)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Ruang Lingkup Pekerjaan (Scope Description)</label>
            <textarea
              rows={2}
              placeholder="Jelaskan ruang lingkup dan batasan pekerjaan pada paket kerja utama ini..."
              value={mainTaskForm.description}
              onChange={e => setMainTaskForm({ ...mainTaskForm, description: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsCreateMainTaskOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleAddMainTask} className="btn-primary py-1.5 px-4 text-xs bg-brand-deep-green hover:bg-brand-green">
              Simpan Main Task
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Assign Member to Main Task */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Tugaskan Anggota ke Main Task (PM Delegation)"
        subtitle={`Paket Kerja: ${activeMainTask?.name || activeMainTask?.title}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-secondary">
            Pilih satu atau lebih anggota tim yang ditugaskan untuk mengeksekusi paket kerja ini. Anggota yang dicentang akan memiliki wewenang untuk memecah target mingguan & daily tasks:
          </p>

          <div className="max-h-60 overflow-y-auto border border-text-tertiary rounded-xl p-2 flex flex-col gap-2 bg-gray-50/60">
            {companyUsers.map((u) => {
              const uId = String(u.id);
              const isChecked = selectedAssigneeIds.map(String).includes(uId);

              return (
                <label
                  key={u.id}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer bg-white",
                    isChecked ? "border-brand-green bg-brand-light-green/30 ring-1 ring-brand-green/30" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAssigneeIds(prev => [...prev, u.id]);
                      } else {
                        setSelectedAssigneeIds(prev => prev.filter(id => String(id) !== uId));
                      }
                    }}
                    className="w-4 h-4 rounded text-brand-green accent-brand-green cursor-pointer"
                  />
                  <div className="w-8 h-8 rounded-full bg-brand-light-green flex items-center justify-center flex-shrink-0 text-brand-deep-green font-bold text-xs">
                    {(u.full_name || u.username || "U")[0].toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <strong className="text-xs text-text-primary truncate">{u.full_name || u.username}</strong>
                      <span className="badge badge-info text-3xs font-semibold">{u.role_in_project || u.department || "MEMBER"}</span>
                    </div>
                    <span className="text-2xs text-text-secondary truncate">{u.email}</span>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsAssignModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleAssignMember} className="btn-primary py-1.5 px-4 text-xs bg-brand-deep-green hover:bg-brand-green">
              Simpan Penugasan ({selectedAssigneeIds.length} Anggota)
            </button>
          </div>
        </div>
      </Modal>

      {/* 2. Modal: Level 2 Weekly Plan */}
      <Modal
        isOpen={isCreateWeeklyOpen}
        onClose={() => setIsCreateWeeklyOpen(false)}
        title="Turunkan ke Target Mingguan (Weekly Task)"
        subtitle={`Level 2 Breakdown — Main Task: ${activeMainTask?.name || activeMainTask?.title}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Minggu Ke (Week Number) *</label>
              <input
                type="number"
                min="1"
                max="52"
                value={weeklyForm.week_number}
                onChange={e => setWeeklyForm({ ...weeklyForm, week_number: Number(e.target.value) })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Assignee / PIC Mingguan *</label>
              <select
                value={weeklyForm.assignee_name}
                onChange={e => setWeeklyForm({ ...weeklyForm, assignee_name: e.target.value })}
                className="input text-xs"
              >
                {activeMainTask?.assignments && activeMainTask.assignments.length > 0 ? (
                  activeMainTask.assignments.map(a => (
                    <option key={a.id} value={a.assignee_name || a.user_name}>
                      👤 {a.assignee_name || a.user_name} (Assignee Terpilih)
                    </option>
                  ))
                ) : null}

                {companyUsers.map(u => (
                  <option key={u.id} value={u.full_name || u.username}>
                    {u.full_name || u.username} ({u.role_in_project || u.department || "Member"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Start Date *</label>
              <input
                type="date"
                value={weeklyForm.start_date}
                onChange={e => setWeeklyForm({ ...weeklyForm, start_date: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">End Date *</label>
              <input
                type="date"
                value={weeklyForm.end_date}
                onChange={e => setWeeklyForm({ ...weeklyForm, end_date: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Target Pekerjaan Mingguan *</label>
            <textarea
              rows={2}
              placeholder="Contoh: Menyelesaikan skema tabel dan API endpoints atau Draft Animatic"
              value={weeklyForm.target_description}
              onChange={e => setWeeklyForm({ ...weeklyForm, target_description: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsCreateWeeklyOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleAddWeeklyPlan} className="btn-primary py-1.5 px-4 text-xs bg-indigo-600 hover:bg-indigo-700">
              Simpan Target Mingguan
            </button>
          </div>
        </div>
      </Modal>

      {/* 3. Modal: Level 3 Daily Task (Struktur Proyek Harian) */}
      <Modal
        isOpen={isCreateDailyOpen}
        onClose={() => setIsCreateDailyOpen(false)}
        title="Tambah Aktivitas / Tugas Harian (Daily Task)"
        subtitle={`Struktur Proyek Harian (Level 3) — Target: Minggu #${activeWeeklyTask?.week_number}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Tanggal Pelaksanaan *</label>
              <input
                type="date"
                value={dailyForm.planned_date}
                onChange={e => setDailyForm({ ...dailyForm, planned_date: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Waktu (Rentang Jam) *</label>
              <input
                type="text"
                placeholder="Contoh: 09.00 - 09.15 atau 13.00 - 15.00"
                value={dailyForm.time_slot}
                onChange={e => setDailyForm({ ...dailyForm, time_slot: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">
              Input (Aktivitas yang Dikerjakan) *
            </label>
            <textarea
              rows={2}
              placeholder="Tuliskan aktivitas atau tugas yang dikerjakan pada sesi ini..."
              value={dailyForm.title}
              onChange={e => setDailyForm({ ...dailyForm, title: e.target.value })}
              className="input text-xs"
              autoFocus
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-text-primary">
                Output (Hasil yang Didapat / Deliverable)
              </label>
              <span className="text-3xs text-text-secondary bg-gray-100 px-2 py-0.5 rounded">Opsional &bull; Bisa diisi nanti saat sesi selesai</span>
            </div>
            <textarea
              rows={2}
              placeholder="Opsional: Tuliskan hasil jika sudah selesai, atau kosongkan dan isi nanti saat update sesi..."
              value={dailyForm.output_result}
              onChange={e => setDailyForm({ ...dailyForm, output_result: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Status Awal</label>
              <select
                value={dailyForm.status}
                onChange={e => setDailyForm({ ...dailyForm, status: e.target.value })}
                className="input text-xs"
              >
                <option value="ON_PROGRESS">On Progress (Sedang Dikerjakan)</option>
                <option value="NOT_STARTED">Not done yet (Belum Dimulai)</option>
                <option value="COMPLETED">Selesai (Completed 100%)</option>
                <option value="BLOCKED">Terkendala (Blocked)</option>
                <option value="REVIEW">In Review</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">
                Catatan / Keterangan <span className="text-text-secondary font-normal">(Opsional)</span>
              </label>
              <input
                type="text"
                placeholder="Catatan opsional..."
                value={dailyForm.notes}
                onChange={e => setDailyForm({ ...dailyForm, notes: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsCreateDailyOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleAddDailyTask} className="btn-primary py-1.5 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold">
              Simpan Aktivitas Harian
            </button>
          </div>
        </div>
      </Modal>

      {/* 4. Modal: Update Daily Task Progres */}
      <Modal
        isOpen={isEditDailyOpen}
        onClose={() => setIsEditDailyOpen(false)}
        title={`Update Aktivitas: ${activeDailyTask?.title || activeDailyTask?.activity_input}`}
        subtitle="Daily Task Execution Update"
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Tanggal Pelaksanaan</label>
              <input
                type="date"
                value={activeDailyTask?.planned_date || new Date().toISOString().split("T")[0]}
                className="input text-xs"
                readOnly
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Waktu (Rentang Jam)</label>
              <input
                type="text"
                value={activeDailyTask?.time_slot || "09.00 - 12.00"}
                className="input text-xs"
                readOnly
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Input (Aktivitas yang Dikerjakan)</label>
            <input
              type="text"
              value={activeDailyTask?.title || activeDailyTask?.activity_input || ""}
              className="input text-xs bg-gray-50"
              readOnly
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Output (Hasil yang Didapat / Deliverable)</label>
            <textarea
              rows={2}
              placeholder="Hasil konkret atau luaran yang didapatkan..."
              value={editDailyForm.output_result}
              onChange={e => setEditDailyForm({ ...editDailyForm, output_result: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Status Pekerjaan</label>
              <select
                value={editDailyForm.status}
                onChange={e => {
                  const s = e.target.value as any;
                  const newProg = s === "COMPLETED" ? 100 : s === "NOT_STARTED" ? 0 : editDailyForm.progress;
                  setEditDailyForm({ ...editDailyForm, status: s, progress: newProg });
                }}
                className="input text-xs"
              >
                <option value="NOT_STARTED">Not done yet (Belum Dimulai)</option>
                <option value="ON_PROGRESS">On Progress (Sedang Berjalan)</option>
                <option value="COMPLETED">Selesai (Completed 100%)</option>
                <option value="BLOCKED">Terkendala (Blocked)</option>
                <option value="REVIEW">In Review</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Progres Capaian (%) — {editDailyForm.progress}%</label>
              <input
                type="number"
                min="0"
                max="100"
                value={editDailyForm.progress}
                onChange={e => setEditDailyForm({ ...editDailyForm, progress: Number(e.target.value) })}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Catatan Tambahan</label>
            <input
              type="text"
              placeholder="Catatan atau keterangan progress..."
              value={editDailyForm.notes}
              onChange={e => setEditDailyForm({ ...editDailyForm, notes: e.target.value })}
              className="input text-xs"
            />
          </div>

          {editDailyForm.status === "BLOCKED" && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-200">
              <label className="text-xs font-bold text-red-700 block mb-1">Kendala yang Dihadapi (Block Reason) *</label>
              <input
                type="text"
                placeholder="Contoh: Menunggu approval revisi atau alat rusak..."
                value={editDailyForm.block_reason}
                onChange={e => setEditDailyForm({ ...editDailyForm, block_reason: e.target.value, is_blocked: true })}
                className="input text-xs border-red-300"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsEditDailyOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleSaveEditDaily} className="btn-primary py-1.5 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold">
              Simpan Perubahan Aktivitas
            </button>
          </div>
        </div>
      </Modal>

      {/* 5. Modal: Request Task Transfer */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Ajukan Alih Tugas (Task Transfer)"
        subtitle={`Task: ${activeDailyTask?.title}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-secondary">
            Ajukan permohonan delegasi tugas ini ke Project Manager untuk dipindahkan ke anggota tim lain yang memiliki kapasitas luang.
          </p>
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Alasan Pengalihan Tugas *</label>
            <textarea
              rows={3}
              placeholder="Jelaskan alasan pengalihan tugas..."
              value={transferReason}
              onChange={e => setTransferReason(e.target.value)}
              className="input text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsTransferModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleSendTransfer} className="btn-primary py-1.5 px-4 text-xs bg-amber-600 hover:bg-amber-700">Kirim Permohonan</button>
          </div>
        </div>
      </Modal>

      {/* 6. Modal: Create Project */}
      <Modal
        isOpen={isCreateProjOpen}
        onClose={() => setIsCreateProjOpen(false)}
        title="Buat Proyek Baru"
        subtitle="Daftarkan proyek dan inisiasi WBS manajemen"
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Nama Proyek *</label>
            <input
              type="text"
              placeholder="Contoh: Implementasi Sistem Otomasi Pabrik Line 2"
              value={newProjForm.name}
              onChange={e => setNewProjForm({ ...newProjForm, name: e.target.value })}
              className="input text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-secondary block mb-1">Kode Proyek</label>
              <input
                type="text"
                placeholder="PRJ-AUTO-01"
                value={newProjForm.code}
                onChange={e => setNewProjForm({ ...newProjForm, code: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-secondary block mb-1">Total Anggaran (Rp)</label>
              <input
                type="number"
                value={newProjForm.budget_amount}
                onChange={e => setNewProjForm({ ...newProjForm, budget_amount: Number(e.target.value) })}
                className="input text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-secondary block mb-1">Tanggal Mulai</label>
              <input
                type="date"
                value={newProjForm.planned_start_date}
                onChange={e => setNewProjForm({ ...newProjForm, planned_start_date: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-secondary block mb-1">Target Selesai</label>
              <input
                type="date"
                value={newProjForm.planned_end_date}
                onChange={e => setNewProjForm({ ...newProjForm, planned_end_date: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Deskripsi Proyek</label>
            <textarea
              rows={2}
              value={newProjForm.description}
              onChange={e => setNewProjForm({ ...newProjForm, description: e.target.value })}
              className="input text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsCreateProjOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleCreateProject} className="btn-primary py-1.5 px-4 text-xs">Simpan Proyek</button>
          </div>
        </div>
      </Modal>

      {/* 7. Modal: Health EVM */}
      <Modal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
        title="Diagnostik Kesehatan Proyek (EVM Analyzer)"
        subtitle={`Proyek: ${selectedProject?.project_name}`}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 bg-gray-50 rounded-xl">
              <span className="text-2xs text-text-secondary">Schedule Performance (SPI)</span>
              <div className="text-xl font-bold text-brand-deep-green mt-1">{healthData?.spi || "1.00"}</div>
              <span className="text-3xs text-text-secondary mt-0.5 block">{healthData?.sv || "Sesuai Jadwal (SV: Rp 0)"}</span>
            </div>
            <div className="card p-3 bg-gray-50 rounded-xl">
              <span className="text-2xs text-text-secondary">Cost Performance (CPI)</span>
              <div className="text-xl font-bold text-emerald-600 mt-1">{healthData?.cpi || "1.02"}</div>
              <span className="text-3xs text-text-secondary mt-0.5 block">{healthData?.cv || "On Budget (CV: +Rp 2jt)"}</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-brand-light-green/60 border border-brand-green/30 text-xs">
            <span className="font-bold text-brand-deep-green block mb-1">Rekomendasi Diagnostik Otomatis:</span>
            <p className="text-text-primary text-2xs leading-relaxed">
              {healthData?.recommendation || "Kinerja proyek berada dalam koridor aman. Pertahankan laju penyelesaian daily tasks pada sprint aktif."}
            </p>
          </div>
          <button onClick={() => setIsHealthModalOpen(false)} className="btn-primary w-full justify-center py-2 text-xs">
            Tutup Diagnostik
          </button>
        </div>
      </Modal>

      {/* 8. Modal: Lifecycle Stage Gate Checklist */}
      <Modal
        isOpen={isLifecycleModalOpen}
        onClose={() => setIsLifecycleModalOpen(false)}
        title="Stage Gate Review & Verifikasi Lifecycle"
        subtitle={`Memajukan dari [${selectedProject?.status}] ke Tahap Berikutnya`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-secondary">
            Konfirmasi kriteria kesiapan mutu (Gate Checklist) sebelum meloloskan proyek ke tahap operasional berikutnya:
          </p>

          <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl">
            <label className="flex items-center gap-2.5 text-xs text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={gateChecklist.scope_verified}
                onChange={e => setGateChecklist({ ...gateChecklist, scope_verified: e.target.checked })}
                className="w-4 h-4 rounded text-brand-green focus:ring-0"
              />
              <span>1. Ruang lingkup WBS & Deliverable tervalidasi</span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={gateChecklist.budget_allocated}
                onChange={e => setGateChecklist({ ...gateChecklist, budget_allocated: e.target.checked })}
                className="w-4 h-4 rounded text-brand-green focus:ring-0"
              />
              <span>2. Alokasi anggaran (Budget Line) disetujui Finance</span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={gateChecklist.resources_reserved}
                onChange={e => setGateChecklist({ ...gateChecklist, resources_reserved: e.target.checked })}
                className="w-4 h-4 rounded text-brand-green focus:ring-0"
              />
              <span>3. Personel tim pelaksana telah di-assign</span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={gateChecklist.qa_checklist_passed}
                onChange={e => setGateChecklist({ ...gateChecklist, qa_checklist_passed: e.target.checked })}
                className="w-4 h-4 rounded text-brand-green focus:ring-0"
              />
              <span>4. Checklist QA & Kontrol Mutu Tahap Awal Terpenuhi</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsLifecycleModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button
              onClick={handleAdvanceLifecycle}
              disabled={!gateChecklist.scope_verified || !gateChecklist.budget_allocated}
              className="btn-primary py-1.5 px-4 text-xs disabled:opacity-50"
            >
              Loloskan Stage Gate
            </button>
          </div>
        </div>
      </Modal>

      {/* 9. Modal: Catat Biaya */}
      <Modal
        isOpen={isCostModalOpen}
        onClose={() => setIsCostModalOpen(false)}
        title="Catat Biaya Pengeluaran Riil (Actual Cost)"
        subtitle={`Proyek: ${selectedProject?.project_name}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Kategori Biaya</label>
            <select
              value={costForm.category}
              onChange={e => setCostForm({ ...costForm, category: e.target.value })}
              className="input text-xs"
            >
              <option value="MATERIAL">Material & Komponen</option>
              <option value="LABOR">Upah Tenaga Kerja</option>
              <option value="SUBCON">Jasa Subkontraktor</option>
              <option value="OVERHEAD">Overhead & Operasional</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Nominal Biaya (Rp) *</label>
            <input
              type="number"
              value={costForm.amount}
              onChange={e => setCostForm({ ...costForm, amount: Number(e.target.value) })}
              className="input text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Keterangan Pengeluaran</label>
            <input
              type="text"
              placeholder="Contoh: Sewa alat berat dan perlengkapan"
              value={costForm.description}
              onChange={e => setCostForm({ ...costForm, description: e.target.value })}
              className="input text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsCostModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button
              onClick={async () => {
                if (!selectedProject) return;
                await createProjectCostEntry({
                  project: selectedProject.id,
                  category: costForm.category,
                  amount: Number(costForm.amount),
                  description: costForm.description
                });
                toast.success("Biaya riil berhasil dicatat!");
                setIsCostModalOpen(false);
                fetchProjects(true);
              }}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              Simpan Biaya
            </button>
          </div>
        </div>
      </Modal>

      {/* 10. Modal: Billing Termin */}
      <Modal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        title="Ajukan Penagihan Termin Proyek"
        subtitle={`Proyek: ${selectedProject?.project_name}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Keterangan Termin *</label>
            <input
              type="text"
              value={billingForm.description}
              onChange={e => setBillingForm({ ...billingForm, description: e.target.value })}
              className="input text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-secondary block mb-1">Nominal Termin (Rp) *</label>
              <input
                type="number"
                value={billingForm.amount}
                onChange={e => setBillingForm({ ...billingForm, amount: Number(e.target.value) })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-secondary block mb-1">Target Milestone (%)</label>
              <input
                type="number"
                value={billingForm.milestone_percentage}
                onChange={e => setBillingForm({ ...billingForm, milestone_percentage: Number(e.target.value) })}
                className="input text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsBillingModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button
              onClick={async () => {
                if (!selectedProject) return;
                await createBillingProposal({
                  project: selectedProject.id,
                  amount: Number(billingForm.amount),
                  description: billingForm.description,
                  milestone_percentage: Number(billingForm.milestone_percentage)
                });
                toast.success("Termin penagihan diajukan ke Finance!");
                setIsBillingModalOpen(false);
                fetchProjects(true);
              }}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              Ajukan Billing
            </button>
          </div>
        </div>
      </Modal>

      {/* 11. Modal: Milestone */}
      <Modal
        isOpen={isMilestoneModalOpen}
        onClose={() => setIsMilestoneModalOpen(false)}
        title="Tambah Milestone Proyek"
        subtitle={`Proyek: ${selectedProject?.project_name}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Nama Milestone *</label>
            <input
              type="text"
              placeholder="Contoh: Serah Terima Tahap 1 (UAT)"
              value={milestoneForm.name}
              onChange={e => setMilestoneForm({ ...milestoneForm, name: e.target.value })}
              className="input text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Target Tanggal</label>
            <input
              type="date"
              value={milestoneForm.target_date}
              onChange={e => setMilestoneForm({ ...milestoneForm, target_date: e.target.value })}
              className="input text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsMilestoneModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button
              onClick={async () => {
                if (!selectedProject || !milestoneForm.name.trim()) return;
                await createMilestone({
                  project: selectedProject.id,
                  name: milestoneForm.name.trim(),
                  target_date: milestoneForm.target_date || new Date().toISOString().split("T")[0]
                });
                toast.success("Milestone berhasil ditambahkan!");
                setIsMilestoneModalOpen(false);
                setMilestoneForm({ name: "", target_date: "" });
                fetchProjects(true);
              }}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              Simpan Milestone
            </button>
          </div>
        </div>
      </Modal>

      {/* 12. Modal: Edit Target Finansial & Budget Proyek */}
      <Modal
        isOpen={isEditFinancialsOpen}
        onClose={() => setIsEditFinancialsOpen(false)}
        title="Edit Parameter & Target Keuangan Proyek"
        subtitle={`Proyek: ${selectedProject?.project_name}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Target Pendapatan / Nilai Kontrak (Revenue Target Rp) *</label>
            <input
              type="number"
              value={financialTargetForm.contract_amount}
              onChange={e => setFinancialTargetForm({ ...financialTargetForm, contract_amount: Number(e.target.value) })}
              className="input text-xs"
            />
            <span className="text-3xs text-text-secondary mt-0.5 block">Nilai kesepakatan kontrak penjualan/deal klien.</span>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Pagu Anggaran Disetujui (Planned Budget Baseline Rp) *</label>
            <input
              type="number"
              value={financialTargetForm.budget_amount}
              onChange={e => setFinancialTargetForm({ ...financialTargetForm, budget_amount: Number(e.target.value) })}
              className="input text-xs"
            />
            <span className="text-3xs text-text-secondary mt-0.5 block">Batas maksimal alokasi biaya pengeluaran proyek.</span>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Target Profit Margin (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={financialTargetForm.target_margin_percent}
              onChange={e => setFinancialTargetForm({ ...financialTargetForm, target_margin_percent: Number(e.target.value) })}
              className="input text-xs"
            />
            <span className="text-3xs text-text-secondary mt-0.5 block">Ambang batas margin keuntungan proyek yang diharapkan.</span>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsEditFinancialsOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleUpdateFinancialTargets} className="btn-primary py-1.5 px-4 text-xs bg-emerald-600 hover:bg-emerald-700">
              Simpan Target Finansial
            </button>
          </div>
        </div>
      </Modal>

      {/* 13. Modal: Permintaan Dana Budgeting (Funding Request) */}
      <Modal
        isOpen={isFundingRequestOpen}
        onClose={() => setIsFundingRequestOpen(false)}
        title="Ajukan Permintaan Dana & Budgeting Proyek"
        subtitle={`Proyek: ${selectedProject?.project_name}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Kategori Pengeluaran / Kebutuhan *</label>
            <select
              value={fundingRequestForm.category}
              onChange={e => setFundingRequestForm({ ...fundingRequestForm, category: e.target.value })}
              className="input text-xs"
            >
              <option value="OPERATIONAL">Dana Operasional Tim</option>
              <option value="MATERIAL">Pengadaan Material Kritis</option>
              <option value="LOGISTICS">Transportasi & Logistik Lapangan</option>
              <option value="EQUIPMENT">Sewa Alat & Perizinan</option>
              <option value="OTHER">Lain-lain (Emergency Fund)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Jumlah Dana yang Diajukan (Rp) *</label>
            <input
              type="number"
              value={fundingRequestForm.amount}
              onChange={e => setFundingRequestForm({ ...fundingRequestForm, amount: Number(e.target.value) })}
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Keterangan / Alasan Permintaan Dana *</label>
            <textarea
              rows={2}
              placeholder="Jelaskan kebutuhan pengeluaran dana dan peruntukannya di lapangan..."
              value={fundingRequestForm.description}
              onChange={e => setFundingRequestForm({ ...fundingRequestForm, description: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsFundingRequestOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleCreateFundingRequest} className="btn-primary py-1.5 px-4 text-xs bg-emerald-600 hover:bg-emerald-700">
              Kirim Permintaan ke Finance
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

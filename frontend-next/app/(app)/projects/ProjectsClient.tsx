/**
 * File: frontend-next/app/(app)/projects/ProjectsClient.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus, RefreshCw, Trash2, CheckCircle2,
  TrendingUp, Users, ShieldCheck, Play,
  DollarSign, Layers, Clock, Zap,
  Edit, Search, Check, Wallet
} from "lucide-react";
import {
  Project, MainTask, WeeklyTask, DailyTask, TaskTransfer, ProjectAuthority, ProjectSupervisor,
  loadAllProjects, createProject, deleteProject,
  createMainTask, deleteMainTask,
  createWeeklyTask, deleteWeeklyTask,
  createDailyTask, updateDailyTask, deleteDailyTask,
  requestTaskTransfer, directReassignDailyTask, getTransferRequests, approveTransfer, rejectTransfer,
  recalculateProjectHealth,
  createMilestone,
  assignMemberToMainTask, removeTaskAssignment, fetchCompanyUsers,
  fetchProjectFinancialPerformance,
  fetchProjectFundingRequests, submitProjectFundingRequest,
  updateProjectFinancials,
  fetchProjectCustomers, getApiErrorDetail,
  getProjectAuthority, getProjectSupervisor, assignProjectSupervisor, revokeProjectSupervisor
} from "@/lib/api/project.api";
import { useAuth } from "@/contexts/AuthContext";
import { cn, localDateKey } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { feedApi } from "@/lib/api/feed.api";
import { loadDashboardBootstrap } from "@/lib/api/dashboard.api";
import { ProjectTimelineGantt } from "@/components/ui/ProjectTimelineGantt";
import { ProjectMilestoneCard } from "@/components/ui/ProjectMilestoneCard";
import { getCategoryStyle } from "@/lib/ui/semantic-styles";
import { canPerform } from "@/lib/access/capability-contract";
import { ProjectWbsTree } from "@/components/projects/ProjectWbsTree";

/**
 * formatRupiah coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
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
  { key: "STARTED", label: "STEP 4", title: "ACTIVE / STARTED", desc: "Eksekusi & QA" },
  { key: "CLOSED", label: "STEP 5", title: "CLOSED", desc: "Serah Terima" },
];

/**
 * Renders a stable semantic color for a business category.
 * Known categories have explicit colors; unknown labels use a deterministic
 * palette selection so the same category never changes color between renders.
 */
function CategoryLabel({ label }: { label?: string | null }) {
  if (!label) return null;
  const style = getCategoryStyle(label);
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-3xs font-bold uppercase tracking-wide", style)}>{label.replace(/_/g, " ")}</span>;
}

/**
 * ProjectsClient coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function ProjectsClient() {
  const { user, userRole } = useAuth();
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("project");
  const requestedProjectTab = searchParams.get("tab");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState("TREE");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [supervisorSaving, setSupervisorSaving] = useState(false);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [dailySaving, setDailySaving] = useState(false);

  /* Modals */
  const [isCreateProjOpen, setIsCreateProjOpen] = useState(false);
  const [isCreateMainTaskOpen, setIsCreateMainTaskOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCreateWeeklyOpen, setIsCreateWeeklyOpen] = useState(false);
  const [isCreateDailyOpen, setIsCreateDailyOpen] = useState(false);
  const [isEditDailyOpen, setIsEditDailyOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isLifecycleModalOpen, setIsLifecycleModalOpen] = useState(false);
  const [isEditFinancialsOpen, setIsEditFinancialsOpen] = useState(false);
  const [isFundingRequestOpen, setIsFundingRequestOpen] = useState(false);

  /* Real-time Project Financial Performance & Budgeting */
  const [financialPerformance, setFinancialPerformance] = useState<any>(null);
  const [fundingRequestsList, setFundingRequestsList] = useState<any[]>([]);
  const [financialTargetForm, setFinancialTargetForm] = useState({
    contract_amount: "",
    budget_amount: "",
    target_margin_percent: "",
  });
  const [fundingRequestForm, setFundingRequestForm] = useState({
    amount: "",
    category: "",
    description: ""
  });
  const [fundingRequestErrors, setFundingRequestErrors] = useState<Record<string, string>>({});
  const [fundingSaving, setFundingSaving] = useState(false);

  /* Team Users list for Assignment */
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [projectAuthority, setProjectAuthority] = useState<ProjectAuthority | null>(null);
  const [projectSupervisor, setProjectSupervisor] = useState<ProjectSupervisor | null>(null);
  const [supervisorCandidateId, setSupervisorCandidateId] = useState("");
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
    name: "", code: "", customer_name: "", budget_amount: "", description: "",
    planned_start_date: localDateKey(),
    planned_end_date: localDateKey(new Date(Date.now() + 30 * 86400000))
  });
  const [mainTaskForm, setMainTaskForm] = useState({ title: "", cost_owner_division_id: "", description: "", weight: "", priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "URGENT" });
  const [mainTaskErrors, setMainTaskErrors] = useState<Record<string, string>>({});
  const [weeklyForm, setWeeklyForm] = useState({ week_number: "1", target_description: "", start_date: "", end_date: "", assignee_id: "" });
  const [weeklyErrors, setWeeklyErrors] = useState<Record<string, string>>({});
  
  const [dailyForm, setDailyForm] = useState({
    title: "",
    time_slot: "09.00 - 12.00",
    planned_date: localDateKey(),
    output_result: "",
    notes: "",
    status: "IN_PROGRESS"
  });

  const [editDailyForm, setEditDailyForm] = useState({
    status: "COMPLETED" as "NOT_STARTED" | "IN_PROGRESS" | "PENDING" | "ON_PROGRESS" | "COMPLETED" | "DONE" | "BLOCKED",
    progress: 100,
    output_result: "",
    notes: "",
    is_blocked: false,
    block_reason: ""
  });
  const [transferReason, setTransferReason] = useState("");
  const [transferTargetUserId, setTransferTargetUserId] = useState("");
  const [checklistItems, setChecklistItems] = useState<any[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newChecklistDate, setNewChecklistDate] = useState("");

  const [divisionOptions, setDivisionOptions] = useState<any[]>([]);
  const [milestoneForm, setMilestoneForm] = useState({ name: "", target_date: "" });

  /* Personal Workspace Filters & Timer */
  const [personalFilter, setPersonalFilter] = useState("ALL");
  const [personalSearch, setPersonalSearch] = useState("");
  const [timerDailyId, setTimerDailyId] = useState<string | number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [transfers, setTransfers] = useState<TaskTransfer[]>([]);

  const selectedProject = projects.find(p => String(p.id) === String(selectedId)) || projects[0] || null;
  const completedChecklistCount = checklistItems.filter((item) => ['DONE', 'COMPLETED', 'CHECKED', 'APPROVED'].includes(String(item.status).toUpperCase())).length;
  const checklistProgress = checklistItems.length > 0 ? Math.round((completedChecklistCount / checklistItems.length) * 100) : 0;

  useEffect(() => {
    if (!isEditDailyOpen || !activeDailyTask) return;
    api.get(`/api/v1/projects/control-items/?daily_task_id=${activeDailyTask.id}&page_size=100`)
      .then((response) => setChecklistItems(response.data?.results ?? response.data?.data ?? []))
      .catch(() => setChecklistItems([]));
  }, [activeDailyTask, isEditDailyOpen]);

  const addChecklistItem = async () => {
    if (!activeDailyTask || !selectedProject || !newChecklistTitle.trim()) return;
    await api.post('/api/v1/projects/control-items/', {
      project_id: selectedProject.id,
      daily_task_id: activeDailyTask.id,
      item_type: 'TASK_CHECKLIST',
      title: newChecklistTitle.trim(),
      status: 'PENDING',
      target_date: newChecklistDate || undefined,
    });
    setNewChecklistTitle('');
    setNewChecklistDate('');
    const response = await api.get(`/api/v1/projects/control-items/?daily_task_id=${activeDailyTask.id}&page_size=100`);
    setChecklistItems(response.data?.results ?? response.data?.data ?? []);
    await fetchProjects(true);
  };

  const toggleChecklistItem = async (item: any) => {
    const nextStatus = ['DONE', 'COMPLETED', 'CHECKED', 'APPROVED'].includes(String(item.status).toUpperCase()) ? 'PENDING' : 'COMPLETED';
    await api.patch(`/api/v1/projects/control-items/${item.id}/`, { status: nextStatus });
    setChecklistItems((items) => items.map((current) => current.id === item.id ? { ...current, status: nextStatus } : current));
    await fetchProjects(true);
  };

  /* Track a project once when the active project actually changes. */
  const lastTrackedProjectIdRef = useRef<string | null>(null);
  const selectedProjectId = selectedProject?.id != null ? String(selectedProject.id) : "";
  const selectedAuthority = projectAuthority?.project_id === selectedProjectId ? projectAuthority : null;
  const selectedProjectTitle = selectedProject
    ? selectedProject.project_name || (selectedProject as any).name || `Proyek #${selectedProject.id}`
    : "";

  useEffect(() => {
    if (!selectedProjectId || lastTrackedProjectIdRef.current === selectedProjectId) return;

    lastTrackedProjectIdRef.current = selectedProjectId;
    feedApi.trackRecentItem({
      item_type: "PROJECT",
      object_id: selectedProjectId,
      title: selectedProjectTitle,
      target_url: "/projects",
    }).catch(() => {});
  }, [selectedProjectId, selectedProjectTitle]);

  /* Project Manager & Executive Role Guard */
  // Mutation controls follow the active backend role; identity names and emails are never authorization signals.
  const isActingProjectManager = Boolean(selectedAuthority?.is_acting_project_manager);
  const isPM = useMemo(
    () => userRole === "pm" || userRole === "om" || isActingProjectManager,
    [isActingProjectManager, userRole],
  );
  const isExecutive = useMemo(() => userRole === "executive", [userRole]);
  const canCreateProject = useMemo(() => canPerform("project:create", userRole), [userRole]);
  const canUpdateProject = useMemo(() => canPerform("project:update", userRole), [userRole]);
  const canManageSelectedProject = Boolean(selectedAuthority?.can_manage_project);
  const canUpdateSelectedProject = canUpdateProject || isActingProjectManager;
  const canViewFinancials = useMemo(() => {
    return ["super_admin", "company_admin", "executive", "om", "pm", "finance"].includes(userRole || "");
  }, [userRole]);

  const [customerOptions, setCustomerOptions] = useState<string[]>([]);

  // Auth profile refreshes may return new array instances with identical
  // values. Primitive keys keep the project loader stable until access really
  // changes, preventing a focus event from remounting the full-page loader.
  const enabledModulesKey = [...(user?.enabled_modules || [])].map(String).sort().join("|");
  const delegatedModulesKey = [...(user?.delegated_modules || [])].map(String).sort().join("|");
  const activeRoleCode = user?.active_role_code || "";

  // Stable ref to the current selectedId so fetchProjects can read it without being in its deps
  const selectedIdRef = useRef<string | number | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Request-version counter: prevents a slow response from overwriting a newer one.
  const fetchVersionRef = useRef(0);
  const authorityFetchVersionRef = useRef(0);
  const automaticFetchKeyRef = useRef("");

  const fetchProjects = useCallback(async (silent = false) => {
    const version = ++fetchVersionRef.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const enabledModules = enabledModulesKey ? enabledModulesKey.split("|") : [];
      const delegatedModules = delegatedModulesKey ? delegatedModulesKey.split("|") : [];
      const projectBundle = loadDashboardBootstrap(["projects"], {
        enabledModules,
        delegatedModules,
        activeRoleCode,
        isSuperAdmin: userRole === "super_admin",
      }, { fresh: silent, projectWorkspace: 'management' }).then((response) => response.projects);
      const projectData = projectBundle.then((bundle) => loadAllProjects(enabledModules, bundle, {
          delegatedModules,
          activeRoleCode,
          isSuperAdmin: userRole === "super_admin",
        }));
      const auxiliaryData = Promise.allSettled([
        getTransferRequests(),
        Promise.resolve([]),
        fetchProjectCustomers(),
        api.get('/api/v1/core/organizations/?page_size=200').then((response) => response.data?.results ?? response.data?.data ?? [])
      ]);
      // Render the primary project/WBS dataset as soon as it is ready. Slow
      // supporting lookups must never hold the entire workspace behind a
      // full-page loading state (especially across a high-latency host).
      const data = await projectData;

      // Guard against race conditions: if a newer fetch was initiated, discard this stale response completely!
      if (version !== fetchVersionRef.current) return;
      setProjects(data);

      // Read current selectedId via ref (not dep) to preserve selection across silent refreshes
      const currentSelectedId = selectedIdRef.current;
      const targetId = requestedProjectId && data.some(p => String(p.id) === requestedProjectId)
        ? requestedProjectId
        : currentSelectedId && data.some(p => String(p.id) === String(currentSelectedId))
        ? currentSelectedId
        : data[0]?.id ?? null;

      if (targetId) {
        setSelectedId(targetId);
      }
      if (requestedProjectTab) setActiveTab(requestedProjectTab);

      void auxiliaryData.then((auxiliary) => {
        if (version !== fetchVersionRef.current) return;
        const valueOrEmpty = (result: PromiseSettledResult<any>) => result.status === "fulfilled" ? result.value : [];
        const transferList = valueOrEmpty(auxiliary[0]);
        const custList = valueOrEmpty(auxiliary[2]);
        const divisions = valueOrEmpty(auxiliary[3]);
        const divisionNameById = new Map(
          (Array.isArray(divisions) ? divisions : []).map((division: any) => [
            String(division.id),
            String(division.organization_name ?? division.name ?? division.id),
          ]),
        );
        setProjects(data.map((project) => ({
          ...project,
          main_tasks: (project.main_tasks || []).map((mainTask) => ({
            ...mainTask,
            cost_owner_division_name: mainTask.cost_owner_division_id
              ? divisionNameById.get(String(mainTask.cost_owner_division_id)) ?? String(mainTask.cost_owner_division_id)
              : undefined,
          })),
        })));
        if (custList?.length) setCustomerOptions(custList);
        setTransfers(transferList);
        setDivisionOptions(Array.isArray(divisions) ? divisions : []);
      });
    } catch {
      if (version === fetchVersionRef.current) {
        toast.error("Gagal menyinkronkan data proyek");
      }
    } finally {
      if (version === fetchVersionRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // selectedId intentionally excluded: read via ref to avoid re-creating this callback on selection change
  }, [activeRoleCode, delegatedModulesKey, enabledModulesKey, requestedProjectId, requestedProjectTab, userRole]);

/**
 * openAssignModal coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const openAssignModal = (main: MainTask) => {
    if (!selectedAuthority?.can_assign_team) {
      toast.error("Anda tidak memiliki kewenangan assignment pada project ini.");
      return;
    }
    setActiveMainTask(main);
/**
 * currentAssigned coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
    const currentAssigned = (main.assignments || [])
      .map(a => a.assignee || a.assignee_id)
      .filter((id): id is string | number => id !== null && id !== undefined && id !== "");
    setSelectedAssigneeIds(currentAssigned);
    setIsAssignModalOpen(true);
  };

/**
 * handleAssignMember coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleAssignMember = async () => {
    if (!selectedAuthority?.can_assign_team) {
      toast.error("Anda tidak memiliki kewenangan assignment pada project ini.");
      return;
    }
    if (!activeMainTask) return;
    if (assignmentSaving) return;
    setAssignmentSaving(true);
    try {
      await assignMemberToMainTask({
        main_task: activeMainTask.id,
        user_ids: selectedAssigneeIds,
      });
      toast.success("Penugasan anggota tim berhasil disimpan.");
      setIsAssignModalOpen(false);
      await fetchProjects(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal menyimpan penugasan anggota."));
    } finally {
      setAssignmentSaving(false);
    }
  };

  useEffect(() => {
    const automaticFetchKey = [
      activeRoleCode,
      delegatedModulesKey,
      enabledModulesKey,
      requestedProjectId || "",
      requestedProjectTab || "",
      userRole,
    ].join("::");
    if (automaticFetchKeyRef.current === automaticFetchKey) return;
    automaticFetchKeyRef.current = automaticFetchKey;
    fetchProjects();
  }, [activeRoleCode, delegatedModulesKey, enabledModulesKey, fetchProjects, requestedProjectId, requestedProjectTab, userRole]);

  useEffect(() => {
    const projectId = selectedProjectId;
    const version = ++authorityFetchVersionRef.current;
    setProjectAuthority(null);
    setProjectSupervisor(null);
    setCompanyUsers([]);
    setSupervisorCandidateId("");
    if (!projectId) return;

    Promise.all([getProjectAuthority(projectId), getProjectSupervisor(projectId)])
      .then(async ([authority, supervisor]) => {
        if (version !== authorityFetchVersionRef.current) return;
        setProjectAuthority(authority);
        setProjectSupervisor(supervisor);
        if (authority.can_assign_team || authority.can_delegate_supervisor) {
          const users = await fetchCompanyUsers(projectId);
          if (version === authorityFetchVersionRef.current) setCompanyUsers(users);
        }
      })
      .catch((error) => {
        if (version === authorityFetchVersionRef.current) {
          setProjectAuthority(null);
          setProjectSupervisor(null);
          toast.error(getApiErrorDetail(error, "Gagal memuat kewenangan project."));
        }
      });
  }, [selectedProjectId]);

  const handleAssignSupervisor = async () => {
    if (!selectedId || !supervisorCandidateId || !selectedAuthority?.can_delegate_supervisor) return;
    setSupervisorSaving(true);
    try {
      const supervisor = await assignProjectSupervisor(selectedId, supervisorCandidateId);
      setProjectSupervisor(supervisor);
      toast.success("Project Supervisor berhasil ditetapkan.");
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal menetapkan Project Supervisor."));
    } finally {
      setSupervisorSaving(false);
    }
  };

  const handleRevokeSupervisor = async () => {
    if (!selectedId || !selectedAuthority?.can_delegate_supervisor || !projectSupervisor) return;
    if (!confirm(`Cabut Project Supervisor ${projectSupervisor.full_name}?`)) return;
    setSupervisorSaving(true);
    try {
      await revokeProjectSupervisor(selectedId);
      setProjectSupervisor(null);
      setSupervisorCandidateId("");
      toast.success("Project Supervisor berhasil dicabut.");
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal mencabut Project Supervisor."));
    } finally {
      setSupervisorSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedId || !canViewFinancials) {
      setFinancialPerformance(null);
      setFundingRequestsList([]);
      return;
    }
    Promise.allSettled([
      fetchProjectFinancialPerformance(selectedId),
      fetchProjectFundingRequests(selectedId)
    ]).then(([perfRes, fundingRes]) => {
      if (perfRes.status === "fulfilled") setFinancialPerformance(perfRes.value);
      if (fundingRes.status === "fulfilled") setFundingRequestsList(Array.isArray(fundingRes.value) ? fundingRes.value : []);
    });
  }, [canViewFinancials, selectedId]);

  useEffect(() => {
    if (selectedProject) {
      setFinancialTargetForm({
        contract_amount: selectedProject.contract_amount != null ? String(selectedProject.contract_amount) : "",
        budget_amount: selectedProject.budget_amount != null ? String(selectedProject.budget_amount) : "",
        target_margin_percent: selectedProject.target_margin_percent != null ? String(selectedProject.target_margin_percent) : "",
      });
    }
  }, [selectedProject]);

/**
 * handleUpdateFinancialTargets coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleUpdateFinancialTargets = async () => {
    if (!selectedProject) return;
    const contractAmount = Number(financialTargetForm.contract_amount);
    const budgetAmount = Number(financialTargetForm.budget_amount);
    const targetMarginPercent = Number(financialTargetForm.target_margin_percent);
    if (![contractAmount, budgetAmount, targetMarginPercent].every(Number.isFinite)
      || contractAmount < 0
      || budgetAmount < 0
      || targetMarginPercent < 0
      || targetMarginPercent > 100) {
      toast.error("Nilai finansial tidak valid. Nominal tidak boleh negatif dan margin harus 0–100%.");
      return;
    }
    try {
      await updateProjectFinancials(selectedProject.id, {
        contract_amount: contractAmount,
        budget_amount: budgetAmount,
        target_margin_percent: targetMarginPercent,
      });

      toast.success("Target finansial dan anggaran proyek berhasil diperbarui.");
      setIsEditFinancialsOpen(false);
      await fetchProjects(true);
    } catch {
      toast.error("Gagal memperbarui target keuangan proyek");
    }
  };

/**
 * handleCreateFundingRequest coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleCreateFundingRequest = async () => {
    if (!selectedProject) return;
    const errors: Record<string, string> = {};
    const amount = Number(fundingRequestForm.amount);
    const description = fundingRequestForm.description.trim();
    if (!fundingRequestForm.category) errors.category = "Kategori pengeluaran wajib dipilih.";
    if (!fundingRequestForm.amount || !Number.isFinite(amount) || amount <= 0) {
      errors.amount = "Jumlah dana wajib diisi dan harus lebih dari Rp0.";
    }
    if (!description) errors.description = "Keterangan / alasan permintaan dana wajib diisi.";
    setFundingRequestErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    if (fundingSaving) return;
    setFundingSaving(true);
    try {
      await submitProjectFundingRequest(selectedProject.id, {
        amount,
        category: fundingRequestForm.category as "OPERATIONAL" | "MATERIAL" | "LOGISTICS" | "EQUIPMENT" | "OTHER",
        description,
      });

      toast.success(`Permintaan dana ${formatRupiah(amount)} berhasil diajukan ke Finance.`);
      setFundingRequestForm({ amount: "", category: "", description: "" });
      setFundingRequestErrors({});
      setIsFundingRequestOpen(false);
      await fetchProjects(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal mengajukan permintaan dana proyek"));
    } finally {
      setFundingSaving(false);
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

  const mainTasks = useMemo(() => {
    const tasks = selectedProject?.main_tasks || [];
    if (userRole !== "staff" || isActingProjectManager || user?.id == null) return tasks;
    const activeUserId = String(user.id);
    return tasks.filter((mainTask) =>
      (mainTask.assignments || []).some((assignment) =>
        String(assignment.assignee_id ?? assignment.assignee ?? "") === activeUserId
      )
    );
  }, [isActingProjectManager, selectedProject?.main_tasks, user?.id, userRole]);

  /* 1. Real Gantt Tasks from Live Project WBS */
  const realGanttTasks = useMemo(() => {
    if (!mainTasks || mainTasks.length === 0) return [];
    return mainTasks.map((mt: any, idx: number) => {
      const weeklyTasks = mt.weekly_tasks || mt.weekly_plans || [];
/**
 * startWeek coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
      let startWeek = (idx % 6) + 1;
      let endWeek = Math.min(8, startWeek + 2);

      if (weeklyTasks.length > 0) {
        const weekNums = weeklyTasks.map((w: any) => Number(w.week_number) || 1);
        startWeek = Math.max(1, Math.min(...weekNums));
        endWeek = Math.min(8, Math.max(...weekNums));
      }

      const totalDaily = weeklyTasks.reduce((acc: number, w: any) => acc + (w.daily_tasks?.length || 0), 0);
      const completedDaily = weeklyTasks.reduce((acc: number, w: any) => acc + (w.daily_tasks?.filter((d: any) => d.status === "COMPLETED" || d.status === "DONE")?.length || 0), 0);
      const calculatedProgress = totalDaily > 0 ? Math.round((completedDaily / totalDaily) * 100) : (mt.progress || 0);

      const assigneeName = mt.assignee_name || mt.assignments?.[0]?.assignee_name || (selectedProject as any)?.pm_name || (selectedProject as any)?.manager_name || "Tim Proyek";

      return {
        id: mt.id,
        name: mt.title || mt.name || `Main Task #${idx + 1}`,
        startWeek: Math.max(1, Math.min(8, startWeek)),
        endWeek: Math.max(startWeek, Math.min(8, endWeek)),
        progress: calculatedProgress,
        assignee: assigneeName,
        status: (calculatedProgress >= 100 ? "DONE" : calculatedProgress > 0 ? "IN_PROGRESS" : "PENDING") as any,
      };
    });
  }, [mainTasks, selectedProject]);

  /* 3. Real Milestones from Live Project Data */
  const realMilestones = useMemo(() => {
    const rawMilestones = selectedProject?.milestones || [];
    return rawMilestones.map((m: any, idx: number) => {
      const isPassed = m.is_passed || m.status === "PASSED" || m.status === "COMPLETED";
      const points = m.description
        ? m.description.split("\n").filter((p: string) => p.trim())
        : [
            `Target Penyelesaian: ${m.target_date || "Sesuai Jadwal Proyek"}`,
            `Status Verifikasi Termin: ${m.status || "PENDING"}`,
          ];

      return {
        id: m.id || idx + 1,
        stepNumber: idx + 1,
        title: m.name || m.title || `Milestone Tahap ${idx + 1}`,
        points: points.length > 0 ? points : [`Pencapaian target ${m.name}`],
        isActive: !isPassed && idx === 0,
        status: isPassed ? "COMPLETED" : (m.status || "PENDING"),
      };
    });
  }, [selectedProject]);

  /* Aggregate All Tasks */
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

/**
 * handleAddMainTask coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleAddMainTask = async () => {
    if (!selectedProject) return;
    const errors: Record<string, string> = {};
    const title = mainTaskForm.title.trim();
    const weight = Number(mainTaskForm.weight);
    if (!title) errors.title = "Judul Paket Kerja Utama wajib diisi.";
    if (!mainTaskForm.weight || !Number.isFinite(weight) || weight < 1 || weight > 100) {
      errors.weight = "Bobot kontribusi wajib berada antara 1 sampai 100.";
    }
    setMainTaskErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    try {
      await createMainTask({
        project: selectedProject.id,
        title,
        description: mainTaskForm.description.trim(),
        weight,
        priority: mainTaskForm.priority,
        cost_owner_division_id: mainTaskForm.cost_owner_division_id || undefined,
      });
      toast.success("Main Task (Level 1) berhasil ditambahkan!", { icon: "🌳" });
      setMainTaskForm({ title: "", cost_owner_division_id: "", description: "", weight: "", priority: "MEDIUM" });
      setMainTaskErrors({});
      setIsCreateMainTaskOpen(false);
      await fetchProjects(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal membuat main task"));
    }
  };

/**
 * handleAddWeeklyPlan coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleAddWeeklyPlan = async () => {
    if (!selectedProject || !activeMainTask) return;
    const errors: Record<string, string> = {};
    const weekNumber = Number(weeklyForm.week_number);
    const targetDescription = weeklyForm.target_description.trim();
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 52) {
      errors.week_number = "Nomor minggu wajib berada antara 1 sampai 52.";
    }
    if (!weeklyForm.assignee_id) errors.assignee_id = "PIC mingguan wajib dipilih dari assignee Main Task.";
    if (!weeklyForm.start_date) errors.start_date = "Tanggal mulai wajib diisi.";
    if (!weeklyForm.end_date) errors.end_date = "Tanggal selesai wajib diisi.";
    if (weeklyForm.start_date && weeklyForm.end_date && weeklyForm.end_date < weeklyForm.start_date) {
      errors.end_date = "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.";
    }
    if (!targetDescription) errors.target_description = "Target Pekerjaan Mingguan wajib diisi.";
    const validAssigneeIds = new Set((activeMainTask.assignments || []).map((assignment) => String(assignment.assignee_id ?? assignment.assignee ?? "")));
    if (weeklyForm.assignee_id && !validAssigneeIds.has(String(weeklyForm.assignee_id))) {
      errors.assignee_id = "PIC harus merupakan assignee Main Task yang sama.";
    }
    setWeeklyErrors(errors);
    if (Object.keys(errors).length > 0) {
      const missingLabels = [
        errors.week_number && "Minggu Ke",
        errors.assignee_id && "PIC Mingguan",
        errors.start_date && "Start Date",
        errors.end_date && "End Date",
        errors.target_description && "Target Pekerjaan Mingguan",
      ].filter(Boolean);
      toast.error(`Mohon periksa field wajib: ${missingLabels.join(", ")}.`);
      return;
    }
    if (weeklySaving) return;
    setWeeklySaving(true);
    try {
      const createdWeekly = await createWeeklyTask({
        main_task: activeMainTask.id,
        week_number: weekNumber,
        target_description: targetDescription,
        start_date: weeklyForm.start_date,
        end_date: weeklyForm.end_date,
        assignee_id: weeklyForm.assignee_id,
      });
      const optimisticWeekly: WeeklyTask = {
        id: createdWeekly?.id,
        main_task: activeMainTask.id,
        project: selectedProject.id,
        week_number: Number(weeklyForm.week_number),
        target_description: targetDescription,
        target_output: targetDescription,
        start_date: weeklyForm.start_date || "",
        end_date: weeklyForm.end_date || "",
        assignee_id: weeklyForm.assignee_id,
        assignee_name: createdWeekly?.assignee_name || "",
        status: createdWeekly?.status || "PLANNED",
        progress: 0,
        daily_tasks: [],
      };
      setProjects((current) => current.map((project) => ({
        ...project,
        main_tasks: (project.main_tasks || []).map((main) =>
          String(main.id) === String(activeMainTask.id)
            ? {
                ...main,
                weekly_tasks: [...(main.weekly_tasks || main.weekly_plans || []), optimisticWeekly],
                weekly_plans: [...(main.weekly_tasks || main.weekly_plans || []), optimisticWeekly],
              }
            : main,
        ),
      })));
      toast.success(`Target minggu #${weeklyForm.week_number} berhasil dibuat.`);
      setWeeklyForm({ week_number: "1", target_description: "", start_date: "", end_date: "", assignee_id: "" });
      setWeeklyErrors({});
      setIsCreateWeeklyOpen(false);
      await fetchProjects(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal membuat target mingguan."));
    } finally {
      setWeeklySaving(false);
    }
  };

/**
 * handleAddDailyTask coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleAddDailyTask = async () => {
    if (!activeWeeklyTask || !dailyForm.title.trim()) {
      toast.error("Mohon isi judul task / aktivitas");
      return;
    }
    if (dailySaving) return;
    setDailySaving(true);
    try {
      await createDailyTask({
        weekly_task: activeWeeklyTask.id,
        planned_date: dailyForm.planned_date || localDateKey(),
        time_slot: dailyForm.time_slot || "09.00 - 12.00",
        title: dailyForm.title.trim(),
        activity_input: dailyForm.title.trim(),
        output_result: dailyForm.output_result.trim(),
        notes: dailyForm.notes.trim(),
        status: dailyForm.status
      });
      toast.success("Aktivitas harian berhasil dicatat.");
      setDailyForm({
        title: "",
        time_slot: "09.00 - 12.00",
        planned_date: localDateKey(),
        output_result: "",
        notes: "",
        status: "IN_PROGRESS"
      });
      setIsCreateDailyOpen(false);
      await fetchProjects(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal mencatat aktivitas harian."));
    } finally {
      setDailySaving(false);
    }
  };

/**
 * handleSaveEditDaily coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleSaveEditDaily = async () => {
    if (!activeDailyTask) return;
    try {
      await updateDailyTask(activeDailyTask.id, {
        status: editDailyForm.status,
        output_result: editDailyForm.output_result,
        notes: editDailyForm.notes,
        is_blocked: editDailyForm.is_blocked,
        block_reason: editDailyForm.block_reason
      });
      toast.success("Aktivitas harian dan progres berhasil diperbarui.");
      setIsEditDailyOpen(false);
      await fetchProjects(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Gagal memperbarui aktivitas harian."));
    }
  };

/**
 * handleQuickToggleDaily coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleQuickToggleDaily = async (daily: DailyTask, isAllowed = true) => {
    if (!isAllowed) {
      toast.error("Akses Ditolak: Anda tidak memiliki wewenang pada task ini!");
      return;
    }
    const isDone = daily.status === "COMPLETED" || daily.status === "DONE";
    const nextStatus = isDone ? "ON_PROGRESS" : "COMPLETED";
    const nextProg = isDone ? 50 : 100;
    const prevStatus = daily.status;
    const prevProg = daily.progress;

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
    toast.success(isDone ? "Status task dikembalikan ke aktif." : "Task telah diselesaikan.");

    try {
      await updateDailyTask(daily.id, {
        status: nextStatus
      });
    } catch {
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
      toast.error("Gagal menyinkronkan status task ke server.");
    }
  };

/**
 * handleSendTransfer coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleSendTransfer = async () => {
    if (!activeDailyTask || !transferTargetUserId || !transferReason.trim()) return;
    try {
      const payload = {
        daily_task_id: activeDailyTask.id,
        target_user_id: transferTargetUserId,
        reason: transferReason.trim()
      };
      if (selectedAuthority?.can_direct_reassign) {
        await directReassignDailyTask(payload);
        toast.success("Daily Task berhasil dialihkan.");
      } else {
        await requestTaskTransfer(payload);
        toast.success("Permohonan alih tugas berhasil diajukan ke PM.");
      }
      setIsTransferModalOpen(false);
      setTransferReason("");
      setTransferTargetUserId("");
      await fetchProjects(true);
    } catch {
      toast.error("Gagal mengajukan alih tugas");
    }
  };

/**
 * handleCreateProject coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleCreateProject = async () => {
    if (!newProjForm.name.trim() || !newProjForm.code.trim() || !newProjForm.customer_name.trim()) {
      toast.error("Nama proyek, kode proyek, dan pelanggan wajib diisi.");
      return;
    }
    try {
      const res = await createProject({
        name: newProjForm.name.trim(),
        code: newProjForm.code.trim(),
        customer_name: newProjForm.customer_name.trim(),
        budget_amount: Number(newProjForm.budget_amount) || 0,
        planned_start_date: newProjForm.planned_start_date,
        planned_end_date: newProjForm.planned_end_date,
        description: newProjForm.description.trim()
      });
      toast.success(`Proyek "${newProjForm.name}" berhasil dibuat.`);
      setIsCreateProjOpen(false);
      setNewProjForm({
        name: "", code: "", customer_name: "", budget_amount: "", description: "",
        planned_start_date: localDateKey(),
        planned_end_date: localDateKey(new Date(Date.now() + 30 * 86400000))
      });
      await fetchProjects(true);
      if (res?.id) setSelectedId(res.id);
    } catch {
      toast.error("Gagal membuat proyek baru");
    }
  };

/**
 * handleDeleteProject coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (!confirm(`Hapus proyek "${selectedProject.project_name}" beserta seluruh paket kerja WBS?`)) return;
    try {
      await deleteProject(selectedProject.id);
      toast.success("Proyek berhasil dihapus.");
      await fetchProjects(true);
    } catch {
      toast.error("Gagal menghapus proyek");
    }
  };

/**
 * handleRecalculateHealth coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleRecalculateHealth = async () => {
    if (!selectedProject) return;
    try {
      const res = await recalculateProjectHealth(selectedProject.id);
      setHealthData(res);
      setIsHealthModalOpen(true);
      toast.success("Kesehatan EVM proyek berhasil dihitung.");
      await fetchProjects(true);
    } catch {
      setHealthData(null);
      toast.error("Kesehatan proyek tidak dapat dihitung. Periksa data anggaran dan progres lalu coba lagi.");
    }
  };

/**
 * handleAdvanceLifecycle coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleAdvanceLifecycle = async () => {
    if (!selectedProject) return;
    const stages = ["DRAFT", "VERIFIED", "RESERVED", "STARTED", "COMPLETED"];
    const currentIdx = stages.indexOf(selectedProject.status || "DRAFT");
    const nextStage = stages[currentIdx + 1] || stages[stages.length - 1];

    try {
      await api.post(`/api/v1/projects/projects/${selectedProject.id}/advance-stage/`, {
        target_status: nextStage,
      });

      toast.success(`Lifecycle proyek dimajukan ke ${nextStage}.`);
      setIsLifecycleModalOpen(false);
      await fetchProjects(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Gagal memajukan lifecycle proyek.");
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

          {canCreateProject && (
            <button
              onClick={() => setIsCreateProjOpen(true)}
              className="btn-primary py-1.5 px-3 text-xs gap-1.5 whitespace-nowrap"
            >
              <Plus size={14} /> Proyek Baru
            </button>
          )}

          {isExecutive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-[#2649B3] border border-blue-200 text-2xs font-bold tracking-tight shadow-2xs">
              Executive Overseer · View Only
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Tombol Target Finansial (Hanya PM/OM/Finance Operasional) */}
          {canUpdateSelectedProject && canViewFinancials && (
            <button
              onClick={() => setIsEditFinancialsOpen(true)}
              className="btn-secondary text-xs gap-1.5 py-1.5 px-3 border border-brand-green/30 text-brand-green hover:bg-brand-green/10 whitespace-nowrap shadow-xs font-semibold"
            >
              <TrendingUp size={14} /> Target Finansial Proyek
            </button>
          )}

          {/* Tombol Funding Request / Pengajuan Dana (Hanya PM/OM Operasional) */}
          {canUpdateSelectedProject && canViewFinancials && (
            <button
              onClick={() => setIsFundingRequestOpen(true)}
              className="btn-primary text-xs gap-1.5 py-1.5 px-3 bg-brand-green text-white hover:opacity-90 whitespace-nowrap font-semibold shadow-xs"
            >
              <Wallet size={14} /> Funding Request / Pengajuan Dana
            </button>
          )}

          {canUpdateSelectedProject && (
            <button
              onClick={handleRecalculateHealth}
              className="btn-outline py-1.5 px-3 text-xs gap-1.5 text-brand-deep-green border-brand-green/40 hover:bg-brand-light-green whitespace-nowrap"
            >
              <Zap size={14} className="text-amber-500 fill-amber-500" /> Hitung Health (EVM)
            </button>
          )}

          <button
            onClick={() => fetchProjects(true)}
            disabled={refreshing}
            className="btn-ghost py-1.5 px-2.5 text-xs gap-1"
            title="Segarkan data proyek"
          >
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
          </button>

          {selectedAuthority?.can_delete_project && (
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
      {selectedProject && (userRole !== "staff" || canManageSelectedProject) && (
        <div className="card bg-brand-deep-green text-white p-6 rounded-2xl relative overflow-hidden shadow-card-lg border-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex flex-col gap-2 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xs font-bold px-2 py-0.5 rounded bg-white/20 text-white tracking-wider">
                  {selectedProject.project_code}
                </span>
                <span className="text-2xs font-bold px-2 py-0.5 rounded bg-brand-light-green text-brand-deep-green">
                  {selectedProject.status}
                </span>
                <CategoryLabel label={(selectedProject as any).source_type} />
                <span className="text-2xs text-white/80 flex items-center gap-1">
                  PM: <b>{selectedProject.pm_name || "Project Manager Assigned"}</b>
                </span>
                {selectedAuthority?.is_acting_project_manager && (
                  <span className="text-2xs font-bold rounded bg-amber-300 px-2 py-0.5 text-amber-950">
                    Project Supervisor / Acting PM
                  </span>
                )}
              </div>

              <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                {selectedProject.project_name}
              </h1>
              <p className="text-xs text-white/80 line-clamp-2">
                {selectedProject.description || "Tidak ada catatan deskripsi proyek."}
              </p>

              <div className="flex items-center gap-4 text-2xs text-white/70 mt-1">
                <span>Mulai: <b>{selectedProject.planned_start_date || "-"}</b></span>
                <span>Target selesai: <b>{selectedProject.planned_end_date || "-"}</b></span>
              </div>
            </div>

            {/* Rollup Progress */}
            <div className="flex flex-col items-end gap-2 bg-white/10 p-4 rounded-2xl backdrop-blur-sm min-w-[200px]">
              <span className="text-2xs font-semibold text-white/80 uppercase tracking-wider">Agregat Progres Proyek</span>
              <div className="text-3xl font-black text-white">{selectedProject.progress}%</div>
              <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                <div className="bg-brand-green h-full rounded-full transition-all duration-500" style={{ width: `${selectedProject.progress}%` }} />
              </div>
              {selectedAuthority?.can_manage_wbs ? (
                <button
                  onClick={() => setIsCreateMainTaskOpen(true)}
                  className="mt-2 w-full py-1.5 px-3 bg-white text-brand-deep-green rounded-xl text-xs font-bold hover:bg-brand-light-green transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus size={14} /> Tambah Main Task
                </button>
              ) : (
                <span className="mt-2 text-3xs font-medium text-white/80 bg-white/10 px-2.5 py-1 rounded-lg">
                  Wewenang PM
                </span>
              )}
            </div>
          </div>

          {/* Financial or Operational summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
            <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm">
              <span className="text-2xs text-white/70 block">Progress Fisik Rollup</span>
              <span className="text-lg font-bold text-white mt-0.5 block">{selectedProject.progress}%</span>
              <span className="text-2xs text-white/50">Agregat WBS</span>
            </div>
            {canViewFinancials ? (
              <>
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
              </>
            ) : (
              <>
                <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm">
                  <span className="text-2xs text-white/70 block">Total Paket Kerja (WBS)</span>
                  <span className="text-lg font-bold text-white mt-0.5 block">{mainTasks.length}</span>
                  <span className="text-2xs text-white/50">Main Tasks</span>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm">
                  <span className="text-2xs text-white/70 block">Tugas Personal Saya</span>
                  <span className="text-lg font-bold text-white mt-0.5 block">{allPersonalTasks.length}</span>
                  <span className="text-2xs text-white/50">Cross-Project Tasks</span>
                </div>
                <div className="bg-white/5 p-3 rounded-2xl backdrop-blur-sm">
                  <span className="text-2xs text-white/70 block">Health Proyek</span>
                  <span className="text-lg font-bold text-brand-light-green mt-0.5 block">
                    {selectedProject.health_score || "NORMAL"}
                  </span>
                  <span className="text-2xs text-white/50">Status Operasional</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectedProject && userRole === "staff" && !canManageSelectedProject && (
        <section className="card rounded-2xl border border-text-tertiary bg-white p-5" aria-labelledby="staff-project-progress-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="text-2xs font-bold uppercase tracking-wider text-brand-green">Progress Proyek Terkait</span>
              <h1 id="staff-project-progress-title" className="mt-1 truncate text-lg font-extrabold text-text-primary">
                {selectedProject.project_name}
              </h1>
              <p className="mt-1 text-xs text-text-secondary">
                Hanya progress, task yang ditugaskan kepada Anda, dan timeline pelaksanaan yang ditampilkan.
              </p>
            </div>
            <div className="min-w-[220px] rounded-xl bg-brand-light-green/50 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-text-secondary">
                <span>Progress</span>
                <strong className="text-lg text-brand-deep-green">{selectedProject.progress}%</strong>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${selectedProject.progress}%` }} />
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedProject && selectedAuthority && (projectSupervisor || selectedAuthority.can_delegate_supervisor || selectedAuthority.is_acting_project_manager) && (
        <section className="card rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="text-2xs font-bold uppercase tracking-wider text-amber-700">Project Supervisor</span>
              <div className="mt-1 text-sm font-bold text-text-primary">
                {projectSupervisor ? projectSupervisor.full_name : "Belum ditetapkan"}
              </div>
              {projectSupervisor && <div className="text-2xs text-text-secondary">{projectSupervisor.email} · Acting Project Manager</div>}
            </div>
            {selectedAuthority.can_delegate_supervisor && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input min-w-[240px] text-xs"
                  value={supervisorCandidateId}
                  onChange={(event) => setSupervisorCandidateId(event.target.value)}
                >
                  <option value="">Pilih Staff / Supervisor</option>
                  {companyUsers.map((member) => (
                    <option key={member.id} value={member.id}>{member.full_name} ({member.role_name || member.role_in_project})</option>
                  ))}
                </select>
                <button
                  className="btn-primary py-1.5 px-3 text-xs disabled:opacity-50"
                  disabled={!supervisorCandidateId || supervisorSaving}
                  onClick={handleAssignSupervisor}
                >
                  {projectSupervisor ? "Change Supervisor" : "Assign Supervisor"}
                </button>
                {projectSupervisor && (
                  <button
                    className="btn-ghost py-1.5 px-3 text-xs text-red-600 disabled:opacity-50"
                    disabled={supervisorSaving}
                    onClick={handleRevokeSupervisor}
                  >
                    Revoke Supervisor
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Lifecycle Stage Flow ── */}
      {(userRole !== "staff" || canManageSelectedProject) && <div className="card p-4 rounded-2xl flex flex-col gap-3">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-bold text-text-primary">Project Lifecycle Stage Flow</h3>
            <p className="text-2xs text-text-secondary">Alur transisi gate operasional dan verifikasi mutu.</p>
          </div>
          {selectedAuthority?.can_delegate_supervisor && (
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
                  isPassed ? "bg-brand-light-green/60 border-brand-primary-soft text-brand-deep-green" :
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
      </div>}

      {/* ── Visual Analytics & Executive Control Widgets (1:1 Figma Design) ── */}
      <div className="flex flex-col gap-6 w-full">
        {/* Widget 1: Timeline Gantt (W1-W8 Full Width Live Project Data) */}
        <ProjectTimelineGantt
          projectName={selectedProject?.project_name}
          tasks={realGanttTasks}
        />

        {/* Widget 3: Project List & Milestone Stepper (Full Width Live Project Data) */}
        {(userRole !== "staff" || isActingProjectManager) && <ProjectMilestoneCard
          selectedProjectId={selectedId ?? ""}
          onSelectProject={(id) => setSelectedId(id)}
          milestones={realMilestones}
          projects={projects.map((p) => ({
            id: String(p.id),
            name: p.project_name || (p as any).name || `Proyek #${p.id}`,
            code: p.project_code || (p as any).code,
            status: p.status,
          }))}
        />}
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-text-tertiary overflow-x-auto no-scrollbar pb-1">
        {(userRole === "staff" && !isActingProjectManager ? [
          { key: "TREE", label: "Task Terkait Saya", icon: Layers, count: mainTasks.length },
        ] : [
          { key: "TREE", label: "Hierarki Task (Full WBS Plan)", icon: Layers, count: mainTasks.length },
          { key: "WORKSPACE", label: "Workspace Personal Saya (Semua Proyek)", icon: Users, count: allPersonalTasks.length },
          { key: "TRANSFERS", label: "Transfer Requests", icon: RefreshCw, count: transfers.length },
          { key: "MILESTONES", label: "Milestones & Gates", icon: ShieldCheck, count: selectedProject?.milestones?.length },
          ...(canViewFinancials ? [{ key: "FINANCIAL", label: "Biaya, Dana & Billing", icon: DollarSign }] : []),
        ]).map((tab) => (
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
        <ProjectWbsTree
          mainTasks={mainTasks}
          isPM={isPM}
          canManageWbs={Boolean(selectedAuthority?.can_manage_wbs)}
          canAssignTeam={Boolean(selectedAuthority?.can_assign_team)}
          canManageWeeklyTasks={Boolean(selectedAuthority?.can_manage_weekly_tasks)}
          currentUserId={String(user?.id || "")}
          userRole={userRole}
          onCreateMainTaskClick={() => setIsCreateMainTaskOpen(true)}
          onAssignClick={(main) => openAssignModal(main)}
          onRemoveAssignment={async (main, assignmentId) => {
            try {
              await removeTaskAssignment(assignmentId);
              toast.success("Penugasan dihapus");
              await fetchProjects(true);
            } catch (error) {
              toast.error(getApiErrorDetail(error, "Gagal menghapus penugasan."));
            }
          }}
          onCreateWeeklyClick={(main) => {
            setActiveMainTask(main);
            const defaultAssigneeId = main.assignments?.[0]?.assignee || main.assignments?.[0]?.assignee_id || "";
            const today = localDateKey();
            const nextWeek = localDateKey(new Date(Date.now() + 6 * 86400000));
            setWeeklyForm({
              week_number: String((main.weekly_tasks || main.weekly_plans || []).length + 1),
              target_description: "",
              start_date: today,
              end_date: nextWeek,
              assignee_id: String(defaultAssigneeId)
            });
            setIsCreateWeeklyOpen(true);
          }}
          onDeleteMainTask={async (mainId, name) => {
            const mainTask = (selectedProject?.main_tasks || []).find(
              (item) => String(item.id) === String(mainId),
            );
            const weeklyTaskCount = (mainTask?.weekly_tasks || mainTask?.weekly_plans || []).length;
            const assignmentCount = (mainTask?.assignments || []).length;
            if (weeklyTaskCount > 0 || assignmentCount > 0) {
              toast.error(
                `Main Task masih memiliki ${weeklyTaskCount} Weekly Task dan ${assignmentCount} assignment. Hapus relasi tersebut terlebih dahulu.`,
              );
              return;
            }
            if (!confirm(`Hapus Main Task "${name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
            try {
              await deleteMainTask(mainId);
              toast.success("Main Task dihapus");
            } catch (error: any) {
              if (error?.response?.status === 404) {
                toast.error("Main Task sudah tidak tersedia. Data proyek sedang disegarkan.");
              } else {
                toast.error(getApiErrorDetail(error, "Main Task tidak dapat dihapus."));
              }
            } finally {
              await fetchProjects(true);
            }
          }}
          onCreateDailyClick={(weekly) => {
            setActiveWeeklyTask(weekly);
            setDailyForm({
              title: "",
              time_slot: "09.00 - 12.00",
              planned_date: localDateKey(),
              output_result: "",
              notes: "",
              status: "IN_PROGRESS"
            });
            setIsCreateDailyOpen(true);
          }}
          onDeleteWeeklyTask={async (weeklyId, weekNum) => {
            const weeklyTask = (selectedProject?.main_tasks || [])
              .flatMap((main) => main.weekly_tasks || main.weekly_plans || [])
              .find((item) => String(item.id) === String(weeklyId));
            const dailyTaskCount = (weeklyTask?.daily_tasks || []).length;
            if (dailyTaskCount > 0) {
              toast.error(
                `Weekly Task masih memiliki ${dailyTaskCount} Daily Task. Hapus Daily Task terlebih dahulu.`,
              );
              return;
            }
            if (!confirm(`Hapus Target Mingguan #${weekNum}? Tindakan ini tidak dapat dibatalkan.`)) return;
            try {
              await deleteWeeklyTask(weeklyId);
              toast.success("Weekly Task dihapus");
            } catch (error: any) {
              if (error?.response?.status === 404) {
                toast.error("Weekly Task sudah tidak tersedia. Data proyek sedang disegarkan.");
              } else {
                toast.error(getApiErrorDetail(error, "Weekly Task tidak dapat dihapus."));
              }
            } finally {
              await fetchProjects(true);
            }
          }}
          onToggleDailyStatus={(daily, canManage) => handleQuickToggleDaily(daily, canManage)}
          onEditDailyClick={(daily) => {
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
          onTransferDailyClick={(daily) => {
            setActiveDailyTask(daily);
            setTransferTargetUserId("");
            setIsTransferModalOpen(true);
          }}
          onDeleteDailyTask={async (dailyId, title) => {
            if (!confirm(`Hapus aktivitas "${title}"? Tindakan ini tidak dapat dibatalkan.`)) return;
            try {
              await deleteDailyTask(dailyId);
              toast.success("Aktivitas harian dihapus");
            } catch (error: any) {
              if (error?.response?.status === 404) {
                toast.error("Daily Task sudah tidak tersedia. Data proyek sedang disegarkan.");
              } else {
                toast.error(getApiErrorDetail(error, "Daily Task tidak dapat dihapus."));
              }
            } finally {
              await fetchProjects(true);
            }
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2: WORKSPACE PERSONAL SAYA
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
                    Hentikan stopwatch
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setTimerDailyId("active");
                      toast("Stopwatch aktif.");
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
                { id: "BLOCKED", label: "Terkendala" },
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
              <div className="table-scroll-wrapper">
                <table className="w-full data-table text-xs text-left min-w-[640px]">
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
                    {filteredPersonalTasks.map(({ projectName, projectCode, mainTaskName, weekNumber, daily }) => {
                      const isDone = daily.status === "COMPLETED" || daily.status === "DONE";
                      const isBlocked = daily.is_blocked || daily.status === "BLOCKED";
                      const isDailyOwner = String(daily.owner_id || (daily as any).owner || "") === String(user?.id);

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
                                onClick={() => handleQuickToggleDaily(daily, isDailyOwner)}
                                disabled={!isDailyOwner}
                                className={cn(
                                  "w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-all flex-shrink-0",
                                  !isDailyOwner && "cursor-not-allowed opacity-40 bg-gray-100",
                                  isDone ? "bg-brand-green border-brand-green text-white" : "border-gray-300 hover:border-brand-green"
                                )}
                                title={!isDailyOwner ? "Hanya pemilik task yang dapat memperbarui progres" : (isDone ? "Tandai belum selesai" : "Tandai selesai")}
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

                          <td className="py-3 px-3.5 align-top max-w-[200px] text-brand-deep-green">
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
                              {isDailyOwner && (
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
                              )}

                              {(isDailyOwner || selectedAuthority?.can_direct_reassign) && (
                                <button
                                  onClick={() => {
                                    setActiveDailyTask(daily);
                                    setTransferTargetUserId("");
                                    setIsTransferModalOpen(true);
                                  }}
                                  className="p-1 rounded text-amber-600 hover:bg-amber-50"
                                  title={selectedAuthority?.can_direct_reassign ? "Alihkan Task" : "Ajukan Alih Tugas"}
                                >
                                  <RefreshCw size={12} />
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
                    {selectedAuthority?.can_review_task_transfer && tr.status === "PENDING" ? (
                      <>
                        <button
                          onClick={async () => {
                            try {
                              await approveTransfer(tr.id);
                              toast.success("Transfer tugas disetujui!");
                              await fetchProjects(true);
                            } catch {
                              toast.error("Transfer tidak dapat disetujui");
                            }
                          }}
                          className="btn-primary py-1 px-3 text-xs bg-brand-green"
                        >
                          Setujui
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await rejectTransfer(tr.id);
                              toast.success("Transfer tugas ditolak");
                              await fetchProjects(true);
                            } catch {
                              toast.error("Transfer tidak dapat ditolak");
                            }
                          }}
                          className="btn-ghost py-1 px-3 text-xs text-red-600"
                        >
                          Tolak
                        </button>
                      </>
                    ) : (
                      <span className="badge text-2xs">{tr.status}</span>
                    )}
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
            <div>
              <h3 className="text-sm font-bold text-text-primary">Daftar Milestone Proyek Aktif</h3>
              <p className="text-2xs text-text-secondary">Pencapaian target termin dan verifikasi mutu proyek terpilih.</p>
            </div>
            {selectedAuthority?.can_manage_milestones && (
              <button
                onClick={() => setIsMilestoneModalOpen(true)}
                className="btn-primary py-1.5 px-3 text-xs gap-1.5"
              >
                <Plus size={14} /> Tambah Milestone
              </button>
            )}
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
                    <CheckCircle2 size={16} className={cn(m.is_passed ? "text-brand-green" : "text-gray-300")} />
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
          <div className="card p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-card-lg border border-slate-700">
            <div className="flex justify-between items-center flex-wrap gap-3 mb-4 pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
                    <DollarSign size={18} className="text-brand-primary-soft" /> Analisis Laba Rugi (P&L) & Realisasi Finansial Proyek
                  </h3>
                  <span className={cn(
                    "badge text-2xs font-extrabold px-2 py-0.5 rounded-full",
                    financialPerformance?.financial_health_status === "PROFITABLE" ? "bg-brand-light-green0/20 text-brand-primary-soft border border-brand-green/40" :
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
                    className="btn-outline py-1 px-3 text-xs text-brand-primary-soft border-brand-green/50 hover:bg-brand-light-green0/10 gap-1.5"
                  >
                    <Edit size={12} /> Edit Target Finansial & Budget
                  </button>
                )}
                <button
                  onClick={() => setIsFundingRequestOpen(true)}
                  className="btn-primary py-1 px-3 text-xs bg-brand-green hover:bg-brand-light-green0 gap-1.5 font-bold"
                >
                  <Plus size={12} /> + Ajukan Permintaan Dana (Budgeting)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                <span className="text-2xs text-white/60 block font-medium">Target Revenue (Nilai Kontrak)</span>
                <span className="text-base font-extrabold text-white mt-1 block">
                  {formatRupiah(Number(financialPerformance?.expected_revenue ?? selectedProject?.contract_amount ?? 0))}
                </span>
                <span className="text-3xs text-brand-primary-soft mt-0.5 block">
                  Invoiced: {formatRupiah(Number(financialPerformance?.invoiced_revenue ?? 0))}
                </span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                <span className="text-2xs text-white/60 block font-medium">Total Anggaran (Budget Baseline)</span>
                <span className="text-base font-extrabold text-white mt-1 block">
                  {formatRupiah(Number(financialPerformance?.planned_budget ?? selectedProject?.budget_amount ?? selectedProject?.budget ?? 0))}
                </span>
                <span className="text-3xs text-cyan-400 mt-0.5 block">
                  Utilisasi: {financialPerformance?.budget_utilization_percent ?? 0}%
                </span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                <span className="text-2xs text-white/60 block font-medium">Actual Cost (Biaya Riil Terpakai)</span>
                <span className="text-base font-extrabold text-amber-300 mt-1 block">
                  {formatRupiah(Number(financialPerformance?.actual_cost ?? selectedProject?.actual_cost ?? 0))}
                </span>
                <span className="text-3xs text-white/50 mt-0.5 block">
                  Tenaga Kerja, Material & Alat
                </span>
              </div>

              <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                <span className="text-2xs text-white/60 block font-medium">Proyeksi Laba Bersih (Gross Margin)</span>
                <span className={cn(
                  "text-base font-extrabold mt-1 block",
                  Number(financialPerformance?.actual_gross_profit ?? 0) >= 0 ? "text-brand-primary-soft" : "text-red-400"
                )}>
                  {formatRupiah(Number(financialPerformance?.actual_gross_profit ?? 0))}
                </span>
                <span className="text-3xs text-white/70 mt-0.5 block">
                  Margin: <b>{financialPerformance?.actual_margin_percent ?? 0}%</b> (Target: {financialPerformance?.target_margin_percent ?? 0}%)
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        <div className="mt-1 flex items-center gap-2"><CategoryLabel label={f.expense_type || f.category || "OPERATIONAL"} /><span className="text-2xs text-text-secondary">{f.expense_date || "-"}</span></div>
                      </div>
                      <div className="text-right">
                        <strong className="text-brand-deep-green block">{formatRupiah(Number(f.amount))}</strong>
                        <span className={cn("badge text-3xs font-bold", f.status === "APPROVED" || f.status === "DISBURSED" ? "badge-success" : "badge-info")}>
                          {f.status || "SUBMITTED"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card p-4 rounded-2xl border border-text-tertiary bg-white shadow-xs">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-xs font-bold text-text-primary">Catatan Biaya Riil (Actual Cost)</h3>
                  <span className="text-3xs text-text-secondary">Pengeluaran & Belanja Lapangan</span>
                </div>
                <span className="text-3xs text-text-secondary">Dicatat melalui modul Finance</span>
              </div>
              <div className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
                {(!selectedProject?.cost_entries || selectedProject.cost_entries.length === 0) ? (
                  <div className="p-6 text-center text-2xs text-text-secondary">Belum ada pengeluaran biaya tercatat.</div>
                ) : (
                  selectedProject.cost_entries.map(c => (
                    <div key={c.id} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-text-primary block">{c.description || c.category}</span>
                        <div className="mt-1"><CategoryLabel label={c.category} /></div>
                      </div>
                      <strong className="text-brand-deep-green">{formatRupiah(Number(c.amount))}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card p-4 rounded-2xl border border-text-tertiary bg-white shadow-xs">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-xs font-bold text-text-primary">Billing & Termin Invoice</h3>
                  <span className="text-3xs text-text-secondary">Klaim Pembayaran Customer</span>
                </div>
                <span className="text-3xs text-text-secondary">Diajukan melalui modul Finance</span>
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
                      <strong className="text-brand-deep-green">{formatRupiah(Number(b.amount))}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <Modal
        isOpen={isCreateMainTaskOpen}
        onClose={() => {
          setIsCreateMainTaskOpen(false);
          setMainTaskErrors({});
        }}
        title="Buat Main Task / Paket Kerja Utama"
        subtitle={`Struktur WBS Level 1 — Proyek: ${selectedProject?.project_name}`}
        size="lg"
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Divisi Pemilik Biaya</label>
            <select value={mainTaskForm.cost_owner_division_id} onChange={e => setMainTaskForm({ ...mainTaskForm, cost_owner_division_id: e.target.value })} className="input text-xs">
              <option value="">Belum ditentukan</option>
              {divisionOptions.map((division) => <option key={division.id} value={division.id}>{division.organization_name ?? division.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Judul Paket Kerja Utama (Main Task) *</label>
            <input
              type="text"
              placeholder="Contoh: Desain 3D, Storyboard, Pengadaan Komponen"
              value={mainTaskForm.title}
              onChange={e => {
                setMainTaskForm({ ...mainTaskForm, title: e.target.value });
                setMainTaskErrors((current) => ({ ...current, title: "" }));
              }}
              className={cn("input text-xs", mainTaskErrors.title && "border-red-500 focus:border-red-500")}
              autoFocus
            />
            {mainTaskErrors.title && <p className="mt-1 text-2xs text-red-600">{mainTaskErrors.title}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Bobot Kontribusi Proyek (%) *</label>
              <input
                type="number"
                min="1"
                max="100"
                placeholder="1–100"
                value={mainTaskForm.weight}
                onChange={e => {
                  setMainTaskForm({ ...mainTaskForm, weight: e.target.value });
                  setMainTaskErrors((current) => ({ ...current, weight: "" }));
                }}
                className={cn("input text-xs", mainTaskErrors.weight && "border-red-500 focus:border-red-500")}
              />
              {mainTaskErrors.weight && <p className="mt-1 text-2xs text-red-600">{mainTaskErrors.weight}</p>}
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Prioritas Eksekusi</label>
              <select
                value={mainTaskForm.priority}
                onChange={e => setMainTaskForm({ ...mainTaskForm, priority: e.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT" })}
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
            <button onClick={() => { setIsCreateMainTaskOpen(false); setMainTaskErrors({}); }} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleAddMainTask} className="btn-primary py-1.5 px-4 text-xs bg-brand-deep-green hover:bg-brand-green">
              Simpan Main Task
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Tugaskan Anggota ke Main Task (PM Delegation)"
        subtitle={`Paket Kerja: ${activeMainTask?.name || activeMainTask?.title}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-secondary">
            Pilih satu atau lebih anggota tim yang ditugaskan untuk mengeksekusi paket kerja ini:
          </p>

          <div className="max-h-60 overflow-y-auto border border-text-tertiary rounded-xl p-2 flex flex-col gap-2 bg-gray-50/60">
            {companyUsers.length === 0 && (
              <p className="p-3 text-center text-xs text-text-secondary">Belum ada anggota aktif yang dapat ditugaskan pada company ini.</p>
            )}
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
            <button disabled={assignmentSaving} onClick={handleAssignMember} className="btn-primary py-1.5 px-4 text-xs bg-brand-deep-green hover:bg-brand-green disabled:opacity-60 disabled:cursor-not-allowed">
              {assignmentSaving ? "Menyimpan..." : `Simpan Penugasan (${selectedAssigneeIds.length} Anggota)`}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isCreateWeeklyOpen}
        onClose={() => {
          setIsCreateWeeklyOpen(false);
          setWeeklyErrors({});
        }}
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
                onChange={e => {
                  setWeeklyForm({ ...weeklyForm, week_number: e.target.value });
                  setWeeklyErrors((current) => ({ ...current, week_number: "" }));
                }}
                className={cn("input text-xs", weeklyErrors.week_number && "border-red-500 focus:border-red-500")}
              />
              {weeklyErrors.week_number && <p className="mt-1 text-2xs text-red-600">{weeklyErrors.week_number}</p>}
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Assignee / PIC Mingguan *</label>
              <select
                value={weeklyForm.assignee_id}
                onChange={e => {
                  setWeeklyForm({ ...weeklyForm, assignee_id: e.target.value });
                  setWeeklyErrors((current) => ({ ...current, assignee_id: "" }));
                }}
                className={cn("input text-xs", weeklyErrors.assignee_id && "border-red-500 focus:border-red-500")}
              >
                <option value="">— Pilih assignee Main Task —</option>
                {activeMainTask?.assignments && activeMainTask.assignments.length > 0 ? (
                  activeMainTask.assignments.map(a => (
                    <option key={a.id} value={String(a.assignee || a.assignee_id || "")}>
                      {a.assignee_name || a.user_name} (assignee terpilih)
                    </option>
                  ))
                ) : null}

              </select>
              {(!activeMainTask?.assignments || activeMainTask.assignments.length === 0) && (
                <p className="mt-1 text-2xs text-amber-700">Assign Staff ke Main Task terlebih dahulu.</p>
              )}
              {weeklyErrors.assignee_id && <p className="mt-1 text-2xs text-red-600">{weeklyErrors.assignee_id}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Start Date *</label>
              <input
                type="date"
                value={weeklyForm.start_date}
                onChange={e => {
                  setWeeklyForm({ ...weeklyForm, start_date: e.target.value });
                  setWeeklyErrors((current) => ({ ...current, start_date: "", end_date: "" }));
                }}
                className={cn("input text-xs", weeklyErrors.start_date && "border-red-500 focus:border-red-500")}
              />
              {weeklyErrors.start_date && <p className="mt-1 text-2xs text-red-600">{weeklyErrors.start_date}</p>}
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">End Date *</label>
              <input
                type="date"
                value={weeklyForm.end_date}
                min={weeklyForm.start_date || undefined}
                onChange={e => {
                  setWeeklyForm({ ...weeklyForm, end_date: e.target.value });
                  setWeeklyErrors((current) => ({ ...current, end_date: "" }));
                }}
                className={cn("input text-xs", weeklyErrors.end_date && "border-red-500 focus:border-red-500")}
              />
              {weeklyErrors.end_date && <p className="mt-1 text-2xs text-red-600">{weeklyErrors.end_date}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Target Pekerjaan Mingguan *</label>
            <textarea
              rows={2}
              placeholder="Contoh: Menyelesaikan skema tabel dan API endpoints..."
              value={weeklyForm.target_description}
              onChange={e => {
                setWeeklyForm({ ...weeklyForm, target_description: e.target.value });
                setWeeklyErrors((current) => ({ ...current, target_description: "" }));
              }}
              className={cn("input text-xs", weeklyErrors.target_description && "border-red-500 focus:border-red-500")}
            />
            {weeklyErrors.target_description && <p className="mt-1 text-2xs text-red-600">{weeklyErrors.target_description}</p>}
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setIsCreateWeeklyOpen(false); setWeeklyErrors({}); }} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button disabled={weeklySaving} onClick={handleAddWeeklyPlan} className="btn-primary py-1.5 px-4 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed">
              {weeklySaving ? "Menyimpan..." : "Simpan Target Mingguan"}
            </button>
          </div>
        </div>
      </Modal>

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
                placeholder="Contoh: 09.00 - 12.00"
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
              <span className="text-3xs text-text-secondary bg-gray-100 px-2 py-0.5 rounded">Opsional</span>
            </div>
            <textarea
              rows={2}
              placeholder="Opsional: Tuliskan hasil jika sudah selesai..."
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
                <option value="IN_PROGRESS">On Progress (Sedang Dikerjakan)</option>
                <option value="NOT_STARTED">Not done yet (Belum Dimulai)</option>
                <option value="COMPLETED">Selesai (Completed 100%)</option>
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
            <button disabled={dailySaving} onClick={handleAddDailyTask} className="btn-primary py-1.5 px-4 text-xs bg-brand-green hover:bg-brand-deep-green font-bold disabled:opacity-60 disabled:cursor-not-allowed">
              {dailySaving ? "Menyimpan..." : "Simpan Aktivitas Harian"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isEditDailyOpen}
        onClose={() => setIsEditDailyOpen(false)}
        title="Task Details"
        subtitle={`${activeDailyTask?.title || activeDailyTask?.activity_input || "Daily Task"} · ${selectedProject?.project_name || "Project"}`}
        maxWidth="4xl"
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
          <div className="lg:col-start-2 lg:row-start-1">
            <label className="text-xs font-bold text-text-primary block mb-1">Output (Hasil yang Didapat / Deliverable)</label>
            <textarea
              rows={2}
              placeholder="Hasil konkret atau luaran yang didapatkan..."
              value={editDailyForm.output_result}
              onChange={e => setEditDailyForm({ ...editDailyForm, output_result: e.target.value })}
              className="input text-xs"
            />
          </div>

          <section className="rounded-xl border border-[#d7ddd5] bg-white p-5 lg:col-start-1 lg:row-span-4 lg:row-start-1">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#435247]">Progress Achievement</div>
                <p className="mt-0.5 text-2xs text-text-secondary">Dikompilasi otomatis dari checklist capaian.</p>
              </div>
              <div className="text-sm font-semibold text-[#435247] tabular-nums">{checklistProgress}%</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#EAF6FF]" role="progressbar" aria-valuenow={checklistProgress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[#294BB2] transition-all duration-300" style={{ width: `${checklistProgress}%` }} />
            </div>

            <div className="mt-4 space-y-1">
              {checklistItems.map((item) => {
                const done = ['DONE', 'COMPLETED', 'CHECKED', 'APPROVED'].includes(String(item.status).toUpperCase());
                return <button type="button" key={item.id} onClick={() => toggleChecklistItem(item)} className="group flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-[#f8fbf4]">
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border', done ? 'border-[#789d50] bg-[#789d50] text-white' : 'border-[#789d50] bg-white')}>
                    {done && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className={cn('min-w-0 flex-1 text-xs', done ? 'text-[#667068]' : 'text-[#435247]')}>{item.title}</span>
                  {item.target_date && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#EAF6FF] px-3 py-1 text-2xs font-medium text-[#2649B3]">
                    {new Date(item.target_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}<Clock size={11} />
                  </span>}
                </button>;
              })}
              {checklistItems.length === 0 && <div className="rounded-lg border border-dashed border-[#cdd9c5] py-5 text-center text-xs text-text-secondary">Belum ada checklist capaian.</div>}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-[#e5e9e3] pt-4 sm:grid-cols-[1fr_150px_auto]">
              <input value={newChecklistTitle} onChange={(event) => setNewChecklistTitle(event.target.value)} placeholder="Nama capaian baru" className="input text-xs" />
              <input type="date" value={newChecklistDate} onChange={(event) => setNewChecklistDate(event.target.value)} className="input text-xs" aria-label="Tanggal target checklist" />
              <button type="button" onClick={addChecklistItem} disabled={!newChecklistTitle.trim()} className="btn-primary px-4 text-xs disabled:cursor-not-allowed disabled:opacity-50">Tambah</button>
            </div>
          </section>

          <div className="rounded-xl border border-[#d7ddd5] bg-[#fafcf8] p-4 lg:col-start-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#435247]">Status Pekerjaan</div>
                <p className="mt-1 text-2xs text-text-secondary">
                  {checklistItems.length > 0 ? "Status normal mengikuti checklist secara otomatis." : "Status menjadi selesai saat task ditandai selesai."}
                </p>
              </div>
              <span className={cn(
                "shrink-0 rounded-full px-3 py-1 text-2xs font-semibold",
                editDailyForm.status === "BLOCKED" ? "bg-red-100 text-red-700" : checklistProgress >= 100 ? "bg-[#EAF6FF] text-[#2649B3]" : "bg-[#EAF6FF] text-[#2649B3]"
              )}>
                {editDailyForm.status === "BLOCKED" ? "Blocked" : checklistProgress >= 100 ? "Completed" : checklistProgress > 0 ? "In Progress" : "Not Started"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditDailyForm({ ...editDailyForm, status: editDailyForm.status === "BLOCKED" ? "ON_PROGRESS" : "BLOCKED", is_blocked: editDailyForm.status !== "BLOCKED", block_reason: editDailyForm.status === "BLOCKED" ? "" : editDailyForm.block_reason })}
              className={cn("mt-3 text-2xs font-semibold", editDailyForm.status === "BLOCKED" ? "text-brand-deep-green" : "text-red-600")}
            >
              {editDailyForm.status === "BLOCKED" ? "Tandai kendala selesai" : "Laporkan task terkendala"}
            </button>
          </div>

          <div className="lg:col-start-2">
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
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 lg:col-start-2">
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

          <div className="flex justify-end gap-2 border-t border-[#e5e9e3] pt-4 lg:col-span-2">
            <button onClick={() => setIsEditDailyOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleSaveEditDaily} className="btn-primary py-1.5 px-4 text-xs bg-brand-green hover:bg-brand-deep-green font-bold">
              Simpan Perubahan Aktivitas
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setTransferTargetUserId("");
          setTransferReason("");
        }}
        title={selectedAuthority?.can_direct_reassign ? "Alihkan Daily Task" : "Ajukan Alih Tugas (Task Transfer)"}
        subtitle={`Task: ${activeDailyTask?.title}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-secondary">
            {selectedAuthority?.can_direct_reassign
              ? "Pilih anggota aktif sebagai pemilik baru. Perubahan ini akan dicatat sebagai reassignment oleh PM/OM."
              : "Pilih anggota tujuan dan ajukan permohonan kepada Project Manager untuk ditinjau."}
          </p>
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Anggota Tujuan *</label>
            <select
              value={transferTargetUserId}
              onChange={e => setTransferTargetUserId(e.target.value)}
              className="input text-xs"
            >
              <option value="">Pilih anggota aktif</option>
              {companyUsers
                .filter(member => String(member.id) !== String(activeDailyTask?.owner_id || (activeDailyTask as any)?.owner || ""))
                .map(member => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || member.username || member.email}
                  </option>
                ))}
            </select>
          </div>
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
            <button onClick={() => {
              setIsTransferModalOpen(false);
              setTransferTargetUserId("");
              setTransferReason("");
            }} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button
              onClick={handleSendTransfer}
              disabled={!transferTargetUserId || !transferReason.trim()}
              className="btn-primary py-1.5 px-4 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              {selectedAuthority?.can_direct_reassign ? "Alihkan Task" : "Kirim Permohonan"}
            </button>
          </div>
        </div>
      </Modal>

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
              placeholder="Contoh: Implementasi Sistem Otomasi Pabrik"
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-text-secondary">Klien / Customer</label>
                {newProjForm.customer_name.trim() && !customerOptions.includes(newProjForm.customer_name.trim()) && (
                  <span className="text-3xs font-extrabold text-brand-deep-green bg-brand-light-green border border-brand-primary-soft px-1.5 py-0.5 rounded-md">
                    + Klien Baru (Otomatis Disimpan)
                  </span>
                )}
              </div>
              <input
                type="text"
                list="client-suggestions"
                placeholder="Pilih dari database atau ketik klien baru..."
                value={newProjForm.customer_name}
                onChange={e => setNewProjForm({ ...newProjForm, customer_name: e.target.value })}
                className="input text-xs"
              />
              <datalist id="client-suggestions">
                {customerOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-text-secondary block mb-1">Total Anggaran (Rp)</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={newProjForm.budget_amount}
              onChange={e => setNewProjForm({ ...newProjForm, budget_amount: e.target.value })}
              className="input text-xs"
            />
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
              <span className="text-3xs text-text-secondary mt-0.5 block">{healthData?.sv || "Sesuai Jadwal"}</span>
            </div>
            <div className="card p-3 bg-gray-50 rounded-xl">
              <span className="text-2xs text-text-secondary">Cost Performance (CPI)</span>
              <div className="text-xl font-bold text-brand-green mt-1">{healthData?.cpi || "1.02"}</div>
              <span className="text-3xs text-text-secondary mt-0.5 block">{healthData?.cv || "On Budget"}</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-brand-light-green/60 border border-brand-green/30 text-xs">
            <span className="font-bold text-brand-deep-green block mb-1">Rekomendasi Diagnostik Otomatis:</span>
            <p className="text-text-primary text-2xs leading-relaxed">
              {healthData?.recommendation || "Kinerja proyek berada dalam koridor aman."}
            </p>
          </div>
          <button onClick={() => setIsHealthModalOpen(false)} className="btn-primary w-full justify-center py-2 text-xs">
            Tutup Diagnostik
          </button>
        </div>
      </Modal>

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
              <span>4. Checklist QA & Kontrol Mutu Terpenuhi</span>
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
                  target_date: milestoneForm.target_date || localDateKey()
                });
                toast.success("Milestone berhasil ditambahkan!");
                setIsMilestoneModalOpen(false);
                setMilestoneForm({ name: "", target_date: "" });
                await fetchProjects(true);
              }}
              className="btn-primary py-1.5 px-4 text-xs"
            >
              Simpan Milestone
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Target Finansial */}
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
              min="0"
              placeholder="0"
              value={financialTargetForm.contract_amount}
              onChange={e => setFinancialTargetForm((prev) => ({ ...prev, contract_amount: e.target.value }))}
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Pagu Anggaran Disetujui (Planned Budget Baseline Rp) *</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={financialTargetForm.budget_amount}
              onChange={e => setFinancialTargetForm((prev) => ({ ...prev, budget_amount: e.target.value }))}
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Target Profit Margin (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="0"
              value={financialTargetForm.target_margin_percent}
              onChange={e => setFinancialTargetForm((prev) => ({ ...prev, target_margin_percent: e.target.value }))}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setIsEditFinancialsOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button onClick={handleUpdateFinancialTargets} className="btn-primary py-1.5 px-4 text-xs bg-brand-green hover:bg-brand-deep-green">
              Simpan Target Finansial
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Funding Request */}
      <Modal
        isOpen={isFundingRequestOpen}
        onClose={() => {
          setIsFundingRequestOpen(false);
          setFundingRequestErrors({});
        }}
        title="Ajukan Permintaan Dana & Budgeting Proyek (Cash Advance)"
        subtitle={`Proyek: ${selectedProject?.project_name}`}
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div className="p-3 bg-brand-light-green rounded-xl border border-brand-primary-soft text-xs text-brand-deep-green">
            Pengajuan ini akan diteruskan ke tab <b>Project Funding</b> pada modul Finance untuk diverifikasi dan disetujui oleh <b>Finance Approver</b>.
          </div>
          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Kategori Pengeluaran / Kebutuhan *</label>
            <select
              value={fundingRequestForm.category}
              onChange={e => {
                setFundingRequestForm({ ...fundingRequestForm, category: e.target.value });
                setFundingRequestErrors((current) => ({ ...current, category: "" }));
              }}
              className={cn("input text-xs", fundingRequestErrors.category && "border-red-500 focus:border-red-500")}
            >
              <option value="">— Pilih kategori kebutuhan —</option>
              <option value="OPERATIONAL">Dana Operasional Tim</option>
              <option value="MATERIAL">Pengadaan Material Kritis</option>
              <option value="LOGISTICS">Transportasi & Logistik Lapangan</option>
              <option value="EQUIPMENT">Sewa Alat & Perizinan</option>
              <option value="OTHER">Lain-lain (Emergency Fund)</option>
            </select>
            {fundingRequestErrors.category && <p className="mt-1 text-2xs text-red-600">{fundingRequestErrors.category}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Jumlah Dana yang Diajukan (Rp) *</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={fundingRequestForm.amount}
              onChange={e => {
                setFundingRequestForm({ ...fundingRequestForm, amount: e.target.value });
                setFundingRequestErrors((current) => ({ ...current, amount: "" }));
              }}
              className={cn("input text-xs", fundingRequestErrors.amount && "border-red-500 focus:border-red-500")}
            />
            {fundingRequestErrors.amount && <p className="mt-1 text-2xs text-red-600">{fundingRequestErrors.amount}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Keterangan / Alasan Permintaan Dana *</label>
            <textarea
              rows={2}
              placeholder="Jelaskan kebutuhan pengeluaran dana dan peruntukannya di lapangan..."
              value={fundingRequestForm.description}
              onChange={e => {
                setFundingRequestForm({ ...fundingRequestForm, description: e.target.value });
                setFundingRequestErrors((current) => ({ ...current, description: "" }));
              }}
              className={cn("input text-xs", fundingRequestErrors.description && "border-red-500 focus:border-red-500")}
            />
            {fundingRequestErrors.description && <p className="mt-1 text-2xs text-red-600">{fundingRequestErrors.description}</p>}
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setIsFundingRequestOpen(false); setFundingRequestErrors({}); }} className="btn-ghost py-1.5 px-3 text-xs">Batal</button>
            <button disabled={fundingSaving} onClick={handleCreateFundingRequest} className="btn-primary py-1.5 px-4 text-xs bg-brand-green hover:bg-brand-deep-green font-bold disabled:opacity-60 disabled:cursor-not-allowed">
              {fundingSaving ? "Mengirim..." : "Kirim Permintaan ke Finance"}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

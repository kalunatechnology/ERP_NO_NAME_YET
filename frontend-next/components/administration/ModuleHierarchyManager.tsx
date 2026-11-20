"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  History,
  Layers,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  GitBranch,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { getUserFacingApiError } from "@/lib/api/error-message";

export interface TierConfigRow {
  id: string;
  company_id: string;
  module_code: string;
  tier_level: number;
  custom_title: string;
  default_title: string;
  description?: string | null;
  is_active: boolean;
}

export interface TierPermissionRow {
  id: string;
  company_id: string;
  module_code: string;
  tier_level: number;
  permission_code: string;
  allow_read: boolean;
  allow_write: boolean;
  allow_approve: boolean;
  allow_delete: boolean;
  allow_manage_users: boolean;
  allow_export: boolean;
}

export interface ModuleAssignmentRow {
  id: string;
  company_id: string;
  user_id: string;
  module_code: string;
  profile_code?: string | null;
  profile_id?: string | null;
  tier_level: number;
  position_title?: string | null;
  department_id?: string | null;
  reports_to_user_id?: string | null;
  data_scope: string;
  status: string;
  is_primary_position: boolean;
  updated_at?: string;
}

interface ModuleRoleProfile {
  id: string;
  module_code: string;
  profile_code: string;
  display_name: string;
  is_active: boolean;
  capabilities?: Array<{ capability_code: string; effect: string }>;
}

export interface CrossModuleCapabilityRow {
  id: string;
  user_id: string;
  source_module_code: string;
  target_module_code: string;
  capability_code: string;
  allowed_actions: string;
  status: string;
}

export interface ApprovalDelegationRow {
  id: string;
  delegator_user_id: string;
  delegate_user_id: string;
  module_code: string;
  max_amount?: number | string | null;
  reason?: string | null;
  valid_from: string;
  valid_until: string;
  revoked_at?: string | null;
}

export interface AssignmentHistoryRow {
  id: string;
  actor_id?: string | null;
  target_user_id: string;
  module_code: string;
  change_type: string;
  before_json: string;
  after_json: string;
  reason?: string | null;
  created_at: string;
}

interface ModuleHierarchyManagerProps {
  companyId: string;
  users: Array<{ id: string; full_name?: string; email: string; role_level?: string }>;
  departments: Array<{ id: string; code: string; name: string }>;
}

const TIER_BADGES: Record<number, { label: string; color: string }> = {
  0: { label: "GM Oversight (Payung Lintas Modul)", color: "bg-purple-100 text-purple-800 border-purple-200" },
  1: { label: "Level 1 — Module Head / Manager", color: "bg-blue-100 text-blue-800 border-blue-200" },
  2: { label: "Level 2 — Supervisor / Team Lead", color: "bg-amber-100 text-amber-800 border-amber-200" },
  3: { label: "Level 3 — Staff / Executor", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

const HIERARCHY_MODULES = [
  "PROJECTS",
  "CRM",
  "SALES",
  "FINANCE",
  "INVENTORY",
  "PROCUREMENT",
  "REPORTING",
  "REQUESTS",
  "HRMS",
  "ASSETS",
  "MARBOT",
];

export function ModuleHierarchyManager({
  companyId,
  users,
  departments,
}: ModuleHierarchyManagerProps) {
  const [subTab, setSubTab] = useState<"assignments" | "tiers" | "bridges" | "history">("assignments");
  const [loading, setLoading] = useState(false);
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>("ALL");

  const [tierConfigs, setTierConfigs] = useState<TierConfigRow[]>([]);
  const [tierPermissions, setTierPermissions] = useState<TierPermissionRow[]>([]);
  const [assignments, setAssignments] = useState<ModuleAssignmentRow[]>([]);
  const [roleProfiles, setRoleProfiles] = useState<ModuleRoleProfile[]>([]);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [userModuleAccess, setUserModuleAccess] = useState<Array<{ id?: string; user_id: string; module_code: string; allow_read: boolean; allow_write: boolean }>>([]);
  const [capabilities, setCapabilities] = useState<CrossModuleCapabilityRow[]>([]);
  const [delegations, setDelegations] = useState<ApprovalDelegationRow[]>([]);
  const [history, setHistory] = useState<AssignmentHistoryRow[]>([]);

  // Form: Multi-Module User Assignment
  const [assignForm, setAssignForm] = useState({
    user_id: "",
    profile_id: "",
    module_code: "PROJECTS",
    tier_level: 3,
    position_title: "",
    department_id: "",
    reports_to_user_id: "",
    data_scope: "ALL",
    reason: "",
  });
  const [profileForm, setProfileForm] = useState({ profile_code: "", display_name: "", legacy_role_code: "", capabilities: ["READ"] as string[] });
  const [submittingAssign, setSubmittingAssign] = useState(false);

  // Form: Cross-Module Capability
  const [capForm, setCapForm] = useState({
    user_id: "",
    source_module_code: "PROJECTS",
    target_module_code: "FINANCE",
    capability_code: "SUBMIT_BUDGET_REQUEST",
    allow_read: true,
    allow_action: true,
  });

  // Form: Approval Delegation (DoA)
  const [doaForm, setDoaForm] = useState({
    delegator_user_id: "",
    delegate_user_id: "",
    module_code: "FINANCE",
    max_approval_amount: "10000000",
    valid_until: "",
    reason: "Delegasi persetujuan sementara (Cuti / Dinas)",
  });

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.full_name || u.email));
    return map;
  }, [users]);

  const loadHierarchy = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await api.get("/api/v1/accounts/module-hierarchy", {
        params: { company_id: companyId },
        headers: { "X-Company-ID": companyId },
      });
      const data = res.data || {};
      setTierConfigs(Array.isArray(data.tier_configs) ? data.tier_configs : []);
      setTierPermissions(Array.isArray(data.tier_permissions) ? data.tier_permissions : []);
      setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
      const available = Array.isArray(data.module_entitlements)
        ? data.module_entitlements.filter((item: any) => item.enabled && item.allow_read).map((item: any) => String(item.module_code).toUpperCase())
        : [];
      setEnabledModules(available);
      setRoleProfiles(Array.isArray(data.role_profiles) ? data.role_profiles : []);
      setCapabilities(Array.isArray(data.cross_module_capabilities) ? data.cross_module_capabilities : []);
      setDelegations(Array.isArray(data.delegations) ? data.delegations : []);
      setHistory(Array.isArray(data.history) ? data.history : []);
      setUserModuleAccess(Array.isArray(data.user_module_access) ? data.user_module_access : []);
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal memuat konfigurasi hirarki modul 3-tingkat."));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadHierarchy();
  }, [loadHierarchy]);

  useEffect(() => {
    if (enabledModules.length && !enabledModules.includes(assignForm.module_code)) {
      setAssignForm((previous) => ({ ...previous, module_code: enabledModules[0], profile_id: "" }));
    }
  }, [enabledModules, assignForm.module_code]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.user_id) {
      toast.error("Pilih pengguna terlebih dahulu.");
      return;
    }
    setSubmittingAssign(true);
    try {
      await api.post(
        "/api/v1/accounts/module-role-assignments",
        {
          company_id: companyId,
          ...assignForm,
          effective_until: undefined,
          tier_level: Number(assignForm.tier_level),
        },
        { headers: { "X-Company-ID": companyId } },
      );
      toast.success("Role profile dan penugasan modul berhasil disimpan.");
      setAssignForm((prev) => ({ ...prev, profile_id: "", position_title: "", reason: "" }));
      await loadHierarchy();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal menyimpan penugasan modul."));
    } finally {
      setSubmittingAssign(false);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/v1/accounts/module-role-profiles", {
        company_id: companyId,
        module_code: assignForm.module_code,
        ...profileForm,
      }, { headers: { "X-Company-ID": companyId } });
      toast.success("Role profile berhasil disimpan.");
      setProfileForm({ profile_code: "", display_name: "", legacy_role_code: "", capabilities: ["READ"] });
      await loadHierarchy();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal membuat role profile."));
    }
  };

  const availableProfiles = roleProfiles.filter((profile) => profile.module_code === assignForm.module_code && profile.is_active);

  const handleDeleteAssignment = async (id: string) => {
    try {
      await api.delete(`/api/v1/accounts/module-assignments/${id}`, {
        headers: { "X-Company-ID": companyId },
      });
      toast.success("Penugasan modul & delegasi akses terkait dihapus.");
      await loadHierarchy();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal menghapus penugasan modul."));
    }
  };

  const handleRevokeDirectModuleAccess = async (userId: string, moduleCode: string) => {
    try {
      await api.delete(`/api/v1/accounts/users/${userId}/module-access/${moduleCode}`, {
        headers: { "X-Company-ID": companyId },
      });
      toast.success(`Akses langsung modul ${moduleCode} dicabut.`);
      await loadHierarchy();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal mencabut akses modul."));
    }
  };

  const handleSaveTierConfig = async (
    cfg: TierConfigRow,
    perm?: TierPermissionRow,
    updates?: Partial<TierConfigRow & TierPermissionRow>,
  ) => {
    try {
      await api.post(
        "/api/v1/accounts/module-tiers",
        {
          company_id: companyId,
          module_code: cfg.module_code,
          tier_level: cfg.tier_level,
          custom_title: updates?.custom_title ?? cfg.custom_title,
          description: updates?.description ?? cfg.description,
          allow_read: updates?.allow_read ?? perm?.allow_read ?? true,
          allow_write: updates?.allow_write ?? perm?.allow_write ?? true,
          allow_approve: updates?.allow_approve ?? perm?.allow_approve ?? false,
          allow_delete: updates?.allow_delete ?? perm?.allow_delete ?? false,
          allow_manage_users: updates?.allow_manage_users ?? perm?.allow_manage_users ?? false,
          allow_export: updates?.allow_export ?? perm?.allow_export ?? false,
        },
        { headers: { "X-Company-ID": companyId } },
      );
      toast.success(`Konfigurasi ${cfg.module_code} Level ${cfg.tier_level} diperbarui.`);
      await loadHierarchy();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal memperbarui konfigurasi tingkatan modul."));
    }
  };

  const handleSaveCapability = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(
        "/api/v1/accounts/cross-module-capabilities",
        { company_id: companyId, ...capForm },
        { headers: { "X-Company-ID": companyId } },
      );
      toast.success("Aturan jembatan hak akses lintas modul disimpan.");
      await loadHierarchy();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal menyimpan jembatan lintas modul."));
    }
  };

  const handleCreateDoa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doaForm.delegator_user_id || !doaForm.delegate_user_id) {
      toast.error("Pilih pemberi dan penerima delegasi.");
      return;
    }
    try {
      await api.post(
        "/api/v1/accounts/approval-delegations",
        {
          company_id: companyId,
          ...doaForm,
          max_approval_amount: doaForm.max_approval_amount ? Number(doaForm.max_approval_amount) : null,
        },
        { headers: { "X-Company-ID": companyId } },
      );
      toast.success("Delegation of Authority (DoA) berhasil diaktifkan.");
      await loadHierarchy();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal membuat delegasi persetujuan."));
    }
  };

  const handleRevokeDoa = async (id: string) => {
    try {
      await api.post(
        `/api/v1/accounts/approval-delegations/${id}/revoke`,
        {},
        { headers: { "X-Company-ID": companyId } },
      );
      toast.success("Delegasi persetujuan dicabut.");
      await loadHierarchy();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal mencabut delegasi."));
    }
  };

  const filteredAssignments = useMemo(() => {
    if (selectedModuleFilter === "ALL") return assignments;
    return assignments.filter((a) => a.module_code === selectedModuleFilter);
  }, [assignments, selectedModuleFilter]);

  // Multi-module user 360 summary
  const multiModuleUsers = useMemo(() => {
    const byUser = new Map<string, ModuleAssignmentRow[]>();
    assignments.forEach((a) => {
      const list = byUser.get(a.user_id) || [];
      list.push(a);
      byUser.set(a.user_id, list);
    });
    return Array.from(byUser.entries());
  }, [assignments]);

  return (
    <div className="space-y-6">
      {/* Architecture Banner */}
      <div className="rounded-[24px] border border-[#DCE8F8] bg-gradient-to-r from-[#F0F7FF] via-white to-[#F8FAFC] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#163D64] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
              <Layers size={12} /> Role Profile & Capability per Modul
            </span>
            <h2 className="mt-2 text-lg font-bold text-[#0F172A]">
              Role Profile Modular
            </h2>
            <p className="mt-1 text-xs text-[#475569]">
              Setiap modul memiliki profil, capability, dan cakupan datanya sendiri. Role global hanya mengatur tata kelola company dan platform.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadHierarchy()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-xs font-semibold text-[#163D64] hover:bg-[#F8FAFC]"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Segarkan Data
          </button>
        </div>

        {/* Sub-navigation */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E2E8F0] pt-4">
          <button
            type="button"
            onClick={() => setSubTab("assignments")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              subTab === "assignments"
                ? "bg-[#163D64] text-white shadow-sm"
                : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
            }`}
          >
            <Users size={14} /> Penugasan Multi-Modul User 360° ({assignments.length})
          </button>
            <button
            type="button"
              disabled
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
            }`}
              title="Tier global lama tidak dipakai oleh role profile per modul."
          >
              <ShieldCheck size={14} /> Tier Global Lama (Tidak Aktif)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("bridges")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              subTab === "bridges"
                ? "bg-[#163D64] text-white shadow-sm"
                : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
            }`}
          >
            <GitBranch size={14} /> Jembatan Lintas Modul & Delegasi Approval (DoA)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("history")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              subTab === "history"
                ? "bg-[#163D64] text-white shadow-sm"
                : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
            }`}
          >
            <History size={14} /> Riwayat Mutasi & Promosi Jabatan ({history.length})
          </button>
        </div>
      </div>

      {/* SUBTAB 1: MULTI-MODULE USER ASSIGNMENTS */}
      {subTab === "assignments" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Form Penugasan */}
          <form
            onSubmit={handleAssignSubmit}
            className="lg:col-span-4 rounded-[24px] border border-[#E2E8F0] bg-white p-5 space-y-4 self-start"
          >
            <div>
              <h3 className="text-sm font-bold text-[#163D64]">
                + Tetapkan Jabatan User pada Modul
              </h3>
              <p className="text-xs text-[#64748B]">
                Tetapkan satu atau beberapa tanggung jawab modul. Capability ditentukan oleh profile dan cakupan data oleh assignment.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#334155]">Pilih Pengguna</label>
              <select
                value={assignForm.user_id}
                onChange={(e) => setAssignForm((p) => ({ ...p, user_id: e.target.value }))}
                className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#0F172A]"
                required
              >
                <option value="">-- Pilih User --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#334155]">Role Profile Modul</label>
              <select
                value={assignForm.profile_id}
                onChange={(e) => setAssignForm((p) => ({ ...p, profile_id: e.target.value }))}
                className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#0F172A]"
                required
              >
                <option value="">-- Pilih Role Profile --</option>
                {availableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.profile_code} — {profile.display_name}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">Role berlaku hanya di modul ini. Buat profil dulu jika belum tersedia.</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#334155]">Modul</label>
                <select
                  value={assignForm.module_code}
                  onChange={(e) => setAssignForm((p) => ({ ...p, module_code: e.target.value, profile_id: "" }))}
                  className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#0F172A]"
                >
                  {HIERARCHY_MODULES.filter((m) => enabledModules.includes(m)).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#334155]">
                Nama Jabatan Spesifik (Opsional)
              </label>
              <input
                type="text"
                value={assignForm.position_title}
                onChange={(e) => setAssignForm((p) => ({ ...p, position_title: e.target.value }))}
                placeholder="Mis. Head of Project Delivery / Senior AP Staff"
                className="h-10 w-full rounded-xl border border-[#CBD5E1] px-3 text-xs text-[#0F172A]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#334155]">Cakupan Data (Data Scope)</label>
                <select
                  value={assignForm.data_scope}
                  onChange={(e) => setAssignForm((p) => ({ ...p, data_scope: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs text-[#0F172A]"
                >
                  <option value="ALL">ALL (Seluruh Data Modul)</option>
                  <option value="DIVISION">DIVISION (Cakupan Divisi)</option>
                  <option value="DEPARTMENT">DEPARTMENT (Cakupan Departemen)</option>
                  <option value="TEAM">TEAM (Bawahan / Tim)</option>
                  <option value="OWN">OWN (Hanya Data Milik Sendiri)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#334155]">Atasan Langsung (Reports To)</label>
                <select
                  value={assignForm.reports_to_user_id}
                  onChange={(e) => setAssignForm((p) => ({ ...p, reports_to_user_id: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs text-[#0F172A]"
                >
                  <option value="">-- Tidak Ditentukan --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#334155]">Departemen / Unit</label>
              <select
                value={assignForm.department_id}
                onChange={(e) => setAssignForm((p) => ({ ...p, department_id: e.target.value }))}
                className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs text-[#0F172A]"
              >
                <option value="">-- Mengikuti Departemen Utama User --</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.code}] {d.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
                disabled={submittingAssign || !assignForm.profile_id || !enabledModules.includes(assignForm.module_code)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#163D64] px-4 text-xs font-bold text-white hover:bg-[#1D3A96] disabled:opacity-50"
            >
              <Plus size={15} />
              {submittingAssign ? "Menyimpan..." : "Simpan Penugasan Modul"}
            </button>

            <div className="border-t border-slate-200 pt-4">
              <h4 className="text-xs font-bold text-[#163D64]">Buat Role Profile untuk {assignForm.module_code}</h4>
              <form onSubmit={handleCreateProfile} className="mt-3 space-y-2">
                <input
                  required
                  value={profileForm.profile_code}
                  onChange={(e) => setProfileForm((p) => ({ ...p, profile_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") }))}
                  placeholder="Kode, misalnya SALES atau SUPERVISOR"
                  className="h-9 w-full rounded-lg border border-[#CBD5E1] px-3 text-xs"
                />
                <select
                  value={profileForm.legacy_role_code}
                  onChange={(e) => setProfileForm((p) => ({ ...p, legacy_role_code: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs"
                >
                  <option value="">Kompatibilitas endpoint lama (opsional)</option>
                  {(assignForm.module_code === "CRM" || assignForm.module_code === "SALES"
                    ? [["ROLE-SALES", "Sales"], ["ROLE-CRM-LEAD", "CRM Lead"]]
                    : assignForm.module_code === "PROJECTS"
                      ? [["ROLE-STAFF", "Staff"], ["ROLE-SUPERVISOR", "Supervisor"], ["ROLE-PM", "Project Manager"]]
                      : assignForm.module_code === "FINANCE"
                        ? [["ROLE-FINANCE", "Finance"]]
                        : [["ROLE-OM", "Operational Manager"], ["ROLE-SUPERVISOR", "Supervisor"]]
                  ).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
                <input
                  required
                  value={profileForm.display_name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, display_name: e.target.value }))}
                  placeholder="Nama yang tampil"
                  className="h-9 w-full rounded-lg border border-[#CBD5E1] px-3 text-xs"
                />
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {["READ", "WRITE", "APPROVE", "DELETE", "MANAGE_USERS", "EXPORT"].map((capability) => (
                    <label key={capability} className="flex items-center gap-1 text-[10px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={profileForm.capabilities.includes(capability)}
                        onChange={(e) => setProfileForm((p) => ({
                          ...p,
                          capabilities: e.target.checked
                            ? Array.from(new Set([...p.capabilities, capability]))
                            : p.capabilities.filter((item) => item !== capability),
                        }))}
                      />
                      {capability}
                    </label>
                  ))}
                </div>
                <button type="submit" disabled={!enabledModules.includes(assignForm.module_code)} className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-xs font-semibold text-[#163D64] disabled:opacity-50">
                  Simpan Profile Modul
                </button>
              </form>
            </div>
          </form>

          {/* Daftar Penugasan & User 360 */}
          <div className="lg:col-span-8 space-y-5">
            {/* Multi-Module User 360 Cards */}
            <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Peta Jabatan Lintas Modul per Pengguna (User 360° Matrix)
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Menampilkan role profile, cakupan data, dan masa berlaku pada tiap modul.
                  </p>
                </div>
                <select
                  value={selectedModuleFilter}
                  onChange={(e) => setSelectedModuleFilter(e.target.value)}
                  className="h-9 rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#0F172A]"
                >
                  <option value="ALL">Semua Modul ({assignments.length})</option>
                  {HIERARCHY_MODULES.map((m) => (
                    <option key={m} value={m}>
                      Modul {m}
                    </option>
                  ))}
                </select>
              </div>

              {filteredAssignments.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#64748B]">
                  Belum ada role profile yang ditugaskan pada filter ini. Buat profil modul, lalu tetapkan kepada user.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[11px] uppercase text-[#64748B]">
                        <th className="py-2.5 pr-3">Pengguna</th>
                        <th className="py-2.5 px-3">Modul</th>
                        <th className="py-2.5 px-3">Tingkatan & Jabatan</th>
                        <th className="py-2.5 px-3">Data Scope & Atasan</th>
                        <th className="py-2.5 pl-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {filteredAssignments.map((row) => {
                        const badge = TIER_BADGES[row.tier_level] || TIER_BADGES[3];
                        const userAllMods = multiModuleUsers.find(([uid]) => uid === row.user_id)?.[1] || [];
                        return (
                          <tr key={row.id} className="hover:bg-[#F8FAFC]">
                            <td className="py-3 pr-3">
                              <div className="font-bold text-[#0F172A]">
                                {userMap.get(row.user_id) || row.user_id}
                              </div>
                              {userAllMods.length > 1 && (
                                <span className="mt-0.5 inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  Multi-Modul ({userAllMods.length} Posisi Aktif)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <span className="rounded-lg bg-[#F1F5F9] px-2.5 py-1 font-bold text-[#163D64]">
                                {row.module_code}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.color}`}>
                                {badge.label}
                              </span>
                              {row.position_title && (
                                <div className="mt-1 text-[11px] font-medium text-[#334155]">
                                  Jabatan: {row.position_title}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-[#0F172A]">Scope: {row.data_scope}</div>
                              {row.reports_to_user_id && (
                                <div className="text-[11px] text-[#64748B]">
                                  Atasan: {userMap.get(row.reports_to_user_id) || row.reports_to_user_id}
                                </div>
                              )}
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <button
                                type="button"
                                onClick={() => void handleDeleteAssignment(row.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                                title="Hapus penugasan modul"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {(() => {
                const visibleDirectAccess = userModuleAccess.filter(
                  (uma) =>
                    (uma.allow_read || uma.allow_write) &&
                    (selectedModuleFilter === "ALL" || String(uma.module_code).toUpperCase() === selectedModuleFilter),
                );
                if (visibleDirectAccess.length === 0) return null;
                return (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-amber-950">
                          Delegasi / Akses Modul Langsung yang Masih Aktif ({visibleDirectAccess.length})
                        </h4>
                        <p className="text-[11px] text-amber-800">
                          User di bawah ini masih memiliki akses baca/tulis modul (di luar penugasan 3-tingkat). Cabut jika tidak lagi diperlukan.
                        </p>
                      </div>
                    </div>
                    <div className="divide-y divide-amber-200/70 rounded-xl border border-amber-200 bg-white">
                      {visibleDirectAccess.map((uma) => (
                        <div key={`${uma.user_id}-${uma.module_code}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900">{userMap.get(uma.user_id) || uma.user_id}</span>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-[#163D64]">{uma.module_code}</span>
                            <span className="text-[11px] text-slate-600">
                              {uma.allow_read ? "Read" : ""}{uma.allow_read && uma.allow_write ? " + " : ""}{uma.allow_write ? "Write" : ""}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRevokeDirectModuleAccess(uma.user_id, uma.module_code)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                          >
                            <Trash2 size={12} />
                            Cabut Akses
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: 3-TIER MODULE MATRIX & CUSTOM TITLES */}
      {subTab === "tiers" && (
        <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">
              Kustomisasi Nama Jabatan & Hak Akses Default per Tingkatan Modul (Level 1, 2, 3)
            </h3>
            <p className="text-xs text-[#64748B]">
              Sesuaikan istilah jabatan pada tiap modul (mis. &quot;Project Manager&quot; untuk Level 1 Projects, atau &quot;Chief Accountant&quot; untuk Level 1 Finance) beserta izin dasarnya.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-[11px] uppercase text-[#64748B]">
                  <th className="py-2.5 pr-3">Modul</th>
                  <th className="py-2.5 px-3">Tingkatan</th>
                  <th className="py-2.5 px-3">Nama Jabatan Kustom (Custom Title)</th>
                  <th className="py-2.5 px-3 text-center">Read</th>
                  <th className="py-2.5 px-3 text-center">Write</th>
                  <th className="py-2.5 px-3 text-center">Approve</th>
                  <th className="py-2.5 px-3 text-center">Manage Team</th>
                  <th className="py-2.5 px-3 text-center">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {tierConfigs.map((cfg) => {
                  const perm = tierPermissions.find(
                    (p) => p.module_code === cfg.module_code && p.tier_level === cfg.tier_level,
                  );
                  return (
                    <tr key={cfg.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-2.5 pr-3 font-bold text-[#163D64]">{cfg.module_code}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${(TIER_BADGES[cfg.tier_level] || TIER_BADGES[3]).color}`}>
                          Level {cfg.tier_level}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          defaultValue={cfg.custom_title}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val && val !== cfg.custom_title) {
                              void handleSaveTierConfig(cfg, perm, { custom_title: val });
                            }
                          }}
                          className="h-8 w-56 rounded-lg border border-[#CBD5E1] px-2.5 text-xs font-medium text-[#0F172A]"
                        />
                      </td>
                      {(["allow_read", "allow_write", "allow_approve", "allow_manage_users", "allow_export"] as const).map(
                        (field) => {
                          const checked = Boolean(perm ? perm[field] : false);
                          return (
                            <td key={field} className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  void handleSaveTierConfig(cfg, perm, { [field]: e.target.checked })
                                }
                                className="h-4 w-4 rounded border-[#CBD5E1] text-[#163D64]"
                              />
                            </td>
                          );
                        },
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: CROSS-MODULE CAPABILITIES & DELEGATION OF AUTHORITY (DoA) */}
      {subTab === "bridges" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Cross-Module Capability */}
          <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#163D64]">
                Jembatan Hak Akses Lintas Modul (Cross-Module Capability)
              </h3>
              <p className="text-xs text-[#64748B]">
                Izinkan pejabat di satu modul melakukan aksi terukur ke modul lain tanpa harus menjadi anggota penuh modul tujuan.
              </p>
            </div>

            <form onSubmit={handleSaveCapability} className="grid grid-cols-2 gap-3 rounded-2xl bg-[#F8FAFC] p-4">
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-[#334155]">Pengguna</label>
                <select
                  value={capForm.user_id}
                  onChange={(e) => setCapForm((p) => ({ ...p, user_id: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                  required
                >
                  <option value="">-- Pilih Pengguna --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#334155]">Modul Asal</label>
                <select
                  value={capForm.source_module_code}
                  onChange={(e) => setCapForm((p) => ({ ...p, source_module_code: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                >
                  {HIERARCHY_MODULES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#334155]">Modul Tujuan</label>
                <select
                  value={capForm.target_module_code}
                  onChange={(e) => setCapForm((p) => ({ ...p, target_module_code: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                >
                  {HIERARCHY_MODULES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-[#334155]">Kode Kapabilitas</label>
                <input
                  type="text"
                  value={capForm.capability_code}
                  onChange={(e) => setCapForm((p) => ({ ...p, capability_code: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                />
              </div>
              <div className="col-span-2">
                <button
                  type="submit"
                  className="h-9 w-full rounded-xl bg-[#163D64] text-xs font-bold text-white hover:bg-[#1D3A96]"
                >
                  + Simpan Aturan Jembatan Lintas Modul
                </button>
              </div>
            </form>

            <div className="divide-y divide-[#F1F5F9] text-xs">
              {capabilities.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="font-bold text-[#163D64]">
                      {userMap.get(c.user_id) || c.user_id}
                    </span>{" "}
                    ({c.source_module_code} → <span className="font-bold text-[#0F172A]">{c.target_module_code}</span>)
                    <div className="text-[11px] text-[#64748B]">Kapabilitas: {c.capability_code} • Aksi: {c.allowed_actions}</div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Delegation of Authority (DoA) */}
          <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#163D64]">
                Delegation of Authority (DoA) — Delegasi Approval Sementara
              </h3>
              <p className="text-xs text-[#64748B]">
                Delegasikan wewenang persetujuan modul (dengan plafon nilai & masa berlaku) tanpa melanggar Segregation of Duties (SoD).
              </p>
            </div>

            <form onSubmit={handleCreateDoa} className="grid grid-cols-2 gap-3 rounded-2xl bg-[#F8FAFC] p-4">
              <div>
                <label className="text-[11px] font-semibold text-[#334155]">Pemberi Delegasi (Delegator)</label>
                <select
                  value={doaForm.delegator_user_id}
                  onChange={(e) => setDoaForm((p) => ({ ...p, delegator_user_id: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                  required
                >
                  <option value="">-- Pilih Pemberi --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#334155]">Penerima Delegasi (Delegate)</label>
                <select
                  value={doaForm.delegate_user_id}
                  onChange={(e) => setDoaForm((p) => ({ ...p, delegate_user_id: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                  required
                >
                  <option value="">-- Pilih Penerima --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#334155]">Modul</label>
                <select
                  value={doaForm.module_code}
                  onChange={(e) => setDoaForm((p) => ({ ...p, module_code: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                >
                  {HIERARCHY_MODULES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#334155]">Batas Nilai Approval (Rp)</label>
                <input
                  type="number"
                  value={doaForm.max_approval_amount}
                  onChange={(e) => setDoaForm((p) => ({ ...p, max_approval_amount: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-xs"
                />
              </div>
              <div className="col-span-2">
                <button
                  type="submit"
                  className="h-9 w-full rounded-xl bg-[#163D64] text-xs font-bold text-white hover:bg-[#1D3A96]"
                >
                  + Aktifkan Delegasi Approval (DoA)
                </button>
              </div>
            </form>

            <div className="divide-y divide-[#F1F5F9] text-xs">
              {delegations.map((d) => {
                const isActive = !d.revoked_at && new Date(d.valid_until) >= new Date();
                return (
                  <div key={d.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <div className="font-bold text-[#0F172A]">
                        {userMap.get(d.delegator_user_id) || d.delegator_user_id} →{" "}
                        {userMap.get(d.delegate_user_id) || d.delegate_user_id}
                      </div>
                      <div className="text-[11px] text-[#64748B]">
                        Modul {d.module_code} • Maks: Rp {Number(d.max_amount || 0).toLocaleString("id-ID")} • Status: {d.revoked_at ? "DICABUT" : isActive ? "AKTIF" : "KEDALUWARSA"}
                      </div>
                    </div>
                    {!d.revoked_at && (
                      <button
                        type="button"
                        onClick={() => void handleRevokeDoa(d.id)}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                      >
                        Cabut
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: AUDIT HISTORY */}
      {subTab === "history" && (
        <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#0F172A]">
            Jejak Audit Penugasan & Promosi Jabatan Modul (`iam_assignment_history`)
          </h3>
          {history.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#64748B]">Belum ada riwayat perubahan jabatan modul.</p>
          ) : (
            <div className="divide-y divide-[#F1F5F9] text-xs">
              {history.map((h) => {
                let before: any = {};
                let after: any = {};
                try { before = JSON.parse(h.before_json || "{}"); } catch { /* ignore */ }
                try { after = JSON.parse(h.after_json || "{}"); } catch { /* ignore */ }
                return (
                  <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <span className="font-bold text-[#163D64]">{userMap.get(h.target_user_id) || h.target_user_id}</span>{" "}
                      pada modul <span className="font-bold">{h.module_code}</span> —{" "}
                      <span className="rounded bg-[#F1F5F9] px-2 py-0.5 font-semibold">{h.change_type}</span>
                      <div className="mt-0.5 text-[11px] text-[#64748B]">
                        Level: {before.tier_level ?? "—"} → {after.tier_level ?? "—"} • Scope:{" "}
                        {before.data_scope ?? "—"} → {after.data_scope ?? "—"} ({h.reason || "Tanpa catatan"})
                      </div>
                    </div>
                    <span className="text-[11px] text-[#64748B]">
                      {new Date(h.created_at).toLocaleString("id-ID")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


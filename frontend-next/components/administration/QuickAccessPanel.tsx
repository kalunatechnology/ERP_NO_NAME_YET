"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  ChevronRight,
  Layers,
  LayoutDashboard,
  Lock,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { getUserFacingApiError } from "@/lib/api/error-message";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

export interface DashboardWidgetCatalogItem {
  code: string;
  title: string;
  description: string;
  required_module: string | null;
  is_baseline: boolean;
}

export interface ModuleGrantItem {
  module_code: string;
  tier_level: number;
  allow_read: boolean;
  allow_write: boolean;
  data_scope: "OWN" | "TEAM" | "ALL";
}

export interface QuickAccessPreset {
  preset_key: string;
  label: string;
  role_level: "GM" | "SPV" | "STAFF";
  default_job_title: string;
  modules: ModuleGrantItem[];
  dashboard_widgets: string[];
}

export interface UserAccessProfile {
  id: string;
  email: string;
  full_name?: string;
  is_active?: boolean;
  department_id?: string | null;
  role_level?: string;
  job_title?: string;
  reports_to_user_id?: string | null;
  roles?: Array<{ id?: string; role_code?: string; role_name?: string }>;
}

interface QuickAccessPanelProps {
  companyId: string;
  selectedUserId: string;
  selectedUser?: UserAccessProfile;
  isSelfSelected?: boolean;
  allUsers: Array<{ id: string; full_name?: string; email: string }>;
  departments: Array<{
    id: string;
    code: string;
    name: string;
    unit_type?: string;
    is_cost_center?: boolean;
  }>;
  onSaved?: () => void;
  onCreateUnit?: (unitType: "DEPARTMENT" | "DIVISION") => void;
}

export function getCleanInitials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return "U";
  const clean = nameOrEmail
    .replace(/[()[\]{}_@.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return "U";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const DEFAULT_CATALOG: DashboardWidgetCatalogItem[] = [
  {
    code: "DASH_PERSONAL",
    title: "Workspace Pribadi (Baseline)",
    description: "Proyek terkait pribadi, Main Task, Weekly Task, Daily Task, dan pengajuan sendiri.",
    required_module: "PROJECTS",
    is_baseline: true,
  },
  {
    code: "DASH_PROJECTS",
    title: "Portofolio Proyek & WBS Tim",
    description: "Portofolio proyek perusahaan, WBS manajemen, milestone, dan monitoring tim.",
    required_module: "PROJECTS",
    is_baseline: false,
  },
  {
    code: "DASH_CRM",
    title: "CRM & Sales Pipeline",
    description: "Pipeline lead, opportunity, quotation, dan performa penjualan.",
    required_module: "CRM",
    is_baseline: false,
  },
  {
    code: "DASH_FINANCE",
    title: "Keuangan, Arus Kas & Anggaran",
    description: "Ringkasan arus kas, piutang/utang (AR/AP), realisasi anggaran, dan keuangan.",
    required_module: "FINANCE",
    is_baseline: false,
  },
  {
    code: "DASH_INVENTORY",
    title: "Inventori, Gudang & Aset",
    description: "Status stok gudang, pergerakan barang transit, reservasi, dan aset operasional.",
    required_module: "INVENTORY",
    is_baseline: false,
  },
  {
    code: "DASH_EXECUTIVE",
    title: "Executive 360° & WBS Direksi",
    description: "Data direksi 360° lintas modul & pemantauan WBS perusahaan lengkap.",
    required_module: "REPORTING",
    is_baseline: false,
  },
];

const DEFAULT_PRESETS: QuickAccessPreset[] = [
  {
    preset_key: "STAFF_BASELINE",
    label: "Baseline Staff",
    role_level: "STAFF",
    default_job_title: "Staff Operasional",
    modules: [{ module_code: "PROJECTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" }],
    dashboard_widgets: ["DASH_PERSONAL"],
  },
  {
    preset_key: "SUPERVISOR",
    label: "Supervisor Tim",
    role_level: "SPV",
    default_job_title: "Supervisor",
    modules: [{ module_code: "PROJECTS", tier_level: 2, allow_read: true, allow_write: true, data_scope: "TEAM" }],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_PROJECTS"],
  },
  {
    preset_key: "PROJECT_MANAGER",
    label: "Project Manager (PM)",
    role_level: "SPV",
    default_job_title: "Project Manager",
    modules: [
      { module_code: "PROJECTS", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "REPORTING", tier_level: 2, allow_read: true, allow_write: false, data_scope: "ALL" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_PROJECTS"],
  },
  {
    preset_key: "OPERATIONAL_MANAGER",
    label: "OM / Inventory",
    role_level: "GM",
    default_job_title: "Operational Manager",
    modules: [
      { module_code: "INVENTORY", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "PROJECTS", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "PROCUREMENT", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "REPORTING", tier_level: 2, allow_read: true, allow_write: false, data_scope: "ALL" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_INVENTORY", "DASH_PROJECTS"],
  },
  {
    preset_key: "FINANCE",
    label: "Finance & Accounting",
    role_level: "SPV",
    default_job_title: "Finance Officer",
    modules: [
      { module_code: "FINANCE", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "REPORTING", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "PROJECTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_FINANCE"],
  },
  {
    preset_key: "CRM_LEAD",
    label: "CRM Lead",
    role_level: "SPV",
    default_job_title: "CRM & Sales Lead",
    modules: [
      { module_code: "CRM", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "SALES", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "PROJECTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_CRM"],
  },
  {
    preset_key: "SALES",
    label: "Sales Executive",
    role_level: "STAFF",
    default_job_title: "Sales Executive",
    modules: [
      { module_code: "CRM", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
      { module_code: "SALES", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
      { module_code: "PROJECTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_CRM"],
  },
  {
    preset_key: "DIRECTOR_360",
    label: "Direktur Executive 360°",
    role_level: "GM",
    default_job_title: "Director",
    modules: [
      { module_code: "REPORTING", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "PROJECTS", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "FINANCE", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "CRM", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "INVENTORY", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
    ],
    dashboard_widgets: [
      "DASH_PERSONAL",
      "DASH_EXECUTIVE",
      "DASH_FINANCE",
      "DASH_PROJECTS",
      "DASH_CRM",
      "DASH_INVENTORY",
    ],
  },
];

const CONFIGURABLE_MODULES: Array<{
  code: string;
  label: string;
  description: string;
  isBaseline?: boolean;
}> = [
  {
    code: "PROJECTS",
    label: "Projects & WBS (Task Management)",
    description: "Baseline wajib agar user dapat mengakses Weekly Task & Daily Task pribadi.",
    isBaseline: true,
  },
  {
    code: "CRM",
    label: "CRM & Sales Pipeline",
    description: "Leads, Opportunity, Quotation, Kontrak & Customer Inbox.",
  },
  {
    code: "FINANCE",
    label: "Finance, Accounting & Tax",
    description: "Buku Besar (GL), Tagihan AR/AP, Arus Kas, Anggaran & Pajak.",
  },
  {
    code: "INVENTORY",
    label: "Inventory, Gudang & Aset",
    description: "Mutasi Stok Kanonis, Transit, Reservasi & Kapitalisasi Aset.",
  },
  {
    code: "REPORTING",
    label: "Reporting & Executive Analytics",
    description: "Laporan Manajemen & Analitik Kinerja Lintas Modul.",
  },
];

export function QuickAccessPanel({
  companyId,
  selectedUserId,
  selectedUser,
  isSelfSelected = false,
  allUsers,
  departments,
  onSaved,
  onCreateUnit,
}: QuickAccessPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<DashboardWidgetCatalogItem[]>(DEFAULT_CATALOG);
  const [presets, setPresets] = useState<QuickAccessPreset[]>(DEFAULT_PRESETS);
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);

  const [departmentId, setDepartmentId] = useState("");
  const [roleLevel, setRoleLevel] = useState<"GM" | "SPV" | "STAFF">("STAFF");
  const [reportsToUserId, setReportsToUserId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>(["DASH_PERSONAL"]);
  const [modules, setModules] = useState<ModuleGrantItem[]>([
    { module_code: "PROJECTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
  ]);
  const [derivedRoles, setDerivedRoles] = useState<string[]>([]);

  const loadQuickAccess = useCallback(async () => {
    if (!companyId || !selectedUserId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/v1/accounts/users/${selectedUserId}/quick-access`, {
        headers: { "X-Company-ID": companyId },
      });
      const payload = res.data || {};
      if (Array.isArray(payload.catalog) && payload.catalog.length > 0) {
        setCatalog(payload.catalog);
      }
      if (Array.isArray(payload.presets) && payload.presets.length > 0) {
        setPresets(payload.presets);
      }
      if (payload.user) {
        setDepartmentId(payload.user.department_id || "");
        setRoleLevel((payload.user.role_level || "STAFF") as "GM" | "SPV" | "STAFF");
        setReportsToUserId(payload.user.reports_to_user_id || "");
        setJobTitle(payload.user.job_title || "");
      }
      if (Array.isArray(payload.dashboard_widgets)) {
        setSelectedWidgets(Array.from(new Set(["DASH_PERSONAL", ...payload.dashboard_widgets])));
      }
      if (Array.isArray(payload.modules) && payload.modules.length > 0) {
        setModules(payload.modules);
      }
      if (Array.isArray(payload.roles)) {
        setDerivedRoles(payload.roles);
      }
      setActivePresetKey(null);
    } catch {
      // Fallback gracefully
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedUserId]);

  useEffect(() => {
    void loadQuickAccess();
  }, [loadQuickAccess]);

  const applyPreset = (preset: QuickAccessPreset) => {
    setActivePresetKey(preset.preset_key);
    setRoleLevel(preset.role_level);
    if (!jobTitle.trim() || presets.some((p) => p.default_job_title === jobTitle.trim())) {
      setJobTitle(preset.default_job_title);
    }
    setSelectedWidgets(Array.from(new Set(["DASH_PERSONAL", ...preset.dashboard_widgets])));
    setModules(preset.modules.map((m) => ({ ...m })));
  };

  const toggleWidget = (code: string) => {
    if (code === "DASH_PERSONAL") return;
    setActivePresetKey(null);
    setSelectedWidgets((prev) => {
      const has = prev.includes(code);
      const next = has ? prev.filter((item) => item !== code) : [...prev, code];
      return Array.from(new Set(["DASH_PERSONAL", ...next]));
    });
  };

  const getModuleGrant = (code: string): ModuleGrantItem | undefined =>
    modules.find((m) => m.module_code.toUpperCase() === code.toUpperCase());

  const toggleModuleEnabled = (code: string) => {
    if (code === "PROJECTS") return;
    setActivePresetKey(null);
    setModules((prev) => {
      const exists = prev.some((m) => m.module_code.toUpperCase() === code);
      if (exists) {
        return prev.filter(
          (m) => m.module_code.toUpperCase() !== code && !(code === "CRM" && m.module_code.toUpperCase() === "SALES")
        );
      }
      const defaultTier = roleLevel === "GM" ? 1 : roleLevel === "SPV" ? 2 : 3;
      const defaultScope: "OWN" | "TEAM" | "ALL" = defaultTier <= 1 ? "ALL" : defaultTier === 2 ? "TEAM" : "OWN";
      const next: ModuleGrantItem[] = [
        ...prev,
        {
          module_code: code,
          tier_level: defaultTier,
          allow_read: true,
          allow_write: true,
          data_scope: defaultScope,
        },
      ];
      if (code === "CRM" && !prev.some((m) => m.module_code.toUpperCase() === "SALES")) {
        next.push({
          module_code: "SALES",
          tier_level: defaultTier,
          allow_read: true,
          allow_write: true,
          data_scope: defaultScope,
        });
      }
      return next;
    });
  };

  const updateModuleTier = (code: string, tier: number) => {
    setActivePresetKey(null);
    const scope: "OWN" | "TEAM" | "ALL" = tier <= 1 ? "ALL" : tier === 2 ? "TEAM" : "OWN";
    const allowWrite = tier !== 0;
    setModules((prev) =>
      prev.map((m) => {
        if (m.module_code.toUpperCase() === code || (code === "CRM" && m.module_code.toUpperCase() === "SALES")) {
          return {
            ...m,
            tier_level: tier,
            allow_read: true,
            allow_write: allowWrite,
            data_scope: scope,
          };
        }
        return m;
      })
    );
  };

  const handleSave = async () => {
    if (!companyId || !selectedUserId) return;
    setSaving(true);
    try {
      const res = await api.put(
        `/api/v1/accounts/users/${selectedUserId}/quick-access`,
        {
          department_id: departmentId || null,
          role_level: roleLevel,
          reports_to_user_id: reportsToUserId || null,
          job_title: jobTitle.trim(),
          preset_key: activePresetKey,
          modules,
          dashboard_widgets: selectedWidgets,
          reason: "Quick Access Panel update by Company Admin",
        },
        { headers: { "X-Company-ID": companyId } }
      );
      if (Array.isArray(res.data?.roles)) {
        setDerivedRoles(res.data.roles);
      }
      toast.success("Akses Cepat, Jabatan, Panel Dashboard & Role berhasil disinkronkan!");
      window.dispatchEvent(new CustomEvent("erp:data-mutated"));
      if (onSaved) onSaved();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal menyimpan konfigurasi Quick Access."));
    } finally {
      setSaving(false);
    }
  };

  const managerOptions = allUsers
    .filter((u) => String(u.id) !== String(selectedUserId))
    .map((u) => ({
      value: String(u.id),
      label: u.full_name ? `${u.full_name} (${u.email})` : u.email,
    }));

  const departmentOptions = departments.map((d) => ({
    value: String(d.id),
    label: `[${d.code}] ${d.name}${d.is_cost_center ? " · Cost Center" : ""}`,
  }));

  const userDisplayName = selectedUser?.full_name || selectedUser?.email || "User";
  const userDisplayEmail = selectedUser?.email || "";

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      {/* 1. Header Profil User Terpadu */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-50/80 via-white to-blue-50/30 p-5 sm:p-6">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#163D64] to-[#0876CD] text-sm font-extrabold text-white shadow-2xs">
            {getCleanInitials(userDisplayName)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-[#163D64]">
                {userDisplayName}
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  selectedUser?.is_active === false
                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {selectedUser?.is_active === false ? "Nonaktif" : "Aktif"}
              </span>
              {isSelfSelected && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                  <Lock size={10} /> Akun Anda (Terlindungi)
                </span>
              )}
            </div>
            {userDisplayEmail && (
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                <Mail size={12} className="shrink-0" /> {userDisplayEmail}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {derivedRoles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mr-1">
              {derivedRoles.map((r) => (
                <span
                  key={r}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-[#163D64] shadow-2xs"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => void loadQuickAccess()}
            disabled={loading || saving}
            title="Muat ulang konfigurasi"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            disabled={isSelfSelected || saving || loading}
            onClick={() => void handleSave()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#163D64] px-4 text-xs font-bold text-white shadow-xs transition hover:bg-[#0876CD] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={13} />
            <span>{saving ? "Menyimpan…" : "Simpan Akses"}</span>
          </button>
        </div>
      </div>

      {/* Main Configuration Body */}
      <div className="p-5 sm:p-6 space-y-6">
        {/* Baseline Info Callout */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-slate-700">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-[#0876CD]" />
          <div className="leading-relaxed">
            <span className="font-bold text-[#163D64]">Baseline Seragam Terjamin: </span>
            Setiap anggota tim otomatis memiliki izin <strong>PROJECTS (Tier 3, OWN) + Workspace Pribadi</strong> agar selalu dapat mengakses Main Task, Weekly Task, dan Daily Task yang ditugaskan kepadanya.
          </div>
        </div>

        {/* 1. Preset Cepat 1-Klik */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#163D64] text-[10px] font-bold text-white">
                1
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#163D64]">
                Preset Akses Cepat 1-Klik
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">
              Pilih preset untuk otomatis mengonfigurasi modul, jabatan &amp; panel
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {presets.map((preset) => {
              const isSelected = activePresetKey === preset.preset_key;
              return (
                <button
                  key={preset.preset_key}
                  type="button"
                  disabled={isSelfSelected || saving}
                  onClick={() => applyPreset(preset)}
                  className={`flex items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                    isSelected
                      ? "border-[#163D64] bg-[#163D64] text-white shadow-2xs"
                      : "border-slate-200 bg-white text-[#163D64] hover:border-[#163D64]/40 hover:bg-[#F8FAFC]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span className="truncate">{preset.label}</span>
                  {isSelected ? (
                    <Check size={13} className="shrink-0 text-white" />
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400">
                      {preset.role_level}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Penempatan Organisasi & Garis Pelaporan (2-Kolom Seimbang) */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#163D64] text-[10px] font-bold text-white">
              2
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#163D64]">
              Penempatan Organisasi &amp; Garis Pelaporan
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Unit Utama / Cost Center */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#163D64]">
                  Unit Utama / Cost Center
                </label>
                {onCreateUnit && !isSelfSelected && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onCreateUnit("DEPARTMENT")}
                      className="rounded-lg border border-[#163D64]/20 bg-white px-2 py-0.5 text-[10px] font-bold text-[#163D64] shadow-2xs hover:bg-[#E7F2FF]"
                    >
                      + Dept Baru
                    </button>
                    <button
                      type="button"
                      onClick={() => onCreateUnit("DIVISION")}
                      className="rounded-lg border border-purple-200 bg-white px-2 py-0.5 text-[10px] font-bold text-purple-800 shadow-2xs hover:bg-purple-50"
                    >
                      + Divisi Baru
                    </button>
                  </div>
                )}
              </div>
              <SearchableSelect
                disabled={isSelfSelected || saving}
                value={departmentId}
                onChange={(val) => setDepartmentId(val)}
                placeholder="-- Pilih Unit / Departemen --"
                emptyOptionLabel="-- Belum Ditempatkan --"
                searchPlaceholder="Cari kode atau nama unit..."
                options={departmentOptions}
              />
              <p className="text-[11px] text-slate-500">
                Unit penempatan user untuk mewarisi modul dan penetapan anggaran.
              </p>
            </div>

            {/* Level Wewenang Unit */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163D64]">
                Level Wewenang Unit
              </label>
              <select
                disabled={isSelfSelected || saving}
                value={roleLevel}
                onChange={(e) => setRoleLevel(e.target.value as "GM" | "SPV" | "STAFF")}
                className="input h-10 w-full bg-white text-xs font-semibold text-[#163D64]"
              >
                <option value="STAFF">STAFF — Eksekutor / Operasional</option>
                <option value="SPV">SPV — Supervisor / Lead Unit</option>
                <option value="GM">GM — General Manager / Direksi</option>
              </select>
              <p className="text-[11px] text-slate-500">
                Menentukan hierarki wewenang operasional di dalam unit tersebut.
              </p>
            </div>

            {/* Jabatan Bisnis (Job Title) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163D64]">
                Jabatan Bisnis (Job Title)
              </label>
              <input
                type="text"
                disabled={isSelfSelected || saving}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Contoh: Senior Finance / Project Manager"
                className="input h-10 w-full bg-white text-xs"
              />
              <p className="text-[11px] text-slate-500">
                Nama jabatan bisnis bebas yang ditampilkan pada profil tim.
              </p>
            </div>

            {/* Atasan Langsung (Reports To) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163D64]">
                Atasan Langsung (Reports To)
              </label>
              <SearchableSelect
                disabled={isSelfSelected || saving}
                value={reportsToUserId}
                onChange={(val) => setReportsToUserId(val)}
                placeholder="-- Tanpa Atasan Langsung --"
                emptyOptionLabel="-- Tanpa Atasan Langsung --"
                searchPlaceholder="Cari nama atau email atasan..."
                options={managerOptions}
              />
              <p className="text-[11px] text-slate-500">
                Garis pelaporan tunggal untuk jalur eskalasi dan approval.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Modul Operasional & Hak Akses (Tier 0–3) */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#163D64] text-[10px] font-bold text-white">
                3
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#163D64]">
                Modul Operasional &amp; Hak Akses
                <span className="ml-2 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Tier 0–3
                </span>
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">
              Atur modul operasional dan level cakupan data (OWN / TEAM / ALL)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CONFIGURABLE_MODULES.map((mod) => {
              const grant = getModuleGrant(mod.code);
              const isEnabled = Boolean(mod.isBaseline || grant);
              const currentTier = grant?.tier_level ?? 3;
              return (
                <div
                  key={mod.code}
                  className={`flex flex-col justify-between gap-2.5 rounded-xl border p-3.5 transition ${
                    isEnabled
                      ? "border-[#163D64] bg-white shadow-2xs"
                      : "border-slate-200 bg-slate-50/60 opacity-80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-[#163D64] truncate">
                          {mod.label}
                        </span>
                        {mod.isBaseline && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#163D64] px-2 py-0.5 text-[10px] font-bold text-white">
                            <Lock size={9} /> Baseline
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                        {mod.description}
                      </p>
                    </div>
                    {!mod.isBaseline && (
                      <button
                        type="button"
                        disabled={isSelfSelected || saving}
                        onClick={() => toggleModuleEnabled(mod.code)}
                        className={`shrink-0 rounded-lg border px-3 py-1 text-[11px] font-bold transition ${
                          isEnabled
                            ? "border-[#163D64] bg-[#163D64] text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {isEnabled ? "Aktif" : "Nonaktif"}
                      </button>
                    )}
                  </div>

                  {isEnabled && (
                    <div className="border-t border-slate-100 pt-2.5">
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Level Wewenang &amp; Cakupan Data
                      </label>
                      <select
                        disabled={isSelfSelected || saving}
                        value={currentTier}
                        onChange={(e) => updateModuleTier(mod.code, Number(e.target.value))}
                        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-[#163D64] outline-none focus:border-[#163D64] focus:bg-white"
                      >
                        <option value={3}>Tier 3 — Staff / Eksekutor (Scope: OWN)</option>
                        <option value={2}>Tier 2 — Supervisor / Lead (Scope: TEAM)</option>
                        <option value={1}>Tier 1 — Manager / Head (Scope: ALL - Read/Write)</option>
                        <option value={0}>Tier 0 — Direksi / Oversight (Scope: ALL - Read Only)</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Panel Dashboard Modular */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#163D64] text-[10px] font-bold text-white">
                4
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#163D64]">
                Panel Dashboard Modular
              </h3>
            </div>
            <span className="text-[11px] font-bold text-[#0876CD]">
              {selectedWidgets.length} dari {catalog.length} panel aktif
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((widget) => {
              const isBaseline = widget.is_baseline || widget.code === "DASH_PERSONAL";
              const isEnabled = isBaseline || selectedWidgets.includes(widget.code);
              return (
                <button
                  key={widget.code}
                  type="button"
                  disabled={isBaseline || isSelfSelected || saving}
                  onClick={() => toggleWidget(widget.code)}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition ${
                    isEnabled
                      ? "border-[#163D64] bg-blue-50/50 text-[#0F172A] shadow-2xs"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  } ${isBaseline ? "cursor-default" : ""}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#163D64] truncate">
                        {widget.title}
                      </span>
                      {isBaseline ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#163D64] px-2 py-0.5 text-[10px] font-bold text-white">
                          <Lock size={9} /> Baseline
                        </span>
                      ) : (
                        <span
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                            isEnabled
                              ? "border-[#163D64] bg-[#163D64] text-white"
                              : "border-slate-300 bg-white text-transparent"
                          }`}
                        >
                          <Check size={12} />
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-slate-600 line-clamp-2">
                      {widget.description}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">
                    <span className="font-mono">{widget.code}</span>
                    {widget.required_module && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-[#163D64]">
                        Modul: {widget.required_module}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sticky/Bottom Save Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={16} className="shrink-0 text-emerald-600" />
            <span>
              Perubahan tersimpan otomatis menyinkronkan IAM role dan wewenang modul (Company Admin tetap terlindungi).
            </span>
          </div>
          <button
            type="button"
            disabled={isSelfSelected || saving || loading}
            onClick={() => void handleSave()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#163D64] px-5 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#0876CD] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            <span>{saving ? "Menyimpan Akses Cepat..." : "Simpan Akses Cepat"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

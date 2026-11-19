"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  LayoutDashboard,
  Layers,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  UserCheck,
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

interface QuickAccessPanelProps {
  companyId: string;
  selectedUserId: string;
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
    label: "Finance",
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
    label: "Sales",
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
    label: "Projects & WBS (Weekly / Daily Task)",
    description: "Wajib aktif sebagai baseline agar setiap user dapat mengakses Weekly & Daily Task.",
    isBaseline: true,
  },
  {
    code: "CRM",
    label: "CRM & Sales Pipeline",
    description: "Leads, Opportunity, Quotation, Kontrak & Customer Inbox (otomatis menyertakan SALES).",
  },
  {
    code: "FINANCE",
    label: "Finance, Accounting & Tax",
    description: "Buku Besar (GL), Tagihan, Arus Kas, Anggaran, Payroll & Pajak.",
  },
  {
    code: "INVENTORY",
    label: "Inventory, Gudang & Aset",
    description: "Mutasi Stok Kanonis, Transfer Transit, Reservasi & Kapitalisasi Aset.",
  },
  {
    code: "REPORTING",
    label: "Reporting & Executive Analytics",
    description: "Laporan Manajemen & Analitik Lintas Modul.",
  },
];

export function QuickAccessPanel({
  companyId,
  selectedUserId,
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
      // Fallback to baseline defaults if endpoint hasn't loaded yet
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
      if (code === "CRM" && !next.some((m) => m.module_code === "SALES")) {
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
    const allowWrite = tier === 0 ? false : true;
    setModules((prev) =>
      prev.map((m) => {
        const upper = m.module_code.toUpperCase();
        if (upper === code || (code === "CRM" && upper === "SALES")) {
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
    label: `[${d.unit_type || "DEPT"}] ${d.code} — ${d.name}${d.is_cost_center ? " (Cost Center)" : ""}`,
  }));

  return (
    <div className="mt-6 rounded-2xl border border-[#CBD5E1] bg-gradient-to-b from-[#E7F2FF]/60 via-white to-[#F8FAFC] p-5 shadow-2xs">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#163D64] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Sparkles size={11} /> Baseline-First Quick Access
          </div>
          <h3 className="mt-1.5 text-sm font-extrabold text-[#163D64]">
            Pengaturan Cepat Unit, Jabatan, Atasan &amp; Panel Dashboard Modular
          </h3>
          <p className="mt-0.5 text-xs text-[#64748B]">
            Setiap user otomatis memiliki baseline <strong>PROJECTS (Tier 3, OWN) + Workspace Pribadi</strong> agar tetap bisa mengakses Weekly &amp; Daily Task. Gunakan preset 1-klik atau atur panel dashboard secara modular.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {derivedRoles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {derivedRoles.map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-[#CBD5E1] bg-white px-2.5 py-0.5 text-[10px] font-bold text-[#163D64]"
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
            title="Muat ulang Quick Access"
            className="rounded-xl border border-[#CBD5E1] bg-white p-2 text-[#163D64] hover:bg-[#E7F2FF] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 1. Tombol Preset Cepat 1-Klik */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-[#163D64]">
            1. Preset Cepat 1-Klik (Otomatis Sinkron &amp; Prune Role)
          </span>
          <span className="text-[11px] text-[#64748B]">
            Klik preset lalu tekan Simpan Akses Cepat
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const isSelected = activePresetKey === preset.preset_key;
            return (
              <button
                key={preset.preset_key}
                type="button"
                disabled={isSelfSelected || saving}
                onClick={() => applyPreset(preset)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                  isSelected
                    ? "border-[#163D64] bg-[#163D64] text-white shadow-xs"
                    : "border-[#CBD5E1] bg-white text-[#163D64] hover:bg-[#E7F2FF]"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isSelected && <Check size={12} />}
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Penempatan Unit, Jabatan Bisnis & Atasan Langsung */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
            <label className="text-xs font-bold text-[#163D64]">
              Unit Utama / Cost Center
            </label>
            {onCreateUnit && !isSelfSelected && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onCreateUnit("DEPARTMENT")}
                  className="rounded border border-[#163D64]/20 bg-[#E7F2FF] px-1.5 py-0.5 text-[10px] font-bold text-[#163D64] hover:bg-[#D9EEFF]"
                  title="Buat Departemen / Cost Center Baru"
                >
                  + Dept
                </button>
                <button
                  type="button"
                  onClick={() => onCreateUnit("DIVISION")}
                  className="rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 hover:bg-purple-100"
                  title="Buat Divisi Baru"
                >
                  + Divisi
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
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[#163D64]">
            Jabatan Bisnis (Job Title)
          </label>
          <input
            type="text"
            disabled={isSelfSelected || saving}
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Contoh: Senior Finance / PM"
            className="input h-9 w-full text-xs"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[#163D64]">
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
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[#163D64]">
            Level Wewenang Unit
          </label>
          <select
            disabled={isSelfSelected || saving}
            value={roleLevel}
            onChange={(e) => setRoleLevel(e.target.value as "GM" | "SPV" | "STAFF")}
            className="input h-9 w-full bg-white text-xs font-semibold text-[#163D64]"
          >
            <option value="STAFF">STAFF — Eksekutor / Operasional</option>
            <option value="SPV">SPV — Supervisor / Lead Unit</option>
            <option value="GM">GM — General Manager / Direksi</option>
          </select>
        </div>
      </div>

      {/* 3. Modul Operasional & Level Wewenang (Tier 0–3) */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#163D64]">
            <Layers size={14} /> 2. Modul Operasional &amp; Cakupan Data (Tier 0–3)
          </span>
          <span className="text-[11px] text-[#64748B]">
            Atur modul dan level cakupan data (OWN / TEAM / ALL)
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {CONFIGURABLE_MODULES.map((mod) => {
            const grant = getModuleGrant(mod.code);
            const isEnabled = Boolean(mod.isBaseline || grant);
            const currentTier = grant?.tier_level ?? 3;
            return (
              <div
                key={mod.code}
                className={`flex flex-col justify-between gap-2.5 rounded-xl border p-3 transition ${
                  isEnabled
                    ? "border-[#163D64] bg-white shadow-2xs"
                    : "border-[#E2E8F0] bg-[#F8FAFC] opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-[#163D64]">{mod.label}</span>
                      {mod.isBaseline && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#163D64] px-2 py-0.5 text-[10px] font-bold text-white">
                          <Lock size={9} /> Baseline
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#64748B]">{mod.description}</p>
                  </div>
                  {!mod.isBaseline && (
                    <button
                      type="button"
                      disabled={isSelfSelected || saving}
                      onClick={() => toggleModuleEnabled(mod.code)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                        isEnabled
                          ? "border-[#163D64] bg-[#163D64] text-white"
                          : "border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#E7F2FF]"
                      }`}
                    >
                      {isEnabled ? "Aktif" : "Nonaktif"}
                    </button>
                  )}
                </div>

                {isEnabled && (
                  <div className="flex items-center justify-between gap-2 border-t border-[#F1F5F9] pt-2">
                    <span className="text-[11px] font-semibold text-[#475569]">Level &amp; Scope:</span>
                    <select
                      disabled={isSelfSelected || saving}
                      value={currentTier}
                      onChange={(e) => updateModuleTier(mod.code, Number(e.target.value))}
                      className="rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-bold text-[#163D64] outline-none focus:border-[#163D64]"
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

      {/* 4. Grid Toggle Panel Dashboard Modular */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#163D64]">
            <LayoutDashboard size={14} /> 3. Panel Dashboard Modular (Multi-Role Union)
          </span>
          <span className="text-[11px] text-[#64748B]">
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
                className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                  isEnabled
                    ? "border-[#163D64] bg-[#E7F2FF]/70 text-[#0F172A] shadow-2xs"
                    : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#CBD5E1]"
                } ${isBaseline ? "cursor-default" : ""}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#163D64]">
                      {widget.title}
                    </span>
                    {isBaseline ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#163D64] px-2 py-0.5 text-[10px] font-bold text-white">
                        <Lock size={10} /> Baseline
                      </span>
                    ) : (
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${
                          isEnabled
                            ? "border-[#163D64] bg-[#163D64] text-white"
                            : "border-[#CBD5E1] bg-white text-transparent"
                        }`}
                      >
                        <Check size={12} />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-[#475569]">
                    {widget.description}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-[#CBD5E1]/50 pt-1.5 text-[10px] font-semibold text-[#64748B]">
                  <span>Kode: {widget.code}</span>
                  {widget.required_module && (
                    <span className="rounded bg-white px-1.5 py-0.5 font-bold text-[#163D64]">
                      Modul: {widget.required_module}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Save Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-3">
        <div className="flex items-center gap-1.5 text-xs text-[#475569]">
          <ShieldCheck size={15} className="text-[#163D64]" />
          <span>
            Menyimpan akan menyinkronkan modul, panel dashboard, dan mencabut (prune) role lama yang tidak aktif (ROLE-COMPANY-ADMIN tetap aman).
          </span>
        </div>
        <button
          type="button"
          disabled={isSelfSelected || saving || loading}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#163D64] px-4 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#0876CD] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={14} />
          <span>{saving ? "Menyimpan Akses Cepat..." : "Simpan Akses Cepat"}</span>
        </button>
      </div>
    </div>
  );
}

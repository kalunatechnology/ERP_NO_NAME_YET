"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
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
  description?: string;
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
  job_title?: string | null;
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
    title: "Workspace Pribadi",
    description: "Tugas harian, mingguan, dan pengajuan pribadi.",
    required_module: "PROJECTS",
    is_baseline: true,
  },
  {
    code: "DASH_PROJECTS",
    title: "Portofolio Proyek & WBS",
    description: "Monitoring proyek, milestone, dan progres tim.",
    required_module: "PROJECTS",
    is_baseline: false,
  },
  {
    code: "DASH_CRM",
    title: "CRM & Sales Pipeline",
    description: "Prospek, opportunity, quotation, dan target penjualan.",
    required_module: "CRM",
    is_baseline: false,
  },
  {
    code: "DASH_FINANCE",
    title: "Keuangan & Anggaran",
    description: "Arus kas, piutang/utang (AR/AP), dan realisasi anggaran.",
    required_module: "FINANCE",
    is_baseline: false,
  },
  {
    code: "DASH_INVENTORY",
    title: "Inventori & Gudang",
    description: "Stok barang, mutasi gudang, dan aset operasional.",
    required_module: "INVENTORY",
    is_baseline: false,
  },
  {
    code: "DASH_HR",
    title: "HRMM, Lembur, Meeting & Payroll",
    description: "Ringkasan pengajuan lembur, jadwal meeting HR, status payroll run, dan antrean persetujuan SDM.",
    required_module: "HR",
    is_baseline: false,
  },
  {
    code: "DASH_EXECUTIVE",
    title: "Ringkasan Direksi 360°",
    description: "Ikhtisar performa perusahaan lintas departemen.",
    required_module: "REPORTING",
    is_baseline: false,
  },
];

const DEFAULT_PRESETS: QuickAccessPreset[] = [
  {
    preset_key: "STAFF_BASELINE",
    label: "Staff Operasional (Default)",
    description: "Akses personal untuk pekerjaan dan pengajuan sendiri. Tidak memberi kewenangan tim atau akses ke modul lain.",
    role_level: "STAFF",
    default_job_title: "Staff Operasional",
    modules: [
      { module_code: "PROJECTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
      { module_code: "REQUESTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
    ],
    dashboard_widgets: ["DASH_PERSONAL"],
  },
  {
    preset_key: "SUPERVISOR",
    label: "Supervisor Tim",
    description: "Mengelola pekerjaan dan pengajuan dalam cakupan tim, bukan seluruh portofolio perusahaan.",
    role_level: "SPV",
    default_job_title: "Supervisor",
    modules: [
      { module_code: "PROJECTS", tier_level: 2, allow_read: true, allow_write: true, data_scope: "TEAM" },
      { module_code: "REQUESTS", tier_level: 2, allow_read: true, allow_write: true, data_scope: "TEAM" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_PROJECTS"],
  },
  {
    preset_key: "PROJECT_MANAGER",
    label: "Project Manager (PM)",
    description: "Mengelola portofolio dan WBS pada Projects serta melihat laporan terkait. Modul lain tetap terpisah.",
    role_level: "SPV",
    default_job_title: "Project Manager",
    modules: [
      { module_code: "PROJECTS", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "REPORTING", tier_level: 2, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "REQUESTS", tier_level: 2, allow_read: true, allow_write: true, data_scope: "TEAM" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_PROJECTS"],
  },
  {
    preset_key: "OPERATIONAL_MANAGER",
    label: "Operational / Inventory Manager",
    description: "Mengelola Projects, Inventory, dan Procurement. Berlaku hanya pada modul yang diaktifkan company dan dapat diedit.",
    role_level: "GM",
    default_job_title: "Operational Manager",
    modules: [
      { module_code: "INVENTORY", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "PROJECTS", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "PROCUREMENT", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "REQUESTS", tier_level: 2, allow_read: true, allow_write: true, data_scope: "TEAM" },
      { module_code: "REPORTING", tier_level: 2, allow_read: true, allow_write: false, data_scope: "ALL" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_INVENTORY", "DASH_PROJECTS"],
  },
  {
    preset_key: "FINANCE",
    label: "Finance & Accounting",
    description: "Mengelola Finance. Tidak otomatis memberi akses Projects, CRM, Inventory, atau Reporting.",
    role_level: "SPV",
    default_job_title: "Finance Officer",
    modules: [
      { module_code: "FINANCE", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "REQUESTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_FINANCE"],
  },
  {
    preset_key: "CRM_LEAD",
    label: "CRM & Sales Lead",
    description: "Mengelola pipeline CRM dan tim penjualan. Tidak otomatis memberi akses Projects.",
    role_level: "SPV",
    default_job_title: "CRM & Sales Lead",
    modules: [
      { module_code: "CRM", tier_level: 1, allow_read: true, allow_write: true, data_scope: "ALL" },
      { module_code: "REQUESTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_CRM"],
  },
  {
    preset_key: "SALES",
    label: "Sales Executive",
    description: "Mengelola lead dan deal miliknya sendiri pada CRM, bukan seluruh data tim.",
    role_level: "STAFF",
    default_job_title: "Sales Executive",
    modules: [
      { module_code: "CRM", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
      { module_code: "REQUESTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
    ],
    dashboard_widgets: ["DASH_PERSONAL", "DASH_CRM"],
  },
  {
    preset_key: "DIRECTOR_360",
    label: "Direktur / Executive 360°",
    description: "Membaca ringkasan lintas modul yang aktif. Template read-only; tidak memberi izin mengubah data operasional.",
    role_level: "GM",
    default_job_title: "Director",
    modules: [
      { module_code: "REPORTING", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "PROJECTS", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "FINANCE", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "CRM", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "INVENTORY", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
      { module_code: "REQUESTS", tier_level: 0, allow_read: true, allow_write: false, data_scope: "ALL" },
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
    label: "Projects & Tugas",
    description: "Akses proyek, Weekly Task & Daily Task",
  },
  {
    code: "CRM",
    label: "CRM & Penjualan",
    description: "Leads, Pipeline, Quotation & Kontrak",
  },
  {
    code: "FINANCE",
    label: "Finance & Akuntansi",
    description: "Kas, Tagihan AR/AP, Buku Besar, Anggaran & Pajak",
  },
  {
    code: "INVENTORY",
    label: "Inventory & Gudang",
    description: "Stok Barang, Mutasi Gudang & Aset",
  },
  {
    code: "REPORTING",
    label: "Laporan Manajemen",
    description: "Laporan Analitik & Evaluasi Kinerja",
  },
  { code: "PROCUREMENT", label: "Procurement", description: "Pengadaan dan proses pembelian." },
  { code: "HR", label: "HR & Payroll (Meeting, Lembur, Request)", description: "Meeting HR, lembur, cuti/request, payroll run, slip gaji & persetujuan SDM." },
  { code: "ASSETS", label: "Assets", description: "Pencatatan dan pengelolaan aset." },
  { code: "SALES", label: "Sales", description: "Fitur penjualan bila entitlement modul ini diaktifkan." },
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
  const [activePresetKey, setActivePresetKey] = useState<string>("");
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [moduleConfigDirty, setModuleConfigDirty] = useState(false);

  const [departmentId, setDepartmentId] = useState("");
  const [roleLevel, setRoleLevel] = useState<"GM" | "SPV" | "STAFF">("STAFF");
  const [reportsToUserId, setReportsToUserId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>(["DASH_PERSONAL"]);
  const [modules, setModules] = useState<ModuleGrantItem[]>([
    { module_code: "PROJECTS", tier_level: 3, allow_read: true, allow_write: true, data_scope: "OWN" },
  ]);
  const [derivedRoles, setDerivedRoles] = useState<string[]>([]);
  const [isLegacyTransition, setIsLegacyTransition] = useState(false);

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
        const normalizedModules: ModuleGrantItem[] = [];
        for (const item of payload.modules as ModuleGrantItem[]) {
          const upper = String(item.module_code || "").toUpperCase();
          const mappedCode = ["HR", "HRMS", "REQUESTS"].includes(upper) ? "HR" : upper;
          const existingIdx = normalizedModules.findIndex((m) => m.module_code === mappedCode);
          if (existingIdx >= 0) {
            if (Number(item.tier_level) < Number(normalizedModules[existingIdx].tier_level)) {
              normalizedModules[existingIdx] = { ...item, module_code: mappedCode };
            }
          } else {
            normalizedModules.push({ ...item, module_code: mappedCode });
          }
        }
        setModules(normalizedModules);
      } else {
        setModules([]);
      }
      const rawEnabled = Array.isArray(payload.enabled_modules)
        ? payload.enabled_modules.map((module: unknown) => String(module).toUpperCase())
        : [];
      if (rawEnabled.some((m: string) => ["HR", "HRMS", "REQUESTS"].includes(m)) && !rawEnabled.includes("HR")) {
        rawEnabled.push("HR");
      }
      setEnabledModules(rawEnabled);
      if (Array.isArray(payload.roles)) {
        setDerivedRoles(payload.roles);
      }
      setIsLegacyTransition(Boolean(payload.is_legacy_transition));
      setActivePresetKey("");
      setModuleConfigDirty(false);
    } catch {
      // Fallback gracefully
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedUserId]);

  useEffect(() => {
    void loadQuickAccess();
  }, [loadQuickAccess]);

  const handlePresetChange = (presetKey: string) => {
    setActivePresetKey(presetKey);
    const preset = presets.find((p) => p.preset_key === presetKey);
    if (!preset) return;
    if (!jobTitle.trim() || presets.some((p) => p.default_job_title === jobTitle.trim())) {
      setJobTitle(preset.default_job_title);
    }
    setSelectedWidgets(Array.from(new Set(["DASH_PERSONAL", ...preset.dashboard_widgets])));
    setModules(preset.modules
      .filter((module) => enabledModules.includes(module.module_code.toUpperCase()))
      .map((m) => ({ ...m })));
    setModuleConfigDirty(true);
  };

  const toggleWidget = (code: string) => {
    if (code === "DASH_PERSONAL") return;
    setSelectedWidgets((prev) => {
      const has = prev.includes(code);
      const next = has ? prev.filter((item) => item !== code) : [...prev, code];
      return Array.from(new Set(["DASH_PERSONAL", ...next]));
    });
  };

  const getModuleGrant = (code: string): ModuleGrantItem | undefined =>
    modules.find((m) => m.module_code.toUpperCase() === code.toUpperCase());

  const toggleModuleEnabled = (code: string) => {
    if (!enabledModules.includes(code.toUpperCase())) return;
    setModuleConfigDirty(true);
    setModules((prev) => {
      const exists = prev.some((m) => m.module_code.toUpperCase() === code);
      if (exists) {
        return prev.filter((m) => m.module_code.toUpperCase() !== code);
      }
      const defaultTier = 3;
      const defaultScope: "OWN" | "TEAM" | "ALL" = "OWN";
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
      return next;
    });
  };

  const updateModuleTier = (code: string, tier: number) => {
    setModuleConfigDirty(true);
    const scope: "OWN" | "TEAM" | "ALL" = tier <= 1 ? "ALL" : tier === 2 ? "TEAM" : "OWN";
    const allowWrite = tier !== 0;
    setModules((prev) =>
      prev.map((m) => {
        if (m.module_code.toUpperCase() === code.toUpperCase()) {
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
          dashboard_widgets: Array.from(new Set(["DASH_PERSONAL", ...selectedWidgets])),
          ...(moduleConfigDirty
            ? {
                preset_key: activePresetKey || null,
                modules: modules.map((module) => ({ ...module, enabled: true })),
              }
            : {}),
          reason: "Quick Access Panel update by Company Admin",
        },
        { headers: { "X-Company-ID": companyId } }
      );
      if (Array.isArray(res.data?.roles)) {
        setDerivedRoles(res.data.roles);
      }
      setModuleConfigDirty(false);
      toast.success("Pengaturan user berhasil disimpan.");
      window.dispatchEvent(new CustomEvent("erp:data-mutated"));
      if (onSaved) onSaved();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal menyimpan pengaturan user."));
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
    label: `[${d.code}] ${d.name}${d.is_cost_center ? " (Cost Center)" : ""}`,
  }));

  const userDisplayName = selectedUser?.full_name || selectedUser?.email || "Pengguna";
  const userDisplayEmail = selectedUser?.email || "";
  const activePreset = presets.find((preset) => preset.preset_key === activePresetKey);

  return (
    <div className="bg-white">
      {/* Header Bar Sederhana */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">{userDisplayName}</h2>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                selectedUser?.is_active === false
                  ? "bg-red-100 text-red-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {selectedUser?.is_active === false ? "Nonaktif" : "Aktif"}
            </span>
            {isSelfSelected && (
              <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-[#163D64]">
                Akun Anda (Company Admin)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {userDisplayEmail}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadQuickAccess()}
            disabled={loading || saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Reset
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void handleSave()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#163D64] px-4 text-xs font-semibold text-white hover:bg-[#0876CD] disabled:opacity-50"
          >
            <Save size={13} />
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {isLegacyTransition && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
            <div className="font-bold">Transisi dari Role Lama ({derivedRoles.join(", ")})</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
              Role lama ditampilkan hanya untuk kompatibilitas. Pengaturan ini tidak lagi mengubah hak modul; buat penugasan baru melalui tab <span className="font-semibold">Hirarki Modul</span>.
            </p>
          </div>
        )}

        {/* Bagian 1: Form Informasi Organisasi & Jabatan */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                1. Penempatan Unit &amp; Jabatan
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Atur penempatan departemen, tingkat wewenang, jabatan bisnis, dan garis pelaporan.
              </p>
            </div>
            {onCreateUnit && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCreateUnit("DEPARTMENT")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + Departemen Baru
                </button>
                <button
                  type="button"
                  onClick={() => onCreateUnit("DIVISION")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + Divisi Baru
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            <b>Role di sini adalah template pengisian akses per modul.</b> Memilih template tidak mengubah role global user. Periksa dan sesuaikan modul serta tingkat akses sebelum menyimpan; modul yang tidak diaktifkan perusahaan tidak dapat diberi akses.
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="block text-xs font-semibold text-slate-800" htmlFor="quick-access-role-template">
              Template Role (opsional)
            </label>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Template mengisi rancangan akses operasional. Anda tetap dapat mengubah tiap modul secara terpisah.
            </p>
            <select
              id="quick-access-role-template"
              disabled={saving || loading}
              value={activePresetKey}
              onChange={(event) => handlePresetChange(event.target.value)}
              className="mt-3 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 outline-none focus:border-[#163D64]"
            >
              <option value="">-- Pilih template role --</option>
              {presets.map((preset) => (
                <option key={preset.preset_key} value={preset.preset_key}>{preset.label}</option>
              ))}
            </select>
            {activePreset?.description && (
              <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                <b>{activePreset.label}:</b> {activePreset.description}
              </p>
            )}
            <details className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">Arti setiap template role</summary>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {presets.map((preset) => (
                  <li key={preset.preset_key} className="rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">
                    <span className="font-semibold text-slate-800">{preset.label}.</span> {preset.description || "Template pengisian akses operasional per modul."}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          {/* Form 2-Kolom yang Proporsional & Bebas Clipping */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Departemen / Divisi */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Departemen / Divisi
              </label>
              <SearchableSelect
                disabled={saving}
                value={departmentId}
                onChange={(val) => setDepartmentId(val)}
                placeholder="-- Pilih Unit --"
                emptyOptionLabel="-- Belum Ditempatkan --"
                searchPlaceholder="Cari kode atau nama unit..."
                options={departmentOptions}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Unit organisasi untuk pelaporan dan pengelompokan; tidak memberi akses modul.
              </p>
            </div>

            {/* Level di Unit */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Level Wewenang di Unit
              </label>
              <select
                disabled={saving}
                value={roleLevel}
                onChange={(e) => setRoleLevel(e.target.value as "GM" | "SPV" | "STAFF")}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-[#163D64]"
              >
                <option value="STAFF">STAFF (Pelaksana / Operasional)</option>
                <option value="SPV">SPV (Supervisor / Lead Unit)</option>
                <option value="GM">GM (General Manager / Direksi)</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Informasi jenjang organisasi. Wewenang operasional ditentukan oleh Role Profile pada tiap modul.
              </p>
            </div>

            {/* Nama Jabatan (Job Title) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Jabatan Bebas (Job Title)
              </label>
              <input
                type="text"
                disabled={saving}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Contoh: Staff Finance / Project Manager / Sales Executive"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 outline-none focus:border-[#163D64]"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Gelar operasional sehari-hari yang tampil di profil tim.
              </p>
            </div>

            {/* Atasan Langsung */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Atasan Langsung (Reports To)
              </label>
              <SearchableSelect
                disabled={saving}
                value={reportsToUserId}
                onChange={(val) => setReportsToUserId(val)}
                placeholder="-- Pilih Atasan --"
                emptyOptionLabel="-- Tanpa Atasan Langsung --"
                searchPlaceholder="Cari nama atau email atasan..."
                options={managerOptions}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Garis pelaporan tunggal untuk jalur eskalasi dan persetujuan.
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard preferences choose visibility only; module authorization is checked separately. */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#163D64]">Panel Dashboard</h3>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                Pilih ringkasan yang ingin ditampilkan untuk user ini. Panel terkait modul hanya memuat data jika company mengaktifkan modulnya dan user memiliki penugasan aktif dengan capability READ.
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
              Preferensi Tampilan
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {catalog.map((widget) => {
              const isBaseline = widget.is_baseline || widget.code === "DASH_PERSONAL";
              const isEnabled = isBaseline || selectedWidgets.includes(widget.code);
              return (
                <label
                  key={widget.code}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${isEnabled ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white"}`}
                >
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={isBaseline || saving}
                    onChange={() => toggleWidget(widget.code)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#163D64] focus:ring-[#163D64]"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-800">
                      {widget.title}
                      {isBaseline && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">Wajib</span>}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-slate-500">{widget.description}</span>
                    {widget.required_module && (
                      <span className="mt-1.5 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        Modul: {widget.required_module}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Bagian 2: Tabel Hak Akses Modul */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-[#163D64]">Akses Operasional per Modul</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Setiap pilihan berlaku hanya untuk modul pada baris tersebut. Saat disimpan, daftar ini menjadi penugasan aktif user; modul yang tidak dicentang akan dicabut. Penugasan Role Profile yang ada akan diganti oleh pilihan template ini.
            </p>
            {moduleConfigDirty && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Perubahan akses modul belum disimpan. Pastikan daftar dan levelnya sudah benar.
              </p>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="w-24 px-3.5 py-2.5 text-center font-semibold">Akses</th>
                  <th className="px-3.5 py-2.5 font-semibold">Nama Modul</th>
                  <th className="px-3.5 py-2.5 font-semibold">Keterangan</th>
                  <th className="w-80 px-3.5 py-2.5 font-semibold">Level Wewenang &amp; Cakupan Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {CONFIGURABLE_MODULES.map((mod) => {
                  const grant = getModuleGrant(mod.code);
                  const isEntitled = enabledModules.includes(mod.code);
                  const isEnabled = Boolean(grant);
                  const currentTier = grant?.tier_level ?? 3;
                  return (
                    <tr key={mod.code} className={isEnabled ? "bg-white" : "bg-slate-50/50 text-slate-400"}>
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          disabled={!isEntitled || saving || loading}
                          onChange={() => toggleModuleEnabled(mod.code)}
                          className="h-4 w-4 rounded border-slate-300 text-[#163D64] focus:ring-[#163D64]"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-800">
                        {mod.label}
                        {!isEntitled && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-800">Belum aktif di company</span>}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-500">{mod.description}</td>
                      <td className="px-3.5 py-2">
                        {isEnabled ? (
                          <select
                            disabled={!isEntitled || saving || loading}
                            value={currentTier}
                            onChange={(e) => updateModuleTier(mod.code, Number(e.target.value))}
                            className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-[#163D64]"
                          >
                            <option value={3}>Staff — Data Sendiri (OWN)</option>
                            <option value={2}>Supervisor — Data Tim (TEAM)</option>
                            <option value={1}>Manager — Semua Data (Baca &amp; Edit)</option>
                            <option value={0}>Direksi — Semua Data (Hanya Lihat)</option>
                          </select>
                        ) : (
                          <span className="text-slate-400">Tidak aktif</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bagian 3: Tabel Panel Dashboard */}
        <div className="hidden" aria-hidden="true">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">
            3. Tabel Panel Dashboard yang Ditampilkan
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="w-24 px-3.5 py-2.5 text-center font-semibold">Tampilkan</th>
                  <th className="px-3.5 py-2.5 font-semibold">Nama Panel Dashboard</th>
                  <th className="px-3.5 py-2.5 font-semibold">Fungsi Tampilan</th>
                  <th className="w-36 px-3.5 py-2.5 font-semibold">Modul Terkait</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {catalog.map((widget) => {
                  const isBaseline = widget.is_baseline || widget.code === "DASH_PERSONAL";
                  const isEnabled = isBaseline || selectedWidgets.includes(widget.code);
                  return (
                    <tr key={widget.code} className={isEnabled ? "bg-white" : "bg-slate-50/50 text-slate-400"}>
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          disabled={isBaseline || isSelfSelected || saving}
                          onChange={() => toggleWidget(widget.code)}
                          className="h-4 w-4 rounded border-slate-300 text-[#163D64] focus:ring-[#163D64]"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-800">
                        {widget.title}
                        {isBaseline && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-600">
                            Wajib
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-500">{widget.description}</td>
                      <td className="px-3.5 py-2.5 text-slate-600">
                        {widget.required_module || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

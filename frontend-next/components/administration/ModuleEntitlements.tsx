/**
 * File: frontend-next/components/administration/ModuleEntitlements.tsx
 *
 * Purpose: Super Admin Module Entitlements Workspace.
 * Manages the commercial license ceiling for companies across 17 platform modules.
 * Features batch presets (Enable All, Standard, Reset) and granular toggling.
 */
"use client";

import { useState, useMemo } from "react";
import {
  Building2,
  CheckCircle2,
  Sliders,
  Sparkles,
  Zap,
  RotateCcw,
  Check,
  Search,
  Bot,
  Layers,
  ShieldCheck,
  Briefcase,
  ShoppingCart,
  FolderKanban,
  Receipt,
  PackageCheck,
  Warehouse,
  Factory,
  Award,
  Cpu,
  Headphones,
  Truck,
  BarChart3,
  Compass,
  FileSpreadsheet,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { TenantItem } from "./TenantManagement";
import { CompanyDetail } from "./CompanyManagement";

export type ModuleAccessItem = {
  module_code: string;
  company_id: string;
  enabled: boolean;
  allow_read: boolean;
  allow_write: boolean;
};

const MODULE_DEFINITIONS: Record<
  string,
  { name: string; description: string; icon: any; category: string }
> = {
  CORE: {
    name: "Core Workspace",
    description: "Dashboard tata kelola, context company, dan navigasi aktivitas utama",
    icon: Building2,
    category: "Platform",
  },
  REQUESTS: {
    name: "Requests & Approval",
    description: "Pengajuan izin, pengadaan, approval card multi-level, dan LPJ",
    icon: CheckCircle2,
    category: "Workflow",
  },
  CRM: {
    name: "CRM & Leads",
    description: "Pipeline prospek, opportunity, relasi klien, dan lead tracking",
    icon: Briefcase,
    category: "Komersial",
  },
  SALES: {
    name: "Sales & Invoicing",
    description: "Quotation, sales order, delivery order, dan penagihan pelanggan",
    icon: ShoppingCart,
    category: "Komersial",
  },
  PROJECTS: {
    name: "Project Management",
    description: "WBS proyek, milestone, gantt timeline, dan pembagian tugas tim",
    icon: FolderKanban,
    category: "Operasional",
  },
  FINANCE: {
    name: "Finance & Accounting",
    description: "Jurnal umum, buku besar, rekonsiliasi kas, billing, dan kepatuhan pajak",
    icon: Receipt,
    category: "Finansial",
  },
  PROCUREMENT: {
    name: "Procurement",
    description: "Purchase request, perbandingan penawaran vendor, dan PO",
    icon: PackageCheck,
    category: "Operasional",
  },
  INVENTORY: {
    name: "Inventory & Stock",
    description: "Manajemen gudang, level stok material, stock opname, dan perpindahan barang",
    icon: Warehouse,
    category: "Operasional",
  },
  MANUFACTURING: {
    name: "Manufacturing",
    description: "Perencanaan produksi, Bill of Materials (BOM), dan work order",
    icon: Factory,
    category: "Produksi",
  },
  QUALITY: {
    name: "Quality Control",
    description: "Inspeksi barang masuk/keluar, audit mutu, dan standar kepatuhan",
    icon: Award,
    category: "Produksi",
  },
  ASSETS: {
    name: "Asset Management",
    description: "Registrasi aset tetap, jadwal pemeliharaan, dan penyusutan nilai",
    icon: Cpu,
    category: "Aset",
  },
  SERVICE: {
    name: "Service Desk",
    description: "Tiket keluhan pelanggan, dispatch teknisi, dan SLA layanan",
    icon: Headphones,
    category: "Layanan",
  },
  LOGISTICS: {
    name: "Logistics & Fleet",
    description: "Rute pengiriman, tracking armada distribusi, dan surat jalan",
    icon: Truck,
    category: "Logistik",
  },
  ANALYTICS: {
    name: "Executive Analytics",
    description: "Grafik metrik real-time, profitabilitas proyek, dan KPI korporasi",
    icon: BarChart3,
    category: "Analisis",
  },
  IMPLEMENTATION: {
    name: "Implementation",
    description: "Pelacakan implementasi sistem, checklist deployment, dan handover",
    icon: Compass,
    category: "Operasional",
  },
  REPORTING: {
    name: "Reporting Engine",
    description: "Laporan neraca, laba rugi, operasional, dan export berkas audit",
    icon: FileSpreadsheet,
    category: "Finansial",
  },
  MARBOT: {
    name: "MarBot AI Assistant",
    description: "Asisten cerdas ERP dengan konteks data aman, query analitik, dan knowledge base",
    icon: Bot,
    category: "AI & Otomasi",
  },
};

interface ModuleEntitlementsProps {
  tenants: TenantItem[];
  companies: CompanyDetail[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  modules: ModuleAccessItem[];
  loadingModules: boolean;
  onRefreshModules: () => Promise<void>;
}

export function ModuleEntitlements({
  tenants,
  companies,
  selectedCompanyId,
  onSelectCompany,
  modules,
  loadingModules,
  onRefreshModules,
}: ModuleEntitlementsProps) {
  const [search, setSearch] = useState("");
  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // Selected company object
  const activeCompany = useMemo(() => {
    return companies.find((c) => c.id === selectedCompanyId) || companies[0] || null;
  }, [companies, selectedCompanyId]);

  // Tenant of active company
  const activeTenant = useMemo(() => {
    if (!activeCompany?.tenant_id) return null;
    return tenants.find((t) => t.id === activeCompany.tenant_id) || null;
  }, [tenants, activeCompany]);

  // Count active modules
  const enabledCount = useMemo(() => {
    return modules.filter((m) => m.enabled).length;
  }, [modules]);

  // Filtered modules
  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules.filter((m) => {
      const meta = MODULE_DEFINITIONS[m.module_code];
      const name = meta?.name || m.module_code;
      const desc = meta?.description || "";
      return !q || name.toLowerCase().includes(q) || m.module_code.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
    });
  }, [modules, search]);

  /** Single toggle handler */
  const handleToggleModule = async (moduleCode: string, currentEnabled: boolean) => {
    if (!activeCompany) return;
    const targetState = !currentEnabled;
    setTogglingCode(moduleCode);

    try {
      await api.patch(
        `/api/v1/core/companies/${activeCompany.id}/modules/${moduleCode}`,
        {
          enabled: targetState,
          allow_read: targetState,
          allow_write: moduleCode === "MARBOT" ? false : targetState,
        },
        { headers: { "X-Company-ID": activeCompany.id } }
      );
      await onRefreshModules();
      toast.success(
        `${MODULE_DEFINITIONS[moduleCode]?.name || moduleCode} ${
          targetState ? "diaktifkan" : "dinonaktifkan"
        }.`
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error?.message ||
        "Perubahan hak akses modul gagal.";
      toast.error(msg);
    } finally {
      setTogglingCode(null);
    }
  };

  /** Batch preset handler */
  const handleBatchPreset = async (presetType: "ALL" | "STANDARD" | "NONE") => {
    if (!activeCompany) return;
    setBatchLoading(true);

    let codesToEnable: string[] = [];
    if (presetType === "ALL") {
      codesToEnable = Object.keys(MODULE_DEFINITIONS).filter((c) => c !== "MARBOT");
    } else if (presetType === "STANDARD") {
      codesToEnable = ["CORE", "REQUESTS", "CRM", "SALES", "PROJECTS", "FINANCE", "REPORTING"];
    } else if (presetType === "NONE") {
      codesToEnable = [];
    }

    const payloadModules = Object.keys(MODULE_DEFINITIONS).map((code) => {
      const isEnabled = codesToEnable.includes(code);
      return {
        module_code: code,
        enabled: isEnabled,
        allow_read: isEnabled,
        allow_write: code === "MARBOT" ? false : isEnabled,
      };
    });

    try {
      await api.post(
        `/api/v1/core/companies/${activeCompany.id}/modules/batch`,
        { modules: payloadModules },
        { headers: { "X-Company-ID": activeCompany.id } }
      );
      await onRefreshModules();
      toast.success(
        presetType === "ALL"
          ? "Semua modul operasional berhasil diaktifkan!"
          : presetType === "STANDARD"
          ? "Paket modul standar berhasil diterapkan!"
          : "Seluruh modul dinonaktifkan."
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error?.message ||
        "Gagal menerapkan paket modul batch.";
      toast.error(msg);
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Selector */}
      <div className="flex flex-col gap-5 rounded-2xl border border-[#EFEFEF] bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
            Pilih Target Company
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select
              value={activeCompany?.id || ""}
              onChange={(e) => onSelectCompany(e.target.value)}
              disabled={loadingModules || batchLoading}
              className="h-11 min-w-[280px] rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm font-semibold text-[#0F172A] shadow-sm outline-none transition focus:border-[#2649B3]"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name || c.name} · ({c.company_code || "No Code"})
                </option>
              ))}
            </select>

            {activeTenant && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#EEF2FF] px-3 py-2 text-xs font-semibold text-[#2649B3]">
                <Building2 size={14} />
                Tenant: {activeTenant.name} ({activeTenant.code})
              </span>
            )}
          </div>
        </div>

        {/* Commercial summary badge */}
        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-right">
          <p className="text-xs font-medium text-[#64748B]">Lisensi Modul Aktif</p>
          <div className="mt-1 flex items-baseline justify-end gap-1.5">
            <span className="text-2xl font-black text-[#2649B3]">
              {enabledCount}
            </span>
            <span className="text-sm font-bold text-[#64748B]">
              / {modules.length || 17} Modul
            </span>
          </div>
        </div>
      </div>

      {/* Preset Action Bar & Search */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#EFEFEF] bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#475569]">Aksi Cepat (Presets):</span>

          <button
            onClick={() => handleBatchPreset("STANDARD")}
            disabled={batchLoading || loadingModules}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#2649B3] bg-[#EEF2FF] px-3.5 py-2 text-xs font-semibold text-[#2649B3] transition hover:bg-[#2649B3] hover:text-white disabled:opacity-50"
          >
            <Sparkles size={14} /> Paket Standar ERP
          </button>

          <button
            onClick={() => handleBatchPreset("ALL")}
            disabled={batchLoading || loadingModules}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#2649B3] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#1D3A96] disabled:opacity-50"
          >
            <Zap size={14} /> Aktifkan Semua Modul
          </button>

          <button
            onClick={() => handleBatchPreset("NONE")}
            disabled={batchLoading || loadingModules}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-medium text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-red-600 disabled:opacity-50"
          >
            <RotateCcw size={13} /> Reset / Nonaktifkan Semua
          </button>
        </div>

        <div className="relative max-w-xs">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
          />
          <input
            type="text"
            placeholder="Cari modul..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-4 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none transition focus:border-[#2649B3] focus:bg-white"
          />
        </div>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredModules.map((item) => {
          const meta = MODULE_DEFINITIONS[item.module_code] || {
            name: item.module_code,
            description: "Modul sistem platform ERP",
            icon: Layers,
            category: "General",
          };
          const Icon = meta.icon;
          const isMarbot = item.module_code === "MARBOT";
          const isToggling = togglingCode === item.module_code;

          return (
            <div
              key={item.module_code}
              className={`flex flex-col justify-between rounded-2xl border p-5 transition shadow-sm ${
                item.enabled
                  ? "border-[#9FD6FF] bg-white"
                  : "border-[#EFEFEF] bg-[#FDFDFD] opacity-80"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        item.enabled
                          ? "bg-[#2649B3] text-white"
                          : "bg-[#F1F5F9] text-[#64748B]"
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-[#0F172A]">{meta.name}</p>
                      <span className="font-mono text-[11px] font-semibold uppercase text-[#64748B]">
                        {item.module_code}
                      </span>
                    </div>
                  </div>

                  {/* Toggle Button */}
                  <button
                    disabled={isToggling || batchLoading}
                    onClick={() => handleToggleModule(item.module_code, item.enabled)}
                    className={`relative shrink-0 h-6 w-11 rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                      item.enabled ? "bg-[#2649B3]" : "bg-[#CBD5E1]"
                    }`}
                    aria-label={`Toggle ${meta.name}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm ${
                        item.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-[#475569]">
                  {meta.description}
                </p>

                {isMarbot && (
                  <div className="mt-2.5 rounded-lg bg-[#EFF6FF] p-2 text-[11px] text-[#1E40AF]">
                    💡 Asisten AI membaca data sesuai modul aktif dan hak akses data user.
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[#F1F5F9] pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  {meta.category}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    item.enabled ? "text-[#16A34A]" : "text-[#94A3B8]"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      item.enabled ? "bg-[#16A34A]" : "bg-[#CBD5E1]"
                    }`}
                  />
                  {item.enabled ? "Tersedia untuk Company" : "Dinonaktifkan"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

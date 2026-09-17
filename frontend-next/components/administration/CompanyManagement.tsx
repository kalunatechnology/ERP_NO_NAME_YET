/**
 * File: frontend-next/components/administration/CompanyManagement.tsx
 *
 * Purpose: Super Admin Company Entity Management Hub.
 * Handles company lifecycle: creating new entities with presets and initial admin,
 * filtering by parent tenant, updating company profiles.
 */
"use client";

import { FormEvent, useState, useMemo } from "react";
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  Pencil,
  Sliders,
  Filter,
  UserCheck,
  Briefcase,
  ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { TenantItem } from "./TenantManagement";

export type CompanyDetail = {
  id: string;
  tenant_id?: string;
  company_code?: string;
  legal_name?: string;
  name?: string;
  business_category?: string;
  tax_number?: string;
  status?: string;
  created_at?: string;
};

export type UserOption = {
  id: string;
  full_name?: string;
  email: string;
  tenant_id?: string;
};

interface CompanyManagementProps {
  tenants: TenantItem[];
  companies: CompanyDetail[];
  users: UserOption[];
  loading: boolean;
  selectedTenantFilter: string;
  onFilterTenantChange: (tenantId: string) => void;
  onRefresh: () => Promise<void>;
  onSelectCompanyForModules: (companyId: string) => void;
}

export function CompanyManagement({
  tenants,
  companies,
  users,
  loading,
  selectedTenantFilter,
  onFilterTenantChange,
  onRefresh,
  onSelectCompanyForModules,
}: CompanyManagementProps) {
  const { refreshProfile } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyDetail | null>(null);

  // Form states for Create Company
  const [tenantId, setTenantId] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [businessCategory, setBusinessCategory] = useState("General");
  const [taxNumber, setTaxNumber] = useState("");
  const [modulePreset, setModulePreset] = useState<"STANDARD" | "ALL" | "MINIMAL" | "NONE">("STANDARD");
  const [assignAdmin, setAssignAdmin] = useState(false);
  const [initialAdminId, setInitialAdminId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form states for Edit Company
  const [editLegalName, setEditLegalName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTaxNumber, setEditTaxNumber] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");

  // Map tenant name by id
  const tenantMap = useMemo(() => {
    const map = new Map<string, TenantItem>();
    for (const t of tenants) {
      map.set(t.id, t);
    }
    return map;
  }, [tenants]);

  // Filtered list
  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      const name = c.legal_name || c.name || "";
      const code = c.company_code || "";
      const matchesSearch = !q || name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
      const matchesTenant = !selectedTenantFilter || selectedTenantFilter === "ALL" || c.tenant_id === selectedTenantFilter;
      const matchesStatus = statusFilter === "ALL" || (c.status || "ACTIVE").toUpperCase() === statusFilter;
      return matchesSearch && matchesTenant && matchesStatus;
    });
  }, [companies, search, selectedTenantFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = companies.length;
    const active = companies.filter((c) => (c.status || "ACTIVE").toUpperCase() === "ACTIVE").length;
    return { total, active };
  }, [companies]);

  const eligibleAdminUsers = useMemo(
    () => users.filter((user) => user.tenant_id === tenantId),
    [users, tenantId]
  );

  const handleOpenCreate = (defaultTenantId?: string) => {
    const initialTenant = defaultTenantId || (tenants[0]?.id || "");
    setTenantId(initialTenant);
    setCompanyCode("");
    setLegalName("");
    setBusinessCategory("General");
    setTaxNumber("");
    setModulePreset("STANDARD");
    setAssignAdmin(false);
    setInitialAdminId(users.find((user) => user.tenant_id === initialTenant)?.id || "");
    setCreateOpen(true);
  };

  const handleOpenEdit = (comp: CompanyDetail) => {
    setSelectedCompany(comp);
    setEditLegalName(comp.legal_name || comp.name || "");
    setEditCategory(comp.business_category || "General");
    setEditTaxNumber(comp.tax_number || "-");
    setEditStatus(comp.status || "ACTIVE");
    setEditOpen(true);
  };

  const handleCreateCompany = async (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = companyCode.trim().toUpperCase();
    const cleanName = legalName.trim();

    if (!tenantId) {
      toast.error("Pilih tenant pemilik company.");
      return;
    }
    if (!cleanCode || !cleanName) {
      toast.error("Kode perusahaan dan nama legal wajib diisi.");
      return;
    }
    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      toast.error("Kode perusahaan hanya boleh huruf kapital, angka, garis bawah, dan tanda hubung.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/v1/core/companies/bootstrap", {
        tenant_id: tenantId,
        company_code: cleanCode,
        legal_name: cleanName,
        business_category: businessCategory.trim() || "General",
        tax_number: taxNumber.trim() || "-",
        status: "ACTIVE",
        module_preset: modulePreset,
        initial_admin_user_id: assignAdmin && initialAdminId ? initialAdminId : undefined,
      });

      toast.success(`Entitas "${cleanName}" berhasil dibuat!`);
      setCreateOpen(false);
      await refreshProfile();
      await onRefresh();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error?.message ||
        "Gagal membuat company.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCompany = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    const cleanName = editLegalName.trim();
    if (!cleanName) {
      toast.error("Nama legal perusahaan wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/api/v1/core/companies/${selectedCompany.id}`, {
        legal_name: cleanName,
        business_category: editCategory.trim() || "General",
        tax_number: editTaxNumber.trim() || "-",
        status: editStatus,
      });

      toast.success(`Company "${cleanName}" berhasil diperbarui.`);
      setEditOpen(false);
      await refreshProfile();
      await onRefresh();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error?.message ||
        "Gagal memperbarui company.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#EFEFEF] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Total Entitas Company
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#2649B3]">
              <Building2 size={18} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A]">
            {stats.total}
          </p>
          <span className="mt-1 text-xs text-[#64748B]">Semua entitas legal dalam sistem</span>
        </div>

        <div className="rounded-2xl border border-[#EFEFEF] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Company Aktif
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0FDF4] text-[#16A34A]">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-[#16A34A]">
            {stats.active}
          </p>
          <span className="mt-1 text-xs text-[#64748B]">Siap menerima transaksi & aktivitas</span>
        </div>
      </div>

      {/* Control Filters & New Company Button */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#EFEFEF] bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
            />
            <input
              type="text"
              placeholder="Cari nama legal atau kode company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-4 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none transition focus:border-[#2649B3] focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={15} className="text-[#64748B]" />
            <select
              value={selectedTenantFilter}
              onChange={(e) => onFilterTenantChange(e.target.value)}
              className="h-10 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm font-medium text-[#475569] outline-none transition focus:border-[#2649B3] focus:bg-white"
            >
              <option value="ALL">Semua Tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 text-sm font-medium text-[#475569] outline-none transition focus:border-[#2649B3] focus:bg-white"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Nonaktif</option>
          </select>
        </div>

        <button
          onClick={() => handleOpenCreate(selectedTenantFilter !== "ALL" ? selectedTenantFilter : undefined)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2649B3] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D3A96]"
        >
          <Plus size={16} /> Buat Company Baru
        </button>
      </div>

      {/* Companies Table */}
      <div className="overflow-hidden rounded-2xl border border-[#EFEFEF] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              <tr>
                <th className="px-6 py-4">Kode</th>
                <th className="px-6 py-4">Nama Legal Company</th>
                <th className="px-6 py-4">Tenant Induk</th>
                <th className="px-6 py-4">Kategori / NPWP</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-[#334155]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#64748B]">
                    Memuat daftar entitas company...
                  </td>
                </tr>
              ) : filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#64748B]">
                    Tidak ada company yang cocok dengan filter saat ini.
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((comp) => {
                  const tenant = comp.tenant_id ? tenantMap.get(comp.tenant_id) : null;
                  const isActive = (comp.status || "ACTIVE").toUpperCase() === "ACTIVE";

                  return (
                    <tr key={comp.id} className="transition hover:bg-[#F8FAFC]">
                      <td className="px-6 py-4 font-mono font-semibold text-[#0F172A]">
                        <span className="inline-flex items-center rounded-lg bg-[#F1F5F9] px-2.5 py-1 text-xs font-bold text-[#2649B3]">
                          {comp.company_code || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-[#0F172A]">
                        {comp.legal_name || comp.name}
                      </td>
                      <td className="px-6 py-4">
                        {tenant ? (
                          <div>
                            <p className="font-medium text-[#0F172A]">{tenant.name}</p>
                            <span className="text-[11px] font-mono text-[#64748B]">
                              Code: {tenant.code}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center rounded-md bg-[#EEF2FF] px-2 py-0.5 text-xs font-medium text-[#2649B3]">
                            {comp.business_category || "General"}
                          </span>
                          <p className="font-mono text-xs text-[#64748B]">
                            {comp.tax_number || "-"}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold ${
                            isActive
                              ? "bg-[#DCFCE7] text-[#15803D]"
                              : "bg-[#F1F5F9] text-[#64748B]"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isActive ? "bg-[#16A34A]" : "bg-[#94A3B8]"
                            }`}
                          />
                          {isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => onSelectCompanyForModules(comp.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#2649B3] bg-white px-2.5 py-1 text-xs font-semibold text-[#2649B3] transition hover:bg-[#EEF2FF]"
                            title="Konfigurasi modul komersial company ini"
                          >
                            <Sliders size={13} /> Modul
                          </button>
                          <button
                            onClick={() => handleOpenEdit(comp)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-[#475569] transition hover:bg-[#F8FAFC]"
                            title="Edit profil entitas company"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Buat Company Baru */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Buat Entitas Company Baru"
        subtitle="Tambahkan unit bisnis baru di bawah tenant pilihan dengan modul awal"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateCompany} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Tenant Induk <span className="text-red-500">*</span>
              </label>
              <select
                value={tenantId}
                onChange={(e) => {
                  const nextTenantId = e.target.value;
                  setTenantId(nextTenantId);
                  setInitialAdminId(users.find((user) => user.tenant_id === nextTenantId)?.id || "");
                  setAssignAdmin(false);
                }}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
                required
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Kode Perusahaan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Contoh: SMA-01, ARS-TECH"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm font-mono uppercase text-[#0F172A] outline-none transition focus:border-[#2649B3]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Nama Legal Perusahaan <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: PT Sinergi Muda Arsa Indonesia"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Kategori Bisnis
              </label>
              <select
                value={businessCategory}
                onChange={(e) => setBusinessCategory(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              >
                <option value="General">General Business</option>
                <option value="Holding">Holding Company</option>
                <option value="Technology">Technology & Software</option>
                <option value="Trading">Trading & Distribution</option>
                <option value="Services">Professional Services</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Construction">Construction & Engineering</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Nomor NPWP / Tax Number
              </label>
              <input
                type="text"
                placeholder="01.234.567.8-901.000 (atau -)"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm font-mono text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              />
            </div>
          </div>

          {/* Preset Modul Awal */}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#2649B3]">
              Preset Modul Awal (Commercial Entitlement)
            </label>
            <p className="mt-1 text-xs text-[#64748B]">
              Tentukan paket lisensi modul awal yang langsung aktif setelah company dibuat:
            </p>

            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  modulePreset === "STANDARD"
                    ? "border-[#2649B3] bg-white shadow-sm"
                    : "border-[#E2E8F0] bg-transparent hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={modulePreset === "STANDARD"}
                  onChange={() => setModulePreset("STANDARD")}
                  className="mt-0.5 text-[#2649B3]"
                />
                <div>
                  <p className="text-xs font-bold text-[#0F172A]">Paket Standar ERP (Rekomendasi)</p>
                  <p className="text-[11px] text-[#64748B]">Core, Requests, CRM, Sales, Projects, Finance, Reporting</p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  modulePreset === "ALL"
                    ? "border-[#2649B3] bg-white shadow-sm"
                    : "border-[#E2E8F0] bg-transparent hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={modulePreset === "ALL"}
                  onChange={() => setModulePreset("ALL")}
                  className="mt-0.5 text-[#2649B3]"
                />
                <div>
                  <p className="text-xs font-bold text-[#0F172A]">Semua Modul Aktif</p>
                  <p className="text-[11px] text-[#64748B]">16 modul operasional lengkap platform langsung aktif</p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  modulePreset === "MINIMAL"
                    ? "border-[#2649B3] bg-white shadow-sm"
                    : "border-[#E2E8F0] bg-transparent hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={modulePreset === "MINIMAL"}
                  onChange={() => setModulePreset("MINIMAL")}
                  className="mt-0.5 text-[#2649B3]"
                />
                <div>
                  <p className="text-xs font-bold text-[#0F172A]">Minimal (Core Saja)</p>
                  <p className="text-[11px] text-[#64748B]">Hanya Core Workspace dan Requests</p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  modulePreset === "NONE"
                    ? "border-[#2649B3] bg-white shadow-sm"
                    : "border-[#E2E8F0] bg-transparent hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={modulePreset === "NONE"}
                  onChange={() => setModulePreset("NONE")}
                  className="mt-0.5 text-[#2649B3]"
                />
                <div>
                  <p className="text-xs font-bold text-[#0F172A]">Konfigurasi Manual</p>
                  <p className="text-[11px] text-[#64748B]">Semua modul dinonaktifkan awal, diatur manual</p>
                </div>
              </label>
            </div>
          </div>

          {/* Initial Admin Assignment Option */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck size={16} className="text-[#2649B3]" />
                <span className="text-xs font-semibold text-[#0F172A]">
                  Tugaskan Initial Company Admin
                </span>
              </div>
              <input
                type="checkbox"
                id="assignAdminCheck"
                checked={assignAdmin}
                disabled={eligibleAdminUsers.length === 0}
                onChange={(e) => {
                  setAssignAdmin(e.target.checked);
                  if (e.target.checked && !initialAdminId) {
                    setInitialAdminId(eligibleAdminUsers[0]?.id || "");
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-[#2649B3]"
              />
            </div>
            <p className="mt-1 text-xs text-[#64748B]">
              {eligibleAdminUsers.length > 0
                ? "Berikan akses Company Admin pertama agar entitas langsung dapat dikelola."
                : "Belum ada user pada tenant ini yang dapat dipilih sebagai Company Admin awal."}
            </p>

            {assignAdmin && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-[#475569]">
                  Pilih User yang Ada:
                </label>
                <select
                  value={initialAdminId}
                  onChange={(e) => setInitialAdminId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
                >
                  {eligibleAdminUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#2649B3] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1D3A96] disabled:opacity-50"
            >
              {submitting ? "Membuat Entitas..." : "Buat & Pasang Entitas"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Company */}
      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit Company: ${selectedCompany?.company_code}`}
        subtitle="Perbarui profil legalitas dan status entitas perusahaan"
        maxWidth="md"
      >
        <form onSubmit={handleUpdateCompany} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Nama Legal Perusahaan <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editLegalName}
              onChange={(e) => setEditLegalName(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Kategori Bisnis
            </label>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
            >
              <option value="General">General Business</option>
              <option value="Holding">Holding Company</option>
              <option value="Technology">Technology & Software</option>
              <option value="Trading">Trading & Distribution</option>
              <option value="Services">Professional Services</option>
              <option value="Manufacturing">Manufacturing</option>
              <option value="Construction">Construction & Engineering</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Nomor NPWP / Tax Number
            </label>
            <input
              type="text"
              value={editTaxNumber}
              onChange={(e) => setEditTaxNumber(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm font-mono text-[#0F172A] outline-none transition focus:border-[#2649B3]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Status Operasional
            </label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
            >
              <option value="ACTIVE">Aktif (Operasional Terbuka)</option>
              <option value="INACTIVE">Nonaktif (Akses Ditutup)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#2649B3] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#1D3A96] disabled:opacity-50"
            >
              {submitting ? "Menyimpan..." : "Perbarui Company"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

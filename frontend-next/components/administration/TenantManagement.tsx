/**
 * File: frontend-next/components/administration/TenantManagement.tsx
 *
 * Purpose: Super Admin Tenant Management Hub.
 * Handles multi-tenant lifecycle: viewing, creating, and updating core tenants.
 */
"use client";

import { FormEvent, useState, useMemo } from "react";
import {
  Building,
  Plus,
  Search,
  CheckCircle2,
  Pencil,
  Layers,
  Bot,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { Modal } from "@/components/ui/Modal";
import { MarbotConfigModal } from "./MarbotConfigModal";

export type TenantItem = {
  id: string;
  code: string;
  name: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type CompanyItem = {
  id: string;
  tenant_id?: string;
  company_code?: string;
  legal_name?: string;
  name?: string;
  status?: string;
};

interface TenantManagementProps {
  tenants: TenantItem[];
  companies: CompanyItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onSelectTenantForCompany: (tenantId: string) => void;
  onSelectCompanyForModules: (companyId: string) => void;
}

export function TenantManagement({
  tenants,
  companies,
  loading,
  onRefresh,
  onSelectTenantForCompany,
  onSelectCompanyForModules,
}: TenantManagementProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);

  // MarBot modal states
  const [marbotModalOpen, setMarbotModalOpen] = useState(false);
  const [marbotTenant, setMarbotTenant] = useState<TenantItem | null>(null);

  // Form states
  const [tenantCode, setTenantCode] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantStatus, setTenantStatus] = useState("ACTIVE");
  const [submitting, setSubmitting] = useState(false);

  // Stats calculation
  const stats = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter((t) => t.status?.toUpperCase() === "ACTIVE").length;
    const totalCompanies = companies.length;
    return { total, active, totalCompanies };
  }, [tenants, companies]);

  // Count companies per tenant
  const companyCountByTenant = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of companies) {
      if (c.tenant_id) {
        counts[c.tenant_id] = (counts[c.tenant_id] || 0) + 1;
      }
    }
    return counts;
  }, [companies]);

  // Filtered tenants
  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "ALL" ||
        (t.status || "ACTIVE").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tenants, search, statusFilter]);

  const handleOpenCreate = () => {
    setTenantCode("");
    setTenantName("");
    setTenantStatus("ACTIVE");
    setCreateOpen(true);
  };

  const handleOpenEdit = (tenant: TenantItem) => {
    setSelectedTenant(tenant);
    setTenantCode(tenant.code);
    setTenantName(tenant.name);
    setTenantStatus(tenant.status || "ACTIVE");
    setEditOpen(true);
  };

  const handleCreateTenant = async (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = tenantCode.trim().toUpperCase();
    const cleanName = tenantName.trim();

    if (!cleanCode || !cleanName) {
      toast.error("Kode dan nama tenant wajib diisi.");
      return;
    }

    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      toast.error("Kode tenant hanya boleh huruf kapital, angka, dan tanda hubung.");
      return;
    }

    setSubmitting(true);
    try {
      const resp = await api.post("/api/v1/core/tenants", {
        code: cleanCode,
        name: cleanName,
        status: tenantStatus,
      });
      const createdData = resp.data?.data || resp.data;
      toast.success(`Tenant "${cleanName}" berhasil dibuat!`);
      setCreateOpen(false);
      await onRefresh();

      // Automatically open MarBot config modal so user can configure chatbot immediately
      if (createdData?.id) {
        setMarbotTenant({
          id: createdData.id,
          code: cleanCode,
          name: cleanName,
          status: tenantStatus,
        });
        setMarbotModalOpen(true);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error?.message ||
        "Gagal membuat tenant.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTenant = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    const cleanName = tenantName.trim();
    if (!cleanName) {
      toast.error("Nama tenant wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/api/v1/core/tenants/${selectedTenant.id}`, {
        name: cleanName,
        status: tenantStatus,
      });
      toast.success(`Tenant "${cleanName}" berhasil diperbarui.`);
      setEditOpen(false);
      await onRefresh();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error?.message ||
        "Gagal memperbarui tenant.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#EFEFEF] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Total Tenant
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#2649B3]">
              <Building size={18} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A]">
            {stats.total}
          </p>
          <span className="mt-1 text-xs text-[#64748B]">Organisasi terdaftar di platform</span>
        </div>

        <div className="rounded-2xl border border-[#EFEFEF] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Tenant Aktif
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0FDF4] text-[#16A34A]">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-[#16A34A]">
            {stats.active}
          </p>
          <span className="mt-1 text-xs text-[#64748B]">Status operasional berjalan</span>
        </div>

        <div className="rounded-2xl border border-[#EFEFEF] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              Entitas Company
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8FAFC] text-[#475569]">
              <Layers size={18} />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A]">
            {stats.totalCompanies}
          </p>
          <span className="mt-1 text-xs text-[#64748B]">Unit bisnis di seluruh tenant</span>
        </div>
      </div>

      {/* Control Bar & Actions */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#EFEFEF] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
            />
            <input
              type="text"
              placeholder="Cari tenant berdasarkan nama atau kode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-10 pr-4 text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none transition focus:border-[#2649B3] focus:bg-white"
            />
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
          onClick={handleOpenCreate}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2649B3] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D3A96]"
        >
          <Plus size={16} /> Tambah Tenant Baru
        </button>
      </div>

      {/* Tenant Table List */}
      <div className="overflow-hidden rounded-2xl border border-[#EFEFEF] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#F1F5F9] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wider text-[#64748B]">
              <tr>
                <th className="px-6 py-4">Kode Tenant</th>
                <th className="px-6 py-4">Nama Organisasi / Tenant</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Entitas Company</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-[#334155]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-[#64748B]">
                    Memuat data tenant...
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-[#64748B]">
                    Tidak ada tenant yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => {
                  const compCount = companyCountByTenant[tenant.id] || 0;
                  const isActive = (tenant.status || "ACTIVE").toUpperCase() === "ACTIVE";

                  return (
                    <tr key={tenant.id} className="transition hover:bg-[#F8FAFC]">
                      <td className="px-6 py-4 font-mono font-semibold text-[#0F172A]">
                        <span className="inline-flex items-center rounded-lg bg-[#F1F5F9] px-2.5 py-1 text-xs font-bold text-[#2649B3]">
                          {tenant.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-[#0F172A]">
                        {tenant.name}
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
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#475569]">
                          <span className="rounded-md bg-[#EEF2FF] px-2 py-0.5 font-bold text-[#2649B3]">
                            {compCount}
                          </span>{" "}
                          Company
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => {
                              setMarbotTenant(tenant);
                              setMarbotModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-2.5 py-1 text-xs font-semibold text-[#4338CA] transition hover:bg-[#E0E7FF]"
                            title="Konfigurasi integrasi Chatbot MarBot"
                          >
                            <Bot size={13} /> MarBot
                          </button>
                          <button
                            onClick={() => onSelectTenantForCompany(tenant.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-[#2649B3] transition hover:bg-[#F8FAFC]"
                            title="Tambah company di tenant ini"
                          >
                            <Plus size={13} /> Company
                          </button>
                          <button
                            onClick={() => handleOpenEdit(tenant)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-[#475569] transition hover:bg-[#F8FAFC]"
                            title="Edit informasi tenant"
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

      {/* Modal Tambah Tenant */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tambah Tenant Baru"
        subtitle="Daftarkan entitas tenant / organisasi baru pada platform ERP"
        maxWidth="md"
      >
        <form onSubmit={handleCreateTenant} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Kode Tenant <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: SMA, ARSALYNK, GHOST"
              value={tenantCode}
              onChange={(e) => setTenantCode(e.target.value.toUpperCase())}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm font-mono uppercase text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              required
            />
            <p className="mt-1 text-[11px] text-[#64748B]">
              Kode unik berupa huruf kapital dan angka (tanpa spasi).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Nama Tenant / Organisasi <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: PT Sinergi Muda Arsa"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Status Operasional
            </label>
            <select
              value={tenantStatus}
              onChange={(e) => setTenantStatus(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#2649B3]"
            >
              <option value="ACTIVE">Aktif (Operasional Terbuka)</option>
              <option value="INACTIVE">Nonaktif (Akses Ditutup)</option>
            </select>
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
              {submitting ? "Menyimpan..." : "Simpan Tenant"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Tenant */}
      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit Tenant: ${selectedTenant?.code}`}
        subtitle="Perbarui data legalitas dan status operasional tenant"
        maxWidth="md"
      >
        <form onSubmit={handleUpdateTenant} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Kode Tenant (Readonly)
            </label>
            <input
              type="text"
              value={tenantCode}
              disabled
              className="mt-1.5 h-10 w-full cursor-not-allowed rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] px-3.5 text-sm font-mono text-[#64748B]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Nama Tenant / Organisasi <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Status Operasional
            </label>
            <select
              value={tenantStatus}
              onChange={(e) => setTenantStatus(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm font-medium text-[#0F172A] outline-none transition focus:border-[#2649B3]"
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
              {submitting ? "Menyimpan..." : "Perbarui Tenant"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Konfigurasi MarBot */}
      <MarbotConfigModal
        isOpen={marbotModalOpen}
        onClose={() => {
          setMarbotModalOpen(false);
          setMarbotTenant(null);
        }}
        tenant={marbotTenant}
        onConfigSaved={onRefresh}
      />
    </div>
  );
}

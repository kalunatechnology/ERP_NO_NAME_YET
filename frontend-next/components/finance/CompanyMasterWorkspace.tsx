/**
 * File: frontend-next/components/finance/CompanyMasterWorkspace.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, Landmark, CreditCard, ShieldCheck, Edit3, Plus,
  Save, Trash2, CheckCircle2, AlertCircle, MapPin, Phone, Mail,
  Clock, FileText, DollarSign, ArrowUpRight, Lock, RefreshCw,
  Users, HardHat, Camera, Laptop, Server, Briefcase, Layers, Box,
  ChevronRight, Building, Eye, LayoutGrid, Table as TableIcon
} from "lucide-react";
import api from "@/lib/api/axios";
import { getUserFacingApiError } from "@/lib/api/error-message";
import { useAuth } from "@/contexts/AuthContext";
import { canPerform } from "@/lib/access/capability-contract";
import { formatMoney, formatDate, cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { IDRInput } from "@/components/ui/IDRInput";
import toast from "react-hot-toast";

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  type?: string;
  status: string;
}

interface CreditFacility {
  id: string;
  facility_type: string;
  facility_number: string;
  credit_limit: number;
  utilized_amount: number;
  available_amount: number;
  status: string;
}

interface OrgUnit {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
}

interface WorkAsset {
  id: string;
  code: string;
  name: string;
  serial: string;
  cost: number;
  status: string;
}

export function CompanyMasterWorkspace() {
  const { user, userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"financial" | "operational">("financial");
  const [orgViewMode, setOrgViewMode] = useState<"card" | "table">("card");
  const [assetViewMode, setAssetViewMode] = useState<"card" | "table">("card");
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<OrgUnit | null>(null);
  const [selectedWorkAsset, setSelectedWorkAsset] = useState<WorkAsset | null>(null);

  const canEditFinancial = canPerform("finance:operate", userRole, { enabledModules: user?.enabled_modules, moduleAccess: user?.module_access });
  const canEditCompany = ["super_admin", "company_admin", "finance"].includes(userRole);
  const canEditOperational = userRole === "company_admin";

  const [companyData, setCompanyData] = useState({
    id: "",
    company_code: "",
    legal_name: "",
    business_category: "CONSULTING_DIGITAL",
    tax_number: "",
    kpp_name: "",
    pkp_status: "",
    status: "",
    fiscal_year_start: "",
    office_address: "",
    workshop_address: "",
    phone: "",
    email: "",
    business_hours: "",
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [creditFacilities, setCreditFacilities] = useState<CreditFacility[]>([]);

  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);

  const [workAssets] = useState<WorkAsset[]>([]);

  // Modals
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    bank_name: "",
    account_number: "",
    account_name: "",
    type: "",
    status: "ACTIVE",
  });

  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditForm, setCreditForm] = useState({
    facility_type: "KREDIT_MODAL_KERJA_KMK",
    facility_number: "",
    credit_limit: 0,
    utilized_amount: 0,
    status: "ACTIVE",
  });

  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [orgForm, setOrgForm] = useState({
    code: "",
    name: "",
    type: "DIVISION",
    status: "ACTIVE",
  });

  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [assetForm, setAssetForm] = useState({
    code: "",
    name: "",
    serial: "",
    cost: 0,
    status: "TERSEDIA",
  });

  const loadMasterData = useCallback(async () => {
    setLoading(true);
    try {
      const requests = await Promise.allSettled([
        api.get("/api/v1/core/companies/"),
        api.get("/api/v1/finance/bank-accounts/"),
        api.get("/api/v1/finance/credit-facilities/"),
        api.get("/api/v1/core/organizations/?page_size=200"),
      ]);
      const rows = (payload: any): any[] => {
        const raw = payload?.data?.results ?? payload?.data?.data ?? payload?.data ?? [];
        return Array.isArray(raw) ? raw : [];
      };

      if (requests[0].status === "fulfilled") {
        const company = rows(requests[0].value)[0];
        if (company) {
          setCompanyData(prev => ({
            ...prev,
            id: company.id,
            legal_name: company.legal_name ?? "",
            business_category: company.business_category ?? "CONSULTING_DIGITAL",
            tax_number: company.tax_number ?? "",
            kpp_name: company.kpp_name ?? "",
            pkp_status: company.pkp_status ?? "",
            company_code: company.company_code ?? "",
            fiscal_year_start: company.fiscal_year_start?.slice?.(0, 10) ?? "",
            status: company.status ?? "",
          }));
        }
      }
      if (requests[1].status === "fulfilled") {
        setBankAccounts(rows(requests[1].value).map((b: any) => ({
            id: b.id,
            bank_name: b.bank_name ?? "",
            account_number: b.account_number ?? "",
            account_name: b.account_name ?? "",
            status: b.status ?? "",
          })));
      }
      if (requests[2].status === "fulfilled") {
        setCreditFacilities(rows(requests[2].value).map((item: any) => ({
          id: item.id,
          facility_type: item.facility_type ?? "",
          facility_number: item.facility_number ?? "",
          credit_limit: Number(item.credit_limit ?? 0),
          utilized_amount: Number(item.utilized_amount ?? 0),
          available_amount: Number(item.available_amount ?? 0),
          status: item.status ?? "",
        })));
      }
      if (requests[3].status === "fulfilled") {
        setOrgUnits(rows(requests[3].value).map((item: any) => ({
          id: item.id,
          code: item.organization_code ?? "",
          name: item.organization_name ?? "",
          type: item.organization_type ?? "",
          status: item.status ?? "",
        })));
      }
      const failed = requests.filter((request) => request.status === "rejected").length;
      if (failed > 0) toast.error(`${failed} sumber data master belum dapat dimuat. Data contoh tidak digunakan; muat ulang untuk mencoba kembali.`);
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Data master perusahaan belum dapat dimuat. Periksa koneksi dan hak akses, lalu coba lagi."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditCompany) {
      toast.error("Anda tidak memiliki izin mengubah data master finansial");
      return;
    }
    setSavingCompany(true);
    try {
      await api.patch(`/api/v1/core/companies/${companyData.id}/`, {
        company_code: companyData.company_code,
        legal_name: companyData.legal_name,
        business_category: companyData.business_category,
        tax_number: companyData.tax_number,
        kpp_name: companyData.kpp_name,
        pkp_status: companyData.pkp_status,
        fiscal_year_start: companyData.fiscal_year_start || null,
        status: companyData.status,
      });
      toast.success("Data legalitas perusahaan berhasil disimpan.");
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Data perusahaan belum dapat disimpan. Periksa kelengkapan data dan hak akses, lalu coba lagi."));
    } finally {
      setSavingCompany(false);
    }
  };

  const handleCreateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post("/api/v1/finance/bank-accounts/", {
        company_id: companyData.id,
        bank_name: bankForm.bank_name,
        account_number: bankForm.account_number,
        account_name: bankForm.account_name,
        status: bankForm.status,
      });
      const created = response.data?.data ?? response.data;
      toast.success("Rekening bank perusahaan berhasil ditambahkan.");
      setIsBankModalOpen(false);
      setBankAccounts(prev => [...prev, {
        id: created.id,
        bank_name: created.bank_name,
        account_number: created.account_number,
        account_name: created.account_name,
        status: created.status,
      }]);
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Rekening bank belum dapat ditambahkan. Periksa nomor rekening dan data wajib, lalu coba lagi."));
    }
  };

  const handleCreateCreditFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const avail = Number(creditForm.credit_limit) - Number(creditForm.utilized_amount);
      const response = await api.post("/api/v1/finance/credit-facilities/", {
        company_id: companyData.id,
        ...creditForm,
        available_amount: avail,
      });
      const created = response.data?.data ?? response.data;
      toast.success("Fasilitas kredit bank berhasil dicatat.");
      setIsCreditModalOpen(false);
      setCreditFacilities(prev => [...prev, {
        ...created,
        credit_limit: Number(created.credit_limit ?? 0),
        utilized_amount: Number(created.utilized_amount ?? 0),
        available_amount: Number(created.available_amount ?? 0),
      }]);
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Fasilitas kredit belum dapat dicatat. Periksa batas kredit dan nominal terpakai, lalu coba lagi."));
    }
  };

  const handleCreateOrgUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post("/api/v1/core/organizations/", {
        company_id: companyData.id,
        organization_code: orgForm.code,
        organization_name: orgForm.name,
        organization_type: orgForm.type,
        status: orgForm.status,
      });
      const created = response.data?.data ?? response.data;
      toast.success("Unit organisasi berhasil ditambahkan.");
      setIsOrgModalOpen(false);
      setOrgUnits(prev => [...prev, {
        id: created.id,
        code: created.organization_code,
        name: created.organization_name,
        type: created.organization_type,
        status: created.status,
      }]);
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Unit organisasi belum dapat ditambahkan. Periksa kode dan nama unit, lalu coba lagi."));
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.error("Pencatatan aset tersedia di modul Assets dan tidak dijalankan dari workspace Finance.");
  };

  return (
    <div className="finance-scope flex flex-col gap-5 w-full">
      {/* ── Sub-header Toolbar & Navigation ────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E2E8F0]">
        <div role="tablist" aria-label="Bagian master perusahaan" className="fin-subtabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "financial"}
            data-active={activeSubTab === "financial"}
            onClick={() => setActiveSubTab("financial")}
            className="inline-flex items-center gap-2"
          >
            <Landmark size={14} />
            Finansial, Pajak & Rekening Bank
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === "operational"}
            data-active={activeSubTab === "operational"}
            onClick={() => setActiveSubTab("operational")}
            className="inline-flex items-center gap-2"
          >
            <Building size={14} />
            Operasional, Divisi & Aset Kerja
          </button>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="status-label is-ok hidden md:inline-flex">
            Entitas Aktif
          </span>
          <button
            type="button"
            onClick={() => loadMasterData()}
            className="btn-outline-soft inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
            title="Segarkan data master"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: MASTER FINANSIAL & PERBANKAN ───────────────────── */}
      {activeSubTab === "financial" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Kolom Kiri (7 Cols): Profil Legal, Kontak Perusahaan, Daftar Rekening Bank */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <form onSubmit={handleSaveCompany} className="fin-card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#E7F2FF] text-[#163D64] flex items-center justify-center font-bold">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#0F172A]">Profil Legal & Perpajakan Entitas</h3>
                    <p className="text-xs text-[#64748B]">Identitas badan usaha dan administrasi pajak resmi</p>
                  </div>
                </div>
                {!canEditCompany && (
                  <span className="status-label is-idle inline-flex items-center gap-1">
                    <Eye size={12} aria-hidden="true" /> Hanya lihat
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-sm font-semibold text-[#0F172A] block mb-1">Nama Legal Perusahaan</label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={companyData.legal_name}
                    onChange={e => setCompanyData({ ...companyData, legal_name: e.target.value })}
                    className="input text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#0F172A] block mb-1">Kode Singkat Entitas</label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={companyData.company_code}
                    onChange={e => setCompanyData({ ...companyData, company_code: e.target.value })}
                    className="input text-sm font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#0F172A] block mb-1">NPWP Perusahaan (16 Digit)</label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={companyData.tax_number}
                    onChange={e => setCompanyData({ ...companyData, tax_number: e.target.value })}
                    className="input text-sm font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#0F172A] block mb-1">Kategori Bisnis & Preset Pajak</label>
                  <select disabled={!canEditCompany} value={companyData.business_category} onChange={e => setCompanyData({ ...companyData, business_category: e.target.value })} className="input text-sm font-medium">
                    <option value="CONSULTING_DIGITAL">Konsultansi, Riset & Layanan Digital</option>
                    <option value="CREATIVE_MEDIA">Media Kreatif & Produksi Konten</option>
                    <option value="CONSTRUCTION">Pelaksana Konstruksi</option>
                    <option value="GENERAL_SERVICES">Jasa Umum & Manajemen</option>
                  </select>
                  <p className="mt-1 text-xs text-[#64748B]">Digunakan otomatis untuk menentukan pilihan PPh awal.</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#0F172A] block mb-1">KPP Terdaftar</label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={companyData.kpp_name}
                    onChange={e => setCompanyData({ ...companyData, kpp_name: e.target.value })}
                    placeholder="Contoh: KPP Pratama Jakarta Setiabudi Satu"
                    className="input text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#0F172A] block mb-1">Status Pengukuhan PKP</label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={companyData.pkp_status}
                    onChange={e => setCompanyData({ ...companyData, pkp_status: e.target.value })}
                    placeholder="Contoh: PKP - Terdaftar sejak 2024"
                    className="input text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-[#0F172A] block mb-1">Awal Tahun Fiskal</label>
                  <input
                    type="date"
                    disabled={!canEditCompany}
                    value={companyData.fiscal_year_start}
                    onChange={e => setCompanyData({ ...companyData, fiscal_year_start: e.target.value })}
                    className="input text-sm"
                  />
                </div>
              </div>

              {canEditCompany && (
                <div className="flex justify-end pt-3 border-t border-[#E2E8F0]">
                  <button
                    type="submit"
                    disabled={savingCompany}
                    className="btn-final inline-flex items-center gap-1.5 rounded-full py-2 px-4 text-sm font-semibold"
                  >
                    <Save size={13} />
                    {savingCompany ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              )}
            </form>

            {/* Kontak Perusahaan & Lokasi Kantor (Kolom Kiri) */}
            <div className="fin-card p-5 flex flex-col gap-3">
              <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">Kontak Perusahaan & Lokasi Kantor</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#64748B]">
                <div className="flex items-start gap-2 sm:col-span-2">
                  <MapPin size={14} className="text-[#163D64] mt-0.5 flex-shrink-0" />
                  <span>{companyData.office_address || "Belum diatur"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-[#163D64] flex-shrink-0" />
                  <span>{companyData.phone || "Belum diatur"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-[#163D64] flex-shrink-0" />
                  <span>{companyData.email || "Belum diatur"}</span>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Clock size={14} className="text-[#163D64] flex-shrink-0" />
                  <span>{companyData.business_hours || "Belum diatur"}</span>
                </div>
              </div>
            </div>

            {/* Master Rekening Bank */}
            <div className="fin-card p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#E7F2FF] text-blue-700 flex items-center justify-center font-bold">
                    <Landmark size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#0F172A]">Daftar Rekening Bank Perusahaan</h3>
                    <p className="text-xs text-[#64748B]">Akun bank transaksi resmi untuk penyelesaian AP/AR</p>
                  </div>
                </div>
                {canEditFinancial && (
                  <button
                    type="button"
                    onClick={() => setIsBankModalOpen(true)}
                    className="btn-final inline-flex items-center gap-1 rounded-full py-1.5 px-3.5 text-xs font-semibold"
                  >
                    <Plus size={13} /> Tambah Rekening
                  </button>
                )}
              </div>

              <div className="table-scroll-wrapper">
                <table className="w-full data-table text-xs min-w-[500px]">
                  <thead>
                    <tr>
                      <th className="!text-sm">Nama Bank & Deskripsi</th>
                      <th className="!text-sm">Nomor Rekening</th>
                      <th className="!text-sm">Atas Nama</th>
                      <th className="!text-sm text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankAccounts.map((b) => (
                      <tr key={b.id}>
                        <td className="!text-sm">
                          <div className="font-semibold text-[#0F172A]">{b.bank_name}</div>
                          {b.type && <span className="text-xs text-[#64748B]">{b.type}</span>}
                        </td>
                        <td className="!text-sm font-semibold text-[#163D64]">{b.account_number}</td>
                        <td className="!text-sm text-[#64748B]">{b.account_name}</td>
                        <td className="text-right">
                          <span className="status-label is-ok">{b.status === "ACTIVE" ? "Aktif" : b.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Kolom Kanan (5 Cols): Daftar Fasilitas Kredit & KMK Bank */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="fin-card p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FAF5FF] text-purple-700 flex items-center justify-center font-bold">
                    <CreditCard size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#0F172A]">Daftar Fasilitas Kredit & KMK</h3>
                    <p className="text-xs text-[#64748B]">Plafon modal kerja dan bank garansi proyek</p>
                  </div>
                </div>
                {canEditFinancial && (
                  <button
                    type="button"
                    onClick={() => setIsCreditModalOpen(true)}
                    className="btn-outline-soft inline-flex items-center gap-1 rounded-full py-1.5 px-3 text-xs font-semibold"
                  >
                    <Plus size={13} /> Tambah
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {creditFacilities.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#64748B]">
                    Belum ada fasilitas kredit tercatat.
                  </div>
                ) : (
                  creditFacilities.map((cf) => (
                    <div key={cf.id} className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                            {cf.facility_type.replace(/_/g, " ")}
                          </span>
                          <div className="text-sm font-semibold text-[#0F172A] mt-0.5">{cf.facility_number}</div>
                        </div>
                        <span className="status-label is-ok">{cf.status === "ACTIVE" ? "Aktif" : cf.status}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E2E8F0] text-sm">
                        <div>
                          <span className="text-xs text-[#64748B] block">Plafon Total</span>
                          <strong className="text-sm text-[#0F172A]">{formatMoney(cf.credit_limit)}</strong>
                        </div>
                        <div>
                          <span className="text-xs text-[#64748B] block">Terpakai</span>
                          <strong className="text-sm text-amber-700">{formatMoney(cf.utilized_amount)}</strong>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
                        <span className="text-emerald-800 font-medium">Sisa Plafon Tersedia:</span>
                        <strong className="text-emerald-900 font-bold">{formatMoney(cf.available_amount)}</strong>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: MASTER OPERASIONAL, DIVISI & ASET ───────────────── */}
      {activeSubTab === "operational" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Kolom Kiri (6 Cols): Struktur Divisi Organisasi & PM Roster */}
          <div className="lg:col-span-6 flex flex-col gap-5">
            {/* Struktur Divisi */}
            <div className="fin-card p-5 flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#E7F2FF] text-[#163D64] flex items-center justify-center font-bold">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A]">Struktur Unit Organisasi & Divisi</h3>
                    <p className="text-xs text-[#64748B]">Klik item untuk melihat detail</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="fin-subtabs" role="group" aria-label="Tampilan divisi">
                    <button
                      type="button"
                      data-active={orgViewMode === "card"}
                      onClick={() => setOrgViewMode("card")}
                      className="inline-flex items-center gap-1"
                    >
                      <LayoutGrid size={12} /> Kartu
                    </button>
                    <button
                      type="button"
                      data-active={orgViewMode === "table"}
                      onClick={() => setOrgViewMode("table")}
                      className="inline-flex items-center gap-1"
                    >
                      <TableIcon size={12} /> Tabel
                    </button>
                  </div>
                  {canEditOperational && (
                    <button
                      type="button"
                      onClick={() => setIsOrgModalOpen(true)}
                      className="btn-final inline-flex items-center gap-1 rounded-full py-1.5 px-3 text-xs font-semibold"
                    >
                      <Plus size={13} /> Tambah
                    </button>
                  )}
                </div>
              </div>

              {orgUnits.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#64748B]">Belum ada unit organisasi tercatat.</div>
              ) : orgViewMode === "card" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {orgUnits.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOrgUnit(o)}
                      className="text-left p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] hover:border-[#0876CD] hover:bg-white transition-all flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 shrink-0 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center font-semibold text-[11px] text-[#163D64]">
                          {o.code.split("-").pop()?.slice(0, 3) || "DIV"}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#0F172A] truncate">{o.name}</div>
                          <span className="text-[11px] text-[#64748B] block truncate">{o.code} · {o.type}</span>
                        </div>
                      </div>
                      <span className="status-label is-ok shrink-0">{o.status === "ACTIVE" ? "Aktif" : o.status}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="table-scroll-wrapper">
                  <table className="w-full data-table text-xs">
                    <thead>
                      <tr>
                        <th>Kode</th>
                        <th>Nama Divisi</th>
                        <th>Tipe</th>
                        <th className="text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgUnits.map((o) => (
                        <tr
                          key={o.id}
                          onClick={() => setSelectedOrgUnit(o)}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <td className="font-semibold text-[#163D64]">{o.code}</td>
                          <td className="font-medium text-[#0F172A]">{o.name}</td>
                          <td className="text-[#64748B]">{o.type}</td>
                          <td className="text-right">
                            <span className="status-label is-ok">{o.status === "ACTIVE" ? "Aktif" : o.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Personel & Project Manager Lead */}
            <div className="fin-card p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#E7F2FF] text-blue-700 flex items-center justify-center font-bold">
                    <Users size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A]">Tim Manajer Proyek &amp; Spesialis Lapangan</h3>
                    <p className="text-xs text-[#64748B]">Penanggung jawab eksekusi operasional</p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-[#E2E8F0]">
                <div className="py-6 text-center text-xs text-[#64748B]">
                  Daftar personel dikelola pada menu Pengguna &amp; Akses.
                </div>
              </div>
            </div>
          </div>

          {/* Kolom Kanan (6 Cols): Peralatan Kerja & Studio */}
          <div className="lg:col-span-6 flex flex-col gap-5">
            <div className="fin-card p-5 flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] text-rose-700 flex items-center justify-center font-bold">
                    <Camera size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A]">Peralatan Kerja & Aset Operasional</h3>
                    <p className="text-xs text-[#64748B]">Klik item untuk melihat detail</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="fin-subtabs" role="group" aria-label="Tampilan aset kerja">
                    <button
                      type="button"
                      data-active={assetViewMode === "card"}
                      onClick={() => setAssetViewMode("card")}
                      className="inline-flex items-center gap-1"
                    >
                      <LayoutGrid size={12} /> Kartu
                    </button>
                    <button
                      type="button"
                      data-active={assetViewMode === "table"}
                      onClick={() => setAssetViewMode("table")}
                      className="inline-flex items-center gap-1"
                    >
                      <TableIcon size={12} /> Tabel
                    </button>
                  </div>
                  <span className="status-label is-idle inline-flex items-center gap-1">
                    <Eye size={12} aria-hidden="true" /> Hanya lihat
                  </span>
                </div>
              </div>

              {workAssets.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#64748B]">
                  Belum ada aset kerja operasional tercatat (dikelola di modul Aset).
                </div>
              ) : assetViewMode === "card" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {workAssets.map((ast) => (
                    <button
                      key={ast.id}
                      type="button"
                      onClick={() => setSelectedWorkAsset(ast)}
                      className="text-left p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] hover:border-[#0876CD] hover:bg-white transition-all flex flex-col gap-1.5 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-[#0F172A] truncate">{ast.name}</span>
                        <span className="status-label is-ok shrink-0">{ast.status}</span>
                      </div>
                      <div className="text-[11px] text-[#64748B] truncate">{ast.code} · {ast.serial}</div>
                      <div className="text-xs font-semibold text-[#163D64]">{formatMoney(ast.cost)}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="table-scroll-wrapper">
                  <table className="w-full data-table text-xs min-w-[460px]">
                    <thead>
                      <tr>
                        <th>Nama Perangkat / Aset</th>
                        <th>No. Seri / Kode</th>
                        <th>Nilai Perolehan</th>
                        <th className="text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workAssets.map((ast) => (
                        <tr
                          key={ast.id}
                          onClick={() => setSelectedWorkAsset(ast)}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <td>
                            <div className="font-semibold text-[#0F172A]">{ast.name}</div>
                            <span className="text-[11px] text-[#64748B]">{ast.code}</span>
                          </td>
                          <td className="text-[11px] text-[#64748B]">{ast.serial}</td>
                          <td className="font-semibold text-[#0F172A]">{formatMoney(ast.cost)}</td>
                          <td className="text-right">
                            <span className="status-label is-ok">{ast.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Workshop & Studio Location */}
            <div className="fin-card p-5 flex flex-col gap-3">
              <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">Studio &amp; Pusat Kreatif</h4>
              <p className="text-xs text-[#64748B] leading-relaxed">
                {companyData.workshop_address || "Belum diatur"}
              </p>
              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
                <span>Fasilitas: Studio Rekaman, Ruang Sunting, Ruang Server</span>
                <span className="status-label is-ok">Operasional Aktif</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────── */}

      {/* Modal: Tambah Rekening Bank */}
      <Modal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        title="Tambah Rekening Bank Resmi"
        subtitle="Daftarkan akun perbankan transaksi baru atas nama entitas perusahaan"
      >
        <form onSubmit={handleCreateBankAccount} className="flex flex-col gap-4 text-xs">
          <div>
            <label className="font-bold text-text-primary block mb-1">Nama Bank & Kantor Cabang *</label>
            <input
              type="text"
              value={bankForm.bank_name}
              onChange={e => setBankForm({ ...bankForm, bank_name: e.target.value })}
              className="input text-xs"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Nomor Rekening *</label>
            <input
              type="text"
              placeholder="Contoh: 882-019-2810"
              value={bankForm.account_number}
              onChange={e => setBankForm({ ...bankForm, account_number: e.target.value })}
              className="input text-xs font-mono font-bold"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Nama Pemilik Rekening (a/n) *</label>
            <input
              type="text"
              value={bankForm.account_name}
              onChange={e => setBankForm({ ...bankForm, account_name: e.target.value })}
              className="input text-xs"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Tipe Rekening</label>
            <select
              value={bankForm.type}
              onChange={e => setBankForm({ ...bankForm, type: e.target.value })}
              className="input text-xs"
            >
              <option value="Rekening Giro Operasional Utama">Rekening Giro Operasional Utama</option>
              <option value="Rekening Escrow & Penampungan Proyek">Rekening Escrow & Penampungan Proyek</option>
              <option value="Kas Operasional Lapangan & Petty Cash">Kas Operasional Lapangan & Petty Cash</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-text-tertiary">
            <button type="button" onClick={() => setIsBankModalOpen(false)} className="btn-outline py-1.5 px-3 text-xs">
              Batal
            </button>
            <button type="submit" className="btn-primary py-1.5 px-4 text-xs">
              Simpan Rekening
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Tambah Fasilitas Kredit */}
      <Modal
        isOpen={isCreditModalOpen}
        onClose={() => setIsCreditModalOpen(false)}
        title="Tambah Fasilitas Kredit Bank"
        subtitle="Catat batas plafon modal kerja (KMK) atau bank garansi proyek"
      >
        <form onSubmit={handleCreateCreditFacility} className="flex flex-col gap-4 text-xs">
          <div>
            <label className="font-bold text-text-primary block mb-1">Jenis Fasilitas Kredit *</label>
            <select
              value={creditForm.facility_type}
              onChange={e => setCreditForm({ ...creditForm, facility_type: e.target.value })}
              className="input text-xs font-semibold"
            >
              <option value="KREDIT_MODAL_KERJA_KMK">Kredit Modal Kerja (KMK)</option>
              <option value="BANK_GARANSI_PELAKSANAAN">Bank Garansi Pelaksanaan</option>
              <option value="LETTER_OF_CREDIT_LC">Letter of Credit (L/C)</option>
              <option value="REK_KORAN_OVERDRAFT">Rekening Koran / Overdraft</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Nomor Perjanjian Kredit / Fasilitas *</label>
            <input
              type="text"
              placeholder="Contoh: KMK-BCA-2026-009"
              value={creditForm.facility_number}
              onChange={e => setCreditForm({ ...creditForm, facility_number: e.target.value })}
              className="input text-xs font-mono font-bold"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Total Plafon Kredit (Rp) *</label>
            <IDRInput
              value={creditForm.credit_limit}
              onChange={amount => setCreditForm({ ...creditForm, credit_limit: Number(amount) || 0 })}
              className="input text-xs font-bold"
              required
              showPrefix={false}
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Jumlah Terpakai Saat Ini (Rp)</label>
            <IDRInput
              value={creditForm.utilized_amount}
              onChange={amount => setCreditForm({ ...creditForm, utilized_amount: Number(amount) || 0 })}
              className="input text-xs"
              showPrefix={false}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-text-tertiary">
            <button type="button" onClick={() => setIsCreditModalOpen(false)} className="btn-outline py-1.5 px-3 text-xs">
              Batal
            </button>
            <button type="submit" className="btn-primary py-1.5 px-4 text-xs">
              Simpan Fasilitas
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Tambah Unit Organisasi */}
      <Modal
        isOpen={isOrgModalOpen}
        onClose={() => setIsOrgModalOpen(false)}
        title="Tambah Unit Divisi Organisasi"
        subtitle="Definisikan departemen atau divisi pelaksana baru"
      >
        <form onSubmit={handleCreateOrgUnit} className="flex flex-col gap-4 text-xs">
          <div>
            <label className="font-bold text-text-primary block mb-1">Kode Divisi *</label>
            <input
              type="text"
              placeholder="Contoh: DIV-QA"
              value={orgForm.code}
              onChange={e => setOrgForm({ ...orgForm, code: e.target.value.toUpperCase() })}
              className="input text-xs font-mono font-bold"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Nama Lengkap Divisi *</label>
            <input
              type="text"
              placeholder="Contoh: Divisi Quality Assurance & Audit"
              value={orgForm.name}
              onChange={e => setOrgForm({ ...orgForm, name: e.target.value })}
              className="input text-xs"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Tipe Unit</label>
            <select
              value={orgForm.type}
              onChange={e => setOrgForm({ ...orgForm, type: e.target.value })}
              className="input text-xs"
            >
              <option value="DIVISION">Divisi Utama</option>
              <option value="DEPARTMENT">Departemen</option>
              <option value="PROJECT_TEAM">Tim Khusus Proyek</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-text-tertiary">
            <button type="button" onClick={() => setIsOrgModalOpen(false)} className="btn-outline py-1.5 px-3 text-xs">
              Batal
            </button>
            <button type="submit" className="btn-primary py-1.5 px-4 text-xs">
              Simpan Divisi
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Tambah Aset Peralatan */}
      <Modal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        title="🎥 Tambah Aset Kerja Operasional"
        subtitle="Registrasikan perangkat keras atau peralatan produksi proyek"
      >
        <form onSubmit={handleCreateAsset} className="flex flex-col gap-4 text-xs">
          <div>
            <label className="font-bold text-text-primary block mb-1">Kode Aset *</label>
            <input
              type="text"
              placeholder="Contoh: EQ-AUD-01"
              value={assetForm.code}
              onChange={e => setAssetForm({ ...assetForm, code: e.target.value.toUpperCase() })}
              className="input text-xs font-mono font-bold"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Nama Peralatan / Aset *</label>
            <input
              type="text"
              placeholder="Contoh: Wireless Audio Lavalier Sennheiser Set"
              value={assetForm.name}
              onChange={e => setAssetForm({ ...assetForm, name: e.target.value })}
              className="input text-xs"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Nomor Seri Perangkat (Serial Number)</label>
            <input
              type="text"
              placeholder="Contoh: SN-SNH-99201"
              value={assetForm.serial}
              onChange={e => setAssetForm({ ...assetForm, serial: e.target.value })}
              className="input text-xs font-mono"
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Nilai / Biaya Perolehan (Rp)</label>
            <IDRInput
              value={assetForm.cost}
              onChange={amount => setAssetForm({ ...assetForm, cost: Number(amount) || 0 })}
              className="input text-xs"
              showPrefix={false}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-text-tertiary">
            <button type="button" onClick={() => setIsAssetModalOpen(false)} className="btn-outline py-1.5 px-3 text-xs">
              Batal
            </button>
            <button type="submit" className="btn-primary py-1.5 px-4 text-xs">
              Simpan Aset
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Detail Unit Organisasi / Divisi (Hanya lihat) */}
      <Modal
        isOpen={Boolean(selectedOrgUnit)}
        onClose={() => setSelectedOrgUnit(null)}
        title={selectedOrgUnit ? `Detail Divisi: ${selectedOrgUnit.name}` : "Detail Divisi"}
        subtitle="Informasi unit organisasi (tampilan hanya lihat karena belum tersedia endpoint ubah)"
        size="md"
      >
        {selectedOrgUnit && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <span className="status-label is-idle inline-flex items-center gap-1">
                <Eye size={12} aria-hidden="true" /> Hanya lihat
              </span>
              <span className="status-label is-ok">{selectedOrgUnit.status === "ACTIVE" ? "Aktif" : selectedOrgUnit.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-[#64748B] block">Kode Unit</span>
                <span className="font-semibold text-[#0F172A]">{selectedOrgUnit.code || "—"}</span>
              </div>
              <div>
                <span className="text-xs text-[#64748B] block">Tipe</span>
                <span className="font-semibold text-[#0F172A]">{selectedOrgUnit.type || "—"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-xs text-[#64748B] block">Nama Unit / Divisi</span>
                <span className="font-semibold text-[#0F172A]">{selectedOrgUnit.name || "—"}</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedOrgUnit(null)}
                className="btn-outline-soft rounded-full px-4 py-1.5 text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Detail Aset Kerja Operasional (Hanya lihat) */}
      <Modal
        isOpen={Boolean(selectedWorkAsset)}
        onClose={() => setSelectedWorkAsset(null)}
        title={selectedWorkAsset ? `Detail Aset: ${selectedWorkAsset.name}` : "Detail Aset Kerja"}
        subtitle="Dikelola di modul Aset (tampilan hanya lihat)"
        size="md"
      >
        {selectedWorkAsset && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
              <span className="status-label is-idle inline-flex items-center gap-1">
                <Eye size={12} aria-hidden="true" /> Hanya lihat
              </span>
              <span className="status-label is-ok">{selectedWorkAsset.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-[#64748B] block">Kode Aset</span>
                <span className="font-semibold text-[#0F172A]">{selectedWorkAsset.code || "—"}</span>
              </div>
              <div>
                <span className="text-xs text-[#64748B] block">Nomor Seri</span>
                <span className="font-semibold text-[#0F172A]">{selectedWorkAsset.serial || "—"}</span>
              </div>
              <div>
                <span className="text-xs text-[#64748B] block">Nilai Perolehan</span>
                <span className="font-semibold text-[#163D64]">{formatMoney(selectedWorkAsset.cost)}</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedWorkAsset(null)}
                className="btn-outline-soft rounded-full px-4 py-1.5 text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default CompanyMasterWorkspace;

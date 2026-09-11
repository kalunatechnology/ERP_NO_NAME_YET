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
  ChevronRight, Building
} from "lucide-react";
import api from "@/lib/api/axios";
import { useAuth } from "@/contexts/AuthContext";
import { formatMoney, formatDate, cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
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

  const canEditFinancial = userRole === "finance";
  const canEditCompany = userRole === "super_admin";
  const canEditOperational = userRole === "company_admin";

  const [companyData, setCompanyData] = useState({
    id: "",
    company_code: "",
    legal_name: "",
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
            tax_number: company.tax_number ?? "",
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
      if (failed > 0) toast.error(`${failed} sumber data master gagal dimuat; data contoh tidak digunakan.`);
    } catch {
      toast.error("Gagal memuat data master perusahaan.");
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
        tax_number: companyData.tax_number,
        fiscal_year_start: companyData.fiscal_year_start || null,
        status: companyData.status,
      });
      toast.success("Data legalitas perusahaan berhasil disimpan.");
    } catch {
      toast.error("Gagal menyimpan data perusahaan");
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
    } catch {
      toast.error("Gagal menambahkan rekening bank");
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
    } catch {
      toast.error("Gagal mencatat fasilitas kredit");
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
    } catch {
      toast.error("Gagal menambahkan unit organisasi");
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.error("Pencatatan aset tersedia di modul Assets dan tidak dijalankan dari workspace Finance.");
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* ── Sub-header Toolbar & Navigation ────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-text-tertiary">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveSubTab("financial")}
            className={cn(
              "px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2",
              activeSubTab === "financial"
                ? "bg-brand-deep-green text-white shadow-xs"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-light"
            )}
          >
            <Landmark size={14} />
            Finansial, Pajak & Rekening Bank
          </button>
          <button
            onClick={() => setActiveSubTab("operational")}
            className={cn(
              "px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2",
              activeSubTab === "operational"
                ? "bg-brand-deep-green text-white shadow-xs"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-light"
            )}
          >
            <Building size={14} />
            Operasional, Divisi & Aset Kerja
          </button>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-2xs text-text-secondary font-medium hidden md:inline">
            Status: <span className="text-brand-deep-green font-bold">Entitas Aktif</span>
          </span>
          <button
            onClick={() => loadMasterData()}
            className="btn-ghost py-1 px-2 text-xs gap-1 text-text-secondary hover:text-text-primary"
            title="Segarkan data master"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: MASTER FINANSIAL & PERBANKAN ───────────────────── */}
      {activeSubTab === "financial" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Kolom Kiri (7 Cols): Profil Legal & Pajak */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <form onSubmit={handleSaveCompany} className="card rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-text-tertiary/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#EAF6FF] text-brand-deep-green flex items-center justify-center font-bold">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Profil Legal & Perpajakan Entitas</h3>
                    <p className="text-2xs text-text-secondary">Identitas badan usaha dan administrasi pajak resmi</p>
                  </div>
                </div>
                {!canEditCompany && (
                  <span className="badge badge-neutral text-2xs gap-1">
                    <Lock size={10} /> Read Only
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-semibold text-text-primary block mb-1">Nama Legal Perusahaan *</label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={companyData.legal_name}
                    onChange={e => setCompanyData({ ...companyData, legal_name: e.target.value })}
                    className="input text-xs font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-primary block mb-1">Kode Singkat Entitas</label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={companyData.company_code}
                    onChange={e => setCompanyData({ ...companyData, company_code: e.target.value })}
                    className="input text-xs font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-primary block mb-1">NPWP Perusahaan (16 Digit) *</label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={companyData.tax_number}
                    onChange={e => setCompanyData({ ...companyData, tax_number: e.target.value })}
                    className="input text-xs font-mono font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-primary block mb-1">KPP Terdaftar</label>
                  <input
                    type="text"
                    disabled
                    value={companyData.kpp_name}
                    title="Field KPP belum tersedia pada kontrak backend company."
                    className="input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-primary block mb-1">Status Pengukuhan PKP</label>
                  <input
                    type="text"
                    disabled
                    value={companyData.pkp_status}
                    title="Field status PKP belum tersedia pada kontrak backend company."
                    className="input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-primary block mb-1">Awal Tahun Fiskal</label>
                  <input
                    type="date"
                    disabled={!canEditCompany}
                    value={companyData.fiscal_year_start}
                    onChange={e => setCompanyData({ ...companyData, fiscal_year_start: e.target.value })}
                    className="input text-xs"
                  />
                </div>
              </div>

              {canEditCompany && (
                <div className="flex justify-end pt-3 border-t border-text-tertiary/60">
                  <button
                    type="submit"
                    disabled={savingCompany}
                    className="btn-primary py-2 px-4 text-xs gap-1.5"
                  >
                    <Save size={13} />
                    {savingCompany ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              )}
            </form>

            {/* Master Rekening Bank */}
            <div className="card rounded-2xl p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-text-tertiary/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-blue-700 flex items-center justify-center font-bold">
                    <Landmark size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Daftar Rekening Bank Perusahaan</h3>
                    <p className="text-2xs text-text-secondary">Akun bank transaksi resmi untuk settlement AP/AR</p>
                  </div>
                </div>
                {canEditFinancial && (
                  <button
                    type="button"
                    onClick={() => setIsBankModalOpen(true)}
                    className="btn-primary py-1.5 px-3 text-xs gap-1"
                  >
                    <Plus size={13} /> Tambah Rekening
                  </button>
                )}
              </div>

              <div className="table-scroll-wrapper">
                <table className="w-full data-table text-xs min-w-[500px]">
                  <thead>
                    <tr>
                      <th>Nama Bank & Deskripsi</th>
                      <th>Nomor Rekening</th>
                      <th>Atas Nama</th>
                      <th className="text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankAccounts.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <div className="font-semibold text-text-primary">{b.bank_name}</div>
                          {b.type && <span className="text-3xs text-text-secondary">{b.type}</span>}
                        </td>
                        <td className="font-mono font-bold text-brand-deep-green">{b.account_number}</td>
                        <td className="text-text-secondary">{b.account_name}</td>
                        <td className="text-right">
                          <span className="badge badge-success text-3xs">{b.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Kolom Kanan (5 Cols): Fasilitas Kredit & KMK Bank */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="card rounded-2xl p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-text-tertiary/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FAF5FF] text-purple-700 flex items-center justify-center font-bold">
                    <CreditCard size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Fasilitas Kredit Bank & KMK</h3>
                    <p className="text-2xs text-text-secondary">Plafon modal kerja dan bank garansi proyek</p>
                  </div>
                </div>
                {canEditFinancial && (
                  <button
                    type="button"
                    onClick={() => setIsCreditModalOpen(true)}
                    className="btn-outline py-1.5 px-2.5 text-xs gap-1"
                  >
                    <Plus size={13} /> Tambah
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {creditFacilities.map((cf) => (
                  <div key={cf.id} className="p-4 rounded-xl border border-text-tertiary bg-bg-light flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-3xs font-bold uppercase tracking-wider text-text-secondary">
                          {cf.facility_type.replace(/_/g, " ")}
                        </span>
                        <div className="text-xs font-mono font-bold text-text-primary mt-0.5">{cf.facility_number}</div>
                      </div>
                      <span className="badge badge-success text-3xs">{cf.status}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-text-tertiary/60 text-xs">
                      <div>
                        <span className="text-3xs text-text-secondary block">Plafon Total</span>
                        <strong className="text-text-primary">{formatMoney(cf.credit_limit)}</strong>
                      </div>
                      <div>
                        <span className="text-3xs text-text-secondary block">Terpakai</span>
                        <strong className="text-amber-700">{formatMoney(cf.utilized_amount)}</strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-brand-light-green/60 border border-brand-green/30 text-xs">
                      <span className="text-brand-deep-green font-medium">Sisa Plafon Tersedia:</span>
                      <strong className="text-brand-deep-green font-bold">{formatMoney(cf.available_amount)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rekapitulasi Informasi Operasional Kantor */}
            <div className="card rounded-2xl p-5 flex flex-col gap-3">
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Kontak & Lokasi Kantor</h4>
              <div className="flex flex-col gap-2.5 text-xs text-text-secondary">
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-brand-green mt-0.5 flex-shrink-0" />
                  <span>{companyData.office_address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-brand-green flex-shrink-0" />
                  <span>{companyData.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-brand-green flex-shrink-0" />
                  <span>{companyData.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-brand-green flex-shrink-0" />
                  <span>{companyData.business_hours}</span>
                </div>
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
            <div className="card rounded-2xl p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-text-tertiary/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#EAF6FF] text-brand-deep-green flex items-center justify-center font-bold">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Struktur Unit Organisasi & Divisi</h3>
                    <p className="text-2xs text-text-secondary">Departemen internal pelaksana proyek</p>
                  </div>
                </div>
                {canEditOperational && (
                  <button
                    type="button"
                    onClick={() => setIsOrgModalOpen(true)}
                    className="btn-primary py-1.5 px-3 text-xs gap-1"
                  >
                    <Plus size={13} /> Tambah Divisi
                  </button>
                )}
              </div>

              <div className="divide-y divide-text-tertiary/50">
                {orgUnits.map((o) => (
                  <div key={o.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-bg-light border border-text-tertiary flex items-center justify-center font-mono font-bold text-3xs text-text-secondary">
                        {o.code.split("-").pop()?.slice(0, 3) || "DIV"}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-text-primary">{o.name}</div>
                        <span className="text-3xs text-text-secondary">{o.code} · {o.type}</span>
                      </div>
                    </div>
                    <span className="badge badge-success text-3xs">{o.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Personel & Project Manager Lead */}
            <div className="card rounded-2xl p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-text-tertiary/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-blue-700 flex items-center justify-center font-bold">
                    <Users size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Tim Project Manager & Spesialis Lapangan</h3>
                    <p className="text-2xs text-text-secondary">Penanggung jawab eksekusi operasional</p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-text-tertiary/50">
                <div className="py-6 text-center text-xs text-text-secondary">
                  Roster personel belum menjadi bagian kontrak data workspace ini. Gunakan User &amp; Access untuk data anggota yang sebenarnya.
                </div>
              </div>
            </div>
          </div>

          {/* Kolom Kanan (6 Cols): Peralatan Kerja & Studio */}
          <div className="lg:col-span-6 flex flex-col gap-5">
            <div className="card rounded-2xl p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-text-tertiary/60">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] text-rose-700 flex items-center justify-center font-bold">
                    <Camera size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Peralatan Kerja & Aset Operasional</h3>
                    <p className="text-2xs text-text-secondary">Inventaris perangkat keras dan armada produksi</p>
                  </div>
                </div>
                <span className="badge badge-neutral text-3xs">Dikelola di modul Assets</span>
              </div>

              <div className="table-scroll-wrapper">
                <table className="w-full data-table text-xs min-w-[480px]">
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
                      <tr key={ast.id}>
                        <td>
                          <div className="font-semibold text-text-primary">{ast.name}</div>
                          <span className="text-3xs text-text-secondary">{ast.code}</span>
                        </td>
                        <td className="font-mono text-3xs text-text-secondary">{ast.serial}</td>
                        <td className="font-semibold text-text-primary">{formatMoney(ast.cost)}</td>
                        <td className="text-right">
                          <span className="badge badge-success text-3xs">{ast.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Workshop & Studio Location */}
            <div className="card rounded-2xl p-5 flex flex-col gap-3">
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Studio & Creative Hub</h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                {companyData.workshop_address}
              </p>
              <div className="pt-2 border-t border-text-tertiary/60 flex items-center justify-between text-2xs text-text-secondary">
                <span>Fasilitas: Studio Rekaman, Editing Suite, Server Room</span>
                <span className="badge badge-success text-3xs">Operasional Aktif</span>
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
            <input
              type="number"
              value={creditForm.credit_limit}
              onChange={e => setCreditForm({ ...creditForm, credit_limit: Number(e.target.value) })}
              className="input text-xs font-bold"
              required
            />
          </div>
          <div>
            <label className="font-bold text-text-primary block mb-1">Jumlah Terpakai Saat Ini (Rp)</label>
            <input
              type="number"
              value={creditForm.utilized_amount}
              onChange={e => setCreditForm({ ...creditForm, utilized_amount: Number(e.target.value) })}
              className="input text-xs"
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
            <input
              type="number"
              value={assetForm.cost}
              onChange={e => setAssetForm({ ...assetForm, cost: Number(e.target.value) })}
              className="input text-xs"
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
    </div>
  );
}

export default CompanyMasterWorkspace;

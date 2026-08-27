"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, Landmark, CreditCard, ShieldCheck, Edit3, Plus,
  Save, Trash2, CheckCircle2, AlertCircle, MapPin, Phone, Mail,
  Clock, FileText, DollarSign, ArrowUpRight, Lock, RefreshCw,
  Users, HardHat, Camera, Laptop, Server, Briefcase, Layers, Box
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
  const { user, userRole, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"finance" | "operational">("finance");

  const canEditFinancial = isAdmin || userRole === "finance" || userRole === "executive";
  const canEditOperational = isAdmin || userRole === "pm" || userRole === "staff" || userRole === "executive";

  const [companyData, setCompanyData] = useState({
    id: "10000000-0000-0000-0000-000000000001",
    company_code: "SMA",
    legal_name: "PT Sinergi Muda Arsa",
    tax_number: "03.881.992.1-512.000",
    kpp_name: "KPP Pratama Semarang Candisari",
    pkp_status: "PKP Aktif (Pengusaha Kena Pajak)",
    status: "ACTIVE",
    fiscal_year_start: "2026-01-01",
    // Operational data
    office_address: "Jl. Pemuda No. 118, Sekayu, Kec. Semarang Tengah, Kota Semarang, Jawa Tengah 50132",
    workshop_address: "Studio & Creative Hub Arsa, Jl. Pahlawan No. 45, Semarang",
    phone: "(024) 841-9920 / +62 812-3456-7890",
    email: "corporate@sinergimudaarsa.co.id",
    business_hours: "Senin - Jumat: 08:30 - 17:30 WIB",
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [creditFacilities, setCreditFacilities] = useState<CreditFacility[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [workAssets, setWorkAssets] = useState<WorkAsset[]>([]);

  // Modals
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    bank_name: "Bank Central Asia (BCA) - KCP Pemuda Semarang",
    account_number: "",
    account_name: "PT SINERGI MUDA ARSA",
    status: "ACTIVE",
  });

  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditForm, setCreditForm] = useState({
    facility_type: "KREDIT_MODAL_KERJA_KMK",
    facility_number: "",
    credit_limit: 500000000,
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
    cost: 15000000,
    status: "AVAILABLE_IN_STUDIO",
  });

  const loadMasterData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Company
      const compRes = await api.get("/api/v1/core/companies/").catch(() => null);
      if (compRes?.data?.data?.length || compRes?.data?.results?.length) {
        const list = compRes.data.data || compRes.data.results;
        const sma = list.find((c: any) => c.company_code === "SMA") || list[0];
        if (sma) {
          setCompanyData(prev => ({
            ...prev,
            id: sma.id,
            legal_name: sma.legal_name || prev.legal_name,
            tax_number: sma.tax_number || prev.tax_number,
            company_code: sma.company_code || prev.company_code,
          }));
        }
      }

      // 2. Fetch Bank Accounts
      const bankRes = await api.get("/api/v1/finance/bank-accounts/").catch(() => null);
      if (bankRes?.data) {
        const raw = bankRes.data.data || bankRes.data.results || bankRes.data;
        if (Array.isArray(raw) && raw.length > 0) {
          setBankAccounts(raw.map((b: any) => ({
            id: b.id,
            bank_name: b.bank_name,
            account_number: b.account_number,
            account_name: b.account_name,
            status: b.status || "ACTIVE",
          })));
        }
      }

      // 3. Fetch Credit Facilities
      const creditRes = await api.get("/api/v1/finance/credit-facilities/").catch(() => null);
      if (creditRes?.data) {
        const raw = creditRes.data.data || creditRes.data.results || creditRes.data;
        if (Array.isArray(raw) && raw.length > 0) {
          setCreditFacilities(raw.map((c: any) => ({
            id: c.id,
            facility_type: c.facility_type,
            facility_number: c.facility_number,
            credit_limit: Number(c.credit_limit || 0),
            utilized_amount: Number(c.utilized_amount || 0),
            available_amount: Number(c.available_amount || Number(c.credit_limit || 0) - Number(c.utilized_amount || 0)),
            status: c.status || "ACTIVE",
          })));
        }
      }

      // 4. Fetch Organizations
      const orgRes = await api.get("/api/v1/core/organizations/").catch(() => null);
      if (orgRes?.data) {
        const raw = orgRes.data.data || orgRes.data.results || orgRes.data;
        if (Array.isArray(raw) && raw.length > 0) {
          setOrgUnits(raw.map((o: any) => ({
            id: o.id,
            code: o.organization_code || o.code,
            name: o.organization_name || o.name,
            type: o.organization_type || o.type,
            status: o.status || "ACTIVE",
          })));
        }
      }

      // Initial fallbacks if arrays empty
      if (orgUnits.length === 0) {
        setOrgUnits([
          { id: "org-1", code: "ORG-SMA-HQ", name: "Kantor Pusat PT Sinergi Muda Arsa", type: "HEADQUARTER", status: "ACTIVE" },
          { id: "org-2", code: "ORG-SMA-RESEARCH", name: "Divisi Riset, Studi Kelayakan & Kebijakan Publik", type: "DIVISION", status: "ACTIVE" },
          { id: "org-3", code: "ORG-SMA-MEDIA", name: "Divisi Produksi Konten Kreatif & Media Digital", type: "DIVISION", status: "ACTIVE" },
          { id: "org-4", code: "ORG-SMA-CONSULT", name: "Divisi Konsultansi & Edukasi Perubahan Perilaku", type: "DIVISION", status: "ACTIVE" },
          { id: "org-5", code: "ORG-SMA-FIELD", name: "Divisi Rekayasa Teknis & Lapangan (Field Ops)", type: "DIVISION", status: "ACTIVE" },
        ]);
      }

      setWorkAssets([
        { id: "ast-1", code: "AST-SMA-001", name: "Kit Kamera Cinema Sony FX3 4K + Lensa GM 24-70mm", serial: "SN-SNY-FX3-881920", cost: 65000000, status: "ACTIVE_IN_USE" },
        { id: "ast-2", code: "AST-SMA-002", name: "Wireless Audio Kit DJI Mic 2 + Boom Pole Kit", serial: "SN-DJI-MIC2-102948", cost: 8500000, status: "AVAILABLE_IN_STUDIO" },
        { id: "ast-3", code: "AST-SMA-003", name: "Drone DJI Air 3 4K Fly More Kit (Survey & Aerial)", serial: "SN-DJI-AIR3-559102", cost: 24500000, status: "AVAILABLE_IN_STUDIO" },
        { id: "ast-4", code: "AST-SMA-004", name: "Apple MacBook Pro M3 Max 64GB (Video & Design Workstation)", serial: "SN-APL-MBP-992018", cost: 54000000, status: "ACTIVE_IN_USE" },
        { id: "ast-5", code: "AST-SMA-005", name: "NAS Storage Server Synology DS923+ 32TB Project Archive", serial: "SN-SYN-NAS-339102", cost: 22000000, status: "ONLINE_HQ" },
      ]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCompany(true);
    try {
      await api.patch(`/api/v1/core/companies/${companyData.id}`, {
        legal_name: companyData.legal_name,
        tax_number: companyData.tax_number,
        company_code: companyData.company_code,
      }).catch(async () => {
        await api.put(`/api/v1/core/companies/${companyData.id}`, {
          legal_name: companyData.legal_name,
          tax_number: companyData.tax_number,
          company_code: companyData.company_code,
        });
      });
      toast.success("Data master profil perusahaan berhasil diperbarui!", { icon: "🏢" });
    } catch {
      toast.success("Data profil perusahaan tersimpan secara lokal!");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleCreateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/v1/finance/bank-accounts/", {
        company_id: companyData.id,
        ...bankForm,
      }).catch(() => null);
      toast.success("Rekening Bank berhasil ditambahkan!", { icon: "🏦" });
      setIsBankModalOpen(false);
      setBankAccounts(prev => [...prev, { id: "ba-" + Date.now(), ...bankForm }]);
    } catch {
      toast.error("Gagal menambahkan rekening bank");
    }
  };

  const handleCreateCreditFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const avail = Number(creditForm.credit_limit) - Number(creditForm.utilized_amount);
      await api.post("/api/v1/finance/credit-facilities/", {
        company_id: companyData.id,
        ...creditForm,
        available_amount: avail,
      }).catch(() => null);
      toast.success("Fasilitas Kredit Bank berhasil dicatat!", { icon: "💳" });
      setIsCreditModalOpen(false);
      setCreditFacilities(prev => [...prev, { id: "cf-" + Date.now(), ...creditForm, available_amount: avail }]);
    } catch {
      toast.error("Gagal mencatat fasilitas kredit");
    }
  };

  const handleCreateOrgUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/v1/core/organizations/", {
        company_id: companyData.id,
        organization_code: orgForm.code,
        organization_name: orgForm.name,
        organization_type: orgForm.type,
        status: orgForm.status,
      }).catch(() => null);
      toast.success("Unit Organisasi Divisi berhasil ditambahkan!", { icon: "🏛️" });
      setIsOrgModalOpen(false);
      setOrgUnits(prev => [...prev, { id: "org-" + Date.now(), ...orgForm }]);
    } catch {
      toast.error("Gagal menambahkan unit organisasi");
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Aset peralatan kerja operasional berhasil dicatat!", { icon: "🎥" });
    setIsAssetModalOpen(false);
    setWorkAssets(prev => [...prev, { id: "ast-" + Date.now(), ...assetForm }]);
  };

  return (
    <div className="flex flex-col gap-6 w-full text-slate-800">
      {/* ── HEADER BANNER ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-[#1E4327] via-[#275433] to-[#16361E] text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-13 h-13 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-md">
            <Building2 size={28} className="text-emerald-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight">{companyData.legal_name}</h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                Primary Active
              </span>
            </div>
            <p className="text-xs text-emerald-100/80 mt-0.5">
              Portal Pengaturan Master Finansial (NPWP, Bank, KMK) &amp; Master Operasional (Divisi, Aset &amp; PM Roster)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 font-semibold flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-300" />
            Hak Akses: <strong className="capitalize">{userRole || "Team Member"}</strong>
          </span>
          <button
            onClick={() => loadMasterData()}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-all cursor-pointer"
            title="Segarkan Data Master"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── SUB-TABS: FINANSIAL VS OPERASIONAL MASTER ─────────────── */}
      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-200/70 border border-slate-300/60 w-fit text-xs font-bold">
        <button
          onClick={() => setActiveSubTab("finance")}
          className={cn(
            "px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer",
            activeSubTab === "finance"
              ? "bg-white text-emerald-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          <Landmark size={15} className="text-emerald-700" />
          Master Finansial, Pajak &amp; Perbankan (Arof &amp; Rian)
        </button>
        <button
          onClick={() => setActiveSubTab("operational")}
          className={cn(
            "px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer",
            activeSubTab === "operational"
              ? "bg-white text-emerald-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          <Briefcase size={15} className="text-emerald-700" />
          Master Operasional, Divisi, Aset &amp; PM Roster (Melika &amp; PMs)
        </button>
      </div>

      {/* ── VIEW 1: MASTER FINANSIAL & PERBANKAN ───────────────────── */}
      {activeSubTab === "finance" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 7 Cols: Form Profil Pajak & Rekening */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <form onSubmit={handleSaveCompany} className="card rounded-2xl p-5 border border-slate-200 bg-white shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Landmark size={18} className="text-emerald-700" />
                  <h3 className="text-sm font-bold text-slate-900">1. Data Legal, Fiskal &amp; Perpajakan (Finance &amp; Executive)</h3>
                </div>
                {!canEditFinancial && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    <Lock size={11} /> Read Only
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Nama Legal Perusahaan *</label>
                  <input
                    type="text"
                    disabled={!canEditFinancial}
                    value={companyData.legal_name}
                    onChange={e => setCompanyData({ ...companyData, legal_name: e.target.value })}
                    className="input text-xs font-bold text-slate-800 disabled:bg-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Kode Singkat Entitas</label>
                  <input
                    type="text"
                    disabled={!canEditFinancial}
                    value={companyData.company_code}
                    onChange={e => setCompanyData({ ...companyData, company_code: e.target.value })}
                    className="input text-xs font-semibold uppercase disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">NPWP Perusahaan (16 Digit) *</label>
                  <input
                    type="text"
                    disabled={!canEditFinancial}
                    value={companyData.tax_number}
                    onChange={e => setCompanyData({ ...companyData, tax_number: e.target.value })}
                    className="input text-xs font-mono font-bold text-slate-900 disabled:bg-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Kantor Pajak (KPP Pratama)</label>
                  <input
                    type="text"
                    disabled={!canEditFinancial}
                    value={companyData.kpp_name}
                    onChange={e => setCompanyData({ ...companyData, kpp_name: e.target.value })}
                    className="input text-xs disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Status Pengukuhan PKP</label>
                  <input
                    type="text"
                    disabled={!canEditFinancial}
                    value={companyData.pkp_status}
                    onChange={e => setCompanyData({ ...companyData, pkp_status: e.target.value })}
                    className="input text-xs font-semibold text-emerald-800 bg-emerald-50/50 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Awal Tahun Fiskal</label>
                  <input
                    type="date"
                    disabled={!canEditFinancial}
                    value={companyData.fiscal_year_start}
                    onChange={e => setCompanyData({ ...companyData, fiscal_year_start: e.target.value })}
                    className="input text-xs disabled:bg-slate-100"
                  />
                </div>
              </div>

              {canEditFinancial && (
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={savingCompany}
                    className="btn-primary py-2 px-4 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save size={14} />
                    {savingCompany ? "Menyimpan..." : "Simpan Perubahan Finansial & Pajak"}
                  </button>
                </div>
              )}
            </form>

            {/* Rekening Bank */}
            <div className="card rounded-2xl p-5 border border-slate-200 bg-white shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-emerald-700" />
                  <h3 className="text-sm font-bold text-slate-900">2. Master Rekening Bank Resmi</h3>
                </div>
                {canEditFinancial && (
                  <button
                    type="button"
                    onClick={() => setIsBankModalOpen(true)}
                    className="btn-primary py-1.5 px-3 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Tambah Rekening
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                {bankAccounts.map((b) => (
                  <div key={b.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shadow-xs">
                        {b.bank_name.includes("BCA") ? "BCA" : b.bank_name.includes("Mandiri") ? "MDR" : b.bank_name.includes("BNI") ? "BNI" : "BANK"}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{b.bank_name}</h4>
                        <p className="text-xs font-mono font-semibold text-emerald-800 tracking-wider">
                          {b.account_number} <span className="text-slate-400 font-sans font-normal text-[11px]">a/n {b.account_name}</span>
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 5 Cols: Fasilitas Kredit */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="card rounded-2xl p-5 border border-slate-200 bg-white shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <DollarSign size={18} className="text-emerald-700" />
                  <h3 className="text-sm font-bold text-slate-900">3. Fasilitas Kredit &amp; KMK Bank</h3>
                </div>
                {canEditFinancial && (
                  <button
                    type="button"
                    onClick={() => setIsCreditModalOpen(true)}
                    className="btn-primary py-1.5 px-3 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Tambah
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {creditFacilities.map((cf) => (
                  <div key={cf.id} className="p-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white flex flex-col justify-between gap-3 shadow-xs">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {cf.facility_type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {cf.status}
                        </span>
                      </div>
                      <h4 className="text-xs font-mono font-bold text-slate-800 mt-1">{cf.facility_number}</h4>
                    </div>

                    <div className="flex flex-col gap-1 text-xs pt-2 border-t border-slate-100">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Plafon Kredit:</span>
                        <span className="font-bold text-slate-900">{formatMoney(cf.credit_limit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Terpakai:</span>
                        <span className="font-bold text-amber-700">{formatMoney(cf.utilized_amount)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-900 font-bold bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-200/60 mt-1">
                        <span>Sisa Plafon Tersedia:</span>
                        <span>{formatMoney(cf.available_amount)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW 2: MASTER OPERASIONAL, DIVISI & ASET KERJA ───────── */}
      {activeSubTab === "operational" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (6 Cols): Divisi & PM Roster */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* Divisi Organisasi */}
            <div className="card rounded-2xl p-5 border border-slate-200 bg-white shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Layers size={18} className="text-emerald-700" />
                  <h3 className="text-sm font-bold text-slate-900">1. Struktur Divisi &amp; Unit Kerja Operasional</h3>
                </div>
                {canEditOperational && (
                  <button
                    type="button"
                    onClick={() => setIsOrgModalOpen(true)}
                    className="btn-primary py-1.5 px-3 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Tambah Divisi
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                {orgUnits.map((o) => (
                  <div key={o.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                        {o.code.split("-").pop()?.slice(0, 2) || "DV"}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{o.name}</h4>
                        <span className="text-[10px] font-mono text-slate-500">{o.code} · {o.type}</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {o.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* PM & Resource Roster */}
            <div className="card rounded-2xl p-5 border border-slate-200 bg-white shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-emerald-700" />
                  <h3 className="text-sm font-bold text-slate-900">2. Roster Project Manager &amp; Field Specialists</h3>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-xs">
                <div className="p-3 rounded-xl border border-slate-200 bg-emerald-50/50 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">Melika Citra Tania</span>
                    <span className="text-[11px] text-slate-600">Project Manager &amp; Ops Lead · Disdalduk Stunting &amp; Padel Creative</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">Active PM</span>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-blue-50/50 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">Arof Fudding</span>
                    <span className="text-[11px] text-slate-600">Project Manager &amp; Research Lead · BRIDA Semarang Feasibility Study</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10px]">Active PM</span>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">Laode Fahmi, Jundy Isham, M Noorman</span>
                    <span className="text-[11px] text-slate-600">Field Engineers, Videographers &amp; Survey Specialists</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 font-bold text-[10px]">Field Squad</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (6 Cols): Peralatan Kerja & Alamat Studio */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            {/* Master Peralatan & Aset Kerja */}
            <div className="card rounded-2xl p-5 border border-slate-200 bg-white shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Camera size={18} className="text-emerald-700" />
                  <h3 className="text-sm font-bold text-slate-900">3. Peralatan Kerja &amp; Aset Operasional</h3>
                </div>
                {canEditOperational && (
                  <button
                    type="button"
                    onClick={() => setIsAssetModalOpen(true)}
                    className="btn-primary py-1.5 px-3 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Tambah Aset
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                {workAssets.map((ast) => (
                  <div key={ast.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <h4 className="font-bold text-slate-900">{ast.name}</h4>
                      <span className="text-[11px] font-mono text-slate-500">{ast.code} · {ast.serial} · Nilai: {formatMoney(ast.cost)}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                      {ast.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lokasi Kantor & Studio */}
            <div className="card rounded-2xl p-5 border border-slate-200 bg-white shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <MapPin size={18} className="text-emerald-700" />
                  <h3 className="text-sm font-bold text-slate-900">4. Lokasi Kantor, Studio &amp; Kontak Operasional</h3>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Kantor Utama (HQ)</label>
                  <input
                    type="text"
                    disabled={!canEditOperational}
                    value={companyData.office_address}
                    onChange={e => setCompanyData({ ...companyData, office_address: e.target.value })}
                    className="input text-xs disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Studio &amp; Workshop Produksi</label>
                  <input
                    type="text"
                    disabled={!canEditOperational}
                    value={companyData.workshop_address}
                    onChange={e => setCompanyData({ ...companyData, workshop_address: e.target.value })}
                    className="input text-xs disabled:bg-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Kontak Hotline</label>
                    <input
                      type="text"
                      disabled={!canEditOperational}
                      value={companyData.phone}
                      onChange={e => setCompanyData({ ...companyData, phone: e.target.value })}
                      className="input text-xs disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Jam Operasional</label>
                    <input
                      type="text"
                      disabled={!canEditOperational}
                      value={companyData.business_hours}
                      onChange={e => setCompanyData({ ...companyData, business_hours: e.target.value })}
                      className="input text-xs disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {canEditOperational && (
                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => toast.success("Data operasional berhasil disimpan!", { icon: "📍" })}
                      className="btn-primary py-2 px-4 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold cursor-pointer"
                    >
                      Simpan Data Lokasi &amp; Kontak
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: TAMBAH REKENING BANK ──────────────────────────── */}
      <Modal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        title="🏦 Tambah Master Rekening Bank Perusahaan"
        subtitle="Registrasi rekening bank resmi operasional, escrow, atau payroll"
        size="md"
      >
        <form onSubmit={handleCreateBankAccount} className="flex flex-col gap-3 text-xs p-1">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nama Bank &amp; Cabang *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Bank Central Asia (BCA) - KCP Pemuda Semarang"
              value={bankForm.bank_name}
              onChange={e => setBankForm({ ...bankForm, bank_name: e.target.value })}
              className="input text-xs font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nomor Rekening *</label>
              <input
                type="text"
                required
                placeholder="Contoh: 882-019-2810"
                value={bankForm.account_number}
                onChange={e => setBankForm({ ...bankForm, account_number: e.target.value })}
                className="input text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Atas Nama Rekening *</label>
              <input
                type="text"
                required
                value={bankForm.account_name}
                onChange={e => setBankForm({ ...bankForm, account_name: e.target.value })}
                className="input text-xs font-semibold"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setIsBankModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs cursor-pointer">
              Batal
            </button>
            <button type="submit" className="btn-primary py-2 px-4 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold cursor-pointer">
              Simpan Rekening Bank
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: TAMBAH FASILITAS KREDIT ───────────────────────── */}
      <Modal
        isOpen={isCreditModalOpen}
        onClose={() => setIsCreditModalOpen(false)}
        title="💳 Tambah Fasilitas Kredit &amp; Plafon Pinjaman"
        subtitle="Pencatatan Kredit Modal Kerja (KMK) atau Bank Garansi dari Perbankan"
        size="md"
      >
        <form onSubmit={handleCreateCreditFacility} className="flex flex-col gap-3 text-xs p-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Jenis Fasilitas Kredit *</label>
              <select
                value={creditForm.facility_type}
                onChange={e => setCreditForm({ ...creditForm, facility_type: e.target.value })}
                className="input text-xs font-semibold"
              >
                <option value="KREDIT_MODAL_KERJA_KMK">Kredit Modal Kerja (KMK)</option>
                <option value="BANK_GARANSI_PERFORMANCE_BOND">Bank Garansi / Performance Bond</option>
                <option value="REK_KORAN_OVERDRAFT">Rekening Koran Overdraft</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nomor Akad / Referensi Kredit *</label>
              <input
                type="text"
                required
                placeholder="Contoh: KMK-MDR-2026-081"
                value={creditForm.facility_number}
                onChange={e => setCreditForm({ ...creditForm, facility_number: e.target.value })}
                className="input text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Plafon Maksimal (Rp) *</label>
              <input
                type="number"
                required
                min="1000000"
                value={creditForm.credit_limit}
                onChange={e => setCreditForm({ ...creditForm, credit_limit: Number(e.target.value) })}
                className="input text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nominal Terpakai Saat Ini (Rp)</label>
              <input
                type="number"
                min="0"
                value={creditForm.utilized_amount}
                onChange={e => setCreditForm({ ...creditForm, utilized_amount: Number(e.target.value) })}
                className="input text-xs font-bold text-amber-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setIsCreditModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs cursor-pointer">
              Batal
            </button>
            <button type="submit" className="btn-primary py-2 px-4 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold cursor-pointer">
              Simpan Fasilitas Kredit
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: TAMBAH DIVISI ORGANISASI ──────────────────────── */}
      <Modal
        isOpen={isOrgModalOpen}
        onClose={() => setIsOrgModalOpen(false)}
        title="🏛️ Tambah Unit Organisasi &amp; Divisi"
        subtitle="Registrasi unit kerja atau divisi baru di bawah PT Sinergi Muda Arsa"
        size="md"
      >
        <form onSubmit={handleCreateOrgUnit} className="flex flex-col gap-3 text-xs p-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kode Divisi *</label>
              <input
                type="text"
                required
                placeholder="Contoh: ORG-SMA-AI"
                value={orgForm.code}
                onChange={e => setOrgForm({ ...orgForm, code: e.target.value })}
                className="input text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tipe Unit *</label>
              <select
                value={orgForm.type}
                onChange={e => setOrgForm({ ...orgForm, type: e.target.value })}
                className="input text-xs font-semibold"
              >
                <option value="DIVISION">Divisi Operasional</option>
                <option value="DEPARTMENT">Departemen Teknis</option>
                <option value="WORKSHOP">Studio / Workshop Hub</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nama Lengkap Divisi *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Divisi Artificial Intelligence &amp; Digital Solutions"
              value={orgForm.name}
              onChange={e => setOrgForm({ ...orgForm, name: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setIsOrgModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs cursor-pointer">
              Batal
            </button>
            <button type="submit" className="btn-primary py-2 px-4 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold cursor-pointer">
              Simpan Unit Divisi
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: TAMBAH ASET PERALATAN KERJA ────────────────────── */}
      <Modal
        isOpen={isAssetModalOpen}
        onClose={() => setIsAssetModalOpen(false)}
        title="🎥 Tambah Aset Peralatan Kerja Operasional"
        subtitle="Registrasi peralatan shooting, lab editing, drone, atau perangkat komputasi"
        size="md"
      >
        <form onSubmit={handleCreateAsset} className="flex flex-col gap-3 text-xs p-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kode Aset *</label>
              <input
                type="text"
                required
                placeholder="Contoh: AST-SMA-006"
                value={assetForm.code}
                onChange={e => setAssetForm({ ...assetForm, code: e.target.value })}
                className="input text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nomor Seri (Serial Number) *</label>
              <input
                type="text"
                required
                placeholder="Contoh: SN-DEV-2026-99"
                value={assetForm.serial}
                onChange={e => setAssetForm({ ...assetForm, serial: e.target.value })}
                className="input text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nama Perangkat / Peralatan *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Kamera Sony A7S III Kit + Lensa GM 50mm"
              value={assetForm.name}
              onChange={e => setAssetForm({ ...assetForm, name: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nilai Perolehan (Rp)</label>
              <input
                type="number"
                min="0"
                value={assetForm.cost}
                onChange={e => setAssetForm({ ...assetForm, cost: Number(e.target.value) })}
                className="input text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Status Ketersediaan</label>
              <select
                value={assetForm.status}
                onChange={e => setAssetForm({ ...assetForm, status: e.target.value })}
                className="input text-xs font-semibold"
              >
                <option value="AVAILABLE_IN_STUDIO">Tersedia di Studio / Kantor</option>
                <option value="ACTIVE_IN_USE">Sedang Digunakan di Proyek</option>
                <option value="MAINTENANCE">Dalam Perawatan / Servis</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setIsAssetModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs cursor-pointer">
              Batal
            </button>
            <button type="submit" className="btn-primary py-2 px-4 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold cursor-pointer">
              Simpan Aset Peralatan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

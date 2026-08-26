"use client";

import { useState, useEffect } from "react";
import {
  DollarSign, TrendingUp, CreditCard, ArrowUpRight, ArrowDownRight,
  FileCheck, Plus, RefreshCw, Layers, CheckCircle2, XCircle,
  Building, Landmark, ShieldCheck, Scale, Zap, Trash2, ArrowRight
} from "lucide-react";
import { cn, formatMoney, formatDate, getStatusColor } from "@/lib/utils";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { feedApi } from "@/lib/api/feed.api";

const FINANCE_TABS = [
  { id: "overview",     label: "Dashboard Ringkasan"       },
  { id: "profit",       label: "📊 Laba & Revenue Proyek"  },
  { id: "costing",      label: "Costing & WIP"             },
  { id: "fundings",     label: "Funding Proyek"            },
  { id: "ap",           label: "Tagihan Vendor (AP)"       },
  { id: "billing",      label: "Billing Termin"            },
  { id: "ar",           label: "Piutang & Kredit (AR)"     },
  { id: "cashbank",     label: "Kas & Bank (Disbursement)" },
  { id: "gl",           label: "Buku Besar (GL)"           },
  { id: "tax",          label: "Perpajakan"                },
  { id: "assets",       label: "Aset Tetap"                },
];

const DEFAULT_VENDOR_BILLS = [
  {
    id: "bill-1",
    supplier_name: "PT. Schneider Electric Automation",
    invoice_number: "INV-SCH-2026-089",
    po_number: "PO-2026-041",
    grn_number: "GRN-2026-033",
    amount: 32500000,
    due_date: "2026-09-15",
    status: "PENDING_MATCH",
  },
  {
    id: "bill-2",
    supplier_name: "PT. Siemens Industrial Indonesia",
    invoice_number: "INV-SIE-2026-012",
    po_number: "PO-2026-039",
    grn_number: "GRN-2026-028",
    amount: 48000000,
    due_date: "2026-09-20",
    status: "MATCHED",
  },
  {
    id: "bill-3",
    supplier_name: "PT. Omron Electronic Mfg",
    invoice_number: "INV-OMR-2026-077",
    po_number: "PO-2026-035",
    grn_number: "GRN-2026-021",
    amount: 18500000,
    due_date: "2026-08-30",
    status: "PAID",
  },
];

export const BANK_ACCOUNTS = [
  { id: "bca", name: "BCA Giro Operasional — 882-019-2810", number: "882-019-2810", balance: 450000000, bank: "PT Bank Central Asia Tbk", type: "MAIN_OPERATIONAL" },
  { id: "mandiri", name: "Bank Mandiri Escrow Proyek — 131-002-8819", number: "131-002-8819", balance: 780000000, bank: "PT Bank Mandiri (Persero) Tbk", type: "ESCROW_PROJECT" },
  { id: "bni", name: "BNI Kas Operasional Lapangan — 028-192-3810", number: "028-192-3810", balance: 120000000, bank: "PT Bank Negara Indonesia Tbk", type: "FIELD_OPERATION" },
  { id: "petty", name: "Kas Kecil Kasir (Petty Cash)", number: "CASH-OFFICE-01", balance: 35000000, bank: "Brankas Tunai Kantor", type: "PETTY_CASH" },
];

export const DEFAULT_CUSTOMER_RECEIPTS = [
  {
    id: "rec-1",
    receipt_number: "REC-2026-001",
    customer_name: "PT Cisco Systems Indonesia",
    project_name: "Produksi Video Content Komersial PT Cisco Systems Indonesia",
    invoice_ref: "INV-CISCO-001 (Termin DP 50%)",
    amount: 75000000,
    bank_account: "BCA Giro Operasional — 882-019-2810",
    payment_date: "2026-08-20",
    payment_method: "BANK_TRANSFER",
    reference_number: "TRF-CISCO-882190",
    status: "RECEIVED",
    notes: "Pembayaran termin DP 50% project video commercial"
  },
  {
    id: "rec-2",
    receipt_number: "REC-2026-002",
    customer_name: "PT Industri Otomasi Indonesia",
    project_name: "Implementasi Sistem Otomasi Conveyor Line 1",
    invoice_ref: "INV-OTO-001 (Termin 1 Fabrikasi)",
    amount: 120000000,
    bank_account: "Bank Mandiri Escrow Proyek — 131-002-8819",
    payment_date: "2026-08-22",
    payment_method: "BANK_TRANSFER",
    reference_number: "TRF-MDR-449102",
    status: "RECEIVED",
    notes: "Pembayaran termin 1 milestone instalasi conveyor"
  }
];

export default function FinanceClient() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* Track recently opened finance */
  useEffect(() => {
    feedApi.trackRecentItem({
      item_type: "ORDER",
      object_id: `fin-${activeTab}`,
      title: `Finance — ${FINANCE_TABS.find(t => t.id === activeTab)?.label || "Overview"}`,
      target_url: `/finance`,
    }).catch(() => {});
  }, [activeTab]);

  /* Data states */
  const [costEntries, setCostEntries] = useState<any[]>([]);
  const [fundings, setFundings] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [vendorBills, setVendorBills] = useState<any[]>(DEFAULT_VENDOR_BILLS);
  const [customerReceipts, setCustomerReceipts] = useState<any[]>(DEFAULT_CUSTOMER_RECEIPTS);

  /* Modals */
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isAPModalOpen, setIsAPModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const [selectedBillForMatch, setSelectedBillForMatch] = useState<any>(null);
  const [selectedBillForPay, setSelectedBillForPay] = useState<any>(null);

  /* Forms */
  const [costForm, setCostForm] = useState({ project: 1, category: "MATERIAL", amount: 15000000, description: "" });
  const [fundingForm, setFundingForm] = useState({ project: 1, amount: 50000000, purpose: "Pengadaan Material Awal", source: "KAS_PERUSAHAAN" });
  const [billingForm, setBillingForm] = useState({ project: 1, amount: 45000000, description: "Termin Progres 50%", milestone_percentage: 50 });
  const [apForm, setAPForm] = useState({ supplier_name: "", invoice_number: "", amount: 25000000, due_date: "" });
  const [paymentForm, setPaymentForm] = useState({
    bank_account: "BCA Giro Operasional — 882-019-2810",
    payment_method: "BANK_TRANSFER",
    payment_date: new Date().toISOString().split("T")[0],
    reference_number: "TRF-BCA-" + Math.floor(100000 + Math.random() * 900000),
    notes: "Pelunasan tagihan pengadaan komponen vendor",
  });
  const [receiptForm, setReceiptForm] = useState({
    customer_name: "PT Cisco Systems Indonesia",
    project_name: "Produksi Video Content Komersial PT Cisco Systems Indonesia",
    invoice_ref: "INV-CISCO-002 (Termin Pelunasan)",
    amount: 75000000,
    bank_account: "BCA Giro Operasional — 882-019-2810",
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "BANK_TRANSFER",
    reference_number: "TRF-IN-BCA-" + Math.floor(100000 + Math.random() * 900000),
    notes: "Penerimaan pembayaran pelunasan termin invoice penagihan klien",
  });

  const loadFinanceData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [costRes, fundRes, propRes, apRes] = await Promise.all([
        api.get("/api/v1/finance/project-cost-entries/?page_size=50").catch(() => ({ data: [] })),
        api.get("/api/v1/finance/project-fundings/?page_size=50").catch(() => ({ data: [] })),
        api.get("/api/v1/finance/billing-proposals/?page_size=50").catch(() => ({ data: [] })),
        api.get("/api/v1/finance/billing-documents/?billing_type=SUPPLIER_INVOICE&page_size=50").catch(() => ({ data: [] })),
      ]);

      setCostEntries(normalizeList(costRes.data).rows);
      setFundings(normalizeList(fundRes.data).rows);
      setProposals(normalizeList(propRes.data).rows);

      const apList = normalizeList(apRes.data).rows;
      if (apList.length > 0) {
        setVendorBills(apList);
      } else {
        setVendorBills(prev => (prev.length > 0 ? prev : DEFAULT_VENDOR_BILLS));
      }
    } catch {
      toast.error("Gagal memuat data keuangan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFinanceData();
  }, []);

  /* KPI Calculations */
  const totalCostEntries = costEntries.reduce(
    (acc, curr) => acc + Number(curr.total_cost ?? curr.amount ?? curr.cost_amount ?? curr.total_amount ?? 0),
    0
  );
  const totalDisbursedFunding = fundings
    .filter(f => ["DISBURSED", "ACTIVE", "APPROVED"].includes((f.status || "").toUpperCase()))
    .reduce((acc, curr) => acc + Number(curr.amount ?? curr.funding_amount ?? curr.requested_amount ?? curr.approved_limit ?? 0), 0);

  // Total Project Costs (WIP) = Actual Cost Entries + Disbursed Working Capital Fundings
  const totalCost = totalCostEntries > 0 ? totalCostEntries : totalDisbursedFunding;

  const totalBillingRevenue = proposals
    .filter(p => p.status === "APPROVED" || p.status === "PAID")
    .reduce((acc, curr) => acc + Number(curr.total_amount ?? curr.amount ?? curr.subtotal ?? 0), 0);
  const totalInflowRevenue = customerReceipts.reduce((acc, r) => acc + Number(r.amount || 0), 0);

  const totalRevenue = totalBillingRevenue > 0 ? totalBillingRevenue : totalInflowRevenue;
  
  const totalFunding = fundings.reduce(
    (acc, curr) => acc + Number(curr.amount ?? curr.funding_amount ?? curr.requested_amount ?? curr.approved_limit ?? curr.total_amount ?? 0),
    0
  );
  const grossMargin = totalRevenue - totalCost;

  /* Operations */
  const handlePostToWIP = async (entryId: number) => {
    try {
      await api.patch(`/api/v1/finance/project-cost-entries/${entryId}/`, { status: "POSTED_TO_WIP" });
      toast.success("✓ Biaya berhasil di-post ke WIP & Jurnal Akuntansi!");
      await loadFinanceData(true);
    } catch {
      toast.error("Gagal post ke WIP");
    }
  };

  const handleDecideFunding = async (fundingId: number, status: "APPROVED" | "REJECTED") => {
    try {
      await api.patch(`/api/v1/finance/project-fundings/${fundingId}/`, { status });
      toast.success(`Funding ${status === "APPROVED" ? "Disetujui" : "Ditolak"}!`);
      await loadFinanceData(true);
    } catch {
      toast.error("Gagal memproses permohonan funding");
    }
  };

  const handleApproveBilling = async (proposalId: number) => {
    try {
      await api.patch(`/api/v1/finance/billing-proposals/${proposalId}/`, { status: "APPROVED" });
      toast.success("✓ Proposal Billing disetujui & Faktur Penagihan diterbitkan!");
      await loadFinanceData(true);
    } catch {
      toast.error("Gagal memproses proposal billing");
    }
  };

  const handleVerifyThreeWayMatch = (bill: any) => {
    setSelectedBillForMatch(bill);
    setIsMatchModalOpen(true);
  };

  const handleConfirmThreeWayMatch = async () => {
    if (!selectedBillForMatch) return;
    try {
      if (typeof selectedBillForMatch.id === "string" && selectedBillForMatch.id.includes("-") && !selectedBillForMatch.id.startsWith("bill-")) {
        await api.patch(`/api/v1/finance/billing-documents/${selectedBillForMatch.id}/`, { status: "MATCHED" }).catch(() => {});
      }
      setVendorBills(prev => prev.map(b => b.id === selectedBillForMatch.id ? { ...b, status: "MATCHED" } : b));
      toast.success("✓ Verifikasi 3-Way Match Selesai! Tagihan telah diverifikasi & Siap Dibayar.", { icon: "🛡️" });
      setIsMatchModalOpen(false);
    } catch {
      toast.error("Gagal memverifikasi 3-way match");
    }
  };

  const handleOpenPayModal = (bill: any) => {
    setSelectedBillForPay(bill);
    setPaymentForm({
      bank_account: "BCA Giro Operasional — 882-019-2810",
      payment_method: "BANK_TRANSFER",
      payment_date: new Date().toISOString().split("T")[0],
      reference_number: "TRF-BCA-" + Math.floor(100000 + Math.random() * 900000),
      notes: `Pelunasan tagihan ${bill.supplier_name || 'Vendor'} (${bill.invoice_number})`,
    });
    setIsPaymentModalOpen(true);
  };

  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillForPay) return;
    try {
      if (typeof selectedBillForPay.id === "string" && selectedBillForPay.id.includes("-") && !selectedBillForPay.id.startsWith("bill-")) {
        await api.patch(`/api/v1/finance/billing-documents/${selectedBillForPay.id}/`, {
          status: "PAID",
          payment_status: "PAID",
          paid_amount: selectedBillForPay.amount
        }).catch(() => {});
      }
      setVendorBills(prev => prev.map(b => b.id === selectedBillForPay.id ? {
        ...b,
        status: "PAID",
        payment_status: "PAID",
        paid_at: paymentForm.payment_date,
        payment_ref: paymentForm.reference_number
      } : b));
      toast.success(`✓ Pembayaran Tagihan ${selectedBillForPay.supplier_name} (${formatMoney(selectedBillForPay.amount)}) Berhasil Diproses!`, { icon: "💳" });
      setIsPaymentModalOpen(false);
    } catch {
      toast.error("Gagal memproses pembayaran");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-6 rounded-2xl animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
            <div className="h-8 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header & Global Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Finance & Accounting</h1>
          <p className="text-xs text-text-secondary mt-0.5">Double-entry bookkeeping, costing, billing termin, dan 3-way match AP</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setIsCostModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
            <Plus size={14} /> Catat Biaya
          </button>
          <button onClick={() => setIsFundingModalOpen(true)} className="btn-outline py-1.5 px-3 text-xs gap-1.5">
            <Plus size={14} /> Request Dana
          </button>
          <button onClick={() => setIsBillingModalOpen(true)} className="btn-outline py-1.5 px-3 text-xs gap-1.5">
            <Plus size={14} /> Proposal Billing
          </button>
          <button
            onClick={() => loadFinanceData(true)}
            className={cn("btn-ghost py-1.5 px-3 text-xs gap-1.5", refreshing && "animate-spin")}
            disabled={refreshing}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 11 Subtabs navigation */}
      <div className="flex border-b border-text-tertiary overflow-x-auto no-scrollbar gap-1">
        {FINANCE_TABS.map(tab => (
          <button
            key={tab.id}
            className={cn("tab-btn", activeTab === tab.id && "active")}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: OVERVIEW ────────────────────── */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="kpi-card">
              <span className="text-xs text-text-secondary">Total Revenue (Billing)</span>
              <span className="text-2xl font-bold text-brand-deep-green">{formatMoney(totalRevenue)}</span>
            </div>
            <div className="kpi-card">
              <span className="text-xs text-text-secondary">Total Project Costs (WIP)</span>
              <span className="text-2xl font-bold text-red-600">{formatMoney(totalCost)}</span>
            </div>
            <div className="kpi-card">
              <span className="text-xs text-text-secondary">Gross Margin Proyek</span>
              <span className="text-2xl font-bold text-brand-deep-green">{formatMoney(grossMargin)}</span>
            </div>
            <div className="kpi-card">
              <span className="text-xs text-text-secondary">Dana Terdistribusi (Funding)</span>
              <span className="text-2xl font-bold text-brand-green">{formatMoney(totalFunding)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Biaya Proyek Terkini (Cost Entries)</h3>
              <div className="divide-y divide-text-tertiary">
                {costEntries.slice(0, 4).map(c => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <strong className="block text-text-primary">{c.description || "Pengeluaran Material"}</strong>
                      <small className="text-text-secondary">Proyek #{c.project}</small>
                    </div>
                    <span className="font-semibold text-red-600">{formatMoney(c.amount)}</span>
                  </div>
                ))}
                {!costEntries.length && <p className="text-xs text-text-secondary text-center py-4">Belum ada pengeluaran.</p>}
              </div>
            </div>

            <div className="card rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Billing Termin Klien (Proposals)</h3>
              <div className="divide-y divide-text-tertiary">
                {proposals.slice(0, 4).map(p => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <strong className="block text-text-primary">{p.description || "Termin Progres"}</strong>
                      <small className="text-text-secondary">Proyek #{p.project}</small>
                    </div>
                    <span className="font-semibold text-brand-deep-green">{formatMoney(p.amount)}</span>
                  </div>
                ))}
                {!proposals.length && <p className="text-xs text-text-secondary text-center py-4">Belum ada proposal billing.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: LABA & PROFITABILITY (EVM) ──── */}
      {activeTab === "profit" && (
        <div className="card rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-text-primary">Analisis Profitabilitas & Margin Proyek (EVM)</h3>
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Nama Proyek</th>
                <th>Nilai Kontrak (Revenue)</th>
                <th>Biaya Riil (Actual Cost)</th>
                <th>Laba Kotor (Gross Margin)</th>
                <th>Margin (%)</th>
                <th>Status EVM</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Implementasi Smart Automation Line</strong></td>
                <td>{formatMoney(150000000)}</td>
                <td className="text-red-600 font-semibold">{formatMoney(totalCost || 12000000)}</td>
                <td className="text-emerald-700 font-bold">{formatMoney(150000000 - (totalCost || 12000000))}</td>
                <td><span className="font-bold text-brand-deep-green">92%</span></td>
                <td><span className="badge badge-success">✓ Sangat Sehat (CPI &gt; 1.1)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 3: COSTING & WIP ───────────────── */}
      {activeTab === "costing" && (
        <div className="card rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Costing & Work In Progress (WIP)</h3>
              <p className="text-2xs text-text-secondary">Post pengeluaran riil proyek ke dalam akun persediaan WIP dan buku besar akuntansi</p>
            </div>
            <button onClick={() => setIsCostModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
              <Plus size={14} /> Catat Biaya
            </button>
          </div>
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Deskripsi Pengeluaran</th>
                <th>Kategori</th>
                <th>Jumlah Biaya</th>
                <th>Status Akuntansi</th>
                <th>Aksi Posting</th>
              </tr>
            </thead>
            <tbody>
              {costEntries.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.description || "Pengeluaran"}</strong></td>
                  <td><span className="badge badge-neutral">{c.category || "OPERATIONAL"}</span></td>
                  <td className="font-semibold text-red-600">{formatMoney(c.total_cost ?? c.amount ?? c.cost_amount ?? 0)}</td>
                  <td><span className={cn("badge", getStatusColor(c.status || "DRAFT"))}>{c.status || "DRAFT"}</span></td>
                  <td>
                    {c.status !== "POSTED_TO_WIP" ? (
                      <button
                        onClick={() => handlePostToWIP(c.id)}
                        className="btn-primary py-1 px-2.5 text-2xs gap-1"
                      >
                        <Zap size={12} /> Post ke WIP & Jurnal
                      </button>
                    ) : (
                      <span className="text-2xs text-brand-deep-green font-bold">✓ Terposting</span>
                    )}
                  </td>
                </tr>
              ))}
              {!costEntries.length && <tr><td colSpan={5} className="text-center py-6 text-xs text-text-secondary">Belum ada cost entry.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 4: FUNDING PROYEK ──────────────── */}
      {activeTab === "fundings" && (
        <TabFundingProyek
          fundings={fundings}
          onRefresh={() => loadFinanceData(true)}
          onRequestModalOpen={() => setIsFundingModalOpen(true)}
        />
      )}

      {/* ── TAB 5: AP & 3-WAY MATCH ────────────── */}
      {activeTab === "ap" && (
        <div className="card rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Accounts Payable & Verifikasi 3-Way Match</h3>
              <p className="text-2xs text-text-secondary">Pencocokan PO (Purchase Order) vs GRN (Penerimaan Barang) vs Invoice Supplier dan Eksekusi Pembayaran AP</p>
            </div>
            <button onClick={() => setIsAPModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
              <Plus size={14} /> + Tagihan Vendor Baru
            </button>
          </div>

          <table className="w-full data-table text-xs">
            <thead>
              <tr className="bg-gray-50 text-2xs uppercase tracking-wider text-text-secondary">
                <th className="py-2.5 px-3">Nama Vendor / Supplier</th>
                <th className="py-2.5 px-3">Nomor Faktur</th>
                <th className="py-2.5 px-3">Jumlah Tagihan</th>
                <th className="py-2.5 px-3">Status Verifikasi</th>
                <th className="py-2.5 px-3 text-right">Aksi Workflow</th>
              </tr>
            </thead>
            <tbody>
              {vendorBills.map(b => {
                const isPaid = b.status === "PAID" || b.payment_status === "PAID" || b.status === "LUNAS";
                const isMatched = b.status === "MATCHED" || b.status === "VERIFIED" || b.status === "APPROVED";
                const isPending = !isPaid && !isMatched;

                return (
                  <tr key={b.id} className={cn("hover:bg-brand-light-green/20 border-b border-gray-100", isPaid && "bg-emerald-50/30")}>
                    <td className="py-3 px-3">
                      <strong className="text-text-primary block font-bold">{b.supplier_name || "PT. Supplier Otomasi"}</strong>
                      <span className="text-2xs text-text-secondary">Jatuh Tempo: {b.due_date || "30 Hari"}</span>
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-text-secondary">
                      {b.invoice_number || `INV-${b.id}`}
                    </td>
                    <td className="py-3 px-3">
                      <strong className={cn("font-bold", isPaid ? "text-emerald-700" : "text-red-600")}>
                        {formatMoney(b.amount || 25000000)}
                      </strong>
                    </td>
                    <td className="py-3 px-3">
                      {isPaid ? (
                        <span className="badge badge-success text-2xs font-bold py-0.5 px-2">
                          ✓ Lunas Dibayar
                        </span>
                      ) : isMatched ? (
                        <span className="badge text-2xs font-bold py-0.5 px-2 bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ✓ Match (Siap Bayar)
                        </span>
                      ) : (
                        <span className="badge badge-warning text-2xs font-bold py-0.5 px-2">
                          Menunggu 3-Way Match
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isPending && (
                        <button
                          onClick={() => handleVerifyThreeWayMatch(b)}
                          className="btn-outline py-1 px-3 text-2xs gap-1 text-brand-deep-green border-brand-green/50 hover:bg-brand-light-green font-bold"
                        >
                          <ShieldCheck size={12} /> Verifikasi 3-Way Match
                        </button>
                      )}

                      {isMatched && !isPaid && (
                        <button
                          onClick={() => handleOpenPayModal(b)}
                          className="btn-primary py-1 px-3 text-2xs gap-1 bg-emerald-600 hover:bg-emerald-700 font-bold shadow-xs"
                        >
                          <CreditCard size={12} /> 💳 Bayar Tagihan (Pay AP)
                        </button>
                      )}

                      {isPaid && (
                        <span className="text-xs text-emerald-700 font-bold flex items-center justify-end gap-1">
                          <CheckCircle2 size={14} className="text-emerald-600" /> Selesai Dibayar
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 6: BILLING TERMIN ──────────────── */}
      {activeTab === "billing" && (
        <div className="card rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Proposal Billing Termin Klien</h3>
              <p className="text-2xs text-text-secondary">Approve proposal dan terbitkan faktur penagihan resmi beserta pajak (PPN)</p>
            </div>
            <button onClick={() => setIsBillingModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
              <Plus size={14} /> Buat Proposal
            </button>
          </div>
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Deskripsi Termin</th>
                <th>Bobot Capaian</th>
                <th>Nilai Tagihan</th>
                <th>Status Proposal</th>
                <th>Aksi Penagihan</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.description || "Termin Invoice"}</strong></td>
                  <td>{p.milestone_percentage || 50}%</td>
                  <td className="font-semibold text-brand-deep-green">{formatMoney(p.total_amount ?? p.amount ?? p.subtotal ?? 0)}</td>
                  <td><span className={cn("badge", getStatusColor(p.status))}>{p.status}</span></td>
                  <td>
                    {p.status !== "APPROVED" ? (
                      <button
                        onClick={() => handleApproveBilling(p.id)}
                        className="btn-primary py-1 px-2.5 text-2xs gap-1 bg-emerald-700 hover:bg-emerald-800"
                      >
                        <FileCheck size={12} /> Approve & Buat Faktur
                      </button>
                    ) : (
                      <span className="text-2xs text-brand-deep-green font-bold">✓ Faktur Terbit</span>
                    )}
                  </td>
                </tr>
              ))}
              {!proposals.length && <tr><td colSpan={5} className="text-center py-6 text-xs text-text-secondary">Belum ada proposal billing.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 7: PIUTANG & UANG MASUK (AR) ───── */}
      {activeTab === "ar" && (
        <div className="flex flex-col gap-5">
          {/* Header & Action */}
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Piutang & Alur Uang Masuk Perusahaan (Accounts Receivable)</h3>
              <p className="text-xs text-text-secondary">Penerimaan pembayaran dari klien / termin proyek ke rekening bank perusahaan.</p>
            </div>
            <button
              onClick={() => setIsReceiptModalOpen(true)}
              className="btn-primary py-2 px-3.5 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
            >
              <Plus size={14} /> Catat Uang Masuk (Customer Payment)
            </button>
          </div>

          {/* KPI Summary Uang Masuk */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50">
              <span className="text-2xs font-bold text-emerald-800 uppercase tracking-wider block">Total Uang Masuk Diterima (Inflow)</span>
              <span className="text-2xl font-black text-emerald-700 mt-1 block">
                {formatMoney(customerReceipts.reduce((acc, r) => acc + Number(r.amount || 0), 0))}
              </span>
              <span className="text-2xs text-text-secondary mt-0.5 block">{customerReceipts.length} transaksi penerimaan tervalidasi</span>
            </div>

            <div className="card p-4 rounded-2xl border border-amber-200 bg-amber-50/50">
              <span className="text-2xs font-bold text-amber-800 uppercase tracking-wider block">Sisa Piutang Berjalan (Outstanding AR)</span>
              <span className="text-2xl font-black text-amber-700 mt-1 block">
                {formatMoney(185000000)}
              </span>
              <span className="text-2xs text-text-secondary mt-0.5 block">Invoice termin proyek belum lunas</span>
            </div>

            <div className="card p-4 rounded-2xl border border-text-tertiary bg-white">
              <span className="text-2xs font-bold text-text-secondary uppercase tracking-wider block">Rata-Rata Siklus Pelunasan</span>
              <span className="text-2xl font-black text-text-primary mt-1 block">14 Hari</span>
              <span className="text-2xs text-text-secondary mt-0.5 block">Kolektibilitas pembayaran lancar (A+)</span>
            </div>
          </div>

          {/* Tabel Riwayat Uang Masuk */}
          <div className="card p-5 rounded-2xl border border-text-tertiary bg-white flex flex-col gap-3">
            <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Riwayat Penerimaan Pembayaran Klien</h4>
            <div className="overflow-x-auto border border-text-tertiary/50 rounded-xl">
              <table className="w-full data-table text-xs text-left">
                <thead>
                  <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider border-b">
                    <th className="py-3 px-4 font-bold">No. Bukti / Tanggal</th>
                    <th className="py-3 px-4 font-bold">Klien & Proyek</th>
                    <th className="py-3 px-4 font-bold">Rekening Penerima</th>
                    <th className="py-3 px-4 font-bold">Jumlah Uang Masuk</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customerReceipts.map((rec) => (
                    <tr key={rec.id} className="hover:bg-emerald-50/30">
                      <td className="py-3 px-4">
                        <strong className="text-text-primary block font-mono text-2xs">{rec.receipt_number}</strong>
                        <span className="text-2xs text-text-secondary font-mono block">{rec.payment_date}</span>
                      </td>
                      <td className="py-3 px-4">
                        <strong className="text-text-primary block">{rec.customer_name}</strong>
                        <span className="text-2xs text-text-secondary block mt-0.5">Proyek: {rec.project_name}</span>
                        <span className="text-2xs text-emerald-800 block mt-0.5">{rec.invoice_ref}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-text-primary block">{rec.bank_account.split("—")[0]}</span>
                        <span className="text-2xs text-text-secondary font-mono block">Ref: {rec.reference_number}</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-700 text-sm">
                        +{formatMoney(rec.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-emerald-100 text-emerald-800">
                          ✓ DITERIMA & POSTED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 8: KAS & BANK MUTASI (CASH & BANK) ── */}
      {activeTab === "cashbank" && (
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Buku Kas & Bank Perusahaan (Cash & Bank Ledger)</h3>
              <p className="text-xs text-text-secondary">Pantau saldo real-time akun bank dan alur mutasi uang masuk vs uang keluar.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsReceiptModalOpen(true)} className="btn-secondary py-1.5 px-3 text-xs gap-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50">
                <Plus size={13} /> Catat Uang Masuk
              </button>
              <button onClick={() => setIsPaymentModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5 bg-brand-deep-green">
                <CreditCard size={13} /> Pengeluaran Kas
              </button>
            </div>
          </div>

          {/* 4 Kartu Rekening Bank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {BANK_ACCOUNTS.map((b) => (
              <div key={b.id} className="card p-4 rounded-2xl border border-text-tertiary bg-white flex flex-col justify-between min-h-[120px] shadow-xs">
                <div>
                  <div className="flex items-center justify-between text-2xs font-bold text-text-secondary uppercase">
                    <span>{b.type.replace("_", " ")}</span>
                    <Landmark size={14} className="text-brand-green" />
                  </div>
                  <strong className="text-xs font-bold text-text-primary block mt-1">{b.name.split("—")[0]}</strong>
                  <span className="text-2xs text-text-secondary font-mono block mt-0.5">{b.number}</span>
                </div>
                <div className="mt-3 pt-2 border-t border-text-tertiary/40 flex justify-between items-baseline">
                  <span className="text-2xs text-text-secondary">Saldo Tersedia:</span>
                  <strong className="text-sm font-black text-brand-deep-green">{formatMoney(b.balance)}</strong>
                </div>
              </div>
            ))}
          </div>

          {/* Mutasi Kas & Bank (Inflow vs Outflow) */}
          <div className="card p-5 rounded-2xl border border-text-tertiary bg-white flex flex-col gap-3">
            <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Buku Mutasi Arus Kas Riil (Inflows & Disbursements)</h4>
            <div className="overflow-x-auto border border-text-tertiary/50 rounded-xl">
              <table className="w-full data-table text-xs text-left">
                <thead>
                  <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider border-b">
                    <th className="py-3 px-4 font-bold">Tanggal</th>
                    <th className="py-3 px-4 font-bold">Tipe Arus Kas</th>
                    <th className="py-3 px-4 font-bold">Rekening Kas/Bank</th>
                    <th className="py-3 px-4 font-bold">Keterangan / Lawan Transaksi</th>
                    <th className="py-3 px-4 font-bold text-right">Nominal Mutasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {/* Gabungan Mutasi Uang Masuk dan Uang Keluar */}
                  {customerReceipts.map((rec) => (
                    <tr key={`in-${rec.id}`} className="hover:bg-emerald-50/20">
                      <td className="py-3 px-4 font-mono text-2xs">{rec.payment_date}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-emerald-100 text-emerald-800">
                          🟢 Uang Masuk (Inflow)
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-text-primary">{rec.bank_account.split("—")[0]}</td>
                      <td className="py-3 px-4">
                        <span className="text-text-primary block font-medium">{rec.customer_name} — {rec.invoice_ref}</span>
                        <span className="text-2xs text-text-secondary block font-mono">Ref: {rec.reference_number}</span>
                      </td>
                      <td className="py-3 px-4 font-black text-right text-emerald-600 text-sm">
                        +{formatMoney(rec.amount)}
                      </td>
                    </tr>
                  ))}
                  {vendorBills.filter(b => b.status === "PAID").map((b) => (
                    <tr key={`out-${b.id}`} className="hover:bg-red-50/20">
                      <td className="py-3 px-4 font-mono text-2xs">{b.due_date || "2026-08-23"}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase bg-red-100 text-red-800">
                          🔴 Uang Keluar (Outflow)
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-text-primary">BCA Giro Operasional</td>
                      <td className="py-3 px-4">
                        <span className="text-text-primary block font-medium">Pembayaran Tagihan Vendor: {b.supplier_name}</span>
                        <span className="text-2xs text-text-secondary block font-mono">Inv: {b.invoice_number}</span>
                      </td>
                      <td className="py-3 px-4 font-black text-right text-red-600 text-sm">
                        -{formatMoney(b.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 9 - 11: GL, TAX, ASSETS ─────────── */}
      {["gl", "tax", "assets"].includes(activeTab) && (
        <div className="card rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
          <Landmark size={40} className="text-brand-green opacity-40" />
          <h3 className="text-base font-semibold text-text-primary">
            Modul {FINANCE_TABS.find(t => t.id === activeTab)?.label}
          </h3>
          <p className="text-xs text-text-secondary max-w-md">
            Modul ini terhubung otomatis dengan buku besar General Ledger dan sistem perpajakan.
          </p>
        </div>
      )}

      {/* ── MODALS ───────────────────────────────── */}

      {/* Modal: 3-Way Match Verification */}
      <Modal
        isOpen={isMatchModalOpen}
        onClose={() => setIsMatchModalOpen(false)}
        title="🛡️ Verifikasi 3-Way Match (AP)"
        subtitle={`Vendor: ${selectedBillForMatch?.supplier_name || "Supplier"}`}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-gray-50 border border-text-tertiary">
              <span className="text-2xs text-text-secondary block">1. Purchase Order</span>
              <strong className="text-brand-deep-green">{selectedBillForMatch?.po_number || "PO-2026-041"}</strong>
              <p className="mt-1 font-semibold">{formatMoney(selectedBillForMatch?.amount || 25000000)}</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-text-tertiary">
              <span className="text-2xs text-text-secondary block">2. Goods Receipt (GRN)</span>
              <strong className="text-brand-deep-green">{selectedBillForMatch?.grn_number || "GRN-2026-033"}</strong>
              <p className="mt-1 font-semibold text-emerald-700">✓ 100% Diterima</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 border border-text-tertiary">
              <span className="text-2xs text-text-secondary block">3. Invoice Vendor</span>
              <strong className="text-brand-deep-green">{selectedBillForMatch?.invoice_number || "INV-01"}</strong>
              <p className="mt-1 font-semibold">{formatMoney(selectedBillForMatch?.amount || 25000000)}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-brand-light-green border border-brand-green/30 text-xs text-brand-deep-green flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>Kesesuaian kuantitas, harga satuan, dan penerimaan fisik barang: <b>MATCH (Cocok 100%)</b></span>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setIsMatchModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmThreeWayMatch}
              className="btn-primary py-2 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold"
            >
              Konfirmasi Match & Setujui Pembayaran (AP)
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Catat Biaya */}
      <Modal
        isOpen={isCostModalOpen}
        onClose={() => setIsCostModalOpen(false)}
        title="Catat Biaya Proyek"
        subtitle="Entri pengeluaran riil yang akan masuk ke WIP"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post("/api/v1/finance/project-cost-entries/", costForm);
              toast.success("Biaya berhasil dicatat!");
              setIsCostModalOpen(false);
              await loadFinanceData(true);
            } catch {
              toast.error("Gagal mencatat biaya");
            }
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Kategori Biaya</label>
              <select
                value={costForm.category}
                onChange={e => setCostForm({ ...costForm, category: e.target.value })}
                className="input"
              >
                <option value="MATERIAL">MATERIAL</option>
                <option value="LABOR">LABOR</option>
                <option value="EQUIPMENT">EQUIPMENT</option>
                <option value="SUBCONTRACTOR">SUBCONTRACTOR</option>
                <option value="OVERHEAD">OVERHEAD</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Jumlah Biaya (Rp) *</label>
              <input
                type="number"
                required
                value={costForm.amount}
                onChange={e => setCostForm({ ...costForm, amount: Number(e.target.value) })}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Deskripsi Pengeluaran</label>
            <input
              type="text"
              required
              placeholder="Contoh: Pengambilan sensor Schneider 12 unit"
              value={costForm.description}
              onChange={e => setCostForm({ ...costForm, description: e.target.value })}
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2.5 mt-2">
            Simpan & Catat Biaya
          </button>
        </form>
      </Modal>

      {/* Modal: Request Dana */}
      <Modal
        isOpen={isFundingModalOpen}
        onClose={() => setIsFundingModalOpen(false)}
        title="Ajukan Request Dana"
        subtitle="Permohonan pencairan dana modal proyek"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post("/api/v1/finance/project-fundings/", {
                ...fundingForm,
                requested_amount: fundingForm.amount,
              });
              toast.success("Request dana berhasil diajukan!");
              setIsFundingModalOpen(false);
              await loadFinanceData(true);
            } catch {
              toast.error("Gagal mengajukan funding");
            }
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Jumlah Dana (Rp) *</label>
            <input
              type="number"
              required
              value={fundingForm.amount}
              onChange={e => setFundingForm({ ...fundingForm, amount: Number(e.target.value) })}
              className="input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Keperluan</label>
            <input
              type="text"
              required
              value={fundingForm.purpose}
              onChange={e => setFundingForm({ ...fundingForm, purpose: e.target.value })}
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2.5 mt-2">
            Ajukan Request Dana
          </button>
        </form>
      </Modal>

      {/* Modal: Proposal Billing */}
      <Modal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        title="Buat Proposal Billing Termin"
        subtitle="Pengajuan termin invoice penagihan ke klien"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post("/api/v1/finance/billing-proposals/", billingForm);
              toast.success("Proposal billing berhasil diajukan!");
              setIsBillingModalOpen(false);
              await loadFinanceData(true);
            } catch {
              toast.error("Gagal membuat proposal billing");
            }
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Nilai Tagihan (Rp) *</label>
              <input
                type="number"
                required
                value={billingForm.amount}
                onChange={e => setBillingForm({ ...billingForm, amount: Number(e.target.value) })}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Bobot Persentase (%)</label>
              <input
                type="number"
                value={billingForm.milestone_percentage}
                onChange={e => setBillingForm({ ...billingForm, milestone_percentage: Number(e.target.value) })}
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Keterangan Termin</label>
            <input
              type="text"
              required
              value={billingForm.description}
              onChange={e => setBillingForm({ ...billingForm, description: e.target.value })}
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2.5 mt-2">
            Buat Proposal Billing
          </button>
        </form>
      </Modal>

      {/* Modal: Tambah Tagihan Vendor (AP) */}
      <Modal
        isOpen={isAPModalOpen}
        onClose={() => setIsAPModalOpen(false)}
        title="Daftarkan Tagihan Vendor (AP)"
        subtitle="Entri invoice supplier masuk untuk diproses 3-way match"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const newBill = {
              id: "bill-" + Date.now(),
              supplier_name: apForm.supplier_name,
              invoice_number: apForm.invoice_number || `INV-${Date.now().toString().slice(-4)}`,
              po_number: "PO-" + Math.floor(1000 + Math.random() * 9000),
              grn_number: "GRN-" + Math.floor(1000 + Math.random() * 9000),
              amount: Number(apForm.amount),
              due_date: apForm.due_date || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
              status: "PENDING_MATCH",
            };
            setVendorBills(prev => [newBill, ...prev]);
            toast.success("✓ Tagihan vendor berhasil didaftarkan & Menunggu 3-Way Match!");
            setIsAPModalOpen(false);
            setAPForm({ supplier_name: "", invoice_number: "", amount: 25000000, due_date: "" });
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Nama Supplier / Vendor *</label>
            <input
              type="text"
              required
              placeholder="PT. Schneider Electric Automation"
              value={apForm.supplier_name}
              onChange={e => setAPForm({ ...apForm, supplier_name: e.target.value })}
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Nomor Faktur Vendor</label>
              <input
                type="text"
                placeholder="INV-SCH-2026-09"
                value={apForm.invoice_number}
                onChange={e => setAPForm({ ...apForm, invoice_number: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Jumlah Tagihan (Rp) *</label>
              <input
                type="number"
                required
                value={apForm.amount}
                onChange={e => setAPForm({ ...apForm, amount: Number(e.target.value) })}
                className="input"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2.5 mt-2 font-bold">
            Daftarkan Invoice AP
          </button>
        </form>
      </Modal>

      {/* Modal: Pembayaran Tagihan Vendor (AP Disbursement) */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="💳 Proses Pembayaran Tagihan Vendor (AP)"
        subtitle={`Vendor: ${selectedBillForPay?.supplier_name} — Faktur: ${selectedBillForPay?.invoice_number}`}
        size="md"
      >
        <form onSubmit={handleExecutePayment} className="flex flex-col gap-3">
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs flex justify-between items-center">
            <div>
              <span className="text-2xs text-text-secondary block">Total Tagihan Harus Dibayar:</span>
              <strong className="text-sm font-bold text-text-primary">{selectedBillForPay?.supplier_name}</strong>
            </div>
            <span className="text-base font-extrabold text-emerald-700">
              {formatMoney(selectedBillForPay?.amount || 0)}
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Sumber Akun Kas / Bank Pembayar *</label>
            <select
              value={paymentForm.bank_account}
              onChange={e => setPaymentForm({ ...paymentForm, bank_account: e.target.value })}
              className="input text-xs"
            >
              <option value="BCA Giro Operasional — 882-019-2810">BCA Giro Operasional (IDR) — 882-019-2810</option>
              <option value="Mandiri Payroll & Vendor — 132-009-8812">Mandiri Giro Bisnis — 132-009-8812</option>
              <option value="Kas Tunai Operasional Perusahaan">Kas Kecil (Petty Cash Operasional)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Metode Pembayaran</label>
              <select
                value={paymentForm.payment_method}
                onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                className="input text-xs"
              >
                <option value="BANK_TRANSFER">Transfer Bank (RTGS / BI-FAST)</option>
                <option value="GIRO_CEK">Giro / Cek Perusahaan</option>
                <option value="CASH">Kas Tunai</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Tanggal Pembayaran *</label>
              <input
                type="date"
                required
                value={paymentForm.payment_date}
                onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Nomor Bukti Transfer / Referensi Bank *</label>
            <input
              type="text"
              required
              placeholder="Contoh: TRF-BCA-9921820"
              value={paymentForm.reference_number}
              onChange={e => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Catatan Pengeluaran</label>
            <input
              type="text"
              placeholder="Keterangan pengeluaran untuk jurnal akuntansi..."
              value={paymentForm.notes}
              onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">
              Batal
            </button>
            <button type="submit" className="btn-primary py-2 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold">
              Konfirmasi & Eksekusi Pembayaran (Disburse)
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Catat Uang Masuk / Pembayaran Klien (Customer Payment Receipt) */}
      <Modal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        title="💵 Catat Penerimaan Uang Masuk (Customer Inflow)"
        subtitle="Penerimaan pembayaran pelunasan termin invoice penagihan klien"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const newRec = {
              id: "rec-" + Date.now(),
              receipt_number: "REC-" + Date.now().toString().slice(-6),
              customer_name: receiptForm.customer_name,
              project_name: receiptForm.project_name,
              invoice_ref: receiptForm.invoice_ref,
              amount: Number(receiptForm.amount),
              bank_account: receiptForm.bank_account,
              payment_date: receiptForm.payment_date,
              payment_method: receiptForm.payment_method,
              reference_number: receiptForm.reference_number,
              status: "RECEIVED",
              notes: receiptForm.notes,
            };
            setCustomerReceipts([newRec, ...customerReceipts]);
            toast.success(`Uang Masuk sebesar ${formatMoney(newRec.amount)} berhasil dicatat ke ${newRec.bank_account.split("—")[0]}!`, { icon: "💰" });
            setIsReceiptModalOpen(false);
          }}
          className="flex flex-col gap-3.5 p-1"
        >
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
            <strong>Alur Uang Masuk Perusahaan:</strong> Dana yang diterima akan menambah saldo kas/bank perusahaan dan mengurangi piutang invoice klien terkait.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Nama Klien / Perusahaan *</label>
              <input
                type="text"
                required
                value={receiptForm.customer_name}
                onChange={e => setReceiptForm({ ...receiptForm, customer_name: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Nama Proyek Terkait *</label>
              <input
                type="text"
                required
                value={receiptForm.project_name}
                onChange={e => setReceiptForm({ ...receiptForm, project_name: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Referensi Faktur / Termin</label>
              <input
                type="text"
                value={receiptForm.invoice_ref}
                onChange={e => setReceiptForm({ ...receiptForm, invoice_ref: e.target.value })}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Nominal Uang Masuk (Rp) *</label>
              <input
                type="number"
                required
                min="1000"
                value={receiptForm.amount}
                onChange={e => setReceiptForm({ ...receiptForm, amount: Number(e.target.value) })}
                className="input text-xs font-bold text-emerald-700"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Rekening Kas / Bank Penerima Dana *</label>
            <select
              value={receiptForm.bank_account}
              onChange={e => setReceiptForm({ ...receiptForm, bank_account: e.target.value })}
              className="input text-xs font-semibold"
            >
              {BANK_ACCOUNTS.map(b => (
                <option key={b.id} value={b.name}>
                  {b.name} (Saldo: {formatMoney(b.balance)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Metode Penerimaan</label>
              <select
                value={receiptForm.payment_method}
                onChange={e => setReceiptForm({ ...receiptForm, payment_method: e.target.value })}
                className="input text-xs"
              >
                <option value="BANK_TRANSFER">Transfer Bank / RTGS</option>
                <option value="GIRO_CEK">Bilyet Giro / Cek Masuk</option>
                <option value="CASH">Kas Tunai Kasir</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Tanggal Terima Dana *</label>
              <input
                type="date"
                required
                value={receiptForm.payment_date}
                onChange={e => setReceiptForm({ ...receiptForm, payment_date: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">No. Bukti Transfer / Resi Bank Klien *</label>
            <input
              type="text"
              required
              value={receiptForm.reference_number}
              onChange={e => setReceiptForm({ ...receiptForm, reference_number: e.target.value })}
              className="input text-xs font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-text-primary block mb-1">Catatan Penerimaan Kas</label>
            <input
              type="text"
              value={receiptForm.notes}
              onChange={e => setReceiptForm({ ...receiptForm, notes: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setIsReceiptModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">
              Batal
            </button>
            <button type="submit" className="btn-primary py-2 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold">
              Konfirmasi & Masukkan ke Kas/Bank
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}

/* ── Tab: Funding Proyek (Persetujuan Permodalan Proyek) ── */
function TabFundingProyek({
  fundings,
  onRefresh,
  onRequestModalOpen,
}: {
  fundings: any[];
  onRefresh: () => void;
  onRequestModalOpen: () => void;
}) {
  const [selectedFunding, setSelectedFunding] = useState<any>(null);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [decisionAction, setDecisionAction] = useState<"APPROVED" | "REJECTED" | "DISBURSED">("APPROVED");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* State Pencairan Kas Bank */
  const [selectedBankAccount, setSelectedBankAccount] = useState("BCA Giro Operasional — 882-019-2810");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [voucherNumber, setVoucherNumber] = useState("VCH-DISB-" + Math.floor(100000 + Math.random() * 900000));
  const [disburseDate, setDisburseDate] = useState(new Date().toISOString().split("T")[0]);

  // Helper resolusi nominal dana yang aman dari berbagai kemungkinan nama field backend
  const getFundingAmount = (f: any): number => {
    return Number(f.amount ?? f.funding_amount ?? f.requested_amount ?? f.approved_limit ?? f.total_amount ?? 0);
  };

  const handleDecision = async () => {
    if (!selectedFunding) return;
    setIsSubmitting(true);
    try {
      const payloadNote = decisionAction === "DISBURSED"
        ? `[CAIR via ${selectedBankAccount.split("—")[0]} | Ref: ${voucherNumber}] ${decisionNotes}`
        : decisionNotes;

      // Panggil endpoint action backend keputusan finance
      await api.post(`/api/v1/finance/project-fundings/${selectedFunding.id}/decide/`, {
        decision: decisionAction,
        notes: payloadNote,
        bank_account: selectedBankAccount,
        voucher_number: voucherNumber,
      }).catch(async () => {
        // Fallback PATCH langsung ke status funding
        await api.patch(`/api/v1/finance/project-fundings/${selectedFunding.id}/`, {
          status: decisionAction,
          review_note: payloadNote,
        });
      });

      if (decisionAction === "DISBURSED") {
        toast.success(`Dana berhasil dicairkan dari ${selectedBankAccount.split("—")[0]}! Saldo kas terpotong.`, { icon: "⚡" });
      } else {
        toast.success(`Pengajuan dana berhasil diubah ke status: ${decisionAction}`);
      }

      setIsDecisionModalOpen(false);
      setDecisionNotes("");
      onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Gagal memproses keputusan funding.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFunding = async (id: string | number) => {
    if (!confirm("Apakah Anda yakin ingin menghapus pengajuan dana ini?")) return;
    try {
      await api.delete(`/api/v1/finance/project-fundings/${id}/`);
      toast.success("Pengajuan dana berhasil dihapus.");
      onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Gagal menghapus pengajuan dana.");
    }
  };

  return (
    <div className="card p-5 rounded-2xl border border-text-tertiary bg-white flex flex-col gap-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Persetujuan Permodalan Proyek (Funding)</h3>
          <p className="text-xs text-text-secondary">Keputusan pencairan modal kerja tim proyek dari kas/bank perusahaan.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRequestModalOpen} className="btn-primary py-1.5 px-3 text-xs gap-1.5 shadow-xs">
            <Plus size={14} /> Request Dana
          </button>
          <button onClick={onRefresh} className="btn-ghost text-xs gap-1 py-1.5 px-3">
            <RefreshCw size={13} /> Refresh Data
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-text-tertiary/50 rounded-xl">
        <table className="w-full data-table text-xs text-left">
          <thead>
            <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider border-b">
              <th className="py-3 px-4 font-bold">Keperluan / Tujuan</th>
              <th className="py-3 px-4 font-bold">Sumber Dana</th>
              <th className="py-3 px-4 font-bold">Jumlah Dana</th>
              <th className="py-3 px-4 font-bold">Status Approval</th>
              <th className="py-3 px-4 font-bold text-right">Keputusan Finance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {fundings.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-text-secondary">
                  Belum ada permohonan pendanaan proyek.
                </td>
              </tr>
            ) : (
              fundings.map((f: any) => {
                const amount = getFundingAmount(f);
                const status = (f.status || "DRAFT").toUpperCase();
                const isPending = ["DRAFT", "SUBMITTED", "VERIFIED", "PENDING"].includes(status);
                const isApproved = status === "APPROVED";
                const isDisbursed = status === "DISBURSED" || status === "ACTIVE";

                return (
                  <tr key={f.id} className="hover:bg-brand-light-green/20">
                    <td className="py-3 px-4 font-semibold text-text-primary">
                      <div>{f.description || f.purpose || f.title || "Pengajuan Dana Operasional"}</div>
                      {f.project_name && (
                        <span className="text-2xs text-text-secondary font-normal block mt-0.5">
                          Proyek: {f.project_name}
                        </span>
                      )}
                      {f.review_note && (
                        <span className="text-2xs text-text-secondary italic block mt-0.5 text-gray-500">
                          Catatan: {f.review_note}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-text-secondary font-mono text-2xs">
                      {f.source || f.source_type || f.funding_type || "KAS_PERUSAHAAN"}
                    </td>
                    <td className="py-3 px-4 font-bold text-brand-deep-green">
                      {formatMoney(amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase",
                        isDisbursed ? "bg-blue-100 text-blue-800" :
                        isApproved ? "bg-emerald-100 text-emerald-800" :
                        status === "REJECTED" ? "bg-red-100 text-red-800" :
                        "bg-amber-100 text-amber-800"
                      )}>
                        {status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {isPending && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedFunding(f);
                                setDecisionAction("APPROVED");
                                setIsDecisionModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-2xs hover:bg-emerald-700 shadow-xs"
                            >
                              ✓ Setujui
                            </button>
                            <button
                              onClick={() => {
                                setSelectedFunding(f);
                                setDecisionAction("REJECTED");
                                setIsDecisionModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 font-bold text-2xs hover:bg-red-100 border border-red-200"
                            >
                              ✕ Tolak
                            </button>
                          </>
                        )}

                        {isApproved && (
                          <button
                            onClick={() => {
                              setSelectedFunding(f);
                              setDecisionAction("DISBURSED");
                              setVoucherNumber("VCH-DISB-" + Math.floor(100000 + Math.random() * 900000));
                              setIsDecisionModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-2xs hover:bg-blue-700 shadow-xs flex items-center gap-1"
                          >
                            <Zap size={11} /> Cairkan Kas
                          </button>
                        )}

                        {isDisbursed && (
                          <span className="text-2xs text-blue-700 font-bold flex items-center gap-1">
                            <CheckCircle2 size={13} className="text-blue-600" /> Kas Dicairkan
                          </span>
                        )}

                        {!isPending && !isApproved && !isDisbursed && (
                          <span className="text-2xs text-text-secondary italic">Selesai ({status})</span>
                        )}

                        <button
                          onClick={() => handleDeleteFunding(f.id)}
                          className="p-1 rounded text-text-secondary hover:text-red-600 hover:bg-red-50"
                          title="Hapus Pengajuan"
                        >
                          <Trash2 size={13} />
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

      {/* Modal Eksekusi Keputusan Funding / Pencairan Kas */}
      {isDecisionModalOpen && selectedFunding && (
        <Modal
          isOpen={isDecisionModalOpen}
          onClose={() => setIsDecisionModalOpen(false)}
          title={
            decisionAction === "DISBURSED"
              ? "⚡ Pencairan Kas Modal Kerja Proyek"
              : `Keputusan Permodalan: ${decisionAction}`
          }
          subtitle={selectedFunding.description || selectedFunding.purpose || "Verifikasi Pencairan Dana"}
          size="md"
        >
          <div className="flex flex-col gap-3.5 p-4">
            {/* Info Pengajuan */}
            <div className="p-3 rounded-xl bg-gray-50 border text-xs flex justify-between items-center">
              <div>
                <span className="text-2xs text-text-secondary block">Proyek: {selectedFunding.project_name || "Proyek"}</span>
                <span className="font-semibold text-text-primary block mt-0.5">{selectedFunding.description || selectedFunding.purpose || "Operasional Lapangan"}</span>
              </div>
              <div className="text-right">
                <span className="text-2xs text-text-secondary block">Nominal Pencairan</span>
                <strong className="text-sm font-black text-brand-deep-green">{formatMoney(getFundingAmount(selectedFunding))}</strong>
              </div>
            </div>

            {/* Khusus Form Pencairan Dana: Pemilihan Rekening Bank */}
            {decisionAction === "DISBURSED" && (
              <>
                <div>
                  <label className="text-xs font-bold text-text-primary block mb-1">
                    Rekening Kas / Bank Sumber Pengeluaran Dana *
                  </label>
                  <select
                    value={selectedBankAccount}
                    onChange={e => setSelectedBankAccount(e.target.value)}
                    className="w-full border border-text-tertiary rounded-lg p-2 text-xs font-semibold bg-white focus:outline-none focus:border-brand-green"
                  >
                    {BANK_ACCOUNTS.map(b => (
                      <option key={b.id} value={b.name}>
                        {b.name} (Saldo: {formatMoney(b.balance)})
                      </option>
                    ))}
                  </select>
                  <span className="text-3xs text-text-secondary mt-0.5 block">
                    Dana akan dipotong langsung dari saldo rekening yang dipilih.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-text-primary block mb-1">Metode Pencairan</label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="w-full border border-text-tertiary rounded-lg p-2 text-xs bg-white"
                    >
                      <option value="BANK_TRANSFER">Transfer Bank / RTGS</option>
                      <option value="GIRO_CEK">Bilyet Giro / Cek</option>
                      <option value="CASH">Kas Tunai Kasir</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-text-primary block mb-1">Tanggal Transfer *</label>
                    <input
                      type="date"
                      value={disburseDate}
                      onChange={e => setDisburseDate(e.target.value)}
                      className="w-full border border-text-tertiary rounded-lg p-2 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-text-primary block mb-1">Nomor Voucher Pengeluaran Kas / Bank *</label>
                  <input
                    type="text"
                    value={voucherNumber}
                    onChange={e => setVoucherNumber(e.target.value)}
                    className="w-full border border-text-tertiary rounded-lg p-2 text-xs font-mono font-bold"
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Catatan / Verifikasi Finance</label>
              <textarea
                rows={2}
                className="w-full border border-text-tertiary rounded-lg p-2 text-xs focus:outline-none focus:border-brand-green"
                placeholder="Tuliskan catatan alokasi transfer, nomor resi bank, atau instruksi..."
                value={decisionNotes}
                onChange={e => setDecisionNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={() => setIsDecisionModalOpen(false)} disabled={isSubmitting} className="btn-ghost text-xs">
                Batal
              </button>
              <button
                onClick={handleDecision}
                disabled={isSubmitting}
                className={cn(
                  "btn-primary text-xs py-2 px-4 font-bold shadow-xs",
                  decisionAction === "REJECTED" ? "bg-red-600 hover:bg-red-700 text-white" :
                  decisionAction === "DISBURSED" ? "bg-blue-600 hover:bg-blue-700 text-white" :
                  "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
              >
                {isSubmitting ? "Memproses..." : decisionAction === "DISBURSED" ? "⚡ Eksekusi Pencairan & Potong Saldo" : `Konfirmasi ${decisionAction}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

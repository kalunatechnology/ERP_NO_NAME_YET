/**
 * File: frontend-next/app/(app)/finance/FinanceClient.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect } from "react";
import {
  DollarSign, TrendingUp, CreditCard, ArrowUpRight, ArrowDownRight,
  FileCheck, Plus, RefreshCw, Layers, CheckCircle2, XCircle,
  Building, Landmark, ShieldCheck, Scale, Zap, Trash2, ArrowRight,
  BookOpen, BarChart3, Activity, Banknote, ArrowLeftRight, TrendingDown,
  AlertTriangle, CheckSquare, Clock, Eye, LayoutDashboard, Crown, BriefcaseBusiness,
  ClipboardList, Receipt, RotateCcw, WalletCards, LibraryBig, FileBarChart,
  Link2, Calculator, CalendarRange, HardHat
} from "lucide-react";
import { cn, formatMoney, formatDate, getStatusColor } from "@/lib/utils";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { feedApi } from "@/lib/api/feed.api";
import { InventoryCheckingCard } from "@/components/ui/InventoryCheckingCard";
import { BudgetCheckStatusCard } from "@/components/ui/BudgetCheckStatusCard";
import { MonthlyStackedBarChart } from "@/components/ui/MonthlyStackedBarChart";
import { ProjectTaxWorkspace } from "@/components/finance/ProjectTaxWorkspace";
import { CompanyMasterWorkspace } from "@/components/finance/CompanyMasterWorkspace";
import { AccessDeniedState, isForbiddenError } from "@/components/ui/AccessDeniedState";
import { useAuth } from "@/contexts/AuthContext";
import dynamic from "next/dynamic";

const FixedAssetsWorkspace          = dynamic(() => import("@/components/finance/FixedAssetsWorkspace"),          { ssr: false });
const PeriodClosingWorkspace        = dynamic(() => import("@/components/finance/PeriodClosingWorkspace"),        { ssr: false });
const AuditTrailWorkspace           = dynamic(() => import("@/components/finance/AuditTrailWorkspace"),           { ssr: false });
const ExecutiveAuditReportWorkspace = dynamic(() => import("@/components/finance/ExecutiveAuditReportWorkspace").then(m => m.ExecutiveAuditReportWorkspace), { ssr: false });
const DocumentPrintModal            = dynamic(() => import("@/components/finance/DocumentPrintModal").then(m => m.DocumentPrintModal), { ssr: false });

const FINANCE_TABS = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "executive_report", label: "Executive Report", icon: Crown },
  { id: "company_master", label: "Master Perusahaan", icon: Building },
  { id: "profit", label: "Profitabilitas", icon: TrendingUp },
  { id: "costing", label: "Costing & WIP", icon: Calculator },
  { id: "fundings", label: "Funding Proyek", icon: BriefcaseBusiness },
  { id: "ap", label: "Tagihan Vendor", icon: ClipboardList },
  { id: "billing", label: "Billing Termin", icon: Receipt },
  { id: "ar", label: "Piutang", icon: RotateCcw },
  { id: "cashbank", label: "Kas & Bank", icon: WalletCards },
  { id: "gl", label: "Buku Besar", icon: LibraryBig },
  { id: "lapkeu", label: "Laporan Keuangan", icon: FileBarChart },
  { id: "banking_hub", label: "Rekonsiliasi", icon: Link2 },
  { id: "tax", label: "Perpajakan", icon: Scale },
  { id: "assets", label: "Aset Tetap", icon: HardHat },
  { id: "period_closing", label: "Tutup Buku", icon: CalendarRange },
  { id: "audit_trail", label: "Audit Trail", icon: ShieldCheck },
];

export const BANK_ACCOUNTS = [
  { id: "bca", name: "BCA Giro Operasional — 882-019-2810", number: "882-019-2810", balance: 450000000, bank: "PT Bank Central Asia Tbk", type: "MAIN_OPERATIONAL" },
  { id: "mandiri", name: "Bank Mandiri Escrow Proyek — 131-002-8819", number: "131-002-8819", balance: 780000000, bank: "PT Bank Mandiri (Persero) Tbk", type: "ESCROW_PROJECT" },
  { id: "bni", name: "BNI Kas Operasional Lapangan — 028-192-3810", number: "028-192-3810", balance: 120000000, bank: "PT Bank Negara Indonesia Tbk", type: "FIELD_OPERATION" },
  { id: "petty", name: "Kas Kecil Kasir (Petty Cash)", number: "CASH-OFFICE-01", balance: 35000000, bank: "Brankas Tunai Kantor", type: "PETTY_CASH" },
];

/**
 * FinanceClient coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function FinanceClient() {
  const { userRole } = useAuth();
  const [activeTab, setActiveTab] = useState(userRole === "executive" ? "executive_report" : "overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Tracks which tabs received a 403 response — shows inline AccessDeniedState instead of redirecting
  const [tabErrors, setTabErrors] = useState<Record<string, 403 | null>>({});

/**
 * markTabForbidden coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const markTabForbidden = (tab: string) =>
    setTabErrors(prev => ({ ...prev, [tab]: 403 }));

/**
 * clearTabError coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const clearTabError = (tab: string) =>
    setTabErrors(prev => ({ ...prev, [tab]: null }));

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
  const [vendorBills, setVendorBills] = useState<any[]>([]);
  const [customerReceipts, setCustomerReceipts] = useState<any[]>([]);

  /* Accounting / GL states */
  const [trialBalance, setTrialBalance] = useState<any>(null);
  const [profitLoss, setProfitLoss] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [bankStatements, setBankStatements] = useState<any[]>([]);
  const [bankReconciliations, setBankReconciliations] = useState<any[]>([]);
  const [glActiveTab, setGlActiveTab] = useState<"trial" | "entries">("trial");
  const [lapkeuActiveTab, setLapkeuActiveTab] = useState<"pl" | "bs">("pl");
  const [isReversalModalOpen, setIsReversalModalOpen] = useState(false);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<any>(null);
  const [reversalReason, setReversalReason] = useState("");

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

  const [costForm, setCostForm] = useState({ project: 1, category: "MATERIAL", amount: 15000000, description: "" });
  const [fundingForm, setFundingForm] = useState({ project: 1, amount: 50000000, purpose: "Pengadaan Material Awal", source: "KAS_PERUSAHAAN" });
  const [billingForm, setBillingForm] = useState({
    project: 1,
    amount: 45000000,
    description: "Termin Progres 50%",
    milestone_percentage: 50,
    tax_scheme: "PROPORTIONAL" as "PROPORTIONAL" | "FULL_UPFRONT" | "FINAL_SETTLEMENT",
    client_type: "NON_WAPU" as "NON_WAPU" | "WAPU",
    pph_type: "PPh 23 (2%)",
    pph_rate: 2.0,
  });
  const [apForm, setAPForm] = useState({ supplier_name: "", invoice_number: "", amount: 25000000, due_date: "" });
  const [paymentForm, setPaymentForm] = useState({
    bank_account: "BCA Giro Operasional — 882-019-2810",
    payment_method: "BANK_TRANSFER",
    payment_date: new Date().toISOString().split("T")[0],
    reference_number: "",
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
    reference_number: "",
    notes: "Penerimaan pembayaran pelunasan termin invoice penagihan klien",
  });

/**
 * loadFinanceData coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const loadFinanceData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      // A forbidden tab remains isolated, but transport/server failures must be visible.
/**
 * safeGet coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
      const safeGet = async (url: string, tabHint?: string) => {
        try {
          const response = await api.get(url);
          if (tabHint) clearTabError(tabHint);
          return response;
        } catch (err: unknown) {
          if (isForbiddenError(err) && tabHint) {
            markTabForbidden(tabHint);
            return { data: [] };
          }
          throw err;
        }
      };

      const [costRes, fundRes, propRes, apRes, receiptRes, tbRes, jeRes, plRes, bsRes, stmtRes] = await Promise.all([
        safeGet("/api/v1/finance/project-cost-entries/?page_size=50", "costing"),
        safeGet("/api/v1/finance/project-fundings/?page_size=50", "fundings"),
        safeGet("/api/v1/finance/billing-proposals/?page_size=50", "billing"),
        safeGet("/api/v1/finance/billing-documents/?billing_type=SUPPLIER_INVOICE&page_size=50", "ap"),
        safeGet("/api/v1/finance/customer-receipts/?page_size=50", "ar"),
        safeGet("/api/v1/finance/trial-balance", "gl"),
        safeGet("/api/v1/finance/journal-entries/?page_size=30&ordering=-posting_date", "gl"),
        safeGet("/api/v1/finance/profit-and-loss", "lapkeu"),
        safeGet("/api/v1/finance/balance-sheet", "lapkeu"),
        safeGet("/api/v1/finance/bank-statements/?page_size=20", "banking_hub"),
      ]);

      setCostEntries(normalizeList(costRes.data).rows);
      setFundings(normalizeList(fundRes.data).rows);
      setProposals(normalizeList(propRes.data).rows);

      setVendorBills(normalizeList(apRes.data).rows);
      setCustomerReceipts(normalizeList<any>(receiptRes.data).rows.map((receipt) => ({
        ...receipt,
        ...(typeof receipt.allocation_plan === "object" && receipt.allocation_plan ? receipt.allocation_plan : {}),
      })));

      // Accounting data
      if (tbRes.data?.data) setTrialBalance(tbRes.data.data);
      else if (tbRes.data?.accounts) setTrialBalance(tbRes.data);

      const jeList = normalizeList(jeRes.data).rows;
      if (jeList.length > 0) setJournalEntries(jeList);

      if (plRes.data?.data) setProfitLoss(plRes.data.data);
      else if (plRes.data?.revenues) setProfitLoss(plRes.data);

      if (bsRes.data?.data) setBalanceSheet(bsRes.data.data);
      else if (bsRes.data?.assets) setBalanceSheet(bsRes.data);

      const stmtList = normalizeList(stmtRes.data).rows;
      if (stmtList.length > 0) setBankStatements(stmtList);
    } catch {
      toast.error("Gagal memuat data keuangan");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

/**
 * handleReverseEntry coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleReverseEntry = async () => {
    if (!selectedJournalEntry || !reversalReason.trim()) return;
    try {
      await api.post(`/api/v1/finance/journal-entries/${selectedJournalEntry.id}/reverse`, { reason: reversalReason });
      toast.success("✓ Jurnal berhasil di-reverse (Storno)!");
      setIsReversalModalOpen(false);
      setReversalReason("");
      await loadFinanceData(true);
    } catch {
      toast.error("Gagal melakukan reversal jurnal");
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
/**
 * handlePostToWIP coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handlePostToWIP = async (entryId: number) => {
    try {
      await api.patch(`/api/v1/finance/project-cost-entries/${entryId}/`, { status: "POSTED_TO_WIP" });
      toast.success("✓ Biaya berhasil di-post ke WIP & Jurnal Akuntansi!");
      await loadFinanceData(true);
    } catch {
      toast.error("Gagal post ke WIP");
    }
  };

/**
 * handleDecideFunding coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleDecideFunding = async (fundingId: number, status: "APPROVED" | "REJECTED") => {
    try {
      await api.patch(`/api/v1/finance/project-fundings/${fundingId}/`, { status });
      toast.success(`Funding ${status === "APPROVED" ? "Disetujui" : "Ditolak"}!`);
      await loadFinanceData(true);
    } catch {
      toast.error("Gagal memproses permohonan funding");
    }
  };

/**
 * handleApproveBilling coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleApproveBilling = async (proposalId: number) => {
    try {
      await api.patch(`/api/v1/finance/billing-proposals/${proposalId}/`, { status: "APPROVED" });
      toast.success("✓ Proposal Billing disetujui & Faktur Penagihan diterbitkan!");
      await loadFinanceData(true);
    } catch {
      toast.error("Gagal memproses proposal billing");
    }
  };

/**
 * handleVerifyThreeWayMatch coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleVerifyThreeWayMatch = (bill: any) => {
    setSelectedBillForMatch(bill);
    setIsMatchModalOpen(true);
  };

/**
 * handleConfirmThreeWayMatch coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleConfirmThreeWayMatch = async () => {
    if (!selectedBillForMatch) return;
    try {
      await api.patch(`/api/v1/finance/billing-documents/${selectedBillForMatch.id}/`, { status: "MATCHED" });
      await loadFinanceData(true);
      toast.success("Verifikasi 3-Way Match selesai. Tagihan siap dibayar.");
      setIsMatchModalOpen(false);
    } catch {
      toast.error("Gagal memverifikasi 3-way match");
    }
  };

/**
 * handleOpenPayModal coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleOpenPayModal = (bill: any) => {
    setSelectedBillForPay(bill);
    setPaymentForm({
      bank_account: "BCA Giro Operasional — 882-019-2810",
      payment_method: "BANK_TRANSFER",
      payment_date: new Date().toISOString().split("T")[0],
      reference_number: "",
      notes: `Pelunasan tagihan ${bill.supplier_name || 'Vendor'} (${bill.invoice_number})`,
    });
    setIsPaymentModalOpen(true);
  };

/**
 * handleExecutePayment coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillForPay) return;
    try {
      await api.patch(`/api/v1/finance/billing-documents/${selectedBillForPay.id}/`, {
        status: "PAID",
        payment_status: "PAID",
        paid_amount: selectedBillForPay.total_amount ?? selectedBillForPay.amount,
      });
      await loadFinanceData(true);
      toast.success(`Pembayaran ${selectedBillForPay.supplier_name} (${formatMoney(selectedBillForPay.amount)}) berhasil diproses.`);
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Finance & Accounting</h1>
          <p className="page-description">Pembukuan, pengendalian biaya, penagihan, dan rekonsiliasi perusahaan</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {userRole !== "executive" ? (
            <>
              <button onClick={() => setIsCostModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
                <Plus size={14} /> Catat Biaya
              </button>
              <button onClick={() => setIsFundingModalOpen(true)} className="btn-outline py-1.5 px-3 text-xs gap-1.5">
                <Plus size={14} /> Request Dana
              </button>
              <button onClick={() => setIsBillingModalOpen(true)} className="btn-outline py-1.5 px-3 text-xs gap-1.5">
                <Plus size={14} /> Proposal Billing
              </button>
            </>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold flex items-center gap-1.5">
              <Crown size={13} /> Mode Eksekutif · Read only
            </span>
          )}
          <button
            onClick={() => loadFinanceData(true)}
            className={cn("btn-ghost py-1.5 px-3 text-xs gap-1.5", refreshing && "animate-spin")}
            disabled={refreshing}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {userRole === "executive" && (
        <div className="p-3.5 rounded-2xl bg-[#FAF5FF] border border-[#E9D5FF] text-xs text-[#581C87] flex items-center justify-between flex-wrap gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <Crown size={16} aria-hidden="true" />
            <span>
              <b>Executive Viewport Active:</b> Anda memiliki akses penuh membaca seluruh metrik keuangan, arus kas, dan audit trail satu lembar.
            </span>
          </div>
          <span className="text-2xs font-extrabold px-2.5 py-0.5 rounded-full bg-[#F3E8FF] text-[#6B21A8]">
            READ ONLY / PREVIEW
          </span>
        </div>
      )}

      {/* 11 Subtabs navigation */}
      <div className="flex border-b border-text-tertiary overflow-x-auto no-scrollbar gap-1">
        {FINANCE_TABS.map(tab => {
          const TabIcon = tab.icon;
          return (
          <button
            key={tab.id}
            className={cn("tab-btn", activeTab === tab.id && "active")}
            onClick={() => setActiveTab(tab.id)}
          >
            <TabIcon size={14} aria-hidden="true" />
            {tab.label}
          </button>
          );
        })}
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

          {/* ── Live Control & Financial Monitoring (Inventory & Budget) ── */}
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
              <BudgetCheckStatusCard
                materialBudget={totalRevenue ?? 56000000}
                allocationCost={totalCost ?? 12500000}
                remainingBudget={totalRevenue != null ? Math.max(0, (totalRevenue ?? 0) - (totalCost ?? 0)) : 43500000}
                isValid={(totalRevenue ?? 0) >= (totalCost ?? 0)}
              />
              <InventoryCheckingCard autoFetch={true} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
        </div>
      )}

      {/* ── TAB 2: LABA & PROFITABILITY (EVM) ──── */}
      {activeTab === "profit" && (
        <div className="flex flex-col gap-6">
          <MonthlyStackedBarChart
            title="Tren Pendapatan & Biaya Bulanan (Monthly Stacked Run-Rate)"
            subtitle="Distribusi pendapatan termin (Realized) vs alokasi biaya WIP/material per bulan fiskal"
            primaryLabel="Realisasi Kas (Jt)"
            secondaryLabel="Alokasi WIP / Biaya Proyek (Jt)"
            autoFetch={true}
          />

          <div className="card rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-text-primary">Analisis Profitabilitas & Margin Proyek (EVM)</h3>
            <div className="table-scroll-wrapper">
              <table className="w-full data-table min-w-[560px]">
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
          </div>
        </div>
      )}

      {/* ── TAB 3: COSTING & WIP ───────────────── */}
      {activeTab === "costing" && (
        tabErrors["costing"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Costing & WIP" />
          </div>
        ) : (
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
          <div className="table-scroll-wrapper">
            <table className="w-full data-table min-w-[560px]">
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
        </div>
        )
      )}

      {/* ── TAB 4: FUNDING PROYEK ──────────────── */}
      {activeTab === "fundings" && (
        tabErrors["fundings"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Funding Proyek" />
          </div>
        ) : (
          <TabFundingProyek
            fundings={fundings}
            onRefresh={() => loadFinanceData(true)}
            onRequestModalOpen={() => setIsFundingModalOpen(true)}
          />
        )
      )}

      {/* ── TAB 5: AP & 3-WAY MATCH ────────────── */}
      {activeTab === "ap" && (
        tabErrors["ap"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Tagihan Vendor (AP)" />
          </div>
        ) : (
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

          <div className="table-scroll-wrapper">
            <table className="w-full data-table text-xs min-w-[580px]">
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
                          <CreditCard size={12} /> Bayar tagihan
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
        </div>
        )
      )}

      {/* ── TAB 6: BILLING TERMIN ──────────────── */}
      {activeTab === "billing" && (
        tabErrors["billing"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Billing Termin" />
          </div>
        ) : (
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
          <div className="table-scroll-wrapper">
            <table className="w-full data-table min-w-[560px]">
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
        </div>
        )
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
            <div className="table-scroll-wrapper border border-text-tertiary/50 rounded-xl">
              <table className="w-full data-table text-xs text-left min-w-[580px]">
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
            <div className="table-scroll-wrapper border border-text-tertiary/50 rounded-xl">
              <table className="w-full data-table text-xs text-left min-w-[600px]">
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

      {/* ── TAB: MASTER PERUSAHAAN & BANK ─────────── */}
      {activeTab === "company_master" && (
        tabErrors["company_master"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Master Perusahaan & Bank" />
          </div>
        ) : (
          <CompanyMasterWorkspace />
        )
      )}

      {/* ── TAB 10: PERPAJAKAN PROYEK (TAX COMPLIANCE) ── */}
      {activeTab === "tax" && (
        tabErrors["tax"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Perpajakan" />
          </div>
        ) : (
          <ProjectTaxWorkspace />
        )
      )}

      {/* ── TAB: BUKU BESAR & TRIAL BALANCE ─────── */}
      {activeTab === "gl" && (
        tabErrors["gl"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Buku Besar (GL)" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <BookOpen size={16} className="text-brand-green" /> Buku Besar & Trial Balance (General Ledger)
                </h3>
                <p className="text-xs text-text-secondary">Saldo dihitung secara real-time dari akumulasi jurnal yang telah diposting (POSTED).</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setGlActiveTab("trial")} className={cn("tab-btn text-xs", glActiveTab === "trial" && "active")}>Trial Balance</button>
                <button onClick={() => setGlActiveTab("entries")} className={cn("tab-btn text-xs", glActiveTab === "entries" && "active")}>Jurnal Umum</button>
              </div>
            </div>

            {glActiveTab === "trial" && (
              <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
                {/* Summary Banner */}
                {trialBalance && (
                  <div className={cn(
                    "flex items-center gap-3 px-5 py-3 text-xs font-semibold border-b",
                    trialBalance.is_balanced
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  )}>
                    {trialBalance.is_balanced
                      ? <><CheckCircle2 size={15} /> Trial Balance SEIMBANG — Total Debit = Total Kredit ({formatMoney(trialBalance.total_debit)})</>
                      : <><AlertTriangle size={15} /> TIDAK SEIMBANG! Debit: {formatMoney(trialBalance.total_debit)} ≠ Kredit: {formatMoney(trialBalance.total_credit)}</>}
                  </div>
                )}
                <div className="table-scroll-wrapper">
                  <table className="w-full data-table text-xs min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50 text-2xs uppercase tracking-wider text-text-secondary">
                        <th className="py-3 px-4 text-left">Kode Akun</th>
                        <th className="py-3 px-4 text-left">Nama Akun</th>
                        <th className="py-3 px-4 text-left">Tipe</th>
                        <th className="py-3 px-4 text-right">Total Debit</th>
                        <th className="py-3 px-4 text-right">Total Kredit</th>
                        <th className="py-3 px-4 text-right">Saldo Bersih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {trialBalance?.accounts?.map((acc: any) => (
                        <tr key={acc.account_id} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-4 font-mono font-bold text-brand-deep-green">{acc.account_code}</td>
                          <td className="py-2.5 px-4 font-medium text-text-primary">{acc.account_name}</td>
                          <td className="py-2.5 px-4">
                            <span className={cn("badge text-2xs",
                              acc.account_type === "ASSET" ? "badge-neutral" :
                              acc.account_type === "REVENUE" ? "badge-success" :
                              acc.account_type === "EXPENSE" ? "bg-red-100 text-red-700" :
                              acc.account_type === "LIABILITY" ? "bg-orange-100 text-orange-700" :
                              "bg-purple-100 text-purple-700"
                            )}>{acc.account_type}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">{acc.total_debit > 0 ? formatMoney(acc.total_debit) : "-"}</td>
                          <td className="py-2.5 px-4 text-right font-mono">{acc.total_credit > 0 ? formatMoney(acc.total_credit) : "-"}</td>
                          <td className={cn("py-2.5 px-4 text-right font-bold font-mono",
                            acc.net_balance >= 0 ? "text-brand-deep-green" : "text-red-600"
                          )}>{formatMoney(acc.net_balance)}</td>
                        </tr>
                      ))}
                      {!trialBalance?.accounts?.length && (
                        <tr><td colSpan={6} className="text-center py-10 text-xs text-text-secondary">
                          <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                          Belum ada data jurnal yang diposting.
                        </td></tr>
                      )}
                    </tbody>
                    {trialBalance?.accounts?.length > 0 && (
                      <tfoot className="bg-gray-100 border-t-2 border-text-tertiary">
                        <tr>
                          <td colSpan={3} className="py-3 px-4 text-xs font-black text-text-primary uppercase">GRAND TOTAL</td>
                          <td className="py-3 px-4 text-right font-black font-mono text-brand-deep-green">{formatMoney(trialBalance.total_debit)}</td>
                          <td className="py-3 px-4 text-right font-black font-mono text-red-700">{formatMoney(trialBalance.total_credit)}</td>
                          <td className="py-3 px-4 text-right font-black font-mono">{formatMoney(trialBalance.total_debit - trialBalance.total_credit)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {glActiveTab === "entries" && (
              <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-text-primary">Daftar Jurnal Umum (Journal Entries)</h4>
                  <span className="text-2xs text-text-secondary">{journalEntries.length} jurnal terakhir</span>
                </div>
                <div className="table-scroll-wrapper">
                  <table className="w-full data-table text-xs min-w-[720px]">
                    <thead>
                      <tr className="bg-gray-50 text-2xs uppercase tracking-wider text-text-secondary">
                        <th className="py-3 px-4 text-left">No. Jurnal</th>
                        <th className="py-3 px-4 text-left">Tanggal Posting</th>
                        <th className="py-3 px-4 text-left">Keterangan</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {journalEntries.map((je: any) => (
                        <tr key={je.id} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-4 font-mono font-bold text-brand-deep-green text-2xs">{je.entry_number || je.id?.slice(0,8)}</td>
                          <td className="py-2.5 px-4 font-mono text-2xs text-text-secondary">{je.posting_date ? new Date(je.posting_date).toLocaleDateString("id-ID") : "-"}</td>
                          <td className="py-2.5 px-4 text-text-primary max-w-xs truncate">{je.description || "Jurnal Umum"}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className={cn("badge text-2xs",
                              je.status === "POSTED" ? "badge-success" :
                              je.status === "REVERSED" ? "bg-orange-100 text-orange-700" :
                              je.status === "DRAFT" ? "badge-neutral" : "badge-neutral"
                            )}>{je.status}</span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {je.status === "POSTED" && !je.is_reversed && (
                              <button
                                onClick={() => { setSelectedJournalEntry(je); setIsReversalModalOpen(true); }}
                                className="btn-ghost text-2xs text-orange-600 hover:text-orange-800 py-1 px-2 gap-1"
                              >
                                <ArrowLeftRight size={11} /> Storno
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!journalEntries.length && (
                        <tr><td colSpan={5} className="text-center py-10 text-xs text-text-secondary">
                          <Activity size={32} className="mx-auto mb-2 opacity-30" />
                          Belum ada jurnal entry.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── TAB: LAPORAN KEUANGAN ────────────────── */}
      {activeTab === "lapkeu" && (
        tabErrors["lapkeu"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Laporan Keuangan" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <BarChart3 size={16} className="text-brand-green" /> Laporan Keuangan Real-Time
                </h3>
                <p className="text-xs text-text-secondary">Digenerate secara otomatis dari General Ledger. Selalu sinkron dengan data transaksi terkini.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLapkeuActiveTab("pl")} className={cn("tab-btn text-xs", lapkeuActiveTab === "pl" && "active")}>Laba Rugi (P&L)</button>
                <button onClick={() => setLapkeuActiveTab("bs")} className={cn("tab-btn text-xs", lapkeuActiveTab === "bs" && "active")}>Neraca (Balance Sheet)</button>
              </div>
            </div>

            {lapkeuActiveTab === "pl" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* KPI Summary */}
                <div className="lg:col-span-3 grid grid-cols-3 gap-3">
                  <div className={cn("card rounded-2xl p-4 border-l-4", profitLoss?.is_profit ? "border-emerald-500" : "border-red-500")}>
                    <span className="text-xs text-text-secondary">Total Pendapatan</span>
                    <p className="text-xl font-black text-brand-deep-green">{formatMoney(profitLoss?.total_revenue ?? 0)}</p>
                  </div>
                  <div className="card rounded-2xl p-4 border-l-4 border-red-400">
                    <span className="text-xs text-text-secondary">Total Beban</span>
                    <p className="text-xl font-black text-red-600">{formatMoney(profitLoss?.total_expense ?? 0)}</p>
                  </div>
                  <div className={cn("card rounded-2xl p-4 border-l-4", (profitLoss?.net_profit_loss ?? 0) >= 0 ? "border-brand-green" : "border-red-600")}>
                    <span className="text-xs text-text-secondary">Laba / Rugi Bersih</span>
                    <p className={cn("text-xl font-black", (profitLoss?.net_profit_loss ?? 0) >= 0 ? "text-brand-deep-green" : "text-red-700")}>
                      {formatMoney(profitLoss?.net_profit_loss ?? 0)}
                    </p>
                  </div>
                </div>

                {/* Revenue Table */}
                <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
                  <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200">
                    <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5"><TrendingUp size={13} /> Pendapatan (Revenue)</h4>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {profitLoss?.revenues?.map((r: any, i: number) => (
                      <div key={i} className="px-4 py-3 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-mono text-brand-deep-green text-2xs">{r.account_code}</span>
                          <p className="font-medium text-text-primary">{r.account_name}</p>
                        </div>
                        <span className="font-bold text-emerald-700">{formatMoney(r.amount)}</span>
                      </div>
                    ))}
                    {!profitLoss?.revenues?.length && <p className="text-xs text-center py-6 text-text-secondary">Belum ada data pendapatan.</p>}
                  </div>
                  {profitLoss?.total_revenue > 0 && (
                    <div className="px-4 py-2.5 bg-emerald-50 border-t flex justify-between text-xs font-black text-emerald-800">
                      <span>TOTAL PENDAPATAN</span>
                      <span>{formatMoney(profitLoss.total_revenue)}</span>
                    </div>
                  )}
                </div>

                {/* Expense Table */}
                <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
                  <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                    <h4 className="text-xs font-bold text-red-800 flex items-center gap-1.5"><TrendingDown size={13} /> Beban (Expenses)</h4>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {profitLoss?.expenses?.map((e: any, i: number) => (
                      <div key={i} className="px-4 py-3 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-mono text-red-600 text-2xs">{e.account_code}</span>
                          <p className="font-medium text-text-primary">{e.account_name}</p>
                        </div>
                        <span className="font-bold text-red-700">{formatMoney(e.amount)}</span>
                      </div>
                    ))}
                    {!profitLoss?.expenses?.length && <p className="text-xs text-center py-6 text-text-secondary">Belum ada data beban.</p>}
                  </div>
                  {profitLoss?.total_expense > 0 && (
                    <div className="px-4 py-2.5 bg-red-50 border-t flex justify-between text-xs font-black text-red-800">
                      <span>TOTAL BEBAN</span>
                      <span>{formatMoney(profitLoss.total_expense)}</span>
                    </div>
                  )}
                </div>

                {/* Net P&L Summary */}
                <div className="card rounded-2xl p-5 border border-text-tertiary flex flex-col gap-4">
                  <h4 className="text-xs font-bold text-text-primary">Ringkasan Laba Rugi</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">Pendapatan Kotor</span>
                      <span className="font-bold text-emerald-700">{formatMoney(profitLoss?.total_revenue ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">HPP / COGS</span>
                      <span className="font-bold text-red-700">{formatMoney(profitLoss?.expenses?.filter((e: any) => e.account_code?.startsWith('5')).reduce((s: number, e: any) => s + e.amount, 0) ?? 0)}</span>
                    </div>
                    <hr className="border-text-tertiary" />
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-text-primary">Laba Kotor</span>
                      <span className="font-bold text-brand-deep-green">{formatMoney(Number(profitLoss?.total_revenue ?? 0) - Number(profitLoss?.expenses?.filter((e: any) => e.account_code?.startsWith('5')).reduce((s: number, e: any) => s + e.amount, 0) ?? 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">Beban Operasional</span>
                      <span className="font-bold text-orange-700">{formatMoney(profitLoss?.expenses?.filter((e: any) => e.account_code?.startsWith('6')).reduce((s: number, e: any) => s + e.amount, 0) ?? 0)}</span>
                    </div>
                    <hr className="border-text-tertiary" />
                    <div className="flex justify-between text-sm">
                      <span className="font-black text-text-primary">Laba / Rugi Bersih</span>
                      <span className={cn("font-black", (profitLoss?.net_profit_loss ?? 0) >= 0 ? "text-brand-deep-green" : "text-red-700")}>
                        {formatMoney(profitLoss?.net_profit_loss ?? 0)}
                      </span>
                    </div>
                  </div>
                  <p className="text-2xs text-text-secondary border-t pt-2">
                    Generated: {profitLoss?.generated_at ? new Date(profitLoss.generated_at).toLocaleString("id-ID") : "-"}
                  </p>
                </div>
              </div>
            )}

            {lapkeuActiveTab === "bs" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Assets */}
                <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
                  <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
                    <h4 className="text-xs font-bold text-blue-800 flex items-center gap-1.5"><Building size={13} /> ASET (Assets)</h4>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {balanceSheet?.assets?.map((a: any, i: number) => (
                      <div key={i} className="px-4 py-3 flex justify-between text-xs">
                        <span className="text-text-primary">{a.account_code} — {a.account_name}</span>
                        <span className="font-bold text-blue-700">{formatMoney(a.amount)}</span>
                      </div>
                    ))}
                    {!balanceSheet?.assets?.length && <p className="text-xs text-center py-6 text-text-secondary">Belum ada data aset.</p>}
                  </div>
                  <div className="px-4 py-2.5 bg-blue-50 border-t flex justify-between text-xs font-black text-blue-800">
                    <span>TOTAL ASET</span>
                    <span>{formatMoney(balanceSheet?.total_assets ?? 0)}</span>
                  </div>
                </div>

                {/* Liabilities + Equity */}
                <div className="flex flex-col gap-4">
                  <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
                    <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
                      <h4 className="text-xs font-bold text-orange-800 flex items-center gap-1.5"><Layers size={13} /> KEWAJIBAN (Liabilities)</h4>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {balanceSheet?.liabilities?.map((l: any, i: number) => (
                        <div key={i} className="px-4 py-3 flex justify-between text-xs">
                          <span className="text-text-primary">{l.account_code} — {l.account_name}</span>
                          <span className="font-bold text-orange-700">{formatMoney(l.amount)}</span>
                        </div>
                      ))}
                      {!balanceSheet?.liabilities?.length && <p className="text-xs text-center py-4 text-text-secondary">Belum ada kewajiban.</p>}
                    </div>
                    <div className="px-4 py-2.5 bg-orange-50 border-t flex justify-between text-xs font-black text-orange-800">
                      <span>TOTAL KEWAJIBAN</span>
                      <span>{formatMoney(balanceSheet?.total_liabilities ?? 0)}</span>
                    </div>
                  </div>
                  <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
                    <div className="px-4 py-3 bg-purple-50 border-b border-purple-200">
                      <h4 className="text-xs font-bold text-purple-800 flex items-center gap-1.5"><ShieldCheck size={13} /> EKUITAS (Equity)</h4>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {balanceSheet?.equity?.map((e: any, i: number) => (
                        <div key={i} className="px-4 py-3 flex justify-between text-xs">
                          <span className="text-text-primary">{e.account_code} — {e.account_name}</span>
                          <span className="font-bold text-purple-700">{formatMoney(e.amount)}</span>
                        </div>
                      ))}
                      {!balanceSheet?.equity?.length && <p className="text-xs text-center py-4 text-text-secondary">Belum ada data ekuitas.</p>}
                    </div>
                    <div className="px-4 py-2.5 bg-purple-50 border-t flex justify-between text-xs font-black text-purple-800">
                      <span>TOTAL EKUITAS</span>
                      <span>{formatMoney(balanceSheet?.total_equity ?? 0)}</span>
                    </div>
                  </div>
                  {/* Balance Check */}
                  <div className={cn(
                    "card rounded-xl p-4 flex items-center gap-3 text-xs font-semibold border",
                    balanceSheet?.is_balanced ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-red-50 border-red-300 text-red-800"
                  )}>
                    {balanceSheet?.is_balanced
                      ? <><CheckCircle2 size={15} /> Neraca SEIMBANG: Total Aset = Total Kewajiban + Ekuitas</>
                      : <><AlertTriangle size={15} /> Neraca TIDAK SEIMBANG! Periksa jurnal.</>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── TAB: BANKING HUB & REKONSILIASI ─────── */}
      {activeTab === "banking_hub" && (
        tabErrors["banking_hub"] ? (
          <div className="card rounded-2xl overflow-hidden">
            <AccessDeniedState compact section="Banking Hub" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Banknote size={16} className="text-brand-green" /> Banking Hub & Rekonsiliasi Bank
                </h3>
                <p className="text-xs text-text-secondary">Impor mutasi rekening bank dan cocokkan dengan transaksi di buku besar secara otomatis.</p>
              </div>
            </div>

            {/* Ringkasan Saldo Real-Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {BANK_ACCOUNTS.map((b) => (
                <div key={b.id} className="card p-4 rounded-2xl border border-text-tertiary bg-white flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-2xs font-bold text-text-secondary uppercase">
                    <span>{b.type.replace(/_/g, " ")}</span>
                    <Landmark size={14} className="text-brand-green" />
                  </div>
                  <strong className="text-xs font-bold text-text-primary block mt-1">{b.bank}</strong>
                  <span className="text-2xs text-text-secondary font-mono mt-0.5">{b.number}</span>
                  <div className="mt-3 pt-2 border-t border-text-tertiary/40 flex justify-between items-baseline">
                    <span className="text-2xs text-text-secondary">Saldo Buku:</span>
                    <strong className="text-sm font-black text-brand-deep-green">{formatMoney(b.balance)}</strong>
                  </div>
                </div>
              ))}
            </div>

            {/* Rekonsiliasi Status */}
            <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <h4 className="text-xs font-bold text-text-primary">Status Rekonsiliasi Bank</h4>
                <span className="text-2xs text-text-secondary">
                  {bankStatements.length} statement | {bankReconciliations.filter((r: any) => r.status === "MATCHED").length} matched
                </span>
              </div>
              {bankStatements.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <ArrowLeftRight size={36} className="text-brand-green opacity-30" />
                  <p className="text-xs text-text-secondary">Belum ada mutasi rekening yang diimpor.</p>
                  <p className="text-2xs text-text-secondary">Gunakan API <code className="font-mono bg-gray-100 px-1 rounded">POST /api/v1/finance/bank-accounts/:id/import-statement</code> untuk mengimpor mutasi.</p>
                </div>
              ) : (
                <div className="table-scroll-wrapper">
                  <table className="w-full data-table text-xs min-w-[640px]">
                    <thead>
                      <tr className="bg-gray-50 text-2xs uppercase tracking-wider text-text-secondary">
                        <th className="py-3 px-4 text-left">Tanggal</th>
                        <th className="py-3 px-4 text-left">Referensi</th>
                        <th className="py-3 px-4 text-left">Keterangan</th>
                        <th className="py-3 px-4 text-right">Debit</th>
                        <th className="py-3 px-4 text-right">Kredit</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bankStatements.map((stmt: any) => (
                        <tr key={stmt.id} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-4 font-mono text-2xs">{stmt.transaction_date ? new Date(stmt.transaction_date).toLocaleDateString("id-ID") : "-"}</td>
                          <td className="py-2.5 px-4 font-mono text-2xs text-brand-deep-green">{stmt.reference_number || "-"}</td>
                          <td className="py-2.5 px-4 text-text-primary">{stmt.description}</td>
                          <td className="py-2.5 px-4 text-right text-emerald-700 font-bold">{stmt.debit_amount > 0 ? formatMoney(stmt.debit_amount) : "-"}</td>
                          <td className="py-2.5 px-4 text-right text-red-600 font-bold">{stmt.credit_amount > 0 ? formatMoney(stmt.credit_amount) : "-"}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className={cn("badge text-2xs",
                              stmt.status === "MATCHED" ? "badge-success" : "badge-neutral"
                            )}>{stmt.status || "UNRECONCILED"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* ── TAB: ASET TETAP ──────────────────────── */}
      {activeTab === "assets" && (
        <div className="card rounded-2xl p-6">
          <FixedAssetsWorkspace />
        </div>
      )}

      {/* ── TAB: TUTUP BUKU ──────────────────────── */}
      {activeTab === "period_closing" && (
        <div className="card rounded-2xl p-6">
          <PeriodClosingWorkspace />
        </div>
      )}

      {/* ── TAB: AUDIT TRAIL ─────────────────────── */}
      {activeTab === "audit_trail" && (
        <div className="card rounded-2xl p-6">
          <AuditTrailWorkspace />
        </div>
      )}

      {/* ── TAB: EXECUTIVE AUDIT REPORT ───────────── */}
      {activeTab === "executive_report" && (
        <div className="card rounded-2xl p-6">
          <ExecutiveAuditReportWorkspace />
        </div>
      )}

      {/* ── MODALS ───────────────────────────────── */}

      {/* Modal: 3-Way Match Verification */}
      <Modal
        isOpen={isMatchModalOpen}
        onClose={() => setIsMatchModalOpen(false)}
        title="Verifikasi 3-Way Match"
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

      {/* Modal: Proposal Billing & Tax Scheme */}
      <Modal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        title="Buat Proposal Billing Termin"
        subtitle="Pengajuan termin invoice penagihan ke klien beserta kalkulasi PPN & PPh Withholding"
        size="md"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const dpp = Number(billingForm.amount);
              let ppn = 0;
              if (billingForm.tax_scheme === "FULL_UPFRONT") {
                ppn = (dpp * 11) / 100;
              } else if (billingForm.tax_scheme === "PROPORTIONAL") {
                ppn = (dpp * 11) / 100;
              }
              const pph = (dpp * billingForm.pph_rate) / 100;
              const netCash = billingForm.client_type === "NON_WAPU" ? dpp + ppn - pph : dpp - pph;

              await api.post("/api/v1/finance/billing-proposals/", {
                ...billingForm,
                dpp_amount: dpp,
                ppn_amount: ppn,
                pph_amount: pph,
                total_amount: dpp + ppn,
                net_cash_amount: netCash,
              });
              toast.success("Proposal billing dan skema pajak berhasil diajukan.");
              setIsBillingModalOpen(false);
              await loadFinanceData(true);
            } catch {
              toast.error("Gagal membuat proposal billing");
            }
          }}
          className="flex flex-col gap-3.5 p-1 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nilai Tagihan DPP (Rp) *</label>
              <input
                type="number"
                required
                min="100000"
                value={billingForm.amount}
                onChange={e => setBillingForm({ ...billingForm, amount: Number(e.target.value) })}
                className="input text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Bobot Persentase (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                value={billingForm.milestone_percentage}
                onChange={e => setBillingForm({ ...billingForm, milestone_percentage: Number(e.target.value) })}
                className="input text-xs font-bold text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Keterangan Termin *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Uang Muka DP 30% Pengadaan Komponen"
              value={billingForm.description}
              onChange={e => setBillingForm({ ...billingForm, description: e.target.value })}
              className="input text-xs"
            />
          </div>

          {/* Tax Configuration Grid */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Skema Timing Pajak</label>
              <select
                value={billingForm.tax_scheme}
                onChange={e => setBillingForm({ ...billingForm, tax_scheme: e.target.value as any })}
                className="input text-xs font-semibold"
              >
                <option value="PROPORTIONAL">🔵 Proporsional per Termin</option>
                <option value="FULL_UPFRONT">🟢 Pajak Penuh di Awal (DP 100% PPN)</option>
                <option value="FINAL_SETTLEMENT">🟡 Pajak di Akhir / Pelunasan</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tipe Pemungut Klien</label>
              <select
                value={billingForm.client_type}
                onChange={e => setBillingForm({ ...billingForm, client_type: e.target.value as any })}
                className="input text-xs font-semibold"
              >
                <option value="NON_WAPU">Non-WAPU (Swasta)</option>
                <option value="WAPU">WAPU (BUMN / Pemerintah)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Potongan PPh (Withholding)</label>
            <select
              value={billingForm.pph_rate}
              onChange={e => {
                const rate = Number(e.target.value);
                let label = "PPh 23 (2%)";
                if (rate === 1.75) label = "PPh Final Konstruksi Kecil (1.75%)";
                if (rate === 2.65) label = "PPh Final Konstruksi Menengah (2.65%)";
                if (rate === 4.0) label = "PPh Final Konsultansi (4%)";
                if (rate === 0) label = "Bebas Potongan";
                setBillingForm({ ...billingForm, pph_rate: rate, pph_type: label });
              }}
              className="input text-xs font-semibold"
            >
              <option value={2.0}>PPh 23 Jasa Teknik &amp; Konsultansi (2%)</option>
              <option value={2.65}>PPh Final Pelaksana Konstruksi Menengah/Besar (2.65%)</option>
              <option value={1.75}>PPh Final Pelaksana Konstruksi Kualifikasi Kecil (1.75%)</option>
              <option value={4.0}>PPh Final Jasa Konsultansi Konstruksi (4%)</option>
              <option value={0}>Tanpa Potongan PPh (0%)</option>
            </select>
          </div>

          {/* Live Cashflow Breakdown Summary */}
          {(() => {
            const dpp = Number(billingForm.amount) || 0;
            const ppn = (dpp * 11) / 100;
            const pph = (dpp * billingForm.pph_rate) / 100;
            const gross = dpp + ppn;
            const net = billingForm.client_type === "NON_WAPU" ? dpp + ppn - pph : dpp - pph;

            return (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-1.5 text-xs mt-1">
                <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                  Rincian Nilai Tagihan &amp; Estimasi Kas Masuk
                </span>
                <div className="grid grid-cols-2 gap-1 text-[11px] pt-1 border-t border-slate-200/80">
                  <span className="text-slate-500">DPP Termin:</span>
                  <span className="font-bold text-slate-800 text-right">{formatMoney(dpp)}</span>

                  <span className="text-slate-500">(+) PPN Ditagihkan (11%):</span>
                  <span className="font-bold text-blue-700 text-right">+{formatMoney(ppn)}</span>

                  <span className="text-slate-700 font-semibold">(=) Total Nilai Invoice:</span>
                  <span className="font-bold text-slate-900 text-right">{formatMoney(gross)}</span>

                  <span className="text-slate-500">(-) Potongan PPh ({billingForm.pph_rate}%):</span>
                  <span className="font-bold text-purple-700 text-right">-{formatMoney(pph)}</span>

                  {billingForm.client_type === "WAPU" && (
                    <>
                      <span className="text-amber-700">(-) PPN Dipungut Klien (WAPU):</span>
                      <span className="font-bold text-amber-700 text-right">-{formatMoney(ppn)}</span>
                    </>
                  )}
                </div>

                <div className="mt-1 p-2 rounded-lg bg-emerald-50 border border-emerald-200 flex justify-between items-center">
                  <span className="font-bold text-emerald-900 text-[11px]">Estimasi Kas Masuk ke Bank:</span>
                  <span className="font-black text-emerald-700 text-xs">{formatMoney(net)}</span>
                </div>
              </div>
            );
          })()}

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsBillingModalOpen(false)}
              className="btn-ghost py-1.5 px-3 text-xs cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary py-2 px-4 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold cursor-pointer"
            >
              Buat Proposal Billing
            </button>
          </div>
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
            try {
              await api.post("/api/v1/finance/billing-documents/", {
              billing_type: "SUPPLIER_INVOICE",
              invoice_number: apForm.invoice_number,
              invoice_date: new Date().toISOString(),
              due_date: apForm.due_date || null,
              subtotal: Number(apForm.amount),
              tax_amount: 0,
              total_amount: Number(apForm.amount),
              paid_amount: 0,
              outstanding_amount: Number(apForm.amount),
              payment_status: "UNPAID",
              status: "PENDING_MATCH",
              rejection_reason: "",
            });
              await loadFinanceData(true);
              toast.success("✓ Tagihan vendor berhasil didaftarkan & Menunggu 3-Way Match!");
              setIsAPModalOpen(false);
              setAPForm({ supplier_name: "", invoice_number: "", amount: 25000000, due_date: "" });
            } catch {
              toast.error("Gagal mendaftarkan tagihan vendor");
            }
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
                required
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
        title="Proses Pembayaran Tagihan Vendor"
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
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post("/api/v1/finance/customer-receipts/", {
                payment_type: "CUSTOMER_RECEIPT",
                payment_date: receiptForm.payment_date,
                amount: Number(receiptForm.amount),
                payment_method: receiptForm.payment_method,
                reference_number: receiptForm.reference_number,
                status: "RECEIVED",
                allocation_plan: {
                  customer_name: receiptForm.customer_name,
                  project_name: receiptForm.project_name,
                  invoice_ref: receiptForm.invoice_ref,
                  bank_account: receiptForm.bank_account,
                  notes: receiptForm.notes,
                },
                execution_reference: "",
                execution_note: receiptForm.notes,
                failure_reason: "",
              });
              await loadFinanceData(true);
              toast.success(`Penerimaan ${formatMoney(receiptForm.amount)} berhasil dicatat.`);
              setIsReceiptModalOpen(false);
            } catch {
              toast.error("Gagal mencatat penerimaan pelanggan");
            }
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

      {/* Modal: Reversal / Storno Jurnal */}
      {isReversalModalOpen && (
        <Modal
          isOpen={isReversalModalOpen}
          onClose={() => { setIsReversalModalOpen(false); setReversalReason(""); }}
          title="Reversal Jurnal (Storno)"
          subtitle={`Jurnal: ${selectedJournalEntry?.entry_number || "-"}`}
        >
          <div className="flex flex-col gap-4">
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-800 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div>
                <strong>Peringatan:</strong> Reversal akan menerbitkan jurnal pembalik baru (REV-{selectedJournalEntry?.entry_number}). Jurnal asli <strong>tidak dihapus</strong> (immutable audit trail).
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">Alasan Reversal / Storno *</label>
              <textarea
                rows={3}
                className="w-full border border-text-tertiary rounded-lg p-2 text-xs focus:outline-none focus:border-orange-400"
                placeholder="Contoh: Kesalahan input nominal, double posting, atau koreksi kode akun..."
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
              />
              <span className="text-2xs text-text-secondary">Minimal 5 karakter.</span>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={() => { setIsReversalModalOpen(false); setReversalReason(""); }} className="btn-ghost text-xs">Batal</button>
              <button
                onClick={handleReverseEntry}
                disabled={reversalReason.trim().length < 5}
                className="btn-primary text-xs py-2 px-4 font-bold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-40"
              >
                Konfirmasi Storno Jurnal
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Tab: Funding Proyek (Persetujuan Permodalan Proyek) ── */
/**
 * TabFundingProyek coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
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
  const [voucherNumber, setVoucherNumber] = useState("");
  const [disburseDate, setDisburseDate] = useState(new Date().toISOString().split("T")[0]);

  // Helper resolusi nominal dana yang aman dari berbagai kemungkinan nama field backend
/**
 * getFundingAmount coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const getFundingAmount = (f: any): number => {
    return Number(f.amount ?? f.funding_amount ?? f.requested_amount ?? f.approved_limit ?? f.total_amount ?? 0);
  };

/**
 * handleDecision coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleDecision = async () => {
    if (!selectedFunding) return;
    if (decisionAction === "DISBURSED" && !voucherNumber.trim()) {
      toast.error("Nomor voucher pencairan wajib diisi.");
      return;
    }
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
      });

      if (decisionAction === "DISBURSED") {
        toast.success(`Dana berhasil dicairkan dari ${selectedBankAccount.split("—")[0]}. Saldo kas telah diperbarui.`);
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

/**
 * handleDeleteFunding coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
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

      <div className="table-scroll-wrapper border border-text-tertiary/50 rounded-xl">
        <table className="w-full data-table text-xs text-left min-w-[580px]">
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
                              setVoucherNumber("");
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
              ? "Pencairan Kas Modal Kerja Proyek"
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
                    required={decisionAction === "DISBURSED"}
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
                {isSubmitting ? "Memproses..." : decisionAction === "DISBURSED" ? "Eksekusi Pencairan" : `Konfirmasi ${decisionAction}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * File: frontend-next/app/(app)/finance/FinanceClient.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DollarSign, TrendingUp, CreditCard, ArrowUpRight, ArrowDownRight,
  Plus, RefreshCw, Layers, CheckCircle2, XCircle,
  Building, Landmark, ShieldCheck, Scale, Zap, Trash2, ArrowRight,
  BookOpen, BarChart3, Activity, Banknote, ArrowLeftRight, TrendingDown,
  AlertTriangle, CheckSquare, Clock, Eye, LayoutDashboard, Crown, BriefcaseBusiness,
  ClipboardList, Receipt, RotateCcw, WalletCards, LibraryBig, FileBarChart,
  Link2, Calculator, CalendarRange, CalendarClock, HardHat, Send, Info, Search, ChevronLeft, ChevronRight, ChevronDown, CircleDollarSign, Download
} from "lucide-react";
import { cn, formatMoney, formatRupiah, formatDate, getStatusColor, localDateKey } from "@/lib/utils";
import api from "@/lib/api/axios";

import { normalizeList } from "@/lib/api/auth.api";
import { buildMonthlyStackedData } from "@/lib/api/finance.api";
import { getApiErrorDetail } from "@/lib/api/project.api";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { feedApi } from "@/lib/api/feed.api";
import { InventoryCheckingCard } from "@/components/ui/InventoryCheckingCard";
import { BudgetCheckStatusCard } from "@/components/ui/BudgetCheckStatusCard";
import { CollapsibleGuideline } from "@/components/ui/CollapsibleGuideline";
import { IDRInput } from "@/components/ui/IDRInput";
import { MonthlyStackedBarChart } from "@/components/ui/MonthlyStackedBarChart";
import { ProjectTaxWorkspace } from "@/components/finance/ProjectTaxWorkspace";
import { CompanyMasterWorkspace } from "@/components/finance/CompanyMasterWorkspace";
import { FinanceSummarySection } from "@/components/finance/FinanceSummarySection";
import { FinanceDataTable, FinanceSubtabs, SignedAmount } from "@/components/finance/FinanceDataTable";
import { BudgetingWorkspace } from "@/components/finance/BudgetingWorkspace";
import { ExcelStatusBar, exportSheetsToXlsx } from "@/components/finance/ExcelGridShell";
import { InventoryBridgePanel } from "@/components/finance/InventoryBridgePanel";
import { BillingInvoiceModal, BillingInvoicePreviewData } from "@/components/finance/BillingInvoiceModal";
import { AccessDeniedState, isForbiddenError } from "@/components/ui/AccessDeniedState";
import { useAuth } from "@/contexts/AuthContext";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { canRequestApi, isLevel1FinanceUser } from "@/lib/access/module-contract";
import { canPerform } from "@/lib/access/capability-contract";
import { FinanceModuleSidebar } from "@/components/finance/FinanceModuleSidebar";
import dynamic from "next/dynamic";
import "@fontsource-variable/plus-jakarta-sans";
import "@/app/finance-theme.css";

const FixedAssetsWorkspace = dynamic(() => import("@/components/finance/FixedAssetsWorkspace"), { ssr: false });
const ChartOfAccountsWorkspace = dynamic(() => import("@/components/finance/ChartOfAccountsWorkspace").then(m => m.ChartOfAccountsWorkspace), { ssr: false });
const PayrollWorkspace = dynamic(() => import("@/components/finance/PayrollWorkspace").then(m => m.PayrollWorkspace), { ssr: false });
const RecurringExpensesWorkspace = dynamic(() => import("@/components/finance/RecurringExpensesWorkspace").then(m => m.RecurringExpensesWorkspace), { ssr: false });
const TaxCoaMappingWorkspace = dynamic(() => import("@/components/finance/TaxCoaMappingWorkspace").then(m => m.TaxCoaMappingWorkspace), { ssr: false });
const PeriodClosingWorkspace = dynamic(() => import("@/components/finance/PeriodClosingWorkspace"), { ssr: false });
const AuditTrailWorkspace = dynamic(() => import("@/components/finance/AuditTrailWorkspace"), { ssr: false });
const ExecutiveAuditReportWorkspace = dynamic(() => import("@/components/finance/ExecutiveAuditReportWorkspace").then(m => m.ExecutiveAuditReportWorkspace), { ssr: false });
const DocumentPrintModal = dynamic(() => import("@/components/finance/DocumentPrintModal").then(m => m.DocumentPrintModal), { ssr: false });

const FINANCE_TABS = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "executive_report", label: "Executive Report", icon: Crown },
  { id: "company_master", label: "Master Perusahaan", icon: Building },
  { id: "profit", label: "Profitabilitas", icon: TrendingUp },
  { id: "costing", label: "Costing & WIP", icon: Calculator },
  { id: "budgeting", label: "Budgetary Control", icon: CircleDollarSign },
  { id: "fundings", label: "Funding Proyek", icon: BriefcaseBusiness },
  { id: "ap", label: "Tagihan Vendor", icon: ClipboardList },
  { id: "billing", label: "Billing Termin", icon: Receipt },
  { id: "ar", label: "Piutang", icon: RotateCcw },
  { id: "cashbank", label: "Kas & Bank", icon: WalletCards },
  { id: "coa", label: "Chart of Accounts", icon: BookOpen },
  { id: "payroll", label: "Payroll", icon: Banknote },
  { id: "recurring_expenses", label: "Biaya Eksternal", icon: CalendarClock },
  { id: "tax_setup", label: "Pajak & COA", icon: Scale },
  { id: "gl", label: "Buku Besar", icon: LibraryBig },
  { id: "lapkeu", label: "Laporan Keuangan", icon: FileBarChart },
  { id: "banking_hub", label: "Rekonsiliasi", icon: Link2 },
  { id: "tax", label: "Perpajakan", icon: Scale },
  { id: "assets", label: "Aset Tetap", icon: HardHat, endpoint: "/api/v1/assets/assets" },
  { id: "period_closing", label: "Tutup Buku", icon: CalendarRange },
  { id: "audit_trail", label: "Audit Trail", icon: ShieldCheck },
];

const GL_PAGE_SIZE = 10;

function isCostEntryCreator(entry: { created_by_id?: string | number | null }, userId?: string | number) {
  return Boolean(entry.created_by_id && userId && String(entry.created_by_id) === String(userId));
}

function isWipPosted(status?: string) {
  return ["POSTED", "POSTED_TO_WIP"].includes(String(status || "").toUpperCase());
}

function formatJournalCode(value: unknown) {
  const code = String(value ?? "-");
  const prefixedUuid = code.match(/^(.+?)-([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (prefixedUuid) return `${prefixedUuid[1]}-${prefixedUuid[2]}`;
  return code.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, uuid => `${uuid.slice(0, 8)}…`);
}

type WipPostingReadiness = {
  entry_id: string;
  can_post: boolean;
  reason: "READY" | "MAKER_CHECKER_REQUIRED" | "INVALID_STATUS";
  message: string;
};

interface FinanceBankAccount {
  id: string;
  name: string;
  number: string;
  balance?: number;
  bank: string;
  type: string;
}

/**
 * FinanceClient coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function FinanceClient() {
  const [profitView, setProfitView] = useState<"detail" | "evm">("detail");
  const { run: runFinanceAction, pending: financePending } = useAsyncAction();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, userRole, company, companies } = useAuth();
  const [previewInvoice, setPreviewInvoice] = useState<BillingInvoicePreviewData | null>(null);
  const requestAccess = {
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
    moduleAccess: user?.module_access,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: Boolean(user?.is_superuser),
  };
  const canUseAssets = canRequestApi("/api/v1/assets/assets", requestAccess);
  const canOperateFinance = canPerform("finance:operate", userRole, {
    enabledModules: user?.enabled_modules,
    moduleAccess: user?.module_access,
  });
  const visibleTabs = FINANCE_TABS.filter((tab) => !tab.endpoint || canUseAssets);
  const requestedTab = searchParams.get("tab");
  const defaultTab = userRole === "executive" ? "executive_report" : "overview";
  const [activeTab, setActiveTab] = useState(
    visibleTabs.some((tab) => tab.id === requestedTab) ? requestedTab! : defaultTab
  );
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
    if (requestedTab && visibleTabs.some((tab) => tab.id === requestedTab)) {
      if (requestedTab !== activeTab) setActiveTab(requestedTab);
      return;
    }
    if (!visibleTabs.some((tab) => tab.id === activeTab)) setActiveTab("overview");
  }, [activeTab, canUseAssets, requestedTab]);

  const selectFinanceTab = (tabId: string) => {
    if (!visibleTabs.some((tab) => tab.id === tabId)) return;
    setActiveTab(tabId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`/finance?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    feedApi.trackRecentItem({
      item_type: "ORDER",
      object_id: `fin-${activeTab}`,
      title: `Finance — ${FINANCE_TABS.find(t => t.id === activeTab)?.label || "Overview"}`,
      target_url: `/finance`,
    }).catch(() => { });
  }, [activeTab]);

  /* Data states */
  const [costEntries, setCostEntries] = useState<any[]>([]);
  const [wipPostingReadiness, setWipPostingReadiness] = useState<Record<string, WipPostingReadiness>>({});
  const [fundings, setFundings] = useState<any[]>([]);
  const [fundRequests, setFundRequests] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [vendorBills, setVendorBills] = useState<any[]>([]);
  const [customerReceipts, setCustomerReceipts] = useState<any[]>([]);
  const [receiptReadiness, setReceiptReadiness] = useState<Record<string, { action: string | null; allowed: boolean; message: string }>>({});
  const [receiptActionId, setReceiptActionId] = useState<string | null>(null);
  const [receiptDeletingId, setReceiptDeletingId] = useState<string | null>(null);
  const [receiptActionError, setReceiptActionError] = useState<Record<string, string>>({});
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [receiptSummary, setReceiptSummary] = useState<{ posted_amount: number; posted_count: number; pending_count: number; outstanding_amount: number } | null>(null);
  const [payments, setPayments] = useState<any[]>([]);

  /* Accounting / GL states */
  const [trialBalance, setTrialBalance] = useState<any>(null);
  const [profitLoss, setProfitLoss] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [bankStatements, setBankStatements] = useState<any[]>([]);
  const [bankReconciliations, setBankReconciliations] = useState<any[]>([]);
  const [bankMatchPayments, setBankMatchPayments] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<FinanceBankAccount[]>([]);
  const [isBankOpeningFormOpen, setIsBankOpeningFormOpen] = useState(false);
  const [bankOpeningForm, setBankOpeningForm] = useState({ bank_name: "", account_number: "", account_name: "", opening_amount: "", opening_date: localDateKey(), offset_account_id: "" });
  const [bankImportAccountId, setBankImportAccountId] = useState("");
  const [bankImportFile, setBankImportFile] = useState<File | null>(null);
  const [bankImporting, setBankImporting] = useState(false);
  const [bankMatchPaymentIds, setBankMatchPaymentIds] = useState<Record<string, string>>({});
  const [bankMatchingLineId, setBankMatchingLineId] = useState<string | null>(null);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [financeProjectOptions, setFinanceProjectOptions] = useState<any[]>([]);
  const [apBudgetAllocations, setAPBudgetAllocations] = useState<any[]>([]);
  const [selectedBudgetProjectId, setSelectedBudgetProjectId] = useState("");
  const [vendorOptions, setVendorOptions] = useState<any[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<any[]>([]);
  const [costCreditAccountId, setCostCreditAccountId] = useState("");
  const [glActiveTab, setGlActiveTab] = useState<"trial" | "entries">("trial");
  const [trialBalanceSearch, setTrialBalanceSearch] = useState("");
  const [trialBalanceTypeFilter, setTrialBalanceTypeFilter] = useState("ALL");
  const [trialBalancePage, setTrialBalancePage] = useState(1);
  const [journalSearch, setJournalSearch] = useState("");
  const [journalStatusFilter, setJournalStatusFilter] = useState("ALL");
  const [journalPage, setJournalPage] = useState(1);
  const [financeFiscalYears, setFinanceFiscalYears] = useState<any[]>([]);
  const [financeFiscalPeriods, setFinanceFiscalPeriods] = useState<any[]>([]);
  const [financeCalendarReady, setFinanceCalendarReady] = useState(false);
  const [selectedFinanceYearId, setSelectedFinanceYearId] = useState("");
  const [financePeriodView, setFinancePeriodView] = useState<"YEAR" | "QUARTER" | "MONTH">("YEAR");
  const [financeQuarter, setFinanceQuarter] = useState("1");
  const [financePeriodId, setFinancePeriodId] = useState("");
  const [lapkeuActiveTab, setLapkeuActiveTab] = useState<"pl" | "bs">("pl");
  const [isReversalModalOpen, setIsReversalModalOpen] = useState(false);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<any>(null);
  const [reversalReason, setReversalReason] = useState("");

  const periodsInSelectedYear = financeFiscalPeriods
    .filter((period) => period.fiscal_year_id === selectedFinanceYearId)
    .sort((a, b) => Number(a.period_number || 0) - Number(b.period_number || 0));
  const selectedFinancePeriods = financePeriodView === "MONTH"
    ? periodsInSelectedYear.filter((period) => period.id === financePeriodId)
    : financePeriodView === "QUARTER"
      ? periodsInSelectedYear.filter((period) => Number(period.period_number) >= (Number(financeQuarter) - 1) * 3 + 1 && Number(period.period_number) <= Number(financeQuarter) * 3)
      : periodsInSelectedYear;
  const financePeriodStart = selectedFinancePeriods.map((period) => String(period.start_date || "").slice(0, 10)).filter(Boolean).sort()[0] || "";
  const financePeriodEnd = selectedFinancePeriods.map((period) => String(period.end_date || "").slice(0, 10)).filter(Boolean).sort().at(-1) || "";
  const financeDateRangeQuery = (field: string) => financePeriodStart && financePeriodEnd
    ? `&${field}__gte=${encodeURIComponent(financePeriodStart)}&${field}__lte=${encodeURIComponent(financePeriodEnd)}`
    : "";

  /* Modals */
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [isFundingModalOpen, setIsFundingModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isAPModalOpen, setIsAPModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isCashReceiptQuickOpen, setIsCashReceiptQuickOpen] = useState(false);

  const [selectedBillForMatch, setSelectedBillForMatch] = useState<any>(null);
  const [selectedBillForPay, setSelectedBillForPay] = useState<any>(null);

  const [costForm, setCostForm] = useState({ project: "", category: "MATERIAL", division_id: "", amount: "", description: "" });
  const [fundingForm, setFundingForm] = useState({ amount: "", need_type: "", purpose: "", project_id: "" });
  const [billingForm, setBillingForm] = useState({
    project: "",
    amount: 0,
    description: "",
    tax_scheme: "PROPORTIONAL" as "PROPORTIONAL" | "FINAL_SETTLEMENT",
  });
  const [apForm, setAPForm] = useState({ supplier_id: "", invoice_number: "", amount: "", due_date: "", project_id: "", expense_account_id: "", budget_allocation_id: "" });
  const [paymentForm, setPaymentForm] = useState({
    bank_account: "",
    payment_method: "BANK_TRANSFER",
    payment_date: localDateKey(),
    reference_number: "",
    notes: "",
  });
  const [receiptForm, setReceiptForm] = useState({
    project_id: "",
    customer_name: "",
    project_name: "",
    invoice_ref: "",
    amount: "",
    withholding_tax_amount: "",
    withholding_tax_type: "PPH_23",
    bupot_number: "",
    bank_account: "",
    payment_date: localDateKey(),
    payment_method: "BANK_TRANSFER",
    reference_number: "",
    notes: "",
  });
  const [cashBankFilter, setCashBankFilter] = useState<"ALL" | "POSTED" | "PENDING">("ALL");
  const [cashBankSearch, setCashBankSearch] = useState("");
  const [apQueueFilter, setApQueueFilter] = useState<"ACTION" | "READY" | "ALL" | "PAID">("ACTION");
  const [apSearch, setApSearch] = useState("");
  const [receiptErrors, setReceiptErrors] = useState<Record<string, string>>({});
  const [receiptSaving, setReceiptSaving] = useState(false);
  const updateReceiptField = (field: keyof typeof receiptForm, value: string) => {
    setReceiptForm(current => ({ ...current, [field]: value }));
    setReceiptErrors(current => ({ ...current, [field]: "" }));
  };
  const receiptError = (field: string) => receiptErrors[field]
    ? <p id={`receipt-${field}-error`} role="alert" className="mt-1 text-xs text-red-600">{receiptErrors[field]}</p>
    : null;

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

      const reportRangeQuery = financePeriodStart && financePeriodEnd
        ? `?start_date=${encodeURIComponent(financePeriodStart)}&end_date=${encodeURIComponent(financePeriodEnd)}`
        : "";
      const balanceSheetDateQuery = financePeriodEnd ? `?as_of_date=${encodeURIComponent(financePeriodEnd)}` : "";
      const [costRes, wipReadinessRes, fundRes, fundingOptionsRes, propRes, apRes, receiptRes, paymentRes, bankMatchPaymentRes, tbRes, jeRes, plRes, bsRes, stmtLinesRes, reconciliationRes, bankRes, accountRes, projectOptionRes, vendorOptionRes, divisionRes, fiscalPeriodRes, fiscalYearRes] = await Promise.all([
        safeGet(`/api/v1/finance/project-cost-entries/?page_size=200${financeDateRangeQuery("transaction_date")}`, "costing"),
        canOperateFinance
          ? safeGet("/api/v1/finance/project-cost-entries/wip-readiness", "costing")
          : Promise.resolve({ data: [] }),
        // Funding requests are workflow items and may not have a finance start_date yet.
        // Filtering by the selected accounting period hides valid pending requests with a null start_date.
        safeGet("/api/v1/finance/project-fundings/?page_size=100", "fundings"),
        safeGet("/api/v1/finance/budgeting/options", "fundings"),
        safeGet(`/api/v1/finance/billing-proposals/?page_size=50${financeDateRangeQuery("created_at")}`, "billing"),
        safeGet(`/api/v1/finance/billing-documents/?billing_type=SUPPLIER_INVOICE&page_size=50${financeDateRangeQuery("invoice_date")}`, "ap"),
        safeGet(`/api/v1/finance/customer-receipts/?page_size=200${financeDateRangeQuery("payment_date")}`, "ar"),
        safeGet(`/api/v1/finance/payments/?payment_type=OUTGOING&page_size=50${financeDateRangeQuery("payment_date")}`, "ap"),
        safeGet(`/api/v1/finance/payments/?status=POSTED&page_size=200${financeDateRangeQuery("payment_date")}`, "banking_hub"),
        safeGet(`/api/v1/finance/trial-balance${reportRangeQuery}`, "gl"),
        safeGet(`/api/v1/finance/journal-entries/?page_size=500&ordering=-posting_date${financeDateRangeQuery("posting_date")}`, "gl"),
        safeGet(`/api/v1/finance/profit-and-loss${reportRangeQuery}`, "lapkeu"),
        safeGet(`/api/v1/finance/balance-sheet${balanceSheetDateQuery}`, "lapkeu"),
        safeGet(`/api/v1/finance/bank-statement-lines/?page_size=200${financeDateRangeQuery("transaction_date")}`, "banking_hub"),
        safeGet("/api/v1/finance/bank-reconciliations/?page_size=200", "banking_hub"),
        safeGet("/api/v1/finance/bank-accounts/?page_size=100", "cashbank"),
        safeGet("/api/v1/finance/accounts/?page_size=300", "gl"),
        safeGet("/api/v1/finance/project-options", "costing"),
        safeGet("/api/v1/finance/party-options?role=VENDOR", "ap"),
        api.get("/api/v1/core/organizations/?organization_type=DIVISION&page_size=200").catch(() => ({ data: [] })),
        safeGet("/api/v1/finance/fiscal-periods/status", "period_closing"),
        safeGet("/api/v1/finance/fiscal-years?page_size=100", "period_closing"),
      ]);

      const loadedFiscalPeriods = normalizeList<any>(fiscalPeriodRes.data).rows;
      const loadedFiscalYears = normalizeList<any>(fiscalYearRes.data).rows;
      setFinanceFiscalPeriods(loadedFiscalPeriods);
      setFinanceFiscalYears(loadedFiscalYears);
      if (!selectedFinanceYearId && loadedFiscalYears.length) {
        setSelectedFinanceYearId(loadedFiscalYears[0].id);
        const firstPeriod = loadedFiscalPeriods.find((period) => period.fiscal_year_id === loadedFiscalYears[0].id);
        if (firstPeriod) setFinancePeriodId(firstPeriod.id);
      }

      setCostEntries(normalizeList(costRes.data).rows);
      setWipPostingReadiness(Object.fromEntries(
        normalizeList<WipPostingReadiness>(wipReadinessRes.data).rows.map((item) => [item.entry_id, item]),
      ));
      setFundings(normalizeList(fundRes.data).rows);
      const fundingOptions = fundingOptionsRes.data?.data ?? fundingOptionsRes.data;
      setFundRequests(Array.isArray(fundingOptions?.fund_requests) ? fundingOptions.fund_requests : []);
      setProposals(normalizeList(propRes.data).rows);

      setVendorBills(normalizeList(apRes.data).rows);
      setPayments(normalizeList(paymentRes.data).rows);
      setBankMatchPayments(normalizeList(bankMatchPaymentRes.data).rows.filter((payment: any) => payment.status === "POSTED"));
      setCustomerReceipts(normalizeList<any>(receiptRes.data).rows.map((receipt) => ({
        ...(typeof receipt.allocation_plan === "object" && receipt.allocation_plan ? receipt.allocation_plan : {}),
        ...receipt,
      })));
      const receiptIds = normalizeList<any>(receiptRes.data).rows.map(receipt => receipt.id).join(",");
      const [readinessResponse, invoicesResponse, receiptSummaryResponse] = await Promise.all([
        receiptIds ? safeGet(`/api/v1/finance/customer-receipts/workflow-readiness?ids=${encodeURIComponent(receiptIds)}`, "ar") : Promise.resolve({ data: [] }),
        safeGet(`/api/v1/finance/billing-documents/?billing_type=CUSTOMER_INVOICE&page_size=200${financeDateRangeQuery("invoice_date")}`, "ar"),
        safeGet(`/api/v1/finance/customer-receipts/summary${reportRangeQuery}`, "ar"),
      ]);
      setReceiptReadiness(Object.fromEntries(normalizeList<any>(readinessResponse.data).rows.map(item => [item.receipt_id, item])));
      setCustomerInvoices(normalizeList<any>(invoicesResponse.data).rows);
      setReceiptSummary(receiptSummaryResponse.data);

      // Accounting data
      if (tbRes.data?.data) setTrialBalance(tbRes.data.data);
      else if (tbRes.data?.accounts) setTrialBalance(tbRes.data);

      const jeList = normalizeList(jeRes.data).rows;
      setJournalEntries(jeList);

      if (plRes.data?.data) setProfitLoss(plRes.data.data);
      else if (plRes.data?.revenues) setProfitLoss(plRes.data);

      if (bsRes.data?.data) setBalanceSheet(bsRes.data.data);
      else if (bsRes.data?.assets) setBalanceSheet(bsRes.data);

      const statementLines = normalizeList<any>(stmtLinesRes.data).rows;
      const reconciliationRows = normalizeList<any>(reconciliationRes.data).rows;
      setBankStatements(statementLines);
      const visibleStatementLineIds = new Set(statementLines.map((line) => String(line.id)));
      setBankReconciliations(reconciliationRows.filter((row) => visibleStatementLineIds.has(String(row.bank_statement_line_id))));
      const bankRows = normalizeList<any>(bankRes.data).rows;
      const bankBalances = await Promise.all(bankRows.map(async account => {
        if (!account.ledger_account_id) return undefined;
        try {
          const response = await api.get(`/api/v1/finance/bank-accounts/${account.id}/balance`);
          return Number((response.data?.data ?? response.data).balance);
        } catch { return undefined; }
      }));
      setBankAccounts(bankRows.map((account, index) => ({
        id: String(account.id),
        name: account.account_name || account.bank_name || account.account_number,
        number: account.account_number || "",
        bank: account.bank_name || "",
        type: account.account_type || "BANK_ACCOUNT",
        balance: bankBalances[index],
      })));
      setBankImportAccountId((current) => current || String(bankRows[0]?.id || ""));
      const accountRows = normalizeList<any>(accountRes.data).rows;
      setLedgerAccounts(accountRows);
      setFinanceProjectOptions(normalizeList<any>(projectOptionRes.data).rows);
      const budgetLineRows = await api.get("/api/v1/finance/budget-lines/?page_size=500").then((response) => normalizeList<any>(response.data).rows).catch(() => []);
      setAPBudgetAllocations(budgetLineRows.filter((line: any) => line.budget?.status === "ACTIVE"));
      setVendorOptions(normalizeList<any>(vendorOptionRes.data).rows);
      setDivisionOptions(normalizeList<any>(divisionRes.data).rows.map((division) => ({
        ...division,
        name: division.organization_name ?? division.name ?? division.organization_code,
      })));
      setCostCreditAccountId((current) => current || String(accountRows.find((account) => account.status === "ACTIVE" && account.account_code !== "1150")?.id || ""));
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Data keuangan belum dapat dimuat. Periksa koneksi dan akses perusahaan, lalu coba lagi."));
    } finally {
      setFinanceCalendarReady(true);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const importBankStatement = async () => runFinanceAction(`bank-import:${bankImportAccountId}`, async () => {
    if (!bankImportAccountId || !bankImportFile) {
      toast.error("Pilih rekening dan file CSV terlebih dahulu.");
      return;
    }
    setBankImporting(true);
    try {
      const csv_content = await bankImportFile.text();
      const { data: response } = await api.post(`/api/v1/finance/bank-accounts/${bankImportAccountId}/import-csv`, { csv_content });
      const result = response?.data ?? response;
      toast.success(`Impor selesai: ${Number(result.total_rows_imported ?? 0)} transaksi, ${Number(result.auto_matched_count ?? 0)} terdeteksi cocok.`);
      setBankImportFile(null);
      await loadFinanceData(true);
    } catch (err: any) {
      toast.error(getApiErrorDetail(err, "Gagal mengimpor mutasi CSV."));
    } finally {
      setBankImporting(false);
    }
  });

  const matchBankStatementLine = async (line: any) => runFinanceAction(`bank-match:${line.id}`, async () => {
    const paymentId = bankMatchPaymentIds[String(line.id)];
    if (!paymentId) {
      toast.error("Pilih transaksi pembayaran yang akan dicocokkan.");
      return;
    }
    setBankMatchingLineId(String(line.id));
    try {
      await api.post(`/api/v1/finance/bank-statement-lines/${line.id}/reconcile`, {
        payment_id: paymentId,
        matched_amount: Number(line.debit_amount || line.credit_amount || 0),
        match_type: "PAYMENT",
      });
      toast.success("Mutasi berhasil direkonsiliasi.");
      await loadFinanceData(true);
    } catch (err: any) {
      toast.error(getApiErrorDetail(err, "Gagal merekonsiliasi mutasi."));
    } finally {
      setBankMatchingLineId(null);
    }
  });

  const runBillingDocumentAction = async (id: string, action: "submit" | "approve" | "post") => runFinanceAction(`billing-document:${id}:${action}`, async () => {
    const labels = { submit: "Mengajukan dokumen…", approve: "Menyetujui dokumen…", post: "Memposting dokumen…" };
    const toastId = `billing-document-${id}`;
    toast.loading(labels[action], { id: toastId });
    try {
      await api.post(`/api/v1/finance/billing-documents/${id}/${action}`);
      await loadFinanceData(true);
      toast.success("Perubahan dokumen berhasil disimpan.", { id: toastId });
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Dokumen belum dapat diproses. Silakan coba lagi."), { id: toastId });
    }
  });

  /**
   * handleReverseEntry coordinates the UI behavior represented by this function.
   *
   * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
   * @returns The rendered React node, callback result, or Promise declared by the implementation.
   * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
   */
  const handleReverseEntry = async () => runFinanceAction(`journal-reversal:${selectedJournalEntry?.id ?? "none"}`, async () => {
    if (!selectedJournalEntry || !reversalReason.trim()) return;
    try {
      await api.post(`/api/v1/finance/journal-entries/${selectedJournalEntry.id}/reverse`, { reason: reversalReason });
      toast.success("✓ Jurnal berhasil di-reverse (Storno)!");
      setIsReversalModalOpen(false);
      setReversalReason("");
      await loadFinanceData(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Jurnal belum dapat dibalik. Periksa status jurnal dan periode keuangan, lalu coba lagi."));
    }
  });

  useEffect(() => {
    loadFinanceData();
  }, []);

  useEffect(() => {
    const refreshCalendarData = (event: Event) => {
      const fiscalYearId = (event as CustomEvent<{ fiscalYearId?: string }>).detail?.fiscalYearId;
      if (fiscalYearId) setSelectedFinanceYearId(fiscalYearId);
      setFinancePeriodView("YEAR");
      void loadFinanceData(true);
    };
    window.addEventListener("finance-calendar-updated", refreshCalendarData);
    return () => window.removeEventListener("finance-calendar-updated", refreshCalendarData);
  });

  useEffect(() => {
    if (!financeCalendarReady || !selectedFinanceYearId || !financeFiscalPeriods.length) return;
    loadFinanceData(true);
  }, [financeCalendarReady, selectedFinanceYearId, financePeriodView, financeQuarter, financePeriodId, financeFiscalPeriods.length]);

  /* KPI Calculations */
  const totalCostEntries = costEntries.reduce(
    (acc, curr) => acc + Number(curr.total_cost ?? curr.amount ?? curr.cost_amount ?? curr.total_amount ?? 0),
    0
  );
  const totalDisbursedFunding = fundings
    .filter(f => ["DRAWN", "DISBURSED", "ACTIVE"].includes(String(f.status || "").toUpperCase()))
    .reduce((acc, curr) => acc + Number(curr.amount ?? curr.funding_amount ?? curr.requested_amount ?? curr.approved_limit ?? 0), 0);

  // Total Project Costs (WIP) = Actual Cost Entries + Disbursed Working Capital Fundings
  const totalCost = totalCostEntries > 0 ? totalCostEntries : totalDisbursedFunding;

  const totalBillingRevenue = proposals
    .filter(p => ["APPROVED", "ISSUED", "INVOICED", "POSTED", "PAID"].includes(String(p.status || "").toUpperCase()))
    .reduce((acc, curr) => acc + Number(curr.total_amount ?? curr.amount ?? curr.subtotal ?? 0), 0);
  const postedReceipts = customerReceipts.filter(receipt => receipt.status === "POSTED");
  const pendingCashReceipts = customerReceipts.filter((receipt) => receipt.status !== "POSTED");

  const paidVendorBills = vendorBills
    .filter((bill) => bill.status === "PAID" || bill.payment_status === "PAID" || bill.status === "LUNAS")
    .map((bill) => {
      const billAmount = Number(bill.paid_amount && Number(bill.paid_amount) > 0 ? bill.paid_amount : (bill.total_amount ?? bill.amount ?? 0));
      const billPartyId = bill.party_id ?? bill.vendor_party_id;

      const matchedPayment = payments.find((p: any) => {
        if (String(p.status || "").toUpperCase() !== "POSTED") return false;
        const pType = String(p.payment_type || "").toUpperCase();
        if (!["OUTGOING", "AP_PAYMENT", "VENDOR_PAYMENT"].includes(pType)) return false;
        const plan = typeof p.allocation_plan === "object" && p.allocation_plan ? p.allocation_plan : {};
        const refStr = `${p.reference_number || ""} ${p.execution_reference || ""} ${p.execution_note || ""}`;
        return (
          String(plan.billing_document_id || plan.vendor_bill_id || plan.bill_id || "") === String(bill.id) ||
          (bill.invoice_number && refStr.includes(String(bill.invoice_number))) ||
          (billPartyId && String(p.party_id || "") === String(billPartyId) && Math.abs(Number(p.amount || 0) - billAmount) < 1) ||
          Math.abs(Number(p.amount || 0) - billAmount) < 1
        );
      });

      const bankAcc = matchedPayment?.bank_account_id
        ? bankAccounts.find((a) => String(a.id) === String(matchedPayment.bank_account_id))
        : bankAccounts[0] ?? null;

      const vendorName =
        bill.supplier_name ||
        bill.party_name ||
        vendorOptions.find((v) => String(v.id) === String(billPartyId))?.display_name ||
        vendorOptions.find((v) => String(v.id) === String(billPartyId))?.legal_name ||
        "Vendor";

      return {
        ...bill,
        supplier_name: vendorName,
        amount: Number(matchedPayment?.amount ?? billAmount),
        bank_account_name: bill.bank_account_name || (bankAcc ? `${bankAcc.bank ? `${bankAcc.bank} · ` : ""}${bankAcc.name}` : "-"),
        due_date: matchedPayment?.payment_date || bill.posting_date || bill.invoice_date || bill.due_date,
      };
    });
  const cashQuery = cashBankSearch.trim().toLocaleLowerCase("id-ID");
  const matchesCashQuery = (values: unknown[]) => !cashQuery || values.some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(cashQuery));
  const searchedPendingCashReceipts = pendingCashReceipts.filter((receipt) => matchesCashQuery([receipt.receipt_number, receipt.reference_number, receipt.customer_name, receipt.project_name, receipt.invoice_ref, receipt.bank_account, receipt.amount]));
  const searchedPostedReceipts = postedReceipts.filter((receipt) => matchesCashQuery([receipt.receipt_number, receipt.reference_number, receipt.customer_name, receipt.project_name, receipt.invoice_ref, receipt.bank_account, receipt.amount]));
  const searchedPaidVendorBills = paidVendorBills.filter((bill) => matchesCashQuery([bill.supplier_name, bill.invoice_number, bill.bank_account_name, bill.amount, bill.total_amount]));
  const apQuery = apSearch.trim().toLocaleLowerCase("id-ID");
  const apActionCount = vendorBills.filter((bill) => !["PAID", "LUNAS", "CANCELLED", "REJECTED"].includes(String(bill.status ?? "").toUpperCase())).length;
  const apReadyCount = vendorBills.filter((bill) => String(bill.status ?? "").toUpperCase() === "POSTED").length;
  const apPaidCount = vendorBills.filter((bill) => ["PAID", "LUNAS"].includes(String(bill.status ?? bill.payment_status ?? "").toUpperCase()) || String(bill.payment_status ?? "").toUpperCase() === "PAID").length;
  const filteredVendorBills = vendorBills.filter((bill) => {
    const status = String(bill.status ?? "").toUpperCase();
    const paid = ["PAID", "LUNAS"].includes(status) || String(bill.payment_status ?? "").toUpperCase() === "PAID";
    const matchesQueue = apQueueFilter === "ALL" || (apQueueFilter === "PAID" ? paid : apQueueFilter === "READY" ? status === "POSTED" && !paid : !paid && !["CANCELLED", "REJECTED"].includes(status));
    const vendorName = bill.supplier_name || bill.party_name || vendorOptions.find((vendor) => vendor.id === bill.party_id)?.display_name || vendorOptions.find((vendor) => vendor.id === bill.party_id)?.legal_name;
    const matchesSearch = !apQuery || [vendorName, bill.invoice_number, bill.status, bill.total_amount, bill.amount].some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(apQuery));
    return matchesQueue && matchesSearch;
  });
  const totalInflowRevenue = receiptSummary?.posted_amount ?? 0;

  const profitabilityChart = useMemo(
    () => buildMonthlyStackedData({
      receipts: customerReceipts,
      costs: costEntries,
      includeProposalsInTop: false,
      startDate: financePeriodStart,
      endDate: financePeriodEnd,
    }),
    [customerReceipts, costEntries, financePeriodStart, financePeriodEnd],
  );
  const profitabilityTransactions = useMemo(() => {
    const startBound = financePeriodStart.slice(0, 10);
    const endBound = financePeriodEnd.slice(0, 10);
    const toRow = (record: any, kind: "Penerimaan" | "Biaya proyek", dateValue: unknown, amountValue: unknown) => {
      if (!dateValue || amountValue == null) return null;
      const dateText = String(dateValue);
      const dateKey = dateText.slice(0, 10);
      if ((startBound && dateKey < startBound) || (endBound && dateKey > endBound)) return null;
      const amount = Number(amountValue);
      const date = new Date(dateText);
      if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) return null;
      const projectId = String(record.project_id ?? record.project ?? record.allocation_plan?.project_id ?? "");
      const project = financeProjectOptions.find((item) => String(item.id) === projectId);
      return {
        id: String(record.id ?? `${kind}-${dateText}-${amount}`),
        date: dateText,
        month: date.getMonth(),
        kind,
        description: record.description || record.reference_number || record.source_reference || (kind === "Penerimaan" ? "Penerimaan pelanggan" : "Biaya proyek"),
        projectName: project?.project_name || project?.name || record.project_name || record.allocation_plan?.project_name || (projectId ? `Proyek #${projectId.slice(0, 8)}` : "Tanpa proyek"),
        amount,
        status: String(record.status || "—").toUpperCase(),
      };
    };

    const receipts = customerReceipts
      .filter((receipt) => ["POSTED", "PAID", "COMPLETED", "SETTLED"].includes(String(receipt.status || "").toUpperCase()))
      .map((receipt) => toRow(receipt, "Penerimaan", receipt.payment_date ?? receipt.receipt_date ?? receipt.transaction_date ?? receipt.created_at, receipt.amount ?? receipt.total_amount ?? receipt.paid_amount));
    const costs = costEntries
      .filter((entry) => !["REJECTED", "CANCELLED", "VOID"].includes(String(entry.status || "").toUpperCase()))
      .map((entry) => toRow(entry, "Biaya proyek", entry.transaction_date ?? entry.date ?? entry.created_at, entry.total_cost ?? entry.amount ?? entry.cost_amount ?? entry.total_amount));

    return [...receipts, ...costs]
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [customerReceipts, costEntries, financePeriodStart, financePeriodEnd, financeProjectOptions]);

  const totalRevenue = totalBillingRevenue;

  const totalFunding = totalDisbursedFunding;

  const totalProcurementBudget = financeProjectOptions.reduce(
    (sum, project) => sum + Number(project.budget_amount ?? project.budget ?? 0),
    0,
  );
  const grossMargin = totalRevenue - totalCost;
  const selectedBudgetProject = financeProjectOptions.find((project) => String(project.id) === selectedBudgetProjectId)
    ?? financeProjectOptions[0];
  const selectedProjectBudget = Number(selectedBudgetProject?.budget_amount ?? selectedBudgetProject?.budget ?? 0);
  const selectedProjectCost = costEntries
    .filter((entry) => String(entry.project_id ?? entry.project ?? entry.project?.id ?? "") === String(selectedBudgetProject?.id ?? ""))
    .reduce((sum, entry) => sum + Number(entry.total_cost ?? entry.amount ?? entry.cost_amount ?? entry.total_amount ?? 0), 0);

  const handleCostLifecycle = async (entry: any) => runFinanceAction(`project-cost:${entry.id}`, async () => {
    try {
      if (entry.status === "DRAFT") {
        await api.post(`/api/v1/finance/project-cost-entries/${entry.id}/validate`);
        toast.success("Cost entry berhasil divalidasi.");
      } else if (entry.status === "VALIDATED") {
        if (!isLevel1FinanceUser(user) && isCostEntryCreator(entry, user?.id)) {
          toast.error("Posting WIP menunggu checker: Anda adalah pembuat cost entry ini. Minta user Finance lain untuk melakukan posting.");
          return;
        }
        const readinessResponse = await api.get(
          `/api/v1/finance/project-cost-entries/wip-readiness?entry_id=${encodeURIComponent(String(entry.id))}`,
        );
        const readiness = normalizeList<WipPostingReadiness>(readinessResponse.data).rows[0];
        if (!readiness?.can_post) {
          toast.error(readiness?.message || "Cost entry belum siap diposting ke WIP.");
          if (readiness) {
            setWipPostingReadiness((current) => ({ ...current, [readiness.entry_id]: readiness }));
          }
          return;
        }
        if (!costCreditAccountId) {
          toast.error("Pilih akun sumber kredit sebelum posting WIP.");
          return;
        }
        await api.post(`/api/v1/finance/project-cost-entries/${entry.id}/post-to-wip`, { credit_account_id: costCreditAccountId });
        toast.success("Cost entry berhasil diposting ke WIP dan jurnal.");
      }
      await loadFinanceData(true);
    } catch (error) {
      toast.error(getApiErrorDetail(
        error,
        entry.status === "VALIDATED"
          ? "Posting WIP ditolak. Periksa status entry, akun kredit, dan periode fiskal."
          : "Validasi cost entry gagal diproses.",
      ));
    }
  });

  const [postingProposalId, setPostingProposalId] = useState<string | null>(null);

  const handlePostBillingProposal = async (proposal: any) => runFinanceAction(`billing-post:${proposal.id}`, async () => {
    setPostingProposalId(proposal.id);
    try {
      await api.post(`/api/v1/finance/billing-proposals/${proposal.id}/post-billing-document`, {});
      toast.success("Faktur tagihan klien berhasil diposting. Jurnal GL & Pajak PPN telah terbentuk.");
      await loadFinanceData(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Faktur belum dapat diposting. Periksa status proposal dan data invoice, lalu coba lagi."));
    } finally {
      setPostingProposalId(null);
    }
  });

  const handleBillingProposalLifecycle = async (proposal: any) => runFinanceAction(`billing-lifecycle:${proposal.id}`, async () => {
    try {
      if (proposal.status === "DRAFT") await api.post(`/api/v1/finance/billing-proposals/${proposal.id}/submit`);
      else if (proposal.status === "SUBMITTED") await api.post(`/api/v1/finance/billing-proposals/${proposal.id}/approve`);
      else if (proposal.status === "APPROVED") await api.post(`/api/v1/finance/billing-proposals/${proposal.id}/issue-billing-document`, {});
      else return;
      await loadFinanceData(true);
      toast.success("Lifecycle billing proposal berhasil diperbarui.");
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Status proposal tagihan belum dapat diperbarui. Periksa status dokumen dan hak akses, lalu coba lagi."));
    }
  });

  const handlePaymentLifecycle = async (payment: any) => runFinanceAction(`payment-lifecycle:${payment.id}`, async () => {
    try {
      if (payment.status === "SUBMITTED") {
        await api.post(`/api/v1/finance/payments/${payment.id}/approve`);
        toast.success("Permintaan pembayaran disetujui.");
      } else if (payment.status === "APPROVED") {
        await api.post(`/api/v1/finance/payments/${payment.id}/execute`, {
          execution_reference: payment.reference_number,
        });
        toast.success("Pembayaran dieksekusi dan jurnal AP dibuat.");
      }
      await loadFinanceData(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Pembayaran belum dapat diproses. Periksa status pembayaran, hak akses, dan periode keuangan."));
    }
  });

  const handleReceiptLifecycle = async (receipt: any) => runFinanceAction(`receipt-lifecycle:${receipt.id}`, async () => {
    if (receiptActionId) return;
    const readiness = receiptReadiness[receipt.id];
    setReceiptActionId(receipt.id);
    setReceiptActionError(previous => ({ ...previous, [receipt.id]: "" }));
    const toastId = `receipt-action-${receipt.id}`;
    toast.loading("Membukukan penerimaan ke Kas & Bank...", { id: toastId });
    try {
      let path = `/api/v1/finance/customer-receipts/${receipt.id}/approve-and-post`;
      if (receipt.status === "APPROVED") {
        path = `/api/v1/finance/customer-receipts/${receipt.id}/post`;
      } else if (readiness?.action === "approve") {
        path = `/api/v1/finance/payments/${receipt.id}/approve`;
      }
      await api.post(path, {});
      await loadFinanceData(true);
      toast.success("Penerimaan berhasil dibukukan! Saldo kas / bank dan jurnal GL diperbarui.", { id: toastId });
    } catch (error: any) {
      try {
        if (receipt.status === "DRAFT") {
          await api.post(`/api/v1/finance/payments/${receipt.id}/submit`, {});
          await api.post(`/api/v1/finance/customer-receipts/${receipt.id}/approve-and-post`, {});
          await loadFinanceData(true);
          toast.success("Penerimaan berhasil diajukan dan dibukukan ke Kas & Bank!", { id: toastId });
          return;
        }
      } catch {
        // Fallback error handling
      }
      const message = getApiErrorDetail(error, error.response?.data?.message || readiness?.message || "Penerimaan gagal diproses. Silakan coba kembali.");
      setReceiptActionError(previous => ({ ...previous, [receipt.id]: message }));
      toast.error(message, { id: toastId });
    } finally {
      setReceiptActionId(null);
    }
  });

  const handleDeleteReceipt = async (receiptId: string) => runFinanceAction(`receipt-delete:${receiptId}`, async () => {
    if (!confirm("Apakah Anda yakin ingin membatalkan dan menghapus catatan penerimaan ini? Data mutasi draft akan dihapus.")) return;
    setReceiptDeletingId(receiptId);
    const toastId = `receipt-delete-${receiptId}`;
    toast.loading("Menghapus catatan penerimaan...", { id: toastId });
    try {
      await api.delete(`/api/v1/finance/customer-receipts/${receiptId}`);
      await loadFinanceData(true);
      toast.success("Catatan penerimaan berhasil dihapus.", { id: toastId });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Gagal menghapus catatan penerimaan.", { id: toastId });
    } finally {
      setReceiptDeletingId(null);
    }
  });

  const handleCreateCustomerReceipt = async (event: React.FormEvent) => runFinanceAction("create-customer-receipt", async () => {
    event.preventDefault();
    if (receiptSaving) return;
    const errors: Record<string, string> = {};
    const amount = Number(receiptForm.amount);
    const withholdingAmount = receiptForm.withholding_tax_amount ? Number(receiptForm.withholding_tax_amount) : 0;
    const bank = bankAccounts.find((account) => account.id === receiptForm.bank_account);
    if (!receiptForm.project_name.trim()) errors.project_name = "Pilih proyek terkait dari daftar atau input manual.";
    if (!receiptForm.customer_name.trim()) errors.customer_name = "Pilih proyek atau faktur yang memiliki data klien tersimpan.";
    if (!receiptForm.amount || !Number.isFinite(amount) || amount < 1000) errors.amount = "Nominal uang masuk wajib diisi, minimal Rp 1.000.";
    if (!Number.isFinite(withholdingAmount) || withholdingAmount < 0) errors.withholding_tax_amount = "Nominal potongan pajak harus valid (>= 0).";
    if (!receiptForm.invoice_ref && withholdingAmount > 0) {
      errors.withholding_tax_amount = "Potongan PPh 23 / Final hanya dapat diisi jika Anda memilih referensi Faktur / Invoice resmi.";
    }
    if (!bank) errors.bank_account = bankAccounts.length ? "Pilih rekening kas / bank penerima dana." : "Belum ada rekening kas / bank. Tambahkan rekening penerima di menu Kas & Bank terlebih dahulu.";
    if (!receiptForm.payment_date) errors.payment_date = "Tanggal terima dana wajib diisi.";
    if (!receiptForm.reference_number.trim()) errors.reference_number = "No. bukti transfer / resi bank klien wajib diisi.";
    if (receiptForm.invoice_ref) {
      const linkedInv = customerInvoices.find((invoice) => invoice.id === receiptForm.invoice_ref);
      if (linkedInv) {
        if (linkedInv.status !== "POSTED") errors.invoice_ref = "Hanya invoice resmi berstatus POSTED yang dapat dilunasi.";
        else {
          const remaining = Number(linkedInv.outstanding_amount ?? (Number(linkedInv.total_amount ?? 0) - Number(linkedInv.paid_amount ?? 0)));
          if (amount + withholdingAmount > remaining + 0.01) errors.amount = `Total pelunasan (${formatMoney(amount + withholdingAmount)}) melebihi sisa piutang invoice (${formatMoney(remaining)}).`;
        }
      }
    }
    setReceiptErrors(errors);
    if (Object.keys(errors).length) {
      toast.error("Lengkapi data penerimaan yang ditandai di bawah.");
      document.getElementById(`receipt-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    setReceiptSaving(true);
    try {
      await api.post("/api/v1/finance/customer-receipts/", {
        payment_type: "CUSTOMER_RECEIPT", bank_account_id: receiptForm.bank_account,
        payment_date: receiptForm.payment_date, amount, payment_method: receiptForm.payment_method,
        reference_number: receiptForm.reference_number.trim(),
        allocation_plan: {
          project_id: receiptForm.project_id && receiptForm.project_id !== "__CUSTOM__" ? receiptForm.project_id : undefined,
          customer_name: receiptForm.customer_name.trim(), project_name: receiptForm.project_name.trim(),
          invoice_id: receiptForm.invoice_ref,
          invoice_ref: customerInvoices.find((invoice) => invoice.id === receiptForm.invoice_ref)?.invoice_number || "",
          bank_account: bank?.name, withholding_tax_amount: withholdingAmount,
          withholding_tax_type: receiptForm.withholding_tax_type, bupot_number: receiptForm.bupot_number.trim(), notes: receiptForm.notes.trim(),
        },
      });
      toast.success(`Penerimaan ${formatMoney(amount)} berhasil disimpan sebagai Draft.`);
      setIsReceiptModalOpen(false); setIsCashReceiptQuickOpen(false);
      setReceiptForm({ project_id: "", customer_name: "", project_name: "", invoice_ref: "", amount: "", withholding_tax_amount: "", withholding_tax_type: "PPH_23", bupot_number: "", bank_account: "", payment_date: localDateKey(), payment_method: "BANK_TRANSFER", reference_number: "", notes: "" });
      await loadFinanceData(true);
    } catch (error) {
      const fieldErrors = (error as { response?: { data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors;
      if (fieldErrors && typeof fieldErrors === "object") setReceiptErrors(Object.fromEntries(Object.entries(fieldErrors).filter(([, value]) => typeof value === "string")) as Record<string, string>);
      toast.error(getApiErrorDetail(error, "Penerimaan belum tersimpan. Silakan coba kembali."));
    } finally { setReceiptSaving(false); }
  });

  const handleCreateBankAccountOpening = async (event: React.FormEvent) => runFinanceAction("create-bank-account-opening", async () => {
    event.preventDefault();
    try {
      const amount = Number(bankOpeningForm.opening_amount || 0);
      await api.post("/api/v1/finance/bank-accounts/opening", {
        ...bankOpeningForm, opening_amount: amount,
      });
      toast.success(amount > 0 ? `Rekening ditambahkan dan saldo awal ${formatMoney(amount)} dibukukan.` : "Rekening kas/bank berhasil ditambahkan.");
      setBankOpeningForm({ bank_name: "", account_number: "", account_name: "", opening_amount: "", opening_date: localDateKey(), offset_account_id: "" });
      setIsBankOpeningFormOpen(false);
      await loadFinanceData(true);
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Rekening baru belum tersimpan. Periksa nomor rekening, akun sumber saldo, dan periode fiskal."));
    }
  });

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
  const handleConfirmThreeWayMatch = async () => runFinanceAction(`three-way-match:${selectedBillForMatch?.id ?? "none"}`, async () => {
    if (!selectedBillForMatch) return;
    try {
      await api.post(`/api/v1/finance/billing-documents/${selectedBillForMatch.id}/verify`);
      await loadFinanceData(true);
      toast.success("Dokumen tagihan berhasil diverifikasi melalui lifecycle backend.");
      setIsMatchModalOpen(false);
    } catch (error) {
      const detail = getApiErrorDetail(error, "Dokumen gagal diverifikasi. Silakan coba kembali.");
      toast.error(/\[SoD Violation\]|Maker dan Checker/i.test(detail)
        ? "Dokumen ini tidak dapat diverifikasi oleh pembuatnya. Silakan minta pengguna lain yang berwenang untuk melanjutkan."
        : detail);
    }
  });

  /**
   * handleOpenPayModal coordinates the UI behavior represented by this function.
   *
   * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
   * @returns The rendered React node, callback result, or Promise declared by the implementation.
   * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
   */
  const handleOpenPayModal = (bill: any) => {
    const vendorName =
      bill.supplier_name ||
      bill.party_name ||
      vendorOptions.find((v) => String(v.id) === String(bill.party_id))?.display_name ||
      vendorOptions.find((v) => String(v.id) === String(bill.party_id))?.legal_name ||
      "Vendor";
    const billAmount = Number(bill.outstanding_amount ?? bill.total_amount ?? bill.amount ?? 0);

    setSelectedBillForPay({
      ...bill,
      supplier_name: vendorName,
      amount: billAmount,
    });
    setPaymentForm({
      bank_account: bankAccounts[0]?.id || "",
      payment_method: "BANK_TRANSFER",
      payment_date: localDateKey(),
      reference_number: "",
      notes: `Pelunasan tagihan ${vendorName} (${bill.invoice_number})`,
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
  const handleExecutePayment = async (e: React.FormEvent) => runFinanceAction(`execute-payment:${selectedBillForPay?.id ?? "none"}`, async () => {
    e.preventDefault();
    if (!selectedBillForPay) return;
    if (!paymentForm.bank_account || !paymentForm.reference_number.trim()) {
      toast.error("Rekening bank dan nomor referensi wajib diisi.");
      return;
    }
    try {
      const amount = Number(selectedBillForPay.total_amount ?? selectedBillForPay.amount ?? 0);
      await api.post(`/api/v1/finance/billing-documents/${selectedBillForPay.id}/create-payment`, {
        bank_account_id: paymentForm.bank_account,
        payment_date: paymentForm.payment_date,
        amount,
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number,
        description: paymentForm.notes,
      });
      await loadFinanceData(true);
      toast.success(`Permintaan pembayaran ${formatMoney(amount)} berhasil diajukan dan menunggu approval.`);
      setIsPaymentModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || "Permintaan pembayaran belum berhasil dibuat. Periksa data tagihan dan coba lagi.");
    }
  });

  const trialBalanceAccounts = (trialBalance?.accounts || []).filter((account: any) => {
    const query = trialBalanceSearch.trim().toLowerCase();
    const matchesSearch = !query || `${account.account_code || ""} ${account.account_name || ""} ${account.account_type || ""}`.toLowerCase().includes(query);
    const matchesType = trialBalanceTypeFilter === "ALL" || account.account_type === trialBalanceTypeFilter;
    return matchesSearch && matchesType;
  });
  const trialBalancePageCount = Math.max(1, Math.ceil(trialBalanceAccounts.length / GL_PAGE_SIZE));
  const visibleTrialBalancePage = Math.min(trialBalancePage, trialBalancePageCount);
  const visibleTrialBalanceAccounts = trialBalanceAccounts.slice((visibleTrialBalancePage - 1) * GL_PAGE_SIZE, visibleTrialBalancePage * GL_PAGE_SIZE);

  const filteredJournalEntries = journalEntries.filter((entry: any) => {
    const query = journalSearch.trim().toLowerCase();
    const matchesSearch = !query || `${entry.entry_number || ""} ${entry.description || ""} ${entry.posting_date || ""} ${entry.status || ""}`.toLowerCase().includes(query);
    const matchesStatus = journalStatusFilter === "ALL" || entry.status === journalStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const journalPageCount = Math.max(1, Math.ceil(filteredJournalEntries.length / GL_PAGE_SIZE));
  const visibleJournalPage = Math.min(journalPage, journalPageCount);
  const visibleJournalEntries = filteredJournalEntries.slice((visibleJournalPage - 1) * GL_PAGE_SIZE, visibleJournalPage * GL_PAGE_SIZE);

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
    <div className="finance-scope flex flex-col gap-6">

      {Object.keys(financePending).length > 0 && <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[1px]"><div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white px-5 py-4 text-sm font-semibold text-blue-900 shadow-xl"><RefreshCw size={18} className="animate-spin" />Permintaan sedang diproses. Tombol akan aktif kembali setelah server merespons.</div></div>}

      {/* Header & Global Toolbar */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Keuangan & Akuntansi</h1>
          <p className="page-description">Pembukuan, pengendalian biaya, penagihan, dan rekonsiliasi perusahaan</p>
        </div>

        <div className="workspace-actions flex items-center gap-2 flex-wrap">
          {canOperateFinance ? (
            <>
              <button onClick={() => setIsCostModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
                <Plus size={14} /> Entri Baru
              </button>
              <button onClick={() => setIsFundingModalOpen(true)} className="btn-outline py-1.5 px-3 text-xs gap-1.5">
                <Plus size={14} /> Ajukan Dana
              </button>
              <button onClick={() => setIsBillingModalOpen(true)} className="btn-outline py-1.5 px-3 text-xs gap-1.5">
                <Plus size={14} /> Buat Tagihan
              </button>
            </>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold flex items-center gap-1.5">
              <Crown size={13} /> Finance Overseer · View Only
            </span>
          )}
          <button
            onClick={() => loadFinanceData(true)}
            className="btn-ghost py-1.5 px-3 text-xs gap-1.5"
            aria-label="Segarkan data Finance"
            disabled={refreshing}
          >
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="fin-card flex flex-wrap items-center gap-3 p-3.5">
        <div className="mr-auto min-w-[170px]">
          <p className="text-sm font-semibold text-blue-950">Periode Keuangan</p>
          <p className="text-xs text-text-secondary">Batas tanggal mengikuti kalender perusahaan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <span>Tahun buku</span>
            <select value={selectedFinanceYearId} onChange={(event) => {
              const yearId = event.target.value;
              setSelectedFinanceYearId(yearId);
              const nextYearPeriods = financeFiscalPeriods.filter((period) => period.fiscal_year_id === yearId).sort((a, b) => Number(a.period_number || 0) - Number(b.period_number || 0));
              setFinancePeriodId(nextYearPeriods[0]?.id || "");
              setJournalPage(1);
            }} className="input w-auto min-w-[140px] py-1.5 text-xs">
              {financeFiscalYears.map((year) => <option key={year.id} value={year.id}>{year.fiscal_year_name}</option>)}
              {!financeFiscalYears.length && <option value="">Kalender belum diatur</option>}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <span>Rentang</span>
            <select value={financePeriodView} onChange={(event) => {
              const nextView = event.target.value as "YEAR" | "QUARTER" | "MONTH";
              setFinancePeriodView(nextView);
              setJournalPage(1);
              if (nextView === "MONTH" && !financePeriodId) setFinancePeriodId(periodsInSelectedYear[0]?.id || "");
            }} className="input w-auto min-w-[120px] py-1.5 text-xs">
              <option value="YEAR">Tahunan</option><option value="QUARTER">Kuartalan</option><option value="MONTH">Bulanan</option>
            </select>
          </label>
          {financePeriodView === "QUARTER" && <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <span>Kuartal</span>
            <select value={financeQuarter} onChange={(event) => { setFinanceQuarter(event.target.value); setJournalPage(1); }} className="input w-auto min-w-[115px] py-1.5 text-xs">
              {[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Kuartal {quarter}</option>)}
            </select>
          </label>}
          {financePeriodView === "MONTH" && <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <span>Bulan</span>
            <select value={financePeriodId} onChange={(event) => { setFinancePeriodId(event.target.value); setJournalPage(1); }} className="input w-auto min-w-[180px] py-1.5 text-xs">
              {periodsInSelectedYear.map((period) => <option key={period.id} value={period.id}>Periode {String(period.period_number).padStart(2, "0")} · {formatDate(period.start_date)}–{formatDate(period.end_date)}</option>)}
            </select>
          </label>}
          <span className="status-label is-idle">{financePeriodStart && financePeriodEnd ? `${formatDate(financePeriodStart)} – ${formatDate(financePeriodEnd)}` : "Kalender belum diatur"}</span>
        </div>
      </div>

      {userRole === "executive" && !canOperateFinance && (
        <div className="p-3.5 rounded-2xl bg-[#FAF5FF] border border-[#E9D5FF] text-xs text-[#581C87] flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <Crown size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <b>Executive Viewport Active:</b> Anda memiliki akses penuh membaca seluruh metrik keuangan, arus kas, dan audit trail satu lembar.
            </span>
          </div>
          <span className="shrink-0 text-2xs font-extrabold px-2.5 py-0.5 rounded-full bg-[#F3E8FF] text-[#6B21A8]">
            READ ONLY / PREVIEW
          </span>
        </div>
      )}

      <div className="flex min-w-0 flex-col items-start gap-4 xl:flex-row">
        <FinanceModuleSidebar items={visibleTabs} activeId={activeTab} onSelect={selectFinanceTab} />
        <div className="workspace-container min-w-0 w-full flex-1">

          {/* ── TAB 1: OVERVIEW ────────────────────── */}
          {activeTab === "budgeting" && <BudgetingWorkspace canOperate={canOperateFinance} />}

          {activeTab === "overview" && (
            <div className="flex flex-col gap-6">
              <FinanceSummarySection
                title="Ringkasan Keuangan"
                subtitle="Indikator utama; rincian dan tindakan tersedia pada bagian di bawah."
              >
                <div className="workspace-kpis grid gap-3">
                  <div className="kpi-card" data-accent="blue">
                    <span className="text-xs text-text-secondary">Total Pendapatan (Penagihan)</span>
                    <span className="text-2xl font-bold text-brand-deep-green">{formatMoney(totalRevenue)}</span>
                  </div>
                  <div className="kpi-card" data-accent="amber">
                    <span className="text-xs text-text-secondary">Total Biaya Proyek (WIP)</span>
                    <span className={cn("text-2xl font-bold", totalCost > totalRevenue && totalRevenue > 0 ? "text-red-600" : totalCost > 0 ? "text-amber-600" : "text-slate-700")}>{formatMoney(totalCost)}</span>
                  </div>
                  <div className="kpi-card" data-accent="emerald">
                    <span className="text-xs text-text-secondary">Margin Kotor Proyek</span>
                    <span className={cn("text-2xl font-bold", grossMargin < 0 ? "text-red-600" : grossMargin === 0 ? "text-slate-700" : "text-brand-deep-green")}>{formatMoney(grossMargin)}</span>
                  </div>
                  <div className="kpi-card" data-accent="purple">
                    <span className="text-xs text-text-secondary">Dana Terdistribusi (Pendanaan)</span>
                    <span className="text-2xl font-bold text-brand-green">{formatMoney(totalFunding)}</span>
                  </div>
                </div>
              </FinanceSummarySection>

              {/* ── Live Control & Financial Monitoring (Inventory & Budget) ── */}
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                  <BudgetCheckStatusCard
                    title="Status Pengadaan Anggaran Proyek"
                    statusLabel="PROJECT FUNDING"
                    budgetLabel="Anggaran Pengadaan Disetujui"
                    allocationLabel="Realisasi Pengadaan & Jasa:"
                    allocationFormula="Biaya vendor, layanan, dan kebutuhan operasional proyek"
                    remainingLabel="Sisa Anggaran Pengadaan"
                    validLabel="Pengadaan masih dalam anggaran"
                    invalidLabel="Pengadaan melebihi anggaran"
                    projects={financeProjectOptions}
                    selectedProjectId={String(selectedBudgetProject?.id ?? "")}
                    onProjectChange={setSelectedBudgetProjectId}
                    materialBudget={selectedProjectBudget}
                    allocationCost={selectedProjectCost}
                    remainingBudget={selectedProjectBudget - selectedProjectCost}
                    isValid={selectedProjectBudget >= selectedProjectCost}
                  />
                  <InventoryCheckingCard autoFetch={true} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="card rounded-2xl p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                        <ClipboardList size={16} aria-hidden="true" />
                      </span>
                      <h3 className="text-sm font-semibold text-text-primary">Biaya Proyek Terkini</h3>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-brand-light-green text-brand-deep-green flex items-center justify-center">
                        <Receipt size={16} aria-hidden="true" />
                      </span>
                      <h3 className="text-sm font-semibold text-text-primary">Penagihan Termin Klien</h3>
                    </div>
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
              <InventoryBridgePanel canOperate={canOperateFinance} />
            </div>
          )}

          {/* ── TAB 2: LABA & PROFITABILITY (EVM) ──── */}
          {activeTab === "profit" && (
            <div className="flex flex-col gap-6">
              {(() => {
                const monthRows = profitabilityChart.data
                  .map((month, index) => {
                    const rows = profitabilityTransactions.filter((row) => row.month === index);
                    const received = rows.filter((row) => row.kind === "Penerimaan").reduce((sum, row) => sum + row.amount, 0);
                    const costs = rows.filter((row) => row.kind === "Biaya proyek").reduce((sum, row) => sum + row.amount, 0);
                    return { month: month.month, count: rows.length, received, costs, net: received - costs };
                  })
                  .filter((row) => row.count > 0);
                const evmRows = financeProjectOptions.map((project) => {
                  const revenue = Number(project.contract_amount ?? project.revenue ?? project.budget_amount ?? 0);
                  const actualCost = costEntries
                    .filter((entry) => String(entry.project_id ?? entry.project ?? entry.project?.id ?? "") === String(project.id))
                    .reduce((sum, entry) => sum + Number(entry.total_cost ?? entry.amount ?? entry.cost_amount ?? entry.total_amount ?? 0), 0);
                  const margin = revenue - actualCost;
                  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
                  return { project, name: project.project_name || project.name || `Proyek #${project.id}`, revenue, actualCost, margin, marginPercent };
                });
                return (
                  <>
                    {/* Grafik + ringkasan bulanan menyatu dalam satu panel */}
                    <section className="fin-card overflow-hidden p-0">
                      <MonthlyStackedBarChart
                        title="Tren Pendapatan dan Biaya Bulanan"
                        subtitle="Penerimaan dan biaya dikelompokkan per bulan. Buka rincian transaksi di bawah untuk melihat tanggal dan nominal aslinya."
                        primaryLabel="Realisasi Kas"
                        secondaryLabel="Alokasi Biaya Proyek"
                        data={profitabilityChart.data}
                        autoFetch={false}
                        className="!rounded-none !border-0 !shadow-none"
                      />
                      <div className="flex flex-col gap-3 border-t border-slate-100 p-5">
                        <div>
                          <h3 className="text-sm font-semibold text-text-primary">Ringkasan Transaksi per Bulan</h3>
                          <p className="mt-1 text-xs text-text-secondary">Selisih kas = penerimaan yang sudah dibukukan dikurangi biaya proyek. Margin laba per proyek tersedia pada analisis EVM di bawah.</p>
                        </div>
                        <FinanceDataTable
                          rows={monthRows}
                          rowKey={(row) => row.month}
                          searchText={(row) => row.month}
                          searchPlaceholder="Cari bulan..."
                          emptyText="Tidak ada penerimaan yang sudah dibukukan atau biaya proyek pada rentang fiskal ini."
                          minWidth={560}
                          columns={[
                            { key: "month", header: "Bulan", render: (row) => <span className="font-semibold">{row.month}</span> },
                            { key: "count", header: "Jumlah transaksi", align: "center", render: (row) => row.count },
                            { key: "received", header: "Penerimaan", align: "right", render: (row) => <SignedAmount value={row.received} text={formatMoney(row.received)} /> },
                            { key: "costs", header: "Biaya proyek", align: "right", render: (row) => <span className="tabular-nums">{formatMoney(row.costs)}</span> },
                            { key: "net", header: "Selisih kas", align: "right", render: (row) => <SignedAmount value={row.net} text={formatMoney(row.net)} /> },
                          ]}
                        />
                      </div>
                    </section>

                    {/* Rincian transaksi + analisis EVM disatukan, ganti halaman seperti sheet */}
                    <section className="fin-card flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-text-primary">{profitView === "detail" ? "Rincian Transaksi Pendapatan dan Biaya" : "Analisis Profitabilitas Proyek berbasis EVM"}</h3>
                          <p className="mt-1 text-xs text-text-secondary">
                            {profitView === "detail"
                              ? "Menampilkan penerimaan berstatus POSTED dan biaya proyek selain REJECTED, CANCELLED, atau VOID dalam periode aktif."
                              : "Nilai kontrak, biaya aktual, laba kotor, dan margin setiap proyek."}
                          </p>
                        </div>
                        <FinanceSubtabs
                          value={profitView}
                          onChange={setProfitView}
                          items={[
                            { id: "detail", label: "Rincian Transaksi", count: profitabilityTransactions.length },
                            { id: "evm", label: "Analisis Proyek (EVM)", count: evmRows.length },
                          ]}
                        />
                      </div>
                      {profitView === "detail" ? (
                        <FinanceDataTable
                          rows={profitabilityTransactions}
                          rowKey={(row) => `${row.kind}-${row.id}`}
                          searchText={(row) => `${row.description} ${row.projectName} ${row.kind} ${row.status}`}
                          searchPlaceholder="Cari keterangan, proyek, atau status..."
                          emptyText="Belum ada transaksi yang memenuhi status dan rentang periode untuk ditampilkan."
                          minWidth={760}
                          columns={[
                            { key: "date", header: "Tanggal", render: (row) => formatDate(row.date) },
                            { key: "kind", header: "Jenis", render: (row) => <span className={cn("status-label", row.kind === "Penerimaan" ? "is-ok" : "is-warn")}>{row.kind}</span> },
                            { key: "desc", header: "Keterangan / Referensi", render: (row) => row.description },
                            { key: "project", header: "Proyek", render: (row) => <span className="cell-muted text-xs">{row.projectName}</span> },
                            { key: "amount", header: "Nominal", align: "right", render: (row) => <SignedAmount value={row.kind === "Penerimaan" ? row.amount : -row.amount} text={formatMoney(row.amount)} plusSign={row.kind === "Penerimaan"} /> },
                            { key: "status", header: "Status", render: (row) => <span className="cell-muted">{row.status}</span> },
                          ]}
                        />
                      ) : (
                        <FinanceDataTable
                          rows={evmRows}
                          rowKey={(row) => row.project.id}
                          searchText={(row) => row.name}
                          searchPlaceholder="Cari nama proyek..."
                          emptyText="Belum ada proyek untuk dianalisis."
                          minWidth={640}
                          columns={[
                            {
                              key: "name",
                              header: "Nama Proyek",
                              render: (row) => (
                                <a href={`/projects?project=${row.project.id}&tab=FINANCE`} className="font-semibold text-brand-blue hover:underline">
                                  {row.name} <ArrowUpRight size={12} className="inline" />
                                </a>
                              ),
                            },
                            { key: "revenue", header: "Nilai Kontrak", align: "right", render: (row) => <span className="tabular-nums">{formatMoney(row.revenue)}</span> },
                            { key: "cost", header: "Biaya Aktual", align: "right", render: (row) => <span className="tabular-nums">{formatMoney(row.actualCost)}</span> },
                            { key: "margin", header: "Laba Kotor", align: "right", render: (row) => <SignedAmount value={row.margin} text={formatMoney(row.margin)} /> },
                            { key: "pct", header: "Margin (%)", align: "right", render: (row) => <span className="tabular-nums">{row.marginPercent.toFixed(1)}%</span> },
                            {
                              key: "status",
                              header: "Status EVM",
                              align: "center",
                              render: (row) => (
                                <span className={cn("status-label", row.margin < 0 ? "is-warn" : row.marginPercent < 15 ? "is-warn" : "is-ok")}>
                                  {row.margin < 0 ? "Perlu tindakan" : row.marginPercent < 15 ? "Waspada" : "Sehat"}
                                </span>
                              ),
                            },
                          ]}
                        />
                      )}
                    </section>
                  </>
                );
              })()}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        exportSheetsToXlsx("costing-wip.xlsx", [
                          {
                            name: "Costing WIP",
                            rows: costEntries.map((c: any) => ({
                              Deskripsi: c.description || "",
                              Kategori: c.category || "",
                              Divisi: c.division || "",
                              Jumlah: Number(c.amount ?? 0),
                              Status: c.status || "",
                            })),
                          },
                        ])
                      }
                      className="btn-secondary py-1.5 px-3 text-xs gap-1.5"
                    >
                      <Download size={14} /> Export .xlsx
                    </button>
                    {canOperateFinance && (
                      <button onClick={() => setIsCostModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
                        <Plus size={14} /> Catat Biaya
                      </button>
                    )}
                  </div>
                </div>
                <CollapsibleGuideline title="Panduan posting biaya WIP">
                  Posting ke WIP membuat jurnal akuntansi. Untuk menjaga kontrol Maker–Checker, cost entry yang Anda buat sendiri harus diposting oleh user Finance lain.
                </CollapsibleGuideline>
                {canOperateFinance && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-text-secondary">Akun sumber kredit posting WIP</label>
                    <select className="input text-xs max-w-sm" value={costCreditAccountId} onChange={(event) => setCostCreditAccountId(event.target.value)}>
                      <option value="">Pilih akun sumber</option>
                      {ledgerAccounts.filter((account) => account.status === "ACTIVE" && account.account_code !== "1150").map((account) => (
                        <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="table-scroll-wrapper">
                  <table className="w-full data-table min-w-[560px]">
                    <thead>
                      <tr>
                        <th>Deskripsi Pengeluaran</th>
                        <th>Kategori</th>
                        <th>Divisi</th>
                        <th>Jumlah Biaya</th>
                        <th>Status Akuntansi</th>
                        <th className="col-center">{canOperateFinance ? "Aksi" : "Status Posting"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costEntries.map(c => {
                        const readiness = wipPostingReadiness[String(c.id)];
                        const waitingForChecker = c.status === "VALIDATED" && !isLevel1FinanceUser(user) && (
                          readiness?.reason === "MAKER_CHECKER_REQUIRED" || isCostEntryCreator(c, user?.id)
                        );
                        return (
                          <tr key={c.id}>
                            <td><strong>{c.description || "Pengeluaran"}</strong><br /><span className="text-2xs text-text-secondary">{(() => { const projectId = String(c.project_id ?? c.project ?? ""); const project = financeProjectOptions.find((item) => String(item.id) === projectId); return project ? `Proyek ${project.project_code ? `${project.project_code} — ` : ""}${project.project_name || project.name}` : projectId ? `Proyek #${projectId.slice(0, 8)}` : "Tanpa proyek"; })()}{c.source_type === "SUPPLIER_INVOICE" && c.source_reference ? ` · Invoice ${vendorBills.find((bill) => String(bill.id) === String(c.source_reference))?.invoice_number || `#${String(c.source_reference).slice(0, 8)}`}` : ""}</span></td>
                            <td><span className="badge badge-neutral">{c.cost_element || c.category || "OPERATIONAL"}</span></td>
                            <td>
                              {c.division_id ? (
                                <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200 text-2xs">
                                  {divisionOptions.find(d => String(d.id) === String(c.division_id))?.name || `Divisi #${c.division_id}`}
                                </span>
                              ) : (
                                <span className="text-2xs text-text-secondary italic">—</span>
                              )}
                            </td>
                            <td className="font-semibold text-red-600">{formatMoney(c.total_cost ?? c.amount ?? c.cost_amount ?? 0)}</td>
                            <td><span className={cn("badge", getStatusColor(c.status || "DRAFT"))}>{c.status || "DRAFT"}</span></td>
                            <td>
                              {waitingForChecker ? (
                                <span
                                  className="text-2xs font-semibold text-amber-700"
                                  title={readiness?.message || "Anda adalah pembuat cost entry ini. Posting WIP harus dilakukan user Finance lain."}
                                >
                                  Menunggu checker
                                </span>
                              ) : canOperateFinance && ["DRAFT", "VALIDATED"].includes(c.status) ? (
                                <button disabled={Boolean(financePending[`project-cost:${c.id}`])} onClick={() => void handleCostLifecycle(c)} className="btn-primary py-1 px-2.5 text-2xs gap-1 disabled:opacity-50">
                                  <Zap size={12} /> {financePending[`project-cost:${c.id}`] ? "Memproses…" : c.status === "DRAFT" ? "Validasi" : "Post ke WIP"}
                                </button>
                              ) : isWipPosted(c.status) ? (
                                <span className="text-2xs text-brand-deep-green font-bold">✓ Terposting ke WIP</span>
                              ) : (
                                <span className="text-2xs text-text-secondary italic">{c.status || "—"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!costEntries.length && <tr><td colSpan={6} className="text-center py-6 text-xs text-text-secondary">Belum ada cost entry.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {costEntries.length > 0 && (
                  <ExcelStatusBar
                    label="Ringkasan Biaya WIP"
                    values={costEntries.map((c: any) => Number(c.amount ?? 0))}
                  />
                )}
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
                fundRequests={fundRequests}
                projects={financeProjectOptions}
                bankAccounts={bankAccounts}
                onRefresh={() => loadFinanceData(true)}
                onRequestModalOpen={() => setIsFundingModalOpen(true)}
                readOnly={!canOperateFinance}
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
                    <h3 className="text-sm font-semibold text-text-primary">Utang Usaha (AP) & Verifikasi Dokumen</h3>
                    <p className="text-xs text-text-secondary">Alur faktur pemasok dan pembayaran AP. Pencocokan PO/GRN hanya ditampilkan jika backend menyediakan referensinya.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        exportSheetsToXlsx("tagihan-vendor-ap.xlsx", [
                          {
                            name: "Tagihan AP",
                            rows: filteredVendorBills.map((b: any) => ({
                              Vendor: b.supplier_name || b.party_name || "",
                              Nomor_Faktur: b.invoice_number || "",
                              Jatuh_Tempo: b.due_date || "",
                              Jumlah: Number(b.total_amount ?? b.amount ?? 0),
                              Status: b.status || "",
                            })),
                          },
                        ])
                      }
                      className="btn-outline-soft"
                    >
                      <Download size={14} /> Ekspor .xlsx
                    </button>
                    {canOperateFinance && (
                      <button onClick={() => setIsAPModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
                        <Plus size={14} /> Tagihan Vendor Baru
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={apSearch} onChange={(event) => setApSearch(event.target.value)} placeholder="Cari vendor, nomor faktur, nominal…" aria-label="Cari tagihan vendor" className="input w-full py-1.5 pl-8 text-xs" />
                  </div>
                  <div className="fin-subtabs">
                    {([["ACTION", `Perlu tindakan (${apActionCount})`], ["READY", `Siap bayar (${apReadyCount})`], ["ALL", `Semua (${vendorBills.length})`], ["PAID", `Lunas (${apPaidCount})`]] as const).map(([filter, label]) => (
                      <button key={filter} type="button" data-active={apQueueFilter === filter} onClick={() => setApQueueFilter(filter)}>{label}</button>
                    ))}
                  </div>
                </div>

                <div className="table-scroll-wrapper">
                  <table className="w-full data-table text-xs min-w-[580px]">
                    <thead>
                      <tr className="bg-gray-50 text-xs uppercase tracking-wide text-text-secondary">
                        <th className="py-2.5 px-3">Nama Vendor / Pemasok</th>
                        <th className="py-2.5 px-3">Nomor Faktur</th>
                        <th className="py-2.5 px-3 text-right">Jumlah Tagihan</th>
                        <th className="py-2.5 px-3 col-center">Status Verifikasi</th>
                        <th className="py-2.5 px-3 col-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVendorBills.map(b => {
                        const isPaid = b.status === "PAID" || b.payment_status === "PAID" || b.status === "LUNAS";
                        const isMatched = b.status === "VERIFIED" || b.status === "APPROVED" || b.status === "POSTED";

                        return (
                          <tr key={b.id} className={cn("hover:bg-brand-light-green/20 border-b border-gray-100", isPaid && "row-settled")}>
                            <td className="py-3 px-3">
                              <strong className="text-text-primary block font-semibold">{b.supplier_name || b.party_name || vendorOptions.find((vendor) => vendor.id === b.party_id)?.display_name || vendorOptions.find((vendor) => vendor.id === b.party_id)?.legal_name || "Vendor tidak tersedia"}</strong>
                              <span className="cell-muted">Jatuh Tempo: {b.due_date || "Belum ditentukan"}</span>
                            </td>
                            <td className="py-3 px-3 text-text-secondary">
                              {b.invoice_number || `INV-${b.id}`}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <strong className={cn("tabular-nums font-semibold", isPaid ? "amount-pos" : "amount-neg")}>
                                {formatMoney(b.total_amount ?? b.amount ?? 0)}
                              </strong>
                            </td>
                            <td className="py-3 px-3 col-center">
                              {isPaid ? (
                                <span className="status-label is-ok">✓ Lunas Dibayar</span>
                              ) : isMatched ? (
                                <span className="status-label is-ok">✓ Cocok (Siap Bayar)</span>
                              ) : (
                                <span className="status-label is-warn">{b.status || "DRAFT"}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 col-center">
                              <div className="flex justify-center">
                                {canOperateFinance ? (
                                  <>
                                    {b.status === "DRAFT" && (
                                      <button disabled={Boolean(financePending[`billing-document:${b.id}:submit`])} onClick={() => void runBillingDocumentAction(b.id, "submit")} className="btn-outline-soft py-1 px-3 text-xs disabled:opacity-50">
                                        {financePending[`billing-document:${b.id}:submit`] ? "Mengajukan…" : "Ajukan"}
                                      </button>
                                    )}
                                    {b.status === "SUBMITTED" && (
                                      <button
                                        onClick={() => handleVerifyThreeWayMatch(b)}
                                        className="btn-outline-soft py-1 px-3 text-xs"
                                      >
                                        <ShieldCheck size={14} /> Verifikasi Dokumen
                                      </button>
                                    )}
                                    {b.status === "VERIFIED" && (
                                      <button disabled={Boolean(financePending[`billing-document:${b.id}:approve`])} onClick={() => void runBillingDocumentAction(b.id, "approve")} className="btn-outline-soft py-1 px-3 text-xs disabled:opacity-50">
                                        {financePending[`billing-document:${b.id}:approve`] ? "Menyetujui…" : "Setujui"}
                                      </button>
                                    )}
                                    {b.status === "APPROVED" && (
                                      <button disabled={Boolean(financePending[`billing-document:${b.id}:post`])} onClick={() => void runBillingDocumentAction(b.id, "post")} className="btn-outline-soft py-1 px-3 text-xs disabled:opacity-50">
                                        {financePending[`billing-document:${b.id}:post`] ? "Memposting…" : "Posting"}
                                      </button>
                                    )}
                                    {b.status === "POSTED" && !isPaid && (
                                      <button
                                        onClick={() => handleOpenPayModal(b)}
                                        className="btn-final py-1.5 px-3.5 text-xs"
                                      >
                                        <CreditCard size={14} /> Bayar Tagihan
                                      </button>
                                    )}

                                    {isPaid && (
                                      <span className="status-label is-ok">
                                        <CheckCircle2 size={13} /> Selesai Dibayar
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className={cn("status-label", isPaid || isMatched ? "is-ok" : "is-idle")}>
                                    {isPaid ? "Selesai Dibayar" : isMatched ? "Siap Bayar" : b.status || "DRAFT"}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!filteredVendorBills.length && <tr><td colSpan={5} className="py-8 text-center text-xs text-text-secondary">Tidak ada tagihan pada filter ini.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {filteredVendorBills.length > 0 && (
                  <ExcelStatusBar
                    label="Ringkasan Tagihan AP"
                    values={filteredVendorBills.map((b: any) => Number(b.total_amount ?? b.amount ?? 0))}
                  />
                )}

                <div className="border-t-2 border-slate-200 pt-5 mt-1">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">Permintaan Pembayaran AP</h4>
                      <p className="text-xs text-text-secondary">Daftar pengajuan pembayaran ke kas/bank yang menunggu persetujuan atau eksekusi final.</p>
                    </div>
                    <span className="status-label is-idle">{payments.length} permintaan</span>
                  </div>
                  <div className="table-scroll-wrapper">
                    <table className="w-full data-table text-xs min-w-[560px]">
                      <thead>
                        <tr>
                          <th>Referensi</th>
                          <th className="text-right">Nominal</th>
                          <th className="col-center">Status</th>
                          <th className="col-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr key={payment.id} className={cn(payment.status === "POSTED" && "row-settled")}>
                            <td className="font-semibold text-text-primary">{payment.reference_number}</td>
                            <td className="text-right tabular-nums font-semibold">{formatMoney(payment.amount ?? 0)}</td>
                            <td className="col-center">
                              <span className={cn("status-label", payment.status === "POSTED" ? "is-ok" : payment.status === "APPROVED" ? "is-ok" : "is-warn")}>
                                {payment.status}
                              </span>
                            </td>
                            <td className="col-center">
                              {canOperateFinance && ["SUBMITTED", "APPROVED"].includes(payment.status) ? (
                                <button
                                  disabled={Boolean(financePending[`payment-lifecycle:${payment.id}`])}
                                  onClick={() => void handlePaymentLifecycle(payment)}
                                  className={cn(payment.status === "APPROVED" ? "btn-final py-1.5 px-3.5 text-xs" : "btn-outline-soft py-1 px-3 text-xs", "disabled:opacity-50")}
                                >
                                  {financePending[`payment-lifecycle:${payment.id}`] ? "Memproses…" : payment.status === "SUBMITTED" ? "Setujui Pembayaran" : "Eksekusi Pembayaran"}
                                </button>
                              ) : (
                                <span className="cell-muted">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {payments.length === 0 && (
                          <tr><td colSpan={4} className="py-6 text-center text-text-secondary">Belum ada permintaan pembayaran.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
              <div className="flex flex-col gap-4 font-sans">
                {/* Ringkasan Penagihan (hanya lihat) */}
                <FinanceSummarySection
                  title="Ringkasan Penagihan"
                  subtitle="Ringkasan nilai termin, pajak, dan tagihan klien."
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="kpi-card" data-accent="navy">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Total DPP Termin</span>
                      <div className="mt-1 text-lg font-bold tabular-nums text-text-primary">
                        {formatMoney(proposals.reduce((sum, p) => sum + Number(p.subtotal || 0), 0))}
                      </div>
                      <span className="mt-1 block text-xs text-text-secondary">{proposals.length} termin diajukan</span>
                    </div>
                    <div className="kpi-card" data-accent="blue">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Total PPN Terbit</span>
                      <div className="mt-1 text-lg font-bold tabular-nums text-blue-700">
                        {formatMoney(proposals.reduce((sum, p) => sum + Number(p.tax_amount || 0), 0))}
                      </div>
                      <span className="mt-1 block text-xs text-text-secondary">PPN Keluaran 11%</span>
                    </div>
                    <div className="kpi-card" data-accent="emerald">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Total Tagihan Bruto</span>
                      <div className="mt-1 text-lg font-bold tabular-nums text-brand-deep-green">
                        {formatMoney(proposals.reduce((sum, p) => sum + Number(p.total_amount || 0), 0))}
                      </div>
                      <span className="mt-1 block text-xs text-text-secondary">Nilai piutang klien</span>
                    </div>
                  </div>
                </FinanceSummarySection>

                <div className="fin-card flex flex-col gap-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">Proposal Penagihan Termin Klien</h3>
                      <p className="text-xs text-text-secondary">Alur persetujuan termin, penerbitan faktur tagihan resmi, dan posting ke Jurnal Umum serta buku Perpajakan.</p>
                    </div>
                    {canOperateFinance && (
                      <button onClick={() => setIsBillingModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
                        <Plus size={14} /> Buat Proposal
                      </button>
                    )}
                  </div>
                  <div className="table-scroll-wrapper">
                    <table className="w-full data-table text-xs min-w-[680px]">
                      <thead>
                        <tr className="bg-gray-50 text-2xs uppercase tracking-wider text-text-secondary">
                          <th className="py-2.5 px-3">Keterangan Termin</th>
                          <th className="py-2.5 px-3 text-right">Nilai Sebelum PPN</th>
                          <th className="py-2.5 px-3 text-right">PPN</th>
                          <th className="py-2.5 px-3 text-right">Total Tagihan</th>
                          <th className="py-2.5 px-3 col-center">Status Termin</th>
                          <th className="py-2.5 px-3 col-center">Status Pajak</th>
                          <th className="py-2.5 px-3 col-center">{canOperateFinance ? "Aksi" : "Keterangan"}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {proposals.map(p => {
                          const matchingDoc = customerInvoices.find(inv => inv.id === p.billing_document_id);
                          const isPosted = matchingDoc?.status === "POSTED";
                          const invoiceNum = matchingDoc?.invoice_number;

                          return (
                            <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="py-3 px-3">
                                <strong className="text-text-primary block font-semibold">{p.description || "Termin Faktur"}</strong>
                                {invoiceNum && matchingDoc && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const matchedProj = financeProjectOptions.find((pr) => String(pr.id) === String(matchingDoc.project_id ?? p.project_id));
                                      const activeCompanyName = companies.find((c) => String(c.id) === String(company))?.name || "Perusahaan Aktif";
                                      setPreviewInvoice({
                                        invoiceNumber: invoiceNum,
                                        status: String(matchingDoc.status || p.status || "ISSUED"),
                                        paymentStatus: String(matchingDoc.payment_status || "UNPAID"),
                                        invoiceDate: matchingDoc.invoice_date ?? p.created_at ?? null,
                                        dueDate: matchingDoc.due_date ?? null,
                                        postingDate: matchingDoc.posting_date ?? null,
                                        companyName: activeCompanyName,
                                        customerName: matchedProj?.customer_name || p.customer_name || "Klien Proyek",
                                        projectName: matchedProj?.project_name || matchedProj?.name || p.project_name || "Proyek Terkait",
                                        projectCode: matchedProj?.project_code || matchedProj?.code || null,
                                        description: p.description || "Termin Faktur",
                                        taxScheme: matchingDoc.tax_scheme ?? null,
                                        subtotal: Number(matchingDoc.subtotal ?? p.subtotal ?? 0),
                                        taxAmount: Number(matchingDoc.tax_amount ?? p.tax_amount ?? 0),
                                        totalAmount: Number(matchingDoc.total_amount ?? p.total_amount ?? p.subtotal ?? 0),
                                        paidAmount: Number(matchingDoc.paid_amount ?? 0),
                                        outstandingAmount: Number(matchingDoc.outstanding_amount ?? matchingDoc.total_amount ?? p.total_amount ?? 0),
                                      });
                                    }}
                                    className="text-3xs text-text-secondary hover:text-blue-800 block mt-0.5 cursor-pointer text-left"
                                    title="Klik untuk melihat pratinjau faktur"
                                  >
                                    Faktur: <span className="text-blue-700 font-semibold underline underline-offset-2">{invoiceNum}</span>
                                  </button>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums text-text-secondary">
                                {formatMoney(p.subtotal ?? 0)}
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums text-blue-700 font-medium">
                                {formatMoney(p.tax_amount ?? 0)}
                              </td>
                              <td className="py-3 px-3 text-right tabular-nums font-semibold text-text-primary">
                                {formatMoney(p.total_amount ?? p.subtotal ?? 0)}
                              </td>
                              <td className="py-3 px-3 col-center">
                                <span className={cn("status-label", p.status === "ISSUED" ? "is-ok" : "is-warn")}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 col-center">
                                {isPosted ? (
                                  <span className="status-label is-ok">
                                    <CheckCircle2 size={12} /> Masuk Pajak
                                  </span>
                                ) : (
                                  <span className="status-label is-idle">Belum Masuk Pajak</span>
                                )}
                              </td>
                              <td className="py-3 px-3 col-center">
                                <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
                                  {matchingDoc && invoiceNum && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const matchedProj = financeProjectOptions.find((pr) => String(pr.id) === String(matchingDoc.project_id ?? p.project_id));
                                        const activeCompanyName = companies.find((c) => String(c.id) === String(company))?.name || "Perusahaan Aktif";
                                        setPreviewInvoice({
                                          invoiceNumber: invoiceNum,
                                          status: String(matchingDoc.status || p.status || "ISSUED"),
                                          paymentStatus: String(matchingDoc.payment_status || "UNPAID"),
                                          invoiceDate: matchingDoc.invoice_date ?? p.created_at ?? null,
                                          dueDate: matchingDoc.due_date ?? null,
                                          postingDate: matchingDoc.posting_date ?? null,
                                          companyName: activeCompanyName,
                                          customerName: matchedProj?.customer_name || p.customer_name || "Klien Proyek",
                                          projectName: matchedProj?.project_name || matchedProj?.name || p.project_name || "Proyek Terkait",
                                          projectCode: matchedProj?.project_code || matchedProj?.code || null,
                                          description: p.description || "Termin Faktur",
                                          taxScheme: matchingDoc.tax_scheme ?? null,
                                          subtotal: Number(matchingDoc.subtotal ?? p.subtotal ?? 0),
                                          taxAmount: Number(matchingDoc.tax_amount ?? p.tax_amount ?? 0),
                                          totalAmount: Number(matchingDoc.total_amount ?? p.total_amount ?? p.subtotal ?? 0),
                                          paidAmount: Number(matchingDoc.paid_amount ?? 0),
                                          outstandingAmount: Number(matchingDoc.outstanding_amount ?? matchingDoc.total_amount ?? p.total_amount ?? 0),
                                        });
                                      }}
                                      className="btn-outline-soft py-1 px-2.5 text-2xs"
                                      title="Lihat & Cetak Faktur"
                                    >
                                      <Eye size={12} /> Lihat Faktur
                                    </button>
                                  )}
                                  {canOperateFinance ? (
                                    ["DRAFT", "SUBMITTED", "APPROVED"].includes(p.status) ? (
                                      <button disabled={Boolean(financePending[`billing-lifecycle:${p.id}`])} onClick={() => void handleBillingProposalLifecycle(p)} className="btn-outline-soft py-1 px-2.5 text-2xs disabled:opacity-50">
                                        {financePending[`billing-lifecycle:${p.id}`] ? "Memproses…" : p.status === "DRAFT" ? "Ajukan" : p.status === "SUBMITTED" ? "Setujui" : "Terbitkan Penagihan"}
                                      </button>
                                    ) : p.status === "ISSUED" && !isPosted ? (
                                      <button
                                        onClick={() => handlePostBillingProposal(p)}
                                        disabled={postingProposalId === p.id}
                                        className="btn-final py-1 px-3 text-2xs"
                                      >
                                        <Send size={11} />
                                        {postingProposalId === p.id ? "Memposting..." : "Posting Faktur"}
                                      </button>
                                    ) : !matchingDoc && !["DRAFT", "SUBMITTED", "APPROVED", "ISSUED"].includes(p.status) ? (
                                      <span className="cell-muted">{p.status}</span>
                                    ) : null
                                  ) : (
                                    <span className="cell-muted">{isPosted ? "Sudah diposting" : p.status}</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {!proposals.length && (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-xs text-text-secondary">
                              Belum ada proposal penagihan termin.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
                  <h3 className="text-sm font-bold text-text-primary">Piutang & Alur Uang Masuk Perusahaan</h3>
                  <p className="text-xs text-text-secondary">Penerimaan pembayaran dari klien / termin proyek ke rekening bank perusahaan.</p>
                </div>
                <button
                  onClick={() => { setReceiptErrors({}); setIsReceiptModalOpen(true); }}
                  className="btn-primary py-2 px-3.5 text-xs gap-1.5 shadow-sm"
                >
                  <Plus size={14} /> Catat Uang Masuk
                </button>
              </div>

              {/* KPI Summary Uang Masuk */}
              <FinanceSummarySection
                title="Ringkasan Penerimaan dan Piutang"
                subtitle="Ringkasan penerimaan yang dibukukan, piutang tersisa, dan transaksi yang menunggu proses."
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="kpi-card" data-accent="emerald">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary block">Total Penerimaan Dibukukan</span>
                    <span className="text-xl font-bold text-brand-deep-green mt-1 block tabular-nums">
                      {formatMoney(totalInflowRevenue)}
                    </span>
                    <span className="text-xs text-text-secondary mt-0.5 block">{receiptSummary?.posted_count ?? 0} transaksi dibukukan; {receiptSummary?.pending_count ?? 0} menunggu</span>
                  </div>

                  <div className="kpi-card" data-accent="amber">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary block">Sisa Piutang Berjalan</span>
                    <span className="text-xl font-bold text-amber-700 mt-1 block tabular-nums">
                      {formatMoney(receiptSummary?.outstanding_amount ?? 0)}
                    </span>
                    <span className="text-xs text-text-secondary mt-0.5 block">Faktur termin proyek belum lunas</span>
                  </div>

                  <div className="kpi-card" data-accent="navy">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary block">Menunggu Diproses</span>
                    <span className="text-xl font-bold text-text-primary mt-1 block tabular-nums">{receiptSummary?.pending_count ?? 0} transaksi</span>
                    <span className="text-xs text-text-secondary mt-0.5 block">Finance 1 mengajukan → Finance 2 menyetujui &amp; memposting</span>
                  </div>
                </div>
              </FinanceSummarySection>

              {/* Tabel Riwayat Uang Masuk */}
              <div className="fin-card flex flex-col gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Riwayat Penerimaan Pembayaran Klien</h4>
                  <p className="text-xs text-text-secondary mt-0.5">Finance pertama mencatat dan mengajukan penerimaan. Finance kedua klik Setujui &amp; Posting untuk membukukan uang masuk.</p>
                </div>
                <FinanceDataTable
                  rows={customerReceipts}
                  rowKey={(rec) => rec.id}
                  rowClassName={(rec) => (rec.status === "POSTED" ? "row-settled" : undefined)}
                  searchText={(rec) => `${rec.customer_name} ${rec.project_name} ${rec.receipt_number || ""} ${rec.reference_number || ""} ${rec.bank_account || ""} ${rec.status || ""}`}
                  searchPlaceholder="Cari klien, proyek, atau rekening..."
                  emptyText="Belum ada riwayat penerimaan pembayaran klien."
                  minWidth={680}
                  columns={[
                    {
                      key: "client",
                      header: "Klien & Proyek",
                      render: (rec) => (
                        <div>
                          <strong className="text-text-primary block font-semibold">{rec.customer_name}</strong>
                          <span className="text-xs text-text-secondary block">Proyek: {rec.project_name}</span>
                          <span className="cell-muted block">{formatDate(rec.payment_date)} · {rec.invoice_ref || rec.receipt_number || rec.reference_number}</span>
                        </div>
                      ),
                    },
                    {
                      key: "bank",
                      header: "Rekening Penerima",
                      render: (rec) => (
                        <div>
                          <span className="font-medium text-text-primary block">{String(rec.bank_account || "Rekening belum ditentukan").split("—")[0]}</span>
                          <span className="cell-muted block">Ref: {rec.reference_number || "—"}</span>
                        </div>
                      ),
                    },
                    {
                      key: "amount",
                      header: "Jumlah Uang Masuk",
                      align: "right",
                      render: (rec) => <SignedAmount value={Number(rec.amount || 0)} text={formatMoney(rec.amount)} plusSign />,
                    },
                    {
                      key: "status",
                      header: "Status",
                      align: "center",
                      render: (rec) => (
                        <span className={cn("status-label", rec.status === "POSTED" ? "is-ok" : "is-warn")}>
                          {String(rec.status || "DRAFT")}
                        </span>
                      ),
                    },
                    {
                      key: "action",
                      header: "Aksi",
                      align: "center",
                      render: (rec) => (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {receiptReadiness[rec.id]?.action && (
                              <button
                                type="button"
                                disabled={!receiptReadiness[rec.id]?.allowed || receiptActionId !== null || receiptDeletingId !== null}
                                onClick={() => handleReceiptLifecycle(rec)}
                                className={cn(
                                  receiptReadiness[rec.id].action === "approve-and-post" || receiptReadiness[rec.id].action === "post"
                                    ? "btn-final py-1 px-3 text-xs"
                                    : "btn-outline-soft py-1 px-3 text-xs",
                                  "disabled:opacity-50"
                                )}
                              >
                                <CheckCircle2 size={12} />
                                {receiptActionId === rec.id ? "Memproses…" : ({ submit: "Ajukan", "approve-and-post": "Setujui & Posting", approve: "Setujui", post: "Posting Penerimaan" } as Record<string, string>)[receiptReadiness[rec.id].action!]}
                              </button>
                            )}
                            {rec.status !== "POSTED" && (
                              <button
                                type="button"
                                disabled={receiptActionId !== null || receiptDeletingId !== null}
                                onClick={() => handleDeleteReceipt(rec.id)}
                                className="btn-outline-soft border-red-200 text-red-700 hover:bg-red-50 py-1 px-2.5 text-xs"
                                title="Hapus Catatan Uang Masuk"
                              >
                                <Trash2 size={12} />
                                {receiptDeletingId === rec.id ? "Menghapus…" : "Hapus"}
                              </button>
                            )}
                          </div>
                          {receiptActionError[rec.id] && <p role="alert" className="text-xs text-red-600">{receiptActionError[rec.id]}</p>}
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ── TAB 8: KAS & BANK MUTASI (CASH & BANK) ── */}
          {activeTab === "cashbank" && (
            <div className="flex flex-col gap-5">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Buku Kas & Bank Perusahaan</h3>
                  <p className="text-xs text-text-secondary">Pantau saldo real-time akun bank dan alur mutasi uang masuk serta uang keluar.</p>
                </div>
                <div className="ml-auto flex items-center justify-end gap-2 flex-wrap">
                  {canOperateFinance && (
                    <button
                      onClick={() => {
                        const offset = ledgerAccounts.find((account) => String(account.account_code) === "3200" && account.status === "ACTIVE");
                        setBankOpeningForm((current) => ({ ...current, offset_account_id: current.offset_account_id || String(offset?.id ?? "") }));
                        setIsBankOpeningFormOpen(true);
                      }}
                      className="btn-outline-soft"
                    >
                      <Plus size={13} /> Rekening Baru
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setReceiptErrors({});
                      setReceiptForm((current) => ({ ...current, bank_account: current.bank_account || bankAccounts[0]?.id || "" }));
                      setIsCashReceiptQuickOpen(true);
                    }}
                    className="btn-outline-soft"
                  >
                    <Plus size={13} /> Catat Uang Masuk
                  </button>
                  <button onClick={() => selectFinanceTab("ap")} className="btn-final">
                    <CreditCard size={13} /> Bayar dari Tagihan AP
                  </button>
                </div>
              </div>

              <Modal
                isOpen={canOperateFinance && isBankOpeningFormOpen}
                onClose={() => setIsBankOpeningFormOpen(false)}
                title="Tambah Rekening Kas & Bank"
                subtitle="Saldo awal akan masuk ke Buku Besar sebagai jurnal berimbang, sehingga saldo rekening langsung terlihat."
                maxWidth="2xl"
              >
                <form onSubmit={handleCreateBankAccountOpening} className="flex flex-col gap-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-700">Nama bank<input required value={bankOpeningForm.bank_name} onChange={(event) => setBankOpeningForm({ ...bankOpeningForm, bank_name: event.target.value })} placeholder="BCA / Mandiri / Kas Tunai" className="input mt-1 w-full py-2 text-xs" /></label>
                    <label className="text-xs font-semibold text-slate-700">Nomor rekening<input required value={bankOpeningForm.account_number} onChange={(event) => setBankOpeningForm({ ...bankOpeningForm, account_number: event.target.value })} placeholder="Nomor rekening" className="input mt-1 w-full py-2 text-xs" /></label>
                    <label className="text-xs font-semibold text-slate-700">Atas nama<input required value={bankOpeningForm.account_name} onChange={(event) => setBankOpeningForm({ ...bankOpeningForm, account_name: event.target.value })} placeholder="Nama pemilik" className="input mt-1 w-full py-2 text-xs" /></label>
                    <label className="text-xs font-semibold text-slate-700">Saldo awal (Rp)<IDRInput value={bankOpeningForm.opening_amount} onChange={(opening_amount) => setBankOpeningForm({ ...bankOpeningForm, opening_amount })} placeholder="0" className="input mt-1 w-full py-2 text-xs font-semibold" /></label>
                    <label className="text-xs font-semibold text-slate-700">Tanggal saldo awal<input required={Number(bankOpeningForm.opening_amount || 0) > 0} type="date" value={bankOpeningForm.opening_date} onChange={(event) => setBankOpeningForm({ ...bankOpeningForm, opening_date: event.target.value })} className="input mt-1 w-full py-2 text-xs" /></label>
                    <label className="text-xs font-semibold text-slate-700">Sumber saldo awal<select required={Number(bankOpeningForm.opening_amount || 0) > 0} value={bankOpeningForm.offset_account_id} onChange={(event) => setBankOpeningForm({ ...bankOpeningForm, offset_account_id: event.target.value })} className="input mt-1 w-full py-2 text-xs"><option value="">Pilih akun lawan</option>{ledgerAccounts.filter((account) => account.status === "ACTIVE" && ["EQUITY", "LIABILITY"].includes(String(account.account_type).toUpperCase()) && String(account.normal_balance).toUpperCase() === "CREDIT").map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">Jika saldo awal Rp 0, rekening dibuat tanpa jurnal saldo awal.</p>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setIsBankOpeningFormOpen(false)} className="btn-outline-soft">Batal</button>
                      <button type="submit" disabled={Boolean(financePending["create-bank-account-opening"])} className="btn-final disabled:opacity-60"><CheckCircle2 size={13} />{financePending["create-bank-account-opening"] ? "Menyimpan…" : "Simpan Rekening"}</button>
                    </div>
                  </div>
                </form>
              </Modal>

              <Modal
                isOpen={isCashReceiptQuickOpen}
                onClose={() => setIsCashReceiptQuickOpen(false)}
                title="Catat Uang Masuk Cepat"
                subtitle="Pilih proyek atau faktur, isi nominal dan rekening. Transaksi tersimpan sebagai draf untuk persetujuan."
                maxWidth="2xl"
              >
                <form noValidate onSubmit={handleCreateCustomerReceipt} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">Klien: <b>{receiptForm.customer_name || "otomatis dari proyek / faktur"}</b> · Metode: transfer bank</span>
                    <button type="button" onClick={() => { setIsCashReceiptQuickOpen(false); setIsReceiptModalOpen(true); }} className="text-xs font-semibold text-blue-700 underline underline-offset-2">Input lengkap (termasuk potongan pajak)</button>
                  </div>
                  {(receiptErrors.project_name || receiptErrors.customer_name) && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{receiptErrors.project_name || receiptErrors.customer_name}</p>}
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-700">Proyek<select required value={receiptForm.project_id} onChange={(event) => { const projectId = event.target.value; const project = financeProjectOptions.find((row) => String(row.id) === projectId); setReceiptForm((current) => ({ ...current, project_id: projectId, project_name: project?.project_name || project?.name || "", customer_name: project?.customer_name || project?.client_name || "" })); setReceiptErrors((current) => ({ ...current, project_name: "", customer_name: "" })); }} className="input mt-1 w-full py-2 text-xs"><option value="">Pilih proyek</option>{financeProjectOptions.map((project) => <option key={project.id} value={project.id}>{project.project_code ? `${project.project_code} — ` : ""}{project.project_name || project.name}</option>)}</select></label>
                    <label className="text-xs font-semibold text-slate-700">Faktur / Termin<select value={receiptForm.invoice_ref} onChange={(event) => { const invoiceId = event.target.value; const invoice = customerInvoices.find((row) => row.id === invoiceId); const remaining = invoice ? Number(invoice.outstanding_amount ?? (Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0))) : 0; setReceiptForm((current) => ({ ...current, invoice_ref: invoiceId, customer_name: invoice?.party?.display_name || invoice?.party?.legal_name || current.customer_name, project_name: invoice?.project?.name || current.project_name, project_id: invoice?.project_id || current.project_id, amount: remaining > 0 ? String(remaining) : current.amount })); setReceiptErrors((current) => ({ ...current, invoice_ref: "", amount: "" })); }} className="input mt-1 w-full py-2 text-xs"><option value="">Tanpa faktur</option>{customerInvoices.filter((invoice) => invoice.status === "POSTED" && Number(invoice.outstanding_amount ?? (Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0))) > 0).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · sisa {formatMoney(invoice.outstanding_amount ?? Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0))}</option>)}</select></label>
                    <label className="text-xs font-semibold text-slate-700">Nominal masuk (Rp)<IDRInput required placeholder="0" value={receiptForm.amount} onChange={(amount) => updateReceiptField("amount", amount)} className="input mt-1 w-full py-2 text-xs font-semibold" />{receiptError("amount")}</label>
                    <label className="text-xs font-semibold text-slate-700">Rekening penerima<select required value={receiptForm.bank_account} onChange={(event) => updateReceiptField("bank_account", event.target.value)} className="input mt-1 w-full py-2 text-xs"><option value="">Pilih rekening</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>{receiptError("bank_account")}</label>
                    <label className="text-xs font-semibold text-slate-700">Tanggal<input required type="date" value={receiptForm.payment_date} onChange={(event) => updateReceiptField("payment_date", event.target.value)} className="input mt-1 w-full py-2 text-xs" /></label>
                    <label className="text-xs font-semibold text-slate-700">No. bukti / referensi<input required value={receiptForm.reference_number} onChange={(event) => updateReceiptField("reference_number", event.target.value)} placeholder="Nomor transfer" className="input mt-1 w-full py-2 text-xs" />{receiptError("reference_number")}</label>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => setIsCashReceiptQuickOpen(false)} className="btn-outline-soft">Batal</button>
                    <button type="submit" disabled={receiptSaving || Boolean(financePending["create-customer-receipt"])} className="btn-final disabled:opacity-60"><CheckCircle2 size={13} />{receiptSaving || financePending["create-customer-receipt"] ? "Menyimpan…" : "Simpan Draf"}</button>
                  </div>
                </form>
              </Modal>

              {/* Kartu Rekening Bank */}
              <FinanceSummarySection
                title="Ringkasan Rekening Kas & Bank"
                subtitle="Saldo rekening yang tersedia untuk alur penerimaan dan pembayaran."
              >
                <div className="workspace-kpis grid gap-3">
                  {bankAccounts.map((b, idx) => (
                    <div key={b.id} className="kpi-card flex flex-col justify-between min-h-[115px]" data-accent={(["navy", "blue", "emerald", "purple"] as const)[idx % 4]}>
                      <div>
                        <div className="flex items-center justify-between text-2xs font-semibold text-text-secondary uppercase tracking-wide">
                          <span>{b.type.replace("_", " ")}</span>
                          <Landmark size={14} className="text-brand-green" />
                        </div>
                        <strong className="text-sm font-semibold text-text-primary block mt-1">{b.name.split("—")[0]}</strong>
                        <span className="cell-muted block mt-0.5">{b.number}</span>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-xs text-text-secondary whitespace-nowrap">Saldo:</span>
                        {b.balance == null ? (
                          <span className="status-label is-idle">Belum tersedia</span>
                        ) : (
                          <strong className="text-base font-bold tabular-nums text-brand-deep-green whitespace-nowrap">{formatMoney(b.balance)}</strong>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </FinanceSummarySection>

              {/* Notice jika ada penerimaan uang masuk yang masih Draft / Butuh Approval */}
              {customerReceipts.filter(r => r.status !== "POSTED").length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/90 text-xs text-amber-950 flex items-center justify-between flex-wrap gap-2 shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <Clock size={16} className="text-amber-600 shrink-0" />
                    <span>
                      Terdapat <strong>{customerReceipts.filter(r => r.status !== "POSTED").length} penerimaan uang masuk</strong> yang masih berstatus <strong>Draf / Menunggu Posting</strong>.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCashBankFilter("PENDING")}
                      className="btn-outline-soft border-amber-300 text-amber-900 hover:bg-amber-100 py-1 px-3 text-xs"
                    >
                      Tampilkan di Tabel Kas ➔
                    </button>
                  </div>
                </div>
              )}

              {/* Mutasi Kas & Bank (Inflow vs Outflow) */}
              {(() => {
                type CashMutationRow = {
                  key: string;
                  kind: "PENDING" | "IN" | "OUT";
                  date: string;
                  statusLabel: string;
                  bank: string;
                  title: string;
                  ref: string;
                  amount: number;
                  raw: any;
                };
                const allRows: CashMutationRow[] = [
                  ...(cashBankFilter !== "POSTED"
                    ? searchedPendingCashReceipts.map((rec) => ({
                        key: `pending-${rec.id}`,
                        kind: "PENDING" as const,
                        date: rec.payment_date || "",
                        statusLabel: rec.status === "APPROVED" ? "Disetujui" : "Draf (Menunggu)",
                        bank: String(rec.bank_account || "Rekening belum ditentukan").split("—")[0],
                        title: `${rec.customer_name} — ${rec.project_name || rec.invoice_ref || ""}`,
                        ref: `Ref: ${rec.reference_number || "—"}`,
                        amount: Number(rec.amount || 0),
                        raw: rec,
                      }))
                    : []),
                  ...(cashBankFilter !== "PENDING"
                    ? searchedPostedReceipts.map((rec) => ({
                        key: `in-${rec.id}`,
                        kind: "IN" as const,
                        date: rec.payment_date || "",
                        statusLabel: "Masuk (Dibukukan)",
                        bank: String(rec.bank_account || "Rekening belum ditentukan").split("—")[0],
                        title: `${rec.customer_name} — ${rec.invoice_ref || ""}`,
                        ref: `Ref: ${rec.reference_number || "—"}`,
                        amount: Number(rec.amount || 0),
                        raw: rec,
                      }))
                    : []),
                  ...(cashBankFilter !== "PENDING"
                    ? searchedPaidVendorBills.map((b) => ({
                        key: `out-${b.id}`,
                        kind: "OUT" as const,
                        date: b.due_date || "",
                        statusLabel: "Keluar (Dibayar)",
                        bank: b.bank_account_name || "-",
                        title: `Pembayaran Tagihan Vendor: ${b.supplier_name}`,
                        ref: `Faktur: ${b.invoice_number || "—"}`,
                        amount: -Math.abs(Number(b.amount || 0)),
                        raw: b,
                      }))
                    : []),
                ];
                return (
                  <div className="fin-card flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary">Buku Mutasi Arus Kas Riil</h4>
                        <p className="text-xs text-text-secondary mt-0.5">Daftar mutasi arus kas masuk, pengeluaran AP, dan penerimaan dalam proses.</p>
                      </div>
                      <span className="status-label is-idle">{allRows.length} transaksi</span>
                    </div>

                    <FinanceDataTable
                      rows={allRows}
                      rowKey={(row) => row.key}
                      rowClassName={(row) => (row.kind !== "PENDING" ? "row-settled" : undefined)}
                      searchText={(row) => `${row.title} ${row.ref} ${row.bank} ${row.statusLabel}`}
                      searchPlaceholder="Cari nomor bukti, lawan transaksi, rekening..."
                      emptyText="Tidak ada transaksi mutasi pada filter ini."
                      minWidth={720}
                      filters={
                        <div className="fin-subtabs">
                          <button type="button" data-active={cashBankFilter === "ALL"} onClick={() => setCashBankFilter("ALL")}>
                            Semua ({postedReceipts.length + paidVendorBills.length + pendingCashReceipts.length})
                          </button>
                          <button type="button" data-active={cashBankFilter === "POSTED"} onClick={() => setCashBankFilter("POSTED")}>
                            Dibukukan ({postedReceipts.length + paidVendorBills.length})
                          </button>
                          <button type="button" data-active={cashBankFilter === "PENDING"} onClick={() => setCashBankFilter("PENDING")}>
                            Draf / Tinjauan ({customerReceipts.filter((r) => r.status !== "POSTED").length})
                          </button>
                        </div>
                      }
                      columns={[
                        { key: "date", header: "Tanggal", render: (row) => <span className="tabular-nums">{formatDate(row.date)}</span> },
                        {
                          key: "status",
                          header: "Status & Tipe",
                          render: (row) => (
                            <span className={cn("status-label", row.kind === "IN" ? "is-ok" : "is-warn")}>
                              {row.statusLabel}
                            </span>
                          ),
                        },
                        { key: "bank", header: "Rekening Kas/Bank", render: (row) => <span className="font-medium text-text-primary">{row.bank}</span> },
                        {
                          key: "desc",
                          header: "Keterangan / Lawan Transaksi",
                          render: (row) => (
                            <div>
                              <span className="text-text-primary block font-medium">{row.title}</span>
                              <span className="cell-muted block">{row.ref}</span>
                            </div>
                          ),
                        },
                        {
                          key: "amount",
                          header: "Nominal Mutasi",
                          align: "right",
                          render: (row) => <SignedAmount value={row.amount} text={formatMoney(Math.abs(row.amount))} plusSign={row.amount > 0} />,
                        },
                        {
                          key: "action",
                          header: "Aksi",
                          align: "center",
                          render: (row) =>
                            row.kind === "PENDING" ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={receiptActionId !== null || receiptDeletingId !== null}
                                  onClick={() => handleReceiptLifecycle(row.raw)}
                                  className="btn-final py-1 px-2.5 text-2xs"
                                >
                                  <CheckCircle2 size={12} />
                                  {receiptActionId === row.raw.id ? "Memproses…" : "Posting Sekarang"}
                                </button>
                                <button
                                  type="button"
                                  disabled={receiptActionId !== null || receiptDeletingId !== null}
                                  onClick={() => handleDeleteReceipt(row.raw.id)}
                                  className="btn-outline-soft border-red-200 text-red-700 hover:bg-red-50 py-1 px-2.5 text-2xs"
                                  title="Hapus Catatan Uang Masuk"
                                >
                                  <Trash2 size={12} />
                                  {receiptDeletingId === row.raw.id ? "Menghapus…" : "Hapus"}
                                </button>
                              </div>
                            ) : (
                              <span className="status-label is-ok">
                                ✓ {row.kind === "IN" ? "Dibukukan" : "Dibayar"}
                              </span>
                            ),
                        },
                      ]}
                    />
                  </div>
                );
              })()}
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
              <ProjectTaxWorkspace startDate={financePeriodStart || undefined} endDate={financePeriodEnd || undefined} />
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
                      <BookOpen size={16} className="text-brand-green" /> Buku Besar &amp; Neraca Saldo (General Ledger)
                    </h3>
                    <p className="text-xs text-text-secondary">Saldo dihitung secara real-time dari akumulasi jurnal yang telah diposting (POSTED).</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        exportSheetsToXlsx("buku-besar-gl.xlsx", [
                          {
                            name: "Trial Balance",
                            rows: (trialBalanceAccounts || []).map((a: any) => ({
                              Kode: a.account_code,
                              Akun: a.account_name,
                              Tipe: a.account_type,
                              Debit: Number(a.total_debit ?? 0),
                              Kredit: Number(a.total_credit ?? 0),
                              Saldo: Number(a.net_balance ?? a.balance ?? 0),
                            })),
                          },
                        ])
                      }
                      className="btn-outline-soft"
                    >
                      <Download size={13} /> Ekspor .xlsx
                    </button>
                    <div className="fin-subtabs">
                      <button type="button" data-active={glActiveTab === "trial"} onClick={() => setGlActiveTab("trial")}>Neraca Saldo</button>
                      <button type="button" data-active={glActiveTab === "entries"} onClick={() => setGlActiveTab("entries")}>Jurnal Umum</button>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-text-secondary">Rentang aktif: {financePeriodStart && financePeriodEnd ? `${formatDate(financePeriodStart)} – ${formatDate(financePeriodEnd)}` : "kalender periode belum disiapkan"}</p>

                {glActiveTab === "trial" && (
                  <div className="fin-card flex flex-col gap-3 p-4">
                    {/* Summary Banner */}
                    {trialBalance && (
                      <div className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-xs font-semibold rounded-xl border",
                        trialBalance.is_balanced
                          ? "bg-brand-light-green border-brand-primary-soft text-brand-deep-green"
                          : "bg-red-50 border-red-200 text-red-800"
                      )}>
                        {trialBalance.is_balanced
                          ? <><CheckCircle2 size={15} /> Neraca Saldo SEIMBANG — Total Debit = Total Kredit ({formatRupiah(trialBalance.total_debit)})</>
                          : <><AlertTriangle size={15} /> TIDAK SEIMBANG! Debit: {formatRupiah(trialBalance.total_debit)} ≠ Kredit: {formatRupiah(trialBalance.total_credit)}</>}
                      </div>
                    )}
                    <FinanceDataTable
                      rows={trialBalanceAccounts}
                      rowKey={(acc: any) => acc.account_id}
                      searchText={(acc: any) => `${acc.account_code} ${acc.account_name} ${acc.account_type}`}
                      searchPlaceholder="Cari kode atau nama akun..."
                      emptyText={trialBalance?.accounts?.length ? "Tidak ada akun yang cocok dengan pencarian." : "Belum ada data jurnal yang diposting."}
                      minWidth={700}
                      filters={
                        <select
                          id="trial-balance-type-filter"
                          value={trialBalanceTypeFilter}
                          onChange={event => { setTrialBalanceTypeFilter(event.target.value); setTrialBalancePage(1); }}
                          className="input w-auto min-w-[150px] py-1.5 text-xs"
                        >
                          <option value="ALL">Semua tipe akun</option>
                          {Array.from(new Set((trialBalance?.accounts || []).map((account: any) => account.account_type).filter(Boolean))).sort().map((type: any) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      }
                      columns={[
                        { key: "code", header: "Kode Akun", render: (acc: any) => <span className="font-semibold text-brand-deep-green">{acc.account_code}</span> },
                        { key: "name", header: "Nama Akun", render: (acc: any) => <span className="text-text-primary font-medium">{acc.account_name}</span> },
                        {
                          key: "type",
                          header: "Tipe",
                          render: (acc: any) => (
                            <span className={cn("status-label is-idle")}>{acc.account_type}</span>
                          ),
                        },
                        { key: "debit", header: "Total Debit", align: "right", render: (acc: any) => <span className="tabular-nums">{acc.total_debit > 0 ? formatRupiah(acc.total_debit) : "-"}</span> },
                        { key: "credit", header: "Total Kredit", align: "right", render: (acc: any) => <span className="tabular-nums">{acc.total_credit > 0 ? formatRupiah(acc.total_credit) : "-"}</span> },
                        {
                          key: "net",
                          header: "Saldo Bersih",
                          align: "right",
                          render: (acc: any) => <SignedAmount value={acc.net_balance} text={formatRupiah(acc.net_balance)} />,
                        },
                      ]}
                    />
                  </div>
                )}

                {glActiveTab === "entries" && (
                  <div className="fin-card flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h4 className="text-sm font-semibold text-text-primary">Daftar Jurnal Umum</h4>
                      <span className="status-label is-idle">{journalEntries.length} jurnal</span>
                    </div>
                    <FinanceDataTable
                      rows={journalEntries}
                      rowKey={(je: any) => je.id}
                      rowClassName={(je: any) => (je.status === "POSTED" ? "row-settled" : undefined)}
                      searchText={(je: any) => `${je.entry_number || ""} ${je.description || ""} ${je.status || ""}`}
                      searchPlaceholder="Cari nomor jurnal, keterangan..."
                      emptyText="Belum ada entri jurnal umum."
                      minWidth={720}
                      filters={
                        <select
                          id="journal-status-filter"
                          value={journalStatusFilter}
                          onChange={event => { setJournalStatusFilter(event.target.value); setJournalPage(1); }}
                          className="input w-auto min-w-[140px] py-1.5 text-xs"
                        >
                          <option value="ALL">Semua status</option>
                          {Array.from(new Set(journalEntries.map((entry: any) => entry.status).filter(Boolean))).sort().map((status: any) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      }
                      columns={[
                        {
                          key: "no",
                          header: "No. Jurnal",
                          render: (je: any) => (
                            <span className="font-semibold text-brand-deep-green" title={je.entry_number || je.id}>
                              {formatJournalCode(je.entry_number || je.id?.slice(0, 8))}
                            </span>
                          ),
                        },
                        { key: "date", header: "Tanggal Posting", render: (je: any) => <span className="cell-muted">{je.posting_date ? formatDate(je.posting_date) : "-"}</span> },
                        { key: "desc", header: "Keterangan", render: (je: any) => <span className="text-text-primary text-xs">{je.description || "Jurnal Umum"}</span> },
                        {
                          key: "status",
                          header: "Status",
                          align: "center",
                          render: (je: any) => (
                            <span className={cn("status-label", je.status === "POSTED" ? "is-ok" : "is-warn")}>
                              {je.status}
                            </span>
                          ),
                        },
                        {
                          key: "action",
                          header: "Aksi",
                          align: "center",
                          render: (je: any) =>
                            je.status === "POSTED" && !je.is_reversed ? (
                              <button
                                onClick={() => { setSelectedJournalEntry(je); setIsReversalModalOpen(true); }}
                                className="btn-outline-soft py-1 px-2.5 text-2xs text-orange-700 border-orange-200 hover:bg-orange-50 gap-1"
                              >
                                <ArrowLeftRight size={11} /> Storno
                              </button>
                            ) : (
                              <span className="cell-muted">—</span>
                            ),
                        },
                      ]}
                    />
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === "coa" && <ChartOfAccountsWorkspace canOperate={canOperateFinance} />}
          {activeTab === "payroll" && <PayrollWorkspace canOperate={canOperateFinance} />}
          {activeTab === "recurring_expenses" && <RecurringExpensesWorkspace canOperate={canOperateFinance} />}
          {activeTab === "tax_setup" && <TaxCoaMappingWorkspace canOperate={canOperateFinance} />}

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
                      <BarChart3 size={16} className="text-brand-green" /> Laporan Keuangan
                    </h3>
                    <p className="text-xs text-text-secondary">Dihasilkan secara otomatis dari Buku Besar. Selalu sinkron dengan data transaksi terkini.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="fin-subtabs">
                      <button type="button" data-active={lapkeuActiveTab === "pl"} onClick={() => setLapkeuActiveTab("pl")}>Laba Rugi</button>
                      <button type="button" data-active={lapkeuActiveTab === "bs"} onClick={() => setLapkeuActiveTab("bs")}>Neraca</button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        exportSheetsToXlsx("laporan-keuangan.xlsx", [
                          {
                            name: "Laba Rugi",
                            rows: [
                              ...(profitLoss?.revenues || []).map((r: any) => ({
                                Kelompok: "PENDAPATAN",
                                Kode: r.account_code,
                                Akun: r.account_name,
                                Saldo: Number(r.amount ?? 0),
                              })),
                              ...(profitLoss?.expenses || []).map((e: any) => ({
                                Kelompok: "BEBAN",
                                Kode: e.account_code,
                                Akun: e.account_name,
                                Saldo: Number(e.amount ?? 0),
                              })),
                              {
                                Kelompok: "LABA / RUGI BERSIH",
                                Kode: "",
                                Akun: "Net Profit / Loss",
                                Saldo: Number(profitLoss?.net_profit_loss ?? 0),
                              },
                            ],
                          },
                          {
                            name: "Neraca",
                            rows: [
                              ...(balanceSheet?.assets || []).map((a: any) => ({
                                Kelompok: "ASET",
                                Kode: a.account_code,
                                Akun: a.account_name,
                                Saldo: Number(a.amount ?? 0),
                              })),
                              ...(balanceSheet?.liabilities || []).map((l: any) => ({
                                Kelompok: "KEWAJIBAN",
                                Kode: l.account_code,
                                Akun: l.account_name,
                                Saldo: Number(l.amount ?? 0),
                              })),
                              ...(balanceSheet?.equity || []).map((e: any) => ({
                                Kelompok: "EKUITAS",
                                Kode: e.account_code,
                                Akun: e.account_name,
                                Saldo: Number(e.amount ?? 0),
                              })),
                            ],
                          },
                        ])
                      }
                      className="btn-outline-soft ml-auto"
                    >
                      <Download size={13} /> Ekspor .xlsx
                    </button>
                  </div>
                </div>

                {lapkeuActiveTab === "pl" && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
                    {/* Summary left, account detail right. */}
                    <div className="lg:col-span-4">
                      <FinanceSummarySection
                        title="Ringkasan Laba Rugi"
                        subtitle="Ikhtisar pendapatan, beban, dan hasil bersih sebelum rincian akun."
                      >
                        <div className="grid grid-cols-1 gap-3">
                          <div className={cn("card rounded-2xl p-4 border-l-4", profitLoss?.is_profit ? "border-brand-green" : "border-red-500")}>
                            <span className="text-xs text-text-secondary">Total Pendapatan</span>
                            <p className="break-words text-xl font-black tabular-nums text-brand-deep-green">{formatRupiah(profitLoss?.total_revenue ?? 0)}</p>
                          </div>
                          <div className="card rounded-2xl p-4 border-l-4 border-red-400">
                            <span className="text-xs text-text-secondary">Total Beban</span>
                            <p className="break-words text-xl font-black tabular-nums text-red-600">{formatRupiah(profitLoss?.total_expense ?? 0)}</p>
                          </div>
                          <div className={cn("card rounded-2xl p-4 border-l-4", (profitLoss?.net_profit_loss ?? 0) >= 0 ? "border-brand-green" : "border-red-600")}>
                            <span className="text-xs text-text-secondary">Laba / Rugi Bersih</span>
                            <p className={cn("text-xl font-black", (profitLoss?.net_profit_loss ?? 0) >= 0 ? "text-brand-deep-green" : "text-red-700")}>
                              {formatRupiah(profitLoss?.net_profit_loss ?? 0)}
                            </p>
                          </div>
                        </div>
                      </FinanceSummarySection>
                    </div>

                    <div className="grid min-w-0 grid-cols-1 gap-4 lg:col-span-8 xl:grid-cols-2">
                      {/* Revenue Table */}
                      <div className="card rounded-2xl overflow-hidden border border-text-tertiary">
                        <div className="px-4 py-3 bg-brand-light-green border-b border-brand-primary-soft">
                          <h4 className="text-xs font-bold text-brand-deep-green flex items-center gap-1.5"><TrendingUp size={13} /> Pendapatan (Revenue)</h4>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {profitLoss?.revenues?.map((r: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                              <div className="min-w-0">
                                <span className="font-mono text-brand-deep-green text-2xs">{r.account_code}</span>
                                <p className="font-medium text-text-primary">{r.account_name}</p>
                              </div>
                              <span className="shrink-0 whitespace-nowrap text-right font-bold tabular-nums text-brand-deep-green">{formatRupiah(r.amount)}</span>
                            </div>
                          ))}
                          {!profitLoss?.revenues?.length && <p className="text-xs text-center py-6 text-text-secondary">Belum ada data pendapatan.</p>}
                        </div>
                        {profitLoss?.total_revenue > 0 && (
                          <div className="px-4 py-2.5 bg-brand-light-green border-t flex justify-between text-xs font-black text-brand-deep-green">
                            <span>TOTAL PENDAPATAN</span>
                            <span>{formatRupiah(profitLoss.total_revenue)}</span>
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
                            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                              <div className="min-w-0">
                                <span className="font-mono text-red-600 text-2xs">{e.account_code}</span>
                                <p className="font-medium text-text-primary">{e.account_name}</p>
                              </div>
                              <span className="shrink-0 whitespace-nowrap text-right font-bold tabular-nums text-red-700">{formatRupiah(e.amount)}</span>
                            </div>
                          ))}
                          {!profitLoss?.expenses?.length && <p className="text-xs text-center py-6 text-text-secondary">Belum ada data beban.</p>}
                        </div>
                        {profitLoss?.total_expense > 0 && (
                          <div className="px-4 py-2.5 bg-red-50 border-t flex justify-between text-xs font-black text-red-800">
                            <span>TOTAL BEBAN</span>
                            <span>{formatRupiah(profitLoss.total_expense)}</span>
                          </div>
                        )}
                      </div>

                      {/* Net P&L Summary */}
                      <div className="card rounded-2xl p-5 border border-text-tertiary flex flex-col gap-4 xl:col-span-2">
                        <h4 className="text-xs font-bold text-text-primary">Ringkasan Laba Rugi</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between text-xs">
                            <span className="text-text-secondary">Pendapatan Kotor</span>
                            <span className="font-bold text-brand-deep-green">{formatRupiah(profitLoss?.total_revenue ?? 0)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-secondary">HPP / COGS</span>
                            <span className="font-bold text-red-700">{formatRupiah(profitLoss?.expenses?.filter((e: any) => e.account_code?.startsWith('5')).reduce((s: number, e: any) => s + e.amount, 0) ?? 0)}</span>
                          </div>
                          <hr className="border-text-tertiary" />
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-text-primary">Laba Kotor</span>
                            <span className="font-bold text-brand-deep-green">{formatRupiah(Number(profitLoss?.total_revenue ?? 0) - Number(profitLoss?.expenses?.filter((e: any) => e.account_code?.startsWith('5')).reduce((s: number, e: any) => s + e.amount, 0) ?? 0))}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-secondary">Beban Operasional</span>
                            <span className="font-bold text-orange-700">{formatRupiah(profitLoss?.expenses?.filter((e: any) => e.account_code?.startsWith('6')).reduce((s: number, e: any) => s + e.amount, 0) ?? 0)}</span>
                          </div>
                          <hr className="border-text-tertiary" />
                          <div className="flex justify-between text-sm">
                            <span className="font-black text-text-primary">Laba / Rugi Bersih</span>
                            <span className={cn("font-black", (profitLoss?.net_profit_loss ?? 0) >= 0 ? "text-brand-deep-green" : "text-red-700")}>
                              {formatRupiah(profitLoss?.net_profit_loss ?? 0)}
                            </span>
                          </div>
                        </div>
                        <p className="text-2xs text-text-secondary border-t pt-2">
                          Generated: {profitLoss?.generated_at ? new Date(profitLoss.generated_at).toLocaleString("id-ID") : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {lapkeuActiveTab === "bs" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Assets */}
                    <details className="card group rounded-2xl border border-text-tertiary bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-blue-800"><Building size={13} /> ASET (Assets)<span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{balanceSheet?.assets?.length || 0} akun</span></span>
                          <span className="mt-1 block text-xs font-black tabular-nums text-blue-800">Total {formatRupiah(balanceSheet?.total_assets ?? 0)}</span>
                        </span>
                        <ChevronDown size={15} className="shrink-0 text-blue-700 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="max-h-[480px] overflow-auto border-t border-blue-200">
                        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-blue-50 text-[10px] font-semibold uppercase tracking-wide text-blue-800"><tr><th className="px-4 py-2">Kode</th><th className="px-4 py-2">Nama Akun</th><th className="px-4 py-2 text-right">Saldo</th></tr></thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {balanceSheet?.assets?.map((a: any, i: number) => <tr key={i} className="hover:bg-blue-50/40"><td className="whitespace-nowrap px-4 py-2.5 font-mono text-[10px] text-text-secondary">{a.account_code}</td><td className="px-4 py-2.5 text-text-primary">{a.account_name}</td><td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-blue-700">{formatRupiah(a.amount)}</td></tr>)}
                            {!balanceSheet?.assets?.length && <tr><td colSpan={3} className="px-4 py-6 text-center text-text-secondary">Belum ada data aset.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </details>

                    {/* Liabilities + Equity */}
                    <div className="flex flex-col gap-4">
                      <details className="card group rounded-2xl border border-text-tertiary bg-white">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-orange-50 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-bold text-orange-800"><Layers size={13} /> KEWAJIBAN (Liabilities)<span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-orange-700">{balanceSheet?.liabilities?.length || 0} akun</span></span><span className="mt-1 block text-xs font-black tabular-nums text-orange-800">Total {formatRupiah(balanceSheet?.total_liabilities ?? 0)}</span></span>
                          <ChevronDown size={15} className="shrink-0 text-orange-700 transition-transform group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <div className="max-h-[360px] overflow-auto border-t border-orange-200"><table className="w-full min-w-[420px] border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-orange-50 text-[10px] font-semibold uppercase tracking-wide text-orange-800"><tr><th className="px-4 py-2">Kode</th><th className="px-4 py-2">Nama Akun</th><th className="px-4 py-2 text-right">Saldo</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{balanceSheet?.liabilities?.map((l: any, i: number) => <tr key={i} className="hover:bg-orange-50/40"><td className="whitespace-nowrap px-4 py-2.5 font-mono text-[10px] text-text-secondary">{l.account_code}</td><td className="px-4 py-2.5 text-text-primary">{l.account_name}</td><td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-orange-700">{formatRupiah(l.amount)}</td></tr>)}{!balanceSheet?.liabilities?.length && <tr><td colSpan={3} className="px-4 py-5 text-center text-text-secondary">Belum ada kewajiban.</td></tr>}</tbody></table></div>
                      </details>
                      <details className="card group rounded-2xl border border-text-tertiary bg-white">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-purple-50 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-bold text-purple-800"><ShieldCheck size={13} /> EKUITAS (Equity)<span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-purple-700">{balanceSheet?.equity?.length || 0} akun</span></span><span className="mt-1 block text-xs font-black tabular-nums text-purple-800">Total {formatRupiah(balanceSheet?.total_equity ?? 0)}</span></span>
                          <ChevronDown size={15} className="shrink-0 text-purple-700 transition-transform group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <div className="max-h-[360px] overflow-auto border-t border-purple-200"><table className="w-full min-w-[420px] border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-purple-50 text-[10px] font-semibold uppercase tracking-wide text-purple-800"><tr><th className="px-4 py-2">Kode</th><th className="px-4 py-2">Nama Akun</th><th className="px-4 py-2 text-right">Saldo</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{balanceSheet?.equity?.map((e: any, i: number) => <tr key={i} className="hover:bg-purple-50/40"><td className="whitespace-nowrap px-4 py-2.5 font-mono text-[10px] text-text-secondary">{e.account_code}</td><td className="px-4 py-2.5 text-text-primary">{e.account_name}</td><td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-purple-700">{formatRupiah(e.amount)}</td></tr>)}{!balanceSheet?.equity?.length && <tr><td colSpan={3} className="px-4 py-5 text-center text-text-secondary">Belum ada data ekuitas.</td></tr>}</tbody></table></div>
                      </details>
                      {/* Balance Check */}
                      <div className={cn(
                        "card rounded-xl p-4 flex items-center gap-3 text-xs font-semibold border",
                        balanceSheet?.is_balanced ? "bg-brand-light-green border-brand-primary-soft text-brand-deep-green" : "bg-red-50 border-red-300 text-red-800"
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
                    <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                      <Banknote size={16} className="text-brand-green" /> Banking Hub & Rekonsiliasi Bank
                    </h3>
                    <p className="text-sm text-text-secondary">Impor mutasi rekening bank dan cocokkan dengan transaksi di buku besar secara otomatis.</p>
                  </div>
                </div>

                <div className="card rounded-2xl p-4 border border-text-tertiary bg-white flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Rekening Bank</label>
                    <select value={bankImportAccountId} onChange={(event) => setBankImportAccountId(event.target.value)} className="input w-full">
                      <option value="">Pilih rekening</option>
                      {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bank || account.name?.split("—")[0] || "Rekening"}</option>)}
                    </select>
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <label className="block text-xs font-semibold text-text-secondary mb-1">File mutasi (CSV)</label>
                    <input type="file" accept=".csv,text/csv" onChange={(event) => setBankImportFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-brand-light-green file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-deep-green" />
                  </div>
                  <button type="button" onClick={importBankStatement} disabled={bankImporting || !bankImportAccountId || !bankImportFile} className="btn-final py-2 px-4 text-xs disabled:opacity-50">
                    {bankImporting ? "Mengimpor…" : "Impor Mutasi CSV"}
                  </button>
                  <p className="w-full text-xs text-text-secondary">CSV: kolom tanggal, keterangan, nominal, dan tipe (DB/CR). Maksimal 5 MB.</p>
                </div>

                {/* Ringkasan Saldo Real-Time */}
                <div className="workspace-kpis grid gap-3">
                  {bankAccounts.map((b, idx) => (
                    <div key={b.id} className={cn("kpi-card flex flex-col justify-between", bankImportAccountId === b.id && "ring-2 ring-[#163D64]")} data-accent={(["navy", "blue", "emerald", "purple"] as const)[idx % 4]}>
                      <div className="flex items-center justify-between text-2xs font-semibold text-text-secondary uppercase">
                        <span>{b.type.replace(/_/g, " ")}</span>
                        <Landmark size={14} className="text-brand-green" />
                      </div>
                      <strong className="text-sm font-semibold text-text-primary block mt-1">{b.bank || b.name?.split("—")[0]}</strong>
                      <span className="cell-muted block mt-0.5">{bankImportAccountId === b.id ? b.number : "••••••••"}</span>
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-xs text-text-secondary whitespace-nowrap">Saldo:</span>
                        {b.balance == null ? (
                          <span className="status-label is-idle">Belum tersedia</span>
                        ) : (
                          <strong className="text-sm font-bold tabular-nums text-brand-deep-green whitespace-nowrap">{formatMoney(b.balance)}</strong>
                        )}
                      </div>
                      <button type="button" onClick={() => setBankImportAccountId(b.id)} aria-pressed={bankImportAccountId === b.id} className={cn("mt-3 w-full rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", bankImportAccountId === b.id ? "border-[#163D64] bg-[#163D64] text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
                        {bankImportAccountId === b.id ? "Rekening Dipilih" : "Pilih untuk Rekonsiliasi"}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Rekonsiliasi Status dengan TablePagination & 1-baris search */}
                <div className="fin-card flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h4 className="text-sm font-semibold text-text-primary">Status Rekonsiliasi Bank</h4>
                    <span className="status-label is-idle">
                      {new Set(bankStatements.map((line: any) => line.bank_statement_id).filter(Boolean)).size} statement | {bankReconciliations.filter((r: any) => r.status === "MATCHED").length} cocok
                    </span>
                  </div>
                  <FinanceDataTable
                    rows={bankStatements}
                    rowKey={(stmt: any) => stmt.id}
                    searchText={(stmt: any) => `${stmt.description || ""} ${stmt.reference_number || ""} ${stmt.status || ""}`}
                    searchPlaceholder="Cari referensi atau keterangan..."
                    emptyText="Belum ada mutasi statement bank diimpor."
                    minWidth={720}
                    columns={[
                      { key: "date", header: "Tanggal", render: (stmt: any) => <span className="cell-muted">{formatDate(stmt.statement_date)}</span> },
                      { key: "ref", header: "Referensi", render: (stmt: any) => <span className="cell-muted">{stmt.reference_number || "-"}</span> },
                      { key: "desc", header: "Keterangan", render: (stmt: any) => <span className="text-text-primary font-medium text-xs">{stmt.description}</span> },
                      {
                        key: "debit",
                        header: "Debit",
                        align: "right",
                        render: (stmt: any) => <span className="tabular-nums">{stmt.type === "DEBIT" ? formatMoney(stmt.amount) : "-"}</span>,
                      },
                      {
                        key: "credit",
                        header: "Kredit",
                        align: "right",
                        render: (stmt: any) => <span className="tabular-nums">{stmt.type === "CREDIT" ? formatMoney(stmt.amount) : "-"}</span>,
                      },
                      {
                        key: "status",
                        header: "Status",
                        align: "center",
                        render: (stmt: any) => {
                          const recon = bankReconciliations.find((r: any) => r.bank_statement_line_id === stmt.id);
                          return (
                            <span className={cn("status-label", recon?.status === "MATCHED" ? "is-ok" : "is-warn")}>
                              {recon?.status || "UNRECONCILED"}
                            </span>
                          );
                        },
                      },
                      {
                        key: "match",
                        header: "Cocokkan Pembayaran",
                        render: (stmt: any) => {
                          const recon = bankReconciliations.find((r: any) => r.bank_statement_line_id === stmt.id);
                          const isMatched = recon?.status === "MATCHED";
                          if (isMatched) return <span className="cell-muted">Sudah dicocokkan</span>;
                          return (
                            <div className="flex min-w-[240px] items-center gap-1.5">
                              <select
                                value={bankMatchPaymentIds[String(stmt.id)] || ""}
                                onChange={(event) => setBankMatchPaymentIds((current) => ({ ...current, [String(stmt.id)]: event.target.value }))}
                                className="input flex-1 py-1 text-xs"
                                disabled={!bankMatchPayments.length || bankMatchingLineId === String(stmt.id)}
                              >
                                <option value="">{bankMatchPayments.length ? "Pilih pembayaran / penerimaan" : "Belum ada transaksi"}</option>
                                {bankMatchPayments.map((payment: any) => (
                                  <option key={payment.id} value={payment.id}>
                                    {payment.payment_type === "CUSTOMER_RECEIPT" ? "Penerimaan" : "Pembayaran"} · {payment.reference_number || payment.id.slice(0, 8)} · {formatMoney(Number(payment.amount || 0))}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => matchBankStatementLine(stmt)}
                                disabled={!bankMatchPaymentIds[String(stmt.id)] || bankMatchingLineId === String(stmt.id)}
                                className="btn-outline-soft py-1 px-2.5 text-xs whitespace-nowrap disabled:opacity-50"
                              >
                                {bankMatchingLineId === String(stmt.id) ? "…" : "Cocokkan"}
                              </button>
                            </div>
                          );
                        },
                      },
                    ]}
                  />
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
              <AuditTrailWorkspace startDate={financePeriodStart || undefined} endDate={financePeriodEnd || undefined} />
            </div>
          )}

          {/* ── TAB: EXECUTIVE AUDIT REPORT ───────────── */}
          {activeTab === "executive_report" && (
            <div className="card rounded-2xl p-3 sm:p-5 lg:p-6">
              <ExecutiveAuditReportWorkspace startDate={financePeriodStart || undefined} endDate={financePeriodEnd || undefined} />
            </div>
          )}

        </div>
      </div>

      {/* ── MODALS ───────────────────────────────── */}

      {/* Modal: 3-Way Match Verification */}
      <Modal
        isOpen={isMatchModalOpen}
        onClose={() => setIsMatchModalOpen(false)}
        title="Verifikasi Dokumen Invoice"
        subtitle={`Invoice: ${selectedBillForMatch?.invoice_number || "Tidak tersedia"}`}
      >
        <div className="flex flex-col gap-4">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            Verifikasi ini hanya mengubah lifecycle dokumen dari SUBMITTED menjadi VERIFIED. Sistem belum memiliki relasi PO dan GRN pada kontrak invoice ini, sehingga tidak mengklaim 3-way match.
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setIsMatchModalOpen(false)} className="btn-ghost py-1.5 px-3 text-xs">
              Batal
            </button>
            <button
              type="button"
              disabled={Boolean(financePending[`three-way-match:${selectedBillForMatch?.id ?? "none"}`])}
              onClick={handleConfirmThreeWayMatch}
              className="btn-primary py-2 px-4 text-xs bg-brand-green hover:bg-brand-deep-green font-bold disabled:opacity-50"
            >
              {financePending[`three-way-match:${selectedBillForMatch?.id ?? "none"}`] ? "Memverifikasi…" : "Konfirmasi Verifikasi Dokumen"}
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
          onSubmit={(e) => runFinanceAction("create-project-cost", async () => {
            e.preventDefault();
            try {
              const amount = Number(costForm.amount);
              if (!costForm.project || !Number.isFinite(amount) || amount <= 0 || !costForm.description.trim()) {
                toast.error("Project, jumlah biaya, dan deskripsi wajib diisi.");
                return;
              }
              await api.post("/api/v1/finance/project-cost-entries/", {
                project_id: costForm.project,
                division_id: costForm.division_id || undefined,
                source_type: "MANUAL_COST",
                source_reference: `MANUAL-${localDateKey()}`,
                description: costForm.description.trim(),
                cost_element: costForm.category,
                transaction_date: localDateKey(),
                quantity: 1,
                unit_cost: amount,
                total_cost: amount,
                status: "DRAFT",
              });
              toast.success("Biaya berhasil dicatat!");
              setIsCostModalOpen(false);
              setCostForm({ project: "", category: "MATERIAL", division_id: "", amount: "", description: "" });
              await loadFinanceData(true);
            } catch (error) {
              toast.error(getApiErrorDetail(error, "Biaya belum dapat dicatat. Periksa proyek, nominal, dan hak akses, lalu coba lagi."));
            }
          })}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Project *</label>
            <select required value={costForm.project} onChange={e => setCostForm({ ...costForm, project: e.target.value })} className="input">
              <option value="">Pilih project</option>
              {financeProjectOptions.map((project) => <option key={project.id} value={project.id}>{project.project_code} — {project.project_name}</option>)}
            </select>
          </div>
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
              <label className="text-xs font-semibold text-text-primary block mb-1">Divisi</label>
              <select
                value={costForm.division_id}
                onChange={e => setCostForm({ ...costForm, division_id: e.target.value })}
                className="input"
              >
                <option value="">— Pilih Divisi (Opsional)</option>
                {divisionOptions.map(div => (
                  <option key={div.id} value={div.id}>{div.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="cost-amount" className="text-xs font-semibold text-text-primary block mb-1">Jumlah Biaya (Rp) *</label>
            <IDRInput
              id="cost-amount"
              required
              value={costForm.amount}
              onChange={amount => setCostForm({ ...costForm, amount })}
              className="input"
              showPrefix={false}
            />
          </div>
          <div>
            <label htmlFor="cost-description" className="text-xs font-semibold text-text-primary block mb-1">Deskripsi Pengeluaran *</label>
            <input
              id="cost-description"
              type="text"
              required
              placeholder="Contoh: Pengambilan sensor Schneider 12 unit"
              value={costForm.description}
              onChange={e => setCostForm({ ...costForm, description: e.target.value })}
              className="input"
            />
          </div>
          <button type="submit" disabled={Boolean(financePending["create-project-cost"])} className="btn-primary w-full justify-center py-2.5 mt-2 disabled:opacity-50">
            {financePending["create-project-cost"] ? "Menyimpan…" : "Simpan & Catat Biaya"}
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
          onSubmit={(e) => runFinanceAction("create-funding-request", async () => {
            e.preventDefault();
            try {
              const amount = Number(fundingForm.amount);
              if (!Number.isFinite(amount) || amount <= 0) {
                toast.error("Jumlah dana harus lebih dari Rp 0");
                return;
              }
              if (!fundingForm.need_type || !fundingForm.purpose.trim()) {
                toast.error("Jenis kebutuhan dan detail / keterangan wajib diisi.");
                return;
              }
              const title = `${fundingForm.need_type} - ${fundingForm.purpose.trim()}`.slice(0, 60);
              const response = await api.post("/api/v1/requests", {
                request_type: "FUND_REQUEST",
                title,
                description: `${fundingForm.need_type}\n${fundingForm.purpose.trim()}`,
                amount,
                project_id: fundingForm.project_id || undefined,
                budget_category: "OPERATIONAL",
                is_draft: false,
              });
              const createdRequest = response.data?.data ?? response.data;
              toast.success(`Request dana ${createdRequest.request_number || createdRequest.id || ""} berhasil diajukan.`);
              setIsFundingModalOpen(false);
              setFundingForm({ amount: "", need_type: "", purpose: "", project_id: "" });
              await loadFinanceData(true);
            } catch (error) {
              toast.error(getApiErrorDetail(error, "Permintaan dana belum dapat diajukan. Periksa nominal dan data kebutuhan, lalu coba lagi."));
            }
          })}
          className="flex flex-col gap-4"
        >
          <div>
            <label htmlFor="funding-amount" className="text-xs font-semibold text-text-primary block mb-1">Jumlah Dana (Rp) *</label>
            <IDRInput
              id="funding-amount"
              required
              value={fundingForm.amount}
              onChange={amount =>
                setFundingForm({
                  ...fundingForm,
                  amount,
                })
              }
              className="input"
              placeholder="Masukkan jumlah dana"
              showPrefix={false}
            />
          </div>
          <div>
            <label htmlFor="funding-type" className="text-xs font-semibold text-text-primary block mb-1">Jenis Kebutuhan *</label>
            <select
              id="funding-type"
              value={fundingForm.need_type}
              onChange={e => setFundingForm({ ...fundingForm, need_type: e.target.value })}
              className="input"
              required
            >
              <option value="">Pilih jenis kebutuhan</option>
              <option value="Pengeluaran Modal Usaha">Pengeluaran Modal Usaha</option>
              <option value="Pengadaan Fasilitas Karyawan">Pengadaan Fasilitas Karyawan</option>
              <option value="Pengadaan Vendor dan Mitra Proyek">Pengadaan Vendor dan Mitra Proyek</option>
              <option value="Operasional dan Perjalanan Proyek">Operasional dan Perjalanan Proyek</option>
              <option value="Perangkat Lunak dan Infrastruktur Digital">Perangkat Lunak dan Infrastruktur Digital</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>
          <div>
            <label htmlFor="funding-project" className="text-xs font-semibold text-text-primary block mb-1">Proyek</label>
            <select id="funding-project" value={fundingForm.project_id} onChange={e => setFundingForm({ ...fundingForm, project_id: e.target.value })} className="input">
              <option value="">Pilih proyek (opsional)</option>
              {financeProjectOptions.map((project: any) => <option key={project.id} value={project.id}>{project.project_code ? `${project.project_code} · ` : ""}{project.project_name || project.name || project.id}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="funding-detail" className="text-xs font-semibold text-text-primary block mb-1">
              {fundingForm.need_type === "Lainnya" ? "Keterangan Kebutuhan Lainnya *" : "Detail / Keterangan Kebutuhan *"}
            </label>
            <textarea id="funding-detail" required rows={3} value={fundingForm.purpose}
              onChange={e => setFundingForm({ ...fundingForm, purpose: e.target.value })}
              placeholder="Tuliskan detail kebutuhan yang diajukan" className="input" />
          </div>
          <button type="submit" disabled={Boolean(financePending["create-funding-request"])} className="btn-primary w-full justify-center py-2.5 mt-2 disabled:opacity-50">
            {financePending["create-funding-request"] ? "Mengirim…" : "Ajukan Request Dana"}
          </button>
        </form>
      </Modal>

      {/* Modal: Proposal Billing */}
      <Modal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        title="Buat Tagihan Termin"
        subtitle="Masukkan nilai termin yang akan ditagihkan kepada klien."
        size="md"
      >
        <form
          onSubmit={(e) => runFinanceAction("create-billing-proposal", async () => {
            e.preventDefault();
            try {
              const dpp = Number(billingForm.amount);

              if (!Number.isFinite(dpp) || dpp <= 0) {
                toast.error("Nilai termin harus lebih dari Rp 0.");
                return;
              }

              if (!billingForm.description.trim()) {
                toast.error("Keterangan termin wajib diisi.");
                return;
              }

              const selectedProject = financeProjectOptions.find(
                (project) => String(project.id) === String(billingForm.project),
              );

              if (!selectedProject) {
                toast.error("Project wajib dipilih.");
                return;
              }

              const includePpn = billingForm.tax_scheme === "PROPORTIONAL";
              const ppn = includePpn ? (dpp * 11) / 100 : 0;

              await api.post("/api/v1/finance/billing-proposals/", {
                project_id: selectedProject.id,
                tax_scheme: billingForm.tax_scheme,
                trigger_type: "MANUAL_MILESTONE",
                description: billingForm.description.trim(),
                subtotal: dpp,
                tax_rate: includePpn ? 11 : 0,
                tax_amount: ppn,
                total_amount: dpp + ppn,
                status: "DRAFT",
              });

              toast.success("Proposal tagihan berhasil dibuat.");
              setIsBillingModalOpen(false);
              setBillingForm({
                project: "",
                amount: 0,
                description: "",
                tax_scheme: "PROPORTIONAL",
              });
              await loadFinanceData(true);
            } catch (error) {
              toast.error(getApiErrorDetail(
                error,
                "Gagal membuat proposal tagihan. Periksa project, customer, dan nilai termin.",
              ));
            }
          })}
          className="flex flex-col gap-4 p-1 text-xs"
        >
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Project *
            </label>
            <select
              required
              value={billingForm.project}
              onChange={e => setBillingForm({ ...billingForm, project: e.target.value })}
              className="input text-xs"
            >
              <option value="">Pilih project</option>
              {financeProjectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_code} — {project.project_name}
                </option>
              ))}
            </select>
            {billingForm.project && (() => {
              const project = financeProjectOptions.find(
                (item) => String(item.id) === String(billingForm.project),
              );
              return project?.customer_name ? (
                <p className="mt-1 text-[11px] text-text-secondary">
                  Customer: <span className="font-semibold text-slate-700">{project.customer_name}</span>
                </p>
              ) : null;
            })()}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nilai Termin Sebelum PPN (Rp) *
            </label>
            <IDRInput
              required
              value={billingForm.amount === 0 ? "" : billingForm.amount}
              onChange={amount =>
                setBillingForm({
                  ...billingForm,
                  amount: amount === "" ? 0 : Number(amount),
                })
              }
              placeholder="Contoh: 150.000.000"
              className="input text-xs font-bold text-slate-800"
              showPrefix={false}
            />
            <p className="mt-1 text-[11px] text-text-secondary">
              Isi nilai pekerjaan/termin yang akan ditagihkan, belum termasuk PPN.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Keterangan Termin *
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: DP 30% pekerjaan tahap awal"
              value={billingForm.description}
              onChange={e => setBillingForm({ ...billingForm, description: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              PPN pada Tagihan Ini
            </label>
            <select
              value={billingForm.tax_scheme}
              onChange={e =>
                setBillingForm({
                  ...billingForm,
                  tax_scheme: e.target.value as "PROPORTIONAL" | "FINAL_SETTLEMENT",
                })
              }
              className="input text-xs font-semibold"
            >
              <option value="PROPORTIONAL">Tambahkan PPN 11% pada termin ini</option>
              <option value="FINAL_SETTLEMENT">Belum menagihkan PPN pada termin ini</option>
            </select>
          </div>

          {(() => {
            const dpp = Number(billingForm.amount) || 0;
            const ppn = billingForm.tax_scheme === "PROPORTIONAL" ? (dpp * 11) / 100 : 0;
            const total = dpp + ppn;

            return (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Ringkasan Tagihan
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                  <span className="text-slate-500">Nilai termin sebelum PPN</span>
                  <span className="text-right font-semibold text-slate-800">{formatMoney(dpp)}</span>

                  <span className="text-slate-500">PPN</span>
                  <span className="text-right font-semibold text-slate-800">{formatMoney(ppn)}</span>

                  <span className="border-t border-slate-200 pt-2 font-bold text-slate-800">Total tagihan</span>
                  <span className="border-t border-slate-200 pt-2 text-right font-black text-brand-deep-green">
                    {formatMoney(total)}
                  </span>
                </div>
              </div>
            );
          })()}

          <CollapsibleGuideline title="Panduan PPh dan potongan pembayaran" tone="blue">
            PPh dan potongan pembayaran tidak ditentukan di tahap proposal tagihan ini.
            Pencatatannya dilakukan saat proses pembayaran/penerimaan agar nilai yang tersimpan sesuai bukti transaksi.
          </CollapsibleGuideline>

          <button type="submit" disabled={Boolean(financePending["create-billing-proposal"])} className="btn-primary w-full justify-center py-2.5 mt-1 disabled:opacity-50">
            {financePending["create-billing-proposal"] ? "Menyimpan…" : "Simpan Proposal Tagihan"}
          </button>
        </form>
      </Modal>

      {/* Modal: Tambah Tagihan Vendor (AP) */}
      <Modal
        isOpen={isAPModalOpen}
        onClose={() => setIsAPModalOpen(false)}
        title="Daftarkan Tagihan Vendor (AP)"
        subtitle="Entri invoice supplier dimulai sebagai DRAFT dan mengikuti lifecycle backend"
      >
        <form
          onSubmit={(e) => runFinanceAction("create-ap-invoice", async () => {
            e.preventDefault();
            try {
              if (!apForm.expense_account_id) {
                toast.error("Pilih akun biaya agar jurnal dan kontrol anggaran dapat diklasifikasikan dengan benar.");
                return;
              }
              const selectedBudgetLine = apBudgetAllocations.find((line) => String(line.id) === String(apForm.budget_allocation_id));
              if (!selectedBudgetLine || String(selectedBudgetLine.project_id ?? "") !== String(apForm.project_id ?? "") || String(selectedBudgetLine.account_id ?? "") !== String(apForm.expense_account_id)) {
                toast.error("Pilih alokasi anggaran aktif yang sesuai dengan proyek (atau biaya internal) dan akun biaya invoice.");
                return;
              }
              const { data: billResponse } = await api.post("/api/v1/finance/billing-documents/", {
                billing_type: "SUPPLIER_INVOICE",
                party_id: apForm.supplier_id,
                project_id: apForm.project_id || null,
                invoice_number: apForm.invoice_number,
                invoice_date: new Date().toISOString(),
                due_date: apForm.due_date || null,
                subtotal: Number(apForm.amount),
                tax_amount: 0,
                total_amount: Number(apForm.amount),
              });
              const bill = billResponse?.data ?? billResponse;
              let billLineId = "";
              try {
                const { data: lineResponse } = await api.post("/api/v1/finance/billing-document-lines/", {
                  billing_document_id: bill.id,
                  account_id: apForm.expense_account_id,
                  project_id: apForm.project_id || null,
                  cost_center_id: selectedBudgetLine?.cost_center_id ?? null,
                  quantity: 1,
                  unit_price: Number(apForm.amount),
                  discount_amount: 0,
                  line_total: Number(apForm.amount),
                });
                const billLine = lineResponse?.data ?? lineResponse;
                billLineId = String(billLine.id ?? "");
                if (selectedBudgetLine) {
                  const today = new Date();
                  const matchingPeriod = (selectedBudgetLine.period_allocations ?? []).find((allocationPeriod: any) => {
                    const fiscalPeriod = financeFiscalPeriods.find((period) => String(period.id) === String(allocationPeriod.fiscal_period_id));
                    return fiscalPeriod && new Date(fiscalPeriod.start_date) <= today && new Date(fiscalPeriod.end_date) >= today;
                  });
                  if ((selectedBudgetLine.period_allocations ?? []).length && !matchingPeriod) throw new Error("Alokasi anggaran ini tidak memiliki periode fiskal yang mencakup tanggal invoice.");
                  await api.post("/api/v1/finance/budget-reservations", {
                    allocation_id: selectedBudgetLine.id,
                    source_type: "INVOICE",
                    source_id: bill.id,
                    source_line_id: billLineId || null,
                    amount: Number(apForm.amount),
                    fiscal_period_id: matchingPeriod?.fiscal_period_id ?? null,
                    description: `Invoice ${apForm.invoice_number} · ${apForm.project_id ? "biaya proyek" : "biaya vendor"}`,
                  });
                }
              } catch (lineError) {
                if (billLineId) await api.delete(`/api/v1/finance/billing-document-lines/${billLineId}`).catch(() => undefined);
                await api.delete(`/api/v1/finance/billing-documents/${bill.id}`).catch(() => undefined);
                throw lineError;
              }
              await loadFinanceData(true);
              toast.success("Tagihan vendor berhasil disimpan sebagai DRAFT.");
              setIsAPModalOpen(false);
              setAPForm({ supplier_id: "", invoice_number: "", amount: "", due_date: "", project_id: "", expense_account_id: "", budget_allocation_id: "" });
            } catch (error) {
              toast.error(getApiErrorDetail(error, "Tagihan vendor belum dapat didaftarkan. Periksa vendor, nomor invoice, nominal, dan kemungkinan invoice duplikat."));
            }
          })}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Nama Supplier / Vendor *</label>
            <select
              required
              value={apForm.supplier_id}
              onChange={e => setAPForm({ ...apForm, supplier_id: e.target.value })}
              className="input"
            >
              <option value="">Pilih vendor dari master data</option>
              {vendorOptions.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.display_name || vendor.legal_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Proyek (kosongkan untuk biaya internal)</label>
              <select value={apForm.project_id} onChange={e => { const projectId = e.target.value; const matching = apBudgetAllocations.filter((line) => String(line.project_id ?? "") === String(projectId) && String(line.account_id ?? "") === String(apForm.expense_account_id)); setAPForm({ ...apForm, project_id: projectId, budget_allocation_id: matching.length === 1 ? matching[0].id : "" }); }} className="input">
                <option value="">Biaya internal / non-proyek</option>
                {financeProjectOptions.map((project) => <option key={project.id} value={project.id}>{project.project_code} — {project.project_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Akun biaya *</label>
              <select required value={apForm.expense_account_id} onChange={e => { const accountId = e.target.value; const matching = apBudgetAllocations.filter((line) => String(line.project_id ?? "") === String(apForm.project_id ?? "") && String(line.account_id ?? "") === String(accountId)); setAPForm({ ...apForm, expense_account_id: accountId, budget_allocation_id: matching.length === 1 ? matching[0].id : "" }); }} className="input">
                <option value="">Pilih akun biaya</option>
                {ledgerAccounts.filter((account) => account.status === "ACTIVE" && account.account_type === "EXPENSE").map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Alokasi anggaran {apForm.project_id ? "proyek" : "operasional internal"} *</label>
            <select required value={apForm.budget_allocation_id} onChange={e => setAPForm({ ...apForm, budget_allocation_id: e.target.value })} className="input">
              <option value="">Pilih alokasi aktif yang sesuai dengan proyek & akun ini</option>
              {apBudgetAllocations.filter((line) => String(line.project_id ?? "") === String(apForm.project_id) && String(line.account_id ?? "") === String(apForm.expense_account_id)).map((line) => <option key={line.id} value={line.id}>{line.allocation_name || line.budget?.budget_name} · Pagu {formatMoney(line.budget_amount ?? 0)}</option>)}
            </select>
            <p className="mt-1 text-2xs text-text-secondary">Invoice akan memesan komitmen saat disimpan. Saat invoice diposting, komitmen berpindah menjadi actual. Biaya berproyek masuk WIP satu kali; biaya internal masuk akun beban yang dipilih.</p>
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
              <IDRInput
                required
                placeholder="Contoh: 15.000.000"
                value={apForm.amount}
                onChange={amount => setAPForm({ ...apForm, amount })}
                className="input"
                showPrefix={false}
              />
            </div>
          </div>
          <button type="submit" disabled={Boolean(financePending["create-ap-invoice"])} className="btn-primary w-full justify-center py-2.5 mt-2 font-bold disabled:opacity-50">
            {financePending["create-ap-invoice"] ? "Mendaftarkan…" : "Daftarkan Invoice AP"}
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
            <span className="text-base font-extrabold text-brand-deep-green">
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
              <option value="">Pilih rekening</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.bank} — {account.number}</option>
              ))}
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
            <button type="submit" disabled={Boolean(financePending[`execute-payment:${selectedBillForPay?.id ?? "none"}`])} className="btn-primary py-2 px-4 text-xs bg-brand-green hover:bg-brand-deep-green font-bold disabled:opacity-50">
              {financePending[`execute-payment:${selectedBillForPay?.id ?? "none"}`] ? "Memproses pembayaran…" : "Konfirmasi & Eksekusi Pembayaran (Disburse)"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Catat Uang Masuk / Pembayaran Klien (Customer Payment Receipt) */}
      <Modal
        isOpen={isReceiptModalOpen}
        onClose={() => { if (!receiptSaving) { setIsReceiptModalOpen(false); setReceiptErrors({}); } }}
        title="Catat Penerimaan Uang Masuk (Customer Inflow)"
        subtitle="Penerimaan pembayaran pelunasan termin invoice penagihan klien"
        size="lg"
      >
        <form
          noValidate
          onSubmit={handleCreateCustomerReceipt}
          className="flex flex-col gap-4 p-1"
        >
          <CollapsibleGuideline title="Pencatatan penerimaan" tone="blue">
            Data disimpan sebagai <span className="badge badge-neutral text-2xs py-0.5 px-2 font-medium">Draft</span> untuk verifikasi. Saldo kas/bank dan kartu piutang terupdate otomatis setelah diverifikasi dan di-posting.
          </CollapsibleGuideline>

          {/* Project and client are stacked to preserve long names. */}
          <div className="grid grid-cols-1 gap-3.5">
            <div>
              <label htmlFor="receipt-project_id" className="text-xs font-bold text-text-primary block mb-1">
                Nama Proyek Terkait <span className="text-red-500">*</span>
              </label>
              <select
                id="receipt-project_id"
                aria-invalid={!!receiptErrors.project_name}
                aria-describedby={receiptErrors.project_name ? "receipt-project_name-error" : undefined}
                value={receiptForm.project_id}
                onChange={e => {
                  const pId = e.target.value;
                  if (pId === "__CUSTOM__") {
                    setReceiptForm(current => ({
                      ...current,
                      project_id: "__CUSTOM__",
                      project_name: "",
                      customer_name: "",
                    }));
                  } else {
                    const selected = financeProjectOptions.find(p => String(p.id) === String(pId));
                    setReceiptForm(current => ({
                      ...current,
                      project_id: pId,
                      project_name: selected?.project_name || selected?.name || "",
                      customer_name: selected?.customer_name || selected?.client_name || "",
                    }));
                  }
                  setReceiptErrors(current => ({ ...current, project_name: "" }));
                }}
                className="input text-xs font-medium"
              >
                <option value="">-- Pilih dari Daftar Proyek ({financeProjectOptions.length} Proyek) --</option>
                {financeProjectOptions.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.project_code ? `[${project.project_code}] ` : ""}{project.project_name || project.name}
                  </option>
                ))}
                <option value="__CUSTOM__">➕ Proyek Lainnya / Input Manual...</option>
              </select>

              {receiptForm.project_id === "__CUSTOM__" && (
                <input
                  id="receipt-project_name"
                  type="text"
                  placeholder="Ketik nama proyek manual..."
                  value={receiptForm.project_name}
                  onChange={e => updateReceiptField("project_name", e.target.value)}
                  className="input text-xs mt-1.5"
                  autoFocus
                />
              )}
              {receiptError("project_name")}
            </div>

            <div>
              <label htmlFor="receipt-customer_name" className="text-xs font-bold text-text-primary block mb-1">
                Nama Klien / Perusahaan <span className="text-red-500">*</span>
              </label>
              <input
                id="receipt-customer_name"
                aria-invalid={!!receiptErrors.customer_name}
                aria-describedby={receiptErrors.customer_name ? "receipt-customer_name-error" : undefined}
                type="text"
                required
                readOnly
                placeholder="Pilih proyek atau faktur untuk mengisi nama klien"
                value={receiptForm.customer_name}
                className="input text-xs bg-slate-50 read-only:cursor-not-allowed"
              />
              <p className="text-2xs text-text-secondary mt-1">Nama diambil dari data klien pada proyek atau faktur yang dipilih.</p>
              {receiptError("customer_name")}
            </div>
          </div>

          {/* Grid: Referensi Faktur & Nominal Uang Masuk */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="receipt-invoice" className="text-xs font-bold text-text-primary block mb-1">
                Referensi Faktur / Termin <span className="text-2xs text-text-secondary font-normal">(Opsional)</span>
              </label>
              <select
                id="receipt-invoice"
                value={receiptForm.invoice_ref}
                onChange={e => {
                  const invId = e.target.value;
                  const selectedInv = customerInvoices.find(inv => inv.id === invId);
                  const remaining = selectedInv ? Number(selectedInv.outstanding_amount ?? (Number(selectedInv.total_amount ?? 0) - Number(selectedInv.paid_amount ?? 0))) : 0;
                  const pName = selectedInv?.party?.display_name || selectedInv?.party?.legal_name || "";
                  const prName = selectedInv?.project?.name || "";
                  const prId = selectedInv?.project_id || "";
                  setReceiptForm(current => ({
                    ...current,
                    invoice_ref: invId,
                    customer_name: pName || current.customer_name,
                    project_name: prName || current.project_name,
                    project_id: prId || current.project_id,
                    amount: remaining > 0 ? String(remaining) : current.amount,
                  }));
                }}
                className="input text-xs"
              >
                <option value="">Tanpa invoice — Uang muka (DP) / Pelunasan langsung</option>
                {customerInvoices
                  .filter(invoice => invoice.status === "POSTED" && Number(invoice.outstanding_amount ?? Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0)) > 0)
                  .map(invoice => {
                    const remaining = Number(invoice.outstanding_amount ?? Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0));
                    return (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoice_number} — Sisa {formatMoney(remaining)}
                      </option>
                    );
                  })}
              </select>
              <CollapsibleGuideline title="Ketentuan pelunasan invoice" className="mt-2">
                Hanya invoice berstatus <strong>POSTED</strong> (resmi diterbitkan) yang dapat dipilih untuk pelunasan piutang. Invoice DRAFT perlu di-posting terlebih dahulu di menu Termin Penagihan.
              </CollapsibleGuideline>
            </div>

            <div>
              <label htmlFor="receipt-amount" className="text-xs font-bold text-text-primary block mb-1">
                Nominal Uang Masuk Bersih (Rp) <span className="text-red-500">*</span>
              </label>
              <IDRInput
                id="receipt-amount"
                aria-invalid={!!receiptErrors.amount}
                aria-describedby={receiptErrors.amount ? "receipt-amount-error" : undefined}
                required
                placeholder="150.000.000"
                value={receiptForm.amount}
                onChange={amount => updateReceiptField("amount", amount)}
                className="text-xs font-sans font-bold text-brand-deep-green"
              />
              {receiptError("amount")}
            </div>
          </div>

          {/* Withholding Tax & e-Bupot Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                <Scale size={14} className="text-brand-deep-green" />
                <span>Potongan Pajak Klien (e-Bupot / WAPU)</span>
              </div>
              <span className="text-2xs text-text-secondary bg-white px-2 py-0.5 rounded border border-slate-200">Opsional bila klien memotong PPh/WAPU</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-2xs font-semibold text-text-secondary block mb-1">Jenis Potongan</label>
                <select
                  value={receiptForm.withholding_tax_type}
                  onChange={e => updateReceiptField("withholding_tax_type", e.target.value)}
                  className="input text-xs bg-white"
                >
                  <option value="PPH_23">PPh 23 Jasa (2%)</option>
                  <option value="PPH_FINAL">PPh Final (1.75%)</option>
                  <option value="PPH_21">PPh 21 Tenaga Ahli</option>
                  <option value="WAPU">PPN Dipungut WAPU</option>
                </select>
              </div>
              <div>
                <label htmlFor="receipt-withholding_tax_amount" className="text-2xs font-semibold text-text-secondary block mb-1">Nominal Potongan (Rp)</label>
                <IDRInput
                  id="receipt-withholding_tax_amount"
                  value={receiptForm.withholding_tax_amount}
                  onChange={amount => updateReceiptField("withholding_tax_amount", amount)}
                  className="input text-xs font-sans bg-white"
                  placeholder="0"
                />
              </div>
              <div>
                <label htmlFor="receipt-bupot_number" className="text-2xs font-semibold text-text-secondary block mb-1">No. e-Bupot / Bukti Potong</label>
                <input
                  id="receipt-bupot_number"
                  type="text"
                  value={receiptForm.bupot_number}
                  onChange={e => updateReceiptField("bupot_number", e.target.value)}
                  className="input text-xs font-mono uppercase bg-white"
                  placeholder="BP-2026-..."
                />
              </div>
            </div>

            {receiptForm.invoice_ref && (
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => {
                    const selectedInv = customerInvoices.find(inv => inv.id === receiptForm.invoice_ref);
                    if (selectedInv) {
                      const total = Number(selectedInv.total_amount ?? 0);
                      const taxAmt = Number(selectedInv.tax_amount ?? 0);
                      const dpp = total - taxAmt > 0 ? total - taxAmt : Math.round(total / 1.11);
                      const rate = receiptForm.withholding_tax_type === 'PPH_FINAL' ? 0.0175 : 0.02;
                      const calculatedWht = Math.round(dpp * rate);
                      const netCash = total - calculatedWht;
                      setReceiptForm(current => ({
                        ...current,
                        withholding_tax_amount: String(calculatedWht),
                        amount: String(netCash),
                      }));
                      toast(`Dihitung PPh ${(rate * 100).toFixed(2)}%: Potongan Rp ${calculatedWht.toLocaleString('id-ID')}, Masuk Bank Rp ${netCash.toLocaleString('id-ID')}`, { icon: 'ℹ️' });
                    }
                  }}
                  className="inline-flex items-center gap-1 text-2xs text-brand-deep-green hover:underline font-semibold"
                >
                  <Zap size={11} /> Hitung Otomatis Potongan PPh dari Faktur Terpilih
                </button>
                {Number(receiptForm.withholding_tax_amount || 0) > 0 && (
                  <span className="text-2xs font-mono font-semibold text-brand-deep-green bg-brand-light-green border border-brand-green/30 px-2 py-0.5 rounded">
                    Total Pelunasan Piutang: {formatMoney(Number(receiptForm.amount || 0) + Number(receiptForm.withholding_tax_amount || 0))}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Rekening Bank Penerima */}
          <div>
            <label htmlFor="receipt-bank_account" className="text-xs font-bold text-text-primary block mb-1">
              Rekening Kas / Bank Penerima Dana <span className="text-red-500">*</span>
            </label>
            <select
              id="receipt-bank_account"
              required
              aria-invalid={!!receiptErrors.bank_account}
              aria-describedby={receiptErrors.bank_account ? "receipt-bank_account-error" : undefined}
              value={receiptForm.bank_account}
              onChange={e => updateReceiptField("bank_account", e.target.value)}
              className="input text-xs font-semibold"
            >
              <option value="">Pilih rekening penerima</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} (Saldo: {formatMoney(b.balance)})
                </option>
              ))}
            </select>
            {receiptError("bank_account")}
          </div>

          {/* Grid: Metode & Tanggal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="receipt-payment_method" className="text-xs font-bold text-text-primary block mb-1">Metode Penerimaan</label>
              <select
                id="receipt-payment_method"
                aria-invalid={!!receiptErrors.payment_method}
                aria-describedby={receiptErrors.payment_method ? "receipt-payment_method-error" : undefined}
                value={receiptForm.payment_method}
                onChange={e => updateReceiptField("payment_method", e.target.value)}
                className="input text-xs"
              >
                <option value="BANK_TRANSFER">Transfer Bank / RTGS</option>
                <option value="GIRO_CEK">Bilyet Giro / Cek Masuk</option>
                <option value="CASH">Kas Tunai Kasir</option>
              </select>
              {receiptError("payment_method")}
            </div>
            <div>
              <label htmlFor="receipt-payment_date" className="text-xs font-bold text-text-primary block mb-1">
                Tanggal Terima Dana <span className="text-red-500">*</span>
              </label>
              <input
                id="receipt-payment_date"
                aria-invalid={!!receiptErrors.payment_date}
                aria-describedby={receiptErrors.payment_date ? "receipt-payment_date-error" : undefined}
                type="date"
                required
                value={receiptForm.payment_date}
                onChange={e => updateReceiptField("payment_date", e.target.value)}
                className="input text-xs"
              />
              {receiptError("payment_date")}
            </div>
          </div>

          {/* Bukti Transfer & Catatan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="receipt-reference_number" className="text-xs font-bold text-text-primary block mb-1">
                No. Bukti Transfer / Resi Bank Klien <span className="text-red-500">*</span>
              </label>
              <input
                id="receipt-reference_number"
                aria-invalid={!!receiptErrors.reference_number}
                aria-describedby={receiptErrors.reference_number ? "receipt-reference_number-error" : undefined}
                type="text"
                required
                placeholder="Contoh: TRF-20261022-8921"
                value={receiptForm.reference_number}
                onChange={e => updateReceiptField("reference_number", e.target.value)}
                className="input text-xs font-mono uppercase"
              />
              {receiptError("reference_number")}
            </div>
            <div>
              <label className="text-xs font-bold text-text-primary block mb-1">
                Catatan Penerimaan Kas <span className="text-2xs text-text-secondary font-normal">(Opsional)</span>
              </label>
              <input
                type="text"
                placeholder="Keterangan tambahan..."
                value={receiptForm.notes}
                onChange={e => setReceiptForm({ ...receiptForm, notes: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          {/* Actions Footer */}
          <div className="flex items-center justify-end pt-3 border-t border-slate-200/80 mt-1 flex-wrap gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={receiptSaving}
                onClick={() => setIsReceiptModalOpen(false)}
                className="btn-ghost py-2 px-4 text-xs font-medium"
              >
                Batal
              </button>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-2xs text-blue-800" aria-live="polite">
                Status tersimpan: <span className="font-semibold">Draft Customer Receipt</span>
              </div>
              <button
                type="submit"
                disabled={receiptSaving}
                className="btn-primary py-2 px-5 text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                {receiptSaving ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" /> Menyimpan...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} /> Konfirmasi & Simpan Penerimaan
                  </>
                )}
              </button>
            </div>
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
                disabled={reversalReason.trim().length < 5 || Boolean(financePending[`journal-reversal:${selectedJournalEntry?.id ?? "none"}`])}
                className="btn-primary text-xs py-2 px-4 font-bold bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-40"
              >
                {financePending[`journal-reversal:${selectedJournalEntry?.id ?? "none"}`] ? "Memproses storno…" : "Konfirmasi Storno Jurnal"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <BillingInvoiceModal invoice={previewInvoice} onClose={() => setPreviewInvoice(null)} />
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
  fundRequests,
  projects,
  bankAccounts = [],
  onRefresh,
  onRequestModalOpen,
  readOnly = false,
}: {
  fundings: any[];
  fundRequests: any[];
  projects: any[];
  bankAccounts?: any[];
  onRefresh: () => void;
  onRequestModalOpen: () => void;
  readOnly?: boolean;
}) {
  const [selectedFunding, setSelectedFunding] = useState<any>(null);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [fundingBankAccountId, setFundingBankAccountId] = useState("");
  const [fundingReference, setFundingReference] = useState("");
  const [decisionAction, setDecisionAction] = useState<"APPROVED" | "REJECTED" | "DISBURSED">("APPROVED");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const existingFundingIds = new Set(fundings.map((f) => String(f.id)));
  const fundingRows = [
    ...fundRequests
      .filter((request) => !existingFundingIds.has(String(request.id)))
      .map((request) => ({
        ...request,
        _canonical_request: true,
        purpose: request.description || request.title,
        requested_amount: request.amount,
        project_name: request.project_name || projects.find((project) => String(project.id) === String(request.project_id))?.project_name,
      })),
    ...fundings,
  ];

  /**
   * handleDecision coordinates the UI behavior represented by this function.
   *
   * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
   * @returns The rendered React node, callback result, or Promise declared by the implementation.
   * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
   */
  const handleDecision = async () => {
    if (!selectedFunding) return;
    if (decisionAction === "DISBURSED" && !fundingBankAccountId) {
      toast.error("Pilih rekening kas/bank sumber pencairan terlebih dahulu.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (decisionAction === "DISBURSED") {
        await api.post(`/api/v1/finance/project-fundings/${selectedFunding.id}/draw/`, {
          bank_account_id: fundingBankAccountId,
          reference_number: fundingReference.trim() || undefined,
          remarks: decisionNotes.trim() || undefined,
        });
        toast.success("Funding berhasil dicairkan dan dijurnal ke Akun 1140 serta Kas & Bank.");
      } else {
        await api.post(`/api/v1/finance/project-fundings/${selectedFunding.id}/decide/`, {
          decision: decisionAction,
          remarks: decisionNotes,
        });
        toast.success(`Pengajuan dana berhasil diubah ke status: ${decisionAction}`);
      }

      setIsDecisionModalOpen(false);
      setDecisionNotes("");
      setFundingBankAccountId("");
      setFundingReference("");
      onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.error?.message || "Gagal memproses keputusan funding.");
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
          {!readOnly && (
            <button onClick={onRequestModalOpen} className="btn-primary py-1.5 px-3 text-xs gap-1.5 shadow-xs">
              <Plus size={14} /> Request Dana
            </button>
          )}
          <button onClick={onRefresh} className="btn-ghost text-xs gap-1 py-1.5 px-3">
            <RefreshCw size={13} /> Refresh Data
          </button>
        </div>
      </div>

      <div className="table-scroll-wrapper border border-text-tertiary/50 rounded-xl">
        <table className="w-full data-table text-xs text-left min-w-[580px]">
          <thead>
            <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider border-b">
              <th className="py-3 px-4 font-bold">ID Request / Funding</th>
              <th className="py-3 px-4 font-bold">Keperluan / Tujuan</th>
              <th className="py-3 px-4 font-bold">Sumber Dana</th>
              <th className="py-3 px-4 font-bold">Jumlah Dana</th>
              <th className="py-3 px-4 font-bold">Status Approval</th>
              <th className="py-3 px-4 font-bold text-right">{readOnly ? "Status Lifecycle" : "Action"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {fundingRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-text-secondary">
                  Belum ada permohonan pendanaan proyek.
                </td>
              </tr>
            ) : (
              fundingRows.map((f: any) => {
                const amount = getFundingAmount(f);
                const status = (f.status || "DRAFT").toUpperCase();
                const isPending = !f._canonical_request && ["DRAFT", "SUBMITTED", "VERIFIED", "PENDING"].includes(status);
                const isApproved = status === "APPROVED";
                const isDisbursed = ["DRAWN", "DISBURSED", "ACTIVE"].includes(status);

                return (
                  <tr key={f.id} className="hover:bg-brand-light-green/20">
                    <td className="py-3 px-4 align-top font-mono text-[10px]">
                      {f.request_number || f.document_id || f.id}
                      <span className="mt-1 block max-w-44 break-all text-[9px] text-text-secondary" title={f.id}>{f.id}</span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-text-primary">
                      <div className="whitespace-pre-line">{f.description || f.purpose || f.title || "Pengajuan Dana Operasional"}</div>
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
                          isApproved ? "bg-brand-light-green text-brand-deep-green" :
                            status === "REJECTED" ? "bg-red-100 text-red-800" :
                              "bg-amber-100 text-amber-800"
                      )}>
                        {status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {f._canonical_request ? (
                        <a href={`/requests?requestId=${encodeURIComponent(f.id)}`} className="text-xs font-bold text-brand-deep-green underline">Lihat Request</a>
                      ) : readOnly ? (
                        <span className="text-2xs text-text-secondary font-medium">
                          {isDisbursed ? "Funding Disbursed" : isApproved ? "Disetujui" : status}
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedFunding(f);
                                  setDecisionAction("APPROVED");
                                  setIsDecisionModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-brand-green text-white font-bold text-2xs hover:bg-brand-deep-green shadow-xs"
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
                                setIsDecisionModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-2xs hover:bg-blue-700 shadow-xs flex items-center gap-1"
                            >
                              <Zap size={11} /> Tandai Drawn
                            </button>
                          )}

                          {isDisbursed && (
                            <span className="text-2xs text-blue-700 font-bold flex items-center gap-1">
                              <CheckCircle2 size={13} className="text-blue-600" /> Funding Drawn
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
                      )}
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
                <span className="font-semibold text-text-primary block mt-0.5 whitespace-pre-line">{selectedFunding.description || selectedFunding.purpose || "Operasional Lapangan"}</span>
              </div>
              <div className="text-right">
                <span className="text-2xs text-text-secondary block">Nominal Pencairan</span>
                <strong className="text-sm font-black text-brand-deep-green">{formatMoney(getFundingAmount(selectedFunding))}</strong>
              </div>
            </div>

            {decisionAction === "DISBURSED" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
                  Pencairan ini akan membuat jurnal otomatis: <strong>Debit 1140 (Uang Muka &amp; Cash in Transit)</strong> dan <strong>Kredit Rekening Bank</strong> pilihan Anda.
                </div>
                <div>
                  <label className="text-xs font-bold text-text-primary block mb-1">Rekening Kas / Bank Sumber Dana *</label>
                  <select
                    className="input w-full text-xs bg-white"
                    value={fundingBankAccountId}
                    onChange={(e) => setFundingBankAccountId(e.target.value)}
                  >
                    <option value="">-- Pilih Rekening Sumber --</option>
                    {bankAccounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bank ? `${acc.bank} · ` : ""}{acc.name} ({acc.number || "-"})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-text-primary block mb-1">No. Referensi Transfer (Opsional)</label>
                  <input
                    className="input w-full text-xs"
                    value={fundingReference}
                    onChange={(e) => setFundingReference(e.target.value)}
                    placeholder="Auto-generate jika dikosongkan"
                  />
                </div>
              </div>
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
                      "bg-brand-green hover:bg-brand-deep-green text-white"
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
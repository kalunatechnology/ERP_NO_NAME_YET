/**
 * File: frontend-next/app/(app)/crm/CrmClient.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, RefreshCw, CheckCircle2, DollarSign, TrendingUp, Users,
  ShieldAlert, FileText, PhoneCall, Building2, Zap, Trash2, ArrowRight,
  Calculator, ShieldCheck, Award, BarChart3, MessageSquare, FileCheck,
  ChevronRight, ChevronDown, AlertCircle, Star, UserPlus, Copy, Pencil,
  Inbox, Globe2, Search, Filter, Download,
} from "lucide-react";
import { cn, formatMoney, formatDate, getStatusColor } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Modal } from "@/components/ui/Modal";
import { IDRInput } from "@/components/ui/IDRInput";
import toast from "react-hot-toast";
import {
  loadCRMData, CRMData, CRMDashboard,
  processDealWon, executiveOverrideCredit, qualifyInquiry, convertCRMProspect,
  createOpportunity, updateOpportunityCustomer, moveCRMOpportunityStage, deleteOpportunity,
  createCRMActivity, getOpportunityCustomer360, markOpportunityLost, createServiceWorkOrder,
  createCustomerInquiry, updateCustomerInquiry, updateCRMInquiryLeadStatus, deleteCustomerInquiry,
  linkInquiryCustomer,
  createCostEstimate, calculateCostEstimate, createQuotationFromEstimate, deleteCostEstimate,
  submitQuotationApproval, approveQuotation, sendQuotation, acceptQuotation, rejectQuotation, convertQuotationToOrder,
  createSupportTicket, checkTicketWarrantyStatus, deleteSupportTicket,
  updateCustomerCreditLimit, calculateCreditSnapshot,
  loadCRMInbox, createInquiryFromConversation, replyToCRMConversation, assignConversationToMe, setConversationDecision,
  confirmCRMIdentityCustomer,
  loadCRMPartyContacts, saveCRMPartyContact,
  loadCRMWhatsAppConnections, createCRMWhatsAppConnection, updateCRMWhatsAppConnection, testCRMWhatsAppConnection,
  type CRMWhatsAppConnection,
  type CRMInboxConversation,
} from "@/lib/api/crm.api";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { getUserFacingApiError } from "@/lib/api/error-message";
import { requestApi, type MeetingMinutesReference } from "@/lib/api/request.api";
import { feedApi } from "@/lib/api/feed.api";
import { AccessDeniedState } from "@/components/ui/AccessDeniedState";
import { CollapsibleGuideline } from "@/components/ui/CollapsibleGuideline";
import { CRMPeriodToolbar, useCRMPeriodFilter } from "@/components/crm/CRMPeriodFilter";
import { canAccessRoute } from "@/lib/access/module-contract";
import { canPerform } from "@/lib/access/capability-contract";
import { CrmCompaniesView, CrmContactsView } from "@/components/crm/CrmCompaniesContactsView";
import { CrmLeadsView } from "@/components/crm/CrmLeadsView";
import { CrmSalesPipelineShell, type PipelineViewMode } from "@/components/crm/CrmSalesPipelineKanban";

/* ── Tabs Configuration (5 Consolidated Marka CRM Sub-Tabs) ─── */
const CRM_TABS = [
  { id: "pipeline",  label: "Sales Pipeline",      icon: TrendingUp },
  { id: "leads",     label: "Lead Management",     icon: FileText   },
  { id: "companies", label: "Company Management",  icon: Building2  },
  { id: "contacts",  label: "Contact Management",  icon: Users      },
  { id: "contracts", label: "Contract Management", icon: FileCheck  },
];

/* ── Shared Helpers ──────────────────────────────── */
function opportunityPartyId(opportunity: any): string | number | null {
  return opportunity?.customer_party_id ?? opportunity?.customer_party ?? opportunity?.customer ?? null;
}

function normalizeOptionalCustomerEmail(value: unknown): string {
  const email = String(value ?? "").trim();
  return ["-", "—", "–", "n/a", "na", "null"].includes(email.toLowerCase()) ? "" : email;
}

async function loadAllCrmExportRows<T extends { id?: string | number }>(endpoint: string): Promise<T[]> {
  const firstResponse = await api.get(endpoint);
  const firstPage = normalizeList<T>(firstResponse.data);
  const rowsById = new Map<string, T>();
  firstPage.rows.forEach((row, index) => rowsById.set(String(row.id ?? `first-${index}`), row));
  const pageSize = Math.max(1, firstPage.rows.length);
  const totalPages = Math.ceil(firstPage.count / pageSize);

  for (let firstPageNumber = 2; firstPageNumber <= totalPages; firstPageNumber += 3) {
    const pageNumbers = Array.from(
      { length: Math.min(3, totalPages - firstPageNumber + 1) },
      (_, index) => firstPageNumber + index,
    );
    const separator = endpoint.includes("?") ? "&" : "?";
    const responses = await Promise.all(
      pageNumbers.map((page) => api.get(`${endpoint}${separator}page=${page}`)),
    );
    responses.forEach((response, responseIndex) => {
      normalizeList<T>(response.data).rows.forEach((row, rowIndex) => {
        const pageNumber = pageNumbers[responseIndex];
        rowsById.set(String(row.id ?? `${pageNumber}-${rowIndex}`), row);
      });
    });
  }

  return Array.from(rowsById.values());
}

const CRM_PIPELINE_STAGE_LABELS: Record<string, string> = {
  OPEN: "Prospek",
  PROSPECT: "Prospek",
  QUALIFICATION: "Discovery / Meeting",
  DISCOVERY: "Discovery / Meeting",
  PROPOSAL: "Proposal dikirim",
  PROPOSAL_SENT: "Proposal dikirim",
  NEGOTIATION: "Negosiasi",
  FOLLOW_UP: "Follow-up kembali",
  WON: "Deal berhasil",
  CLOSED_WON: "Deal berhasil",
  LOST: "Deal tidak berhasil",
  CLOSED_LOST: "Deal tidak berhasil",
  CANCELLED: "Dibatalkan",
  CANCEL: "Dibatalkan",
  BATAL: "Dibatalkan",
};

function normalizeOpportunityStage(value: unknown): string {
  const stage = String(value || "PROSPECT").toUpperCase();
  return ({ OPEN: "PROSPECT", QUALIFICATION: "DISCOVERY", PROPOSAL: "PROPOSAL_SENT" } as Record<string, string>)[stage] || stage;
}

/**
 * StatusBadge coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-2xs font-semibold", getStatusColor(status))}>
      {status || "—"}
    </span>
  );
}

function OriginDomainBadge({ domain }: { domain?: string | null }) {
  if (!domain) return null;
  return <span title={`Website asal: ${domain}`} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-2xs font-medium text-sky-800"><Globe2 size={11} />{domain}</span>;
}

/**
 * EmptyState coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="py-10 text-center text-sm text-text-secondary flex flex-col items-center gap-2">
      <AlertCircle size={28} className="opacity-30" />
      {msg}
    </div>
  );
}

interface ActionBtnProps {
  onClick: () => void | Promise<void>;
  label: string;
  variant?: "primary" | "ghost" | "danger";
  icon?: React.ElementType;
  small?: boolean;
  disabled?: boolean;
  title?: string;
}
/**
 * ActionBtn coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function ActionBtn({ onClick, label, variant = "primary", icon: Icon, small, disabled = false, title }: ActionBtnProps) {
  const [busy, setBusy] = useState(false);
/**
 * handle coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handle = async () => {
    if (busy) return;
    setBusy(true);
    try { await onClick(); }
    finally { setBusy(false); }
  };
  const base = small ? "text-xs px-2.5 py-1" : "text-sm px-4 py-1.5";
  const colors = variant === "primary"
    ? "bg-brand-green text-white hover:opacity-90"
    : variant === "danger"
    ? "bg-red-500 text-white hover:opacity-90"
    : "border border-text-tertiary text-text-secondary hover:text-brand-green hover:border-brand-green bg-white";
  return (
    <button
      onClick={handle}
      disabled={busy || disabled}
      title={title}
      className={cn("inline-flex items-center gap-1.5 rounded-lg font-medium transition-all", base, colors, (busy || disabled) && "opacity-60 cursor-not-allowed")}
    >
      {busy ? <RefreshCw size={12} className="animate-spin" /> : Icon && <Icon size={12} />}
      {busy ? "Memproses..." : label}
    </button>
  );
}

/* ── KPI Card ─────────────────────────────────────── */
/**
 * KpiCard coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function KpiCard({ label, value, icon: Icon, iconBg = "#EFF6FF", iconColor = "#1D4ED8" }: {
  label: string; value: string | number;
  icon: React.ElementType; iconBg?: string; iconColor?: string;
}) {
  return (
    <div className="card rounded-xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3 min-w-0 shadow-xs">
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon size={18} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="text-2xs sm:text-xs text-text-secondary truncate font-medium">{label}</div>
        <div className="text-sm sm:text-base lg:text-lg font-bold text-text-primary truncate" title={String(value)}>{value}</div>
      </div>
    </div>
  );
}

/* ── Shared Quick Add Party Modal ─────────────────── */
/**
 * QuickAddPartyModal coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function QuickAddPartyModal({
  isOpen,
  onClose,
  onSuccess,
  allowTypeSelection = false,
  defaultPartyType = "CUSTOMER",
  requireContactMethod = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newParty: any, contact?: { email: string; phone: string; contact_id?: string }) => void;
  allowTypeSelection?: boolean;
  defaultPartyType?: "CUSTOMER" | "PROSPECT" | "SUPPLIER" | "PARTNER";
  requireContactMethod?: boolean;
}) {
  const [partyForm, setPartyForm] = useState({ legal_name: "", display_name: "", contact_name: "", email: "", phone: "", party_code: "", party_type: defaultPartyType });
  const [isPartySubmitting, setIsPartySubmitting] = useState(false);
  const mustHaveContactMethod = requireContactMethod || partyForm.party_type === "PROSPECT";
  useEffect(() => {
    if (isOpen) setPartyForm((current) => ({ ...current, party_type: defaultPartyType }));
  }, [isOpen, defaultPartyType]);

/**
 * handleQuickAdd coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  const handleQuickAdd = async () => {
    if (!partyForm.display_name.trim() && !partyForm.legal_name.trim()) {
      toast.error("Nama pelanggan wajib diisi.");
      return;
    }
    if (mustHaveContactMethod && !partyForm.email.trim() && !partyForm.phone.trim()) {
      toast.error("Isi minimal email atau nomor telepon kontak.");
      return;
    }
    setIsPartySubmitting(true);
    try {
      const payload = {
        display_name: partyForm.display_name.trim() || partyForm.legal_name.trim(),
        legal_name: partyForm.legal_name.trim() || partyForm.display_name.trim(),
        party_code: partyForm.party_code?.trim() || `${partyForm.party_type === "SUPPLIER" ? "SUP" : partyForm.party_type === "PARTNER" ? "PART" : partyForm.party_type === "PROSPECT" ? "PROS" : "CUST"}-${Date.now().toString().slice(-4)}`,
        party_type: partyForm.party_type,
        tax_number: "",
        status: "ACTIVE",
      };
      const contactEmail = partyForm.email.trim();
      const contactPhone = partyForm.phone.trim();
      let contactSaveMessage: string | null = null;
      let primaryContactId: string | undefined;
      let newParty: any;
      if (partyForm.party_type === "PROSPECT") {
        const { data: response } = await api.post("/api/v1/crm/prospects", {
          display_name: payload.display_name,
          legal_name: payload.legal_name,
          party_code: payload.party_code,
          contact_name: partyForm.contact_name.trim(),
          email: contactEmail,
          phone: contactPhone,
        });
        newParty = response?.data?.party;
        primaryContactId = response?.data?.contact?.id;
      } else {
        const res = await api.post("/api/v1/master-data/parties/", payload);
        newParty = res.data;
      }
      if (partyForm.party_type !== "PROSPECT" && (contactEmail || contactPhone)) {
        try {
          const contactResponse = await api.post("/api/v1/master-data/contacts/", {
            party_id: newParty.id,
            contact_name: partyForm.contact_name.trim() || "Kontak Utama",
            job_title: "",
            email: contactEmail,
            phone: contactPhone,
            primary_contact: true,
          });
          primaryContactId = contactResponse.data?.id;
        } catch (error) {
          contactSaveMessage = getUserFacingApiError(error, "Detail kontak belum dapat disimpan.");
        }
      }
      const partyLabel = partyForm.party_type === "SUPPLIER" ? "Vendor / Supplier" : partyForm.party_type === "PARTNER" ? "Partner" : partyForm.party_type === "PROSPECT" ? "Calon Customer" : "Customer";
      if (contactSaveMessage) toast.error(`${partyLabel} tersimpan, tetapi detail kontak belum tersimpan. ${contactSaveMessage}`);
      else toast.success(`${partyLabel} baru berhasil ditambahkan!`);
      onSuccess(newParty, { email: contactEmail, phone: contactPhone, contact_id: primaryContactId });
      setPartyForm({ legal_name: "", display_name: "", contact_name: "", email: "", phone: "", party_code: "", party_type: defaultPartyType });
      onClose();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Rekanan belum dapat ditambahkan. Periksa data wajib dan kemungkinan kode yang sudah digunakan."));
    } finally {
      setIsPartySubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={allowTypeSelection ? "Tambah Rekanan Baru ke Database" : defaultPartyType === "PROSPECT" ? "Tambah Calon Customer" : "Tambah Customer Baru ke Database"} size="sm">
      <div className="flex flex-col gap-3 p-4">
        <div>
          {allowTypeSelection && (
            <>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Jenis Rekanan *</label>
              <select
                required
                className="mb-3 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-green"
                value={partyForm.party_type}
                onChange={e => setPartyForm(p => ({ ...p, party_type: e.target.value as typeof p.party_type }))}
              >
                <option value="CUSTOMER">Customer</option>
                <option value="PROSPECT">Calon Customer</option>
                <option value="SUPPLIER">Vendor / Supplier</option>
                <option value="PARTNER">Partner</option>
              </select>
            </>
          )}
          <label className="text-xs font-medium text-text-secondary mb-1 block">Nama Instansi / Perusahaan *</label>
          <input 
            className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" 
            placeholder="PT Mega Properti..." 
            value={partyForm.display_name} 
            onChange={e => setPartyForm(p => ({ ...p, display_name: e.target.value }))} 
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">Nama PIC / Kontak (Opsional)</label>
          <input
            className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green"
            placeholder="Nama orang yang bisa dihubungi"
            value={partyForm.contact_name}
            onChange={e => setPartyForm(p => ({ ...p, contact_name: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">Email Kontak (Opsional)</label>
          <input 
            type="email" 
            className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" 
            placeholder="procurement@megaproperti.com" 
            value={partyForm.email} 
            onChange={e => setPartyForm(p => ({ ...p, email: e.target.value }))} 
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">Nomor Telepon Kontak (Opsional)</label>
          <input
            type="tel"
            className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green"
            placeholder="+62 812 3456 7890"
            value={partyForm.phone}
            onChange={e => setPartyForm(p => ({ ...p, phone: e.target.value }))}
          />
          {mustHaveContactMethod && <p className="mt-1 text-2xs text-text-secondary">Isi minimal salah satu: email atau nomor telepon.</p>}
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">Kode Rekanan (Opsional)</label>
          <input 
            className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" 
            placeholder="CUST-MP-01" 
            value={partyForm.party_code} 
            onChange={e => setPartyForm(p => ({ ...p, party_code: e.target.value }))} 
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Batal</button>
          <button type="button" onClick={handleQuickAdd} disabled={isPartySubmitting || (mustHaveContactMethod && !partyForm.email.trim() && !partyForm.phone.trim())} className="btn-primary">
            {isPartySubmitting ? "Menyimpan..." : allowTypeSelection ? "Simpan Rekanan" : defaultPartyType === "PROSPECT" ? "Simpan Calon Customer" : "Simpan Customer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════
   TAB: DASHBOARD
══════════════════════════════════════════════════ */
/**
 * TabDashboard coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TabDashboard({ data, dash }: { data: CRMData; dash: CRMDashboard }) {
/**
 * activeTickets coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const activeTickets = (data.cases || []).filter(c => !["RESOLVED","CLOSED"].includes(c.status?.toUpperCase() || "")).length;
/**
 * pendingApprovals coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const pendingApprovals = (data.approvals || []).filter(a => a.decision === "PENDING").length;
/**
 * pipeline coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const pipeline = (data.opportunities || []).filter(o => 
    !["WON","CLOSED_WON","LOST","CLOSED_LOST","CANCELLED","CANCEL","BATAL"].includes(o.status?.toUpperCase() || "") &&
    !["WON","CLOSED_WON","LOST","CLOSED_LOST","CANCELLED","CANCEL","BATAL"].includes(o.pipeline_stage?.toUpperCase() || "")
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard 
          label="Bobot Pipeline" 
          value={formatMoney(dash?.weighted_project_value)} 
          icon={DollarSign} 
          iconBg="#EFF6FF"
          iconColor="#1D4ED8"
        />
        <KpiCard 
          label="Win Rate" 
          value={`${Number(dash?.win_rate_percent || 0).toFixed(1)}%`} 
          icon={Award} 
          iconBg="#EFF6FF" 
          iconColor="#1D4ED8" 
        />
        <KpiCard 
          label="Avg Sales Cycle" 
          value={`${Math.round(Number(dash?.average_sales_cycle_days || 0))} hari`} 
          icon={TrendingUp} 
          iconBg="#FAF5FF" 
          iconColor="#7E22CE" 
        />
        <KpiCard 
          label="Margin Offering" 
          value={`${Number(dash?.offering_margin_percent || 0).toFixed(1)}%`} 
          icon={BarChart3} 
          iconBg="#FFF7ED" 
          iconColor="#C2410C" 
        />
        <KpiCard 
          label="Tiket Aktif" 
          value={activeTickets} 
          icon={PhoneCall} 
          iconBg="#FEF2F2" 
          iconColor="#DC2626" 
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <section className="card rounded-2xl p-4 sm:p-5 border border-text-tertiary/60 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><TrendingUp size={19} /></span>
              <div>
                <h3 className="text-base font-bold text-text-primary">Pipeline Aktif</h3>
                <p className="mt-0.5 text-xs text-text-secondary">Peluang penjualan yang masih berjalan</p>
              </div>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{pipeline.length} peluang</span>
          </div>
          {pipeline.length === 0 ? <EmptyState msg="Belum ada opportunity aktif." /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pipeline.slice(0,8).map(o => {
                const probability = Math.max(0, Math.min(100, Number(o.probability_percent || 0)));
                const customer = (data.parties || []).find((party) => String(party.id) === String(opportunityPartyId(o)));
                const stageKey = String(o.pipeline_stage || o.status || "OPEN").toUpperCase();
                const statusKey = String(o.status || "OPEN").toUpperCase();
                const stageLabel = CRM_PIPELINE_STAGE_LABELS[stageKey] || stageKey.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
                const stageTone = ["NEGOTIATION"].includes(stageKey) ? "border-amber-200 bg-amber-50 text-amber-800"
                  : ["PROPOSAL", "PROPOSAL_SENT"].includes(stageKey) ? "border-violet-200 bg-violet-50 text-violet-800"
                    : ["QUALIFICATION", "DISCOVERY"].includes(stageKey) ? "border-blue-200 bg-blue-50 text-blue-800"
                      : ["FOLLOW_UP"].includes(stageKey) ? "border-orange-200 bg-orange-50 text-orange-800"
                      : "border-slate-200 bg-slate-50 text-slate-700";
                return (
                  <article key={o.id} className="min-w-0 rounded-xl border border-text-tertiary/60 bg-white p-3.5 transition-all hover:border-blue-200 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-800">{["OPEN", "ACTIVE", "PROSPECT"].includes(statusKey) ? "Aktif" : statusKey.replace(/_/g, " ")}</span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-2xs font-semibold", stageTone)}>{stageLabel}</span>
                        </div>
                        <h4 className="break-words text-sm font-bold leading-5 text-text-primary">{o.opportunity_name || `Opp #${String(o.id).slice(0,6)}`}</h4>
                        <p className="mt-1 truncate text-xs text-text-secondary">{customer?.display_name || customer?.legal_name || "Customer belum ditautkan"}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="block text-2xs font-medium text-text-secondary">Peluang menang</span>
                        <span className="mt-0.5 block text-lg font-extrabold leading-5 text-blue-700">{probability}%</span>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`Peluang menang ${probability}%`} aria-valuenow={probability} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${probability}%` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
                      <span className="font-medium text-text-secondary">Nilai estimasi</span>
                      <span className="font-bold text-text-primary">{formatMoney(o.expected_amount)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card rounded-2xl p-4 sm:p-5 border border-text-tertiary/60 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><ShieldCheck size={19} /></span>
              <div>
                <h3 className="text-base font-bold text-text-primary">Kontrol Komersial &amp; Service</h3>
                <p className="mt-0.5 text-xs text-text-secondary">Ringkasan aktivitas dan tindak lanjut</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Approval Quotation", value: pendingApprovals, suffix: "menunggu", note: pendingApprovals > 0 ? "Perlu ditinjau" : "Tidak ada yang menunggu", icon: FileCheck, tone: "amber", alert: pendingApprovals > 0 },
              { label: "Tiket Support & Klaim", value: (data.cases||[]).length, suffix: "kasus", note: "Tiket tercatat", icon: PhoneCall, tone: "rose" },
              { label: "Quotation Resmi", value: (data.quotations||[]).length, suffix: "dokumen", note: "Dokumen penawaran", icon: FileText, tone: "blue" },
              { label: "Inquiry Masuk", value: (data.inquiries||[]).length, suffix: "inquiry", note: "Permintaan pelanggan", icon: Inbox, tone: "violet" },
            ].map(item => {
              const Icon = item.icon;
              const toneClasses = {
                amber: "bg-amber-50 text-amber-700",
                rose: "bg-rose-50 text-rose-700",
                blue: "bg-blue-50 text-blue-700",
                violet: "bg-violet-50 text-violet-700",
              }[item.tone];
              return (
                <article key={item.label} className={cn("min-w-0 rounded-xl border bg-white p-3.5 transition-all hover:shadow-sm", item.alert ? "border-amber-200 hover:border-amber-300" : "border-text-tertiary/60 hover:border-blue-200")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", toneClasses)}><Icon size={17} /></span><span className="truncate text-xs font-semibold text-text-primary">{item.label}</span></span>
                    {item.alert && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="Perlu perhatian" />}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5"><span className="text-2xl font-extrabold leading-7 text-text-primary">{item.value}</span><span className="text-xs font-medium text-text-secondary">{item.suffix}</span></div>
                  <p className={cn("mt-1.5 border-t border-slate-100 pt-2 text-xs", item.alert ? "font-semibold text-amber-700" : "text-text-secondary")}>{item.note}</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: DEALS & CREDIT
══════════════════════════════════════════════════ */
/**
 * TabDeals coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TabDeals({
  data, approvals, isNewOppOpen, setIsNewOppOpen, onRefresh,
  onOpportunityCreated, onOpportunityDeleted, onPartyCreated,
  readOnly = false, canOverride = false,
  canDelegate = false, canEditAll = false, currentUserId, onOpenDelegate, onOpenStageDetail, teamUsers = [],
  pipelineViewMode = "PIPELINE", onPipelineViewModeChange, estimateSlot,
}: {
  data: CRMData; approvals: any[]; isNewOppOpen: boolean;
  setIsNewOppOpen: (v: boolean) => void; onRefresh: () => void;
  onOpportunityCreated?: (newOpp: any) => void;
  onOpportunityDeleted?: (id: string | number) => void;
  onPartyCreated?: (newParty: any) => void;
  readOnly?: boolean;
  canOverride?: boolean;
  canEditAll?: boolean;
  currentUserId?: string;
  canDelegate?: boolean;
  onOpenDelegate?: (record: any, recordType: "INQUIRY" | "OPPORTUNITY") => void;
  onOpenStageDetail?: (record: any, recordType: "LEAD" | "OPPORTUNITY") => void;
  teamUsers?: any[];
  pipelineViewMode?: PipelineViewMode;
  onPipelineViewModeChange?: (mode: PipelineViewMode) => void;
  estimateSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ 
    opportunity_name: "", 
    customer_party: "", 
    expected_amount: "150000000", 
    probability_percent: 50, 
    pipeline_stage: "PROSPECT"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultModal, setResultModal] = useState<any>(null);
  const [isQuickPartyOpen, setIsQuickPartyOpen] = useState(false);
  const [customerFixByOpp, setCustomerFixByOpp] = useState<Record<string, string>>({});
  const [savingCustomerOppId, setSavingCustomerOppId] = useState<string | null>(null);
  const [oppFilter, setOppFilter] = useState<"ACTIVE" | "CANCELLED" | "ALL">("ACTIVE");
  const [activityOpp, setActivityOpp] = useState<any>(null);
  const [followUpOpp, setFollowUpOpp] = useState<any>(null);
  const [followUpDraft, setFollowUpDraft] = useState({ date: "", reason: "" });
  const [savingStage, setSavingStage] = useState(false);
  const [meetingOpp, setMeetingOpp] = useState<any>(null);
  const [meetingForm, setMeetingForm] = useState({ title: "", description: "", start_at: "", end_at: "", location: "", meeting_url: "", contact_name: "", contact_email: "" });
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [crmLinkedMeetings, setCrmLinkedMeetings] = useState<any[]>([]);
  const [lostReasonOpp, setLostReasonOpp] = useState<any>(null);
  const [lostReasonCode, setLostReasonCode] = useState("");
  const [lostReasonDetail, setLostReasonDetail] = useState("");
  const [savingLostReason, setSavingLostReason] = useState(false);
  const [overrideOpp, setOverrideOpp] = useState<any>(null);
  const [overrideRemarks, setOverrideRemarks] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [customer360, setCustomer360] = useState<any>(null);
  const [activityForm, setActivityForm] = useState({ activity_type: "CALL", subject: "", scheduled_at: "", meeting_minutes_id: "" });
  const [meetingMinutesReferences, setMeetingMinutesReferences] = useState<MeetingMinutesReference[]>([]);
  const [creditLimitParty, setCreditLimitParty] = useState<{ id: string | number; name: string; current: number } | null>(null);
  const [creditLimitDraft, setCreditLimitDraft] = useState("");
  const [savingCreditLimit, setSavingCreditLimit] = useState(false);
  const [creditSearch, setCreditSearch] = useState("");
  const [creditStatusFilter, setCreditStatusFilter] = useState("ALL");

  useEffect(() => {
    if (!activityOpp) return;
    let active = true;
    Promise.all([requestApi.listMeetingMinutesReferences(), requestApi.listMeetings(String(activityOpp.id))]).then(([minutes, meetings]) => {
      if (!active) return;
      setMeetingMinutesReferences(minutes || []);
      setCrmLinkedMeetings(meetings || []);
    }).catch(() => {
      if (active) { setMeetingMinutesReferences([]); setCrmLinkedMeetings([]); }
    });
    return () => { active = false; };
  }, [activityOpp]);

  const crmPeriod = useCRMPeriodFilter();
  const allOpps = (data.opportunities || []).filter((item) => crmPeriod.matches(item.created_at || item.updated_at || item.closed_at));
  const creditCustomers = (data.parties || []).filter((party: any) => !party.party_type || String(party.party_type).toUpperCase() === "CUSTOMER");
  const latestCreditByCustomer = [...(data.credit || [])]
    .sort((a: any, b: any) => new Date(b.snapshot_at || 0).getTime() - new Date(a.snapshot_at || 0).getTime())
    .reduce((latest: Map<string, any>, snapshot: any) => {
      const customerId = String(snapshot.customer_party || "");
      if (customerId && !latest.has(customerId)) latest.set(customerId, snapshot);
      return latest;
    }, new Map<string, any>());
  const filteredCreditCustomers = creditCustomers.filter((party: any) => {
    const query = creditSearch.trim().toLowerCase();
    const name = String(party.display_name || party.legal_name || "");
    const code = String(party.party_code || "");
    const matchesSearch = !query || `${name} ${code} ${party.id}`.toLowerCase().includes(query);
    const snapshot = latestCreditByCustomer.get(String(party.id));
    const limit = Number(snapshot?.credit_limit || 0);
    const available = Number(snapshot?.available_credit ?? limit);
    const overdue = Number(snapshot?.overdue_amount || 0);
    const status = limit <= 0 ? "NO_LIMIT" : snapshot?.credit_status === "HOLD" || available < 0 || overdue > 0 ? "HOLD" : "AVAILABLE";
    return matchesSearch && (creditStatusFilter === "ALL" || status === creditStatusFilter);
  });
  const activeOpps = allOpps.filter(o => {
/**
 * st coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
    const st = (o.status || "").toUpperCase();
/**
 * ps coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
    const ps = (o.pipeline_stage || "").toUpperCase();
    return !["CANCELLED", "CANCEL", "BATAL", "LOST", "CLOSED_LOST", "WON", "CLOSED_WON"].includes(st) && !["CANCELLED", "CANCEL", "BATAL", "LOST", "CLOSED_LOST", "WON", "CLOSED_WON"].includes(ps);
  });
  const cancelledOpps = allOpps.filter(o => {
    const st = (o.status || "").toUpperCase();
    const ps = (o.pipeline_stage || "").toUpperCase();
    return ["CANCELLED", "CANCEL", "BATAL", "LOST", "CLOSED_LOST"].includes(st) || ["CANCELLED", "CANCEL", "BATAL", "LOST", "CLOSED_LOST"].includes(ps);
  });
  const displayedOpps = oppFilter === "ACTIVE" 
    ? activeOpps 
    : oppFilter === "CANCELLED" 
    ? cancelledOpps 
    : allOpps;

/**
 * handleDealWon coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleDealWon = async (opp: any) => {
    try {
      const res = await processDealWon(opp.id);
      setResultModal({ type: "dealWon", data: res, opp });
      toast.success("Deal Won diproses!");
      onRefresh();
    } catch (e: any) { 
      toast.error(e?.response?.data?.detail || "Gagal proses Deal Won"); 
    }
  };

/**
 * handleExecOverride coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleExecOverride = async (opp: any) => {
    setOverrideOpp(opp);
    setOverrideRemarks("");
  };

  const submitExecutiveOverride = async () => {
    if (!overrideOpp || !overrideRemarks.trim()) {
      toast.error("Alasan override wajib diisi.");
      return;
    }
    setSavingOverride(true);
    try {
      const result = await executiveOverrideCredit(overrideOpp.id, overrideRemarks.trim());
      toast.success(result?.already_handled ? "Project untuk deal ini sudah ada." : "Override tercatat; project masuk antrean verifikasi.");
      setOverrideOpp(null);
      onRefresh();
    } catch (e: any) { 
      toast.error(e?.response?.data?.detail || "Gagal mencatat override");
    } finally {
      setSavingOverride(false);
    }
  };

/**
 * handleDelete coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleDelete = async (id: string | number) => {
    if (!confirm("Apakah Anda yakin ingin menghapus/membatalkan opportunity ini?")) return;
    try { 
      await deleteOpportunity(id); 
      toast.success("Opportunity berhasil dihapus/dibatalkan.");
      if (onOpportunityDeleted) {
        onOpportunityDeleted(id);
      }
      onRefresh(); 
    }
    catch (e: any) { 
      toast.error(e?.response?.data?.detail || e?.message || "Gagal menghapus opportunity."); 
    }
  };

  const handleMarkLost = async (id: string | number) => {
    const opportunity = allOpps.find((item) => String(item.id) === String(id));
    if (!opportunity) return;
    setLostReasonOpp(opportunity);
    setLostReasonCode("");
    setLostReasonDetail("");
  };

  const submitMarkLost = async () => {
    if (!lostReasonOpp || !lostReasonCode) {
      toast.error("Pilih alasan deal kalah.");
      return;
    }
    if (lostReasonCode === "OTHER" && !lostReasonDetail.trim()) {
      toast.error("Jelaskan alasan lain terlebih dahulu.");
      return;
    }
    setSavingLostReason(true);
    try {
      await markOpportunityLost(lostReasonOpp.id, lostReasonCode, lostReasonDetail.trim());
      toast.success("Opportunity ditandai kalah.");
      setLostReasonOpp(null);
      onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Gagal menyimpan alasan kalah.");
    } finally {
      setSavingLostReason(false);
    }
  };

  const handleOpportunityStageChange = async (opportunity: any, stage: string) => {
    if (stage === "FOLLOW_UP") {
      setFollowUpOpp(opportunity);
      setFollowUpDraft({ date: "", reason: "" });
      return;
    }
    setSavingStage(true);
    try {
      await moveCRMOpportunityStage(opportunity.id, stage, { reason: "Tahap diperbarui dari CRM" });
      toast.success(`Tahap deal diperbarui ke ${CRM_PIPELINE_STAGE_LABELS[stage] || stage}.`);
      onRefresh();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Tahap Opportunity gagal diperbarui."); }
    finally { setSavingStage(false); }
  };

  const submitOpportunityFollowUp = async () => {
    if (!followUpOpp || !followUpDraft.date || !followUpDraft.reason.trim()) { toast.error("Tanggal dan alasan follow-up wajib diisi."); return; }
    setSavingStage(true);
    try {
      await moveCRMOpportunityStage(followUpOpp.id, "FOLLOW_UP", {
        next_follow_up_at: new Date(`${followUpDraft.date}T12:00:00`).toISOString(), reason: followUpDraft.reason.trim(),
      });
      setFollowUpOpp(null);
      toast.success("Opportunity dijadwalkan untuk dipertimbangkan kembali.");
      onRefresh();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Follow-up Opportunity gagal dijadwalkan."); }
    finally { setSavingStage(false); }
  };

  const handleActivitySave = async () => {
    if (!activityOpp || !activityForm.subject.trim()) { toast.error("Isi catatan aktivitas terlebih dahulu."); return; }
    try {
      await createCRMActivity({ opportunity_id: activityOpp.id, party_id: opportunityPartyId(activityOpp), activity_type: activityForm.activity_type, subject: activityForm.subject.trim(), scheduled_at: activityForm.scheduled_at ? new Date(activityForm.scheduled_at).toISOString() : null, meeting_minutes_id: activityForm.meeting_minutes_id || null });
      toast.success("Aktivitas tersimpan."); setActivityForm({ activity_type: "CALL", subject: "", scheduled_at: "", meeting_minutes_id: "" }); onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal menyimpan aktivitas."); }
  };

  const openCrmMeetingForm = (opportunity: any) => {
    const party = (data.parties || []).find((item: any) => String(item.id) === String(opportunityPartyId(opportunity)));
    const customerName = party?.display_name || party?.legal_name || "";
    setMeetingOpp(opportunity);
    setMeetingForm({ title: `Meeting CRM — ${opportunity.opportunity_name || customerName || "Opportunity"}`, description: "", start_at: "", end_at: "", location: "", meeting_url: "", contact_name: customerName, contact_email: party?.email || "" });
  };

  const handleCrmMeetingCreate = async () => {
    if (!meetingOpp || !meetingForm.title.trim() || !meetingForm.start_at || !meetingForm.end_at) {
      toast.error("Isi judul, waktu mulai, dan waktu selesai meeting."); return;
    }
    setMeetingSaving(true);
    try {
      const created: any = await requestApi.createMeeting({
        title: meetingForm.title.trim(), description: meetingForm.description.trim(),
        start_at: new Date(meetingForm.start_at).toISOString(), end_at: new Date(meetingForm.end_at).toISOString(),
        location: meetingForm.location.trim(), meeting_url: meetingForm.meeting_url.trim(), meeting_type: "CLIENT",
        crm_opportunity_id: String(meetingOpp.id),
        external_participants: meetingForm.contact_name.trim() ? [{ name: meetingForm.contact_name.trim(), email: meetingForm.contact_email.trim() || undefined }] : [],
        agenda_items: meetingForm.description.trim() ? [{ title: meetingForm.description.trim() }] : [],
      });
      if (!created?.meeting_id) throw new Error("Meeting tersimpan, tetapi tautan detail meeting tidak diterima.");
      setMeetingOpp(null);
      toast.success("Meeting dijadwalkan dan ditautkan ke Opportunity.");
      router.push(`/requests?meeting=${encodeURIComponent(created.meeting_id)}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.message || "Meeting belum dapat dijadwalkan.");
    } finally { setMeetingSaving(false); }
  };

  const handleCustomer360 = async (id: string | number) => {
    try { setCustomer360(await getOpportunityCustomer360(id)); }
    catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal memuat Customer 360."); }
  };

  /**
   * Creates an opportunity from the modal form.
   *
   * Validation requires an opportunity name before the CRM API is called.
   * On success the modal is closed and the parent dataset is refreshed; API failures are surfaced through the existing toast flow.
   */
  const handleCreate = async () => {
    if (!form.opportunity_name.trim()) { 
      toast.error("Nama opportunity wajib diisi."); 
      return; 
    }
    if (!form.customer_party) {
      toast.error("Pilih customer untuk opportunity sebelum menyimpan.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        expected_amount: Number(form.expected_amount || 0),
        customer_party: form.customer_party ? form.customer_party.trim() : null,
      };
      const res = await createOpportunity(payload);
      toast.success("Opportunity berhasil dibuat!");
      
      const createdData = res?.data || res;
      if (!createdData?.id) throw new Error("Backend tidak mengembalikan UUID opportunity.");
      if (onOpportunityCreated) {
        onOpportunityCreated(createdData);
      }
      
      setIsNewOppOpen(false);
      setForm({ opportunity_name: "", customer_party: "", expected_amount: "150000000", probability_percent: 50, pipeline_stage: "PROSPECT" });
      onRefresh();
    } catch (e: any) { 
      toast.error(e?.response?.data?.detail || "Gagal buat opportunity"); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignOpportunityCustomer = async (opportunity: any) => {
    const customerPartyId = customerFixByOpp[String(opportunity.id)];
    if (!customerPartyId) {
      toast.error("Pilih customer terlebih dahulu.");
      return;
    }
    setSavingCustomerOppId(String(opportunity.id));
    try {
      await updateOpportunityCustomer(opportunity.id, customerPartyId);
      toast.success("Customer opportunity berhasil dilengkapi.");
      setCustomerFixByOpp((current) => ({ ...current, [String(opportunity.id)]: "" }));
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.error?.message || "Customer opportunity gagal diperbarui.");
    } finally {
      setSavingCustomerOppId(null);
    }
  };

/**
 * handleCreditRecalc coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleCreditRecalc = async (partyId: string | number) => {
    try { 
      await calculateCreditSnapshot(partyId); 
      toast.success("Credit snapshot diperbarui!"); 
      onRefresh(); 
    }
    catch (error) {
      toast.error(getUserFacingApiError(error, "Perhitungan batas kredit belum berhasil. Periksa data customer, lalu coba lagi."));
    }
  };

/**
 * handleCreditLimit coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleCreditLimit = (party: any, currentLimit: number) => {
    setCreditLimitParty({ id: party.id, name: party.display_name || party.legal_name || "Customer", current: currentLimit });
    setCreditLimitDraft(String(currentLimit));
  };

  const saveCreditLimit = async () => {
    if (!creditLimitParty) return;
    const parsedLimit = Number(creditLimitDraft);
    if (!creditLimitDraft || !Number.isFinite(parsedLimit) || parsedLimit < 0) {
      toast.error("Credit limit harus berupa angka nol atau lebih.");
      return;
    }
    setSavingCreditLimit(true);
    try {
      await updateCustomerCreditLimit({ party_id: creditLimitParty.id, credit_limit: parsedLimit });
      toast.success("Credit limit diperbarui!");
      setCreditLimitParty(null);
      onRefresh();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Batas kredit belum berhasil diperbarui. Periksa data dan hak akses, lalu coba lagi."));
    } finally {
      setSavingCreditLimit(false);
    }
  };

  const opportunityListCard = (
      <div className="card min-w-0 w-full rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Deal Pipeline & Closed Won</h3>
            <p className="text-2xs text-text-secondary">Kelola prospek penjualan dan pipeline deal aktif</p>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && (
              <button onClick={() => setIsNewOppOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1 shadow-xs">
                <Plus size={12} /> Buat Opportunity
              </button>
            )}
          </div>
        </div>

        <details className="mb-3 rounded-lg border border-text-tertiary/50 bg-bg-lighter px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-text-primary">Penjelasan tombol Opportunity</summary>
          <div className="mt-2 grid gap-1.5 leading-5 text-text-secondary sm:grid-cols-2">
            <p><b>Aktivitas:</b> simpan telepon, meeting, catatan, atau jadwal follow-up.</p>
            <p><b>Customer 360:</b> lihat ringkasan riwayat transaksi, proyek, pengiriman, dan piutang customer.</p>
            <p><b>Deal Won:</b> tandai peluang berhasil lalu jalankan pemeriksaan kredit. Hasil aman membuat order dan project incoming; jika tertahan kredit, sistem membuat proforma.</p>
            <p><b>Executive override:</b> jalur pengecualian untuk meneruskan deal yang tertahan pemeriksaan kredit. Pakai hanya setelah keputusan eksekutif disetujui.</p>
            <p className="sm:col-span-2"><b>Tandai kalah:</b> tutup peluang sebagai lost dan pilih alasan. Ini tidak menghapus riwayat opportunity.</p>
          </div>
        </details>

        <div className="mb-3"><CRMPeriodToolbar filter={crmPeriod} /></div>

        {/* Filter Toggle Pills */}
        <div className="flex items-center gap-1.5 mb-3 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setOppFilter("ACTIVE")}
            className={cn(
              "min-h-8 min-w-[104px] justify-center px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
              oppFilter === "ACTIVE"
                ? "bg-white text-brand-deep-green shadow-xs"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <span>Aktif</span>
            <span className="px-1.5 py-0.2 rounded-full text-2xs bg-brand-light-green text-brand-deep-green font-bold">
              {activeOpps.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOppFilter("CANCELLED")}
            className={cn(
              "min-h-8 min-w-[104px] justify-center px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
              oppFilter === "CANCELLED"
                ? "bg-white text-red-600 shadow-xs"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <span>Dibatalkan / Arsip</span>
            {cancelledOpps.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-2xs bg-red-100 text-red-700 font-bold">
                {cancelledOpps.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setOppFilter("ALL")}
            className={cn(
              "min-h-8 min-w-[104px] justify-center px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
              oppFilter === "ALL"
                ? "bg-white text-text-primary shadow-xs"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            <span>Semua</span><span className="rounded-full bg-blue-100 px-1.5 text-2xs font-bold text-blue-700">{allOpps.length}</span>
          </button>
        </div>

        {displayedOpps.length === 0 ? (
          <EmptyState 
            msg={
              oppFilter === "ACTIVE" 
                ? "Tidak ada opportunity aktif saat ini." 
                : oppFilter === "CANCELLED" 
                ? "Tidak ada opportunity yang dibatalkan." 
                : "Belum ada opportunity."
            } 
          />
        ) : (
          <div className="max-h-[600px] overflow-auto rounded-xl border border-text-tertiary/60">
            <table className="w-full min-w-[1040px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-semibold text-text-secondary">
                <tr>
                  <th className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">Opportunity</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">Customer</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-right last:border-r-0">Estimasi & peluang</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">Pipeline / Status</th>
                  <th className="border-b border-slate-200 px-3 py-3">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-tertiary/40 bg-white">
                {displayedOpps.map((o, rowIndex) => {
              const probability = Math.max(0, Math.min(100, Number(o.probability_percent || 0)));
/**
 * cust coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
              const cust = (data.parties||[]).find(p => String(p.id) === String(opportunityPartyId(o)));
              const terminalWon = ["WON","CLOSED_WON"].includes((o.status||"").toUpperCase()) || ["WON","CLOSED_WON"].includes((o.pipeline_stage||"").toUpperCase());
              const terminalLost = ["LOST","CLOSED_LOST"].includes((o.status||"").toUpperCase()) || ["LOST","CLOSED_LOST"].includes((o.pipeline_stage||"").toUpperCase());
              const terminalConflict = terminalWon && terminalLost;
              const isWon = terminalWon && !terminalConflict;
              const isLost = terminalLost && !terminalConflict;
              const isHardCancelled = ["CANCELLED","CANCEL","BATAL"].includes((o.status||"").toUpperCase()) || ["CANCELLED","CANCEL","BATAL"].includes((o.pipeline_stage||"").toUpperCase());
              const isCancelled = isLost || terminalConflict || isHardCancelled;
              const canManageOpportunity = !readOnly && (canEditAll || Boolean(currentUserId && String(o.created_by_id) === currentUserId));
              const lostReasonLabels: Record<string, string> = { PRICE_TOO_HIGH: "Harga tidak sesuai", LOST_FEATURES: "Fitur/kebutuhan tidak terpenuhi", BUDGET_CANCELLED: "Anggaran dibatalkan", COMPETITOR: "Memilih kompetitor", NO_RESPONSE: "Tidak ada respons", OTHER: "Lainnya" };
              const lostReasonSummary = lostReasonLabels[String(o.lost_reason || "").toUpperCase()] || o.lost_reason || "Alasan belum tercatat";

              return (
                <tr key={o.id} className={cn("align-top transition-colors hover:bg-blue-50/70", rowIndex % 2 ? "bg-slate-50/70" : "bg-white", isCancelled && "bg-red-50/50 text-text-secondary")}>
                  <td className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">
                    <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-2xs font-bold text-emerald-800"><TrendingUp size={11} />💼 Tahap Pipeline Sales</span>
                    <div className={cn("max-w-[280px] break-words text-sm font-semibold leading-5", isCancelled ? "line-through text-gray-500" : "text-text-primary")}>{o.opportunity_name || `Opportunity ${String(o.id).slice(0,8)}`}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-text-secondary">
                      <span>ID {String(o.id).slice(0, 8).toUpperCase()}</span>
                      {o.owner_user_id && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                          PIC: {teamUsers.find((u: any) => String(u.id) === String(o.owner_user_id))?.full_name || String(o.owner_user_id).slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">
                    {cust ? <span className="text-sm font-medium text-text-primary">{cust.display_name || cust.legal_name || "Pelanggan Umum"}</span> : !isCancelled && canManageOpportunity ? (
                      <div className="flex min-w-[250px] items-center gap-1.5">
                        <select aria-label={`Pilih customer untuk ${o.opportunity_name || "opportunity"}`} className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs" value={customerFixByOpp[String(o.id)] || ""} onChange={(event) => setCustomerFixByOpp((current) => ({ ...current, [String(o.id)]: event.target.value }))}>
                          <option value="">Pilih customer</option>
                          {(data.parties || []).filter((party: any) => party.party_type === "CUSTOMER" && party.status === "ACTIVE").map((party: any) => <option key={party.id} value={String(party.id)}>{party.display_name || party.legal_name}</option>)}
                        </select>
                        <button type="button" onClick={() => void handleAssignOpportunityCustomer(o)} disabled={!customerFixByOpp[String(o.id)] || savingCustomerOppId === String(o.id)} className="shrink-0 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-50">{savingCustomerOppId === String(o.id) ? "Menyimpan…" : "Simpan"}</button>
                      </div>
                    ) : <span className="text-sm text-text-secondary">Pelanggan Umum</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-3 text-right last:border-r-0">
                    <div className="text-sm font-bold text-text-primary">{formatMoney(o.expected_amount)}</div>
                    <div className="mt-1 flex items-center justify-end gap-1.5 text-2xs font-medium text-emerald-800"><span>Peluang</span><span className="font-bold">{probability}%</span></div>
                    <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`Peluang menang ${probability}%`} aria-valuenow={probability} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${probability}%` }} /></div>
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">
                    <StatusBadge status={o.status || "OPEN"} />
                    {!canManageOpportunity || isCancelled || isWon || isLost ? <div className="mt-1 text-xs text-text-secondary">{CRM_PIPELINE_STAGE_LABELS[String(o.pipeline_stage || (isWon ? "WON" : isLost ? "LOST" : "PROSPECT")).toUpperCase()] || o.pipeline_stage || "Prospek"}</div> : <select aria-label={`Tahap ${o.opportunity_name || "Opportunity"}`} className="input mt-1 max-w-[190px] px-2 py-1 text-xs" value={normalizeOpportunityStage(o.pipeline_stage)} disabled={savingStage} onChange={event => void handleOpportunityStageChange(o, event.target.value)}>{["PROSPECT", "DISCOVERY", "PROPOSAL_SENT", "NEGOTIATION", "FOLLOW_UP"].map(stage => <option key={stage} value={stage}>{CRM_PIPELINE_STAGE_LABELS[stage]}</option>)}</select>}
                    {normalizeOpportunityStage(o.pipeline_stage) === "FOLLOW_UP" && o.next_follow_up_at && <div className="mt-1 text-2xs text-amber-700">Tindak lanjut: {formatDate(o.next_follow_up_at)}</div>}
                    {normalizeOpportunityStage(o.pipeline_stage) === "FOLLOW_UP" && o.follow_up_reason && <div className="mt-1 max-w-[190px] truncate text-2xs text-text-secondary" title={o.follow_up_reason}>{o.follow_up_reason}</div>}
                    {isLost && <div className="mt-1 max-w-[190px] truncate text-2xs text-text-secondary" title={o.lost_reason_detail ? `${lostReasonSummary}: ${o.lost_reason_detail}` : lostReasonSummary}>{lostReasonSummary}</div>}
                    {terminalConflict && <div className="mt-1 text-2xs font-medium text-red-700" title="Status terminal saling bertentangan; minta admin memperbaiki data sebelum melanjutkan.">Status konflik · periksa data</div>}
                  </td>
                  <td className="border-b border-slate-200 px-3 py-3">
                    <div className="flex min-w-[270px] flex-wrap items-center gap-1.5">
                      {canManageOpportunity && onOpenStageDetail && <ActionBtn onClick={() => onOpenStageDetail(o, "OPPORTUNITY")} label="Detail Pipeline" small variant="ghost" title="Buka modal diferensiasi Sales Opportunity (Info, Follow-Up, Estimasi & Pajak, Notulensi)." />}
                      {canDelegate && onOpenDelegate && !isCancelled && <ActionBtn onClick={() => onOpenDelegate(o, "OPPORTUNITY")} label="Delegasi PIC" small variant="ghost" title="Delegasikan atau alihkan PIC Sales untuk Opportunity ini (SPV/GM)." />}
                      {canManageOpportunity && !isCancelled && <ActionBtn onClick={async () => { setActivityOpp(o); setActivityForm({ activity_type: "CALL", subject: "", scheduled_at: "", meeting_minutes_id: "" }); }} label="Aktivitas" small variant="ghost" title="Catat telepon, meeting, catatan, atau follow-up untuk opportunity ini." />}
                      {canManageOpportunity && !isCancelled && <ActionBtn onClick={async () => { openCrmMeetingForm(o); }} label="Jadwalkan meeting" small variant="ghost" title="Buat meeting pada modul Meeting & Request dan tautkan ke opportunity ini." />}
                      {!readOnly && cust && <ActionBtn onClick={() => handleCustomer360(o.id)} label="Customer 360" small variant="ghost" title="Lihat ringkasan customer: proyek, kontrak, pengiriman, nilai transaksi, serta piutang." />}
                      {canManageOpportunity && !isCancelled && !isWon && <ActionBtn onClick={() => handleDealWon(o)} label="Deal Won" small disabled={!cust} title={!cust ? "Lengkapi customer pada opportunity sebelum menjalankan Deal Won." : "Tandai deal berhasil dan jalankan pemeriksaan kredit."} />}
                      {!readOnly && isWon && canOverride && <ActionBtn onClick={() => handleExecOverride(o)} label="Executive override" variant="ghost" small title="Jalur pengecualian untuk Direktur saat pemeriksaan kredit menahan deal; wajib mencatat alasan." />}
                      {canManageOpportunity && isHardCancelled && <button onClick={() => handleDelete(o.id)} title="Hapus permanen" className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>}
                      {canManageOpportunity && !isCancelled && !isWon && <ActionBtn onClick={() => handleMarkLost(o.id)} label="Tandai kalah" small variant="ghost" title="Tutup opportunity sebagai kalah dan catat alasannya." />}
                      {isWon && !readOnly && !canOverride && <span className="text-xs font-medium text-emerald-700">Deal Won</span>}
                      {readOnly && <span className="text-xs text-text-secondary">{terminalConflict ? "Status konflik" : isLost ? "Deal Closed Lost" : isHardCancelled ? "Dibatalkan" : isWon ? "Deal Closed Won" : o.pipeline_stage || "In Pipeline"}</span>}
                    </div>
                  </td>
                </tr>
              );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
  );

  const creditControlCard = (
      <div className="card min-w-0 w-full rounded-xl p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Batas Kredit Pelanggan</h3>
            <p className="mt-1 text-xs text-text-secondary">Periksa plafon, piutang berjalan, dan kelayakan kredit sebelum order diproses.</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800"><Users size={13} />{creditCustomers.length} pelanggan</span>
        </div>
        <CollapsibleGuideline title="Cara membaca status kredit" className="mb-4" tone="blue">
          <ul className="list-disc space-y-1 pl-4">
            <li><strong>Limit belum diatur:</strong> plafon belum ditentukan; order tidak dapat lolos pemeriksaan kredit sampai limit ditetapkan.</li>
            <li><strong>Tersedia:</strong> plafon sudah diatur dan sisa kredit dapat digunakan.</li>
            <li><strong>Perlu ditinjau:</strong> status kredit ditahan, limit terlampaui, atau ada piutang yang jatuh tempo.</li>
          </ul>
          <p className="mt-2">Nilai <strong>Belum dihitung</strong> berarti snapshot kredit belum tersedia. Gunakan Hitung ulang untuk mengambil data piutang terbaru.</p>
        </CollapsibleGuideline>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Cari pelanggan</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
            <input type="search" value={creditSearch} onChange={event => setCreditSearch(event.target.value)} placeholder="Cari nama, kode, atau ID pelanggan..." className="input w-full pl-9 text-xs" />
          </label>
          <label className="relative">
            <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
            <span className="sr-only">Filter status kredit</span>
            <select value={creditStatusFilter} onChange={event => setCreditStatusFilter(event.target.value)} className="input w-full pl-8 text-xs sm:w-52">
              <option value="ALL">Semua status kredit</option>
              <option value="NO_LIMIT">Limit belum diatur</option>
              <option value="AVAILABLE">Tersedia</option>
              <option value="HOLD">Perlu ditinjau</option>
            </select>
          </label>
          <span className="whitespace-nowrap text-xs text-text-secondary">{filteredCreditCustomers.length} ditampilkan</span>
        </div>
        {creditCustomers.length === 0 ? <EmptyState msg="Belum ada data pelanggan untuk diperiksa." /> : filteredCreditCustomers.length === 0 ? <EmptyState msg="Tidak ada pelanggan yang cocok dengan pencarian atau status ini." /> : (
          <div className="rounded-xl border border-text-tertiary/60">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-semibold text-text-secondary">
                <tr>
                  <th className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">Customer</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">Status</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-right last:border-r-0">Limit</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-right last:border-r-0">Outstanding</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-right last:border-r-0">Sisa</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-right last:border-r-0">Overdue</th>
                  {!readOnly && <th className="border-b border-slate-200 px-3 py-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-text-tertiary/40 bg-white">
                {filteredCreditCustomers.map((p: any, customerIndex: number) => {
              const snap = latestCreditByCustomer.get(String(p.id));
              const limit = snap?.credit_limit || 0;
              const outstanding = snap?.outstanding_receivable || 0;
              const overdue = snap?.overdue_amount || 0;
              const available = snap?.available_credit ?? limit;
              const isNoLimit = limit <= 0;
              const isHeld = !isNoLimit && (snap?.credit_status === "HOLD" || available < 0 || overdue > 0);
              const status = isNoLimit ? "NO_LIMIT" : isHeld ? "HOLD" : "AVAILABLE";
              const statusLabel = isNoLimit ? "Limit belum diatur" : isHeld ? "Perlu ditinjau" : "Tersedia";
              return (
                <tr key={p.id} className={cn("transition-colors hover:bg-blue-50/70", isHeld ? "bg-red-50/60" : isNoLimit ? "bg-amber-50/50" : customerIndex % 2 ? "bg-slate-50/70" : "bg-white")}>
                  <td className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary"><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xs font-black", ["bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700"][customerIndex % 4])}>{String(p.display_name || p.legal_name || "C").slice(0, 2).toUpperCase()}</span><span className="min-w-0"><span className="block max-w-[190px] break-words">{p.display_name || p.legal_name}</span><span className="mt-0.5 block text-[10px] font-normal text-text-secondary">{p.party_code ? `Kode ${p.party_code} · ` : ""}ID {String(p.id).slice(0, 8).toUpperCase()}</span></span></span>
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0"><span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold", isHeld ? "bg-red-100 text-red-800" : isNoLimit ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800")}>{statusLabel}</span></td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-3 py-3 text-right text-sm font-semibold text-brand-green last:border-r-0">{limit > 0 ? formatMoney(limit) : <span className="text-xs font-medium text-amber-800">Belum diatur</span>}</td>
                  <td className={cn("whitespace-nowrap border-b border-r border-slate-200 px-3 py-3 text-right text-sm font-medium last:border-r-0", outstanding > 0 ? "text-amber-700" : "text-text-primary")}>{snap ? formatMoney(outstanding) : <span className="text-xs text-text-secondary">Belum dihitung</span>}</td>
                  <td className={cn("whitespace-nowrap border-b border-r border-slate-200 px-3 py-3 text-right text-sm font-semibold last:border-r-0", isNoLimit ? "text-text-secondary" : available >= 0 ? "text-brand-green" : "text-red-600")}>{isNoLimit ? "—" : snap ? formatMoney(available) : <span className="text-xs font-medium text-text-secondary">Belum dihitung</span>}</td>
                  <td className={cn("whitespace-nowrap border-b border-slate-200 px-3 py-3 text-right text-sm font-medium", overdue > 0 ? "text-red-600" : "text-text-primary")}>{snap ? formatMoney(overdue) : <span className="text-xs text-text-secondary">Belum dihitung</span>}</td>
                  {!readOnly && <td className="border-b border-slate-200 px-3 py-3">{(canEditAll || Boolean(currentUserId && String(p.created_by_id) === currentUserId)) ? <div className="flex min-w-[180px] justify-end gap-1.5"><ActionBtn onClick={async () => { handleCreditLimit(p, limit); }} label="Atur Limit" small variant="ghost" title="Tetapkan plafon kredit customer. Nilai ini dipakai untuk menentukan apakah Deal Won bisa diteruskan tanpa proforma." /><ActionBtn onClick={() => handleCreditRecalc(p.id)} label="Hitung ulang" small variant="ghost" title="Hitung ulang limit tersedia, piutang berjalan, dan overdue dari data invoice yang tercatat." /></div> : <span className="text-2xs text-text-secondary">Dibuat pengguna lain</span>}</td>}
                </tr>
              );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <CrmSalesPipelineShell
        data={data}
        teamUsers={teamUsers}
        viewMode={pipelineViewMode}
        onViewModeChange={(mode) => onPipelineViewModeChange?.(mode)}
        onOpenNewOpp={() => setIsNewOppOpen(true)}
        onMoveStage={(opp, stage) => void handleOpportunityStageChange(opp, stage)}
        onDealWon={(opp) => void handleDealWon(opp)}
        onMarkLost={(opp) => void handleMarkLost(opp.id)}
        onOpenActivity={(opp) => {
          setActivityOpp(opp);
          setActivityForm({ activity_type: "CALL", subject: "", scheduled_at: "", meeting_minutes_id: "" });
        }}
        onOpenMeeting={(opp) => openCrmMeetingForm(opp)}
        onOpenCustomer360={(oppId) => void handleCustomer360(oppId)}
        onOpenDelegate={onOpenDelegate ? (opp) => onOpenDelegate(opp, "OPPORTUNITY") : undefined}
        canDelegate={canDelegate}
        readOnly={readOnly}
        canEditAll={canEditAll}
        currentUserId={currentUserId}
        listSlot={opportunityListCard}
        estimateSlot={estimateSlot || null}
        creditSlot={creditControlCard}
      />

      <Modal isOpen={Boolean(creditLimitParty)} onClose={() => !savingCreditLimit && setCreditLimitParty(null)} title={`Atur Limit Kredit — ${creditLimitParty?.name || "Customer"}`} size="sm">
        <div className="space-y-3 p-4">
          <p className="text-xs text-text-secondary">Limit saat ini: <b className="text-text-primary">{formatMoney(creditLimitParty?.current || 0)}</b></p>
          <label className="block text-xs font-medium text-text-secondary">Limit kredit baru
            <IDRInput aria-label="Limit kredit baru dalam rupiah" value={creditLimitDraft} onChange={setCreditLimitDraft} />
          </label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setCreditLimitParty(null)} disabled={savingCreditLimit} className="btn-ghost">Batal</button><button type="button" onClick={() => void saveCreditLimit()} disabled={savingCreditLimit || !creditLimitDraft} className="btn-primary">{savingCreditLimit ? "Menyimpan…" : "Simpan limit"}</button></div>
        </div>
      </Modal>

      {/* Modal: Buat Opportunity Baru */}
      <Modal isOpen={isNewOppOpen} onClose={() => setIsNewOppOpen(false)} title="Buat Opportunity Baru" size="md">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Nama Opportunity *</label>
            <input 
              className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" 
              value={form.opportunity_name} 
              onChange={e => setForm(f => ({ ...f, opportunity_name: e.target.value }))} 
              placeholder="Contoh: Pengadaan Server Smart Office..." 
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-text-secondary">Pilih Pelanggan * (wajib untuk Deal Won)</label>
              <button 
                type="button" 
                onClick={() => setIsQuickPartyOpen(true)}
                className="text-2xs font-semibold text-brand-green hover:underline flex items-center gap-1"
              >
                <UserPlus size={12} /> + Pelanggan Baru
              </button>
            </div>
            <select
              className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white"
              value={form.customer_party}
              onChange={e => setForm(f => ({ ...f, customer_party: e.target.value }))}
            >
              <option value="">-- Pilih customer aktif --</option>
              {(data.parties || []).filter((party: any) => party.party_type === "CUSTOMER" && party.status === "ACTIVE").map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.display_name || p.legal_name} {p.party_code ? `(${p.party_code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Expected Amount (Rp)</label>
              <IDRInput aria-label="Expected Amount dalam rupiah" value={form.expected_amount} onChange={(digits) => setForm((current) => ({ ...current, expected_amount: digits }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Probabilitas (%)</label>
              <input 
                type="number" 
                min={0} 
                max={100} 
                className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" 
                value={form.probability_percent} 
                onChange={e => setForm(f => ({ ...f, probability_percent: Number(e.target.value) }))} 
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Tahap Deal</label>
            <select 
              className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white" 
              value={form.pipeline_stage} 
              onChange={e => setForm(f => ({ ...f, pipeline_stage: e.target.value }))}
            >
              {["PROSPECT","DISCOVERY","PROPOSAL_SENT","NEGOTIATION"].map(s => <option key={s} value={s}>{CRM_PIPELINE_STAGE_LABELS[s]}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2 justify-end">
            <button onClick={() => setIsNewOppOpen(false)} disabled={isSubmitting} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} disabled={isSubmitting || !form.opportunity_name.trim() || !form.customer_party} className="btn-primary">
              {isSubmitting ? "Memproses..." : "Buat Opportunity"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Quick Add Party Modal */}
      <QuickAddPartyModal
        isOpen={isQuickPartyOpen}
        onClose={() => setIsQuickPartyOpen(false)}
        onSuccess={(newParty) => {
          if (onPartyCreated) onPartyCreated(newParty);
          setForm(f => ({ ...f, customer_party: String(newParty.id) }));
        }}
      />

      {/* Deal Won Result Modal */}
      {resultModal?.type === "dealWon" && (
        <Modal isOpen={true} onClose={() => setResultModal(null)} title="Deal Won & Credit Assessment" size="md">
          <div className="p-4 flex flex-col gap-3">
            <div className={cn("p-3 rounded-xl", resultModal.data?.credit_evaluation?.is_safe ? "bg-brand-light-green border border-brand-primary-soft" : "bg-amber-50 border border-amber-200")}>
              <div className="font-semibold text-sm">Keputusan: {resultModal.data?.decision || "-"}</div>
              <div className="text-xs text-text-secondary mt-1">{resultModal.data?.handoff?.note || resultModal.data?.message || ""}</div>
            </div>
            {resultModal.data?.credit_evaluation && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg border border-text-tertiary/60"><div className="text-text-secondary">Credit Limit</div><div className="font-semibold">{formatMoney(resultModal.data.credit_evaluation.credit_limit)}</div></div>
                <div className="p-2 rounded-lg border border-text-tertiary/60"><div className="text-text-secondary">Available</div><div className="font-semibold">{formatMoney(resultModal.data.credit_evaluation.available_credit)}</div></div>
                <div className="p-2 rounded-lg border border-text-tertiary/60"><div className="text-text-secondary">Piutang berjalan</div><div className="font-semibold">{formatMoney(resultModal.data.credit_evaluation.outstanding_receivable)}</div></div>
                <div className="p-2 rounded-lg border border-text-tertiary/60"><div className="text-text-secondary">Piutang jatuh tempo</div><div className="font-semibold">{formatMoney(resultModal.data.credit_evaluation.overdue_amount)}</div></div>
              </div>
            )}
            {resultModal.data?.handoff && (
              <div className="rounded-xl border border-text-tertiary/60 p-3 text-xs leading-5">
                <div className="font-semibold">Langkah berikutnya</div>
                {resultModal.data.handoff.project_id
                  ? <p>Sales Order dan project incoming sudah dibuat. Tim project perlu membuka project tersebut dan melengkapi verifikasi sebelum pekerjaan dimulai.</p>
                  : resultModal.data.handoff.proforma_invoice_id
                    ? <p>Deal tertahan pemeriksaan kredit. Proforma sudah dibuat; minta tim Finance menindaklanjuti pembayaran. Setelah pembayaran lunas, jalankan Deal Won kembali untuk membuat Sales Order dan project.</p>
                    : <p>{resultModal.data.handoff.note || "Periksa hasil handoff dan tindak lanjuti dengan tim terkait."}</p>}
              </div>
            )}
            <button onClick={() => setResultModal(null)} className="btn-primary self-end">Tutup</button>
          </div>
        </Modal>
      )}
      <Modal isOpen={Boolean(lostReasonOpp)} onClose={() => { if (!savingLostReason) setLostReasonOpp(null); }} title={`Tandai kalah — ${lostReasonOpp?.opportunity_name || "Opportunity"}`} size="sm">
        <div className="space-y-3 p-4">
          <p className="text-xs leading-5 text-text-secondary">Pilih alasan utama. Catatan tambahan dapat disimpan untuk semua alasan; untuk “Lainnya”, catatan wajib diisi.</p>
          <label className="block text-xs font-medium text-text-primary">Alasan utama *
            <select className="input mt-1 w-full" value={lostReasonCode} onChange={(event) => setLostReasonCode(event.target.value)}>
              <option value="">Pilih alasan</option>
              <option value="PRICE_TOO_HIGH">Harga tidak sesuai</option>
              <option value="LOST_FEATURES">Fitur/kebutuhan tidak terpenuhi</option>
              <option value="BUDGET_CANCELLED">Anggaran dibatalkan</option>
              <option value="COMPETITOR">Memilih kompetitor</option>
              <option value="NO_RESPONSE">Tidak ada respons</option>
              <option value="OTHER">Lainnya</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-text-primary">Catatan {lostReasonCode === "OTHER" ? "*" : "(opsional)"}
            <textarea className="input mt-1 w-full min-h-24" value={lostReasonDetail} onChange={(event) => setLostReasonDetail(event.target.value)} maxLength={2000} placeholder="Contoh: alasan spesifik atau konteks percakapan dengan customer" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setLostReasonOpp(null)} disabled={savingLostReason} className="btn-ghost">Batal</button>
            <button type="button" onClick={() => void submitMarkLost()} disabled={savingLostReason || !lostReasonCode || (lostReasonCode === "OTHER" && !lostReasonDetail.trim())} className="btn-primary">{savingLostReason ? "Menyimpan…" : "Simpan alasan & tutup deal"}</button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={Boolean(overrideOpp)} onClose={() => { if (!savingOverride) setOverrideOpp(null); }} title={`Executive override — ${overrideOpp?.opportunity_name || "Opportunity"}`} size="sm">
        <div className="space-y-3 p-4">
          <p className="text-xs leading-5 text-text-secondary">Tindakan ini melewati penahanan kredit dan membuat order serta project incoming. Keputusan dan alasan akan dicatat pada riwayat approval.</p>
          <label className="block text-xs font-medium text-text-primary">Alasan dan dasar persetujuan *</label>
          <textarea className="input -mt-2 w-full min-h-28" value={overrideRemarks} onChange={(event) => setOverrideRemarks(event.target.value)} maxLength={2000} placeholder="Tuliskan siapa yang menyetujui, dasar bisnis, dan rencana mitigasi risiko kredit." />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOverrideOpp(null)} disabled={savingOverride} className="btn-ghost">Batal</button>
            <button type="button" onClick={() => void submitExecutiveOverride()} disabled={savingOverride || !overrideRemarks.trim()} className="btn-primary">{savingOverride ? "Menyimpan…" : "Catat override"}</button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={Boolean(followUpOpp)} onClose={() => !savingStage && setFollowUpOpp(null)} title={`Follow-up kembali — ${followUpOpp?.opportunity_name || "Opportunity"}`} size="sm">
        <div className="space-y-3 p-1"><p className="text-xs text-text-secondary">Opportunity tetap terbuka dan akan muncul sebagai Follow-up Kembali sampai tim menghubungi customer lagi.</p><label className="block text-xs font-medium">Tanggal tindak lanjut *<input className="input mt-1 w-full" type="date" min={new Date().toISOString().slice(0, 10)} value={followUpDraft.date} onChange={event => setFollowUpDraft({ ...followUpDraft, date: event.target.value })} /></label><label className="block text-xs font-medium">Alasan / rencana tindak lanjut *<textarea className="input mt-1 w-full min-h-20" maxLength={2000} value={followUpDraft.reason} onChange={event => setFollowUpDraft({ ...followUpDraft, reason: event.target.value })} /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setFollowUpOpp(null)} disabled={savingStage} className="btn-ghost">Batal</button><button type="button" onClick={() => void submitOpportunityFollowUp()} disabled={savingStage || !followUpDraft.date || !followUpDraft.reason.trim()} className="btn-primary">{savingStage ? "Menyimpan…" : "Simpan follow-up"}</button></div></div>
      </Modal>
      <Modal isOpen={Boolean(activityOpp)} onClose={() => setActivityOpp(null)} title={`Aktivitas — ${activityOpp?.opportunity_name || "Opportunity"}`} size="sm">
        <div className="space-y-3">
          <CollapsibleGuideline title="Panduan pencatatan meeting">Untuk menjadwalkan meeting dengan agenda dan notulensi yang bisa menghasilkan keputusan serta action item, gunakan tombol <b>Jadwalkan meeting</b> pada Opportunity.</CollapsibleGuideline>
          <label className="block text-xs font-medium">Jenis aktivitas<select className="input mt-1 w-full" value={activityForm.activity_type} onChange={e => setActivityForm({ ...activityForm, activity_type: e.target.value })}><option value="CALL">Telepon</option><option value="MEETING">Catatan meeting yang sudah berlangsung</option><option value="NOTE">Catatan</option><option value="FOLLOW_UP">Follow-up</option></select></label>
          <label className="block text-xs font-medium">Catatan<textarea className="input mt-1 w-full min-h-20" value={activityForm.subject} onChange={e => setActivityForm({ ...activityForm, subject: e.target.value })} placeholder="Ringkasan percakapan atau tindak lanjut" /></label>
          <label className="block text-xs font-medium">Tautkan ke notulensi (opsional)<select className="input mt-1 w-full" value={activityForm.meeting_minutes_id} onChange={e => setActivityForm({ ...activityForm, meeting_minutes_id: e.target.value })}><option value="">Tidak ditautkan</option>{meetingMinutesReferences.map((minutes) => <option key={minutes.id} value={minutes.id}>{minutes.meeting_title} · {formatDate(minutes.occurrence_date)}{minutes.status === "PUBLISHED" ? " · Dipublikasikan" : " · Draft"}</option>)}</select><span className="mt-1 block text-2xs text-text-secondary">Daftar hanya memuat notulensi meeting yang dapat Anda akses.</span></label>
          <label className="block text-xs font-medium">Jadwalkan follow-up (opsional)<input className="input mt-1 w-full" type="datetime-local" value={activityForm.scheduled_at} onChange={e => setActivityForm({ ...activityForm, scheduled_at: e.target.value })} /></label>
          <div className="text-xs text-text-secondary">Riwayat: {(data.activities || []).filter(a => String(a.opportunity_id) === String(activityOpp?.id)).length} aktivitas</div>
          <div className="max-h-32 overflow-y-auto space-y-1">{(data.activities || []).filter(a => String(a.opportunity_id) === String(activityOpp?.id)).map(a => { const linkedMinutes = meetingMinutesReferences.find((minutes) => String(minutes.id) === String(a.meeting_minutes_id)); return <div key={a.id} className="border rounded p-2 text-xs"><b>{a.activity_type}</b> · {a.subject}<div className="mt-1 flex flex-wrap items-center gap-1.5 text-text-secondary">{a.scheduled_at ? <><span>{formatDate(a.scheduled_at)}</span><span className="rounded bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold text-amber-800">Jadwal follow-up</span></> : <span>Selesai</span>}</div>{linkedMinutes && <div className="mt-1 text-2xs text-blue-700">Notulensi: {linkedMinutes.meeting_title} · {formatDate(linkedMinutes.occurrence_date)}</div>}</div>; })}</div>
          <div className="border-t pt-3"><div className="mb-2 text-xs font-semibold">Meeting yang tertaut</div>{crmLinkedMeetings.length ? <div className="max-h-36 space-y-2 overflow-y-auto">{crmLinkedMeetings.map((meeting) => <div key={meeting.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs"><div className="min-w-0"><div className="truncate font-semibold">{meeting.request?.title || "Meeting CRM"}</div><div className="text-text-secondary">{formatDate(meeting.start_at)} · {meeting.status}</div></div><button type="button" onClick={() => router.push(`/requests?meeting=${encodeURIComponent(meeting.id)}`)} className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1.5 font-semibold text-blue-800 hover:bg-blue-100">Buka meeting</button></div>)}</div> : <p className="text-xs text-text-secondary">Belum ada meeting yang dijadwalkan dari Opportunity ini.</p>}</div>
          <button onClick={handleActivitySave} className="btn-primary w-full">Simpan aktivitas</button>
        </div>
      </Modal>
      <Modal isOpen={Boolean(meetingOpp)} onClose={() => !meetingSaving && setMeetingOpp(null)} title="Jadwalkan Meeting CRM" size="md">
        <div className="space-y-3 p-1">
          <p className="text-xs leading-5 text-text-secondary">Meeting dibuat melalui modul Meeting & Request. Notulensi, keputusan, dan action item dikelola di sana dan meeting tetap tertaut ke Opportunity ini.</p>
          <label className="block text-xs font-medium">Judul meeting *<input className="input mt-1 w-full" value={meetingForm.title} onChange={event => setMeetingForm({ ...meetingForm, title: event.target.value })} maxLength={255} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-medium">Mulai *<input className="input mt-1 w-full" type="datetime-local" value={meetingForm.start_at} onChange={event => setMeetingForm({ ...meetingForm, start_at: event.target.value })} /></label><label className="block text-xs font-medium">Selesai *<input className="input mt-1 w-full" type="datetime-local" value={meetingForm.end_at} onChange={event => setMeetingForm({ ...meetingForm, end_at: event.target.value })} /></label></div>
          <label className="block text-xs font-medium">Agenda / konteks<textarea className="input mt-1 w-full min-h-16" value={meetingForm.description} onChange={event => setMeetingForm({ ...meetingForm, description: event.target.value })} placeholder="Topik yang akan dibahas dengan calon pelanggan" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-medium">Lokasi<input className="input mt-1 w-full" value={meetingForm.location} onChange={event => setMeetingForm({ ...meetingForm, location: event.target.value })} /></label><label className="block text-xs font-medium">Tautan meeting<input className="input mt-1 w-full" type="url" value={meetingForm.meeting_url} onChange={event => setMeetingForm({ ...meetingForm, meeting_url: event.target.value })} placeholder="https://..." /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-medium">Nama kontak customer<input className="input mt-1 w-full" value={meetingForm.contact_name} onChange={event => setMeetingForm({ ...meetingForm, contact_name: event.target.value })} /></label><label className="block text-xs font-medium">Email kontak (opsional)<input className="input mt-1 w-full" type="email" value={meetingForm.contact_email} onChange={event => setMeetingForm({ ...meetingForm, contact_email: event.target.value })} /></label></div>
          <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setMeetingOpp(null)} disabled={meetingSaving} className="btn-ghost">Batal</button><button type="button" onClick={() => void handleCrmMeetingCreate()} disabled={meetingSaving || !meetingForm.title.trim() || !meetingForm.start_at || !meetingForm.end_at} className="btn-primary">{meetingSaving ? "Menjadwalkan…" : "Buat meeting"}</button></div>
        </div>
      </Modal>
      <Modal isOpen={Boolean(customer360)} onClose={() => setCustomer360(null)} title="Customer 360 View" size="sm">
        {customer360 && <div className="grid grid-cols-2 gap-3 text-sm"><div className="col-span-2 font-semibold">{customer360.customer?.name || "Pelanggan"}</div><div>LTV<br/><b>{formatMoney(customer360.lifetime_value || 0)}</b></div><div>Proyek berjalan<br/><b>{customer360.active_projects ?? 0}</b></div><div>Total proyek<br/><b>{customer360.projects ?? 0}</b></div><div>Piutang terbuka<br/><b>{formatMoney(customer360.outstanding_ar || 0)}</b></div><div>Pengiriman<br/><b>{customer360.deliveries ?? 0}</b></div><div>Kontrak<br/><b>{customer360.contracts ?? 0}</b></div><div className="col-span-2">Reputasi pembayaran: <b>{customer360.payment_reputation || "—"}</b> · Invoice jatuh tempo: {customer360.overdue_invoice_count ?? 0}</div></div>}
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: ESTIMATE & QUOTING
══════════════════════════════════════════════════ */
/**
 * TabEstimate coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TabEstimate({ data, approvals, onRefresh, onNavigate, readOnly = false, canApproveQuotation = false, currentUserId, canEditAll = false }: { data: CRMData; approvals: any[]; onRefresh: () => void; onNavigate: (tab: string) => void; readOnly?: boolean; canApproveQuotation?: boolean; currentUserId?: string; canEditAll?: boolean }) {
  const [isEstModal, setIsEstModal] = useState(false);
  const [calculatingEstimateId, setCalculatingEstimateId] = useState<string | null>(null);
  const [estForm, setEstForm] = useState({ opportunity: "", direct_cost: "100000000", overhead_cost: "30000000", contingency_amount: "0", markup_percent: "30", tax_percent: "0", description: "" });
  const [quotationSearch, setQuotationSearch] = useState("");
  const [quotationClientFilter, setQuotationClientFilter] = useState("");
  const crmPeriod = useCRMPeriodFilter();
  const [sendDialog, setSendDialog] = useState<{ quote: any; customerName: string; recipientEmail: string; subject: string; body: string } | null>(null);
  const [creditHoldResult, setCreditHoldResult] = useState<{ result: any; customerName: string; quotation: any } | null>(null);
  const [loadingRecipient, setLoadingRecipient] = useState(false);
  const [sendingQuotation, setSendingQuotation] = useState(false);

  const quotationRows = (data.quotations || []).map((quote: any) => {
    const opportunityId = quote.opportunity_id ?? quote.opportunity;
    const opportunity = (data.opportunities || []).find((item) => String(item.id) === String(opportunityId));
    const customerId = quote.customer_party_id ?? quote.customer_party ?? opportunityPartyId(opportunity);
    const customer = (data.parties || []).find((item) => String(item.id) === String(customerId));
    const linkedOrder = (data.orders || []).find((order: any) => String(order.quotation_id ?? order.quotation) === String(quote.id));
    const documentId = quote.document_id ?? (typeof quote.document === "object" ? quote.document?.id : quote.document);
    const linkedDocument = (data.businessDocuments || []).find((document: any) => String(document.id) === String(documentId));
    const rawDate = quote.quotation_date || quote.issued_at || quote.created_at || quote.document?.created_at || quote.document?.document_date || quote.document_date || linkedDocument?.document_date || linkedDocument?.created_at || null;
    const parsedDate = rawDate ? new Date(rawDate) : null;
    const date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
    return {
      quote,
      opportunity,
      customer,
      customerId: customerId == null ? "" : String(customerId),
      customerName: customer?.display_name || customer?.legal_name || quote.customer_name || "—",
      linkedOrder,
      date,
      code: quote.quotation_code || quote.quotation_number || `Quote ${String(quote.id).slice(0,8)}`,
    };
  });
  const quotationClients = Array.from(new Map(quotationRows
    .filter((row) => row.customerId && row.customerName !== "—")
    .map((row) => [row.customerId, row.customerName] as const)).entries())
    .sort((a, b) => a[1].localeCompare(b[1], "id"));
  const visibleEstimates = (data.estimates || []).filter((estimate: any) => crmPeriod.matches(estimate.created_at || estimate.updated_at));
  const filteredQuotationRows = quotationRows.filter((row) => {
    if (quotationClientFilter && row.customerId !== quotationClientFilter) return false;
    if (!crmPeriod.matches(row.date)) return false;
    const term = quotationSearch.trim().toLocaleLowerCase("id-ID");
    if (!term) return true;
    const status = String(row.quote.status || "DRAFT");
    const orderNumber = row.linkedOrder?.order_number || row.linkedOrder?.id || "";
    return [row.code, row.customerName, row.opportunity?.opportunity_name, status, orderNumber]
      .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(term));
  });

  /**
   * Creates a cost estimate attached to an opportunity with an active customer.
   *
   * The CRM API owns persistence; this handler owns submission feedback, modal lifecycle, and parent refresh.
   */
  const handleCreate = async () => {
    if (!estForm.opportunity) {
      toast.error("Pilih opportunity yang memiliki customer sebelum membuat estimasi untuk quotation.");
      return;
    }
    const directCost = Number(estForm.direct_cost);
    const overheadCost = Number(estForm.overhead_cost);
    const contingencyAmount = Number(estForm.contingency_amount);
    const markupPercent = Number(estForm.markup_percent);
    const taxPercent = Number(estForm.tax_percent);
    if (![directCost, overheadCost, contingencyAmount, markupPercent, taxPercent].every(Number.isFinite)
      || directCost < 0 || overheadCost < 0 || contingencyAmount < 0 || markupPercent < 0 || taxPercent < 0 || taxPercent > 100
      || directCost + overheadCost + contingencyAmount <= 0) {
      toast.error("Total biaya harus lebih dari nol; markup dan pajak harus berupa angka 0–100%.");
      return;
    }
    try {
      await createCostEstimate({ ...estForm, direct_cost: directCost, overhead_cost: overheadCost, contingency_amount: contingencyAmount, markup_percent: markupPercent, tax_percent: taxPercent, opportunity: estForm.opportunity || null });
      toast.success("Cost Estimate dibuat!"); setIsEstModal(false); onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal buat estimate"); }
  };

  const openSendDialog = async (quote: any) => {
    const opportunity = (data.opportunities || []).find((item) => String(item.id) === String(quote.opportunity_id));
    const partyId = opportunity?.customer_party_id || quote.customer_party_id;
    const party = (data.parties || []).find((item) => String(item.id) === String(partyId));
    const customerName = party?.display_name || party?.legal_name || "Pelanggan";
    const quotationCode = quote.quotation_code || quote.quotation_number || `QUO-${String(quote.id).slice(0, 8).toUpperCase()}`;
    const validUntil = quote.valid_until && !Number.isNaN(new Date(quote.valid_until).getTime())
      ? new Date(quote.valid_until).toLocaleDateString("id-ID", { dateStyle: "long" })
      : "";
    const subject = `Penawaran Harga ${quotationCode}`;
    const body = [
      `Yth. ${customerName},`,
      "",
      "Terima kasih atas kesempatan yang diberikan kepada kami. Bersama email ini kami sampaikan penawaran harga berikut:",
      "",
      `Kode quotation: ${quotationCode}`,
      `Nilai sebelum pajak: ${formatMoney(quote.subtotal ?? quote.total_amount)}`,
      `Pajak: ${formatMoney(quote.tax_amount || 0)}`,
      `Total quotation: ${formatMoney(quote.total_amount)}`,
      ...(quote.estimated_total_cost !== null && quote.estimated_total_cost !== undefined
        ? [`Estimasi HPP: ${formatMoney(quote.estimated_total_cost)}`]
        : []),
      ...(validUntil ? [`Berlaku sampai: ${validUntil}`] : []),
      "",
      "Mohon meninjau penawaran tersebut. Jika Bapak/Ibu menyetujuinya, silakan membalas email ini untuk konfirmasi.",
      "",
      "Apabila ada pertanyaan atau diperlukan penyesuaian, silakan menghubungi kami.",
      "",
      "Hormat kami,",
      "Tim Arsalynk",
    ].join("\n");

    setSendDialog({ quote, customerName, recipientEmail: "", subject, body });
    setLoadingRecipient(Boolean(partyId));
    if (!partyId) return;
    try {
      const contacts = await loadCRMPartyContacts(partyId);
      const emailContact = contacts.find((contact) => contact.primary_contact && contact.email?.trim())
        || contacts.find((contact) => contact.email?.trim());
      if (emailContact?.email) {
        setSendDialog((current) => current && current.quote.id === quote.id ? { ...current, recipientEmail: emailContact.email.trim() } : current);
      }
    } catch {
      // The email remains editable; the user can enter it manually or skip email.
    } finally {
      setLoadingRecipient(false);
    }
  };

  const copyQuotationEmail = async () => {
    if (!sendDialog) return;
    const email = sendDialog.recipientEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Masukkan alamat email pelanggan yang valid sebelum menyalin draft.");
      return;
    }
    try {
      await navigator.clipboard.writeText(`Kepada: ${email}\nSubjek: ${sendDialog.subject}\n\n${sendDialog.body}`);
      toast.success("Draft email disalin. Kirim melalui aplikasi email Anda.");
    } catch {
      toast.error("Draft tidak dapat disalin dari browser ini.");
    }
  };

  const finalizeQuotationSend = async (emailWasSent: boolean) => {
    if (!sendDialog) return;
    setSendingQuotation(true);
    try {
      await sendQuotation(sendDialog.quote.id);
      toast.success(emailWasSent
        ? "Quotation ditandai SENT. Email tetap dikirim manual melalui aplikasi email Anda."
        : "Quotation ditandai SENT tanpa mengirim email dari CRM.");
      setSendDialog(null);
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.error?.message || "Quotation gagal dikirim.");
    } finally {
      setSendingQuotation(false);
    }
  };

/**
 * getQuotActions coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const getQuotActions = (q: any) => {
/**
 * s coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
    const s = (q.status || "").toUpperCase();
    const linkedOrder = (data.orders || []).find((order: any) => String(order.quotation_id ?? order.quotation) === String(q.id));
    if (s === "CONVERTED" || linkedOrder) {
      const orderLabel = linkedOrder?.order_number || (linkedOrder?.id ? `Sales Order ${String(linkedOrder.id).slice(0, 8).toUpperCase()}` : "Sales Order sudah dibuat");
      return <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-800" title="Quotation ini sudah dikonversi. Tidak perlu dikonversi ulang.">{orderLabel}</span>;
    }
    const quotationOpportunity = (data.opportunities || []).find((opportunity: any) => String(opportunity.id) === String(q.opportunity_id));
    const quotationPartyId = quotationOpportunity ? opportunityPartyId(quotationOpportunity) : null;
    const quotationCustomerIsValid = Boolean(quotationPartyId && (data.parties || []).some((party: any) => String(party.id) === String(quotationPartyId) && party.party_type === "CUSTOMER" && party.status === "ACTIVE"));
    if (s === "DRAFT") return <ActionBtn onClick={async () => { await submitQuotationApproval(q.id); toast.success("Submitted!"); onRefresh(); }} label="Minta Approval" small />;
    if (s === "PENDING_APPROVAL") return canApproveQuotation
      ? <ActionBtn onClick={async () => {
          try {
            await approveQuotation(q.id, approvals);
            toast.success("Quotation disetujui.");
            onRefresh();
          } catch (error: any) {
            toast.error(error?.response?.data?.detail || error?.message || "Gagal menyetujui quotation.");
          }
        }} label="Setuju" small />
      : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800" title="Persetujuan quotation hanya dapat dilakukan oleh Direktur.">Menunggu Direktur</span>;
    if (s === "APPROVED") return <ActionBtn onClick={() => openSendDialog(q)} label="Kirim" small />;
    if (s === "SENT") {
      const canAccept = Boolean(quotationOpportunity && quotationCustomerIsValid);
      return <ActionBtn
        onClick={async () => { await acceptQuotation(q.id); toast.success("Keputusan customer dicatat: quotation diterima."); onRefresh(); }}
        label="Catat Diterima"
        small
        disabled={!canAccept}
        title={!canAccept ? "Hubungkan quotation ke opportunity dengan customer aktif sebelum menerima." : "Catat keputusan customer bahwa quotation ini diterima."}
      />;
    }
    if (s === "ACCEPTED") return <ActionBtn
      onClick={async () => {
        try {
          const result = await convertQuotationToOrder(q.id);
          if (result?.handoff?.sales_order_id) {
            toast.success(result.handoff.project_id ? "Quotation dikonversi menjadi Sales Order dan diteruskan ke Project." : "Quotation berhasil dikonversi menjadi Sales Order.");
          } else {
            const customer = (data.parties || []).find((party: any) => String(party.id) === String(quotationPartyId));
            setCreditHoldResult({
              result,
              quotation: q,
              customerName: customer?.display_name || customer?.legal_name || "Pelanggan",
            });
          }
          onRefresh();
        } catch (error: any) {
          toast.error(error?.response?.data?.detail || error?.response?.data?.error?.message || "Quotation gagal dikonversi menjadi Sales Order.");
          onRefresh();
        }
      }}
      label="📦 Konversi ke Order"
      small
      disabled={!quotationOpportunity || !quotationCustomerIsValid}
      title={!quotationOpportunity || !quotationCustomerIsValid ? "Lengkapi customer aktif pada opportunity sebelum konversi." : "Buat Sales Order dari quotation yang sudah diterima. Hasilnya mengikuti pemeriksaan kredit customer."}
    />;
    return <StatusBadge status={s} />;
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {/* Cost Estimates */}
      <div className="card min-w-0 w-full rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-text-primary">Cost Estimating (HPP & Margin)</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-2xs font-bold">{visibleEstimates.length} Estimate</span>
            {!readOnly && (
              <button onClick={() => setIsEstModal(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Estimasi HPP</button>
            )}
          </div>
        </div>
        <CollapsibleGuideline title="Apa itu HPP?" className="mb-3">
            Harga Pokok Penjualan adalah perkiraan biaya untuk memenuhi pesanan: biaya langsung, overhead, dan contingency. Harga penawaran dihitung dari HPP ditambah markup. Angka ini merupakan estimasi, bukan bukti penerimaan uang atau biaya aktual.
        </CollapsibleGuideline>
        <div className="mb-3"><CRMPeriodToolbar filter={crmPeriod} /></div>
        {visibleEstimates.length === 0 ? <EmptyState msg="Tidak ada kalkulasi biaya pada periode ini." /> : (
          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
            {visibleEstimates.map(e => {
              const canManageEstimate = !readOnly && (canEditAll || Boolean(currentUserId && String(e.created_by_id) === currentUserId));
              const lines = (data.estimateLines || []).filter((line: any) => String(line.estimate_id ?? line.estimate) === String(e.id));
              const lineDirect = lines.filter((line: any) => String(line.cost_element || "").toUpperCase() !== "OVERHEAD").reduce((sum: number, line: any) => sum + Number(line.amount || 0), 0);
              const lineOverhead = lines.filter((line: any) => String(line.cost_element || "").toUpperCase() === "OVERHEAD").reduce((sum: number, line: any) => sum + Number(line.amount || 0), 0);
              const directCost = lines.length ? lineDirect : Number(e.direct_cost || 0);
              const overheadCost = lines.length ? lineOverhead : Number(e.overhead_cost || 0);
              const contingency = Number(e.contingency_amount || 0);
              const totalCost = Number(e.total_cost ?? (directCost + overheadCost + contingency));
              const markupPercent = Number(e.markup_percent || 0);
              const offered = Number(e.offered_amount ?? e.offered_price ?? (totalCost * (1 + markupPercent / 100)));
              const taxPercent = Number(e.tax_percent || 0);
              const taxAmount = offered * taxPercent / 100;
              const markupAmount = Number(e.margin_amount ?? (offered - totalCost));
              const marginPercent = Number(e.margin_percent ?? (offered > 0 ? markupAmount / offered * 100 : 0));
              const isCalculated = ["CALCULATED", "QUOTED"].includes(String(e.status || "").toUpperCase());
              const isEstimateLocked = String(e.status || "").toUpperCase() === "QUOTED";
              return (
                <div key={e.id} className="flex flex-col gap-3 rounded-xl border border-text-tertiary/60 p-4">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-text-primary">Cost Estimate {String(e.estimate_number || e.id).slice(0,12)}</div>
                      <div className="mt-1 text-sm leading-5 text-text-secondary">
                        HPP: <b>{formatMoney(totalCost)}</b> · Markup: <b>{markupPercent}%</b> · Sebelum pajak: <b className="text-brand-green">{formatMoney(offered)}</b> · Total: <b>{formatMoney(offered + taxAmount)}</b>
                      </div>
                      <StatusBadge status={e.status || "DRAFT"} />
                    </div>
                    {canManageEstimate && (
                      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                        <ActionBtn
                          onClick={async () => {
                            setCalculatingEstimateId(String(e.id));
                            try {
                              await calculateCostEstimate(e.id);
                              toast.success("HPP dihitung. Rincian hasil tampil di bawah estimate.");
                              onRefresh();
                            } catch (error: any) {
                              toast.error(error?.response?.data?.detail || error?.message || "HPP gagal dihitung. Periksa baris biaya dan coba lagi.");
                            } finally {
                              setCalculatingEstimateId(null);
                            }
                          }}
                          label={calculatingEstimateId === String(e.id) ? "Menghitung…" : "Hitung HPP"}
                          small
                          variant="ghost"
                          disabled={calculatingEstimateId === String(e.id) || isEstimateLocked}
                          title={isEstimateLocked ? "Estimate sudah terikat quotation; hitung ulang tanpa revisi dapat membuat nilai dokumen berbeda." : "Jumlahkan seluruh biaya langsung, overhead, dan contingency; hitung harga penawaran dari markup."}
                        />
                        <ActionBtn onClick={async () => {
                          try {
                            const result = await createQuotationFromEstimate(e.id);
                            toast.success(result?.created === false
                              ? `Quotation sudah ada dengan status ${result.status}. Untuk mengubah nilai, buat revisi baru.`
                              : "Draft quotation berhasil dibuat. Lanjutkan dengan persetujuan, kirim ke pelanggan, lalu catat keputusannya.");
                            onRefresh();
                          } catch (error: any) {
                            toast.error(error?.response?.data?.detail || error?.response?.data?.message || "Quotation belum berhasil dibuat. Periksa status estimasi dan data pelanggan, lalu coba lagi.");
                          }
                        }} label="📄 Buat Quotation" small title="Buat dokumen penawaran dari hasil estimasi ini; quotation masih perlu approval dan keputusan customer." />
                        <button
                          onClick={async () => {
                            if (isEstimateLocked) return;
                            if (!confirm("Hapus estimasi biaya ini?")) return;
                            try {
                              await deleteCostEstimate(e.id);
                              toast.success("Estimasi biaya berhasil dihapus.");
                              onRefresh();
                            } catch (error: any) {
                              toast.error(error?.response?.data?.detail || error?.response?.data?.message || "Estimasi biaya belum terhapus. Muat ulang data dan coba lagi.");
                            }
                          }}
                          disabled={isEstimateLocked}
                          className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
                          title={isEstimateLocked ? "Estimasi ini sudah digunakan pada quotation dan tidak dapat dihapus." : "Hapus estimasi biaya"}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={cn("rounded-xl border p-4 sm:p-5", isCalculated ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50")}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-text-primary">{isCalculated ? "Rincian hasil HPP" : "Rincian biaya — belum dihitung"}</h4>
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-text-secondary">Markup {markupPercent}%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="rounded-lg border border-white/80 bg-white/75 p-3">
                        <span className="block text-xs font-medium text-text-secondary">Biaya langsung</span>
                        <b className="mt-1 block text-base font-bold text-text-primary sm:text-lg">{formatMoney(directCost)}</b>
                      </div>
                      <div className="rounded-lg border border-white/80 bg-white/75 p-3">
                        <span className="block text-xs font-medium text-text-secondary">Overhead</span>
                        <b className="mt-1 block text-base font-bold text-text-primary sm:text-lg">{formatMoney(overheadCost)}</b>
                      </div>
                      <div className="rounded-lg border border-white/80 bg-white/75 p-3">
                        <span className="block text-xs font-medium text-text-secondary">Contingency</span>
                        <b className="mt-1 block text-base font-bold text-text-primary sm:text-lg">{formatMoney(contingency)}</b>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-white p-3">
                        <span className="block text-xs font-semibold text-emerald-800">Total HPP</span>
                        <b className="mt-1 block text-lg font-extrabold text-emerald-800 sm:text-xl">{formatMoney(totalCost)}</b>
                      </div>
                    </div>
                    {isEstimateLocked && (
                      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        Estimasi ini sudah digunakan pada quotation. Penghapusan dikunci untuk menjaga riwayat; buat revisi estimasi jika nilainya perlu diubah.
                      </p>
                    )}
                    {!isCalculated && <p className="mt-3 text-xs leading-5 text-amber-800">Klik “Hitung HPP” untuk menyimpan hasil hitung. Pastikan biaya langsung atau baris biaya sudah diisi.</p>}

                    <details className="group mt-3 border-t border-black/5 pt-2.5">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-text-secondary marker:hidden">
                        <span>Lihat rincian biaya dan perhitungan</span>
                        <ChevronDown size={15} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="mt-3 space-y-3 text-xs leading-5 text-text-secondary">
                        {lines.length > 0 && (
                          <div className="border-b border-black/5 pb-3">
                            <div className="mb-1.5 text-xs font-semibold text-text-primary">Baris pembentuk HPP</div>
                            <div className="space-y-1.5">
                              {lines.map((line: any) => (
                                <div key={line.id} className="flex items-start justify-between gap-3">
                                  <span className="min-w-0">{line.description || line.cost_element || "Biaya"} <span className="text-text-tertiary">· {line.cost_element || "DIRECT"}{line.quantity != null && line.unit_cost != null ? ` · ${line.quantity} × ${formatMoney(line.unit_cost)}` : ""}</span></span>
                                  <b className="shrink-0 text-text-primary">{formatMoney(line.amount || 0)}</b>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <p>HPP = {formatMoney(directCost)} + {formatMoney(overheadCost)} + {formatMoney(contingency)} = <b className="text-text-primary">{formatMoney(totalCost)}</b></p>
                          <p>Penawaran sebelum pajak = HPP × (1 + {markupPercent}%) = <b className="text-brand-green">{formatMoney(offered)}</b></p>
                          <p>Pajak {taxPercent}% = <b className="text-text-primary">{formatMoney(taxAmount)}</b> · Total quotation = <b className="text-brand-green">{formatMoney(offered + taxAmount)}</b></p>
                          <p>Selisih kotor sebelum pajak: <b className="text-text-primary">{formatMoney(markupAmount)}</b> ({marginPercent.toFixed(1)}% dari harga penawaran)</p>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quotations */}
      <div className="card min-w-0 w-full rounded-xl p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-text-primary">Sales Quotations</h3>
            <p className="mt-0.5 text-xs text-text-secondary">Cari, saring, dan tinjau quotation dalam satu tabel.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{filteredQuotationRows.length} / {(data.quotations||[]).length} dokumen</span>
        </div>
        {(data.quotations||[]).length === 0 ? <EmptyState msg="Belum ada quotation." /> : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-text-tertiary/50 bg-slate-50/70 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(170px,1fr)_minmax(150px,.8fr)_minmax(145px,.8fr)_auto] sm:p-4">
              <label className="min-w-0 text-xs font-medium text-text-secondary">Cari quotation
                <input value={quotationSearch} onChange={(event) => setQuotationSearch(event.target.value)} className="input mt-1 w-full bg-white" placeholder="Kode, klien, status, Sales Order..." />
              </label>
              <label className="min-w-0 text-xs font-medium text-text-secondary">Klien
                <select value={quotationClientFilter} onChange={(event) => setQuotationClientFilter(event.target.value)} className="input mt-1 w-full bg-white">
                  <option value="">Semua klien</option>
                  {quotationClients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2 xl:col-span-3"><CRMPeriodToolbar filter={crmPeriod} /></div>
              <div className="flex items-end">
                <button type="button" onClick={() => { setQuotationSearch(""); setQuotationClientFilter(""); crmPeriod.reset(); }} className="btn-ghost w-full justify-center px-3 py-2 text-xs sm:w-auto">Reset pencarian</button>
              </div>
            </div>
            {filteredQuotationRows.length === 0 ? <EmptyState msg="Tidak ada quotation yang cocok dengan pencarian atau filter." /> : (
              <div className="max-h-[520px] overflow-auto rounded-xl border border-text-tertiary/60">
                <table className="w-full min-w-[920px] border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-text-secondary">
                    <tr>
                      <th className="px-4 py-3">Kode Quotation</th>
                      <th className="px-4 py-3">Klien</th>
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3 text-right">Sebelum Pajak</th>
                      <th className="px-4 py-3 text-right">Pajak</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-text-tertiary/40 bg-white">
                    {filteredQuotationRows.map(({ quote: q, opportunity, customerName, date, linkedOrder, code }) => {
                      const isConverted = String(q.status || "DRAFT").toUpperCase() === "CONVERTED" || Boolean(linkedOrder);
                      const canManageQuotation = !readOnly && (canEditAll || Boolean(currentUserId && (String(q.created_by_id) === currentUserId || String(opportunity?.created_by_id) === currentUserId)));
                      const orderLabel = linkedOrder?.order_number || (linkedOrder?.id ? `Sales Order ${String(linkedOrder.id).slice(0, 8).toUpperCase()}` : "Sudah menjadi Order");
                      return (
                        <tr key={q.id} className="transition-colors hover:bg-blue-50/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text-primary">{code}</span>
                              {(q.quotation_code || q.quotation_number) && <button type="button" title="Salin kode quotation" onClick={async () => { try { await navigator.clipboard.writeText(String(q.quotation_code || q.quotation_number)); toast.success("Kode quotation disalin."); } catch { toast.error("Kode quotation tidak dapat disalin."); } }} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-text-tertiary/50 px-2 py-1 text-2xs text-text-secondary hover:text-brand-green"><Copy size={12} />Salin</button>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-text-primary">{customerName}</td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{date ? date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                          <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatMoney(q.subtotal ?? q.total_amount)}</td>
                          <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatMoney(q.tax_amount || 0)}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-text-primary">{formatMoney(q.total_amount)}</td>
                          <td className="px-4 py-3">{isConverted
                            ? <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800" title="Quotation sudah menjadi Sales Order.">Sudah menjadi Order</span>
                            : <StatusBadge status={q.status || "DRAFT"} />}</td>
                          <td className="px-4 py-3 text-right">{canManageQuotation ? getQuotActions(q) : isConverted ? <span className="whitespace-nowrap text-xs font-medium text-emerald-700">{orderLabel}</span> : readOnly ? null : <span className="text-2xs text-text-secondary">Dibuat pengguna lain</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {quotationRows.some((row) => !row.date) && <p className="mt-2 text-xs text-text-secondary">Sebagian quotation tidak memiliki tanggal, sehingga tidak dapat dikelompokkan menurut periode.</p>}
          </>
        )}
      </div>

      {/* Modal: Buat Estimasi HPP */}
      <Modal isOpen={isEstModal} onClose={() => setIsEstModal(false)} title="Buat Estimasi HPP" size="md">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Opportunity dengan customer aktif *</label>
            <select
              className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white"
              value={estForm.opportunity}
              onChange={e => setEstForm(f => ({...f, opportunity: e.target.value}))}
            >
              <option value="">-- Pilih Opportunity --</option>
              {(data.opportunities || []).filter((opportunity: any) => {
                if (!canEditAll && String(opportunity.created_by_id) !== String(currentUserId || "")) return false;
                const partyId = opportunityPartyId(opportunity);
                return partyId && (data.parties || []).some((party: any) => String(party.id) === String(partyId) && party.party_type === "CUSTOMER" && party.status === "ACTIVE");
              }).map(o => (
                <option key={o.id} value={String(o.id)}>
                  {o.opportunity_name || `Opp #${o.id}`} ({formatMoney(o.expected_amount)})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Biaya Langsung (Rp)</label>
              <IDRInput aria-label="Biaya langsung dalam rupiah" value={estForm.direct_cost} onChange={(digits) => setEstForm((current) => ({ ...current, direct_cost: digits }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Biaya Overhead (Rp)</label>
              <IDRInput aria-label="Biaya overhead dalam rupiah" value={estForm.overhead_cost} onChange={(digits) => setEstForm((current) => ({ ...current, overhead_cost: digits }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Contingency / cadangan biaya (Rp)</label>
            <IDRInput aria-label="Contingency dalam rupiah" value={estForm.contingency_amount} onChange={(digits) => setEstForm((current) => ({ ...current, contingency_amount: digits }))} />
            <p className="mt-1 text-[10px] leading-4 text-text-secondary">Cadangan ini akan dimasukkan ke total quotation sebagai baris biaya tersendiri.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Markup %</label>
            <input type="number" min="0" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={estForm.markup_percent} onFocus={e => { if (e.currentTarget.value === "0") setEstForm(f => ({ ...f, markup_percent: "" })); }} onBlur={e => { if (e.currentTarget.value === "") setEstForm(f => ({ ...f, markup_percent: "0" })); }} onChange={e => setEstForm(f => ({...f, markup_percent: e.target.value}))} />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Pajak penjualan % (0 bila tidak dikenakan)</label>
            <input type="number" min="0" max="100" step="0.01" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={estForm.tax_percent} onChange={e => setEstForm(f => ({...f, tax_percent: e.target.value}))} />
            <p className="mt-1 text-[10px] leading-4 text-text-secondary">Pastikan tarif sesuai kebijakan pajak perusahaan. Pajak dihitung dari nilai penawaran sebelum pajak.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Deskripsi biaya langsung</label>
            <input type="text" maxLength={255} className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={estForm.description} onChange={e => setEstForm(f => ({...f, description: e.target.value}))} placeholder="Biaya material / pekerjaan" />
          </div>
          <div className="p-3 rounded-xl bg-brand-light-green text-xs">
            {(() => {
              const totalHpp = Number(estForm.direct_cost || 0) + Number(estForm.overhead_cost || 0) + Number(estForm.contingency_amount || 0);
              const offer = totalHpp * (1 + Number(estForm.markup_percent || 0) / 100);
              const tax = offer * Number(estForm.tax_percent || 0) / 100;
              return <><b>Total HPP:</b> {formatMoney(totalHpp)} &nbsp;|&nbsp; <b>Penawaran sebelum pajak:</b> {formatMoney(offer)} &nbsp;|&nbsp; <b>Pajak:</b> {formatMoney(tax)} &nbsp;|&nbsp; <b>Total quotation:</b> {formatMoney(offer + tax)}</>;
            })()}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setIsEstModal(false)} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} disabled={!estForm.opportunity} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">Buat Estimasi</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(sendDialog)}
        onClose={() => sendingQuotation ? undefined : setSendDialog(null)}
        title="Kirim quotation ke pelanggan"
        subtitle="Periksa alamat tujuan dan salin draft email. CRM tidak mengirim email secara otomatis."
        size="lg"
      >
        {sendDialog && <div className="space-y-4">
          <CollapsibleGuideline title="Sebelum menyalin draft quotation">
            Draft mencantumkan nilai penawaran dan estimasi HPP yang tersimpan pada quotation. Periksa isinya sebelum dikirim; CRM hanya menyiapkan dan menyalin draft.
          </CollapsibleGuideline>
          <label className="block text-xs font-semibold text-text-secondary">
            Email pelanggan
            <input
              type="email"
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-text-tertiary px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-green"
              value={sendDialog.recipientEmail}
              onChange={(event) => setSendDialog((current) => current ? { ...current, recipientEmail: event.target.value } : current)}
              placeholder={loadingRecipient ? "Mencari email dari kontak pelanggan…" : "nama@perusahaan.com"}
              disabled={sendingQuotation}
            />
            <span className="mt-1 block font-normal text-text-secondary">
              {loadingRecipient
                ? "Sedang mencari kontak utama dari customer pada Opportunity."
                : sendDialog.recipientEmail
                  ? `Email ditemukan untuk ${sendDialog.customerName}. Anda dapat mengubahnya sebelum menyalin.`
                  : "Email tidak ditemukan. Masukkan email pelanggan secara manual, atau lewati email."}
            </span>
          </label>
          <label className="block text-xs font-semibold text-text-secondary">
            Subjek email
            <input
              className="mt-1.5 w-full rounded-lg border border-text-tertiary px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-green"
              value={sendDialog.subject}
              onChange={(event) => setSendDialog((current) => current ? { ...current, subject: event.target.value } : current)}
              disabled={sendingQuotation}
            />
          </label>
          <label className="block text-xs font-semibold text-text-secondary">
            Isi email
            <textarea
              rows={12}
              className="mt-1.5 w-full resize-y rounded-lg border border-text-tertiary px-3 py-2.5 text-sm leading-6 text-text-primary outline-none focus:border-brand-green"
              value={sendDialog.body}
              onChange={(event) => setSendDialog((current) => current ? { ...current, body: event.target.value } : current)}
              disabled={sendingQuotation}
            />
          </label>
          <div className="flex flex-col-reverse gap-2 border-t border-text-tertiary/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <button onClick={() => setSendDialog(null)} disabled={sendingQuotation} className="btn-ghost">Batal</button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button onClick={() => void finalizeQuotationSend(false)} disabled={sendingQuotation} className="btn-ghost">
                {sendingQuotation ? "Memproses…" : "Lewati email & lanjutkan"}
              </button>
              <button
                onClick={() => void copyQuotationEmail()}
                disabled={sendingQuotation || loadingRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendDialog.recipientEmail.trim()) || !sendDialog.subject.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-text-tertiary px-3 py-2 text-sm font-semibold text-text-primary hover:bg-gray-50 disabled:opacity-50"
              >
                <Copy size={15}/>Salin draft email
              </button>
              <button
                onClick={() => void finalizeQuotationSend(true)}
                disabled={sendingQuotation || loadingRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendDialog.recipientEmail.trim()) || !sendDialog.subject.trim()}
                className="btn-primary"
              >
                {sendingQuotation ? "Memproses…" : "Email sudah dikirim"}
              </button>
            </div>
          </div>
          <p className="text-right text-[11px] leading-5 text-text-secondary">Tombol lanjut mengubah status quotation menjadi SENT. Untuk opsi email, salin draft, kirim melalui aplikasi email, lalu pilih “Email sudah dikirim”.</p>
        </div>}
      </Modal>
      <Modal
        isOpen={Boolean(creditHoldResult)}
        onClose={() => setCreditHoldResult(null)}
        title="Sales Order belum dibuat"
        subtitle={creditHoldResult ? `Pemeriksaan kredit untuk ${creditHoldResult.customerName}` : undefined}
        size="md"
      >
        {creditHoldResult && (() => {
          const evaluation = creditHoldResult.result?.credit_evaluation;
          const proformaId = creditHoldResult.result?.handoff?.proforma_invoice_id;
          const quotationAmount = Number(creditHoldResult.quotation?.total_amount ?? creditHoldResult.quotation?.subtotal ?? 0);
          const reasons = [
            (Number(evaluation?.credit_limit ?? 0) <= 0 || evaluation?.credit_status === "NO_LIMIT") && "Limit kredit customer belum diatur.",
            evaluation?.credit_status === "HOLD" && "Status kredit customer sedang ditahan.",
            evaluation && Number(evaluation.available_credit ?? 0) < quotationAmount && "Nilai quotation melebihi sisa limit kredit.",
            Number(evaluation?.overdue_amount ?? 0) > 0 && "Customer masih memiliki piutang yang jatuh tempo.",
          ].filter(Boolean) as string[];
          return (
            <div className="space-y-4 p-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-700" />
                <div>
                  <p className="font-semibold">Konversi dihentikan oleh pemeriksaan kredit.</p>
                  <p className="mt-1 text-xs leading-5">Sales Order belum dibuat. Sistem menyiapkan proforma agar tim Finance dapat menindaklanjuti transaksi ini.</p>
                </div>
              </div>

              {evaluation && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-text-tertiary/60 p-2.5"><span className="text-text-secondary">Nilai quotation</span><strong className="mt-1 block">{formatMoney(quotationAmount)}</strong></div>
                  <div className="rounded-lg border border-text-tertiary/60 p-2.5"><span className="text-text-secondary">Limit kredit</span><strong className="mt-1 block">{formatMoney(evaluation.credit_limit)}</strong></div>
                  <div className="rounded-lg border border-text-tertiary/60 p-2.5"><span className="text-text-secondary">Sisa kredit</span><strong className="mt-1 block">{formatMoney(evaluation.available_credit)}</strong></div>
                  <div className="rounded-lg border border-text-tertiary/60 p-2.5"><span className="text-text-secondary">Piutang jatuh tempo</span><strong className="mt-1 block">{formatMoney(evaluation.overdue_amount)}</strong></div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-3 text-xs leading-5">
                <p className="font-semibold text-text-primary">Langkah berikutnya</p>
                {reasons.length ? (
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-text-secondary">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                ) : (
                  <p className="mt-1 text-text-secondary">{creditHoldResult.result?.handoff?.note || "Buka Deals & Credit untuk memeriksa limit, status kredit, dan piutang customer; jalankan Hitung ulang jika datanya belum terbaru."}</p>
                )}
                <p className="mt-2 text-text-secondary">Setelah penyebab diperbaiki atau keputusan override disetujui, coba konversi kembali.</p>
              </div>

              {proformaId && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">
                  Referensi proforma: <span className="font-mono font-semibold text-text-primary" title={String(proformaId)}>{String(proformaId).slice(0, 8).toUpperCase()}</span>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-text-tertiary/50 pt-3">
                <button type="button" onClick={() => setCreditHoldResult(null)} className="btn-ghost">Tutup</button>
                <button type="button" onClick={() => { setCreditHoldResult(null); onNavigate("deals"); }} className="btn-primary">Buka Deals &amp; Credit</button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: SUPPORT TICKETS
══════════════════════════════════════════════════ */
/**
 * TabTickets coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TabTickets({ data, onRefresh, onPartyCreated, readOnly = false }: { data: CRMData; onRefresh: () => void; onPartyCreated?: (newParty: any) => void; readOnly?: boolean }) {
  const crmPeriod = useCRMPeriodFilter();
  const [isOpen, setIsOpen] = useState(false);
  const [isQuickPartyOpen, setIsQuickPartyOpen] = useState(false);
  const [domainFilter, setDomainFilter] = useState("");
  const [warrantyDetails, setWarrantyDetails] = useState<Record<string, any>>({});
  const [form, setForm] = useState({ subject: "", customer_party: "", priority: "NORMAL", description: "", serial_number: "" });
  const ticketDomains = Array.from(new Set((data.cases || []).map((item) => item.origin_domain).filter((value): value is string => Boolean(value)))).sort();
  const visibleCases = (data.cases || []).filter((item) => crmPeriod.matches(item.created_at || item.updated_at) && (!domainFilter || item.origin_domain === domainFilter));

  /**
   * Creates a support ticket after enforcing the required subject.
   *
   * The optional customer relationship is normalized to null for the backend contract. Success closes the modal and refreshes CRM state.
   */
  const handleCreate = async () => {
    if (!form.subject.trim()) { toast.error("Subject wajib diisi."); return; }
    try {
      await createSupportTicket({ ...form, customer_party: form.customer_party || null });
      toast.success("Tiket dibuat!"); setIsOpen(false); onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal buat tiket"); }
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className="card min-w-0 w-full rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold">Tiket Support & Klaim Garansi</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-2xs font-bold">{visibleCases.length} Tiket</span>
            <select aria-label="Filter domain tiket" className="rounded-lg border border-text-tertiary bg-white px-2 py-1.5 text-xs" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}><option value="">Semua domain</option>{ticketDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select>
            {!readOnly && (
              <button onClick={() => setIsOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Tiket Baru</button>
            )}
          </div>
        </div>
        <div className="mb-3"><CRMPeriodToolbar filter={crmPeriod} /></div>
        {visibleCases.length === 0 ? <EmptyState msg={domainFilter ? "Tidak ada tiket dari domain ini." : "Belum ada tiket support."} /> : (
          <div className="max-h-[520px] overflow-auto rounded-xl border border-text-tertiary/60">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-text-secondary">
                <tr>
                  <th className="px-3 py-3">Tiket</th>
                  <th className="px-3 py-3">Customer &amp; Prioritas</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-tertiary/40 bg-white">
                {visibleCases.map(c => {
              const resolved = ["RESOLVED","CLOSED"].includes((c.status||"").toUpperCase());
/**
 * cust coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
              const cust = (data.parties||[]).find(p => String(p.id) === String(c.customer_party));
              return (
                <tr key={c.id} className="align-top transition-colors hover:bg-blue-50/30">
                  <td className="px-3 py-3">
                    <div className="max-w-[290px] break-words text-sm font-semibold leading-5 text-text-primary">{c.subject || `Tiket ${String(c.id).slice(0,8)}`}</div>
                    <div className="mt-1 text-2xs text-text-secondary">ID {String(c.id).slice(0, 8).toUpperCase()}</div>
                    {c.origin_domain && <div className="mt-1"><OriginDomainBadge domain={c.origin_domain} /></div>}
                    {warrantyDetails[String(c.id)] && <details className="mt-2 max-w-[320px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                      <summary className="cursor-pointer font-semibold">Riwayat garansi &amp; servis</summary>
                      <div className="mt-2 space-y-2">
                        <div>Pengiriman produk: {warrantyDetails[String(c.id)].delivered_at ? new Date(warrantyDetails[String(c.id)].delivered_at).toLocaleDateString("id-ID") : "Belum ditemukan"}</div>
                        <div className="font-medium">Periode garansi</div>
                        {(warrantyDetails[String(c.id)].warranty_periods || []).length ? warrantyDetails[String(c.id)].warranty_periods.map((period: any) => <div key={period.id} className="flex justify-between gap-3"><span>{period.start_date ? new Date(period.start_date).toLocaleDateString("id-ID") : "Awal tidak tercatat"} – {period.end_date ? new Date(period.end_date).toLocaleDateString("id-ID") : "Tanpa tanggal akhir"}</span><span className="font-medium">{period.current_status === "ACTIVE" ? "Aktif" : period.current_status === "UPCOMING" ? "Belum mulai" : period.current_status === "EXPIRED" ? "Berakhir" : "Tidak aktif"}</span></div>) : <div>Belum ada periode garansi yang tercatat untuk produk ini.</div>}
                        <div className="font-medium pt-1">Riwayat perbaikan</div>
                        {(warrantyDetails[String(c.id)].repair_history || []).length ? warrantyDetails[String(c.id)].repair_history.map((work: any) => <div key={work.id}>{new Date(work.created_at).toLocaleDateString("id-ID")} · {work.work_order_type} · {work.status} — {work.description}</div>) : <div>Belum ada work order perbaikan.</div>}
                        {(warrantyDetails[String(c.id)].resolutions || []).map((resolution: any) => <div key={resolution.id}>Penyelesaian: {resolution.resolution_type} — {resolution.resolution_notes}</div>)}
                      </div>
                    </details>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-text-primary">{cust?.display_name || cust?.legal_name || "Customer"}</div>
                    <div className="mt-1 text-xs text-text-secondary">Prioritas <b className="text-text-primary">{c.priority || "NORMAL"}</b></div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={c.status || "OPEN"} />
                    {c.warranty_status && <div className="mt-1"><span className={cn("inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold", c.warranty_status === "WARRANTY_ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{c.warranty_status}</span></div>}
                  </td>
                  <td className="px-3 py-3">
                    {!readOnly ? <div className="flex min-w-[240px] flex-wrap items-center gap-1.5">
                      {!resolved && <ActionBtn onClick={async () => { try { const result = await checkTicketWarrantyStatus(c.id); setWarrantyDetails(current => ({ ...current, [String(c.id)]: result })); toast.success(`Status garansi: ${result.warranty_status}. Periode dan riwayat servis ditampilkan.`); onRefresh(); } catch (e: any) { toast.error(e?.response?.data?.detail || "Pemeriksaan garansi gagal."); } }} label="Periksa garansi" small variant="ghost" />}
                      {c.warranty_status === "WARRANTY_ACTIVE" && !resolved && <ActionBtn onClick={async () => { try { await createServiceWorkOrder(c.id); toast.success("Work Order teknisi dibuat."); onRefresh(); } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal membuat Work Order."); } }} label="Buat Work Order" small />}
                      <button onClick={async () => { if(!confirm("Hapus tiket?")) return; await deleteSupportTicket(c.id); toast.success("Dihapus."); onRefresh(); }} title="Hapus tiket" aria-label={`Hapus tiket ${c.subject || c.id}`} className="rounded-lg p-1.5 text-text-secondary hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                    </div> : <span className="text-xs italic text-text-secondary">{resolved ? "RESOLVED" : c.status || "OPEN"}</span>}
                  </td>
                </tr>
              );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card min-w-0 w-full rounded-xl p-4">
        <h3 className="text-sm font-bold mb-3">Riwayat Solusi & Garansi</h3>
        {(data.resolutions||[]).length === 0 ? <EmptyState msg="Belum ada resolusi tercatat." /> : (
          <div className="max-h-[520px] overflow-auto rounded-xl border border-text-tertiary/60">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-text-secondary"><tr><th className="px-3 py-3">Jenis Solusi</th><th className="px-3 py-3">Rincian</th></tr></thead>
              <tbody className="divide-y divide-text-tertiary/40 bg-white">
                {(data.resolutions||[]).map(r => <tr key={r.id} className="align-top transition-colors hover:bg-blue-50/30"><td className="px-3 py-3"><StatusBadge status={r.resolution_type || "RESOLVED"} /></td><td className="max-w-[420px] whitespace-normal break-words px-3 py-3 text-sm leading-5 text-text-secondary">{r.resolution_notes || "—"}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Buat Tiket Support Baru" size="md">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Subject *</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="Judul tiket..." />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Nomor seri produk (untuk pemeriksaan garansi)</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.serial_number} onChange={e => setForm(f => ({...f, serial_number: e.target.value}))} placeholder="Nomor seri pada label produk" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-text-secondary">Pilih Pelanggan (Database)</label>
              <button 
                type="button" 
                onClick={() => setIsQuickPartyOpen(true)}
                className="text-2xs font-semibold text-brand-green hover:underline flex items-center gap-1"
              >
                <UserPlus size={12} /> + Pelanggan Baru
              </button>
            </div>
            <select
              className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-green"
              value={form.customer_party}
              onChange={e => setForm(f => ({...f, customer_party: e.target.value}))}
            >
              <option value="">-- Pilih Pelanggan --</option>
              {(data.parties || []).map(p => (
                <option key={p.id} value={String(p.id)}>{p.display_name || p.legal_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Prioritas</label>
            <select className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-green" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
              {["LOW", "NORMAL", "HIGH", "URGENT"].map(priority => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Deskripsi</label>
            <textarea rows={3} className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setIsOpen(false)} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} className="btn-primary">Buat Tiket</button>
          </div>
        </div>
      </Modal>

      <QuickAddPartyModal
        isOpen={isQuickPartyOpen}
        onClose={() => setIsQuickPartyOpen(false)}
        onSuccess={(newParty) => {
          if (onPartyCreated) onPartyCreated(newParty);
          setForm(f => ({ ...f, customer_party: String(newParty.id) }));
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: INCOMING INQUIRY
══════════════════════════════════════════════════ */
/**
 * TabIncoming coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TabIncoming({
  data, onRefresh, onPartyCreated, readOnly = false, canDelete = false,
  canDelegate = false, canEdit = false, canEditAll = false, currentUserId, onOpenDelegate, onOpenStageDetail, teamUsers = [],
}: {
  data: CRMData; onRefresh: () => void; onPartyCreated?: (newParty: any) => void; readOnly?: boolean; canDelete?: boolean; canEdit?: boolean; canEditAll?: boolean; currentUserId?: string;
  canDelegate?: boolean;
  onOpenDelegate?: (record: any, recordType: "INQUIRY" | "OPPORTUNITY") => void;
  onOpenStageDetail?: (record: any, recordType: "LEAD" | "OPPORTUNITY") => void;
  teamUsers?: any[];
}) {
  const crmPeriod = useCRMPeriodFilter();
  const [isOpen, setIsOpen] = useState(false);
  const [isQuickPartyOpen, setIsQuickPartyOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", customer_name: "", customer_email: "", customer_phone: "", party_type: "CUSTOMER", customer_party: "", contact_id: "", description: "" });
  const [inquiryContactOptions, setInquiryContactOptions] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [domainFilter, setDomainFilter] = useState("");
  const [followUpLead, setFollowUpLead] = useState<any>(null);
  const [followUpDraft, setFollowUpDraft] = useState({ date: "", note: "" });
  const [contactLead, setContactLead] = useState<any>(null);
  const [contactTarget, setContactTarget] = useState<"CONTACTED" | "RESPONDED">("CONTACTED");
  const [contactNote, setContactNote] = useState("");
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [linkingInquiry, setLinkingInquiry] = useState<any | null>(null);
  const [linkCustomerId, setLinkCustomerId] = useState("");
  const [linkContactId, setLinkContactId] = useState("");
  const [linkContactOptions, setLinkContactOptions] = useState<any[]>([]);
  const [linkCustomerSaving, setLinkCustomerSaving] = useState(false);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ subject: "", customer_name: "", customer_email: "", customer_phone: "", description: "" });
  const [editSaving, setEditSaving] = useState(false);
  const inquiryDomains = Array.from(new Set((data.inquiries || []).map((item) => item.origin_domain).filter((value): value is string => Boolean(value)))).sort();
  const visibleInquiries = (data.inquiries || [])
    .filter((item) => crmPeriod.matches(item.created_at || item.submitted_at || item.updated_at))
    .filter((item) => !domainFilter || item.origin_domain === domainFilter)
    .slice()
    .sort((a, b) => {
      const dateA = new Date(a.created_at || a.submitted_at || a.updated_at || 0).getTime();
      const dateB = new Date(b.created_at || b.submitted_at || b.updated_at || 0).getTime();
      return dateB - dateA;
    });

  /**
   * Creates a customer inquiry from the validated intake form.
   *
   * Subject and customer name are mandatory business identifiers. The submission guard prevents duplicate clicks while the API request is active.
   */
  const handleCreate = async () => {
    if (!form.subject.trim() || !form.customer_name.trim()) { 
      toast.error("Subject & nama customer wajib diisi."); 
      return; 
    }
    if (!normalizeOptionalCustomerEmail(form.customer_email) && !form.customer_phone.trim()) {
      toast.error("Isi email atau nomor telepon kontak. Nama PIC boleh dikosongkan.");
      return;
    }
    setIsSubmitting(true);
    try { 
      const payload = {
        subject: form.subject.trim(),
        customer_name: form.customer_name.trim(),
        customer_email: form.customer_email?.trim() || undefined,
        customer_phone: form.customer_phone?.trim() || undefined,
        customer_party: form.customer_party ? form.customer_party : null,
        contact_id: form.contact_id || null,
        description: form.description?.trim() || "",
      };
      await createCustomerInquiry(payload); 
      toast.success("Inquiry berhasil dibuat!"); 
      setIsOpen(false); 
      setForm({ subject: "", customer_name: "", customer_email: "", customer_phone: "", party_type: "CUSTOMER", customer_party: "", contact_id: "", description: "" });
      setInquiryContactOptions([]);
      onRefresh(); 
    }
    catch (e: any) { 
      toast.error(e?.response?.data?.detail || e?.message || "Gagal membuat inquiry"); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateLeadStatus = (lead: any, status: "CONTACTED" | "RESPONDED") => {
    setContactLead(lead);
    setContactTarget(status);
    setContactNote("");
  };

  const submitLeadContact = async () => {
    if (!contactLead) return;
    setSavingLeadId(String(contactLead.id));
    try {
      await updateCRMInquiryLeadStatus(contactLead.id, { status: contactTarget, note: contactNote.trim() });
      setContactLead(null);
      toast.success(contactTarget === "CONTACTED" ? "Kontak lead tercatat." : "Respons lead tercatat.");
      onRefresh();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Status lead gagal diperbarui."); }
    finally { setSavingLeadId(null); }
  };

  const submitLeadFollowUp = async () => {
    if (!followUpLead || !followUpDraft.date || !followUpDraft.note.trim()) { toast.error("Tanggal dan alasan tindak lanjut wajib diisi."); return; }
    setSavingLeadId(String(followUpLead.id));
    try {
      await updateCRMInquiryLeadStatus(followUpLead.id, {
        status: "FOLLOW_UP", next_follow_up_at: new Date(`${followUpDraft.date}T12:00:00`).toISOString(), note: followUpDraft.note.trim(),
      });
      setFollowUpLead(null);
      toast.success("Lead dijadwalkan untuk dihubungi kembali.");
      onRefresh();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Follow-up lead gagal dijadwalkan."); }
    finally { setSavingLeadId(null); }
  };

  const openLinkCustomer = (inquiry: any) => {
    setLinkingInquiry(inquiry);
    setLinkCustomerId("");
    setLinkContactId("");
    setLinkContactOptions([]);
  };

  const handleLinkCustomerChange = async (partyId: string) => {
    setLinkCustomerId(partyId);
    setLinkContactId("");
    setLinkContactOptions([]);
    if (!partyId) return;
    try { setLinkContactOptions(await loadCRMPartyContacts(partyId)); }
    catch { toast.error("PIC customer gagal dimuat."); }
  };

  const submitLinkCustomer = async () => {
    if (!linkingInquiry || !linkCustomerId) return;
    setLinkCustomerSaving(true);
    try {
      await linkInquiryCustomer(linkingInquiry.id, linkCustomerId, linkContactId || null);
      toast.success("Customer dan PIC berhasil ditautkan ke Inquiry.");
      setLinkingInquiry(null);
      onRefresh();
    } catch (error: any) { toast.error(error?.response?.data?.detail || "Customer tidak dapat ditautkan."); }
    finally { setLinkCustomerSaving(false); }
  };

  const handleInquiryPartySelect = async (partyId: string) => {
    const party = (data.parties || []).find((item) => String(item.id) === partyId);
    setForm((current) => ({
      ...current,
      customer_party: partyId,
      contact_id: "",
      customer_name: party ? (party.display_name || party.legal_name || current.customer_name) : current.customer_name,
      customer_email: partyId ? "" : current.customer_email,
      customer_phone: partyId ? "" : current.customer_phone,
    }));
    setInquiryContactOptions([]);
    if (!partyId) return;
    try {
      setInquiryContactOptions(await loadCRMPartyContacts(partyId));
    } catch {
      toast.error("Kontak customer gagal dimuat. Inquiry tetap dapat disimpan tanpa memilih PIC.");
    }
  };

  const handleDeleteLead = async (lead: any) => {
    const customer = lead.customer_name || "Lead ini";
    if (!window.confirm(`Hapus lead ${customer}? Spesifikasi dan estimasi yang belum menjadi penawaran akan ikut dihapus. Data customer dan riwayat percakapan tetap disimpan. Lead yang sudah menjadi Opportunity atau memiliki quotation tidak dapat dihapus.`)) return;
    setSavingLeadId(String(lead.id));
    try {
      await deleteCustomerInquiry(lead.id);
      toast.success("Lead berhasil dihapus. Data customer dan riwayat percakapan tetap tersimpan.");
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || "Lead tidak dapat dihapus.");
    } finally {
      setSavingLeadId(null);
    }
  };

  const openEditLead = (lead: any) => {
    setEditingLead(lead);
    setEditForm({ subject: lead.subject || "", customer_name: lead.customer_name || "", customer_email: normalizeOptionalCustomerEmail(lead.customer_email), customer_phone: lead.customer_phone || "", description: lead.description || "" });
  };

  const saveLeadEdit = async () => {
    if (!editingLead) return;
    if (!editForm.subject.trim() || !editForm.customer_name.trim()) { toast.error("Subject dan nama customer wajib diisi."); return; }
    const customerEmail = normalizeOptionalCustomerEmail(editForm.customer_email);
    const customerPhone = editForm.customer_phone.trim();
    if (!customerEmail && !customerPhone) { toast.error("Isi minimal email atau nomor telepon kontak."); return; }
    setEditSaving(true);
    try {
      await updateCustomerInquiry(editingLead.id, { ...editForm, customer_email: customerEmail, customer_phone: customerPhone });
      toast.success("Data Lead berhasil diperbarui.");
      setEditingLead(null);
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Data Lead belum dapat diperbarui.");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="card rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div><h3 className="text-sm font-bold">Lead & Inquiry</h3><p className="mt-0.5 text-xs text-text-secondary">Inquiry menjadi catatan awal lead; setelah dihubungi, customer ditautkan sebelum dikualifikasi ke Opportunity.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-2xs font-bold">{(data.inquiries||[]).filter(item => crmPeriod.matches(item.created_at || item.submitted_at || item.updated_at) && ["NEW", "CONTACTED", "RESPONDED", "FOLLOW_UP"].includes(String(item.status || "NEW").toUpperCase())).length} Lead aktif</span>
          <select aria-label="Filter domain inquiry" className="rounded-lg border border-text-tertiary bg-white px-2 py-1.5 text-xs" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}><option value="">Semua domain</option>{inquiryDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select>
          {!readOnly && (
            <button onClick={() => setIsOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Inquiry Baru</button>
          )}
        </div>
      </div>
      <div className="mb-3"><CRMPeriodToolbar filter={crmPeriod} /></div>
      {visibleInquiries.length === 0 ? <EmptyState msg={domainFilter ? "Tidak ada inquiry dari domain ini." : "Belum ada incoming inquiry."} /> : (
        <div className="flex flex-col gap-2">
          {visibleInquiries.map(x => {
/**
 * isQual coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
            const leadStatus = String(x.status || "NEW").toUpperCase();
            const isQual = leadStatus === "QUALIFIED";
            const hasLinkedOpportunity = Boolean(x.opportunity_id) || (data.opportunities || []).some((opportunity: any) =>
              String(opportunity.id) === String(x.opportunity_id || "") ||
              String(opportunity.source_inquiry_id || opportunity.lead_id || "") === String(x.id)
            );
            const needsOpportunityRepair = isQual && !hasLinkedOpportunity;
            const linkedParty = (data.parties || []).find((party: any) => String(party.id) === String(x.customer_party_id));
            const linkedPartyType = String(linkedParty?.party_type || "").toUpperCase();
            const canHandleThisLead = canEdit && (canEditAll || Boolean(currentUserId && String(x.created_by_id) === currentUserId));
/**
 * reqs coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
            const reqs = (data.requirements||[]).filter(r => String(r.inquiry) === String(x.id));
            return (
              <div key={x.id} className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50/40 p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-2xs font-bold text-sky-800"><Inbox size={11} />🔍 Tahap Kualifikasi Lead</span>
                    <span className="text-2xs text-text-secondary">Masuk {formatDate(x.created_at || x.submitted_at || x.updated_at)}</span>
                    {x.owner_user_id && (
                      <span className="rounded bg-white border border-sky-200 px-1.5 py-0.5 text-2xs font-semibold text-sky-900">
                        PIC: {teamUsers.find((u: any) => String(u.id) === String(x.owner_user_id))?.full_name || String(x.owner_user_id).slice(0, 8)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold truncate">{x.subject || `Inquiry ${String(x.id).slice(0,8)}`}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    <b>{x.customer_name || "-"}</b> · {[x.customer_email, x.customer_phone].filter(Boolean).join(" · ") || "Kontak belum tersedia"} · <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-2xs">{reqs.length} Spesifikasi</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5"><OriginDomainBadge domain={x.origin_domain} />{!x.origin_domain && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-2xs text-slate-600">Sumber manual</span>}</div>
                  <StatusBadge status={needsOpportunityRepair ? "Opportunity belum tertaut" : ({ NEW: "Lead baru", CONTACTED: "Sudah dihubungi", RESPONDED: "Merespons", FOLLOW_UP: "Follow-up kembali", QUALIFIED: "Menjadi prospek", CLOSED_LOST: "Ditutup" } as Record<string, string>)[leadStatus] || leadStatus} />
                  {x.next_follow_up_at && leadStatus === "FOLLOW_UP" && <div className="mt-1 text-2xs text-amber-700">Hubungi kembali: {formatDate(x.next_follow_up_at)}</div>}
                  {x.last_contact_note && <div className="mt-1 max-w-xl truncate text-2xs text-text-secondary" title={x.last_contact_note}>Catatan kontak: {x.last_contact_note}</div>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  {onOpenStageDetail && (
                    <ActionBtn onClick={() => onOpenStageDetail(x, "LEAD")} label="Detail Lead" small variant="ghost" title="Buka modal kualifikasi Lead (Info Kontak & Kebutuhan, Riwayat Follow-Up, dan Konversi)." />
                  )}
                  {canDelegate && onOpenDelegate && !isQual && (
                    <ActionBtn onClick={() => onOpenDelegate(x, "INQUIRY")} label="Delegasi PIC" small variant="ghost" title="Delegasikan atau alihkan Lead ini ke Sales (SPV/GM)." />
                  )}
                  {canHandleThisLead ? (
                    <>
                      <ActionBtn onClick={() => openEditLead(x)} label="Edit Lead" small variant="ghost" title="Ubah subject, nama customer, email, telepon, dan deskripsi Lead." />
                      {!x.customer_party_id && <ActionBtn onClick={() => openLinkCustomer(x)} label="Hubungkan customer" small variant="ghost" />}
                      {(leadStatus === "NEW" || leadStatus === "FOLLOW_UP") && <ActionBtn onClick={async () => updateLeadStatus(x, "CONTACTED")} label={leadStatus === "FOLLOW_UP" ? "Dihubungi lagi" : "Tandai dihubungi"} small disabled={savingLeadId === String(x.id)} />}
                      {leadStatus === "CONTACTED" && <ActionBtn onClick={async () => updateLeadStatus(x, "RESPONDED")} label="Tandai merespons" small disabled={savingLeadId === String(x.id)} />}
                      {leadStatus === "RESPONDED" && linkedPartyType === "CUSTOMER" && <ActionBtn onClick={async () => { try { await qualifyInquiry(x.id); toast.success("Lead lolos kualifikasi dan menjadi Opportunity."); onRefresh(); } catch (error: any) { toast.error(error?.response?.data?.detail || "Lead belum dapat dikualifikasi."); } }} label="Jadikan Opportunity" small />}
                      {leadStatus === "RESPONDED" && linkedPartyType === "PROSPECT" && <ActionBtn onClick={async () => { try { await convertCRMProspect(linkedParty.id); toast.success("Calon Customer dikonversi menjadi Customer. Lead siap dikualifikasi."); onRefresh(); } catch (error: any) { toast.error(error?.response?.data?.detail || "Calon Customer belum dapat dikonversi."); } }} label="Jadikan Customer" small />}
                      {leadStatus === "RESPONDED" && !linkedPartyType && <span title="Hubungkan ke Customer atau Calon Customer aktif terlebih dahulu" className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-2xs font-semibold text-amber-800">Hubungkan customer dulu</span>}
                      {needsOpportunityRepair && (x.customer_party_id ? <ActionBtn onClick={async () => { try { await qualifyInquiry(x.id); toast.success("Tautan Opportunity berhasil diperbaiki."); onRefresh(); } catch (error: any) { toast.error(error?.response?.data?.detail || "Tautan Opportunity belum dapat diperbaiki."); } }} label="Perbaiki Opportunity" small /> : <span title="Hubungkan ke customer aktif terlebih dahulu" className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-2xs font-semibold text-amber-800">Hubungkan customer dulu</span>)}
                      {!isQual && !["CLOSED_LOST"].includes(leadStatus) && <ActionBtn onClick={async () => { setFollowUpLead(x); setFollowUpDraft({ date: "", note: "" }); }} label="Tindak lanjuti lagi" small variant="ghost" />}
                      {isQual && (
                        <span className="px-2 py-0.5 rounded-full bg-brand-light-green text-brand-deep-green text-2xs font-semibold">QUALIFIED</span>
                      )}
                      {canDelete && <button type="button" onClick={() => void handleDeleteLead(x)} disabled={savingLeadId === String(x.id) || hasLinkedOpportunity} title={hasLinkedOpportunity ? "Lead yang sudah terhubung ke Opportunity tidak dapat dihapus." : "Hapus Lead"} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                        <Trash2 size={13} /> Hapus
                      </button>}
                    </>
                  ) : (
                    <span className="text-2xs text-text-secondary italic">
                      {isQual ? "QUALIFIED" : canEdit ? "Hanya dapat mengubah Lead yang dibuat sendiri" : x.status || "NEW"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal isOpen={Boolean(editingLead)} onClose={() => !editSaving && setEditingLead(null)} title="Edit Data Lead" size="md">
        <div className="flex flex-col gap-3 p-4">
          <label className="text-xs font-medium text-text-secondary">Subject *<input className="input mt-1 w-full" maxLength={240} value={editForm.subject} onChange={event => setEditForm(current => ({ ...current, subject: event.target.value }))} /></label>
          <label className="text-xs font-medium text-text-secondary">Nama Customer *<input className="input mt-1 w-full" maxLength={200} value={editForm.customer_name} onChange={event => setEditForm(current => ({ ...current, customer_name: event.target.value }))} /></label>
          <label className="text-xs font-medium text-text-secondary">Email kontak (opsional)<input type="email" className="input mt-1 w-full" value={editForm.customer_email} onChange={event => setEditForm(current => ({ ...current, customer_email: event.target.value }))} /></label>
          <label className="text-xs font-medium text-text-secondary">Nomor telepon kontak (opsional)<input type="tel" className="input mt-1 w-full" maxLength={50} value={editForm.customer_phone} onChange={event => setEditForm(current => ({ ...current, customer_phone: event.target.value }))} /></label>
          <p className="-mt-2 text-2xs text-text-secondary">Salah satu kontak wajib diisi. Status dan relasi Customer diubah melalui aksi Lead masing-masing.</p>
          <label className="text-xs font-medium text-text-secondary">Deskripsi kebutuhan<textarea className="input mt-1 w-full min-h-24" maxLength={5000} value={editForm.description} onChange={event => setEditForm(current => ({ ...current, description: event.target.value }))} /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingLead(null)} disabled={editSaving} className="btn-ghost">Batal</button><button type="button" onClick={() => void saveLeadEdit()} disabled={editSaving || !editForm.subject.trim() || !editForm.customer_name.trim() || (!normalizeOptionalCustomerEmail(editForm.customer_email) && !editForm.customer_phone.trim())} className="btn-primary">{editSaving ? "Menyimpan…" : "Simpan perubahan"}</button></div>
        </div>
      </Modal>
      <Modal isOpen={Boolean(contactLead)} onClose={() => !savingLeadId && setContactLead(null)} title={contactTarget === "CONTACTED" ? "Catat Lead Sudah Dihubungi" : "Catat Respons Lead"} size="sm">
        <div className="space-y-3 p-1"><p className="text-xs text-text-secondary">{contactLead?.customer_name || "Lead"} · status dicatat sebagai {contactTarget === "CONTACTED" ? "Sudah Dihubungi" : "Merespons"}.</p><label className="block text-xs font-medium">Catatan kontak (opsional)<textarea className="input mt-1 w-full min-h-20" maxLength={2000} value={contactNote} onChange={event => setContactNote(event.target.value)} placeholder="Ringkasan panggilan, pesan, atau kebutuhan customer" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setContactLead(null)} disabled={Boolean(savingLeadId)} className="btn-ghost">Batal</button><button type="button" onClick={() => void submitLeadContact()} disabled={Boolean(savingLeadId)} className="btn-primary">{savingLeadId ? "Menyimpan…" : "Simpan status"}</button></div></div>
      </Modal>
      <Modal isOpen={Boolean(followUpLead)} onClose={() => !savingLeadId && setFollowUpLead(null)} title={`Tindak lanjuti — ${followUpLead?.customer_name || "Lead"}`} size="sm">
        <div className="space-y-3 p-1"><p className="text-xs text-text-secondary">Lead tetap berada pada daftar aktif dan akan ditampilkan sebagai Follow-up Kembali pada tanggal yang dipilih.</p><label className="block text-xs font-medium">Tanggal tindak lanjut *<input className="input mt-1 w-full" type="date" min={new Date().toISOString().slice(0, 10)} value={followUpDraft.date} onChange={event => setFollowUpDraft({ ...followUpDraft, date: event.target.value })} /></label><label className="block text-xs font-medium">Alasan / catatan *<textarea className="input mt-1 w-full min-h-20" maxLength={2000} value={followUpDraft.note} onChange={event => setFollowUpDraft({ ...followUpDraft, note: event.target.value })} placeholder="Menunggu budget, keputusan internal, atau waktu yang diminta customer" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setFollowUpLead(null)} disabled={Boolean(savingLeadId)} className="btn-ghost">Batal</button><button type="button" onClick={() => void submitLeadFollowUp()} disabled={Boolean(savingLeadId) || !followUpDraft.date || !followUpDraft.note.trim()} className="btn-primary">Simpan follow-up</button></div></div>
      </Modal>
      <Modal isOpen={Boolean(linkingInquiry)} onClose={() => !linkCustomerSaving && setLinkingInquiry(null)} title="Hubungkan Customer ke Inquiry" size="sm">
        <div className="space-y-3 p-4">
          <p className="text-xs leading-5 text-text-secondary">Inquiry boleh dicatat sebelum customer terdaftar. Hubungkan customer aktif dan PIC sebelum Inquiry dikualifikasi menjadi Opportunity.</p>
          <label className="block text-xs font-medium text-text-secondary">Customer aktif *
            <select className="input mt-1 w-full" value={linkCustomerId} onChange={event => void handleLinkCustomerChange(event.target.value)}><option value="">Pilih customer</option>{(data.parties || []).filter((party: any) => String(party.party_type || "").toUpperCase() === "CUSTOMER" && String(party.status || "").toUpperCase() === "ACTIVE").map((party: any) => <option key={party.id} value={String(party.id)}>{party.display_name || party.legal_name}</option>)}</select>
          </label>
          {linkCustomerId && <label className="block text-xs font-medium text-text-secondary">PIC / Kontak (opsional)
            <select className="input mt-1 w-full" value={linkContactId} onChange={event => setLinkContactId(event.target.value)}><option value="">Belum memilih PIC</option>{linkContactOptions.map((contact: any) => <option key={contact.id} value={String(contact.id)}>{contact.contact_name}{contact.job_title ? ` · ${contact.job_title}` : ""}{contact.primary_contact ? " · Utama" : ""}</option>)}</select>
          </label>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setLinkingInquiry(null)} disabled={linkCustomerSaving} className="btn-ghost">Batal</button><button type="button" onClick={() => void submitLinkCustomer()} disabled={linkCustomerSaving || !linkCustomerId} className="btn-primary">{linkCustomerSaving ? "Menyimpan…" : "Simpan Customer"}</button></div>
        </div>
      </Modal>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Tambah Lead / Inquiry" size="md">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Subject *</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="Judul inquiry..." />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Nama Customer *</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.customer_name} onChange={e => setForm(f => ({...f, customer_name: e.target.value}))} placeholder="Nama customer / PT..." />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Simpan relasi Lead sebagai</label>
            <select className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-green" value={form.party_type} onChange={event => setForm(current => ({ ...current, party_type: event.target.value, customer_party: "", contact_id: "", customer_email: "", customer_phone: "" }))}>
              <option value="CUSTOMER">Customer</option>
              <option value="PROSPECT">Calon Customer</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Email kontak (opsional)</label>
            <input type="email" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.customer_email} onChange={e => setForm(f => ({...f, customer_email: e.target.value}))} placeholder="email@domain.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Nomor telepon kontak (opsional)</label>
            <input type="tel" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.customer_phone} onChange={e => setForm(f => ({...f, customer_phone: e.target.value}))} placeholder="+62 812 3456 7890" />
            <p className="mt-1 text-2xs text-text-secondary">PIC boleh tidak dipilih. Isi minimal email atau nomor telepon agar lead dapat dihubungi.</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-text-secondary">Pilih {form.party_type === "PROSPECT" ? "Calon Customer" : "Customer"} (Database)</label>
              <button 
                type="button" 
                onClick={() => setIsQuickPartyOpen(true)}
                className="text-2xs font-semibold text-brand-green hover:underline flex items-center gap-1"
              >
                <UserPlus size={12} /> + {form.party_type === "PROSPECT" ? "Calon Customer" : "Customer"} Baru
              </button>
            </div>
            <select
              className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-green"
              value={form.customer_party}
              onChange={e => void handleInquiryPartySelect(e.target.value)}
            >
              <option value="">-- Rekanan Bebas / Input Manual --</option>
              {(data.parties || []).filter(p => String(p.party_type || "").toUpperCase() === form.party_type && String(p.status || "").toUpperCase() === "ACTIVE").map(p => (
                <option key={p.id} value={String(p.id)}>{p.display_name || p.legal_name}</option>
              ))}
            </select>
          </div>
          {form.customer_party && <label className="block text-xs font-medium text-text-secondary">PIC / Kontak customer (opsional)
            <select className="input mt-1 w-full" value={form.contact_id} onChange={event => {
              const contact = inquiryContactOptions.find((item) => String(item.id) === event.target.value);
              setForm((current) => ({ ...current, contact_id: event.target.value, customer_email: contact?.email || current.customer_email, customer_phone: contact?.phone || current.customer_phone }));
            }}>
              <option value="">Pilih PIC bila tersedia</option>
              {inquiryContactOptions.map((contact) => <option key={contact.id} value={String(contact.id)}>{contact.contact_name}{contact.job_title ? ` · ${contact.job_title}` : ""}{contact.primary_contact ? " · Utama" : ""}</option>)}
            </select>
          </label>}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Deskripsi Kebutuhan</label>
            <textarea rows={3} className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Rincian kebutuhan klien..." />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setIsOpen(false)} disabled={isSubmitting} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} disabled={isSubmitting || (!normalizeOptionalCustomerEmail(form.customer_email) && !form.customer_phone.trim())} className="btn-primary">
              {isSubmitting ? "Menyimpan..." : "Buat Inquiry"}
            </button>
          </div>
        </div>
      </Modal>

      <QuickAddPartyModal
        isOpen={isQuickPartyOpen}
        onClose={() => setIsQuickPartyOpen(false)}
        defaultPartyType={form.party_type as "CUSTOMER" | "PROSPECT"}
        requireContactMethod
        onSuccess={(newParty, contact) => {
          if (onPartyCreated) onPartyCreated(newParty);
          setForm(f => ({
            ...f,
            customer_party: String(newParty.id),
            customer_name: newParty.display_name || newParty.legal_name,
            customer_email: contact?.email || "",
            customer_phone: contact?.phone || "",
            contact_id: contact?.contact_id || "",
          }));
          void loadCRMPartyContacts(String(newParty.id)).then(setInquiryContactOptions).catch(() => setInquiryContactOptions([]));
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: PROSPECTS
══════════════════════════════════════════════════ */
function TabProspects({ data, onRefresh, onPartyCreated, readOnly = false, currentUserId, canEditAll = false }: { data: CRMData; onRefresh: () => void; onPartyCreated: (party: any) => void; readOnly?: boolean; currentUserId?: string; canEditAll?: boolean }) {
  const [search, setSearch] = useState("");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const prospects = (data.parties || []).filter((party: any) => String(party.party_type || "").toUpperCase() === "PROSPECT");
  const filtered = prospects.filter((party: any) => [party.display_name, party.legal_name, party.party_code].some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID"))));

  const convertToCustomer = async (party: any) => {
    setConvertingId(String(party.id));
    try {
      await convertCRMProspect(party.id);
      toast.success(`${party.display_name || party.legal_name} sekarang tercatat sebagai Customer.`);
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Calon Customer belum dapat dikonversi.");
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <div className="card rounded-xl p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold">Calon Customer</h3>
          <p className="mt-0.5 text-xs text-text-secondary">Calon Customer dan Customer memakai tabel rekanan yang sama. Konversi mengubah jenis record ini tanpa membuat duplikat.</p>
        </div>
        <div className="flex items-center gap-2">
          <input className="input w-full sm:w-56" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari calon customer..." />
          {!readOnly && <button type="button" onClick={() => setIsNewOpen(true)} className="btn-primary shrink-0 text-xs"><Plus size={13} className="mr-1 inline" />Calon Customer Baru</button>}
        </div>
      </div>
      {filtered.length === 0 ? <EmptyState msg={search ? "Calon Customer tidak ditemukan." : "Belum ada Calon Customer."} /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Kontak</th><th className="px-4 py-3">Kode</th><th className="px-4 py-3">Status</th>{!readOnly && <th className="px-4 py-3 text-right">Aksi</th>}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((party: any) => (
                <tr key={party.id}>
                  <td className="px-4 py-3"><div className="font-semibold text-slate-900">{party.display_name || party.legal_name || "—"}</div>{party.legal_name && party.display_name && party.legal_name !== party.display_name && <div className="mt-0.5 text-slate-500">{party.legal_name}</div>}</td>
                  <td className="px-4 py-3 text-slate-600">{(() => { const contact = (data.contacts || []).find((item: any) => String(item.party_id) === String(party.id) && item.primary_contact) || (data.contacts || []).find((item: any) => String(item.party_id) === String(party.id)); return contact ? [contact.email, contact.phone].filter(Boolean).join(" · ") || contact.contact_name : "—"; })()}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{party.party_code || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={party.status || "ACTIVE"} /></td>
                  {!readOnly && <td className="px-4 py-3 text-right">{(canEditAll || Boolean(currentUserId && String(party.created_by_id) === currentUserId)) ? <button type="button" disabled={convertingId === String(party.id) || String(party.status || "ACTIVE").toUpperCase() !== "ACTIVE"} onClick={() => void convertToCustomer(party)} className="btn-ghost text-xs disabled:opacity-50">{convertingId === String(party.id) ? "Mengubah..." : "Jadikan Customer"}</button> : <span className="text-2xs text-text-secondary">Dibuat pengguna lain</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <QuickAddPartyModal
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        defaultPartyType="PROSPECT"
        requireContactMethod
        onSuccess={(party) => { onPartyCreated(party); onRefresh(); }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: ACCOUNTS
══════════════════════════════════════════════════ */
/**
 * TabAccounts coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TabAccounts({ data, onRefresh, onPartyCreated, readOnly = false, currentUserId, canEditAll = false }: { data: CRMData; onRefresh: () => void; onPartyCreated: (party: any) => void; readOnly?: boolean; currentUserId?: string; canEditAll?: boolean }) {
  const crmPeriod = useCRMPeriodFilter();
  const [accountView, setAccountView] = useState<"PARTIES" | "WON_CONTACTS">("PARTIES");
  const [wonContacts, setWonContacts] = useState<any[]>([]);
  const [wonContactsLoading, setWonContactsLoading] = useState(false);
  const [partySearch, setPartySearch] = useState("");
  const [partyTypeFilter, setPartyTypeFilter] = useState("ALL");
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<any | null>(null);
  const [partyForm, setPartyForm] = useState({ display_name: "", legal_name: "", party_code: "", party_type: "CUSTOMER", status: "ACTIVE" });
  const [isSaving, setIsSaving] = useState(false);
  const [projectParty, setProjectParty] = useState<any | null>(null);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; project_code: string; project_name: string; status: string; lifecycle_status: string }>>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsSaving, setProjectsSaving] = useState(false);
  const [contactParty, setContactParty] = useState<any | null>(null);
  const [partyContacts, setPartyContacts] = useState<any[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ contact_name: "", job_title: "", email: "", phone: "", primary_contact: false });
  const visibleParties = (data.parties || []).filter((party: any) => {
    const type = String(party.party_type || "CUSTOMER").toUpperCase();
    const query = partySearch.trim().toLocaleLowerCase("id-ID");
    const matchesQuery = !query || [party.display_name, party.legal_name, party.party_code, party.id].some(value => String(value || "").toLocaleLowerCase("id-ID").includes(query));
    return matchesQuery && (partyTypeFilter === "ALL" || type === partyTypeFilter);
  });
  useEffect(() => {
    if (accountView !== "WON_CONTACTS") return;
    let active = true;
    setWonContactsLoading(true);
    api.get("/api/v1/crm/won-contacts/?page_size=500")
      .then(({ data: response }) => {
        const payload = response?.data ?? response;
        const rows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.rows) ? payload.rows : [];
        if (active) setWonContacts(rows);
      })
      .catch((error) => {
        if (!active) return;
        setWonContacts([]);
        toast.error(error?.response?.data?.detail || "Kontak dari Opportunity berhasil menang gagal dimuat.");
      })
      .finally(() => { if (active) setWonContactsLoading(false); });
    return () => { active = false; };
  }, [accountView, data.opportunities]);
  const visibleWonContacts = wonContacts.filter((contact) => {
    const term = partySearch.trim().toLocaleLowerCase("id-ID");
    return crmPeriod.matches(contact.closed_at || contact.created_at) && (!term || [contact.customer_name, contact.party_code, contact.opportunity_name, contact.contact_name, contact.email, contact.phone]
      .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(term)));
  });

  const openEdit = (party: any) => {
    setEditingParty(party);
    setPartyForm({
      display_name: party.display_name || "",
      legal_name: party.legal_name || "",
      party_code: party.party_code || "",
      party_type: party.party_type || "CUSTOMER",
      status: party.status || "ACTIVE",
    });
  };

  const saveParty = async () => {
    if (!editingParty) return;
    if (!partyForm.display_name.trim() && !partyForm.legal_name.trim()) {
      toast.error("Nama rekanan wajib diisi.");
      return;
    }
    setIsSaving(true);
    try {
      await api.patch(`/api/v1/master-data/parties/${editingParty.id}/`, {
        display_name: partyForm.display_name.trim() || partyForm.legal_name.trim(),
        legal_name: partyForm.legal_name.trim() || partyForm.display_name.trim(),
        party_code: partyForm.party_code.trim(),
        party_type: partyForm.party_type,
        status: partyForm.status,
      });
      toast.success("Profil rekanan berhasil diperbarui.");
      setEditingParty(null);
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Profil rekanan tidak berhasil diperbarui.");
    } finally {
      setIsSaving(false);
    }
  };

  const openProjectManager = async (party: any) => {
    setProjectParty(party);
    setProjectsLoading(true);
    setProjectOptions([]);
    setSelectedProjectIds([]);
    try {
      const { data: result } = await api.get(`/api/v1/crm/parties/${party.id}/projects`);
      setProjectOptions(Array.isArray(result?.projects) ? result.projects : []);
      setSelectedProjectIds(Array.isArray(result?.project_ids) ? result.project_ids : []);
    } catch (error: any) {
      setProjectParty(null);
      toast.error(error?.response?.data?.detail || "Gagal memuat daftar proyek rekanan.");
    } finally {
      setProjectsLoading(false);
    }
  };

  const savePartyProjects = async () => {
    if (!projectParty) return;
    setProjectsSaving(true);
    try {
      await api.put(`/api/v1/crm/parties/${projectParty.id}/projects`, { project_ids: selectedProjectIds });
      toast.success("Relasi proyek rekanan berhasil disimpan.");
      setProjectParty(null);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Relasi proyek rekanan gagal disimpan.");
    } finally {
      setProjectsSaving(false);
    }
  };

  const openContacts = async (party: any) => {
    setContactParty(party);
    setPartyContacts([]);
    setContactsLoading(true);
    setEditingContactId(null);
    setContactForm({ contact_name: "", job_title: "", email: "", phone: "", primary_contact: false });
    try {
      setPartyContacts(await loadCRMPartyContacts(party.id));
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Daftar kontak rekanan tidak berhasil dimuat.");
    } finally {
      setContactsLoading(false);
    }
  };

  const editContact = (contact: any) => {
    setEditingContactId(String(contact.id));
    setContactForm({
      contact_name: contact.contact_name || "",
      job_title: contact.job_title || "",
      email: contact.email || "",
      phone: contact.phone || "",
      primary_contact: Boolean(contact.primary_contact),
    });
  };

  const saveContact = async () => {
    if (!contactParty || !contactForm.contact_name.trim()) {
      toast.error("Nama kontak wajib diisi.");
      return;
    }
    setContactSaving(true);
    try {
      if (contactForm.primary_contact) {
        await Promise.all(partyContacts
          .filter(contact => contact.primary_contact && String(contact.id) !== editingContactId)
          .map(contact => saveCRMPartyContact({ ...contact, primary_contact: false })));
      }
      await saveCRMPartyContact({
        id: editingContactId || undefined,
        party_id: String(contactParty.id),
        ...contactForm,
        contact_name: contactForm.contact_name.trim(),
        job_title: contactForm.job_title.trim(),
        email: contactForm.email.trim(),
        phone: contactForm.phone.trim(),
      });
      toast.success(editingContactId ? "Kontak rekanan diperbarui." : "Kontak rekanan ditambahkan.");
      setContactForm({ contact_name: "", job_title: "", email: "", phone: "", primary_contact: false });
      setEditingContactId(null);
      setPartyContacts(await loadCRMPartyContacts(contactParty.id));
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Perubahan kontak rekanan belum tersimpan. Coba kembali.");
    } finally {
      setContactSaving(false);
    }
  };

  return (
    <div className="card rounded-xl p-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold text-text-primary">{accountView === "PARTIES" ? "Master Rekanan" : "Kontak dari Deal Berhasil"}</h3><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{accountView === "PARTIES" ? `${visibleParties.length} / ${(data.parties||[]).length} rekanan` : `${visibleWonContacts.length} kontak`}</span></div>
          <p className="text-xs text-text-secondary mt-1">{accountView === "PARTIES" ? "Kelola nama, kode, tipe, dan status rekanan." : "Sumber data berasal dari Opportunity berstatus WON dan PIC terkait pada Inquiry atau data kontak customer."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" /><input className="input h-9 w-52 pl-8 text-xs" value={partySearch} onChange={event => setPartySearch(event.target.value)} placeholder={accountView === "PARTIES" ? "Cari nama, kode…" : "Cari deal atau kontak…"} aria-label={accountView === "PARTIES" ? "Cari rekanan" : "Cari kontak deal berhasil"} /></label>
          {accountView === "PARTIES" && <><select className="input h-9 bg-white text-xs" value={partyTypeFilter} onChange={event => setPartyTypeFilter(event.target.value)} aria-label="Filter tipe rekanan"><option value="ALL">Semua tipe</option><option value="CUSTOMER">Customer</option><option value="PROSPECT">Calon Customer</option><option value="SUPPLIER">Supplier</option><option value="PARTNER">Partner</option></select>{!readOnly && <button onClick={() => setIsQuickAddOpen(true)} className="btn-primary self-start text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Tambah Rekanan</button>}</>}
        </div>
      </div>
      <div role="tablist" aria-label="Data akun CRM" className="mb-4 flex gap-1 border-b border-slate-200">
        <button type="button" role="tab" aria-selected={accountView === "PARTIES"} onClick={() => setAccountView("PARTIES")} className={cn("-mb-px border-b-2 px-3 py-2 text-xs font-semibold", accountView === "PARTIES" ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>Master Rekanan</button>
        <button type="button" role="tab" aria-selected={accountView === "WON_CONTACTS"} onClick={() => setAccountView("WON_CONTACTS")} className={cn("-mb-px border-b-2 px-3 py-2 text-xs font-semibold", accountView === "WON_CONTACTS" ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>Kontak Deal Berhasil <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px]">{wonContacts.length}</span></button>
      </div>
      {accountView === "WON_CONTACTS" && <div className="mb-3"><CRMPeriodToolbar filter={crmPeriod} /></div>}
      {accountView === "WON_CONTACTS" ? (wonContactsLoading ? <p className="py-8 text-center text-sm text-text-secondary">Memuat kontak dari Opportunity berhasil…</p> : visibleWonContacts.length === 0 ? <EmptyState msg={wonContacts.length ? "Tidak ada kontak yang sesuai pencarian." : "Belum ada kontak dari Opportunity berstatus Deal Berhasil."} /> : (
        <div className="max-h-[620px] overflow-auto rounded-xl border border-text-tertiary/60">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-text-secondary"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Opportunity / Deal</th><th className="px-4 py-3">Kontak / PIC</th><th className="px-4 py-3">Email &amp; Telepon</th><th className="px-4 py-3">Tanggal Menang</th></tr></thead>
            <tbody className="divide-y divide-text-tertiary/40 bg-white">{visibleWonContacts.map((contact) => <tr key={contact.opportunity_id} className="transition-colors hover:bg-blue-50/30">
              <td className="px-4 py-3"><div className="text-sm font-semibold text-text-primary">{contact.customer_name || "Customer belum ditautkan"}</div><div className="mt-0.5 text-xs text-text-secondary">{contact.party_code || "—"}</div></td>
              <td className="px-4 py-3"><div className="text-sm font-semibold text-text-primary">{contact.opportunity_name || "Opportunity"}</div><div className="mt-0.5 text-xs text-text-secondary">{formatMoney(contact.expected_amount)} · <StatusBadge status="WON" /></div></td>
              <td className="px-4 py-3"><div className="text-sm font-medium text-text-primary">{contact.contact_name || "PIC belum tercatat"}</div><div className="mt-0.5 text-xs text-text-secondary">{contact.job_title || contact.contact_source || "Data Inquiry"}</div></td>
              <td className="px-4 py-3"><div className="text-sm text-text-primary">{contact.email || "—"}</div><div className="mt-0.5 text-xs text-text-secondary">{contact.phone || "—"}</div></td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-text-secondary">{contact.closed_at ? formatDate(contact.closed_at) : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )) : visibleParties.length === 0 ? <EmptyState msg={data.parties.length ? "Tidak ada rekanan yang sesuai dengan pencarian atau tipe." : "Belum ada rekanan terdaftar."} /> : (
        <div className="max-h-[620px] overflow-auto rounded-xl border border-text-tertiary/60">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-text-secondary">
              <tr>
                <th className="px-4 py-3">Nama Rekanan</th>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">Status</th>
                {!readOnly && <th className="px-4 py-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-text-tertiary/40 bg-white">
              {visibleParties.map(p => (
                <tr key={p.id} className="transition-colors hover:bg-blue-50/30">
                  <td className="px-4 py-3">
                    <div className="break-words text-sm font-semibold text-text-primary">{p.display_name || p.legal_name || p.id}</div>
                    {p.legal_name && p.display_name && p.legal_name !== p.display_name && <div className="mt-0.5 break-words text-xs text-text-secondary">{p.legal_name}</div>}
                  </td>
                  <td className="px-4 py-3"><code className="rounded bg-slate-100 px-1.5 py-1 font-mono text-xs text-text-secondary">{p.party_code || "—"}</code></td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{p.party_type || "CUSTOMER"}</span></td>
                  <td className="px-4 py-3"><StatusBadge status={p.status || "ACTIVE"} /></td>
                  {!readOnly && <td className="px-4 py-3"><div className="flex justify-end gap-1.5">
                    {(canEditAll || Boolean(currentUserId && String(p.created_by_id) === currentUserId)) ? <>
                      {(!p.status || String(p.status).toUpperCase() === "ACTIVE") && ["SUPPLIER", "VENDOR", "PARTNER"].includes(String(p.party_type || "").toUpperCase()) && <button type="button" onClick={() => void openProjectManager(p)} className="btn-ghost text-xs py-1 px-2">Proyek</button>}
                      <button type="button" onClick={() => void openContacts(p)} className="btn-ghost text-xs py-1 px-2">Kontak</button>
                      <button type="button" onClick={() => openEdit(p)} className="btn-ghost text-xs py-1 px-2">Edit</button>
                    </> : <span className="text-2xs text-text-secondary">Dibuat pengguna lain</span>}
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <QuickAddPartyModal isOpen={isQuickAddOpen} onClose={() => setIsQuickAddOpen(false)} onSuccess={(party) => { onPartyCreated(party); onRefresh(); }} allowTypeSelection />
      <Modal isOpen={Boolean(editingParty)} onClose={() => !isSaving && setEditingParty(null)} title="Edit Profil Rekanan" size="sm">
        <div className="flex flex-col gap-3 p-4">
          <label className="text-xs font-medium text-text-secondary">Nama tampilan *<input className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={partyForm.display_name} onChange={e => setPartyForm(f => ({ ...f, display_name: e.target.value }))} /></label>
          <label className="text-xs font-medium text-text-secondary">Nama legal<input className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={partyForm.legal_name} onChange={e => setPartyForm(f => ({ ...f, legal_name: e.target.value }))} /></label>
          <label className="text-xs font-medium text-text-secondary">Kode rekanan<input className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={partyForm.party_code} onChange={e => setPartyForm(f => ({ ...f, party_code: e.target.value }))} /></label>
          <label className="text-xs font-medium text-text-secondary">Tipe rekanan<select className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white" value={partyForm.party_type} onChange={e => setPartyForm(f => ({ ...f, party_type: e.target.value }))}><option value="CUSTOMER">Customer</option><option value="PROSPECT">Calon Customer</option><option value="SUPPLIER">Supplier</option><option value="PARTNER">Partner</option></select></label>
          <label className="text-xs font-medium text-text-secondary">Status<select className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white" value={partyForm.status} onChange={e => setPartyForm(f => ({ ...f, status: e.target.value }))}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option></select></label>
          <div className="flex gap-2 justify-end pt-1"><button type="button" onClick={() => setEditingParty(null)} disabled={isSaving} className="btn-ghost">Batal</button><button type="button" onClick={saveParty} disabled={isSaving} className="btn-primary">{isSaving ? "Menyimpan..." : "Simpan Perubahan"}</button></div>
        </div>
      </Modal>
      <Modal isOpen={Boolean(projectParty)} onClose={() => !projectsSaving && setProjectParty(null)} title={`Hubungkan Proyek · ${projectParty?.display_name || projectParty?.legal_name || "Rekanan"}`} size="md">
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs text-text-secondary">Pilih proyek yang memakai rekanan ini. Relasi tersimpan di proyek dan rekanan; proyek tanpa vendor/supplier tetap diperbolehkan.</p>
          {projectsLoading ? <p className="py-4 text-center text-sm text-text-secondary">Memuat daftar proyek...</p> : projectOptions.length === 0 ? <EmptyState msg="Belum ada proyek di company ini." /> : (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-text-tertiary/50 divide-y divide-text-tertiary/30">
              {projectOptions.map((project) => (
                <label key={project.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-bg-lighter">
                  <input type="checkbox" className="mt-1" checked={selectedProjectIds.includes(project.id)} onChange={(event) => setSelectedProjectIds((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.project_name}</span><span className="mt-0.5 block text-xs text-text-secondary">{project.project_code} · {project.status || project.lifecycle_status || "—"}</span></span>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setProjectParty(null)} disabled={projectsSaving} className="btn-ghost">Batal</button><button type="button" onClick={() => void savePartyProjects()} disabled={projectsLoading || projectsSaving || projectOptions.length === 0} className="btn-primary">{projectsSaving ? "Menyimpan..." : "Simpan Relasi"}</button></div>
        </div>
      </Modal>
      <Modal isOpen={Boolean(contactParty)} onClose={() => !contactSaving && setContactParty(null)} title={`Kontak Rekanan · ${contactParty?.display_name || contactParty?.legal_name || "Rekanan"}`} subtitle="Ubah data kontak pada rekanan ini. Kontak utama dipakai untuk draft quotation." size="md">
        <div className="flex flex-col gap-4 p-4">
          {contactsLoading ? <p className="py-5 text-center text-sm text-text-secondary">Memuat kontak rekanan…</p> : partyContacts.length ? (
            <div className="max-h-52 divide-y overflow-y-auto rounded-xl border border-text-tertiary/60">
              {partyContacts.map(contact => (
                <div key={contact.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{contact.contact_name || "Kontak tanpa nama"}{contact.primary_contact && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">Kontak utama</span>}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">{[contact.job_title, contact.email, contact.phone].filter(Boolean).join(" · ") || "Belum ada detail kontak"}</p>
                  </div>
                  {(canEditAll || Boolean(currentUserId && String(contact.created_by_id) === currentUserId)) && <button type="button" onClick={() => editContact(contact)} className="btn-ghost text-xs">Ubah</button>}
                </div>
              ))}
            </div>
          ) : !contactsLoading ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-text-secondary">Belum ada kontak. Tambahkan kontak agar informasi PIC rekanan tersimpan dan dapat dipakai saat menyiapkan quotation.</p> : null}

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <h4 className="mb-3 text-xs font-bold text-text-primary">{editingContactId ? "Ubah kontak" : "Tambah kontak"}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-text-secondary">Nama kontak *<input className="input mt-1 w-full" value={contactForm.contact_name} onChange={event => setContactForm({ ...contactForm, contact_name: event.target.value })} /></label>
              <label className="text-xs font-medium text-text-secondary">Jabatan<input className="input mt-1 w-full" value={contactForm.job_title} onChange={event => setContactForm({ ...contactForm, job_title: event.target.value })} /></label>
              <label className="text-xs font-medium text-text-secondary">Email<input className="input mt-1 w-full" type="email" value={contactForm.email} onChange={event => setContactForm({ ...contactForm, email: event.target.value })} /></label>
              <label className="text-xs font-medium text-text-secondary">Telepon<input className="input mt-1 w-full" value={contactForm.phone} onChange={event => setContactForm({ ...contactForm, phone: event.target.value })} /></label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={contactForm.primary_contact} onChange={event => setContactForm({ ...contactForm, primary_contact: event.target.checked })} />Jadikan kontak utama quotation</label>
            <div className="mt-3 flex justify-end gap-2">
              {editingContactId && <button type="button" onClick={() => { setEditingContactId(null); setContactForm({ contact_name: "", job_title: "", email: "", phone: "", primary_contact: false }); }} disabled={contactSaving} className="btn-ghost text-xs">Batal ubah</button>}
              <button type="button" onClick={() => void saveContact()} disabled={contactSaving || contactsLoading || !contactForm.contact_name.trim()} className="btn-primary text-xs">{contactSaving ? "Menyimpan…" : editingContactId ? "Simpan perubahan" : "Tambah kontak"}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: CONTRACTS & ORDERS
══════════════════════════════════════════════════ */
/**
 * TabContracts coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TabContracts({ data, onNavigate, onRefresh, readOnly = false }: { data: CRMData; onNavigate: (tab: string) => void; onRefresh?: () => void; readOnly?: boolean }) {
  const crmPeriod = useCRMPeriodFilter();
  const [convertingOrderId, setConvertingOrderId] = useState<string | null>(null);
  const [transferredOrderIds, setTransferredOrderIds] = useState<Set<string>>(() => new Set());
  const [serverTransferableOrders, setServerTransferableOrders] = useState<any[]>([]);
  const [transferListLoading, setTransferListLoading] = useState(true);
  const [transferListError, setTransferListError] = useState("");
  const [isNewContractOpen, setIsNewContractOpen] = useState(false);
  const [savingContract, setSavingContract] = useState(false);
  const [contractForm, setContractForm] = useState({
    contract_number: "",
    customer_party_id: "",
    contact_id: "",
    opportunity_id: "",
    contract_amount: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    contract_type: "SERVICE_AGREEMENT",
    billing_frequency: "MILESTONE",
    order_frequency: "ONE_TIME",
    notes: "",
  });
  useEffect(() => {
    let active = true;
    setTransferListLoading(true);
    api.get("/api/v1/sales/orders/transferable/?page_size=500")
      .then(({ data: response }) => {
        const payload = response?.data ?? response;
        const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.rows) ? payload.rows : [];
        if (active) {
          setServerTransferableOrders(rows);
          setTransferredOrderIds(new Set());
          setTransferListError("");
        }
      })
      .catch((error) => {
        if (!active) return;
        setServerTransferableOrders([]);
        setTransferListError(error?.response?.data?.detail || "Daftar order yang belum memiliki proyek gagal dimuat.");
      })
      .finally(() => { if (active) setTransferListLoading(false); });
    return () => { active = false; };
  }, [data.orders]);
  const transferableOrders = serverTransferableOrders.filter((order: any) => !transferredOrderIds.has(String(order.id)) && crmPeriod.matches(order.order_date || order.created_at));
  const periodContracts = (data.contracts || []).filter((contract: any) => crmPeriod.matches(contract.start_date || contract.created_at));

  const handleConvertToProject = async (orderId: string) => {
    setConvertingOrderId(orderId);
    try {
      const { data: response } = await api.post(`/api/v1/sales/orders/${orderId}/convert-to-project/`, {});
      const project = response?.data ?? response;
      setTransferredOrderIds(current => new Set(current).add(String(orderId)));
      toast.success(`Sales Order berhasil menjadi Proyek "${project?.project_name || project?.project_code || "Baru"}".`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.response?.data?.detail || "Gagal mentransfer order ke proyek.");
    } finally {
      setConvertingOrderId(null);
    }
  };

  const handleCreateContract = async () => {
    if (!contractForm.customer_party_id) {
      toast.error("Pilih Customer untuk kontrak.");
      return;
    }
    setSavingContract(true);
    try {
      await api.post("/api/v1/sales/contracts/", {
        contract_number: contractForm.contract_number.trim() || `CTR-${Date.now().toString().slice(-6)}`,
        customer_party_id: contractForm.customer_party_id,
        contact_id: contractForm.contact_id || null,
        opportunity_id: contractForm.opportunity_id || null,
        contract_amount: contractForm.contract_amount ? Number(contractForm.contract_amount) : null,
        start_date: contractForm.start_date ? new Date(contractForm.start_date).toISOString() : null,
        end_date: contractForm.end_date ? new Date(contractForm.end_date).toISOString() : null,
        contract_type: contractForm.contract_type,
        billing_frequency: contractForm.billing_frequency,
        order_frequency: contractForm.order_frequency,
        notes: contractForm.notes.trim() || null,
        status: "ACTIVE",
      });
      toast.success("Kontrak baru berhasil dibuat.");
      setIsNewContractOpen(false);
      setContractForm({
        contract_number: "",
        customer_party_id: "",
        contact_id: "",
        opportunity_id: "",
        contract_amount: "",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: "",
        contract_type: "SERVICE_AGREEMENT",
        billing_frequency: "MILESTONE",
        order_frequency: "ONE_TIME",
        notes: "",
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error?.message || "Gagal membuat kontrak.");
    } finally {
      setSavingContract(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card rounded-xl border border-blue-200 bg-blue-50/70 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Alur Sales Order &amp; Kontrak</h3>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">Buat quotation dan minta persetujuan di Estimating &amp; Quotations. Quotation berstatus Accepted dapat dikonversi menjadi Sales Order. Deal Won juga memproses order melalui pemeriksaan kredit. Kontrak dikelola sesuai kesepakatan pelanggan.</p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <button type="button" onClick={() => onNavigate("estimate")} className="btn-ghost text-xs py-1.5 px-3 gap-1"><FileText size={12} /> Buka Quotation</button>
            <button type="button" onClick={() => onNavigate("deals")} className="btn-ghost text-xs py-1.5 px-3 gap-1"><ArrowRight size={12} /> Buka Pipeline</button>
            {!readOnly && (
              <button type="button" onClick={() => setIsNewContractOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E40AF] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A]">
                <Plus size={13} /> Add Contract
              </button>
            )}
          </div>
        </div>
      </div>
      <CRMPeriodToolbar filter={crmPeriod} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-text-primary">Sales Order yang Siap Ditransfer</h3><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{transferableOrders.length} order</span></div>
          {transferListLoading ? <p className="py-8 text-center text-sm text-text-secondary">Memeriksa order yang belum memiliki proyek…</p> : transferListError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{transferListError}</div> : transferableOrders.length === 0 ? <EmptyState msg="Tidak ada Sales Order yang menunggu transfer. Order yang sudah memiliki proyek tidak ditampilkan kembali." /> : (
            <div className="max-h-[520px] overflow-auto rounded-xl border border-text-tertiary/60">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-text-secondary"><tr><th className="px-3 py-3">Nomor Order</th><th className="px-3 py-3 text-right">Nilai</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead>
                <tbody className="divide-y divide-text-tertiary/40 bg-white">
                  {transferableOrders.map(o => <tr key={o.id} className="transition-colors hover:bg-blue-50/30">
                    <td className="px-3 py-3"><div className="break-all text-sm font-semibold text-text-primary">{o.order_number || `Order ${String(o.id).slice(0,8)}`}</div><div className="mt-0.5 text-2xs text-text-secondary">ID {String(o.id).slice(0, 8).toUpperCase()}</div></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold text-text-primary">{formatMoney(o.total_amount)}</td>
                    <td className="px-3 py-3"><StatusBadge status={o.status || "CONFIRMED"} /></td>
                    <td className="px-3 py-3 text-right"><button type="button" onClick={() => handleConvertToProject(o.id)} disabled={convertingOrderId === o.id} className="btn-primary whitespace-nowrap text-xs py-1.5 px-3 gap-1.5 bg-brand-deep-green hover:bg-brand-green text-white font-bold shadow-xs disabled:opacity-60"><Zap size={12} />{convertingOrderId === o.id ? "Mentransfer..." : "Transfer ke Proyek"}</button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-text-primary">Contracts</h3><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{periodContracts.length} kontrak</span></div>
          {periodContracts.length === 0 ? <EmptyState msg="Tidak ada kontrak pada periode ini." /> : (
            <div className="max-h-[520px] overflow-auto rounded-xl border border-text-tertiary/60">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-text-secondary"><tr><th className="px-3 py-3">Nomor Kontrak &amp; Klien</th><th className="px-3 py-3 text-right">Nilai</th><th className="px-3 py-3">Periode</th><th className="px-3 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-text-tertiary/40 bg-white">
                  {periodContracts.map(c => {
                    const cust = (data.parties || []).find((p: any) => String(p.id) === String(c.customer_party_id));
                    const contact = (data.contacts || []).find((ct: any) => String(ct.id) === String(c.contact_id));
                    const opp = (data.opportunities || []).find((o: any) => String(o.id) === String(c.opportunity_id));
                    return (
                    <tr key={c.id} className="transition-colors hover:bg-violet-50/30">
                      <td className="px-3 py-3">
                        <div className="break-all text-sm font-semibold text-text-primary">{c.contract_number || `Contract ${String(c.id).slice(0,8)}`}</div>
                        <div className="mt-0.5 text-2xs text-text-secondary">{cust?.display_name || cust?.legal_name || "Customer"}{contact ? ` · PIC: ${contact.contact_name}` : ""}{opp ? ` · ${opp.opportunity_name}` : ""}</div>
                        {c.notes && <div className="mt-0.5 text-[11px] text-slate-400 truncate max-w-[260px]">{c.notes}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold text-text-primary">{c.contract_amount ? formatMoney(c.contract_amount) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-text-secondary">{formatDate(c.start_date)} — {c.end_date ? formatDate(c.end_date) : "Open"}</td>
                      <td className="px-3 py-3"><StatusBadge status={c.status || "ACTIVE"} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isNewContractOpen} onClose={() => !savingContract && setIsNewContractOpen(false)} title="Add New Contract" size="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 text-xs">
          <label className="font-medium text-slate-600">
            Contract Number
            <input className="input mt-1 w-full" value={contractForm.contract_number} onChange={(e) => setContractForm((f) => ({ ...f, contract_number: e.target.value }))} placeholder="Auto-generate jika kosong" />
          </label>
          <label className="font-medium text-slate-600">
            Customer *
            <select className="input mt-1 w-full bg-white" value={contractForm.customer_party_id} onChange={(e) => setContractForm((f) => ({ ...f, customer_party_id: e.target.value, contact_id: "" }))}>
              <option value="">-- Pilih Customer --</option>
              {(data.parties || []).filter((p: any) => p.status === "ACTIVE").map((p: any) => (
                <option key={p.id} value={String(p.id)}>{p.display_name || p.legal_name} ({p.party_type})</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Contact Person
            <select className="input mt-1 w-full bg-white" value={contractForm.contact_id} onChange={(e) => setContractForm((f) => ({ ...f, contact_id: e.target.value }))}>
              <option value="">-- Pilih PIC --</option>
              {(data.contacts || []).filter((c: any) => !contractForm.customer_party_id || String(c.party_id) === contractForm.customer_party_id).map((c: any) => (
                <option key={c.id} value={String(c.id)}>{c.contact_name}{c.job_title ? ` · ${c.job_title}` : ""}</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Linked Opportunity
            <select className="input mt-1 w-full bg-white" value={contractForm.opportunity_id} onChange={(e) => setContractForm((f) => ({ ...f, opportunity_id: e.target.value }))}>
              <option value="">-- Opsional --</option>
              {(data.opportunities || []).filter((o: any) => !contractForm.customer_party_id || String(o.customer_party_id) === contractForm.customer_party_id).map((o: any) => (
                <option key={o.id} value={String(o.id)}>{o.opportunity_name}</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Contract Amount (Rp)
            <IDRInput value={contractForm.contract_amount} onChange={(v) => setContractForm((f) => ({ ...f, contract_amount: v }))} />
          </label>
          <label className="font-medium text-slate-600">
            Contract Type
            <select className="input mt-1 w-full bg-white" value={contractForm.contract_type} onChange={(e) => setContractForm((f) => ({ ...f, contract_type: e.target.value }))}>
              <option value="SERVICE_AGREEMENT">Service Agreement</option>
              <option value="EVENT_CONTRACT">Event Contract</option>
              <option value="PROJECT_CONTRACT">Project Contract</option>
              <option value="RETAINER">Retainer</option>
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Start Date
            <input type="date" className="input mt-1 w-full" value={contractForm.start_date} onChange={(e) => setContractForm((f) => ({ ...f, start_date: e.target.value }))} />
          </label>
          <label className="font-medium text-slate-600">
            End Date
            <input type="date" className="input mt-1 w-full" value={contractForm.end_date} onChange={(e) => setContractForm((f) => ({ ...f, end_date: e.target.value }))} />
          </label>
          <label className="font-medium text-slate-600 sm:col-span-2">
            Notes
            <textarea className="input mt-1 w-full min-h-20" value={contractForm.notes} onChange={(e) => setContractForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Ringkasan ruang lingkup atau klausul kontrak..." />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsNewContractOpen(false)} disabled={savingContract} className="btn-ghost">Batal</button>
            <button type="button" onClick={() => void handleCreateContract()} disabled={savingContract} className="rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]">
              {savingContract ? "Menyimpan..." : "Simpan Contract"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: ENGAGEMENT
══════════════════════════════════════════════════ */
/**
 * TabEngagement coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function TabEngagement({ data, onRefresh, readOnly = false }: { data: CRMData; onRefresh: () => void; readOnly?: boolean }) {
  const crmPeriod = useCRMPeriodFilter();
  const [isOpen, setIsOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCsatOpen, setIsCsatOpen] = useState(false);
  const [csatOrderId, setCsatOrderId] = useState("");
  const [csatRating, setCsatRating] = useState(0);
  const [csatComments, setCsatComments] = useState("");
  const [isCsatSubmitting, setIsCsatSubmitting] = useState(false);
  const csatQuestionIds = new Set(data.surveyQuestions.filter((question) => question.answer_type === "RATING_1_5").map((question) => String(question.id)));
  const allCsatResponses = data.surveyResponses.filter((response) => data.surveyAnswers.some((answer) => String(answer.response_id) === String(response.id) && csatQuestionIds.has(String(answer.question_id))));
  const csatResponses = allCsatResponses.filter((response) => crmPeriod.matches(response.submitted_at || response.created_at));
  const visibleFeedback = data.feedback.filter((feedback: any) => crmPeriod.matches(feedback.submitted_at || feedback.created_at || feedback.updated_at));
  const submittedOrderIds = new Set(allCsatResponses.map((response) => String(response.sales_order_id)).filter(Boolean));
  const completedOrders = data.orders.filter((order) => String(order.status || "").toUpperCase() === "FULFILLED" && !submittedOrderIds.has(String(order.id)));

  const submitFeedback = async () => {
    if (!partyId) return toast.error("Pilih pelanggan terlebih dahulu.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return toast.error("Pilih rating 1 sampai 5 bintang.");
    if (!comments.trim()) return toast.error("Catatan feedback wajib diisi.");
    setIsSubmitting(true);
    try {
      await api.post("/api/v1/crm/feedbacks/", {
        customer_party_id: partyId,
        rating_value: rating,
        feedback_text: comments.trim(),
        feedback_type: "CUSTOMER_REVIEW",
        submitted_at: new Date().toISOString(),
        status: "SUBMITTED",
      });
      toast.success("Feedback pelanggan berhasil disimpan.");
      setIsOpen(false);
      setPartyId("");
      setRating(0);
      setComments("");
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Feedback tidak berhasil disimpan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCsat = async () => {
    if (!csatOrderId) return toast.error("Pilih transaksi yang sudah selesai.");
    if (!Number.isInteger(csatRating) || csatRating < 1 || csatRating > 5) return toast.error("Pilih rating CSAT 1 sampai 5 bintang.");
    setIsCsatSubmitting(true);
    try {
      await api.post("/api/v1/crm/csat/responses/", { sales_order_id: csatOrderId, rating: csatRating, comments: csatComments.trim() });
      toast.success("Respons CSAT berhasil disimpan.");
      setIsCsatOpen(false);
      setCsatOrderId("");
      setCsatRating(0);
      setCsatComments("");
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || error?.response?.data?.detail || "Respons CSAT tidak berhasil disimpan.");
    } finally {
      setIsCsatSubmitting(false);
    }
  };

  return (
    <div className="card rounded-xl p-4">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
        <div><h3 className="text-base font-bold text-text-primary">Customer Feedback &amp; Review</h3><p className="text-xs text-text-secondary mt-1">Pantau ulasan pelanggan dan catat kepuasan setelah pesanan selesai.</p></div>
        {!readOnly && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setIsCsatOpen(true)} disabled={!completedOrders.length} title={!completedOrders.length ? "Belum ada Sales Order berstatus FULFILLED" : undefined} className="btn-ghost text-xs py-1.5 px-3 gap-1 disabled:opacity-50"><Star size={12} /> Catat CSAT Transaksi</button><button type="button" onClick={() => setIsOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Tambah Feedback</button></div>}
      </div>
      <CollapsibleGuideline title="Panduan pencatatan kepuasan pelanggan" className="mb-4">
        CSAT dicatat oleh tim internal setelah pelanggan memberikan penilaian. Form tersedia untuk Sales Order berstatus <b>FULFILLED</b>; satu respons dicatat per transaksi agar rating dan komentar terkait ke order yang tepat.
      </CollapsibleGuideline>
      <div className="mb-4"><CRMPeriodToolbar filter={crmPeriod} /></div>
      <div className="mb-5 rounded-xl border border-text-tertiary/60 p-3">
        <div className="flex items-center justify-between gap-2 mb-3"><h4 className="text-sm font-bold text-text-primary">CSAT Pasca Transaksi</h4><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-text-secondary">{csatResponses.length} respons</span></div>
        {csatResponses.length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">Belum ada respons CSAT transaksi.</p> : <div className="space-y-2">{csatResponses.map((response) => {
          const ratingAnswer = data.surveyAnswers.find((answer) => String(answer.response_id) === String(response.id) && csatQuestionIds.has(String(answer.question_id)));
          const commentsAnswer = data.surveyAnswers.find((answer) => String(answer.response_id) === String(response.id) && answer.text_answer);
          const order = data.orders.find((item) => String(item.id) === String(response.sales_order_id));
          const partyId = response.customer_party || response.customer_party_id || order?.customer_party || order?.customer_party_id;
          const party = data.parties.find((item) => String(item.id) === String(partyId));
          return <article key={response.id} className="rounded-xl border border-text-tertiary/50 bg-white p-3 transition-colors hover:bg-bg-lighter"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h5 className="break-words text-sm font-semibold text-text-primary">{party?.display_name || party?.legal_name || "Pelanggan"}</h5><p className="mt-0.5 text-xs text-text-secondary">{order?.order_number || `Order ${String(response.sales_order_id || "").slice(0, 8)}`}</p></div><OriginDomainBadge domain={response.origin_domain} /></div><div className="mt-2 flex items-center gap-1" aria-label={`Rating ${Number(ratingAnswer?.numeric_answer || 0)} dari 5`}>{[1,2,3,4,5].map((value) => <Star key={value} size={14} className={value <= Number(ratingAnswer?.numeric_answer || 0) ? "text-amber-400 fill-amber-400" : "text-gray-300"} />)}<span className="ml-1 text-xs font-semibold text-text-primary">{Number(ratingAnswer?.numeric_answer || 0)}/5</span></div>{commentsAnswer?.text_answer && <p className="mt-2 border-t border-text-tertiary/40 pt-2 text-sm leading-5 text-text-secondary">{commentsAnswer.text_answer}</p>}</article>;
        })}</div>}
      </div>
      {visibleFeedback.length === 0 ? <EmptyState msg="Tidak ada feedback pada periode ini." /> : (
        <div className="space-y-2">
          {visibleFeedback.map(f => (
            <article key={f.id} className="rounded-xl border border-text-tertiary/50 bg-white p-3 transition-colors hover:bg-bg-lighter">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="break-words text-sm font-semibold text-text-primary">{f.customer_party_name || f.customer_party_display_name || data.parties.find(p => String(p.id) === String(f.customer_party || f.customer_party_id))?.display_name || data.parties.find(p => String(p.id) === String(f.customer_party || f.customer_party_id))?.legal_name || f.reviewer_name || "Pengulas eksternal"}</h4>{f.reviewer_email && <p className="mt-0.5 break-all text-xs text-text-secondary">{f.reviewer_email}</p>}</div><OriginDomainBadge domain={f.origin_domain} /></div>
              <div className="mt-2 flex items-center gap-1" aria-label={`Rating ${Number(f.rating_value ?? f.rating_score) || 0} dari 5`}>
                {[...Array(5)].map((_, i) => <Star key={i} size={14} className={i < (Number(f.rating_value ?? f.rating_score) || 0) ? "text-amber-400 fill-amber-400" : "text-gray-300"} />)}
                <span className="ml-1 text-xs font-semibold text-text-primary">{Number(f.rating_value ?? f.rating_score) || 0}/5</span>
              </div>
              <p className="mt-2 border-t border-text-tertiary/40 pt-2 text-sm leading-5 text-text-secondary">{f.feedback_text || f.comments || "-"}</p>
            </article>
          ))}
        </div>
      )}
      <Modal isOpen={isOpen} onClose={() => !isSubmitting && setIsOpen(false)} title="Tambah Feedback Pelanggan" size="sm">
        <div className="flex flex-col gap-3 p-4">
          <label className="text-xs font-medium text-text-secondary">Pelanggan *<select className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white" value={partyId} onChange={e => setPartyId(e.target.value)}><option value="">Pilih pelanggan...</option>{data.parties.filter(p => !p.party_type || String(p.party_type).toUpperCase() === "CUSTOMER").map(p => <option key={p.id} value={String(p.id)}>{p.display_name || p.legal_name}</option>)}</select></label>
          <div><span className="text-xs font-medium text-text-secondary block mb-1">Rating *</span><div className="flex items-center gap-1" role="group" aria-label="Pilih rating pelanggan">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} dari 5 bintang`} aria-pressed={rating === value} className="p-1"><Star size={22} className={value <= rating ? "text-amber-400 fill-amber-400" : "text-gray-300"} /></button>)}<span className="ml-2 text-xs text-text-secondary">{rating ? `${rating}/5` : "Pilih rating"}</span></div><p className="mt-1 text-2xs text-text-secondary">1 = Sangat tidak puas · 5 = Sangat puas</p></div>
          <label className="text-xs font-medium text-text-secondary">Catatan Feedback *<textarea rows={4} maxLength={2000} className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={comments} onChange={e => setComments(e.target.value)} placeholder="Tulis ulasan atau masukan pelanggan..." /></label>
          <div className="flex gap-2 justify-end pt-1"><button type="button" onClick={() => setIsOpen(false)} disabled={isSubmitting} className="btn-ghost">Batal</button><button type="button" onClick={submitFeedback} disabled={isSubmitting || !partyId || rating < 1 || !comments.trim()} className="btn-primary">{isSubmitting ? "Menyimpan..." : "Simpan Feedback"}</button></div>
        </div>
      </Modal>
      <Modal isOpen={isCsatOpen} onClose={() => !isCsatSubmitting && setIsCsatOpen(false)} title="Catat Survei CSAT Pasca Transaksi" size="sm">
        <div className="flex flex-col gap-3 p-4">
          <label className="text-xs font-medium text-text-secondary">Sales Order selesai *<select className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm bg-white" value={csatOrderId} onChange={(event) => setCsatOrderId(event.target.value)}><option value="">Pilih transaksi...</option>{completedOrders.map((order) => { const partyId = order.customer_party || order.customer_party_id; const party = data.parties.find((item) => String(item.id) === String(partyId)); return <option key={order.id} value={String(order.id)}>{order.order_number || String(order.id).slice(0, 8)} · {party?.display_name || party?.legal_name || "Pelanggan"}</option>; })}</select></label>
          <div><span className="text-xs font-medium text-text-secondary block mb-1">Seberapa puas pelanggan? *</span><div className="flex items-center gap-1" role="group" aria-label="Pilih rating CSAT">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setCsatRating(value)} aria-label={`${value} dari 5 bintang`} aria-pressed={csatRating === value} className="p-1"><Star size={22} className={value <= csatRating ? "text-amber-400 fill-amber-400" : "text-gray-300"} /></button>)}<span className="ml-2 text-xs text-text-secondary">{csatRating ? `${csatRating}/5` : "Pilih rating"}</span></div><p className="mt-1 text-2xs text-text-secondary">1 = Sangat tidak puas · 5 = Sangat puas</p></div>
          <label className="text-xs font-medium text-text-secondary">Masukan tambahan (opsional)<textarea rows={4} maxLength={2000} className="mt-1 w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={csatComments} onChange={(event) => setCsatComments(event.target.value)} placeholder="Catatan atau saran dari pelanggan..." /></label>
          <div className="flex gap-2 justify-end pt-1"><button type="button" onClick={() => setIsCsatOpen(false)} disabled={isCsatSubmitting} className="btn-ghost">Batal</button><button type="button" onClick={submitCsat} disabled={isCsatSubmitting || !csatOrderId || csatRating < 1} className="btn-primary">{isCsatSubmitting ? "Menyimpan..." : "Simpan Respons CSAT"}</button></div>
        </div>
      </Modal>
    </div>
  );
}

function TabCustomerInbox({ userId, readOnly, canEditAll = false, canMatchIdentity, parties, onRefresh }: { userId?: string; readOnly: boolean; canEditAll?: boolean; canMatchIdentity: boolean; parties: any[]; onRefresh: () => void }) {
  const crmPeriod = useCRMPeriodFilter();
  const [rows, setRows] = useState<CRMInboxConversation[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [partyChoice, setPartyChoice] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyRequestIds, setReplyRequestIds] = useState<Record<string, string>>({});
  const [domainFilter, setDomainFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const refreshInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      setRows(await loadCRMInbox());
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Inbox customer tidak dapat dimuat.");
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  useEffect(() => { void refreshInbox(); }, [refreshInbox]);
  const inboxDomains = Array.from(new Set(rows.map((row) => row.origin_domain).filter((value): value is string => Boolean(value)))).sort();
  const getInboxDate = (row: CRMInboxConversation) => {
    const raw = row.latest_message?.received_at || row.latest_message?.sent_at || row.updated_at;
    const date = raw ? new Date(raw) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  };
  const visibleRows = rows.filter((row) => {
    if (domainFilter && row.origin_domain !== domainFilter) return false;
    const date = getInboxDate(row);
    if (!crmPeriod.matches(date)) return false;
    const term = searchFilter.trim().toLocaleLowerCase("id-ID");
    if (!term) return true;
    return [row.subject, row.latest_message?.message_text, ...(row.messages ?? []).map((message) => message.message_text), row.external_thread?.external_thread_id, row.business_unit_name, row.origin_domain, row.inquiry?.inquiry_number, row.assigned_user?.full_name]
      .some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(term));
  });

  const assignToMe = async (row: CRMInboxConversation) => {
    if (!userId) return;
    setBusyId(row.id);
    try {
      await assignConversationToMe(row.id, userId);
      toast.success("Conversation ditugaskan kepada Anda.");
      await refreshInbox();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Penugasan tidak berhasil.");
    } finally { setBusyId(null); }
  };

  const makeInquiry = async (row: CRMInboxConversation) => {
    setBusyId(row.id);
    try {
      const result = await createInquiryFromConversation(row.id);
      toast.success(result?.created === false ? "Inquiry sudah pernah dibuat." : "Inquiry dibuat dari conversation.");
      await refreshInbox();
      onRefresh();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Inquiry tidak dapat dibuat.");
    } finally { setBusyId(null); }
  };

  const decideConversation = async (row: CRMInboxConversation, decision: "IGNORE" | "REOPEN") => {
    setBusyId(row.id);
    try {
      await setConversationDecision(row.id, decision);
      toast.success(decision === "IGNORE" ? "Conversation ditandai untuk diabaikan." : "Conversation dibuka kembali.");
      await refreshInbox();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Status conversation tidak berhasil diperbarui.");
    } finally { setBusyId(null); }
  };

  const matchIdentity = async (identityId: string) => {
    const partyId = partyChoice[identityId];
    if (!partyId) return toast.error("Pilih customer yang sudah Anda verifikasi.");
    setBusyId(identityId);
    try {
      await confirmCRMIdentityCustomer(identityId, partyId);
      toast.success("Identitas ditautkan setelah konfirmasi.");
      await refreshInbox();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Pencocokan customer tidak berhasil.");
    } finally { setBusyId(null); }
  };

  const sendReply = async (row: CRMInboxConversation) => {
    const text = (replyDrafts[row.id] || "").trim();
    if (!text) return toast.error("Tulis balasan terlebih dahulu.");
    setBusyId(row.id);
    try {
      await replyToCRMConversation(row.id, text, replyRequestIds[row.id] || crypto.randomUUID());
      toast.success("Balasan masuk antrean adapter kanal.");
      setReplyDrafts((current) => ({ ...current, [row.id]: "" }));
      setReplyRequestIds((current) => ({ ...current, [row.id]: crypto.randomUUID() }));
      await refreshInbox();
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Balasan tidak dapat dimasukkan ke antrean.");
    } finally { setBusyId(null); }
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-text-primary">Inbox CRM</h3>
              <p className="mt-1 text-xs text-text-secondary">Pesan dari pipeline internal, dikelompokkan menurut konfigurasi unit bisnis Marka.</p>
            </div>
            <button className="btn-ghost text-xs" onClick={() => void refreshInbox()} disabled={loadingInbox}><RefreshCw size={13} className={cn("mr-1", loadingInbox && "animate-spin")} />Refresh</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(160px,1fr)_auto]">
            <label className="text-xs font-medium text-text-secondary">Cari pesan
              <input className="input mt-1 w-full bg-white" value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Nama, pesan, inquiry, domain..." />
            </label>
            <label className="text-xs font-medium text-text-secondary">Domain
              <select aria-label="Filter domain inbox" className="input mt-1 w-full bg-white" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}><option value="">Semua domain</option>{inboxDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select>
            </label>
            <div className="flex items-end"><button type="button" className="btn-ghost w-full justify-center px-3 py-2 text-xs sm:w-auto" onClick={() => { setSearchFilter(""); setDomainFilter(""); crmPeriod.reset(); }}>Reset filter</button></div>
          </div>
          <CRMPeriodToolbar filter={crmPeriod} />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h4 className="text-sm font-bold text-text-primary">Daftar Percakapan</h4>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{visibleRows.length} pesan</span>
      </div>
      {loadingInbox && rows.length === 0 ? <div className="card rounded-xl p-5 text-xs text-text-secondary">Memuat conversation…</div> : visibleRows.length === 0 ? (
        <div className="card rounded-xl p-5"><EmptyState msg={rows.length ? "Tidak ada conversation yang cocok dengan filter." : "Belum ada conversation masuk. Conversation muncul setelah sumber integrasi mengirim event."} /></div>
      ) : <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {visibleRows.map((row) => {
          const canManageConversation = !readOnly && (canEditAll || Boolean(userId && String(row.created_by_id) === userId));
          const date = getInboxDate(row);
          const previewMessages = (row.messages ?? []).slice(-2);
          const preview = row.latest_message?.message_text || previewMessages[previewMessages.length - 1]?.message_text || "Belum ada pesan yang tersimpan.";
          const unit = row.business_unit_name || row.business_unit_code;
          const messageCount = row.messages?.length || (row.latest_message ? 1 : 0);
          return <article key={row.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-text-tertiary/60 bg-white p-3.5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h5 className="break-words text-sm font-bold leading-5 text-text-primary">{row.subject || "Percakapan masuk"}</h5>
                <p className="mt-1 text-2xs text-text-secondary">{date ? date.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : `ID ${row.id.slice(0, 8)}`}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5"><span className="text-2xs font-medium text-text-secondary">Status</span><StatusBadge status={row.status} /></div>
            </header>

            <div className="flex flex-wrap gap-1.5 border-y border-slate-100 py-2">
              {row.origin_domain && <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-2xs"><span className="font-semibold text-text-secondary">Domain</span><OriginDomainBadge domain={row.origin_domain} /></span>}
              {unit && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-2xs text-blue-800"><b>Unit</b> · {unit}</span>}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs text-text-secondary"><b>Prioritas</b> · {row.priority || "NORMAL"}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs text-text-secondary"><b>PIC</b> · {row.assigned_user?.full_name || (row.assigned_user_id ? "Ditentukan" : "Belum ada")}</span>
              {row.inquiry && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-medium text-emerald-800"><b>Inquiry</b> · {row.inquiry.inquiry_number}</span>}
            </div>

            <div className="min-h-[96px] rounded-lg bg-slate-50 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-2xs font-semibold uppercase tracking-wide text-text-secondary">Pesan terakhir</span><span className="text-2xs text-text-secondary">{messageCount} pesan</span></div>
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-text-primary">{preview}</p>
            </div>

            {canManageConversation && <div className="flex flex-wrap gap-1.5">
              {row.assigned_user_id !== userId && <button className="btn-ghost text-2xs px-2 py-1" disabled={busyId === row.id || !userId} onClick={() => void assignToMe(row)}><UserPlus size={12} className="mr-1" />{row.assigned_user_id ? "Tugaskan ke saya" : "Ambil"}</button>}
              {!row.inquiry_id && <button className="btn-primary text-2xs px-2 py-1" disabled={busyId === row.id} onClick={() => void makeInquiry(row)}><Plus size={12} className="mr-1" />Jadikan Inquiry</button>}
              {!row.inquiry_id && row.status !== "IGNORED" && <button className="btn-ghost text-2xs px-2 py-1" disabled={busyId === row.id} onClick={() => void decideConversation(row, "IGNORE")}>Abaikan</button>}
              {row.status === "IGNORED" && <button className="btn-ghost text-2xs px-2 py-1" disabled={busyId === row.id} onClick={() => void decideConversation(row, "REOPEN")}>Pulihkan</button>}
            </div>}

            <details className="group border-t border-slate-100 pt-2">
              <summary className="cursor-pointer list-none text-xs font-semibold text-blue-700 marker:hidden">Lihat percakapan &amp; detail <span className="ml-1 text-2xs font-normal text-text-secondary">({row.external_thread?.external_thread_id || `ID ${row.id.slice(0, 8)}`})</span></summary>
              <div className="mt-3 space-y-3">
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
                  {(row.messages ?? []).length ? row.messages!.map((message) => {
                    const isInbound = message.direction === "INBOUND";
                    const timestamp = message.received_at || message.sent_at;
                    const parsed = timestamp ? new Date(timestamp) : null;
                    return <div key={message.id} className={cn("flex w-full", isInbound ? "justify-start" : "justify-end")}>
                      <div className={cn("max-w-[90%] rounded-xl px-3 py-2 shadow-sm", isInbound ? "rounded-tl-sm border border-text-tertiary/40 bg-white text-text-primary" : "rounded-tr-sm bg-blue-600 text-white")}>
                        <p className="whitespace-pre-wrap break-words text-xs leading-4">{message.message_text}</p>
                        {parsed && !Number.isNaN(parsed.getTime()) && <p className={cn("mt-1 text-right text-2xs", isInbound ? "text-text-secondary" : "text-blue-100")}>{parsed.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                      </div>
                    </div>;
                  }) : <p className="rounded-lg border border-text-tertiary/40 bg-white px-3 py-2 text-xs text-text-secondary">{row.latest_message?.message_text || "Belum ada pesan yang tersimpan."}</p>}
                </div>
                <div className="flex flex-wrap gap-2 text-2xs text-text-secondary">
                  <span className="rounded bg-slate-100 px-2 py-1"><b>Thread</b> · {row.external_thread?.external_thread_id || `Conversation ${row.id.slice(0, 8)}`}</span>
                  <span className="rounded bg-slate-100 px-2 py-1"><b>PIC</b> · {row.assigned_user?.full_name || (row.assigned_user_id ? "Sudah ditentukan" : "Belum ada")}</span>
                  {row.inquiry_id && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-800">Sudah dieskalasi menjadi Inquiry</span>}
                </div>
                {canManageConversation && row.external_thread && row.status !== "IGNORED" && <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <textarea className="input-field min-h-16 flex-1 resize-y text-xs" maxLength={10000} value={replyDrafts[row.id] || ""} onChange={(event) => { setReplyDrafts((current) => ({ ...current, [row.id]: event.target.value })); setReplyRequestIds((current) => current[row.id] ? current : ({ ...current, [row.id]: crypto.randomUUID() })); }} placeholder="Tulis balasan..." />
                  <button className="btn-primary text-xs sm:self-end" disabled={busyId === row.id || !(replyDrafts[row.id] || "").trim()} onClick={() => void sendReply(row)}>{busyId === row.id ? "Mengirim..." : "Kirim balasan"}</button>
                </div>}
                {(row.external_identities ?? []).length > 0 && <div className="space-y-2 border-t border-text-tertiary/40 pt-3">
                  {row.external_identities!.map((identity) => <div key={identity.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-text-secondary"><span><b>Identitas</b> · {identity.type} {identity.masked_value}</span><span><b>Verifikasi sumber</b> · {identity.channel_verification_status}</span><span><b>Status customer</b> · {identity.customer_match_status}</span></div>
                    {identity.customer_match_status === "CONFIRMED" && identity.party_id ? <p className="mt-1 font-medium text-emerald-800">Customer · {parties.find((party) => String(party.id) === String(identity.party_id))?.display_name || parties.find((party) => String(party.id) === String(identity.party_id))?.legal_name || "Terverifikasi"}</p> : canMatchIdentity && identity.channel_verification_status === "VERIFIED" ? <div className="mt-2 flex flex-wrap gap-2">
                      <select className="input-field py-1 text-xs" value={partyChoice[identity.id] || ""} onChange={(event) => setPartyChoice((current) => ({ ...current, [identity.id]: event.target.value }))}><option value="">Pilih customer untuk verifikasi</option>{parties.filter((party) => party.status === "ACTIVE").map((party) => <option key={party.id} value={party.id}>{party.display_name || party.legal_name || party.party_name}</option>)}</select>
                      <button className="btn-ghost text-xs" disabled={busyId === identity.id} onClick={() => void matchIdentity(identity.id)}>Konfirmasi relasi</button>
                    </div> : null}
                  </div>)}
                </div>}
              </div>
            </details>
          </article>;
        })}
      </div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN CRM CLIENT
══════════════════════════════════════════════════ */
/**
 * CrmClient coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function CrmClient() {
  const { user, userRole, roleLevel, departmentId, departmentName, departmentCode, canApproveDivisionScope, isLoading: authLoading } = useAuth();
  const activeRoleCode = String(user?.active_role_code ?? "").toUpperCase().replace(/^ROLE-/, "");
  const canApproveCrmQuotation = userRole === "super_admin" || activeRoleCode === "DIRECTOR" || roleLevel === "GM";
  const canDelegateCrm = roleLevel === "GM" || roleLevel === "SPV" || canApproveDivisionScope || userRole === "super_admin" || ["COMPANY_ADMIN", "DIRECTOR", "CRM_LEAD"].includes(activeRoleCode);
  const canOperateCrm = canPerform("crm:operate", userRole, {
    enabledModules: user?.enabled_modules,
    moduleAccess: user?.module_access,
  });
  const canHandleCrmLeads = canOperateCrm;
  const canEditAllCrmData = canOperateCrm && activeRoleCode !== "SALES";
  const canDeleteCrmLead = userRole === "super_admin" || ["COMPANY_ADMIN", "CRM_LEAD", "SALES"].includes(activeRoleCode);
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("pipeline");
  const [pipelineSubView, setPipelineSubView] = useState<PipelineViewMode>("PIPELINE");
  const [leadsSubView, setLeadsSubView] = useState<"PIPELINE" | "LIST" | "INBOX">("PIPELINE");
  const [contractsSubView, setContractsSubView] = useState<"CONTRACTS" | "TICKETS" | "ENGAGEMENT">("CONTRACTS");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [crmData, setCrmData] = useState<CRMData | null>(null);
  const [crmDash, setCrmDash] = useState<CRMDashboard>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportingCrm, setExportingCrm] = useState(false);
  const [isNewOppOpen, setIsNewOppOpen] = useState(false);

  // 3-Role Hierarchy (GM / SPV / STAFF) & Delegation state
  const [scopeFilter, setScopeFilter] = useState<"MINE" | "TEAM" | "ALL">(roleLevel === "STAFF" ? "MINE" : "ALL");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [delegatingTarget, setDelegatingTarget] = useState<{ record: any; recordType: "INQUIRY" | "OPPORTUNITY" } | null>(null);
  const [delegateUserId, setDelegateUserId] = useState("");
  const [delegateDeptId, setDelegateDeptId] = useState("");
  const [savingDelegate, setSavingDelegate] = useState(false);
  const [stageDetailModal, setStageDetailModal] = useState<{ record: any; recordType: "LEAD" | "OPPORTUNITY"; activeTab: "info" | "followup" | "estimate" | "minutes" } | null>(null);

  // RBAC Access Control Check
  const enabledModules = new Set((user?.enabled_modules || []).map((code) => code.toUpperCase()));
  const isSuper = userRole === "super_admin";
  const isAllowed = !authLoading && canAccessRoute({
    pathname: "/crm",
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: isSuper,
  });
  const visibleTabs = CRM_TABS;

  useEffect(() => {
    const requestedTab = (new URLSearchParams(window.location.search).get("tab") || "").toLowerCase();
    if (!requestedTab) return;
    if (requestedTab === "pipeline" || requestedTab === "deals" || requestedTab === "dashboard") {
      setActiveTab("pipeline");
      setPipelineSubView("PIPELINE");
    } else if (requestedTab === "estimate") {
      setActiveTab("pipeline");
      setPipelineSubView("ESTIMATE");
    } else if (requestedTab === "leads" || requestedTab === "incoming") {
      setActiveTab("leads");
      setLeadsSubView("PIPELINE");
    } else if (requestedTab === "inbox") {
      setActiveTab("leads");
      setLeadsSubView("INBOX");
    } else if (requestedTab === "companies" || requestedTab === "accounts" || requestedTab === "prospects") {
      setActiveTab("companies");
    } else if (requestedTab === "contacts") {
      setActiveTab("contacts");
    } else if (requestedTab === "contracts") {
      setActiveTab("contracts");
      setContractsSubView("CONTRACTS");
    } else if (requestedTab === "tickets") {
      setActiveTab("contracts");
      setContractsSubView("TICKETS");
    } else if (requestedTab === "engagement") {
      setActiveTab("contracts");
      setContractsSubView("ENGAGEMENT");
    }
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setLoadError(null);
    try {
      const { data, dashboard } = await loadCRMData(Array.from(enabledModules), undefined, {
        delegatedModules: user?.delegated_modules,
        activeRoleCode: user?.active_role_code,
        isSuperAdmin: userRole === "super_admin",
      });
      setCrmData(data);
      setCrmDash(dashboard);
    } catch (e) {
      console.error("CRM load error:", e);
      const message = getUserFacingApiError(e, "Data CRM belum dapat dimuat. Periksa akses dan koneksi, lalu coba lagi.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.active_role_code, user?.delegated_modules, user?.enabled_modules, userRole]);

  useEffect(() => {
    if (isAllowed) {
      loadData();
      Promise.all([
        api.get("/api/v1/accounts/users/?page_size=100").catch(() => ({ data: { results: [] } })),
        api.get("/api/v1/master-data/departments").catch(() => ({ data: { data: [] } })),
      ]).then(([uRes, dRes]) => {
        const uRows = uRes.data?.results || uRes.data?.data || [];
        const dRows = dRes.data?.data || dRes.data?.results || [];
        setTeamUsers(Array.isArray(uRows) ? uRows : []);
        setDepartmentsList(Array.isArray(dRows) ? dRows : []);
      });
    }
  }, [loadData, isAllowed]);

  /* Track recently opened CRM */
  useEffect(() => {
    if (isAllowed) {
      feedApi.trackRecentItem({
        item_type: "ORDER",
        object_id: `crm-${activeTab}`,
        title: `CRM — ${CRM_TABS.find(t => t.id === activeTab)?.label || "Dashboard"}`,
        target_url: `/crm`,
      }).catch(() => {});
    }
  }, [activeTab, isAllowed]);

  // Render inline Access Denied if user role has no permission
  if (!authLoading && !isAllowed) {
    return (
      <AccessDeniedState
        title="Akses Modul CRM Dibatasi"
        description="Akun Anda tidak memiliki izin untuk mengelola modul CRM & Commercial. Hubungi tim administrator jika Anda memerlukan akses."
        backHref="/dashboard"
        backLabel="Kembali ke Dashboard"
        section="CRM & Commercial"
      />
    );
  }

  if (authLoading) {
    return null;
  }

/**
 * handleOpportunityCreated coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleOpportunityCreated = (newOpp: any) => {
    setCrmData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        opportunities: [newOpp, ...(prev.opportunities || [])]
      };
    });
  };

/**
 * handleOpportunityDeleted coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleOpportunityDeleted = (id: string | number) => {
    setCrmData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        opportunities: (prev.opportunities || []).filter(item => String(item.id) !== String(id))
      };
    });
  };

/**
 * handlePartyCreated coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handlePartyCreated = (newParty: any) => {
    setCrmData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parties: [newParty, ...(prev.parties || [])]
      };
    });
  };

  const rawData: CRMData = crmData || {
    inquiries:[], requirements:[], opportunities:[], activities:[], stages:[], estimates:[], estimateLines:[],
    quotations:[], businessDocuments:[], approvals:[], deliveries:[], contracts:[], orders:[], conversations:[],
    feedback:[], surveyQuestions:[], surveyResponses:[], surveyAnswers:[], credit:[], cases:[], resolutions:[], products:[], parties:[], contacts:[],
  };

  const filterByRoleAndScope = (rows: any[]) => {
    const myId = user?.id ? String(user.id) : "";
    return (rows || []).filter((item) => {
      if (ownerFilter && String(item.owner_user_id || "") !== ownerFilter) return false;
      if (scopeFilter === "MINE" && myId) {
        return !item.owner_user_id || String(item.owner_user_id) === myId || String(item.created_by_id || "") === myId;
      }
      if (scopeFilter === "TEAM" && departmentId) {
        return !item.department_id || String(item.department_id) === String(departmentId);
      }
      return true;
    });
  };

  const data: CRMData = {
    ...rawData,
    inquiries: filterByRoleAndScope(rawData.inquiries),
    opportunities: filterByRoleAndScope(rawData.opportunities),
  };

  const exportCrmToExcel = async () => {
    setExportingCrm(true);
    try {
      const [allInquiries, allOpportunities, parties, contacts] = await Promise.all([
        loadAllCrmExportRows<any>("/api/v1/crm/customer-inquiries/?page_size=100"),
        loadAllCrmExportRows<any>("/api/v1/crm/opportunities/?page_size=100"),
        loadAllCrmExportRows<any>("/api/v1/master-data/parties/?page_size=300"),
        loadAllCrmExportRows<any>("/api/v1/master-data/contacts/?page_size=300"),
      ]);
      const inquiries = filterByRoleAndScope(allInquiries);
      const opportunities = filterByRoleAndScope(allOpportunities);
      const partyNameById = new Map<string, string>(parties.map((party) => [
        String(party.id), party.display_name || party.legal_name || party.party_name || "",
      ]));
      const userNameById = new Map<string, string>(teamUsers.map((teamUser) => [
        String(teamUser.id), teamUser.full_name || teamUser.email || String(teamUser.id),
      ]));
      const departmentNameById = new Map<string, string>(departmentsList.map((department) => [
        String(department.id), `${department.code || ""}${department.code ? " · " : ""}${department.name || ""}`,
      ]));
      const dateValue = (value: unknown) => value ? formatDate(value as string) : "";
      const workbook = XLSX.utils.book_new();
      const addSheet = (name: string, headers: string[], rows: unknown[][]) => {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), name);
      };
      const partyRows = (type: string) => parties
        .filter((party) => {
          const partyType = String(party.party_type || "CUSTOMER").toUpperCase();
          return type === "VENDOR" ? ["VENDOR", "SUPPLIER"].includes(partyType) : partyType === type;
        })
        .map((party) => [
          party.id || "", party.party_code || "", party.display_name || party.party_name || "",
          party.legal_name || "", String(party.party_type || "CUSTOMER").toUpperCase(),
          party.status || "", party.tax_number || "", dateValue(party.created_at),
        ]);

      addSheet("Lead", ["ID", "No. Lead", "Subjek", "Nama Customer", "Email", "Telepon", "Status", "Sumber", "Domain", "PIC Sales", "Departemen / Divisi", "Tindak Lanjut", "Catatan Kontak", "Deskripsi", "Dibuat"], inquiries.map((lead) => [
        lead.id || "", lead.inquiry_number || "", lead.subject || "", lead.customer_name || "",
        lead.customer_email || "", lead.customer_phone || "", lead.status || "", lead.source_channel || "",
        lead.origin_domain || "", userNameById.get(String(lead.owner_user_id || "")) || lead.owner_user_id || "",
        departmentNameById.get(String(lead.department_id || "")) || lead.department_id || "",
        dateValue(lead.next_follow_up_at), lead.last_contact_note || "", lead.description || "", dateValue(lead.created_at),
      ]));
      addSheet("Opportunity", ["ID", "Nama Opportunity", "Customer", "Pipeline", "Status", "Nilai Estimasi", "Estimasi Margin", "Probabilitas (%)", "Target Closing", "Tindak Lanjut", "Alasan Kalah", "PIC Sales", "Departemen / Divisi", "Dibuat", "Ditutup"], opportunities.map((opportunity) => [
        opportunity.id || "", opportunity.opportunity_name || "",
        partyNameById.get(String(opportunityPartyId(opportunity) || "")) || opportunity.customer_name || "",
        CRM_PIPELINE_STAGE_LABELS[String(opportunity.pipeline_stage || "").toUpperCase()] || opportunity.pipeline_stage || "",
        opportunity.status || "", Number(opportunity.expected_amount || 0), Number(opportunity.expected_margin || 0),
        Number(opportunity.probability_percent || 0), dateValue(opportunity.expected_close_date),
        dateValue(opportunity.next_follow_up_at), opportunity.lost_reason_detail || opportunity.lost_reason || "",
        userNameById.get(String(opportunity.owner_user_id || "")) || opportunity.owner_user_id || "",
        departmentNameById.get(String(opportunity.department_id || "")) || opportunity.department_id || "",
        dateValue(opportunity.created_at), dateValue(opportunity.closed_at),
      ]));
      addSheet("Calon Customer", ["ID", "Kode", "Nama Tampilan", "Nama Legal", "Tipe", "Status", "No. Pajak", "Dibuat"], partyRows("PROSPECT"));
      addSheet("Customer", ["ID", "Kode", "Nama Tampilan", "Nama Legal", "Tipe", "Status", "No. Pajak", "Dibuat"], partyRows("CUSTOMER"));
      addSheet("Partner", ["ID", "Kode", "Nama Tampilan", "Nama Legal", "Tipe", "Status", "No. Pajak", "Dibuat"], partyRows("PARTNER"));
      addSheet("Vendor", ["ID", "Kode", "Nama Tampilan", "Nama Legal", "Tipe", "Status", "No. Pajak", "Dibuat"], partyRows("VENDOR"));
      addSheet("Kontak", ["ID", "Rekanan", "Nama Kontak", "Jabatan", "Email", "Telepon", "Kontak Utama", "Dibuat"], contacts.map((contact) => [
        contact.id || "", partyNameById.get(String(contact.party_id || "")) || "", contact.contact_name || "",
        contact.job_title || "", contact.email || "", contact.phone || "", contact.primary_contact ? "Ya" : "Tidak",
        dateValue(contact.created_at),
      ]));

      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `CRM_Export_${date}.xlsx`);
      toast.success(`File CRM berhasil dibuat: ${inquiries.length} lead, ${opportunities.length} opportunity, ${parties.length} rekanan, dan ${contacts.length} kontak.`);
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Data CRM belum berhasil diekspor. Periksa akses dan koneksi, lalu coba lagi."));
    } finally {
      setExportingCrm(false);
    }
  };

  const openDelegateModal = (record: any, recordType: "INQUIRY" | "OPPORTUNITY") => {
    setDelegatingTarget({ record, recordType });
    setDelegateUserId(record.owner_user_id ? String(record.owner_user_id) : "");
    setDelegateDeptId(record.department_id ? String(record.department_id) : (departmentId || ""));
  };

  const submitDelegation = async () => {
    if (!delegatingTarget || (!delegateUserId && !delegateDeptId)) {
      toast.error("Pilih PIC Sales atau Departemen tujuan delegasi.");
      return;
    }
    setSavingDelegate(true);
    try {
      const endpoint = delegatingTarget.recordType === "INQUIRY"
        ? `/api/v1/crm/customer-inquiries/${delegatingTarget.record.id}/assign`
        : `/api/v1/crm/opportunities/${delegatingTarget.record.id}/assign`;
      await api.post(endpoint, {
        owner_user_id: delegateUserId || null,
        department_id: delegateDeptId || null,
      });
      toast.success("Delegasi PIC Sales & Departemen berhasil disimpan.");
      setDelegatingTarget(null);
      await loadData(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.error?.message || "Gagal mendelegasikan PIC Sales.");
    } finally {
      setSavingDelegate(false);
    }
  };

  const openStageDetailModal = (record: any, recordType: "LEAD" | "OPPORTUNITY") => {
    setStageDetailModal({ record, recordType, activeTab: "info" });
  };

  return (
    <div className="flex flex-col gap-5">
      {loadError && (
        <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          Data CRM tidak dapat dimuat lengkap: {loadError}
        </div>
      )}
      {/* ── Header ──────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM & Commercial</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Inquiry → Opportunity → Quotation → Order & Service
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5",
            roleLevel === "GM"
              ? "bg-indigo-50 border-indigo-200 text-indigo-800"
              : roleLevel === "SPV"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-sky-50 border-sky-200 text-sky-800"
          )}>
            <ShieldCheck size={13} />
            {roleLevel === "GM"
              ? "Hierarki GM · Visibilitas Lintas Divisi"
              : roleLevel === "SPV"
              ? `Hierarki SPV · Supervisor ${departmentName || departmentCode || "Divisi"}`
              : `Hierarki STAFF · Eksekusi ${departmentName || departmentCode || "Sales"}`}
          </span>
          {!canOperateCrm && (
            <span className="px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold flex items-center gap-1.5">
              <ShieldCheck size={13} /> CRM Overseer · View Only
            </span>
          )}
          <button
            type="button"
            onClick={() => void exportCrmToExcel()}
            disabled={exportingCrm || loading}
            className="btn-ghost gap-1.5 text-xs flex-shrink-0"
            title="Unduh Lead, Opportunity, Customer, Calon Customer, Partner, Vendor, dan Kontak ke Excel"
          >
            <Download size={13} />
            {exportingCrm ? "Menyiapkan Excel..." : "Download Data CRM"}
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn-ghost gap-1.5 text-xs flex-shrink-0"
          >
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
            {refreshing ? "Memuat..." : "Refresh Data CRM"}
          </button>
        </div>
      </div>

      {/* ── 3-Role Hierarchy Scope & Sales Delegation Filter Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-text-secondary">Cakupan Visibilitas:</span>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setScopeFilter("MINE")}
              className={cn(
                "rounded-md px-2.5 py-1 text-2xs font-bold transition",
                scopeFilter === "MINE" ? "bg-white text-blue-700 shadow-2xs" : "text-text-secondary hover:text-text-primary"
              )}
            >
              Lead & Deal Saya
            </button>
            {departmentId && (
              <button
                type="button"
                onClick={() => setScopeFilter("TEAM")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-2xs font-bold transition",
                  scopeFilter === "TEAM" ? "bg-white text-blue-700 shadow-2xs" : "text-text-secondary hover:text-text-primary"
                )}
              >
                Divisi {departmentCode || departmentName || "Saya"}
              </button>
            )}
            {(roleLevel === "SPV" || roleLevel === "GM" || isSuper) && (
              <button
                type="button"
                onClick={() => setScopeFilter("ALL")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-2xs font-bold transition",
                  scopeFilter === "ALL" ? "bg-white text-blue-700 shadow-2xs" : "text-text-secondary hover:text-text-primary"
                )}
              >
                Seluruh Tim / Lintas Divisi
              </button>
            )}
          </div>
        </div>
        {(roleLevel === "SPV" || roleLevel === "GM" || canDelegateCrm) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-text-secondary">Filter PIC Sales:</span>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-text-primary"
            >
              <option value="">Semua PIC Sales ({teamUsers.length})</option>
              {teamUsers.map((u: any) => (
                <option key={u.id} value={String(u.id)}>
                  {u.full_name || u.email} {u.role_level ? `(${u.role_level})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Tab Navigation ───────────────────── */}
      <nav aria-label="Navigasi CRM" className="flex items-stretch gap-5 overflow-x-auto border-b border-slate-200">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-1 py-3 text-xs font-semibold whitespace-nowrap transition-colors",
              activeTab === id
                ? "border-brand-primary text-brand-deep-green"
                : "text-text-secondary hover:border-slate-300 hover:text-text-primary"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      {/* ── Tab Content ─────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card rounded-xl p-4 h-24 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {activeTab === "pipeline" && (
            <TabDeals
              data={data}
              approvals={data.approvals}
              isNewOppOpen={isNewOppOpen}
              setIsNewOppOpen={setIsNewOppOpen}
              onRefresh={() => loadData(true)}
              onOpportunityCreated={handleOpportunityCreated}
              onOpportunityDeleted={handleOpportunityDeleted}
              onPartyCreated={handlePartyCreated}
              readOnly={!canOperateCrm}
              canEditAll={canEditAllCrmData}
              currentUserId={user?.id == null ? undefined : String(user.id)}
              canOverride={userRole === "super_admin" || activeRoleCode === "DIRECTOR" || roleLevel === "GM"}
              canDelegate={canDelegateCrm}
              onOpenDelegate={openDelegateModal}
              onOpenStageDetail={openStageDetailModal}
              teamUsers={teamUsers}
              pipelineViewMode={pipelineSubView}
              onPipelineViewModeChange={setPipelineSubView}
              estimateSlot={
                <TabEstimate
                  data={data}
                  approvals={data.approvals}
                  onRefresh={() => loadData(true)}
                  onNavigate={(target) => {
                    if (target === "deals" || target === "pipeline") {
                      setActiveTab("pipeline");
                      setPipelineSubView("PIPELINE");
                    } else {
                      setActiveTab(target);
                    }
                  }}
                  readOnly={!canOperateCrm}
                  canApproveQuotation={canApproveCrmQuotation}
                  currentUserId={user?.id == null ? undefined : String(user.id)}
                  canEditAll={canEditAllCrmData}
                />
              }
            />
          )}
          {activeTab === "leads" && (
            <CrmLeadsView
              data={data}
              teamUsers={teamUsers}
              onRefresh={() => loadData(true)}
              onNavigateToPipeline={() => {
                setActiveTab("pipeline");
                setPipelineSubView("PIPELINE");
              }}
              onOpenDelegate={openDelegateModal}
              canDelegate={canDelegateCrm}
              readOnly={!canHandleCrmLeads}
              canEditAll={canEditAllCrmData}
              canDelete={canDeleteCrmLead}
              currentUserId={user?.id == null ? undefined : String(user.id)}
              initialSubView={leadsSubView}
              inboxSlot={
                <TabCustomerInbox
                  userId={user?.id == null ? undefined : String(user.id)}
                  readOnly={!canOperateCrm}
                  canEditAll={canEditAllCrmData}
                  canMatchIdentity={["ROLE-CRM-LEAD", "CRM_LEAD"].includes(String(user?.active_role_code ?? "").toUpperCase())}
                  parties={data.parties}
                  onRefresh={() => loadData(true)}
                />
              }
            />
          )}
          {activeTab === "companies" && (
            <CrmCompaniesView
              data={data}
              teamUsers={teamUsers}
              onRefresh={() => loadData(true)}
              onPartyCreated={handlePartyCreated}
              readOnly={!canOperateCrm}
              currentUserId={user?.id == null ? undefined : String(user.id)}
              canEditAll={canEditAllCrmData}
            />
          )}
          {activeTab === "contacts" && (
            <CrmContactsView
              data={data}
              onRefresh={() => loadData(true)}
              readOnly={!canOperateCrm}
              currentUserId={user?.id == null ? undefined : String(user.id)}
              canEditAll={canEditAllCrmData}
            />
          )}
          {activeTab === "contracts" && (
            <div className="space-y-4">
              <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
                {[
                  { id: "CONTRACTS" as const, label: "Contracts & Orders" },
                  { id: "TICKETS" as const, label: "Support & Garansi" },
                  { id: "ENGAGEMENT" as const, label: "Engagement & CSAT" },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setContractsSubView(pill.id)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                      contractsSubView === pill.id
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              {contractsSubView === "CONTRACTS" && (
                <TabContracts
                  data={data}
                  onNavigate={(target) => {
                    if (target === "estimate") {
                      setActiveTab("pipeline");
                      setPipelineSubView("ESTIMATE");
                    } else {
                      setActiveTab("pipeline");
                      setPipelineSubView("PIPELINE");
                    }
                  }}
                  onRefresh={() => loadData(true)}
                />
              )}
              {contractsSubView === "TICKETS" && (
                <TabTickets data={data} onRefresh={() => loadData(true)} onPartyCreated={handlePartyCreated} readOnly={!canOperateCrm} />
              )}
              {contractsSubView === "ENGAGEMENT" && (
                <TabEngagement data={data} onRefresh={() => loadData(true)} readOnly={!canOperateCrm} />
              )}
            </div>
          )}
        </>
      )}

      {/* Modal Delegasi PIC Sales & Departemen (SPV / GM) */}
      <Modal
        isOpen={Boolean(delegatingTarget)}
        onClose={() => !savingDelegate && setDelegatingTarget(null)}
        title={`Delegasikan PIC Sales — ${delegatingTarget?.recordType === "INQUIRY" ? "Lead / Inquiry" : "Sales Opportunity"}`}
        size="sm"
      >
        <div className="space-y-3 p-4">
          <p className="text-xs text-text-secondary">
            Sebagai <b>{roleLevel}</b>, Anda dapat menugaskan atau mengalihkan kepemilikan{" "}
            <b>{delegatingTarget?.record?.subject || delegatingTarget?.record?.opportunity_name || "item ini"}</b> kepada anggota tim Sales.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-text-secondary">Pilih PIC Sales (Staff / SPV)</label>
            <select
              value={delegateUserId}
              onChange={(e) => setDelegateUserId(e.target.value)}
              className="input w-full text-xs"
            >
              <option value="">-- Pilih Anggota Tim Sales --</option>
              {teamUsers.map((u: any) => (
                <option key={u.id} value={String(u.id)}>
                  {u.full_name || u.email} ({u.email}) {u.role_level ? `· ${u.role_level}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-text-secondary">Departemen / Divisi (Cost Center)</label>
            <select
              value={delegateDeptId}
              onChange={(e) => setDelegateDeptId(e.target.value)}
              className="input w-full text-xs"
            >
              <option value="">-- Pilih Departemen / Divisi --</option>
              {departmentsList.map((d: any) => (
                <option key={d.id} value={String(d.id)}>
                  [{d.unit_type === "DIVISION" ? "DIVISI" : "DEPT"}] {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDelegatingTarget(null)} disabled={savingDelegate} className="btn-ghost text-xs">
              Batal
            </button>
            <button type="button" onClick={() => void submitDelegation()} disabled={savingDelegate} className="btn-primary text-xs">
              {savingDelegate ? "Menyimpan…" : "Simpan Delegasi"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Diferensiasi Kontekstual: Lead Kualifikasi vs Sales Opportunity Pipeline */}
      <Modal
        isOpen={Boolean(stageDetailModal)}
        onClose={() => setStageDetailModal(null)}
        title={
          stageDetailModal?.recordType === "LEAD"
            ? `Kualifikasi Lead — ${stageDetailModal?.record?.subject || stageDetailModal?.record?.customer_name || "Lead"}`
            : `Pipeline Sales Opportunity — ${stageDetailModal?.record?.opportunity_name || "Opportunity"}`
        }
        size="lg"
      >
        {stageDetailModal && (() => {
          const rec = stageDetailModal.record;
          const isLeadStage = stageDetailModal.recordType === "LEAD" || ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "RESPONDED"].includes(String(rec.status || "").toUpperCase());
          const isOpportunityStage = stageDetailModal.recordType === "OPPORTUNITY";
          const relatedActivities = (rawData.activities || []).filter(
            (a: any) => String(a.opportunity_id || a.opportunity) === String(rec.id)
          );
          const relatedEstimates = (rawData.estimates || []).filter(
            (e: any) => String(e.opportunity_id || e.opportunity) === String(rec.id)
          );

          return (
            <div className="space-y-4 p-4">
              {/* Header Badge Kontekstual */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {isLeadStage && !isOpportunityStage ? (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                      🔍 Tahap Kualifikasi Lead ({rec.status || "NEW"})
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                      💼 Tahap Pipeline Sales ({rec.pipeline_stage || rec.status || "PROSPECT"})
                    </span>
                  )}
                  <span className="text-xs text-text-secondary">
                    PIC: <b>{teamUsers.find((u: any) => String(u.id) === String(rec.owner_user_id))?.full_name || "Belum didelegasikan"}</b>
                  </span>
                </div>
                {canDelegateCrm && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetType = isOpportunityStage ? "OPPORTUNITY" : "INQUIRY";
                      setStageDetailModal(null);
                      openDelegateModal(rec, targetType);
                    }}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    Delegasikan PIC Sales
                  </button>
                )}
              </div>

              {/* Tab Navigasi Modal — Disembunyikan untuk Lead jika belum menjadi Sales Opportunity */}
              <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setStageDetailModal({ ...stageDetailModal, activeTab: "info" })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold",
                    stageDetailModal.activeTab === "info" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                  )}
                >
                  Info Kontak & Kebutuhan
                </button>
                <button
                  type="button"
                  onClick={() => setStageDetailModal({ ...stageDetailModal, activeTab: "followup" })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold",
                    stageDetailModal.activeTab === "followup" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                  )}
                >
                  Riwayat Follow-Up ({relatedActivities.length})
                </button>
                {isOpportunityStage && (
                  <>
                    <button
                      type="button"
                      onClick={() => setStageDetailModal({ ...stageDetailModal, activeTab: "estimate" })}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-semibold",
                        stageDetailModal.activeTab === "estimate" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                      )}
                    >
                      Estimasi Biaya & Pajak ({relatedEstimates.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStageDetailModal({ ...stageDetailModal, activeTab: "minutes" })}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-semibold",
                        stageDetailModal.activeTab === "minutes" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                      )}
                    >
                      Notulensi Rapat
                    </button>
                  </>
                )}
              </div>

              {/* Isi Tab Modal */}
              {stageDetailModal.activeTab === "info" && (
                <div className="grid gap-3 rounded-xl bg-slate-50 p-3.5 text-xs sm:grid-cols-2">
                  <div>
                    <span className="text-text-secondary">Judul / Nama Prospek:</span>
                    <div className="mt-0.5 font-bold text-text-primary">{rec.subject || rec.opportunity_name || "-"}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Pelanggan / Instansi:</span>
                    <div className="mt-0.5 font-bold text-text-primary">
                      {rec.customer_name || (rawData.parties || []).find((p: any) => String(p.id) === String(opportunityPartyId(rec)))?.display_name || "-"}
                    </div>
                  </div>
                  {isOpportunityStage ? (
                    <>
                      <div>
                        <span className="text-text-secondary">Estimasi Nilai Deal:</span>
                        <div className="mt-0.5 font-bold text-emerald-700">{formatMoney(rec.expected_amount)}</div>
                      </div>
                      <div>
                        <span className="text-text-secondary">Probabilitas Menang:</span>
                        <div className="mt-0.5 font-bold text-blue-700">{rec.probability_percent ?? 50}%</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-text-secondary">Email Kontak Lead:</span>
                        <div className="mt-0.5 font-semibold text-text-primary">{rec.customer_email || "-"}</div>
                      </div>
                      <div>
                        <span className="text-text-secondary">Catatan Kontak Terakhir:</span>
                        <div className="mt-0.5 font-semibold text-text-primary">{rec.last_contact_note || "Belum ada catatan kontak"}</div>
                      </div>
                    </>
                  )}
                  <div className="sm:col-span-2">
                    <span className="text-text-secondary">Deskripsi Kebutuhan Awal:</span>
                    <div className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2.5 text-text-primary">
                      {rec.description || rec.follow_up_reason || "Belum ada rincian deskripsi."}
                    </div>
                  </div>
                </div>
              )}

              {stageDetailModal.activeTab === "followup" && (
                <div className="space-y-2 text-xs">
                  {rec.next_follow_up_at && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                      Jadwal Tindak Lanjut Berikutnya: <b>{formatDate(rec.next_follow_up_at)}</b>
                    </div>
                  )}
                  {relatedActivities.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-text-secondary">
                      Belum ada riwayat aktivitas panggilan/follow-up tercatat.
                    </div>
                  ) : (
                    relatedActivities.map((act: any) => (
                      <div key={act.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="font-bold text-text-primary">{act.activity_type} · {act.subject}</div>
                        <div className="mt-0.5 text-2xs text-text-secondary">{formatDate(act.scheduled_at || act.created_at)}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {isOpportunityStage && stageDetailModal.activeTab === "estimate" && (
                <div className="space-y-2 text-xs">
                  {relatedEstimates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-text-secondary">
                      Belum ada Estimasi Biaya (RAB) untuk Opportunity ini. Klik tombol <b>Buat Estimasi / RAB</b> di bawah.
                    </div>
                  ) : (
                    relatedEstimates.map((est: any) => (
                      <div key={est.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                        <div>
                          <div className="font-bold text-text-primary">{est.estimate_number || `EST-${String(est.id).slice(0, 6)}`}</div>
                          <div className="text-2xs text-text-secondary">Status: {est.status || "DRAFT"}</div>
                        </div>
                        <div className="font-bold text-emerald-700">{formatMoney(est.grand_total || est.total_cost || 0)}</div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {isOpportunityStage && stageDetailModal.activeTab === "minutes" && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-text-secondary">
                  Notulensi rapat klien terhubung otomatis dari modul <b>Meeting & Request</b> ketika rapat dijadwalkan dari Opportunity ini.
                </div>
              )}

              {/* Footer Aksi Spesifik Berdasarkan Tahap (Lead vs Sales Opportunity) */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
                {!isOpportunityStage ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await updateCRMInquiryLeadStatus(rec.id, { status: "CONTACTED", note: "Dihubungi oleh tim CRM/Sales" });
                          toast.success("Lead ditandai Sudah Dihubungi.");
                          setStageDetailModal(null);
                          await loadData(true);
                        } catch (err: any) {
                          toast.error(err?.response?.data?.detail || "Gagal memperbarui status Lead.");
                        }
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Tandai Sudah Dihubungi
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!rec.customer_party_id) {
                          toast.error("Hubungkan customer aktif terlebih dahulu pada tab Lead & Inquiry sebelum konversi ke Opportunity.");
                          return;
                        }
                        try {
                          await qualifyInquiry(rec.id);
                          toast.success("Lead berhasil dikonversi menjadi Sales Opportunity!");
                          setStageDetailModal(null);
                          setActiveTab("pipeline");
                          setPipelineSubView("PIPELINE");
                          await loadData(true);
                        } catch (err: any) {
                          toast.error(err?.response?.data?.detail || "Lead belum dapat dikonversi menjadi Opportunity.");
                        }
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Konversi Jadi Opportunity →
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setStageDetailModal(null);
                        setActiveTab("pipeline");
                        setPipelineSubView("ESTIMATE");
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Buat Estimasi / RAB
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await processDealWon(rec.id);
                          toast.success("Deal Won berhasil diproses!");
                          setStageDetailModal(null);
                          await loadData(true);
                        } catch (err: any) {
                          toast.error(err?.response?.data?.detail || "Gagal memproses Deal Won.");
                        }
                      }}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Deal Won / Ajukan Kontrak
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

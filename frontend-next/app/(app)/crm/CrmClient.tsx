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
  ChevronRight, AlertCircle, Star, UserPlus,
  Inbox, MessageCircle,
} from "lucide-react";
import { cn, formatMoney, formatDate, getStatusColor } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";
import {
  loadCRMData, CRMData, CRMDashboard,
  processDealWon, executiveOverrideCredit, qualifyInquiry,
  createOpportunity, deleteOpportunity,
  createCRMActivity, getOpportunityCustomer360, markOpportunityLost, createServiceWorkOrder,
  createCustomerInquiry, deleteCustomerInquiry,
  createCostEstimate, calculateCostEstimate, createQuotationFromEstimate, deleteCostEstimate,
  submitQuotationApproval, approveQuotation, sendQuotation, acceptQuotation, rejectQuotation, convertQuotationToOrder,
  createSupportTicket, checkTicketWarrantyStatus, deleteSupportTicket,
  updateCustomerCreditLimit, calculateCreditSnapshot,
  loadCRMInbox, createInquiryFromConversation, replyToCRMConversation, assignConversationToMe, setConversationDecision,
  confirmCRMIdentityCustomer,
  type CRMInboxConversation,
} from "@/lib/api/crm.api";
import api from "@/lib/api/axios";
import { feedApi } from "@/lib/api/feed.api";
import { AccessDeniedState } from "@/components/ui/AccessDeniedState";
import { canAccessRoute } from "@/lib/access/module-contract";
import { canPerform } from "@/lib/access/capability-contract";

/* ── Tabs Configuration ──────────────────────────── */
const CRM_TABS = [
  { id: "dashboard",   label: "Dashboard",            icon: BarChart3     },
  { id: "inbox",       label: "Customer Inbox",       icon: Inbox         },
  { id: "deals",       label: "Deals & Credit",       icon: TrendingUp    },
  { id: "estimate",    label: "Estimating & Quoting", icon: Calculator, module: "SALES" },
  { id: "tickets",     label: "Support & Garansi",    icon: PhoneCall, module: "SERVICE" },
  { id: "incoming",    label: "Incoming Inquiry",     icon: FileText      },
  { id: "accounts",    label: "Accounts",             icon: Building2     },
  { id: "contracts",   label: "Contracts & Orders",   icon: FileCheck, module: "SALES" },
  { id: "engagement",  label: "Engagement",           icon: MessageSquare },
];

/* ── Shared Helpers ──────────────────────────────── */
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
  onClick: () => Promise<void>;
  label: string;
  variant?: "primary" | "ghost" | "danger";
  icon?: React.ElementType;
  small?: boolean;
}
/**
 * ActionBtn coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function ActionBtn({ onClick, label, variant = "primary", icon: Icon, small }: ActionBtnProps) {
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
      disabled={busy}
      className={cn("inline-flex items-center gap-1.5 rounded-lg font-medium transition-all", base, colors, busy && "opacity-60 cursor-wait")}
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
function KpiCard({ label, value, icon: Icon, iconBg = "#EAF6FF", iconColor = "#294BB2" }: {
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
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newParty: any) => void;
}) {
  const [partyForm, setPartyForm] = useState({ legal_name: "", display_name: "", email: "", party_code: "" });
  const [isPartySubmitting, setIsPartySubmitting] = useState(false);

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
    setIsPartySubmitting(true);
    try {
      const payload = {
        display_name: partyForm.display_name.trim() || partyForm.legal_name.trim(),
        legal_name: partyForm.legal_name.trim() || partyForm.display_name.trim(),
        email: partyForm.email?.trim() || undefined,
        party_code: partyForm.party_code?.trim() || `CUST-${Date.now().toString().slice(-4)}`,
        party_type: "CUSTOMER",
      };
      const res = await api.post("/api/v1/master-data/parties/", payload);
      const newParty = res.data;
      toast.success("Pelanggan baru berhasil ditambahkan!");
      onSuccess(newParty);
      setPartyForm({ legal_name: "", display_name: "", email: "", party_code: "" });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Gagal menambahkan pelanggan.");
    } finally {
      setIsPartySubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tambah Pelanggan Baru ke Database" size="sm">
      <div className="flex flex-col gap-3 p-4">
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">Nama Instansi / Perusahaan *</label>
          <input 
            className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" 
            placeholder="PT Mega Properti..." 
            value={partyForm.display_name} 
            onChange={e => setPartyForm(p => ({ ...p, display_name: e.target.value }))} 
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
          <button type="button" onClick={handleQuickAdd} disabled={isPartySubmitting} className="btn-primary">
            {isPartySubmitting ? "Menyimpan..." : "Simpan Pelanggan"}
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
    !["WON","LOST","CANCELLED","CANCEL","BATAL"].includes(o.status?.toUpperCase() || "") &&
    !["LOST","CANCELLED","CANCEL","BATAL"].includes(o.pipeline_stage?.toUpperCase() || "")
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard 
          label="Bobot Pipeline" 
          value={formatMoney(dash?.weighted_project_value)} 
          icon={DollarSign} 
          iconBg="#EAF6FF"
          iconColor="#294BB2"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card rounded-xl p-4">
          <h3 className="text-sm font-bold text-text-primary mb-3">Pipeline Aktif</h3>
          {pipeline.length === 0 ? <EmptyState msg="Belum ada opportunity aktif." /> : (
            <div className="flex flex-col gap-2">
              {pipeline.slice(0,8).map(o => (
                <div key={o.id} className="flex items-center justify-between p-2.5 rounded-lg border border-text-tertiary/60 hover:bg-bg-lighter">
                  <div>
                    <div className="text-sm font-medium text-text-primary">{o.opportunity_name || `Opp #${String(o.id).slice(0,6)}`}</div>
                    <div className="text-xs text-text-secondary">{o.pipeline_stage || o.status} · {formatMoney(o.expected_amount)}</div>
                  </div>
                  <span className="text-xs font-bold text-brand-green">{o.probability_percent||0}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card rounded-xl p-4">
          <h3 className="text-sm font-bold text-text-primary mb-3">Kontrol Komersial & Service</h3>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center p-2.5 rounded-lg border border-text-tertiary/60">
              <span className="text-sm text-text-secondary">Approval Quotation</span>
              <span className="font-semibold text-amber-600">{pendingApprovals} menunggu</span>
            </div>
            <div className="flex justify-between items-center p-2.5 rounded-lg border border-text-tertiary/60">
              <span className="text-sm text-text-secondary">Tiket Support & Klaim</span>
              <span className="font-semibold text-text-primary">{(data.cases||[]).length} kasus</span>
            </div>
            <div className="flex justify-between items-center p-2.5 rounded-lg border border-text-tertiary/60">
              <span className="text-sm text-text-secondary">Quotation Resmi</span>
              <span className="font-semibold text-text-primary">{(data.quotations||[]).length} dokumen</span>
            </div>
            <div className="flex justify-between items-center p-2.5 rounded-lg border border-text-tertiary/60">
              <span className="text-sm text-text-secondary">Inquiry Masuk</span>
              <span className="font-semibold text-text-primary">{(data.inquiries||[]).length} inquiry</span>
            </div>
          </div>
        </div>
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
  readOnly = false,
}: {
  data: CRMData; approvals: any[]; isNewOppOpen: boolean;
  setIsNewOppOpen: (v: boolean) => void; onRefresh: () => void;
  onOpportunityCreated?: (newOpp: any) => void;
  onOpportunityDeleted?: (id: string | number) => void;
  onPartyCreated?: (newParty: any) => void;
  readOnly?: boolean;
}) {
  const [form, setForm] = useState({ 
    opportunity_name: "", 
    customer_party: "", 
    expected_amount: 150000000, 
    probability_percent: 50, 
    pipeline_stage: "OPEN" 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultModal, setResultModal] = useState<any>(null);
  const [isQuickPartyOpen, setIsQuickPartyOpen] = useState(false);
  const [oppFilter, setOppFilter] = useState<"ACTIVE" | "CANCELLED" | "ALL">("ACTIVE");
  const [activityOpp, setActivityOpp] = useState<any>(null);
  const [customer360, setCustomer360] = useState<any>(null);
  const [activityForm, setActivityForm] = useState({ activity_type: "CALL", subject: "", scheduled_at: "" });

  const allOpps = data.opportunities || [];
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
    return !["CANCELLED", "CANCEL", "BATAL", "LOST"].includes(st) && !["CANCELLED", "CANCEL", "BATAL", "LOST"].includes(ps);
  });
  const cancelledOpps = allOpps.filter(o => {
    const st = (o.status || "").toUpperCase();
    const ps = (o.pipeline_stage || "").toUpperCase();
    return ["CANCELLED", "CANCEL", "BATAL", "LOST"].includes(st) || ["CANCELLED", "CANCEL", "BATAL", "LOST"].includes(ps);
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
    try {
      await executiveOverrideCredit(opp.id);
      toast.success("Executive override berhasil!");
      onRefresh();
    } catch (e: any) { 
      toast.error(e?.response?.data?.detail || "Gagal override"); 
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
    const reasons = ["PRICE_TOO_HIGH", "LOST_FEATURES", "BUDGET_CANCELLED", "COMPETITOR", "NO_RESPONSE", "OTHER"];
    const reason = prompt(`Pilih alasan deal kalah:\n${reasons.map((item, index) => `${index + 1}. ${item}`).join("\n")}\nMasukkan nomor pilihan (1–6):`);
    if (!reason) return;
    const selected = reasons[Number(reason) - 1];
    if (!selected) { toast.error("Pilihan alasan tidak valid."); return; }
    const detail = selected === "OTHER" ? prompt("Jelaskan alasan deal kalah:") || "" : undefined;
    try { await markOpportunityLost(id, selected, detail); toast.success("Opportunity ditandai kalah."); onRefresh(); }
    catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal menyimpan alasan kalah."); }
  };

  const handleActivitySave = async () => {
    if (!activityOpp || !activityForm.subject.trim()) { toast.error("Isi catatan aktivitas terlebih dahulu."); return; }
    try {
      await createCRMActivity({ opportunity_id: activityOpp.id, party_id: activityOpp.customer_party, activity_type: activityForm.activity_type, subject: activityForm.subject.trim(), scheduled_at: activityForm.scheduled_at ? new Date(activityForm.scheduled_at).toISOString() : null });
      toast.success("Aktivitas tersimpan."); setActivityForm({ activity_type: "CALL", subject: "", scheduled_at: "" }); onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal menyimpan aktivitas."); }
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
    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
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
      setForm({ opportunity_name: "", customer_party: "", expected_amount: 150000000, probability_percent: 50, pipeline_stage: "OPEN" });
      onRefresh();
    } catch (e: any) { 
      toast.error(e?.response?.data?.detail || "Gagal buat opportunity"); 
    } finally {
      setIsSubmitting(false);
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
    catch { 
      toast.error("Gagal hitung credit."); 
    }
  };

/**
 * handleCreditLimit coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleCreditLimit = async (partyId: string | number, currentLimit: number) => {
    const newLimit = prompt(`Credit limit baru untuk customer ini (saat ini: ${formatMoney(currentLimit)}):`, String(currentLimit));
    if (!newLimit) return;
    try {
      await updateCustomerCreditLimit({ party_id: partyId, credit_limit: Number(newLimit) });
      toast.success("Credit limit diperbarui!"); 
      onRefresh();
    } catch { 
      toast.error("Gagal update credit limit."); 
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Opportunities (col span 3) */}
      <div className="lg:col-span-3 card rounded-xl p-4">
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
          <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
            {displayedOpps.map(o => {
/**
 * cust coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
              const cust = (data.parties||[]).find(p => String(p.id) === String(o.customer_party));
              const isWon = ["WON","CLOSED_WON"].includes((o.status||"").toUpperCase());
              const isCancelled = ["CANCELLED","CANCEL","BATAL","LOST"].includes((o.status||"").toUpperCase()) || ["CANCELLED","CANCEL","BATAL","LOST"].includes((o.pipeline_stage||"").toUpperCase());

              return (
                <div 
                  key={o.id} 
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-colors gap-3",
                    isCancelled 
                      ? "border-red-200 bg-red-50/40 opacity-75" 
                      : "border-text-tertiary/60 hover:bg-bg-lighter"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-semibold truncate", isCancelled ? "line-through text-gray-500" : "text-text-primary")}>
                        {o.opportunity_name || `Opportunity ${String(o.id).slice(0,8)}`}
                      </span>
                      <StatusBadge status={o.status || "OPEN"} />
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      <span className="font-medium text-slate-700">{cust?.display_name || cust?.legal_name || "Pelanggan Umum"}</span> · <b>{formatMoney(o.expected_amount)}</b>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!readOnly && !isCancelled && <ActionBtn onClick={async () => { setActivityOpp(o); setActivityForm({ activity_type: "CALL", subject: "", scheduled_at: "" }); }} label="Aktivitas" small variant="ghost" />}
                    {!readOnly && cust && <ActionBtn onClick={() => handleCustomer360(o.id)} label="Customer 360" small variant="ghost" />}
                    {!readOnly ? (
                      <>
                        {!isCancelled && (
                          <ActionBtn onClick={() => handleDealWon(o)} label="Deal Won" small />
                        )}
                        {isWon && !isCancelled && (
                          <ActionBtn onClick={() => handleExecOverride(o)} label="Executive override" variant="ghost" small />
                        )}
                        {isCancelled ? <button onClick={() => handleDelete(o.id)} title="Hapus permanen" className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button> : <ActionBtn onClick={() => handleMarkLost(o.id)} label="Tandai kalah" small variant="ghost" />}
                      </>
                    ) : (
                      <span className="text-2xs text-text-secondary italic">
                        {isCancelled ? "Dibatalkan" : isWon ? "Deal Closed Won" : o.pipeline_stage || "In Pipeline"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Credit Management (col span 2) */}
      <div className="lg:col-span-2 card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-primary">Credit Management</h3>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold", (data.parties||[]).length >= 20 ? "bg-emerald-100 text-emerald-700" : (data.parties||[]).length >= 5 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700")}><Users size={11} />{(data.parties||[]).length}</span>
        </div>
        <p className="text-xs text-text-secondary mb-3">Kontrol plafon kredit, outstanding AR, dan kelayakan approval transaksi klien.</p>
        {(data.parties||[]).length === 0 ? <EmptyState msg="Belum ada customer terdaftar." /> : (
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
            {(data.parties||[]).map((p, customerIndex) => {
              const snap = (data.credit||[]).find(c => String(c.customer_party) === String(p.id));
              const limit = snap?.credit_limit || 0;
              const outstanding = snap?.outstanding_receivable || 0;
              const overdue = snap?.overdue_amount || 0;
              const available = snap?.available_credit ?? limit;
              const status = snap?.credit_status || (limit > 0 ? "AVAILABLE" : "NO_LIMIT");
              const isBlocked = status === "HOLD" || (limit > 0 && available < 0) || overdue > 0;
              return (
                <div key={p.id} className={cn("p-3 rounded-xl border", isBlocked ? "border-red-200 bg-red-50" : "border-text-tertiary/60")}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary"><span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black", ["bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700"][customerIndex % 4])}>{String(p.display_name || p.legal_name || "C").slice(0, 2).toUpperCase()}</span><span className="truncate">{p.display_name || p.legal_name}</span></span>
                    <StatusBadge status={status} />
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-text-secondary mb-2">
                    <span>Limit: <b className="text-brand-green">{formatMoney(limit)}</b></span>
                    <span>Outstanding: <b className={outstanding > 0 ? "text-amber-600" : ""}>{formatMoney(outstanding)}</b></span>
                    <span>Sisa: <b className={available >= 0 ? "text-brand-green" : "text-red-600"}>{formatMoney(available)}</b></span>
                    <span>Overdue: <b className={overdue > 0 ? "text-red-600" : ""}>{formatMoney(overdue)}</b></span>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1.5">
                      <ActionBtn onClick={() => handleCreditLimit(p.id, limit)} label="Atur Limit" small variant="ghost" />
                      <ActionBtn onClick={() => handleCreditRecalc(p.id)} label="Hitung ulang" small variant="ghost" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
              <label className="text-xs font-medium text-text-secondary">Pilih Rekanan / Pelanggan (Database)</label>
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
              <option value="">-- Pilih Rekanan dari Database (Opsional) --</option>
              {(data.parties || []).map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.display_name || p.legal_name} {p.party_code ? `(${p.party_code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Expected Amount (Rp)</label>
              <input 
                type="number" 
                className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" 
                value={form.expected_amount} 
                onChange={e => setForm(f => ({ ...f, expected_amount: Number(e.target.value) }))} 
              />
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
            <label className="text-xs font-medium text-text-secondary mb-1 block">Pipeline Stage</label>
            <select 
              className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white" 
              value={form.pipeline_stage} 
              onChange={e => setForm(f => ({ ...f, pipeline_stage: e.target.value }))}
            >
              {["OPEN","QUALIFICATION","PROPOSAL","NEGOTIATION","WON","LOST"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2 justify-end">
            <button onClick={() => setIsNewOppOpen(false)} disabled={isSubmitting} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} disabled={isSubmitting} className="btn-primary">
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
              </div>
            )}
            <button onClick={() => setResultModal(null)} className="btn-primary self-end">Tutup</button>
          </div>
        </Modal>
      )}
      <Modal isOpen={Boolean(activityOpp)} onClose={() => setActivityOpp(null)} title={`Aktivitas — ${activityOpp?.opportunity_name || "Opportunity"}`} size="sm">
        <div className="space-y-3">
          <label className="block text-xs font-medium">Jenis aktivitas<select className="input mt-1 w-full" value={activityForm.activity_type} onChange={e => setActivityForm({ ...activityForm, activity_type: e.target.value })}><option value="CALL">Telepon</option><option value="MEETING">Meeting</option><option value="NOTE">Catatan</option><option value="FOLLOW_UP">Follow-up</option></select></label>
          <label className="block text-xs font-medium">Catatan<textarea className="input mt-1 w-full min-h-20" value={activityForm.subject} onChange={e => setActivityForm({ ...activityForm, subject: e.target.value })} placeholder="Ringkasan percakapan atau tindak lanjut" /></label>
          <label className="block text-xs font-medium">Jadwalkan follow-up (opsional)<input className="input mt-1 w-full" type="datetime-local" value={activityForm.scheduled_at} onChange={e => setActivityForm({ ...activityForm, scheduled_at: e.target.value })} /></label>
          <div className="text-xs text-text-secondary">Riwayat: {(data.activities || []).filter(a => String(a.opportunity_id) === String(activityOpp?.id)).length} aktivitas</div>
          <div className="max-h-32 overflow-y-auto space-y-1">{(data.activities || []).filter(a => String(a.opportunity_id) === String(activityOpp?.id)).map(a => <div key={a.id} className="border rounded p-2 text-xs"><b>{a.activity_type}</b> · {a.subject}<div className="text-text-secondary">{a.scheduled_at ? formatDate(a.scheduled_at) : "Selesai"}</div></div>)}</div>
          <button onClick={handleActivitySave} className="btn-primary w-full">Simpan aktivitas</button>
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
function TabEstimate({ data, approvals, onRefresh, readOnly = false }: { data: CRMData; approvals: any[]; onRefresh: () => void; readOnly?: boolean }) {
  const [isEstModal, setIsEstModal] = useState(false);
  const [estForm, setEstForm] = useState({ opportunity: "", direct_cost: 100000000, overhead_cost: 30000000, markup_percent: 30, description: "" });

  /**
   * Creates a cost estimate and preserves a null opportunity relationship when none is selected.
   *
   * The CRM API owns persistence; this handler owns submission feedback, modal lifecycle, and parent refresh.
   */
  const handleCreate = async () => {
    try {
      await createCostEstimate({ ...estForm, opportunity: estForm.opportunity || null });
      toast.success("Cost Estimate dibuat!"); setIsEstModal(false); onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal buat estimate"); }
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
    if (s === "DRAFT") return <ActionBtn onClick={async () => { await submitQuotationApproval(q.id); toast.success("Submitted!"); onRefresh(); }} label="Minta Approval" small />;
    if (s === "PENDING_APPROVAL") return <ActionBtn onClick={async () => { await approveQuotation(q.id, approvals); toast.success("Disetujui!"); onRefresh(); }} label="Setujui" small />;
    if (s === "APPROVED") return <ActionBtn onClick={async () => { await sendQuotation(q.id); toast.success("Dikirim!"); onRefresh(); }} label="Kirim" small />;
    if (s === "SENT") return <ActionBtn onClick={async () => { await acceptQuotation(q.id); toast.success("Accepted!"); onRefresh(); }} label="Accept" small />;
    if (s === "ACCEPTED") return <ActionBtn onClick={async () => { await convertQuotationToOrder(q.id); toast.success("Converted to Order!"); onRefresh(); }} label="📦 Convert to Order" small />;
    return <StatusBadge status={s} />;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Cost Estimates */}
      <div className="lg:col-span-3 card rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Cost Estimating (HPP & Margin)</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-2xs font-bold">{(data.estimates||[]).length} Estimate</span>
            {!readOnly && (
              <button onClick={() => setIsEstModal(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Estimasi HPP</button>
            )}
          </div>
        </div>
        {(data.estimates||[]).length === 0 ? <EmptyState msg="Belum ada kalkulasi biaya." /> : (
          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
            {(data.estimates||[]).map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 rounded-xl border border-text-tertiary/60 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Cost Estimate {String(e.estimate_number || e.id).slice(0,12)}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    Total HPP: <b>{formatMoney(e.total_cost)}</b> · Markup: <b>{e.markup_percent||0}%</b> · Penawaran: <b className="text-brand-green">{formatMoney(e.offered_amount || e.offered_price || 0)}</b>
                  </div>
                  <StatusBadge status={e.status || "DRAFT"} />
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ActionBtn onClick={async () => { await calculateCostEstimate(e.id); toast.success("HPP dihitung."); onRefresh(); }} label="Hitung HPP" small variant="ghost" />
                    <ActionBtn onClick={async () => { await createQuotationFromEstimate(e.id); toast.success("Quotation dibuat!"); onRefresh(); }} label="📄 Buat Quotation" small />
                    <button onClick={async () => { if(!confirm("Hapus?")) return; await deleteCostEstimate(e.id); toast.success("Dihapus."); onRefresh(); }} className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quotations */}
      <div className="lg:col-span-2 card rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Sales Quotations</h3>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-2xs font-bold">{(data.quotations||[]).length} Dok</span>
        </div>
        {(data.quotations||[]).length === 0 ? <EmptyState msg="Belum ada quotation." /> : (
          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
            {(data.quotations||[]).map(q => (
              <div key={q.id} className="flex items-center justify-between p-3 rounded-xl border border-text-tertiary/60 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{q.quotation_number || `Quote ${String(q.id).slice(0,8)}`}</div>
                  <div className="text-xs text-text-secondary">Total: <b>{formatMoney(q.total_amount)}</b></div>
                  <StatusBadge status={q.status || "DRAFT"} />
                </div>
                <div className="flex-shrink-0">
                  {readOnly ? <StatusBadge status={q.status || "DRAFT"} /> : getQuotActions(q)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Buat Estimasi HPP */}
      <Modal isOpen={isEstModal} onClose={() => setIsEstModal(false)} title="Buat Estimasi HPP" size="md">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Opportunity</label>
            <select
              className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green bg-white"
              value={estForm.opportunity}
              onChange={e => setEstForm(f => ({...f, opportunity: e.target.value}))}
            >
              <option value="">-- Pilih Opportunity Terkait --</option>
              {(data.opportunities || []).map(o => (
                <option key={o.id} value={String(o.id)}>
                  {o.opportunity_name || `Opp #${o.id}`} ({formatMoney(o.expected_amount)})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Biaya Langsung (Rp)</label>
              <input type="number" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={estForm.direct_cost} onChange={e => setEstForm(f => ({...f, direct_cost: Number(e.target.value)}))} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Biaya Overhead (Rp)</label>
              <input type="number" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={estForm.overhead_cost} onChange={e => setEstForm(f => ({...f, overhead_cost: Number(e.target.value)}))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Markup %</label>
            <input type="number" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={estForm.markup_percent} onChange={e => setEstForm(f => ({...f, markup_percent: Number(e.target.value)}))} />
          </div>
          <div className="p-3 rounded-xl bg-brand-light-green text-xs">
            <b>Total HPP:</b> {formatMoney(estForm.direct_cost + estForm.overhead_cost)} &nbsp;|&nbsp;
            <b>Penawaran:</b> {formatMoney((estForm.direct_cost + estForm.overhead_cost) * (1 + estForm.markup_percent/100))}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setIsEstModal(false)} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} className="btn-primary">Buat Estimasi</button>
          </div>
        </div>
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
  const [isOpen, setIsOpen] = useState(false);
  const [isQuickPartyOpen, setIsQuickPartyOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", customer_party: "", priority: "NORMAL", case_type: "WARRANTY_CLAIM", description: "", serial_number: "" });

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
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 card rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Tiket Support & Klaim Garansi</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-2xs font-bold">{(data.cases||[]).length} Tiket</span>
            {!readOnly && (
              <button onClick={() => setIsOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Tiket Baru</button>
            )}
          </div>
        </div>
        {(data.cases||[]).length === 0 ? <EmptyState msg="Belum ada tiket support." /> : (
          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
            {(data.cases||[]).map(c => {
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
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-text-tertiary/60 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{c.subject || `Tiket ${String(c.id).slice(0,8)}`}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {cust?.display_name || "Customer"} · Prioritas: <b>{c.priority || "NORMAL"}</b>
                    </div>
                    <StatusBadge status={c.status || "OPEN"} />
                    {c.warranty_status && <span className={cn("ml-1 px-2 py-0.5 rounded-full text-2xs font-semibold", c.warranty_status === "WARRANTY_ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{c.warranty_status}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!readOnly ? (
                      <>
                        {!resolved && <ActionBtn onClick={async () => { try { const result = await checkTicketWarrantyStatus(c.id); toast.success(`Garansi: ${result.warranty_status}`); onRefresh(); } catch (e: any) { toast.error(e?.response?.data?.detail || "Pemeriksaan garansi gagal."); } }} label="Periksa garansi" small variant="ghost" />}
                        {c.warranty_status === "WARRANTY_ACTIVE" && !resolved && <ActionBtn onClick={async () => { try { await createServiceWorkOrder(c.id); toast.success("Work Order teknisi dibuat."); onRefresh(); } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal membuat Work Order."); } }} label="Buat Work Order" small />}
                        {resolved && (
                          <span className="px-2 py-0.5 rounded-full bg-brand-light-green text-brand-deep-green text-2xs font-semibold">RESOLVED</span>
                        )}
                        <button onClick={async () => { if(!confirm("Hapus tiket?")) return; await deleteSupportTicket(c.id); toast.success("Dihapus."); onRefresh(); }} className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50">
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <span className="text-2xs text-text-secondary italic">
                        {resolved ? "RESOLVED" : c.status || "OPEN"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="lg:col-span-2 card rounded-xl p-4">
        <h3 className="text-sm font-bold mb-3">Riwayat Solusi & Garansi</h3>
        {(data.resolutions||[]).length === 0 ? <EmptyState msg="Belum ada resolusi tercatat." /> : (
          <div className="flex flex-col gap-2">
            {(data.resolutions||[]).slice(0,6).map(r => (
              <div key={r.id} className="p-2.5 rounded-xl border border-text-tertiary/60">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{r.resolution_type || "Solusi"}</span>
                  <StatusBadge status={r.resolution_type || "RESOLVED"} />
                </div>
                <p className="text-xs text-text-secondary mt-1">{r.resolution_notes || "-"}</p>
              </div>
            ))}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Prioritas</label>
              <select className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                {["LOW","NORMAL","HIGH","URGENT"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Tipe Kasus</label>
              <select className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.case_type} onChange={e => setForm(f => ({...f, case_type: e.target.value}))}>
                {["WARRANTY_CLAIM","SERVICE_REQUEST","BUG_REPORT","COMPLAINT","GENERAL"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
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
function TabIncoming({ data, onRefresh, onPartyCreated, readOnly = false }: { data: CRMData; onRefresh: () => void; onPartyCreated?: (newParty: any) => void; readOnly?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isQuickPartyOpen, setIsQuickPartyOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", customer_name: "", customer_email: "", customer_party: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setIsSubmitting(true);
    try { 
      const payload = {
        subject: form.subject.trim(),
        customer_name: form.customer_name.trim(),
        customer_email: form.customer_email?.trim() || undefined,
        customer_party: form.customer_party ? form.customer_party : null,
        description: form.description?.trim() || "",
      };
      await createCustomerInquiry(payload); 
      toast.success("Inquiry berhasil dibuat!"); 
      setIsOpen(false); 
      setForm({ subject: "", customer_name: "", customer_email: "", customer_party: "", description: "" });
      onRefresh(); 
    }
    catch (e: any) { 
      toast.error(e?.response?.data?.detail || e?.message || "Gagal membuat inquiry"); 
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold">Incoming Customer Inquiries</h3>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-2xs font-bold">{(data.inquiries||[]).length} Inquiry</span>
          {!readOnly && (
            <button onClick={() => setIsOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Inquiry Baru</button>
          )}
        </div>
      </div>
      {(data.inquiries||[]).length === 0 ? <EmptyState msg="Belum ada incoming inquiry." /> : (
        <div className="flex flex-col gap-2">
          {(data.inquiries||[]).map(x => {
/**
 * isQual coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
            const isQual = (x.status||"").toUpperCase() === "QUALIFIED";
/**
 * reqs coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
            const reqs = (data.requirements||[]).filter(r => String(r.inquiry) === String(x.id));
            return (
              <div key={x.id} className="flex items-center justify-between p-3 rounded-xl border border-text-tertiary/60 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{x.subject || `Inquiry ${String(x.id).slice(0,8)}`}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    <b>{x.customer_name || "-"}</b> ({x.customer_email || "-"}) · <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-2xs">{reqs.length} Spesifikasi</span>
                  </div>
                  <StatusBadge status={x.status || "NEW"} />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!readOnly ? (
                    <>
                      {!isQual ? (
                        <ActionBtn onClick={async () => { await qualifyInquiry(x.id); toast.success("Inquiry berhasil dikualifikasi."); onRefresh(); }} label="Jadikan opportunity" small />
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-brand-light-green text-brand-deep-green text-2xs font-semibold">QUALIFIED</span>
                      )}
                      <button onClick={async () => { if(!confirm("Hapus inquiry?")) return; await deleteCustomerInquiry(x.id); toast.success("Dihapus."); onRefresh(); }} className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={13} />
                      </button>
                    </>
                  ) : (
                    <span className="text-2xs text-text-secondary italic">
                      {isQual ? "QUALIFIED" : x.status || "NEW"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Buat Inquiry Baru" size="md">
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
            <label className="text-xs font-medium text-text-secondary mb-1 block">Email Customer</label>
            <input type="email" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.customer_email} onChange={e => setForm(f => ({...f, customer_email: e.target.value}))} placeholder="email@domain.com" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-text-secondary">Pilih Rekanan / Pelanggan (Database)</label>
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
              onChange={e => {
                const selectedId = e.target.value;
/**
 * party coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
                const party = (data.parties || []).find(p => String(p.id) === String(selectedId));
                setForm(f => ({
                  ...f,
                  customer_party: selectedId,
                  customer_name: party ? (party.display_name || party.legal_name) : f.customer_name,
                  customer_email: party?.email || f.customer_email,
                }));
              }}
            >
              <option value="">-- Rekanan Bebas / Input Manual --</option>
              {(data.parties || []).map(p => (
                <option key={p.id} value={String(p.id)}>{p.display_name || p.legal_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Deskripsi Kebutuhan</label>
            <textarea rows={3} className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Rincian kebutuhan klien..." />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setIsOpen(false)} disabled={isSubmitting} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? "Menyimpan..." : "Buat Inquiry"}
            </button>
          </div>
        </div>
      </Modal>

      <QuickAddPartyModal
        isOpen={isQuickPartyOpen}
        onClose={() => setIsQuickPartyOpen(false)}
        onSuccess={(newParty) => {
          if (onPartyCreated) onPartyCreated(newParty);
          setForm(f => ({
            ...f,
            customer_party: String(newParty.id),
            customer_name: newParty.display_name || newParty.legal_name,
            customer_email: newParty.email || f.customer_email,
          }));
        }}
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
function TabAccounts({ data }: { data: CRMData }) {
  return (
    <div className="card rounded-xl p-4">
      <h3 className="text-sm font-bold mb-4">Master Rekanan (Customers & Partners)</h3>
      {(data.parties||[]).length === 0 ? <EmptyState msg="Belum ada rekanan terdaftar." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(data.parties||[]).map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-text-tertiary/60 hover:bg-bg-lighter">
              <div>
                <div className="text-sm font-semibold">{p.display_name || p.legal_name || p.id}</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  Code: <code className="font-mono bg-gray-100 px-1 rounded text-2xs">{p.party_code || "-"}</code> · Type: <b>{p.party_type || "CUSTOMER"}</b>
                </div>
                {p.email && <div className="text-xs text-text-secondary">{p.email}</div>}
              </div>
              <StatusBadge status={p.status || "ACTIVE"} />
            </div>
          ))}
        </div>
      )}
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
function TabContracts({ data }: { data: CRMData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card rounded-xl p-4">
        <h3 className="text-sm font-bold mb-3">Sales Orders</h3>
        {(data.orders||[]).length === 0 ? <EmptyState msg="Belum ada sales order." /> : (
          <div className="flex flex-col gap-2">
            {(data.orders||[]).map(o => (
              <div key={o.id} className="flex justify-between items-center p-3 rounded-xl border border-text-tertiary/60">
                <div>
                  <div className="text-sm font-semibold">{o.order_number || `Order ${String(o.id).slice(0,8)}`}</div>
                  <div className="text-xs text-text-secondary">Nilai: <b>{formatMoney(o.total_amount)}</b></div>
                </div>
                <StatusBadge status={o.status || "CONFIRMED"} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card rounded-xl p-4">
        <h3 className="text-sm font-bold mb-3">Contracts</h3>
        {(data.contracts||[]).length === 0 ? <EmptyState msg="Belum ada kontrak." /> : (
          <div className="flex flex-col gap-2">
            {(data.contracts||[]).map(c => (
              <div key={c.id} className="flex justify-between items-center p-3 rounded-xl border border-text-tertiary/60">
                <div>
                  <div className="text-sm font-semibold">{c.contract_number || `Contract ${String(c.id).slice(0,8)}`}</div>
                  <div className="text-xs text-text-secondary">{formatDate(c.start_date)} – {formatDate(c.end_date)}</div>
                </div>
                <StatusBadge status={c.status || "ACTIVE"} />
              </div>
            ))}
          </div>
        )}
      </div>
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
function TabEngagement({ data }: { data: CRMData }) {
  return (
    <div className="card rounded-xl p-4">
      <h3 className="text-sm font-bold mb-4">Customer Feedback & Review</h3>
      {(data.feedback||[]).length === 0 ? <EmptyState msg="Belum ada feedback customer." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(data.feedback||[]).map(f => (
            <div key={f.id} className="p-3 rounded-xl border border-text-tertiary/60">
              <div className="flex items-center gap-1 mb-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={13} className={i < (f.rating_score||5) ? "text-amber-400 fill-amber-400" : "text-gray-300"} />
                ))}
                <span className="text-xs text-text-secondary ml-1">{f.rating_score||5}/5</span>
              </div>
              <p className="text-xs text-text-secondary">{f.comments || "-"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabCustomerInbox({ userId, readOnly, canMatchIdentity, parties, onRefresh }: { userId?: string; readOnly: boolean; canMatchIdentity: boolean; parties: any[]; onRefresh: () => void }) {
  const [rows, setRows] = useState<CRMInboxConversation[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [partyChoice, setPartyChoice] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyRequestIds, setReplyRequestIds] = useState<Record<string, string>>({});
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
      <div className="card rounded-xl p-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Inbox CRM</h3>
          <p className="text-xs text-text-secondary mt-1">Pesan dari pipeline internal, dikelompokkan dan diarahkan berdasarkan konfigurasi unit bisnis Marka.</p>
        </div>
        <button className="btn-ghost text-xs" onClick={() => void refreshInbox()} disabled={loadingInbox}><RefreshCw size={13} className={cn("mr-1", loadingInbox && "animate-spin")} />Refresh</button>
      </div>
      {loadingInbox ? <div className="card rounded-xl p-5 text-xs text-text-secondary">Memuat conversation…</div> : rows.length === 0 ? (
        <div className="card rounded-xl p-5"><EmptyState msg="Belum ada conversation masuk. Conversation akan muncul setelah sumber integrasi internal mengirim event." /></div>
      ) : rows.map((row) => (
        <article key={row.id} className="card rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><MessageCircle size={15} className="text-brand-deep-green" /><h4 className="text-sm font-semibold truncate">{row.subject || "Percakapan masuk"}</h4><StatusBadge status={row.status} /></div>
              <p className="text-[11px] text-text-secondary mt-1">{row.business_unit_name || row.business_unit_code ? `Unit ${row.business_unit_name || row.business_unit_code} · ` : ""}{row.external_thread?.external_thread_id ? `Thread ${row.external_thread.external_thread_id}` : `Conversation ${row.id.slice(0, 8)}`}{row.inquiry_id ? " · Sudah dieskalasi menjadi Inquiry" : ""}</p>
            </div>
            <div className="flex gap-2">
              {!readOnly && row.assigned_user_id !== userId && <button className="btn-ghost text-xs" disabled={busyId === row.id || !userId} onClick={() => void assignToMe(row)}><UserPlus size={13} className="mr-1" />{row.assigned_user_id ? "Tugaskan ke saya" : "Ambil"}</button>}
              {!readOnly && !row.inquiry_id && <button className="btn-primary text-xs" disabled={busyId === row.id} onClick={() => void makeInquiry(row)}><Plus size={13} className="mr-1" />Jadikan Inquiry</button>}
              {!readOnly && !row.inquiry_id && row.status !== "IGNORED" && <button className="btn-ghost text-xs" disabled={busyId === row.id} onClick={() => void decideConversation(row, "IGNORE")}>Abaikan</button>}
              {!readOnly && row.status === "IGNORED" && <button className="btn-ghost text-xs" disabled={busyId === row.id} onClick={() => void decideConversation(row, "REOPEN")}>Pulihkan</button>}
              {row.inquiry && <span className="px-2 py-1 text-[11px] rounded-lg bg-emerald-50 text-emerald-800">Inquiry {row.inquiry.inquiry_number}</span>}
            </div>
          </div>
          <div className="rounded-lg bg-bg-lighter p-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
            {(row.messages ?? []).length ? row.messages!.map((message) => (
              <div key={message.id} className={cn("max-w-[88%] rounded-lg px-3 py-2 text-xs", message.direction === "INBOUND" ? "self-start bg-white border border-text-tertiary/40" : "self-end bg-emerald-50")}>{message.message_text}</div>
            )) : <p className="text-xs text-text-secondary">{row.latest_message?.message_text || "Belum ada pesan yang tersimpan."}</p>}
          </div>
          {!readOnly && row.external_thread && row.status !== "IGNORED" && (
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                className="input-field flex-1 min-h-16 text-xs"
                maxLength={10000}
                value={replyDrafts[row.id] || ""}
                onChange={(event) => {
                  setReplyDrafts((current) => ({ ...current, [row.id]: event.target.value }));
                  setReplyRequestIds((current) => current[row.id] ? current : ({ ...current, [row.id]: crypto.randomUUID() }));
                }}
                placeholder="Tulis balasan untuk dikirim melalui adapter kanal..."
              />
              <button className="btn-primary text-xs self-end" disabled={busyId === row.id || !(replyDrafts[row.id] || "").trim()} onClick={() => void sendReply(row)}>
                {busyId === row.id ? "Mengirim..." : "Kirim balasan"}
              </button>
            </div>
          )}
          {(row.external_identities ?? []).map((identity) => (
            <div key={identity.id} className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-text-secondary">Identitas {identity.type} {identity.masked_value} · verifikasi sumber {identity.channel_verification_status} · customer {identity.customer_match_status}</span>
              {identity.customer_match_status === "CONFIRMED" && identity.party_id ? (
                <span className="text-emerald-800">{parties.find((party) => String(party.id) === String(identity.party_id))?.display_name || parties.find((party) => String(party.id) === String(identity.party_id))?.legal_name || "Customer terverifikasi"}</span>
              ) : canMatchIdentity && identity.channel_verification_status === "VERIFIED" ? (
                <>
                  <select className="input-field py-1 text-[11px]" value={partyChoice[identity.id] || ""} onChange={(event) => setPartyChoice((current) => ({ ...current, [identity.id]: event.target.value }))}>
                    <option value="">Pilih customer untuk verifikasi</option>
                    {parties.filter((party) => party.status === "ACTIVE").map((party) => <option key={party.id} value={party.id}>{party.display_name || party.legal_name || party.party_name}</option>)}
                  </select>
                  <button className="btn-ghost text-[11px]" disabled={busyId === identity.id} onClick={() => void matchIdentity(identity.id)}>Konfirmasi relasi</button>
                </>
              ) : null}
            </div>
          ))}
          <div className="text-[11px] text-text-secondary">{row.assigned_user?.full_name ? `PIC: ${row.assigned_user.full_name}` : row.assigned_user_id ? "PIC sudah ditentukan" : "Belum ada PIC"} · {row.priority || "NORMAL"}</div>
        </article>
      ))}
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
  const { user, userRole, isLoading: authLoading } = useAuth();
  const canOperateCrm = canPerform("crm:operate", userRole, {
    enabledModules: user?.enabled_modules,
    moduleAccess: user?.module_access,
  });
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [crmData, setCrmData] = useState<CRMData | null>(null);
  const [crmDash, setCrmDash] = useState<CRMDashboard>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNewOppOpen, setIsNewOppOpen] = useState(false);

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
  const visibleTabs = CRM_TABS.filter((tab) => !tab.module || isSuper || enabledModules.has(tab.module));

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
      const error = e as any;
      setLoadError(error?.response?.data?.error?.message || error?.response?.data?.detail || error?.message || "Gagal memuat data CRM");
      toast.error("Gagal memuat data CRM");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.active_role_code, user?.delegated_modules, user?.enabled_modules, userRole]);

  useEffect(() => {
    if (isAllowed) {
      loadData();
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

  const data: CRMData = crmData || {
    inquiries:[], requirements:[], opportunities:[], activities:[], stages:[], estimates:[], estimateLines:[],
    quotations:[], approvals:[], deliveries:[], contracts:[], orders:[], conversations:[],
    feedback:[], credit:[], cases:[], resolutions:[], products:[], parties:[],
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
        <div className="flex items-center gap-2">
          {!canOperateCrm && (
            <span className="px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold flex items-center gap-1.5">
              <ShieldCheck size={13} /> CRM Overseer · View Only
            </span>
          )}
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

      {/* ── Tab Navigation ───────────────────── */}
      <div className="flex gap-1.5 p-1.5 bg-bg-lighter rounded-xl border border-text-tertiary/50 overflow-x-auto">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
              activeTab === id
                ? "bg-white text-brand-deep-green shadow-sm border border-text-tertiary/30"
                : "text-text-secondary hover:text-text-primary hover:bg-white/60"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

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
          {activeTab === "dashboard"  && <TabDashboard data={data} dash={crmDash} />}
          {activeTab === "inbox"      && <TabCustomerInbox userId={user?.id == null ? undefined : String(user.id)} readOnly={!canOperateCrm} canMatchIdentity={["ROLE-CRM-LEAD", "CRM_LEAD", "ROLE-SALES", "SALES"].includes(String(user?.active_role_code ?? "").toUpperCase())} parties={data.parties} onRefresh={() => loadData(true)} />}
          {activeTab === "deals"      && (
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
            />
          )}
          {activeTab === "estimate"   && <TabEstimate data={data} approvals={data.approvals} onRefresh={() => loadData(true)} readOnly={!canOperateCrm} />}
          {activeTab === "tickets"    && <TabTickets data={data} onRefresh={() => loadData(true)} onPartyCreated={handlePartyCreated} readOnly={!canOperateCrm} />}
          {activeTab === "incoming"   && <TabIncoming data={data} onRefresh={() => loadData(true)} onPartyCreated={handlePartyCreated} readOnly={!canOperateCrm} />}
          {activeTab === "accounts"   && <TabAccounts data={data} />}
          {activeTab === "contracts"  && <TabContracts data={data} />}
          {activeTab === "engagement" && <TabEngagement data={data} />}
        </>
      )}
    </div>
  );
}

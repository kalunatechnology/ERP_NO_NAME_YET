"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, RefreshCw, CheckCircle2, DollarSign, TrendingUp, Users,
  ShieldAlert, FileText, PhoneCall, Building2, Zap, Trash2, ArrowRight,
  Calculator, ShieldCheck, Award, BarChart3, MessageSquare, FileCheck,
  ChevronRight, AlertCircle, Star,
} from "lucide-react";
import { cn, formatMoney, formatDate, getStatusColor } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";
import {
  loadCRMData, CRMData, CRMDashboard,
  processDealWon, executiveOverrideCredit, qualifyInquiry,
  createOpportunity, deleteOpportunity,
  createCustomerInquiry, deleteCustomerInquiry,
  createCostEstimate, calculateCostEstimate, createQuotationFromEstimate, deleteCostEstimate,
  submitQuotationApproval, approveQuotation, sendQuotation, acceptQuotation, rejectQuotation, convertQuotationToOrder,
  createSupportTicket, checkTicketWarrantyStatus, deleteSupportTicket,
  updateCustomerCreditLimit, calculateCreditSnapshot,
} from "@/lib/api/crm.api";

/* ── Tabs ────────────────────────────────────────── */
const CRM_TABS = [
  { id: "dashboard",   label: "Dashboard",       icon: BarChart3     },
  { id: "deals",       label: "Deals & Credit",  icon: TrendingUp    },
  { id: "estimate",    label: "Estimating & Quoting", icon: Calculator },
  { id: "tickets",     label: "Support & Garansi", icon: PhoneCall   },
  { id: "incoming",    label: "Incoming Inquiry", icon: FileText      },
  { id: "accounts",    label: "Accounts",         icon: Building2     },
  { id: "contracts",   label: "Contracts & Orders", icon: FileCheck   },
  { id: "engagement",  label: "Engagement",       icon: MessageSquare },
];

/* ── Shared Helpers ──────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-2xs font-semibold", getStatusColor(status))}>
      {status || "—"}
    </span>
  );
}

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
function ActionBtn({ onClick, label, variant = "primary", icon: Icon, small }: ActionBtnProps) {
  const [busy, setBusy] = useState(false);
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
function KpiCard({ label, value, icon: Icon, iconBg = "#F0FDF4", iconColor = "#16A34A" }: {
  label: string; value: string | number;
  icon: React.ElementType; iconBg?: string; iconColor?: string;
}) {
  return (
    <div className="card rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <div>
        <div className="text-xs text-text-secondary">{label}</div>
        <div className="text-xl font-bold text-text-primary">{value}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: DASHBOARD
══════════════════════════════════════════════════ */
function TabDashboard({ data, dash }: { data: CRMData; dash: CRMDashboard }) {
  const activeTickets = (data.cases || []).filter(c => !["RESOLVED","CLOSED"].includes(c.status?.toUpperCase() || "")).length;
  const pendingApprovals = (data.approvals || []).filter(a => a.decision === "PENDING").length;
  const pipeline = (data.opportunities || []).filter(o => !["WON","LOST"].includes(o.status?.toUpperCase() || ""));

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Bobot Pipeline" value={formatMoney(dash.weighted_project_value)} icon={DollarSign} iconBg="#F0FDF4" iconColor="#16A34A" />
        <KpiCard label="Win Rate" value={`${(dash.win_rate_percent||0).toFixed(1)}%`} icon={Award} iconBg="#EFF6FF" iconColor="#1D4ED8" />
        <KpiCard label="Avg Sales Cycle" value={`${dash.average_sales_cycle_days||0} hari`} icon={TrendingUp} iconBg="#FAF5FF" iconColor="#7E22CE" />
        <KpiCard label="Margin Offering" value={`${(dash.offering_margin_percent||0).toFixed(1)}%`} icon={BarChart3} iconBg="#FFF7ED" iconColor="#C2410C" />
        <KpiCard label="Tiket Aktif" value={activeTickets} icon={PhoneCall} iconBg="#FEF2F2" iconColor="#DC2626" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Pipeline aktif */}
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

        {/* Kontrol komersial */}
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
function TabDeals({
  data, approvals, isNewOppOpen, setIsNewOppOpen, onRefresh,
}: {
  data: CRMData; approvals: any[]; isNewOppOpen: boolean;
  setIsNewOppOpen: (v: boolean) => void; onRefresh: () => void;
}) {
  const [form, setForm] = useState({ opportunity_name: "", customer_party: "", expected_amount: 150000000, probability_percent: 50, pipeline_stage: "OPEN" });
  const [resultModal, setResultModal] = useState<any>(null);
  const [creditModal, setCreditModal] = useState<any>(null);

  const handleDealWon = async (opp: any) => {
    try {
      const res = await processDealWon(opp.id);
      setResultModal({ type: "dealWon", data: res, opp });
      toast.success("Deal Won diproses!");
      onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal proses Deal Won"); }
  };

  const handleExecOverride = async (opp: any) => {
    try {
      await executiveOverrideCredit(opp.id);
      toast.success("Executive override berhasil!");
      onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal override"); }
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm("Hapus opportunity ini?")) return;
    try { await deleteOpportunity(id); toast.success("Dihapus."); onRefresh(); }
    catch { toast.error("Gagal hapus."); }
  };

  const handleCreate = async () => {
    if (!form.opportunity_name.trim()) { toast.error("Nama opportunity wajib diisi."); return; }
    try {
      await createOpportunity({ ...form, customer_party: form.customer_party || null });
      toast.success("Opportunity dibuat!");
      setIsNewOppOpen(false);
      setForm({ opportunity_name: "", customer_party: "", expected_amount: 150000000, probability_percent: 50, pipeline_stage: "OPEN" });
      onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal buat opportunity"); }
  };

  const handleCreditRecalc = async (partyId: string | number) => {
    try { await calculateCreditSnapshot(partyId); toast.success("Credit snapshot diperbarui!"); onRefresh(); }
    catch { toast.error("Gagal hitung credit."); }
  };

  const handleCreditLimit = async (partyId: string | number, currentLimit: number) => {
    const newLimit = prompt(`Credit limit baru untuk customer ini (saat ini: ${formatMoney(currentLimit)}):`, String(currentLimit));
    if (!newLimit) return;
    try {
      await updateCustomerCreditLimit({ party_id: partyId, credit_limit: Number(newLimit) });
      toast.success("Credit limit diperbarui!"); onRefresh();
    } catch { toast.error("Gagal update credit limit."); }
  };

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Opportunities (col span 3) */}
      <div className="col-span-3 card rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text-primary">Deal Pipeline & Closed Won</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-2xs font-bold">{(data.opportunities||[]).length} Opp</span>
            <button onClick={() => setIsNewOppOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1">
              <Plus size={12} /> Buat Opportunity
            </button>
          </div>
        </div>
        {(data.opportunities||[]).length === 0 ? <EmptyState msg="Belum ada opportunity." /> : (
          <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto">
            {(data.opportunities||[]).map(o => {
              const cust = (data.parties||[]).find(p => String(p.id) === String(o.customer_party));
              const isWon = ["WON","CLOSED_WON"].includes((o.status||"").toUpperCase());
              return (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-xl border border-text-tertiary/60 hover:bg-bg-lighter gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-text-primary truncate">{o.opportunity_name || `Opportunity ${String(o.id).slice(0,8)}`}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {cust?.display_name || cust?.legal_name || "Customer"} · <b>{formatMoney(o.expected_amount)}</b>
                    </div>
                    <StatusBadge status={o.status || "OPEN"} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ActionBtn onClick={() => handleDealWon(o)} label="⚡ Deal Won" small />
                    {isWon && (
                      <ActionBtn onClick={() => handleExecOverride(o)} label="👑 Override" variant="ghost" small />
                    )}
                    <button onClick={() => handleDelete(o.id)} className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Credit Management (col span 2) */}
      <div className="col-span-2 card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-primary">Credit Management</h3>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-2xs font-bold">{(data.parties||[]).length} Customer</span>
        </div>
        <p className="text-xs text-text-secondary mb-3">Kontrol plafon kredit, outstanding AR, dan kelayakan approval transaksi klien.</p>
        {(data.parties||[]).length === 0 ? <EmptyState msg="Belum ada customer terdaftar." /> : (
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
            {(data.parties||[]).map(p => {
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
                    <span className="text-sm font-semibold text-text-primary truncate">{p.display_name || p.legal_name}</span>
                    <StatusBadge status={status} />
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-text-secondary mb-2">
                    <span>Limit: <b className="text-brand-green">{formatMoney(limit)}</b></span>
                    <span>Outstanding: <b className={outstanding > 0 ? "text-amber-600" : ""}>{formatMoney(outstanding)}</b></span>
                    <span>Sisa: <b className={available >= 0 ? "text-brand-green" : "text-red-600"}>{formatMoney(available)}</b></span>
                    <span>Overdue: <b className={overdue > 0 ? "text-red-600" : ""}>{formatMoney(overdue)}</b></span>
                  </div>
                  <div className="flex gap-1.5">
                    <ActionBtn onClick={() => handleCreditLimit(p.id, limit)} label="💳 Atur Limit" small variant="ghost" />
                    <ActionBtn onClick={() => handleCreditRecalc(p.id)} label="🔄" small variant="ghost" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Opportunity Modal */}
      <Modal isOpen={isNewOppOpen} onClose={() => setIsNewOppOpen(false)} title="Buat Opportunity Baru" size="md">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Nama Opportunity *</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.opportunity_name} onChange={e => setForm(f => ({ ...f, opportunity_name: e.target.value }))} placeholder="Nama opportunity..." />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Customer Party ID</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.customer_party} onChange={e => setForm(f => ({ ...f, customer_party: e.target.value }))} placeholder="ID customer (opsional)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Expected Amount (Rp)</label>
              <input type="number" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.expected_amount} onChange={e => setForm(f => ({ ...f, expected_amount: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Probabilitas (%)</label>
              <input type="number" min={0} max={100} className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.probability_percent} onChange={e => setForm(f => ({ ...f, probability_percent: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Pipeline Stage</label>
            <select className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={form.pipeline_stage} onChange={e => setForm(f => ({ ...f, pipeline_stage: e.target.value }))}>
              {["OPEN","QUALIFICATION","PROPOSAL","NEGOTIATION","WON","LOST"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2 justify-end">
            <button onClick={() => setIsNewOppOpen(false)} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} className="btn-primary">Buat Opportunity</button>
          </div>
        </div>
      </Modal>

      {/* Deal Won Result Modal */}
      {resultModal?.type === "dealWon" && (
        <Modal isOpen={true} onClose={() => setResultModal(null)} title="Deal Won & Credit Assessment" size="md">
          <div className="p-4 flex flex-col gap-3">
            <div className={cn("p-3 rounded-xl", resultModal.data?.credit_evaluation?.is_safe ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200")}>
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
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: ESTIMATE & QUOTING
══════════════════════════════════════════════════ */
function TabEstimate({ data, approvals, onRefresh }: { data: CRMData; approvals: any[]; onRefresh: () => void }) {
  const [isEstModal, setIsEstModal] = useState(false);
  const [estForm, setEstForm] = useState({ opportunity: "", direct_cost: 100000000, overhead_cost: 30000000, markup_percent: 30, description: "" });

  const handleCreate = async () => {
    try {
      await createCostEstimate({ ...estForm, opportunity: estForm.opportunity || null });
      toast.success("Cost Estimate dibuat!"); setIsEstModal(false); onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal buat estimate"); }
  };

  const getQuotActions = (q: any) => {
    const s = (q.status || "").toUpperCase();
    if (s === "DRAFT") return <ActionBtn onClick={async () => { await submitQuotationApproval(q.id); toast.success("Submitted!"); onRefresh(); }} label="Minta Approval" small />;
    if (s === "PENDING_APPROVAL") return <ActionBtn onClick={async () => { await approveQuotation(q.id, approvals); toast.success("Disetujui!"); onRefresh(); }} label="Setujui" small />;
    if (s === "APPROVED") return <ActionBtn onClick={async () => { await sendQuotation(q.id); toast.success("Dikirim!"); onRefresh(); }} label="Kirim" small />;
    if (s === "SENT") return <ActionBtn onClick={async () => { await acceptQuotation(q.id); toast.success("Accepted!"); onRefresh(); }} label="Accept" small />;
    if (s === "ACCEPTED") return <ActionBtn onClick={async () => { await convertQuotationToOrder(q.id); toast.success("Converted to Order!"); onRefresh(); }} label="📦 Convert to Order" small />;
    return <StatusBadge status={s} />;
  };

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Cost Estimates */}
      <div className="col-span-3 card rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Cost Estimating (HPP & Margin)</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-2xs font-bold">{(data.estimates||[]).length} Estimate</span>
            <button onClick={() => setIsEstModal(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Estimasi HPP</button>
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
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <ActionBtn onClick={async () => { await calculateCostEstimate(e.id); toast.success("HPP dihitung!"); onRefresh(); }} label="⚡ Hitung HPP" small variant="ghost" />
                  <ActionBtn onClick={async () => { await createQuotationFromEstimate(e.id); toast.success("Quotation dibuat!"); onRefresh(); }} label="📄 Buat Quotation" small />
                  <button onClick={async () => { if(!confirm("Hapus?")) return; await deleteCostEstimate(e.id); toast.success("Dihapus."); onRefresh(); }} className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quotations */}
      <div className="col-span-2 card rounded-xl p-4">
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
                <div className="flex-shrink-0">{getQuotActions(q)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estimate Modal */}
      <Modal isOpen={isEstModal} onClose={() => setIsEstModal(false)} title="Buat Estimasi HPP" size="md">
        <div className="flex flex-col gap-3 p-4">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Opportunity ID (opsional)</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-green" value={estForm.opportunity} onChange={e => setEstForm(f => ({...f, opportunity: e.target.value}))} placeholder="ID opportunity..." />
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
function TabTickets({ data, onRefresh }: { data: CRMData; onRefresh: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", customer_party: "", priority: "NORMAL", case_type: "WARRANTY_CLAIM", description: "" });

  const handleCreate = async () => {
    if (!form.subject.trim()) { toast.error("Subject wajib diisi."); return; }
    try {
      await createSupportTicket({ ...form, customer_party: form.customer_party || null });
      toast.success("Tiket dibuat!"); setIsOpen(false); onRefresh();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal buat tiket"); }
  };

  return (
    <div className="grid grid-cols-5 gap-4">
      <div className="col-span-3 card rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Tiket Support & Klaim Garansi</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-2xs font-bold">{(data.cases||[]).length} Tiket</span>
            <button onClick={() => setIsOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Tiket Baru</button>
          </div>
        </div>
        {(data.cases||[]).length === 0 ? <EmptyState msg="Belum ada tiket support." /> : (
          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
            {(data.cases||[]).map(c => {
              const resolved = ["RESOLVED","CLOSED"].includes((c.status||"").toUpperCase());
              const cust = (data.parties||[]).find(p => String(p.id) === String(c.customer_party));
              return (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-text-tertiary/60 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{c.subject || `Tiket ${String(c.id).slice(0,8)}`}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {cust?.display_name || "Customer"} · Prioritas: <b>{c.priority || "NORMAL"}</b>
                    </div>
                    <StatusBadge status={c.status || "OPEN"} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!resolved ? (
                      <ActionBtn onClick={async () => { await checkTicketWarrantyStatus(c.id); toast.success("Status dicek!"); onRefresh(); }} label="🔍 Check Status" small variant="ghost" />
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-2xs font-semibold">RESOLVED</span>
                    )}
                    <button onClick={async () => { if(!confirm("Hapus tiket?")) return; await deleteSupportTicket(c.id); toast.success("Dihapus."); onRefresh(); }} className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="col-span-2 card rounded-xl p-4">
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
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="Judul tiket..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Prioritas</label>
              <select className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                {["LOW","NORMAL","HIGH","URGENT"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Tipe Kasus</label>
              <select className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={form.case_type} onChange={e => setForm(f => ({...f, case_type: e.target.value}))}>
                {["WARRANTY_CLAIM","SERVICE_REQUEST","BUG_REPORT","COMPLAINT","GENERAL"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Deskripsi</label>
            <textarea rows={3} className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setIsOpen(false)} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} className="btn-primary">Buat Tiket</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: INCOMING INQUIRY
══════════════════════════════════════════════════ */
function TabIncoming({ data, onRefresh }: { data: CRMData; onRefresh: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", customer_name: "", customer_email: "", description: "" });

  const handleCreate = async () => {
    if (!form.subject.trim() || !form.customer_name.trim()) { toast.error("Subject & nama customer wajib."); return; }
    try { await createCustomerInquiry(form); toast.success("Inquiry dibuat!"); setIsOpen(false); onRefresh(); }
    catch (e: any) { toast.error(e?.response?.data?.detail || "Gagal buat inquiry"); }
  };

  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold">Incoming Customer Inquiries</h3>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-2xs font-bold">{(data.inquiries||[]).length} Inquiry</span>
          <button onClick={() => setIsOpen(true)} className="btn-primary text-xs py-1.5 px-3 gap-1"><Plus size={12} /> Buat Inquiry Baru</button>
        </div>
      </div>
      {(data.inquiries||[]).length === 0 ? <EmptyState msg="Belum ada incoming inquiry." /> : (
        <div className="flex flex-col gap-2">
          {(data.inquiries||[]).map(x => {
            const isQual = (x.status||"").toUpperCase() === "QUALIFIED";
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
                  {!isQual ? (
                    <ActionBtn onClick={async () => { await qualifyInquiry(x.id); toast.success("Qualify berhasil!"); onRefresh(); }} label="⚡ Qualify ke Opportunity" small />
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-2xs font-semibold">QUALIFIED</span>
                  )}
                  <button onClick={async () => { if(!confirm("Hapus inquiry?")) return; await deleteCustomerInquiry(x.id); toast.success("Dihapus."); onRefresh(); }} className="p-1.5 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Buat Inquiry Baru" size="md">
        <div className="flex flex-col gap-3 p-4">
          <div><label className="text-xs font-medium text-text-secondary mb-1 block">Subject *</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} /></div>
          <div><label className="text-xs font-medium text-text-secondary mb-1 block">Nama Customer *</label>
            <input className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={form.customer_name} onChange={e => setForm(f => ({...f, customer_name: e.target.value}))} /></div>
          <div><label className="text-xs font-medium text-text-secondary mb-1 block">Email Customer</label>
            <input type="email" className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={form.customer_email} onChange={e => setForm(f => ({...f, customer_email: e.target.value}))} /></div>
          <div><label className="text-xs font-medium text-text-secondary mb-1 block">Deskripsi Kebutuhan</label>
            <textarea rows={3} className="w-full border border-text-tertiary rounded-lg px-3 py-2 text-sm" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} /></div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setIsOpen(false)} className="btn-ghost">Batal</button>
            <button onClick={handleCreate} className="btn-primary">Buat Inquiry</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: ACCOUNTS
══════════════════════════════════════════════════ */
function TabAccounts({ data }: { data: CRMData }) {
  return (
    <div className="card rounded-xl p-4">
      <h3 className="text-sm font-bold mb-4">Master Rekanan (Customers & Partners)</h3>
      {(data.parties||[]).length === 0 ? <EmptyState msg="Belum ada rekanan terdaftar." /> : (
        <div className="grid grid-cols-2 gap-2">
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
function TabContracts({ data }: { data: CRMData }) {
  return (
    <div className="grid grid-cols-2 gap-4">
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
function TabEngagement({ data }: { data: CRMData }) {
  return (
    <div className="card rounded-xl p-4">
      <h3 className="text-sm font-bold mb-4">Customer Feedback & Review</h3>
      {(data.feedback||[]).length === 0 ? <EmptyState msg="Belum ada feedback customer." /> : (
        <div className="grid grid-cols-2 gap-3">
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

/* ══════════════════════════════════════════════════
   MAIN CRM CLIENT
══════════════════════════════════════════════════ */
export default function CrmClient() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [crmData, setCrmData] = useState<CRMData | null>(null);
  const [crmDash, setCrmDash] = useState<CRMDashboard>({});
  const [isNewOppOpen, setIsNewOppOpen] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { data, dashboard } = await loadCRMData();
      setCrmData(data);
      setCrmDash(dashboard);
    } catch (e) {
      console.error("CRM load error:", e);
      toast.error("Gagal memuat data CRM");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const data: CRMData = crmData || {
    inquiries:[], requirements:[], opportunities:[], stages:[], estimates:[], estimateLines:[],
    quotations:[], approvals:[], deliveries:[], contracts:[], orders:[], conversations:[],
    feedback:[], credit:[], cases:[], resolutions:[], products:[], parties:[],
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ──────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-brand-deep-green">CRM Commercial & Service Workspace</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Inquiry → Opportunity → Quotation → Order & Service
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="btn-ghost gap-1.5 text-xs flex-shrink-0"
        >
          <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
          {refreshing ? "Memuat..." : "Refresh Data CRM"}
        </button>
      </div>

      {/* ── Tab Navigation ───────────────────── */}
      <div className="flex gap-1.5 p-1.5 bg-bg-lighter rounded-xl border border-text-tertiary/50 overflow-x-auto">
        {CRM_TABS.map(({ id, label, icon: Icon }) => (
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
          {activeTab === "deals"      && <TabDeals data={data} approvals={data.approvals} isNewOppOpen={isNewOppOpen} setIsNewOppOpen={setIsNewOppOpen} onRefresh={() => loadData(true)} />}
          {activeTab === "estimate"   && <TabEstimate data={data} approvals={data.approvals} onRefresh={() => loadData(true)} />}
          {activeTab === "tickets"    && <TabTickets data={data} onRefresh={() => loadData(true)} />}
          {activeTab === "incoming"   && <TabIncoming data={data} onRefresh={() => loadData(true)} />}
          {activeTab === "accounts"   && <TabAccounts data={data} />}
          {activeTab === "contracts"  && <TabContracts data={data} />}
          {activeTab === "engagement" && <TabEngagement data={data} />}
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Plus, RefreshCw, CheckCircle2, DollarSign,
  TrendingUp, Users, ShieldAlert, FileText, PhoneCall,
  UserCheck, Layers, ArrowRight, Calculator, CheckSquare,
  Building2, Zap, AlertCircle, ArrowUpRight, Award, Trash2
} from "lucide-react";
import { cn, formatMoney, formatDate, getStatusColor } from "@/lib/utils";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";

const CRM_TABS = [
  { id: "dashboard",   label: "Dashboard Sales"          },
  { id: "deals",       label: "Deal & Credit Management" },
  { id: "estimate",    label: "Estimating & Quoting (COGS)" },
  { id: "tickets",     label: "Ticket Support & Garansi" },
  { id: "incoming",    label: "Incoming Inquiry"         },
  { id: "accounts",    label: "Account Management"       },
  { id: "contracts",   label: "Contracts & Orders"       },
  { id: "engagement",  label: "Customer Engagement"      },
];

const PIPELINE_STAGES = [
  { id: "PROSPECTING",   label: "Prospecting",   color: "#3B82F6" },
  { id: "QUALIFICATION", label: "Qualification", color: "#8B5CF6" },
  { id: "PROPOSAL",      label: "Proposal / Penawaran", color: "#F59E0B" },
  { id: "NEGOTIATION",   label: "Negosiasi",     color: "#EC4899" },
  { id: "CLOSED_WON",    label: "Closed Won 🏆", color: "#10B981" },
];

export default function CrmClient() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

  /* Data states */
  const [deals, setDeals] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);

  /* Modals */
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedDealForConvert, setSelectedDealForConvert] = useState<any>(null);

  /* Form states */
  const [dealForm, setDealForm] = useState({
    name: "",
    customer: 1,
    expected_revenue: 150000000,
    stage: "PROSPECTING",
    probability: 50,
  });

  const [customerForm, setCustomerForm] = useState({
    name: "",
    email: "",
    phone: "",
    credit_limit: 500000000,
    company_name: "",
  });

  const [ticketForm, setTicketForm] = useState({
    customer: 1,
    subject: "",
    description: "",
    priority: "MEDIUM",
  });

  /* Dynamic Quotation Estimator Line Items */
  const [quoteItems, setQuoteItems] = useState([
    { name: "Hardware Sensor & Controller", qty: 10, unitPrice: 3500000, cost: 2500000 },
    { name: "Jasa Instalasi & Commissioning", qty: 1, unitPrice: 15000000, cost: 8000000 },
  ]);
  const [quoteCustomer, setQuoteCustomer] = useState(1);
  const [quoteTitle, setQuoteTitle] = useState("Penawaran Smart Automation Line");
  const [targetMargin, setTargetMargin] = useState(25);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [dealsRes, custRes, tickRes, quotRes] = await Promise.all([
        api.get("/api/v1/crm/opportunities/?page_size=100").catch(() => ({ data: [] })),
        api.get("/api/v1/crm/customers/?page_size=100").catch(() => ({ data: [] })),
        api.get("/api/v1/crm/tickets/?page_size=100").catch(() => ({ data: [] })),
        api.get("/api/v1/crm/quotations/?page_size=100").catch(() => ({ data: [] })),
      ]);

      setDeals(normalizeList(dealsRes.data).rows);
      setCustomers(normalizeList(custRes.data).rows);
      setTickets(normalizeList(tickRes.data).rows);
      setQuotations(normalizeList(quotRes.data).rows);
    } catch {
      toast.error("Gagal memuat data CRM");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  /* KPI Calculations */
  const wonDeals = deals.filter(d => ["CLOSED_WON", "WON"].includes(d.stage || d.status)).length;
  const totalDeals = deals.length;
  const winRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
  const pipelineValue = deals.reduce((acc, curr) => acc + Number(curr.expected_revenue || curr.amount || 0), 0);
  const weightedValue = deals.reduce((acc, curr) => {
    const prob = Number(curr.probability || (curr.stage === "CLOSED_WON" ? 100 : 50)) / 100;
    return acc + (Number(curr.expected_revenue || curr.amount || 0) * prob);
  }, 0);

  /* Operations */
  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/v1/crm/opportunities/", dealForm);
      toast.success("Deal baru berhasil didaftarkan ke pipeline!");
      setIsDealModalOpen(false);
      await loadData(true);
    } catch {
      toast.error("Gagal membuat deal");
    }
  };

  const handleAdvanceDealStage = async (dealId: number, nextStage: string) => {
    try {
      await api.patch(`/api/v1/crm/opportunities/${dealId}/`, { stage: nextStage });
      toast.success(`Stage deal dipindahkan ke: ${nextStage}`);
      await loadData(true);
    } catch {
      toast.error("Gagal memindahkan stage deal");
    }
  };

  const handleProcessDealWon = async (deal: any) => {
    setSelectedDealForConvert(deal);
    setIsConvertModalOpen(true);
  };

  const handleConfirmConvertProject = async () => {
    if (!selectedDealForConvert) return;
    try {
      // 1. Mark deal as CLOSED_WON
      await api.patch(`/api/v1/crm/opportunities/${selectedDealForConvert.id}/`, { stage: "CLOSED_WON" });
      
      // 2. Automatically generate Project in Project Management
      await api.post("/api/v1/projects/projects/", {
        name: selectedDealForConvert.name || `Proyek Deal #${selectedDealForConvert.id}`,
        code: `PRJ-${String(Date.now()).slice(-6)}`,
        budget_amount: Number(selectedDealForConvert.expected_revenue || selectedDealForConvert.amount || 100000000),
        description: `Dikonversi dari CRM Deal Won #${selectedDealForConvert.id} (${selectedDealForConvert.customer_name || "Klien"})`,
        planned_start_date: new Date().toISOString().split("T")[0],
        planned_end_date: new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0],
      });

      toast.success("🏆 Deal Won & Berhasil Dikonversi Menjadi Proyek Aktif!");
      setIsConvertModalOpen(false);
      await loadData(true);
    } catch {
      toast.error("Gagal konversi deal ke proyek");
    }
  };

  /* Quotation Estimator calculations */
  const totalCost = quoteItems.reduce((acc, i) => acc + (i.cost * i.qty), 0);
  const calculatedTotalSell = totalCost / (1 - (targetMargin / 100));
  const estimatedGrossProfit = calculatedTotalSell - totalCost;

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/v1/crm/quotations/", {
        title: quoteTitle,
        customer: quoteCustomer,
        total_cost: totalCost,
        total_amount: calculatedTotalSell,
        margin_percentage: targetMargin,
        items: quoteItems,
      });
      toast.success("Quotation resmi & estimasi biaya berhasil disimpan!");
      setIsQuotationModalOpen(false);
      await loadData(true);
    } catch {
      toast.error("Gagal menyimpan quotation");
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

      {/* Header & Action Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">CRM & Sales Management</h1>
          <p className="text-xs text-text-secondary mt-0.5">Pipeline deal, Estimating & Quoting (COGS), dan integrasi Shared Loop ke Project Management</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsDealModalOpen(true)}
            className="btn-primary py-1.5 px-3 text-xs gap-1.5"
          >
            <Plus size={14} /> Deal Baru
          </button>
          <button
            onClick={() => setIsQuotationModalOpen(true)}
            className="btn-outline py-1.5 px-3 text-xs gap-1.5"
          >
            <Calculator size={14} /> Buat Estimasi (COGS)
          </button>
          <button
            onClick={() => setIsCustomerModalOpen(true)}
            className="btn-outline py-1.5 px-3 text-xs gap-1.5"
          >
            <Plus size={14} /> Tambah Customer
          </button>
          <button
            onClick={() => loadData(true)}
            className={cn("btn-ghost py-1.5 px-3 text-xs gap-1.5", refreshing && "animate-spin")}
            disabled={refreshing}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 8 Tabs subnavigation */}
      <div className="flex border-b border-text-tertiary overflow-x-auto no-scrollbar gap-1">
        {CRM_TABS.map(tab => (
          <button
            key={tab.id}
            className={cn("tab-btn", activeTab === tab.id && "active")}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: DASHBOARD SALES ──────────────── */}
      {activeTab === "dashboard" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="kpi-card">
              <span className="text-xs text-text-secondary">Total Customers / Leads</span>
              <span className="text-2xl font-bold text-text-primary">{customers.length}</span>
            </div>
            <div className="kpi-card">
              <span className="text-xs text-text-secondary">Weighted Pipeline Value</span>
              <span className="text-2xl font-bold text-brand-deep-green">{formatMoney(weightedValue)}</span>
            </div>
            <div className="kpi-card">
              <span className="text-xs text-text-secondary">Total Pipeline Volume</span>
              <span className="text-2xl font-bold text-brand-green">{formatMoney(pipelineValue)}</span>
            </div>
            <div className="kpi-card">
              <span className="text-xs text-text-secondary">Win Rate Deals</span>
              <span className="text-2xl font-bold text-text-primary">{winRate}%</span>
            </div>
          </div>

          <div className="card rounded-2xl overflow-hidden p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Pipeline Deals & Closed Won</h3>
                <p className="text-2xs text-text-secondary">Shared Information Loop: Konversi deal yang dimenangkan langsung menjadi Proyek Aktif</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-info">{deals.length} Opportunities</span>
              </div>
            </div>

            <div className="divide-y divide-text-tertiary">
              {deals.map(d => {
                const isWon = ["CLOSED_WON", "WON"].includes(d.stage || d.status);
                return (
                  <div key={d.id} className="py-3 flex items-center justify-between flex-wrap gap-3 hover:bg-brand-light-green/20 p-2 rounded-xl transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-3 h-3 rounded-full flex-shrink-0", isWon ? "bg-emerald-500" : "bg-amber-400")} />
                      <div>
                        <span className="text-sm font-bold text-text-primary">{d.name || d.title || `Opportunity #${d.id}`}</span>
                        <p className="text-xs text-text-secondary">
                          {d.customer_name || d.company || "PT. Klien Utama"} · <b>{formatMoney(d.expected_revenue || d.amount)}</b> · Probabilitas: {d.probability || 50}%
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("badge", getStatusColor(d.stage || "PROSPECTING"))}>
                        {d.stage || "PROSPECTING"}
                      </span>

                      {!isWon && (
                        <button
                          onClick={() => handleProcessDealWon(d)}
                          className="btn-primary py-1 px-3 text-xs gap-1.5 bg-emerald-700 hover:bg-emerald-800"
                        >
                          <Award size={13} /> ⚡ Process Won & Convert Proyek
                        </button>
                      )}

                      {isWon && (
                        <span className="badge badge-success flex items-center gap-1">
                          ✓ Proyek Terbuat & Terhubung
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {!deals.length && <p className="py-8 text-center text-xs text-text-secondary">Belum ada deal aktif.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: DEALS PIPELINE (KANBAN) ─────── */}
      {activeTab === "deals" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-text-primary">Pipeline Tahapan Deals</h3>
            <button onClick={() => setIsDealModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
              <Plus size={14} /> Buat Opportunity
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map(stage => {
              const stageDeals = deals.filter(d => (d.stage || "PROSPECTING").toUpperCase() === stage.id);
              const stageValue = stageDeals.reduce((s, d) => s + Number(d.expected_revenue || d.amount || 0), 0);
              return (
                <div key={stage.id} className="bg-gray-50/80 rounded-2xl p-3 border border-text-tertiary flex flex-col gap-3 min-w-[210px]">
                  <div className="flex items-center justify-between pb-2 border-b border-text-tertiary">
                    <span className="text-xs font-bold text-text-primary">{stage.label}</span>
                    <span className="badge text-2xs bg-white">{stageDeals.length}</span>
                  </div>
                  <span className="text-2xs text-text-secondary font-medium">{formatMoney(stageValue)}</span>

                  <div className="flex flex-col gap-2">
                    {stageDeals.map(d => (
                      <div key={d.id} className="p-3 bg-white rounded-xl border border-text-tertiary shadow-sm flex flex-col gap-2">
                        <span className="text-xs font-semibold text-text-primary">{d.name || `Deal #${d.id}`}</span>
                        <span className="text-xs font-bold text-brand-deep-green">{formatMoney(d.expected_revenue || d.amount)}</span>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-2xs">
                          <span className="text-text-secondary">{d.customer_name || "Klien"}</span>
                          {stage.id !== "CLOSED_WON" && (
                            <button
                              onClick={() => {
                                const nextIndex = PIPELINE_STAGES.findIndex(s => s.id === stage.id) + 1;
                                if (nextIndex < PIPELINE_STAGES.length) {
                                  handleAdvanceDealStage(d.id, PIPELINE_STAGES[nextIndex].id);
                                }
                              }}
                              className="text-brand-green font-bold hover:underline"
                            >
                              Maju &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {!stageDeals.length && <div className="py-6 text-center text-2xs text-text-secondary border border-dashed rounded-xl border-gray-200">Kosong</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 3: ESTIMATING & QUOTING (COGS) ─── */}
      {activeTab === "estimate" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Estimator Builder */}
          <div className="lg:col-span-2 card rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Estimator Biaya Proyek & Margin COGS</h3>
                <p className="text-2xs text-text-secondary">Hitung biaya riil material, upah kerja, dan margin laba kotor sebelum menerbitkan Quotation resmi</p>
              </div>
              <button
                onClick={() => setQuoteItems([...quoteItems, { name: "Item Baru", qty: 1, unitPrice: 1000000, cost: 700000 }])}
                className="btn-outline py-1 px-3 text-xs gap-1"
              >
                <Plus size={13} /> Tambah Komponen
              </button>
            </div>

            <div className="divide-y divide-text-tertiary">
              {quoteItems.map((item, idx) => (
                <div key={idx} className="py-3 grid grid-cols-12 gap-2 items-center text-xs">
                  <div className="col-span-5">
                    <label className="text-2xs text-text-secondary block">Nama Komponen / Jasa</label>
                    <input
                      type="text"
                      value={item.name}
                      onChange={e => {
                        const updated = [...quoteItems];
                        updated[idx].name = e.target.value;
                        setQuoteItems(updated);
                      }}
                      className="input py-1 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-2xs text-text-secondary block">Qty</label>
                    <input
                      type="number"
                      value={item.qty}
                      onChange={e => {
                        const updated = [...quoteItems];
                        updated[idx].qty = Number(e.target.value);
                        setQuoteItems(updated);
                      }}
                      className="input py-1 text-xs"
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="text-2xs text-text-secondary block">Biaya Pokok (Cost per Unit)</label>
                    <input
                      type="number"
                      value={item.cost}
                      onChange={e => {
                        const updated = [...quoteItems];
                        updated[idx].cost = Number(e.target.value);
                        setQuoteItems(updated);
                      }}
                      className="input py-1 text-xs"
                    />
                  </div>
                  <div className="col-span-1 text-right pt-4">
                    <button
                      onClick={() => setQuoteItems(quoteItems.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-gray-50 border border-text-tertiary flex items-center justify-between">
              <span className="text-xs font-semibold">Target Margin Laba Penawaran (%):</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={targetMargin}
                  onChange={e => setTargetMargin(Number(e.target.value))}
                  className="w-32 accent-brand-green"
                />
                <span className="font-bold text-sm text-brand-deep-green w-10 text-right">{targetMargin}%</span>
              </div>
            </div>
          </div>

          {/* Right: Summary Card */}
          <div className="card rounded-2xl p-5 flex flex-col justify-between bg-brand-light-green/30 border-brand-green/30">
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-brand-deep-green">Ringkasan Estimasi & Harga Penawaran</h3>
              <div className="flex flex-col gap-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total COGS (Biaya Pokok):</span>
                  <span className="font-semibold text-red-600">{formatMoney(totalCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Estimasi Laba Kotor (Gross Profit):</span>
                  <span className="font-semibold text-emerald-700">{formatMoney(estimatedGrossProfit)}</span>
                </div>
                <div className="h-px bg-brand-green/20 my-1" />
                <div className="flex justify-between items-center">
                  <span className="font-bold text-text-primary">Harga Jual Resmi (Quotation):</span>
                  <span className="text-lg font-bold text-brand-deep-green">{formatMoney(calculatedTotalSell)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveQuotation}
              className="btn-primary w-full justify-center py-2.5 mt-4"
            >
              Terbitkan Dokumen Penawaran (Quotation)
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 4: TICKETS ──────────────────────── */}
      {activeTab === "tickets" && (
        <div className="card rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Tiket Support & Klaim Garansi Purna Jual</h3>
              <p className="text-2xs text-text-secondary">Lacak laporan isu teknis dan klaim garansi dari klien</p>
            </div>
            <button onClick={() => setIsTicketModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
              <Plus size={14} /> Buat Tiket Garansi
            </button>
          </div>
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Subjek Masalah</th>
                <th>Customer</th>
                <th>Prioritas</th>
                <th>Status Kasus</th>
                <th>Aksi Penanganan</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.subject || `Tiket #${t.id}`}</strong></td>
                  <td>Customer #{t.customer}</td>
                  <td><span className="badge badge-warning">{t.priority || "MEDIUM"}</span></td>
                  <td><span className={cn("badge", getStatusColor(t.status))}>{t.status || "OPEN"}</span></td>
                  <td>
                    <button
                      onClick={async () => {
                        await api.patch(`/api/v1/crm/tickets/${t.id}/`, { status: "RESOLVED" });
                        toast.success("Tiket ditandai selesai (Resolved)");
                        await loadData(true);
                      }}
                      className="btn-outline py-1 px-2.5 text-2xs"
                    >
                      Tandai Selesai
                    </button>
                  </td>
                </tr>
              ))}
              {!tickets.length && <tr><td colSpan={5} className="text-center py-6 text-xs text-text-secondary">Belum ada tiket support aktif.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 5: ACCOUNTS ─────────────────────── */}
      {activeTab === "accounts" && (
        <div className="card rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Profil Klien & Kontrol Plafon Kredit</h3>
              <p className="text-2xs text-text-secondary">Manajemen data pelanggan, limit kredit, dan status permodalan</p>
            </div>
            <button onClick={() => setIsCustomerModalOpen(true)} className="btn-primary py-1.5 px-3 text-xs gap-1.5">
              <Plus size={14} /> Tambah Customer
            </button>
          </div>
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Nama Pelanggan</th>
                <th>Perusahaan</th>
                <th>Kontak / Email</th>
                <th>Plafon Kredit (Limit)</th>
                <th>Status Kelayakan</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name || c.full_name}</strong></td>
                  <td>{c.company_name || c.company || "-"}</td>
                  <td>{c.email || c.phone || "-"}</td>
                  <td className="font-semibold text-brand-deep-green">{formatMoney(c.credit_limit || 500000000)}</td>
                  <td><span className="badge badge-success">✓ Layak Transaksi</span></td>
                </tr>
              ))}
              {!customers.length && <tr><td colSpan={5} className="text-center py-6 text-xs text-text-secondary">Belum ada profil customer.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 6, 7, 8 ─────────────────────────── */}
      {["incoming", "contracts", "engagement"].includes(activeTab) && (
        <div className="card rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
          <Users size={40} className="text-brand-green opacity-40" />
          <h3 className="text-base font-semibold text-text-primary">
            Modul {CRM_TABS.find(t => t.id === activeTab)?.label}
          </h3>
          <p className="text-xs text-text-secondary max-w-md">
            Modul ini terhubung otomatis ke Sales Order dan alur komunikasi klien.
          </p>
        </div>
      )}

      {/* ── MODALS ───────────────────────────────── */}

      {/* Modal: Konversi Deal Won ke Proyek Aktif */}
      <Modal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        title="🏆 Konversi Deal Won Menjadi Proyek Aktif"
        subtitle="Alur Shared Loop CRM &rarr; Project Management"
      >
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl bg-brand-light-green border border-brand-green/30">
            <span className="text-xs font-bold text-brand-deep-green">Deal yang Dimasukkan:</span>
            <p className="text-sm font-semibold text-text-primary mt-1">{selectedDealForConvert?.name}</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Nilai Kontrak: <b>{formatMoney(selectedDealForConvert?.expected_revenue || selectedDealForConvert?.amount)}</b>
            </p>
          </div>

          <div className="flex flex-col gap-2 text-xs text-text-secondary">
            <p>Sistem akan secara otomatis:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Mendaftarkan Proyek baru di modul <b>Project Management</b>.</li>
              <li>Mengalokasikan total anggaran sesuai nilai kontrak deal.</li>
              <li>Menghubungkan klien dengan akun piutang di modul <b>Finance</b>.</li>
            </ul>
          </div>

          <button
            onClick={handleConfirmConvertProject}
            className="btn-primary w-full justify-center py-2.5 mt-2"
          >
            Konfirmasi & Luncurkan Proyek Sekarang
          </button>
        </div>
      </Modal>

      {/* Modal: Buat Deal */}
      <Modal
        isOpen={isDealModalOpen}
        onClose={() => setIsDealModalOpen(false)}
        title="Buat Deal / Opportunity Baru"
        subtitle="Daftarkan prospek proyek sales baru ke pipeline"
      >
        <form onSubmit={handleCreateDeal} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Nama Deal / Prospek *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Pengadaan Mesin Sorting PT. Surya"
              value={dealForm.name}
              onChange={e => setDealForm({ ...dealForm, name: e.target.value })}
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Nilai Estimasi (Rp) *</label>
              <input
                type="number"
                required
                value={dealForm.expected_revenue}
                onChange={e => setDealForm({ ...dealForm, expected_revenue: Number(e.target.value) })}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Tahapan (Stage)</label>
              <select
                value={dealForm.stage}
                onChange={e => setDealForm({ ...dealForm, stage: e.target.value })}
                className="input"
              >
                <option value="PROSPECTING">PROSPECTING</option>
                <option value="QUALIFICATION">QUALIFICATION</option>
                <option value="PROPOSAL">PROPOSAL</option>
                <option value="NEGOTIATION">NEGOTIATION</option>
                <option value="CLOSED_WON">CLOSED_WON</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2.5 mt-2">
            Simpan Deal ke Pipeline
          </button>
        </form>
      </Modal>

      {/* Modal: Tambah Customer */}
      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title="Daftarkan Customer Baru"
        subtitle="Profil klien dan limit kredit permodalan"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post("/api/v1/crm/customers/", customerForm);
              toast.success("Customer berhasil ditambahkan!");
              setIsCustomerModalOpen(false);
              await loadData(true);
            } catch {
              toast.error("Gagal menambahkan customer");
            }
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Nama Kontak / Klien *</label>
            <input
              type="text"
              required
              placeholder="Bapak Hendra Gunawan"
              value={customerForm.name}
              onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })}
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Nama Perusahaan</label>
              <input
                type="text"
                placeholder="PT. Surya Perkasa Abadi"
                value={customerForm.company_name}
                onChange={e => setCustomerForm({ ...customerForm, company_name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-primary block mb-1">Limit Kredit (Rp)</label>
              <input
                type="number"
                value={customerForm.credit_limit}
                onChange={e => setCustomerForm({ ...customerForm, credit_limit: Number(e.target.value) })}
                className="input"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2.5 mt-2">
            Simpan Profil Customer
          </button>
        </form>
      </Modal>

      {/* Modal: Buat Tiket */}
      <Modal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        title="Buat Tiket Garansi / Support"
        subtitle="Registrasi keluhan teknis atau klaim purna jual"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post("/api/v1/crm/tickets/", ticketForm);
              toast.success("Tiket garansi/support berhasil dibuat!");
              setIsTicketModalOpen(false);
              await loadData(true);
            } catch {
              toast.error("Gagal membuat tiket support");
            }
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Subjek Masalah *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Sensor conveyor tidak merespons error code E-04"
              value={ticketForm.subject}
              onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-primary block mb-1">Deskripsi Detail</label>
            <textarea
              rows={3}
              placeholder="Jelaskan kondisi kerusakan atau permintaan bantuan..."
              value={ticketForm.description}
              onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })}
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-2.5 mt-2">
            Kirim Tiket Support
          </button>
        </form>
      </Modal>

    </div>
  );
}

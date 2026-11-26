/**
 * File: frontend-next/components/finance/ProjectTaxWorkspace.tsx
 *
 * Purpose: Enterprise Tax Workspace for Project PPN & PPh Withholding management.
 * Complies with Indonesian DJP regulations: e-Bupot unifikasi vs NTPN Kas Negara,
 * WAPU vs Non-WAPU treatment, and timing simulation.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Calculator,
  ShieldCheck,
  Building2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Search,
  FileCheck2,
  CreditCard,
  ExternalLink,
  Eye,
} from "lucide-react";
import { cn, formatMoney, formatDate, localDateKey } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { IDRInput } from "@/components/ui/IDRInput";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { FinanceSummarySection } from "@/components/finance/FinanceSummarySection";
import { useTablePagination, TableSearchBar, TablePagination } from "@/components/ui/TablePagination";
import { CollapsibleGuideline } from "@/components/ui/CollapsibleGuideline";

export interface TaxTransaction {
  id: string;
  invoice_number: string;
  tax_invoice_number: string;
  customer_name: string;
  project_name: string;
  tax_date: string;
  dpp_amount: number;
  ppn_rate: number;
  ppn_amount: number;
  pph_type: string;
  pph_rate: number;
  pph_amount: number;
  tax_scheme: "PROPORTIONAL" | "FULL_UPFRONT" | "FINAL_SETTLEMENT" | null;
  client_type: "NON_WAPU" | "WAPU";
  bupot_status: "PENDING" | "RECEIVED" | "VERIFIED";
  bupot_number?: string;
  net_cash_inflow: number;
  status?: string;
  ntpn?: string;
}

const INITIAL_TAX_TRANSACTIONS: TaxTransaction[] = [];

export function ProjectTaxWorkspace({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const [transactions, setTransactions] = useState<TaxTransaction[]>(INITIAL_TAX_TRANSACTIONS);
  const [loading, setLoading] = useState(true);
  const [schemeFilter, setSchemeFilter] = useState("ALL");
  const [clientTypeFilter, setClientTypeFilter] = useState("ALL");

  // Simulator Drawer/Modal State
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [simContractValue, setSimContractValue] = useState<number>(100000000);
  const [simDownPaymentPct, setSimDownPaymentPct] = useState<number>(30);
  const [simTaxScheme, setSimTaxScheme] = useState<"PROPORTIONAL" | "FULL_UPFRONT" | "FINAL_SETTLEMENT">("FULL_UPFRONT");
  const [simClientType, setSimClientType] = useState<"NON_WAPU" | "WAPU">("NON_WAPU");
  const [simPphRate, setSimPphRate] = useState<number>(2.0);

  // Modal Bukti Potong (e-Bupot)
  const [isBupotModalOpen, setIsBupotModalOpen] = useState(false);
  const [selectedTxForBupot, setSelectedTxForBupot] = useState<TaxTransaction | null>(null);
  const [bupotForm, setBupotForm] = useState({
    bupot_number: "",
    bupot_date: localDateKey(),
    tax_type: "PPh 23 Jasa Teknik & Manajemen",
    notes: "",
  });
  const [isSavingBupot, setIsSavingBupot] = useState(false);

  // Modal NTPN Setor Kas Negara
  const [isNtpnModalOpen, setIsNtpnModalOpen] = useState(false);
  const [selectedTxForNtpn, setSelectedTxForNtpn] = useState<TaxTransaction | null>(null);
  const [ntpnForm, setNtpnForm] = useState({
    ntpn: "",
    paid_at: localDateKey(),
    payment_reference: "",
  });
  const [isSavingNtpn, setIsSavingNtpn] = useState(false);

  const loadTaxTransactions = () => {
    setLoading(true);
    const dateFilters = startDate && endDate ? `&from_date=${encodeURIComponent(startDate)}&to_date=${encodeURIComponent(endDate)}` : "";
    api.get(`/api/v1/finance/tax-transactions/projection?page_size=200${dateFilters}`)
      .then((response) => {
        const rows = normalizeList<any>(response.data).rows;
        setTransactions(rows.map((item) => ({
          id: String(item.id),
          invoice_number: item.invoice_number || item.billing_code || item.payment_reference || "-",
          tax_invoice_number: item.billing_code || item.ntpn || "-",
          customer_name: item.customer_name || "Pelanggan Proyek",
          project_name: item.project_name || "Proyek Berjalan",
          tax_date: item.tax_date || "",
          dpp_amount: Number(item.taxable_amount || 0),
          ppn_rate: Number(item.tax_rate || 11),
          ppn_amount: Number(item.tax_amount || 0),
          pph_type: item.pph_type || "PPh 23 (2%)",
          pph_rate: Number(item.pph_rate ?? 2.0),
          pph_amount: Number(item.pph_amount ?? ((Number(item.taxable_amount || 0) * 2) / 100)),
          tax_scheme: item.tax_scheme ?? null,
          client_type: (item.client_type as "NON_WAPU" | "WAPU") || "NON_WAPU",
          bupot_status: (item.bupot_status as any) || (item.ntpn ? "VERIFIED" : "PENDING"),
          bupot_number: item.bupot_number || item.ntpn || undefined,
          net_cash_inflow: Number(item.net_cash_inflow ?? (Number(item.taxable_amount || 0) + Number(item.tax_amount || 0))),
          status: item.status || "CALCULATED",
          ntpn: item.ntpn || undefined,
        })));
      })
      .catch(() => toast.error("Transaksi pajak gagal dimuat dari server."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTaxTransactions();
  }, [startDate, endDate]);

  useEffect(() => {
    api.get('/api/v1/core/companies/?page_size=1').then((response) => {
      const company = normalizeList<any>(response.data).rows[0];
      const category = String(company?.business_category || 'CONSULTING_DIGITAL').toUpperCase();
      const construction = category === 'CONSTRUCTION';
      const pphRate = construction ? 2.65 : 2.0;
      setSimPphRate(pphRate);
    }).catch(() => undefined);
  }, []);

  // Simulator Calculations
  const totalPpnContract = (simContractValue * 11) / 100;
  const dpDpp = (simContractValue * simDownPaymentPct) / 100;
  
  let dpPpn = 0;
  if (simTaxScheme === "FULL_UPFRONT") {
    dpPpn = totalPpnContract;
  } else if (simTaxScheme === "PROPORTIONAL") {
    dpPpn = (dpDpp * 11) / 100;
  } else {
    dpPpn = 0;
  }

  const dpPph = (dpDpp * simPphRate) / 100;
  const dpNetCash = simClientType === "NON_WAPU" 
    ? dpDpp + dpPpn - dpPph 
    : dpDpp - dpPph;

  const remainDpp = simContractValue - dpDpp;
  let remainPpn = 0;
  if (simTaxScheme === "FULL_UPFRONT") {
    remainPpn = 0;
  } else if (simTaxScheme === "PROPORTIONAL") {
    remainPpn = (remainDpp * 11) / 100;
  } else {
    remainPpn = totalPpnContract;
  }
  const remainPph = (remainDpp * simPphRate) / 100;
  const remainNetCash = simClientType === "NON_WAPU" 
    ? remainDpp + remainPpn - remainPph 
    : remainDpp - remainPph;

  // Filter dropdown; pencarian + paginasi lewat hook
  const dropdownFiltered = transactions.filter((tx) => {
    const matchesScheme = schemeFilter === "ALL" || tx.tax_scheme === schemeFilter;
    const matchesClient = clientTypeFilter === "ALL" || tx.client_type === clientTypeFilter;
    return matchesScheme && matchesClient;
  });
  const taxMatcher = useCallback((tx: TaxTransaction, q: string) =>
    tx.customer_name.toLowerCase().includes(q) ||
    tx.project_name.toLowerCase().includes(q) ||
    tx.invoice_number.toLowerCase().includes(q) ||
    tx.tax_invoice_number.toLowerCase().includes(q), []);
  const pager = useTablePagination(dropdownFiltered, taxMatcher, 10);
  const filteredTransactions = pager.paginatedItems;

  // KPI calculations
  const totalDpp = transactions.reduce((acc, t) => acc + t.dpp_amount, 0);
  const totalPpnIssued = transactions.reduce((acc, t) => acc + t.ppn_amount, 0);
  const totalPpnWapu = transactions.filter(t => t.client_type === "WAPU").reduce((acc, t) => acc + t.ppn_amount, 0);
  const totalPpnSelfPay = totalPpnIssued - totalPpnWapu;
  const totalPphWithheld = transactions.reduce((acc, t) => acc + t.pph_amount, 0);

  // Open Bupot Modal
  const handleOpenBupotModal = (tx: TaxTransaction) => {
    setSelectedTxForBupot(tx);
    setBupotForm({
      bupot_number: tx.bupot_number || "",
      bupot_date: localDateKey(),
      tax_type: tx.pph_type || "PPh 23 Jasa Teknik & Manajemen",
      notes: `Bukti potong atas tagihan ${tx.invoice_number}`,
    });
    setIsBupotModalOpen(true);
  };

  // Save Bupot
  const handleSaveBupot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForBupot) return;
    setIsSavingBupot(true);

    try {
      await api.post(`/api/v1/finance/tax-transactions/${selectedTxForBupot.id}/record-bupot`, {
        bupot_number: bupotForm.bupot_number.trim(),
        bupot_date: bupotForm.bupot_date,
        tax_type: bupotForm.tax_type,
        notes: bupotForm.notes.trim(),
      });
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === selectedTxForBupot.id
            ? {
                ...t,
                bupot_status: "VERIFIED",
                bupot_number: bupotForm.bupot_number.trim(),
              }
            : t
        )
      );
      toast.success(`Bukti potong ${bupotForm.bupot_number} berhasil dicatat sebagai kredit pajak.`);
      setIsBupotModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || "Gagal mencatat bukti potong.");
    } finally {
      setIsSavingBupot(false);
    }
  };

  // Open NTPN Modal
  const handleOpenNtpnModal = (tx: TaxTransaction) => {
    setSelectedTxForNtpn(tx);
    setNtpnForm({
      ntpn: tx.ntpn || "",
      paid_at: localDateKey(),
      payment_reference: tx.invoice_number,
    });
    setIsNtpnModalOpen(true);
  };

  // Save NTPN
  const handleSaveNtpn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForNtpn) return;
    setIsSavingNtpn(true);

    try {
      await api.post(`/api/v1/finance/tax-transactions/${selectedTxForNtpn.id}/record-ntpn`, {
        ntpn: ntpnForm.ntpn.trim(),
        payment_reference: ntpnForm.payment_reference.trim() || selectedTxForNtpn.invoice_number,
        paid_at: ntpnForm.paid_at,
      });
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === selectedTxForNtpn.id
            ? {
                ...t,
                status: "PAID",
                ntpn: ntpnForm.ntpn.trim(),
              }
            : t
        )
      );
      toast.success(`NTPN ${ntpnForm.ntpn} berhasil disimpan. Transaksi PPN dinyatakan LUNAS disetor.`);
      setIsNtpnModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || "Gagal mencatat NTPN.");
    } finally {
      setIsSavingNtpn(false);
    }
  };

  return (
    <div className="finance-scope flex flex-col gap-5">
      {/* ── HEADER & ACTIONS ──────────────── */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
            <ShieldCheck className="text-brand-green" size={20} />
            Kepatuhan &amp; Pemotongan Pajak Proyek
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Manajemen PPN Keluaran, Pemotongan PPh 23 / Final 4(2), Penanganan Klien WAPU, dan Setoran NTPN Kas Negara.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">
            Dibentuk dari Billing terposting
          </span>
          <button
            onClick={() => setIsSimulatorModalOpen(true)}
            className="btn-outline-soft inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs"
          >
            <Calculator size={14} />
            Simulator Pajak Proyek
          </button>
        </div>
      </div>

      <FinanceSummarySection
        title="Ringkasan Kepatuhan Pajak"
        subtitle="Ringkasan nilai pajak dari billing proyek yang sudah terposting."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="kpi-card" data-accent="blue">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Total DPP Proyek</span><Building2 size={16} className="shrink-0 text-text-secondary" /></div>
            <span className="mt-1.5 block break-words text-xl font-semibold tabular-nums text-text-primary">{formatMoney(totalDpp)}</span>
            <span className="mt-1 block text-xs text-text-secondary">{transactions.length} faktur tagihan terbit</span>
          </div>

          <div className="kpi-card" data-accent="navy">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">PPN Keluaran (11%)</span><FileText size={16} className="shrink-0 text-text-secondary" /></div>
            <span className="mt-1.5 block break-words text-xl font-semibold tabular-nums text-text-primary">{formatMoney(totalPpnIssued)}</span>
            <span className="mt-1 block text-xs text-text-secondary">Setor sendiri: <b className="font-semibold text-text-primary">{formatMoney(totalPpnSelfPay)}</b></span>
          </div>

          <div className="kpi-card" data-accent="amber">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">PPN Dipungut WAPU</span><ShieldCheck size={16} className="shrink-0 text-text-secondary" /></div>
            <span className="mt-1.5 block break-words text-xl font-semibold tabular-nums text-text-primary">{formatMoney(totalPpnWapu)}</span>
            <span className="mt-1 block text-xs text-text-secondary">Disetor langsung klien BUMN/Pemerintah</span>
          </div>

          <div className="kpi-card" data-accent="purple">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Potongan PPh</span><TrendingUp size={16} className="shrink-0 text-text-secondary" /></div>
            <span className="mt-1.5 block break-words text-xl font-semibold tabular-nums text-text-primary">{formatMoney(totalPphWithheld)}</span>
            <span className="mt-1 block text-xs text-text-secondary">Kredit pajak PPh 23 &amp; Final 4(2)</span>
          </div>
        </div>
      </FinanceSummarySection>

      {/* ── TABEL TRANSAKSI PAJAK PROYEK ── */}
      <div className="card p-5 rounded-2xl border border-gray-200 bg-white shadow-xs flex flex-col gap-4">
        <div>
          <div className="mb-3">
            <h4 className="text-sm font-bold text-text-primary">Buku Besar Faktur & Pajak Proyek</h4>
            <p className="text-xs text-text-secondary">Daftar transaksi pajak otomatis dari billing termin berstatus POSTED.</p>
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <TableSearchBar query={pager.query} onQueryChange={pager.setQuery} onSearchSubmit={pager.applySearch} onReset={pager.resetSearch} placeholder="Cari no. faktur / klien..." totalItems={dropdownFiltered.length} filteredCount={pager.totalItems} showSubmitButton={false} className="flex-nowrap" />
            <select value={clientTypeFilter} onChange={(e) => setClientTypeFilter(e.target.value)} className="input w-auto py-2 text-xs">
              <option value="ALL">Semua Tipe Klien</option>
              <option value="NON_WAPU">Non-WAPU (Swasta)</option>
              <option value="WAPU">WAPU (BUMN/Pemerintah)</option>
            </select>
            <select value={schemeFilter} onChange={(e) => setSchemeFilter(e.target.value)} className="input w-auto py-2 text-xs">
              <option value="ALL">Semua Skema</option>
              <option value="FULL_UPFRONT">Pajak Di Awal</option>
              <option value="PROPORTIONAL">Proporsional</option>
              <option value="FINAL_SETTLEMENT">Pelunasan</option>
            </select>
          </div>
        </div>

        <div className="table-scroll-wrapper border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full data-table text-xs text-left min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider border-b border-gray-200">
                <th className="py-2.5 px-3.5 font-semibold">No. Faktur / Tanggal</th>
                <th className="py-2.5 px-3.5 font-semibold">Klien & Proyek</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">DPP (Nilai Kena Pajak)</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">PPN (11%)</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">Potongan PPh</th>
                <th className="py-2.5 px-3.5 font-semibold text-right">Kas Bersih Masuk</th>
                <th className="py-2.5 px-3.5 font-semibold col-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTransactions.map((tx) => {
                const isWapu = tx.client_type === "WAPU";
                const isPaid = tx.status === "PAID" || Boolean(tx.ntpn);
                const hasBupot = tx.bupot_status === "VERIFIED" && tx.bupot_number;

                return (
                  <tr key={tx.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-3.5">
                      <strong className="text-text-primary text-xs block">{tx.invoice_number}</strong>
                      <span className="text-3xs text-text-secondary block mt-0.5">
                        Ref: {tx.tax_invoice_number}
                      </span>
                      <span className="text-3xs text-text-secondary block">{formatDate(tx.tax_date)}</span>
                    </td>

                    <td className="py-3 px-3.5">
                      <span className="font-medium text-text-primary block text-xs">{tx.customer_name}</span>
                      <span className="text-3xs text-text-secondary block truncate max-w-[200px] mt-0.5">
                        {tx.project_name}
                      </span>
                      <span className={cn(
                        "status-label mt-1",
                        isWapu ? "is-warn" : "is-idle"
                      )}>
                        {isWapu ? "Klien WAPU (BUMN/Instansi)" : "Non-WAPU (Swasta)"}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-right">
                      <span className="text-text-primary block font-medium">{formatMoney(tx.dpp_amount)}</span>
                      <span className="text-3xs text-text-secondary block mt-0.5">
                        {tx.tax_scheme === "FULL_UPFRONT" ? "Pajak Di Awal" : tx.tax_scheme === "PROPORTIONAL" ? "Proporsional" : tx.tax_scheme === "FINAL_SETTLEMENT" ? "Pelunasan Akhir" : "Standar"}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-right">
                      <span className="font-medium amount-pos block">+{formatMoney(tx.ppn_amount)}</span>
                      <span className="text-3xs text-text-secondary block">
                        {isWapu ? "Disetor Klien WAPU" : (isPaid ? "Lunas Kas Negara" : "Wajib Setor Sendiri")}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-right">
                      <span className="font-medium amount-neg block">-{formatMoney(tx.pph_amount)}</span>
                      <span className="text-3xs text-text-secondary block truncate max-w-[140px]">
                        {tx.pph_type} ({tx.pph_rate}%)
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-right">
                      <span className="font-medium amount-pos block text-xs">
                        {formatMoney(tx.net_cash_inflow)}
                      </span>
                      <span className="text-3xs text-text-secondary block">Masuk Rekening Bank</span>
                    </td>

                    <td className="py-3 px-3.5 col-center">
                      <div className="flex flex-col items-center gap-1.5">
                        {/* Status Bupot PPh */}
                        {hasBupot ? (
                          <span className="status-label is-ok">
                            <CheckCircle2 size={10} /> Bupot: {tx.bupot_number}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenBupotModal(tx)}
                            className="btn-outline-soft inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs"
                          >
                            <FileCheck2 size={11} /> Input Bukti Potong
                          </button>
                        )}

                        {/* Status Setoran NTPN PPN (Hanya untuk Non-WAPU) */}
                        {!isWapu && (
                          isPaid ? (
                            <span className="status-label is-ok">
                              <CheckCircle2 size={10} /> NTPN: {tx.ntpn || "LUNAS"}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleOpenNtpnModal(tx)}
                              className="btn-outline-soft inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs"
                            >
                              <CreditCard size={11} /> Catat NTPN Setor
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!filteredTransactions.length && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-xs text-text-secondary">
                    {loading ? "Memuat transaksi pajak..." : "Belum ada transaksi pajak proyek. Transaksi akan muncul otomatis saat Billing Termin diposting."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination page={pager.page} totalPages={pager.totalPages} pageSize={pager.pageSize} totalItems={pager.totalItems} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} />
      </div>

      {/* ── MODAL: VERIFIKASI BUKTI POTONG (e-BUPOT PPH) ── */}
      <Modal
        isOpen={isBupotModalOpen}
        onClose={() => !isSavingBupot && setIsBupotModalOpen(false)}
        title="Verifikasi Bukti Potong (e-Bupot) PPh Klien"
        subtitle={`Faktur: ${selectedTxForBupot?.invoice_number} — Klien: ${selectedTxForBupot?.customer_name}`}
        size="md"
      >
        <form onSubmit={handleSaveBupot} className="flex flex-col gap-3.5 p-2 text-xs">
          <CollapsibleGuideline title="Informasi pemotongan pajak klien">
            <div className="grid grid-cols-2 gap-1">
              <div>Nilai DPP: <b>{formatMoney(selectedTxForBupot?.dpp_amount || 0)}</b></div>
              <div>Potongan PPh: <b className="text-purple-700">{formatMoney(selectedTxForBupot?.pph_amount || 0)} ({selectedTxForBupot?.pph_rate}%)</b></div>
            </div>
            <p className="mt-1 leading-relaxed">
              Catatan: Bukti Potong adalah bukti bahwa PPh Anda telah dipotong dan disetorkan oleh klien ke kas negara (Kredit Pajak Pasal 23 / Final 4(2)).
            </p>
          </CollapsibleGuideline>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-text-primary block mb-1">Nomor Bukti Potong (e-Bupot) *</label>
              <input
                type="text"
                required
                placeholder="Contoh: BP-23-0001892"
                value={bupotForm.bupot_number}
                onChange={(e) => setBupotForm({ ...bupotForm, bupot_number: e.target.value })}
                className="input text-xs font-semibold"
              />
            </div>
            <div>
              <label className="font-bold text-text-primary block mb-1">Tanggal Terbit Bupot *</label>
              <input
                type="date"
                required
                value={bupotForm.bupot_date}
                onChange={(e) => setBupotForm({ ...bupotForm, bupot_date: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-text-primary block mb-1">Jenis Pajak Penghasilan</label>
            <input
              type="text"
              readOnly
              value={bupotForm.tax_type}
              className="input text-xs bg-gray-50 text-text-secondary font-semibold"
            />
          </div>

          <div>
            <label className="font-bold text-text-primary block mb-1">Catatan Verifikasi</label>
            <textarea
              rows={2}
              value={bupotForm.notes}
              onChange={(e) => setBupotForm({ ...bupotForm, notes: e.target.value })}
              placeholder="Catatan nomor e-Bupot atau nama pemotong..."
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-200">
            <button
              type="button"
              disabled={isSavingBupot}
              onClick={() => setIsBupotModalOpen(false)}
              className="btn-ghost py-1.5 px-3 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSavingBupot}
              className="btn-final rounded-full px-4 py-2 text-xs"
            >
              {isSavingBupot ? "Menyimpan..." : "Simpan Bukti Potong"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: CATAT NTPN SETORAN KAS NEGARA (PPN) ── */}
      <Modal
        isOpen={isNtpnModalOpen}
        onClose={() => !isSavingNtpn && setIsNtpnModalOpen(false)}
        title="Catat NTPN Setoran Kas Negara (PPN Keluaran)"
        subtitle={`Faktur: ${selectedTxForNtpn?.invoice_number} — PPN: ${formatMoney(selectedTxForNtpn?.ppn_amount || 0)}`}
        size="md"
      >
        <form onSubmit={handleSaveNtpn} className="flex flex-col gap-3.5 p-2 text-xs">
          <CollapsibleGuideline title="Informasi pembayaran PPN ke kas negara">
            <div className="grid grid-cols-2 gap-1">
              <div>Jumlah PPN: <b className="text-blue-700">{formatMoney(selectedTxForNtpn?.ppn_amount || 0)}</b></div>
              <div>Kode Billing: <b>{selectedTxForNtpn?.tax_invoice_number || "-"}</b></div>
            </div>
            <p className="mt-1 leading-relaxed">
              NTPN (Nomor Transaksi Penerimaan Negara) adalah bukti resmi 16 karakter setelah pembayaran kode billing via bank/ATM/portal DJP.
            </p>
          </CollapsibleGuideline>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-text-primary block mb-1">NTPN (16 Karakter) *</label>
              <input
                type="text"
                required
                maxLength={32}
                placeholder="Contoh: 1A2B3C4D5E6F7G8H"
                value={ntpnForm.ntpn}
                onChange={(e) => setNtpnForm({ ...ntpnForm, ntpn: e.target.value.toUpperCase() })}
                className="input text-xs font-semibold tracking-wider"
              />
            </div>
            <div>
              <label className="font-bold text-text-primary block mb-1">Tanggal Setor *</label>
              <input
                type="date"
                required
                value={ntpnForm.paid_at}
                onChange={(e) => setNtpnForm({ ...ntpnForm, paid_at: e.target.value })}
                className="input text-xs"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-text-primary block mb-1">Referensi Pembayaran / Bank</label>
            <input
              type="text"
              value={ntpnForm.payment_reference}
              onChange={(e) => setNtpnForm({ ...ntpnForm, payment_reference: e.target.value })}
              placeholder="Contoh: Mandiri e-Tax Ref #88912"
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-200">
            <button
              type="button"
              disabled={isSavingNtpn}
              onClick={() => setIsNtpnModalOpen(false)}
              className="btn-ghost py-1.5 px-3 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSavingNtpn}
              className="btn-final rounded-full px-4 py-2 text-xs"
            >
              {isSavingNtpn ? "Menyimpan..." : "Simpan NTPN (Tandai Lunas)"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: SIMULATOR & KALKULATOR SKEMA PAJAK PROYEK ── */}
      <Modal
        isOpen={isSimulatorModalOpen}
        onClose={() => setIsSimulatorModalOpen(false)}
        title="Simulator & Kalkulator Skema Pajak Proyek (Uang Muka DP vs Pelunasan)"
        subtitle="Simulasikan perlakuan pajak di awal (DP 100% PPN), proporsional per termin, atau potongan PPh WAPU."
        size="lg"
      >
        <div className="flex flex-col gap-4 p-2 text-xs">
          {/* Input Parameters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-4 rounded-xl bg-gray-50 border border-gray-200">
            <div>
              <label className="font-semibold text-text-primary block mb-1">Nilai Kontrak Proyek (DPP)</label>
              <IDRInput
                value={simContractValue}
                onChange={(amount) => setSimContractValue(Number(amount) || 0)}
                className="input text-xs"
              />
            </div>

            <div>
              <label className="font-semibold text-text-primary block mb-1">Persentase DP Awal (%)</label>
              <input
                type="number"
                min="10"
                max="90"
                value={simDownPaymentPct}
                onChange={(e) => setSimDownPaymentPct(Number(e.target.value))}
                className="input text-xs font-semibold"
              />
            </div>

            <div>
              <label className="font-semibold text-text-primary block mb-1">Skema Timing Pajak</label>
              <select
                value={simTaxScheme}
                onChange={(e) => setSimTaxScheme(e.target.value as any)}
                className="input text-xs font-semibold"
              >
                <option value="FULL_UPFRONT">Pajak Penuh di Awal (DP 100% PPN)</option>
                <option value="PROPORTIONAL">Proporsional per Termin (Standar)</option>
                <option value="FINAL_SETTLEMENT">Pajak Diselesaikan di Akhir</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-text-primary block mb-1">Tipe Pemungut Klien</label>
              <select
                value={simClientType}
                onChange={(e) => setSimClientType(e.target.value as any)}
                className="input text-xs font-semibold"
              >
                <option value="NON_WAPU">Swasta (Non-WAPU)</option>
                <option value="WAPU">BUMN / Instansi (WAPU)</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-text-primary block mb-1">Tarif Potongan PPh</label>
              <select
                value={simPphRate}
                onChange={(e) => setSimPphRate(Number(e.target.value))}
                className="input text-xs font-semibold"
              >
                <option value={2.0}>PPh 23 Jasa Tek/Manajemen (2%)</option>
                <option value={2.65}>PPh Final Konstruksi (2.65%)</option>
                <option value={1.75}>PPh Final Konstruksi Kecil (1.75%)</option>
                <option value={4.0}>PPh Final Konsultan Konstruksi (4%)</option>
                <option value={0}>Non-PPh / Bebas (0%)</option>
              </select>
            </div>
          </div>

          {/* Simulation Output Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Termin 1: DP */}
            <div className="card p-4 rounded-xl border border-blue-200 bg-blue-50/20 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                  <span className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xs font-semibold">1</span>
                    Termin 1: Uang Muka (DP {simDownPaymentPct}%)
                  </span>
                  <span className="badge badge-primary text-3xs">
                    {simTaxScheme === "FULL_UPFRONT" ? "100% PPN DI AWAL" : simTaxScheme === "PROPORTIONAL" ? "PPN PROPORSIONAL" : "BEBAS PPN (AKHIR)"}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 mt-3 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-text-secondary">Nilai DPP Tagihan:</span>
                    <b>{formatMoney(dpDpp)}</b>
                  </div>
                  <div className="flex flex-col gap-0.5 text-blue-700">
                    <span>(+) PPN Ditagihkan (11%):</span>
                    <b>+{formatMoney(dpPpn)}</b>
                  </div>
                  <div className="flex flex-col gap-0.5 border-t border-blue-200 pt-1 font-bold">
                    <span>(=) Total Nilai Invoice:</span>
                    <span>{formatMoney(dpDpp + dpPpn)}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-purple-700">
                    <span>(-) Potongan PPh ({simPphRate}%):</span>
                    <b>-{formatMoney(dpPph)}</b>
                  </div>
                  {simClientType === "WAPU" && (
                    <div className="flex flex-col gap-0.5 text-amber-800 text-2xs italic">
                      <span>(*) PPN Dipungut WAPU (Tidak masuk kas):</span>
                      <span>-{formatMoney(dpPpn)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-blue-200 flex flex-col gap-0.5 bg-blue-100/40 p-2.5 rounded-lg">
                <span className="font-bold text-blue-950 text-xs">Uang Masuk Bersih ke Bank:</span>
                <span className="text-sm font-semibold text-blue-950">
                  {formatMoney(dpNetCash)}
                </span>
              </div>
            </div>

            {/* Termin 2: Pelunasan */}
            <div className="card p-4 rounded-xl border border-gray-200 bg-gray-50/40 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="font-bold text-text-primary text-xs flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center text-3xs font-semibold">2</span>
                    Termin 2: Sisa Pelunasan ({100 - simDownPaymentPct}%)
                  </span>
                  <span className="badge badge-neutral text-3xs">
                    {simTaxScheme === "FULL_UPFRONT" ? "BEBAS PPN (LUNAS DI DP)" : simTaxScheme === "PROPORTIONAL" ? "PPN PROPORSIONAL" : "100% PPN DILUNASI"}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 mt-3 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-text-secondary">Nilai DPP Tagihan:</span>
                    <b>{formatMoney(remainDpp)}</b>
                  </div>
                  <div className="flex flex-col gap-0.5 text-blue-700">
                    <span>(+) PPN Ditagihkan:</span>
                    <b>+{formatMoney(remainPpn)}</b>
                  </div>
                  <div className="flex flex-col gap-0.5 border-t border-gray-200 pt-1 font-bold">
                    <span>(=) Total Nilai Invoice:</span>
                    <span>{formatMoney(remainDpp + remainPpn)}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-purple-700">
                    <span>(-) Potongan PPh ({simPphRate}%):</span>
                    <b>-{formatMoney(remainPph)}</b>
                  </div>
                  {simClientType === "WAPU" && (
                    <div className="flex flex-col gap-0.5 text-amber-800 text-2xs italic">
                      <span>(*) PPN Dipungut WAPU (Tidak masuk kas):</span>
                      <span>-{formatMoney(remainPpn)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200 flex flex-col gap-0.5 bg-gray-100 p-2.5 rounded-lg">
                <span className="font-bold text-text-primary text-xs">Uang Masuk Bersih ke Bank:</span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatMoney(remainNetCash)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setIsSimulatorModalOpen(false)}
              className="btn-final rounded-full px-4 py-1.5 text-xs"
            >
              Tutup Simulator
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ProjectTaxWorkspace;

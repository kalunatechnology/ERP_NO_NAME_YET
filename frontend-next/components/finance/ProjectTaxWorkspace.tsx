/**
 * File: frontend-next/components/finance/ProjectTaxWorkspace.tsx
 *
 * Purpose: Enterprise Tax Workspace for Project PPN & PPh Withholding management.
 * Complies with Indonesian DJP regulations: e-Bupot unifikasi vs NTPN Kas Negara,
 * WAPU vs Non-WAPU treatment, and timing simulation.
 */
"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { cn, formatMoney, formatDate, localDateKey } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";

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

export function ProjectTaxWorkspace() {
  const [transactions, setTransactions] = useState<TaxTransaction[]>(INITIAL_TAX_TRANSACTIONS);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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
    api.get("/api/v1/finance/tax-transactions/projection?page_size=200")
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
  }, []);

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

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      tx.customer_name.toLowerCase().includes(q) ||
      tx.project_name.toLowerCase().includes(q) ||
      tx.invoice_number.toLowerCase().includes(q) ||
      tx.tax_invoice_number.toLowerCase().includes(q);
    const matchesScheme = schemeFilter === "ALL" || tx.tax_scheme === schemeFilter;
    const matchesClient = clientTypeFilter === "ALL" || tx.client_type === clientTypeFilter;
    return matchesSearch && matchesScheme && matchesClient;
  });

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
    <div className="flex flex-col gap-5">
      {/* ── HEADER & ACTIONS ──────────────── */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
            <ShieldCheck className="text-brand-green" size={20} />
            Kepatuhan Pajak Proyek (Tax Compliance & Withholding)
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Manajemen PPN Keluaran, Pemotongan PPh 23 / Final 4(2), Penanganan Klien WAPU, dan Setoran NTPN Kas Negara.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSimulatorModalOpen(true)}
            className="btn-outline py-2 px-3 text-xs gap-1.5 font-semibold text-text-primary border-gray-300 hover:bg-gray-50 shadow-xs flex items-center"
          >
            <Calculator size={14} className="text-blue-600" />
            Simulator Pajak Proyek
          </button>
          <span className="badge badge-neutral text-xs py-1 px-2.5">
            Dibentuk dari Billing terposting
          </span>
        </div>
      </div>

      {/* ── 4 SUMMARY KPI CARDS (Monochrome Enterprise) ───────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="card p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-text-secondary uppercase tracking-wider">Total DPP Proyek</span>
            <Building2 size={16} className="text-gray-500" />
          </div>
          <span className="text-xl font-bold font-mono text-text-primary mt-1.5 block">
            {formatMoney(totalDpp)}
          </span>
          <span className="text-3xs text-text-secondary mt-0.5 block">{transactions.length} Faktur Tagihan Terbit</span>
        </div>

        <div className="card p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-text-secondary uppercase tracking-wider">PPN Keluaran (11%)</span>
            <FileText size={16} className="text-blue-600" />
          </div>
          <span className="text-xl font-bold font-mono text-blue-700 mt-1.5 block">
            {formatMoney(totalPpnIssued)}
          </span>
          <div className="flex items-center gap-2 text-3xs text-text-secondary mt-0.5 font-mono">
            <span>Setor Sendiri: <b className="text-text-primary">{formatMoney(totalPpnSelfPay)}</b></span>
          </div>
        </div>

        <div className="card p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-text-secondary uppercase tracking-wider">PPN Dipungut WAPU</span>
            <ShieldCheck size={16} className="text-amber-600" />
          </div>
          <span className="text-xl font-bold font-mono text-amber-800 mt-1.5 block">
            {formatMoney(totalPpnWapu)}
          </span>
          <span className="text-3xs text-text-secondary mt-0.5 block">Disetor langsung Klien BUMN/Pemerintah</span>
        </div>

        <div className="card p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-text-secondary uppercase tracking-wider">Potongan PPh (Withholding)</span>
            <TrendingUp size={16} className="text-purple-600" />
          </div>
          <span className="text-xl font-bold font-mono text-purple-800 mt-1.5 block">
            {formatMoney(totalPphWithheld)}
          </span>
          <span className="text-3xs text-text-secondary mt-0.5 block">Kredit Pajak PPh 23 & Final 4(2)</span>
        </div>
      </div>

      {/* ── TABEL TRANSAKSI PAJAK PROYEK ── */}
      <div className="card p-5 rounded-2xl border border-gray-200 bg-white shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 className="text-sm font-bold text-text-primary">Buku Besar Faktur & Pajak Proyek</h4>
            <p className="text-2xs text-text-secondary">Daftar transaksi pajak otomatis yang di-generate dari penagihan (billing) termin berstatus POSTED.</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" size={13} />
              <input
                type="text"
                placeholder="Cari no. faktur / klien..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-8 py-1.5 text-xs w-48 font-medium"
              />
            </div>

            <select
              value={clientTypeFilter}
              onChange={(e) => setClientTypeFilter(e.target.value)}
              className="input py-1.5 text-xs font-semibold"
            >
              <option value="ALL">Semua Tipe Klien</option>
              <option value="NON_WAPU">Non-WAPU (Swasta)</option>
              <option value="WAPU">WAPU (BUMN/Pemerintah)</option>
            </select>

            <select
              value={schemeFilter}
              onChange={(e) => setSchemeFilter(e.target.value)}
              className="input py-1.5 text-xs font-semibold"
            >
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
                <th className="py-2.5 px-3.5 font-bold">No. Faktur / Tanggal</th>
                <th className="py-2.5 px-3.5 font-bold">Klien & Proyek</th>
                <th className="py-2.5 px-3.5 font-bold text-right">DPP (Nilai Kena Pajak)</th>
                <th className="py-2.5 px-3.5 font-bold text-right">PPN (11%)</th>
                <th className="py-2.5 px-3.5 font-bold text-right">Potongan PPh</th>
                <th className="py-2.5 px-3.5 font-bold text-right">Kas Bersih (Inflow)</th>
                <th className="py-2.5 px-3.5 font-bold text-right">Kepatuhan & Aksi</th>
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
                      <strong className="text-text-primary font-mono text-xs block">{tx.invoice_number}</strong>
                      <span className="text-3xs text-text-secondary font-mono block mt-0.5">
                        Ref: {tx.tax_invoice_number}
                      </span>
                      <span className="text-3xs text-text-secondary block">{formatDate(tx.tax_date)}</span>
                    </td>

                    <td className="py-3 px-3.5">
                      <strong className="text-text-primary block text-xs">{tx.customer_name}</strong>
                      <span className="text-3xs text-text-secondary block truncate max-w-[200px] mt-0.5">
                        {tx.project_name}
                      </span>
                      <span className={cn(
                        "inline-block px-1.5 py-0.5 rounded text-3xs font-bold uppercase tracking-wider mt-1 border",
                        isWapu 
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : "bg-gray-50 text-text-secondary border-gray-200"
                      )}>
                        {isWapu ? "Klien WAPU (BUMN/Instansi)" : "Non-WAPU (Swasta)"}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-right">
                      <strong className="text-text-primary block font-mono font-bold">{formatMoney(tx.dpp_amount)}</strong>
                      <span className="text-3xs text-text-secondary font-medium block mt-0.5">
                        {tx.tax_scheme === "FULL_UPFRONT" ? "Pajak Di Awal" : tx.tax_scheme === "PROPORTIONAL" ? "Proporsional" : tx.tax_scheme === "FINAL_SETTLEMENT" ? "Pelunasan Akhir" : "Standar"}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono">
                      <span className="font-bold text-blue-700 block">+{formatMoney(tx.ppn_amount)}</span>
                      <span className="text-3xs text-text-secondary block">
                        {isWapu ? "Disetor Klien WAPU" : (isPaid ? "✓ Lunas Kas Negara" : "Wajib Setor Sendiri")}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono">
                      <span className="font-bold text-purple-700 block">-{formatMoney(tx.pph_amount)}</span>
                      <span className="text-3xs text-text-secondary block truncate max-w-[140px]">
                        {tx.pph_type} ({tx.pph_rate}%)
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-right font-mono">
                      <strong className="font-bold text-emerald-700 block text-xs">
                        {formatMoney(tx.net_cash_inflow)}
                      </strong>
                      <span className="text-3xs text-text-secondary block">Masuk Rekening Bank</span>
                    </td>

                    <td className="py-3 px-3.5 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        {/* Status Bupot PPh */}
                        {hasBupot ? (
                          <span className="inline-flex items-center gap-1 text-3xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 size={10} className="text-emerald-600" /> Bupot: {tx.bupot_number}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenBupotModal(tx)}
                            className="btn-outline py-1 px-2.5 text-2xs gap-1 text-purple-700 border-purple-300 hover:bg-purple-50 font-bold"
                          >
                            <FileCheck2 size={11} /> Input Bukti Potong
                          </button>
                        )}

                        {/* Status Setoran NTPN PPN (Hanya untuk Non-WAPU) */}
                        {!isWapu && (
                          isPaid ? (
                            <span className="inline-flex items-center gap-1 text-3xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              <CheckCircle2 size={10} className="text-blue-600" /> NTPN: {tx.ntpn || "LUNAS"}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleOpenNtpnModal(tx)}
                              className="btn-primary py-1 px-2.5 text-2xs gap-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
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
          <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900">
            <span className="block font-bold">Informasi Pemotongan Pajak Klien:</span>
            <div className="grid grid-cols-2 gap-1 mt-1 text-2xs">
              <div>Nilai DPP: <b>{formatMoney(selectedTxForBupot?.dpp_amount || 0)}</b></div>
              <div>Potongan PPh: <b className="text-purple-700">{formatMoney(selectedTxForBupot?.pph_amount || 0)} ({selectedTxForBupot?.pph_rate}%)</b></div>
            </div>
            <p className="mt-1 text-3xs text-purple-800 leading-relaxed">
              Catatan: Bukti Potong adalah bukti bahwa PPh Anda telah dipotong dan disetorkan oleh klien ke kas negara (Kredit Pajak Pasal 23 / Final 4(2)).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-text-primary block mb-1">Nomor Bukti Potong (e-Bupot) *</label>
              <input
                type="text"
                required
                placeholder="Contoh: BP-23-0001892"
                value={bupotForm.bupot_number}
                onChange={(e) => setBupotForm({ ...bupotForm, bupot_number: e.target.value })}
                className="input text-xs font-mono font-bold"
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
              className="btn-primary py-2 px-4 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white"
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
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">
            <span className="block font-bold">Informasi Pembayaran PPN ke Kas Negara:</span>
            <div className="grid grid-cols-2 gap-1 mt-1 text-2xs">
              <div>Jumlah PPN: <b className="text-blue-700">{formatMoney(selectedTxForNtpn?.ppn_amount || 0)}</b></div>
              <div>Kode Billing: <b>{selectedTxForNtpn?.tax_invoice_number || "-"}</b></div>
            </div>
            <p className="mt-1 text-3xs text-blue-800 leading-relaxed">
              NTPN (Nomor Transaksi Penerimaan Negara) adalah bukti resmi 16 karakter setelah pembayaran kode billing via bank/ATM/portal DJP.
            </p>
          </div>

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
                className="input text-xs font-mono font-bold tracking-wider"
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
              className="btn-primary py-2 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs p-4 rounded-xl bg-gray-50 border border-gray-200">
            <div>
              <label className="font-semibold text-text-primary block mb-1">Nilai Kontrak Proyek (DPP)</label>
              <input
                type="number"
                step="1000000"
                value={simContractValue}
                onChange={(e) => setSimContractValue(Number(e.target.value))}
                className="input text-xs font-bold"
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
                className="input text-xs font-bold"
              />
            </div>

            <div>
              <label className="font-semibold text-text-primary block mb-1">Skema Timing Pajak</label>
              <select
                value={simTaxScheme}
                onChange={(e) => setSimTaxScheme(e.target.value as any)}
                className="input text-xs font-semibold"
              >
                <option value="FULL_UPFRONT">🟢 Pajak Penuh di Awal (DP 100% PPN)</option>
                <option value="PROPORTIONAL">🔵 Proporsional per Termin (Standar)</option>
                <option value="FINAL_SETTLEMENT">🟡 Pajak Diselesaikan di Akhir</option>
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
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-3xs font-black">1</span>
                    Termin 1: Uang Muka (DP {simDownPaymentPct}%)
                  </span>
                  <span className="badge badge-primary text-3xs">
                    {simTaxScheme === "FULL_UPFRONT" ? "100% PPN DI AWAL" : simTaxScheme === "PROPORTIONAL" ? "PPN PROPORSIONAL" : "BEBAS PPN (AKHIR)"}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 mt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Nilai DPP Tagihan:</span>
                    <b className="font-mono">{formatMoney(dpDpp)}</b>
                  </div>
                  <div className="flex justify-between text-blue-700">
                    <span>(+) PPN Ditagihkan (11%):</span>
                    <b className="font-mono">+{formatMoney(dpPpn)}</b>
                  </div>
                  <div className="flex justify-between border-t border-blue-200 pt-1 font-bold">
                    <span>(=) Total Nilai Invoice:</span>
                    <span className="font-mono">{formatMoney(dpDpp + dpPpn)}</span>
                  </div>
                  <div className="flex justify-between text-purple-700">
                    <span>(-) Potongan PPh ({simPphRate}%):</span>
                    <b className="font-mono">-{formatMoney(dpPph)}</b>
                  </div>
                  {simClientType === "WAPU" && (
                    <div className="flex justify-between text-amber-800 text-2xs italic">
                      <span>(*) PPN Dipungut WAPU (Tidak masuk kas):</span>
                      <span className="font-mono">-{formatMoney(dpPpn)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-blue-200 flex items-center justify-between bg-blue-100/40 p-2.5 rounded-lg">
                <span className="font-bold text-blue-950 text-xs">Uang Masuk Bersih ke Bank:</span>
                <span className="text-sm font-black font-mono text-blue-950">
                  {formatMoney(dpNetCash)}
                </span>
              </div>
            </div>

            {/* Termin 2: Pelunasan */}
            <div className="card p-4 rounded-xl border border-gray-200 bg-gray-50/40 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="font-bold text-text-primary text-xs flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center text-3xs font-black">2</span>
                    Termin 2: Sisa Pelunasan ({100 - simDownPaymentPct}%)
                  </span>
                  <span className="badge badge-neutral text-3xs">
                    {simTaxScheme === "FULL_UPFRONT" ? "BEBAS PPN (LUNAS DI DP)" : simTaxScheme === "PROPORTIONAL" ? "PPN PROPORSIONAL" : "100% PPN DILUNASI"}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 mt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Nilai DPP Tagihan:</span>
                    <b className="font-mono">{formatMoney(remainDpp)}</b>
                  </div>
                  <div className="flex justify-between text-blue-700">
                    <span>(+) PPN Ditagihkan:</span>
                    <b className="font-mono">+{formatMoney(remainPpn)}</b>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
                    <span>(=) Total Nilai Invoice:</span>
                    <span className="font-mono">{formatMoney(remainDpp + remainPpn)}</span>
                  </div>
                  <div className="flex justify-between text-purple-700">
                    <span>(-) Potongan PPh ({simPphRate}%):</span>
                    <b className="font-mono">-{formatMoney(remainPph)}</b>
                  </div>
                  {simClientType === "WAPU" && (
                    <div className="flex justify-between text-amber-800 text-2xs italic">
                      <span>(*) PPN Dipungut WAPU (Tidak masuk kas):</span>
                      <span className="font-mono">-{formatMoney(remainPpn)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between bg-gray-100 p-2.5 rounded-lg">
                <span className="font-bold text-text-primary text-xs">Uang Masuk Bersih ke Bank:</span>
                <span className="text-sm font-black font-mono text-text-primary">
                  {formatMoney(remainNetCash)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setIsSimulatorModalOpen(false)}
              className="btn-primary py-1.5 px-4 text-xs font-semibold"
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

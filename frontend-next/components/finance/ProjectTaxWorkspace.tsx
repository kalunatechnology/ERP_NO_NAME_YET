/**
 * File: frontend-next/components/finance/ProjectTaxWorkspace.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
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
  Plus,
  Search,
  FileCheck2,
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
}

const INITIAL_TAX_TRANSACTIONS: TaxTransaction[] = [];

export function ProjectTaxWorkspace() {
  const [transactions, setTransactions] = useState<TaxTransaction[]>(INITIAL_TAX_TRANSACTIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [schemeFilter, setSchemeFilter] = useState("ALL");
  const [clientTypeFilter, setClientTypeFilter] = useState("ALL");

  // Simulator state
  const [simContractValue, setSimContractValue] = useState<number>(0);
  const [simDownPaymentPct, setSimDownPaymentPct] = useState<number>(30);
  const [simTaxScheme, setSimTaxScheme] = useState<"PROPORTIONAL" | "FULL_UPFRONT" | "FINAL_SETTLEMENT">("FULL_UPFRONT");
  const [simClientType, setSimClientType] = useState<"NON_WAPU" | "WAPU">("NON_WAPU");
  const [simPphRate, setSimPphRate] = useState<number>(2.0); // 2% PPh 23 or 2.65% Final

  // Modal Bukti Potong
  const [isBupotModalOpen, setIsBupotModalOpen] = useState(false);
  const [selectedTxForBupot, setSelectedTxForBupot] = useState<TaxTransaction | null>(null);
  const [bupotForm, setBupotForm] = useState({
    bupot_number: "",
    bupot_date: localDateKey(),
    tax_type: "PPh 23",
    notes: "",
  });

  // Modal Tambah Faktur Pajak
  const [isAddTaxModalOpen, setIsAddTaxModalOpen] = useState(false);
  const [newTaxForm, setNewTaxForm] = useState({
    customer_name: "",
    project_name: "",
    invoice_number: "",
    dpp_amount: 0,
    tax_scheme: "PROPORTIONAL" as "PROPORTIONAL" | "FULL_UPFRONT" | "FINAL_SETTLEMENT",
    client_type: "NON_WAPU" as "NON_WAPU" | "WAPU",
    pph_type: "PPh 23 (2%)",
    pph_rate: 2.0,
  });

  useEffect(() => {
    api.get("/api/v1/finance/tax-transactions/projection?page_size=200")
      .then((response) => {
        const rows = normalizeList<any>(response.data).rows;
        setTransactions(rows.map((item) => ({
          id: String(item.id),
          invoice_number: item.invoice_number || item.billing_code || item.payment_reference || "",
          tax_invoice_number: item.ntpn || "",
          customer_name: item.customer_name || "",
          project_name: item.project_name || "",
          tax_date: item.tax_date || "",
          dpp_amount: Number(item.taxable_amount || 0),
          ppn_rate: Number(item.tax_rate || 0),
          ppn_amount: Number(item.tax_amount || 0),
          pph_type: item.tax_direction || "",
          pph_rate: 0,
          pph_amount: 0,
          tax_scheme: item.tax_scheme ?? null,
          client_type: "NON_WAPU",
          bupot_status: item.ntpn ? "VERIFIED" : "PENDING",
          bupot_number: item.ntpn || undefined,
          net_cash_inflow: Number(item.taxable_amount || 0) + Number(item.tax_amount || 0),
        })));
      })
      .catch(() => toast.error("Transaksi pajak gagal dimuat dari server."));
  }, []);

  // Calculations for Simulator
  const totalPpnContract = (simContractValue * 11) / 100;
  const dpDpp = (simContractValue * simDownPaymentPct) / 100;
  
  let dpPpn = 0;
  if (simTaxScheme === "FULL_UPFRONT") {
    dpPpn = totalPpnContract; // 100% PPN di awal
  } else if (simTaxScheme === "PROPORTIONAL") {
    dpPpn = (dpDpp * 11) / 100;
  } else {
    dpPpn = 0; // Di akhir
  }

  const dpPph = (dpDpp * simPphRate) / 100;
  const dpGrossInvoice = dpDpp + dpPpn;
  const dpNetCash = simClientType === "NON_WAPU" 
    ? dpDpp + dpPpn - dpPph 
    : dpDpp - dpPph; // If WAPU, PPN is withheld by client

  // Sisa Termin Pelunasan
  const remainDpp = simContractValue - dpDpp;
  let remainPpn = 0;
  if (simTaxScheme === "FULL_UPFRONT") {
    remainPpn = 0; // Sudah lunas di DP
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
    const matchesSearch =
      tx.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.tax_invoice_number.toLowerCase().includes(searchQuery.toLowerCase());
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

  const handleOpenBupotModal = (tx: TaxTransaction) => {
    setSelectedTxForBupot(tx);
    setBupotForm({
      bupot_number: tx.bupot_number || "",
      bupot_date: localDateKey(),
      tax_type: tx.pph_type,
      notes: `Bukti potong atas tagihan ${tx.invoice_number}`,
    });
    setIsBupotModalOpen(true);
  };

  const handleSaveBupot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForBupot) return;

    try {
      await api.post(`/api/v1/finance/tax-transactions/${selectedTxForBupot.id}/record-ntpn`, {
        ntpn: bupotForm.bupot_number,
        payment_reference: selectedTxForBupot.invoice_number,
        paid_at: bupotForm.bupot_date,
      });
      setTransactions((prev) =>
      prev.map((t) =>
        t.id === selectedTxForBupot.id
          ? {
              ...t,
              bupot_status: "VERIFIED",
              bupot_number: bupotForm.bupot_number,
            }
          : t
      )
      );
      toast.success(`Referensi pajak ${bupotForm.bupot_number} berhasil dicatat.`);
      setIsBupotModalOpen(false);
    } catch {
      toast.error("Referensi pajak gagal disimpan.");
    }
  };

  const handleCreateTaxTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    toast.error("Transaksi pajak harus dibentuk dari billing document terposting; penerbitan lokal dinonaktifkan agar tidak menghasilkan data palsu.");
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* ── HEADER & ACTIONS ──────────────── */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
            <ShieldCheck className="text-brand-green" size={20} />
            Kepatuhan Pajak Proyek (Tax Compliance & Withholding)
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Manajemen PPN Keluaran, Pemotongan PPh 23 / Final 4(2), Penanganan Klien WAPU, dan Skema Pembayaran Pajak Awal vs Proporsional.
          </p>
        </div>

        <span className="badge badge-neutral text-xs">Dibentuk dari Billing terposting</span>
      </div>

      {/* ── 4 SUMMARY KPI CARDS ───────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="card p-4 rounded-2xl border border-brand-primary-soft bg-brand-light-green/40">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-brand-deep-green uppercase tracking-wider">Total DPP Proyek</span>
            <Building2 size={16} className="text-brand-green" />
          </div>
          <span className="text-xl font-black text-brand-deep-green mt-1.5 block">
            {formatMoney(totalDpp)}
          </span>
          <span className="text-3xs text-brand-deep-green mt-0.5 block">{transactions.length} Faktur Tagihan Terbit</span>
        </div>

        <div className="card p-4 rounded-2xl border border-blue-200 bg-blue-50/40">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-blue-800 uppercase tracking-wider">PPN Keluaran (11%)</span>
            <FileText size={16} className="text-blue-600" />
          </div>
          <span className="text-xl font-black text-blue-900 mt-1.5 block">
            {formatMoney(totalPpnIssued)}
          </span>
          <div className="flex items-center gap-2 text-3xs text-blue-700 mt-0.5">
            <span>Setor Sendiri: <b>{formatMoney(totalPpnSelfPay)}</b></span>
          </div>
        </div>

        <div className="card p-4 rounded-2xl border border-amber-200 bg-amber-50/40">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-amber-800 uppercase tracking-wider">PPN Dipungut WAPU</span>
            <ShieldCheck size={16} className="text-amber-600" />
          </div>
          <span className="text-xl font-black text-amber-900 mt-1.5 block">
            {formatMoney(totalPpnWapu)}
          </span>
          <span className="text-3xs text-amber-700 mt-0.5 block">Disetor langsung Klien BUMN/Pemerintah</span>
        </div>

        <div className="card p-4 rounded-2xl border border-purple-200 bg-purple-50/40">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-bold text-purple-800 uppercase tracking-wider">Potongan PPh (Withholding)</span>
            <TrendingUp size={16} className="text-purple-600" />
          </div>
          <span className="text-xl font-black text-purple-900 mt-1.5 block">
            {formatMoney(totalPphWithheld)}
          </span>
          <span className="text-3xs text-purple-700 mt-0.5 block">Kredit Pajak PPh 23 & Final 4(2)</span>
        </div>
      </div>

      {/* ── INTERACTIVE TAX SIMULATOR & TIMING ENGINE ── */}
      <div className="card p-5 rounded-2xl border border-text-tertiary bg-white shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-text-tertiary/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-light-green text-brand-deep-green flex items-center justify-center font-bold">
              <Calculator size={17} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-text-primary">
                Simulator & Kalkulator Skema Pajak Proyek (Uang Muka DP vs Pelunasan)
              </h4>
              <p className="text-2xs text-text-secondary">
                Simulasikan perlakuan pajak di awal (DP 100% PPN), proporsional per termin, atau potongan PPh WAPU.
              </p>
            </div>
          </div>
          <span className="badge badge-success text-3xs font-bold">
            Kalkulasi aktif
          </span>
        </div>

        {/* Input Parameters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
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
              <option value="NON_WAPU">Swasta (Non-WAPU - Bayar PPN ke Kita)</option>
              <option value="WAPU">BUMN / Instansi (WAPU - Pungut Sendiri)</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-text-primary block mb-1">Tarif Potongan PPh</label>
            <select
              value={simPphRate}
              onChange={(e) => setSimPphRate(Number(e.target.value))}
              className="input text-xs font-semibold"
            >
              <option value={2.0}>PPh 23 Jasa Teknik (2.0%)</option>
              <option value={1.75}>PPh Final Konstruksi Kecil (1.75%)</option>
              <option value={2.65}>PPh Final Konstruksi Menengah (2.65%)</option>
              <option value={4.0}>PPh Final Konsultansi (4.0%)</option>
              <option value={0}>Bebas Potongan (0.0%)</option>
            </select>
          </div>
        </div>

        {/* Live Calculation Results: Two Phase Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          {/* Phase 1: Uang Muka DP */}
          <div className="p-4 rounded-xl border border-brand-primary-soft bg-white shadow-2xs flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-brand-deep-green flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-green text-white flex items-center justify-center text-3xs font-bold">1</span>
                Termin 1: Uang Muka (DP {simDownPaymentPct}%)
              </span>
              <span className="text-3xs px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-brand-light-green text-brand-deep-green">
                {simTaxScheme === "FULL_UPFRONT" ? "100% PPN Di Awal" : "Proporsional"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-text-tertiary/50">
              <div className="text-text-secondary">Nilai DPP Tagihan:</div>
              <div className="font-bold text-text-primary text-right">{formatMoney(dpDpp)}</div>

              <div className="text-text-secondary">(+) PPN Ditagihkan (11%):</div>
              <div className="font-bold text-blue-700 text-right">+{formatMoney(dpPpn)}</div>

              <div className="text-text-secondary">(=) Total Nilai Invoice:</div>
              <div className="font-bold text-text-primary text-right">{formatMoney(dpGrossInvoice)}</div>

              <div className="text-text-secondary">(-) Potongan PPh ({simPphRate}%):</div>
              <div className="font-bold text-purple-700 text-right">-{formatMoney(dpPph)}</div>

              {simClientType === "WAPU" && (
                <>
                  <div className="text-amber-700 font-medium">(-) PPN Disetor Klien (WAPU):</div>
                  <div className="font-bold text-amber-700 text-right">-{formatMoney(dpPpn)}</div>
                </>
              )}
            </div>

            <div className="mt-2 p-2.5 rounded-lg bg-brand-light-green border border-brand-primary-soft flex justify-between items-center text-xs">
              <span className="font-bold text-brand-deep-green">Uang Masuk Bersih ke Bank:</span>
              <span className="text-sm font-black text-brand-deep-green">{formatMoney(dpNetCash)}</span>
            </div>
          </div>

          {/* Phase 2: Sisa Pelunasan */}
          <div className="p-4 rounded-xl border border-text-tertiary bg-white shadow-2xs flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-neutral-600 text-white flex items-center justify-center text-3xs font-bold">2</span>
                Termin 2: Sisa Pelunasan ({100 - simDownPaymentPct}%)
              </span>
              <span className="text-3xs px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-bg-light text-text-secondary border border-text-tertiary">
                {simTaxScheme === "FULL_UPFRONT" ? "Bebas PPN (Lunas di DP)" : "Proporsional"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-text-tertiary/50">
              <div className="text-text-secondary">Nilai DPP Tagihan:</div>
              <div className="font-bold text-text-primary text-right">{formatMoney(remainDpp)}</div>

              <div className="text-text-secondary">(+) PPN Ditagihkan:</div>
              <div className="font-bold text-blue-700 text-right">+{formatMoney(remainPpn)}</div>

              <div className="text-text-secondary">(=) Total Nilai Invoice:</div>
              <div className="font-bold text-text-primary text-right">{formatMoney(remainDpp + remainPpn)}</div>

              <div className="text-text-secondary">(-) Potongan PPh ({simPphRate}%):</div>
              <div className="font-bold text-purple-700 text-right">-{formatMoney(remainPph)}</div>

              {simClientType === "WAPU" && (
                <>
                  <div className="text-amber-700 font-medium">(-) PPN Disetor Klien (WAPU):</div>
                  <div className="font-bold text-amber-700 text-right">-{formatMoney(remainPpn)}</div>
                </>
              )}
            </div>

            <div className="mt-2 p-2.5 rounded-lg bg-bg-light border border-text-tertiary flex justify-between items-center text-xs">
              <span className="font-bold text-text-primary">Uang Masuk Bersih ke Bank:</span>
              <span className="text-sm font-black text-text-primary">{formatMoney(remainNetCash)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABLE: DAFTAR TRANSAKSI & FAKTUR PAJAK PROYEK ── */}
      <div className="card p-5 rounded-2xl border border-text-tertiary bg-white flex flex-col gap-3.5 shadow-2xs">
        {/* Controls */}
        <div className="flex justify-between items-center flex-wrap gap-3 pb-1">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3 top-3 text-text-secondary" />
              <input
                type="text"
                placeholder="Cari faktur, klien, nomor e-Faktur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-9 text-xs h-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <select
              value={schemeFilter}
              onChange={(e) => setSchemeFilter(e.target.value)}
              className="input h-9 px-2.5 text-xs font-semibold"
            >
              <option value="ALL">Semua Skema Pajak</option>
              <option value="FULL_UPFRONT">Pajak Penuh di Awal</option>
              <option value="PROPORTIONAL">Proporsional per Termin</option>
            </select>

            <select
              value={clientTypeFilter}
              onChange={(e) => setClientTypeFilter(e.target.value)}
              className="input h-9 px-2.5 text-xs font-semibold"
            >
              <option value="ALL">Semua Tipe Klien</option>
              <option value="NON_WAPU">Non-WAPU (Swasta)</option>
              <option value="WAPU">WAPU (BUMN/Pemerintah)</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="table-scroll-wrapper border border-text-tertiary/70 rounded-xl overflow-hidden">
          <table className="w-full data-table text-xs text-left min-w-[760px]">
            <thead>
              <tr className="bg-bg-light text-text-secondary text-3xs uppercase tracking-wider border-b border-text-tertiary">
                <th className="py-3 px-3.5 font-bold">No. Faktur / Tanggal</th>
                <th className="py-3 px-3.5 font-bold">Klien & Proyek</th>
                <th className="py-3 px-3.5 font-bold">DPP & Skema Pajak</th>
                <th className="py-3 px-3.5 font-bold">PPN (11%)</th>
                <th className="py-3 px-3.5 font-bold">Potongan PPh</th>
                <th className="py-3 px-3.5 font-bold">Kas Bersih (Inflow)</th>
                <th className="py-3 px-3.5 font-bold text-right">Status Bukti Potong</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-text-tertiary/40">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-brand-light-green/20 transition-colors">
                  <td className="py-3 px-3.5">
                    <strong className="text-text-primary font-mono text-xs block">{tx.invoice_number}</strong>
                    <span className="text-3xs text-text-secondary font-mono block mt-0.5">
                      e-Faktur: {tx.tax_invoice_number}
                    </span>
                    <span className="text-3xs text-text-secondary block">{formatDate(tx.tax_date)}</span>
                  </td>

                  <td className="py-3 px-3.5">
                    <strong className="text-text-primary block text-xs">{tx.customer_name}</strong>
                    <span className="text-3xs text-text-secondary block truncate max-w-[200px] mt-0.5">
                      {tx.project_name}
                    </span>
                    <span className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-3xs font-bold uppercase tracking-wider mt-1",
                      tx.client_type === "WAPU" 
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-bg-light text-text-secondary border border-text-tertiary"
                    )}>
                      {tx.client_type === "WAPU" ? "Klien WAPU (BUMN)" : "Non-WAPU"}
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <strong className="text-text-primary block font-bold">{formatMoney(tx.dpp_amount)}</strong>
                    <span className="text-3xs text-brand-deep-green font-semibold block mt-0.5">
                      {tx.tax_scheme === "FULL_UPFRONT" ? "Pajak Di Awal" : tx.tax_scheme === "PROPORTIONAL" ? "Proporsional" : tx.tax_scheme === "FINAL_SETTLEMENT" ? "Pelunasan Akhir" : "Belum ditentukan"}
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <span className="font-bold text-blue-700 block">+{formatMoney(tx.ppn_amount)}</span>
                    <span className="text-3xs text-text-secondary block">
                      {tx.client_type === "WAPU" ? "Disetor Klien" : "Wajib Setor"}
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <span className="font-bold text-purple-700 block">-{formatMoney(tx.pph_amount)}</span>
                    <span className="text-3xs text-text-secondary block truncate max-w-[130px]">
                      {tx.pph_type} ({tx.pph_rate}%)
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <strong className="font-black text-brand-deep-green block text-xs">
                      {formatMoney(tx.net_cash_inflow)}
                    </strong>
                    <span className="text-3xs text-text-secondary block">Masuk Rekening Bank</span>
                  </td>

                  <td className="py-3 px-3.5 text-right">
                    {tx.bupot_status === "VERIFIED" ? (
                      <div className="flex flex-col items-end">
                        <span className="badge badge-success text-3xs gap-1">
                          <CheckCircle2 size={11} className="text-brand-green" /> Bupot Verified
                        </span>
                        <span className="text-3xs text-text-secondary font-mono mt-0.5">{tx.bupot_number}</span>
                      </div>
                    ) : tx.bupot_status === "RECEIVED" ? (
                      <button
                        onClick={() => handleOpenBupotModal(tx)}
                        className="btn-outline py-1 px-2.5 text-2xs gap-1 text-brand-deep-green border-brand-primary-soft hover:bg-brand-light-green font-bold"
                      >
                        <FileCheck2 size={12} /> Verifikasi Bupot
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenBupotModal(tx)}
                        className="btn-ghost py-1 px-2.5 text-2xs gap-1 text-amber-700 hover:bg-amber-50 font-bold"
                      >
                        <AlertCircle size={12} /> Input Bukti Potong
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL: INPUT / VERIFIKASI BUKTI POTONG (BUPOT) PPH ── */}
      <Modal
        isOpen={isBupotModalOpen}
        onClose={() => setIsBupotModalOpen(false)}
        title="📜 Verifikasi Bukti Potong (Bupot) PPh Klien"
        subtitle={`Faktur: ${selectedTxForBupot?.invoice_number} — Klien: ${selectedTxForBupot?.customer_name}`}
        size="md"
      >
        <form onSubmit={handleSaveBupot} className="flex flex-col gap-3.5 p-1 text-xs">
          <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900">
            <span className="block font-bold">Informasi Pemotongan Pajak:</span>
            <div className="grid grid-cols-2 gap-1 mt-1 text-2xs">
              <div>Nilai DPP: <b>{formatMoney(selectedTxForBupot?.dpp_amount || 0)}</b></div>
              <div>Potongan PPh: <b className="text-purple-700">{formatMoney(selectedTxForBupot?.pph_amount || 0)} ({selectedTxForBupot?.pph_rate}%)</b></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-text-primary block mb-1">Nomor Bukti Potong (e-Bupot) *</label>
              <input
                type="text"
                required
                placeholder="Contoh: BP-23-CISCO-2026-088"
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
              className="input text-xs bg-bg-light text-text-secondary font-semibold"
            />
          </div>

          <div>
            <label className="font-bold text-text-primary block mb-1">Catatan Verifikasi Pajak</label>
            <input
              type="text"
              placeholder="Catatan pelaporan SPT Masa / kredit pajak..."
              value={bupotForm.notes}
              onChange={(e) => setBupotForm({ ...bupotForm, notes: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-text-tertiary">
            <button
              type="button"
              onClick={() => setIsBupotModalOpen(false)}
              className="btn-ghost py-1.5 px-3 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary py-2 px-4 text-xs font-bold"
            >
              Simpan & Verifikasi Bukti Potong
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: TERBITKAN FAKTUR PAJAK BARU ── */}
      <Modal
        isOpen={isAddTaxModalOpen}
        onClose={() => setIsAddTaxModalOpen(false)}
        title="Terbitkan Faktur Pajak & Billing Proyek"
        subtitle="Entri faktur PPN dan perhitungan withholding tax PPh"
        size="md"
      >
        <form onSubmit={handleCreateTaxTransaction} className="flex flex-col gap-3 p-1 text-xs">
          <div>
            <label className="font-bold text-text-primary block mb-1">Nama Klien / Perusahaan *</label>
            <input
              type="text"
              required
              placeholder="Contoh: PT. Adhi Karya (Persero) Tbk"
              value={newTaxForm.customer_name}
              onChange={(e) => setNewTaxForm({ ...newTaxForm, customer_name: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div>
            <label className="font-bold text-text-primary block mb-1">Nama Proyek Terkait *</label>
            <input
              type="text"
              required
              placeholder="Contoh: Pekerjaan Instalasi Instrumentasi & Otomasi"
              value={newTaxForm.project_name}
              onChange={(e) => setNewTaxForm({ ...newTaxForm, project_name: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-text-primary block mb-1">Nilai DPP Tagihan (Rp) *</label>
              <input
                type="number"
                required
                min="100000"
                value={newTaxForm.dpp_amount}
                onChange={(e) => setNewTaxForm({ ...newTaxForm, dpp_amount: Number(e.target.value) })}
                className="input text-xs font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-text-primary block mb-1">Nomor Referensi Invoice</label>
              <input
                type="text"
                placeholder="INV-2026-009"
                value={newTaxForm.invoice_number}
                onChange={(e) => setNewTaxForm({ ...newTaxForm, invoice_number: e.target.value })}
                className="input text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-text-primary block mb-1">Skema Timing Pajak</label>
              <select
                value={newTaxForm.tax_scheme}
                onChange={(e) => setNewTaxForm({ ...newTaxForm, tax_scheme: e.target.value as any })}
                className="input text-xs font-semibold"
              >
                <option value="PROPORTIONAL">Proporsional per Termin</option>
                <option value="FULL_UPFRONT">🟢 Pajak Penuh di Awal (DP 100% PPN)</option>
                <option value="FINAL_SETTLEMENT">Pajak di Akhir / Pelunasan</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-text-primary block mb-1">Tipe Pemungut Klien</label>
              <select
                value={newTaxForm.client_type}
                onChange={(e) => setNewTaxForm({ ...newTaxForm, client_type: e.target.value as any })}
                className="input text-xs font-semibold"
              >
                <option value="NON_WAPU">Non-WAPU (Swasta)</option>
                <option value="WAPU">WAPU (BUMN / Pemerintah)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-text-primary block mb-1">Jenis & Tarif PPh Withholding</label>
            <select
              value={newTaxForm.pph_rate}
              onChange={(e) => {
                const rate = Number(e.target.value);
                let label = "PPh 23 (2%)";
                if (rate === 1.75) label = "PPh Final Konstruksi Kecil (1.75%)";
                if (rate === 2.65) label = "PPh Final Konstruksi Menengah (2.65%)";
                if (rate === 4.0) label = "PPh Final Konsultansi (4%)";
                if (rate === 0) label = "Bebas Potongan (0%)";
                setNewTaxForm({ ...newTaxForm, pph_rate: rate, pph_type: label });
              }}
              className="input text-xs font-semibold"
            >
              <option value={2.0}>PPh 23 Jasa Teknik & Konsultansi (2%)</option>
              <option value={1.75}>PPh Final Jasa Pelaksana Konstruksi Kualifikasi Kecil (1.75%)</option>
              <option value={2.65}>PPh Final Jasa Pelaksana Konstruksi Kualifikasi Menengah/Besar (2.65%)</option>
              <option value={4.0}>PPh Final Jasa Konsultansi Konstruksi (4%)</option>
              <option value={0}>Non-PPh / Bebas Potongan (0%)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-text-tertiary">
            <button
              type="button"
              onClick={() => setIsAddTaxModalOpen(false)}
              className="btn-ghost py-1.5 px-3 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary py-2 px-4 text-xs font-bold"
            >
              Terbitkan Faktur Pajak
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}

export default ProjectTaxWorkspace;

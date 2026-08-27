"use client";

import { useState } from "react";
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
import { cn, formatMoney, formatDate } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import toast from "react-hot-toast";

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
  tax_scheme: "PROPORTIONAL" | "FULL_UPFRONT" | "FINAL_SETTLEMENT";
  client_type: "NON_WAPU" | "WAPU";
  bupot_status: "PENDING" | "RECEIVED" | "VERIFIED";
  bupot_number?: string;
  net_cash_inflow: number;
}

const INITIAL_TAX_TRANSACTIONS: TaxTransaction[] = [
  {
    id: "tax-001",
    invoice_number: "INV-CISCO-001",
    tax_invoice_number: "010.002-26.88219010",
    customer_name: "PT Cisco Systems Indonesia",
    project_name: "Produksi Video Content Komersial PT Cisco Systems Indonesia",
    tax_date: "2026-08-20",
    dpp_amount: 75000000,
    ppn_rate: 11,
    ppn_amount: 8250000,
    pph_type: "PPh Pasal 23 (Jasa Teknik)",
    pph_rate: 2,
    pph_amount: 1500000,
    tax_scheme: "FULL_UPFRONT",
    client_type: "NON_WAPU",
    bupot_status: "RECEIVED",
    bupot_number: "BP-23-CISCO-2026-088",
    net_cash_inflow: 81750000, // DPP (75jt) + PPN (8.25jt) - PPh (1.5jt)
  },
  {
    id: "tax-002",
    invoice_number: "INV-OTO-001",
    tax_invoice_number: "010.002-26.44910212",
    customer_name: "PT Industri Otomasi Indonesia",
    project_name: "Implementasi Sistem Otomasi Conveyor Line 1",
    tax_date: "2026-08-22",
    dpp_amount: 120000000,
    ppn_rate: 11,
    ppn_amount: 13200000,
    pph_type: "PPh Final Konstruksi (Pasal 4(2))",
    pph_rate: 2.65,
    pph_amount: 3180000,
    tax_scheme: "PROPORTIONAL",
    client_type: "NON_WAPU",
    bupot_status: "VERIFIED",
    bupot_number: "BP-42-OTO-2026-041",
    net_cash_inflow: 130020000,
  },
  {
    id: "tax-003",
    invoice_number: "INV-PLN-2026-01",
    tax_invoice_number: "030.002-26.11029481",
    customer_name: "PT PLN (Persero) Unit Distribusi",
    project_name: "Pengadaan Panel PLC & SCADA Gardu Induk",
    tax_date: "2026-08-25",
    dpp_amount: 250000000,
    ppn_rate: 11,
    ppn_amount: 27500000,
    pph_type: "PPh 22 / PPh 23 WAPU",
    pph_rate: 2,
    pph_amount: 5000000,
    tax_scheme: "PROPORTIONAL",
    client_type: "WAPU",
    bupot_status: "RECEIVED",
    bupot_number: "BUPOT-WAPU-PLN-0891",
    net_cash_inflow: 245000000, // WAPU: Klien setor PPN langsung, kas diterima = DPP - PPh
  },
  {
    id: "tax-004",
    invoice_number: "INV-TELKOM-2026-02",
    tax_invoice_number: "030.002-26.55102938",
    customer_name: "PT Telkom Indonesia Tbk",
    project_name: "Instalasi Jaringan Fiber Optic Datacenter",
    tax_date: "2026-08-26",
    dpp_amount: 180000000,
    ppn_rate: 11,
    ppn_amount: 19800000,
    pph_type: "PPh Final Konstruksi (Pasal 4(2))",
    pph_rate: 1.75,
    pph_amount: 3150000,
    tax_scheme: "FULL_UPFRONT",
    client_type: "WAPU",
    bupot_status: "PENDING",
    net_cash_inflow: 176850000,
  },
];

export function ProjectTaxWorkspace() {
  const [transactions, setTransactions] = useState<TaxTransaction[]>(INITIAL_TAX_TRANSACTIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [schemeFilter, setSchemeFilter] = useState("ALL");
  const [clientTypeFilter, setClientTypeFilter] = useState("ALL");

  // Simulator state
  const [simContractValue, setSimContractValue] = useState<number>(300000000);
  const [simDownPaymentPct, setSimDownPaymentPct] = useState<number>(30);
  const [simTaxScheme, setSimTaxScheme] = useState<"PROPORTIONAL" | "FULL_UPFRONT" | "FINAL_SETTLEMENT">("FULL_UPFRONT");
  const [simClientType, setSimClientType] = useState<"NON_WAPU" | "WAPU">("NON_WAPU");
  const [simPphRate, setSimPphRate] = useState<number>(2.0); // 2% PPh 23 or 2.65% Final

  // Modal Bukti Potong
  const [isBupotModalOpen, setIsBupotModalOpen] = useState(false);
  const [selectedTxForBupot, setSelectedTxForBupot] = useState<TaxTransaction | null>(null);
  const [bupotForm, setBupotForm] = useState({
    bupot_number: "",
    bupot_date: new Date().toISOString().split("T")[0],
    tax_type: "PPh 23",
    notes: "",
  });

  // Modal Tambah Faktur Pajak
  const [isAddTaxModalOpen, setIsAddTaxModalOpen] = useState(false);
  const [newTaxForm, setNewTaxForm] = useState({
    customer_name: "",
    project_name: "",
    invoice_number: "",
    dpp_amount: 50000000,
    tax_scheme: "PROPORTIONAL" as "PROPORTIONAL" | "FULL_UPFRONT" | "FINAL_SETTLEMENT",
    client_type: "NON_WAPU" as "NON_WAPU" | "WAPU",
    pph_type: "PPh 23 (2%)",
    pph_rate: 2.0,
  });

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
      bupot_number: tx.bupot_number || `BP-${Date.now().toString().slice(-6)}`,
      bupot_date: new Date().toISOString().split("T")[0],
      tax_type: tx.pph_type,
      notes: `Bukti potong atas tagihan ${tx.invoice_number}`,
    });
    setIsBupotModalOpen(true);
  };

  const handleSaveBupot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForBupot) return;

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
    toast.success(`Bukti Potong ${bupotForm.bupot_number} berhasil diverifikasi!`, { icon: "📜" });
    setIsBupotModalOpen(false);
  };

  const handleCreateTaxTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const dpp = Number(newTaxForm.dpp_amount);
    const ppn = (dpp * 11) / 100;
    const pph = (dpp * newTaxForm.pph_rate) / 100;
    const net = newTaxForm.client_type === "NON_WAPU" ? dpp + ppn - pph : dpp - pph;

    const newTx: TaxTransaction = {
      id: "tax-" + Date.now(),
      invoice_number: newTaxForm.invoice_number || `INV-${Date.now().toString().slice(-4)}`,
      tax_invoice_number: `010.002-26.${Math.floor(10000000 + Math.random() * 90000000)}`,
      customer_name: newTaxForm.customer_name,
      project_name: newTaxForm.project_name,
      tax_date: new Date().toISOString().split("T")[0],
      dpp_amount: dpp,
      ppn_rate: 11,
      ppn_amount: ppn,
      pph_type: newTaxForm.pph_type,
      pph_rate: newTaxForm.pph_rate,
      pph_amount: pph,
      tax_scheme: newTaxForm.tax_scheme,
      client_type: newTaxForm.client_type,
      bupot_status: "PENDING",
      net_cash_inflow: net,
    };

    setTransactions([newTx, ...transactions]);
    toast.success("Faktur Pajak & Transaksi Billing berhasil dicatat!", { icon: "🧾" });
    setIsAddTaxModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* ── HEADER & ACTIONS ──────────────── */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" size={20} />
            Kepatuhan Pajak Proyek (Tax Compliance &amp; Withholding)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manajemen PPN Keluaran, Pemotongan PPh 23 / Final 4(2), Penanganan Klien WAPU, dan Skema Pembayaran Pajak Awal vs Proporsional.
          </p>
        </div>

        <button
          onClick={() => setIsAddTaxModalOpen(true)}
          className="btn-primary py-2 px-3.5 text-xs gap-1.5 bg-[#275433] hover:bg-[#1E4327] shadow-sm cursor-pointer"
        >
          <Plus size={15} /> Terbitkan Faktur Pajak Proyek
        </button>
      </div>

      {/* ── 4 SUMMARY KPI CARDS ───────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="card p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Total DPP Proyek</span>
            <Building2 size={16} className="text-emerald-600" />
          </div>
          <span className="text-xl font-black text-emerald-900 mt-1.5 block">
            {formatMoney(totalDpp)}
          </span>
          <span className="text-[11px] text-emerald-700/80 mt-0.5 block">{transactions.length} Faktur Tagihan Terbit</span>
        </div>

        <div className="card p-4 rounded-2xl border border-blue-200 bg-blue-50/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">PPN Keluaran (11%)</span>
            <FileText size={16} className="text-blue-600" />
          </div>
          <span className="text-xl font-black text-blue-900 mt-1.5 block">
            {formatMoney(totalPpnIssued)}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-blue-700/80 mt-0.5">
            <span>Setor Sendiri: <b>{formatMoney(totalPpnSelfPay)}</b></span>
          </div>
        </div>

        <div className="card p-4 rounded-2xl border border-amber-200 bg-amber-50/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">PPN Dipungut WAPU</span>
            <ShieldCheck size={16} className="text-amber-600" />
          </div>
          <span className="text-xl font-black text-amber-900 mt-1.5 block">
            {formatMoney(totalPpnWapu)}
          </span>
          <span className="text-[11px] text-amber-700/80 mt-0.5 block">Disetor langsung Klien BUMN/Pemerintah</span>
        </div>

        <div className="card p-4 rounded-2xl border border-purple-200 bg-purple-50/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">Potongan PPh (Withholding)</span>
            <TrendingUp size={16} className="text-purple-600" />
          </div>
          <span className="text-xl font-black text-purple-900 mt-1.5 block">
            {formatMoney(totalPphWithheld)}
          </span>
          <span className="text-[11px] text-purple-700/80 mt-0.5 block">Kredit Pajak PPh 23 &amp; Final 4(2)</span>
        </div>
      </div>

      {/* ── INTERACTIVE TAX SIMULATOR & TIMING ENGINE ── */}
      <div className="card p-5 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/50 to-emerald-50/20 shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <Calculator size={17} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                Simulator &amp; Kalkulator Skema Pajak Proyek (Uang Muka DP vs Pelunasan)
              </h4>
              <p className="text-[11px] text-slate-500">
                Simulasikan perlakuan pajak di awal (DP 100% PPN), proporsional per termin, atau potongan PPh WAPU.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
            ⚡ Live Engine
          </span>
        </div>

        {/* Input Parameters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Nilai Kontrak Proyek (DPP)</label>
            <input
              type="number"
              step="1000000"
              value={simContractValue}
              onChange={(e) => setSimContractValue(Number(e.target.value))}
              className="input text-xs font-bold text-slate-800"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Persentase DP Awal (%)</label>
            <input
              type="number"
              min="10"
              max="90"
              value={simDownPaymentPct}
              onChange={(e) => setSimDownPaymentPct(Number(e.target.value))}
              className="input text-xs font-bold text-slate-800"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Skema Timing Pajak</label>
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
            <label className="font-semibold text-slate-700 block mb-1">Tipe Pemungut Klien</label>
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
            <label className="font-semibold text-slate-700 block mb-1">Tarif Potongan PPh</label>
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
          <div className="p-4 rounded-xl border border-emerald-200 bg-white shadow-2xs flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                Termin 1: Uang Muka (DP {simDownPaymentPct}%)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                {simTaxScheme === "FULL_UPFRONT" ? "100% PPN Di Awal" : "Proporsional"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
              <div className="text-slate-500">Nilai DPP Tagihan:</div>
              <div className="font-bold text-slate-800 text-right">{formatMoney(dpDpp)}</div>

              <div className="text-slate-500">(+) PPN Ditagihkan (11%):</div>
              <div className="font-bold text-blue-700 text-right">+{formatMoney(dpPpn)}</div>

              <div className="text-slate-500">(=) Total Nilai Invoice:</div>
              <div className="font-bold text-slate-900 text-right">{formatMoney(dpGrossInvoice)}</div>

              <div className="text-slate-500">(-) Potongan PPh ({simPphRate}%):</div>
              <div className="font-bold text-purple-700 text-right">-{formatMoney(dpPph)}</div>

              {simClientType === "WAPU" && (
                <>
                  <div className="text-amber-700 font-medium">(-) PPN Disetor Klien (WAPU):</div>
                  <div className="font-bold text-amber-700 text-right">-{formatMoney(dpPpn)}</div>
                </>
              )}
            </div>

            <div className="mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex justify-between items-center text-xs">
              <span className="font-bold text-emerald-900">Uang Masuk Bersih ke Bank:</span>
              <span className="text-sm font-black text-emerald-700">{formatMoney(dpNetCash)}</span>
            </div>
          </div>

          {/* Phase 2: Sisa Pelunasan */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-slate-600 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                Termin 2: Sisa Pelunasan ({100 - simDownPaymentPct}%)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                {simTaxScheme === "FULL_UPFRONT" ? "Bebas PPN (Lunas di DP)" : "Proporsional"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
              <div className="text-slate-500">Nilai DPP Tagihan:</div>
              <div className="font-bold text-slate-800 text-right">{formatMoney(remainDpp)}</div>

              <div className="text-slate-500">(+) PPN Ditagihkan:</div>
              <div className="font-bold text-blue-700 text-right">+{formatMoney(remainPpn)}</div>

              <div className="text-slate-500">(=) Total Nilai Invoice:</div>
              <div className="font-bold text-slate-900 text-right">{formatMoney(remainDpp + remainPpn)}</div>

              <div className="text-slate-500">(-) Potongan PPh ({simPphRate}%):</div>
              <div className="font-bold text-purple-700 text-right">-{formatMoney(remainPph)}</div>

              {simClientType === "WAPU" && (
                <>
                  <div className="text-amber-700 font-medium">(-) PPN Disetor Klien (WAPU):</div>
                  <div className="font-bold text-amber-700 text-right">-{formatMoney(remainPpn)}</div>
                </>
              )}
            </div>

            <div className="mt-2 p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-800">Uang Masuk Bersih ke Bank:</span>
              <span className="text-sm font-black text-slate-800">{formatMoney(remainNetCash)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABLE: DAFTAR TRANSAKSI & FAKTUR PAJAK PROYEK ── */}
      <div className="card p-5 rounded-2xl border border-slate-200/90 bg-white flex flex-col gap-3.5 shadow-2xs">
        {/* Controls */}
        <div className="flex justify-between items-center flex-wrap gap-3 pb-1">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Cari faktur, klien, nomor e-Faktur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-hidden focus:border-emerald-600 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <select
              value={schemeFilter}
              onChange={(e) => setSchemeFilter(e.target.value)}
              className="h-9 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700"
            >
              <option value="ALL">Semua Skema Pajak</option>
              <option value="FULL_UPFRONT">Pajak Penuh di Awal</option>
              <option value="PROPORTIONAL">Proporsional per Termin</option>
            </select>

            <select
              value={clientTypeFilter}
              onChange={(e) => setClientTypeFilter(e.target.value)}
              className="h-9 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700"
            >
              <option value="ALL">Semua Tipe Klien</option>
              <option value="NON_WAPU">Non-WAPU (Swasta)</option>
              <option value="WAPU">WAPU (BUMN/Pemerintah)</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="table-scroll-wrapper border border-slate-200/70 rounded-xl overflow-hidden">
          <table className="w-full data-table text-xs text-left min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-3.5 font-bold">No. Faktur / Tanggal</th>
                <th className="py-3 px-3.5 font-bold">Klien &amp; Proyek</th>
                <th className="py-3 px-3.5 font-bold">DPP &amp; Skema Pajak</th>
                <th className="py-3 px-3.5 font-bold">PPN (11%)</th>
                <th className="py-3 px-3.5 font-bold">Potongan PPh</th>
                <th className="py-3 px-3.5 font-bold">Kas Bersih (Inflow)</th>
                <th className="py-3 px-3.5 font-bold text-right">Status Bukti Potong</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-emerald-50/20 transition-colors">
                  <td className="py-3 px-3.5">
                    <strong className="text-slate-800 font-mono text-xs block">{tx.invoice_number}</strong>
                    <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                      e-Faktur: {tx.tax_invoice_number}
                    </span>
                    <span className="text-[10px] text-slate-400 block">{formatDate(tx.tax_date)}</span>
                  </td>

                  <td className="py-3 px-3.5">
                    <strong className="text-slate-800 block text-xs">{tx.customer_name}</strong>
                    <span className="text-[11px] text-slate-500 block truncate max-w-[200px] mt-0.5">
                      {tx.project_name}
                    </span>
                    <span className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mt-1",
                      tx.client_type === "WAPU" 
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-slate-100 text-slate-700"
                    )}>
                      {tx.client_type === "WAPU" ? "🏛️ Klien WAPU (BUMN)" : "🏢 Non-WAPU"}
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <strong className="text-slate-900 block font-bold">{formatMoney(tx.dpp_amount)}</strong>
                    <span className="text-[10px] text-emerald-800 font-semibold block mt-0.5">
                      {tx.tax_scheme === "FULL_UPFRONT" ? "🟢 Pajak Di Awal" : "🔵 Proporsional"}
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <span className="font-bold text-blue-700 block">+{formatMoney(tx.ppn_amount)}</span>
                    <span className="text-[10px] text-slate-500 block">
                      {tx.client_type === "WAPU" ? "Disetor Klien" : "Wajib Setor"}
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <span className="font-bold text-purple-700 block">-{formatMoney(tx.pph_amount)}</span>
                    <span className="text-[10px] text-slate-500 block truncate max-w-[130px]">
                      {tx.pph_type} ({tx.pph_rate}%)
                    </span>
                  </td>

                  <td className="py-3 px-3.5">
                    <strong className="font-black text-emerald-700 block text-xs">
                      {formatMoney(tx.net_cash_inflow)}
                    </strong>
                    <span className="text-[10px] text-slate-500 block">Masuk Rekening Bank</span>
                  </td>

                  <td className="py-3 px-3.5 text-right">
                    {tx.bupot_status === "VERIFIED" ? (
                      <div className="flex flex-col items-end">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={12} className="text-emerald-600" /> Bupot Verified
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono mt-0.5">{tx.bupot_number}</span>
                      </div>
                    ) : tx.bupot_status === "RECEIVED" ? (
                      <button
                        onClick={() => handleOpenBupotModal(tx)}
                        className="btn-outline py-1 px-2.5 text-[11px] gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50 font-bold cursor-pointer"
                      >
                        <FileCheck2 size={12} /> Verifikasi Bupot
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenBupotModal(tx)}
                        className="btn-ghost py-1 px-2.5 text-[11px] gap-1 text-amber-700 hover:bg-amber-50 font-bold cursor-pointer"
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
            <div className="grid grid-cols-2 gap-1 mt-1 text-[11px]">
              <div>Nilai DPP: <b>{formatMoney(selectedTxForBupot?.dpp_amount || 0)}</b></div>
              <div>Potongan PPh: <b className="text-purple-700">{formatMoney(selectedTxForBupot?.pph_amount || 0)} ({selectedTxForBupot?.pph_rate}%)</b></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Nomor Bukti Potong (e-Bupot) *</label>
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
              <label className="font-bold text-slate-700 block mb-1">Tanggal Terbit Bupot *</label>
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
            <label className="font-bold text-slate-700 block mb-1">Jenis Pajak Penghasilan</label>
            <input
              type="text"
              readOnly
              value={bupotForm.tax_type}
              className="input text-xs bg-slate-100 text-slate-600 font-semibold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Catatan Verifikasi Pajak</label>
            <input
              type="text"
              placeholder="Catatan pelaporan SPT Masa / kredit pajak..."
              value={bupotForm.notes}
              onChange={(e) => setBupotForm({ ...bupotForm, notes: e.target.value })}
              className="input text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsBupotModalOpen(false)}
              className="btn-ghost py-1.5 px-3 text-xs cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary py-2 px-4 text-xs bg-emerald-600 hover:bg-emerald-700 font-bold cursor-pointer"
            >
              Simpan &amp; Verifikasi Bukti Potong
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: TERBITKAN FAKTUR PAJAK BARU ── */}
      <Modal
        isOpen={isAddTaxModalOpen}
        onClose={() => setIsAddTaxModalOpen(false)}
        title="🧾 Terbitkan Faktur Pajak & Transaksi Billing Proyek"
        subtitle="Entri faktur PPN dan perhitungan withholding tax PPh"
        size="md"
      >
        <form onSubmit={handleCreateTaxTransaction} className="flex flex-col gap-3 p-1 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Nama Klien / Perusahaan *</label>
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
            <label className="font-bold text-slate-700 block mb-1">Nama Proyek Terkait *</label>
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
              <label className="font-bold text-slate-700 block mb-1">Nilai DPP Tagihan (Rp) *</label>
              <input
                type="number"
                required
                min="100000"
                value={newTaxForm.dpp_amount}
                onChange={(e) => setNewTaxForm({ ...newTaxForm, dpp_amount: Number(e.target.value) })}
                className="input text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Nomor Referensi Invoice</label>
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
              <label className="font-bold text-slate-700 block mb-1">Skema Timing Pajak</label>
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
              <label className="font-bold text-slate-700 block mb-1">Tipe Pemungut Klien</label>
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
            <label className="font-bold text-slate-700 block mb-1">Jenis &amp; Tarif PPh Withholding</label>
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
              <option value={2.0}>PPh 23 Jasa Teknik &amp; Konsultansi (2%)</option>
              <option value={1.75}>PPh Final Jasa Pelaksana Konstruksi Kualifikasi Kecil (1.75%)</option>
              <option value={2.65}>PPh Final Jasa Pelaksana Konstruksi Kualifikasi Menengah/Besar (2.65%)</option>
              <option value={4.0}>PPh Final Jasa Konsultansi Konstruksi (4%)</option>
              <option value={0}>Non-PPh / Bebas Potongan (0%)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddTaxModalOpen(false)}
              className="btn-ghost py-1.5 px-3 text-xs cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-primary py-2 px-4 text-xs bg-[#275433] hover:bg-[#1E4327] font-bold cursor-pointer"
            >
              Terbitkan Faktur Pajak
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}

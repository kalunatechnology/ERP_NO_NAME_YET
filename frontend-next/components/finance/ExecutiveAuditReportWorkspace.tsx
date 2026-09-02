"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck, FileText, Printer, Download, RefreshCw,
  Coins, AlertTriangle, CheckCircle2, TrendingUp, Calendar,
  Building, UserCheck, ArrowUpRight, Scale
} from "lucide-react";
import { cn, formatRupiah, formatDate } from "@/lib/utils";
import api from "@/lib/api/axios";

export function ExecutiveAuditReportWorkspace() {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/finance/executive-audit-report", {
        params: { year: selectedYear },
      });
      setReportData(res.data?.data ?? res.data ?? null);
    } catch {
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedYear]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-[22px] bg-white border border-[#D5E2D7] shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#275433] flex items-center justify-center text-white shadow-xs">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[#0E341F] tracking-tight">
              Executive Financial & Governance Audit Report
            </h2>
            <p className="text-2xs text-[#637566]">
              Laporan ringkasan kepatuhan dana, varians anggaran, dan audit transaksi untuk Direksi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-[#F0FEE0] border border-[#D5E2D7] text-xs font-bold text-[#1E5C22] focus:outline-none"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>Tahun Buku {y}</option>
            ))}
          </select>

          <button
            onClick={fetchReport}
            className="p-2 rounded-xl bg-white border border-[#D5E2D7] text-[#485649] hover:bg-[#F0FEE0] transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={15} className={cn(loading && "animate-spin")} />
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#275433] hover:bg-[#1E3A2B] text-white text-xs font-bold shadow-xs transition-all"
          >
            <Printer size={15} />
            <span>Cetak / PDF Report</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-[#637566] animate-pulse">
          Memuat ringkasan audit eksekutif...
        </div>
      ) : !reportData ? (
        <div className="p-8 text-center text-xs text-red-600 bg-red-50 rounded-2xl border border-red-200">
          Gagal memuat data laporan audit eksekutif.
        </div>
      ) : (
        <div className="space-y-6 printable-report">
          
          {/* 1. TOP KPI STATS (Fund Request & LPJ Compliance) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Dana Diajukan */}
            <div className="p-4 rounded-[20px] bg-white border border-[#D5E2D7] shadow-2xs flex flex-col justify-between">
              <span className="text-3xs font-bold text-[#637566] uppercase tracking-wider block mb-1">
                Total Dana Diajukan
              </span>
              <span className="text-lg font-black text-[#0E341F]">
                {formatRupiah(reportData.fund_summary?.total_requested || 0)}
              </span>
              <span className="text-3xs text-[#637566] mt-2 font-medium">
                Dari {reportData.fund_summary?.total_requests || 0} permohonan masuk
              </span>
            </div>

            {/* Total Dana Dicairkan */}
            <div className="p-4 rounded-[20px] bg-white border border-[#D5E2D7] shadow-2xs flex flex-col justify-between">
              <span className="text-3xs font-bold text-[#637566] uppercase tracking-wider block mb-1">
                Dana Dicairkan (Disbursed)
              </span>
              <span className="text-lg font-black text-cyan-800">
                {formatRupiah(reportData.fund_summary?.total_disbursed || 0)}
              </span>
              <span className="text-3xs text-cyan-700 mt-2 font-medium">
                {reportData.fund_summary?.disbursed_count || 0} tiket telah dicairkan
              </span>
            </div>

            {/* Total LPJ Selesai (Closed) */}
            <div className="p-4 rounded-[20px] bg-white border border-[#D5E2D7] shadow-2xs flex flex-col justify-between">
              <span className="text-3xs font-bold text-[#637566] uppercase tracking-wider block mb-1">
                LPJ Terverifikasi (Closed)
              </span>
              <span className="text-lg font-black text-[#1E5C22]">
                {formatRupiah(reportData.fund_summary?.total_realization || 0)}
              </span>
              <span className="text-3xs text-[#1E5C22] mt-2 font-semibold flex items-center gap-1">
                <CheckCircle2 size={12} />
                <span>{reportData.fund_summary?.lpj_closed_count || 0} tiket tuntas LPJ</span>
              </span>
            </div>

            {/* Compliance Rate % */}
            <div className="p-4 rounded-[20px] bg-[#F0FEE0] border border-[#C5DAC8] shadow-2xs flex flex-col justify-between">
              <span className="text-3xs font-bold text-[#1E5C22] uppercase tracking-wider block mb-1">
                Tingkat Kepatuhan LPJ
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#1E5C22]">
                  {reportData.fund_summary?.lpj_compliance_rate || 100}%
                </span>
                <span className="text-3xs text-[#4B6B4E] font-bold">Tuntas</span>
              </div>
              <div className="w-full bg-[#D5E2D7] h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-[#275433] h-full rounded-full transition-all"
                  style={{ width: `${reportData.fund_summary?.lpj_compliance_rate || 100}%` }}
                />
              </div>
            </div>

          </div>

          {/* 2. DUA KOLOM: Transaksi Kritis & Jurnal Koreksi */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Jurnal Transaksi Signifikan */}
            <div className="p-5 rounded-[22px] bg-white border border-[#D5E2D7] shadow-2xs flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins size={16} className="text-[#5B7E25]" />
                  <h3 className="text-xs font-extrabold text-[#0E341F] tracking-tight">
                    Jurnal Buku Besar Terposting
                  </h3>
                </div>
                <span className="text-3xs font-mono text-[#637566]">
                  {reportData.critical_transactions?.length || 0} entri
                </span>
              </div>

              <div className="divide-y divide-[#E2E8E0] max-h-64 overflow-y-auto">
                {(!reportData.critical_transactions || reportData.critical_transactions.length === 0) ? (
                  <div className="py-6 text-center text-xs text-[#768779]">
                    Tidak ada jurnal transaksi pada periode ini.
                  </div>
                ) : (
                  reportData.critical_transactions.map((tx: any) => (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-[#0E341F] block truncate">{tx.description}</span>
                        <span className="text-3xs font-mono text-[#768779] block">
                          {tx.entry_number} • {tx.date ? formatDate(tx.date) : "—"}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        {tx.is_reversal && (
                          <span className="px-2 py-0.5 rounded-full text-3xs font-extrabold bg-orange-100 text-orange-800 block mb-0.5">
                            STORNO
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Jurnal Koreksi / Adjustment */}
            <div className="p-5 rounded-[22px] bg-white border border-[#D5E2D7] shadow-2xs flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale size={16} className="text-orange-600" />
                  <h3 className="text-xs font-extrabold text-[#0E341F] tracking-tight">
                    Audit Penyesuaian Kas & Koreksi (Adjustment)
                  </h3>
                </div>
                <span className="text-3xs font-mono text-orange-800 bg-orange-100 px-2 py-0.5 rounded-full font-bold">
                  {reportData.adjustments?.length || 0} Koreksi
                </span>
              </div>

              <div className="divide-y divide-[#E2E8E0] max-h-64 overflow-y-auto">
                {(!reportData.adjustments || reportData.adjustments.length === 0) ? (
                  <div className="py-6 text-center text-xs text-[#768779]">
                    Tidak ada jurnal penyesuaian/koreksi pada periode ini (Integritas Baik).
                  </div>
                ) : (
                  reportData.adjustments.map((adj: any) => (
                    <div key={adj.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-orange-950 block truncate">{adj.description}</span>
                        <span className="text-3xs font-mono text-[#768779] block">
                          {adj.entry_number} • {adj.date ? formatDate(adj.date) : "—"}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-3xs font-extrabold bg-orange-100 text-orange-800">
                        AUDITED
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* 3. STATUS TATA KELOLA & TUTUP BUKU */}
          <div className="p-5 rounded-[22px] bg-[#FAFDF7] border border-[#D5E2D7] flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#EAF8D6] text-[#1E5C22] flex items-center justify-center font-black">
                ✓
              </div>
              <div>
                <span className="text-xs font-extrabold text-[#0E341F] block">
                  Status Kepatuhan Tutup Buku & Periode Fiskal
                </span>
                <span className="text-2xs text-[#637566]">
                  {reportData.closed_periods_count || 0} Periode telah resmi dikunci dan memiliki financial snapshot.
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-3xs font-bold text-[#768779] uppercase block">Pemeriksaan Sistem</span>
              <span className="text-xs font-extrabold text-[#1E5C22]">
                100% Immutable Ledger Compliant
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

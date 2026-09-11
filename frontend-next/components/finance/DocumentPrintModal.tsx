/**
 * File: frontend-next/components/finance/DocumentPrintModal.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState } from "react";
import {
  Printer, Download, X, Building2, CheckCircle2, QrCode,
  Calendar, FileText, Landmark
} from "lucide-react";
import { formatRupiah, formatDate } from "@/lib/utils";

interface DocumentPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentData: {
    type: "INVOICE" | "QUOTATION" | "BOM";
    documentNumber: string;
    date: string | Date;
    dueDate?: string | Date;
    clientName: string;
    clientAddress?: string;
    clientNPWP?: string;
    projectName?: string;
    items: Array<{
      description: string;
      quantity: number;
      uom?: string;
      unitPrice: number;
      total: number;
    }>;
    notes?: string;
    bankAccount?: {
      bankName: string;
      accountNumber: string;
      accountName: string;
    };
  } | null;
}

export function DocumentPrintModal({ isOpen, onClose, documentData }: DocumentPrintModalProps) {
  if (!isOpen || !documentData) return null;

  const subtotal = documentData.items.reduce((acc, item) => acc + item.total, 0);
  const ppn = subtotal * 0.11;
  const grandTotal = subtotal + ppn;

  const handlePrint = () => {
    window.print();
  };

  const titleMap = {
    INVOICE: "FAKTUR PENAGIHAN (INVOICE)",
    QUOTATION: "SURAT PENAWARAN HARGA (QUOTATION)",
    BOM: "BILL OF MATERIALS (BOM) RESMI",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto print:p-0 print:bg-white">
      <div className="relative w-full max-w-[820px] my-auto bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] print:max-h-none print:shadow-none print:rounded-none">
        
        {/* Modal Action Header (Hidden in Print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EFEFEF] bg-[#FDFDFD] print:hidden">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[#2649B3]" />
            <span className="text-sm font-extrabold text-[#090909]">
              Pratinjau Cetak Dokumen Resmi
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2649B3] hover:bg-[#2649B3] text-white text-xs font-bold shadow-xs transition-all"
            >
              <Printer size={14} />
              <span>Cetak / Simpan PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#4F5050] hover:bg-[#EFEFEF]/60 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 sm:p-10 overflow-y-auto space-y-6 text-[#2649B3] print:p-0">
          
          {/* 1. Legal Company Header */}
          <div className="flex items-start justify-between border-b-2 border-[#2649B3] pb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-[#2649B3] text-white flex items-center justify-center font-black text-sm">
                  M
                </div>
                <h1 className="text-xl font-black tracking-tight text-[#090909]">
                  PT MARKA ARSALYNK INDONESIA
                </h1>
              </div>
              <p className="text-2xs text-[#4F5050] leading-relaxed">
                Architecture, Engineering, Construction & Enterprise Management<br />
                NPWP: 03.882.910.4-412.000 • Email: finance@arsalynk.com • Telp: (021) 8820-1928<br />
                Jl. Raya Utama No. 88, Gedung Marka Center Lantai 4, Indonesia
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs font-black uppercase text-[#2649B3] tracking-wider block">
                {titleMap[documentData.type]}
              </span>
              <span className="text-base font-black font-mono text-[#090909] block mt-1">
                {documentData.documentNumber}
              </span>
              <span className="text-2xs text-[#4F5050] block mt-0.5">
                Tanggal: {formatDate(documentData.date)}
              </span>
              {documentData.dueDate && (
                <span className="text-2xs font-semibold text-red-700 block">
                  Jatuh Tempo: {formatDate(documentData.dueDate)}
                </span>
              )}
            </div>
          </div>

          {/* 2. Client & Project Info */}
          <div className="grid grid-cols-2 gap-6 text-xs p-4 rounded-xl bg-[#FDFDFD] border border-[#EFEFEF]">
            <div>
              <span className="text-3xs font-bold text-[#4F5050] uppercase tracking-wider block mb-1">
                Ditujukan Kepada:
              </span>
              <span className="font-extrabold text-[#090909] text-sm block">{documentData.clientName}</span>
              {documentData.clientAddress && (
                <p className="text-2xs text-[#4F5050] mt-1 whitespace-pre-wrap">{documentData.clientAddress}</p>
              )}
              {documentData.clientNPWP && (
                <span className="text-3xs text-[#4F5050] block mt-1 font-mono">
                  NPWP: {documentData.clientNPWP}
                </span>
              )}
            </div>

            {documentData.projectName && (
              <div>
                <span className="text-3xs font-bold text-[#4F5050] uppercase tracking-wider block mb-1">
                  Proyek / Pekerjaan:
                </span>
                <span className="font-extrabold text-[#090909] text-sm block">{documentData.projectName}</span>
                <span className="text-2xs text-[#4F5050] block mt-1">
                  Status: Dokumen Resmi Terverifikasi Sistem ERP
                </span>
              </div>
            )}
          </div>

          {/* 3. Items Table */}
          <div className="border border-[#EFEFEF] rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#2649B3] text-white text-3xs uppercase font-extrabold tracking-wider">
                  <th className="py-2.5 px-3 w-10 text-center">No</th>
                  <th className="py-2.5 px-3">Deskripsi Item / Pekerjaan</th>
                  <th className="py-2.5 px-3 text-right w-20">Volume</th>
                  <th className="py-2.5 px-3 text-right w-32">Harga Satuan</th>
                  <th className="py-2.5 px-3 text-right w-36">Total (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF]">
                {documentData.items.map((it, idx) => (
                  <tr key={idx} className="hover:bg-[#FDFDFD]">
                    <td className="py-2.5 px-3 text-center text-[#4F5050]">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold text-[#090909]">{it.description}</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {it.quantity} {it.uom || "Unit"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatRupiah(it.unitPrice)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#090909] font-mono">
                      {formatRupiah(it.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. Financial Summary Breakdown */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-2">
            {/* Bank Transfer Info */}
            <div className="max-w-sm text-2xs space-y-2 p-3.5 rounded-xl bg-[#EAF6FF]/50 border border-[#D9D9D9]">
              <div className="flex items-center gap-1.5 font-bold text-[#2649B3]">
                <Landmark size={14} />
                <span>Instruksi Pembayaran Resmi:</span>
              </div>
              <div className="font-mono text-xs text-[#090909] space-y-0.5">
                <p><b>Bank:</b> {documentData.bankAccount?.bankName || "BCA (Bank Central Asia)"}</p>
                <p><b>No. Rekening:</b> {documentData.bankAccount?.accountNumber || "8830-1928-11"}</p>
                <p><b>Atas Nama:</b> {documentData.bankAccount?.accountName || "PT MARKA ARSALYNK INDONESIA"}</p>
              </div>
              <p className="text-3xs text-[#4F5050] italic">
                *Harap cantumkan nomor dokumen pada berita transfer.
              </p>
            </div>

            {/* Totals Calculation */}
            <div className="w-full sm:w-64 space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[#EFEFEF]">
                <span className="text-[#4F5050]">Subtotal</span>
                <span className="font-bold font-mono">{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#EFEFEF]">
                <span className="text-[#4F5050]">PPN (11%)</span>
                <span className="font-bold font-mono text-[#2649B3]">{formatRupiah(ppn)}</span>
              </div>
              <div className="flex justify-between py-2 border-t-2 border-[#2649B3] text-sm">
                <span className="font-black text-[#090909]">TOTAL AKHIR</span>
                <span className="font-black font-mono text-[#2649B3] text-base">
                  {formatRupiah(grandTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Signatures & Digital QR Stamp */}
          <div className="pt-8 border-t border-[#EFEFEF] flex items-end justify-between text-xs">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border border-[#D9D9D9] bg-[#FDFDFD] flex items-center justify-center p-1">
                <QrCode size={48} className="text-[#2649B3]" />
              </div>
              <div className="text-3xs text-[#4F5050] space-y-0.5">
                <span className="font-bold text-[#2649B3] block">DIGITALLY VERIFIED</span>
                <span>Dokumen sah & diterbitkan oleh</span>
                <span className="font-mono block">System ERP Marka+</span>
              </div>
            </div>

            <div className="text-center w-48 space-y-12">
              <span className="text-3xs font-bold text-[#4F5050] uppercase block">
                Penanggung Jawab Keuangan,
              </span>
              <div className="border-b border-[#090909] pb-1">
                <span className="font-extrabold text-[#090909] text-xs block">
                  Arof Destianto, S.T.
                </span>
                <span className="text-3xs text-[#4F5050] block">Director / Company Admin</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

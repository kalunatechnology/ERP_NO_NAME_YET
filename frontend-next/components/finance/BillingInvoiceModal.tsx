"use client";

import { Printer, CheckCircle2, Clock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatMoney, formatDate, cn, getStatusColor } from "@/lib/utils";

export interface BillingInvoicePreviewData {
  invoiceNumber: string;
  status: string;
  paymentStatus: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  postingDate?: string | null;
  companyName: string;
  customerName: string;
  projectName: string;
  projectCode?: string | null;
  description: string;
  taxScheme?: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}

interface BillingInvoiceModalProps {
  invoice: BillingInvoicePreviewData | null;
  onClose: () => void;
}

export function BillingInvoiceModal({ invoice, onClose }: BillingInvoiceModalProps) {
  if (!invoice) return null;

  const isPosted = String(invoice.status).toUpperCase() === "POSTED";
  const isPaid = String(invoice.paymentStatus).toUpperCase() === "PAID" || invoice.outstandingAmount <= 0;

  return (
    <Modal
      isOpen={Boolean(invoice)}
      onClose={onClose}
      title={`Faktur Tagihan ${invoice.invoiceNumber}`}
      subtitle="Pratinjau dokumen invoice resmi hasil billing termin klien"
      size="2xl"
    >
      <div className="finance-scope flex flex-col gap-5 text-xs text-text-primary">
        {/* Invoice Paper */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs flex flex-col gap-5 print:border-0 print:shadow-none">
          {/* Top Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-4">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
                Faktur Penagihan Resmi
              </span>
              <h2 className="mt-1 text-lg font-bold text-text-primary">{invoice.companyName}</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                Referensi Proyek: <span className="font-semibold text-text-primary">{invoice.projectName}</span>
                {invoice.projectCode ? ` (${invoice.projectCode})` : ""}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">No. Faktur</div>
              <div className="mt-0.5 text-base font-bold text-text-primary">{invoice.invoiceNumber}</div>
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <span className={cn("badge text-[10px] font-semibold py-0.5 px-2", getStatusColor(invoice.status))}>
                  {invoice.status}
                </span>
                <span
                  className={cn(
                    "status-label",
                    isPaid ? "is-ok" : "is-warn",
                  )}
                >
                  {isPaid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                  {isPaid ? "LUNAS" : invoice.paymentStatus || "BELUM LUNAS"}
                </span>
              </div>
            </div>
          </div>

          {/* Bill To & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-slate-50/80 p-4 border border-slate-200/70">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary block">
                Ditagihkan Kepada
              </span>
              <strong className="mt-1 block text-sm font-semibold text-text-primary">{invoice.customerName}</strong>
              {isPosted && (
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-deep-green">
                  <CheckCircle2 size={12} className="text-brand-green" /> Tercatat di GL &amp; Buku Perpajakan
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:text-right">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary block">
                  Tanggal Faktur
                </span>
                <span className="mt-0.5 block font-semibold tabular-nums">
                  {invoice.invoiceDate ? formatDate(invoice.invoiceDate) : "—"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary block">
                  Jatuh Tempo
                </span>
                <span className="mt-0.5 block font-semibold tabular-nums">
                  {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                </span>
              </div>
              {invoice.postingDate && (
                <div className="col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary block">
                    Tanggal Posting GL
                  </span>
                  <span className="mt-0.5 block font-semibold tabular-nums">{formatDate(invoice.postingDate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-text-secondary border-b border-gray-200">
                  <th className="py-2.5 px-4 text-left font-bold">Deskripsi Termin / Tagihan</th>
                  <th className="py-2.5 px-4 text-right font-bold">DPP / Nilai</th>
                  <th className="py-2.5 px-4 text-right font-bold">PPN</th>
                  <th className="py-2.5 px-4 text-right font-bold">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-3.5 px-4">
                    <strong className="block font-semibold text-text-primary">{invoice.description}</strong>
                    {invoice.taxScheme && (
                      <span className="text-[11px] text-text-secondary">Skema Pajak: {invoice.taxScheme}</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums text-text-secondary">
                    {formatMoney(invoice.subtotal)}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums text-blue-700 font-medium">
                    {formatMoney(invoice.taxAmount)}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-bold text-text-primary">
                    {formatMoney(invoice.totalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs flex flex-col gap-2 text-xs">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal (DPP)</span>
                <span className="tabular-nums font-medium">{formatMoney(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>PPN</span>
                <span className="tabular-nums font-medium text-blue-700">{formatMoney(invoice.taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-bold text-text-primary">
                <span>Total Tagihan</span>
                <span className="tabular-nums">{formatMoney(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between amount-pos">
                <span>Sudah Dibayar</span>
                <span className="tabular-nums font-semibold">{formatMoney(invoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-dashed border-gray-300 pt-1.5 font-semibold text-text-primary">
                <span>Sisa Piutang</span>
                <span className="tabular-nums">{formatMoney(invoice.outstandingAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-outline-soft inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs"
          >
            <Printer size={14} /> Cetak / Simpan PDF
          </button>
          <button type="button" onClick={onClose} className="btn-final rounded-full px-4 py-2 text-xs">
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
}

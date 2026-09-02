"use client";

import { useState } from "react";
import {
  X, Check, AlertCircle, Clock, Calendar, Users, Briefcase,
  Coffee, ShieldCheck, ArrowRight, CornerDownLeft, Coins,
  Receipt, Upload, CheckCircle2, RefreshCw
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import api from "@/lib/api/axios";

import { useAuth } from "@/contexts/AuthContext";

interface RequestReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: any | null;
  onActionComplete: () => void;
}

export function RequestReviewModal({ isOpen, onClose, request, onActionComplete }: RequestReviewModalProps) {
  const { user, userRole, isAdmin } = useAuth();
  const [remarks, setRemarks] = useState("");
  const [showRecheckInput, setShowRecheckInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // LPJ Submission States
  const [showLPJForm, setShowLPJForm] = useState(false);
  const [lpjRealization, setLpjRealization] = useState("");
  const [lpjNotes, setLpjNotes] = useState("");
  const [lpjInvoiceUrl, setLpjInvoiceUrl] = useState("");

  if (!isOpen || !request) return null;

  // Role permissions
  const isOMRole = isAdmin || userRole === "om" || userRole === "executive";
  const isPMRole = isAdmin || userRole === "pm" || userRole === "executive";
  const isFinanceRole = isAdmin || userRole === "finance" || userRole === "executive";
  const isCreatorOrTagged = user?.id === request.created_by_id || (request.tagged_users || []).some((u: any) => u.id === user?.id);

  const isOMStage = (request.status === "PENDING_OM" || request.status === "RE_CHECKING") && isOMRole;
  const isExecStage = request.status === "PENDING_EXEC" && isPMRole;
  const isDisbursedOrRegistered = request.status === "REGISTERED" || request.status === "DISBURSED" || request.status === "LPJ_REVISION";
  const isOMLPJStage = request.status === "PENDING_LPJ_VERIFICATION" && isOMRole;
  const isCompleted = request.status === "COMPLETED";

  const handleOMAction = async (decision: "APPROVE" | "RE_CHECK") => {
    if (decision === "RE_CHECK" && !remarks.trim()) {
      setError("Catatan perbaikan (alasan Re-checking) wajib diisi untuk pemohon.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await api.post(`/api/v1/requests/${request.id}/validate-om`, {
        decision,
        remarks,
      });

      onActionComplete();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Gagal memvalidasi permohonan");
    } finally {
      setLoading(false);
    }
  };

  const handleExecAction = async (decision: "APPROVE" | "REJECT") => {
    setLoading(true);
    setError("");
    try {
      await api.post(`/api/v1/requests/${request.id}/approve-exec`, {
        decision,
        remarks,
      });

      onActionComplete();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Gagal memproses persetujuan");
    } finally {
      setLoading(false);
    }
  };

  const handleDisburseAction = async () => {
    setLoading(true);
    setError("");
    try {
      await api.post(`/api/v1/requests/${request.id}/disburse`, {
        disburse_account_id: "1111-BCA-OPS",
        disburse_reference: `DISB-${Date.now().toString().slice(-6)}`,
      });
      onActionComplete();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Gagal mencairkan dana");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitLPJ = async () => {
    const cleanNum = parseFloat(lpjRealization.replace(/\./g, "").replace(/,/g, ".")) || 0;
    if (cleanNum <= 0) {
      setError("Total belanja riil pada LPJ wajib diisi lebih dari 0.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const requestedAmt = Number(request.amount || 0);
      const discrepancy = cleanNum - requestedAmt;

      await api.post(`/api/v1/requests/${request.id}/submit-lpj`, {
        realization_amount: cleanNum,
        discrepancy_amount: discrepancy,
        discrepancy_type: discrepancy > 0 ? "OVERSPEND" : discrepancy < 0 ? "REFUND_TO_COMPANY" : "EXACT",
        notes: lpjNotes || "Realisasi belanja selesai sesuai bukti terlampir.",
        invoices: [
          {
            invoice_number: `NOTA-${Date.now().toString().slice(-6)}`,
            amount: cleanNum,
            file_url: lpjInvoiceUrl || request.attachment_url || "https://storage.marka.id/nota.jpg",
          },
        ],
      });

      onActionComplete();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Gagal menyetor LPJ");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLPJByOM = async (decision: "APPROVE" | "REVISE") => {
    if (decision === "REVISE" && !remarks.trim()) {
      setError("Catatan alasan revisi LPJ wajib diisi untuk pemohon.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await api.post(`/api/v1/requests/${request.id}/verify-lpj-om`, {
        decision,
        remarks,
      });

      onActionComplete();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Gagal memverifikasi LPJ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-[560px] bg-[#FAFDF7] border border-[#D5E2D7] rounded-[26px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D5E2D7] bg-[#F0FEE0]/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#275433] flex items-center justify-center text-white shadow-2xs">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#0E341F] tracking-tight">Review Card Request</h2>
              <p className="text-2xs text-[#637566] font-mono">{request.request_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#637566] hover:text-[#0E341F] hover:bg-[#D5E2D7]/50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-[#0E341F]">
          {error && (
            <div className="p-3 text-xs font-semibold rounded-xl bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          {/* Status Badge & Type */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF8D6] border border-[#D5E2D7] text-xs font-extrabold text-[#1E5C22]">
              {request.request_type === "FUND_REQUEST" ? <Coins size={13} /> : request.request_type === "MEETING" ? <Users size={13} /> : request.request_type === "LEAVE" ? <Coffee size={13} /> : <Briefcase size={13} />}
              <span>{request.request_type.replace("_", " ")}</span>
            </div>
            <span className={cn(
              "px-2.5 py-1 rounded-full text-2xs font-extrabold tracking-wide uppercase",
              request.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" :
              request.status === "REGISTERED" ? "bg-emerald-100 text-emerald-800" :
              request.status === "DISBURSED" ? "bg-cyan-100 text-cyan-800" :
              request.status === "PENDING_LPJ_VERIFICATION" ? "bg-purple-100 text-purple-800" :
              request.status === "RE_CHECKING" || request.status === "LPJ_REVISION" ? "bg-orange-100 text-orange-800" :
              request.status === "PENDING_EXEC" ? "bg-blue-100 text-blue-800" :
              request.status === "REJECTED" ? "bg-red-100 text-red-800" :
              "bg-yellow-100 text-yellow-800"
            )}>
              {request.status.replace(/_/g, " ")}
            </span>
          </div>

          {/* Fund Details (if Fund Request) */}
          {request.amount && (
            <div className="p-4 rounded-[18px] bg-[#F0FEE0]/80 border border-[#C5DAC8] flex items-center justify-between">
              <div>
                <span className="text-3xs font-bold text-[#4B6B4E] uppercase tracking-wider block">Nominal Diajukan</span>
                <span className="text-lg font-black text-[#1E5C22]">
                  Rp {Number(request.amount).toLocaleString("id-ID")}
                </span>
                {request.budget_category && (
                  <span className="text-3xs text-[#637566] block mt-0.5 font-medium">
                    Kategori: {request.budget_category}
                  </span>
                )}
              </div>
              {request.bank_target && (
                <div className="text-right max-w-[200px]">
                  <span className="text-3xs font-bold text-[#4B6B4E] uppercase tracking-wider block">Rekening Target</span>
                  <span className="text-2xs font-semibold text-[#0E341F] break-words">{request.bank_target}</span>
                </div>
              )}
            </div>
          )}

          {/* Title & Description */}
          <div className="p-4 rounded-[18px] bg-white border border-[#D5E2D7] shadow-2xs space-y-2">
            <h3 className="text-sm font-extrabold text-[#0E341F]">{request.title}</h3>
            {request.description && (
              <p className="text-xs text-[#637566] leading-relaxed whitespace-pre-wrap">{request.description}</p>
            )}
          </div>

          {/* Tagged People */}
          {request.tagged_users && request.tagged_users.length > 0 && (
            <div>
              <span className="text-2xs font-bold text-[#637566] uppercase tracking-wider block mb-1.5">
                Who's inside ({request.tagged_users.length} Orang)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {request.tagged_users.map((u: any, i: number) => (
                  <div key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F0FEE0] border border-[#D5E2D7] text-2xs font-semibold text-[#0E341F]">
                    <img
                      src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.id || i)}`}
                      alt={u.name}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                    <span>{u.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LPJ SUBMISSION FORM (When Disbursed or Registered) */}
          {isDisbursedOrRegistered && request.request_type === "FUND_REQUEST" && (
            <div className="p-4 rounded-[18px] bg-white border border-[#5B7E25]/40 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt size={16} className="text-[#5B7E25]" />
                  <span className="text-xs font-extrabold text-[#0E341F]">Pertanggungjawaban Dana (LPJ)</span>
                </div>
                {!showLPJForm && (
                  <button
                    type="button"
                    onClick={() => setShowLPJForm(true)}
                    className="px-3 py-1 rounded-lg bg-[#EAF8D6] text-[#1E5C22] text-2xs font-bold hover:bg-[#DDF4C0]"
                  >
                    + Input LPJ & Nota
                  </button>
                )}
              </div>

              {showLPJForm && (
                <div className="space-y-3 pt-2 border-t border-[#E2E8E0]">
                  <div>
                    <label className="block text-2xs font-bold text-[#485649] mb-1">
                      Total Realisasi Belanja Riil (Rp)
                    </label>
                    <input
                      type="text"
                      value={lpjRealization}
                      onChange={e => setLpjRealization(e.target.value.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "."))}
                      placeholder="Contoh: 4.850.000"
                      className="w-full px-3 py-2 rounded-xl border border-[#D5DCD4] text-xs font-bold text-[#2F3D2C] focus:outline-none focus:border-[#5B7E25]"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-bold text-[#485649] mb-1">
                      Catatan Penggunaan & Selisih
                    </label>
                    <textarea
                      value={lpjNotes}
                      onChange={e => setLpjNotes(e.target.value)}
                      placeholder="Keterangan pengeluaran dan informasi sisa dana..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-[#D5DCD4] text-xs text-[#2F3D2C] focus:outline-none focus:border-[#5B7E25] resize-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmitLPJ}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-[#5B7E25] hover:bg-[#4E6D1F] text-white text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {loading ? "Menyimpan LPJ..." : "Kirim LPJ ke OM untuk Verifikasi"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Re-checking Notes Input */}
          {(showRecheckInput || isExecStage || isOMLPJStage) && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="text-2xs font-bold text-[#637566] uppercase tracking-wider block">
                {isOMLPJStage ? "Catatan Verifikasi LPJ oleh OM:" : isOMStage ? "Catatan Re-checking untuk Pemohon:" : "Catatan Persetujuan / Penolakan:"}
              </label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Tuliskan catatan evaluasi atau alasan revisi..."
                rows={2}
                className="w-full px-3.5 py-2 rounded-[14px] bg-white border border-[#D5E2D7] text-xs font-medium text-[#0E341F] focus:outline-none focus:ring-2 focus:ring-[#5A861F]/40 resize-none"
              />
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#D5E2D7] bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-[14px] text-xs font-bold text-[#637566] hover:bg-[#F0FEE0]"
          >
            Tutup
          </button>

          <div className="flex items-center gap-2">
            {/* Stage 1: OM Controls */}
            {isOMStage && (
              <>
                {!showRecheckInput ? (
                  <button
                    type="button"
                    onClick={() => setShowRecheckInput(true)}
                    className="px-4 py-2.5 rounded-[14px] bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold hover:bg-orange-100 transition-colors"
                  >
                    ↩ Minta Re-checking
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOMAction("RE_CHECK")}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-[14px] bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold shadow-sm transition-all"
                  >
                    {loading ? "Menyimpan..." : "Kirim Re-checking"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOMAction("APPROVE")}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-[14px] bg-[#275433] hover:bg-[#1E3A2B] text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>✓ Validasi & Teruskan ke PM</span>
                </button>
              </>
            )}

            {/* Stage 2: Executive/PM Controls */}
            {isExecStage && (
              <>
                <button
                  type="button"
                  onClick={() => handleExecAction("REJECT")}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-[14px] bg-red-50 border border-red-200 text-red-700 text-xs font-bold hover:bg-red-100 transition-colors"
                >
                  ✕ Tolak
                </button>
                <button
                  type="button"
                  onClick={() => handleExecAction("APPROVE")}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-[14px] bg-[#275433] hover:bg-[#1E3A2B] text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>🎉 Setujui (Register Ticket)</span>
                </button>
              </>
            )}

            {/* Stage 3: Finance Disburse */}
            {request.status === "REGISTERED" && request.request_type === "FUND_REQUEST" && isFinanceRole && (
              <button
                type="button"
                onClick={handleDisburseAction}
                disabled={loading}
                className="px-4 py-2.5 rounded-[14px] bg-[#1E5C22] hover:bg-[#164419] text-white text-xs font-extrabold shadow-md transition-all"
              >
                <span>💵 Cairkan Dana (Disburse)</span>
              </button>
            )}

            {/* Stage 4: OM Final LPJ Verification */}
            {isOMLPJStage && (
              <>
                <button
                  type="button"
                  onClick={() => handleVerifyLPJByOM("REVISE")}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-[14px] bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold hover:bg-orange-100 transition-colors"
                >
                  ↩ Minta Revisi LPJ
                </button>
                <button
                  type="button"
                  onClick={() => handleVerifyLPJByOM("APPROVE")}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-[14px] bg-[#275433] hover:bg-[#1E3A2B] text-white text-xs font-extrabold shadow-md transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  <span>✓ Verifikasi LPJ & Tutup Tiket (Closed)</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

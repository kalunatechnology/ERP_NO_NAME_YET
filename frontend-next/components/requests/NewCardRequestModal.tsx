/**
 * File: frontend-next/components/requests/NewCardRequestModal.tsx
 *
 * Purpose: Enterprise Modal for creating new Meeting, Leave, or Other/Fund requests.
 * Features:
 *  - Modern, balanced 2-column layout with sleek segmented card selector.
 *  - Dynamic form fields adapted per request type (Meeting vs Leave vs Other/Fund).
 *  - Full-width standardized action footer (Simpan Draft & Kirim Request).
 *  - Strict role-safe validation and clean responsive design.
 */
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  X,
  Calendar,
  Clock,
  FileText,
  ArrowRight,
  Upload,
  UserPlus,
  Coins,
  Link2,
  Loader2,
  Users,
  Palmtree,
  CheckCircle2,
  Paperclip,
} from "lucide-react";
import { cn, localDateKey, extractApiError, parseFormDateTime } from "@/lib/utils";
import api from "@/lib/api/axios";

export interface InvitedPerson {
  id: string;
  name: string;
  avatar_url: string;
  email?: string;
  role?: string;
}

interface NewCardRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newReq: unknown) => void;
}

const BUDGET_CATEGORIES = [
  { id: "PROJECT_MATERIAL", label: "Project Material / Peralatan" },
  { id: "LOGISTICS_TRANSPORT", label: "Transportasi & Logistik" },
  { id: "OFFICE_OPERATIONAL", label: "Operasional Kantor" },
  { id: "VENDOR_SUBCON", label: "Vendor & Subkontraktor" },
  { id: "CLIENT_ENTERTAINMENT", label: "Representasi & Client Meeting" },
  { id: "TRAINING_CERTIFICATION", label: "Training & Pelatihan Staf" },
  { id: "OTHER_EXPENSES", label: "Pengeluaran Lainnya" },
];

export function NewCardRequestModal({ isOpen, onClose, onSuccess }: NewCardRequestModalProps) {


  // Active Type: 'Meeting Request' | 'Leave Request' | 'Other Request' | 'Fund Request'
  const [requestType, setRequestType] = useState<string>("Meeting Request");

  // Meeting & Scheduling states
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [dateVal, setDateVal] = useState(() => localDateKey());

  // Attachments
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [attachedFileSize, setAttachedFileSize] = useState<string>("");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [requestDetails, setRequestDetails] = useState("");

  // Fund Request Specific States
  const [amountRaw, setAmountRaw] = useState<string>("");
  const [budgetCategory, setBudgetCategory] = useState<string>("PROJECT_MATERIAL");
  const [bankTarget, setBankTarget] = useState<string>("");

  // Assignee state (PIC)
  const [teamMembers, setTeamMembers] = useState<InvitedPerson[]>([]);
  const [assigneeUserId, setAssigneeUserId] = useState<string>("");

  // Invite People states
  const [inviteSearch, setInviteSearch] = useState("");
  const [invitedList, setInvitedList] = useState<InvitedPerson[]>([]);
  const [searchResults, setSearchResults] = useState<InvitedPerson[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch team members from API
  const fetchMembers = async (searchQuery = "") => {
    setIsSearching(true);
    try {
      const res = await api.get("/api/v1/requests/team-members", {
        params: searchQuery.trim() ? { search: searchQuery.trim() } : {},
      });
      const data = res.data?.data ?? res.data ?? [];
      const list = Array.isArray(data) ? data : [];
      setSearchResults(list);
      if (!searchQuery.trim()) {
        setTeamMembers(list);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Reset form when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setRequestType("Meeting Request");
    setStartTime("09:00");
    setEndTime("10:00");
    setDateVal(localDateKey());
    setAttachedFileName(null);
    setAttachedFileSize("");
    setAttachmentLink("");
    setRequestDetails("");
    setAmountRaw("");
    setBudgetCategory("PROJECT_MATERIAL");
    setBankTarget("");
    setAssigneeUserId("");
    setInviteSearch("");
    setInvitedList([]);
    setSearchResults([]);
    setIsSearchDropdownOpen(false);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchMembers();
  }, [isOpen]);

  // Debounced search for team members
  useEffect(() => {
    if (!isOpen) return;
    const query = inviteSearch.trim();
    if (!query) {
      setSearchResults(teamMembers);
      return;
    }
    const timer = setTimeout(() => {
      fetchMembers(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [inviteSearch, isOpen, teamMembers]);

  if (!isOpen) return null;

  const isMeeting = requestType === "Meeting Request";
  const isLeave = requestType === "Leave Request";
  const isFund = requestType === "Fund Request";
  const isOther = requestType === "Other Request" || isFund;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFileName(file.name);
      const kb = Math.round(file.size / 1024);
      setAttachedFileSize(`${kb}KB`);
    }
  };

  const handleRemoveFile = () => {
    setAttachedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatRupiahInput = (val: string) => {
    const numbersOnly = val.replace(/\D/g, "");
    return numbersOnly ? Number(numbersOnly).toLocaleString("id-ID") : "";
  };

  const handleRemovePerson = (id: string) => {
    setInvitedList(prev => prev.filter(p => p.id !== id));
  };

  const handleAddPerson = (person: InvitedPerson) => {
    if (!invitedList.some(p => p.id === person.id)) {
      setInvitedList(prev => [...prev, person]);
    }
    setInviteSearch("");
    setIsSearchDropdownOpen(false);
  };

  const handleAddCustomGuest = () => {
    if (!inviteSearch.trim()) return;
    const cleanName = inviteSearch.trim();
    const customUser: InvitedPerson = {
      id: `guest-${Date.now()}`,
      name: cleanName,
      email: cleanName.includes("@") ? cleanName : undefined,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanName)}`,
    };
    handleAddPerson(customUser);
  };

  const handleSubmit = async (isDraft = false) => {
    if (!requestDetails.trim()) {
      setErrorMsg("Rincian kebutuhan / agenda wajib diisi.");
      return;
    }

    const cleanNum = parseFloat(amountRaw.replace(/\./g, "").replace(/,/g, ".")) || 0;
    if (isFund && cleanNum <= 0) {
      setErrorMsg("Nominal dana wajib diisi lebih dari 0 untuk pengajuan dana.");
      return;
    }

    if (!dateVal || !dateVal.trim()) {
      setErrorMsg("Tanggal pelaksanaan wajib diisi.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
      setErrorMsg("Format tanggal pelaksanaan tidak valid (YYYY-MM-DD).");
      return;
    }

    // Only validate meeting time if this is a Meeting Request
    if (isMeeting) {
      if (!startTime) {
        setErrorMsg("Waktu mulai rapat wajib diisi.");
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(startTime)) {
        setErrorMsg("Format waktu mulai tidak valid (gunakan format JJ:MM).");
        return;
      }
      if (endTime) {
        if (!/^\d{2}:\d{2}$/.test(endTime)) {
          setErrorMsg("Format waktu selesai tidak valid (gunakan format JJ:MM).");
          return;
        }
        if (endTime <= startTime) {
          setErrorMsg("Waktu selesai harus lebih besar dari waktu mulai.");
          return;
        }
      }
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const typeCode = isFund
        ? "FUND_REQUEST"
        : isMeeting
        ? "MEETING"
        : isLeave
        ? "LEAVE"
        : "OTHER";

      // Parse start and end timestamps
      const startAt = isMeeting ? parseFormDateTime(dateVal, startTime) : parseFormDateTime(dateVal, "08:00");
      const endAt = isMeeting && endTime ? parseFormDateTime(dateVal, endTime) : undefined;

      const res = await api.post("/api/v1/requests", {
        request_type: typeCode,
        title: requestDetails.slice(0, 60) || requestType,
        description: requestDetails,
        amount: isFund ? cleanNum : undefined,
        budget_category: isFund ? budgetCategory : undefined,
        bank_target: isFund ? bankTarget : undefined,
        start_at: startAt,
        end_at: endAt,
        tagged_users: invitedList,
        attachment_url: attachmentLink.trim() || undefined,
        is_draft: isDraft,
        assignee_user_id: assigneeUserId || undefined,
      });

      const responseData = res.data?.data ?? res.data;
      onSuccess(responseData);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(extractApiError(err, "Gagal memproses permohonan"));
    } finally {
      setLoading(false);
    }
  };

  const selectableResults = searchResults.filter(
    m => !invitedList.some(inv => inv.id === m.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/65 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={() => setIsSearchDropdownOpen(false)}
      >
        {/* ── Modal Header ── */}
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 via-white to-blue-50/40">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              {isMeeting ? (
                <Calendar size={22} strokeWidth={2.2} />
              ) : isLeave ? (
                <Palmtree size={22} strokeWidth={2.2} />
              ) : isFund ? (
                <Coins size={22} strokeWidth={2.2} />
              ) : (
                <FileText size={22} strokeWidth={2.2} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Buat Pengajuan Baru
                </h3>
                <span className="px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                  {requestType}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isMeeting
                  ? "Atur jadwal pertemuan, tentukan PIC host, dan undang peserta rapat."
                  : isLeave
                  ? "Ajukan cuti tahunan, sakit, atau izin dengan persetujuan atasan."
                  : "Ajukan permohonan operasional, anggaran biaya, atau kebutuhan kantor."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Tutup modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Type Selector Tabs ── */}
        <div className="px-6 sm:px-8 pt-5 pb-3">
          <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Pilih Kategori Permohonan
          </label>
          <div className="grid grid-cols-3 gap-2.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setRequestType("Meeting Request")}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all",
                isMeeting
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200/70"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              )}
            >
              <Calendar size={16} className={isMeeting ? "text-blue-600" : "text-slate-400"} />
              <span>Meeting Request</span>
            </button>

            <button
              type="button"
              onClick={() => setRequestType("Leave Request")}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all",
                isLeave
                  ? "bg-white text-emerald-700 shadow-sm border border-slate-200/70"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              )}
            >
              <Palmtree size={16} className={isLeave ? "text-emerald-600" : "text-slate-400"} />
              <span>Leave / Cuti</span>
            </button>

            <button
              type="button"
              onClick={() => setRequestType("Other Request")}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all",
                isOther
                  ? "bg-white text-violet-700 shadow-sm border border-slate-200/70"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              )}
            >
              <FileText size={16} className={isOther ? "text-violet-600" : "text-slate-400"} />
              <span>Other Request</span>
            </button>
          </div>
        </div>

        {/* ── Form Body: Balanced 2-Column Grid ── */}
        <div className="px-6 sm:px-8 py-2 overflow-y-auto max-h-[64vh]">
          {errorMsg && (
            <div className="mb-4 p-3.5 text-xs font-semibold rounded-2xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* ════════════ LEFT COLUMN (Col 1-7): Details & Schedule ════════════ */}
            <div className="md:col-span-7 flex flex-col gap-4">
              
              {/* Optional Fund Request Toggle inside Other Request */}
              {isOther && (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-violet-50/70 border border-violet-100">
                  <div className="flex items-center gap-2.5">
                    <Coins size={18} className="text-violet-600" />
                    <div>
                      <p className="text-xs font-bold text-violet-950">Memerlukan Anggaran / Pencairan Dana?</p>
                      <p className="text-3xs text-violet-700">Aktifkan jika permohonan ini melibatkan reimbursement atau procurement biaya</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRequestType(isFund ? "Other Request" : "Fund Request")}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                      isFund
                        ? "bg-violet-600 text-white shadow-xs"
                        : "bg-white text-violet-700 border border-violet-200 hover:bg-violet-100"
                    )}
                  >
                    {isFund ? "Dana: Aktif" : "+ Ajukan Dana"}
                  </button>
                </div>
              )}

              {/* Fund Request Amount & Category Fields */}
              {isFund && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                  <div>
                    <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      Nominal Dana yang Diajukan (Rp) <span className="text-red-500">*</span>
                    </label>
                    <div className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 flex items-center gap-2 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-600 transition-all">
                      <span className="text-xs font-bold text-slate-500">Rp</span>
                      <input
                        type="text"
                        value={formatRupiahInput(amountRaw)}
                        onChange={e => setAmountRaw(e.target.value.replace(/\D/g, ""))}
                        className="w-full bg-transparent focus:outline-none text-sm font-bold text-slate-900"
                        placeholder="Contoh: 1.500.000"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                        Kategori Anggaran
                      </label>
                      <select
                        value={budgetCategory}
                        onChange={e => setBudgetCategory(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                      >
                        {BUDGET_CATEGORIES.map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                        Rekening / Vendor Tujuan
                      </label>
                      <input
                        type="text"
                        value={bankTarget}
                        onChange={e => setBankTarget(e.target.value)}
                        placeholder="BCA 123456 a.n. Toko"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Schedule & Date Section */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-200/60">
                  <Clock size={15} className="text-slate-500" />
                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-600">
                    {isMeeting ? "Jadwal Pertemuan" : isLeave ? "Periode Cuti / Izin" : "Tanggal Pelaksanaan"}
                  </span>
                </div>

                {isMeeting ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-5">
                      <label className="block text-2xs font-medium text-slate-500 mb-1">
                        Tanggal Rapat <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={dateVal}
                        onChange={e => setDateVal(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                      />
                    </div>
                    <div className="sm:col-span-7 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-2xs font-medium text-slate-500 mb-1">
                          Waktu Mulai <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="time"
                          value={startTime}
                          onChange={e => setStartTime(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                          aria-label="Waktu Mulai"
                        />
                      </div>
                      <div>
                        <label className="block text-2xs font-medium text-slate-500 mb-1">
                          Waktu Selesai
                        </label>
                        <input
                          type="time"
                          value={endTime}
                          onChange={e => setEndTime(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                          aria-label="Waktu Selesai"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-2xs font-medium text-slate-500 mb-1">
                      {isLeave ? "Tanggal Cuti / Izin" : "Tanggal Permohonan"} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={dateVal}
                      onChange={e => setDateVal(e.target.value)}
                      className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                    />
                  </div>
                )}
              </div>

              {/* Request Details Textarea */}
              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  {isMeeting
                    ? "Agenda Rapat & Pembahasan"
                    : isLeave
                    ? "Alasan & Keterangan Cuti"
                    : "Rincian Kebutuhan & Deskripsi"} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={requestDetails}
                  onChange={e => setRequestDetails(e.target.value)}
                  rows={3}
                  placeholder={
                    isMeeting
                      ? "Tuliskan topik bahasan, sasaran rapat, atau tautan Google Meet / Zoom..."
                      : isLeave
                      ? "Tuliskan keterangan cuti atau kebutuhan izin Anda secara jelas..."
                      : "Jelaskan rincian barang, permohonan, atau keperluan operasional Anda..."
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white p-3.5 text-xs text-slate-900 placeholder:text-slate-400 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 transition-all"
                />
              </div>

              {/* Attachments Section */}
              <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Paperclip size={14} className="text-slate-500" />
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-600">
                      Lampiran Dokumen
                    </span>
                  </div>
                  <span className="text-3xs text-slate-400">PDF, Word, Excel, Nota, atau Tautan Cloud</span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {attachedFileName ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-3.5 py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText size={16} className="text-blue-600 shrink-0" />
                      <span className="font-semibold text-slate-800 truncate max-w-[220px]">
                        {attachedFileName}
                      </span>
                      <span className="text-slate-400 text-3xs shrink-0">{attachedFileSize}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Hapus file"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-500 bg-white hover:bg-blue-50/40 text-xs font-semibold text-slate-600 hover:text-blue-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Upload size={14} />
                    <span>Upload File Pendukung (Opsional)</span>
                  </button>
                )}

                <div className="relative">
                  <Link2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    value={attachmentLink}
                    onChange={e => setAttachmentLink(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                    placeholder="Atau cantumkan link Google Drive / Notion / Dokumen cloud..."
                  />
                </div>
              </div>

            </div>

            {/* ════════════ RIGHT COLUMN (Col 8-12): Assignee & Participants ════════════ */}
            <div className="md:col-span-5 flex flex-col gap-4">
              
              {/* PIC / Host Assignment */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600">
                  {isMeeting ? "Host / Moderator Pertemuan" : isLeave ? "PIC Pengganti / Handover" : "Tugaskan ke Staff (PIC)"}
                </label>
                <select
                  value={assigneeUserId}
                  onChange={e => setAssigneeUserId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
                >
                  <option value="">-- Pilih Staf Penanggung Jawab --</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.role ? `(${m.role})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-3xs text-slate-400">
                  {isMeeting
                    ? "PIC akan bertanggung jawab memimpin jalannya rapat & mencatat notulen."
                    : "Staf yang bertindak sebagai kontak darurat / pelaksana tugas."}
                </p>
              </div>

              {/* Invite Participants Section */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users size={15} className="text-slate-600" />
                    <label className="text-2xs font-bold uppercase tracking-wider text-slate-600">
                      {isMeeting ? "Peserta Rapat yang Diundang" : "Anggota Tim Terkait"}
                    </label>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-3xs font-extrabold bg-blue-100 text-blue-700">
                    {invitedList.length} orang
                  </span>
                </div>

                {/* Search Bar */}
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={inviteSearch}
                    onChange={e => {
                      setInviteSearch(e.target.value);
                      setIsSearchDropdownOpen(true);
                    }}
                    onFocus={() => setIsSearchDropdownOpen(true)}
                    placeholder="Ketik nama atau email anggota..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 pr-9"
                  />
                  {isSearching && inviteSearch.trim().length > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Loader2 size={14} className="animate-spin text-blue-600" />
                    </div>
                  )}

                  {/* Dropdown list for search */}
                  {isSearchDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-40 max-h-56 overflow-y-auto space-y-0.5 animate-in fade-in duration-100">
                      {selectableResults.length > 0 ? (
                        selectableResults.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleAddPerson(m)}
                            className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-slate-50 text-xs transition-colors group"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <Image
                                src={m.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.id}`}
                                alt={m.name}
                                width={26}
                                height={26}
                                unoptimized
                                className="w-6.5 h-6.5 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                              <div className="truncate">
                                <span className="text-xs font-semibold text-slate-800 block truncate">{m.name}</span>
                                <span className="text-3xs text-slate-400 block truncate">{m.role || "Anggota tim"}{m.email ? ` · ${m.email}` : ""}</span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-3xs font-bold shrink-0">
                              + Tambah
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center">
                          <p className="text-xs text-slate-500 mb-1.5">
                            {inviteSearch.trim()
                              ? `Tidak ada staf dengan nama "${inviteSearch}"`
                              : "Ketik nama untuk mencari..."}
                          </p>
                          {inviteSearch.trim() && (
                            <button
                              type="button"
                              onClick={handleAddCustomGuest}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
                            >
                              <UserPlus size={13} />
                              <span>Undang &quot;{inviteSearch.trim()}&quot; (Tamu)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Invited People Tag List */}
                <div className="min-h-[110px] max-h-[160px] overflow-y-auto space-y-1.5 pr-0.5">
                  {invitedList.length === 0 ? (
                    <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-white text-center text-xs text-slate-400">
                      Belum ada anggota yang diundang.<br />
                      Gunakan kolom di atas untuk menambahkan peserta.
                    </div>
                  ) : (
                    invitedList.map(person => (
                      <div
                        key={person.id}
                        className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-white border border-slate-200 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Image
                            src={person.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${person.id}`}
                            alt={person.name}
                            width={24}
                            height={24}
                            unoptimized
                            className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-slate-800 block truncate leading-tight">
                              {person.name}
                            </span>
                            {person.email && (
                              <span className="text-3xs text-slate-400 block truncate leading-tight">
                                {person.email}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePerson(person.id)}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          title={`Hapus ${person.name}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Informational Privacy Badge */}
              <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100 flex items-start gap-2">
                <CheckCircle2 size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-3xs text-blue-900 leading-relaxed">
                  <strong>Privasi Terjamin:</strong> Data permohonan ini hanya dapat dilihat oleh Anda, PIC yang ditugaskan, dan peserta yang terdaftar.
                </p>
              </div>

            </div>
          </div>
        </div>

        {/* ── Modal Footer: Standardized Full-Width Bar ── */}
        <div className="px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/90 flex flex-col sm:flex-row items-center justify-between gap-3 mt-3">
          <div className="text-3xs text-slate-500 order-2 sm:order-1 text-center sm:text-left">
            Permohonan akan otomatis diverifikasi oleh sistem & diteruskan ke PIC.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end order-1 sm:order-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold text-xs transition-all"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <FileText size={14} />
                  <span>Simpan Draft</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <span>Kirim Permohonan</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

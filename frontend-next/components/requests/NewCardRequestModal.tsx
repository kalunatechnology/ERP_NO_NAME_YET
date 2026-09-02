"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft, ChevronDown, Clock, Calendar, FileText,
  X, ArrowRight, Upload, Plus, UserPlus, Coins, CreditCard, Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  onSuccess: (data: any) => void;
}

const BUDGET_CATEGORIES = [
  { id: "PROJECT_MATERIAL", label: "Material & Bahan Proyek" },
  { id: "OPERATIONAL", label: "Operasional Lapangan" },
  { id: "TRANSPORT", label: "Transportasi & Logistik" },
  { id: "EQUIPMENT", label: "Sewa Alat & Perlengkapan" },
  { id: "OTHER", label: "Kebutuhan Lain-lain" },
];

export function NewCardRequestModal({ isOpen, onClose, onSuccess }: NewCardRequestModalProps) {
  const [requestType, setRequestType] = useState<string>("Meeting Request");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [timeRange, setTimeRange] = useState("09.00 AM - 10.00 AM");
  const [dateVal, setDateVal] = useState("28/08/2026");
  const [attachedFileName, setAttachedFileName] = useState<string | null>("Meeting Inquiries.pdf");
  const [attachedFileSize, setAttachedFileSize] = useState<string>("120KB");
  const [requestDetails, setRequestDetails] = useState(
    "I want to schedule a meeting with people from the IT and Design Division this afternoon"
  );

  // Fund Request Specific States
  const [amountRaw, setAmountRaw] = useState<string>("5000000");
  const [budgetCategory, setBudgetCategory] = useState<string>("PROJECT_MATERIAL");
  const [bankTarget, setBankTarget] = useState<string>("BCA 883019281 a.n. Toko Bangunan Jaya");

  // Invite People states
  const [inviteSearch, setInviteSearch] = useState("");
  const [invitedList, setInvitedList] = useState<InvitedPerson[]>([]);
  const [searchResults, setSearchResults] = useState<InvitedPerson[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch team members from PostgreSQL via Axios
  const fetchMembers = async (searchQuery = "") => {
    setIsSearching(true);
    try {
      const res = await api.get("/api/v1/requests/team-members", {
        params: searchQuery.trim() ? { search: searchQuery.trim() } : {},
      });
      const data = res.data?.data ?? res.data ?? [];
      setSearchResults(Array.isArray(data) ? data : []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchMembers();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchMembers(inviteSearch);
    }, 200);
    return () => clearTimeout(timer);
  }, [inviteSearch, isOpen]);

  if (!isOpen) return null;

  const isFundRequest = requestType === "Fund Request";

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

  const handleSubmit = async (isDraft = false) => {
    if (!requestDetails.trim()) {
      setErrorMsg("Request Details wajib diisi.");
      return;
    }

    const cleanNum = parseFloat(amountRaw.replace(/\./g, "").replace(/,/g, ".")) || 0;
    if (isFundRequest && cleanNum <= 0) {
      setErrorMsg("Nominal dana wajib diisi lebih dari 0 untuk Fund Request.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const typeCode = isFundRequest
        ? "FUND_REQUEST"
        : requestType.includes("Meeting")
        ? "MEETING"
        : requestType.includes("Leave")
        ? "LEAVE"
        : "OTHER";

      const res = await api.post("/api/v1/requests", {
        request_type: typeCode,
        title: requestDetails.slice(0, 60) || requestType,
        description: requestDetails,
        amount: isFundRequest ? cleanNum : undefined,
        budget_category: isFundRequest ? budgetCategory : undefined,
        bank_target: isFundRequest ? bankTarget : undefined,
        start_at: new Date().toISOString(),
        tagged_users: invitedList,
        attachment_url: attachedFileName ? `https://storage.marka.id/docs/${attachedFileName}` : undefined,
        is_draft: isDraft,
      });

      const responseData = res.data?.data ?? res.data;
      onSuccess(responseData);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || "Gagal memproses request");
    } finally {
      setLoading(false);
    }
  };

  const selectableResults = searchResults.filter(
    m => !invitedList.some(inv => inv.id === m.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div
        className="relative w-full max-w-[880px] my-auto bg-white border border-[#DCE4DA] rounded-[28px] p-6 sm:p-8 shadow-2xl flex flex-col gap-6 animate-in zoom-in-95 duration-200"
        onClick={() => setIsSearchDropdownOpen(false)}
      >
        {/* Header INSIDE Modal Card */}
        <div className="flex items-center justify-between pb-1">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 text-base sm:text-lg font-bold text-[#344432] hover:text-[#1E291D] transition-colors group"
          >
            <ChevronLeft size={22} className="text-[#5B7E25] group-hover:-translate-x-0.5 transition-transform" />
            <span>New Card Request</span>
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#7B8B78] hover:text-[#2D3A2F] hover:bg-[#F3F7EE] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Two-Column Grid Form */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-stretch">
          
          {/* ════════════ LEFT COLUMN (Col 1-7) ════════════ */}
          <div className="md:col-span-7 flex flex-col gap-4 md:pr-6 md:border-r border-[#E2E8E0]">
            {errorMsg && (
              <div className="p-3 text-xs font-semibold rounded-xl bg-red-50 border border-red-200 text-red-700">
                {errorMsg}
              </div>
            )}

            {/* 1. Request Type */}
            <div className="relative">
              <label className="block text-xs font-semibold text-[#485649] mb-1.5">
                Request Type
              </label>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTypeDropdownOpen(!isTypeDropdownOpen);
                }}
                className="w-full rounded-[14px] border border-[#D5DCD4] bg-white px-4 py-2.5 flex items-center justify-between text-xs font-medium text-[#2F3D2C] hover:border-[#5B7E25]/60 transition-colors"
              >
                <span>{requestType}</span>
                <ChevronDown size={17} className="text-[#6B7B68]" />
              </button>

              {isTypeDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#D5DCD4] rounded-[14px] shadow-xl py-1.5 z-30 animate-in fade-in-50 duration-100">
                  {["Meeting Request", "Fund Request", "Leave Request", "Other Request"].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setRequestType(t);
                        setIsTypeDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2 text-xs font-medium transition-colors",
                        requestType === t ? "bg-[#F3F7EE] text-[#5B7E25] font-bold" : "text-[#2F3D2C] hover:bg-[#FAFCF8]"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* FUND REQUEST SPECIFIC FIELDS */}
            {isFundRequest && (
              <div className="p-3.5 rounded-[18px] bg-[#FAFDF7] border border-[#D5E2D7] space-y-3 animate-in fade-in-50 duration-150">
                {/* Nominal Dana */}
                <div>
                  <label className="block text-xs font-semibold text-[#1E5C22] mb-1">
                    Nominal Dana yang Diajukan (Rp)
                  </label>
                  <div className="rounded-[12px] border border-[#5B7E25]/40 bg-white px-3.5 py-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-[#5B7E25]/30">
                    <Coins size={16} className="text-[#5B7E25]" />
                    <span className="text-xs font-bold text-[#2F3D2C]">Rp</span>
                    <input
                      type="text"
                      value={formatRupiahInput(amountRaw)}
                      onChange={e => setAmountRaw(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-transparent focus:outline-none text-xs text-[#2F3D2C] font-bold"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Kategori Anggaran & Rekening */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-semibold text-[#485649] mb-1">
                      Kategori Anggaran
                    </label>
                    <select
                      value={budgetCategory}
                      onChange={e => setBudgetCategory(e.target.value)}
                      className="w-full rounded-[12px] border border-[#D5DCD4] bg-white px-3 py-2 text-2xs font-medium text-[#2F3D2C] focus:outline-none focus:border-[#5B7E25]"
                    >
                      {BUDGET_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-2xs font-semibold text-[#485649] mb-1">
                      Rekening Pencairan
                    </label>
                    <input
                      type="text"
                      value={bankTarget}
                      onChange={e => setBankTarget(e.target.value)}
                      placeholder="BCA 123456 a.n. Toko"
                      className="w-full rounded-[12px] border border-[#D5DCD4] bg-white px-3 py-2 text-2xs font-medium text-[#2F3D2C] focus:outline-none focus:border-[#5B7E25]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. Time & Date (Side-by-Side) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#485649] mb-1.5">
                  Time
                </label>
                <div className="rounded-[14px] border border-[#D5DCD4] bg-white px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-[#2F3D2C] focus-within:ring-2 focus-within:ring-[#5B7E25]/30 focus-within:border-[#5B7E25]">
                  <input
                    type="text"
                    value={timeRange}
                    onChange={e => setTimeRange(e.target.value)}
                    className="w-full bg-transparent focus:outline-none text-xs text-[#2F3D2C] font-medium"
                    placeholder="09.00 AM - 10.00 AM"
                  />
                  <Clock size={17} className="text-[#8D9C8A] shrink-0 ml-2" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#485649] mb-1.5">
                  Date
                </label>
                <div className="rounded-[14px] border border-[#D5DCD4] bg-white px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-[#2F3D2C] focus-within:ring-2 focus-within:ring-[#5B7E25]/30 focus-within:border-[#5B7E25]">
                  <input
                    type="text"
                    value={dateVal}
                    onChange={e => setDateVal(e.target.value)}
                    className="w-full bg-transparent focus:outline-none text-xs text-[#2F3D2C] font-medium"
                    placeholder="28/08/2026"
                  />
                  <Calendar size={17} className="text-[#8D9C8A] shrink-0 ml-2" />
                </div>
              </div>
            </div>

            {/* 3. Attached Files */}
            <div>
              <label className="block text-xs font-semibold text-[#485649] mb-1.5">
                Attached Files
              </label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileUpload}
              />

              {attachedFileName ? (
                <div className="rounded-[14px] border border-[#D5DCD4] bg-white px-4 py-2.5 flex items-center justify-between text-xs font-medium text-[#2F3D2C]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText size={18} className="text-[#5B7E25] shrink-0" />
                    <span className="font-semibold text-[#2F3D2C] truncate max-w-[180px] sm:max-w-[240px]">
                      {attachedFileName}
                    </span>
                    <span className="text-[#7B8B78] text-2xs shrink-0">{attachedFileSize}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[#6B7B68] hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-[14px] border border-dashed border-[#D5DCD4] hover:border-[#5B7E25] bg-[#FDFEFD] px-4 py-2.5 flex items-center justify-center gap-2 text-xs text-[#7B8B78] cursor-pointer transition-colors"
                >
                  <Upload size={14} className="text-[#8D9C8A]" />
                  <span>Attach Document (PDF, Word, Nota, etc)</span>
                </div>
              )}
            </div>

            {/* 4. Request Details */}
            <div className="flex-1 flex flex-col">
              <label className="block text-xs font-semibold text-[#485649] mb-1.5">
                Request Details
              </label>
              <textarea
                value={requestDetails}
                onChange={e => setRequestDetails(e.target.value)}
                rows={3}
                placeholder="Tuliskan rincian kebutuhan Anda..."
                className="w-full flex-1 rounded-[14px] border border-[#D5DCD4] bg-white p-3.5 text-xs font-normal text-[#2F3D2C] placeholder:text-[#8D9C8A] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#5B7E25]/30 focus:border-[#5B7E25]"
              />
            </div>
          </div>

          {/* ════════════ RIGHT COLUMN (Invite People & Actions) ════════════ */}
          <div className="md:col-span-5 flex flex-col justify-between gap-6">
            
            {/* Top: Invite People Section */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#485649] mb-1.5">
                  Invite People
                </label>
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={inviteSearch}
                    onChange={e => {
                      setInviteSearch(e.target.value);
                      setIsSearchDropdownOpen(true);
                    }}
                    onFocus={() => setIsSearchDropdownOpen(true)}
                    placeholder="Add user account, email, etc"
                    className="w-full rounded-[14px] border border-[#D5DCD4] bg-white px-4 py-2.5 text-xs text-[#2F3D2C] placeholder:text-[#8D9C8A] focus:outline-none focus:ring-2 focus:ring-[#5B7E25]/30 focus:border-[#5B7E25]"
                  />

                  {/* Dropdown list for search */}
                  {isSearchDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#D5DCD4] rounded-[16px] shadow-xl p-1.5 z-40 max-h-56 overflow-y-auto space-y-0.5 animate-in fade-in duration-100">
                      {selectableResults.length > 0 ? (
                        selectableResults.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleAddPerson(m)}
                            className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-[#F3F7EE] text-xs transition-colors group"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <img
                                src={m.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.id}`}
                                alt={m.name}
                                className="w-7 h-7 rounded-full object-cover border border-[#DCE4DA] shrink-0"
                              />
                              <div className="truncate">
                                <span className="text-xs font-semibold text-[#2F3D2C] block truncate">{m.name}</span>
                                {m.email && <span className="text-3xs text-[#7B8B78] block truncate">{m.email}</span>}
                              </div>
                            </div>
                            <span className="p-1 rounded-lg bg-[#EAF8D6] text-[#1E5C22] text-3xs font-bold shrink-0">
                              + Add
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center">
                          <p className="text-xs text-[#7B8B78] mb-1.5">
                            {inviteSearch.trim()
                              ? `Tidak ada akun dengan nama "${inviteSearch}"`
                              : "Ketik nama atau email user..."}
                          </p>
                          {inviteSearch.trim() && (
                            <button
                              type="button"
                              onClick={handleAddCustomGuest}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F0FEE0] text-[#1E5C22] text-xs font-bold hover:bg-[#E2F7C9] transition-colors"
                            >
                              <UserPlus size={13} />
                              <span>Undang "{inviteSearch.trim()}" (Tamu)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Invited People List */}
              <div className="space-y-2 pt-1 min-h-[140px] max-h-[220px] overflow-y-auto">
                {invitedList.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-[#D5DCD4] bg-[#FDFEFD] text-center text-xs text-[#7B8B78]">
                    Belum ada anggota yang diundang.<br />
                    Ketik nama atau email pada kolom di atas untuk menambahkan.
                  </div>
                ) : (
                  invitedList.map(person => (
                    <div
                      key={person.id}
                      className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-[#FAFDF7] border border-[#E2E8E0] hover:border-[#5B7E25]/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={person.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${person.id}`}
                          alt={person.name}
                          className="w-7 h-7 rounded-full object-cover border border-[#DCE4DA] shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-[#2F3D2C] block truncate">
                            {person.name}
                          </span>
                          {person.email && (
                            <span className="text-3xs text-[#7B8B78] block truncate">
                              {person.email}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePerson(person.id)}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[#5B7E25] hover:text-red-500 hover:bg-red-50 transition-colors"
                        title={`Hapus ${person.name}`}
                      >
                        <X size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom: Action Buttons */}
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={loading}
                className="w-full py-3 rounded-[14px] bg-[#5B7E25] hover:bg-[#4E6D1F] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all disabled:opacity-50"
              >
                <span>{loading ? "Sending..." : "Send Request"}</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={loading}
                className="w-full py-3 rounded-[14px] bg-white border border-[#5B7E25] hover:bg-[#F3F7EE] text-[#5B7E25] font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <span>Save Draft</span>
                <FileText size={15} />
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

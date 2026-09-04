/**
 * File: frontend-next/components/requests/RequestCardFeed.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect } from "react";
import {
  Calendar, Clock, Users, Coffee, Briefcase, ChevronRight,
  Plus, CheckCircle2, AlertCircle, Sparkles, Filter, Coins,
  Receipt
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import api from "@/lib/api/axios";

interface RequestCardFeedProps {
  onRequestClick: (req: any) => void;
  onOpenNewModal: () => void;
  refreshTrigger?: number;
}

/**
 * RequestCardFeed owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: invokes the visible HTTP API and maps its result into UI state.
 */
export function RequestCardFeed({ onRequestClick, onOpenNewModal, refreshTrigger }: RequestCardFeedProps) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("ALL");

/**
 * fetchRequests owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: invokes the visible HTTP API and maps its result into UI state.
 */
  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/requests", {
        params: {
          page_size: 25,
          ...(filterType !== "ALL" ? { type: filterType } : {}),
        },
      });
      const data = res.data?.data?.rows ?? res.data?.rows ?? res.data ?? [];
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filterType, refreshTrigger]);

/**
 * getStatusBadge owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: updates only the visible React/browser state or invokes the callbacks below.
 */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-emerald-100 text-emerald-800">CLOSED</span>;
      case "REGISTERED":
        return <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-emerald-100 text-emerald-800">REGISTERED</span>;
      case "DISBURSED":
        return <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-cyan-100 text-cyan-800">DISBURSED</span>;
      case "PENDING_LPJ_VERIFICATION":
        return <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-purple-100 text-purple-800">WAITING LPJ OM</span>;
      case "PENDING_EXEC":
        return <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-blue-100 text-blue-800">WAITING EXEC</span>;
      case "RE_CHECKING":
      case "LPJ_REVISION":
        return <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-orange-100 text-orange-800">RE-CHECKING</span>;
      case "REJECTED":
        return <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-red-100 text-red-800">REJECTED</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-3xs font-extrabold bg-[#EAF8D6] text-[#1E5C22]">WAITING OM</span>;
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header & Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-extrabold text-[#0E341F] tracking-tight">Active Request Cards</h3>
          <span className="px-2 py-0.5 rounded-full bg-[#EAF8D6] text-3xs font-extrabold text-[#1E5C22]">
            {requests.length} Active
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Type Filter Buttons */}
          <div className="flex items-center p-1 rounded-xl bg-[#F0FEE0] border border-[#D5E2D7] text-2xs font-bold text-[#637566]">
            {[
              { id: "ALL", label: "ALL" },
              { id: "FUND_REQUEST", label: "FUND" },
              { id: "MEETING", label: "MEETING" },
              { id: "LEAVE", label: "LEAVE" },
              { id: "OTHER", label: "OTHER" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setFilterType(t.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all",
                  filterType === t.id ? "bg-[#275433] text-white shadow-2xs font-extrabold" : "hover:text-[#0E341F]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenNewModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#275433] hover:bg-[#1E3A2B] text-white text-2xs font-extrabold shadow-xs transition-all"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>Request Card</span>
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-28 rounded-[20px] bg-[#F0FEE0]/50 border border-[#D5E2D7] animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="p-8 rounded-[20px] bg-white border border-[#D5E2D7] text-center text-xs text-[#768779]">
          Belum ada request aktif. Klik tombol <b>+ Request Card</b> untuk mengajukan dana, rapat, atau cuti baru.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {requests.map(req => (
            <div
              key={req.id}
              onClick={() => onRequestClick(req)}
              className="p-4.5 rounded-[20px] bg-white border border-[#D5E2D7] hover:border-[#5A861F]/60 hover:shadow-card-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer flex flex-col justify-between gap-3 shadow-2xs"
            >
              {/* Card Top */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#F0FEE0] border border-[#D5E2D7] flex items-center justify-center text-[#275433] shrink-0">
                    {req.request_type === "FUND_REQUEST" ? <Coins size={16} /> : req.request_type === "MEETING" ? <Users size={16} /> : req.request_type === "LEAVE" ? <Coffee size={16} /> : <Briefcase size={16} />}
                  </div>
                  <div className="min-w-0 truncate">
                    <span className="text-3xs font-mono text-[#768779] block">{req.request_number}</span>
                    <h4 className="text-xs font-bold text-[#0E341F] truncate">{req.title}</h4>
                  </div>
                </div>
                {getStatusBadge(req.status)}
              </div>

              {/* Fund Request Amount Display */}
              {req.amount && (
                <div className="px-3 py-1.5 rounded-xl bg-[#F0FEE0]/80 border border-[#D5E2D7] flex items-center justify-between">
                  <span className="text-3xs font-bold text-[#4B6B4E]">Total Dana</span>
                  <span className="text-xs font-black text-[#1E5C22]">
                    Rp {Number(req.amount).toLocaleString("id-ID")}
                  </span>
                </div>
              )}

              {/* Card Mid: Schedule & Tagged People */}
              <div className="flex items-center justify-between text-2xs text-[#637566] pt-2 border-t border-[#D5E2D7]/60">
                <div className="flex items-center gap-1.5 font-medium">
                  <Clock size={12} className="text-[#5A861F]" />
                  <span>
                    {req.start_at ? new Date(req.start_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "Today"}
                    {req.request_type === "MEETING" && req.start_at && ` • ${new Date(req.start_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                </div>

                {/* Avatar Group */}
                {req.tagged_users && req.tagged_users.length > 0 && (
                  <div className="flex items-center -space-x-1.5">
                    {req.tagged_users.slice(0, 3).map((u: any, idx: number) => (
                      <img
                        key={idx}
                        src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.id || idx)}`}
                        alt={u.name}
                        title={u.name}
                        className="w-5 h-5 rounded-full object-cover border border-white shadow-2xs"
                      />
                    ))}
                    {req.tagged_users.length > 3 && (
                      <span className="w-5 h-5 rounded-full bg-[#EAF8D6] text-3xs font-bold text-[#1E5C22] flex items-center justify-center border border-white">
                        +{req.tagged_users.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

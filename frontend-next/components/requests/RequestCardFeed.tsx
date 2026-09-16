/**
 * File: frontend-next/components/requests/RequestCardFeed.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Clock, Users, Coffee, Briefcase,
  Plus, Coins, RefreshCw, AlertTriangle
} from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
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
  /**
   * initialLoading = true only on the very first load or filter change (shows skeleton).
   * refreshing = true during silent background refresh (keeps existing cards visible, shows subtle indicator).
   */
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("ALL");

  // Track whether we've ever successfully loaded for this filter
  const hasLoadedRef = useRef(false);
  // Abort controller and request version to prevent stale responses from overwriting fresh data
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const hasObservedRefreshTriggerRef = useRef(false);

/**
 * fetchRequests owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: invokes the visible HTTP API and maps its result into UI state.
 */
  const fetchRequests = async (silent = false) => {
    // Abort any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Snapshot version: if another fetch starts before this one finishes, the stale response is discarded
    const version = ++requestVersionRef.current;

    if (silent && hasLoadedRef.current) {
      // Silent refresh: keep current data visible, just show tiny spinner
      setRefreshing(true);
    } else {
      // Initial load or filter change: show full skeleton
      setInitialLoading(true);
      hasLoadedRef.current = false;
    }
    setFetchError(null);

    try {
      const res = await api.get("/api/v1/requests", {
        params: {
          page_size: 25,
          ...(filterType !== "ALL" ? { type: filterType } : {}),
        },
        signal: controller.signal,
      });

      // Discard response if a newer request already started
      if (version !== requestVersionRef.current) return;

      const data = res.data?.data?.rows ?? res.data?.rows ?? res.data ?? [];
      setRequests(Array.isArray(data) ? data : []);
      hasLoadedRef.current = true;
    } catch (err: unknown) {
      // Ignore abort errors — they are intentional
      if ((err as any)?.name === "CanceledError" || (err as any)?.code === "ERR_CANCELED") return;
      if (version !== requestVersionRef.current) return;
      if (!silent) {
        // Only show error state on hard load failures; silent refresh failures are non-destructive
        setFetchError("Gagal memuat data request. Periksa koneksi dan coba lagi.");
      }
      // On silent refresh failure: keep existing data intact (no state change to requests)
    } finally {
      if (version === requestVersionRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Filter change: full reload with skeleton
  useEffect(() => {
    hasLoadedRef.current = false;
    fetchRequests(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType]);

  // refreshTrigger change (after action complete): silent refresh to avoid skeleton flicker
  useEffect(() => {
    if (!hasObservedRefreshTriggerRef.current) {
      hasObservedRefreshTriggerRef.current = true;
      return;
    }
    if (refreshTrigger === undefined) return;
    fetchRequests(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      requestVersionRef.current += 1;
    };
  }, []);

/**
 * getStatusBadge owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: updates only the visible React/browser state or invokes the callbacks below.
 */
  const getStatusBadge = (status: string) => {
    const labels: Record<string, string> = {
      COMPLETED: "CLOSED",
      PENDING_LPJ_VERIFICATION: "WAITING LPJ OM",
      PENDING_EXEC: "WAITING EXEC",
      RE_CHECKING: "RE-CHECKING",
      LPJ_REVISION: "RE-CHECKING",
    };
    return <span className={cn("px-2.5 py-0.5 rounded-full border text-3xs font-extrabold", getStatusColor(status))}>{labels[status] || status.replace(/_/g, " ") || "WAITING OM"}</span>;
  };

  return (
    <div className="space-y-3.5">
      {/* Header & Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-extrabold text-[#090909] tracking-tight">Kartu Permintaan Aktif (Active Request Cards)</h3>
          <span className="px-2 py-0.5 rounded-full bg-[#EAF6FF] text-3xs font-extrabold text-[#2649B3]">
            {requests.length} Active
          </span>
          {/* Subtle refresh indicator: shown during silent background refresh */}
          {refreshing && (
            <RefreshCw size={12} className="text-[#2649B3] animate-spin ml-1" />
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Type Filter Buttons */}
          <div className="flex items-center p-1 rounded-xl bg-[#EAF6FF] border border-[#D9D9D9] text-2xs font-bold text-[#4F5050]">
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
                  filterType === t.id ? "bg-[#2649B3] text-white shadow-2xs font-extrabold" : "hover:text-[#090909]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenNewModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#2649B3] hover:bg-[#2649B3] text-white text-2xs font-extrabold shadow-xs transition-all"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>Tambahkan Kartu</span>
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      {initialLoading ? (
        /* Full skeleton on first load or filter change */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-[20px] bg-[#EAF6FF]/50 border border-[#D9D9D9] animate-pulse" />
          ))}
        </div>
      ) : fetchError ? (
        /* Error state with retry */
        <div className="p-8 rounded-[20px] bg-white border border-red-100 text-center space-y-3">
          <AlertTriangle size={24} className="text-red-400 mx-auto" />
          <p className="text-xs text-red-600 font-semibold">{fetchError}</p>
          <button
            onClick={() => fetchRequests(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EAF6FF] text-[#2649B3] text-xs font-bold hover:bg-[#9FD6FF] transition-colors"
          >
            <RefreshCw size={13} />
            Coba Lagi
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="p-8 rounded-[20px] bg-white border border-[#D9D9D9] text-center text-xs text-[#4F5050]">
          Belum ada request aktif. Klik tombol <b>Tambahkan Kartu</b> untuk mengajukan dana, rapat, atau cuti baru.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {requests.map(req => (
            <div
              key={req.id}
              onClick={() => onRequestClick(req)}
              className="p-4.5 rounded-[20px] bg-white border border-[#D9D9D9] hover:border-[#294BB2]/60 hover:shadow-card-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer flex flex-col justify-between gap-3 shadow-2xs"
            >
              {/* Card Top */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#EAF6FF] border border-[#D9D9D9] flex items-center justify-center text-[#2649B3] shrink-0">
                    {req.request_type === "FUND_REQUEST" ? <Coins size={16} /> : req.request_type === "MEETING" ? <Users size={16} /> : req.request_type === "LEAVE" ? <Coffee size={16} /> : <Briefcase size={16} />}
                  </div>
                  <div className="min-w-0 truncate">
                    <span className="text-3xs font-mono text-[#4F5050] block">{req.request_number}</span>
                    <h4 className="text-xs font-bold text-[#090909] truncate">{req.title}</h4>
                  </div>
                </div>
                {getStatusBadge(req.status)}
              </div>

              {/* Fund Request Amount Display */}
              {req.amount && (
                <div className="px-3 py-1.5 rounded-xl bg-[#EAF6FF]/80 border border-[#D9D9D9] flex items-center justify-between">
                  <span className="text-3xs font-bold text-[#2649B3]">Total Dana</span>
                  <span className="text-xs font-black text-[#2649B3]">
                    Rp {Number(req.amount).toLocaleString("id-ID")}
                  </span>
                </div>
              )}

              {/* Assignee Information */}
              <div className="flex items-center justify-between text-2xs">
                {req.assignee_user ? (
                  <div className="flex items-center gap-1.5 text-3xs text-[#4F5050]">
                    <span>Assigned to</span>
                    <span className="font-bold text-[#2649B3] px-1.5 py-0.5 rounded-md bg-[#EAF6FF]">
                      {req.assignee_user.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-3xs text-[#4F5050] italic">Belum di-assign</span>
                )}
              </div>

              {/* Card Mid: Schedule & Tagged People */}
              <div className="flex items-center justify-between text-2xs text-[#4F5050] pt-2 border-t border-[#D9D9D9]/60">
                <div className="flex items-center gap-1.5 font-medium">
                  <Clock size={12} className="text-[#294BB2]" />
                  <span>
                    {req.start_at ? new Date(req.start_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "Today"}
                    {req.request_type === "MEETING" && req.start_at && ` • ${new Date(req.start_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}${req.end_at ? ` - ${new Date(req.end_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
                  </span>
                </div>

                {/* Avatar Group */}
                {req.tagged_users && req.tagged_users.length > 0 && (
                  <div className="flex items-center -space-x-1.5">
                    {req.tagged_users.slice(0, 3).map((u: any, idx: number) => (
                      <Image
                        key={idx}
                        src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.id || idx)}`}
                        alt={u.name}
                        title={u.name}
                        width={20}
                        height={20}
                        unoptimized
                        className="w-5 h-5 rounded-full object-cover border border-white shadow-2xs"
                      />
                    ))}
                    {req.tagged_users.length > 3 && (
                      <span className="w-5 h-5 rounded-full bg-[#EAF6FF] text-3xs font-bold text-[#2649B3] flex items-center justify-center border border-white">
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

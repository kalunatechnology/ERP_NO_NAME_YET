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
import Link from "next/link";
import {
  Clock, Users, ArrowRight, RefreshCw, AlertTriangle
} from "lucide-react";
import { localDateKey } from "@/lib/utils";
import api from "@/lib/api/axios";

interface RequestCardFeedProps {
  onRequestClick: (req: any) => void;
  refreshTrigger?: number;
}

/**
 * RequestCardFeed owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: invokes the visible HTTP API and maps its result into UI state.
 */
export function RequestCardFeed({ onRequestClick, refreshTrigger }: RequestCardFeedProps) {
  const [requests, setRequests] = useState<any[]>([]);
  /**
   * initialLoading = true only on the first load (shows skeleton).
   * refreshing = true during silent background refresh (keeps existing cards visible, shows subtle indicator).
   */
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Track whether we've ever successfully loaded the meeting feed
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
          page_size: 50,
          type: "MEETING",
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

  // Initial load of today's and upcoming meeting cards
  useEffect(() => {
    hasLoadedRef.current = false;
    fetchRequests(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const today = localDateKey();
  const meetingDateKey = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const meetings = requests.filter((request) => request.request_type === "MEETING" && request.start_at)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  const todayMeetings = meetings.filter((request) => meetingDateKey(request.start_at) === today);
  const incomingMeetings = meetings.filter((request) => meetingDateKey(request.start_at) > today);

  const renderMeetingCard = (req: any) => (
    <button
      key={req.id}
      type="button"
      onClick={() => onRequestClick(req)}
      className="w-full rounded-xl border border-[#D9E2EE] bg-white p-3 text-left shadow-2xs transition-all hover:border-[#294BB2]/50 hover:shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D9E2EE] bg-[#EAF6FF] text-[#2649B3]">
          <Users size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-mono text-[#64748B]">{req.request_number}</span>
          <span className="block whitespace-normal break-words text-xs font-bold leading-snug text-[#090909]">{req.title}</span>
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#EEF2F7] pt-2 text-[11px] text-[#4F5050]">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Clock size={12} className="text-[#294BB2]" />
          {req.start_at && <>
            {meetingDateKey(req.start_at) !== today && `${new Date(req.start_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · `}
            {new Date(req.start_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
            {req.end_at && ` – ${new Date(req.end_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`}
          </>}
        </span>
        {req.tagged_users?.length > 0 && (
          <span className="flex shrink-0 items-center -space-x-1.5" aria-label={`${req.tagged_users.length} peserta`}>
            {req.tagged_users.slice(0, 3).map((user: any, index: number) => (
              <Image
                key={user.id ?? index}
                src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.id || index)}`}
                alt={user.name || "Peserta"}
                title={user.name || "Peserta"}
                width={20}
                height={20}
                unoptimized
                className="h-5 w-5 rounded-full border border-white object-cover"
              />
            ))}
            {req.tagged_users.length > 3 && <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-[#EAF6FF] text-[9px] font-bold text-[#2649B3]">+{req.tagged_users.length - 3}</span>}
          </span>
        )}
      </div>
    </button>
  );

  const renderMeetingSection = (title: string, items: any[], emptyText: string) => (
    <section className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[#D9E2EE] bg-[#F8FBFF] p-3 sm:p-4">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
        <h4 className="text-sm font-extrabold text-[#090909]">{title}</h4>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#2649B3]">{items.length}</span>
      </div>
      {items.length ? <div className="flex max-h-[290px] flex-col gap-2 overflow-y-auto pr-1">{items.map(renderMeetingCard)}</div> : (
        <p className="rounded-xl border border-dashed border-[#D5E3F2] bg-white px-3 py-5 text-center text-xs text-[#64748B]">{emptyText}</p>
      )}
    </section>
  );

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-3 border-b border-[#D9D9D9] pb-3">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-sm font-extrabold tracking-tight text-[#090909]">Today&apos;s &amp; Incoming Meeting</h3>
            <p className="mt-0.5 text-xs text-[#64748B]">Jadwal rapat hari ini dan yang akan datang.</p>
          </div>
          {refreshing && <RefreshCw size={13} className="text-[#2649B3] animate-spin" aria-label="Memperbarui" />}
        </div>
        <Link href="/requests" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#D9E2EE] bg-white px-3 py-2 text-xs font-bold text-[#2649B3] transition-colors hover:bg-[#EAF6FF]">
          Lihat detail <ArrowRight size={13} />
        </Link>
      </div>

      {initialLoading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[1, 2].map(i => (
            <div key={i} className="h-44 rounded-2xl border border-[#D9E2EE] bg-[#EAF6FF]/50 animate-pulse" />
          ))}
        </div>
      ) : fetchError ? (
        <div className="space-y-3 rounded-2xl border border-red-100 bg-white p-8 text-center">
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
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
          {renderMeetingSection("Today's", todayMeetings, "Tidak ada meeting hari ini.")}
          {renderMeetingSection("Incoming Meeting", incomingMeetings, "Belum ada meeting mendatang.")}
        </div>
      )}
    </div>
  );
}

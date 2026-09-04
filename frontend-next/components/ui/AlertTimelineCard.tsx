/**
 * File: frontend-next/components/ui/AlertTimelineCard.tsx
 *
 * Purpose: Implements React UI component responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchRealAlertsList, RealAlertItem } from "@/lib/api/feed.api";
import toast from "react-hot-toast";

export interface AlertItem {
  id: string | number;
  category: string; // e.g. "Otorisasi WBS", "Pembaruan Proyek", "Dokumen Keuangan"
  time: string; // e.g. "10.17 AM", "Hari ini", "Kemarin"
  title: string; // e.g. "Access Request: WBS Level 3", "Status Update: Deal Won"
  snippet: string; // Message snippet
  isHighlighted?: boolean; // Highlighted with green card background
  categoryColor?: string; // Dot color, default green or grey
  href?: string;
  onClick?: () => void;
}

/**
 * AlertTimelineCard coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function AlertTimelineCard({
  title = "Alert",
  alerts: controlledAlerts,
  className,
  onViewAll,
  autoFetch = true,
}: {
  title?: string;
  alerts?: AlertItem[];
  className?: string;
  onViewAll?: () => void;
  autoFetch?: boolean;
}) {
  const router = useRouter();
  const [liveAlerts, setLiveAlerts] = useState<AlertItem[]>(controlledAlerts || []);
  const [loading, setLoading] = useState(false);

/**
 * loadAlerts coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const loadAlerts = async () => {
    if (!autoFetch && controlledAlerts) {
      setLiveAlerts(controlledAlerts);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchRealAlertsList();
      setLiveAlerts(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (controlledAlerts && controlledAlerts.length > 0) {
      setLiveAlerts(controlledAlerts);
    } else {
      loadAlerts();
    }
  }, [controlledAlerts]);

/**
 * handleItemClick coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleItemClick = (item: AlertItem) => {
    if (item.onClick) {
      item.onClick();
      return;
    }
    if (item.href) {
      router.push(item.href);
      toast(`Membuka ${item.title}`);
    }
  };

  return (
    <div
      className={cn(
        "w-full bg-white border border-[#E5E9E2] rounded-[24px] p-5 sm:p-6 shadow-xs flex flex-col justify-between select-none",
        className
      )}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100/80 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#F0FEE0] flex items-center justify-center text-[#275433]">
            <Bell size={15} />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[#0E341F] tracking-tight">{title}</h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAlerts}
            title="Muat ulang alert"
            className={cn(
              "p-1 rounded-md text-gray-400 hover:text-[#5A861F] hover:bg-[#F0FEE0] transition-colors cursor-pointer",
              loading && "animate-spin text-[#5A861F]"
            )}
          >
            <RefreshCw size={13} />
          </button>
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="text-xs font-semibold text-[#5A861F] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>Semua</span>
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Vertical Timeline & Alert Feed */}
      <div className="relative pl-5 flex flex-col gap-3 max-h-[460px] overflow-y-auto no-scrollbar">
        {/* Left Continuous Timeline Bar */}
        <div className="absolute left-1.5 top-2 bottom-2 w-1 bg-[#E5E9E2] rounded-full overflow-hidden">
          <div className="w-full bg-[#5A861F] h-1/3 rounded-full" />
        </div>

        {liveAlerts.map((item) => (
          <div
            key={item.id}
            onClick={() => handleItemClick(item)}
            className={cn(
              "p-3.5 rounded-[16px] transition-all flex flex-col gap-1 relative cursor-pointer group",
              item.isHighlighted
                ? "bg-[#F0FEE0] border border-[#BBDFA0] shadow-2xs"
                : "bg-white hover:bg-neutral-50 border border-transparent hover:border-gray-200"
            )}
          >
            {/* Top Category Header & Timestamp */}
            <div className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor:
                      item.categoryColor || (item.isHighlighted ? "#22C55E" : "#9CA3AF"),
                  }}
                />
                <span className="font-bold text-[#0E341F] truncate text-xs">
                  {item.category}
                </span>
              </div>
              <span className="text-[10px] text-[#637566] font-medium flex-shrink-0">
                {item.time}
              </span>
            </div>

            {/* Subject / Title */}
            <h5 className="text-xs font-bold text-[#0E341F] mt-0.5 leading-snug group-hover:text-[#275433] transition-colors">
              {item.title}
            </h5>

            {/* Snippet / Message */}
            <p className="text-[11px] text-[#637566] leading-relaxed line-clamp-2">
              {item.snippet}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AlertTimelineCard;

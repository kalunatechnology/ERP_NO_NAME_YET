"use client";

import React, { useState } from "react";
import { Search, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type CRMTone = "blue" | "purple" | "amber" | "pink" | "green" | "red" | "slate";

export const CRM_TONE_STYLES: Record<
  CRMTone,
  {
    cardBg: string;
    cardBorder: string;
    iconBg: string;
    text: string;
    colBg: string;
    colHeaderBg: string;
    colBorder: string;
    badgeBg: string;
    dot: string;
  }
> = {
  blue: {
    cardBg: "bg-[#EAF6FF]",
    cardBorder: "border-[#D9D9D9]",
    iconBg: "bg-[#D8EEFF]",
    text: "text-[#006BBC]",
    colBg: "bg-[#F6FBFF]",
    colHeaderBg: "bg-[#DDF0FF]",
    colBorder: "border-[#A9D9FF]",
    badgeBg: "bg-[#A9D9FF] text-[#006BBC]",
    dot: "bg-[#0092FF]",
  },
  purple: {
    cardBg: "bg-[#FAF3FF]",
    cardBorder: "border-[#D9D9D9]",
    iconBg: "bg-[#F4E7FE]",
    text: "text-[#A600FF]",
    colBg: "bg-[#FAF3FF]",
    colHeaderBg: "bg-[#F4E7FE]",
    colBorder: "border-[#DDD6FE]",
    badgeBg: "bg-[#F0DDFF] text-[#A600FF]",
    dot: "bg-[#A600FF]",
  },
  amber: {
    cardBg: "bg-[#FEF5E6]",
    cardBorder: "border-[#D9D9D9]",
    iconBg: "bg-[#FEF5E6]",
    text: "text-[#E28000]",
    colBg: "bg-[#FFFBF5]",
    colHeaderBg: "bg-[#FFEBD4]",
    colBorder: "border-[#FFD2A4]",
    badgeBg: "bg-[#FFD2A4] text-[#E28000]",
    dot: "bg-[#E28000]",
  },
  pink: {
    cardBg: "bg-[#FFF9FF]",
    cardBorder: "border-[#D9D9D9]",
    iconBg: "bg-[#FFE4FE]",
    text: "text-[#FF00F2]",
    colBg: "bg-[#FFF9FF]",
    colHeaderBg: "bg-[#FFE5FE]",
    colBorder: "border-[#FFCCFD]",
    badgeBg: "bg-[#FFCCFD] text-[#FF00F2]",
    dot: "bg-[#FF00F2]",
  },
  green: {
    cardBg: "bg-[#DAF8D7]",
    cardBorder: "border-[#D9D9D9]",
    iconBg: "bg-[#DAF8D7]",
    text: "text-[#0B8E00]",
    colBg: "bg-[#FAFFF9]",
    colHeaderBg: "bg-[#DAF8D7]",
    colBorder: "border-[#B0E2AC]",
    badgeBg: "bg-[#B0E2AC] text-[#0B8E00]",
    dot: "bg-[#0B8E00]",
  },
  red: {
    cardBg: "bg-[#FFE5E5]",
    cardBorder: "border-[#D9D9D9]",
    iconBg: "bg-[#FFE5E5]",
    text: "text-[#FF0000]",
    colBg: "bg-[#FFF7F7]",
    colHeaderBg: "bg-[#FFE5E5]",
    colBorder: "border-[#FFB6B6]",
    badgeBg: "bg-[#FFB6B6] text-[#FF0000]",
    dot: "bg-[#FF0000]",
  },
  slate: {
    cardBg: "bg-white",
    cardBorder: "border-[#D9D9D9]",
    iconBg: "bg-[#EDEDED]",
    text: "text-[#353535]",
    colBg: "bg-[#F8FAFC]",
    colHeaderBg: "bg-[#EDEDED]",
    colBorder: "border-[#D9D9D9]",
    badgeBg: "bg-[#D9D9D9] text-[#353535]",
    dot: "bg-[#626262]",
  },
};

export interface CRMKpiItem {
  id?: string;
  label: string;
  value: string | number;
  subtitle?: string;
  tone?: CRMTone;
  icon?: React.ElementType;
  active?: boolean;
  onClick?: () => void;
}

export function CRMKpiRow({
  items,
  columns = 5,
}: {
  items: CRMKpiItem[];
  columns?: 4 | 5 | 6;
}) {
  const gridCols =
    columns === 6
      ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
      : columns === 4
      ? "grid-cols-2 lg:grid-cols-4"
      : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";

  return (
    <div className={cn("grid gap-3", gridCols)}>
      {items.map((item, idx) => {
        const tone = CRM_TONE_STYLES[item.tone || "blue"];
        const Icon = item.icon;
        const Tag = item.onClick ? "button" : "div";
        return (
          <Tag
            key={item.id || `${item.label}-${idx}`}
            type={item.onClick ? "button" : undefined}
            onClick={item.onClick}
            className={cn(
              "rounded-2xl border p-4 text-left transition-all shadow-2xs min-w-0",
              tone.cardBg,
              tone.cardBorder,
              item.onClick && "cursor-pointer hover:shadow-sm hover:-translate-y-0.5",
              item.active && "border-[#2649B3] shadow-xs"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className={cn("text-xs font-semibold truncate", tone.text)}>
                  {item.label}
                </div>
                <div
                  className="mt-1 text-lg sm:text-xl font-extrabold text-[#090909] truncate"
                  title={String(item.value)}
                >
                  {item.value}
                </div>
                {item.subtitle && (
                  <div className="mt-0.5 text-[11px] text-[#626262] truncate">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {Icon && (
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-2xs",
                    tone.iconBg,
                    tone.text
                  )}
                >
                  <Icon size={18} />
                </div>
              )}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

const AVATAR_PALETTE = [
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-purple-100 text-purple-800 border-purple-200",
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-pink-100 text-pink-800 border-pink-200",
  "bg-sky-100 text-sky-800 border-sky-200",
];

export function CRMAvatarBadge({
  name,
  subtitle,
  size = "sm",
}: {
  name?: string | null;
  subtitle?: string | null;
  size?: "xs" | "sm";
}) {
  const display = (name || "Unassigned").trim();
  const initials = display
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
  let hash = 0;
  for (let i = 0; i < display.length; i += 1) hash = (hash * 31 + display.charCodeAt(i)) | 0;
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];

  return (
    <div className="inline-flex items-center gap-2 min-w-0">
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border font-bold",
          size === "xs" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-[11px]",
          color
        )}
      >
        {initials}
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-700">{display}</div>
        {subtitle && <div className="truncate text-[10px] text-slate-400">{subtitle}</div>}
      </div>
    </div>
  );
}

export interface CRMFilterSelect {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel?: string;
}

export interface CRMViewToggleOption {
  id: string;
  label: string;
  icon?: React.ElementType;
  badge?: number | string;
}

export function CRMFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Cari...",
  filters = [],
  viewOptions,
  activeView,
  onViewChange,
  rightActions,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: CRMFilterSelect[];
  viewOptions?: CRMViewToggleOption[];
  activeView?: string;
  onViewChange?: (viewId: string) => void;
  rightActions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#D9D9D9] bg-white p-3 shadow-2xs">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
        <label className="relative min-w-[200px] flex-1 max-w-xs">
          <span className="sr-only">{searchPlaceholder}</span>
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7D7D7D]"
          />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-[#D9D9D9] bg-[#F8FAFC] py-2 pl-8.5 pr-3 text-xs text-[#090909] placeholder:text-[#7D7D7D] focus:border-[#2649B3] focus:bg-white focus:outline-none transition-colors"
          />
        </label>

        {filters.map((filter) => (
          <select
            key={filter.id}
            aria-label={filter.ariaLabel || filter.id}
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="rounded-xl border border-[#D9D9D9] bg-white px-3 py-2 text-xs font-medium text-[#353535] focus:border-[#2649B3] focus:outline-none transition-colors"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}

        {viewOptions && viewOptions.length > 0 && onViewChange && (
          <div className="inline-flex items-center rounded-xl border border-[#D9D9D9] bg-[#F1F5F9]/80 p-0.5">
            {viewOptions.map((opt) => {
              const Icon = opt.icon;
              const active = activeView === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onViewChange(opt.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    active
                      ? "bg-white text-[#2649B3] shadow-2xs font-bold"
                      : "text-[#626262] hover:text-[#090909]"
                  )}
                >
                  {Icon && <Icon size={13} />}
                  <span>{opt.label}</span>
                  {opt.badge !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                        active ? "bg-[#EAF6FF] text-[#2649B3]" : "bg-[#EDEDED] text-[#626262]"
                      )}
                    >
                      {opt.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {rightActions && (
        <div className="flex items-center gap-2">{rightActions}</div>
      )}
    </div>
  );
}
                      )}
                    >
                      {opt.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {rightActions && <div className="flex flex-wrap items-center gap-2">{rightActions}</div>}
    </div>
  );
}

export interface CRMKanbanColumn<T> {
  id: string;
  title: string;
  tone: CRMTone;
  items: T[];
  headerMeta?: string;
}

export function CRMKanbanBoard<T extends { id: string | number }>({
  columns,
  renderCard,
  onMoveCard,
  canDrag = true,
  emptyColumnText = "Belum ada data",
}: {
  columns: CRMKanbanColumn<T>[];
  renderCard: (item: T, column: CRMKanbanColumn<T>) => React.ReactNode;
  onMoveCard?: (itemId: string, targetColumnId: string) => void;
  canDrag?: boolean;
  emptyColumnText?: string;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  return (
    <div className="flex gap-3.5 overflow-x-auto pb-3">
      {columns.map((col) => {
        const tone = CRM_TONE_STYLES[col.tone];
        const isOver = dragOverCol === col.id;
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              if (!canDrag || !onMoveCard) return;
              e.preventDefault();
              if (dragOverCol !== col.id) setDragOverCol(col.id);
            }}
            onDragLeave={() => {
              if (dragOverCol === col.id) setDragOverCol(null);
            }}
            onDrop={(e) => {
              if (!canDrag || !onMoveCard) return;
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || draggedId;
              setDragOverCol(null);
              setDraggedId(null);
              if (id) onMoveCard(id, col.id);
            }}
            className={cn(
              "flex min-w-[268px] max-w-[320px] flex-1 flex-col rounded-xl border transition-all",
              tone.colBg,
              tone.colBorder,
              isOver && "ring-2 ring-[#2649B3] ring-offset-1"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-between gap-2 rounded-t-xl border-b px-3.5 py-2.5",
                tone.colHeaderBg,
                tone.colBorder
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tone.dot)} />
                <span className={cn("truncate text-xs font-bold", tone.text)}>
                  {col.title}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {col.headerMeta && (
                  <span className="text-[11px] font-semibold text-slate-600">
                    {col.headerMeta}
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                    tone.badgeBg
                  )}
                >
                  {col.items.length}
                </span>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2.5 p-2.5 max-h-[620px] overflow-y-auto">
              {col.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300/80 bg-white/50 py-8 text-center text-[11px] text-slate-400">
                  {emptyColumnText}
                </div>
              ) : (
                col.items.map((item) => (
                  <div
                    key={String(item.id)}
                    draggable={Boolean(canDrag && onMoveCard)}
                    onDragStart={(e) => {
                      if (!canDrag || !onMoveCard) return;
                      setDraggedId(String(item.id));
                      e.dataTransfer.setData("text/plain", String(item.id));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverCol(null);
                    }}
                    className={cn(
                      "group relative rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs transition-all hover:border-blue-300 hover:shadow-sm",
                      draggedId === String(item.id) && "opacity-50"
                    )}
                  >
                    {canDrag && onMoveCard && (
                      <div className="pointer-events-none absolute right-2 top-2.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100">
                        <GripVertical size={13} />
                      </div>
                    )}
                    {renderCard(item, col)}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface CRMDrawerTab {
  id: string;
  label: string;
  badge?: number;
}

export function CRMRightDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  tabs,
  activeTab,
  onTabChange,
  children,
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  tabs?: CRMDrawerTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex h-full w-full max-w-[500px] flex-col border-l border-[#D9D9D9] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#D9D9D9] px-6 py-4.5 bg-white">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-extrabold text-[#090909]">{title}</h2>
              {badge}
            </div>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-[#626262] font-medium">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel"
            className="rounded-lg p-1.5 text-[#7D7D7D] transition-colors hover:bg-[#F1F5F9] hover:text-[#090909]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {tabs && tabs.length > 0 && onTabChange && (
          <div className="flex gap-1 border-b border-[#D9D9D9] px-6 pt-2 bg-white">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors",
                    active
                      ? "border-[#2649B3] text-[#2649B3] font-bold"
                      : "border-transparent text-[#7D7D7D] hover:text-[#090909]"
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                      active ? "bg-[#EAF6FF] text-[#2649B3]" : "bg-[#EDEDED] text-[#626262]"
                    )}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#D9D9D9] bg-[#F8FAFC] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}


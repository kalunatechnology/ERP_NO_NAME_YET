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
    cardBg: "bg-[#EBF5FF]/80",
    cardBorder: "border-[#BFDBFE]",
    iconBg: "bg-[#DBEAFE]",
    text: "text-[#1E40AF]",
    colBg: "bg-[#EBF5FF]/60",
    colHeaderBg: "bg-[#DBEAFE]/80",
    colBorder: "border-[#BFDBFE]",
    badgeBg: "bg-[#DBEAFE] text-[#1E40AF]",
    dot: "bg-[#2563EB]",
  },
  purple: {
    cardBg: "bg-[#F5F3FF]/80",
    cardBorder: "border-[#DDD6FE]",
    iconBg: "bg-[#EDE9FE]",
    text: "text-[#5B21B6]",
    colBg: "bg-[#F5F3FF]/60",
    colHeaderBg: "bg-[#EDE9FE]/80",
    colBorder: "border-[#DDD6FE]",
    badgeBg: "bg-[#EDE9FE] text-[#5B21B6]",
    dot: "bg-[#7C3AED]",
  },
  amber: {
    cardBg: "bg-[#FFFBEB]/90",
    cardBorder: "border-[#FDE68A]",
    iconBg: "bg-[#FEF3C7]",
    text: "text-[#B45309]",
    colBg: "bg-[#FFFBEB]/65",
    colHeaderBg: "bg-[#FEF3C7]/85",
    colBorder: "border-[#FDE68A]",
    badgeBg: "bg-[#FEF3C7] text-[#B45309]",
    dot: "bg-[#D97706]",
  },
  pink: {
    cardBg: "bg-[#FDF2F8]/80",
    cardBorder: "border-[#FBCFE8]",
    iconBg: "bg-[#FCE7F3]",
    text: "text-[#BE185D]",
    colBg: "bg-[#FDF2F8]/60",
    colHeaderBg: "bg-[#FCE7F3]/80",
    colBorder: "border-[#FBCFE8]",
    badgeBg: "bg-[#FCE7F3] text-[#BE185D]",
    dot: "bg-[#DB2777]",
  },
  green: {
    cardBg: "bg-[#ECFDF5]/85",
    cardBorder: "border-[#A7F3D0]",
    iconBg: "bg-[#D1FAE5]",
    text: "text-[#047857]",
    colBg: "bg-[#ECFDF5]/60",
    colHeaderBg: "bg-[#D1FAE5]/80",
    colBorder: "border-[#A7F3D0]",
    badgeBg: "bg-[#D1FAE5] text-[#047857]",
    dot: "bg-[#059669]",
  },
  red: {
    cardBg: "bg-[#FEF2F2]/85",
    cardBorder: "border-[#FECACA]",
    iconBg: "bg-[#FEE2E2]",
    text: "text-[#B91C1C]",
    colBg: "bg-[#FEF2F2]/60",
    colHeaderBg: "bg-[#FEE2E2]/80",
    colBorder: "border-[#FECACA]",
    badgeBg: "bg-[#FEE2E2] text-[#B91C1C]",
    dot: "bg-[#DC2626]",
  },
  slate: {
    cardBg: "bg-slate-50",
    cardBorder: "border-slate-200",
    iconBg: "bg-slate-100",
    text: "text-slate-700",
    colBg: "bg-slate-50/80",
    colHeaderBg: "bg-slate-100",
    colBorder: "border-slate-200",
    badgeBg: "bg-slate-200/80 text-slate-700",
    dot: "bg-slate-500",
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
              "rounded-xl border p-3.5 text-left transition-all shadow-2xs min-w-0",
              tone.cardBg,
              tone.cardBorder,
              item.onClick && "cursor-pointer hover:shadow-sm hover:-translate-y-0.5",
              item.active && "ring-2 ring-[#1E40AF] ring-offset-1"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className={cn("text-xs font-semibold truncate", tone.text)}>
                  {item.label}
                </div>
                <div
                  className="mt-1 text-lg sm:text-xl font-extrabold text-slate-900 truncate"
                  title={String(item.value)}
                >
                  {item.value}
                </div>
                {item.subtitle && (
                  <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {Icon && (
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    tone.iconBg,
                    tone.text
                  )}
                >
                  <Icon size={17} />
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
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
        <label className="relative min-w-[200px] flex-1 max-w-xs">
          <span className="sr-only">{searchPlaceholder}</span>
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#1E40AF] focus:bg-white focus:outline-none"
          />
        </label>

        {filters.map((filter) => (
          <select
            key={filter.id}
            aria-label={filter.ariaLabel || filter.id}
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-[#1E40AF] focus:outline-none"
          >
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}

        {viewOptions && viewOptions.length > 0 && onViewChange && (
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5">
            {viewOptions.map((opt) => {
              const Icon = opt.icon;
              const active = activeView === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onViewChange(opt.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                    active
                      ? "bg-white text-[#1E40AF] shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {Icon && <Icon size={13} />}
                  <span>{opt.label}</span>
                  {opt.badge !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                        active ? "bg-blue-100 text-[#1E40AF]" : "bg-slate-200 text-slate-700"
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
              isOver && "ring-2 ring-[#1E40AF] ring-offset-1"
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
        className="flex h-full w-full max-w-[490px] flex-col border-l border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-slate-900">{title}</h2>
              {badge}
            </div>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {tabs && tabs.length > 0 && onTabChange && (
          <div className="flex gap-1 border-b border-slate-200 px-5 pt-2">
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
                      ? "border-[#1E40AF] text-[#1E40AF]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}


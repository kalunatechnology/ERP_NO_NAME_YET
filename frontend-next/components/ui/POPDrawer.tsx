"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface POPDrawerTab {
  id: string;
  label: string;
  badge?: number;
}

export interface POPDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  tabs?: POPDrawerTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: "left" | "right";
  maxWidthClass?: string;
}

/**
 * Reusable Point-of-Presence (POP) Drawer.
 * Defaults to left-side slide-in/out using GPU-composited transform + opacity transitions.
 */
export function POPDrawer({
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
  side = "left",
  maxWidthClass = "max-w-[480px]",
}: POPDrawerProps) {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 220);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  const isLeft = side === "left";

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-slate-900/30 backdrop-blur-[1.5px] transition-opacity duration-200 ease-out",
        isLeft ? "justify-start" : "justify-end",
        visible ? "opacity-100" : "opacity-0"
      )}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col bg-white shadow-xl transition-transform duration-200 ease-out will-change-transform",
          maxWidthClass,
          isLeft ? "border-r border-[#E2E8F0]" : "border-l border-[#E2E8F0]",
          visible
            ? "translate-x-0"
            : isLeft
            ? "-translate-x-full"
            : "translate-x-full"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-[#0F172A]">{title}</h2>
              {badge}
            </div>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs font-medium text-[#64748B]">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel"
            className="rounded-lg p-1.5 text-[#64748B] transition-colors duration-150 hover:bg-[#F1F5F9] hover:text-[#0F172A] active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {tabs && tabs.length > 0 && onTabChange && (
          <div className="flex gap-1 border-b border-[#E2E8F0] bg-white px-5 pt-1.5 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors duration-150",
                    active
                      ? "border-[#0876CD] text-[#0868B5] font-semibold"
                      : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                        active ? "bg-[#E7F2FF] text-[#0868B5]" : "bg-[#F1F5F9] text-[#64748B]"
                      )}
                    >
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
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default POPDrawer;

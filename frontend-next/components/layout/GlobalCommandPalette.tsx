"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, FolderKanban, CheckSquare, DollarSign,
  Building2, BarChart3, TrendingUp, X, Sparkles,
  ArrowRight, ShieldCheck, Database
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  desc: string;
  path: string;
  category: "Navigasi" | "Proyek & WBS" | "Finansial" | "CRM";
  icon: React.ElementType;
}

const COMMAND_ITEMS: CommandItem[] = [
  { id: "dash",     label: "Dashboard Ringkasan",          desc: "KPI, status proyek & metrik utama",       path: "/dashboard",  category: "Navigasi", icon: BarChart3 },
  { id: "proj",     label: "Manajemen Proyek & WBS Tree",  desc: "Struktur L1/L2/L3, milestone & EVM",      path: "/projects",   category: "Proyek & WBS", icon: FolderKanban },
  { id: "tasks",    label: "Daily Tasks & Assignment",     desc: "Checklist tugas harian & timesheet",      path: "/tasks",      category: "Proyek & WBS", icon: CheckSquare },
  { id: "finance",  label: "Finance & Accounts Payable",   desc: "P&L, 3-Way match & disbursement",        path: "/finance",    category: "Finansial", icon: DollarSign },
  { id: "crm",      label: "CRM & Sales Pipeline",         desc: "Deals, quotation, & customer support",   path: "/crm",        category: "CRM", icon: Building2 },
  { id: "reports",  label: "Laporan & Observabilitas",     desc: "Ekspor P&L proyek & jurnal umum",         path: "/reporting",  category: "Finansial", icon: TrendingUp },
  { id: "explorer", label: "OpenAPI Data Explorer",        desc: "Raw REST resources & inspector data",     path: "/resources",  category: "Navigasi", icon: Database },
];

export function GlobalCommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = COMMAND_ITEMS.filter((item) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      item.label.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  // Handle keyboard shortcuts (ESC, Arrows, Enter)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        router.push(filtered[selectedIndex].path);
        onClose();
      }
    };

    if (isOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, filtered, selectedIndex, router]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop with blur */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
      />

      {/* Dialog container with smooth zoom-in */}
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden z-10 animate-in zoom-in-95 fade-in duration-200 ease-out flex flex-col max-h-[80vh]">
        {/* Search header */}
        <div className="flex items-center px-4 py-3.5 border-b border-gray-100 bg-gray-50/50">
          <Search className="w-5 h-5 text-brand-deep-green mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Cari menu, proyek, modul, atau fitur... (Ketik atau pilih)"
            className="w-full text-sm bg-transparent border-none focus:outline-none text-text-primary placeholder:text-text-secondary font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 rounded-full text-text-secondary hover:text-text-primary mr-1.5"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="px-2 py-0.5 text-2xs text-text-secondary bg-white rounded-lg border border-gray-200 font-mono shadow-2xs flex-shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div className="overflow-y-auto p-2 space-y-1 divide-y divide-gray-50 flex-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-secondary flex flex-col items-center gap-2">
              <Sparkles size={24} className="text-gray-300" />
              <span>Tidak ada rute atau modul yang cocok dengan &quot;{query}&quot;</span>
              <button
                onClick={() => {
                  router.push(`/resources?search=${encodeURIComponent(query)}`);
                  onClose();
                }}
                className="btn-primary py-1 px-3 text-xs mt-2"
              >
                Cari &quot;{query}&quot; di Data Explorer &rarr;
              </button>
            </div>
          ) : (
            <div>
              <div className="px-3 py-1.5 text-2xs font-bold text-text-secondary uppercase tracking-wider">
                Navigasi & Pintasan Modul
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {filtered.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        router.push(item.path);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all duration-150 group",
                        isSelected
                          ? "bg-brand-light-green/70 text-brand-deep-green shadow-xs"
                          : "hover:bg-gray-50 text-text-primary"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                            isSelected ? "bg-brand-green text-white" : "bg-gray-100 text-text-secondary"
                          )}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-text-primary group-hover:text-brand-deep-green truncate">
                            {item.label}
                          </div>
                          <div className="text-2xs text-text-secondary truncate">{item.desc}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-text-secondary">
                          {item.category}
                        </span>
                        <ArrowRight size={14} className={cn("transition-transform", isSelected ? "translate-x-0.5 text-brand-green" : "text-gray-300")} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-3xs text-text-secondary">
          <div className="flex items-center gap-3">
            <span><b>↑↓</b> Navigasi</span>
            <span><b>Enter</b> Buka</span>
            <span><b>ESC</b> Tutup</span>
          </div>
          <span className="font-semibold text-brand-deep-green">Marka+ ERP Quick Access</span>
        </div>
      </div>
    </div>
  );
}

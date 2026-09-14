"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FinanceNavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface FinanceModuleSidebarProps {
  items: FinanceNavigationItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

const groups = [
  { id: "summary", label: "Ringkasan", items: ["overview", "executive_report", "profit"] },
  { id: "operations", label: "Operasional Proyek", items: ["costing", "fundings", "billing", "ap", "ar"] },
  { id: "accounting", label: "Akuntansi", items: ["cashbank", "gl", "lapkeu", "banking_hub", "period_closing"] },
  { id: "administration", label: "Administrasi", items: ["company_master", "tax", "assets", "audit_trail"] },
] as const;

export function FinanceModuleSidebar({ items, activeId, onSelect }: FinanceModuleSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(groups.map((group) => [group.id, true]))
  );

  const itemMap = new Map(items.map((item) => [item.id, item]));

  const navigation = (mobile = false) => (
    <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-4" aria-label="Navigasi modul Finance">
      {groups.map((group) => {
        const groupItems = group.items.map((id) => itemMap.get(id)).filter(Boolean) as FinanceNavigationItem[];
        if (groupItems.length === 0) return null;
        const isOpen = openGroups[group.id] ?? true;
        const containsActive = groupItems.some((item) => item.id === activeId);

        return (
          <section key={group.id} className="border-b border-[#EFEFEF] pb-2 last:border-0">
            {!collapsed || mobile ? (
              <button
                type="button"
                onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !isOpen }))}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] transition-colors",
                  containsActive ? "text-[#2649B3]" : "text-[#6B7280]",
                  "hover:bg-[#EAF6FF]"
                )}
                aria-expanded={isOpen}
              >
                <span>{group.label}</span>
                <ChevronDown size={13} className={cn("transition-transform", !isOpen && "-rotate-90")} />
              </button>
            ) : null}

            {(collapsed && !mobile || isOpen) && (
              <div className="mt-1 flex flex-col gap-1">
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect(item.id);
                        if (mobile) setMobileOpen(false);
                      }}
                      className={cn(
                        "group relative flex min-h-10 w-full items-center rounded-xl text-left text-xs font-semibold transition-all",
                        collapsed && !mobile ? "justify-center px-2" : "gap-2.5 px-3",
                        active
                          ? "bg-[#EAF6FF] text-[#2649B3] shadow-2xs"
                          : "text-[#4F5050] hover:bg-[#F7FBFF] hover:text-[#2649B3]"
                      )}
                      aria-current={active ? "page" : undefined}
                      title={collapsed && !mobile ? item.label : undefined}
                    >
                      {active && <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-r-full bg-[#2649B3]" />}
                      <Icon size={16} strokeWidth={active ? 2.3 : 1.8} className="shrink-0" />
                      {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </nav>
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded-xl border border-[#D9D9D9] bg-white p-2 md:hidden">
        <div className="flex items-center gap-2 text-xs font-bold text-[#2649B3]">
          <Menu size={16} /> Menu Finance
        </div>
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg bg-[#EAF6FF] px-3 py-1.5 text-xs font-bold text-[#2649B3]">Buka Menu</button>
      </div>

      <aside className={cn("sticky top-3 hidden max-h-[calc(100vh-100px)] shrink-0 flex-col rounded-2xl border border-[#D9D9D9] bg-white py-3 shadow-2xs transition-[width] duration-200 md:flex", collapsed ? "w-[64px]" : "w-[224px]")}>
        <div className={cn("mb-2 flex items-center border-b border-[#EFEFEF] px-3 pb-3", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && <div><div className="text-xs font-extrabold text-[#090909]">Finance</div><div className="text-[9px] text-[#6B7280]">Menu Modul</div></div>}
          <button type="button" onClick={() => setCollapsed((current) => !current)} className="rounded-lg p-1.5 text-[#4F5050] hover:bg-[#EAF6FF] hover:text-[#2649B3]" aria-label={collapsed ? "Perluas sidebar Finance" : "Ciutkan sidebar Finance"} title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}>
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        {navigation()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] flex md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setMobileOpen(false)} aria-label="Tutup menu Finance" />
          <aside className="relative z-10 flex h-full w-[280px] flex-col bg-white py-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-[#EFEFEF] px-4 pb-3">
              <div><div className="text-sm font-extrabold text-[#090909]">Finance</div><div className="text-[10px] text-[#6B7280]">Menu Modul</div></div>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-[#4F5050] hover:bg-[#EAF6FF]" aria-label="Tutup menu Finance"><X size={18} /></button>
            </div>
            {navigation(true)}
          </aside>
        </div>
      )}
    </>
  );
}

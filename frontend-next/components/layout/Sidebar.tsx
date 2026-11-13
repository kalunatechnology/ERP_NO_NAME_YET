/**
 * File: frontend-next/components/layout/Sidebar.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, CheckSquare,
  DollarSign, Users, BarChart3, TrendingUp, Building2,
  LogOut, ChevronRight, Clock, FileText, X, ClipboardList, Boxes
} from "lucide-react";
import { useAuth, getRoleLabel, getRoleBadgeStyle } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { feedApi, UserRecentItemDto } from "@/lib/api/feed.api";
import { cn } from "@/lib/utils";
import { canAccessRoute, canRequestApi } from "@/lib/access/module-contract";
import { getResourceEntity } from "@/lib/access/resource-catalog";
import { canOpenReportTab } from "@/lib/access/report-tab-access";
import { getNavigationEntries } from "@/lib/access/navigation-contract";
import { MarkaWordmark } from "@/components/brand/MarkaWordmark";
import { MarkaPlusName } from "@/components/brand/MarkaPlusName";

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
  onChatbotOpen?: () => void;
}

const NAV_ICONS: Record<string, React.ElementType> = {
  "/dashboard": LayoutDashboard,
  "/administration": Building2,
  "/projects": FolderKanban,
  "/tasks": CheckSquare,
  "/requests": ClipboardList,
  "/crm": Users,
  "/inventory": Boxes,
  "/finance": DollarSign,
  "/reporting": BarChart3,
  "/resources": FileText,
};

export function Sidebar({ isMobile = false, onClose, onChatbotOpen }: SidebarProps = {}) {
  const pathname = usePathname();
  const { user, userRole, company, logout } = useAuth();
  const { t } = useLanguage();
  const [recentItems, setRecentItems] = useState<UserRecentItemDto[]>([]);
  const [recentCompany, setRecentCompany] = useState<string | null>(null);

  const initial = user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const roleLabel = getRoleLabel(userRole);
  const badgeStyle = getRoleBadgeStyle(userRole);
  const navItems = getNavigationEntries({
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
    moduleAccess: user?.module_access,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: userRole === "super_admin",
  }).map((entry) => ({ ...entry, icon: NAV_ICONS[entry.href] ?? FileText }));
  const recentAccess = {
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
    moduleAccess: user?.module_access,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: userRole === "super_admin",
  };
  const visibleRecentItems = (recentCompany === company ? recentItems : []).filter((item) => {
    if (!canAccessRoute({ pathname: item.target_url || "/dashboard", ...recentAccess })) return false;
    if (item.item_type === "RESOURCE") {
      const resource = getResourceEntity(item.object_id);
      return Boolean(resource && canRequestApi(resource.endpoint, recentAccess));
    }
    if (item.item_type === "REPORT" && item.object_id.startsWith("rep-")) {
      return canOpenReportTab(item.object_id.slice(4), userRole, recentAccess);
    }
    return true;
  }).slice(0, 3);

  useEffect(() => {
    let current = true;
    feedApi.getRecentItems().then((items) => {
      if (current) {
        setRecentItems(items ?? []);
        setRecentCompany(company);
      }
    }).catch(() => {});
    return () => { current = false; };
  }, [pathname, company]);

  return (
    <aside
      className={cn(
        "flex flex-col bg-gradient-to-b from-[#163D64] to-[#0868B5] border-r border-slate-200/20 flex-shrink-0 z-40 select-none text-white",
        isMobile ? "w-[280px] h-full shadow-2xl" : "w-[280px] h-screen"
      )}
    >
      {/* ── Fixed User Profile Header (Compact 68px) ── */}
      <div className="h-[68px] px-4 pt-2.5 pb-2 flex flex-col justify-center border-b border-white/20 flex-shrink-0 bg-transparent relative">
        {/* Mobile close button */}
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            aria-label="Tutup menu"
          >
            <X size={16} />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm"
          >
            <span className="text-xs font-black text-[#163D64] leading-none">{initial}</span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-extrabold text-white truncate leading-tight">{displayName}</span>
            <div className="mt-0.5 flex">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none bg-white/20 text-white backdrop-blur-xs"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-white" />
                <span className="truncate">{roleLabel}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable Menu Section ── */}
      <div className="flex-1 px-3 py-3 flex flex-col gap-3 overflow-y-auto no-scrollbar">
        {/* Navigation Section */}
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-extrabold text-white/70 uppercase tracking-wider px-2 mb-1">
            {t("Menu")}
          </p>
          <nav className="flex flex-col gap-1" role="navigation">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs transition-all duration-150 h-10",
                    isActive
                      ? "bg-white text-[#163D64] font-bold shadow-sm"
                      : "text-white/90 hover:bg-white/15 hover:text-white font-semibold"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    size={16}
                    className={cn(
                      "flex-shrink-0 transition-colors",
                      isActive ? "text-[#163D64]" : "text-white/90"
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-xs">{t(label)}</span>
                  {isActive && (
                    <ChevronRight size={13} className="text-[#163D64] opacity-70 flex-shrink-0 ml-auto" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Recently Opened Items */}
        {visibleRecentItems.length > 0 && (
          <div className="flex flex-col gap-1 pt-2 border-t border-white/20">
            <p className="text-[10px] font-extrabold text-white/70 uppercase tracking-wider px-2 flex items-center gap-1.5 mb-0.5">
              <Clock size={10} className="text-white" />
              <span>{t("Recently Opened")}</span>
            </p>
            <div className="flex flex-col gap-1">
              {visibleRecentItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.target_url || "/dashboard"}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white/85 hover:bg-white/15 hover:text-white transition-colors"
                >
                  <FileText size={12} className="text-white/70 flex-shrink-0" />
                  <span className="truncate flex-1">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Footer Section matching Screenshot Design ── */}
      <div className="px-3.5 pb-3.5 pt-2.5 border-t border-white/20 flex flex-col gap-2 flex-shrink-0 bg-transparent">
        {/* Marka+ assistant button */}
        {user?.enabled_modules?.includes('MARBOT') && userRole !== 'super_admin' && <button
          type="button"
          onClick={onChatbotOpen}
          className="flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#172554] hover:bg-[#163D64] text-white font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-98 border border-white/20"
          id="sidebar-marbot-btn"
          title="Chat with Marka Plus"
        >
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white flex-shrink-0 shadow-2xs">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              <line x1="4.93" y1="19.07" x2="19.07" y2="4.93" />
            </svg>
          </div>
          <span className="font-bold tracking-tight">Chat dengan <MarkaPlusName compact /></span>
        </button>}

        {/* Log Out button */}
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs transition-all shadow-2xs w-full cursor-pointer active:scale-98"
          id="sidebar-logout-btn"
          aria-label="Log Out"
        >
          <span className="font-semibold">Log Out</span>
          <LogOut size={13} aria-hidden="true" className="flex-shrink-0 rotate-180" />
        </button>

        {/* Brand ownership */}
        <div className="flex flex-col items-center justify-center pt-0.5">
          <MarkaWordmark className="h-auto w-[82px] text-white" />
          <span className="text-[10px] text-white/80 mt-0.5 font-medium">By Arsalynk® 2026</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

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
  LogOut, ChevronRight, Clock, FileText, X
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
  "/crm": Users,
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
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: userRole === "super_admin",
  }).map((entry) => ({ ...entry, icon: NAV_ICONS[entry.href] ?? FileText }));
  const recentAccess = {
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
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
        "flex flex-col bg-white border-r border-[#EFEFEF] flex-shrink-0 z-40 select-none",
        isMobile ? "w-68 h-full shadow-2xl" : "w-68 h-screen"
      )}
    >
      {/* ── Fixed User Profile Header (Compact 68px) ── */}
      <div className="h-[68px] px-3.5 pt-2.5 pb-2 flex flex-col justify-center border-b border-[#EFEFEF] flex-shrink-0 bg-white relative">
        {/* Mobile close button */}
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-brand-light-green transition-colors"
            aria-label="Tutup menu"
          >
            <X size={16} />
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-2xs"
            style={{ background: "linear-gradient(135deg, #42ACFB 0%, #2649B3 100%)" }}
          >
            <span className="text-[11px] font-extrabold text-white leading-none">{initial}</span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-extrabold text-[#090909] truncate leading-tight">{displayName}</span>
            <div className="mt-0.5 flex">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold leading-none"
                style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
              >
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: badgeStyle.text }} />
                <span className="truncate">{roleLabel}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable Menu Section ── */}
      <div className="flex-1 px-2.5 py-2.5 flex flex-col gap-2.5 overflow-y-auto no-scrollbar">
        {/* Navigation Section */}
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] font-extrabold text-[#4F5050] uppercase tracking-wider px-2 mb-1">
            {t("Menu")}
          </p>
          <nav className="flex flex-col gap-0.5" role="navigation">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 relative h-8",
                    isActive
                      ? "bg-[#EAF6FF] text-[#2649B3] font-bold shadow-2xs border border-[#9FD6FF]"
                      : "text-[#4F5050] hover:bg-[#EAF6FF]/50 hover:text-[#2649B3]"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3.5 bg-[#2649B3] rounded-r-full" />
                  )}
                  <Icon
                    size={14}
                    className={cn(
                      "flex-shrink-0 transition-colors",
                      isActive ? "text-[#2649B3]" : "text-[#4F5050]"
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-xs">{t(label)}</span>
                  {isActive && (
                    <ChevronRight size={11} className="text-[#2649B3] opacity-60 flex-shrink-0 ml-auto" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Recently Opened Items */}
        {visibleRecentItems.length > 0 && (
          <div className="flex flex-col gap-1 pt-2 border-t border-[#EFEFEF]">
            <p className="text-[10px] font-extrabold text-[#4F5050] uppercase tracking-wider px-2 flex items-center gap-1.5 mb-0.5">
              <Clock size={10} className="text-[#294BB2]" />
              <span>{t("Recently Opened")}</span>
            </p>
            <div className="flex flex-col gap-0.5">
              {visibleRecentItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.target_url || "/dashboard"}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium text-[#4F5050] hover:bg-[#EAF6FF]/40 hover:text-[#090909] transition-colors h-6"
                >
                  <FileText size={11} className="text-[#4F5050] flex-shrink-0" />
                  <span className="truncate flex-1">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Footer Section matching Screenshot Design ── */}
      <div className="px-3 pb-3 pt-2 border-t border-[#EFEFEF] flex flex-col gap-2.5 flex-shrink-0 bg-white">
        {/* Chat with MarBot button */}
        {user?.enabled_modules?.includes('MARBOT') && userRole !== 'super_admin' && <button
          type="button"
          onClick={onChatbotOpen}
          className="flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#EAF6FF] hover:bg-[#EAF6FF] border border-[#9FD6FF] text-[#2649B3] font-semibold text-xs transition-all shadow-2xs cursor-pointer active:scale-98"
          id="sidebar-marbot-btn"
          title="Chat with MarBot"
        >
          <div className="w-5 h-5 rounded-full bg-[#294BB2] flex items-center justify-center text-white flex-shrink-0 shadow-2xs">
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
          <span className="font-bold tracking-tight">Chat with MarBot</span>
        </button>}

        {/* Log Out button */}
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#2649B3] hover:bg-[#2649B3] text-white font-semibold text-xs transition-all shadow-2xs w-full cursor-pointer active:scale-98"
          id="sidebar-logout-btn"
          aria-label="Log Out"
        >
          <span className="font-bold">Log Out</span>
          <LogOut size={13} aria-hidden="true" className="flex-shrink-0 rotate-180" />
        </button>

        {/* Brand wordmark by Kaluna® 2026 */}
        <div className="flex flex-col items-center justify-center pt-1">
          <MarkaWordmark className="h-auto w-[86px] text-[#2649B3]" />
          <span className="text-[10px] text-[#4F5050] mt-0.5 font-medium">By Kaluna® 2026</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

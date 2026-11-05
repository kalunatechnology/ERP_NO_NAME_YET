/**
 * File: frontend-next/components/layout/Sidebar.tsx
 *
 * Purpose: Marka Logistik official Sidebar navigation component.
 * Theme: Dark Slate (bg-slate-800) identical to Marka Logistik design system.
 * Features: Expandable/Collapsible (w-60 vs w-[72px]), RBAC modules, Marbot assistant, recent items, user badge.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard, FolderKanban, CheckSquare,
  DollarSign, Users, BarChart3, Building2,
  LogOut, ChevronRight, Clock, FileText, X, ClipboardList, Boxes, MessageSquare
} from "lucide-react";
import { useAuth, getRoleLabel, getRoleBadgeStyle } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { feedApi, UserRecentItemDto } from "@/lib/api/feed.api";
import { cn } from "@/lib/utils";
import { canAccessRoute, canRequestApi } from "@/lib/access/module-contract";
import { getResourceEntity } from "@/lib/access/resource-catalog";
import { canOpenReportTab } from "@/lib/access/report-tab-access";
import { getNavigationEntries } from "@/lib/access/navigation-contract";

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
  onChatbotOpen?: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
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

/* Official Marka Hamburger Icons */
function HamburgerHalf({ className }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M11.2 16H27.2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 8H27" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16.8 24H27.2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function HamburgerFull({ className }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M5 16L27 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 8H27" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 24L27 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function Sidebar({
  isMobile = false,
  onClose,
  onChatbotOpen,
  expanded: parentExpanded,
  onToggleExpand
}: SidebarProps = {}) {
  const pathname = usePathname();
  const { user, userRole, company, logout } = useAuth();
  const { t } = useLanguage();
  const [recentItems, setRecentItems] = useState<UserRecentItemDto[]>([]);
  const [recentCompany, setRecentCompany] = useState<string | null>(null);

  // Local sidebar expand state when parent does not supply one
  const [localExpanded, setLocalExpanded] = useState<boolean>(true);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-expanded");
    if (stored !== null) {
      setLocalExpanded(stored === "true");
    }
  }, []);

  const isExpanded = isMobile ? true : (parentExpanded !== undefined ? parentExpanded : localExpanded);

  const toggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      const next = !localExpanded;
      setLocalExpanded(next);
      localStorage.setItem("sidebar-expanded", String(next));
      if (typeof document !== "undefined") {
        if (next) {
          document.body.classList.add("sidebar-expanded");
        } else {
          document.body.classList.remove("sidebar-expanded");
        }
      }
    }
  };

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
        "flex flex-col bg-slate-800 text-slate-200 border-r border-slate-700/60 select-none z-40 transition-all duration-200 ease-in-out shrink-0",
        isMobile
          ? "w-64 h-full shadow-2xl"
          : isExpanded
          ? "w-60 h-screen"
          : "w-[72px] h-screen"
      )}
    >
      {/* ── Header: Marka Brand & Toggle ────────────────────────────────────── */}
      <div className={cn(
        "h-16 px-4 flex items-center border-b border-slate-700/70 shrink-0",
        isExpanded ? "justify-between" : "justify-center"
      )}>
        {/* Brand Logo & Name */}
        <Link
          href="/dashboard"
          className={cn("flex items-center gap-2.5 group overflow-hidden", !isExpanded && !isMobile && "hidden")}
        >
          <div className="w-8 h-8 rounded-lg bg-[#4F8CF6] flex items-center justify-center p-1.5 shadow-xs shrink-0 transition-transform group-hover:scale-105">
            <img
              src="/brand/marka-logomark-white.svg"
              alt="Marka Logistik"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold tracking-wider text-white leading-tight uppercase font-inter">
              MARKA
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-tight truncate">
              Logistik & ERP
            </span>
          </div>
        </Link>

        {/* Collapsed Brand Icon */}
        {!isExpanded && !isMobile && (
          <Link
            href="/dashboard"
            className="w-8 h-8 rounded-lg bg-[#4F8CF6] flex items-center justify-center p-1.5 shadow-xs shrink-0 hover:scale-105 transition-transform"
            title="Marka Logistik"
          >
            <img
              src="/brand/marka-logomark-white.svg"
              alt="Marka"
              className="w-full h-full object-contain"
            />
          </Link>
        )}

        {/* Expand/Collapse Toggle Button for Desktop */}
        {!isMobile && (
          <button
            type="button"
            onClick={toggleExpand}
            className={cn(
              "p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors cursor-pointer",
              !isExpanded && "mt-2 hidden" // when collapsed, clicking logo or hover expands or top bar toggles
            )}
            title={isExpanded ? "Perkecil menu" : "Perbesar menu"}
            aria-label="Toggle sidebar"
          >
            {isExpanded ? (
              <HamburgerHalf className="w-5 h-5" />
            ) : (
              <HamburgerFull className="w-5 h-5" />
            )}
          </button>
        )}

        {/* Mobile close button */}
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── Scrollable Menu Section ─────────────────────────────────────── */}
      <div className="flex-1 px-3 py-4 flex flex-col gap-4 overflow-y-auto no-scrollbar">
        {/* Navigation Category Label */}
        {isExpanded && (
          <div className="px-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-inter">
              {t("Menu")}
            </p>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1.5" role="navigation">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group relative flex items-center rounded-lg transition-all duration-150 ease-out",
                  isExpanded ? "px-3 py-2.5 gap-3" : "p-2.5 justify-center",
                  isActive
                    ? "bg-slate-900 text-white font-semibold shadow-xs"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/60"
                )}
                title={!isExpanded ? t(label) : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#4F8CF6] rounded-r" />
                )}

                <Icon
                  size={18}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-[#4F8CF6]" : "text-slate-400 group-hover:text-slate-200"
                  )}
                  aria-hidden="true"
                />

                {isExpanded && (
                  <>
                    <span className="truncate text-xs font-medium font-inter flex-1">
                      {t(label)}
                    </span>
                    {isActive && (
                      <ChevronRight size={14} className="text-[#4F8CF6] opacity-70 shrink-0" />
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Recently Opened Items (Visible when expanded) */}
        {isExpanded && visibleRecentItems.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-3 border-t border-slate-700/60">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 flex items-center gap-1.5">
              <Clock size={11} className="text-[#4F8CF6]" />
              <span>{t("Recently Opened")}</span>
            </p>
            <div className="flex flex-col gap-1">
              {visibleRecentItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.target_url || "/dashboard"}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors truncate"
                >
                  <FileText size={12} className="text-slate-400 shrink-0" />
                  <span className="truncate flex-1">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer / User & Brand Section ───────────────────────────────── */}
      <div className="p-3 border-t border-slate-700/70 flex flex-col gap-2 shrink-0 bg-slate-800/90">
        {/* Marbot Assistant Shortcut */}
        {user?.enabled_modules?.includes("MARBOT") && userRole !== "super_admin" && (
          <button
            type="button"
            onClick={onChatbotOpen}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-700/70 hover:bg-slate-700 border border-slate-600/60 text-slate-200 font-medium text-xs transition-all shadow-xs cursor-pointer active:scale-98",
              !isExpanded && "justify-center px-2"
            )}
            title="Chat dengan Marbot"
          >
            <div className="w-5 h-5 rounded-full bg-[#4F8CF6] flex items-center justify-center text-white shrink-0 shadow-2xs">
              <MessageSquare size={12} />
            </div>
            {isExpanded && (
              <span className="font-semibold truncate text-[11px]">Chat dengan Marbot</span>
            )}
          </button>
        )}

        {/* User Card when expanded */}
        {isExpanded ? (
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-700/40">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-xs font-bold text-xs text-white"
              style={{ background: "linear-gradient(135deg, #72A3F8 0%, #3F70C5 100%)" }}
            >
              {initial}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-white truncate leading-tight">
                {displayName}
              </span>
              <div className="mt-0.5 flex">
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold leading-none"
                  style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
                >
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: badgeStyle.text }} />
                  <span className="truncate">{roleLabel}</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
              title="Log Out"
              aria-label="Log Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition-colors"
            title={`Keluar (${displayName})`}
          >
            <LogOut size={16} />
          </button>
        )}

        {/* Brand identity badge at bottom */}
        {isExpanded && (
          <div className="flex items-center justify-between px-1 pt-1 opacity-70">
            <span className="text-[10px] text-slate-400 font-medium">Marka Logistik</span>
            <span className="text-[9px] text-slate-500 font-mono">v1.0</span>
          </div>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;

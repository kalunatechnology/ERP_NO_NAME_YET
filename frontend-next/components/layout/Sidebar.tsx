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
import { useAuth, UserRoleType, getRoleLabel, getRoleBadgeStyle } from "@/contexts/AuthContext";
import { feedApi, UserRecentItemDto } from "@/lib/api/feed.api";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
  onChatbotOpen?: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

/* ── Role-specific nav configs (Strict Role-Based Page Flow) ─── */
const NAV_BY_ROLE: Record<UserRoleType, NavItem[]> = {
  super_admin: [
    { href: "/dashboard", label: "Governance Dashboard", icon: LayoutDashboard },
    { href: "/resources", label: "Company & Access", icon: Building2 },
    { href: "/reporting", label: "Global Reports", icon: BarChart3 },
  ],
  company_admin: [
    { href: "/dashboard", label: "Company Dashboard", icon: LayoutDashboard },
    { href: "/resources", label: "User & Access", icon: Building2 },
    { href: "/reporting", label: "Reports", icon: BarChart3 },
  ],
  // 1. Executive (Direksi)
  executive: [
    { href: "/dashboard",  label: "Executive Dashboard", icon: LayoutDashboard },
    { href: "/projects",   label: "All Project",         icon: FolderKanban    },
    { href: "/finance",    label: "Finance Preview",    icon: DollarSign      },
    { href: "/crm",        label: "CRM Preview",        icon: Building2       },
    { href: "/reporting",  label: "Performance",         icon: TrendingUp      },
    { href: "/resources",  label: "Data Explorer",       icon: BarChart3       },
  ],
  // 2. Project Manager (PM)
  pm: [
    { href: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard },
    { href: "/projects",   label: "Projects",    icon: FolderKanban    },
    { href: "/tasks",      label: "Daily Tasks", icon: CheckSquare     },
    { href: "/crm",        label: "CRM",         icon: Users           },
    { href: "/reporting",  label: "Reports",     icon: BarChart3       },
  ],
  // 3. Operational Manager (OM) - Focused on Technical & Ops, No CRM
  om: [
    { href: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard },
    { href: "/projects",   label: "Projects",    icon: FolderKanban    },
    { href: "/tasks",      label: "Daily Tasks", icon: CheckSquare     },
    { href: "/reporting",  label: "Reports",     icon: BarChart3       },
  ],
  // 4. Staff - Lean execution flow
  staff: [
    { href: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard },
    { href: "/projects",   label: "Project Overview", icon: FolderKanban },
    { href: "/tasks",      label: "Daily Tasks", icon: CheckSquare     },
    { href: "/reporting",  label: "Report",      icon: FileText        },
  ],
  // 5. Finance Controller
  finance: [
    { href: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard },
    { href: "/finance",    label: "Finance",     icon: DollarSign      },
    { href: "/reporting",  label: "Reports",     icon: BarChart3       },
  ],
  // 6. CRM & Sales Lead
  crm: [
    { href: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard },
    { href: "/crm",        label: "CRM & Sales", icon: Building2       },
    { href: "/reporting",  label: "Reports",     icon: BarChart3       },
  ],
};

export function Sidebar({ isMobile = false, onClose, onChatbotOpen }: SidebarProps = {}) {
  const pathname = usePathname();
  const { user, userRole, logout } = useAuth();
  const [recentItems, setRecentItems] = useState<UserRecentItemDto[]>([]);

  const initial = user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const roleLabel = getRoleLabel(userRole);
  const badgeStyle = getRoleBadgeStyle(userRole);
  const enabledModules = new Set((user?.enabled_modules ?? []).map((module) => module.toUpperCase()));
  const moduleByPath: Record<string, string> = {
    "/projects": "PROJECTS",
    "/tasks": "PROJECTS",
    "/crm": "CRM",
    "/finance": "FINANCE",
    "/resources": userRole === "executive" ? "ANALYTICS" : "",
  };
  const navItems = (NAV_BY_ROLE[userRole] ?? NAV_BY_ROLE.staff).filter((item) => {
    const moduleCode = moduleByPath[item.href];
    return !moduleCode || userRole === "super_admin" || enabledModules.has(moduleCode);
  });

  useEffect(() => {
    feedApi.getRecentItems().then((items) => {
      if (items && items.length) setRecentItems(items.slice(0, 3));
    }).catch(() => {});
  }, [pathname]);

  return (
    <aside
      className={cn(
        "flex flex-col bg-white border-r border-[#E5E9E2] flex-shrink-0 z-40 select-none",
        isMobile ? "w-68 h-full shadow-2xl" : "w-68 h-screen"
      )}
    >
      {/* ── Fixed User Profile Header (Compact 68px) ── */}
      <div className="h-[68px] px-3.5 pt-2.5 pb-2 flex flex-col justify-center border-b border-[#E5E9E2] flex-shrink-0 bg-white relative">
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
            style={{ background: "linear-gradient(135deg, #7CDA24 0%, #3E9B4B 100%)" }}
          >
            <span className="text-[11px] font-extrabold text-white leading-none">{initial}</span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-extrabold text-[#0E341F] truncate leading-tight">{displayName}</span>
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
          <p className="text-[10px] font-extrabold text-[#768779] uppercase tracking-wider px-2 mb-1">
            Menu
          </p>
          <nav className="flex flex-col gap-0.5" role="navigation">
            {navItems.map(({ href, label, icon: Icon, badge }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 relative h-8",
                    isActive
                      ? "bg-[#F0FEE0] text-[#275433] font-bold shadow-2xs border border-[#D5ECC2]"
                      : "text-[#4A5D4E] hover:bg-[#F0FEE0]/50 hover:text-[#275433]"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3.5 bg-[#275433] rounded-r-full" />
                  )}
                  <Icon
                    size={14}
                    className={cn(
                      "flex-shrink-0 transition-colors",
                      isActive ? "text-[#275433]" : "text-[#768779]"
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-xs">{label}</span>
                  {badge && (
                    <span className="ml-auto px-1.5 py-0.2 rounded-full bg-[#275433] text-white text-[9px] font-bold leading-none">
                      {badge}
                    </span>
                  )}
                  {isActive && (
                    <ChevronRight size={11} className="text-[#275433] opacity-60 flex-shrink-0 ml-auto" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Recently Opened Items */}
        {recentItems.length > 0 && (
          <div className="flex flex-col gap-1 pt-2 border-t border-[#EEF2E8]">
            <p className="text-[10px] font-extrabold text-[#768779] uppercase tracking-wider px-2 flex items-center gap-1.5 mb-0.5">
              <Clock size={10} className="text-[#5A861F]" />
              <span>Recently Opened</span>
            </p>
            <div className="flex flex-col gap-0.5">
              {recentItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.target_url || "/dashboard"}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium text-[#4A5D4E] hover:bg-[#F0FEE0]/40 hover:text-[#0E341F] transition-colors h-6"
                >
                  <FileText size={11} className="text-[#768779] flex-shrink-0" />
                  <span className="truncate flex-1">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Footer Section matching Screenshot Design ── */}
      <div className="px-3 pb-3 pt-2 border-t border-[#E5E9E2] flex flex-col gap-2.5 flex-shrink-0 bg-white">
        {/* Chat with MarBot button */}
        <button
          type="button"
          onClick={onChatbotOpen}
          className="flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#EDFBD8] hover:bg-[#E2F7C3] border border-[#D7F2AB] text-[#244E1C] font-semibold text-xs transition-all shadow-2xs cursor-pointer active:scale-98"
          id="sidebar-marbot-btn"
          title="Chat with MarBot"
        >
          <div className="w-5 h-5 rounded-full bg-[#587C29] flex items-center justify-center text-white flex-shrink-0 shadow-2xs">
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
        </button>

        {/* Log Out button */}
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#597F22] hover:bg-[#4D6F1D] text-white font-semibold text-xs transition-all shadow-2xs w-full cursor-pointer active:scale-98"
          id="sidebar-logout-btn"
          aria-label="Log Out"
        >
          <span className="font-bold">Log Out</span>
          <LogOut size={13} aria-hidden="true" className="flex-shrink-0 rotate-180" />
        </button>

        {/* Brand Mark: Marka+ by Kaluna® 2026 */}
        <div className="flex flex-col items-center justify-center pt-1">
          <div className="flex items-center gap-1.5 text-black">
            <div className="w-5 h-5 rounded-md bg-[#0088FF] flex items-center justify-center text-white font-black text-xs shadow-2xs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </div>
            <span className="font-extrabold text-sm tracking-tight text-[#0F172A]">Marka+</span>
          </div>
          <span className="text-[10px] text-[#8C9B90] mt-0.5 font-medium">By Kaluna® 2026</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

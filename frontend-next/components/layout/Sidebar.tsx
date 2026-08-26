"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, CheckSquare,
  DollarSign, Users, BarChart3, TrendingUp, Building2,
  LogOut, ChevronRight, Clock, FileText
} from "lucide-react";
import { useAuth, UserRoleType, getRoleLabel, getRoleBadgeStyle } from "@/contexts/AuthContext";
import { feedApi, UserRecentItemDto } from "@/lib/api/feed.api";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

/* ── Role-specific nav configs ─────────────────────── */
const NAV_BY_ROLE: Record<UserRoleType, NavItem[]> = {
  executive: [
    { href: "/dashboard",  label: "Executive Overview", icon: LayoutDashboard },
    { href: "/projects",   label: "All Projects",       icon: FolderKanban    },
    { href: "/finance",    label: "Finance",            icon: DollarSign      },
    { href: "/crm",        label: "CRM & Sales",        icon: Building2       },
    { href: "/reporting",  label: "Performance",        icon: TrendingUp      },
    { href: "/resources",  label: "Data Explorer",      icon: BarChart3       },
  ],
  pm: [
    { href: "/dashboard",  label: "Dashboard",          icon: LayoutDashboard },
    { href: "/projects",   label: "Projects",           icon: FolderKanban    },
    { href: "/tasks",      label: "Daily Tasks",        icon: CheckSquare     },
    { href: "/crm",        label: "CRM",                icon: Users           },
    { href: "/reporting",  label: "Reports",            icon: BarChart3       },
  ],
  finance: [
    { href: "/dashboard",  label: "Dashboard",          icon: LayoutDashboard },
    { href: "/finance",    label: "Finance",            icon: DollarSign      },
    { href: "/projects",   label: "Projects",           icon: FolderKanban    },
    { href: "/reporting",  label: "Reports",            icon: BarChart3       },
  ],
  crm: [
    { href: "/dashboard",  label: "Dashboard",          icon: LayoutDashboard },
    { href: "/crm",        label: "CRM & Sales",        icon: Building2       },
    { href: "/projects",   label: "Projects",           icon: FolderKanban    },
    { href: "/reporting",  label: "Reports",            icon: BarChart3       },
  ],
  staff: [
    { href: "/dashboard",  label: "Dashboard",          icon: LayoutDashboard },
    { href: "/projects",   label: "Projects",           icon: FolderKanban    },
    { href: "/tasks",      label: "Tasks",              icon: CheckSquare     },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, userRole, logout } = useAuth();
  const [recentItems, setRecentItems] = useState<UserRecentItemDto[]>([]);

  const initial = user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const roleLabel = getRoleLabel(userRole);
  const badgeStyle = getRoleBadgeStyle(userRole);
  const navItems = NAV_BY_ROLE[userRole] ?? NAV_BY_ROLE.staff;

  useEffect(() => {
    feedApi.getRecentItems().then((items) => {
      if (items && items.length) setRecentItems(items.slice(0, 3));
    }).catch(() => {});
  }, [pathname]);

  return (
    <aside
      className="w-[230px] h-screen sticky top-0 flex flex-col bg-bg-light border-r border-[#E5E9E2] flex-shrink-0 select-none overflow-hidden"
      style={{ boxSizing: "border-box" }}
      aria-label="Navigasi utama"
    >
      {/* ── Fixed User Profile Header (Compact 68px) ── */}
      <div className="h-[68px] px-3.5 pt-2.5 pb-2 flex flex-col justify-center border-b border-[#E5E9E2] flex-shrink-0 bg-white">
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

      {/* ── Fixed Footer Section ── */}
      <div className="px-2.5 pb-2.5 pt-2 border-t border-[#E5E9E2] flex flex-col gap-1.5 flex-shrink-0 bg-white">
        <button
          onClick={() => logout()}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#768779] hover:text-red-600 hover:bg-red-50 transition-all w-full h-7"
          id="sidebar-logout-btn"
          aria-label="Logout"
        >
          <LogOut size={13} aria-hidden="true" className="flex-shrink-0" />
          <span>Keluar</span>
        </button>

        {/* Brand Mark */}
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-[#E5E9E2] bg-[#FDFDFD]">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 shadow-2xs"
            style={{ background: "linear-gradient(180deg, #7CDA24 0%, #3E9B4B 100%)" }}
            aria-hidden="true"
          >
            <span className="text-white font-black text-[9px]">M+</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-extrabold text-[#275433] leading-tight">Marka+ ERP</span>
            <span className="text-[8px] text-[#768779] leading-tight">v1.0 · Pro</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

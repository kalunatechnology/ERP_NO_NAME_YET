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
      className="w-[240px] h-screen sticky top-0 flex flex-col bg-bg-light border-r border-text-tertiary flex-shrink-0 select-none overflow-hidden"
      style={{ boxSizing: "border-box" }}
      aria-label="Navigasi utama"
    >
      {/* ── Fixed User Profile Header (Height: 76px) ── */}
      <div className="h-[76px] px-4 pt-3.5 pb-2.5 flex flex-col justify-center border-b border-text-tertiary/60 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-2xs"
            style={{ background: "linear-gradient(135deg, #7CDA24 0%, #3E9B4B 100%)" }}
          >
            <span className="text-xs font-bold text-white leading-none">{initial}</span>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold text-brand-deep-green truncate leading-tight">{displayName}</span>
            <div className="mt-1 flex">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-semibold leading-none"
                style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
              >
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: badgeStyle.text }} />
                <span className="truncate">{roleLabel}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable Menu Section (Takes all available middle space) ── */}
      <div className="flex-1 px-3 py-3 flex flex-col gap-3 overflow-y-auto">
        {/* Navigation Section */}
        <div className="flex flex-col gap-0.5">
          <p className="text-3xs font-bold text-text-secondary uppercase tracking-wider px-2 mb-1">Menu</p>
          <nav className="flex flex-col gap-0.5" role="navigation">
            {navItems.map(({ href, label, icon: Icon, badge }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 relative h-9",
                    isActive
                      ? "bg-brand-light-green text-brand-deep-green font-bold shadow-2xs"
                      : "text-text-primary hover:bg-brand-light-green/50 hover:text-brand-deep-green"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-brand-green rounded-r-full" />
                  )}
                  <Icon
                    size={16}
                    className={cn(
                      "flex-shrink-0 transition-colors",
                      isActive ? "text-brand-green" : "text-text-secondary"
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {badge && (
                    <span className="ml-auto px-1.5 py-0.5 rounded-full bg-brand-green text-white text-3xs font-bold leading-none">
                      {badge}
                    </span>
                  )}
                  {isActive && (
                    <ChevronRight size={12} className="text-brand-green opacity-60 flex-shrink-0 ml-auto" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Recently Opened Items */}
        {recentItems.length > 0 && (
          <div className="flex flex-col gap-1 pt-2 border-t border-text-tertiary/40">
            <p className="text-3xs font-bold text-text-secondary uppercase tracking-wider px-2 flex items-center gap-1.5 mb-0.5">
              <Clock size={10} className="text-brand-green" />
              <span>Recently Opened</span>
            </p>
            <div className="flex flex-col gap-0.5">
              {recentItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.target_url || "/dashboard"}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-3xs font-medium text-text-primary hover:bg-brand-light-green/40 hover:text-brand-deep-green transition-colors h-7"
                >
                  <FileText size={12} className="text-text-secondary flex-shrink-0" />
                  <span className="truncate flex-1">{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Footer Section (Logout & Brand Mark) ── */}
      <div className="px-3 pb-3 pt-2 border-t border-text-tertiary/60 flex flex-col gap-2 flex-shrink-0 bg-bg-light">
        <button
          onClick={() => logout()}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-red-600 hover:bg-red-50 transition-all w-full h-8"
          id="sidebar-logout-btn"
          aria-label="Logout"
        >
          <LogOut size={15} aria-hidden="true" className="flex-shrink-0" />
          <span>Keluar</span>
        </button>

        {/* Brand Mark */}
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border border-text-tertiary bg-bg-lighter">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 shadow-2xs"
            style={{ background: "linear-gradient(180deg, #7CDA24 0%, #3E9B4B 100%)" }}
            aria-hidden="true"
          >
            <span className="text-white font-black text-2xs">M+</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-2xs font-bold text-brand-deep-green leading-tight">Marka+ ERP</span>
            <span className="text-3xs text-text-secondary leading-tight">v1.0 · Stable</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, CheckSquare, ListTodo,
  DollarSign, Users, BarChart3, Zap, TrendingUp, Building2,
  LogOut, ChevronRight,
} from "lucide-react";
import { useAuth, UserRoleType, getRoleLabel, getRoleBadgeStyle } from "@/contexts/AuthContext";
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

  const initial = user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const roleLabel = getRoleLabel(userRole);
  const badgeStyle = getRoleBadgeStyle(userRole);
  const navItems = NAV_BY_ROLE[userRole] ?? NAV_BY_ROLE.staff;

  return (
    <aside
      className="flex flex-col justify-between bg-bg-light border-r border-text-tertiary flex-shrink-0"
      style={{ width: "var(--sidebar-w, 240px)", minHeight: "100vh", padding: "20px 12px" }}
      aria-label="Navigasi utama"
    >
      {/* ── Top section ──────────────────────── */}
      <div className="flex flex-col gap-5">

        {/* User Profile */}
        <div className="flex flex-col gap-2 px-2" id="sidebar-user">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ background: "linear-gradient(135deg, #7CDA24 0%, #3E9B4B 100%)" }}
            >
              <span className="text-sm font-bold text-white">{initial}</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-brand-deep-green truncate leading-tight">{displayName}</span>
              <span className="text-2xs text-text-secondary truncate leading-tight">
                {user?.email?.split("@")[0] || ""}
              </span>
            </div>
          </div>
          {/* Role badge */}
          <div className="flex">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold"
              style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: badgeStyle.text }} />
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-text-tertiary" />

        {/* Navigation */}
        <div className="flex flex-col gap-1">
          <p className="text-2xs font-semibold text-text-secondary uppercase tracking-wider px-2 mb-1">Menu</p>
          <nav className="flex flex-col gap-0.5" role="navigation">
            {navItems.map(({ href, label, icon: Icon, badge }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group relative",
                    isActive
                      ? "bg-brand-light-green text-brand-deep-green"
                      : "text-text-primary hover:bg-brand-light-green/50 hover:text-brand-deep-green"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-green rounded-r-full" />
                  )}
                  <Icon
                    size={18}
                    className={cn(
                      "flex-shrink-0 transition-colors",
                      isActive ? "text-brand-green" : "text-text-secondary group-hover:text-brand-green"
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {badge && (
                    <span className="ml-auto px-1.5 py-0.5 rounded-full bg-brand-green text-white text-2xs font-bold leading-none">
                      {badge}
                    </span>
                  )}
                  {isActive && (
                    <ChevronRight size={12} className="text-brand-green opacity-60 flex-shrink-0" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── Bottom section ────────────────────── */}
      <div className="flex flex-col gap-3 px-1">
        <button
          onClick={() => logout()}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-red-600 hover:bg-red-50 transition-all w-full"
          id="sidebar-logout-btn"
          aria-label="Logout"
        >
          <LogOut size={17} aria-hidden="true" className="flex-shrink-0" />
          <span>Keluar</span>
        </button>

        {/* Brand mark */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg border border-text-tertiary bg-bg-lighter">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(180deg, #7CDA24 0%, #3E9B4B 100%)" }}
            aria-hidden="true"
          >
            <span className="text-white font-bold text-xs">M+</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-brand-deep-green leading-tight">Marka+ ERP</span>
            <span className="text-2xs text-text-secondary leading-tight">v1.0 · Production</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * File: frontend-next/components/layout/Topbar.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Bell, CalendarCheck, Menu, ChevronDown, ChevronRight, Check, Building2, LogOut, ShieldCheck, Lock, Globe2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { canAccessRoute } from "@/lib/access/module-contract";
import toast from "react-hot-toast";

interface TopbarProps {
  onMenuToggle?: () => void;
  onNotificationClick?: () => void;
  onAiChatToggle?: () => void;
}

/* ── Breadcrumb builder ─────────────────────────── */
function buildBreadcrumb(pathname: string): { label: string; href: string }[] {
  const LABELS: Record<string, string> = {
    dashboard:  "Dashboard",
    projects:   "Projects",
    tasks:      "Tasks",
    finance:    "Finance",
    crm:        "CRM & Sales",
    resources:  "Data Explorer",
    administration: "Company & Access",
    reporting:  "Reporting",
    settings:   "Settings",
  };
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((part, i) => ({
    label: LABELS[part] || part.charAt(0).toUpperCase() + part.slice(1),
    href: "/" + parts.slice(0, i + 1).join("/"),
  }));
}

import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { UserProfileSettingsModal } from "@/components/ui/UserProfileSettingsModal";
import { User, KeyRound, Sparkles } from "lucide-react";

export function Topbar({ onMenuToggle, onNotificationClick, onAiChatToggle }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userRole, logout, company, setCompany, companies, setActiveRole } = useAuth();
  const { language, setLanguage } = useLanguage();
  const crumbs = buildBreadcrumb(pathname);
  const canOpenReporting = canAccessRoute({
    pathname: "/reporting",
    enabledModules: user?.enabled_modules,
    delegatedModules: user?.delegated_modules,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: userRole === "super_admin",
  });

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [switchingRole, setSwitchingRole] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);

  // Shortcut Ctrl+K / Cmd+K to open Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCommandPaletteOpen(true);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (compRef.current && !compRef.current.contains(e.target as Node)) {
        setIsCompanyDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initial = user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const roleName = user?.roles?.find((role) => role.role_code === user.active_role_code)?.role_name || user?.roles?.[0]?.role_name || "Team Member";

  return (
    <header
      className="flex items-center justify-between bg-white border-b border-[#EFEFEF] flex-shrink-0 px-4 sm:px-6 gap-3 sm:gap-4 z-30 relative"
      style={{ height: "var(--topbar-h, 68px)" }}
    >
      {/* Left: Hamburger (mobile) + Clean Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Hamburger: always visible, activates mobile sidebar below lg */}
        <button
          onClick={onMenuToggle}
          className="flex-shrink-0 p-1.5 rounded-lg text-[#4F5050] hover:text-[#2649B3] hover:bg-[#EAF6FF] transition-colors lg:hidden cursor-pointer"
          id="topbar-menu-btn"
          aria-label="Buka menu"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {crumbs.length === 0 ? (
              <li className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs sm:text-sm font-semibold text-[#090909]">Dashboard</span>
              </li>
            ) : (
              crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <li key={crumb.href} className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    {i > 0 && (
                      <ChevronRight size={13} className="text-[#9FD6FF] flex-shrink-0" aria-hidden="true" />
                    )}
                    {isLast ? (
                      <span
                        className="text-xs sm:text-sm font-semibold text-[#090909] truncate"
                        aria-current="page"
                      >
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        href={crumb.href}
                        className="text-xs sm:text-sm text-[#4F5050] hover:text-[#2649B3] transition-colors truncate"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </li>
                );
              })
            )}
          </ol>
        </nav>
      </div>

      {/* Right: Company Context + Language + Search + Attendance + Notification + User Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">

        {/* Company Selector Box */}
        {(() => {
          const activeCompanyName =
            companies.find((c) => String(c.id) === String(company))?.name || (userRole === "super_admin" ? "Global" : "Company tidak tersedia");

          if (["staff", "om"].includes(userRole)) return null;

          return userRole === "super_admin" ? (
            /* Only Super Admin can select a company context for global read/governance. */
            <div className="relative hidden md:block" ref={compRef}>
              <button
                onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-2 h-9 px-3 rounded-full bg-white border border-[#EFEFEF] hover:border-[#9FD6FF] hover:bg-[#FDFDFD] text-xs shadow-2xs transition-all cursor-pointer"
                title={`Company context: ${activeCompanyName}`}
              >
                <Building2 size={13} className="text-[#2649B3] flex-shrink-0" />
                <span className="text-[#4F5050] font-medium hidden lg:inline">Company:</span>
                <strong className="text-[#2649B3] font-semibold truncate max-w-[110px] md:max-w-[140px] xl:max-w-[190px]">{activeCompanyName}</strong>
                <span className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF6FF] text-[#2649B3]">Admin Pick</span>
                <ChevronDown size={12} className="text-[#4F5050] flex-shrink-0" />
              </button>

              {isCompanyDropdownOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl border border-[#EFEFEF] shadow-card-lg p-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-2xs font-bold text-[#4F5050] uppercase tracking-wider">Pilih Context Company</div>
                  <div className="flex flex-col gap-1 mt-1">
                    <button
                      onClick={() => {
                        setCompany(null);
                        setIsCompanyDropdownOpen(false);
                        toast.success("Context Global aktif.");
                      }}
                      className={cn(
                        "w-full text-left p-2 rounded-xl text-xs flex items-center justify-between hover:bg-[#EAF6FF]/50 transition-colors",
                        !company && "bg-[#EAF6FF] font-bold text-[#2649B3]"
                      )}
                    >
                      <span>Global · Semua company</span>
                      {!company && <Check size={13} className="text-[#2649B3]" />}
                    </button>
                    {companies.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCompany(String(c.id));
                          setIsCompanyDropdownOpen(false);
                          toast.success(`Company aktif: ${c.name}`);
                        }}
                        className={cn(
                          "w-full text-left p-2 rounded-xl text-xs flex items-center justify-between hover:bg-[#EAF6FF]/50 transition-colors",
                          company === String(c.id) && "bg-[#EAF6FF] font-bold text-[#2649B3]"
                        )}
                      >
                        <span className="truncate">{c.name}</span>
                        {company === String(c.id) && <Check size={13} className="text-[#2649B3]" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Non-admin dynamically bound to their company */
            <div className="hidden md:flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#EAF6FF]/60 border border-[#9FD6FF]/40 text-xs" title={`Akun Anda terikat resmi ke ${activeCompanyName}`}>
              <Building2 size={13} className="text-[#2649B3] flex-shrink-0" />
              <span className="text-[#4F5050] font-medium hidden lg:inline">Company:</span>
              <strong className="text-[#2649B3] font-semibold truncate max-w-[130px] xl:max-w-[180px]">{activeCompanyName}</strong>
              <Lock size={11} className="text-[#2649B3] flex-shrink-0" />
            </div>
          );
        })()}

        {/* Global bilingual control */}
        <div
          className="hidden sm:inline-flex h-9 flex-shrink-0 items-center gap-1 rounded-full border border-[#E2E8F0] bg-white p-1 shadow-2xs"
          data-no-translate
          role="group"
          aria-label="Pilih bahasa / Select language"
        >
          <span
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#2649B3]"
            aria-hidden="true"
          >
            <Globe2 size={14} strokeWidth={2} />
          </span>

          {(["id", "en"] as const).map((locale) => {
            const isActive = language === locale;

            return (
              <button
                key={locale}
                type="button"
                onClick={() => setLanguage(locale)}
                className={cn(
                  "inline-flex h-7 min-w-8 items-center justify-center rounded-full px-2 text-[10px] font-extrabold uppercase tracking-[0.02em] transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#294BB2]/30 focus-visible:ring-offset-1",
                  isActive
                    ? "bg-[#2649B3] text-white shadow-2xs"
                    : "text-[#4F5050] hover:bg-[#EAF6FF] hover:text-[#2649B3]"
                )}
                aria-pressed={isActive}
                aria-label={locale === "id" ? "Gunakan Bahasa Indonesia" : "Use English"}
                title={locale === "id" ? "Bahasa Indonesia" : "English"}
              >
                {locale}
              </button>
            );
          })}
        </div>

        {/* Search Input / Command Palette Trigger */}
        <button
          type="button"
          onClick={() => setIsCommandPaletteOpen(true)}
          className="flex items-center gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-3.5 rounded-full bg-[#F8FAFC] hover:bg-white border border-[#E2E8F0] hover:border-[#9FD6FF] transition-all text-xs text-[#4F5050] cursor-pointer shadow-2xs flex-shrink-0"
          title="Pencarian Cepat & Navigasi (Ctrl+K)"
        >
          <Search size={14} className="text-[#4F5050] flex-shrink-0" aria-hidden="true" />
          <span className="hidden xl:inline whitespace-nowrap text-xs text-[#4F5050]">Cari data, proyek, menu…</span>
          <span className="hidden md:inline xl:hidden whitespace-nowrap text-xs text-[#4F5050]">Cari…</span>
          <kbd className="hidden md:inline-flex px-1.5 py-0.5 text-[9px] text-[#4F5050] bg-white rounded-md border border-[#E2E8F0] font-mono shadow-2xs ml-0.5">
            Ctrl+K
          </kbd>
        </button>

        {canOpenReporting && (
          <button
            type="button"
            onClick={() => router.push('/reporting?tab=attendance')}
            className="flex-shrink-0 h-9 px-3 rounded-full bg-white border border-[#EFEFEF] hover:border-[#9FD6FF] hover:bg-[#EAF6FF]/30 text-[#4F5050] hover:text-[#2649B3] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            aria-label="Buka laporan kehadiran"
            title="Laporan Kehadiran"
          >
            <CalendarCheck size={15} className="text-[#2649B3]" aria-hidden="true" />
            <span className="hidden 2xl:inline text-xs font-semibold">Attendance</span>
          </button>
        )}

        {/* Notification Bell / Mobile Right Drawer Trigger */}
        <button
          type="button"
          onClick={onNotificationClick ? onNotificationClick : () => toast("Semua notifikasi dan alert tersinkronisasi.")}
          className="flex-shrink-0 h-9 w-9 rounded-full bg-white border border-[#EFEFEF] hover:border-[#9FD6FF] hover:bg-[#EAF6FF]/30 text-[#4F5050] hover:text-[#2649B3] active:scale-95 transition-all relative cursor-pointer flex items-center justify-center shadow-2xs"
          aria-label="Buka Notifikasi & Feed Tim"
          title="Buka Notifikasi & Feed Tim"
        >
          <Bell size={16} aria-hidden="true" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-[#EF4444] rounded-full ring-2 ring-white" aria-hidden="true" />
        </button>

        {/* User Avatar & Profile Pop-up */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 h-9 p-1 pl-1 pr-2.5 rounded-full bg-white border border-[#EFEFEF] hover:border-[#9FD6FF] hover:bg-[#FDFDFD] transition-all shadow-2xs cursor-pointer"
            aria-label="Menu profil pengguna"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white shadow-2xs flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #42ACFB 0%, #2649B3 100%)" }}
            >
              {initial}
            </div>
            <span className="hidden xl:inline text-xs font-semibold text-[#090909] truncate max-w-[110px] 2xl:max-w-[150px]">
              {displayName}
            </span>
            <ChevronDown size={13} className="text-[#4F5050] flex-shrink-0" />
          </button>

          {/* User Profile Pop-up Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-[#EFEFEF] shadow-card-lg py-2 z-50 animate-in fade-in zoom-in-95 duration-150 ease-out">
              {/* User Header */}
              <div className="px-4 py-3 border-b border-[#EFEFEF] flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold text-white shadow-2xs flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #42ACFB 0%, #2649B3 100%)" }}
                >
                  {initial}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-[#090909] truncate">{displayName}</span>
                  <span className="text-2xs text-[#4F5050] truncate font-mono">{user?.email}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-semibold bg-[#EAF6FF] text-[#2649B3] mt-1 w-fit">
                    {roleName}
                  </span>
                </div>
              </div>

              {/* Menu Actions */}
              <div className="p-1.5 flex flex-col gap-0.5">
                {(user?.roles || []).length > 1 && (
                  <div className="mb-1 border-b border-text-tertiary/60 pb-2">
                    <div className="px-3 pb-1.5 text-3xs font-bold uppercase tracking-wider text-text-secondary">Peran Aktif</div>
                    <div className="flex flex-col gap-1">
                      {user?.roles?.map((role) => {
                        const code = role.role_code || role.role || "";
                        const active = code === user.active_role_code;
                        return (
                          <button
                            key={`${code}-${role.company_id || "company"}`}
                            type="button"
                            disabled={switchingRole || active || !code}
                            onClick={async () => {
                              try {
                                setSwitchingRole(true);
                                await setActiveRole(code);
                                setIsUserMenuOpen(false);
                                toast.success(`Akses aktif: ${role.role_name || code}`);
                              } catch {
                                toast.error("Gagal mengganti akses aktif.");
                              } finally {
                                setSwitchingRole(false);
                              }
                            }}
                            className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors", active ? "bg-[#EAF6FF] font-bold text-[#2649B3]" : "text-text-primary hover:bg-bg-light", switchingRole && "opacity-60")}
                          >
                            <span>{role.role_name || code}</span>
                            {active && <Check size={13} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsSettingsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-text-primary hover:bg-bg-light hover:text-brand-deep-green transition-colors text-left cursor-pointer active:scale-[0.99]"
                >
                  <KeyRound size={15} className="text-text-secondary" />
                  <span>Ganti Password & Ubah Profil</span>
                </button>
              </div>

              {/* Log Out */}
              <div className="p-1.5 pt-1 border-t border-text-tertiary/60">
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer active:scale-[0.99]"
                >
                  <LogOut size={15} />
                  <span>Log Out Sesi</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Global Command Palette Modal (Cmd+K / Ctrl+K) */}
      <GlobalCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* User Profile Settings Modal (Ganti Password & Ubah Email) */}
      <UserProfileSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </header>
  );
}

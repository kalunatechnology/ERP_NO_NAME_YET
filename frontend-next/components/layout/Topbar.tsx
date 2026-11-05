/**
 * File: frontend-next/components/layout/Topbar.tsx
 *
 * Purpose: Marka Logistik official Topbar header component.
 * Visual Identity: Marka Blue (#4F8CF6), Inter typography, crisp slate border and shadows.
 * Features: Mobile drawer toggle, breadcrumbs, company scope, language switcher, command palette (Ctrl+K), notifications, user profile menu.
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
import { fetchNotifications, subscribeToNotificationStateChange } from "@/lib/api/feed.api";
import { getUserFacingApiError } from "@/lib/api/error-message";
import toast from "react-hot-toast";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { UserProfileSettingsModal } from "@/components/ui/UserProfileSettingsModal";
import { User, KeyRound, Sparkles } from "lucide-react";

interface TopbarProps {
  onMenuToggle?: () => void;
  onNotificationClick?: () => void;
  onAiChatToggle?: () => void;
}

function buildBreadcrumb(pathname: string): { label: string; href: string }[] {
  const LABELS: Record<string, string> = {
    dashboard:  "Dashboard",
    projects:   "Projects",
    tasks:      "Tasks",
    finance:    "Finance",
    crm:        "CRM & Sales",
    inventory:  "Inventory",
    requests:   "Requests",
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
    moduleAccess: user?.module_access,
    activeRoleCode: user?.active_role_code,
    isSuperAdmin: userRole === "super_admin",
  });

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    const checkUnread = async () => {
      try {
        const res = await fetchNotifications("unread");
        if (active) setUnreadCount(res.unreadCount || 0);
      } catch { /* ignore */ }
    };
    checkUnread();
    const unsubscribe = subscribeToNotificationStateChange(() => { void checkUnread(); });
    const interval = setInterval(checkUnread, 30000);
    return () => { active = false; clearInterval(interval); unsubscribe(); };
  }, [company, user?.id]);

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
    <header className="sticky top-0 h-16 flex items-center justify-between bg-white border-b border-slate-200/80 shadow-[0_0px_2px_2px_rgba(0,0,0,0.04)] px-4 sm:px-6 lg:px-8 gap-3 sm:gap-4 z-30 shrink-0 font-inter">
      {/* Left: Mobile hamburger & Marka Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onMenuToggle}
          className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-[#4F8CF6] hover:bg-slate-100 transition-colors lg:hidden cursor-pointer"
          id="topbar-menu-btn"
          aria-label="Buka menu"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {crumbs.length === 0 ? (
              <li className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs sm:text-sm font-bold text-slate-800">Dashboard</span>
              </li>
            ) : (
              crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <li key={crumb.href} className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    {i > 0 && (
                      <ChevronRight size={13} className="text-slate-400 shrink-0" aria-hidden="true" />
                    )}
                    {isLast ? (
                      <span
                        className="text-xs sm:text-sm font-bold text-slate-800 truncate"
                        aria-current="page"
                      >
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        href={crumb.href}
                        className="text-xs sm:text-sm text-slate-500 hover:text-[#4F8CF6] transition-colors truncate"
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

      {/* Right: Actions, Context, Profile */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Company Selector Box */}
        {(() => {
          const activeCompanyName =
            companies.find((c) => String(c.id) === String(company))?.name || (userRole === "super_admin" ? "Global" : "Company tidak tersedia");

          if (["staff", "om"].includes(userRole)) return null;

          return userRole === "super_admin" ? (
            <div className="relative hidden md:block" ref={compRef}>
              <button
                onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-2 h-9 px-3 rounded-lg bg-white border border-slate-200 hover:border-[#4F8CF6] text-xs shadow-2xs transition-all cursor-pointer"
                title={`Company context: ${activeCompanyName}`}
              >
                <Building2 size={14} className="text-[#4F8CF6] shrink-0" />
                <span className="text-slate-500 font-medium hidden lg:inline">Perusahaan:</span>
                <strong className="text-slate-800 font-semibold truncate max-w-[130px]">{activeCompanyName}</strong>
                <ChevronDown size={13} className="text-slate-400 shrink-0" />
              </button>

              {isCompanyDropdownOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-2xs font-bold text-slate-400 uppercase tracking-wider">Pilih Context Perusahaan</div>
                  <div className="flex flex-col gap-1 mt-1">
                    <button
                      onClick={() => {
                        setCompany(null);
                        setIsCompanyDropdownOpen(false);
                        toast.success("Context Global aktif.");
                      }}
                      className={cn(
                        "w-full text-left p-2 rounded-lg text-xs flex items-center justify-between hover:bg-slate-50 transition-colors",
                        !company && "bg-blue-50 font-bold text-[#4F8CF6]"
                      )}
                    >
                      <span>Global · Semua perusahaan</span>
                      {!company && <Check size={13} className="text-[#4F8CF6]" />}
                    </button>
                    {companies.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCompany(String(c.id));
                          setIsCompanyDropdownOpen(false);
                          toast.success(`Perusahaan aktif: ${c.name}`);
                        }}
                        className={cn(
                          "w-full text-left p-2 rounded-lg text-xs flex items-center justify-between hover:bg-slate-50 transition-colors",
                          company === String(c.id) && "bg-blue-50 font-bold text-[#4F8CF6]"
                        )}
                      >
                        <span className="truncate">{c.name}</span>
                        {company === String(c.id) && <Check size={13} className="text-[#4F8CF6]" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs" title={`Terikat ke ${activeCompanyName}`}>
              <Building2 size={13} className="text-[#4F8CF6] shrink-0" />
              <span className="text-slate-500 font-medium hidden lg:inline">Perusahaan:</span>
              <strong className="text-slate-800 font-semibold truncate max-w-[140px]">{activeCompanyName}</strong>
              <Lock size={11} className="text-slate-400 shrink-0" />
            </div>
          );
        })()}

        {/* Global bilingual control */}
        <div
          className="hidden sm:inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-2xs"
          data-no-translate
          role="group"
          aria-label="Pilih bahasa"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-slate-500" aria-hidden="true">
            <Globe2 size={14} />
          </span>

          {(["id", "en"] as const).map((locale) => {
            const isActive = language === locale;
            return (
              <button
                key={locale}
                type="button"
                onClick={() => setLanguage(locale)}
                className={cn(
                  "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[11px] font-bold uppercase transition-all",
                  isActive
                    ? "bg-[#4F8CF6] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
                aria-pressed={isActive}
              >
                {locale}
              </button>
            );
          })}
        </div>

        {/* Search Input / Command Palette Trigger (Ctrl+K) */}
        <button
          type="button"
          onClick={() => setIsCommandPaletteOpen(true)}
          className="flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-50 hover:bg-white border border-slate-200 hover:border-[#4F8CF6] transition-all text-xs text-slate-500 cursor-pointer shadow-2xs shrink-0"
          title="Pencarian Cepat & Navigasi (Ctrl+K)"
        >
          <Search size={14} className="text-slate-400 shrink-0" aria-hidden="true" />
          <span className="hidden xl:inline text-xs text-slate-500">Cari modul, proyek...</span>
          <kbd className="hidden xl:inline-flex px-1.5 py-0.5 text-[10px] text-slate-500 bg-white rounded border border-slate-200 font-mono shadow-2xs">
            Ctrl+K
          </kbd>
        </button>

        {canOpenReporting && (
          <button
            type="button"
            onClick={() => router.push("/reporting?tab=attendance")}
            className="shrink-0 h-9 px-3 rounded-lg bg-white border border-slate-200 hover:border-[#4F8CF6] hover:bg-blue-50/50 text-slate-600 hover:text-[#4F8CF6] transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            title="Laporan Kehadiran"
          >
            <CalendarCheck size={15} className="text-[#4F8CF6]" aria-hidden="true" />
            <span className="hidden 2xl:inline text-xs font-semibold">Kehadiran</span>
          </button>
        )}

        {/* Notification Bell */}
        <button
          type="button"
          onClick={onNotificationClick ? onNotificationClick : () => toast("Semua notifikasi tersinkronisasi.")}
          className="shrink-0 h-9 w-9 rounded-lg bg-white border border-slate-200 hover:border-[#4F8CF6] hover:bg-blue-50/50 text-slate-600 hover:text-[#4F8CF6] transition-all relative cursor-pointer flex items-center justify-center shadow-2xs"
          aria-label="Notifikasi"
          title={unreadCount > 0 ? `${unreadCount} notifikasi baru` : "Notifikasi"}
        >
          <Bell size={16} aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-[#F43F5E] text-white rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : (
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#10B981] rounded-full ring-2 ring-white" aria-hidden="true" />
          )}
        </button>

        {/* User Profile Pill & Dropdown (Sesuai gaya Marka VDropdownProfile) */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 h-9 p-1 pl-1.5 pr-2.5 rounded-lg bg-white border border-slate-200 hover:border-[#4F8CF6] transition-all shadow-2xs cursor-pointer"
            aria-label="Menu profil pengguna"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white shadow-2xs shrink-0"
              style={{ background: "linear-gradient(135deg, #72A3F8 0%, #3F70C5 100%)" }}
            >
              {initial}
            </div>
            <span className="hidden xl:inline text-xs font-semibold text-slate-800 truncate max-w-[120px]">
              {displayName}
            </span>
            <ChevronDown size={13} className="text-slate-400 shrink-0" />
          </button>

          {/* User Profile Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold text-white shadow-xs shrink-0"
                  style={{ background: "linear-gradient(135deg, #72A3F8 0%, #3F70C5 100%)" }}
                >
                  {initial}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-900 truncate">{displayName}</span>
                  <span className="text-[11px] text-slate-500 truncate font-mono">{user?.email}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#4F8CF6] mt-1 w-fit">
                    {roleName}
                  </span>
                </div>
              </div>

              {/* Roles switcher */}
              <div className="p-1.5 flex flex-col gap-0.5">
                {(user?.roles || []).length > 1 && (
                  <div className="mb-1 border-b border-slate-100 pb-2">
                    <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Pilih Peran Aktif</div>
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
                              } catch (error) {
                                toast.error(getUserFacingApiError(error));
                              } finally {
                                setSwitchingRole(false);
                              }
                            }}
                            className={cn(
                              "flex items-center justify-between rounded-lg px-3 py-1.5 text-xs text-left transition-colors",
                              active
                                ? "bg-blue-50 font-bold text-[#4F8CF6]"
                                : "text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            <span className="truncate">{role.role_name || code}</span>
                            {active && <Check size={13} className="text-[#4F8CF6] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsSettingsModalOpen(true);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#4F8CF6] rounded-lg transition-colors"
                >
                  <User size={14} className="text-slate-400" />
                  <span>Pengaturan Profil & Akun</span>
                </button>

                {onAiChatToggle && user?.enabled_modules?.includes("MARBOT") && userRole !== "super_admin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onAiChatToggle();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-[#4F8CF6] rounded-lg transition-colors"
                  >
                    <Sparkles size={14} className="text-[#4F8CF6]" />
                    <span>Buka Asisten Marbot</span>
                  </button>
                )}

                <div className="border-t border-slate-100 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors font-medium"
                >
                  <LogOut size={14} className="text-rose-500" />
                  <span>Keluar dari Akun</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Command Palette Dialog */}
      <GlobalCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* User Profile Settings Modal */}
      <UserProfileSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </header>
  );
}

export default Topbar;

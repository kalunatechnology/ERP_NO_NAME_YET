"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell, Menu, ChevronDown, Check, Building2, LogOut, ShieldCheck, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface TopbarProps {
  onMenuToggle?: () => void;
  onNotificationClick?: () => void;
}

const DEMO_PERSONAS = [
  { email: "admin@arsalynk.id", name: "Sutanto Admin", role: "Super Administrator · Full Multi-Tenant", icon: "👑", company: "Semua Company" },
  { email: "director@arsalynk.id", name: "Bambang Director", role: "Direksi / Executive · P&L", icon: "🏛️", company: "PT Sinergi Muda Arsa" },
  { email: "pm@arsalynk.id", name: "Rina Sari PM", role: "Project Manager · WBS & Gantt", icon: "🏗️", company: "PT Sinergi Muda Arsa" },
  { email: "supervisor@arsalynk.id", name: "Ahmad Rizki", role: "Field Supervisor · Timesheet", icon: "👷", company: "PT Sinergi Muda Arsa" },
  { email: "manager@arsalynk.id", name: "Dewi Kurnia", role: "CRM & Sales Lead · Pipeline", icon: "👔", company: "PT Sinergi Muda Arsa" },
  { email: "sales@arsalynk.id", name: "Hendra Sales", role: "Sales Commercial · Quotation", icon: "🧑‍💼", company: "PT Sinergi Muda Arsa" },
  { email: "finance@arsalynk.id", name: "Budi Santoso", role: "Finance Controller · AR/AP & Kas", icon: "💼", company: "PT Sinergi Muda Arsa" },
  { email: "dummy.admin@example.com", name: "Dummy Administrator", role: "Administrator Demo", icon: "👑", company: "PT Sinergi Muda Arsa" },
  { email: "dummy.pm@example.com", name: "Dummy Project Manager", role: "PM Demo · Projects", icon: "🏗️", company: "PT Sinergi Muda Arsa" },
  { email: "dummy.finance@example.com", name: "Dummy Finance", role: "Finance Demo · Invoicing", icon: "💰", company: "PT Sinergi Muda Arsa" },
];

/* ── Breadcrumb builder ─────────────────────────── */
function buildBreadcrumb(pathname: string): { label: string; href: string }[] {
  const LABELS: Record<string, string> = {
    dashboard:  "Dashboard",
    projects:   "Projects",
    tasks:      "Tasks",
    finance:    "Finance",
    crm:        "CRM & Sales",
    resources:  "Data Explorer",
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
import { User, KeyRound } from "lucide-react";

export function Topbar({ onMenuToggle, onNotificationClick }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, company, setCompany, companies, isAdmin } = useAuth();
  const crumbs = buildBreadcrumb(pathname);

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    if (!searchQuery.trim()) {
      setIsCommandPaletteOpen(true);
      return;
    }
    router.push(`/resources?search=${encodeURIComponent(searchQuery.trim())}`);
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
  const roleName = user?.roles?.[0]?.role_name || (user?.is_superuser ? "Executive / Super Admin" : "Team Member");

  return (
    <header
      className="flex items-center justify-between bg-bg-lighter border-b border-text-tertiary flex-shrink-0 px-6 gap-6 z-30 relative"
      style={{ height: "var(--topbar-h, 68px)" }}
    >
      {/* Left: Hamburger (mobile) + Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        {/* Hamburger: always visible, activates mobile sidebar below lg */}
        <button
          onClick={onMenuToggle}
          className="flex-shrink-0 p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-brand-light-green transition-colors lg:hidden"
          id="topbar-menu-btn"
          aria-label="Buka menu"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1.5 sm:gap-2">
            <li className="hidden sm:block flex-shrink-0">
              <span className="text-sm text-text-secondary">Contents</span>
            </li>
            {crumbs.map((crumb, i) => (
              <li key={crumb.href} className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="hidden sm:block text-sm text-text-secondary" aria-hidden="true">/</span>
                <span
                  className={cn(
                    "text-sm truncate max-w-[80px] sm:max-w-[140px] lg:max-w-none",
                    i === crumbs.length - 1
                      ? "text-brand-deep-green font-medium"
                      : "text-text-secondary"
                  )}
                  aria-current={i === crumbs.length - 1 ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Right: Company Context + Search + User Profile Menu */}
      <div className="flex items-center gap-3">

        {/* Company Selector Box */}
        {(() => {
          const userEmail = (user?.email || "").toLowerCase();
          const isGhostUser =
            userEmail.endsWith("@arsalynk.id") ||
            userEmail.includes("dummy") ||
            userEmail.includes("demo") ||
            userEmail.endsWith("@example.com") ||
            (user as any)?.tenant_id === "00000000-0000-0000-0000-000000000099";

          const activeCompanyName =
            companies.find((c) => String(c.id) === String(company))?.name ||
            (isGhostUser ? "PT Coba Arsalynk (Ghost)" : "PT Sinergi Muda Arsa");

          return isAdmin ? (
            /* Admin can pick any company */
            <div className="relative hidden md:block" ref={compRef}>
              <button
                onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-brand-green/40 hover:border-brand-green text-xs shadow-sm transition-all"
              >
                <Building2 size={13} className="text-brand-green" />
                <span className="text-text-secondary font-medium">Company:</span>
                <strong className="text-brand-deep-green truncate max-w-[180px]">{activeCompanyName}</strong>
                <span className="badge text-2xs bg-brand-light-green text-brand-deep-green font-bold">Admin Pick</span>
                <ChevronDown size={12} className="text-text-secondary" />
              </button>

              {isCompanyDropdownOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl border border-text-tertiary shadow-card-lg p-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-2xs font-bold text-text-secondary uppercase">Pilih Context Company</div>
                  <div className="flex flex-col gap-1 mt-1">
                    {companies.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCompany(String(c.id));
                          setIsCompanyDropdownOpen(false);
                          toast.success(`Company aktif: ${c.name}`);
                        }}
                        className={cn(
                          "w-full text-left p-2 rounded-xl text-xs flex items-center justify-between hover:bg-brand-light-green/40",
                          company === String(c.id) && "bg-brand-light-green font-bold text-brand-deep-green"
                        )}
                      >
                        <span className="truncate">{c.name}</span>
                        {company === String(c.id) && <Check size={13} className="text-brand-deep-green" />}
                      </button>
                    ))}
                    <div className="pt-2 border-t border-text-tertiary">
                      <label className="text-2xs text-text-secondary px-2 block mb-1">Custom X-Company-ID:</label>
                      <input
                        type="text"
                        placeholder="arsalyn"
                        value={company || ""}
                        onChange={e => setCompany(e.target.value || null)}
                        className="input py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Non-admin dynamically bound to their company */
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-light-green/60 border border-brand-green/30 text-xs" title={`Akun Anda terikat resmi ke ${activeCompanyName}`}>
              <Building2 size={13} className="text-brand-deep-green" />
              <span className="text-text-secondary font-medium">Company:</span>
              <strong className="text-brand-deep-green font-semibold truncate max-w-[200px]">{activeCompanyName}</strong>
              <Lock size={11} className="text-brand-green" />
            </div>
          );
        })()}

        {/* Search Input / Command Palette Trigger */}
        <button
          type="button"
          onClick={() => setIsCommandPaletteOpen(true)}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-full bg-text-tertiary/70 hover:bg-text-tertiary hover:border-brand-green/40 border border-transparent transition-all text-xs text-text-secondary cursor-pointer shadow-2xs"
          title="Pencarian Cepat & Navigasi (Ctrl+K)"
        >
          <Search size={14} className="text-text-secondary flex-shrink-0" aria-hidden="true" />
          <span className="hidden md:inline whitespace-nowrap">Cari data, proyek, menu…</span>
          <span className="hidden sm:inline md:hidden">Cari…</span>
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] text-text-secondary bg-white rounded-md border border-gray-200 font-mono shadow-2xs ml-0.5">
            Ctrl+K
          </kbd>
        </button>

        {/* Notification Bell / Mobile Right Drawer Trigger */}
        <button
          type="button"
          onClick={onNotificationClick ? onNotificationClick : () => toast("Semua notifikasi & alert tersinkronisasi", { icon: "🔔" })}
          className="flex-shrink-0 p-2 sm:p-1.5 rounded-full text-text-secondary hover:text-brand-deep-green hover:bg-brand-light-green/60 active:scale-95 transition-all relative cursor-pointer flex items-center justify-center"
          aria-label="Buka Notifikasi & Feed Tim"
          title="Buka Notifikasi & Feed Tim"
        >
          <Bell size={19} aria-hidden="true" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white" aria-hidden="true" />
        </button>

        {/* User Avatar & Profile Pop-up */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-full bg-white border border-text-tertiary hover:border-brand-green transition-all shadow-sm cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-brand-light-green flex items-center justify-center text-xs font-bold text-brand-deep-green">
              {initial}
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-xs font-semibold text-text-primary truncate max-w-[110px]">{displayName}</span>
              <span className="text-2xs text-text-secondary truncate max-w-[110px]">{roleName}</span>
            </div>
            <ChevronDown size={14} className="text-text-secondary" />
          </button>

          {/* User Profile Pop-up Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-card-lg py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              {/* User Header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F0FEE0] border border-[#BBDFA0] flex items-center justify-center text-sm font-bold text-[#275433]">
                  {initial}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-800 truncate">{displayName}</span>
                  <span className="text-[11px] text-slate-500 truncate font-mono">{user?.email}</span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md mt-1 w-fit border border-emerald-100">
                    {roleName}
                  </span>
                </div>
              </div>

              {/* Menu Actions */}
              <div className="p-1.5 flex flex-col gap-0.5">
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsSettingsModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-800 transition-colors text-left"
                >
                  <KeyRound size={15} className="text-slate-400" />
                  <span>Ganti Password & Ubah Profil</span>
                </button>
              </div>

              {/* Log Out */}
              <div className="p-1.5 pt-1 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left"
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


"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell, Menu, ChevronDown, Check, Building2, LogOut, ShieldCheck, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface TopbarProps {
  onMenuToggle?: () => void;
}

const DEMO_PERSONAS = [
  { email: "admin@arsalynk.id", name: "Sutanto Admin", role: "Super Administrator · Full Multi-Tenant", icon: "👑", company: "Semua Company" },
  { email: "director@arsalynk.id", name: "Bambang Director", role: "Direksi / Executive · P&L", icon: "🏛️", company: "PT. Arsalynt" },
  { email: "pm@arsalynk.id", name: "Rina Sari PM", role: "Project Manager · WBS & Gantt", icon: "🏗️", company: "PT. Arsalynt" },
  { email: "supervisor@arsalynk.id", name: "Ahmad Rizki", role: "Field Supervisor · Timesheet", icon: "👷", company: "PT. Arsalynt" },
  { email: "manager@arsalynk.id", name: "Dewi Kurnia", role: "CRM & Sales Lead · Pipeline", icon: "👔", company: "PT. Arsalynt" },
  { email: "sales@arsalynk.id", name: "Hendra Sales", role: "Sales Commercial · Quotation", icon: "🧑‍💼", company: "PT. Arsalynt" },
  { email: "finance@arsalynk.id", name: "Budi Santoso", role: "Finance Controller · AR/AP & Kas", icon: "💼", company: "PT. Arsalynt" },
  { email: "dummy.admin@example.com", name: "Dummy Administrator", role: "Administrator Demo", icon: "👑", company: "PT. Arsalynt" },
  { email: "dummy.pm@example.com", name: "Dummy Project Manager", role: "PM Demo · Projects", icon: "🏗️", company: "PT. Arsalynt" },
  { email: "dummy.finance@example.com", name: "Dummy Finance", role: "Finance Demo · Invoicing", icon: "💰", company: "PT. Arsalynt" },
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

export function Topbar({ onMenuToggle }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, login, logout, company, setCompany, companies, isAdmin } = useAuth();
  const crumbs = buildBreadcrumb(pathname);

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
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

  const handleQuickSwitchUser = async (email: string) => {
    setSwitching(true);
    try {
      await login(email, "DummyPass123!");
      toast.success(`Berhasil beralih ke akun: ${email}`, { icon: "⚡" });
      setIsUserMenuOpen(false);
      window.location.href = "/dashboard";
    } catch {
      toast.error("Gagal beralih akun. Silakan coba akun lainnya.");
    } finally {
      setSwitching(false);
    }
  };

  const initial = user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";

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

      {/* Right: Company Context + Search + Quick Persona Switcher */}
      <div className="flex items-center gap-3">

        {/* Company Selector Box */}
        {isAdmin ? (
          /* Admin can pick any company */
          <div className="relative hidden md:block" ref={compRef}>
            <button
              onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-brand-green/40 hover:border-brand-green text-xs shadow-sm transition-all"
            >
              <Building2 size={13} className="text-brand-green" />
              <span className="text-text-secondary font-medium">Company:</span>
              <strong className="text-brand-deep-green">{company || "Arsalynt"}</strong>
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
                      <span>{c.name}</span>
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
          /* Non-admin is automatically locked to Arsalynt */
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-light-green/60 border border-brand-green/30 text-xs" title="Akun Anda terikat otomatis ke PT. Arsalynt">
            <Building2 size={13} className="text-brand-deep-green" />
            <span className="text-text-secondary font-medium">Company:</span>
            <strong className="text-brand-deep-green font-semibold">PT. Arsalynt</strong>
            <Lock size={11} className="text-brand-green" />
          </div>
        )}

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

        {/* Notification Bell */}
        <button
          onClick={() => toast("Semua notifikasi tersinkronisasi", { icon: "🔔" })}
          className="flex-shrink-0 p-1.5 rounded-full text-text-secondary hover:text-brand-deep-green hover:bg-brand-light-green/40 transition-colors relative"
          aria-label="Notifikasi"
        >
          <Bell size={18} aria-hidden="true" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-500 rounded-full" aria-hidden="true" />
        </button>

        {/* Quick User Avatar & Persona Switcher */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-full bg-white border border-text-tertiary hover:border-brand-green transition-all shadow-sm"
          >
            <div className="w-7 h-7 rounded-full bg-brand-light-green flex items-center justify-center text-xs font-bold text-brand-deep-green">
              {initial}
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-xs font-semibold text-text-primary truncate max-w-[110px]">{displayName}</span>
              <span className="text-2xs text-text-secondary">Ganti Akun ⚡</span>
            </div>
            <ChevronDown size={14} className="text-text-secondary" />
          </button>

          {/* Quick Account Switcher Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-text-tertiary shadow-card-lg py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 border-b border-text-tertiary">
                <span className="text-2xs font-extrabold text-brand-deep-green tracking-wider uppercase">
                  Ganti Akun Cepat ({DEMO_PERSONAS.length} Akun Aktif)
                </span>
                <p className="text-2xs text-text-secondary mt-0.5">
                  Semua akun operasional otomatis masuk ke <b>PT. Arsalynt</b>, admin bebas memilih company.
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 p-1">
                {DEMO_PERSONAS.map(p => {
                  const isCurrent = user?.email === p.email;
                  return (
                    <button
                      key={p.email}
                      disabled={switching}
                      onClick={() => handleQuickSwitchUser(p.email)}
                      className={cn(
                        "w-full flex items-center justify-between p-2.5 rounded-xl text-left hover:bg-brand-light-green/50 transition-colors",
                        isCurrent && "bg-brand-light-green/80 font-bold"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg flex-shrink-0">{p.icon}</span>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-text-primary truncate font-medium">{p.name}</span>
                            <span className="text-2xs px-1 rounded bg-gray-100 text-gray-600">{p.company}</span>
                          </div>
                          <span className="text-2xs text-text-secondary truncate">{p.role}</span>
                        </div>
                      </div>
                      {isCurrent && <Check size={14} className="text-brand-deep-green flex-shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>

              <div className="p-2 pt-2 border-t border-text-tertiary">
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} /> Log Out Sesi
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
    </header>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, ChevronDown, Copy, Mail, PanelRightClose, RefreshCw, Users, X } from "lucide-react";
import { DynamicContact, RealAlertItem, fetchDynamicRightPanelData, fetchRealAlertsList } from "@/lib/api/feed.api";
import { canAccessRoute } from "@/lib/access/module-contract";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface RightPanelProps {
  onToggleCollapse?: () => void;
  isMobile?: boolean;
  onClose?: () => void;
}

/** Compact right panel based on the Frame 397 real-time alert layout. */
export function RightPanel({ onToggleCollapse, isMobile = false, onClose }: RightPanelProps) {
  const router = useRouter();
  const { user, userRole } = useAuth();
  const [alerts, setAlerts] = useState<RealAlertItem[]>([]);
  const [contacts, setContacts] = useState<DynamicContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState<DynamicContact | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const checkCanAccess = useCallback((href?: string): boolean => {
    if (!href) return true;
    const allowed = canAccessRoute({
      pathname: href,
      enabledModules: user?.enabled_modules,
      delegatedModules: user?.delegated_modules,
      activeRoleCode: user?.active_role_code,
      isSuperAdmin: userRole === "super_admin",
    });
    if (!allowed) toast.error("Tautan ini tidak tersedia untuk role dan module aktif Anda.");
    return allowed;
  }, [user?.active_role_code, user?.delegated_modules, user?.enabled_modules, userRole]);

  const loadFeed = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, realAlerts] = await Promise.all([
        fetchDynamicRightPanelData({
          enabledModules: user?.enabled_modules,
          delegatedModules: user?.delegated_modules,
          activeRoleCode: user?.active_role_code,
          isSuperAdmin: userRole === "super_admin",
        }),
        fetchRealAlertsList({
          enabledModules: user?.enabled_modules,
          delegatedModules: user?.delegated_modules,
          activeRoleCode: user?.active_role_code,
          isSuperAdmin: userRole === "super_admin",
        }),
      ]);
      setAlerts(realAlerts.slice(0, 3));
      setContacts(data.contacts || []);
      setLoadError(null);
    } catch {
      setLoadError("Data real-time belum dapat disinkronkan. Coba segarkan kembali.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.active_role_code, user?.delegated_modules, user?.enabled_modules, userRole]);

  useEffect(() => {
    loadFeed();
    const timer = setInterval(() => loadFeed(true), 45000);
    return () => clearInterval(timer);
  }, [loadFeed]);

  const openAlert = (item: RealAlertItem) => {
    if (!item.href || !checkCanAccess(item.href)) return;
    router.push(item.href);
    if (isMobile) onClose?.();
  };

  const copyContactEmail = (email?: string) => {
    if (!email) return;
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    toast.success(`Email ${email} disalin ke clipboard!`);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const visibleContacts = showAllContacts ? contacts : contacts.slice(0, 4);

  return (
    <>
      <aside
        className={cn(
          "flex h-full w-full select-none flex-col overflow-y-auto bg-[#FDFDFD] px-8 pb-6 pt-9",
          isMobile && "w-screen max-w-[320px] shadow-2xl"
        )}
        role="complementary"
        aria-label="Alert dan kontak real-time"
      >
        <section aria-labelledby="right-panel-alert-title">
          <header className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-[#294BB2]">
              <Bell size={16} strokeWidth={1.8} aria-hidden="true" />
              <h2 id="right-panel-alert-title" className="text-sm font-extrabold uppercase tracking-[0.02em]">Alert</h2>
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="flex items-center gap-0.5">
              <span className="rounded-full bg-[#EAF6FF] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#2649B3]">Real Time</span>
              <button type="button" onClick={() => loadFeed(true)} className="rounded-lg p-1.5 text-[#4F5050] hover:bg-[#EAF6FF] hover:text-[#2649B3]" aria-label="Segarkan alert" title="Segarkan alert">
                <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
              </button>
              <button type="button" onClick={isMobile ? onClose : onToggleCollapse} className="rounded-lg p-1.5 text-[#4F5050] hover:bg-[#EAF6FF] hover:text-[#2649B3]" aria-label="Tutup panel kanan" title="Tutup panel kanan">
                {isMobile ? <X size={15} /> : <PanelRightClose size={15} />}
              </button>
            </div>
          </header>

          {loadError && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-900" role="status">{loadError}</div>}

          <div className="relative mt-6 pl-2.5">
            <div className="absolute bottom-0 left-0 top-0 w-1 overflow-hidden rounded-full bg-[#D9D9D9]" aria-hidden="true">
              <div className="h-[45%] w-full rounded-full bg-[#2649B3]" />
            </div>
            <div className="flex flex-col gap-2.5">
              {loading ? [1, 2, 3].map((item) => (
                <div key={item} className="h-[70px] animate-pulse rounded-md border border-[#E5E5E5] bg-white p-3">
                  <div className="h-2.5 w-2/5 rounded bg-[#EAF6FF]" />
                  <div className="mt-3 h-2.5 w-4/5 rounded bg-[#EFEFEF]" />
                  <div className="mt-2 h-2 w-3/5 rounded bg-[#EFEFEF]" />
                </div>
              )) : alerts.length === 0 ? (
                <div className="rounded-md border border-[#D9D9D9] bg-white p-4 text-[10px] text-[#4F5050]">Belum ada alert baru.</div>
              ) : alerts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openAlert(item)}
                  className={cn(
                    "flex h-[70px] w-full flex-col justify-center rounded-md border px-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#9FD6FF] hover:shadow-sm",
                    item.isHighlighted ? "border-transparent bg-[#EAF6FF]" : "border-[#D9D9D9] bg-white"
                  )}
                  title={item.title}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] font-bold text-[#090909]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#66D575]" />{item.category}
                    </span>
                    <span className="shrink-0 text-[9px] font-medium text-[#4F5050]">{item.time}</span>
                  </span>
                  <strong className="mt-1 truncate text-[11px] leading-tight text-[#090909]">{item.title}</strong>
                  <span className="mt-1 truncate text-[10px] leading-tight text-[#4F5050]">{item.snippet}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="right-panel-contacts-title">
          <div className="flex items-center justify-between border-b border-[#EFEFEF] pb-2">
            <h2 id="right-panel-contacts-title" className="text-sm font-extrabold uppercase tracking-[0.02em] text-[#294BB2]">Contacts</h2>
            <Users size={15} className="text-[#294BB2]" aria-hidden="true" />
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {loading ? [1, 2, 3, 4].map((item) => (
              <div key={item} className="flex h-8 animate-pulse items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-[#EAF6FF]" />
                <div className="flex-1"><div className="h-2.5 w-4/5 rounded bg-[#EFEFEF]" /><div className="mt-1.5 h-2 w-1/2 rounded bg-[#EFEFEF]" /></div>
              </div>
            )) : visibleContacts.length === 0 ? (
              <p className="text-[10px] text-[#4F5050]">Belum ada anggota tim aktif.</p>
            ) : visibleContacts.map((contact) => (
              <button key={contact.id} type="button" onClick={() => setSelectedContact(contact)} className="group flex w-full items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-[#EAF6FF]" title={`${contact.name} · ${contact.role}`}>
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#2649B3]" style={{ background: contact.color }}>
                  {contact.initials}
                  <span className={cn("absolute bottom-0 right-0 h-2 w-2 rounded-full ring-1 ring-white", contact.status === "online" ? "bg-[#66D575]" : contact.status === "away" ? "bg-amber-400" : "bg-[#D9D9D9]")} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[11px] leading-tight text-[#090909] group-hover:text-[#2649B3]">{contact.name}</strong>
                  <span className="mt-0.5 block truncate text-[10px] leading-tight text-[#4F5050]">{contact.role}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={() => contacts.length > 4 && setShowAllContacts((current) => !current)}
          disabled={contacts.length <= 4}
          className="mt-auto min-h-10 w-full rounded-xl bg-[#EAF6FF] px-4 text-[11px] font-bold text-[#2649B3] transition-colors hover:bg-[#DCEEFF] disabled:cursor-default disabled:hover:bg-[#EAF6FF]"
        >
          {contacts.length > 4
            ? showAllContacts ? "Tampilkan lebih sedikit" : `Lihat semua kontak (${contacts.length})`
            : "Semua kontak ditampilkan"}
        </button>
      </aside>

      {selectedContact && (
        <Modal isOpen onClose={() => setSelectedContact(null)} title="Detail Anggota Tim" size="sm">
          <div className="flex flex-col items-center gap-4 p-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-[#2649B3] shadow-sm" style={{ background: selectedContact.color }}>{selectedContact.initials}</div>
            <div><h3 className="text-base font-bold text-[#090909]">{selectedContact.name}</h3><p className="mt-0.5 text-xs text-[#4F5050]">{selectedContact.role}</p></div>
            {selectedContact.email && (
              <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#D9D9D9] bg-[#FDFDFD] p-3 text-xs">
                <div className="flex min-w-0 items-center gap-2 text-[#090909]"><Mail size={14} className="shrink-0 text-[#2649B3]" /><span className="truncate">{selectedContact.email}</span></div>
                <button type="button" onClick={() => copyContactEmail(selectedContact.email)} className="shrink-0 rounded-lg p-1.5 text-[#4F5050] hover:bg-white hover:text-[#2649B3]" title="Salin email">{copiedEmail ? <Check size={14} /> : <Copy size={14} />}</button>
              </div>
            )}
            <div className="flex w-full gap-2 pt-2">
              <button type="button" onClick={() => setSelectedContact(null)} className="btn-ghost flex-1 py-2 text-xs">Tutup</button>
              {selectedContact.email && <a href={`mailto:${selectedContact.email}`} className="btn-primary flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-bold"><Mail size={14} />Kirim Email</a>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default RightPanel;

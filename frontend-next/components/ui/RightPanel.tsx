"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, CheckCheck, Mail, Copy, Check, PanelRightClose, Bell
} from "lucide-react";
import {
  fetchDynamicRightPanelData,
  fetchRealAlertsList,
  feedApi,
  DynamicFeedItem,
  DynamicContact,
  RealAlertItem
} from "@/lib/api/feed.api";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";

interface RightPanelProps {
  onToggleCollapse?: () => void;
}

export function RightPanel({ onToggleCollapse }: RightPanelProps) {
  const router = useRouter();
  const { userRole, isAdmin } = useAuth();
  const [notifications, setNotifications] = useState<DynamicFeedItem[]>([]);
  const [alerts, setAlerts] = useState<RealAlertItem[]>([]);
  const [activities, setActivities] = useState<DynamicFeedItem[]>([]);
  const [contacts, setContacts] = useState<DynamicContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [selectedContact, setSelectedContact] = useState<DynamicContact | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const checkCanAccess = (href?: string): boolean => {
    if (!href) return true;
    if (href.startsWith("/finance")) {
      const canAccess = isAdmin || userRole === "finance" || userRole === "executive";
      if (!canAccess) {
        toast.error("Akses Ditolak: Notifikasi keuangan hanya dapat diakses oleh tim Finance & Direksi.", { icon: "🔒" });
        return false;
      }
    }
    if (href.startsWith("/crm")) {
      const canAccess = isAdmin || userRole === "crm" || userRole === "executive" || userRole === "pm";
      if (!canAccess) {
        toast.error("Akses Ditolak: Modul CRM hanya untuk tim Commercial, PM & Direksi.", { icon: "🔒" });
        return false;
      }
    }
    return true;
  };

  const loadFeed = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [data, realAlerts] = await Promise.all([
        fetchDynamicRightPanelData(),
        fetchRealAlertsList(userRole, isAdmin)
      ]);
      setNotifications((data.notifications || []).slice(0, 3));
      setAlerts(realAlerts.slice(0, 3));
      setActivities((data.activities || []).slice(0, 3));
      setContacts((data.contacts || []).slice(0, 4));
    } catch {
      // ignore silently on background poll
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userRole, isAdmin]);

  useEffect(() => {
    loadFeed();
    const timer = setInterval(() => loadFeed(true), 45000);
    return () => clearInterval(timer);
  }, [loadFeed]);

  const handleItemClick = (item: DynamicFeedItem) => {
    if (item.href) {
      if (!checkCanAccess(item.href)) return;
      router.push(item.href);
      toast(`Membuka ${item.label}`, { icon: "🔗" });
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingRead(true);
    try {
      await feedApi.markNotificationsRead();
      toast.success("Semua notifikasi ditandai telah dibaca");
      loadFeed(true);
    } catch {
      toast.error("Gagal memperbarui notifikasi");
    } finally {
      setMarkingRead(false);
    }
  };

  const copyContactEmail = (email?: string) => {
    if (!email) return;
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    toast.success(`Email ${email} disalin ke clipboard!`);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <>
      <aside
        className="w-full h-full flex flex-col bg-bg-light select-none overflow-y-auto p-4 gap-4"
        role="complementary"
        aria-label="Panel informasi real-time"
      >
        {/* ── Section 1: Notifications ───────────────── */}
        <section className="flex flex-col gap-2.5 w-full" aria-labelledby="rp-notifications-title">
          <div className="flex items-center justify-between pb-1.5 border-b border-text-tertiary/40">
            <h2
              id="rp-notifications-title"
              className="text-xs font-bold text-brand-deep-green uppercase tracking-wider"
            >
              Notifications
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={handleMarkAllRead}
                disabled={markingRead || notifications.length === 0}
                className="text-text-secondary hover:text-brand-green p-1 rounded-md transition-colors disabled:opacity-30"
                title="Tandai semua telah dibaca"
                aria-label="Tandai semua notifikasi telah dibaca"
              >
                <CheckCheck size={14} />
              </button>
              <button
                onClick={() => loadFeed(true)}
                className={cn(
                  "text-text-secondary hover:text-brand-deep-green p-1 rounded-md transition-colors",
                  refreshing && "animate-spin"
                )}
                title="Sinkronkan notifikasi live"
                aria-label="Segarkan notifikasi"
              >
                <RefreshCw size={13} />
              </button>
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  className="text-text-secondary hover:text-brand-green p-1 rounded-md transition-colors ml-1"
                  title="Tutup panel kanan"
                  aria-label="Tutup panel kanan"
                >
                  <PanelRightClose size={14} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5 animate-pulse h-9 w-full">
                  <div className="w-7 h-7 rounded-full bg-brand-light-green/60 flex-shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="h-2 bg-gray-200 rounded w-4/5" />
                    <div className="h-1.5 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 w-full">
              {notifications.length === 0 ? (
                <p className="text-3xs text-text-secondary py-1">
                  Semua notifikasi telah dibaca.
                </p>
              ) : (
                notifications.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="flex items-center gap-2.5 cursor-pointer group hover:bg-brand-light-green/50 p-1.5 rounded-xl transition-all w-full"
                    title={`${item.label} (${item.sublabel || ""})`}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-light-green group-hover:ring-1 group-hover:ring-brand-green transition-all"
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                        <circle cx="12" cy="8" r="3" fill={item.color} opacity="0.8" />
                        <path
                          d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"
                          stroke={item.color}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          opacity="0.8"
                        />
                      </svg>
                    </div>

                    <div className="flex flex-col justify-center min-w-0 flex-1">
                      <span className="text-2xs font-bold text-text-primary truncate group-hover:text-brand-deep-green transition-colors leading-tight">
                        {item.label}
                      </span>
                      <span className="text-3xs text-text-secondary truncate leading-tight mt-0.5">
                        {item.time}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Section Divider */}
        <div className="w-full h-px bg-text-tertiary/40" aria-hidden="true" />

        {/* ── Section: Alert Timeline (Under Notifications) ── */}
        <section className="flex flex-col gap-2 w-full" aria-labelledby="rp-alerts-title">
          <div className="flex items-center justify-between pb-1 border-b border-text-tertiary/40">
            <h2
              id="rp-alerts-title"
              className="text-xs font-bold text-brand-deep-green uppercase tracking-wider flex items-center gap-1.5"
            >
              <Bell size={13} className="text-brand-green" />
              Alert
            </h2>
            <span className="text-[9px] font-bold text-brand-deep-green bg-brand-light-green px-1.5 py-0.2 rounded-md">
              REAL TIME
            </span>
          </div>

          <div className="relative pl-3.5 flex flex-col gap-2 mt-0.5">
            {/* Continuous Vertical Timeline Rail */}
            <div className="absolute left-1 top-1 bottom-1 w-0.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="w-full bg-[#5A861F] h-1/3 rounded-full" />
            </div>

            {alerts.length === 0 ? (
              <p className="text-3xs text-text-secondary py-1">Belum ada alert baru.</p>
            ) : (
              alerts.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.href) {
                      if (!checkCanAccess(item.href)) return;
                      router.push(item.href);
                      toast(`Membuka ${item.title}`, { icon: "🔔" });
                    }
                  }}
                  className={cn(
                    "p-2.5 rounded-xl transition-all flex flex-col gap-1 cursor-pointer group",
                    item.isHighlighted
                      ? "bg-[#F0FEE0] border border-[#BBDFA0] shadow-2xs"
                      : "bg-white hover:bg-neutral-50 border border-gray-100"
                  )}
                >
                  <div className="flex items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            item.categoryColor || (item.isHighlighted ? "#22C55E" : "#9CA3AF"),
                        }}
                      />
                      <span className="font-bold text-[#0E341F] text-[10px] truncate">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-[9px] text-[#637566] font-medium flex-shrink-0">
                      {item.time}
                    </span>
                  </div>

                  <h5 className="text-[11px] font-bold text-[#0E341F] leading-snug group-hover:text-[#275433] transition-colors truncate">
                    {item.title}
                  </h5>

                  <p className="text-[10px] text-[#637566] leading-tight line-clamp-2">
                    {item.snippet}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section Divider */}
        <div className="w-full h-px bg-text-tertiary/40" aria-hidden="true" />

        {/* ── Section 2: Activities ─────────────────── */}
        <section className="flex flex-col gap-2.5 w-full" aria-labelledby="rp-activities-title">
          <div className="pb-1.5 border-b border-text-tertiary/40">
            <h2
              id="rp-activities-title"
              className="text-xs font-bold text-brand-deep-green uppercase tracking-wider"
            >
              Activities
            </h2>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5 animate-pulse h-9 w-full">
                  <div className="w-7 h-7 rounded-full bg-brand-light-green/60 flex-shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="h-2 bg-gray-200 rounded w-3/4" />
                    <div className="h-1.5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 w-full">
              {activities.length === 0 ? (
                <p className="text-3xs text-text-secondary py-1">
                  Belum ada log aktivitas hari ini.
                </p>
              ) : (
                activities.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="flex items-center gap-2.5 cursor-pointer group hover:bg-brand-light-green/50 p-1.5 rounded-xl transition-all w-full"
                    title={`${item.label} (${item.sublabel || ""})`}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-light-green group-hover:ring-1 group-hover:ring-brand-green transition-all"
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                        <circle cx="12" cy="8" r="3" fill={item.color} opacity="0.8" />
                        <path
                          d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"
                          stroke={item.color}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          opacity="0.8"
                        />
                      </svg>
                    </div>

                    <div className="flex flex-col justify-center min-w-0 flex-1">
                      <span className="text-2xs font-bold text-text-primary truncate group-hover:text-brand-deep-green transition-colors leading-tight">
                        {item.label}
                      </span>
                      <span className="text-3xs text-text-secondary truncate leading-tight mt-0.5">
                        {item.time}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Section Divider */}
        <div className="w-full h-px bg-text-tertiary/40" aria-hidden="true" />

        {/* ── Section 3: Contacts ───────────────────── */}
        <section className="flex flex-col gap-2.5 w-full" aria-labelledby="rp-contacts-title">
          <div className="pb-1.5 border-b border-text-tertiary/40">
            <h2
              id="rp-contacts-title"
              className="text-xs font-bold text-brand-deep-green uppercase tracking-wider"
            >
              Contacts
            </h2>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            {contacts.slice(0, 4).map((contact) => (
              <div
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className="flex items-center gap-2.5 cursor-pointer group hover:bg-brand-light-green/50 p-1.5 rounded-xl transition-all w-full"
                title={`${contact.name} · ${contact.role}`}
              >
                <div className="relative flex-shrink-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-2xs font-bold text-brand-deep-green shadow-2xs"
                    style={{ background: contact.color }}
                    aria-hidden="true"
                  >
                    {contact.initials}
                  </div>
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-white",
                      contact.status === "online" ? "bg-emerald-500" :
                      contact.status === "away" ? "bg-amber-400" : "bg-gray-300"
                    )}
                    title={contact.status}
                  />
                </div>

                <div className="flex flex-col justify-center min-w-0 flex-1">
                  <span className="text-2xs font-bold text-text-primary truncate group-hover:text-brand-deep-green transition-colors leading-tight">
                    {contact.name}
                  </span>
                  <span className="text-3xs text-text-secondary truncate leading-tight">
                    {contact.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>

      {/* ── Contact Detail Quick Modal ──────────── */}
      {selectedContact && (
        <Modal
          isOpen={Boolean(selectedContact)}
          onClose={() => setSelectedContact(null)}
          title="Detail Anggota Tim"
          size="sm"
        >
          <div className="flex flex-col items-center text-center p-4 gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-brand-deep-green shadow-sm"
              style={{ background: selectedContact.color }}
            >
              {selectedContact.initials}
            </div>

            <div>
              <h3 className="text-base font-bold text-text-primary">{selectedContact.name}</h3>
              <p className="text-xs text-text-secondary mt-0.5">{selectedContact.role}</p>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    selectedContact.status === "online" ? "bg-emerald-500" :
                    selectedContact.status === "away" ? "bg-amber-400" : "bg-gray-400"
                  )}
                />
                <span className="text-2xs font-semibold uppercase tracking-wider text-text-secondary">
                  {selectedContact.status}
                </span>
              </div>
            </div>

            {selectedContact.email && (
              <div className="w-full bg-bg-lighter rounded-xl p-3 flex items-center justify-between gap-2 text-xs border border-text-tertiary/40">
                <div className="flex items-center gap-2 truncate text-text-primary">
                  <Mail size={14} className="text-brand-green flex-shrink-0" />
                  <span className="truncate">{selectedContact.email}</span>
                </div>
                <button
                  onClick={() => copyContactEmail(selectedContact.email)}
                  className="p-1.5 rounded-lg hover:bg-white text-text-secondary hover:text-brand-green transition-colors flex-shrink-0"
                  title="Salin Email"
                >
                  {copiedEmail ? <Check size={14} className="text-brand-green" /> : <Copy size={14} />}
                </button>
              </div>
            )}

            <div className="flex gap-2 w-full pt-2">
              <button
                onClick={() => setSelectedContact(null)}
                className="btn-ghost flex-1 py-2 text-xs"
              >
                Tutup
              </button>
              {selectedContact.email && (
                <a
                  href={`mailto:${selectedContact.email}`}
                  className="btn-primary flex-1 py-2 text-xs flex items-center justify-center gap-1.5 text-center font-bold"
                >
                  <Mail size={14} />
                  <span>Kirim Email</span>
                </a>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default RightPanel;

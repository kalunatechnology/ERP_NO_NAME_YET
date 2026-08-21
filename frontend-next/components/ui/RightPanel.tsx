"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Bell, Activity, Users, ChevronRight, ExternalLink } from "lucide-react";
import { fetchDynamicRightPanelData, DynamicFeedItem, DynamicContact } from "@/lib/api/feed.api";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export function RightPanel() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<DynamicFeedItem[]>([]);
  const [activities, setActivities] = useState<DynamicFeedItem[]>([]);
  const [contacts, setContacts] = useState<DynamicContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedContact, setSelectedContact] = useState<DynamicContact | null>(null);

  const loadFeed = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await fetchDynamicRightPanelData();
      setNotifications(data.notifications);
      setActivities(data.activities);
      setContacts(data.contacts);
    } catch {
      // ignore silently on background poll
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
    // Auto-refresh feed every 45 seconds for live background sync
    const timer = setInterval(() => loadFeed(true), 45000);
    return () => clearInterval(timer);
  }, [loadFeed]);

  const handleItemClick = (item: DynamicFeedItem) => {
    if (item.href) {
      router.push(item.href);
      toast(`Membuka ${item.label}`, { icon: "🔗" });
    }
  };

  return (
    <aside
      className="flex flex-col bg-bg-light border-l border-text-tertiary flex-shrink-0 select-none overflow-y-auto"
      style={{
        width: "var(--right-panel-w, 260px)",
        minHeight: "100%",
        padding: "24px 16px",
        gap: "24px",
        boxSizing: "border-box"
      }}
      role="complementary"
      aria-label="Panel informasi real-time"
    >
      {/* ── Section 1: Notifications ───────────────── */}
      <section className="flex flex-col gap-3" aria-labelledby="rp-notifications-title">
        <div className="flex items-center justify-between" style={{ width: "196px" }}>
          <h2
            id="rp-notifications-title"
            className="text-base font-medium text-brand-deep-green flex items-center gap-1.5"
            style={{ lineHeight: "20px" }}
          >
            Notifications
          </h2>
          <button
            onClick={() => loadFeed(true)}
            className={cn(
              "text-text-secondary hover:text-brand-deep-green p-0.5 rounded transition-colors",
              refreshing && "animate-spin"
            )}
            title="Sinkronkan notifikasi live"
            aria-label="Segarkan notifikasi"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 animate-pulse" style={{ width: "196px", height: "36px" }}>
                <div className="w-9 h-9 rounded-full bg-brand-light-green/60 flex-shrink-0" />
                <div className="flex flex-col gap-1 flex-1">
                  <div className="h-2.5 bg-gray-200 rounded w-4/5" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.length === 0 ? (
              <p className="text-2xs text-text-secondary py-2" style={{ width: "196px" }}>
                Semua notifikasi telah diselesaikan.
              </p>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="flex items-center gap-2 cursor-pointer group hover:opacity-90 transition-opacity"
                  style={{ width: "196px", height: "36px" }}
                  title={`${item.label} (${item.sublabel || ""})`}
                >
                  {/* Avatar 36x36 Circle with SVG */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-light-green group-hover:ring-1 group-hover:ring-brand-green transition-all"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
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

                  {/* Text Info */}
                  <div className="flex flex-col justify-center min-w-0 flex-1">
                    <span
                      className="text-xs font-normal text-text-primary truncate group-hover:text-brand-deep-green transition-colors"
                      style={{ lineHeight: "15px" }}
                    >
                      {item.label}
                    </span>
                    <span
                      className="text-2xs font-normal text-text-secondary truncate"
                      style={{ lineHeight: "13px" }}
                    >
                      {item.time}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Section Divider 1 */}
      <div
        className="w-full h-px bg-text-secondary opacity-30"
        style={{ width: "199px" }}
        aria-hidden="true"
      />

      {/* ── Section 2: Activities ─────────────────── */}
      <section className="flex flex-col gap-3" aria-labelledby="rp-activities-title">
        <h2
          id="rp-activities-title"
          className="text-base font-medium text-brand-deep-green"
          style={{ lineHeight: "20px" }}
        >
          Activities
        </h2>

        {loading ? (
          <div className="flex flex-col gap-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 animate-pulse" style={{ width: "196px", height: "36px" }}>
                <div className="w-9 h-9 rounded-full bg-brand-light-green/60 flex-shrink-0" />
                <div className="flex flex-col gap-1 flex-1">
                  <div className="h-2.5 bg-gray-200 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activities.length === 0 ? (
              <p className="text-2xs text-text-secondary py-2" style={{ width: "196px" }}>
                Belum ada log aktivitas hari ini.
              </p>
            ) : (
              activities.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="flex items-center gap-2 cursor-pointer group hover:opacity-90 transition-opacity"
                  style={{ width: "196px", height: "36px" }}
                  title={`${item.label} (${item.sublabel || ""})`}
                >
                  {/* Avatar 36x36 Circle with SVG */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-light-green group-hover:ring-1 group-hover:ring-brand-green transition-all"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
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

                  {/* Text Info */}
                  <div className="flex flex-col justify-center min-w-0 flex-1">
                    <span
                      className="text-xs font-normal text-text-primary truncate group-hover:text-brand-deep-green transition-colors"
                      style={{ lineHeight: "15px" }}
                    >
                      {item.label}
                    </span>
                    <span
                      className="text-2xs font-normal text-text-secondary truncate"
                      style={{ lineHeight: "13px" }}
                    >
                      {item.time}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Section Divider 2 */}
      <div
        className="w-full h-px bg-text-secondary opacity-30"
        style={{ width: "199px" }}
        aria-hidden="true"
      />

      {/* ── Section 3: Contacts ───────────────────── */}
      <section className="flex flex-col gap-3" aria-labelledby="rp-contacts-title">
        <h2
          id="rp-contacts-title"
          className="text-base font-medium text-brand-deep-green"
          style={{ lineHeight: "20px" }}
        >
          Contacts
        </h2>

        <div className="flex flex-col gap-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => {
                setSelectedContact(contact);
                toast(`Kontak: ${contact.name} (${contact.role})`, { icon: "👤" });
              }}
              className="flex items-center gap-2 cursor-pointer group hover:bg-brand-light-green/40 p-1 -m-1 rounded-lg transition-colors"
              style={{ width: "196px", height: "34px" }}
              title={`${contact.name} · ${contact.role}`}
            >
              {/* Avatar 32x32 Circle with Initial & Status Dot */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-brand-deep-green"
                  style={{
                    background: contact.color,
                    fontFamily: "'Google Sans', Roboto, sans-serif"
                  }}
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

              {/* Contact Name & Role */}
              <div className="flex flex-col justify-center min-w-0 flex-1">
                <span
                  className="text-sm font-normal text-text-primary truncate group-hover:text-brand-deep-green transition-colors"
                  style={{ lineHeight: "18px" }}
                >
                  {contact.name}
                </span>
                <span
                  className="text-2xs text-text-secondary truncate"
                  style={{ lineHeight: "12px" }}
                >
                  {contact.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

    </aside>
  );
}

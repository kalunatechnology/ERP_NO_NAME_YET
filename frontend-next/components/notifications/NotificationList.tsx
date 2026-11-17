"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { approveCrmProjectHandoff, fetchNotifications, fetchPendingCrmHandoffs, markNotificationAsRead, markAllNotificationsAsRead, publishNotificationStateChange, rejectCrmProjectHandoff } from '@/lib/api/feed.api';
import { formatMoney } from '@/lib/utils';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { getUserFacingApiError } from '@/lib/api/error-message';

export function NotificationList({ onItemClick }: { onItemClick?: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [handoffActionId, setHandoffActionId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [res, handoffs] = await Promise.all([
        fetchNotifications(filter),
        fetchPendingCrmHandoffs(),
      ]);
      const baseItems = res.items || [];
      const seenHandoffIds = new Set(
        baseItems
          .filter((n: any) => n.reference_type === 'CRM_DEAL_HANDOFF' && n.reference_id)
          .map((n: any) => String(n.reference_id))
      );
      const handoffNotifs = (handoffs || [])
        .filter((h) => !seenHandoffIds.has(String(h.id)))
        .map((h) => ({
          id: `crm-handoff-${h.id}`,
          handoffId: String(h.id),
          category: 'CRM_PROJECT_HANDOFF',
          title: `Permintaan Proyek Baru dari CRM: ${h.opportunity_name}`,
          description: `${h.customer_name || 'Pelanggan'} · ${formatMoney(h.deal_amount || 0)} · Diajukan ${h.requested_by_name || 'CRM'}`,
          target_url: `/projects?handoff=${encodeURIComponent(h.id)}`,
          is_read: false,
          created_at: h.created_at,
        }));
      const mergedItems = [
        ...handoffNotifs,
        ...baseItems.map((n: any) => ({
          ...n,
          handoffId: n.reference_type === 'CRM_DEAL_HANDOFF' && n.reference_id ? String(n.reference_id) : undefined,
        })),
      ];
      setNotifications(mergedItems);
      setUnreadCount((res.unreadCount || 0) + handoffNotifs.length);
    } catch (e) {
      console.warn('Failed to load notifications:', e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const handleApproveHandoff = async (e: React.MouseEvent, handoffId: string) => {
    e.stopPropagation();
    if (handoffActionId) return;
    setHandoffActionId(handoffId);
    try {
      await approveCrmProjectHandoff(handoffId);
      toast.success("Permintaan proyek dari CRM berhasil di-ACC dan dibuat!");
      await loadData();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal meng-ACC permintaan proyek dari CRM."));
    } finally {
      setHandoffActionId(null);
    }
  };

  const handleRejectHandoff = async (e: React.MouseEvent, handoffId: string) => {
    e.stopPropagation();
    if (handoffActionId) return;
    const reason = window.prompt("Masukkan alasan penolakan permintaan proyek ini:", "Belum siap dikerjakan / data belum lengkap");
    if (reason === null) return;
    setHandoffActionId(handoffId);
    try {
      await rejectCrmProjectHandoff(handoffId, reason.trim());
      toast.success("Permintaan proyek dari CRM telah ditolak.");
      await loadData();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Gagal menolak permintaan proyek dari CRM."));
    } finally {
      setHandoffActionId(null);
    }
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleItemClick = async (notif: any) => {
    // 1. Jika belum dibuka, langsung ubah state secara optimistik & panggil API
    if (!notif.is_read) {
      setNotifications(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      publishNotificationStateChange(String(notif.id));
      try {
        await markNotificationAsRead(notif.id);
      } catch (error) {
        toast.error(getUserFacingApiError(error, "Notifikasi belum dapat ditandai sudah dibuka. Coba segarkan daftar."));
        setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, is_read: false } : n)));
        setUnreadCount(prev => prev + 1);
        publishNotificationStateChange(undefined, "refresh");
      }
    }

    onItemClick?.();

    // 2. Arahkan user ke halaman/catatan notulensi sesuai action_url / target_url
    const destination = notif.action_url || notif.target_url;
    if (destination) {
      router.push(destination);
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    publishNotificationStateChange();
    try {
      await markAllNotificationsAsRead();
    } catch (error) {
      toast.error(getUserFacingApiError(error, "Notifikasi belum dapat ditandai sudah dibuka. Coba segarkan daftar."));
      publishNotificationStateChange(undefined, "refresh");
      await loadData();
      return;
    }
    loadData();
  };

  return (
    <div className="w-full max-w-full bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header & Filter Tab */}
      <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              "px-2.5 py-1 text-xs rounded-md font-medium transition-all",
              filter === 'all' ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={cn(
              "px-2.5 py-1 text-xs rounded-md font-medium flex items-center gap-1.5 transition-all",
              filter === 'unread' ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            Belum Dibuka
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1"
          >
            <CheckCheck size={14} />
            <span>Tandai semua dibaca</span>
          </button>
        )}
      </div>

      {/* Daftar Item Notifikasi */}
      <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
        {loading && notifications.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            <span>Memuat notifikasi...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <Bell size={20} className="text-slate-300" />
            <span>{filter === 'unread' ? 'Tidak ada notifikasi yang belum dibuka.' : 'Belum ada notifikasi.'}</span>
          </div>
        ) : (
          notifications.map((notif) => {
            const isMention = notif.category === 'MEETING_MINUTES_MENTION' || notif.type === 'MEETING_MINUTES_MENTION' || notif.category === 'NOTE_MENTION';
            return (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={cn(
                  "p-3.5 cursor-pointer transition-colors flex gap-3 items-start",
                  notif.is_read
                    ? "bg-white text-slate-500 hover:bg-slate-50" // Tampilan SUDAH DIBUKA
                    : "bg-blue-50/70 text-slate-900 hover:bg-blue-100/50" // Tampilan BELUM DIBUKA
                )}
              >
                {/* Titik Indikator Unread */}
                <div className="mt-1.5 flex-shrink-0">
                  {!notif.is_read ? (
                    <span className="block w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" />
                  ) : (
                    <span className="block w-2.5 h-2.5 rounded-full bg-transparent" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isMention && (
                      <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-800 rounded">
                        @Mention
                      </span>
                    )}
                    <p className={cn("text-xs truncate", !notif.is_read ? "font-bold text-slate-900" : "font-normal text-slate-600")}>
                      {notif.title}
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                        notif.is_read ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700",
                      )}
                    >
                      {notif.is_read ? "Sudah dibuka" : "Belum dibuka"}
                    </span>
                  </div>
                  <p className="text-xs mt-1 line-clamp-2 leading-relaxed text-slate-600">
                    {notif.description || notif.message}
                  </p>
                  {notif.handoffId && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={Boolean(handoffActionId)}
                        onClick={(e) => void handleRejectHandoff(e, notif.handoffId)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Tolak
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(handoffActionId)}
                        onClick={(e) => void handleApproveHandoff(e, notif.handoffId)}
                        className="rounded-md bg-[#0876CD] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#163D64] disabled:opacity-50"
                      >
                        {handoffActionId === notif.handoffId ? "Memproses..." : "✓ ACC & Buat Proyek"}
                      </button>
                    </div>
                  )}
                  {notif.created_at && (
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {new Date(notif.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default NotificationList;

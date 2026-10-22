"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '@/lib/api/feed.api';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NotificationList({ onItemClick }: { onItemClick?: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchNotifications(filter);
      setNotifications(res.items || []);
      setUnreadCount(res.unreadCount || 0);
    } catch (e) {
      console.warn('Failed to load notifications:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  const handleItemClick = async (notif: any) => {
    // 1. Jika belum dibuka, langsung ubah state secara optimistik & panggil API
    if (!notif.is_read) {
      setNotifications(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      try {
        await markNotificationAsRead(notif.id);
      } catch (err) {
        console.warn('Mark as read failed:', err);
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
    try {
      await markAllNotificationsAsRead();
    } catch (err) {
      console.warn('Mark all read failed:', err);
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
                  </div>
                  <p className="text-xs mt-1 line-clamp-2 leading-relaxed text-slate-600">
                    {notif.description || notif.message}
                  </p>
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

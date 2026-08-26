"use client";

import React, { useEffect, useState } from "react";
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  Bell,
  UploadCloud,
} from "lucide-react";
import { feedApi, SidebarFeedResponse } from "@/lib/api/feed.api";

export function RightSidebar() {
  const [data, setData] = useState<SidebarFeedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    feedApi
      .getSidebarFeed()
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        console.warn("Sidebar feed fallback activated:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const getNotificationIcon = (category: string) => {
    switch (category) {
      case "DOCUMENT":
        return FileText;
      case "ACCESS_REQUEST":
        return ShieldCheck;
      case "STATUS_UPDATE":
        return CheckCircle2;
      default:
        return Bell;
    }
  };

  return (
    <aside className="hidden xl:flex h-screen w-72 shrink-0 flex-col overflow-y-auto border-l border-[#E5E9E2] bg-[#FDFDFD] p-4 text-[#0E341F] select-none no-scrollbar">
      {/* 1. Notifications Section */}
      <section>
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-xs font-extrabold tracking-tight text-[#0E341F] uppercase">
            Notifications
          </h3>
          {data?.notifications?.some((n) => !n.is_read) && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#5A861F] ring-2 ring-[#F0FEE0]" />
          )}
        </div>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {isLoading ? (
            <div className="space-y-1.5 animate-pulse">
              <div className="h-7 bg-stone-100 rounded-lg" />
              <div className="h-7 bg-stone-100 rounded-lg" />
            </div>
          ) : (
            data?.notifications?.map((item) => {
              const Icon = getNotificationIcon(item.category);
              return (
                <div key={item.id} className="flex items-start gap-2 group cursor-pointer">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0FEE0] text-[#275433]">
                    <Icon className="h-3 w-3 stroke-[2]" />
                  </div>
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-[11px] font-bold text-[#0E341F] group-hover:text-[#275433] truncate">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-[#768779]">{item.formatted_time}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <hr className="my-3.5 border-[#EEF2E8]" />

      {/* 2. Activities Section */}
      <section>
        <h3 className="text-xs font-extrabold tracking-tight text-[#0E341F] uppercase pb-1">
          Activities
        </h3>
        <div className="mt-2.5 flex flex-col gap-2.5">
          {isLoading ? (
            <div className="space-y-1.5 animate-pulse">
              <div className="h-7 bg-stone-100 rounded-lg" />
              <div className="h-7 bg-stone-100 rounded-lg" />
            </div>
          ) : (
            data?.activities?.map((act) => (
              <div key={act.id} className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0FEE0] text-[#275433]">
                  <UploadCloud className="h-3 w-3 stroke-[2]" />
                </div>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-[11px] text-[#0E341F]">
                    <strong className="font-bold text-[#0E341F]">{act.actor?.full_name || act.actor?.username || "Sistem"}</strong> {act.verb}
                  </span>
                  <span className="text-[10px] text-[#768779]">{act.formatted_time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <hr className="my-3.5 border-[#EEF2E8]" />

      {/* 3. Contacts Section */}
      <section>
        <h3 className="text-xs font-extrabold tracking-tight text-[#0E341F] uppercase pb-1">
          Contacts
        </h3>
        <div className="mt-2.5 flex flex-col gap-2">
          {isLoading ? (
            <div className="space-y-1.5 animate-pulse">
              <div className="h-7 bg-stone-100 rounded-full" />
              <div className="h-7 bg-stone-100 rounded-full" />
            </div>
          ) : (
            data?.contacts?.map((contact) => (
              <div key={contact.id} className="flex items-center gap-2">
                {contact.avatar_url ? (
                  <img
                    src={contact.avatar_url}
                    alt={contact.full_name}
                    className="h-6 w-6 rounded-full object-cover ring-1 ring-stone-200"
                  />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#275433] text-[10px] font-bold text-white">
                    {(contact.full_name || contact.username || "U").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-[#0E341F] truncate">{contact.full_name || contact.username}</span>
                  <span className="text-[9px] text-[#5A861F] font-semibold">Active now</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

export default RightSidebar;

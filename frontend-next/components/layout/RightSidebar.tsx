"use client";

import React, { useEffect, useState } from "react";
import {
  FileText,
  RotateCcw,
  ShieldCheck,
  User,
  UploadCloud,
  CheckCircle2,
  Bell,
  Activity,
  Users
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
    <aside className="hidden lg:flex h-screen w-80 shrink-0 flex-col overflow-y-auto border-l border-stone-200/80 bg-[#fbfdfa] p-6 text-[#2d4a0b]">
      {/* 1. Notifications Section */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight text-[#2d4a0b]">Notifications</h3>
          {data?.notifications?.some((n) => !n.is_read) && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
          )}
        </div>
        <div className="mt-4 flex flex-col gap-3.5">
          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-9 bg-stone-100 rounded-lg" />
              <div className="h-9 bg-stone-100 rounded-lg" />
            </div>
          ) : (
            data?.notifications?.map((item) => {
              const Icon = getNotificationIcon(item.category);
              return (
                <div key={item.id} className="flex items-start gap-3 group cursor-pointer">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#edf6e8] text-[#558b2f]">
                    <Icon className="h-4 w-4 stroke-[2]" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs font-semibold text-stone-800 group-hover:text-[#4d7c0f]">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-stone-400">{item.formatted_time}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <hr className="my-5 border-stone-200" />

      {/* 2. Activities Section */}
      <section>
        <h3 className="text-base font-bold tracking-tight text-[#2d4a0b]">Activities</h3>
        <div className="mt-4 flex flex-col gap-3.5">
          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-9 bg-stone-100 rounded-lg" />
              <div className="h-9 bg-stone-100 rounded-lg" />
            </div>
          ) : (
            data?.activities?.map((act) => (
              <div key={act.id} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#edf6e8] text-[#558b2f]">
                  <UploadCloud className="h-4 w-4 stroke-[2]" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-semibold text-stone-800">
                    <strong className="font-semibold text-stone-900">{act.actor?.full_name || act.actor?.username || "Sistem"}</strong> {act.verb}
                  </span>
                  <span className="text-[11px] text-stone-400">{act.formatted_time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <hr className="my-5 border-stone-200" />

      {/* 3. Contacts Section */}
      <section>
        <h3 className="text-base font-bold tracking-tight text-[#2d4a0b]">Contacts</h3>
        <div className="mt-4 flex flex-col gap-3">
          {isLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-8 bg-stone-100 rounded-full" />
              <div className="h-8 bg-stone-100 rounded-full" />
            </div>
          ) : (
            data?.contacts?.map((contact) => (
              <div key={contact.id} className="flex items-center gap-3">
                {contact.avatar_url ? (
                  <img
                    src={contact.avatar_url}
                    alt={contact.full_name}
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-stone-200"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                    {(contact.full_name || contact.username || "U").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-stone-800">{contact.full_name || contact.username}</span>
                  <span className="text-[10px] text-emerald-600">Active now</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

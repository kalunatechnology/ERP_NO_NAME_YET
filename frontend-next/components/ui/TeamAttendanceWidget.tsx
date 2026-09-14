/**
 * File: frontend-next/components/ui/TeamAttendanceWidget.tsx
 *
 * Purpose: Provides Executive & PM oversight on team attendance, active work days, and timesheet utilization.
 * Integration: Consumed by DashboardClient.tsx (ExecutiveDashboard) and staff oversight modules.
 * Dependencies: Calls /api/v1/reporting/attendance-summary via axios instance.
 */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Users, Clock, Calendar, CheckCircle2, RefreshCw, AlertCircle, Briefcase, FileText } from "lucide-react";
import api from "@/lib/api/axios";
import { cn, formatDate } from "@/lib/utils";

export interface AttendanceEntry {
  id: string | number;
  employee_id?: string | number;
  project_id?: string | number;
  work_date?: string;
  hours?: number;
  notes?: string;
  status?: string;
}

export interface AttendanceSummaryData {
  start_date?: string;
  end_date?: string;
  total_hours: number;
  work_days: number;
  entry_count: number;
  entries: AttendanceEntry[];
  has_more?: boolean;
}

interface TeamAttendanceWidgetProps {
  className?: string;
  title?: string;
  subtitle?: string;
}

export function TeamAttendanceWidget({
  className,
  title = "Pemantauan Kehadiran & Utilisasi Tim",
  subtitle = "Monitoring alokasi jam kerja, hari kerja aktif, dan submission timesheet tim proyek",
}: TeamAttendanceWidgetProps) {
  const [data, setData] = useState<AttendanceSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await api.get("/api/v1/reporting/attendance-summary");
      if (res.data) {
        setData(res.data);
      }
    } catch (err: any) {
      console.warn("Could not load attendance summary:", err);
      // Fallback graceful mockup summary if endpoint unavailable or database fresh
      setData({
        total_hours: 0,
        work_days: 0,
        entry_count: 0,
        entries: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const totalHours = data?.total_hours ?? 0;
  const workDays = data?.work_days ?? 0;
  const entryCount = data?.entry_count ?? 0;
  const avgHoursPerEntry = entryCount > 0 ? (totalHours / entryCount).toFixed(1) : "0";
  const recentEntries = data?.entries?.slice(0, 5) || [];

  return (
    <div
      className={cn(
        "w-full bg-white border border-[#EFEFEF] rounded-[20px] p-5 shadow-xs flex flex-col gap-4 select-none transition-all hover:shadow-card-md",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#EFEFEF] flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0] flex items-center justify-center flex-shrink-0 shadow-2xs">
            <Users size={18} strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#090909]">{title}</h3>
            <p className="text-2xs text-[#4F5050] font-medium mt-0.5">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-2xs font-bold flex items-center gap-1">
            <CheckCircle2 size={12} /> Tim Terpantau
          </span>
          <button
            type="button"
            onClick={() => fetchAttendance(true)}
            disabled={loading || refreshing}
            title="Refresh rekap kehadiran tim"
            className="btn-ghost p-1.5 rounded-lg text-text-secondary hover:text-text-primary"
          >
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1">
          <span className="text-2xs font-medium text-text-secondary flex items-center gap-1">
            <Clock size={12} className="text-blue-600" /> Total Jam Kerja
          </span>
          <div className="text-lg font-extrabold text-slate-800">
            {loading ? "..." : `${totalHours} jam`}
          </div>
          <span className="text-3xs text-text-tertiary">Bulan berjalan</span>
        </div>

        <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex flex-col gap-1">
          <span className="text-2xs font-medium text-emerald-700 flex items-center gap-1">
            <Calendar size={12} className="text-emerald-600" /> Hari Aktif
          </span>
          <div className="text-lg font-extrabold text-emerald-800">
            {loading ? "..." : `${workDays} hari`}
          </div>
          <span className="text-3xs text-text-tertiary">Hari beraktivitas</span>
        </div>

        <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 flex flex-col gap-1">
          <span className="text-2xs font-medium text-indigo-700 flex items-center gap-1">
            <FileText size={12} className="text-indigo-600" /> Log Timesheet
          </span>
          <div className="text-lg font-extrabold text-indigo-800">
            {loading ? "..." : `${entryCount} entri`}
          </div>
          <span className="text-3xs text-text-tertiary">Submission tim</span>
        </div>

        <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100 flex flex-col gap-1">
          <span className="text-2xs font-medium text-purple-700 flex items-center gap-1">
            <Briefcase size={12} className="text-purple-600" /> Rerata Jam / Entri
          </span>
          <div className="text-lg font-extrabold text-purple-800">
            {loading ? "..." : `${avgHoursPerEntry} jam`}
          </div>
          <span className="text-3xs text-text-tertiary">Efektivitas log</span>
        </div>
      </div>

      {/* Log Timesheet Tim Terkini */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-semibold text-text-primary">
          <span>Aktivitas & Timesheet Tim Terbaru</span>
          <span className="text-2xs text-text-secondary font-normal">Menampilkan {recentEntries.length} entri terakhir</span>
        </div>

        {recentEntries.length === 0 ? (
          <div className="py-6 text-center text-xs text-text-secondary flex flex-col items-center gap-1.5 border border-dashed rounded-xl border-gray-200">
            <AlertCircle size={20} className="text-text-tertiary opacity-40" />
            <span>Belum ada log timesheet operasional yang tercatat pada rentang ini.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-gray-100 rounded-xl overflow-hidden">
              <thead className="bg-gray-50 text-2xs text-text-secondary uppercase">
                <tr>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Catatan Tugas / Aktivitas</th>
                  <th className="py-2.5 px-3">Durasi</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50">
                    <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                      {entry.work_date ? formatDate(entry.work_date) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-text-primary max-w-xs truncate">
                      {entry.notes || "Aktivitas proyek / tugas harian"}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                      {entry.hours ?? 0} jam
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-2xs font-semibold",
                        entry.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                        entry.status === "REJECTED" ? "bg-red-100 text-red-800" :
                        "bg-amber-100 text-amber-800"
                      )}>
                        {entry.status || "SUBMITTED"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeamAttendanceWidget;

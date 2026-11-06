"use client";

import { useCallback, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatDate, localDateKey } from "@/lib/utils";
import { useWeeklyPeriodFilter } from "@/components/tasks/useWeeklyPeriodFilter";

export function useCRMPeriodFilter() {
  const [today] = useState(() => localDateKey());
  const calendar = useWeeklyPeriodFilter(today);
  const [week, setWeek] = useState("ALL");

  const changeMonth = (month: string) => {
    calendar.changeMonth(month);
    setWeek("ALL");
  };
  const reset = () => {
    calendar.reset();
    setWeek("ALL");
  };

  const matches = useCallback((value: unknown) => {
    const dateKey = value instanceof Date && !Number.isNaN(value.getTime())
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : typeof value === "string" ? value.slice(0, 10) : "";
    // Keep CRM records visible during initial calendar loading or if the shared
    // Project Management calendar is temporarily unavailable.
    if (dateKey.length < 10) return false;
    if (!calendar.month || calendar.error) return true;
    if (dateKey.slice(0, 7) !== calendar.month) return false;
    if (week === "ALL") return true;
    const selectedPeriod = calendar.periods.find(period => period.week === Number(week));
    if (!selectedPeriod) return false;
    const start = selectedPeriod.filter_start || selectedPeriod.start;
    const end = selectedPeriod.filter_end || selectedPeriod.end;
    return dateKey >= start && dateKey <= end;
  }, [calendar.month, calendar.periods, week]);

  return { calendar, week, setWeek, changeMonth, matches, reset };
}

export type CRMPeriodFilter = ReturnType<typeof useCRMPeriodFilter>;

export function CRMPeriodToolbar({ filter }: { filter: CRMPeriodFilter }) {
  const { calendar, week, setWeek, changeMonth, reset } = filter;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-slate-50/70 p-3">
      <span className="mr-1 inline-flex h-10 items-center gap-1.5 text-xs font-semibold text-text-secondary"><CalendarDays size={14} /> Periode</span>
      <label className="text-[10px] font-semibold text-text-secondary">
        Bulan
        <input type="month" value={calendar.month} onChange={event => changeMonth(event.target.value)} className="input mt-1 block h-9 bg-white text-xs" />
      </label>
      <button type="button" onClick={reset} className="btn-ghost h-9 px-2.5 text-xs">Bulan ini</button>
      <label className="text-[10px] font-semibold text-text-secondary">
        Minggu
        <select value={week} disabled={calendar.loading || Boolean(calendar.error)} onChange={event => setWeek(event.target.value)} className="input mt-1 block h-9 min-w-40 bg-white text-xs disabled:opacity-50">
          <option value="ALL">Semua minggu</option>
          {calendar.periods.map(period => <option key={period.id} value={period.week}>Minggu {period.week} · {formatDate(period.start)}–{formatDate(period.end)}</option>)}
        </select>
      </label>
      {calendar.loading && <span className="pb-2 text-[10px] text-text-secondary">Memuat periode…</span>}
      {calendar.error && <span className="pb-2 text-[10px] text-red-700">Periode tidak dapat dimuat. {calendar.error}</span>}
    </div>
  );
}

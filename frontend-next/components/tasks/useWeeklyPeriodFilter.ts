"use client";

import { useEffect, useState } from "react";
import { getApiErrorDetail, getWeeklyPeriodCalendar, type WeeklyPeriodCalendar } from "@/lib/api/project.api";

/** Read the canonical backend calendar; never infer monthly weeks from project sequence numbers. */
export function useWeeklyPeriodFilter(today: string) {
  const [requestedMonth, setRequestedMonth] = useState<string>();
  const [calendar, setCalendar] = useState<WeeklyPeriodCalendar | null>(null);
  const [week, setWeek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void getWeeklyPeriodCalendar(today, requestedMonth).then(result => {
      if (cancelled) return;
      setCalendar(result);
      setWeek(result.month === result.current.month ? result.current.week : 1);
    }).catch(failure => {
      if (!cancelled) { setCalendar(null); setError(getApiErrorDetail(failure, "Gagal memuat periode Weekly. Silakan coba kembali.")); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [today, requestedMonth, revision]);

  const matchesMonth = calendar?.month === (requestedMonth ?? calendar?.current.month);
  const periods = matchesMonth ? calendar?.periods ?? [] : [];
  const period = periods.find(item => item.week === week) ?? null;
  return {
    month: requestedMonth ?? calendar?.month ?? "",
    week, setWeek, periods, period,
    loading: loading || (!error && !period), error,
    changeMonth: (month: string) => { if (month) setRequestedMonth(month); },
    reset: () => { setRequestedMonth(undefined); setWeek(calendar?.current.week ?? 1); },
    retry: () => setRevision(value => value + 1),
  };
}

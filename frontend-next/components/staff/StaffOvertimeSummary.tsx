"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, Hourglass } from "lucide-react";
import { getApiErrorDetail, getStaffOvertimeSummary, StaffOvertimeSummary as Summary } from "@/lib/api/project.api";

interface StaffOvertimeSummaryProps {
  refreshKey?: number;
  initialSummary?: Summary | null;
}

export function StaffOvertimeSummary({ refreshKey = 0, initialSummary }: StaffOvertimeSummaryProps) {
  const [summary, setSummary] = useState<Summary | null>(initialSummary ?? null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSummary(await getStaffOvertimeSummary());
    } catch (requestError) {
      setError(getApiErrorDetail(requestError, "Ringkasan lembur belum dapat dimuat."));
    }
  }, []);

  useEffect(() => {
    if (initialSummary && refreshKey === 0) setSummary(initialSummary);
    else void load();
  }, [initialSummary, load, refreshKey]);

  if (error && !summary) return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>;

  const values = summary || { thisWeekHours: 0, thisMonthHours: 0, pendingHours: 0, approvedHours: 0, lastOvertimeDate: null };
  const cards = [
    { label: "Lembur Minggu Ini", value: values.thisWeekHours, icon: Clock3 },
    { label: "Lembur Bulan Ini", value: values.thisMonthHours, icon: CalendarClock },
    { label: "Menunggu Persetujuan", value: values.pendingHours, icon: Hourglass },
    { label: "Lembur Disetujui", value: values.approvedHours, icon: CheckCircle2 },
  ];

  return <section aria-label="Ringkasan lembur Staff">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => <div key={label} className="card rounded-xl p-3">
        <div className="flex items-center justify-between gap-2"><span className="text-2xs font-semibold text-text-secondary">{label}</span><Icon size={15} className="text-[#294BB2]" /></div>
        <div className="mt-2 text-xl font-bold text-text-primary">{Number(value || 0)} <span className="text-xs font-medium text-text-secondary">jam</span></div>
      </div>)}
    </div>
    {error && <p className="mt-2 text-2xs text-amber-700">Data terakhir ditampilkan. Refresh gagal: {error}</p>}
  </section>;
}

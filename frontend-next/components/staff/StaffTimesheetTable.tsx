"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getApiErrorDetail, getStaffTimesheets, Project, StaffTimesheet } from "@/lib/api/project.api";
import { normalizeDateKey } from "@/lib/utils";
import { getStatusStyle } from "@/lib/ui/semantic-styles";

interface StaffTimesheetTableProps {
  projects: Project[];
  refreshKey: number;
}

const PAGE_SIZE = 10;

export function StaffTimesheetTable({ projects, refreshKey }: StaffTimesheetTableProps) {
  const [rows, setRows] = useState<StaffTimesheet[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projectNames = useMemo(() => new Map(projects.map((project) => [String(project.id), project.project_name || project.name || project.project_code || "Proyek"])), [projects]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getStaffTimesheets({ page, page_size: PAGE_SIZE });
      setRows(result.rows);
      setCount(result.count);
    } catch (requestError) {
      setError(getApiErrorDetail(requestError, "Riwayat timesheet gagal dimuat."));
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <section className="card overflow-hidden rounded-xl" aria-labelledby="staff-timesheet-history-title">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4">
        <div>
          <h2 id="staff-timesheet-history-title" className="text-sm font-bold text-text-primary">Riwayat Timesheet Saya</h2>
          <p className="mt-0.5 text-xs text-text-secondary">{count} catatan dalam company aktif</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn-ghost gap-1.5 px-3 py-1.5 text-xs">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error ? <div role="alert" className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div> : loading ? (
        <div className="p-8 text-center text-xs text-text-secondary">Memuat riwayat timesheet...</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-secondary">Belum ada timesheet. Catat jam kerja melalui formulir di atas.</div>
      ) : (
        <div className="table-scroll-wrapper">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-text-secondary">
              <tr><th className="px-4 py-2.5">Tanggal</th><th className="px-4 py-2.5">Proyek</th><th className="px-4 py-2.5">Jam kerja</th><th className="px-4 py-2.5">Lembur</th><th className="px-4 py-2.5">Alasan</th><th className="px-4 py-2.5">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const style = getStatusStyle(row.approval_status);
                return <tr key={row.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{normalizeDateKey(row.work_date) || "-"}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{row.project_id ? projectNames.get(String(row.project_id)) || `Project ${String(row.project_id).slice(0, 8)}` : "-"}</td>
                  <td className="px-4 py-3">{Number(row.hours || 0)} jam</td>
                  <td className="px-4 py-3">{Number(row.overtime_hours || 0)} jam</td>
                  <td className="px-4 py-3 text-text-secondary">{row.overtime_reason || "-"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-2xs font-semibold ${style}`}>{row.approval_status}</span></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}

      {count > PAGE_SIZE && <div className="flex items-center justify-end gap-2 border-t border-gray-100 p-3 text-xs">
        <button type="button" className="btn-ghost px-3 py-1" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</button>
        <span className="text-text-secondary">Halaman {page} / {totalPages}</span>
        <button type="button" className="btn-ghost px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Berikutnya</button>
      </div>}
    </section>
  );
}

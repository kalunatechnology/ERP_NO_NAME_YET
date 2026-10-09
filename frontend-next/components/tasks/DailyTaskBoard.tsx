"use client";

import { CalendarDays, ArrowUpRight } from "lucide-react";
import type { DailyTask, DailyTaskStatus } from "@/lib/api/project.api";
import type { PersonalDailyTaskRecord } from "@/lib/tasks/personal-workspace";
import { formatDate } from "@/lib/utils";

const groups: { id: DailyTaskStatus; label: string; color: string }[] = [
  { id: "NOT_STARTED", label: "Belum mulai", color: "#64748B" },
  { id: "IN_PROGRESS", label: "Sedang berjalan", color: "#294BB2" },
  { id: "BLOCKED", label: "Terkendala", color: "#D34848" },
  { id: "COMPLETED", label: "Selesai", color: "#6366C4" },
];
function state(task: DailyTask): DailyTaskStatus {
  if (["COMPLETED", "DONE"].includes(task.status)) return "COMPLETED";
  if (task.is_blocked || task.status === "BLOCKED") return "BLOCKED";
  return task.status === "NOT_STARTED" ? "NOT_STARTED" : "IN_PROGRESS";
}

export function DailyTaskBoard({ records, canWrite, onEdit, onTransition }: {
  canWrite: boolean;
  records: PersonalDailyTaskRecord[]; onEdit: (task: DailyTask) => void;
  onTransition: (task: DailyTask, status: DailyTaskStatus) => void;
}) {
  return <div className="min-w-0">
    <p className="mb-3 text-xs text-text-secondary">{canWrite ? "Pindahkan kartu untuk memilih status, lalu simpan detail pekerjaan. Status selesai memerlukan Output Hasil." : "Board ditampilkan dengan akses baca. Perubahan memerlukan akses tulis pada modul Proyek."}</p>
    <div className="overflow-x-auto pb-3"><div className="flex w-max min-w-full items-start gap-4">
      {groups.map(group => <section key={group.id} data-daily-column={group.id} onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault(); const record = records.find(item => String(item.task.id) === event.dataTransfer.getData("text/daily-id"));
        if (canWrite && record && state(record.task) !== group.id) onTransition(record.task, group.id);
      }} className="w-[280px] shrink-0 rounded-2xl border border-gray-200 bg-gray-50/70 p-3">
        <div className="mb-3 flex items-center justify-between border-t-[3px] pt-3" style={{ borderColor: group.color }}><h3 className="text-xs font-bold" style={{ color: group.color }}>{group.label}</h3><span className="rounded-md bg-white px-2 py-1 text-[10px] text-text-secondary">{records.filter(item => state(item.task) === group.id).length}</span></div>
        <div className="space-y-3">{records.filter(item => state(item.task) === group.id).map(record => <article key={record.task.id} draggable={canWrite} data-daily-card={record.task.id} onDragStart={event => { event.dataTransfer.setData("text/daily-id", String(record.task.id)); event.dataTransfer.effectAllowed = "move"; }} className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
          <span className="text-[10px] font-bold text-brand-green">{record.projectCode} · W#{record.weekNumber}</span>
          <button type="button" disabled={!canWrite} onClick={() => onEdit(record.task)} className="mt-2 flex w-full items-start justify-between gap-2 text-left text-sm font-semibold leading-5 text-text-primary enabled:hover:text-brand-green">{record.task.title || record.task.activity_input}{canWrite && <ArrowUpRight size={15} className="mt-0.5 shrink-0" />}</button>
          <p className="mb-4 mt-2 text-[11px] text-text-secondary">{record.mainTaskName}</p>
          {record.task.output_target && <p className="mb-4 line-clamp-2 text-xs leading-5 text-text-secondary">{record.task.output_target}</p>}
          <label className="block"><span className="sr-only">Status {record.task.title}</span><select aria-label={`Status ${record.task.title}`} disabled={!canWrite} value={state(record.task)} onChange={event => onTransition(record.task, event.target.value as DailyTaskStatus)} className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed" style={{ color: group.color }}>{groups.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <p className="mt-4 flex items-center gap-1.5 border-t border-gray-100 pt-3 text-[10px] text-text-secondary"><CalendarDays size={12} />{record.task.planned_date ? formatDate(record.task.planned_date) : "Tanpa tanggal"}</p>
        </article>)}{!records.some(item => state(item.task) === group.id) && <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-xs text-text-secondary">Belum ada task</p>}</div>
      </section>)}
    </div></div>
  </div>;
}

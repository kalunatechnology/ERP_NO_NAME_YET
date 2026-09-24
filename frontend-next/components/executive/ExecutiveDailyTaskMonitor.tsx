"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, FileText, Filter, Search, UserRound, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DailyTask, Project } from "@/lib/api/project.api";
import { cn, normalizeDateKey } from "@/lib/utils";

type DailyTaskRecord = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  mainTaskName: string;
  weekNumber: number;
  ownerId: string;
  ownerName: string;
  plannedDate: string;
  timeSlot: string;
  task: DailyTask;
};

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

const MARKDOWN_TOKEN_PATTERN = /(```[\s\S]*?```|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g;
const BARE_URL_PATTERN = /(^|[\s(])((?:https?:\/\/|www\.)[^\s<>{}\[\]()]*[A-Za-z0-9/#=_~-])/gi;

function linkifyNoteMarkdown(value: string) {
  return value
    .split(MARKDOWN_TOKEN_PATTERN)
    .map((segment) => {
      if (/^```|^`|^\[[^\]]+\]\([^)]+\)$/.test(segment)) return segment;
      return segment.replace(BARE_URL_PATTERN, (_match, prefix: string, url: string) => {
        const href = url.toLowerCase().startsWith("www.") ? `https://${url}` : url;
        return `${prefix}[${url}](${href})`;
      });
    })
    .join("");
}

function taskStatus(record: DailyTaskRecord) {
  const status = String(record.task.status || "IN_PROGRESS").toUpperCase();
  if (record.task.is_blocked || status === "BLOCKED") return { label: "Blocked", className: "bg-[#FFD9D9] text-[#A62121]" };
  if (status === "COMPLETED" || status === "DONE") return { label: "Finished", className: "bg-[#D9FFAE] text-[#19320D]" };
  if (status === "NOT_STARTED") return { label: "Not Started", className: "bg-[#E9EAEC] text-[#4F5050]" };
  return { label: "On Progress", className: "bg-[#FFF98B] text-[#292B30]" };
}

function FilterSelect({ icon, label, value, onChange, children }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-3 flex items-center gap-3 text-[15px] font-bold text-[#4F5050] sm:text-[17px]">
        <span className="text-[#2F80ED]">{icon}</span>{label}
      </span>
      <span className="relative block">
        <select value={value} onChange={(event) => onChange(event.target.value)} className="h-[42px] w-full appearance-none rounded-[13px] border border-[#3157C8] bg-white px-5 pr-11 text-[13px] font-medium text-[#294BB2] outline-none transition focus:ring-2 focus:ring-[#DCEEFF] sm:text-[14px]">
          {children}
        </select>
        <ChevronDown size={19} strokeWidth={2.2} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#3157C8]" />
      </span>
    </label>
  );
}

function DetailItem({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#777B82]">{label}</dt>
      <dd className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-6 text-[#17191C]">{children || "-"}</dd>
    </div>
  );
}

function MarkdownDetail({ label, value, fallback = "-" }: { label: string; value?: string | null; fallback?: string }) {
  return (
    <div className="min-w-0 sm:col-span-2">
      <dt className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#777B82]">{label}</dt>
      <dd className="mt-1.5 min-w-0 break-words text-[14px] leading-6 text-[#17191C]">
        {value?.trim() ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
              a: ({ href, children }) => {
                const isExternal = /^https?:\/\//i.test(href || "");
                return (
                  <a
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    className="break-all font-medium text-[#3157C8] underline decoration-[#8EA9F1] underline-offset-2 transition hover:text-[#193C9B] focus:rounded-sm focus:outline-none focus:ring-2 focus:ring-[#BDD7FF]"
                  >
                    {children}
                  </a>
                );
              },
              ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>,
              code: ({ children }) => <code className="break-all rounded bg-[#F1F3F5] px-1 py-0.5 text-[13px]">{children}</code>,
            }}
          >
            {linkifyNoteMarkdown(value)}
          </ReactMarkdown>
        ) : fallback}
      </dd>
    </div>
  );
}

function DailyTaskDetail({ record, onClose }: { record: DailyTaskRecord; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const status = taskStatus(record);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div data-no-translate className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#0D1733]/45 p-3 backdrop-blur-[2px] sm:p-6">
      <button className="fixed inset-0 cursor-default" onClick={onClose} aria-label="Tutup detail Daily Task" />
      <section role="dialog" aria-modal="true" aria-labelledby="daily-task-detail-title" className="relative z-10 flex max-h-[calc(100dvh-24px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[22px] border border-[#D9D9D9] bg-white shadow-[0_24px_80px_rgba(26,43,86,0.22)] sm:max-h-[calc(100dvh-48px)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E3E3E3] px-5 py-5 sm:px-7 sm:py-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[#2F80ED]"><FileText size={21} /><span className="text-xs font-bold uppercase tracking-[0.08em]">Detail Daily Task</span></div>
            <h3 id="daily-task-detail-title" className="break-words text-[22px] font-bold leading-tight text-black sm:text-[26px]">{record.task.title || record.task.activity_input || "Aktivitas harian"}</h3>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D9D9D9] text-[#4F5050] transition hover:border-[#3157C8] hover:bg-[#F4F7FF] hover:text-[#294BB2] focus:outline-none focus:ring-2 focus:ring-[#DCEEFF]" aria-label="Tutup"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex rounded-[9px] px-3 py-1.5 text-xs font-medium", status.className)}>{status.label}</span>
            <span className="inline-flex rounded-[9px] bg-[#EAF6FF] px-3 py-1.5 text-xs font-semibold text-[#294BB2]">{Number(record.task.progress ?? (status.label === "Finished" ? 100 : 0))}% selesai</span>
          </div>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <DetailItem label="Project">{record.projectName}</DetailItem>
            <DetailItem label="Nama Staff">{record.ownerName}</DetailItem>
            <DetailItem label="Main Task">{record.mainTaskName}</DetailItem>
            <DetailItem label="Weekly Task">Minggu ke-{record.weekNumber}</DetailItem>
            <DetailItem label="Hari / Tanggal">{formatDate(record.plannedDate)}</DetailItem>
            <DetailItem label="Waktu">{record.timeSlot || "-"}</DetailItem>
            <DetailItem label="Aktivitas" wide>{record.task.activity_input || record.task.title || "-"}</DetailItem>
            <DetailItem label="Deskripsi" wide>{record.task.description || "-"}</DetailItem>
            <MarkdownDetail label="Output Hasil" value={record.task.output_result} fallback="Belum ada output" />
            <MarkdownDetail label="Catatan" value={record.task.notes} />
            {(record.task.is_blocked || String(record.task.status).toUpperCase() === "BLOCKED") && <DetailItem label="Kendala" wide>{record.task.block_reason || "Terkendala"}</DetailItem>}
          </dl>
        </div>
      </section>
    </div>
  );
}

export function ExecutiveDailyTaskMonitor({ projects, loading = false }: { projects: Project[]; loading?: boolean }) {
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [selectedDate, setSelectedDate] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<DailyTaskRecord | null>(null);

  const records = useMemo<DailyTaskRecord[]>(() => {
    const result: DailyTaskRecord[] = [];
    (projects || []).forEach((project) => (project.main_tasks || []).forEach((mainTask) =>
      (mainTask.weekly_tasks || mainTask.weekly_plans || []).forEach((weeklyTask) =>
        (weeklyTask.daily_tasks || []).forEach((task) => {
          const ownerId = String(task.owner_id || "");
          result.push({
            id: String(task.id), projectId: String(project.id), projectCode: project.project_code || project.code || "PROJECT",
            projectName: project.project_name || project.name || "Project", mainTaskName: mainTask.name || mainTask.title || "Main Task",
            weekNumber: Number(weeklyTask.week_number || 1), ownerId, ownerName: task.owner_name || "Member",
            plannedDate: normalizeDateKey(task.planned_date) || "", timeSlot: task.time_slot || "", task,
          });
        }),
      ),
    ));
    return result.sort((a, b) => b.plannedDate.localeCompare(a.plannedDate) || a.projectName.localeCompare(b.projectName));
  }, [projects]);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((row) => row.ownerId && map.set(row.ownerId, row.ownerName));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);
  const projectOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    records.forEach((row) => map.set(row.projectId, { id: row.projectId, name: row.projectName }));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);
  const dateOptions = useMemo(() => Array.from(new Set(records.map((row) => row.plannedDate).filter(Boolean))).sort((a, b) => b.localeCompare(a)), [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return records.filter((row) => {
      if (selectedUserId !== "all" && row.ownerId !== selectedUserId) return false;
      if (selectedProjectId !== "all" && row.projectId !== selectedProjectId) return false;
      if (selectedDate !== "all" && row.plannedDate !== selectedDate) return false;
      if (!query) return true;
      return [row.projectName, row.projectCode, row.mainTaskName, row.ownerName, row.task.title, row.task.activity_input, row.task.description]
        .filter(Boolean).some((value) => String(value).toLocaleLowerCase("id-ID").includes(query));
    });
  }, [records, search, selectedDate, selectedProjectId, selectedUserId]);

  const completedCount = filteredRecords.filter((row) => taskStatus(row).label === "Finished").length;

  return (
    <>
      <section data-no-translate className="rounded-[24px] border border-[#D9D9D9] bg-white px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
        <div className="grid gap-7 lg:grid-cols-[minmax(250px,0.9fr)_minmax(0,2.1fr)] lg:items-start">
          <div className="min-w-0">
            <h2 className="text-[32px] font-bold leading-none tracking-[-0.025em] text-black sm:text-[36px]">Daily Task</h2>
            <p className="mt-4 text-[14px] leading-6 text-[#17191C] sm:text-[15px]">Monitoring aktivitas harian staf lintas proyek.</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            <FilterSelect icon={<UserRound size={23} />} label="Nama Staff" value={selectedUserId} onChange={setSelectedUserId}>
              <option value="all">Semua Staff</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </FilterSelect>
            <FilterSelect icon={<FileText size={23} />} label="Project" value={selectedProjectId} onChange={setSelectedProjectId}>
              <option value="all">Semua Project</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </FilterSelect>
            <FilterSelect icon={<CalendarDays size={23} />} label="Hari / Tanggal" value={selectedDate} onChange={setSelectedDate}>
              <option value="all">Semua Tanggal</option>{dateOptions.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
            </FilterSelect>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:mt-10">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex h-[34px] items-center gap-3 rounded-[12px] bg-[#E9E9EA] px-4 text-[12px] font-medium text-[#5A5B5D] sm:text-[13px]"><Filter size={15} /> {filteredRecords.length} task terlihat</span>
            <span className="inline-flex h-[34px] items-center gap-3 rounded-[12px] bg-[#EAF6FF] px-4 text-[12px] font-medium text-[#3157C8] sm:text-[13px]"><CheckCircle2 size={15} fill="#2F80ED" className="text-white" /> {completedCount} selesai</span>
          </div>
          <label className="relative block w-full sm:w-[330px] lg:w-[360px]">
            <span className="sr-only">Cari Task</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Task" className="h-[42px] w-full rounded-[13px] border border-[#3157C8] bg-white px-5 pr-12 text-[14px] text-[#17191C] outline-none placeholder:text-[#3157C8] focus:ring-2 focus:ring-[#DCEEFF]" />
            <Search size={19} strokeWidth={2.4} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3157C8]" />
          </label>
        </div>

        <div className="mt-8 overflow-hidden rounded-[14px] border border-[#D9D9D9] sm:mt-10">
          <div className="max-h-[560px] overflow-auto overscroll-contain">
            <table className="w-full min-w-[820px] table-fixed text-left">
              <thead className="sticky top-0 z-10 bg-[#F5F5F5]">
                <tr className="h-[42px] text-[13px] font-bold text-[#4F5050]">
                  <th className="w-[54px] px-5">#</th><th className="w-[45%] px-3">Project Name</th><th className="w-[28%] px-4">Aktivitas</th><th className="w-[120px] px-3 text-center">Status</th><th className="w-[125px] px-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index} className="h-[116px] border-t border-[#F0F0F0]"><td className="px-5"><div className="h-4 w-4 animate-pulse rounded bg-[#E6E8EB]" /></td><td className="px-3"><div className="h-4 w-1/2 animate-pulse rounded bg-[#E6E8EB]" /><div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-[#EEF0F2]" /></td><td className="px-4"><div className="h-4 w-4/5 animate-pulse rounded bg-[#E6E8EB]" /></td><td className="px-3"><div className="mx-auto h-7 w-24 animate-pulse rounded-[9px] bg-[#EEF0F2]" /></td><td className="px-3"><div className="h-7 w-20 animate-pulse rounded-full bg-[#EEF0F2]" /></td></tr>
                )) : filteredRecords.length === 0 ? (
                  <tr><td colSpan={5} className="h-[220px] px-6 text-center"><CalendarDays size={30} className="mx-auto text-[#AEB2B8]" /><p className="mt-3 text-sm font-bold text-[#4F5050]">Tidak ada Daily Task untuk filter ini.</p><p className="mt-1 text-xs text-[#8A8E95]">Ubah filter atau kata pencarian untuk melihat aktivitas lain.</p></td></tr>
                ) : filteredRecords.map((row, index) => {
                  const status = taskStatus(row);
                  return (
                    <tr key={row.id} className={cn("h-[116px] border-t border-[#F0F0F0] align-middle transition-colors hover:bg-[#EAF6FF]", index === 0 && "bg-[#EAF6FF]")}>
                      <td className="px-5 text-[12px] text-[#4F5050]">{index + 1}</td>
                      <td className="min-w-0 px-3 py-5"><p className="break-words text-[14px] font-bold leading-5 text-[#111318]">{row.projectName}</p><p className="mt-2 break-words text-[12px] leading-5 text-[#17191C]">{row.mainTaskName}</p><p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-[#4F5050]"><span>{formatDate(row.plannedDate)}</span><span aria-hidden="true">|</span><span className="font-medium text-[#42ACFB]">{row.timeSlot || "-"}</span></p></td>
                      <td className="px-4 py-5 text-[13px] leading-5 text-[#17191C]"><p className="line-clamp-3 break-words">{row.task.activity_input || row.task.title || "Aktivitas harian"}</p></td>
                      <td className="px-3 text-center"><span className={cn("inline-flex whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[11px] font-medium", status.className)}>{status.label}</span></td>
                      <td className="px-3"><button type="button" onClick={() => setSelectedRecord(row)} className="inline-flex items-center gap-2 rounded-full bg-[#EAF6FF] px-3 py-1.5 text-[12px] font-medium text-[#3157C8] transition hover:bg-[#DCEEFF] focus:outline-none focus:ring-2 focus:ring-[#BDD7FF]" aria-label={`Lihat detail ${row.task.title || row.task.activity_input || "Daily Task"}`}><FileText size={15} className="text-[#2F80ED]" /> Details</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {selectedRecord && <DailyTaskDetail record={selectedRecord} onClose={() => setSelectedRecord(null)} />}
    </>
  );
}
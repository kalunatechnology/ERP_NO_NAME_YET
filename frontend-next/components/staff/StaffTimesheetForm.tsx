"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Link2, MonitorSmartphone, Play, Send, Square } from "lucide-react";
import toast from "react-hot-toast";
import {
  createStaffTimesheet,
  getApiErrorDetail,
  Project,
} from "@/lib/api/project.api";
import { localDateKey } from "@/lib/utils";

interface StaffTimesheetFormProps {
  projects: Project[];
  userId?: string;
  onCreated: () => void | Promise<void>;
}

export function StaffTimesheetForm({ projects, userId, onCreated }: StaffTimesheetFormProps) {
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [workDate, setWorkDate] = useState(localDateKey());
  const [hours, setHours] = useState("0");
  const [workStartedAt, setWorkStartedAt] = useState<string | null>(null);
  const [workEndedAt, setWorkEndedAt] = useState<string | null>(null);
  const [overtimeHours, setOvertimeHours] = useState("0");
  const [overtimeReason, setOvertimeReason] = useState("");
  const [overtimeStartedAt, setOvertimeStartedAt] = useState<string | null>(null);
  const [overtimeEndedAt, setOvertimeEndedAt] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [, setTimerTick] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === projectId),
    [projectId, projects],
  );
  const tasks = (selectedProject?.tasks || []).filter((task) =>
    userId ? String(task.assigned_to_id ?? task.assigned_to ?? "") === userId : false
  );

  const timerRunning = Boolean(overtimeStartedAt && !overtimeEndedAt);
  const workTimerRunning = Boolean(workStartedAt && !workEndedAt);
  const workElapsedMilliseconds = workStartedAt
    ? Math.max(0, new Date(workEndedAt || Date.now()).getTime() - new Date(workStartedAt).getTime())
    : 0;
  const workElapsedLabel = new Date(workElapsedMilliseconds).toISOString().slice(11, 19);
  const elapsedMilliseconds = overtimeStartedAt
    ? Math.max(0, new Date(overtimeEndedAt || Date.now()).getTime() - new Date(overtimeStartedAt).getTime())
    : 0;
  const elapsedLabel = new Date(elapsedMilliseconds).toISOString().slice(11, 19);

  useEffect(() => {
    if (!timerRunning && !workTimerRunning) return;
    const timer = window.setInterval(() => setTimerTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, workTimerRunning]);

  const startWork = () => {
    setWorkStartedAt(new Date().toISOString());
    setWorkEndedAt(null);
    setHours("0");
  };

  const stopWork = () => {
    if (!workStartedAt) return;
    const endedAt = new Date().toISOString();
    const duration = Math.max(0.01, (new Date(endedAt).getTime() - new Date(workStartedAt).getTime()) / 3_600_000);
    setWorkEndedAt(endedAt);
    setHours(duration.toFixed(2));
  };

  const startOvertime = () => {
    if (!workEndedAt) return toast.error("Selesaikan timer kerja reguler sebelum memulai lembur.");
    setOvertimeStartedAt(new Date().toISOString());
    setOvertimeEndedAt(null);
    setOvertimeHours("0");
  };

  const stopOvertime = () => {
    if (!overtimeStartedAt) return;
    const endedAt = new Date().toISOString();
    const duration = Math.max(0.01, (new Date(endedAt).getTime() - new Date(overtimeStartedAt).getTime()) / 3_600_000);
    setOvertimeEndedAt(endedAt);
    setOvertimeHours(duration.toFixed(2));
    setHours(Math.min(24, (Math.max(0, Number(hours) || 0) + duration)).toFixed(2));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const total = Number(hours);
    const overtime = Number(overtimeHours || 0);
    if (!projectId) return toast.error("Pilih proyek terlebih dahulu.");
    if (!workDate) return toast.error("Tanggal kerja wajib diisi.");
    if (!workStartedAt || !workEndedAt) return toast.error("Jam kerja wajib dicatat melalui timer mulai dan selesai.");
    if (workTimerRunning) return toast.error("Selesaikan timer kerja sebelum mengirim timesheet.");
    if (!Number.isFinite(total) || total <= 0 || total > 24) {
      return toast.error("Total jam kerja harus lebih dari 0 dan maksimal 24 jam.");
    }
    if (!Number.isFinite(overtime) || overtime < 0 || overtime > total) {
      return toast.error("Jam lembur harus berada antara 0 dan total jam kerja.");
    }
    if (timerRunning) return toast.error("Hentikan timer lembur sebelum mengirim timesheet.");
    if (overtime > 0 && (!overtimeStartedAt || !overtimeEndedAt || !evidenceUrl.trim())) {
      return toast.error("Timer selesai dan link bukti pekerjaan wajib tersedia untuk lembur.");
    }

    setSubmitting(true);
    try {
      await createStaffTimesheet({
        project_id: projectId,
        ...(taskId ? { task_id: taskId } : {}),
        work_date: workDate,
        hours: total,
        work_started_at: workStartedAt,
        work_ended_at: workEndedAt,
        last_activity_at: overtimeEndedAt || workEndedAt,
        attendance_source: window.innerWidth < 768 ? "MOBILE_WEB" : "WEB",
        overtime_hours: overtime,
        ...(overtimeReason.trim() ? { overtime_reason: overtimeReason.trim() } : {}),
        ...(overtimeStartedAt ? { overtime_started_at: overtimeStartedAt } : {}),
        ...(overtimeEndedAt ? { overtime_ended_at: overtimeEndedAt } : {}),
        ...(evidenceUrl.trim() ? { evidence_url: evidenceUrl.trim() } : {}),
      });
      toast.success("Timesheet berhasil dikirim dan menunggu persetujuan.");
      setTaskId("");
      setHours("0");
      setWorkStartedAt(null);
      setWorkEndedAt(null);
      setOvertimeHours("0");
      setOvertimeReason("");
      setOvertimeStartedAt(null);
      setOvertimeEndedAt(null);
      setEvidenceUrl("");
      await onCreated();
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Timesheet gagal dikirim."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="card rounded-xl p-4" aria-labelledby="staff-timesheet-form-title">
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-xl bg-[#EAF6FF] p-2 text-[#2649B3]"><Clock3 size={18} /></span>
        <div>
          <h2 id="staff-timesheet-form-title" className="text-sm font-bold text-text-primary">Catat Jam Kerja & Lembur</h2>
          <p className="mt-0.5 text-xs text-text-secondary">Employee, tarif, nilai biaya, dan status persetujuan ditentukan backend.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-semibold text-text-secondary">
          Proyek <span className="text-red-500">*</span>
          <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setTaskId(""); }} className="input mt-1 text-xs" required>
            <option value="">Pilih proyek yang ditugaskan</option>
            {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.project_code || project.code} — {project.project_name || project.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-text-secondary">
          Task proyek (opsional)
          <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className="input mt-1 text-xs" disabled={!projectId || tasks.length === 0}>
            <option value="">Tanpa task spesifik</option>
            {tasks.map((task) => <option key={task.id} value={String(task.id)}>{task.title}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-text-secondary">
          Tanggal kerja <span className="text-red-500">*</span>
          <input type="date" value={workDate} max={localDateKey()} onChange={(event) => setWorkDate(event.target.value)} className="input mt-1 text-xs" required />
        </label>
        <div className="text-xs font-semibold text-text-secondary">
          Kehadiran &amp; timer kerja
          <div className="mt-1 flex h-10 items-center justify-between rounded-xl border border-[#9FD6FF] bg-[#F8FBFF] px-2">
            <span className="font-mono text-sm font-bold text-text-primary">{workElapsedLabel}</span>
            {!workTimerRunning ? (
              <button type="button" onClick={workStartedAt ? undefined : startWork} disabled={Boolean(workEndedAt)} className="inline-flex items-center gap-1 rounded-lg bg-[#EAF6FF] px-2.5 py-1.5 text-2xs font-bold text-[#2649B3] disabled:opacity-60">
                <Play size={12} /> {workEndedAt ? "Selesai" : "Mulai Kerja"}
              </button>
            ) : (
              <button type="button" onClick={stopWork} className="inline-flex items-center gap-1 rounded-lg bg-[#2649B3] px-2.5 py-1.5 text-2xs font-bold text-white"><Square size={12} /> Akhiri Kerja</button>
            )}
          </div>
          <span className="mt-1 flex items-center gap-1 text-3xs font-normal text-[#4F5050]"><MonitorSmartphone size={11} /> Tersedia melalui browser desktop dan mobile.</span>
        </div>
        <label className="text-xs font-semibold text-text-secondary">
          Total jam terverifikasi
          <input type="number" value={hours} className="input mt-1 text-xs bg-[#F8FBFF]" readOnly aria-readonly="true" />
        </label>
        <div className="text-xs font-semibold text-text-secondary">
          Timer lembur terverifikasi
          <div className="mt-1 flex h-10 items-center justify-between rounded-xl border border-text-tertiary bg-white px-2">
            <span className="font-mono text-sm font-bold text-text-primary">{elapsedLabel}</span>
            {!timerRunning ? (
              <button type="button" onClick={startOvertime} disabled={!workEndedAt || Boolean(overtimeEndedAt)} className="inline-flex items-center gap-1 rounded-lg bg-[#EAF6FF] px-2.5 py-1.5 text-2xs font-bold text-[#2649B3] disabled:opacity-50"><Play size={12} /> {overtimeEndedAt ? "Terkunci" : "Mulai Lembur"}</button>
            ) : (
              <button type="button" onClick={stopOvertime} className="inline-flex items-center gap-1 rounded-lg bg-[#FF9946]/15 px-2.5 py-1.5 text-2xs font-bold text-[#B45309]"><Square size={12} /> Selesai &amp; Kunci</button>
            )}
          </div>
        </div>
        <label className="text-xs font-semibold text-text-secondary">
          Alasan lembur
          <input value={overtimeReason} onChange={(event) => setOvertimeReason(event.target.value)} placeholder="Opsional, isi bila ada lembur" className="input mt-1 text-xs placeholder:text-gray-400" />
        </label>
        <label className="text-xs font-semibold text-text-secondary md:col-span-1 xl:col-span-2">
          Bukti penyelesaian lembur {Number(overtimeHours) > 0 ? <span className="text-red-500">*</span> : <span className="font-normal text-gray-400">(opsional)</span>}
          <span className="mt-1 flex items-center gap-2 rounded-xl border border-text-tertiary bg-white px-3">
            <Link2 size={14} className="shrink-0 text-[#2649B3]" />
            <input type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="Tempel link dokumen, Drive, hasil kerja, atau tiket" className="h-10 w-full bg-transparent text-xs outline-none placeholder:text-gray-400" required={Number(overtimeHours) > 0} />
          </span>
          <span className="mt-1 block text-3xs font-normal text-gray-400">Timestamp kerja, aktivitas terakhir, dan bukti lembur dikirim otomatis sehingga durasi tidak dapat diisi manual.</span>
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={submitting || projects.length === 0} className="btn-primary gap-2 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50">
          <Send size={14} /> {submitting ? "Mengirim..." : "Kirim Timesheet"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Link2, MonitorSmartphone, Play, Send, Square } from "lucide-react";
import toast from "react-hot-toast";
import {
  getApiErrorDetail,
  Project,
} from "@/lib/api/project.api";
import {
  getActiveStaffTimer,
  StaffTimerSnapshot,
  startStaffOvertimeTimer,
  startStaffTimer,
  stopStaffOvertimeTimer,
  stopStaffTimer,
  submitStaffTimer,
} from "@/lib/api/timesheet-timer.api";
import { localDateKey } from "@/lib/utils";

interface StaffTimesheetFormProps {
  projects: Project[];
  userId?: string;
  onCreated: () => void | Promise<void>;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function numberValue(value: number | string | null | undefined): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

export function StaffTimesheetForm({ projects, userId, onCreated }: StaffTimesheetFormProps) {
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [workDate, setWorkDate] = useState(localDateKey());
  const [hours, setHours] = useState("0.00");
  const [workStartedAt, setWorkStartedAt] = useState<string | null>(null);
  const [workEndedAt, setWorkEndedAt] = useState<string | null>(null);
  const [overtimeHours, setOvertimeHours] = useState("0.00");
  const [overtimeReason, setOvertimeReason] = useState("");
  const [overtimeStartedAt, setOvertimeStartedAt] = useState<string | null>(null);
  const [overtimeEndedAt, setOvertimeEndedAt] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [, setTimerTick] = useState(0);
  const [syncingTimer, setSyncingTimer] = useState(true);
  const [timerAction, setTimerAction] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === projectId),
    [projectId, projects],
  );
  const tasks = (selectedProject?.tasks || []).filter((task) =>
    userId ? String(task.assigned_to_id ?? task.assigned_to ?? "") === userId : false
  );

  const hydrateSnapshot = useCallback((snapshot: StaffTimerSnapshot) => {
    const serverNow = new Date(snapshot.server_now).getTime();
    if (Number.isFinite(serverNow)) {
      setServerClockOffsetMs(serverNow - Date.now());
    }

    const session = snapshot.session;
    if (!session) {
      setSessionId(null);
      setWorkStartedAt(null);
      setWorkEndedAt(null);
      setOvertimeStartedAt(null);
      setOvertimeEndedAt(null);
      setHours("0.00");
      setOvertimeHours("0.00");
      return;
    }

    setSessionId(session.id);
    setProjectId(String(session.project_id ?? ""));
    setTaskId(String(session.task_id ?? ""));
    if (session.work_date) setWorkDate(session.work_date.slice(0, 10));
    setHours(numberValue(session.hours));
    setOvertimeHours(numberValue(session.overtime_hours));
    setOvertimeReason(session.overtime_reason ?? "");
    setEvidenceUrl(session.evidence_url ?? "");
    setWorkStartedAt(session.work_started_at ?? null);
    setWorkEndedAt(session.work_ended_at ?? null);
    setOvertimeStartedAt(session.overtime_started_at ?? null);
    setOvertimeEndedAt(session.overtime_ended_at ?? null);
  }, []);

  const refreshActiveTimer = useCallback(async (silent = false) => {
    try {
      hydrateSnapshot(await getActiveStaffTimer());
    } catch (error) {
      if (!silent) toast.error(getApiErrorDetail(error, "Status timer gagal dimuat dari server."));
    } finally {
      setSyncingTimer(false);
    }
  }, [hydrateSnapshot]);

  useEffect(() => {
    void refreshActiveTimer();
  }, [refreshActiveTimer]);

  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === "visible") void refreshActiveTimer(true);
    };
    const onFocus = () => void refreshActiveTimer(true);
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshActiveTimer]);

  const timerRunning = Boolean(overtimeStartedAt && !overtimeEndedAt);
  const workTimerRunning = Boolean(workStartedAt && !workEndedAt);
  const liveServerNow = Date.now() + serverClockOffsetMs;
  const workElapsedMilliseconds = workStartedAt
    ? Math.max(
        0,
        (workEndedAt ? new Date(workEndedAt).getTime() : liveServerNow) - new Date(workStartedAt).getTime(),
      )
    : 0;
  const elapsedMilliseconds = overtimeStartedAt
    ? Math.max(
        0,
        (overtimeEndedAt ? new Date(overtimeEndedAt).getTime() : liveServerNow) - new Date(overtimeStartedAt).getTime(),
      )
    : 0;
  const workElapsedLabel = formatElapsed(workElapsedMilliseconds);
  const elapsedLabel = formatElapsed(elapsedMilliseconds);

  useEffect(() => {
    if (!timerRunning && !workTimerRunning) return;
    // This interval only repaints the display. Server timestamps remain the
    // source of truth, so browser throttling, tab changes, or reloads cannot
    // pause or reset the actual timer session.
    const timer = window.setInterval(() => setTimerTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, workTimerRunning]);

  const runTimerAction = async (
    actionName: string,
    action: () => Promise<StaffTimerSnapshot>,
    fallback: string,
  ) => {
    setTimerAction(actionName);
    try {
      hydrateSnapshot(await action());
    } catch (error) {
      toast.error(getApiErrorDetail(error, fallback));
      await refreshActiveTimer(true);
    } finally {
      setTimerAction(null);
    }
  };

  const startWork = async () => {
    if (!projectId) return toast.error("Pilih proyek terlebih dahulu.");
    if (!workDate) return toast.error("Tanggal kerja wajib diisi.");
    await runTimerAction(
      "start-work",
      () => startStaffTimer({ project_id: projectId, ...(taskId ? { task_id: taskId } : {}), work_date: workDate }),
      "Timer kerja gagal dimulai.",
    );
  };

  const stopWork = async () => {
    if (!workStartedAt) return;
    await runTimerAction("stop-work", stopStaffTimer, "Timer kerja gagal dihentikan.");
  };

  const startOvertime = async () => {
    if (!workEndedAt) return toast.error("Selesaikan timer kerja reguler sebelum memulai lembur.");
    await runTimerAction("start-overtime", startStaffOvertimeTimer, "Timer lembur gagal dimulai.");
  };

  const stopOvertime = async () => {
    if (!overtimeStartedAt) return;
    await runTimerAction("stop-overtime", stopStaffOvertimeTimer, "Timer lembur gagal dihentikan.");
  };

  const resetSubmittedSession = () => {
    setSessionId(null);
    setProjectId("");
    setTaskId("");
    setWorkDate(localDateKey());
    setHours("0.00");
    setWorkStartedAt(null);
    setWorkEndedAt(null);
    setOvertimeHours("0.00");
    setOvertimeReason("");
    setOvertimeStartedAt(null);
    setOvertimeEndedAt(null);
    setEvidenceUrl("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const overtime = Number(overtimeHours || 0);
    if (!sessionId) return toast.error("Mulai timer kerja terlebih dahulu.");
    if (!workStartedAt || !workEndedAt) return toast.error("Jam kerja wajib diselesaikan melalui timer.");
    if (workTimerRunning) return toast.error("Selesaikan timer kerja sebelum mengirim timesheet.");
    if (timerRunning) return toast.error("Hentikan timer lembur sebelum mengirim timesheet.");
    if (overtime > 0 && !evidenceUrl.trim()) {
      return toast.error("Link bukti pekerjaan wajib tersedia untuk lembur.");
    }

    setSubmitting(true);
    try {
      await submitStaffTimer({
        ...(overtimeReason.trim() ? { overtime_reason: overtimeReason.trim() } : {}),
        ...(evidenceUrl.trim() ? { evidence_url: evidenceUrl.trim() } : {}),
      });
      toast.success("Timesheet berhasil dikirim dan menunggu persetujuan.");
      resetSubmittedSession();
      await onCreated();
    } catch (error) {
      toast.error(getApiErrorDetail(error, "Timesheet gagal dikirim."));
      await refreshActiveTimer(true);
    } finally {
      setSubmitting(false);
    }
  };

  const sessionLocked = Boolean(sessionId);
  const actionBusy = Boolean(timerAction) || syncingTimer;

  return (
    <form onSubmit={submit} className="card rounded-xl p-4" aria-labelledby="staff-timesheet-form-title">
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-xl bg-[#EAF6FF] p-2 text-[#2649B3]"><Clock3 size={18} /></span>
        <div>
          <h2 id="staff-timesheet-form-title" className="text-sm font-bold text-text-primary">Catat Jam Kerja & Lembur</h2>
          <p className="mt-0.5 text-xs text-text-secondary">Timer tersimpan di server dan tetap berjalan saat berpindah tab, halaman dimuat ulang, atau browser kembali aktif.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-semibold text-text-secondary">
          Proyek <span className="form-required">*</span>
          <select
            value={projectId}
            onChange={(event) => { setProjectId(event.target.value); setTaskId(""); }}
            className="input mt-1 text-xs"
            required
            disabled={sessionLocked || syncingTimer}
          >
            <option value="">Pilih proyek yang ditugaskan</option>
            {projects.map((project) => <option key={project.id} value={String(project.id)}>{project.project_code || project.code} — {project.project_name || project.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-text-secondary">
          Task proyek <span className="form-optional">(opsional)</span>
          <select
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            className="input mt-1 text-xs"
            disabled={sessionLocked || syncingTimer || !projectId || tasks.length === 0}
          >
            <option value="">Tanpa task spesifik</option>
            {tasks.map((task) => <option key={task.id} value={String(task.id)}>{task.title}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-text-secondary">
          Tanggal kerja <span className="form-required">*</span>
          <input
            type="date"
            value={workDate}
            max={localDateKey()}
            onChange={(event) => setWorkDate(event.target.value)}
            className="input mt-1 text-xs"
            required
            disabled={sessionLocked || syncingTimer}
          />
        </label>
        <div className="text-xs font-semibold text-text-secondary">
          Kehadiran &amp; timer kerja
          <div className="mt-1 flex h-10 items-center justify-between rounded-[11px] border border-[#9FD6FF] bg-[#F8FBFF] px-2.5">
            <span className="font-mono text-sm font-bold text-text-primary">{workElapsedLabel}</span>
            {!workTimerRunning ? (
              <button
                type="button"
                onClick={workStartedAt ? undefined : startWork}
                disabled={Boolean(workEndedAt) || actionBusy || (!sessionId && !projectId)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#EAF6FF] px-2.5 py-1.5 text-2xs font-bold text-[#2649B3] disabled:opacity-60"
              >
                <Play size={12} /> {syncingTimer ? "Sinkronisasi" : workEndedAt ? "Selesai" : timerAction === "start-work" ? "Memulai..." : "Mulai Kerja"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopWork}
                disabled={actionBusy}
                className="inline-flex items-center gap-1 rounded-lg bg-[#2649B3] px-2.5 py-1.5 text-2xs font-bold text-white disabled:opacity-60"
              ><Square size={12} /> {timerAction === "stop-work" ? "Mengakhiri..." : "Akhiri Kerja"}</button>
            )}
          </div>
          <span className="form-helper flex items-center gap-1"><MonitorSmartphone size={11} /> Timestamp mulai/selesai dibuat dan dikunci oleh backend.</span>
        </div>
        <label className="text-xs font-semibold text-text-secondary">
          Total jam terverifikasi
          <input type="number" value={hours} className="input mt-1 text-xs bg-[#F8FBFF]" readOnly aria-readonly="true" />
        </label>
        <div className="text-xs font-semibold text-text-secondary">
          Timer lembur terverifikasi
          <div className="mt-1 flex h-10 items-center justify-between rounded-[11px] border border-text-tertiary bg-white px-2.5">
            <span className="font-mono text-sm font-bold text-text-primary">{elapsedLabel}</span>
            {!timerRunning ? (
              <button
                type="button"
                onClick={startOvertime}
                disabled={!workEndedAt || Boolean(overtimeEndedAt) || actionBusy}
                className="inline-flex items-center gap-1 rounded-lg bg-[#EAF6FF] px-2.5 py-1.5 text-2xs font-bold text-[#2649B3] disabled:opacity-50"
              ><Play size={12} /> {overtimeEndedAt ? "Terkunci" : timerAction === "start-overtime" ? "Memulai..." : "Mulai Lembur"}</button>
            ) : (
              <button
                type="button"
                onClick={stopOvertime}
                disabled={actionBusy}
                className="inline-flex items-center gap-1 rounded-lg bg-[#FF9946]/15 px-2.5 py-1.5 text-2xs font-bold text-[#B45309] disabled:opacity-60"
              ><Square size={12} /> {timerAction === "stop-overtime" ? "Mengunci..." : "Selesai & Kunci"}</button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-text-secondary flex flex-col justify-start">
          <span>Alasan lembur</span>
          <input
            value={overtimeReason}
            onChange={(event) => setOvertimeReason(event.target.value)}
            placeholder="Opsional, isi bila ada lembur"
            className="input mt-1 text-xs"
          />
          <span className="form-helper">Opsional, isi bila ada lembur</span>
        </label>
        <label className="text-xs font-semibold text-text-secondary flex flex-col justify-start">
          <span>
            Bukti penyelesaian lembur {Number(overtimeHours) > 0 ? <span className="form-required">*</span> : <span className="form-optional">(opsional)</span>}
          </span>
          <span className="mt-1 flex h-[38px] items-center gap-2 rounded-[11px] border border-text-tertiary bg-white px-3 focus-within:border-brand-green focus-within:ring-2 focus-within:ring-brand-green/20 transition-all">
            <Link2 size={14} className="shrink-0 text-[#2649B3]" />
            <input
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder="Tempel link dokumen, Drive, hasil kerja, atau tiket"
              className="h-full w-full bg-transparent text-xs outline-none placeholder:text-gray-400"
              required={Number(overtimeHours) > 0}
            />
          </span>
          <span className="form-helper">Timestamp &amp; bukti lembur dikirim dari sesi timer server</span>
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={submitting || actionBusy || projects.length === 0 || !sessionId || workTimerRunning || timerRunning || !workEndedAt}
          className="btn-primary gap-2 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={14} /> {submitting ? "Mengirim..." : "Kirim Timesheet"}
        </button>
      </div>
    </form>
  );
}

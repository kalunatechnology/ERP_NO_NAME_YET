"use client";

import { useMemo, useState } from "react";
import { Clock3, Send } from "lucide-react";
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
  const [hours, setHours] = useState("8");
  const [overtimeHours, setOvertimeHours] = useState("0");
  const [overtimeReason, setOvertimeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === projectId),
    [projectId, projects],
  );
  const tasks = (selectedProject?.tasks || []).filter((task) =>
    userId ? String(task.assigned_to_id ?? task.assigned_to ?? "") === userId : false
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const total = Number(hours);
    const overtime = Number(overtimeHours || 0);
    if (!projectId) return toast.error("Pilih proyek terlebih dahulu.");
    if (!workDate) return toast.error("Tanggal kerja wajib diisi.");
    if (!Number.isFinite(total) || total <= 0 || total > 24) {
      return toast.error("Total jam kerja harus lebih dari 0 dan maksimal 24 jam.");
    }
    if (!Number.isFinite(overtime) || overtime < 0 || overtime > total) {
      return toast.error("Jam lembur harus berada antara 0 dan total jam kerja.");
    }

    setSubmitting(true);
    try {
      await createStaffTimesheet({
        project_id: projectId,
        ...(taskId ? { task_id: taskId } : {}),
        work_date: workDate,
        hours: total,
        overtime_hours: overtime,
        ...(overtimeReason.trim() ? { overtime_reason: overtimeReason.trim() } : {}),
      });
      toast.success("Timesheet berhasil dikirim dan menunggu persetujuan.");
      setTaskId("");
      setHours("8");
      setOvertimeHours("0");
      setOvertimeReason("");
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
          Proyek *
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
          Tanggal kerja *
          <input type="date" value={workDate} max={localDateKey()} onChange={(event) => setWorkDate(event.target.value)} className="input mt-1 text-xs" required />
        </label>
        <label className="text-xs font-semibold text-text-secondary">
          Total jam kerja *
          <input type="number" min="0.25" max="24" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} className="input mt-1 text-xs" required />
        </label>
        <label className="text-xs font-semibold text-text-secondary">
          Jam lembur
          <input type="number" min="0" max="24" step="0.25" value={overtimeHours} onChange={(event) => setOvertimeHours(event.target.value)} className="input mt-1 text-xs" />
        </label>
        <label className="text-xs font-semibold text-text-secondary">
          Alasan lembur
          <input value={overtimeReason} onChange={(event) => setOvertimeReason(event.target.value)} placeholder="Opsional, isi bila ada lembur" className="input mt-1 text-xs" />
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

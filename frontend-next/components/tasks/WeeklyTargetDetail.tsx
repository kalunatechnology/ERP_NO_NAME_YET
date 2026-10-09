"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { deleteWeeklyTask, getApiErrorDetail, reviewWeeklyTask, updateWeeklyTask } from "@/lib/api/project.api";
import { formatDate } from "@/lib/utils";
import { type WeeklyTargetRecord } from "@/lib/weekly-dashboard";
import { WEEKLY_GROUPS, weeklyGroup, type weeklyPermissions } from "@/lib/tasks/weekly-management";

type Permissions = ReturnType<typeof weeklyPermissions>;

export function WeeklyTargetDetail({ record, today, permissions, onClose, onChanged, onOpenDaily, onCreateDaily }: {
  record: WeeklyTargetRecord; today: string; permissions: Permissions; onClose: () => void;
  onChanged: () => Promise<void>; onOpenDaily: (id: string) => void;
  onCreateDaily: (record: WeeklyTargetRecord) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(record.weeklyTask.target_description || record.weeklyTask.target_output || "");
  const [start, setStart] = useState(record.startDate);
  const [end, setEnd] = useState(record.endDate);
  const [week, setWeek] = useState(String(record.weeklyTask.week_number));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "APPROVE" | "REJECT" | "discard" | null>(null);
  const group = WEEKLY_GROUPS.find(item => item.id === weeklyGroup(record, today))!;
  const dirty = editing && (description !== (record.weeklyTask.target_description || record.weeklyTask.target_output || "")
    || start !== record.startDate || end !== record.endDate || week !== String(record.weeklyTask.week_number));
  const close = () => { if (!busy) dirty ? setConfirm("discard") : onClose(); };
  const field = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-green disabled:bg-gray-50";

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!permissions.canEdit || busy) return;
    if (!description.trim() || !start || !end || end < start || !Number.isInteger(Number(week)) || Number(week) < 1 || Number(week) > 52) {
      setError("Isi target, nomor minggu 1–52, dan periode yang valid."); return;
    }
    setBusy(true); setError("");
    try {
      await updateWeeklyTask(record.id, { target_description: description, week_number: Number(week), start_date: start, end_date: end });
      setEditing(false); toast.success("Weekly Target diperbarui.");
      await onChanged();
    } catch (failure) { setError(getApiErrorDetail(failure, "Perubahan belum tersimpan. Silakan coba kembali.")); }
    finally { setBusy(false); }
  }

  async function action() {
    if (busy || !confirm) return;
    if (confirm === "discard") { onClose(); return; }
    if (confirm === "delete" ? !permissions.canDelete : !permissions.canReview) return;
    setBusy(true); setError("");
    try {
      if (confirm === "delete") await deleteWeeklyTask(record.id);
      else await reviewWeeklyTask(record.id, confirm);
      toast.success(confirm === "delete" ? "Weekly Target dihapus." : confirm === "APPROVE" ? "Weekly Target disetujui." : "Weekly Target ditolak.");
      setConfirm(null); await onChanged(); onClose();
    } catch (failure) { setError(getApiErrorDetail(failure, "Aksi belum berhasil. Muat ulang untuk memeriksa akses atau status terbaru.")); }
    finally { setBusy(false); }
  }

  return <Modal isOpen onClose={close} title="Detail Weekly Target" subtitle={record.code} maxWidth="2xl" placement="drawer">
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: group.soft, color: group.color }}>{group.label}</span>
        <span className="text-xs text-text-secondary">{record.projectCode} · W#{record.weeklyTask.week_number}</span>
      </div>
      {!editing && <h4 className="whitespace-pre-wrap text-xl font-bold leading-8">{record.weeklyTask.target_description || record.weeklyTask.target_output}</h4>}
      <dl className="grid grid-cols-2 gap-4 rounded-2xl bg-gray-50 p-4 text-xs">
        <div><dt className="text-text-secondary">Proyek</dt><dd className="mt-1.5 font-semibold">{record.projectName}</dd></div>
        <div><dt className="text-text-secondary">Main Task</dt><dd className="mt-1.5 font-semibold">{record.mainTaskName}</dd></div>
        <div><dt className="text-text-secondary">PIC target</dt><dd className="mt-1.5 font-semibold">{record.assigneeName}</dd></div>
        <div><dt className="text-text-secondary">Periode</dt><dd className="mt-1.5 font-semibold">{record.startDate ? formatDate(record.startDate) : "—"} – {record.endDate ? formatDate(record.endDate) : "—"}</dd></div>
      </dl>
      {editing && <form onSubmit={save} className="space-y-4 rounded-2xl border border-blue-100 p-4">
        <label className="block space-y-2 text-xs font-semibold">Target pekerjaan<textarea aria-label="Ubah target pekerjaan" required rows={4} value={description} disabled={busy} onChange={event => setDescription(event.target.value)} className={field} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-2 text-xs">Minggu ke<input aria-label="Ubah minggu ke" required type="number" min={1} max={52} value={week} disabled={busy} onChange={event => setWeek(event.target.value)} className={field} /></label>
          <label className="space-y-2 text-xs">Tanggal mulai<input aria-label="Ubah tanggal mulai" required type="date" value={start} disabled={busy} onChange={event => setStart(event.target.value)} className={field} /></label>
          <label className="space-y-2 text-xs">Tanggal selesai<input aria-label="Ubah tanggal selesai" required type="date" min={start} value={end} disabled={busy} onChange={event => setEnd(event.target.value)} className={field} /></label>
        </div>
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setEditing(false); setDescription(record.weeklyTask.target_description || record.weeklyTask.target_output || ""); setStart(record.startDate); setEnd(record.endDate); setWeek(String(record.weeklyTask.week_number)); }} className="btn-secondary text-xs">Batal edit</button><button type="submit" disabled={busy} className="btn-primary gap-2 text-xs">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Simpan perubahan</button></div>
      </form>}
      <div><div className="mb-2 flex justify-between text-xs"><span>{record.completedDailyCount}/{record.dailyCount} Daily Task selesai</span><strong className="text-brand-green">{record.progress}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-green" style={{ width: `${record.progress}%` }} /></div></div>
      <section><h5 className="mb-3 text-sm font-bold">Pekerjaan harian</h5>
        {record.dailyTasks.length ? <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">{record.dailyTasks.map(task => <div key={task.id} className="flex items-start gap-3 p-3 text-xs"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-300">{["COMPLETED", "DONE"].includes(task.status) && <Check size={11} />}</span><div className="min-w-0 flex-1"><p className="font-semibold">{task.title || task.activity_input}</p><p className="mt-1 text-text-secondary">{task.owner_name || "Pemilik task"} · {task.planned_date ? formatDate(task.planned_date) : "Tanpa tanggal"}</p></div><span className="text-[10px] text-text-secondary">{task.status}</span></div>)}</div> : <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-text-secondary">Belum ada Daily Task pada target ini.</p>}
      </section>
      {!permissions.canEdit && <p className="rounded-xl bg-gray-50 p-3 text-xs leading-5 text-text-secondary">{record.weeklyTask.status === "PENDING_APPROVAL" ? "Target sedang menunggu review PM / SPV. Pengajuan tetap terkunci selama proses persetujuan." : "Properti Weekly Target dikelola oleh pengelola proyek. Anda dapat memperbarui Daily Task milik Anda."}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {confirm && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs" role="alert">
        <p className="font-semibold">{confirm === "delete" ? "Hapus Weekly Target ini? Aksi ini tidak dapat dibatalkan." : confirm === "discard" ? "Tutup detail dan buang perubahan yang belum disimpan?" : confirm === "APPROVE" ? "Setujui target ini agar PIC dapat membuat Daily Task?" : "Tolak pengajuan Weekly Target ini?"}</p>
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={action} className="btn-primary gap-2 text-xs">{busy && <Loader2 size={13} className="animate-spin" />}{confirm === "delete" ? "Ya, hapus target" : confirm === "discard" ? "Buang perubahan" : "Konfirmasi keputusan"}</button><button type="button" disabled={busy} onClick={() => setConfirm(null)} className="btn-secondary text-xs">Batal</button></div>
      </div>}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        {permissions.canEdit && !editing && <button type="button" disabled={busy} onClick={() => setEditing(true)} className="btn-secondary gap-2 text-xs"><Pencil size={14} />Edit target</button>}
        {permissions.canReview && !editing && <><button type="button" disabled={busy} onClick={() => setConfirm("APPROVE")} className="btn-primary gap-2 text-xs"><Check size={14} />Setujui target</button><button type="button" disabled={busy} onClick={() => setConfirm("REJECT")} className="btn-secondary gap-2 text-xs"><X size={14} />Tolak target</button></>}
        {!editing && <button type="button" disabled={busy} onClick={() => { onOpenDaily(record.id); onClose(); }} className="btn-secondary gap-2 text-xs">Lihat Daily Task saya <ArrowRight size={14} /></button>}
        {permissions.canCreateDaily && !editing && <button type="button" disabled={busy} onClick={() => { onCreateDaily(record); onClose(); }} className="btn-primary gap-2 text-xs"><Plus size={14} />Buat Daily Task</button>}
        {permissions.canDelete && !editing && <button type="button" disabled={busy} onClick={() => setConfirm("delete")} className="ml-auto flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={14} />Hapus target</button>}
      </div>
    </div>
  </Modal>;
}

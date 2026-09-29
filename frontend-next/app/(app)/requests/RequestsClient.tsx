"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, FileText, Link2, MapPin, Plus, RefreshCw, Users, X } from "lucide-react";
import toast from "react-hot-toast";
import { MeetingDetail, MeetingRequestSummary, requestApi } from "@/lib/api/request.api";

type Member = { id: string; name: string; email: string; role: string };
const initialMeeting = { title: "", description: "", start_at: "", end_at: "", location: "", meeting_url: "", meeting_type: "INTERNAL", notetaker_user_id: "", participant_ids: [] as string[], agenda: "" };

export default function RequestsClient() {
  const [meetings, setMeetings] = useState<MeetingRequestSummary[]>([]);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [meetingForm, setMeetingForm] = useState(initialMeeting);
  const [minutes, setMinutes] = useState({ summary: "", opening_notes: "", general_discussion: "", conclusion: "", decisions: "", action_items: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, team] = await Promise.all([requestApi.listMeetings(), requestApi.listTeamMembers()]);
      setMeetings(rows); setMembers(team);
    } catch { toast.error("Gagal memuat Meeting Request."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function openMeeting(id: string) {
    try {
      const detail = await requestApi.getMeeting(id); setSelected(detail);
      setMinutes({
        summary: detail.minutes?.summary ?? "", opening_notes: detail.minutes?.opening_notes ?? "",
        general_discussion: detail.minutes?.general_discussion ?? "", conclusion: detail.minutes?.conclusion ?? "",
        decisions: detail.minutes?.decisions.map((item) => item.decision_text).join("\n") ?? "",
        action_items: detail.minutes?.action_items.map((item) => item.title).join("\n") ?? "",
      });
    } catch { toast.error("Detail meeting tidak dapat dimuat."); }
  }

  async function createMeeting(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const participantSet = new Set(meetingForm.participant_ids);
      if (meetingForm.notetaker_user_id) participantSet.add(meetingForm.notetaker_user_id);
      await requestApi.createMeeting({
        title: meetingForm.title, description: meetingForm.description,
        start_at: new Date(meetingForm.start_at).toISOString(), end_at: new Date(meetingForm.end_at).toISOString(),
        location: meetingForm.location, meeting_url: meetingForm.meeting_url, meeting_type: meetingForm.meeting_type,
        notetaker_user_id: meetingForm.notetaker_user_id || undefined,
        tagged_users: Array.from(participantSet).map((id) => ({ id, name: members.find((item) => item.id === id)?.name ?? id })),
        agenda_items: meetingForm.agenda.split("\n").map((title) => title.trim()).filter(Boolean).map((title) => ({ title })),
      });
      toast.success("Meeting Request berhasil dibuat."); setShowCreate(false); setMeetingForm(initialMeeting); await load();
    } catch { toast.error("Meeting Request gagal dibuat. Periksa waktu dan data wajib."); }
    finally { setBusy(false); }
  }

  const minutesPayload = useMemo(() => ({
    summary: minutes.summary, opening_notes: minutes.opening_notes, general_discussion: minutes.general_discussion, conclusion: minutes.conclusion,
    decisions: minutes.decisions.split("\n").map((text) => text.trim()).filter(Boolean).map((text) => ({ text })),
    action_items: minutes.action_items.split("\n").map((title) => title.trim()).filter(Boolean).map((title) => ({ title })),
  }), [minutes]);

  async function saveMinutes(publish = false) {
    if (!selected) return; setBusy(true);
    try {
      let detail = await requestApi.saveMinutes(selected.id, minutesPayload);
      if (publish) detail = await requestApi.publishMinutes(selected.id);
      setSelected(detail); toast.success(publish ? "Notulensi dipublikasikan dan action item dihasilkan." : "Draft notulensi tersimpan."); await load();
    } catch { toast.error("Notulensi gagal diproses. Pastikan Anda organizer/notulis dan ringkasan telah diisi."); }
    finally { setBusy(false); }
  }

  return <div className="min-h-full bg-slate-50 p-4 md:p-7">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-slate-950 to-blue-950 p-6 text-white shadow-lg md:flex-row md:items-center md:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.24em] text-blue-300">Request Management</p><h1 className="mt-1 text-2xl font-bold">Meeting Request & Notulensi</h1><p className="mt-1 text-sm text-slate-300">Ajukan rapat, catat keputusan, lalu hasilkan tindak lanjut yang terukur.</p></div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold hover:bg-blue-400"><Plus size={17}/> Meeting Request</button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Daftar Meeting</h2><button onClick={() => void load()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><RefreshCw size={16}/></button></div>
          <div className="space-y-2">
            {loading && <p className="py-10 text-center text-sm text-slate-500">Memuat...</p>}
            {!loading && meetings.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Belum ada Meeting Request.</p>}
            {meetings.map((row) => <button key={row.id} onClick={() => void openMeeting(row.id)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.id === row.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
              <div className="flex items-start justify-between gap-2"><span className="text-xs font-semibold text-blue-700">{row.request?.request_number}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{row.status}</span></div>
              <p className="mt-1 font-semibold text-slate-900">{row.request?.title}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays size={13}/>{new Date(row.start_at).toLocaleString("id-ID")}</p>
            </button>)}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selected ? <div className="flex min-h-[430px] flex-col items-center justify-center text-center text-slate-500"><FileText size={42} className="mb-3 text-slate-300"/><p className="font-medium">Pilih meeting untuk melihat agenda dan membuat notulensi.</p></div> : <div className="space-y-5">
            <div className="border-b border-slate-100 pb-4"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-900">{selected.request?.title}</h2>{selected.minutes?.status === "PUBLISHED" && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13}/> Published</span>}</div><p className="mt-2 text-sm text-slate-600">{selected.request?.description}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Clock3 size={14}/>{new Date(selected.start_at).toLocaleString("id-ID")}</span>{selected.location && <span className="flex items-center gap-1"><MapPin size={14}/>{selected.location}</span>}{selected.meeting_url && <a className="flex items-center gap-1 text-blue-600" href={selected.meeting_url} target="_blank"><Link2 size={14}/>Buka meeting</a>}<span className="flex items-center gap-1"><Users size={14}/>{selected.participants.length} peserta</span></div>
            </div>
            <div><h3 className="mb-2 text-sm font-bold text-slate-800">Agenda</h3><ol className="space-y-1">{selected.agenda.map((item) => <li key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><b className="mr-2 text-blue-600">{item.sequence_number}.</b>{item.title}</li>)}</ol></div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextArea label="Ringkasan" value={minutes.summary} onChange={(value) => setMinutes((old) => ({...old, summary:value}))}/><TextArea label="Catatan pembuka" value={minutes.opening_notes} onChange={(value) => setMinutes((old) => ({...old, opening_notes:value}))}/>
              <TextArea label="Pembahasan" value={minutes.general_discussion} onChange={(value) => setMinutes((old) => ({...old, general_discussion:value}))}/><TextArea label="Kesimpulan" value={minutes.conclusion} onChange={(value) => setMinutes((old) => ({...old, conclusion:value}))}/>
              <TextArea label="Keputusan (satu per baris)" value={minutes.decisions} onChange={(value) => setMinutes((old) => ({...old, decisions:value}))}/><TextArea label="Action item (satu per baris)" value={minutes.action_items} onChange={(value) => setMinutes((old) => ({...old, action_items:value}))}/>
            </div>
            <div className="flex justify-end gap-2"><button disabled={busy || selected.minutes?.status === "PUBLISHED"} onClick={() => void saveMinutes(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Simpan Draft</button><button disabled={busy || selected.minutes?.status === "PUBLISHED"} onClick={() => void saveMinutes(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Publikasikan</button></div>
          </div>}
        </section>
      </div>
    </div>

    {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={createMeeting} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold">Buat Meeting Request</h2><p className="text-sm text-slate-500">Peserta dan agenda akan tersimpan bersama request.</p></div><button type="button" onClick={() => setShowCreate(false)}><X/></button></div>
      <div className="grid gap-4 md:grid-cols-2"><Field label="Judul" required value={meetingForm.title} onChange={(v) => setMeetingForm({...meetingForm,title:v})}/><label className="text-sm font-medium">Jenis<select className="mt-1 w-full rounded-lg border p-2.5" value={meetingForm.meeting_type} onChange={(e)=>setMeetingForm({...meetingForm,meeting_type:e.target.value})}><option>INTERNAL</option><option>CLIENT</option><option>VENDOR</option><option>PROJECT</option></select></label><Field label="Mulai" type="datetime-local" required value={meetingForm.start_at} onChange={(v)=>setMeetingForm({...meetingForm,start_at:v})}/><Field label="Selesai" type="datetime-local" required value={meetingForm.end_at} onChange={(v)=>setMeetingForm({...meetingForm,end_at:v})}/><Field label="Lokasi" value={meetingForm.location} onChange={(v)=>setMeetingForm({...meetingForm,location:v})}/><Field label="Link meeting" type="url" value={meetingForm.meeting_url} onChange={(v)=>setMeetingForm({...meetingForm,meeting_url:v})}/>
        <label className="text-sm font-medium">Notulis<select className="mt-1 w-full rounded-lg border p-2.5" value={meetingForm.notetaker_user_id} onChange={(e)=>setMeetingForm({...meetingForm,notetaker_user_id:e.target.value})}><option value="">Pilih opsional</option>{members.map((m)=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="text-sm font-medium">Peserta<select multiple className="mt-1 h-28 w-full rounded-lg border p-2.5" value={meetingForm.participant_ids} onChange={(e)=>setMeetingForm({...meetingForm,participant_ids:Array.from(e.target.selectedOptions).map((o)=>o.value)})}>{members.map((m)=><option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}</select></label>
      </div><div className="mt-4 grid gap-4 md:grid-cols-2"><TextArea label="Tujuan/deskripsi" value={meetingForm.description} onChange={(v)=>setMeetingForm({...meetingForm,description:v})}/><TextArea label="Agenda (satu per baris)" value={meetingForm.agenda} onChange={(v)=>setMeetingForm({...meetingForm,agenda:v})}/></div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setShowCreate(false)} className="rounded-xl border px-4 py-2">Batal</button><button disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Buat Request</button></div>
    </form></div>}
  </div>;
}

function Field({label,value,onChange,type="text",required=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}) { return <label className="text-sm font-medium">{label}<input required={required} type={type} value={value} onChange={(e)=>onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-blue-500"/></label>; }
function TextArea({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) { return <label className="text-sm font-medium text-slate-700">{label}<textarea rows={4} value={value} onChange={(e)=>onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 outline-none focus:border-blue-500"/></label>; }

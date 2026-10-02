"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bold, Calendar, CalendarDays, Check, CheckCircle2, Clock, Clock3, Coffee, Briefcase, FileDown, FileText, Filter, Italic, Link2, MapPin, Pencil, Plus, Repeat, Save, Search, Send, Strikethrough, Trash2, UserCircle2, Video, X, ClipboardList } from "lucide-react";
import toast from "react-hot-toast";
import { MeetingDetail, MeetingRequestSummary, NonMeetingRequest, requestApi } from "@/lib/api/request.api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type Member = { id: string; name: string; email: string; role: string };
type CreateForm = { title:string; description:string; date:string; recurrenceEndDate:string; startTime:string; endTime:string; location:string; meetingUrl:string; meetingType:string; recurrenceType:"RECURRING"|"NON_RECURRING"; recurringDays:number[]; assigneeId:string; notetakerId:string; participantIds:string[]; agenda:string };
const initialCreate: CreateForm = { title:"",description:"",date:"",recurrenceEndDate:"",startTime:"",endTime:"",location:"",meetingUrl:"",meetingType:"MEETING",recurrenceType:"RECURRING",recurringDays:[1,2,3,4,5],assigneeId:"",notetakerId:"",participantIds:[],agenda:"" };
const initialMinutes = { summary:"",opening_notes:"",general_discussion:"",conclusion:"",decisions:"",action_items:"" };
const weekDays=[{value:1,label:"Sen"},{value:2,label:"Sel"},{value:3,label:"Rab"},{value:4,label:"Kam"},{value:5,label:"Jum"},{value:6,label:"Sab"},{value:0,label:"Min"}];

function localIso(date:string,time:string){const value=new Date(`${date}T${time}`);if(Number.isNaN(value.getTime()))throw new Error("Waktu tidak valid");return value.toISOString();}
function displayDate(value:string){return new Date(value).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"});}
function displayOccurrenceDate(value:string){return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"short",year:"numeric"});}
function richTextToPlainText(value:string){
  if(typeof window!=="undefined"){
    const container=document.createElement("div");
    container.innerHTML=value;
    return (container.textContent??"").trim();
  }
  return value.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
}

export default function RequestsClient(){
  const {user}=useAuth();
  const [activeTab,setActiveTab]=useState<'meeting'|'request'>('meeting');
  const [meetings,setMeetings]=useState<MeetingRequestSummary[]>([]);
  const [nonMeetingRequests,setNonMeetingRequests]=useState<NonMeetingRequest[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [selected,setSelected]=useState<MeetingDetail|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  const [notesOpen,setNotesOpen]=useState(false);
  const [createForm,setCreateForm]=useState<CreateForm>(initialCreate);
  const [minutes,setMinutes]=useState(initialMinutes);
  const [personInCharge,setPersonInCharge]=useState("");
  const [requestModalOpen,setRequestModalOpen]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  const [statusFilter,setStatusFilter]=useState<'ALL'|'DRAFT'|'SCHEDULED'|'COMPLETED'>('ALL');
  const [typeFilter,setTypeFilter]=useState<'ALL'|'RECURRING'|'NON_RECURRING'>('ALL');
  const [nonMeetingTypeFilter,setNonMeetingTypeFilter]=useState<'ALL'|'LEAVE'|'OTHER'>('ALL');

  const meetingCounts = useMemo(() => {
    let draft = 0;
    let scheduled = 0;
    let completed = 0;
    for (const m of meetings) {
      if (m.status === 'DRAFT' || m.request?.status === 'DRAFT') draft++;
      else if (m.status === 'COMPLETED') completed++;
      else scheduled++;
    }
    return { all: meetings.length, draft, scheduled, completed };
  }, [meetings]);

  const nonMeetingCounts = useMemo(() => {
    let leave = 0;
    let other = 0;
    for (const r of nonMeetingRequests) {
      if (r.request_type === 'LEAVE') leave++;
      else other++;
    }
    return { all: nonMeetingRequests.length, leave, other };
  }, [nonMeetingRequests]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter(item => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = item.request?.title?.toLowerCase() ?? '';
        const num = item.request?.request_number?.toLowerCase() ?? '';
        const desc = item.request?.description?.toLowerCase() ?? '';
        if (!title.includes(q) && !num.includes(q) && !desc.includes(q)) return false;
      }
      if (statusFilter !== 'ALL') {
        const isDraft = item.status === 'DRAFT' || item.request?.status === 'DRAFT';
        if (statusFilter === 'DRAFT' && !isDraft) return false;
        if (statusFilter === 'SCHEDULED' && (isDraft || item.status === 'COMPLETED')) return false;
        if (statusFilter === 'COMPLETED' && item.status !== 'COMPLETED') return false;
      }
      if (typeFilter !== 'ALL') {
        if (item.recurrence_type !== typeFilter) return false;
      }
      return true;
    });
  }, [meetings, searchQuery, statusFilter, typeFilter]);

  const filteredNonMeeting = useMemo(() => {
    return nonMeetingRequests.filter(item => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = item.title?.toLowerCase() ?? '';
        const num = item.request_number?.toLowerCase() ?? '';
        const desc = item.description?.toLowerCase() ?? '';
        if (!title.includes(q) && !num.includes(q) && !desc.includes(q)) return false;
      }
      if (nonMeetingTypeFilter !== 'ALL') {
        if (item.request_type !== nonMeetingTypeFilter) return false;
      }
      return true;
    });
  }, [nonMeetingRequests, searchQuery, nonMeetingTypeFilter]);

  const openMeeting=useCallback(async(id:string,occurrenceDate?:string)=>{try{const detail=await requestApi.getMeeting(id,occurrenceDate);setSelected(detail);setPersonInCharge(detail.request?.assignee_user_id??detail.notetaker_user_id??"");setMinutes({summary:detail.minutes?.summary??"",opening_notes:detail.minutes?.opening_notes??"",general_discussion:markdownToRichText(detail.minutes?.general_discussion??""),conclusion:detail.minutes?.conclusion??"",decisions:detail.minutes?.decisions.map(item=>item.decision_text).join("\n")??"",action_items:detail.minutes?.action_items.map(item=>item.title).join("\n")??""});return detail;}catch{toast.error("Detail meeting tidak dapat dimuat.");return null;}},[]);
  const load=useCallback(async()=>{setLoading(true);try{const [rows,team,nonMeet]=await Promise.all([requestApi.listMeetings(),requestApi.listTeamMembers(),requestApi.listNonMeetingRequests()]);setMeetings(rows);setMembers(team);setNonMeetingRequests(nonMeet.rows??[]);const id=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("meeting"):null;if(id)await openMeeting(id);}catch{toast.error("Data tidak dapat dimuat.");}finally{setLoading(false);}},[openMeeting]);
  useEffect(()=>{void load();},[load]);

  async function submitMeeting(event:FormEvent,draft:boolean){event.preventDefault();if(createForm.recurrenceType==="RECURRING"&&(!createForm.recurrenceEndDate||!createForm.recurringDays.length)){toast.error("Pilih tanggal akhir dan minimal satu hari recurring.");return;}setBusy(true);try{const ids=new Set(createForm.participantIds);if(createForm.notetakerId)ids.add(createForm.notetakerId);if(createForm.assigneeId)ids.add(createForm.assigneeId);await requestApi.createMeeting({title:createForm.title,description:createForm.description,start_at:localIso(createForm.date,createForm.startTime),end_at:localIso(createForm.date,createForm.endTime),recurrence_type:createForm.recurrenceType,recurrence_end_at:createForm.recurrenceType==="RECURRING"?localIso(createForm.recurrenceEndDate,"23:59"):undefined,recurrence_days:createForm.recurringDays,location:createForm.location,meeting_url:createForm.meetingUrl,meeting_type:"INTERNAL",assignee_user_id:createForm.assigneeId||undefined,notetaker_user_id:createForm.notetakerId||undefined,is_draft:draft,tagged_users:Array.from(ids).map(id=>({id,name:members.find(member=>member.id===id)?.name??id})),agenda_items:createForm.agenda.split("\n").map(title=>title.trim()).filter(Boolean).map(title=>({title}))});toast.success(draft?"Draft request berhasil disimpan.":"Meeting Request terkirim dan seluruh peserta telah diberi notifikasi.");setCreateOpen(false);setCreateForm(initialCreate);await load();}catch{toast.error("Gagal menyimpan request. Periksa jadwal dan data wajib.");}finally{setBusy(false);}}
  async function reassign(){if(!selected?.request||!personInCharge)return toast.error("Pilih person in charge.");setBusy(true);try{await requestApi.assignRequest(selected.request.id,personInCharge);toast.success("Person in charge diperbarui.");await openMeeting(selected.id);}catch{toast.error("Role aktif tidak memiliki izin reassign.");}finally{setBusy(false);}}
  const minutesPayload=useMemo(()=>({occurrence_date:selected?.selected_occurrence_date??"",summary:minutes.summary||richTextToPlainText(minutes.general_discussion).split("\n")[0]||"Notulensi meeting",opening_notes:minutes.opening_notes,general_discussion:minutes.general_discussion,conclusion:minutes.conclusion,decisions:minutes.decisions.split("\n").map(text=>text.trim()).filter(Boolean).map(text=>({text})),action_items:minutes.action_items.split("\n").map(title=>title.trim()).filter(Boolean).map(title=>({title}))}),[minutes,selected?.selected_occurrence_date]);
  async function saveNotes(publish=false){
    if(!selected)return;
    // Publish flow: save draft first, then publish
    if(publish){
      // Frontend guard: can_publish is computed by backend (draft exists + has edit rights)
      if(!selected.permissions?.can_publish){
        // Edge case: maybe draft was not saved yet — save first, then publish
        if(!selected.minutes||selected.minutes.status==='PUBLISHED'){
          toast.error("Tidak ada draft notulensi yang dapat dipublikasikan.");return;
        }
      }
      setBusy(true);
      try{
        // 1. Always save the latest draft content first
        let detail=await requestApi.saveMinutes(selected.id,minutesPayload);
        if(detail.minutes?.status==='PUBLISHED'){setSelected(detail);toast.error("Notulensi ini sudah dipublikasikan.");return;}
        // 2. Then publish
        detail=await requestApi.publishMinutes(selected.id,detail.selected_occurrence_date);
        setSelected(detail);setNotesOpen(false);
        toast.success("Notulensi dipublikasikan. Seluruh peserta meeting telah diberi notifikasi.");
        await load();
      }catch(err:unknown){
        const msg=err instanceof Error?err.message:String(err);
        toast.error(msg.includes('sudah dipublikasikan')?"Notulensi ini sudah dipublikasikan.":"Gagal mempublikasikan notulensi. Pastikan ringkasan sudah diisi.");
      }finally{setBusy(false);}
      return;
    }
    // Draft save: no publish, no notification
    if(!selected.permissions?.can_edit_minutes){
      toast.error(selected.recurrence_type==="RECURRING"?"Hanya peserta meeting yang dapat mengubah notulensi.":"Hanya notulis yang ditugaskan yang dapat mengubah notulensi.");return;
    }
    setBusy(true);
    try{
      const detail=await requestApi.saveMinutes(selected.id,minutesPayload);
      setSelected(detail);
      toast.success("Draft notulensi disimpan. Belum dikirim notifikasi — publikasikan untuk memberi tahu peserta.");
    }catch{
      toast.error("Draft notulensi gagal disimpan. Pastikan data sudah lengkap.");
    }finally{setBusy(false);}
  }
  async function publishMeeting(meetingId:string){
    setBusy(true);
    try{
      const updated=await requestApi.submitDraftMeeting(meetingId);
      setSelected(updated);
      toast.success("Meeting Request berhasil dipublikasikan! Seluruh peserta telah menerima undangan.");
      await load();
    }catch(err:any){
      toast.error(err?.response?.data?.message||"Gagal mempublikasikan meeting draft.");
    }finally{
      setBusy(false);
    }
  }
  async function openNotes(occurrenceDate:string){if(!selected)return;const detail=await openMeeting(selected.id,occurrenceDate);if(detail)setNotesOpen(true);}

  return (
    <div className="flex flex-col gap-5 w-full max-w-full text-[#090909]">
      {/* ── Page Header Card ── */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#D9D9D9] shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xs font-extrabold uppercase tracking-widest text-[#2649B3] px-2 py-0.5 rounded-md bg-[#EAF6FF]">
              MODUL REQUEST & KOORDINASI
            </span>
          </div>
          <h1 className="mt-1.5 text-xl sm:text-2xl font-black text-[#090909] tracking-tight">
            Meeting & Permintaan Tim
          </h1>
          <p className="mt-0.5 text-xs text-[#4F5050]">
            Kelola agenda rapat rutin, notulensi hasil kesepakatan, serta pengajuan cuti dan izin kerja.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {activeTab === 'meeting' ? (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2649B3] hover:bg-[#203D91] text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Meeting Baru</span>
            </button>
          ) : (
            <button
              onClick={() => setRequestModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2B7A42] hover:bg-[#226135] text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Ajukan Request</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Unified Toolbar (Tabs, Type, Status & Search) ── */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#D9D9D9] shadow-xs flex flex-col gap-3">
        {/* Top Row: Module Tabs & Search Input */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Main Module Tabs Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-[#F4F6FB] border border-[#D9D9D9] text-xs font-bold">
            <button
              onClick={() => setActiveTab('meeting')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all",
                activeTab === 'meeting'
                  ? "bg-white text-[#2649B3] shadow-2xs font-extrabold"
                  : "text-[#4F5050] hover:text-[#090909]"
              )}
            >
              <Calendar size={14} />
              <span>Meeting</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-3xs font-extrabold",
                activeTab === 'meeting' ? "bg-[#EAF6FF] text-[#2649B3]" : "bg-neutral-200 text-neutral-600"
              )}>
                {meetings.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('request')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all",
                activeTab === 'request'
                  ? "bg-white text-[#2B7A42] shadow-2xs font-extrabold"
                  : "text-[#4F5050] hover:text-[#090909]"
              )}
            >
              <ClipboardList size={14} />
              <span>Request (Cuti & Other)</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-3xs font-extrabold",
                activeTab === 'request' ? "bg-emerald-100 text-[#2B7A42]" : "bg-neutral-200 text-neutral-600"
              )}>
                {nonMeetingRequests.length}
              </span>
            </button>
          </div>

          {/* Search Box - Absolute icon in left-3.5 with generous pl-10 ensures ZERO overlap */}
          <div className="relative min-w-[220px] flex-1 sm:w-72 sm:flex-initial">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
              <Search size={15} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'meeting' ? "Cari judul meeting atau nomor..." : "Cari cuti atau permintaan..."}
              className="h-10 w-full rounded-xl border border-[#D9D9D9] bg-white pl-10 pr-9 text-xs text-[#090909] placeholder:text-[#4F5050]/60 outline-none focus:border-[#2649B3] focus:ring-1 focus:ring-[#2649B3]/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                title="Hapus pencarian"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Bottom Row: Segmented Filters for Meeting */}
        {activeTab === 'meeting' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-2 border-t border-[#F0F0F0]">
            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-3xs font-bold text-[#4F5050] uppercase tracking-wider hidden sm:inline">Tipe:</span>
              <div className="flex items-center p-1 rounded-xl bg-[#F4F6FB] border border-[#D9D9D9] text-2xs font-bold text-[#4F5050]">
                {(['ALL', 'RECURRING', 'NON_RECURRING'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg transition-all",
                      typeFilter === t ? "bg-white text-[#2649B3] shadow-2xs font-extrabold" : "hover:text-[#090909]"
                    )}
                  >
                    {t === 'ALL' ? 'Semua Tipe' : t === 'RECURRING' ? 'Recurring' : 'Sekali'}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Filter as Segmented Control */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0">
              <span className="text-3xs font-bold text-[#4F5050] uppercase tracking-wider hidden sm:inline">Status:</span>
              <div className="flex items-center p-1 rounded-xl bg-[#F4F6FB] border border-[#D9D9D9] text-2xs font-bold text-[#4F5050]">
                {(['ALL', 'SCHEDULED', 'DRAFT', 'COMPLETED'] as const).map(status => {
                  const count = status === 'ALL' ? meetingCounts.all : status === 'DRAFT' ? meetingCounts.draft : status === 'SCHEDULED' ? meetingCounts.scheduled : meetingCounts.completed;
                  const label = status === 'ALL' ? 'Semua' : status === 'DRAFT' ? 'Draft' : status === 'SCHEDULED' ? 'Terjadwal' : 'Selesai';
                  const isActive = statusFilter === status;
                  return (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all whitespace-nowrap",
                        isActive
                          ? "bg-white text-[#2649B3] shadow-2xs font-extrabold"
                          : "text-[#4F5050] hover:text-[#090909]"
                      )}
                    >
                      <span>{label}</span>
                      <span className={cn(
                        "px-1.5 py-0.2 rounded-full text-3xs font-extrabold",
                        isActive ? "bg-[#EAF6FF] text-[#2649B3]" : "bg-neutral-200/80 text-neutral-600"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Row: Segmented Filters for Request (Leave / Other) */}
        {activeTab === 'request' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-2 border-t border-[#F0F0F0]">
            <div className="flex items-center gap-2">
              <span className="text-3xs font-bold text-[#4F5050] uppercase tracking-wider hidden sm:inline">Kategori:</span>
              <div className="flex items-center p-1 rounded-xl bg-[#F4F6FB] border border-[#D9D9D9] text-2xs font-bold text-[#4F5050]">
                {(['ALL', 'LEAVE', 'OTHER'] as const).map(t => {
                  const count = t === 'ALL' ? nonMeetingCounts.all : t === 'LEAVE' ? nonMeetingCounts.leave : nonMeetingCounts.other;
                  const label = t === 'ALL' ? 'Semua Permohonan' : t === 'LEAVE' ? 'Cuti / Izin' : 'Other Request';
                  const isActive = nonMeetingTypeFilter === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setNonMeetingTypeFilter(t)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all whitespace-nowrap",
                        isActive
                          ? "bg-white text-[#2B7A42] shadow-2xs font-extrabold"
                          : "text-[#4F5050] hover:text-[#090909]"
                      )}
                    >
                      <span>{label}</span>
                      <span className={cn(
                        "px-1.5 py-0.2 rounded-full text-3xs font-extrabold",
                        isActive ? "bg-emerald-100 text-[#2B7A42]" : "bg-neutral-200/80 text-neutral-600"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="text-3xs text-[#4F5050]">
              Total <strong>{filteredNonMeeting.length}</strong> request ditampilkan
            </div>
          </div>
        )}
      </div>

      {/* ── Meeting Tab Content ── */}
      {activeTab === 'meeting' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {loading && [1, 2, 3, 4, 5, 6].map(item => (
            <div key={item} className="h-44 rounded-[20px] bg-white border border-[#D9D9D9] animate-pulse p-4.5" />
          ))}

          {!loading && filteredMeetings.length === 0 && (
            <div className="col-span-full rounded-[20px] bg-white border border-[#D9D9D9] p-12 text-center text-xs text-[#4F5050]">
              Tidak ada agenda meeting yang sesuai dengan filter atau kata kunci pencarian.
            </div>
          )}

          {filteredMeetings.map(row => {
            const isDraft = row.status === "DRAFT" || row.request?.status === "DRAFT";
            const isCompleted = row.status === "COMPLETED";
            const isRecurring = row.recurrence_type === "RECURRING";

            return (
              <div
                key={row.id}
                onClick={() => void openMeeting(row.id)}
                className="group relative flex flex-col justify-between p-4.5 rounded-[20px] bg-white border border-[#D9D9D9] hover:border-[#2649B3]/60 hover:shadow-card-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer shadow-2xs gap-3"
              >
                <div className="space-y-2.5">
                  {/* Card Top: Icon Box + Identifier + Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                        isRecurring
                          ? "bg-[#EAF6FF] border-[#D9D9D9] text-[#2649B3]"
                          : "bg-[#F4F6FB] border-[#D9D9D9] text-[#4F5050]"
                      )}>
                        {isRecurring ? <Repeat size={16} /> : <Calendar size={16} />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-3xs font-mono font-bold text-[#4F5050] uppercase block tracking-wider truncate">
                          {row.request?.request_number || `REQ-${row.id.slice(0, 6)}`}
                        </span>
                        <span className={cn(
                          "inline-block px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase",
                          isRecurring ? "bg-[#EAF6FF] text-[#2649B3]" : "bg-neutral-100 text-neutral-600"
                        )}>
                          {isRecurring ? "Recurring" : "Sekali"}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      {isDraft ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-3xs font-extrabold uppercase">
                          <Clock3 size={11} /> DRAFT
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-emerald-300 bg-emerald-800 text-emerald-800 text-3xs font-extrabold uppercase">
                          <CheckCircle2 size={11} /> SELESAI
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-[#2649B3]/30 bg-[#EAF6FF] text-[#2649B3] text-3xs font-extrabold uppercase">
                          <Check size={11} /> TERJADWAL
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="text-sm font-bold text-[#090909] group-hover:text-[#2649B3] transition-colors line-clamp-1">
                      {row.request?.title || "Tanpa Judul"}
                    </h4>
                    <p className="mt-1 text-xs text-[#4F5050] line-clamp-2 leading-relaxed min-h-[34px]">
                      {row.request?.description || "Tanpa deskripsi"}
                    </p>
                  </div>

                  {/* Location or Meet Link */}
                  {(row.meeting_url || row.location) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {row.meeting_url && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50/70 border border-blue-200/50 text-3xs font-semibold text-[#2649B3]">
                          <Video size={11} /> Google Meet
                        </span>
                      )}
                      {row.location && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200/60 text-3xs font-medium text-[#4F5050] truncate max-w-[170px]">
                          <MapPin size={11} /> {row.location}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer: Date & Detail/Publish Action */}
                <div className="border-t border-[#F0F0F0] pt-2.5 flex items-center justify-between gap-2 text-2xs">
                  <div className="flex items-center gap-1.5 text-[#4F5050] font-medium">
                    <Clock3 size={13} className="text-[#2649B3]" />
                    <span>{displayDate(row.start_at)}</span>
                  </div>

                  {isDraft ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void publishMeeting(row.id);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#2649B3] hover:bg-[#203D91] text-white text-2xs font-extrabold shadow-2xs hover:shadow-xs active:scale-95 transition-all"
                    >
                      <Send size={11} />
                      <span>Publikasikan</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-2xs font-bold text-[#2649B3] group-hover:translate-x-0.5 transition-transform">
                      Detail <ArrowRight size={12} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Request Izin / Cuti Tab Content ── */}
      {activeTab === 'request' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {loading && [1, 2, 3, 4].map(item => (
            <div key={item} className="h-32 rounded-[20px] bg-white border border-[#D9D9D9] animate-pulse p-4.5" />
          ))}

          {!loading && filteredNonMeeting.length === 0 && (
            <div className="col-span-full rounded-[20px] bg-white border border-[#D9D9D9] p-12 text-center text-xs text-[#4F5050]">
              Belum ada permohonan izin atau cuti yang diajukan.
            </div>
          )}

          {filteredNonMeeting.map(req => {
            const isLeave = req.request_type === 'LEAVE';
            return (
              <div
                key={req.id}
                className="p-4.5 rounded-[20px] bg-white border border-[#D9D9D9] hover:border-[#2B7A42]/60 hover:shadow-card-md hover:-translate-y-0.5 transition-all duration-150 shadow-2xs flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                        isLeave ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                      )}>
                        {isLeave ? <Coffee size={16} /> : <Briefcase size={16} />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-3xs font-mono font-bold text-[#4F5050] uppercase block tracking-wider">
                          #{req.request_number}
                        </span>
                        <span className={cn(
                          "inline-block px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase",
                          isLeave ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                        )}>
                          {isLeave ? "Cuti / Izin" : "Permohonan Lain"}
                        </span>
                      </div>
                    </div>

                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full border text-3xs font-extrabold uppercase tracking-wide",
                      req.status === 'COMPLETED' || req.status === 'REGISTERED'
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : req.status === 'PENDING_OM' || req.status === 'PENDING_EXEC'
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-neutral-100 text-neutral-700 border-neutral-200"
                    )}>
                      {req.status}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-[#090909] line-clamp-1">{req.title}</h4>
                    <p className="mt-1 text-xs text-[#4F5050] line-clamp-2 leading-relaxed">
                      {req.description || "Tanpa deskripsi"}
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#F0F0F0] pt-2.5 flex items-center justify-between text-2xs text-[#4F5050]">
                  <span>
                    {req.created_at ? new Date(req.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </span>
                  {req.assignee_user && (
                    <span className="font-bold text-[#2649B3] px-2 py-0.5 rounded bg-[#EAF6FF]">
                      PIC: {req.assignee_user.name}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && <CreateRequestModal form={createForm} setForm={setCreateForm} members={members} busy={busy} onClose={() => setCreateOpen(false)} onSubmit={submitMeeting} />}
      {requestModalOpen && <NewNonMeetingRequestModal members={members} busy={busy} onClose={() => setRequestModalOpen(false)} onSuccess={() => { setRequestModalOpen(false); void load(); }} />}
      {selected && !notesOpen && <MeetingDetailModal detail={selected} members={members} personInCharge={personInCharge} setPersonInCharge={setPersonInCharge} busy={busy} onClose={() => setSelected(null)} onReassign={reassign} onNotes={date => void openNotes(date)} onPublishMeeting={() => void publishMeeting(selected.id)} />}
      {selected && notesOpen && <NotesModal detail={selected} minutes={minutes} setMinutes={setMinutes} busy={busy} onClose={() => setNotesOpen(false)} onSave={saveNotes} />}
    </div>
  );
}

function ModalBackdrop({children,wide=false}:{children:React.ReactNode;wide?:boolean}){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090909]/30 p-3 backdrop-blur-[1px]"><div className={`max-h-[76vh] w-full overflow-y-auto rounded-[24px] bg-white shadow-2xl sm:w-[80vw] ${wide?"max-w-[928px]":"max-w-[784px]"}`}>{children}</div></div>;}

function CreateRequestModal({form,setForm,members,busy,onClose,onSubmit}:{form:CreateForm;setForm:(form:CreateForm)=>void;members:Member[];busy:boolean;onClose:()=>void;onSubmit:(event:FormEvent,draft:boolean)=>void}){const toggleDay=(day:number)=>setForm({...form,recurringDays:form.recurringDays.includes(day)?form.recurringDays.filter(item=>item!==day):[...form.recurringDays,day]});return <ModalBackdrop wide><form onSubmit={event=>{const submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;onSubmit(event,submitter?.value==="draft");}} className="grid min-h-[520px] gap-6 p-6 sm:p-8 lg:grid-cols-[2fr_1fr]">
  <section><button type="button" onClick={onClose} className="mb-8 inline-flex items-center gap-4 text-xl font-extrabold text-[#294BB2]"><ArrowLeft size={20}/> New Meeting Request</button><div className="grid gap-5 md:grid-cols-3"><SelectField label="Meeting Type" value={form.recurrenceType} onChange={value=>setForm({...form,recurrenceType:value as CreateForm["recurrenceType"],recurringDays:value==="RECURRING"?(form.recurringDays.length?form.recurringDays:[1,2,3,4,5]):form.recurringDays})}><option value="RECURRING">Recurring</option><option value="NON_RECURRING">Non-Recurring</option></SelectField><Field label="Start Time" type="time" required value={form.startTime} onChange={value=>setForm({...form,startTime:value})}/><Field label="End Time" type="time" required value={form.endTime} onChange={value=>setForm({...form,endTime:value})}/></div><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label={form.recurrenceType==="RECURRING"?"Schedule Start":"Meeting Date"} type="date" required value={form.date} onChange={value=>setForm({...form,date:value,recurrenceEndDate:form.recurrenceEndDate||value})}/>{form.recurrenceType==="RECURRING"?<Field label="Schedule End" type="date" required value={form.recurrenceEndDate} onChange={value=>setForm({...form,recurrenceEndDate:value})}/>:<Field label="Location" value={form.location} onChange={value=>setForm({...form,location:value})}/>}</div>{form.recurrenceType==="RECURRING"&&<div className="mt-5 rounded-2xl border border-[#CFE0F5] bg-[#F5FAFF] p-4"><p className="text-sm font-bold text-[#294BB2]">Repeating days</p><p className="mt-1 text-xs text-[#6B7280]">Default Senin–Jumat. Sabtu/Minggu hanya aktif jika dipilih secara khusus.</p><div className="mt-3 flex flex-wrap gap-2">{weekDays.map(day=><button key={day.value} type="button" aria-pressed={form.recurringDays.includes(day.value)} onClick={()=>toggleDay(day.value)} className={`h-10 min-w-12 rounded-xl border px-3 text-xs font-bold transition ${form.recurringDays.includes(day.value)?"border-[#294BB2] bg-[#294BB2] text-white":"border-[#C9D2E8] bg-white text-[#4F5050]"}`}>{day.label}</button>)}</div><div className="mt-4"><Field label="Location" value={form.location} onChange={value=>setForm({...form,location:value})}/></div></div>}<label className="mt-5 block text-sm font-bold text-[#294BB2]">Meeting Link<div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-[#D9D9D9] px-4"><Link2 size={17}/><input type="url" value={form.meetingUrl} onChange={event=>setForm({...form,meetingUrl:event.target.value})} placeholder="Add meeting link" className="min-w-0 flex-1 outline-none"/></div></label><div className="mt-8 space-y-5"><Field label="Ticket Title" required value={form.title} onChange={value=>setForm({...form,title:value})}/><TextArea label="Request Details" rows={7} value={form.description} onChange={value=>setForm({...form,description:value})}/><TextArea label="Agenda — one item per line" rows={4} value={form.agenda} onChange={value=>setForm({...form,agenda:value})}/></div></section>
  <aside className="flex flex-col"><div className="space-y-7">{form.recurrenceType!=="RECURRING"?(<><SelectField icon={<UserCircle2 size={22}/>} label="Assign team (Opsional)" value={form.assigneeId} onChange={value=>setForm({...form,assigneeId:value})}><option value="">Pilih Staff (Opsional)</option>{members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</SelectField><SelectField icon={<FileText size={22}/>} label="Notulis (Opsional)" value={form.notetakerId} onChange={value=>setForm({...form,notetakerId:value})}><option value="">Terbuka untuk semua peserta</option>{members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</SelectField></>):(<div className="rounded-2xl border border-[#CFE0F5] bg-[#F5FAFF] p-4 text-xs text-[#294BB2]"><p className="font-extrabold uppercase tracking-wider">Recurring Meeting</p><p className="mt-1 leading-5 text-[#556987]">Notulensi terbuka untuk <strong>siapa saja peserta</strong> yang hadir dalam meeting ini. Tidak perlu menunjuk notulis atau assignee khusus.</p></div>)}<InvitePeoplePicker members={members} selectedIds={form.participantIds} onChange={participantIds=>setForm({...form,participantIds})}/></div><div className="mt-auto space-y-3 pt-10"><button type="submit" name="submit_intent" value="send" disabled={busy} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#294BB2] font-bold text-white disabled:opacity-50">Send Request <ArrowRight size={18}/></button><button type="submit" name="submit_intent" value="draft" disabled={busy} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border-2 border-[#3154C7] font-bold text-[#294BB2] disabled:opacity-50">Simpan Request <FileDown size={18}/></button></div></aside>
</form></ModalBackdrop>;}

function MeetingDetailModal({detail,members,personInCharge,setPersonInCharge,busy,onClose,onReassign,onNotes,onPublishMeeting}:{detail:MeetingDetail;members:Member[];personInCharge:string;setPersonInCharge:(id:string)=>void;busy:boolean;onClose:()=>void;onReassign:()=>void;onNotes:(date:string)=>void;onPublishMeeting:()=>void}){
  const hasMinutes=Boolean(detail.minutes);
  const published=detail.minutes?.status==="PUBLISHED";
  const isDraft=detail.minutes?.status!=null&&!published;
  const isMeetingDraft=detail.status==="DRAFT"||detail.request?.status==="DRAFT";
  const canEditMinutes=detail.permissions?.can_edit_minutes??false;
  const canPublish=detail.permissions?.can_publish??false;
  // For non-recurring: user can open notes if it's published (read) or has edit rights
  const canOpenMinutes=published||canEditMinutes;
  const notetaker=detail.notetaker??detail.participants.find(item=>item.user_id===detail.notetaker_user_id)?.user??null;
  const notetakerName=notetaker?.full_name??notetaker?.email??"Belum ditentukan";
  // Label for the non-recurring notes button
  const notesLabel=published?"Lihat Notulensi":isDraft?(canPublish?"Edit & Publikasikan":"Edit Draft"):canEditMinutes?"Buat Notulensi":"Khusus Notulis";
  return <ModalBackdrop><div>
    <header className="flex items-center justify-between rounded-t-[24px] bg-[#EAF6FF] px-6 py-5 sm:px-8"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#5670B9]">Meeting Request</p><h2 className="mt-1 text-xl font-extrabold text-[#294BB2]">Scheduled Meeting</h2></div><button onClick={onClose} aria-label="Tutup detail meeting" className="grid h-10 w-10 place-items-center rounded-full text-[#294BB2] transition hover:bg-white"><X size={23}/></button></header>
    <div className="p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><span className="rounded-lg bg-[#294BB2] px-4 py-2 text-xs font-bold tracking-wide text-white">MEETING</span><span className={`rounded-lg px-4 py-2 text-xs font-bold ${isMeetingDraft?"border border-[#F5C842] bg-[#FFF5D9] text-[#8A6100]":"bg-[#EAF6FF] text-[#294BB2]"}`}>{detail.request?.status??detail.status}</span></div>
      {isMeetingDraft&&<div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#F5C842] bg-[#FFF9E6] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-wide text-[#8A6100]">Meeting ini masih berstatus DRAFT</p><p className="mt-1 text-xs text-[#7A5C00]">Meeting belum aktif dan undangan belum dikirim ke peserta. Klik tombol di samping untuk mempublikasikan meeting ini.</p></div><button disabled={busy} onClick={onPublishMeeting} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#294BB2] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#203D91] disabled:opacity-50 shadow-sm"><Send size={15}/> Publikasikan Meeting</button></div>}
      <h3 className="mt-6 text-2xl font-extrabold text-[#294BB2]">{detail.request?.title}</h3><p className="mt-2 text-sm leading-6 text-[#4F5050]">{detail.request?.description||"Tanpa deskripsi"}</p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#4F5050]"><span className="flex items-center gap-2"><Clock3 size={17}/>{displayDate(detail.start_at)}{detail.recurrence_type==="RECURRING"&&detail.recurrence_end_at?` – ${displayOccurrenceDate(detail.recurrence_end_at.slice(0,10))}`:""}</span>{detail.location&&<span className="flex items-center gap-2"><MapPin size={17}/>{detail.location}</span>}</div>
      {detail.recurrence_type!=="RECURRING"&&<div className="mt-7 rounded-2xl border border-[#E5E5E5] p-5"><label className="block text-xs font-extrabold tracking-wide text-[#294BB2]">PERSON IN CHARGE<div className="mt-2 flex flex-col gap-3 sm:flex-row"><select value={personInCharge} onChange={event=>setPersonInCharge(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-[#D9D9D9] bg-white px-4 text-sm outline-none focus:border-[#294BB2]"><option value="">Pilih staff</option>{members.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select><button disabled={busy||!personInCharge} onClick={onReassign} className="h-11 rounded-xl bg-[#294BB2] px-6 text-sm font-bold text-white transition hover:bg-[#203D91] disabled:opacity-50">Reassign</button></div></label></div>}
      <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#CFE0F5] bg-[#F5FAFF] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-extrabold tracking-wide text-[#294BB2]">NOTULENSI MEETING</p><p className="mt-1 text-xs text-[#6B7280]">{detail.recurrence_type==="RECURRING"?"Notulensi terbuka: siapa saja peserta yang hadir dapat menyusun notulensi per tanggal.":"Satu-satunya pengguna yang dapat menyusun dan mempublikasikan notulensi."}</p></div>{detail.recurrence_type==="RECURRING"?(<div className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#294BB2] shadow-sm sm:self-auto"><FileText size={17}/><span>Terbuka untuk semua peserta</span></div>):(<div className="inline-flex items-center gap-2 self-start rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#294BB2] shadow-sm sm:self-auto"><FileText size={17}/><span>{notetakerName}</span>{canEditMinutes&&<span className="rounded-md bg-[#294BB2] px-2 py-0.5 text-[10px] text-white">ANDA</span>}</div>)}</section>
      <div className="mt-5 grid gap-5 md:grid-cols-2"><section className="rounded-2xl border border-[#E5E5E5] p-5"><p className="text-xs font-extrabold tracking-wide text-[#294BB2]">INVITED PEOPLE</p><div className="mt-3 flex flex-wrap gap-2">{detail.participants.filter(item=>item.participant_role!=="ORGANIZER").map(item=><span key={item.id} className="inline-flex items-center gap-2 rounded-lg bg-[#EAF6FF] px-3 py-2 text-xs font-bold text-[#294BB2]"><UserCircle2 size={17}/>{item.user?.full_name??item.user?.email??"Team member"}</span>)}</div></section><section className="rounded-2xl border border-[#E5E5E5] p-5"><p className="text-xs font-extrabold tracking-wide text-[#294BB2]">MEETING LINK</p><div className="mt-3 flex h-10 items-center rounded-xl bg-[#F8FAFC] px-3"><span className="min-w-0 flex-1 truncate text-sm text-[#4F5050]">{detail.meeting_url||"Belum ada meeting link"}</span><Pencil size={18} className="text-[#1687EF]"/></div></section></div>
      {detail.recurrence_type==="RECURRING"&&<section className="mt-5 overflow-hidden rounded-2xl border border-[#DDE5F1]"><div className="flex items-center justify-between bg-[#F5FAFF] px-5 py-4"><div><p className="text-sm font-extrabold text-[#294BB2]">Notes</p><p className="mt-1 text-xs text-[#6B7280]">Satu notulensi untuk setiap tanggal meeting</p></div><span className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#294BB2]">Terbaru</span></div><div className="max-h-72 divide-y divide-[#EDF0F4] overflow-y-auto">{detail.notes.map(note=>{const notePublished=note.status==="COMPLETED";const noteDraft=note.status==="DRAFT";const canOpen=notePublished||canEditMinutes;const label=note.status==="NOT_CREATED"?"Belum dibuat":noteDraft?"Draft":"Dipublikasikan";return <div key={note.occurrence_date} className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${note.is_today?"bg-[#F0F7FF]/70":""}`}><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl ${notePublished?"bg-[#E6F8EE] text-[#147A43]":noteDraft?"bg-[#FFF5D9] text-[#8A6100]":"bg-[#F1F3F7] text-[#6B7280]"}`}>{notePublished?<Check size={17}/>:<FileText size={17}/>}</span><div><div className="flex items-center gap-2"><p className="text-sm font-bold text-[#243B7A]">{displayOccurrenceDate(note.occurrence_date)}</p>{note.is_today&&<span className="rounded-md bg-[#294BB2] px-2 py-0.5 text-[10px] font-bold text-white tracking-wide">Hari Ini</span>}</div><p className="mt-0.5 text-xs text-[#6B7280]">{label}</p></div></div><button disabled={!canOpen} onClick={()=>onNotes(note.occurrence_date)} className={`h-9 rounded-xl border px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:border-[#D9D9D9] disabled:text-[#9CA3AF] ${notePublished?"border-[#147A43] text-[#147A43] hover:bg-[#E6F8EE]":noteDraft?"border-[#8A6100] bg-[#FFF5D9] text-[#8A6100] hover:bg-[#FFE9A0]":"border-[#294BB2] text-[#294BB2] hover:bg-[#EAF6FF]"}`}>{notePublished?"Lihat":noteDraft?"Edit Draft":"Buat"}</button></div>})}</div></section>}
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><button onClick={onClose} className="h-11 rounded-xl px-5 text-sm font-semibold text-[#4F5050] transition hover:bg-[#F4F4F4]">Tutup</button><div className="flex flex-wrap items-center gap-3">{isMeetingDraft&&<button disabled={busy} onClick={onPublishMeeting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#294BB2] px-6 text-sm font-bold text-white transition hover:bg-[#203D91] disabled:opacity-50 shadow-sm"><Send size={18}/> Kirim / Publikasikan Meeting</button>}{detail.recurrence_type!=="RECURRING"&&<div className="text-right">{!canOpenMinutes&&<p className="mb-2 text-xs text-[#6B7280]">Hanya {notetakerName} yang dapat membuka editor notulensi.</p>}{isDraft&&canEditMinutes&&!published&&<p className="mb-2 text-xs font-semibold text-[#8A6100]">Draft tersimpan — belum dipublikasikan. Peserta belum mendapat notifikasi.</p>}<button disabled={!canOpenMinutes} onClick={()=>onNotes(detail.selected_occurrence_date)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#294BB2] px-6 text-sm font-bold text-white transition hover:bg-[#203D91] disabled:cursor-not-allowed disabled:bg-[#AAB8DF]"><FileText size={18}/>{notesLabel}</button></div>}</div></div>
    </div>
  </div></ModalBackdrop>;
}

const richTextTags=new Set(["B","STRONG","I","EM","S","STRIKE","BR","DIV","P","UL","OL","LI"]);
function sanitizeRichText(value:string){
  if(typeof window==="undefined")return value;
  const template=document.createElement("template");
  template.innerHTML=value;
  template.content.querySelectorAll("script,style,iframe,object,embed").forEach(node=>node.remove());
  Array.from(template.content.querySelectorAll("*")).reverse().forEach(element=>{
    if(richTextTags.has(element.tagName))Array.from(element.attributes).forEach(attribute=>element.removeAttribute(attribute.name));
    else element.replaceWith(...Array.from(element.childNodes));
  });
  return template.innerHTML;
}
function markdownToRichText(value:string){
  if(!value)return "";
  if(/<\/?[a-z][\s\S]*>/i.test(value))return sanitizeRichText(value);
  const escaped=value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/~~(.+?)~~/g,"<s>$1</s>").replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g,"$1<em>$2</em>").replace(/\r?\n/g,"<br>");
}
function normalizedEditorHtml(element:HTMLDivElement){
  const html=sanitizeRichText(element.innerHTML).replace(/^(<br>)+|(<br>)+$/g,"");
  return richTextToPlainText(html)?html:"";
}

function RichTextEditor({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}){
  const editorRef=useRef<HTMLDivElement>(null);
  const [active,setActive]=useState({bold:false,italic:false,strikeThrough:false});
  const [empty,setEmpty]=useState(!richTextToPlainText(value));
  useEffect(()=>{const editor=editorRef.current;if(!editor)return;const incoming=sanitizeRichText(value);if(sanitizeRichText(editor.innerHTML)!==incoming)editor.innerHTML=incoming;setEmpty(!richTextToPlainText(incoming));},[value]);
  useEffect(()=>{const update=()=>{const selection=document.getSelection();if(!editorRef.current||!selection?.anchorNode||!editorRef.current.contains(selection.anchorNode))return;setActive({bold:document.queryCommandState("bold"),italic:document.queryCommandState("italic"),strikeThrough:document.queryCommandState("strikeThrough")});};document.addEventListener("selectionchange",update);return()=>document.removeEventListener("selectionchange",update);},[]);
  const emitChange=()=>{const editor=editorRef.current;if(!editor)return;const next=normalizedEditorHtml(editor);setEmpty(!richTextToPlainText(next));onChange(next);};
  const format=(command:"bold"|"italic"|"strikeThrough")=>{if(disabled)return;editorRef.current?.focus();document.execCommand(command,false);emitChange();setActive(old=>({...old,[command]:document.queryCommandState(command)}));};
  const formats:["bold"|"italic"|"strikeThrough",string,React.ReactNode][]=[["bold","Tebal",<Bold key="bold" size={18}/>],["italic","Miring",<Italic key="italic" size={18}/>],["strikeThrough","Coret",<Strikethrough key="strike" size={18}/>]];
  return <section className="flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white focus-within:border-[#294BB2] focus-within:ring-2 focus-within:ring-[#294BB2]/10 lg:min-h-0">
    <div className="flex items-center justify-between border-b border-[#E5E5E5] bg-[#F8FAFC] px-3 py-2"><div><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#294BB2]">Catatan Utama</p><p className="mt-0.5 text-xs text-[#6B7280]">Pilih teks, lalu gunakan format.</p></div><div className="flex items-center gap-1 rounded-xl border border-[#DDE7F2] bg-white p-1" role="toolbar" aria-label="Format teks">{formats.map(([command,label,icon])=><button key={command} type="button" title={label} aria-label={label} aria-pressed={active[command]} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>format(command)} className={`grid h-9 w-9 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${active[command]?"bg-[#294BB2] text-white":"text-[#294BB2] hover:bg-[#EAF6FF]"}`}>{icon}</button>)}</div></div>
    <div className="relative min-h-0 flex-1"><div ref={editorRef} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Isi notulensi meeting" onInput={emitChange} onBlur={()=>{const editor=editorRef.current;if(editor){const clean=normalizedEditorHtml(editor);editor.innerHTML=clean;onChange(clean);}}} className={`h-full min-h-[300px] overflow-y-auto p-5 text-base leading-7 outline-none sm:p-6 ${disabled?"cursor-default bg-[#FAFAFA]":""}`}/>{empty&&<span className="pointer-events-none absolute left-5 top-5 text-sm text-[#9CA3AF] sm:left-6 sm:top-6">Tulis pembahasan meeting di sini...</span>}</div>
  </section>;
}

function NotesModal({detail,minutes,setMinutes,busy,onClose,onSave}:{detail:MeetingDetail;minutes:typeof initialMinutes;setMinutes:React.Dispatch<React.SetStateAction<typeof initialMinutes>>;busy:boolean;onClose:()=>void;onSave:(publish?:boolean)=>void}){
  const published=detail.minutes?.status==="PUBLISHED";
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#090909]/35 p-2 backdrop-blur-[1px] sm:p-4"><div className="flex max-h-[80vh] min-h-0 w-full max-w-[1008px] flex-col overflow-hidden rounded-[22px] bg-white shadow-2xl sm:w-[80vw]">
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#EAEAEA] px-4 py-4 sm:px-7"><button onClick={onClose} className="inline-flex min-w-0 items-center gap-3 text-left text-[#294BB2]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EAF6FF]"><ArrowLeft size={18}/></span><span className="min-w-0"><strong className="block truncate text-lg">{detail.request?.title}</strong><span className="block truncate text-xs font-semibold text-[#6B7280]">{displayOccurrenceDate(detail.selected_occurrence_date)}</span></span></button>{published?<span className="rounded-lg bg-[#EAF6FF] px-4 py-2 text-xs font-extrabold text-[#294BB2]">COMPLETED</span>:<button disabled={busy} onClick={()=>void onSave(false)} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#294BB2] px-4 text-sm font-bold text-white transition hover:bg-[#203D91] disabled:opacity-50 sm:px-6"><Save size={18}/><span className="hidden sm:inline">Simpan Draft</span><span className="sm:hidden">Simpan</span></button>}</header>
    {published&&<div className="mx-4 mt-4 rounded-xl border border-[#CFE3F6] bg-[#F1F8FE] px-4 py-3 text-sm text-[#294BB2] sm:mx-7">Notulensi ini telah dipublikasikan dan ditampilkan dalam mode baca. Seluruh peserta sudah mendapat notifikasi.</div>}
    {!published&&detail.minutes&&<div className="mx-4 mt-4 rounded-xl border border-[#F5C842] bg-[#FFF9E6] px-4 py-3 text-xs text-[#7A5C00] sm:mx-7"><strong>Draft tersimpan.</strong> Notulensi ini belum dipublikasikan — peserta belum mendapat notifikasi. Klik <strong>Publikasikan</strong> setelah selesai mengedit.</div>}
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-7 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)] lg:overflow-hidden"><RichTextEditor disabled={published} value={minutes.general_discussion} onChange={value=>setMinutes(old=>({...old,general_discussion:value}))}/><aside className="grid content-start gap-4 overflow-visible lg:overflow-y-auto lg:pr-1"><div className="rounded-2xl border border-[#E5E5E5] bg-[#FCFCFC] p-4"><TextArea disabled={published} label="Ringkasan" hint="Gambaran singkat hasil meeting" rows={3} value={minutes.summary} onChange={value=>setMinutes(old=>({...old,summary:value}))}/></div><div className="rounded-2xl border border-[#E5E5E5] bg-[#FCFCFC] p-4"><TextArea disabled={published} label="Keputusan" hint="Tulis satu keputusan per baris" rows={4} value={minutes.decisions} onChange={value=>setMinutes(old=>({...old,decisions:value}))}/></div><div className="rounded-2xl border border-[#E5E5E5] bg-[#FCFCFC] p-4"><TextArea disabled={published} label="Action Item" hint="Tulis satu tindak lanjut per baris" rows={4} value={minutes.action_items} onChange={value=>setMinutes(old=>({...old,action_items:value}))}/></div></aside></div>
    <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#EAEAEA] bg-white px-4 py-3 sm:px-7">{!published&&<><button disabled={busy} onClick={()=>void onSave(false)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#294BB2] px-4 text-sm font-bold text-[#294BB2] transition hover:bg-[#EAF6FF] disabled:opacity-50"><Save size={17}/>Simpan Draft</button><button disabled={busy} onClick={()=>void onSave(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#147A43] px-5 text-sm font-bold text-white transition hover:bg-[#0e5c32] disabled:opacity-50"><CheckCircle2 size={17}/>Publikasikan</button></>}</footer>
  </div></div>;
}

function Field({label,value,onChange,type="text",required=false}:{label:string;value:string;onChange:(value:string)=>void;type?:string;required?:boolean}){return <label className="block text-xs font-bold text-[#090909]">{label}<input required={required} type={type} value={value} onChange={event=>onChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-[#D9D9D9] bg-white px-3.5 text-xs text-[#090909] outline-none focus:border-[#2649B3] focus:ring-1 focus:ring-[#2649B3]/20 transition-all"/></label>;}
function SelectField({label,value,onChange,children,icon}:{label:string;value:string;onChange:(value:string)=>void;children:React.ReactNode;icon?:React.ReactNode}){return <label className="block text-xs font-bold text-[#090909]"><span className="mb-1.5 flex items-center gap-1.5">{icon&&<span className="text-[#2649B3]">{icon}</span>}{label}</span><select value={value} onChange={event=>onChange(event.target.value)} className="h-10 w-full rounded-xl border border-[#D9D9D9] bg-white px-3 text-xs font-semibold text-[#090909] outline-none focus:border-[#2649B3] focus:ring-1 focus:ring-[#2649B3]/20 transition-all">{children}</select></label>;}
function InvitePeoplePicker({members,selectedIds,onChange}:{members:Member[];selectedIds:string[];onChange:(ids:string[])=>void}){const selected=new Set(selectedIds);const toggle=(id:string)=>onChange(selected.has(id)?selectedIds.filter(item=>item!==id):[...selectedIds,id]);return <fieldset><legend className="flex w-full items-center justify-between gap-3 text-xs font-bold text-[#090909]"><span className="flex items-center gap-2"><Link2 size={16} className="text-[#2649B3]"/>Undang Anggota</span>{selectedIds.length>0&&<button type="button" onClick={()=>onChange([])} className="text-3xs font-semibold text-[#2649B3] hover:underline">Hapus semua</button>}</legend><p className="mt-1 text-3xs font-normal text-[#6B7280]">Pilih anggota yang akan diundang ke meeting ini.</p><div className="mt-2.5 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[#D9D9D9] bg-white p-2" role="group" aria-label="Pilih anggota yang akan diundang">{members.length===0?<p className="px-3 py-4 text-center text-xs text-[#6B7280]">Belum ada anggota tim aktif.</p>:members.map(member=>{const checked=selected.has(member.id);return <button key={member.id} type="button" role="checkbox" aria-checked={checked} onClick={()=>toggle(member.id)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition text-xs", checked?"bg-[#2649B3] text-white":"text-[#090909] hover:bg-[#EAF6FF]")}><span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked?"border-white bg-white text-[#2649B3]":"border-[#D9D9D9] bg-white")}>{checked&&<Check size={12} strokeWidth={3}/>}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{member.name}</strong><span className={cn("block truncate text-3xs font-normal", checked?"text-blue-100":"text-[#6B7280]")}>{member.role} · {member.email}</span></span></button>})}</div><div className="mt-1.5 flex items-center justify-between text-3xs"><span className={selectedIds.length?"font-bold text-[#2649B3]":"text-[#6B7280]"}>{selectedIds.length} anggota dipilih</span>{selectedIds.length>0&&<span className="text-[#6B7280]">Klik untuk membatalkan</span>}</div></fieldset>;}
function TextArea({label,value,onChange,rows,hint,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;rows:number;hint?:string;disabled?:boolean}){return <label className="block text-xs font-bold text-[#090909]">{label}{hint&&<span className="mt-0.5 block text-3xs font-normal text-[#6B7280]">{hint}</span>}<textarea disabled={disabled} rows={rows} value={value} onChange={event=>onChange(event.target.value)} className="mt-1.5 w-full resize-none rounded-xl border border-[#D9D9D9] bg-white p-3 text-xs leading-5 text-[#090909] outline-none focus:border-[#2649B3] focus:ring-1 focus:ring-[#2649B3]/20 disabled:cursor-default disabled:bg-neutral-50 transition-all"/></label>;}

function NewNonMeetingRequestModal({members,busy,onClose,onSuccess}:{members:Member[];busy:boolean;onClose:()=>void;onSuccess:()=>void}){
  const [type,setType]=useState<'LEAVE'|'OTHER'>('LEAVE');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [startAt,setStartAt]=useState('');
  const [endAt,setEndAt]=useState('');
  const [assigneeId,setAssigneeId]=useState('');
  const [submitting,setSubmitting]=useState(false);
  async function handleSubmit(event:React.FormEvent){
    event.preventDefault();
    if(!title.trim()){toast.error('Judul request wajib diisi.');return;}
    setSubmitting(true);
    try{
      await requestApi.createNonMeetingRequest({
        request_type:type,title:title.trim(),description:description.trim()||undefined,
        start_at:startAt?new Date(startAt).toISOString():undefined,
        end_at:endAt?new Date(endAt).toISOString():undefined,
        assignee_user_id:type==='OTHER'&&assigneeId?assigneeId:undefined,
      });
      toast.success(type==='LEAVE'?'Permohonan cuti/izin berhasil dikirim dan akan diproses.':'Request berhasil dikirim.');
      onSuccess();
    }catch{toast.error('Gagal mengirim request. Silakan coba lagi.');}finally{setSubmitting(false);}
  }
  return <ModalBackdrop>
    <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-[#2B7A42]">New Request</h2>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[#F4F6FB] text-[#4F5050] hover:bg-[#E8F5E9]"><X size={18}/></button>
      </div>
      <div className="flex gap-2 rounded-xl bg-[#F4F6FB] p-1">
        {(['LEAVE','OTHER'] as const).map(t=><button key={t} type="button" onClick={()=>setType(t)} className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition ${type===t?'bg-white text-[#2B7A42] shadow-sm':'text-[#4F5050] hover:text-[#2B7A42]'}`}>{t==='LEAVE'?'Cuti / Izin':'Other Request'}</button>)}
      </div>
      <Field label="Judul Request" required value={title} onChange={setTitle}/>
      <TextArea label="Deskripsi" rows={4} value={description} onChange={setDescription}/>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={type==='LEAVE'?'Mulai Cuti':'Mulai'} type="date" value={startAt} onChange={setStartAt}/>
        <Field label={type==='LEAVE'?'Selesai Cuti':'Selesai'} type="date" value={endAt} onChange={setEndAt}/>
      </div>
      {type==='OTHER'&&<div><label className="block text-sm font-bold text-[#294BB2]">Assign kepada<select value={assigneeId} onChange={event=>setAssigneeId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border-2 border-[#3154C7] bg-white px-4 text-[#294BB2] outline-none"><option value="">Pilih anggota (opsional)</option>{members.map(m=><option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}</select></label></div>}
      {type==='LEAVE'&&<div className="rounded-xl bg-[#FFF9E6] border border-[#F5C842] px-4 py-3 text-xs text-[#7A5C00]">Permohonan cuti/izin akan otomatis diarahkan ke HR atau Eksekutif yang bertanggung jawab. Anda tidak perlu memilih tujuan.</div>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border-2 border-[#D9D9D9] font-bold text-[#4F5050] hover:bg-[#F4F6FB]">Batal</button>
        <button type="submit" disabled={submitting||busy} className="flex-1 h-11 rounded-xl bg-[#2B7A42] font-bold text-white hover:bg-[#226135] disabled:opacity-50">Kirim Request</button>
      </div>
    </form>
  </ModalBackdrop>;
}

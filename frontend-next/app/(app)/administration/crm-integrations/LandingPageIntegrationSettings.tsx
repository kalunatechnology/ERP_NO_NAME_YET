"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Globe2, Link2, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { cn } from "@/lib/utils";
import {
  createCRMIntegrationSource,
  loadCRMIntegrationAssignees,
  loadCRMIntegrationSources,
  setCRMIntegrationSourceStatus,
  type CRMIntegrationSource,
} from "@/lib/api/crm.api";

const EVENT_OPTIONS = [
  { value: "message.received", label: "Pesan masuk → Customer Inbox" },
  { value: "inquiry.submitted", label: "Inquiry dari formulir website" },
  { value: "ticket.created", label: "Tiket support baru" },
  { value: "quotation.decision", label: "Keputusan quotation" },
  { value: "quotation.accepted", label: "Quotation disetujui" },
];

export default function LandingPageIntegrationSettings() {
  const [sources, setSources] = useState<CRMIntegrationSource[]>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(true);
  const [assigneesError, setAssigneesError] = useState(false);
  const [companyScope, setCompanyScope] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdSecret, setCreatedSecret] = useState("");
  const [createdSource, setCreatedSource] = useState<CRMIntegrationSource | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ source_code: "ARSALYNK_LANDING", account_name: "Arsalynk Landing Page", external_account_id: "landing-page-main", business_unit_code: "SALES", business_unit_name: "Sales", default_assigned_user_id: "" });
  const [events, setEvents] = useState<string[]>(["inquiry.submitted"]);
  const scopeHeaders = companyScope ? { headers: { "X-Company-ID": companyScope } } : undefined;
  const endpoint = typeof window !== "undefined" ? new URL("/api/v1/integrations/webhooks/events", api.defaults.baseURL || window.location.origin).toString() : "/api/v1/integrations/webhooks/events";

  useEffect(() => { setCompanyScope(new URLSearchParams(window.location.search).get("company_id") || ""); }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setSources(await loadCRMIntegrationSources(companyScope || undefined)); }
    catch (error: any) { toast.error(error?.response?.data?.error?.message || "Gagal memuat integrasi CRM."); }
    finally { setLoading(false); }
  }, [companyScope]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    setAssigneesLoading(true);
    setAssigneesError(false);
    loadCRMIntegrationAssignees(companyScope || undefined)
      .then((rows) => { if (!cancelled) setAssignees(rows); })
      .catch(() => { if (!cancelled) { setAssignees([]); setAssigneesError(true); } })
      .finally(() => { if (!cancelled) setAssigneesLoading(false); });
    return () => { cancelled = true; };
  }, [companyScope]);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setSaving(true); setCreatedSecret(""); setCreatedSource(null);
    try {
      const created = await createCRMIntegrationSource({ ...form, default_assigned_user_id: form.default_assigned_user_id || undefined, allowed_event_types: events }, companyScope || undefined);
      setCreatedSecret(created.signing_secret);
      setCreatedSource(created);
      setSources((current) => [created, ...current]);
      toast.success("Integrasi landing page berhasil dibuat.");
    } catch (error: any) { toast.error(error?.response?.data?.error?.message || "Gagal membuat integrasi. Periksa company dan pastikan modul CRM aktif."); }
    finally { setSaving(false); }
  };
  const toggle = async (source: CRMIntegrationSource) => {
    const status = source.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await setCRMIntegrationSourceStatus(source.id, status, companyScope || undefined);
      setSources((current) => current.map((item) => item.id === source.id ? { ...item, status } : item));
      toast.success(status === "ACTIVE" ? "Integrasi diaktifkan." : "Integrasi dijeda.");
    } catch (error: any) { toast.error(error?.response?.data?.error?.message || "Status integrasi gagal diubah."); }
  };
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  const inputClass = "w-full rounded-lg border border-[#D8DEE8] bg-white px-3 py-2.5 text-sm text-[#172033] outline-none focus:border-[#2649B3]";
  const field = (label: string, key: keyof typeof form, hint: string) => <label key={key} className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">{label}<input className={inputClass} value={form[key]} onChange={(e) => update(key, e.target.value)} /><span className="font-normal text-[#718096]">{hint}</span></label>;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-[#EAF6FF] p-2 text-[#2649B3]"><Globe2 size={19}/></div><div><h2 className="text-base font-bold text-[#172033]">Hubungkan landing page ke CRM Marka</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#64748B]">Daftarkan server landing page sebagai sumber resmi. Marka membuat ID dan signing secret agar server website dapat mengirim formulir atau pesan masuk dengan aman.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{field("Kode sumber", "source_code", "Huruf kapital, angka, _ atau -; contoh ARSALYNK_LANDING")}{field("Nama integrasi", "account_name", "Nama yang mudah dikenali administrator")}{field("ID akun eksternal", "external_account_id", "Penanda channel dari website Anda")}{field("Kode unit bisnis (opsional)", "business_unit_code", "Contoh SALES atau SERVICE")}{field("Nama unit bisnis (opsional)", "business_unit_name", "Nama unit untuk routing inbox")}
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">Penanggung jawab awal (opsional)<select className={inputClass} value={form.default_assigned_user_id} onChange={(e) => update("default_assigned_user_id", e.target.value)} disabled={assigneesLoading || assigneesError || assignees.length === 0}><option value="">{assigneesLoading ? "Memuat pengguna…" : assigneesError ? "Daftar pengguna gagal dimuat" : assignees.length ? "Belum ditentukan" : "Belum ada user CRM/Sales"}</option>{assignees.map((user) => <option key={user.id} value={user.id}>{user.full_name} · {user.email}</option>)}</select><span className="font-normal text-[#718096]">{assigneesError ? "Coba muat ulang halaman. Jika tetap gagal, periksa koneksi atau akses admin." : assignees.length === 0 && !assigneesLoading ? "Tambahkan role CRM Lead atau Sales ke pengguna pada company ini melalui Pengguna & Akses." : "Inquiry dari kanal ini akan diarahkan ke user aktif berperan CRM Lead atau Sales."}</span></label>
      </div>
      <div className="mt-4"><p className="mb-2 text-xs font-semibold text-[#475569]">Jenis event yang boleh dikirim ke Marka</p><div className="grid gap-2 sm:grid-cols-2">{EVENT_OPTIONS.map((event) => <label key={event.value} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2.5 text-sm text-[#334155]"><input type="checkbox" checked={events.includes(event.value)} onChange={(e) => setEvents((current) => e.target.checked ? [...current, event.value] : current.filter((item) => item !== event.value))}/><span>{event.label}</span></label>)}</div></div>
      <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#2649B3] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" onClick={submit} disabled={saving || !form.source_code.trim() || !form.account_name.trim() || events.length === 0}><Plus size={16}/>{saving ? "Mendaftarkan..." : "Buat koneksi landing page"}</button>
    </section>

    {createdSecret && createdSource && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-center gap-2 text-emerald-900"><ShieldCheck size={18}/><h2 className="font-bold">Koneksi dibuat — simpan secret sekarang</h2></div>
      <p className="mt-2 text-sm leading-6 text-emerald-900">Signing secret hanya ditampilkan sekali. Simpan di secret manager atau environment server backend Arsalynk. Jangan menaruhnya pada JavaScript browser, HTML, atau repository Git.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white p-3"><div className="text-[11px] font-semibold uppercase text-[#64748B]">Webhook Marka</div><div className="mt-1 break-all text-sm">{endpoint}</div><button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2649B3]" onClick={() => void copy(endpoint)}><Copy size={13}/>Salin URL</button></div>
        <div className="rounded-lg bg-white p-3"><div className="text-[11px] font-semibold uppercase text-[#64748B]">Integration ID · Key ID</div><div className="mt-1 break-all text-sm">{createdSource.id}</div><div className="mt-1 text-sm">{createdSource.key_id}</div><button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2649B3]" onClick={() => void copy(`${createdSource.id}\n${createdSource.key_id}`)}><Copy size={13}/>Salin ID dan Key ID</button></div>
        <div className="rounded-lg bg-white p-3 md:col-span-2"><div className="text-[11px] font-semibold uppercase text-[#64748B]">Signing Secret · tampil sekali</div><div className="mt-1 break-all font-mono text-sm">{createdSecret}</div><button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#2649B3]" onClick={() => void copy(createdSecret)}>{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? "Tersalin" : "Salin secret"}</button></div>
      </div>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Langkah lanjutan:</strong> landing page perlu kode server-side untuk membentuk event standar dan menandatangani request HMAC ke URL di atas. Layar ini mendaftarkan koneksi di Marka; ia tidak mengubah kode landing page secara otomatis.</div>
    </section>}

    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-[#172033]">Sumber integrasi terdaftar</h2><p className="mt-1 text-xs text-[#64748B]">Daftar ini menampilkan metadata aman; signing secret tidak dapat dibaca kembali.</p></div><button onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-lg border border-[#D8DEE8] px-3 py-2 text-xs font-semibold text-[#475569]"><RefreshCw size={13}/>Muat ulang</button></div>
      {loading ? <p className="py-6 text-sm text-[#64748B]">Memuat sumber integrasi…</p> : sources.length === 0 ? <p className="rounded-lg bg-[#F8FAFC] p-4 text-sm text-[#64748B]">Belum ada landing page atau aplikasi luar yang didaftarkan.</p> : <div className="space-y-2">{sources.map((source) => <div key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] p-3"><div><div className="font-semibold text-[#172033]">{source.source_code}</div><div className="mt-1 text-xs text-[#64748B]">{source.allowed_event_types.join(" · ")} · Key {source.key_id}</div></div><button onClick={() => void toggle(source)} disabled={source.status === "REVOKED"} className={cn("rounded-lg px-3 py-2 text-xs font-semibold", source.status === "ACTIVE" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>{source.status === "ACTIVE" ? "Jeda" : source.status === "REVOKED" ? "Dicabut" : "Aktifkan"}</button></div>)}</div>}
    </section>
  </div>;
}

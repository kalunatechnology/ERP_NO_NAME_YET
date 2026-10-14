"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, MessageSquareText, Settings } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import api from "@/lib/api/axios";
import {
  createCRMWhatsAppConnection,
  loadCRMWhatsAppConnections,
  testCRMWhatsAppConnection,
  updateCRMWhatsAppConnection,
  type CRMWhatsAppConnection,
} from "@/lib/api/crm.api";

type Form = { waba_id: string; phone_number_id: string; display_phone_number: string; api_version: string; access_token: string; app_secret: string; verify_token: string };
const emptyForm: Form = { waba_id: "", phone_number_id: "", display_phone_number: "", api_version: "v25.0", access_token: "", app_secret: "", verify_token: "" };

export default function WhatsAppSettings() {
  const [connections, setConnections] = useState<CRMWhatsAppConnection[]>([]);
  const [companyScope, setCompanyScope] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<Form>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selected = connections.find((item) => item.id === selectedId) ?? null;
  const callbackUrl = selected && typeof window !== "undefined" ? new URL(selected.callback_path, api.defaults.baseURL || window.location.origin).toString() : "";
  useEffect(() => { setCompanyScope(new URLSearchParams(window.location.search).get("company_id") || ""); }, []);
  const refresh = useCallback(async () => {
    try { setConnections(await loadCRMWhatsAppConnections(companyScope || undefined)); }
    catch (error: any) { toast.error(error?.response?.data?.error?.message || "Gagal memuat koneksi WhatsApp."); }
  }, [companyScope]);
  useEffect(() => { void refresh(); }, [refresh]);

  const selectConnection = (id: string) => {
    setSelectedId(id);
    const row = connections.find((item) => item.id === id);
    setForm(row ? { ...emptyForm, waba_id: row.waba_id, phone_number_id: row.phone_number_id, display_phone_number: row.display_phone_number || "", api_version: row.api_version } : emptyForm);
    setFeedback("");
  };
  const set = (key: keyof Form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim())) as Record<string, string>;
      if (selected) {
        delete body.waba_id;
        delete body.phone_number_id;
        const updated = await updateCRMWhatsAppConnection(selected.id, body, companyScope || undefined);
        setConnections((rows) => rows.map((row) => row.id === updated.id ? updated : row));
        toast.success("Pengaturan koneksi tersimpan.");
      } else {
        const created = await createCRMWhatsAppConnection(body, companyScope || undefined);
        setConnections((rows) => [created, ...rows]);
        setSelectedId(created.id);
        setForm((current) => ({ ...current, access_token: "", app_secret: "", verify_token: "" }));
        toast.success("Koneksi WhatsApp tersimpan di Marka.");
      }
    } catch (error: any) { toast.error(error?.response?.data?.error?.message || error?.response?.data?.message || "Gagal menyimpan koneksi."); }
    finally { setBusy(false); }
  };
  const test = async () => {
    if (!selected) return;
    setBusy(true); setFeedback("");
    try {
      const result = await testCRMWhatsAppConnection(selected.id, companyScope || undefined);
      setFeedback(`Tersambung — ${result.verified_name || result.display_phone_number || result.phone_number_id}`);
      await refresh();
    } catch (error: any) { setFeedback(error?.response?.data?.message || error?.response?.data?.error?.message || "Gagal terhubung. Periksa token, izin WhatsApp, versi API, dan Phone Number ID."); }
    finally { setBusy(false); }
  };
  const toggle = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await updateCRMWhatsAppConnection(selected.id, { status: selected.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }, companyScope || undefined);
      setConnections((rows) => rows.map((row) => row.id === updated.id ? updated : row));
      toast.success(updated.status === "ACTIVE" ? "Koneksi diaktifkan." : "Koneksi dijeda.");
    } catch (error: any) { toast.error(error?.response?.data?.error?.message || "Status koneksi gagal diperbarui."); }
    finally { setBusy(false); }
  };

  const inputClass = "w-full rounded-lg border border-text-tertiary/50 bg-white px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-deep-green";
  const field = (label: string, key: keyof Form, placeholder: string, secret = false) => (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-text-secondary" key={key}>
      {label}<input className={inputClass} type={secret ? "password" : "text"} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={selected && secret ? "Kosongkan jika tidak diganti" : placeholder} autoComplete="off" />
    </label>
  );

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
    <section className="card rounded-xl border border-text-tertiary/40 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-bold text-text-primary">Koneksi WhatsApp Business</h2><p className="mt-1 text-xs text-text-secondary">Kelola kredensial Meta per nomor dan arahkan pesan masuk ke Customer Inbox.</p></div>
        <select className={inputClass + " w-auto min-w-48"} value={selectedId} onChange={(e) => selectConnection(e.target.value)}>
          <option value="">+ Tambah nomor baru</option>{connections.map((item) => <option key={item.id} value={item.id}>{item.display_phone_number || item.phone_number_id} · {item.status}</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("WABA ID", "waba_id", "WhatsApp Business Account ID")}{field("Phone Number ID", "phone_number_id", "ID nomor dari Meta")}
        {field("Nomor tampil (opsional)", "display_phone_number", "+62 812 ...")}{field("Graph API Version", "api_version", "v25.0")}
        {field("Permanent Access Token", "access_token", "Token system user Meta", true)}{field("Meta App Secret", "app_secret", "App Secret Meta Developers", true)}
        <div className="sm:col-span-2">{field("Webhook Verify Token", "verify_token", "Buat token acak rahasia minimal 16 karakter", true)}</div>
      </div>
      {selected && <p className="mt-3 rounded-lg bg-bg-lighter p-3 text-xs text-text-secondary">Rahasia disimpan terenkripsi dan tidak ditampilkan kembali. Isi kolom rahasia hanya untuk mengganti nilainya.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary text-xs" onClick={save} disabled={busy}>{busy ? "Menyimpan..." : selected ? "Simpan pengaturan" : "Simpan koneksi"}</button>
        {selected && <><button className="btn-ghost text-xs" onClick={test} disabled={busy}>Uji koneksi Meta</button><button className="btn-ghost text-xs" onClick={toggle} disabled={busy}>{selected.status === "ACTIVE" ? "Jeda koneksi" : "Aktifkan koneksi"}</button></>}
      </div>
      {feedback && <div className={cn("mt-3 flex items-center gap-2 rounded-lg p-3 text-sm", feedback.startsWith("Tersambung") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>{feedback.startsWith("Tersambung") && <CheckCircle2 size={16} />}{feedback}</div>}
    </section>

    <section className="card rounded-xl border border-text-tertiary/40 bg-white p-5">
      <div className="flex items-center gap-2"><MessageSquareText size={17} className="text-brand-deep-green"/><h2 className="text-base font-bold text-text-primary">Webhook Meta</h2></div>
      {selected ? <>
        <p className="mt-2 text-xs text-text-secondary">Daftarkan callback di Meta Developers, pilih objek WhatsApp Business Account dan aktifkan event messages.</p>
        <div className="mt-4 rounded-lg bg-bg-lighter p-3"><div className="mb-1 text-[11px] font-semibold uppercase text-text-secondary">Callback URL</div><div className="break-all text-xs text-text-primary">{callbackUrl}</div>
          <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-deep-green" onClick={() => navigator.clipboard?.writeText(callbackUrl)}><Copy size={12}/>Salin URL</button>
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-text-secondary">
          <li>Gunakan Verify Token yang disimpan di kiri saat Meta meminta verifikasi callback.</li>
          <li>Callback harus memakai HTTPS dan langganan event <code>messages</code> aktif pada WABA.</li>
          <li>Pesan teks masuk akan diproses antrean Marka dan tampil pada tab Customer Inbox.</li>
        </ol>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Cakupan saat ini:</strong> penerimaan pesan teks masuk. Balasan dari Marka dan media/lampiran belum diaktifkan.</div>
        <p className="mt-4 text-xs text-text-secondary">Status: <strong className={selected.status === "ACTIVE" ? "text-green-700" : "text-amber-700"}>{selected.status}</strong><br/>Webhook terakhir: {selected.last_webhook_at ? new Date(selected.last_webhook_at).toLocaleString("id-ID") : "Belum ada"}</p>
      </> : <p className="mt-3 rounded-lg bg-bg-lighter p-4 text-sm text-text-secondary"><Settings size={14} className="mr-1 inline"/>Simpan koneksi untuk melihat URL webhook khusus bagi nomor ini.</p>}
    </section>
  </div>;
}

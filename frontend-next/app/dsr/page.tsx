"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Send, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";

interface DsrSubmissionReceipt {
  ticket_number: string;
  due_at: string;
  sla_hours: number;
}

const REQUEST_TYPES = [
  { value: "ACCESS", label: "Akses Data Pribadi (Pasal 5 & 6 UU PDP)" },
  { value: "COPY", label: "Salinan / Portabilitas Data (Pasal 13 UU PDP)" },
  { value: "CORRECTION", label: "Koreksi / Pembaruan Data (Pasal 7 UU PDP)" },
  { value: "DELETION", label: "Penghapusan / Pemusnahan Data (Pasal 8 UU PDP)" },
] as const;

export default function PublicDsrPage() {
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requestType, setRequestType] = useState<string>("ACCESS");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<DsrSubmissionReceipt | null>(null);
  const [govStatus, setGovStatus] = useState<{
    legal_entity_name?: string;
    contact_email?: string;
    tdpse_number?: string;
  }>({});

  useEffect(() => {
    let active = true;
    api
      .get("/api/v1/governance/public/status")
      .then((res) => {
        if (!active) return;
        setGovStatus({
          legal_entity_name: res.data?.legal_entity_name,
          contact_email: res.data?.contact_email,
          tdpse_number: res.data?.tdpse_number,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = requesterEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Email pemohon wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/api/v1/governance/public/dsr", {
        requester_email: email,
        request_type: requestType,
        description: description.trim(),
      });
      setReceipt({
        ticket_number: res.data?.ticket_number,
        due_at: res.data?.due_at,
        sla_hours: res.data?.sla_hours || 72,
      });
      toast.success("Permintaan Hak Subjek Data (DSR) berhasil dikirim.");
      setDescription("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim permintaan DSR.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-9 shadow-xs text-slate-800 space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0876CD]/10 text-[#0876CD]">
              <ShieldCheck size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#163D64]">
                UU PDP &bull; Layanan Hak Subjek Data
              </span>
              <h1 className="mt-0.5 text-xl font-black text-[#0F172A]">
                Formulir Pengajuan Hak Subjek Data (DSR)
              </h1>
            </div>
          </div>
          <Link href="/login" className="text-xs font-semibold text-[#0876CD] hover:underline shrink-0">
            Kembali ke Login
          </Link>
        </div>

        <p className="text-xs leading-6 text-slate-600">
          Gunakan formulir ini untuk mengajukan permintaan akses, salinan, koreksi, atau penghapusan data pribadi Anda. Setiap permintaan memiliki target penyelesaian <strong>SLA 3&times;24 jam (72 jam)</strong>.
        </p>

        {receipt ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <CheckCircle2 size={18} className="text-emerald-600" />
              Permintaan DSR Berhasil Dicatat
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-white border border-emerald-200/80 p-3">
                <div className="text-slate-500">Nomor Tiket</div>
                <div className="mt-0.5 font-mono text-base font-bold text-[#163D64]">
                  {receipt.ticket_number}
                </div>
              </div>
              <div className="rounded-xl bg-white border border-emerald-200/80 p-3">
                <div className="text-slate-500">Estimasi SLA (3&times;24 Jam)</div>
                <div className="mt-0.5 font-semibold text-slate-800 flex items-center gap-1.5">
                  <Clock size={14} className="text-[#0876CD]" />
                  Maks. {new Date(receipt.due_at).toLocaleString("id-ID")} ({receipt.sla_hours} jam)
                </div>
              </div>
            </div>
            <p className="text-[11px] text-emerald-900">
              Simpan nomor tiket Anda. Tim DPO ({govStatus.contact_email || "privacy@arsalynk.com"}) akan menindaklanjuti permintaan Anda sesuai tenggat SLA 3&times;24 jam.
            </p>
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 cursor-pointer"
            >
              Ajukan Permintaan Lain
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#163D64] mb-1.5">
                Email Pemohon
              </label>
              <input
                type="email"
                required
                value={requesterEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
                placeholder="nama@perusahaan.com"
                className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-[#0876CD]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#163D64] mb-1.5">
                Jenis Permintaan Hak Subjek Data
              </label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-[#0876CD]"
              >
                {REQUEST_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#163D64] mb-1.5">
                Rincian Permintaan
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan data pribadi yang ingin diakses, disalin, diperbarui, atau dihapus..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-[#0876CD]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-[#0876CD] hover:bg-[#163D64] text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <Send size={15} />
              {submitting ? "Mengirim Permintaan..." : "Kirim Permintaan DSR"}
            </button>
          </form>
        )}

        <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-slate-500">
          <div>
            {govStatus.legal_entity_name || "PT Arsalynk Teknologi Indonesia"} &bull; TDPSE:{" "}
            <span className="font-mono font-semibold text-slate-700">
              {govStatus.tdpse_number?.trim() || "Dalam Proses Registrasi Komdigi"}
            </span>
          </div>
          <div className="flex gap-3">
            <Link href="/privacy-policy" className="text-[#0876CD] hover:underline">Kebijakan Privasi</Link>
            <Link href="/terms" className="text-[#0876CD] hover:underline">Syarat &amp; Ketentuan</Link>
          </div>
        </div>
      </div>
    </main>
  );
}

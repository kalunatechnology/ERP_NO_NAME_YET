"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Send,
  ToggleLeft,
  ToggleRight,
  Fingerprint,
  Trash2,
  Plus,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api/axios";
import {
  deletePasskey,
  listPasskeys,
  registerSuperAdminPasskey,
  type PasskeyItem,
} from "@/lib/api/enterprise-auth.api";
import { cn } from "@/lib/utils";

interface ConsentItem {
  id: string;
  consent_type: string;
  document_version: string;
  document_hash: string;
  granted: boolean;
  created_at: string;
}

interface MyDsrItem {
  id: string;
  ticket_number: string;
  request_type: string;
  description: string;
  status: string;
  due_at: string;
  resolution_note: string;
  hours_remaining: number;
  sla_breached: boolean;
  created_at: string;
}

const DSR_TYPES = [
  { value: "ACCESS", label: "Akses Data Pribadi" },
  { value: "COPY", label: "Salinan / Portabilitas Data" },
  { value: "CORRECTION", label: "Koreksi / Pembaruan Data" },
  { value: "DELETION", label: "Penghapusan Data" },
] as const;

export default function AccountPrivacyPortalPage() {
  const { user, userRole } = useAuth();
  const isSuperAdmin = userRole === "super_admin";
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [marketingGranted, setMarketingGranted] = useState(false);
  const [consents, setConsents] = useState<ConsentItem[]>([]);
  const [dsrList, setDsrList] = useState<MyDsrItem[]>([]);
  const [updatingConsent, setUpdatingConsent] = useState(false);

  const [requestType, setRequestType] = useState<string>("ACCESS");
  const [description, setDescription] = useState("");
  const [submittingDsr, setSubmittingDsr] = useState(false);

  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [passkeyLabel, setPasskeyLabel] = useState("Laptop / Security Key");
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  const loadPrivacyState = useCallback(async () => {
    setLoading(true);
    try {
      const [consentsRes, dsrRes, passkeyRes] = await Promise.all([
        api.get("/api/v1/governance/my/consents"),
        api.get("/api/v1/governance/my/dsr"),
        isSuperAdmin ? listPasskeys().catch(() => []) : Promise.resolve([]),
      ]);
      setMarketingGranted(Boolean(consentsRes.data?.marketing_granted));
      setConsents(Array.isArray(consentsRes.data?.results) ? consentsRes.data.results : []);
      setDsrList(Array.isArray(dsrRes.data?.results) ? dsrRes.data.results : []);
      setPasskeys(passkeyRes);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat data privasi akun.");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void loadPrivacyState();
  }, [loadPrivacyState]);

  const handleDownloadExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/api/v1/governance/my/data-export");
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `markasuite-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Salinan data pribadi Anda berhasil diunduh.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunduh salinan data.");
    } finally {
      setExporting(false);
    }
  };

  const handleToggleMarketingConsent = async () => {
    if (!user?.email) return;
    setUpdatingConsent(true);
    try {
      if (marketingGranted) {
        await api.post("/api/v1/governance/my/consents/withdraw", { consent_type: "MARKETING" });
        toast.success("Persetujuan komunikasi opsional berhasil dicabut.");
      } else {
        await api.post("/api/v1/governance/public/consent", {
          email: user.email,
          consents: [
            {
              user_id: String(user.id),
              consent_type: "MARKETING",
              document_version: "1.0",
              document_hash: "",
              granted: true,
            },
          ],
        });
        toast.success("Persetujuan komunikasi opsional diaktifkan.");
      }
      await loadPrivacyState();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal memperbarui persetujuan.");
    } finally {
      setUpdatingConsent(false);
    }
  };

  const handleSubmitDsr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    setSubmittingDsr(true);
    try {
      const res = await api.post("/api/v1/governance/public/dsr", {
        requester_email: user.email,
        request_type: requestType,
        description: description.trim(),
      });
      toast.success(`Tiket DSR ${res.data?.ticket_number || ""} berhasil dibuat (SLA 3×24 jam).`);
      setDescription("");
      await loadPrivacyState();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pengajuan DSR.");
    } finally {
      setSubmittingDsr(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0876CD]/10 text-[#0876CD]">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#163D64]">Privasi Akun &amp; Hak Subjek Data (DSR)</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola persetujuan opsional, unduh salinan data pribadi Anda (UU PDP Pasal 13), dan pantau permintaan DSR (SLA 3&times;24 jam).
            </p>
          </div>
        </div>
        <div className="flex gap-3 text-xs">
          <Link href="/privacy-policy" target="_blank" className="text-[#0876CD] font-semibold hover:underline">
            Kebijakan Privasi
          </Link>
          <Link href="/retention-policy" target="_blank" className="text-[#0876CD] font-semibold hover:underline">
            Masa Retensi
          </Link>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#163D64]">1. Unduh Salinan Data Pribadi</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Unduh salinan profil akun, riwayat persetujuan UU PDP, dan tiket DSR Anda dalam format JSON terstruktur.
          </p>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleDownloadExport()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0876CD] hover:bg-[#163D64] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60 cursor-pointer"
          >
            <Download size={15} />
            {exporting ? "Menyiapkan Ekspor..." : "Unduh Salinan Data (JSON)"}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#163D64]">2. Persetujuan Komunikasi Opsional</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Anda dapat mencabut atau mengaktifkan kembali persetujuan pembaruan produk &amp; informasi layanan kapan saja tanpa memengaruhi akses kerja utama.
          </p>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <span className="text-xs font-semibold text-slate-700">
              Status Marketing:{" "}
              <span className={marketingGranted ? "text-emerald-700" : "text-slate-500"}>
                {marketingGranted ? "Diaktifkan" : "Dicabut / Nonaktif"}
              </span>
            </span>
            <button
              type="button"
              disabled={updatingConsent || loading}
              onClick={() => void handleToggleMarketingConsent()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
            >
              {marketingGranted ? <ToggleRight size={16} className="text-emerald-600" /> : <ToggleLeft size={16} />}
              {marketingGranted ? "Cabut Persetujuan" : "Aktifkan"}
            </button>
          </div>
        </div>
      </div>

      {/* Submit DSR Form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-[#163D64]">3. Ajukan Permintaan Hak Subjek Data (DSR)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pengajuan terikat akun <span className="font-semibold text-slate-700">{user?.email}</span> dengan batas penyelesaian 3&times;24 jam.
          </p>
        </div>
        <form onSubmit={handleSubmitDsr} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800"
            >
              {DSR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-6">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Rincian permintaan (opsional)..."
              className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submittingDsr}
              className="w-full h-10 rounded-xl bg-[#0876CD] hover:bg-[#163D64] text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              <Send size={13} />
              {submittingDsr ? "Mengirim..." : "Ajukan"}
            </button>
          </div>
        </form>
      </div>

      {/* DSR & Consent History */}
      {isSuperAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0876CD]/10 text-[#0876CD]">
                <Fingerprint size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#163D64]">Passkey WebAuthn / FIDO2 (Super Admin)</h2>
                <p className="text-xs text-slate-500">
                  Daftarkan kunci perangkat keras atau biometrik perangkat (Touch ID / Windows Hello / YubiKey) untuk autentikasi tanpa kata sandi.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={passkeyLabel}
              onChange={(e) => setPasskeyLabel(e.target.value)}
              placeholder="Label perangkat (mis. MacBook Touch ID)"
              className="h-10 flex-1 min-w-[220px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800"
            />
            <button
              type="button"
              disabled={registeringPasskey}
              onClick={async () => {
                setRegisteringPasskey(true);
                try {
                  await registerSuperAdminPasskey(passkeyLabel.trim() || "Super Admin Passkey");
                  toast.success("Passkey WebAuthn berhasil didaftarkan.");
                  await loadPrivacyState();
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Gagal mendaftarkan passkey.");
                } finally {
                  setRegisteringPasskey(false);
                }
              }}
              className="h-10 px-4 rounded-xl bg-[#0876CD] hover:bg-[#163D64] text-xs font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              <Plus size={14} />
              {registeringPasskey ? "Mendaftarkan..." : "Daftarkan Passkey Baru"}
            </button>
          </div>
          {passkeys.length > 0 && (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {passkeys.map((pk) => (
                <div key={pk.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{pk.device_label}</div>
                    <div className="text-[11px] text-slate-500">
                      Terdaftar: {new Date(pk.created_at).toLocaleString("id-ID")}
                      {pk.last_used_at ? ` • Terakhir dipakai: ${new Date(pk.last_used_at).toLocaleString("id-ID")}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deletePasskey(pk.id);
                        toast.success("Passkey dihapus.");
                        await loadPrivacyState();
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : "Gagal menghapus passkey.");
                      }
                    }}
                    className="p-2 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                    title="Hapus passkey"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-bold text-xs text-[#163D64]">
            Riwayat Tiket DSR Saya ({dsrList.length})
          </div>
          {dsrList.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">Belum ada tiket DSR.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dsrList.map((item) => (
                <div key={item.id} className="p-4 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-900">{item.ticket_number}</span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-[#0876CD]">
                      {item.status}
                    </span>
                  </div>
                  <div className="text-slate-600">{item.request_type} {item.description ? `— ${item.description}` : ""}</div>
                  {item.resolution_note && (
                    <div className="text-[11px] text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 size={12} /> {item.resolution_note}
                    </div>
                  )}
                  <div className={cn("text-[10px] flex items-center gap-1", item.sla_breached ? "text-red-600" : "text-slate-400")}>
                    <Clock size={11} />
                    {item.status === "COMPLETED" ? "Selesai" : item.sla_breached ? "SLA Terlewati" : `${item.hours_remaining} jam tersisa`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-bold text-xs text-[#163D64]">
            Riwayat Persetujuan Saya ({consents.length})
          </div>
          {consents.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">Belum ada catatan persetujuan.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {consents.map((c) => (
                <div key={c.id} className="p-3.5 text-xs flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-semibold text-slate-900">{c.consent_type} (v{c.document_version})</div>
                    <div className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleString("id-ID")}</div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                      c.granted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {c.granted ? "GRANTED" : "WITHDRAWN"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Database,
  RefreshCw,
  Save,
  Lock,
  Building2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api/axios";
import { cn } from "@/lib/utils";
import { RETENTION_POLICY_META, RETENTION_SCHEDULE } from "@/lib/governance/retention-policy";
import { getCompanySsoConfig, updateCompanySsoConfig } from "@/lib/api/enterprise-auth.api";

interface LaunchGateCheck {
  key: string;
  label: string;
  passed: boolean;
  blocker: boolean;
  detail: string;
}

interface WebsiteState {
  id: string;
  status: string;
  legal_entity_name: string;
  contact_email: string;
  tdpse_number: string;
  canonical_domain?: string;
  updated_at?: string;
}

interface ReadinessResponse {
  can_publish: boolean;
  blockers: LaunchGateCheck[];
  checks: LaunchGateCheck[];
  website_state: WebsiteState;
}

interface DsrItem {
  id: string;
  ticket_number: string;
  requester_email: string;
  request_type: string;
  description: string;
  status: string;
  due_at: string;
  resolution_note: string;
  resolved_at?: string | null;
  created_at: string;
  hours_remaining: number;
  sla_breached: boolean;
}

interface RopaRecord {
  id: string;
  activity_name: string;
  controller: string;
  dpo_contact: string;
  purpose: string;
  legal_basis: string;
  data_subject_categories: string;
  personal_data_categories: string;
  recipients: string;
  cross_border_transfer: string;
  retention_period: string;
  deletion_method: string;
  security_measures: string;
  owner_role: string;
}

interface ConsentRecord {
  id: string;
  user_id?: string | null;
  email: string;
  consent_type: string;
  document_version: string;
  document_hash: string;
  granted: boolean;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

const WEBSITE_STATUSES = [
  { value: "development", label: "Development" },
  { value: "testing", label: "Testing" },
  { value: "staging", label: "Staging" },
  { value: "ready_to_launch", label: "Ready to Launch" },
  { value: "published", label: "Published (Live)" },
  { value: "maintenance", label: "Maintenance" },
  { value: "suspended", label: "Suspended" },
] as const;

const DSR_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "REJECTED"] as const;

export default function GovernanceControlCenterPage() {
  const { isAdmin, userRole, company, isLoading: authLoading } = useAuth();
  const isAuthorized = userRole === "super_admin" || isAdmin;
  const isSuperAdmin = userRole === "super_admin";

  const [activeTab, setActiveTab] = useState<"readiness" | "dsr" | "ropa" | "retention" | "sso" | "consents">("readiness");
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState(false);

  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [formState, setFormState] = useState({
    status: "staging",
    legal_entity_name: "",
    contact_email: "",
    tdpse_number: "",
  });

  const [dsrList, setDsrList] = useState<DsrItem[]>([]);
  const [dsrDrafts, setDsrDrafts] = useState<Record<string, { status: string; resolution_note: string }>>({});
  const [savingDsrId, setSavingDsrId] = useState<string | null>(null);

  const [ropaRecords, setRopaRecords] = useState<RopaRecord[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [savingSso, setSavingSso] = useState(false);
  const [ssoForm, setSsoForm] = useState({
    company_id: "",
    provider_type: "OIDC",
    display_name: "",
    enabled: false,
    enforce_sso: false,
    oidc_issuer: "",
    oidc_client_id: "",
    oidc_client_secret: "",
    oidc_authorization_endpoint: "",
    oidc_token_endpoint: "",
    oidc_userinfo_endpoint: "",
    saml_entity_id: "",
    saml_sso_url: "",
    saml_x509_cert_pem: "",
    allowed_domains: "",
  });

  const loadGovernanceData = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    try {
      const [readinessRes, dsrRes, ropaRes, consentsRes] = await Promise.all([
        api.get("/api/v1/governance/readiness"),
        api.get("/api/v1/governance/dsr"),
        api.get("/api/v1/governance/ropa"),
        api.get("/api/v1/governance/consents"),
      ]);

      const rData: ReadinessResponse = readinessRes.data;
      setReadiness(rData);
      if (rData?.website_state) {
        setFormState({
          status: rData.website_state.status || "staging",
          legal_entity_name: rData.website_state.legal_entity_name || "",
          contact_email: rData.website_state.contact_email || "",
          tdpse_number: rData.website_state.tdpse_number || "",
        });
      }

      const dsrRows: DsrItem[] = Array.isArray(dsrRes.data?.results) ? dsrRes.data.results : [];
      setDsrList(dsrRows);
      const nextDrafts: Record<string, { status: string; resolution_note: string }> = {};
      for (const row of dsrRows) {
        nextDrafts[row.id] = {
          status: row.status || "OPEN",
          resolution_note: row.resolution_note || "",
        };
      }
      setDsrDrafts(nextDrafts);

      setRopaRecords(Array.isArray(ropaRes.data?.records) ? ropaRes.data.records : []);
      setConsents(Array.isArray(consentsRes.data?.results) ? consentsRes.data.results : []);

      if (company) {
        const ssoRes = await getCompanySsoConfig(company).catch(() => null);
        if (ssoRes?.config) {
          setSsoForm({
            company_id: ssoRes.config.company_id || company,
            provider_type: ssoRes.config.provider_type || "OIDC",
            display_name: ssoRes.config.display_name || "",
            enabled: Boolean(ssoRes.config.enabled),
            enforce_sso: Boolean(ssoRes.config.enforce_sso),
            oidc_issuer: ssoRes.config.oidc_issuer || "",
            oidc_client_id: ssoRes.config.oidc_client_id || "",
            oidc_client_secret: ssoRes.config.oidc_client_secret_masked || "",
            oidc_authorization_endpoint: ssoRes.config.oidc_authorization_endpoint || "",
            oidc_token_endpoint: ssoRes.config.oidc_token_endpoint || "",
            oidc_userinfo_endpoint: ssoRes.config.oidc_userinfo_endpoint || "",
            saml_entity_id: ssoRes.config.saml_entity_id || "",
            saml_sso_url: ssoRes.config.saml_sso_url || "",
            saml_x509_cert_pem: ssoRes.config.saml_x509_cert_pem || "",
            allowed_domains: Array.isArray(ssoRes.config.allowed_domains)
              ? ssoRes.config.allowed_domains.join(", ")
              : "",
          });
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat data Governance Control Center.");
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, company]);

  useEffect(() => {
    if (!authLoading && isAuthorized) {
      void loadGovernanceData();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, isAuthorized, loadGovernanceData]);

  const handleWebsiteStateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingState(true);
    try {
      const res = await api.put("/api/v1/governance/website-state", formState);
      setReadiness(res.data);
      toast.success("Status website & profil badan hukum berhasil diperbarui.");
    } catch (err: any) {
      const blockers = err?.response?.data?.blockers;
      if (Array.isArray(blockers) && blockers.length > 0) {
        toast.error(`Gagal publikasi: ${blockers.map((b: LaunchGateCheck) => b.label).join(", ")}`);
      } else {
        toast.error(err instanceof Error ? err.message : "Gagal memperbarui website state.");
      }
      await loadGovernanceData();
    } finally {
      setSavingState(false);
    }
  };

  const handleDsrUpdate = async (id: string) => {
    const draft = dsrDrafts[id];
    if (!draft) return;
    setSavingDsrId(id);
    try {
      await api.patch(`/api/v1/governance/dsr/${id}`, {
        status: draft.status,
        resolution_note: draft.resolution_note,
      });
      toast.success("Tiket DSR berhasil diperbarui.");
      await loadGovernanceData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal memperbarui tiket DSR.");
    } finally {
      setSavingDsrId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Memuat Governance &amp; Readiness Control Center...
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center space-y-2">
          <Lock className="mx-auto text-red-500" size={28} />
          <h1 className="text-lg font-bold text-red-900">Akses Terbatas</h1>
          <p className="text-sm text-red-700">
            Halaman Governance &amp; Readiness Control Center hanya tersedia untuk Company Admin atau Super Admin.
          </p>
        </div>
      </div>
    );
  }

  const blockers = readiness?.blockers ?? [];
  const checks = readiness?.checks ?? [];
  const breachedCount = dsrList.filter((d) => d.sla_breached).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0876CD]/10 text-[#0876CD]">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#163D64]">Governance &amp; Readiness Control Center</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kepatuhan UU PDP, Kesiapan Publikasi (TDPSE &amp; Legal Gate), Antrean DSR 3x24 Jam, ROPA, dan Consent Ledger.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadGovernanceData()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw size={14} />
          Muat Ulang
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Status Website</div>
          <div className="mt-1 text-lg font-bold text-[#163D64] uppercase">
            {readiness?.website_state?.status || "staging"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {readiness?.can_publish ? "Siap dipublikasikan" : `${blockers.length} blocker aktif`}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Antrean DSR (3x24 Jam)</div>
          <div className="mt-1 text-lg font-bold text-[#163D64]">{dsrList.length} Tiket</div>
          <div className={cn("mt-1 text-[11px] font-medium", breachedCount > 0 ? "text-red-600" : "text-emerald-600")}>
            {breachedCount > 0 ? `${breachedCount} tiket melewati SLA` : "Seluruh SLA aman"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">ROPA Tercatat</div>
          <div className="mt-1 text-lg font-bold text-[#163D64]">{ropaRecords.length} Aktivitas</div>
          <div className="mt-1 text-[11px] text-slate-500">Record of Processing Activities</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Consent Ledger</div>
          <div className="mt-1 text-lg font-bold text-[#163D64]">{consents.length} Catatan</div>
          <div className="mt-1 text-[11px] text-slate-500">100 entri persetujuan terbaru</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {[
          { id: "readiness", label: "Launch Readiness & Website State", icon: ShieldCheck },
          { id: "dsr", label: `Antrean DSR (${dsrList.length})`, icon: Clock },
          { id: "ropa", label: `ROPA (${ropaRecords.length})`, icon: FileText },
          { id: "retention", label: `Kebijakan Retensi (${RETENTION_SCHEDULE.length})`, icon: Lock },
          { id: "sso", label: "SSO Enterprise (SAML/OIDC)", icon: Building2 },
          { id: "consents", label: `Consent Ledger (${consents.length})`, icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer",
                active
                  ? "bg-[#0876CD] text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Launch Readiness & Website State */}
      {activeTab === "readiness" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Launch Gate Checklist */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#163D64]">Launch Gate Checklist</h2>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-bold",
                  readiness?.can_publish
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-800",
                )}
              >
                {readiness?.can_publish ? "Siap Publish" : "Belum Siap Publish"}
              </span>
            </div>

            {blockers.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <div className="font-bold">Blocker Publikasi Aktif ({blockers.length})</div>
                  <p className="mt-0.5 text-amber-800">
                    Status tidak dapat diubah ke <span className="font-semibold">published</span> sebelum seluruh item blocker wajib di bawah ini terpenuhi.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {checks.map((item) => (
                <div
                  key={item.key}
                  className={cn(
                    "rounded-xl border p-3.5 flex items-start gap-3",
                    item.passed
                      ? "border-emerald-200/80 bg-emerald-50/40"
                      : item.blocker
                        ? "border-red-200 bg-red-50/40"
                        : "border-slate-200 bg-slate-50/50",
                  )}
                >
                  {item.passed ? (
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-600 mt-0.5" />
                  ) : (
                    <XCircle size={18} className={cn("shrink-0 mt-0.5", item.blocker ? "text-red-500" : "text-amber-500")} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{item.label}</span>
                      {item.blocker && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          BLOCKER WAJIB
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Website State Form */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#163D64]">Pengaturan Website State &amp; TDPSE</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isSuperAdmin
                  ? "Perbarui identitas badan hukum, kontak DPO, nomor TDPSE, dan status publikasi portal."
                  : "Hanya Super Admin yang dapat menyimpan perubahan ke endpoint website-state."}
              </p>
            </div>

            <form onSubmit={handleWebsiteStateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status Website</label>
                <select
                  value={formState.status}
                  onChange={(e) => setFormState((prev) => ({ ...prev, status: e.target.value }))}
                  disabled={!isSuperAdmin || savingState}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 focus:outline-none focus:border-[#0876CD]"
                >
                  {WEBSITE_STATUSES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {formState.status === "published" && !readiness?.can_publish && (
                  <p className="mt-1.5 text-[11px] text-red-600 font-medium">
                    Peringatan: Masih terdapat {blockers.length} blocker wajib. Server akan menolak status published hingga blocker diselesaikan.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nama Badan Hukum</label>
                <input
                  type="text"
                  value={formState.legal_entity_name}
                  onChange={(e) => setFormState((prev) => ({ ...prev, legal_entity_name: e.target.value }))}
                  disabled={!isSuperAdmin || savingState}
                  placeholder="PT Arsalynk Teknologi Indonesia"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 focus:outline-none focus:border-[#0876CD]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Kontak Resmi / DPO</label>
                <input
                  type="email"
                  value={formState.contact_email}
                  onChange={(e) => setFormState((prev) => ({ ...prev, contact_email: e.target.value }))}
                  disabled={!isSuperAdmin || savingState}
                  placeholder="privacy@arsalynk.com"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 focus:outline-none focus:border-[#0876CD]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nomor TDPSE (Komdigi)</label>
                <input
                  type="text"
                  value={formState.tdpse_number}
                  onChange={(e) => setFormState((prev) => ({ ...prev, tdpse_number: e.target.value }))}
                  disabled={!isSuperAdmin || savingState}
                  placeholder="Contoh: 001234.01/DJAI.PSE/11/2026"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 focus:outline-none focus:border-[#0876CD]"
                />
              </div>

              <button
                type="submit"
                disabled={!isSuperAdmin || savingState}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0876CD] hover:bg-[#163D64] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                <Save size={14} />
                {savingState ? "Menyimpan..." : "Simpan Website State"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab 2: Antrean DSR 3x24 Jam */}
      {activeTab === "dsr" && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-bold text-[#163D64]">Antrean Permintaan Hak Subjek Data (DSR 3x24 Jam)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau sisa waktu SLA 72 jam dan perbarui status penyelesaian beserta catatan resolusi.
            </p>
          </div>

          {dsrList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Belum ada permintaan DSR yang masuk.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Tiket &amp; Pemohon</th>
                    <th className="px-4 py-3 font-bold">Jenis &amp; Deskripsi</th>
                    <th className="px-4 py-3 font-bold">SLA 3x24 Jam</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Catatan Resolusi</th>
                    <th className="px-4 py-3 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dsrList.map((row) => {
                    const draft = dsrDrafts[row.id] ?? { status: row.status, resolution_note: row.resolution_note || "" };
                    return (
                      <tr key={row.id} className={cn("align-top", row.sla_breached && "bg-red-50/40")}>
                        <td className="px-4 py-3.5">
                          <div className="font-mono font-bold text-slate-900">{row.ticket_number}</div>
                          <div className="text-slate-600 mt-0.5">{row.requester_email}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(row.created_at).toLocaleString("id-ID")}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 max-w-xs">
                          <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0876CD]">
                            {row.request_type}
                          </span>
                          <p className="mt-1 text-slate-600 break-words">{row.description || "-"}</p>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                              row.sla_breached
                                ? "bg-red-100 text-red-700"
                                : row.hours_remaining <= 12
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-700",
                            )}
                          >
                            <Clock size={12} />
                            {row.sla_breached
                              ? `SLA Terlewati (${row.hours_remaining}j)`
                              : `${row.hours_remaining} jam tersisa`}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              setDsrDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...draft, status: e.target.value },
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                          >
                            {DSR_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3.5">
                          <input
                            type="text"
                            value={draft.resolution_note}
                            onChange={(e) =>
                              setDsrDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...draft, resolution_note: e.target.value },
                              }))
                            }
                            placeholder="Catatan tindak lanjut..."
                            className="h-9 w-56 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
                          />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            disabled={savingDsrId === row.id}
                            onClick={() => void handleDsrUpdate(row.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0876CD] hover:bg-[#163D64] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50 cursor-pointer"
                          >
                            <Save size={12} />
                            {savingDsrId === row.id ? "Menyimpan..." : "Simpan"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: ROPA */}
      {activeTab === "ropa" && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-bold text-[#163D64]">Record of Processing Activities (ROPA)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar aktivitas pemrosesan data pribadi, dasar hukum UU PDP, retensi, dan kontrol keamanan (read-only).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">ID &amp; Aktivitas</th>
                  <th className="px-4 py-3 font-bold">Pengendali &amp; DPO</th>
                  <th className="px-4 py-3 font-bold">Tujuan &amp; Dasar Hukum</th>
                  <th className="px-4 py-3 font-bold">Subjek &amp; Kategori Data</th>
                  <th className="px-4 py-3 font-bold">Retensi &amp; Keamanan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ropaRecords.map((rec) => (
                  <tr key={rec.id} className="align-top">
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-bold text-[#0876CD]">{rec.id}</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{rec.activity_name}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Owner: {rec.owner_role}</div>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <div className="text-slate-800 font-medium">{rec.controller}</div>
                      <div className="text-[11px] text-slate-500 mt-1">DPO: {rec.dpo_contact}</div>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <div className="text-slate-800">{rec.purpose}</div>
                      <div className="text-[11px] text-[#163D64] font-medium mt-1">{rec.legal_basis}</div>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <div className="text-slate-800 font-medium">{rec.data_subject_categories}</div>
                      <div className="text-[11px] text-slate-600 mt-1">{rec.personal_data_categories}</div>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <div className="text-slate-800">{rec.retention_period}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{rec.security_measures}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Kebijakan Masa Retensi */}
      {activeTab === "retention" && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#163D64]">
                {RETENTION_POLICY_META.title} ({RETENTION_POLICY_META.documentId})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dasar Hukum: {RETENTION_POLICY_META.legalReferences}
              </p>
            </div>
            <a
              href="/retention-policy"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-[#0876CD] hover:bg-slate-100"
            >
              Buka Halaman Publik /retention-policy
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Kategori &amp; ROPA</th>
                  <th className="px-4 py-3 font-bold">Subjek Data</th>
                  <th className="px-4 py-3 font-bold">Periode Retensi</th>
                  <th className="px-4 py-3 font-bold">Metode Pemusnahan</th>
                  <th className="px-4 py-3 font-bold">Penanggung Jawab &amp; Dasar Hukum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {RETENTION_SCHEDULE.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-bold text-[#0876CD]">{row.ropaRef}</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{row.category}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{row.subjectCategories}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-800">{row.retentionPeriod}</td>
                    <td className="px-4 py-3.5 text-slate-600">{row.deletionMethod}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-800">{row.ownerRole}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{row.legalBasis}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-200 bg-amber-50/50 text-xs text-amber-900">
            <strong>Legal Hold:</strong> {RETENTION_POLICY_META.legalHoldNote}
          </div>
        </div>
      )}

      {/* Tab 5: SSO Enterprise (SAML 2.0 / OIDC) */}
      {activeTab === "sso" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#163D64]">Integrasi Single Sign-On (SAML 2.0 / OIDC) per Perusahaan</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Terhubung ke organisasi aktif ({company || "Pilih company terlebih dahulu"}). Client secret dienkripsi dengan AES-256-GCM.
            </p>
          </div>
          {!company ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              Pilih company aktif pada Topbar terlebih dahulu untuk mengonfigurasi SSO perusahaan.
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingSso(true);
                try {
                  await updateCompanySsoConfig({
                    ...ssoForm,
                    company_id: company,
                    allowed_domains: ssoForm.allowed_domains
                      .split(",")
                      .map((d) => d.trim().toLowerCase())
                      .filter(Boolean),
                  });
                  toast.success("Konfigurasi SSO perusahaan berhasil disimpan.");
                  await loadGovernanceData();
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "Gagal menyimpan konfigurasi SSO.");
                } finally {
                  setSavingSso(false);
                }
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Protokol SSO</label>
                <select
                  value={ssoForm.provider_type}
                  onChange={(e) => setSsoForm((p) => ({ ...p, provider_type: e.target.value }))}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                >
                  <option value="OIDC">OpenID Connect (OIDC)</option>
                  <option value="SAML2">SAML 2.0</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Tampilan Provider</label>
                <input
                  type="text"
                  value={ssoForm.display_name}
                  onChange={(e) => setSsoForm((p) => ({ ...p, display_name: e.target.value }))}
                  placeholder="Contoh: Okta / Azure AD / Google Workspace"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Domain Email Diizinkan (pisahkan koma)</label>
                <input
                  type="text"
                  value={ssoForm.allowed_domains}
                  onChange={(e) => setSsoForm((p) => ({ ...p, allowed_domains: e.target.value }))}
                  placeholder="arsalynk.com, perusahaan.co.id"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                />
              </div>
              {ssoForm.provider_type === "OIDC" ? (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">OIDC Issuer</label>
                    <input
                      type="text"
                      value={ssoForm.oidc_issuer}
                      onChange={(e) => setSsoForm((p) => ({ ...p, oidc_issuer: e.target.value }))}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">OIDC Client ID</label>
                    <input
                      type="text"
                      value={ssoForm.oidc_client_id}
                      onChange={(e) => setSsoForm((p) => ({ ...p, oidc_client_id: e.target.value }))}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">OIDC Client Secret</label>
                    <input
                      type="password"
                      value={ssoForm.oidc_client_secret}
                      onChange={(e) => setSsoForm((p) => ({ ...p, oidc_client_secret: e.target.value }))}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Authorization Endpoint</label>
                    <input
                      type="text"
                      value={ssoForm.oidc_authorization_endpoint}
                      onChange={(e) => setSsoForm((p) => ({ ...p, oidc_authorization_endpoint: e.target.value }))}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Token Endpoint</label>
                    <input
                      type="text"
                      value={ssoForm.oidc_token_endpoint}
                      onChange={(e) => setSsoForm((p) => ({ ...p, oidc_token_endpoint: e.target.value }))}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">UserInfo Endpoint</label>
                    <input
                      type="text"
                      value={ssoForm.oidc_userinfo_endpoint}
                      onChange={(e) => setSsoForm((p) => ({ ...p, oidc_userinfo_endpoint: e.target.value }))}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">SAML Entity ID (IdP Issuer)</label>
                    <input
                      type="text"
                      value={ssoForm.saml_entity_id}
                      onChange={(e) => setSsoForm((p) => ({ ...p, saml_entity_id: e.target.value }))}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">SAML SSO URL</label>
                    <input
                      type="text"
                      value={ssoForm.saml_sso_url}
                      onChange={(e) => setSsoForm((p) => ({ ...p, saml_sso_url: e.target.value }))}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">SAML X.509 Certificate (PEM)</label>
                    <textarea
                      rows={3}
                      value={ssoForm.saml_x509_cert_pem}
                      onChange={(e) => setSsoForm((p) => ({ ...p, saml_x509_cert_pem: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px]"
                    />
                  </div>
                </>
              )}
              <div className="md:col-span-2 flex flex-wrap items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ssoForm.enabled}
                    onChange={(e) => setSsoForm((p) => ({ ...p, enabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-[#0876CD]"
                  />
                  <span className="font-semibold text-slate-700">Aktifkan SSO Perusahaan</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ssoForm.enforce_sso}
                    onChange={(e) => setSsoForm((p) => ({ ...p, enforce_sso: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-[#0876CD]"
                  />
                  <span className="font-semibold text-slate-700">Wajibkan Login via SSO</span>
                </label>
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={savingSso}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0876CD] hover:bg-[#163D64] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
                >
                  <Save size={14} />
                  {savingSso ? "Menyimpan..." : "Simpan Konfigurasi SSO"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tab 6: Consent Ledger */}
      {activeTab === "consents" && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-bold text-[#163D64]">Consent Ledger (Audit Persetujuan UU PDP)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Catatan persetujuan pengguna beserta versi dokumen, hash SHA-256, dan metadata permintaan (read-only).
            </p>
          </div>
          {consents.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Belum ada catatan persetujuan di ledger.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Waktu</th>
                    <th className="px-4 py-3 font-bold">Email &amp; User ID</th>
                    <th className="px-4 py-3 font-bold">Tipe Persetujuan</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Versi &amp; Hash Dokumen</th>
                    <th className="px-4 py-3 font-bold">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consents.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {new Date(item.created_at).toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{item.email}</div>
                        <div className="font-mono text-[10px] text-slate-400">{item.user_id || "-"}</div>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-[#163D64]">
                        {item.consent_type}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                            item.granted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {item.granted ? "GRANTED" : "DECLINED"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700">v{item.document_version}</div>
                        <div className="font-mono text-[10px] text-slate-400 truncate max-w-[160px]" title={item.document_hash}>
                          {item.document_hash || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {item.ip_address || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * File: frontend-next/components/administration/MarbotConfigModal.tsx
 *
 * Purpose: Super Admin Modal to view, test, configure, and manage MarBot chatbot integration per-tenant.
 * Allows switching from static .env to database-managed credentials directly from the UI.
 */
"use client";

import { useState, useEffect, FormEvent } from "react";
import {
  Bot,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Key,
  Globe,
  Shield,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { Modal } from "@/components/ui/Modal";
import type { TenantItem } from "./TenantManagement";

interface MarbotConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: TenantItem | null;
  onConfigSaved?: () => void;
}

export function MarbotConfigModal({
  isOpen,
  onClose,
  tenant,
  onConfigSaved,
}: MarbotConfigModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  // Status info from backend
  const [configured, setConfigured] = useState(false);
  const [source, setSource] = useState<"DATABASE" | "ENV" | "NONE">("NONE");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [mode, setMode] = useState<"MANAGED" | "LEGACY" | "UNCONFIGURED">("UNCONFIGURED");
  const [syncStatus, setSyncStatus] = useState("NOT_PROVISIONED");
  const [contractVersion, setContractVersion] = useState<number | null>(null);
  const [runtimeVersion, setRuntimeVersion] = useState<number | null>(null);
  const [datasourceStatus, setDatasourceStatus] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [lastContractSyncAt, setLastContractSyncAt] = useState<string | null>(null);
  const [managedProvisioningAvailable, setManagedProvisioningAvailable] = useState(false);

  // Form inputs
  const [externalTenantId, setExternalTenantId] = useState("");
  const [chatbotUrl, setChatbotUrl] = useState("");
  const [chatbotApiKey, setChatbotApiKey] = useState("");
  const [inboundSecret, setInboundSecret] = useState("");
  const [outboundSecret, setOutboundSecret] = useState("");
  const [roleMapJson, setRoleMapJson] = useState("");

  // Test connection feedback
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen && tenant) {
      fetchConfig();
    } else {
      resetForm();
    }
  }, [isOpen, tenant]);

  const resetForm = () => {
    setConfigured(false);
    setSource("NONE");
    setUpdatedAt(null);
    setMode("UNCONFIGURED");
    setSyncStatus("NOT_PROVISIONED");
    setContractVersion(null);
    setRuntimeVersion(null);
    setDatasourceStatus(null);
    setEnabledModules([]);
    setLastContractSyncAt(null);
    setManagedProvisioningAvailable(false);
    setExternalTenantId("");
    setChatbotUrl("");
    setChatbotApiKey("");
    setInboundSecret("");
    setOutboundSecret("");
    setRoleMapJson("");
    setTestResult(null);
  };

  const fetchConfig = async () => {
    if (!tenant) return;
    setLoading(true);
    setTestResult(null);
    try {
      const res = await api.get(`/api/v1/core/tenants/${tenant.id}/marbot-config`);
      const payload = res.data;
      setConfigured(Boolean(payload.configured));
      setSource(payload.source || "NONE");
      setMode(payload.mode || "UNCONFIGURED");
      setSyncStatus(payload.syncStatus || "NOT_PROVISIONED");
      setContractVersion(payload.contractVersion ?? null);
      setRuntimeVersion(payload.runtimeContextVersion ?? null);
      setDatasourceStatus(payload.datasourceStatus ?? null);
      setEnabledModules(Array.isArray(payload.enabledModules) ? payload.enabledModules : []);
      setLastContractSyncAt(payload.lastContractSyncAt ?? null);
      setManagedProvisioningAvailable(Boolean(payload.managedProvisioningAvailable));

      if (payload.data) {
        setExternalTenantId(payload.data.external_tenant_id || tenant.code);
        setChatbotUrl(payload.data.chatbot_url || "");
        setChatbotApiKey(payload.data.chatbot_api_key_masked || "");
        setInboundSecret(payload.data.inbound_context_secret_masked || "");
        setOutboundSecret(payload.data.outbound_tool_secret_masked || "");
        setRoleMapJson(payload.data.role_map_json || "");
        setUpdatedAt(payload.data.updated_at || null);
      } else {
        // Default initial values for new tenant
        setExternalTenantId(tenant.code);
        setChatbotUrl("https://");
      }
    } catch (err: any) {
      console.error("Error fetching MarBot config:", err);
      toast.error(err.response?.data?.message || "Gagal memuat konfigurasi MarBot.");
    } finally {
      setLoading(false);
    }
  };

  const handleProvision = async () => {
    if (!tenant) return;
    setProvisioning(true);
    try {
      await api.post(`/api/v1/core/tenants/${tenant.id}/marbot-config/provision`, {});
      toast.success(mode === "MANAGED" ? "Kontrak MarBot berhasil disinkronkan." : "Tenant berhasil diprovision ke MarBot.");
      await fetchConfig();
      onConfigSaved?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Provisioning MarBot gagal.");
    } finally {
      setProvisioning(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenant) return;

    if (!chatbotUrl.trim() || chatbotUrl === "https://") {
      toast.error("URL chatbot wajib diisi dengan format HTTPS.");
      return;
    }

    setSaving(true);
    try {
      await api.put(`/api/v1/core/tenants/${tenant.id}/marbot-config`, {
        external_tenant_id: externalTenantId.trim(),
        chatbot_url: chatbotUrl.trim(),
        chatbot_api_key: chatbotApiKey.trim(),
        inbound_context_secret: inboundSecret.trim(),
        outbound_tool_secret: outboundSecret.trim(),
        role_map_json: roleMapJson.trim() ? roleMapJson.trim() : null,
      });

      toast.success("Konfigurasi MarBot berhasil disimpan!");
      await fetchConfig();
      if (onConfigSaved) onConfigSaved();
    } catch (err: any) {
      console.error("Error saving MarBot config:", err);
      toast.error(err.response?.data?.message || "Gagal menyimpan konfigurasi MarBot.");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!tenant) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await api.post(`/api/v1/core/tenants/${tenant.id}/marbot-config/test`, {
        chatbot_url: chatbotUrl.trim(),
        chatbot_api_key: chatbotApiKey.trim(),
      });

      setTestResult({
        success: true,
        message: res.data.message || "Koneksi ke endpoint chatbot berhasil terhubung.",
      });
      toast.success("Endpoint chatbot terjangkau!");
    } catch (err: any) {
      const msg = err.response?.data?.message || "Gagal menghubungi endpoint chatbot.";
      setTestResult({
        success: false,
        message: msg,
      });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!tenant) return;
    if (!confirm(`Hapus konfigurasi MarBot untuk tenant ${tenant.name}? Chatbot tidak akan dapat digunakan oleh entitas di tenant ini.`)) {
      return;
    }

    setDeleting(true);
    try {
      await api.delete(`/api/v1/core/tenants/${tenant.id}/marbot-config`);
      toast.success("Konfigurasi MarBot berhasil dihapus.");
      resetForm();
      if (onConfigSaved) onConfigSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Gagal menghapus konfigurasi.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Integrasi MarBot Chatbot"
      subtitle={`Pengaturan koneksi AI Assistant untuk Tenant: ${tenant?.name || ""} (${tenant?.code || ""})`}
      maxWidth="lg"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-[#64748B]">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin text-[#2649B3]" /> Memuat konfigurasi chatbot...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5 pt-2">
          {/* Status Banner */}
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 text-xs leading-relaxed ${
              source === "DATABASE"
                ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]"
                : source === "ENV"
                ? "border-[#FED7AA] bg-[#FFFBEB] text-[#B45309]"
                : "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]"
            }`}
          >
            <Bot className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <div className="font-bold uppercase tracking-wider">
                {source === "DATABASE"
                  ? "Terkonfigurasi di Database Platform"
                  : source === "ENV"
                  ? "Terkonfigurasi via Environment Server (.env Legacy)"
                  : "Belum Dikonfigurasi"}
              </div>
              <p className="mt-0.5">
                {source === "DATABASE"
                  ? "Kredensial tersimpan secara aman di database platform. Tenant ini siap menggunakan modul MARBOT."
                  : source === "ENV"
                  ? "Konfigurasi saat ini dibaca dari file .env server. Anda dapat memperbarui form di bawah untuk memindahkan dan mengelola config langsung dari dashboard."
                  : "Isi form di bawah ini agar company di bawah tenant ini dapat mengaktifkan dan menggunakan asisten AI MarBot."}
              </p>
              {updatedAt && (
                <div className="mt-1 text-[11px] opacity-75">
                  Terakhir diperbarui: {new Date(updatedAt).toLocaleString("id-ID")}
                </div>
              )}
            </div>
          </div>

          {/* Test Result Alert */}
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-medium ${
                testResult.success
                  ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]"
                  : "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {mode === "MANAGED" && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#DCE7FF] bg-[#F8FAFF] p-4 text-xs sm:grid-cols-3">
              {[
                ["Mode", "MANAGED"],
                ["Contract", contractVersion ? `V${contractVersion}` : "—"],
                ["Runtime", runtimeVersion ? `V${runtimeVersion}` : "—"],
                ["Status", syncStatus],
                ["Datasource", datasourceStatus || "NOT CONFIGURED"],
                ["Modules", enabledModules.length ? enabledModules.join(", ") : "GENERAL"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#E2E8F0] bg-white p-3">
                  <div className="font-semibold uppercase tracking-wider text-[#64748B]">{label}</div>
                  <div className="mt-1 break-words font-bold text-[#2649B3]">{value}</div>
                </div>
              ))}
              <div className="col-span-2 text-[11px] text-[#64748B] sm:col-span-3">
                Sinkronisasi kontrak terakhir: {lastContractSyncAt ? new Date(lastContractSyncAt).toLocaleString("id-ID") : "Belum tersedia"}. Credential dikelola server dan tidak pernah dikirim ke browser.
              </div>
            </div>
          )}

          {/* Fields */}
          {mode !== "MANAGED" && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                External Tenant ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={externalTenantId}
                onChange={(e) => setExternalTenantId(e.target.value)}
                placeholder="Misal: SINERGI_MUDA_ARSA atau kode unik chatbot"
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E2E8F0] px-3.5 text-sm font-mono text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              />
              <p className="mt-1 text-[11px] text-[#64748B]">
                ID tenant yang didaftarkan pada server Chatbot / Lite-MCP. Biasanya sama dengan Kode Tenant ERP.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Endpoint URL Chatbot (HTTPS) <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="url"
                  required
                  value={chatbotUrl}
                  onChange={(e) => setChatbotUrl(e.target.value)}
                  placeholder="https://marbot.arsalynk.com"
                  className="h-10 w-full rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm font-mono text-[#0F172A] outline-none transition focus:border-[#2649B3]"
                />
              </div>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Alamat dasar webhook/API backend chatbot. Harus menggunakan HTTPS untuk produksi.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Chatbot API Key <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Key className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  required={!configured}
                  value={chatbotApiKey}
                  onChange={(e) => setChatbotApiKey(e.target.value)}
                  placeholder={configured ? "•••••••• (Biarkan jika tidak ingin mengubah)" : "Masukkan token API key"}
                  className="h-10 w-full rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm font-mono text-[#0F172A] outline-none transition focus:border-[#2649B3]"
                />
              </div>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Bearer token otorisasi saat ERP mengirim pesan/stream ke endpoint chatbot.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Inbound Context Secret <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Shield className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  required={!configured}
                  value={inboundSecret}
                  onChange={(e) => setInboundSecret(e.target.value)}
                  placeholder={configured ? "•••••••• (Biarkan jika tidak diubah)" : "HMAC secret untuk signed context"}
                  className="h-10 w-full rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm font-mono text-[#0F172A] outline-none transition focus:border-[#2649B3]"
                />
              </div>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Secret HMAC SHA256 untuk memvalidasi konteks hak akses user ke chatbot.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Outbound Tool Secret <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Shield className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  required={!configured}
                  value={outboundSecret}
                  onChange={(e) => setOutboundSecret(e.target.value)}
                  placeholder={configured ? "•••••••• (Biarkan jika tidak diubah)" : "HMAC secret callback tool"}
                  className="h-10 w-full rounded-xl border border-[#E2E8F0] pl-10 pr-3.5 text-sm font-mono text-[#0F172A] outline-none transition focus:border-[#2649B3]"
                />
              </div>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Harus berbeda dari Inbound Secret. Dipakai chatbot memanggil tool ERP (Lite MCP).
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Role Mapping JSON <span className="text-[#94A3B8] font-normal">(Opsional)</span>
              </label>
              <textarea
                rows={2}
                value={roleMapJson}
                onChange={(e) => setRoleMapJson(e.target.value)}
                placeholder='{"DIRECTOR": "EXECUTIVE", "FINANCE": "FINANCIAL_ANALYST"}'
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] p-3 text-xs font-mono text-[#0F172A] outline-none transition focus:border-[#2649B3]"
              />
              <p className="mt-1 text-[11px] text-[#64748B]">
                Mapping kode role internal ERP ke role yang dipahami oleh engine persona MarBot.
              </p>
            </div>
          </div>}

          {/* Action Buttons Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F1F5F9] pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !chatbotUrl || chatbotUrl === "https://"}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#334155] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin text-[#2649B3]" : ""}`} />
                {testing ? "Menguji..." : "Test Koneksi"}
              </button>

              {managedProvisioningAvailable && <button
                type="button"
                onClick={handleProvision}
                disabled={provisioning}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#2649B3] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1D3A96] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${provisioning ? "animate-spin" : ""}`} />
                {provisioning ? "Memproses..." : mode === "MANAGED" ? "Sync Contract" : "Provision"}
              </button>}

              {configured && source === "DATABASE" && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#FCA5A5] bg-white px-3 text-xs font-semibold text-[#DC2626] shadow-sm transition hover:bg-[#FEF2F2] disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Menghapus..." : "Hapus Konfigurasi"}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-xl border border-[#E2E8F0] bg-white px-4 text-xs font-semibold text-[#64748B] transition hover:bg-[#F8FAFC]"
              >
                Tutup
              </button>
              {mode !== "MANAGED" && <button
                type="submit"
                disabled={saving}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#2649B3] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1D3A96] disabled:opacity-50"
              >
                <Bot className="h-3.5 w-3.5" />
                {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
              </button>}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

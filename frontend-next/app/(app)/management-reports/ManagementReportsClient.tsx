"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText,
  Plus,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  Archive,
  Eye,
  Edit3,
  Calendar,
  Layers,
  CheckSquare,
  Milestone,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  ManagementReport,
  getManagementReports,
  getManagementReport,
  createManagementReport,
  updateManagementReport,
  submitManagementReport,
  requestManagementReportRevision,
  markManagementReportReviewed,
  archiveManagementReport,
} from "@/lib/api/management-reports.api";

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  DRAFT: { label: "Draft", bg: "bg-gray-100", text: "text-gray-700" },
  SUBMITTED: { label: "Menunggu Review", bg: "bg-blue-50", text: "text-blue-700" },
  REVISION_REQUESTED: { label: "Perlu Revisi", bg: "bg-amber-50", text: "text-amber-700" },
  REVIEWED: { label: "Disetujui / Selesai", bg: "bg-emerald-50", text: "text-emerald-700" },
  ARCHIVED: { label: "Diarsipkan", bg: "bg-gray-100", text: "text-gray-500" },
};

export default function ManagementReportsClient() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const rawRole = (user?.active_role_code || "").toUpperCase();
  const isOM = rawRole === "ROLE-OM" || rawRole === "OPERATIONAL_MANAGER" || rawRole === "OM";
  const isDirector = rawRole === "ROLE-DIRECTOR" || rawRole === "DIRECTOR";

  const [reports, setReports] = useState<ManagementReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("ALL");

  // Create/Edit Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<ManagementReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    period_type: "WEEKLY",
    period_start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    period_end: new Date().toISOString().slice(0, 10),
    executive_summary: "",
    achievements: "",
    blockers: "",
    risks: "",
    decisions_needed: "",
    next_plan: "",
  });

  // Review & Detail Modal
  const [detailReport, setDetailReport] = useState<ManagementReport | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"REVISION" | "APPROVE">("APPROVE");
  const [reviewNote, setReviewNote] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  async function loadReports() {
    setLoading(true);
    try {
      const data = await getManagementReports();
      setReports(data);
    } catch {
      toast.error("Gagal memuat daftar laporan manajemen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReports();
  }, []);

  useEffect(() => {
    if (searchParams.get("action") === "create" && isOM) {
      openCreateModal();
    }
  }, [searchParams, isOM]);

  function openCreateModal() {
    setEditingReport(null);
    setFormData({
      title: `Laporan Operasional Mingguan - ${new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`,
      period_type: "WEEKLY",
      period_start: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
      executive_summary: "",
      achievements: "",
      blockers: "",
      risks: "",
      decisions_needed: "",
      next_plan: "",
    });
    setEditorOpen(true);
  }

  function openEditModal(report: ManagementReport) {
    setEditingReport(report);
    setFormData({
      title: report.title,
      period_type: report.period_type,
      period_start: report.period_start.slice(0, 10),
      period_end: report.period_end.slice(0, 10),
      executive_summary: report.executive_summary || "",
      achievements: report.achievements || "",
      blockers: report.blockers || "",
      risks: report.risks || "",
      decisions_needed: report.decisions_needed || "",
      next_plan: report.next_plan || "",
    });
    setEditorOpen(true);
  }

  async function handleSaveReport(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingReport) {
        await updateManagementReport(editingReport.id, formData);
        toast.success("Draft laporan berhasil diperbarui.");
      } else {
        await createManagementReport(formData);
        toast.success("Draft laporan berhasil dibuat.");
      }
      setEditorOpen(false);
      await loadReports();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Gagal menyimpan laporan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(reportId: string) {
    if (!confirm("Kirim laporan ini ke Direksi? Snapshot data operasional terkini akan otomatis direkam.")) return;
    try {
      await submitManagementReport(reportId);
      toast.success("Laporan berhasil dikirim ke Direksi.");
      await loadReports();
      if (detailReport?.id === reportId) {
        const updated = await getManagementReport(reportId);
        setDetailReport(updated);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Gagal mengirim laporan.");
    }
  }

  async function handleReviewSubmit() {
    if (!detailReport) return;
    setSubmittingAction(true);
    try {
      if (reviewAction === "REVISION") {
        await requestManagementReportRevision(detailReport.id, reviewNote);
        toast.success("Catatan revisi telah dikirim ke OM.");
      } else {
        await markManagementReportReviewed(detailReport.id, reviewNote);
        toast.success("Laporan telah ditandai Selesai Direview.");
      }
      setReviewModalOpen(false);
      setReviewNote("");
      await loadReports();
      const updated = await getManagementReport(detailReport.id);
      setDetailReport(updated);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Aksi review gagal.");
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleArchive(reportId: string) {
    if (!confirm("Arsipkan laporan ini?")) return;
    try {
      await archiveManagementReport(reportId);
      toast.success("Laporan berhasil diarsipkan.");
      await loadReports();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Gagal mengarsipkan laporan.");
    }
  }

  const filteredReports = useMemo(() => {
    if (activeTab === "ALL") return reports;
    return reports.filter((r) => r.status === activeTab);
  }, [reports, activeTab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#EFEFEF] bg-white p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF6FF] text-[#2649B3]">
              <FileText size={20} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-[#2649B3]">
                {isDirector ? "Management Reports (Inbox Direksi)" : "Management Reports"}
              </h1>
              <p className="text-xs text-[#4F5050]">
                {isDirector
                  ? "Verifikasi dan berikan catatan review untuk laporan operasional dari Operational Manager."
                  : "Susun dokumen laporan manajerial operasional berkala dan submit langsung ke Direksi."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReports}
            className="flex items-center gap-1.5 rounded-xl border border-[#EFEFEF] bg-white px-3 py-2 text-xs font-semibold text-[#4F5050] hover:bg-[#FDFDFD]"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Segarkan
          </button>

          {isOM && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 rounded-xl bg-[#2649B3] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#1f3c96]"
            >
              <Plus size={14} />
              Buat Laporan Operasional
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#EFEFEF] gap-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab("ALL")}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === "ALL"
              ? "border-[#2649B3] text-[#2649B3]"
              : "border-transparent text-[#4F5050] hover:text-[#090909]"
          }`}
        >
          Semua ({reports.length})
        </button>
        <button
          onClick={() => setActiveTab("SUBMITTED")}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === "SUBMITTED"
              ? "border-[#2649B3] text-[#2649B3]"
              : "border-transparent text-[#4F5050] hover:text-[#090909]"
          }`}
        >
          Menunggu Review ({reports.filter((r) => r.status === "SUBMITTED").length})
        </button>
        {isOM && (
          <button
            onClick={() => setActiveTab("DRAFT")}
            className={`pb-3 px-3 transition-colors border-b-2 ${
              activeTab === "DRAFT"
                ? "border-[#2649B3] text-[#2649B3]"
                : "border-transparent text-[#4F5050] hover:text-[#090909]"
            }`}
          >
            Draft ({reports.filter((r) => r.status === "DRAFT").length})
          </button>
        )}
        <button
          onClick={() => setActiveTab("REVISION_REQUESTED")}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === "REVISION_REQUESTED"
              ? "border-[#2649B3] text-[#2649B3]"
              : "border-transparent text-[#4F5050] hover:text-[#090909]"
          }`}
        >
          Perlu Revisi ({reports.filter((r) => r.status === "REVISION_REQUESTED").length})
        </button>
        <button
          onClick={() => setActiveTab("REVIEWED")}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === "REVIEWED"
              ? "border-[#2649B3] text-[#2649B3]"
              : "border-transparent text-[#4F5050] hover:text-[#090909]"
          }`}
        >
          Selesai Direview ({reports.filter((r) => r.status === "REVIEWED").length})
        </button>
        <button
          onClick={() => setActiveTab("ARCHIVED")}
          className={`pb-3 px-3 transition-colors border-b-2 ${
            activeTab === "ARCHIVED"
              ? "border-[#2649B3] text-[#2649B3]"
              : "border-transparent text-[#4F5050] hover:text-[#090909]"
          }`}
        >
          Arsip ({reports.filter((r) => r.status === "ARCHIVED").length})
        </button>
      </div>

      {/* Reports Table */}
      <div className="rounded-2xl border border-[#EFEFEF] bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#EFEFEF] bg-[#FDFDFD] text-3xs font-bold uppercase tracking-wider text-[#4F5050]">
              <tr>
                <th className="px-5 py-3.5">No. Laporan</th>
                <th className="px-5 py-3.5">Judul & Periode</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Penyusun / Reviewer</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-[#4F5050]">
                    Memuat data laporan...
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-[#4F5050]">
                    Tidak ada laporan pada kategori ini.
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => {
                  const badge = STATUS_BADGES[report.status] || {
                    label: report.status,
                    bg: "bg-gray-100",
                    text: "text-gray-700",
                  };
                  return (
                    <tr key={report.id} className="hover:bg-[#FDFDFD] transition">
                      <td className="px-5 py-4 font-mono font-semibold text-[#2649B3]">
                        {report.report_number}
                        <span className="block text-3xs text-[#4F5050]">v{report.version_number}</span>
                        <span className="mt-1 block font-sans text-[10px] font-normal text-[#6B7280]">
                          {new Date(report.updated_at || report.submitted_at || report.created_at).toLocaleString("id-ID")}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="block font-bold text-sm text-[#090909]">{report.title}</span>
                        <span className="text-3xs text-[#4F5050] flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />
                          {report.period_start.slice(0, 10)} s/d {report.period_end.slice(0, 10)} ({report.period_type})
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-3xs font-bold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[#4F5050]">
                        <div>Dibuat: {report.prepared_by?.full_name || report.prepared_by?.email || "OM"}</div>
                        {report.reviewed_by && (
                          <div className="text-3xs text-emerald-700 font-medium mt-0.5">
                            Review: {report.reviewed_by.full_name || report.reviewed_by.email}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailReport(report)}
                            className="flex items-center gap-1 rounded-lg border border-[#EFEFEF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2649B3] hover:bg-[#EAF6FF]"
                            title="Buka detail"
                          >
                            <Eye size={13} />
                            Lihat
                          </button>

                          {isOM && ["DRAFT", "REVISION_REQUESTED"].includes(report.status) && (
                            <>
                              <button
                                onClick={() => openEditModal(report)}
                                className="flex items-center gap-1 rounded-lg border border-[#EFEFEF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4F5050] hover:bg-gray-50"
                                title="Edit draft"
                              >
                                <Edit3 size={13} />
                                Edit
                              </button>
                              <button
                                onClick={() => handleSubmit(report.id)}
                                className="flex items-center gap-1 rounded-lg bg-[#2649B3] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#1f3c96]"
                                title="Submit ke Direksi"
                              >
                                <Send size={12} />
                                Submit
                              </button>
                            </>
                          )}

                          {isDirector && report.status === "SUBMITTED" && (
                            <>
                              <button
                                onClick={() => {
                                  setDetailReport(report);
                                  setReviewAction("APPROVE");
                                  setReviewModalOpen(true);
                                }}
                                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                              >
                                <CheckCircle2 size={12} />
                                Review
                              </button>
                              <button
                                onClick={() => {
                                  setDetailReport(report);
                                  setReviewAction("REVISION");
                                  setReviewModalOpen(true);
                                }}
                                className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                              >
                                <AlertCircle size={12} />
                                Revisi
                              </button>
                            </>
                          )}

                          {isDirector && report.status === "REVIEWED" && (
                            <button
                              onClick={() => handleArchive(report.id)}
                              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                              title="Arsipkan"
                            >
                              <Archive size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal (OM Create/Edit) */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#EFEFEF] bg-white p-6 shadow-2xl">
            <h2 className="text-base font-bold text-[#2649B3]">
              {editingReport ? "Edit Laporan Operasional" : "Buat Laporan Operasional Baru"}
            </h2>
            <p className="mt-0.5 text-xs text-[#4F5050]">
              Lengkapi narasi laporan. Saat Anda melakukan submit, snapshot metrik operasional proyek terkini akan otomatis digenerate.
            </p>

            <form onSubmit={handleSaveReport} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#090909] mb-1">
                  Judul Laporan <span className="form-required">*</span>
                </label>
                <input
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 placeholder:text-gray-400 focus:border-[#2649B3] focus:outline-none"
                  placeholder="Contoh: Laporan Operasional Proyek Pekan ke-3"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold text-[#090909] mb-1">Tipe Periode</label>
                  <select
                    value={formData.period_type}
                    onChange={(e) => setFormData({ ...formData, period_type: e.target.value })}
                    className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 focus:border-[#2649B3] focus:outline-none"
                  >
                    <option value="WEEKLY">Mingguan (Weekly)</option>
                    <option value="MONTHLY">Bulanan (Monthly)</option>
                    <option value="INCIDENTAL">Insidental</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[#090909] mb-1">
                    Tanggal Mulai <span className="form-required">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.period_start}
                    onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                    className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 focus:border-[#2649B3] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#090909] mb-1">
                    Tanggal Akhir <span className="form-required">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.period_end}
                    onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                    className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 focus:border-[#2649B3] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#090909] mb-1">Executive Summary</label>
                <textarea
                  rows={3}
                  value={formData.executive_summary}
                  onChange={(e) => setFormData({ ...formData, executive_summary: e.target.value })}
                  className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 placeholder:text-gray-400 focus:border-[#2649B3] focus:outline-none"
                  placeholder="Ringkasan eksekutif performa dan capaian kunci..."
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-[#090909] mb-1">Pencapaian Utama (Achievements)</label>
                  <textarea
                    rows={2}
                    value={formData.achievements}
                    onChange={(e) => setFormData({ ...formData, achievements: e.target.value })}
                    className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 placeholder:text-gray-400 focus:border-[#2649B3] focus:outline-none"
                    placeholder="Milestone tercapai, task penting selesai..."
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#090909] mb-1">Kendala / Blockers</label>
                  <textarea
                    rows={2}
                    value={formData.blockers}
                    onChange={(e) => setFormData({ ...formData, blockers: e.target.value })}
                    className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 placeholder:text-gray-400 focus:border-[#2649B3] focus:outline-none"
                    placeholder="Hambatan lapangan, keterlambatan vendor..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-[#090909] mb-1">Mitigasi Risiko (Risks)</label>
                  <textarea
                    rows={2}
                    value={formData.risks}
                    onChange={(e) => setFormData({ ...formData, risks: e.target.value })}
                    className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 placeholder:text-gray-400 focus:border-[#2649B3] focus:outline-none"
                    placeholder="Potensi risiko ke depan dan langkah antisipasi..."
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#090909] mb-1">Keputusan Diperlukan Direksi</label>
                  <textarea
                    rows={2}
                    value={formData.decisions_needed}
                    onChange={(e) => setFormData({ ...formData, decisions_needed: e.target.value })}
                    className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 placeholder:text-gray-400 focus:border-[#2649B3] focus:outline-none"
                    placeholder="Persetujuan perubahan budget, eskalasi izin..."
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#090909] mb-1">Rencana Kerja Periode Berikutnya</label>
                <textarea
                  rows={2}
                  value={formData.next_plan}
                  onChange={(e) => setFormData({ ...formData, next_plan: e.target.value })}
                  className="w-full rounded-[11px] border border-[#D9D9D9] p-2.5 placeholder:text-gray-400 focus:border-[#2649B3] focus:outline-none"
                  placeholder="Target kerja dan prioritas operasional mendatang..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#EFEFEF]">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="rounded-xl border border-[#D9D9D9] px-4 py-2 font-semibold text-[#4F5050] hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#2649B3] px-5 py-2 font-bold text-white hover:bg-[#1f3c96] flex items-center gap-1.5"
                >
                  {saving && <RefreshCw size={12} className="animate-spin" />}
                  Simpan Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailReport && !reviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#EFEFEF] bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-[#EFEFEF] pb-4">
              <div>
                <span className="font-mono text-xs font-bold text-[#2649B3]">{detailReport.report_number}</span>
                <h2 className="text-lg font-bold text-[#090909]">{detailReport.title}</h2>
                <p className="text-xs text-[#4F5050] mt-0.5">
                  Periode: {detailReport.period_start.slice(0, 10)} s/d {detailReport.period_end.slice(0, 10)} · Disusun oleh: {detailReport.prepared_by?.full_name || detailReport.prepared_by?.email || "OM"}
                </p>
              </div>
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${STATUS_BADGES[detailReport.status]?.bg} ${STATUS_BADGES[detailReport.status]?.text}`}>
                {STATUS_BADGES[detailReport.status]?.label || detailReport.status}
              </span>
            </div>

            {/* Review Note if any */}
            {detailReport.review_note && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <span className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertCircle size={14} /> Catatan Direksi:
                </span>
                <p className="whitespace-pre-wrap">{detailReport.review_note}</p>
              </div>
            )}

            {/* Operational Snapshot Data */}
            {detailReport.snapshot_json && (
              <div className="rounded-2xl border border-[#2649B3]/20 bg-[#F6FAFF] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-[#2649B3] font-bold">
                  <span>Snapshot Metrik Operasional Saat Submit</span>
                  <span className="text-3xs font-normal text-[#4F5050]">
                    Terekam: {detailReport.submitted_at ? new Date(detailReport.submitted_at).toLocaleString("id-ID") : "-"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                  <div className="rounded-xl bg-white p-3 border border-[#EFEFEF]">
                    <div className="flex items-center gap-2 text-[#4F5050] font-medium mb-1">
                      <Layers size={14} className="text-[#2649B3]" /> Proyek
                    </div>
                    <div className="text-lg font-bold text-[#090909]">
                      {detailReport.snapshot_json.projects?.active ?? 0} <span className="text-xs font-normal text-[#4F5050]">aktif</span> / {detailReport.snapshot_json.projects?.total ?? 0} <span className="text-xs font-normal text-[#4F5050]">total</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white p-3 border border-[#EFEFEF]">
                    <div className="flex items-center gap-2 text-[#4F5050] font-medium mb-1">
                      <CheckSquare size={14} className="text-emerald-600" /> Daily Tasks
                    </div>
                    <div className="text-lg font-bold text-[#090909]">
                      {detailReport.snapshot_json.tasks?.in_progress ?? 0} <span className="text-xs font-normal text-[#4F5050]">berjalan</span> · {detailReport.snapshot_json.tasks?.blocked ?? 0} <span className="text-xs font-normal text-red-600">terhambat</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white p-3 border border-[#EFEFEF]">
                    <div className="flex items-center gap-2 text-[#4F5050] font-medium mb-1">
                      <Milestone size={14} className="text-amber-600" /> Milestones
                    </div>
                    <div className="text-lg font-bold text-[#090909]">
                      {detailReport.snapshot_json.milestones?.total ?? 0} <span className="text-xs font-normal text-[#4F5050]">total</span> · {detailReport.snapshot_json.milestones?.overdue ?? 0} <span className="text-xs font-normal text-red-600">jatuh tempo</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Narrative Sections */}
            <div className="space-y-4 text-xs">
              <div>
                <h3 className="font-bold text-[#090909] uppercase tracking-wider text-3xs text-[#4F5050] mb-1">Executive Summary</h3>
                <p className="rounded-xl bg-[#FDFDFD] p-3 border border-[#EFEFEF] text-[#090909] whitespace-pre-wrap">
                  {detailReport.executive_summary || "-"}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="font-bold text-[#090909] uppercase tracking-wider text-3xs text-[#4F5050] mb-1">Pencapaian Utama</h3>
                  <p className="rounded-xl bg-[#FDFDFD] p-3 border border-[#EFEFEF] text-[#090909] whitespace-pre-wrap">
                    {detailReport.achievements || "-"}
                  </p>
                </div>
                <div>
                  <h3 className="font-bold text-[#090909] uppercase tracking-wider text-3xs text-[#4F5050] mb-1">Kendala / Hambatan</h3>
                  <p className="rounded-xl bg-[#FDFDFD] p-3 border border-[#EFEFEF] text-[#090909] whitespace-pre-wrap">
                    {detailReport.blockers || "-"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="font-bold text-[#090909] uppercase tracking-wider text-3xs text-[#4F5050] mb-1">Mitigasi Risiko</h3>
                  <p className="rounded-xl bg-[#FDFDFD] p-3 border border-[#EFEFEF] text-[#090909] whitespace-pre-wrap">
                    {detailReport.risks || "-"}
                  </p>
                </div>
                <div>
                  <h3 className="font-bold text-[#090909] uppercase tracking-wider text-3xs text-[#4F5050] mb-1">Keputusan Diperlukan</h3>
                  <p className="rounded-xl bg-[#FDFDFD] p-3 border border-[#EFEFEF] text-[#090909] whitespace-pre-wrap">
                    {detailReport.decisions_needed || "-"}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-[#090909] uppercase tracking-wider text-3xs text-[#4F5050] mb-1">Rencana Kerja Periode Berikutnya</h3>
                <p className="rounded-xl bg-[#FDFDFD] p-3 border border-[#EFEFEF] text-[#090909] whitespace-pre-wrap">
                  {detailReport.next_plan || "-"}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-[#EFEFEF]">
              <button
                onClick={() => setDetailReport(null)}
                className="rounded-xl border border-[#D9D9D9] px-4 py-2 text-xs font-semibold text-[#4F5050] hover:bg-gray-50"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                {isOM && ["DRAFT", "REVISION_REQUESTED"].includes(detailReport.status) && (
                  <button
                    onClick={() => handleSubmit(detailReport.id)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#2649B3] px-4 py-2 text-xs font-bold text-white hover:bg-[#1f3c96]"
                  >
                    <Send size={13} />
                    Submit ke Direksi
                  </button>
                )}

                {isDirector && detailReport.status === "SUBMITTED" && (
                  <>
                    <button
                      onClick={() => {
                        setReviewAction("REVISION");
                        setReviewModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
                    >
                      <AlertCircle size={13} />
                      Minta Revisi
                    </button>
                    <button
                      onClick={() => {
                        setReviewAction("APPROVE");
                        setReviewModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 size={13} />
                      Tandai Selesai Direview
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Dialog Modal (Director) */}
      {reviewModalOpen && detailReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#EFEFEF] bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[#2649B3]">
              {reviewAction === "REVISION" ? "Minta Revisi Laporan" : "Selesaikan Review Laporan"}
            </h3>
            <p className="text-xs text-[#4F5050]">
              {reviewAction === "REVISION"
                ? "Berikan catatan poin apa saja yang perlu diperbaiki oleh Operational Manager sebelum disetujui."
                : "Tandai laporan telah ditinjau oleh Direksi. Anda dapat menambahkan catatan apresiasi atau arahan strategis."}
            </p>

            <div>
              <label className="block text-xs font-semibold text-[#090909] mb-1">
                {reviewAction === "REVISION" ? (
                  <>
                    Catatan Revisi <span className="form-required">*</span>
                  </>
                ) : (
                  "Catatan Direksi (Opsional)"
                )}
              </label>
              <textarea
                required={reviewAction === "REVISION"}
                rows={4}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="w-full rounded-[11px] border border-[#D9D9D9] p-3 text-xs placeholder:text-gray-400 focus:border-[#2649B3] focus:outline-none"
                placeholder={reviewAction === "REVISION" ? "Tuliskan poin yang perlu direvisi..." : "Tuliskan arahan / catatan tambahan..."}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="rounded-xl border border-[#D9D9D9] px-4 py-2 text-xs font-semibold text-[#4F5050] hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submittingAction || (reviewAction === "REVISION" && !reviewNote.trim())}
                onClick={handleReviewSubmit}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white ${
                  reviewAction === "REVISION" ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {submittingAction && <RefreshCw size={12} className="animate-spin" />}
                {reviewAction === "REVISION" ? "Kirim Permintaan Revisi" : "Konfirmasi Review Selesai"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

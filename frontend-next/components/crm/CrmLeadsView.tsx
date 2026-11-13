"use client";

import React, { useMemo, useState } from "react";
import {
  FileText, Plus, Kanban, Table2, Inbox, ArrowRight, Pencil,
  Trash2, UserPlus, Building2, Mail, Phone, Globe2, Award,
  CheckCircle2, Clock, XCircle, Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  CRMData,
  createCustomerInquiry,
  deleteCustomerInquiry,
  linkInquiryCustomer,
  qualifyInquiry,
  updateCRMInquiryLeadStatus,
  updateCustomerInquiry,
} from "@/lib/api/crm.api";
import { cn, formatDate } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import {
  CRMAvatarBadge,
  CRMFilterBar,
  CRMKanbanBoard,
  CRMKanbanColumn,
  CRMKpiItem,
  CRMKpiRow,
  CRMRightDrawer,
  CRMTone,
} from "./CrmDesignSystem";

const LEAD_COLUMNS: Array<{ id: string; title: string; tone: CRMTone }> = [
  { id: "NEW", title: "New Lead", tone: "blue" },
  { id: "CONTACTED", title: "Contacted", tone: "purple" },
  { id: "FOLLOW_UP", title: "Waiting", tone: "amber" },
  { id: "RESPONDED", title: "Responded", tone: "pink" },
  { id: "INTERESTED", title: "Interested", tone: "green" },
  { id: "UNQUALIFIED", title: "Not Interested", tone: "red" },
];

const LEAD_SOURCE_OPTIONS = [
  { value: "MANUAL", label: "Manual Entry" },
  { value: "WEBSITE", label: "Website Form" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "REFERRAL", label: "Referral" },
  { value: "EVENT", label: "Event / Exhibition" },
  { value: "EMAIL", label: "Email" },
  { value: "INTERNAL_PIPELINE", label: "Customer Inbox" },
];

const SERVICE_OPTIONS = [
  "Event Management",
  "Exhibition & Booth",
  "Conference & Seminar",
  "Digital Campaign",
  "Consulting & Strategy",
  "IT & Software",
  "Lainnya",
];

function normalizeLeadBucket(status: unknown): string {
  const s = String(status || "NEW").toUpperCase();
  if (s === "WAITING") return "FOLLOW_UP";
  if (s === "QUALIFIED") return "INTERESTED";
  if (["CLOSED_LOST", "REJECTED", "NOT_INTERESTED", "UNQUALIFIED"].includes(s)) return "UNQUALIFIED";
  if (["NEW", "CONTACTED", "FOLLOW_UP", "RESPONDED", "INTERESTED"].includes(s)) return s;
  return "NEW";
}

export function CrmLeadsView({
  data,
  teamUsers,
  onRefresh,
  onNavigateToPipeline,
  onOpenDelegate,
  canDelegate = false,
  readOnly = false,
  canEditAll = false,
  canDelete = false,
  currentUserId,
  initialSubView = "PIPELINE",
  inboxSlot,
}: {
  data: CRMData;
  teamUsers: any[];
  onRefresh: () => void;
  onNavigateToPipeline: () => void;
  onOpenDelegate?: (record: any, recordType: "INQUIRY" | "OPPORTUNITY") => void;
  canDelegate?: boolean;
  readOnly?: boolean;
  canEditAll?: boolean;
  canDelete?: boolean;
  currentUserId?: string;
  initialSubView?: "PIPELINE" | "LIST" | "INBOX";
  inboxSlot?: React.ReactNode;
}) {
  const [subView, setSubView] = useState<"PIPELINE" | "LIST" | "INBOX">(initialSubView);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Drawer state
  const [drawerLead, setDrawerLead] = useState<any | null>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "activities" | "notes">("overview");
  const [linkingPartyId, setLinkingPartyId] = useState("");
  const [isQualifying, setIsQualifying] = useState(false);

  // Add / Edit Lead Modal
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [savingLead, setSavingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    subject: "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    customer_party: "",
    lead_source: "MANUAL",
    interested_service: "",
    description: "",
    notes: "",
  });

  const userById = useMemo(
    () => new Map(teamUsers.map((u: any) => [String(u.id), u])),
    [teamUsers]
  );
  const oppById = useMemo(
    () => new Map((data.opportunities || []).map((o: any) => [String(o.id), o])),
    [data.opportunities]
  );
  const partyById = useMemo(
    () => new Map((data.parties || []).map((p: any) => [String(p.id), p])),
    [data.parties]
  );

  const enrichedLeads = useMemo(() => {
    return (data.inquiries || []).map((inq: any) => {
      const bucket = normalizeLeadBucket(inq.status);
      const linkedOpp = inq.opportunity_id ? oppById.get(String(inq.opportunity_id)) : null;
      const party = inq.customer_party_id ? partyById.get(String(inq.customer_party_id)) : null;
      const ownerId = String(inq.owner_user_id || inq.created_by_id || "");
      const ownerUser = userById.get(ownerId);
      const source = inq.lead_source || inq.source_channel || "MANUAL";
      const service = inq.interested_service || "";
      const isConverted = Boolean(inq.opportunity_id || String(inq.status || "").toUpperCase() === "QUALIFIED");
      const isWon = Boolean(
        linkedOpp &&
          (["WON", "CLOSED_WON"].includes(String(linkedOpp.status || "").toUpperCase()) ||
            ["WON", "CLOSED_WON"].includes(String(linkedOpp.pipeline_stage || "").toUpperCase()))
      );
      return {
        ...inq,
        _bucket: bucket,
        _source: source,
        _service: service,
        _ownerId: ownerId,
        _ownerName: ownerUser?.full_name || ownerUser?.email || "Unassigned",
        _party: party,
        _linkedOpp: linkedOpp,
        _isConverted: isConverted,
        _isWon: isWon,
      };
    });
  }, [data.inquiries, oppById, partyById, userById]);

  const kpiItems: CRMKpiItem[] = useMemo(() => {
    const total = enrichedLeads.length;
    const active = enrichedLeads.filter((l) => l._bucket !== "UNQUALIFIED" && !l._isConverted).length;
    const interested = enrichedLeads.filter((l) => l._bucket === "INTERESTED" || l._bucket === "RESPONDED").length;
    const converted = enrichedLeads.filter((l) => l._isConverted).length;
    const won = enrichedLeads.filter((l) => l._isWon).length;
    const notInterested = enrichedLeads.filter((l) => l._bucket === "UNQUALIFIED").length;

    return [
      { id: "ALL", label: "Total Leads", value: total, tone: "blue", icon: FileText, active: statusFilter === "ALL", onClick: () => setStatusFilter("ALL") },
      { id: "ACTIVE", label: "Active Leads", value: active, tone: "blue", icon: Clock, active: statusFilter === "ACTIVE", onClick: () => setStatusFilter(statusFilter === "ACTIVE" ? "ALL" : "ACTIVE") },
      { id: "INTERESTED", label: "Interested", value: interested, tone: "blue", icon: Sparkles, active: statusFilter === "INTERESTED", onClick: () => setStatusFilter(statusFilter === "INTERESTED" ? "ALL" : "INTERESTED") },
      { id: "CONVERTED", label: "Converted to Pipeline", value: converted, tone: "blue", icon: ArrowRight, active: statusFilter === "CONVERTED", onClick: () => setStatusFilter(statusFilter === "CONVERTED" ? "ALL" : "CONVERTED") },
      { id: "WON", label: "Won (from Leads)", value: won, tone: "blue", icon: Award, active: statusFilter === "WON", onClick: () => setStatusFilter(statusFilter === "WON" ? "ALL" : "WON") },
      { id: "UNQUALIFIED", label: "Not Interested", value: notInterested, tone: "blue", icon: XCircle, active: statusFilter === "UNQUALIFIED", onClick: () => setStatusFilter(statusFilter === "UNQUALIFIED" ? "ALL" : "UNQUALIFIED") },
    ];
  }, [enrichedLeads, statusFilter]);

  const serviceFilterOptions = useMemo(() => {
    const dynamic = Array.from(new Set(enrichedLeads.map((l) => l._service).filter(Boolean)));
    const all = Array.from(new Set([...SERVICE_OPTIONS, ...dynamic]));
    return [{ value: "ALL", label: "All Interested Service" }, ...all.map((s) => ({ value: s, label: s }))];
  }, [enrichedLeads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedLeads.filter((l) => {
      if (sourceFilter !== "ALL" && l._source !== sourceFilter) return false;
      if (serviceFilter !== "ALL" && l._service !== serviceFilter) return false;
      if (ownerFilter !== "ALL" && l._ownerId !== ownerFilter) return false;
      if (statusFilter === "ACTIVE" && (l._bucket === "UNQUALIFIED" || l._isConverted)) return false;
      if (statusFilter === "INTERESTED" && l._bucket !== "INTERESTED" && l._bucket !== "RESPONDED") return false;
      if (statusFilter === "CONVERTED" && !l._isConverted) return false;
      if (statusFilter === "WON" && !l._isWon) return false;
      if (statusFilter === "UNQUALIFIED" && l._bucket !== "UNQUALIFIED") return false;
      if (!q) return true;
      return [l.customer_name, l.subject, l.inquiry_number, l._service, l.customer_email, l.customer_phone, l.description]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [enrichedLeads, sourceFilter, serviceFilter, ownerFilter, statusFilter, search]);

  const kanbanColumns: CRMKanbanColumn<any>[] = useMemo(() => {
    return LEAD_COLUMNS.map((col) => ({
      id: col.id,
      title: col.title,
      tone: col.tone,
      items: filteredLeads.filter((l) => l._bucket === col.id),
    }));
  }, [filteredLeads]);

  const handleMoveLeadStage = async (leadId: string, targetBucket: string) => {
    const lead = enrichedLeads.find((l) => String(l.id) === String(leadId));
    if (!lead || lead._bucket === targetBucket) return;
    if (lead._isConverted) {
      toast.error("Lead yang sudah dikonversi menjadi Opportunity tidak dapat dipindahkan.");
      return;
    }
    try {
      await updateCRMInquiryLeadStatus(leadId, {
        status: targetBucket as any,
        note: `Status diperbarui ke ${LEAD_COLUMNS.find((c) => c.id === targetBucket)?.title || targetBucket}`,
      });
      toast.success(`Lead dipindahkan ke ${LEAD_COLUMNS.find((c) => c.id === targetBucket)?.title || targetBucket}.`);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error?.message || "Gagal memperbarui status Lead.");
    }
  };

  const openAddLead = () => {
    setEditingLead(null);
    setLeadForm({
      subject: "",
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      customer_party: "",
      lead_source: "MANUAL",
      interested_service: "",
      description: "",
      notes: "",
    });
    setIsLeadModalOpen(true);
  };

  const openEditLead = (lead: any) => {
    setEditingLead(lead);
    setLeadForm({
      subject: lead.subject || "",
      customer_name: lead.customer_name || "",
      customer_email: lead.customer_email || "",
      customer_phone: lead.customer_phone || "",
      customer_party: lead.customer_party_id ? String(lead.customer_party_id) : "",
      lead_source: lead.lead_source || lead.source_channel || "MANUAL",
      interested_service: lead.interested_service || "",
      description: lead.description || "",
      notes: lead.notes || "",
    });
    setIsLeadModalOpen(true);
  };

  const handleSaveLead = async () => {
    if (!leadForm.subject.trim() || !leadForm.customer_name.trim()) {
      toast.error("Subject/Kebutuhan dan Nama Customer wajib diisi.");
      return;
    }
    if (!leadForm.customer_email.trim() && !leadForm.customer_phone.trim()) {
      toast.error("Isi minimal Email atau Nomor Telepon kontak.");
      return;
    }
    setSavingLead(true);
    try {
      if (editingLead) {
        await updateCustomerInquiry(editingLead.id, {
          subject: leadForm.subject.trim(),
          customer_name: leadForm.customer_name.trim(),
          customer_email: leadForm.customer_email.trim(),
          customer_phone: leadForm.customer_phone.trim(),
          description: leadForm.description.trim(),
          lead_source: leadForm.lead_source,
          interested_service: leadForm.interested_service.trim() || null,
          notes: leadForm.notes.trim() || null,
        });
        toast.success("Data Lead berhasil diperbarui.");
      } else {
        await createCustomerInquiry({
          subject: leadForm.subject.trim(),
          customer_name: leadForm.customer_name.trim(),
          customer_email: leadForm.customer_email.trim(),
          customer_phone: leadForm.customer_phone.trim(),
          customer_party: leadForm.customer_party || null,
          description: leadForm.description.trim(),
          lead_source: leadForm.lead_source,
          interested_service: leadForm.interested_service.trim() || null,
          notes: leadForm.notes.trim() || null,
        });
        toast.success("Lead baru berhasil ditambahkan.");
      }
      setIsLeadModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error?.message || "Gagal menyimpan Lead.");
    } finally {
      setSavingLead(false);
    }
  };

  const handleLinkCustomerInDrawer = async () => {
    if (!drawerLead || !linkingPartyId) return;
    try {
      const updated = await linkInquiryCustomer(drawerLead.id, linkingPartyId);
      toast.success("Perusahaan berhasil ditautkan ke Lead.");
      setDrawerLead({ ...drawerLead, ...updated, customer_party_id: linkingPartyId });
      setLinkingPartyId("");
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menautkan perusahaan.");
    }
  };

  const handleConvertToOpportunity = async (lead: any) => {
    if (!lead.customer_party_id) {
      toast.error("Tautkan Customer / Prospect terlebih dahulu di panel detail sebelum konversi.");
      return;
    }
    setIsQualifying(true);
    try {
      await qualifyInquiry(lead.id);
      toast.success("Lead berhasil dikonversi menjadi Opportunity di Sales Pipeline!");
      setDrawerLead(null);
      onRefresh();
      onNavigateToPipeline();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error?.message || "Lead belum dapat dikonversi.");
    } finally {
      setIsQualifying(false);
    }
  };

  const handleDeleteLead = async (lead: any) => {
    if (!confirm(`Hapus Lead "${lead.subject || lead.customer_name}"?`)) return;
    try {
      await deleteCustomerInquiry(lead.id);
      toast.success("Lead berhasil dihapus.");
      setDrawerLead(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Lead tidak dapat dihapus.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <CRMKpiRow items={kpiItems} columns={6} />

      <CRMFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari perusahaan, PIC, atau layanan..."
        filters={[
          {
            id: "leadSource",
            value: sourceFilter,
            onChange: setSourceFilter,
            ariaLabel: "Filter Lead Source",
            options: [{ value: "ALL", label: "All Lead Source" }, ...LEAD_SOURCE_OPTIONS],
          },
          {
            id: "interestedService",
            value: serviceFilter,
            onChange: setServiceFilter,
            ariaLabel: "Filter Interested Service",
            options: serviceFilterOptions,
          },
          {
            id: "salesOwner",
            value: ownerFilter,
            onChange: setOwnerFilter,
            ariaLabel: "Filter Sales Owner",
            options: [
              { value: "ALL", label: "All Sales Owner" },
              ...teamUsers.map((u: any) => ({ value: String(u.id), label: u.full_name || u.email })),
            ],
          },
        ]}
        viewOptions={[
          { id: "PIPELINE", label: "Pipeline", icon: Kanban },
          { id: "LIST", label: "List", icon: Table2 },
          { id: "INBOX", label: "Customer Inbox", icon: Inbox, badge: (data.conversations || []).length },
        ]}
        activeView={subView}
        onViewChange={(v) => setSubView(v as any)}
        rightActions={
          !readOnly &&
          subView !== "INBOX" && (
            <button
              type="button"
              onClick={openAddLead}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2649B3] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#1E3A8A]"
            >
              <Plus size={14} /> Add Lead
            </button>
          )
        }
      />

      {subView === "INBOX" ? (
        inboxSlot
      ) : subView === "PIPELINE" ? (
        <CRMKanbanBoard
          columns={kanbanColumns}
          canDrag={!readOnly}
          onMoveCard={(id, targetCol) => void handleMoveLeadStage(id, targetCol)}
          emptyColumnText="Belum ada Lead di tahap ini"
          renderCard={(lead) => (
            <div
              onClick={() => {
                setDrawerLead(lead);
                setDrawerTab("overview");
                setLinkingPartyId("");
              }}
              className="cursor-pointer space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2 pr-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 truncate">
                    <Building2 size={13} className="shrink-0 text-[#006BBC]" />
                    <span className="truncate">{lead.customer_name || "Calon Customer"}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-slate-600 line-clamp-2">
                    {lead.subject}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {lead._service && (
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#006BBC]">
                    {lead._service}
                  </span>
                )}
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {lead._source}
                </span>
                {lead._isConverted && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <CheckCircle2 size={10} /> Pipeline
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <CRMAvatarBadge name={lead._ownerName} size="xs" />
                <span className="text-[10px] text-slate-400">
                  {lead.created_at ? formatDate(lead.created_at) : "—"}
                </span>
              </div>
            </div>
          )}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          {filteredLeads.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">Tidak ada Lead yang sesuai filter.</p>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Lead / Subject</th>
                    <th className="px-4 py-3">Company &amp; Contact</th>
                    <th className="px-4 py-3">Lead Source</th>
                    <th className="px-4 py-3">Interested Service</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Sales Owner</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((l: any) => (
                    <tr
                      key={l.id}
                      onClick={() => {
                        setDrawerLead(l);
                        setDrawerTab("overview");
                        setLinkingPartyId("");
                      }}
                      className="cursor-pointer hover:bg-[#EBF5FF]/45"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{l.subject}</div>
                        <div className="text-[11px] text-slate-400">{l.inquiry_number || String(l.id).slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{l.customer_name}</div>
                        <div className="text-[11px] text-slate-500">{[l.customer_email, l.customer_phone].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{l._source}</td>
                      <td className="px-4 py-3 text-slate-600">{l._service || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {LEAD_COLUMNS.find((c) => c.id === l._bucket)?.title || l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3"><CRMAvatarBadge name={l._ownerName} size="xs" /></td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {!readOnly && !l._isConverted && (
                            <button
                              type="button"
                              onClick={() => openEditLead(l)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                          )}
                          {!readOnly && !l._isConverted && l.customer_party_id && (
                            <button
                              type="button"
                              onClick={() => void handleConvertToOpportunity(l)}
                              className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                            >
                              Convert
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Right Contextual Drawer: Lead Details */}
      <CRMRightDrawer
        isOpen={Boolean(drawerLead)}
        onClose={() => setDrawerLead(null)}
        title={drawerLead?.customer_name || "Lead Details"}
        subtitle={drawerLead?.subject}
        badge={
          drawerLead && (
            <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-semibold text-[#006BBC]">
              {LEAD_COLUMNS.find((c) => c.id === drawerLead._bucket)?.title || drawerLead.status}
            </span>
          )
        }
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "activities", label: "Activities" },
          { id: "notes", label: "Notes" },
        ]}
        activeTab={drawerTab}
        onTabChange={(t) => setDrawerTab(t as any)}
        footer={
          drawerLead && (
            <>
              {!readOnly && canDelete && !drawerLead._isConverted && (
                <button
                  type="button"
                  onClick={() => void handleDeleteLead(drawerLead)}
                  className="mr-auto inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  <Trash2 size={13} /> Hapus
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    const target = drawerLead;
                    setDrawerLead(null);
                    openEditLead(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Pencil size={13} /> Edit Lead
                </button>
              )}
              {!readOnly && !drawerLead._isConverted && (
                <button
                  type="button"
                  disabled={isQualifying}
                  onClick={() => void handleConvertToOpportunity(drawerLead)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2649B3] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
                >
                  <ArrowRight size={13} /> {isQualifying ? "Mengkonversi..." : "Convert to Opportunity"}
                </button>
              )}
            </>
          )
        }
      >
        {drawerLead && drawerTab === "overview" && (
          <div className="space-y-4 text-xs">
            {/* Quick Stage Switcher */}
            {!readOnly && !drawerLead._isConverted && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 font-semibold text-slate-700">Pindahkan Tahap Lead</div>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_COLUMNS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => void handleMoveLeadStage(String(drawerLead.id), col.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition",
                        drawerLead._bucket === col.id
                          ? "border-[#2649B3] bg-[#2649B3] text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {col.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Company Details */}
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Building2 size={14} className="text-[#006BBC]" /> Company Details
                </span>
                {drawerLead._party && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Terhubung: {drawerLead._party.party_type}
                  </span>
                )}
              </div>
              <div className="text-slate-700 font-semibold">
                {drawerLead._party?.display_name || drawerLead._party?.legal_name || drawerLead.customer_name}
              </div>
              {!drawerLead.customer_party_id && !readOnly && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 space-y-2">
                  <div className="text-[11px] font-medium text-amber-900">
                    Hubungkan ke Customer / Prospect sebelum Convert to Opportunity:
                  </div>
                  <div className="flex gap-1.5">
                    <select
                      className="input flex-1 text-xs bg-white"
                      value={linkingPartyId}
                      onChange={(e) => setLinkingPartyId(e.target.value)}
                    >
                      <option value="">-- Pilih Customer / Prospect --</option>
                      {(data.parties || [])
                        .filter((p: any) => ["CUSTOMER", "PROSPECT"].includes(String(p.party_type || "").toUpperCase()) && p.status === "ACTIVE")
                        .map((p: any) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.display_name || p.legal_name} ({p.party_type})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!linkingPartyId}
                      onClick={() => void handleLinkCustomerInDrawer()}
                      className="rounded-lg bg-[#2649B3] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Tautkan
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Contact Person (Primary) */}
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1.5">
              <div className="font-bold text-slate-800">Contact Person (Primary)</div>
              <div className="flex items-center gap-2 text-slate-600"><Mail size={12} /> {drawerLead.customer_email || "—"}</div>
              <div className="flex items-center gap-2 text-slate-600"><Phone size={12} /> {drawerLead.customer_phone || "—"}</div>
            </div>

            {/* Lead Information */}
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Lead Information</span>
                {canDelegate && onOpenDelegate && (
                  <button
                    type="button"
                    onClick={() => {
                      const rec = drawerLead;
                      setDrawerLead(null);
                      onOpenDelegate(rec, "INQUIRY");
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#006BBC] hover:underline"
                  >
                    <UserPlus size={12} /> Delegasi PIC
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div><div className="text-slate-400">Inquiry Number</div><div className="font-semibold text-slate-800">{drawerLead.inquiry_number || "—"}</div></div>
                <div><div className="text-slate-400">Lead Source</div><div className="font-semibold text-slate-800">{drawerLead._source}</div></div>
                <div><div className="text-slate-400">Interested Service</div><div className="font-semibold text-slate-800">{drawerLead._service || "—"}</div></div>
                <div><div className="text-slate-400">Sales Owner</div><div className="mt-0.5"><CRMAvatarBadge name={drawerLead._ownerName} size="xs" /></div></div>
              </div>
              {drawerLead.origin_domain && (
                <div className="pt-1 flex items-center gap-1.5 text-[11px] text-sky-700">
                  <Globe2 size={12} /> Origin Domain: {drawerLead.origin_domain}
                </div>
              )}
            </div>
          </div>
        )}

        {drawerLead && drawerTab === "activities" && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-semibold text-slate-700">Terakhir Dihubungi</div>
              <div className="mt-1 text-slate-600">{drawerLead.last_contacted_at ? formatDate(drawerLead.last_contacted_at) : "Belum ada catatan kontak"}</div>
              {drawerLead.last_contact_note && <p className="mt-1 text-slate-700">{drawerLead.last_contact_note}</p>}
            </div>
            {drawerLead.next_follow_up_at && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                Jadwal Follow-Up: <b>{formatDate(drawerLead.next_follow_up_at)}</b>
              </div>
            )}
          </div>
        )}

        {drawerLead && drawerTab === "notes" && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="font-semibold text-slate-700 mb-1">Deskripsi Kebutuhan</div>
              <p className="text-slate-600 whitespace-pre-wrap">{drawerLead.description || "Belum ada deskripsi."}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="font-semibold text-slate-700 mb-1">Catatan Internal</div>
              <p className="text-slate-600 whitespace-pre-wrap">{drawerLead.notes || drawerLead.last_contact_note || "Belum ada catatan tambahan."}</p>
            </div>
          </div>
        )}
      </CRMRightDrawer>

      {/* Add / Edit Lead Modal */}
      <Modal
        isOpen={isLeadModalOpen}
        onClose={() => !savingLead && setIsLeadModalOpen(false)}
        title={editingLead ? "Edit Lead" : "Add New Lead"}
        size="md"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 text-xs">
          <label className="font-medium text-slate-600 sm:col-span-2">
            Subject / Kebutuhan *
            <input className="input mt-1 w-full" value={leadForm.subject} onChange={(e) => setLeadForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Contoh: Pengadaan Event Annual Gathering 2026" />
          </label>
          <label className="font-medium text-slate-600 sm:col-span-2">
            Nama Perusahaan / Customer *
            <input className="input mt-1 w-full" value={leadForm.customer_name} onChange={(e) => setLeadForm((f) => ({ ...f, customer_name: e.target.value }))} placeholder="PT / Instansi / Nama Klien" />
          </label>
          {!editingLead && (
            <label className="font-medium text-slate-600 sm:col-span-2">
              Tautkan Perusahaan (Opsional)
              <select
                className="input mt-1 w-full bg-white"
                value={leadForm.customer_party}
                onChange={(e) => {
                  const pid = e.target.value;
                  const p = partyById.get(pid);
                  setLeadForm((f) => ({
                    ...f,
                    customer_party: pid,
                    customer_name: p ? p.display_name || p.legal_name : f.customer_name,
                  }));
                }}
              >
                <option value="">-- Input Manual / Belum Terdaftar --</option>
                {(data.parties || [])
                  .filter((p: any) => ["CUSTOMER", "PROSPECT"].includes(String(p.party_type || "").toUpperCase()) && p.status === "ACTIVE")
                  .map((p: any) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.display_name || p.legal_name} ({p.party_type})
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="font-medium text-slate-600">
            Lead Source
            <select className="input mt-1 w-full bg-white" value={leadForm.lead_source} onChange={(e) => setLeadForm((f) => ({ ...f, lead_source: e.target.value }))}>
              {LEAD_SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Interested Service
            <select className="input mt-1 w-full bg-white" value={leadForm.interested_service} onChange={(e) => setLeadForm((f) => ({ ...f, interested_service: e.target.value }))}>
              <option value="">-- Pilih Layanan --</option>
              {SERVICE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Email Kontak
            <input type="email" className="input mt-1 w-full" value={leadForm.customer_email} onChange={(e) => setLeadForm((f) => ({ ...f, customer_email: e.target.value }))} placeholder="email@perusahaan.com" />
          </label>
          <label className="font-medium text-slate-600">
            Nomor Telepon
            <input type="tel" className="input mt-1 w-full" value={leadForm.customer_phone} onChange={(e) => setLeadForm((f) => ({ ...f, customer_phone: e.target.value }))} placeholder="+62 812 ..." />
          </label>
          <label className="font-medium text-slate-600 sm:col-span-2">
            Deskripsi Kebutuhan
            <textarea className="input mt-1 w-full min-h-20" value={leadForm.description} onChange={(e) => setLeadForm((f) => ({ ...f, description: e.target.value }))} placeholder="Rincian kebutuhan proyek/event..." />
          </label>
          <label className="font-medium text-slate-600 sm:col-span-2">
            Notes
            <textarea className="input mt-1 w-full min-h-16" value={leadForm.notes} onChange={(e) => setLeadForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Catatan internal sales..." />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsLeadModalOpen(false)} disabled={savingLead} className="btn-ghost">Batal</button>
            <button type="button" onClick={() => void handleSaveLead()} disabled={savingLead} className="rounded-lg bg-[#2649B3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]">
              {savingLead ? "Menyimpan..." : editingLead ? "Simpan Perubahan" : "Simpan Lead"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}



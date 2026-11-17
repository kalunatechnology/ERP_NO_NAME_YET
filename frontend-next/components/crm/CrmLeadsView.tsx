"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  FileText, Plus, Kanban, Table2, Inbox, ArrowRight,
  Building2, Award,
  CheckCircle2, Clock, XCircle, Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  CRMData,
  createCustomerInquiry,
  deleteCustomerInquiry,
  parseStageMetadata,
  qualifyInquiry,
  serializeStageMetadata,
  updateCRMInquiryLeadStatus,
  updateCustomerInquiry,
} from "@/lib/api/crm.api";
import { formatDate } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import {
  CRMAvatarBadge,
  CRMFilterBar,
  CRMKanbanBoard,
  CRMKanbanColumn,
  CRMKpiItem,
  CRMKpiRow,
  CRMTone,
} from "./CrmDesignSystem";
import { LeadStagePopupModal } from "./CrmStagePopupCard";

const LEAD_COLUMNS: Array<{ id: string; title: string; tone: CRMTone }> = [
  { id: "NEW", title: "New Lead", tone: "blue" },
  { id: "CONTACTED", title: "Contacted", tone: "purple" },
  { id: "FOLLOW_UP", title: "Waiting Response", tone: "amber" },
  { id: "RESPONDED", title: "Responded", tone: "pink" },
  { id: "INTERESTED", title: "Interested", tone: "green" },
  { id: "UNQUALIFIED", title: "Not Interested", tone: "red" },
  { id: "UNREACHABLE", title: "Unreachable", tone: "slate" },
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
  if (s === "WAITING" || s === "WAITING_RESPONSE") return "FOLLOW_UP";
  if (s === "QUALIFIED") return "INTERESTED";
  if (["CLOSED_LOST", "REJECTED", "NOT_INTERESTED", "UNQUALIFIED"].includes(s)) return "UNQUALIFIED";
  if (["NEW", "CONTACTED", "FOLLOW_UP", "RESPONDED", "INTERESTED", "UNREACHABLE"].includes(s)) return s;
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
  canEditAll: _canEditAll = false,
  canDelete = false,
  currentUserId: _currentUserId,
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
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [optimisticBuckets, setOptimisticBuckets] = useState<Record<string, string>>({});
  const [pendingLeadIds, setPendingLeadIds] = useState<Set<string>>(() => new Set());
  const latestLeadSeqRef = useRef<Record<string, number>>({});
  const [columnOrder, setColumnOrder] = useState<Record<string, string[]>>({});

  // Popup state
  const [drawerLead, setDrawerLead] = useState<any | null>(null);
  const [isQualifying, setIsQualifying] = useState(false);

  // Add / Edit Lead Modal
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [savingLead, setSavingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    brand_id: "",
    subject: "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    customer_party: "",
    contact_id: "",
    contact_name: "",
    job_title: "",
    industry: "",
    website: "",
    address: "",
    next_follow_up_at: "",
    auto_create_company: true,
    lead_source: "MANUAL",
    interested_service: "",
    description: "",
    notes: "",
    status: "NEW",
    owner_user_id: "",
    contact_date: "",
    contact_method: "WhatsApp",
    introduction_sent: "Company Profile",
    contact_notes: "",
    follow_up_notes: "",
    response_summary: "",
    client_feedback: "",
    potential_service: "",
    next_action: "",
    estimated_timeline: "",
    meeting_schedule: "",
    initial_brief_file: "",
    potential_project_notes: "",
    reason_not_interested: "",
    number_of_attempts: "1",
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
  const contactById = useMemo(
    () => new Map((data.contacts || []).map((c: any) => [String(c.id), c])),
    [data.contacts]
  );
  const brandById = useMemo(
    () => new Map((data.brands || []).map((b: any) => [String(b.id), b])),
    [data.brands]
  );

  const enrichedLeads = useMemo(() => {
    return (data.inquiries || []).map((inq: any) => {
      const serverBucket = normalizeLeadBucket(inq.status);
      const bucket = optimisticBuckets[String(inq.id)] || serverBucket;
      const linkedOpp = inq.opportunity_id ? oppById.get(String(inq.opportunity_id)) : null;
      const party = inq.customer_party_id ? partyById.get(String(inq.customer_party_id)) : null;
      const contact = inq.contact_id ? contactById.get(String(inq.contact_id)) : null;
      const brandObj = inq.brand_id ? brandById.get(String(inq.brand_id)) : null;
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
        _brandId: inq.brand_id ? String(inq.brand_id) : "",
        _brandName: brandObj ? `${brandObj.brand_code} · ${brandObj.brand_name}` : "",
        _source: source,
        _service: service,
        _ownerId: ownerId,
        _ownerName: ownerUser?.full_name || ownerUser?.email || "Unassigned",
        _party: party,
        _contact: contact,
        _linkedOpp: linkedOpp,
        _isConverted: isConverted,
        _isWon: isWon,
      };
    });
  }, [data.inquiries, oppById, partyById, contactById, brandById, userById, optimisticBuckets]);

  const kpiItems: CRMKpiItem[] = useMemo(() => {
    const total = enrichedLeads.length;
    const active = enrichedLeads.filter((l) => l._bucket !== "UNQUALIFIED" && !l._isConverted).length;
    const interested = enrichedLeads.filter((l) => l._bucket === "INTERESTED" || l._bucket === "RESPONDED").length;
    const converted = enrichedLeads.filter((l) => l._isConverted).length;
    const won = enrichedLeads.filter((l) => l._isWon).length;
    const notInterested = enrichedLeads.filter((l) => l._bucket === "UNQUALIFIED").length;

    return [
      { id: "ALL", label: "Total Leads", value: total, tone: "blue", icon: FileText, active: statusFilter === "ALL", onClick: () => setStatusFilter("ALL") },
      { id: "ACTIVE", label: "Active Leads", value: active, tone: "purple", icon: Clock, active: statusFilter === "ACTIVE", onClick: () => setStatusFilter(statusFilter === "ACTIVE" ? "ALL" : "ACTIVE") },
      { id: "INTERESTED", label: "Interested", value: interested, tone: "amber", icon: Sparkles, active: statusFilter === "INTERESTED", onClick: () => setStatusFilter(statusFilter === "INTERESTED" ? "ALL" : "INTERESTED") },
      { id: "CONVERTED", label: "Converted to Pipeline", value: converted, tone: "pink", icon: ArrowRight, active: statusFilter === "CONVERTED", onClick: () => setStatusFilter(statusFilter === "CONVERTED" ? "ALL" : "CONVERTED") },
      { id: "WON", label: "Won (from Leads)", value: won, tone: "green", icon: Award, active: statusFilter === "WON", onClick: () => setStatusFilter(statusFilter === "WON" ? "ALL" : "WON") },
      { id: "UNQUALIFIED", label: "Not Interested", value: notInterested, tone: "red", icon: XCircle, active: statusFilter === "UNQUALIFIED", onClick: () => setStatusFilter(statusFilter === "UNQUALIFIED" ? "ALL" : "UNQUALIFIED") },
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
      if (brandFilter !== "ALL" && l._brandId !== brandFilter) return false;
      if (sourceFilter !== "ALL" && l._source !== sourceFilter) return false;
      if (serviceFilter !== "ALL" && l._service !== serviceFilter) return false;
      if (ownerFilter !== "ALL" && l._ownerId !== ownerFilter) return false;
      if (statusFilter === "ACTIVE" && (l._bucket === "UNQUALIFIED" || l._isConverted)) return false;
      if (statusFilter === "INTERESTED" && l._bucket !== "INTERESTED" && l._bucket !== "RESPONDED") return false;
      if (statusFilter === "CONVERTED" && !l._isConverted) return false;
      if (statusFilter === "WON" && !l._isWon) return false;
      if (statusFilter === "UNQUALIFIED" && l._bucket !== "UNQUALIFIED") return false;
      if (!q) return true;
      return [l.customer_name, l.subject, l.inquiry_number, l._service, l._brandName, l.customer_email, l.customer_phone, l.description]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [enrichedLeads, brandFilter, sourceFilter, serviceFilter, ownerFilter, statusFilter, search]);

  const kanbanColumns: CRMKanbanColumn<any>[] = useMemo(() => {
    return LEAD_COLUMNS.map((col) => {
      const rawItems = filteredLeads.filter((l) => l._bucket === col.id);
      const order = columnOrder[col.id];
      const items = order && order.length > 0
        ? [...rawItems].sort((a, b) => {
            const ia = order.indexOf(String(a.id));
            const ib = order.indexOf(String(b.id));
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          })
        : rawItems;
      return {
        id: col.id,
        title: col.title,
        tone: col.tone,
        items,
      };
    });
  }, [filteredLeads, columnOrder]);

  const applyLeadOrder = (idKey: string, sourceCol: string, targetCol: string, targetIndex?: number) => {
    setColumnOrder((prev) => {
      const next = { ...prev };
      const getIds = (colId: string) =>
        next[colId] ?? filteredLeads.filter((l) => l._bucket === colId).map((l) => String(l.id));

      const sourceIds = getIds(sourceCol).filter((id) => id !== idKey);
      next[sourceCol] = sourceIds;

      const targetIds = sourceCol === targetCol ? [...sourceIds] : getIds(targetCol).filter((id) => id !== idKey);
      const insertAt =
        typeof targetIndex === "number"
          ? Math.max(0, Math.min(targetIndex, targetIds.length))
          : targetIds.length;
      targetIds.splice(insertAt, 0, idKey);
      next[targetCol] = targetIds;
      return next;
    });
  };

  const handleMoveLeadStage = async (leadId: string, targetBucket: string, targetIndex?: number) => {
    const idKey = String(leadId);
    const lead = enrichedLeads.find((l) => String(l.id) === idKey);
    if (!lead) return;
    if (lead._isConverted) {
      toast.error("Lead yang sudah dikonversi menjadi Opportunity tidak dapat dipindahkan.");
      return;
    }

    // Same-column reorder (instant, no API call)
    if (lead._bucket === targetBucket) {
      applyLeadOrder(idKey, lead._bucket, targetBucket, targetIndex);
      return;
    }

    const prevBucket = lead._bucket;
    const seq = (latestLeadSeqRef.current[idKey] || 0) + 1;
    latestLeadSeqRef.current[idKey] = seq;

    // Immediate Optimistic UI update + exact drop position
    applyLeadOrder(idKey, prevBucket, targetBucket, targetIndex);
    setOptimisticBuckets((prev) => ({ ...prev, [idKey]: targetBucket }));
    setPendingLeadIds((prev) => {
      const next = new Set(prev);
      next.add(idKey);
      return next;
    });

    try {
      await updateCRMInquiryLeadStatus(leadId, {
        status: targetBucket as any,
        note: `Status diperbarui ke ${LEAD_COLUMNS.find((c) => c.id === targetBucket)?.title || targetBucket}`,
      });
      if (latestLeadSeqRef.current[idKey] === seq) {
        toast.success(`Lead dipindahkan ke ${LEAD_COLUMNS.find((c) => c.id === targetBucket)?.title || targetBucket}.`);
      }
    } catch (err: any) {
      if (latestLeadSeqRef.current[idKey] === seq) {
        setOptimisticBuckets((prev) => ({ ...prev, [idKey]: prevBucket }));
        applyLeadOrder(idKey, targetBucket, prevBucket);
        toast.error(err?.response?.data?.detail || err?.response?.data?.error?.message || "Gagal memperbarui status Lead. Posisi dikembalikan.");
      }
    } finally {
      if (latestLeadSeqRef.current[idKey] === seq) {
        setPendingLeadIds((prev) => {
          const next = new Set(prev);
          next.delete(idKey);
          return next;
        });
      }
    }
  };

  const openAddLead = () => {
    setEditingLead(null);
    setLeadForm({
      brand_id: brandFilter !== "ALL" ? brandFilter : "",
      subject: "",
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      customer_party: "",
      contact_id: "",
      contact_name: "",
      job_title: "",
      industry: "",
      website: "",
      address: "",
      next_follow_up_at: "",
      auto_create_company: true,
      lead_source: "MANUAL",
      interested_service: "",
      description: "",
      notes: "",
      status: "NEW",
      owner_user_id: _currentUserId || "",
      contact_date: "",
      contact_method: "WhatsApp",
      introduction_sent: "Company Profile",
      contact_notes: "",
      follow_up_notes: "",
      response_summary: "",
      client_feedback: "",
      potential_service: "",
      next_action: "",
      estimated_timeline: "",
      meeting_schedule: "",
      initial_brief_file: "",
      potential_project_notes: "",
      reason_not_interested: "",
      number_of_attempts: "1",
    });
    setIsLeadModalOpen(true);
  };

  const openEditLead = (lead: any) => {
    setEditingLead(lead);
    const parsedMeta = parseStageMetadata(lead.notes);
    setLeadForm({
      brand_id: lead.brand_id ? String(lead.brand_id) : "",
      subject: lead.subject || "",
      customer_name: lead.customer_name || "",
      customer_email: lead.customer_email || "",
      customer_phone: lead.customer_phone || "",
      customer_party: lead.customer_party_id ? String(lead.customer_party_id) : "",
      contact_id: lead.contact_id ? String(lead.contact_id) : "",
      contact_name: lead._contact?.contact_name || "",
      job_title: lead._contact?.job_title || "",
      industry: lead._party?.industry || "",
      website: lead._party?.website || "",
      address: lead._party?.city || "",
      next_follow_up_at: lead.next_follow_up_at ? String(lead.next_follow_up_at).slice(0, 10) : (parsedMeta.follow_up_date || ""),
      auto_create_company: false,
      lead_source: lead.lead_source || lead.source_channel || "MANUAL",
      interested_service: lead.interested_service || "",
      description: lead.description || "",
      notes: parsedMeta.plain_notes || "",
      status: lead._bucket || "NEW",
      owner_user_id: lead._ownerId || "",
      contact_date: parsedMeta.contact_date || (lead.last_contacted_at ? String(lead.last_contacted_at).slice(0, 10) : ""),
      contact_method: parsedMeta.contact_method || "WhatsApp",
      introduction_sent: parsedMeta.introduction_sent || "Company Profile",
      contact_notes: parsedMeta.contact_notes || lead.last_contact_note || "",
      follow_up_notes: parsedMeta.follow_up_notes || lead.last_contact_note || "",
      response_summary: parsedMeta.response_summary || lead.description || "",
      client_feedback: parsedMeta.client_feedback || "",
      potential_service: parsedMeta.potential_service || lead.interested_service || "",
      next_action: parsedMeta.next_action || "",
      estimated_timeline: parsedMeta.estimated_timeline || "",
      meeting_schedule: parsedMeta.meeting_schedule || "",
      initial_brief_file: parsedMeta.initial_brief_file || "",
      potential_project_notes: parsedMeta.potential_project_notes || lead.description || "",
      reason_not_interested: parsedMeta.reason_not_interested || "",
      number_of_attempts: parsedMeta.number_of_attempts || "1",
    });
    setIsLeadModalOpen(true);
  };

  const handleSaveLead = async () => {
    if (!leadForm.subject.trim() || !leadForm.customer_name.trim()) {
      toast.error("Project Type / Kebutuhan dan Nama Perusahaan wajib diisi.");
      return;
    }
    if (!leadForm.customer_email.trim() && !leadForm.customer_phone.trim()) {
      toast.error("Isi minimal Email atau Nomor Telepon kontak.");
      return;
    }
    setSavingLead(true);
    try {
      const stagePayload = {
        plain_notes: leadForm.notes.trim(),
        follow_up_date: leadForm.next_follow_up_at || "",
        contact_date: leadForm.contact_date || "",
        contact_method: leadForm.contact_method || "",
        introduction_sent: leadForm.introduction_sent || "",
        contact_notes: leadForm.contact_notes.trim(),
        follow_up_notes: leadForm.follow_up_notes.trim(),
        response_summary: leadForm.response_summary.trim(),
        client_feedback: leadForm.client_feedback.trim(),
        potential_service: leadForm.potential_service.trim(),
        next_action: leadForm.next_action.trim(),
        estimated_timeline: leadForm.estimated_timeline.trim(),
        meeting_schedule: leadForm.meeting_schedule.trim(),
        initial_brief_file: leadForm.initial_brief_file.trim(),
        potential_project_notes: leadForm.potential_project_notes.trim(),
        reason_not_interested: leadForm.reason_not_interested.trim(),
        number_of_attempts: leadForm.number_of_attempts.trim(),
      };
      if (editingLead) {
        const existingMeta = parseStageMetadata(editingLead.notes);
        const serializedNotes = serializeStageMetadata({
          ...existingMeta,
          ...stagePayload,
        });
        await updateCustomerInquiry(editingLead.id, {
          brand_id: leadForm.brand_id || null,
          subject: leadForm.subject.trim(),
          customer_name: leadForm.customer_name.trim(),
          customer_email: leadForm.customer_email.trim(),
          customer_phone: leadForm.customer_phone.trim(),
          customer_party_id: editingLead._isConverted ? undefined : (leadForm.customer_party || null),
          contact_id: leadForm.contact_id || null,
          contact_name: leadForm.contact_name.trim(),
          job_title: leadForm.job_title.trim(),
          industry: leadForm.industry.trim(),
          website: leadForm.website.trim(),
          address: leadForm.address.trim(),
          owner_user_id: leadForm.owner_user_id || null,
          next_follow_up_at: leadForm.next_follow_up_at || null,
          last_contacted_at: leadForm.contact_date || null,
          last_contact_note: leadForm.contact_notes.trim() || leadForm.follow_up_notes.trim() || "",
          description: leadForm.description.trim() || leadForm.notes.trim(),
          lead_source: leadForm.lead_source,
          interested_service: leadForm.interested_service.trim() || null,
          notes: serializedNotes,
        });
        if (leadForm.status && leadForm.status !== editingLead._bucket && !editingLead._isConverted) {
          await updateCRMInquiryLeadStatus(editingLead.id, {
            status: leadForm.status as any,
            note: leadForm.contact_notes.trim() || leadForm.follow_up_notes.trim() || undefined,
          });
        }
        toast.success("Data Lead berhasil diperbarui.");
      } else {
        const serializedNotes = serializeStageMetadata(stagePayload);
        await createCustomerInquiry({
          brand_id: leadForm.brand_id || null,
          subject: leadForm.subject.trim(),
          customer_name: leadForm.customer_name.trim(),
          customer_email: leadForm.customer_email.trim(),
          customer_phone: leadForm.customer_phone.trim(),
          customer_party: leadForm.customer_party || null,
          contact_id: leadForm.contact_id || null,
          contact_name: leadForm.contact_name.trim(),
          job_title: leadForm.job_title.trim(),
          industry: leadForm.industry.trim(),
          website: leadForm.website.trim(),
          address: leadForm.address.trim(),
          owner_user_id: leadForm.owner_user_id || null,
          status: leadForm.status || "NEW",
          next_follow_up_at: leadForm.next_follow_up_at || null,
          last_contacted_at: leadForm.contact_date || null,
          last_contact_note: leadForm.contact_notes.trim() || leadForm.follow_up_notes.trim() || "",
          auto_create_company: !leadForm.customer_party && leadForm.auto_create_company,
          description: leadForm.description.trim() || leadForm.notes.trim(),
          lead_source: leadForm.lead_source,
          interested_service: leadForm.interested_service.trim() || null,
          notes: serializedNotes,
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
        searchPlaceholder="Cari perusahaan, PIC, brand, atau layanan..."
        filters={[
          {
            id: "brand",
            value: brandFilter,
            onChange: setBrandFilter,
            ariaLabel: "Filter Brand",
            options: [
              { value: "ALL", label: "All Brands" },
              ...(data.brands || []).map((b: any) => ({
                value: String(b.id),
                label: `${b.brand_code} — ${b.brand_name}`,
              })),
            ],
          },
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
        ]}
        activeView={subView}
        onViewChange={(v) => setSubView(v as any)}
        rightActions={
          !readOnly &&
          subView !== "INBOX" && (
            <button
              type="button"
              onClick={openAddLead}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#163D64] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#163D64]"
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
          pendingIds={pendingLeadIds}
          emptyColumnText="Belum ada Lead di tahap ini"
          renderCard={(lead) => (
            <div
              onClick={() => {
                setDrawerLead(lead);
              }}
              className="cursor-pointer space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2 pr-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-900 truncate">
                    <Building2 size={14} className="shrink-0 text-[#0876CD]" />
                    <span className="truncate">{lead.customer_name || "Calon Customer"}</span>
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-slate-500 line-clamp-2 leading-snug">
                    {lead.subject}
                  </div>
                </div>
              </div>

              {(lead._brandName || lead._service || lead._isConverted) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {lead._brandName && (
                    <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                      {lead._brandName}
                    </span>
                  )}
                  {lead._service && (
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#0876CD]">
                      {lead._service}
                    </span>
                  )}
                  {lead._isConverted && (
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <CheckCircle2 size={10} /> Pipeline
                    </span>
                  )}
                </div>
              )}

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

      {/* Lead Stage Popup Modal (Sesuai SVG Marka) */}
      <LeadStagePopupModal
        lead={drawerLead ? (enrichedLeads.find((l) => String(l.id) === String(drawerLead.id)) || drawerLead) : null}
        data={data}
        isOpen={Boolean(drawerLead)}
        onClose={() => setDrawerLead(null)}
        onMoveStage={(leadId, targetBucket) => void handleMoveLeadStage(leadId, targetBucket)}
        onConvert={(lead) => void handleConvertToOpportunity(lead)}
        onDelete={(lead) => void handleDeleteLead(lead)}
        onOpenEditModal={(lead) => openEditLead(lead)}
        onOpenDelegate={onOpenDelegate}
        onRefresh={onRefresh}
        canDelete={canDelete}
        canDelegate={canDelegate}
        readOnly={readOnly}
        isQualifying={isQualifying}
      />

      {/* Add / Edit Lead Modal (Sesuai Struktur Card - New Lead.svg) */}
      <Modal
        isOpen={isLeadModalOpen}
        onClose={() => !savingLead && setIsLeadModalOpen(false)}
        title={editingLead ? "Edit Lead" : "New Lead"}
        size="lg"
      >
        <div className="space-y-4 p-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Company Details */}
            <div className="rounded-2xl border border-slate-200 p-3.5 space-y-2.5">
              <div className="font-bold text-sm text-[#163D64]">Company Details</div>
              <label className="block font-medium text-slate-600">
                Pilih Master Company (Opsional)
                <select
                  className="input mt-1 w-full bg-white disabled:bg-slate-100"
                  disabled={Boolean(editingLead?._isConverted)}
                  value={leadForm.customer_party}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const p = partyById.get(pid);
                    const primaryContact = pid
                      ? ((data.contacts || []).find((c: any) => String(c.party_id) === pid && c.primary_contact) ||
                         (data.contacts || []).find((c: any) => String(c.party_id) === pid))
                      : null;
                    setLeadForm((f) => ({
                      ...f,
                      customer_party: pid,
                      contact_id: primaryContact ? String(primaryContact.id) : "",
                      customer_name: p ? p.display_name || p.legal_name : f.customer_name,
                      industry: p?.industry || f.industry,
                      website: p?.website || f.website,
                      address: p?.city || f.address,
                      contact_name: primaryContact?.contact_name || f.contact_name,
                      job_title: primaryContact?.job_title || f.job_title,
                      customer_email: primaryContact?.email || f.customer_email,
                      customer_phone: primaryContact?.phone || f.customer_phone,
                    }));
                  }}
                >
                  <option value="">-- Input Perusahaan Baru --</option>
                  {(data.parties || [])
                    .filter((p: any) => ["CUSTOMER", "PROSPECT"].includes(String(p.party_type || "").toUpperCase()) && p.status === "ACTIVE")
                    .map((p: any) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.display_name || p.legal_name} ({p.party_type})
                      </option>
                    ))}
                </select>
              </label>
              <label className="block font-medium text-slate-600">
                Company *
                <input className="input mt-1 w-full" value={leadForm.customer_name} onChange={(e) => setLeadForm((f) => ({ ...f, customer_name: e.target.value }))} placeholder="Contoh: PT Danacipta" />
              </label>
              <label className="block font-medium text-slate-600">
                Industry
                <input className="input mt-1 w-full" value={leadForm.industry} onChange={(e) => setLeadForm((f) => ({ ...f, industry: e.target.value }))} placeholder="Contoh: Venture Capital" />
              </label>
              <label className="block font-medium text-slate-600">
                Website
                <input className="input mt-1 w-full" value={leadForm.website} onChange={(e) => setLeadForm((f) => ({ ...f, website: e.target.value }))} placeholder="Contoh: www.danacipta.co.id" />
              </label>
              <label className="block font-medium text-slate-600">
                Address
                <input className="input mt-1 w-full" value={leadForm.address} onChange={(e) => setLeadForm((f) => ({ ...f, address: e.target.value }))} placeholder="Contoh: Batam, Indonesia" />
              </label>
              {!editingLead && !leadForm.customer_party && (
                <label className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[11px] font-medium text-[#163D64] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={leadForm.auto_create_company}
                    onChange={(e) => setLeadForm((f) => ({ ...f, auto_create_company: e.target.checked }))}
                    className="rounded border-slate-300 text-[#0868B5]"
                  />
                  Simpan otomatis ke Master Company &amp; Contact
                </label>
              )}
            </div>

            {/* Contact Person */}
            <div className="rounded-2xl border border-slate-200 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#163D64]">Contact Person</span>
                <span className="rounded-full bg-[#EDF6FE] px-2.5 py-0.5 text-[10px] font-semibold text-[#0876CD]">Primary</span>
              </div>
              {leadForm.customer_party && (
                <label className="block font-medium text-slate-600">
                  Pilih Contact Terdaftar
                  <select
                    className="input mt-1 w-full bg-white"
                    value={leadForm.contact_id}
                    onChange={(e) => {
                      const cid = e.target.value;
                      const ct = contactById.get(cid);
                      setLeadForm((f) => ({
                        ...f,
                        contact_id: cid,
                        contact_name: ct?.contact_name || f.contact_name,
                        job_title: ct?.job_title || f.job_title,
                        customer_email: ct?.email || f.customer_email,
                        customer_phone: ct?.phone || f.customer_phone,
                      }));
                    }}
                  >
                    <option value="">-- Input PIC Baru / Manual --</option>
                    {(data.contacts || [])
                      .filter((c: any) => String(c.party_id) === leadForm.customer_party)
                      .map((c: any) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.contact_name}{c.job_title ? ` · ${c.job_title}` : ""}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className="block font-medium text-slate-600">
                Contact Name
                <input className="input mt-1 w-full" value={leadForm.contact_name} onChange={(e) => setLeadForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Contoh: Kevin" />
              </label>
              <label className="block font-medium text-slate-600">
                Job Title / Role
                <input className="input mt-1 w-full" value={leadForm.job_title} onChange={(e) => setLeadForm((f) => ({ ...f, job_title: e.target.value }))} placeholder="Contoh: Regional Manager" />
              </label>
              <label className="block font-medium text-slate-600">
                Phone / WhatsApp *
                <input type="tel" className="input mt-1 w-full" value={leadForm.customer_phone} onChange={(e) => setLeadForm((f) => ({ ...f, customer_phone: e.target.value }))} placeholder="+62 812 - 3456 - 7890" />
              </label>
              <label className="block font-medium text-slate-600">
                Email *
                <input type="email" className="input mt-1 w-full" value={leadForm.customer_email} onChange={(e) => setLeadForm((f) => ({ ...f, customer_email: e.target.value }))} placeholder="kevin@danacipta.co.id" />
              </label>
            </div>
          </div>

          {/* Lead Information */}
          <div className="rounded-2xl border border-slate-200 p-3.5 space-y-3">
            <div className="font-bold text-sm text-[#163D64]">Lead Information</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="font-medium text-slate-600">
                Brand / Unit Bisnis
                <select
                  className="input mt-1 w-full bg-white"
                  value={leadForm.brand_id}
                  onChange={(e) => setLeadForm((f) => ({ ...f, brand_id: e.target.value }))}
                >
                  <option value="">-- Pilih Brand --</option>
                  {(data.brands || []).map((b: any) => (
                    <option key={b.id} value={String(b.id)}>
                      [{b.brand_code}] {b.brand_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="font-medium text-slate-600">
                Project Type / Jenis Kebutuhan *
                <input className="input mt-1 w-full" value={leadForm.subject} onChange={(e) => setLeadForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Contoh: Booth Exhibition" />
              </label>
              <label className="font-medium text-slate-600">
                Stage Lead
                <select
                  className="input mt-1 w-full bg-white disabled:bg-slate-100"
                  disabled={Boolean(editingLead?._isConverted)}
                  value={leadForm.status}
                  onChange={(e) => setLeadForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {LEAD_COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>{col.title}</option>
                  ))}
                </select>
              </label>
              <label className="font-medium text-slate-600">
                Source
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
                Assigned Sales
                <select className="input mt-1 w-full bg-white" value={leadForm.owner_user_id} onChange={(e) => setLeadForm((f) => ({ ...f, owner_user_id: e.target.value }))}>
                  <option value="">-- Default (Pembuat Lead) --</option>
                  {teamUsers.map((u: any) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.full_name || u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="font-medium text-slate-600">
                Follow Up Date
                <input type="date" className="input mt-1 w-full" value={leadForm.next_follow_up_at} onChange={(e) => setLeadForm((f) => ({ ...f, next_follow_up_at: e.target.value }))} />
              </label>
              <label className="font-medium text-slate-600 sm:col-span-2">
                Deskripsi / Notes
                <textarea className="input mt-1 w-full min-h-16" value={leadForm.notes} onChange={(e) => setLeadForm((f) => ({ ...f, notes: e.target.value, description: e.target.value }))} placeholder="Catatan kebutuhan klien..." />
              </label>
            </div>
          </div>

          {/* Stage-Specific Details (Sesuai Kartu Popup Stage Marka) */}
          {leadForm.status !== "NEW" && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-3.5 space-y-3">
              <div className="font-bold text-sm text-[#163D64]">
                Detail Tahap: {LEAD_COLUMNS.find((c) => c.id === leadForm.status)?.title || leadForm.status}
              </div>
              {leadForm.status === "CONTACTED" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="font-medium text-slate-600">
                    Contact Date
                    <input type="date" className="input mt-1 w-full bg-white" value={leadForm.contact_date} onChange={(e) => setLeadForm((f) => ({ ...f, contact_date: e.target.value }))} />
                  </label>
                  <label className="font-medium text-slate-600">
                    Contact Method
                    <input className="input mt-1 w-full bg-white" value={leadForm.contact_method} onChange={(e) => setLeadForm((f) => ({ ...f, contact_method: e.target.value }))} placeholder="WhatsApp / Email / Call" />
                  </label>
                  <label className="font-medium text-slate-600">
                    Introduction Sent
                    <input className="input mt-1 w-full bg-white" value={leadForm.introduction_sent} onChange={(e) => setLeadForm((f) => ({ ...f, introduction_sent: e.target.value }))} placeholder="Company Profile / Deck" />
                  </label>
                  <label className="font-medium text-slate-600">
                    Contact Notes
                    <input className="input mt-1 w-full bg-white" value={leadForm.contact_notes} onChange={(e) => setLeadForm((f) => ({ ...f, contact_notes: e.target.value }))} placeholder="Ringkasan kontak..." />
                  </label>
                </div>
              )}
              {leadForm.status === "FOLLOW_UP" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="font-medium text-slate-600">
                    Last Contact Date
                    <input type="date" className="input mt-1 w-full bg-white" value={leadForm.contact_date} onChange={(e) => setLeadForm((f) => ({ ...f, contact_date: e.target.value }))} />
                  </label>
                  <label className="font-medium text-slate-600">
                    Contact Method
                    <input className="input mt-1 w-full bg-white" value={leadForm.contact_method} onChange={(e) => setLeadForm((f) => ({ ...f, contact_method: e.target.value }))} placeholder="WhatsApp / Email" />
                  </label>
                  <label className="font-medium text-slate-600">
                    Introduction Sent
                    <input className="input mt-1 w-full bg-white" value={leadForm.introduction_sent} onChange={(e) => setLeadForm((f) => ({ ...f, introduction_sent: e.target.value }))} placeholder="Company Profile" />
                  </label>
                  <label className="font-medium text-slate-600">
                    Follow-Up Notes
                    <input className="input mt-1 w-full bg-white" value={leadForm.follow_up_notes} onChange={(e) => setLeadForm((f) => ({ ...f, follow_up_notes: e.target.value }))} placeholder="Catatan tindak lanjut..." />
                  </label>
                </div>
              )}
              {leadForm.status === "RESPONDED" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="font-medium text-slate-600 sm:col-span-2">
                    Response Summary
                    <textarea className="input mt-1 w-full bg-white min-h-14" value={leadForm.response_summary} onChange={(e) => setLeadForm((f) => ({ ...f, response_summary: e.target.value }))} placeholder="Ringkasan respon klien..." />
                  </label>
                  <label className="font-medium text-slate-600">
                    Client Feedback
                    <input className="input mt-1 w-full bg-white" value={leadForm.client_feedback} onChange={(e) => setLeadForm((f) => ({ ...f, client_feedback: e.target.value }))} placeholder="Feedback klien..." />
                  </label>
                  <label className="font-medium text-slate-600">
                    Potential Service
                    <input className="input mt-1 w-full bg-white" value={leadForm.potential_service} onChange={(e) => setLeadForm((f) => ({ ...f, potential_service: e.target.value }))} placeholder="Layanan yang diminati..." />
                  </label>
                  <label className="font-medium text-slate-600 sm:col-span-2">
                    Next Action
                    <input className="input mt-1 w-full bg-white" value={leadForm.next_action} onChange={(e) => setLeadForm((f) => ({ ...f, next_action: e.target.value }))} placeholder="Langkah selanjutnya..." />
                  </label>
                </div>
              )}
              {leadForm.status === "INTERESTED" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="font-medium text-slate-600">
                    Estimated Project Timeline
                    <input className="input mt-1 w-full bg-white" value={leadForm.estimated_timeline} onChange={(e) => setLeadForm((f) => ({ ...f, estimated_timeline: e.target.value }))} placeholder="Contoh: 24 - 31 Nov 2026" />
                  </label>
                  <label className="font-medium text-slate-600">
                    Meeting Schedule
                    <input className="input mt-1 w-full bg-white" value={leadForm.meeting_schedule} onChange={(e) => setLeadForm((f) => ({ ...f, meeting_schedule: e.target.value }))} placeholder="Contoh: 21 Nov 2026 | 10.00 AM" />
                  </label>
                  <label className="font-medium text-slate-600">
                    Initial Project Brief
                    <input className="input mt-1 w-full bg-white" value={leadForm.initial_brief_file} onChange={(e) => setLeadForm((f) => ({ ...f, initial_brief_file: e.target.value }))} placeholder="Booth Brief Draft.pdf" />
                  </label>
                  <label className="font-medium text-slate-600">
                    Potential Project Notes
                    <input className="input mt-1 w-full bg-white" value={leadForm.potential_project_notes} onChange={(e) => setLeadForm((f) => ({ ...f, potential_project_notes: e.target.value }))} placeholder="Catatan proyek potensial..." />
                  </label>
                </div>
              )}
              {leadForm.status === "UNQUALIFIED" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="font-medium text-slate-600">
                    Reason Not Interested
                    <input className="input mt-1 w-full bg-white" value={leadForm.reason_not_interested} onChange={(e) => setLeadForm((f) => ({ ...f, reason_not_interested: e.target.value }))} placeholder="Alasan tidak tertarik..." />
                  </label>
                  <label className="font-medium text-slate-600">
                    Client Feedback
                    <input className="input mt-1 w-full bg-white" value={leadForm.client_feedback} onChange={(e) => setLeadForm((f) => ({ ...f, client_feedback: e.target.value }))} placeholder="Feedback klien..." />
                  </label>
                </div>
              )}
              {leadForm.status === "UNREACHABLE" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="font-medium text-slate-600">
                    Last Contact Attempt
                    <input type="date" className="input mt-1 w-full bg-white" value={leadForm.contact_date} onChange={(e) => setLeadForm((f) => ({ ...f, contact_date: e.target.value }))} />
                  </label>
                  <label className="font-medium text-slate-600">
                    Contact Method
                    <input className="input mt-1 w-full bg-white" value={leadForm.contact_method} onChange={(e) => setLeadForm((f) => ({ ...f, contact_method: e.target.value }))} placeholder="WhatsApp, Email" />
                  </label>
                  <label className="font-medium text-slate-600">
                    Number of Attempts
                    <input className="input mt-1 w-full bg-white" value={leadForm.number_of_attempts} onChange={(e) => setLeadForm((f) => ({ ...f, number_of_attempts: e.target.value }))} placeholder="1" />
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setIsLeadModalOpen(false)} disabled={savingLead} className="btn-ghost">Batal</button>
            <button type="button" onClick={() => void handleSaveLead()} disabled={savingLead} className="rounded-lg bg-[#163D64] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0876CD]">
              {savingLead ? "Menyimpan..." : editingLead ? "Simpan Perubahan" : "Simpan Lead"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}



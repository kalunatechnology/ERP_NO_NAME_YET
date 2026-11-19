"use client";

import React, { useEffect, useState } from "react";
import {
  ChevronLeft,
  Pencil,
  Calendar,
  FileUp,
  ExternalLink,
  Phone,
  Mail,
  Users,
  PhoneCall,
  Clock,
  MessageSquare,
  Star,
  XCircle,
  PhoneMissed,
  Briefcase,
  Rocket,
  FileText,
  Trophy,
  Check,
  ArrowRight,
  Trash2,
  UserPlus,
  Calculator,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  CRMData,
  CRMStageMetadata,
  linkInquiryCustomer,
  parseStageMetadata,
  serializeStageMetadata,
  updateCustomerInquiry,
  updateOpportunityStageDetails,
} from "@/lib/api/crm.api";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { CRMAvatarBadge } from "./CrmDesignSystem";

const LEAD_STAGE_HEADER: Record<
  string,
  { title: string; bg: string; iconColor: string; Icon: React.ComponentType<any> }
> = {
  NEW: { title: "New Lead", bg: "bg-[#EDF6FE]", iconColor: "text-[#0876CD]", Icon: Users },
  CONTACTED: { title: "Contacted", bg: "bg-[#F4EAFF]", iconColor: "text-[#9333EA]", Icon: PhoneCall },
  FOLLOW_UP: { title: "Waiting Response", bg: "bg-[#FDF3E1]", iconColor: "text-[#D97706]", Icon: Clock },
  RESPONDED: { title: "Responded", bg: "bg-[#FDE7F8]", iconColor: "text-[#DB2777]", Icon: MessageSquare },
  INTERESTED: { title: "Interested", bg: "bg-[#DAF6D8]", iconColor: "text-[#16A34A]", Icon: Star },
  UNQUALIFIED: { title: "Not Interested", bg: "bg-[#FCE4E4]", iconColor: "text-[#DC2626]", Icon: XCircle },
  UNREACHABLE: { title: "Unreachable", bg: "bg-[#EAEAEA]", iconColor: "text-[#64748B]", Icon: PhoneMissed },
};

const OPP_STAGE_HEADER: Record<
  string,
  { title: string; bg: string; iconColor: string; Icon: React.ComponentType<any> }
> = {
  PROSPECT: { title: "Meeting & Discussion", bg: "bg-[#EDF6FE]", iconColor: "text-[#0876CD]", Icon: Briefcase },
  DISCOVERY: { title: "Concept Development", bg: "bg-[#F4EAFF]", iconColor: "text-[#9333EA]", Icon: Rocket },
  PROPOSAL_SENT: { title: "Quotation Submission", bg: "bg-[#D7F7DF]", iconColor: "text-[#059669]", Icon: FileText },
  NEGOTIATION: { title: "Negotiation", bg: "bg-[#FDE7F8]", iconColor: "text-[#DB2777]", Icon: MessageSquare },
  FOLLOW_UP: { title: "Closing", bg: "bg-[#FDF2E0]", iconColor: "text-[#D97706]", Icon: Trophy },
  WON: { title: "Won", bg: "bg-[#DAF6D8]", iconColor: "text-[#16A34A]", Icon: Star },
  LOST: { title: "Lost", bg: "bg-[#FCE4E4]", iconColor: "text-[#DC2626]", Icon: XCircle },
};

function PopupField({
  label,
  value,
  editing,
  onChange,
  onRequestEdit,
  type = "text",
  isFile = false,
  placeholder,
  className,
}: {
  label: string;
  value?: string | null;
  editing: boolean;
  onChange: (val: string) => void;
  onRequestEdit?: () => void;
  type?: "text" | "date" | "textarea";
  isFile?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkMode, setLinkMode] = useState<"file" | "link">("file");
  const [linkDraft, setLinkDraft] = useState("");
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  const IconComp = isFile ? FileUp : type === "date" ? Calendar : Pencil;

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error("File melebihi 5 MB. Gunakan tab 'Tambah Link' untuk file berat (Google Drive / Figma).");
      return;
    }
    onChange(file.name);
    if (!editing && onRequestEdit) onRequestEdit();
    setPickerOpen(false);
    toast.success(`File "${file.name}" siap disimpan.`);
  };

  const handleApplyLink = () => {
    const trimmed = linkDraft.trim();
    if (!trimmed) {
      toast.error("Masukkan URL / link dokumen terlebih dahulu.");
      return;
    }
    onChange(trimmed);
    if (!editing && onRequestEdit) onRequestEdit();
    setLinkDraft("");
    setPickerOpen(false);
  };

  return (
    <div className={cn("space-y-1.5 relative", className)}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-[#64748B]">
        <span>{label}</span>
        {isFile ? (
          <button
            type="button"
            title="Upload file ringan atau tambah link dokumen"
            onClick={() => setPickerOpen((prev) => !prev)}
            className="rounded p-1 text-[#475569] transition hover:bg-blue-50 hover:text-[#0876CD]"
          >
            <IconComp size={13} />
          </button>
        ) : type === "date" ? (
          <button
            type="button"
            title="Pilih tanggal"
            onClick={() => {
              if (!editing && onRequestEdit) onRequestEdit();
              setTimeout(() => {
                dateInputRef.current?.focus();
                dateInputRef.current?.showPicker?.();
              }, 20);
            }}
            className="rounded p-1 text-[#475569] transition hover:bg-blue-50 hover:text-[#0876CD]"
          >
            <IconComp size={13} />
          </button>
        ) : (
          <button
            type="button"
            title={`Ubah ${label}`}
            onClick={() => {
              if (!editing && onRequestEdit) onRequestEdit();
            }}
            className="rounded p-1 text-[#475569] transition hover:bg-slate-100"
          >
            <IconComp size={13} />
          </button>
        )}
      </div>

      {isFile && pickerOpen && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2 text-xs shadow-sm">
          <div className="flex gap-1 rounded-lg bg-white p-0.5 border border-slate-200">
            <button
              type="button"
              onClick={() => setLinkMode("file")}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition",
                linkMode === "file" ? "bg-[#163D64] text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              Upload File (≤5MB)
            </button>
            <button
              type="button"
              onClick={() => setLinkMode("link")}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition",
                linkMode === "link" ? "bg-[#163D64] text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              Tambah Link
            </button>
          </div>
          {linkMode === "file" ? (
            <input
              type="file"
              onChange={handleFilePick}
              className="block w-full text-[11px] text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-blue-50 file:px-2.5 file:py-1 file:text-[11px] file:font-semibold file:text-[#0876CD] hover:file:bg-blue-100"
            />
          ) : (
            <div className="flex gap-1.5">
              <input
                type="url"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] outline-none focus:border-[#0876CD]"
              />
              <button
                type="button"
                onClick={handleApplyLink}
                className="rounded-lg bg-[#0876CD] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#163D64]"
              >
                Pakai
              </button>
            </div>
          )}
        </div>
      )}

      {editing ? (
        type === "textarea" ? (
          <textarea
            rows={2}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || `Isi ${label}...`}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#0876CD] focus:outline-hidden"
          />
        ) : (
          <input
            ref={type === "date" ? dateInputRef : undefined}
            type={type}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || (isFile ? "Nama file / URL dokumen..." : `Isi ${label}...`)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#0876CD] focus:outline-hidden"
          />
        )
      ) : isFile ? (
        value ? (
          <a
            href={value.startsWith("http") ? value : `#${value}`}
            target={value.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            onClick={(e) => {
              if (!value.startsWith("http")) e.preventDefault();
            }}
            className="inline-block text-sm font-medium text-[#0876CD] underline underline-offset-2 break-all"
          >
            {value}
          </a>
        ) : (
          <div className="text-sm text-slate-400 italic">Belum ada dokumen</div>
        )
      ) : (
        <div className="text-sm font-normal text-[#0F172A] whitespace-pre-wrap break-words">
          {type === "date" && value ? formatDate(value) : value || "—"}
        </div>
      )}
    </div>
  );
}

export function LeadStagePopupModal({
  lead,
  data,
  isOpen,
  onClose,
  onMoveStage,
  onConvert,
  onDelete,
  onOpenEditModal,
  onOpenDelegate,
  onRefresh,
  canDelete = false,
  canDelegate = false,
  readOnly = false,
  isQualifying = false,
}: {
  lead: any | null;
  data: CRMData;
  isOpen: boolean;
  onClose: () => void;
  onMoveStage: (leadId: string, targetBucket: string) => void | Promise<void>;
  onConvert: (lead: any) => void | Promise<void>;
  onDelete: (lead: any) => void | Promise<void>;
  onOpenEditModal: (lead: any) => void;
  onOpenDelegate?: (lead: any, type: "INQUIRY" | "OPPORTUNITY") => void;
  onRefresh: () => void;
  canDelete?: boolean;
  canDelegate?: boolean;
  readOnly?: boolean;
  isQualifying?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<CRMStageMetadata>({});
  const [companyForm, setCompanyForm] = useState({
    company_name: "",
    industry: "",
    website: "",
    address: "",
  });
  const [contactForm, setContactForm] = useState({
    contact_name: "",
    job_title: "",
    phone: "",
    email: "",
  });
  const [leadInfoForm, setLeadInfoForm] = useState({
    brand_id: "",
    subject: "",
    interested_service: "",
    lead_source: "",
    follow_up_date: "",
  });
  const [linkingPartyId, setLinkingPartyId] = useState("");
  const [linkingContactId, setLinkingContactId] = useState("");

  useEffect(() => {
    if (!lead) return;
    setEditing(false);
    const parsed = parseStageMetadata(lead.notes);
    setMeta({
      ...parsed,
      contact_date: parsed.contact_date || (lead.last_contacted_at ? String(lead.last_contacted_at).slice(0, 10) : ""),
      follow_up_date: parsed.follow_up_date || (lead.next_follow_up_at ? String(lead.next_follow_up_at).slice(0, 10) : ""),
      contact_notes: parsed.contact_notes || lead.last_contact_note || "",
      follow_up_notes: parsed.follow_up_notes || lead.last_contact_note || "",
    });
    const party = lead._party;
    const contact = lead._contact;
    setCompanyForm({
      company_name: party?.display_name || party?.legal_name || lead.customer_name || "",
      industry: party?.industry || "",
      website: party?.website || "",
      address: party?.city || "",
    });
    setContactForm({
      contact_name: contact?.contact_name || lead.customer_name || "",
      job_title: contact?.job_title || "",
      phone: lead.customer_phone || contact?.phone || "",
      email: lead.customer_email || contact?.email || "",
    });
    setLeadInfoForm({
      brand_id: lead.brand_id ? String(lead.brand_id) : "",
      subject: lead.subject || "",
      interested_service: lead.interested_service || "",
      lead_source: lead.lead_source || lead.source_channel || "MANUAL",
      follow_up_date: lead.next_follow_up_at ? String(lead.next_follow_up_at).slice(0, 10) : (parsed.follow_up_date || ""),
    });
  }, [lead]);

  if (!isOpen || !lead) return null;

  const bucket = String(lead._bucket || "NEW").toUpperCase();
  const headerCfg = LEAD_STAGE_HEADER[bucket] || LEAD_STAGE_HEADER.NEW;
  const HeaderIcon = headerCfg.Icon;

  const setMetaField = (key: keyof CRMStageMetadata, val: string) => {
    setMeta((prev) => ({ ...prev, [key]: val }));
  };

  const handleSavePopup = async () => {
    setSaving(true);
    try {
      const nextFollowUp = meta.follow_up_date || leadInfoForm.follow_up_date || null;
      const serializedNotes = serializeStageMetadata({
        ...meta,
        follow_up_date: nextFollowUp || "",
      });
      await updateCustomerInquiry(lead.id, {
        brand_id: leadInfoForm.brand_id || null,
        subject: leadInfoForm.subject.trim() || lead.subject,
        customer_name: companyForm.company_name.trim() || lead.customer_name,
        customer_email: contactForm.email.trim(),
        customer_phone: contactForm.phone.trim(),
        contact_name: contactForm.contact_name.trim(),
        job_title: contactForm.job_title.trim(),
        industry: companyForm.industry.trim(),
        website: companyForm.website.trim(),
        address: companyForm.address.trim(),
        lead_source: leadInfoForm.lead_source || lead.lead_source,
        interested_service: (meta.potential_service || leadInfoForm.interested_service || "").trim() || null,
        next_follow_up_at: nextFollowUp,
        last_contacted_at: meta.contact_date || null,
        last_contact_note: meta.contact_notes || meta.follow_up_notes || lead.last_contact_note || "",
        description: lead.description || "",
        notes: serializedNotes,
      });
      toast.success("Detail Lead & Stage berhasil disimpan.");
      setEditing(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error?.message || "Gagal menyimpan detail Lead.");
    } finally {
      setSaving(false);
    }
  };

  const handleLinkParty = async (partyIdOverride?: string, contactIdOverride?: string | null) => {
    const pid = partyIdOverride ?? linkingPartyId;
    const cid = contactIdOverride !== undefined ? contactIdOverride : (linkingContactId || null);
    if (!pid) return;
    try {
      await linkInquiryCustomer(lead.id, pid, cid);
      toast.success("Perusahaan berhasil ditautkan.");
      setLinkingPartyId("");
      setLinkingContactId("");
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menautkan perusahaan.");
    }
  };

  const renderCompanyDetails = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-bold text-[#163D64]">Company Details</h4>
        {!readOnly && (
          <button type="button" onClick={() => setEditing(true)} className="text-slate-500 hover:text-[#0876CD]">
            <Pencil size={14} />
          </button>
        )}
      </div>
      <div className="space-y-2.5 text-xs">
        <div>
          <div className="text-[#64748B]">Company</div>
          {editing ? (
            <input className="input mt-0.5 w-full text-xs" value={companyForm.company_name} onChange={(e) => setCompanyForm((f) => ({ ...f, company_name: e.target.value }))} />
          ) : (
            <div className="mt-0.5 space-y-1">
              <div className="text-sm font-semibold text-[#0F172A]">{companyForm.company_name || "—"}</div>
              {!lead.customer_party_id && !readOnly && (
                <select
                  aria-label="Tautkan ke Master Company"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 focus:border-[#0876CD] focus:bg-white focus:outline-none"
                  value={linkingPartyId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setLinkingPartyId(pid);
                    const primary = (data.contacts || []).find((c: any) => String(c.party_id) === pid && c.primary_contact);
                    setLinkingContactId(primary ? String(primary.id) : "");
                    if (pid) {
                      void handleLinkParty(pid, primary ? String(primary.id) : undefined);
                    }
                  }}
                >
                  <option value="">-- Tautkan Master Company --</option>
                  {(data.parties || [])
                    .filter((p: any) => ["CUSTOMER", "PROSPECT"].includes(String(p.party_type || "").toUpperCase()) && p.status === "ACTIVE")
                    .map((p: any) => (
                      <option key={p.id} value={String(p.id)}>{p.display_name || p.legal_name}</option>
                    ))}
                </select>
              )}
            </div>
          )}
        </div>
        <div>
          <div className="text-[#64748B]">Industry</div>
          {editing ? (
            <input className="input mt-0.5 w-full text-xs" value={companyForm.industry} onChange={(e) => setCompanyForm((f) => ({ ...f, industry: e.target.value }))} placeholder="Contoh: Venture Capital" />
          ) : (
            <div className="mt-0.5 text-sm font-semibold text-[#0F172A]">{companyForm.industry || "—"}</div>
          )}
        </div>
        <div>
          <div className="text-[#64748B]">Website</div>
          {editing ? (
            <input className="input mt-0.5 w-full text-xs" value={companyForm.website} onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))} placeholder="www.perusahaan.co.id" />
          ) : companyForm.website ? (
            <a
              href={companyForm.website.startsWith("http") ? companyForm.website : `https://${companyForm.website}`}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-[#0876CD] hover:underline"
            >
              {companyForm.website} <ExternalLink size={12} />
            </a>
          ) : (
            <div className="mt-0.5 text-sm text-slate-400">—</div>
          )}
        </div>
        <div>
          <div className="text-[#64748B]">Address</div>
          {editing ? (
            <input className="input mt-0.5 w-full text-xs" value={companyForm.address} onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))} placeholder="Kota, Negara" />
          ) : (
            <div className="mt-0.5 text-sm font-semibold text-[#0F172A]">{companyForm.address || "—"}</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderContactPerson = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-bold text-[#163D64]">Contact Person</h4>
        {!readOnly && (
          <button type="button" onClick={() => setEditing(true)} className="text-slate-500 hover:text-[#0876CD]">
            <Pencil size={14} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2 text-xs">
          <input className="input w-full text-xs" value={contactForm.contact_name} onChange={(e) => setContactForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Nama PIC" />
          <input className="input w-full text-xs" value={contactForm.job_title} onChange={(e) => setContactForm((f) => ({ ...f, job_title: e.target.value }))} placeholder="Jabatan (Contoh: Regional Manager)" />
          <input className="input w-full text-xs" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+62 812..." />
          <input className="input w-full text-xs" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@perusahaan.co.id" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div>
            <div className="text-sm font-bold text-[#0F172A] break-words">{contactForm.contact_name || "—"}</div>
            <div className="mt-1">
              <span className="inline-block rounded-full bg-[#EDF6FE] px-2 py-0.5 text-[10px] font-semibold text-[#0876CD]">Primary</span>
            </div>
            <div className="mt-0.5 text-xs text-[#64748B]">{contactForm.job_title || "PIC Utama"}</div>
          </div>
          <div className="pt-1 space-y-1 text-xs text-[#334155]">
            <div className="flex items-center gap-2"><Phone size={13} className="text-slate-500" /> {contactForm.phone || "—"}</div>
            <div className="flex items-center gap-2"><Mail size={13} className="text-slate-500" /> {contactForm.email || "—"}</div>
          </div>
        </div>
      )}
    </div>
  );

  const renderLeadInfo = (isNewLeadLayout = false) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-bold text-[#163D64]">Lead Information</h4>
        <div className="flex items-center gap-2">
          {canDelegate && onOpenDelegate && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDelegate(lead, "INQUIRY");
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0876CD] hover:underline"
            >
              <UserPlus size={13} /> Delegasi
            </button>
          )}
          {!readOnly && (
            <button type="button" onClick={() => setEditing(true)} className="text-slate-500 hover:text-[#0876CD]">
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[#64748B]">Brand / Unit Bisnis</div>
          {editing ? (
            <select
              className="input mt-0.5 w-full text-xs bg-white"
              value={leadInfoForm.brand_id}
              onChange={(e) => setLeadInfoForm((f) => ({ ...f, brand_id: e.target.value }))}
            >
              <option value="">-- Pilih Brand --</option>
              {(data.brands || []).map((b: any) => (
                <option key={b.id} value={String(b.id)}>
                  [{b.brand_code}] {b.brand_name}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-0.5 text-sm font-semibold text-[#0876CD]">
              {(data.brands || []).find((b: any) => String(b.id) === String(leadInfoForm.brand_id))?.brand_name || "Lintas Brand"}
            </div>
          )}
        </div>
        <div>
          <div className="text-[#64748B]">{isNewLeadLayout ? "Project Type" : "Jenis Kebutuhan"}</div>
          {editing ? (
            <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.subject} onChange={(e) => setLeadInfoForm((f) => ({ ...f, subject: e.target.value }))} />
          ) : (
            <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.subject || "—"}</div>
          )}
        </div>
        <div>
          <div className="text-[#64748B]">{isNewLeadLayout ? "Source" : "Interested Service"}</div>
          {isNewLeadLayout ? (
            editing ? (
              <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.lead_source} onChange={(e) => setLeadInfoForm((f) => ({ ...f, lead_source: e.target.value }))} />
            ) : (
              <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.lead_source || "—"}</div>
            )
          ) : editing ? (
            <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.interested_service} onChange={(e) => setLeadInfoForm((f) => ({ ...f, interested_service: e.target.value }))} />
          ) : (
            <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.interested_service || "—"}</div>
          )}
        </div>
        <div>
          <div className="text-[#64748B]">{isNewLeadLayout ? "Interested Service" : "Source"}</div>
          {isNewLeadLayout ? (
            editing ? (
              <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.interested_service} onChange={(e) => setLeadInfoForm((f) => ({ ...f, interested_service: e.target.value }))} />
            ) : (
              <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.interested_service || "—"}</div>
            )
          ) : editing ? (
            <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.lead_source} onChange={(e) => setLeadInfoForm((f) => ({ ...f, lead_source: e.target.value }))} />
          ) : (
            <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.lead_source || "—"}</div>
          )}
        </div>
        <div className="col-span-2 min-w-0">
          <div className="text-[#64748B]">Assigned to</div>
          <div className="mt-1"><CRMAvatarBadge name={lead._ownerName || "Unassigned"} size="xs" /></div>
        </div>
        {isNewLeadLayout && (
          <div>
            <div className="text-[#64748B]">Follow Up Date</div>
            {editing ? (
              <input type="date" className="input mt-0.5 w-full text-xs" value={leadInfoForm.follow_up_date} onChange={(e) => setLeadInfoForm((f) => ({ ...f, follow_up_date: e.target.value }))} />
            ) : (
              <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.follow_up_date ? formatDate(leadInfoForm.follow_up_date) : "—"}</div>
            )}
          </div>
        )}
        <div>
          <div className="text-[#64748B]">Created at</div>
          <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{formatDate(lead.created_at)}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl transition-all my-auto",
          bucket === "NEW" ? "max-w-[660px]" : "max-w-[899px]"
        )}
      >
        {/* Top Stage Banner */}
        <div className={cn("flex items-center justify-between gap-3 rounded-2xl px-5 py-3.5", headerCfg.bg)}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-700 hover:bg-black/5 transition"
              aria-label="Tutup popup"
            >
              <ChevronLeft size={22} />
            </button>
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-2xs", headerCfg.iconColor)}>
              <HeaderIcon size={18} />
            </div>
            <h3 className="text-xl font-bold text-[#0F172A]">{headerCfg.title}</h3>
          </div>

          <div className="flex items-center gap-2">
            {!readOnly && (
              <button
                type="button"
                onClick={() => (editing ? void handleSavePopup() : setEditing(true))}
                disabled={saving}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition",
                  editing
                    ? "bg-[#163D64] text-white hover:bg-[#0876CD]"
                    : "bg-white/80 text-slate-700 border border-slate-200/80 hover:bg-white"
                )}
              >
                {editing ? <><Check size={13} /> {saving ? "Menyimpan..." : "Simpan"}</> : <><Pencil size={13} /> Edit Isi</>}
              </button>
            )}
          </div>
        </div>

        {/* Body Content */}
        {bucket === "NEW" ? (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {renderCompanyDetails()}
              {renderContactPerson()}
            </div>
            <hr className="border-slate-200" />
            {renderLeadInfo(true)}
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Stage-Specific Top Section */}
            {bucket === "CONTACTED" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <PopupField label="Contact Date" type="date" value={meta.contact_date} editing={editing} onChange={(v) => setMetaField("contact_date", v)} />
                <PopupField label="Contact Method" value={meta.contact_method || "WhatsApp"} editing={editing} onChange={(v) => setMetaField("contact_method", v)} />
                <PopupField label="Introduction Sent" value={meta.introduction_sent || "Company Profile"} editing={editing} onChange={(v) => setMetaField("introduction_sent", v)} />
                <PopupField label="Contact Notes" value={meta.contact_notes} editing={editing} onChange={(v) => setMetaField("contact_notes", v)} />
                <PopupField label="Next Follow-Up Date" type="date" value={meta.follow_up_date} editing={editing} onChange={(v) => setMetaField("follow_up_date", v)} />
              </div>
            )}

            {bucket === "FOLLOW_UP" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <PopupField label="Last Contact Date" type="date" value={meta.contact_date} editing={editing} onChange={(v) => setMetaField("contact_date", v)} />
                <PopupField label="Contact Method" value={meta.contact_method || "WhatsApp"} editing={editing} onChange={(v) => setMetaField("contact_method", v)} />
                <PopupField label="Introduction Sent" value={meta.introduction_sent || "Company Profile"} editing={editing} onChange={(v) => setMetaField("introduction_sent", v)} />
                <PopupField label="Follow-Up Date" type="date" value={meta.follow_up_date} editing={editing} onChange={(v) => setMetaField("follow_up_date", v)} />
                <PopupField label="Follow-Up Notes" className="sm:col-span-2" value={meta.follow_up_notes} editing={editing} onChange={(v) => setMetaField("follow_up_notes", v)} />
              </div>
            )}

            {bucket === "RESPONDED" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="sm:border-r sm:border-slate-200 sm:pr-5">
                  <PopupField label="Response Summary" type="textarea" value={meta.response_summary || lead.description} editing={editing} onChange={(v) => setMetaField("response_summary", v)} />
                </div>
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <PopupField label="Client Feedback" value={meta.client_feedback} editing={editing} onChange={(v) => setMetaField("client_feedback", v)} />
                  <PopupField label="Potential Service" value={meta.potential_service || leadInfoForm.interested_service} editing={editing} onChange={(v) => setMetaField("potential_service", v)} />
                  <PopupField label="Next Action" value={meta.next_action} editing={editing} onChange={(v) => setMetaField("next_action", v)} />
                  <PopupField label="Follow-Up Date" type="date" value={meta.follow_up_date} editing={editing} onChange={(v) => setMetaField("follow_up_date", v)} />
                </div>
              </div>
            )}

            {bucket === "INTERESTED" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <PopupField label="Interested Service" value={leadInfoForm.interested_service} editing={editing} onChange={(v) => setLeadInfoForm((f) => ({ ...f, interested_service: v }))} />
                <PopupField label="Estimated Project Timeline" value={meta.estimated_timeline} editing={editing} onChange={(v) => setMetaField("estimated_timeline", v)} placeholder="24 - 31 Nov 2026" />
                <PopupField label="Meeting Schedule" value={meta.meeting_schedule} editing={editing} onChange={(v) => setMetaField("meeting_schedule", v)} placeholder="21 Nov 2026 | 10.00 - 11.00 AM" />
                <PopupField label="Initial Project Brief" isFile value={meta.initial_brief_file} editing={editing} onChange={(v) => setMetaField("initial_brief_file", v)} placeholder="Booth Brief Draft.pdf" />
                <PopupField label="Potential Project Notes" className="sm:col-span-2" value={meta.potential_project_notes || lead.description} editing={editing} onChange={(v) => setMetaField("potential_project_notes", v)} />
              </div>
            )}

            {bucket === "UNQUALIFIED" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <PopupField label="Reason Not Interested" type="textarea" value={meta.reason_not_interested} editing={editing} onChange={(v) => setMetaField("reason_not_interested", v)} />
                <PopupField label="Client Feedback" type="textarea" value={meta.client_feedback} editing={editing} onChange={(v) => setMetaField("client_feedback", v)} />
                <PopupField label="Notes" type="textarea" value={meta.plain_notes} editing={editing} onChange={(v) => setMetaField("plain_notes", v)} />
              </div>
            )}

            {bucket === "UNREACHABLE" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <PopupField label="Last Contact Attempt" type="date" value={meta.contact_date} editing={editing} onChange={(v) => setMetaField("contact_date", v)} />
                <PopupField label="Contact Method" value={meta.contact_method || "WhatsApp, Email"} editing={editing} onChange={(v) => setMetaField("contact_method", v)} />
                <PopupField label="Number of Attempts" value={meta.number_of_attempts || "1"} editing={editing} onChange={(v) => setMetaField("number_of_attempts", v)} />
                <PopupField label="Notes" className="sm:col-span-3" type="textarea" value={meta.plain_notes} editing={editing} onChange={(v) => setMetaField("plain_notes", v)} />
              </div>
            )}

            <hr className="border-slate-200" />

            {/* Bottom 3-Column Section */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {renderContactPerson()}
              {renderCompanyDetails()}
              {renderLeadInfo(false)}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2">
            {!readOnly && canDelete && !lead._isConverted && (
              <button
                type="button"
                onClick={() => void onDelete(lead)}
                className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 size={13} /> Hapus
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditModal(lead);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Pencil size={13} /> Form Lengkap
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing && (
              <button
                type="button"
                onClick={() => void handleSavePopup()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0876CD] px-4 py-2 text-xs font-semibold text-white hover:bg-[#163D64]"
              >
                <Check size={14} /> {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            )}
            {!readOnly && !lead._isConverted && (
              <button
                type="button"
                disabled={isQualifying}
                onClick={() => void onConvert(lead)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#163D64] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0876CD] disabled:opacity-50"
              >
                <ArrowRight size={14} /> {isQualifying ? "Mengkonversi..." : "Convert to Opportunity"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpportunityStagePopupModal({
  opp,
  data,
  isOpen,
  onClose,
  onMoveStage,
  onDealWon,
  onMarkLost,
  onOpenCustomer360,
  onOpenDelegate,
  onViewEstimate,
  canManage = false,
  canDelegate = false,
}: {
  opp: any | null;
  data: CRMData;
  isOpen: boolean;
  onClose: () => void;
  onMoveStage: (opp: any, targetStage: string) => void | Promise<any>;
  onDealWon: (opp: any) => void;
  onMarkLost: (opp: any) => void;
  onOpenCustomer360: (oppId: string | number) => void;
  onOpenDelegate?: (opp: any) => void;
  onViewEstimate: () => void;
  canManage?: boolean;
  canDelegate?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<CRMStageMetadata>({});
  const [companyForm, setCompanyForm] = useState({
    company_name: "",
    industry: "",
    website: "",
    address: "",
  });
  const [contactForm, setContactForm] = useState({
    contact_id: "",
    contact_name: "",
    job_title: "",
    phone: "",
    email: "",
  });
  const [leadInfoForm, setLeadInfoForm] = useState({
    brand_id: "",
    project_type: "",
    interested_service: "",
    lead_source: "",
    internal_pic: "",
  });

  useEffect(() => {
    if (!opp) return;
    setEditing(false);
    const parsed = parseStageMetadata(opp.follow_up_reason);
    const sourceInquiry = (data.inquiries || []).find(
      (inq: any) => String(inq.id) === String(opp.source_inquiry_id) || String(inq.opportunity_id) === String(opp.id)
    );
    const party = opp._party;
    const primaryContact =
      (data.contacts || []).find((c: any) => String(c.id) === String(sourceInquiry?.contact_id)) ||
      (data.contacts || []).find((c: any) => String(c.party_id) === String(opp.customer_party_id) && c.primary_contact) ||
      (data.contacts || []).find((c: any) => String(c.party_id) === String(opp.customer_party_id));
    const latestQuo = (data.quotations || []).find((q: any) => String(q.opportunity_id) === String(opp.id));

    setMeta({
      ...parsed,
      project_name: parsed.project_name || opp.opportunity_name || "",
      event_date: parsed.event_date || (opp.expected_close_date ? String(opp.expected_close_date).slice(0, 10) : ""),
      quotation_number: parsed.quotation_number || latestQuo?.quotation_code || "",
      total_quotation_value: parsed.total_quotation_value || (opp._amount ? String(opp._amount) : ""),
      final_proposed_value: parsed.final_proposed_value || (opp._amount ? String(opp._amount) : ""),
      final_project_value: parsed.final_project_value || (opp._amount ? String(opp._amount) : ""),
      final_contract_value: parsed.final_contract_value || (opp._amount ? String(opp._amount) : ""),
      follow_up_date: parsed.follow_up_date || (opp.next_follow_up_at ? String(opp.next_follow_up_at).slice(0, 10) : ""),
      evaluation_notes: parsed.evaluation_notes || opp.lost_reason_detail || "",
    });
    setCompanyForm({
      company_name: party?.display_name || party?.legal_name || opp._customerName || "",
      industry: party?.industry || "",
      website: party?.website || "",
      address: party?.city || "",
    });
    setContactForm({
      contact_id: primaryContact?.id ? String(primaryContact.id) : "",
      contact_name: primaryContact?.contact_name || sourceInquiry?.customer_name || opp._customerName || "",
      job_title: primaryContact?.job_title || "",
      phone: primaryContact?.phone || sourceInquiry?.customer_phone || "",
      email: primaryContact?.email || sourceInquiry?.customer_email || "",
    });
    setLeadInfoForm({
      brand_id: opp.brand_id ? String(opp.brand_id) : (sourceInquiry?.brand_id ? String(sourceInquiry.brand_id) : ""),
      project_type: sourceInquiry?.subject || opp.opportunity_name || "",
      interested_service: sourceInquiry?.interested_service || "",
      lead_source: sourceInquiry?.lead_source || sourceInquiry?.source_channel || "MANUAL",
      internal_pic: parsed.internal_pic || opp._ownerName || "",
    });
  }, [opp, data.inquiries, data.contacts, data.quotations]);

  if (!isOpen || !opp) return null;

  const bucket = String(opp._bucket || "PROSPECT").toUpperCase();
  const headerCfg = OPP_STAGE_HEADER[bucket] || OPP_STAGE_HEADER.PROSPECT;
  const HeaderIcon = headerCfg.Icon;
  const isClosed = ["WON", "LOST"].includes(bucket);

  const setMetaField = (key: keyof CRMStageMetadata, val: string) => {
    setMeta((prev) => ({ ...prev, [key]: val }));
  };

  const handleSaveOppPopup = async () => {
    setSaving(true);
    try {
      const numericAmount = Number(
        String(
          meta.final_contract_value ||
          meta.final_project_value ||
          meta.final_proposed_value ||
          meta.total_quotation_value ||
          opp._amount ||
          0
        ).replace(/[^0-9.-]/g, "")
      );
      const serialized = serializeStageMetadata({
        ...meta,
        internal_pic: leadInfoForm.internal_pic,
      });
      await updateOpportunityStageDetails(opp.id, {
        brand_id: leadInfoForm.brand_id || null,
        opportunity_name: (meta.project_name || opp.opportunity_name || "").trim(),
        expected_amount: Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : opp.expected_amount,
        expected_close_date: meta.event_date || meta.target_submission_date || meta.project_start_date || null,
        next_follow_up_at: meta.follow_up_date || null,
        follow_up_reason: serialized,
        lost_reason: opp.lost_reason || "",
        lost_reason_detail: meta.evaluation_notes || opp.lost_reason_detail || "",
        company_name: companyForm.company_name.trim(),
        industry: companyForm.industry.trim(),
        website: companyForm.website.trim(),
        address: companyForm.address.trim(),
        contact_id: contactForm.contact_id || null,
        contact_name: contactForm.contact_name.trim(),
        job_title: contactForm.job_title.trim(),
        contact_phone: contactForm.phone.trim(),
        contact_email: contactForm.email.trim(),
        project_type: leadInfoForm.project_type.trim(),
        interested_service: leadInfoForm.interested_service.trim(),
        lead_source: leadInfoForm.lead_source.trim(),
      });
      toast.success("Detail Opportunity & Stage berhasil disimpan.");
      setEditing(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error?.message || "Gagal menyimpan detail Opportunity.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[899px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl transition-all my-auto">
        {/* Top Stage Banner */}
        <div className={cn("flex items-center justify-between gap-3 rounded-2xl px-5 py-3.5", headerCfg.bg)}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-700 hover:bg-black/5 transition"
              aria-label="Tutup popup"
            >
              <ChevronLeft size={22} />
            </button>
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-2xs", headerCfg.iconColor)}>
              <HeaderIcon size={18} />
            </div>
            <h3 className="text-xl font-bold text-[#0F172A]">{headerCfg.title}</h3>
          </div>

          <div className="flex items-center gap-2">
            {canManage && (
              <button
                type="button"
                onClick={() => (editing ? void handleSaveOppPopup() : setEditing(true))}
                disabled={saving}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition",
                  editing
                    ? "bg-[#163D64] text-white hover:bg-[#0876CD]"
                    : "bg-white/80 text-slate-700 border border-slate-200/80 hover:bg-white"
                )}
              >
                {editing ? <><Check size={13} /> {saving ? "Menyimpan..." : "Simpan"}</> : <><Pencil size={13} /> Edit Isi</>}
              </button>
            )}
            <select
              disabled={!canManage || isClosed}
              value={bucket}
              onChange={(e) => {
                const target = e.target.value;
                if (target === "WON") {
                  onClose();
                  onDealWon(opp);
                } else if (target === "LOST") {
                  onClose();
                  onMarkLost(opp);
                } else {
                  void onMoveStage(opp, target);
                }
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-2xs focus:outline-hidden"
            >
              {Object.entries(OPP_STAGE_HEADER).map(([id, cfg]) => (
                <option key={id} value={id}>{cfg.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stage-Specific Top Section */}
        <div className="mt-6 space-y-6">
          {bucket === "PROSPECT" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <PopupField label="Project Name" value={meta.project_name} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("project_name", v)} />
              <PopupField label="Event Date" type="date" value={meta.event_date} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("event_date", v)} />
              <PopupField label="Project Location" value={meta.project_location} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("project_location", v)} placeholder="GOR Nambo, Serang" />
              <PopupField label="Meeting Notes" className="sm:col-span-2" value={meta.meeting_notes || meta.plain_notes} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("meeting_notes", v)} />
              <PopupField label="Project Brief" isFile value={meta.project_brief_file} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("project_brief_file", v)} placeholder="Booth Brief Draft.pdf" />
            </div>
          )}

          {bucket === "DISCOVERY" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <PopupField label="Project Brief" isFile value={meta.project_brief_file} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("project_brief_file", v)} placeholder="Booth Brief Draft.pdf" />
              <PopupField label="Scope of Work" isFile value={meta.sow_file} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("sow_file", v)} placeholder="Booth Activation SOW.pdf" />
              <PopupField label="Design Reference" isFile value={meta.design_reference_file} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("design_reference_file", v)} placeholder="Design References.pdf" />
              <PopupField label="Concept File" isFile value={meta.concept_file} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("concept_file", v)} placeholder="Design Concept.pdf" />
              <PopupField label="Target Submission Date" type="date" value={meta.target_submission_date || meta.event_date} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("target_submission_date", v)} />
            </div>
          )}

          {bucket === "PROPOSAL_SENT" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <PopupField label="Quotation Number" value={meta.quotation_number} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("quotation_number", v)} placeholder="ARSA/021/11/2026" />
              <PopupField label="Quotation Document" isFile value={meta.quotation_doc_file} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("quotation_doc_file", v)} placeholder="QARS021112026.pdf" />
              <PopupField
                label="Total Quotation Value"
                value={editing ? meta.total_quotation_value : formatMoney(Number(String(meta.total_quotation_value || opp._amount || 0).replace(/[^0-9.-]/g, "")))}
                editing={editing}
                onRequestEdit={() => setEditing(true)}
                onChange={(v) => setMetaField("total_quotation_value", v)}
              />
              <PopupField label="Submission Date" type="date" value={meta.submission_date} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("submission_date", v)} />
              <PopupField label="Payment Terms" value={meta.payment_terms || "Due On Receipt"} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("payment_terms", v)} />
              <PopupField label="Follow-Up Date" type="date" value={meta.follow_up_date} editing={editing} onRequestEdit={() => setEditing(true)} onChange={(v) => setMetaField("follow_up_date", v)} />
            </div>
          )}

          {bucket === "NEGOTIATION" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <PopupField
                label="Client Budget"
                value={editing ? meta.client_budget : (meta.client_budget ? formatMoney(Number(String(meta.client_budget).replace(/[^0-9.-]/g, ""))) : "—")}
                editing={editing}
                onChange={(v) => setMetaField("client_budget", v)}
              />
              <PopupField label="Negotiation Notes" value={meta.negotiation_notes} editing={editing} onChange={(v) => setMetaField("negotiation_notes", v)} />
              <PopupField label="Revision Request" value={meta.revision_request} editing={editing} onChange={(v) => setMetaField("revision_request", v)} />
              <PopupField label="Revised Quotation" isFile value={meta.revised_quotation_file} editing={editing} onChange={(v) => setMetaField("revised_quotation_file", v)} placeholder="QARS021112026-New.pdf" />
              <PopupField
                label="Final Proposed Value"
                value={editing ? meta.final_proposed_value : formatMoney(Number(String(meta.final_proposed_value || opp._amount || 0).replace(/[^0-9.-]/g, "")))}
                editing={editing}
                onChange={(v) => setMetaField("final_proposed_value", v)}
              />
              <PopupField label="Follow-up Date" type="date" value={meta.follow_up_date} editing={editing} onChange={(v) => setMetaField("follow_up_date", v)} />
            </div>
          )}

          {bucket === "FOLLOW_UP" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <PopupField
                label="Final Project Value"
                value={editing ? meta.final_project_value : formatMoney(Number(String(meta.final_project_value || opp._amount || 0).replace(/[^0-9.-]/g, "")))}
                editing={editing}
                onChange={(v) => setMetaField("final_project_value", v)}
              />
              <PopupField label="Final Quotation" isFile value={meta.final_quotation_file} editing={editing} onChange={(v) => setMetaField("final_quotation_file", v)} placeholder="QARS021112026-Final.pdf" />
              <PopupField label="PO / SPK" isFile value={meta.po_spk_file} editing={editing} onChange={(v) => setMetaField("po_spk_file", v)} placeholder="PO-ARS021112026.pdf" />
              <PopupField label="Contract Document" isFile value={meta.contract_doc_file} editing={editing} onChange={(v) => setMetaField("contract_doc_file", v)} placeholder="Contract-ARS021.pdf" />
              <PopupField label="Project Start Date" type="date" value={meta.project_start_date} editing={editing} onChange={(v) => setMetaField("project_start_date", v)} />
              <PopupField label="Closing Status" value={meta.closing_status || "DEAL"} editing={editing} onChange={(v) => setMetaField("closing_status", v)} />
            </div>
          )}

          {bucket === "WON" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <PopupField
                label="Final Contract Value"
                value={editing ? meta.final_contract_value : formatMoney(Number(String(meta.final_contract_value || opp._amount || 0).replace(/[^0-9.-]/g, "")))}
                editing={editing}
                onChange={(v) => setMetaField("final_contract_value", v)}
              />
              <PopupField label="PO / SPK" isFile value={meta.po_spk_file} editing={editing} onChange={(v) => setMetaField("po_spk_file", v)} placeholder="PO-ARS021112026.pdf" />
              <PopupField label="Downpayment Status" value={meta.downpayment_status || "65% Paid"} editing={editing} onChange={(v) => setMetaField("downpayment_status", v)} />
              <PopupField label="Project Handover" isFile value={meta.project_handover_file} editing={editing} onChange={(v) => setMetaField("project_handover_file", v)} placeholder="Final Project Brief.pdf" />
              <PopupField label="Person In Charge" value={meta.person_in_charge || leadInfoForm.internal_pic} editing={editing} onChange={(v) => setMetaField("person_in_charge", v)} />
            </div>
          )}

          {bucket === "LOST" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <PopupField label="Lost Reason" value={meta.reason_not_interested || opp.lost_reason} editing={editing} onChange={(v) => setMetaField("reason_not_interested", v)} />
              <PopupField label="Competitor / Vendor Selected" value={meta.competitor_selected} editing={editing} onChange={(v) => setMetaField("competitor_selected", v)} />
              <PopupField label="Client Feedback" value={meta.client_feedback} editing={editing} onChange={(v) => setMetaField("client_feedback", v)} />
              <PopupField label="Evaluation Notes" className="sm:col-span-3" type="textarea" value={meta.evaluation_notes} editing={editing} onChange={(v) => setMetaField("evaluation_notes", v)} />
            </div>
          )}

          <hr className="border-slate-200" />

          {/* Bottom 3-Column Section: Company Details | Contact Person | Lead Information */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Company Details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-bold text-[#163D64]">Company Details</h4>
                {canManage && (
                  <button type="button" onClick={() => setEditing(true)} className="text-slate-500 hover:text-[#0876CD]">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="text-[#64748B]">Company</div>
                  {editing ? (
                    <input className="input mt-0.5 w-full text-xs" value={companyForm.company_name} onChange={(e) => setCompanyForm((f) => ({ ...f, company_name: e.target.value }))} />
                  ) : (
                    <div className="mt-0.5 text-sm font-semibold text-[#0F172A]">{companyForm.company_name || "—"}</div>
                  )}
                </div>
                <div>
                  <div className="text-[#64748B]">Industry</div>
                  {editing ? (
                    <input className="input mt-0.5 w-full text-xs" value={companyForm.industry} onChange={(e) => setCompanyForm((f) => ({ ...f, industry: e.target.value }))} />
                  ) : (
                    <div className="mt-0.5 text-sm font-semibold text-[#0F172A]">{companyForm.industry || "—"}</div>
                  )}
                </div>
                <div>
                  <div className="text-[#64748B]">Website</div>
                  {editing ? (
                    <input className="input mt-0.5 w-full text-xs" value={companyForm.website} onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))} />
                  ) : companyForm.website ? (
                    <a
                      href={companyForm.website.startsWith("http") ? companyForm.website : `https://${companyForm.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-[#0876CD] hover:underline"
                    >
                      {companyForm.website} <ExternalLink size={12} />
                    </a>
                  ) : (
                    <div className="mt-0.5 text-sm text-slate-400">—</div>
                  )}
                </div>
                <div>
                  <div className="text-[#64748B]">Address</div>
                  {editing ? (
                    <input className="input mt-0.5 w-full text-xs" value={companyForm.address} onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))} />
                  ) : (
                    <div className="mt-0.5 text-sm font-semibold text-[#0F172A]">{companyForm.address || "—"}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Contact Person */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-bold text-[#163D64]">Contact Person</h4>
                {canManage && (
                  <button type="button" onClick={() => setEditing(true)} className="text-slate-500 hover:text-[#0876CD]">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              {editing ? (
                <div className="space-y-2 text-xs">
                  <input className="input w-full text-xs" value={contactForm.contact_name} onChange={(e) => setContactForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Nama PIC" />
                  <input className="input w-full text-xs" value={contactForm.job_title} onChange={(e) => setContactForm((f) => ({ ...f, job_title: e.target.value }))} placeholder="Jabatan" />
                  <input className="input w-full text-xs" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="No. Telepon" />
                  <input className="input w-full text-xs" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div>
                    <div className="text-sm font-bold text-[#0F172A] break-words">{contactForm.contact_name || "—"}</div>
                    <div className="mt-1">
                      <span className="inline-block rounded-full bg-[#EDF6FE] px-2 py-0.5 text-[10px] font-semibold text-[#0876CD]">Primary</span>
                    </div>
                    <div className="mt-0.5 text-xs text-[#64748B]">{contactForm.job_title || "PIC Utama"}</div>
                  </div>
                  <div className="pt-1 space-y-1 text-xs text-[#334155]">
                    <div className="flex items-center gap-2"><Phone size={13} className="text-slate-500" /> {contactForm.phone || "—"}</div>
                    <div className="flex items-center gap-2"><Mail size={13} className="text-slate-500" /> {contactForm.email || "—"}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Lead Information */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-bold text-[#163D64]">Lead Information</h4>
                {canManage && (
                  <button type="button" onClick={() => setEditing(true)} className="text-slate-500 hover:text-[#0876CD]">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[#64748B]">Brand / Unit Bisnis</div>
                  {editing ? (
                    <select
                      className="input mt-0.5 w-full text-xs bg-white"
                      value={leadInfoForm.brand_id}
                      onChange={(e) => setLeadInfoForm((f) => ({ ...f, brand_id: e.target.value }))}
                    >
                      <option value="">-- Pilih Brand --</option>
                      {(data.brands || []).map((b: any) => (
                        <option key={b.id} value={String(b.id)}>
                          [{b.brand_code}] {b.brand_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-0.5 text-sm font-semibold text-[#0876CD]">
                      {(data.brands || []).find((b: any) => String(b.id) === String(leadInfoForm.brand_id))?.brand_name || "Lintas Brand"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[#64748B]">Project Type</div>
                  {editing ? (
                    <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.project_type} onChange={(e) => setLeadInfoForm((f) => ({ ...f, project_type: e.target.value }))} />
                  ) : (
                    <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.project_type || "—"}</div>
                  )}
                </div>
                <div>
                  <div className="text-[#64748B]">Interested Service</div>
                  {editing ? (
                    <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.interested_service} onChange={(e) => setLeadInfoForm((f) => ({ ...f, interested_service: e.target.value }))} />
                  ) : (
                    <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.interested_service || "—"}</div>
                  )}
                </div>
                <div>
                  <div className="text-[#64748B]">Source</div>
                  {editing ? (
                    <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.lead_source} onChange={(e) => setLeadInfoForm((f) => ({ ...f, lead_source: e.target.value }))} />
                  ) : (
                    <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{leadInfoForm.lead_source || "—"}</div>
                  )}
                </div>
                <div className="col-span-2 min-w-0">
                  <div className="text-[#64748B]">Assigned to</div>
                  <div className="mt-1"><CRMAvatarBadge name={opp._ownerName || "Unassigned"} size="xs" /></div>
                </div>
                <div className="col-span-2 sm:col-span-1 min-w-0">
                  <div className="text-[#64748B]">Created at</div>
                  <div className="mt-0.5 text-sm font-medium text-[#0F172A]">{formatDate(opp.created_at || opp.opened_at)}</div>
                </div>
                {bucket !== "PROSPECT" && (
                  <div className="min-w-0">
                    <div className="text-[#64748B]">Internal PIC</div>
                    {editing ? (
                      <input className="input mt-0.5 w-full text-xs" value={leadInfoForm.internal_pic} onChange={(e) => setLeadInfoForm((f) => ({ ...f, internal_pic: e.target.value }))} />
                    ) : (
                      <div className="mt-1"><CRMAvatarBadge name={leadInfoForm.internal_pic || opp._ownerName || "PIC"} size="xs" /></div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {canManage && !isClosed && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onMarkLost(opp);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2 text-xs font-bold text-[#B91C1C] hover:bg-[#FEE2E2]"
              >
                <XCircle size={14} /> Mark Lost
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewEstimate();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Calculator size={14} /> Estimate &amp; Quotation
            </button>
            {canDelegate && onOpenDelegate && !isClosed && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDelegate(opp);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#BAE6FD] bg-[#EDF6FF] px-3.5 py-2 text-xs font-bold text-[#163D64] hover:bg-[#E7F2FF]"
              >
                <UserPlus size={14} /> Delegasi PIC
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {opp._party && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCustomer360(opp.id);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Customer 360
              </button>
            )}
            {canManage && !isClosed && opp._party && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDealWon(opp);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#059669] px-4 py-2 text-xs font-bold text-white hover:bg-[#047857]"
              >
                <CheckCircle2 size={14} /> Process Deal Won
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


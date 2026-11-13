"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Building2, Users, Plus, Download, Pencil, ArrowRightLeft,
  FolderKanban, Mail, Phone, MapPin, Briefcase, CheckCircle2,
  Award, Layers, Table2,
} from "lucide-react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import api from "@/lib/api/axios";
import {
  CRMData,
  convertCRMProspect,
  loadCRMPartyContacts,
  saveCRMPartyContact,
} from "@/lib/api/crm.api";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import {
  CRMAvatarBadge,
  CRMFilterBar,
  CRMKpiItem,
  CRMKpiRow,
  CRMRightDrawer,
} from "./CrmDesignSystem";

const COMPANY_TYPE_META: Record<string, { label: string; badge: string }> = {
  CUSTOMER: { label: "Client", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PROSPECT: { label: "Prospect", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  PARTNER: { label: "Partner", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  SUPPLIER: { label: "Vendor", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  VENDOR: { label: "Vendor", badge: "bg-blue-50 text-blue-700 border-blue-200" },
};

const CONTACT_TYPE_META: Record<string, { label: string; badge: string }> = {
  DECISION_MAKER: { label: "Decision Maker", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  PROCUREMENT: { label: "Procurement", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  MARKETING: { label: "Marketing", badge: "bg-pink-50 text-pink-700 border-pink-200" },
  EVENT_PIC: { label: "Event PIC", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  GENERAL: { label: "General", badge: "bg-slate-100 text-slate-700 border-slate-200" },
};

function normalizeCompanyType(raw: unknown): "CUSTOMER" | "PROSPECT" | "PARTNER" | "VENDOR" {
  const upper = String(raw || "CUSTOMER").toUpperCase();
  if (upper === "SUPPLIER" || upper === "VENDOR") return "VENDOR";
  if (upper === "PROSPECT") return "PROSPECT";
  if (upper === "PARTNER") return "PARTNER";
  return "CUSTOMER";
}

function normalizeContactType(raw: unknown, jobTitle?: string): string {
  const upper = String(raw || "").trim().toUpperCase();
  if (CONTACT_TYPE_META[upper]) return upper;
  const title = String(jobTitle || "").toLowerCase();
  if (/ceo|cto|cfo|director|direktur|vp|head|owner|founder|gm|manager/.test(title)) return "DECISION_MAKER";
  if (/procure|purchasing|buyer|vendor|supply/.test(title)) return "PROCUREMENT";
  if (/market|brand|pr|promo|comm/.test(title)) return "MARKETING";
  if (/event|eo|pic|koordinator|coordinator|project/.test(title)) return "EVENT_PIC";
  return "GENERAL";
}

/* ════════════════════════════════════════════════════════════════════════════
   SUB-TAB 3: COMPANY MANAGEMENT (UNIFIED + COMBINED COMPANY & CONTACTS VIEW)
   ════════════════════════════════════════════════════════════════════════════ */
export function CrmCompaniesView({
  data,
  teamUsers,
  onRefresh,
  onPartyCreated,
  readOnly = false,
  currentUserId,
  canEditAll = false,
}: {
  data: CRMData;
  teamUsers: any[];
  onRefresh: () => void;
  onPartyCreated: (party: any) => void;
  readOnly?: boolean;
  currentUserId?: string;
  canEditAll?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"COMPANIES" | "COMBINED">("COMPANIES");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drawer
  const [drawerParty, setDrawerParty] = useState<any | null>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "contacts" | "deals">("overview");
  const [drawerContacts, setDrawerContacts] = useState<any[]>([]);
  const [drawerContactsLoading, setDrawerContactsLoading] = useState(false);

  // Add / Edit Company Modal
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<any | null>(null);
  const [savingParty, setSavingParty] = useState(false);
  const [partyForm, setPartyForm] = useState({
    display_name: "",
    legal_name: "",
    party_code: "",
    party_type: "CUSTOMER",
    industry: "",
    email: "",
    phone: "",
    city: "",
    website: "",
    owner_user_id: "",
    notes: "",
    status: "ACTIVE",
  });

  // Quick Add Contact inside Company Drawer
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [quickContactSaving, setQuickContactSaving] = useState(false);
  const [quickContactForm, setQuickContactForm] = useState({
    contact_name: "",
    job_title: "",
    department: "",
    contact_type: "EVENT_PIC",
    email: "",
    phone: "",
    primary_contact: false,
    notes: "",
  });

  // Project linking modal for Vendor/Partner
  const [projectParty, setProjectParty] = useState<any | null>(null);
  const [projectOptions, setProjectOptions] = useState<any[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsSaving, setProjectsSaving] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const userById = useMemo(
    () => new Map(teamUsers.map((u: any) => [String(u.id), u])),
    [teamUsers]
  );

  const primaryContactByParty = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of data.contacts || []) {
      const pid = String(c.party_id || "");
      if (!pid) continue;
      if (!map.has(pid) || c.primary_contact) map.set(pid, c);
    }
    return map;
  }, [data.contacts]);

  const enrichedParties = useMemo(() => {
    return (data.parties || []).map((p: any) => {
      const pc = primaryContactByParty.get(String(p.id));
      const normType = normalizeCompanyType(p.party_type);
      const ownerId = String(p.owner_user_id || p.created_by_id || "");
      const ownerUser = userById.get(ownerId);
      return {
        ...p,
        _normType: normType,
        _email: p.email || pc?.email || "",
        _phone: p.phone || pc?.phone || "",
        _city: p.city || "",
        _industry: p.industry || "",
        _ownerName: ownerUser?.full_name || ownerUser?.email || "Tim CRM",
        _ownerId: ownerId,
      };
    });
  }, [data.parties, primaryContactByParty, userById]);

  const kpiItems: CRMKpiItem[] = useMemo(() => {
    const total = enrichedParties.length;
    const clients = enrichedParties.filter((p) => p._normType === "CUSTOMER").length;
    const prospects = enrichedParties.filter((p) => p._normType === "PROSPECT").length;
    const partners = enrichedParties.filter((p) => p._normType === "PARTNER").length;
    const vendors = enrichedParties.filter((p) => p._normType === "VENDOR").length;
    return [
      { id: "ALL", label: "Total Companies", value: total, tone: "blue", icon: Building2, active: typeFilter === "ALL", onClick: () => setTypeFilter("ALL") },
      { id: "CUSTOMER", label: "Client", value: clients, tone: "green", icon: CheckCircle2, active: typeFilter === "CUSTOMER", onClick: () => setTypeFilter(typeFilter === "CUSTOMER" ? "ALL" : "CUSTOMER") },
      { id: "PROSPECT", label: "Prospect", value: prospects, tone: "amber", icon: Users, active: typeFilter === "PROSPECT", onClick: () => setTypeFilter(typeFilter === "PROSPECT" ? "ALL" : "PROSPECT") },
      { id: "PARTNER", label: "Partner", value: partners, tone: "purple", icon: Layers, active: typeFilter === "PARTNER", onClick: () => setTypeFilter(typeFilter === "PARTNER" ? "ALL" : "PARTNER") },
      { id: "VENDOR", label: "Vendor", value: vendors, tone: "blue", icon: Briefcase, active: typeFilter === "VENDOR", onClick: () => setTypeFilter(typeFilter === "VENDOR" ? "ALL" : "VENDOR") },
    ];
  }, [enrichedParties, typeFilter]);

  const industryOptions = useMemo(() => {
    const vals = Array.from(new Set(enrichedParties.map((p) => p._industry).filter(Boolean))).sort();
    return [{ value: "ALL", label: "All Industry" }, ...vals.map((v) => ({ value: v, label: v }))];
  }, [enrichedParties]);

  const cityOptions = useMemo(() => {
    const vals = Array.from(new Set(enrichedParties.map((p) => p._city).filter(Boolean))).sort();
    return [{ value: "ALL", label: "All City" }, ...vals.map((v) => ({ value: v, label: v }))];
  }, [enrichedParties]);

  const filteredParties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedParties.filter((p) => {
      if (typeFilter !== "ALL" && p._normType !== typeFilter) return false;
      if (industryFilter !== "ALL" && p._industry !== industryFilter) return false;
      if (cityFilter !== "ALL" && p._city !== cityFilter) return false;
      if (ownerFilter !== "ALL" && p._ownerId !== ownerFilter) return false;
      if (!q) return true;
      return [p.display_name, p.legal_name, p.party_code, p._industry, p._email, p._phone, p._city, p.notes]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [enrichedParties, typeFilter, industryFilter, cityFilter, ownerFilter, search]);

  const openAddCompany = () => {
    setEditingParty(null);
    setPartyForm({
      display_name: "",
      legal_name: "",
      party_code: "",
      party_type: "CUSTOMER",
      industry: "",
      email: "",
      phone: "",
      city: "",
      website: "",
      owner_user_id: currentUserId || "",
      notes: "",
      status: "ACTIVE",
    });
    setIsCompanyModalOpen(true);
  };

  const openEditCompany = (party: any) => {
    setEditingParty(party);
    setPartyForm({
      display_name: party.display_name || "",
      legal_name: party.legal_name || "",
      party_code: party.party_code || "",
      party_type: party.party_type || "CUSTOMER",
      industry: party.industry || "",
      email: party.email || party._email || "",
      phone: party.phone || party._phone || "",
      city: party.city || "",
      website: party.website || "",
      owner_user_id: party.owner_user_id || "",
      notes: party.notes || "",
      status: party.status || "ACTIVE",
    });
    setIsCompanyModalOpen(true);
  };

  const handleSaveCompany = async () => {
    if (!partyForm.display_name.trim() && !partyForm.legal_name.trim()) {
      toast.error("Nama perusahaan wajib diisi.");
      return;
    }
    setSavingParty(true);
    try {
      const payload = {
        display_name: partyForm.display_name.trim() || partyForm.legal_name.trim(),
        legal_name: partyForm.legal_name.trim() || partyForm.display_name.trim(),
        party_code:
          partyForm.party_code.trim() ||
          `${partyForm.party_type === "SUPPLIER" || partyForm.party_type === "VENDOR" ? "VND" : partyForm.party_type === "PARTNER" ? "PRT" : partyForm.party_type === "PROSPECT" ? "PROS" : "CUST"}-${Date.now().toString().slice(-4)}`,
        party_type: partyForm.party_type,
        industry: partyForm.industry.trim() || null,
        email: partyForm.email.trim() || null,
        phone: partyForm.phone.trim() || null,
        city: partyForm.city.trim() || null,
        website: partyForm.website.trim() || null,
        owner_user_id: partyForm.owner_user_id || null,
        notes: partyForm.notes.trim() || null,
        tax_number: editingParty?.tax_number ?? "",
        status: partyForm.status,
      };
      if (editingParty) {
        await api.patch(`/api/v1/master-data/parties/${editingParty.id}/`, payload);
        toast.success("Data perusahaan berhasil diperbarui.");
      } else {
        const { data: res } = await api.post("/api/v1/master-data/parties/", payload);
        const created = res?.data ?? res;
        onPartyCreated(created);
        toast.success("Perusahaan baru berhasil ditambahkan.");
      }
      setIsCompanyModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.response?.data?.error?.message || "Gagal menyimpan data perusahaan.");
    } finally {
      setSavingParty(false);
    }
  };

  const openCompanyDrawer = async (party: any) => {
    setDrawerParty(party);
    setDrawerTab("overview");
    setDrawerContactsLoading(true);
    try {
      setDrawerContacts(await loadCRMPartyContacts(party.id));
    } catch {
      setDrawerContacts((data.contacts || []).filter((c: any) => String(c.party_id) === String(party.id)));
    } finally {
      setDrawerContactsLoading(false);
    }
  };

  const handleConvertToClient = async (party: any) => {
    setConvertingId(String(party.id));
    try {
      await convertCRMProspect(party.id);
      toast.success(`${party.display_name || party.legal_name} berhasil dikonversi menjadi Client.`);
      setDrawerParty(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal mengkonversi Prospect menjadi Client.");
    } finally {
      setConvertingId(null);
    }
  };

  const handleSaveQuickContact = async () => {
    if (!drawerParty || !quickContactForm.contact_name.trim()) {
      toast.error("Nama kontak wajib diisi.");
      return;
    }
    setQuickContactSaving(true);
    try {
      await saveCRMPartyContact({
        party_id: String(drawerParty.id),
        contact_name: quickContactForm.contact_name.trim(),
        job_title: quickContactForm.job_title.trim(),
        department: quickContactForm.department.trim() || null,
        contact_type: quickContactForm.contact_type,
        email: quickContactForm.email.trim(),
        phone: quickContactForm.phone.trim(),
        primary_contact: quickContactForm.primary_contact,
        notes: quickContactForm.notes.trim() || null,
      });
      toast.success("Kontak berhasil ditambahkan ke perusahaan.");
      setQuickContactOpen(false);
      setQuickContactForm({ contact_name: "", job_title: "", department: "", contact_type: "EVENT_PIC", email: "", phone: "", primary_contact: false, notes: "" });
      setDrawerContacts(await loadCRMPartyContacts(drawerParty.id));
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan kontak.");
    } finally {
      setQuickContactSaving(false);
    }
  };

  const openProjectManager = async (party: any) => {
    setProjectParty(party);
    setProjectsLoading(true);
    try {
      const { data: result } = await api.get(`/api/v1/crm/parties/${party.id}/projects`);
      setProjectOptions(Array.isArray(result?.projects) ? result.projects : []);
      setSelectedProjectIds(Array.isArray(result?.project_ids) ? result.project_ids : []);
    } catch (error: any) {
      setProjectParty(null);
      toast.error(error?.response?.data?.detail || "Gagal memuat daftar proyek rekanan.");
    } finally {
      setProjectsLoading(false);
    }
  };

  const savePartyProjects = async () => {
    if (!projectParty) return;
    setProjectsSaving(true);
    try {
      await api.put(`/api/v1/crm/parties/${projectParty.id}/projects`, { project_ids: selectedProjectIds });
      toast.success("Relasi proyek rekanan berhasil disimpan.");
      setProjectParty(null);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Relasi proyek rekanan gagal disimpan.");
    } finally {
      setProjectsSaving(false);
    }
  };

  const handleExportCompanies = () => {
    const wb = XLSX.utils.book_new();
    const rows = filteredParties.map((p) => [
      p.display_name || p.legal_name || "",
      p.party_code || "",
      p._industry || "",
      COMPANY_TYPE_META[p._normType]?.label || p.party_type,
      p._email || "",
      p._phone || "",
      p._city || "",
      p._ownerName || "",
      p.notes || "",
      p.status || "ACTIVE",
    ]);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Company Name", "Code", "Industry", "Company Type", "Email", "Phone", "City", "Account Owner", "Notes", "Status"],
        ...rows,
      ]),
      "Companies"
    );
    XLSX.writeFile(wb, `CRM_Companies_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} perusahaan diekspor.`);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredParties.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredParties.map((p) => String(p.id))));
    }
  };

  const drawerOpportunities = useMemo(() => {
    if (!drawerParty) return [];
    return (data.opportunities || []).filter(
      (o: any) => String(o.customer_party_id || o.customer_party || "") === String(drawerParty.id)
    );
  }, [drawerParty, data.opportunities]);

  return (
    <div className="flex flex-col gap-4">
      <CRMKpiRow items={kpiItems} columns={5} />

      <CRMFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari perusahaan, kode, email, kota..."
        filters={[
          { id: "industry", value: industryFilter, onChange: setIndustryFilter, options: industryOptions, ariaLabel: "Filter Industri" },
          {
            id: "companyType",
            value: typeFilter,
            onChange: setTypeFilter,
            ariaLabel: "Filter Tipe Perusahaan",
            options: [
              { value: "ALL", label: "All Company Type" },
              { value: "CUSTOMER", label: "Client" },
              { value: "PROSPECT", label: "Prospect" },
              { value: "PARTNER", label: "Partner" },
              { value: "VENDOR", label: "Vendor" },
            ],
          },
          { id: "city", value: cityFilter, onChange: setCityFilter, options: cityOptions, ariaLabel: "Filter Kota" },
          {
            id: "owner",
            value: ownerFilter,
            onChange: setOwnerFilter,
            ariaLabel: "Filter Account Owner",
            options: [
              { value: "ALL", label: "All Account Owner" },
              ...teamUsers.map((u: any) => ({ value: String(u.id), label: u.full_name || u.email })),
            ],
          },
        ]}
        viewOptions={[
          { id: "COMPANIES", label: "Companies", icon: Table2 },
          { id: "COMBINED", label: "Company & Contacts", icon: Layers },
        ]}
        activeView={viewMode}
        onViewChange={(v) => setViewMode(v as "COMPANIES" | "COMBINED")}
        rightActions={
          <>
            <button
              type="button"
              onClick={handleExportCompanies}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download size={13} /> Export
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={openAddCompany}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#163D64] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#163D64]"
              >
                <Plus size={14} /> Add Company
              </button>
            )}
          </>
        }
      />

      {/* Companies Master Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Companies Directory</h3>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-[#0876CD]">
              {filteredParties.length} perusahaan
            </span>
          </div>
          {selectedIds.size > 0 && (
            <span className="text-xs font-medium text-[#0876CD]">{selectedIds.size} dipilih</span>
          )}
        </div>

        {filteredParties.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Tidak ada perusahaan yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="max-h-[540px] overflow-auto">
            <table className="w-full min-w-[1060px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={filteredParties.length > 0 && selectedIds.size === filteredParties.length}
                      onChange={toggleSelectAll}
                      aria-label="Pilih semua perusahaan"
                    />
                  </th>
                  <th className="px-3 py-3">Company Name</th>
                  <th className="px-3 py-3">Industry</th>
                  <th className="px-3 py-3">Company Type</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">City</th>
                  <th className="px-3 py-3">Account Owner</th>
                  <th className="px-3 py-3">Notes</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParties.map((p: any) => {
                  const typeMeta = COMPANY_TYPE_META[p._normType] || COMPANY_TYPE_META.CUSTOMER;
                  const canEditRow = !readOnly && (canEditAll || Boolean(currentUserId && String(p.created_by_id) === currentUserId));
                  return (
                    <tr
                      key={p.id}
                      onClick={() => void openCompanyDrawer(p)}
                      className="cursor-pointer transition-colors hover:bg-[#EBF5FF]/45"
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(String(p.id))}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(String(p.id));
                            else next.delete(String(p.id));
                            setSelectedIds(next);
                          }}
                          aria-label={`Pilih ${p.display_name || p.legal_name}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">{p.display_name || p.legal_name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {p.party_code || "—"}
                          {p.legal_name && p.legal_name !== p.display_name ? ` · ${p.legal_name}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{p._industry || "—"}</td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", typeMeta.badge)}>
                          {typeMeta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{p._email || "—"}</td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{p._phone || "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{p._city || "—"}</td>
                      <td className="px-3 py-3">
                        <CRMAvatarBadge name={p._ownerName} size="xs" />
                      </td>
                      <td className="px-3 py-3 max-w-[160px] truncate text-slate-500" title={p.notes || ""}>
                        {p.notes || "—"}
                      </td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {canEditRow && p._normType === "PROSPECT" && (
                            <button
                              type="button"
                              disabled={convertingId === String(p.id)}
                              onClick={() => void handleConvertToClient(p)}
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                              title="Konversi Prospect menjadi Client"
                            >
                              {convertingId === String(p.id) ? "..." : "To Client"}
                            </button>
                          )}
                          {canEditRow && ["VENDOR", "PARTNER"].includes(p._normType) && (
                            <button
                              type="button"
                              onClick={() => void openProjectManager(p)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                              title="Hubungkan ke Proyek"
                            >
                              <FolderKanban size={12} />
                            </button>
                          )}
                          {canEditRow && (
                            <button
                              type="button"
                              onClick={() => openEditCompany(p)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil size={11} /> Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Combined View: Contacts Section Stacked Below (Reference Design 5) */}
      {viewMode === "COMBINED" && (
        <div className="mt-2">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Contact Persons (Linked Directory)</h3>
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
              {(data.contacts || []).length} kontak
            </span>
          </div>
          <CrmContactsView
            data={data}
            onRefresh={onRefresh}
            readOnly={readOnly}
            currentUserId={currentUserId}
            canEditAll={canEditAll}
            compactMode
          />
        </div>
      )}

      {/* Right Contextual Drawer: Company Details */}
      <CRMRightDrawer
        isOpen={Boolean(drawerParty)}
        onClose={() => setDrawerParty(null)}
        title={drawerParty?.display_name || drawerParty?.legal_name || "Company Details"}
        subtitle={drawerParty?.party_code ? `Kode: ${drawerParty.party_code}` : undefined}
        badge={
          drawerParty && (
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                (COMPANY_TYPE_META[drawerParty._normType] || COMPANY_TYPE_META.CUSTOMER).badge
              )}
            >
              {(COMPANY_TYPE_META[drawerParty._normType] || COMPANY_TYPE_META.CUSTOMER).label}
            </span>
          )
        }
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "contacts", label: "Contacts", badge: drawerContacts.length },
          { id: "deals", label: "Opportunities", badge: drawerOpportunities.length },
        ]}
        activeTab={drawerTab}
        onTabChange={(t) => setDrawerTab(t as any)}
        footer={
          drawerParty && (
            <>
              {!readOnly && drawerParty._normType === "PROSPECT" && (
                <button
                  type="button"
                  disabled={convertingId === String(drawerParty.id)}
                  onClick={() => void handleConvertToClient(drawerParty)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <ArrowRightLeft size={13} /> Convert to Client
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    const target = drawerParty;
                    setDrawerParty(null);
                    openEditCompany(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#163D64] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#163D64]"
                >
                  <Pencil size={13} /> Edit Company
                </button>
              )}
            </>
          )
        }
      >
        {drawerParty && drawerTab === "overview" && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div>
                <div className="text-slate-400">Nama Legal</div>
                <div className="mt-0.5 font-semibold text-slate-900">{drawerParty.legal_name || "—"}</div>
              </div>
              <div>
                <div className="text-slate-400">Industri</div>
                <div className="mt-0.5 font-semibold text-slate-900">{drawerParty._industry || "—"}</div>
              </div>
              <div>
                <div className="text-slate-400 flex items-center gap-1"><Mail size={11} /> Email</div>
                <div className="mt-0.5 font-medium text-slate-800 break-all">{drawerParty._email || "—"}</div>
              </div>
              <div>
                <div className="text-slate-400 flex items-center gap-1"><Phone size={11} /> Telepon</div>
                <div className="mt-0.5 font-medium text-slate-800">{drawerParty._phone || "—"}</div>
              </div>
              <div>
                <div className="text-slate-400 flex items-center gap-1"><MapPin size={11} /> Kota</div>
                <div className="mt-0.5 font-medium text-slate-800">{drawerParty._city || "—"}</div>
              </div>
              <div>
                <div className="text-slate-400">Account Owner</div>
                <div className="mt-1"><CRMAvatarBadge name={drawerParty._ownerName} size="xs" /></div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="font-semibold text-slate-700 mb-1">Catatan</div>
              <p className="text-slate-600 whitespace-pre-wrap">{drawerParty.notes || "Belum ada catatan untuk perusahaan ini."}</p>
            </div>
          </div>
        )}

        {drawerParty && drawerTab === "contacts" && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Daftar PIC / Kontak ({drawerContacts.length})</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setQuickContactOpen(!quickContactOpen)}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 font-semibold text-[#0876CD] hover:bg-blue-100"
                >
                  <Plus size={12} /> Tambah Kontak
                </button>
              )}
            </div>

            {quickContactOpen && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-xs" placeholder="Nama lengkap *" value={quickContactForm.contact_name} onChange={(e) => setQuickContactForm((f) => ({ ...f, contact_name: e.target.value }))} />
                  <input className="input text-xs" placeholder="Jabatan" value={quickContactForm.job_title} onChange={(e) => setQuickContactForm((f) => ({ ...f, job_title: e.target.value }))} />
                  <input className="input text-xs" placeholder="Departemen" value={quickContactForm.department} onChange={(e) => setQuickContactForm((f) => ({ ...f, department: e.target.value }))} />
                  <select className="input text-xs bg-white" value={quickContactForm.contact_type} onChange={(e) => setQuickContactForm((f) => ({ ...f, contact_type: e.target.value }))}>
                    {Object.entries(CONTACT_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input className="input text-xs" placeholder="Email" value={quickContactForm.email} onChange={(e) => setQuickContactForm((f) => ({ ...f, email: e.target.value }))} />
                  <input className="input text-xs" placeholder="Telepon" value={quickContactForm.phone} onChange={(e) => setQuickContactForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={quickContactForm.primary_contact} onChange={(e) => setQuickContactForm((f) => ({ ...f, primary_contact: e.target.checked }))} />
                  Jadikan kontak utama
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setQuickContactOpen(false)} className="btn-ghost text-xs">Batal</button>
                  <button type="button" disabled={quickContactSaving} onClick={() => void handleSaveQuickContact()} className="rounded-lg bg-[#163D64] px-3 py-1.5 text-xs font-semibold text-white">
                    {quickContactSaving ? "Menyimpan..." : "Simpan Kontak"}
                  </button>
                </div>
              </div>
            )}

            {drawerContactsLoading ? (
              <p className="py-6 text-center text-slate-400">Memuat kontak...</p>
            ) : drawerContacts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-slate-400">Belum ada kontak terdaftar.</p>
            ) : (
              <div className="space-y-2">
                {drawerContacts.map((c: any) => {
                  const cType = normalizeContactType(c.contact_type, c.job_title);
                  const cMeta = CONTACT_TYPE_META[cType] || CONTACT_TYPE_META.GENERAL;
                  return (
                    <div key={c.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <CRMAvatarBadge name={c.contact_name} subtitle={[c.job_title, c.department].filter(Boolean).join(" · ")} size="xs" />
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", cMeta.badge)}>{cMeta.label}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                        {c.email && <span>{c.email}</span>}
                        {c.phone && <span>{c.phone}</span>}
                        {c.primary_contact && <span className="font-semibold text-[#0876CD]">★ Primary</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {drawerParty && drawerTab === "deals" && (
          <div className="space-y-2.5 text-xs">
            {drawerOpportunities.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-slate-400">Belum ada Opportunity terkait.</p>
            ) : (
              drawerOpportunities.map((o: any) => (
                <div key={o.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{o.opportunity_name}</span>
                    <span className="font-bold text-[#0876CD]">{formatMoney(o.expected_amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Stage: {o.pipeline_stage || o.status}</span>
                    <span>Prob: {o.probability_percent ?? 0}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CRMRightDrawer>

      {/* Add / Edit Company Modal */}
      <Modal
        isOpen={isCompanyModalOpen}
        onClose={() => !savingParty && setIsCompanyModalOpen(false)}
        title={editingParty ? "Edit Company" : "Add New Company"}
        size="md"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 text-xs">
          <label className="font-medium text-slate-600">
            Company Name *
            <input className="input mt-1 w-full" value={partyForm.display_name} onChange={(e) => setPartyForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="Contoh: PT Maju Jaya" />
          </label>
          <label className="font-medium text-slate-600">
            Legal Name
            <input className="input mt-1 w-full" value={partyForm.legal_name} onChange={(e) => setPartyForm((f) => ({ ...f, legal_name: e.target.value }))} placeholder="Nama badan hukum" />
          </label>
          <label className="font-medium text-slate-600">
            Company Type *
            <select className="input mt-1 w-full bg-white" value={partyForm.party_type} onChange={(e) => setPartyForm((f) => ({ ...f, party_type: e.target.value }))}>
              <option value="CUSTOMER">Client (Customer)</option>
              <option value="PROSPECT">Prospect (Calon Customer)</option>
              <option value="PARTNER">Partner</option>
              <option value="SUPPLIER">Vendor / Supplier</option>
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Industry
            <input className="input mt-1 w-full" value={partyForm.industry} onChange={(e) => setPartyForm((f) => ({ ...f, industry: e.target.value }))} placeholder="Contoh: Teknologi, FMCG, Konstruksi" />
          </label>
          <label className="font-medium text-slate-600">
            Email
            <input type="email" className="input mt-1 w-full" value={partyForm.email} onChange={(e) => setPartyForm((f) => ({ ...f, email: e.target.value }))} placeholder="info@perusahaan.com" />
          </label>
          <label className="font-medium text-slate-600">
            Phone
            <input className="input mt-1 w-full" value={partyForm.phone} onChange={(e) => setPartyForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+62 21 ..." />
          </label>
          <label className="font-medium text-slate-600">
            City
            <input className="input mt-1 w-full" value={partyForm.city} onChange={(e) => setPartyForm((f) => ({ ...f, city: e.target.value }))} placeholder="Jakarta, Surabaya, Bandung..." />
          </label>
          <label className="font-medium text-slate-600">
            Account Owner
            <select className="input mt-1 w-full bg-white" value={partyForm.owner_user_id} onChange={(e) => setPartyForm((f) => ({ ...f, owner_user_id: e.target.value }))}>
              <option value="">-- Pilih PIC --</option>
              {teamUsers.map((u: any) => (
                <option key={u.id} value={String(u.id)}>{u.full_name || u.email}</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Kode Rekanan
            <input className="input mt-1 w-full" value={partyForm.party_code} onChange={(e) => setPartyForm((f) => ({ ...f, party_code: e.target.value }))} placeholder="Auto-generate jika kosong" />
          </label>
          <label className="font-medium text-slate-600">
            Status
            <select className="input mt-1 w-full bg-white" value={partyForm.status} onChange={(e) => setPartyForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </label>
          <label className="font-medium text-slate-600 sm:col-span-2">
            Notes
            <textarea className="input mt-1 w-full min-h-20" value={partyForm.notes} onChange={(e) => setPartyForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Catatan profil perusahaan..." />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsCompanyModalOpen(false)} disabled={savingParty} className="btn-ghost">Batal</button>
            <button type="button" onClick={() => void handleSaveCompany()} disabled={savingParty} className="rounded-lg bg-[#163D64] px-4 py-2 text-xs font-semibold text-white hover:bg-[#163D64]">
              {savingParty ? "Menyimpan..." : editingParty ? "Simpan Perubahan" : "Simpan Company"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Project Linking Modal (Vendor/Partner) */}
      <Modal isOpen={Boolean(projectParty)} onClose={() => !projectsSaving && setProjectParty(null)} title={`Hubungkan Proyek · ${projectParty?.display_name || projectParty?.legal_name || "Rekanan"}`} size="md">
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs text-text-secondary">Pilih proyek yang memakai rekanan ini.</p>
          {projectsLoading ? <p className="py-4 text-center text-sm text-text-secondary">Memuat daftar proyek...</p> : projectOptions.length === 0 ? <p className="py-4 text-center text-xs text-slate-400">Belum ada proyek di company ini.</p> : (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-text-tertiary/50 divide-y divide-text-tertiary/30">
              {projectOptions.map((project) => (
                <label key={project.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-bg-lighter">
                  <input type="checkbox" className="mt-1" checked={selectedProjectIds.includes(project.id)} onChange={(event) => setSelectedProjectIds((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.project_name}</span><span className="mt-0.5 block text-xs text-text-secondary">{project.project_code} · {project.status || project.lifecycle_status || "—"}</span></span>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setProjectParty(null)} disabled={projectsSaving} className="btn-ghost">Batal</button><button type="button" onClick={() => void savePartyProjects()} disabled={projectsLoading || projectsSaving || projectOptions.length === 0} className="btn-primary">{projectsSaving ? "Menyimpan..." : "Simpan Relasi"}</button></div>
        </div>
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SUB-TAB 4: CONTACT MANAGEMENT
   ════════════════════════════════════════════════════════════════════════════ */
export function CrmContactsView({
  data,
  onRefresh,
  readOnly = false,
  currentUserId,
  canEditAll = false,
  compactMode = false,
}: {
  data: CRMData;
  onRefresh: () => void;
  readOnly?: boolean;
  currentUserId?: string;
  canEditAll?: boolean;
  compactMode?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"ALL" | "WON_CONTACTS">("ALL");
  const [wonContacts, setWonContacts] = useState<any[]>([]);
  const [wonLoading, setWonLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drawer & Modal
  const [drawerContact, setDrawerContact] = useState<any | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    party_id: "",
    contact_name: "",
    job_title: "",
    department: "",
    contact_type: "DECISION_MAKER",
    email: "",
    phone: "",
    primary_contact: false,
    notes: "",
  });

  useEffect(() => {
    if (viewMode !== "WON_CONTACTS") return;
    let active = true;
    setWonLoading(true);
    api.get("/api/v1/crm/won-contacts/?page_size=500")
      .then(({ data: res }) => {
        const payload = res?.data ?? res;
        const rows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.rows) ? payload.rows : [];
        if (active) setWonContacts(rows);
      })
      .catch(() => { if (active) setWonContacts([]); })
      .finally(() => { if (active) setWonLoading(false); });
    return () => { active = false; };
  }, [viewMode, data.opportunities]);

  const partyById = useMemo(
    () => new Map((data.parties || []).map((p: any) => [String(p.id), p])),
    [data.parties]
  );

  const enrichedContacts = useMemo(() => {
    return (data.contacts || []).map((c: any) => {
      const party = partyById.get(String(c.party_id || ""));
      const cType = normalizeContactType(c.contact_type, c.job_title);
      return {
        ...c,
        _companyName: party?.display_name || party?.legal_name || "Tanpa Perusahaan",
        _department: c.department || "—",
        _contactType: cType,
      };
    });
  }, [data.contacts, partyById]);

  const kpiItems: CRMKpiItem[] = useMemo(() => {
    const total = enrichedContacts.length;
    const dm = enrichedContacts.filter((c) => c._contactType === "DECISION_MAKER").length;
    const proc = enrichedContacts.filter((c) => c._contactType === "PROCUREMENT").length;
    const mkt = enrichedContacts.filter((c) => c._contactType === "MARKETING").length;
    const ev = enrichedContacts.filter((c) => c._contactType === "EVENT_PIC").length;
    return [
      { id: "ALL", label: "Total Contacts", value: total, tone: "blue", icon: Users, active: typeFilter === "ALL", onClick: () => setTypeFilter("ALL") },
      { id: "DECISION_MAKER", label: "Decision Maker", value: dm, tone: "purple", icon: Award, active: typeFilter === "DECISION_MAKER", onClick: () => setTypeFilter(typeFilter === "DECISION_MAKER" ? "ALL" : "DECISION_MAKER") },
      { id: "PROCUREMENT", label: "Procurement", value: proc, tone: "blue", icon: Briefcase, active: typeFilter === "PROCUREMENT", onClick: () => setTypeFilter(typeFilter === "PROCUREMENT" ? "ALL" : "PROCUREMENT") },
      { id: "MARKETING", label: "Marketing", value: mkt, tone: "pink", icon: Mail, active: typeFilter === "MARKETING", onClick: () => setTypeFilter(typeFilter === "MARKETING" ? "ALL" : "MARKETING") },
      { id: "EVENT_PIC", label: "Event PIC", value: ev, tone: "green", icon: CheckCircle2, active: typeFilter === "EVENT_PIC", onClick: () => setTypeFilter(typeFilter === "EVENT_PIC" ? "ALL" : "EVENT_PIC") },
    ];
  }, [enrichedContacts, typeFilter]);

  const deptOptions = useMemo(() => {
    const vals = Array.from(new Set(enrichedContacts.map((c) => c.department).filter(Boolean))).sort();
    return [{ value: "ALL", label: "All Department" }, ...vals.map((v) => ({ value: v, label: v }))];
  }, [enrichedContacts]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedContacts.filter((c) => {
      if (companyFilter !== "ALL" && String(c.party_id || "") !== companyFilter) return false;
      if (deptFilter !== "ALL" && String(c.department || "") !== deptFilter) return false;
      if (typeFilter !== "ALL" && c._contactType !== typeFilter) return false;
      if (!q) return true;
      return [c.contact_name, c._companyName, c.job_title, c.department, c.email, c.phone, c.notes]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [enrichedContacts, companyFilter, deptFilter, typeFilter, search]);

  const filteredWonContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return wonContacts.filter((w) => {
      if (!q) return true;
      return [w.customer_name, w.opportunity_name, w.contact_name, w.email, w.phone]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [wonContacts, search]);

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({
      party_id: (data.parties || [])[0]?.id ? String((data.parties || [])[0].id) : "",
      contact_name: "",
      job_title: "",
      department: "",
      contact_type: "DECISION_MAKER",
      email: "",
      phone: "",
      primary_contact: false,
      notes: "",
    });
    setIsContactModalOpen(true);
  };

  const openEditContact = (c: any) => {
    setEditingContact(c);
    setContactForm({
      party_id: String(c.party_id || ""),
      contact_name: c.contact_name || "",
      job_title: c.job_title || "",
      department: c.department || "",
      contact_type: normalizeContactType(c.contact_type, c.job_title),
      email: c.email || "",
      phone: c.phone || "",
      primary_contact: Boolean(c.primary_contact),
      notes: c.notes || "",
    });
    setIsContactModalOpen(true);
  };

  const handleSaveContact = async () => {
    if (!contactForm.contact_name.trim()) {
      toast.error("Nama lengkap kontak wajib diisi.");
      return;
    }
    setSavingContact(true);
    try {
      await saveCRMPartyContact({
        id: editingContact?.id ? String(editingContact.id) : undefined,
        party_id: contactForm.party_id || null,
        contact_name: contactForm.contact_name.trim(),
        job_title: contactForm.job_title.trim(),
        department: contactForm.department.trim() || null,
        contact_type: contactForm.contact_type,
        email: contactForm.email.trim(),
        phone: contactForm.phone.trim(),
        primary_contact: contactForm.primary_contact,
        notes: contactForm.notes.trim() || null,
      });
      toast.success(editingContact ? "Kontak berhasil diperbarui." : "Kontak baru berhasil ditambahkan.");
      setIsContactModalOpen(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Gagal menyimpan kontak.");
    } finally {
      setSavingContact(false);
    }
  };

  const handleExportContacts = () => {
    const wb = XLSX.utils.book_new();
    const rows = filteredContacts.map((c) => [
      c.contact_name || "",
      c._companyName || "",
      c.job_title || "",
      c.department || "",
      c.phone || "",
      c.email || "",
      CONTACT_TYPE_META[c._contactType]?.label || c._contactType,
      c.primary_contact ? "Yes" : "No",
      c.notes || "",
    ]);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Full Name", "Company", "Position", "Department", "Phone", "Email", "Contact Type", "Primary", "Notes"],
        ...rows,
      ]),
      "Contacts"
    );
    XLSX.writeFile(wb, `CRM_Contacts_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} kontak diekspor.`);
  };

  return (
    <div className="flex flex-col gap-4">
      {!compactMode && <CRMKpiRow items={kpiItems} columns={5} />}

      {!compactMode && (
        <CRMFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cari nama, perusahaan, jabatan, email..."
          filters={[
            {
              id: "company",
              value: companyFilter,
              onChange: setCompanyFilter,
              ariaLabel: "Filter Perusahaan",
              options: [
                { value: "ALL", label: "All Company" },
                ...(data.parties || []).map((p: any) => ({ value: String(p.id), label: p.display_name || p.legal_name })),
              ],
            },
            { id: "dept", value: deptFilter, onChange: setDeptFilter, options: deptOptions, ariaLabel: "Filter Department" },
            {
              id: "contactType",
              value: typeFilter,
              onChange: setTypeFilter,
              ariaLabel: "Filter Contact Type",
              options: [
                { value: "ALL", label: "All Contact Type" },
                ...Object.entries(CONTACT_TYPE_META).map(([k, v]) => ({ value: k, label: v.label })),
              ],
            },
          ]}
          viewOptions={[
            { id: "ALL", label: "All Contacts", badge: enrichedContacts.length },
            { id: "WON_CONTACTS", label: "Won Deal Contacts" },
          ]}
          activeView={viewMode}
          onViewChange={(v) => setViewMode(v as "ALL" | "WON_CONTACTS")}
          rightActions={
            <>
              <button
                type="button"
                onClick={handleExportContacts}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download size={13} /> Export
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={openAddContact}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#163D64] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#163D64]"
                >
                  <Plus size={14} /> Add Contact
                </button>
              )}
            </>
          }
        />
      )}

      {viewMode === "WON_CONTACTS" && !compactMode ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          {wonLoading ? (
            <p className="py-10 text-center text-xs text-slate-400">Memuat kontak dari Opportunity berhasil...</p>
          ) : filteredWonContacts.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">Belum ada kontak dari Opportunity berstatus Deal Won.</p>
          ) : (
            <div className="max-h-[540px] overflow-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Opportunity / Deal</th>
                    <th className="px-4 py-3">Contact / PIC</th>
                    <th className="px-4 py-3">Email &amp; Phone</th>
                    <th className="px-4 py-3">Won Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWonContacts.map((w: any) => (
                    <tr key={w.opportunity_id} className="hover:bg-[#EBF5FF]/40">
                      <td className="px-4 py-3 font-semibold text-slate-900">{w.customer_name || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{w.opportunity_name}</div>
                        <div className="text-[11px] text-emerald-700 font-semibold">{formatMoney(w.expected_amount)}</div>
                      </td>
                      <td className="px-4 py-3"><CRMAvatarBadge name={w.contact_name || "PIC"} subtitle={w.job_title} size="xs" /></td>
                      <td className="px-4 py-3 text-slate-600">{[w.email, w.phone].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{w.closed_at ? formatDate(w.closed_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          {filteredContacts.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-400">Tidak ada kontak yang sesuai filter.</p>
          ) : (
            <div className="max-h-[540px] overflow-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={filteredContacts.length > 0 && selectedIds.size === filteredContacts.length}
                        onChange={() => {
                          if (selectedIds.size === filteredContacts.length) setSelectedIds(new Set());
                          else setSelectedIds(new Set(filteredContacts.map((c) => String(c.id))));
                        }}
                        aria-label="Pilih semua kontak"
                      />
                    </th>
                    <th className="px-3 py-3">Full Name</th>
                    <th className="px-3 py-3">Company</th>
                    <th className="px-3 py-3">Position</th>
                    <th className="px-3 py-3">Department</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Contact Type</th>
                    <th className="px-3 py-3">Notes</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredContacts.map((c: any) => {
                    const typeMeta = CONTACT_TYPE_META[c._contactType] || CONTACT_TYPE_META.GENERAL;
                    const canEditRow = !readOnly && (canEditAll || Boolean(currentUserId && String(c.created_by_id) === currentUserId));
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setDrawerContact(c)}
                        className="cursor-pointer transition-colors hover:bg-[#EBF5FF]/45"
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(String(c.id))}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(String(c.id));
                              else next.delete(String(c.id));
                              setSelectedIds(next);
                            }}
                            aria-label={`Pilih ${c.contact_name}`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <CRMAvatarBadge name={c.contact_name} subtitle={c.primary_contact ? "Primary Contact" : undefined} size="xs" />
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800">{c._companyName}</td>
                        <td className="px-3 py-3 text-slate-600">{c.job_title || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{c._department}</td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.phone || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{c.email || "—"}</td>
                        <td className="px-3 py-3">
                          <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", typeMeta.badge)}>
                            {typeMeta.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-[150px] truncate text-slate-500" title={c.notes || ""}>{c.notes || "—"}</td>
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {canEditRow && (
                            <button
                              type="button"
                              onClick={() => openEditContact(c)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil size={11} /> Edit
                            </button>
                          )}
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

      {/* Contact Right Drawer */}
      <CRMRightDrawer
        isOpen={Boolean(drawerContact)}
        onClose={() => setDrawerContact(null)}
        title={drawerContact?.contact_name || "Contact Details"}
        subtitle={drawerContact?._companyName}
        badge={
          drawerContact && (
            <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", (CONTACT_TYPE_META[drawerContact._contactType] || CONTACT_TYPE_META.GENERAL).badge)}>
              {(CONTACT_TYPE_META[drawerContact._contactType] || CONTACT_TYPE_META.GENERAL).label}
            </span>
          )
        }
        footer={
          drawerContact && !readOnly && (
            <button
              type="button"
              onClick={() => {
                const target = drawerContact;
                setDrawerContact(null);
                openEditContact(target);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#163D64] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#163D64]"
            >
              <Pencil size={13} /> Edit Contact
            </button>
          )
        }
      >
        {drawerContact && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div><div className="text-slate-400">Company</div><div className="mt-0.5 font-semibold text-slate-900">{drawerContact._companyName}</div></div>
              <div><div className="text-slate-400">Position</div><div className="mt-0.5 font-semibold text-slate-900">{drawerContact.job_title || "—"}</div></div>
              <div><div className="text-slate-400">Department</div><div className="mt-0.5 font-medium text-slate-800">{drawerContact._department}</div></div>
              <div><div className="text-slate-400">Primary Contact</div><div className="mt-0.5 font-medium text-slate-800">{drawerContact.primary_contact ? "Ya (Primary)" : "Tidak"}</div></div>
              <div><div className="text-slate-400">Email</div><div className="mt-0.5 font-medium text-slate-800 break-all">{drawerContact.email || "—"}</div></div>
              <div><div className="text-slate-400">Phone</div><div className="mt-0.5 font-medium text-slate-800">{drawerContact.phone || "—"}</div></div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="font-semibold text-slate-700 mb-1">Notes</div>
              <p className="text-slate-600 whitespace-pre-wrap">{drawerContact.notes || "Belum ada catatan untuk kontak ini."}</p>
            </div>
          </div>
        )}
      </CRMRightDrawer>

      {/* Add / Edit Contact Modal */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => !savingContact && setIsContactModalOpen(false)}
        title={editingContact ? "Edit Contact" : "Add New Contact"}
        size="md"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 text-xs">
          <label className="font-medium text-slate-600 sm:col-span-2">
            Company *
            <select className="input mt-1 w-full bg-white" value={contactForm.party_id} onChange={(e) => setContactForm((f) => ({ ...f, party_id: e.target.value }))}>
              <option value="">-- Pilih Perusahaan --</option>
              {(data.parties || []).map((p: any) => (
                <option key={p.id} value={String(p.id)}>{p.display_name || p.legal_name} ({p.party_type})</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Full Name *
            <input className="input mt-1 w-full" value={contactForm.contact_name} onChange={(e) => setContactForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Nama lengkap PIC" />
          </label>
          <label className="font-medium text-slate-600">
            Position / Job Title
            <input className="input mt-1 w-full" value={contactForm.job_title} onChange={(e) => setContactForm((f) => ({ ...f, job_title: e.target.value }))} placeholder="Contoh: Head of Marketing" />
          </label>
          <label className="font-medium text-slate-600">
            Department
            <input className="input mt-1 w-full" value={contactForm.department} onChange={(e) => setContactForm((f) => ({ ...f, department: e.target.value }))} placeholder="Marketing, Procurement, IT..." />
          </label>
          <label className="font-medium text-slate-600">
            Contact Type
            <select className="input mt-1 w-full bg-white" value={contactForm.contact_type} onChange={(e) => setContactForm((f) => ({ ...f, contact_type: e.target.value }))}>
              {Object.entries(CONTACT_TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            Email
            <input type="email" className="input mt-1 w-full" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="pic@perusahaan.com" />
          </label>
          <label className="font-medium text-slate-600">
            Phone
            <input className="input mt-1 w-full" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+62 812 ..." />
          </label>
          <label className="flex items-center gap-2 font-medium text-slate-600 sm:col-span-2">
            <input type="checkbox" checked={contactForm.primary_contact} onChange={(e) => setContactForm((f) => ({ ...f, primary_contact: e.target.checked }))} />
            Jadikan kontak utama (Primary Contact)
          </label>
          <label className="font-medium text-slate-600 sm:col-span-2">
            Notes
            <textarea className="input mt-1 w-full min-h-20" value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Catatan khusus untuk kontak ini..." />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsContactModalOpen(false)} disabled={savingContact} className="btn-ghost">Batal</button>
            <button type="button" onClick={() => void handleSaveContact()} disabled={savingContact} className="rounded-lg bg-[#163D64] px-4 py-2 text-xs font-semibold text-white hover:bg-[#163D64]">
              {savingContact ? "Menyimpan..." : editingContact ? "Simpan Perubahan" : "Simpan Contact"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}



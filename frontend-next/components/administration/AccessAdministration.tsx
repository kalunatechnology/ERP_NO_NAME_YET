/**
 * Company access administration workspace.
 *
 * Super Admin provisions modules at company level. Company Admin works in a
 * separate user-first matrix and may only delegate modules already provisioned
 * to their company. Explicit personal rules support inherit, blocked, read,
 * and write states without changing a user's operational role.
 */
"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Check, ChevronRight, Eye, KeyRound, LockKeyhole, Mail,
  Pencil, RefreshCw, Search, ShieldCheck, UserPlus, Users,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { useAuth } from "@/contexts/AuthContext";

type Company = { id: string; legal_name?: string; company_code?: string; name?: string };
type ModuleAccess = { module_code: string; enabled: boolean; allow_read: boolean; allow_write: boolean };
type RoleRef = { role_code?: string; role_name?: string };
type UserRow = { id: string; full_name?: string; email: string; status?: string; is_active?: boolean; roles?: RoleRef[] };
type Role = { id: string; role_code: string; role_name: string };
type UserModuleAccess = { user_id: string; module_code: string; allow_read: boolean; allow_write: boolean };
type AccessMode = "inherit" | "blocked" | "read" | "write";

const MODULE_LABELS: Record<string, { name: string; description: string }> = {
  CORE: { name: "Core Workspace", description: "Dashboard, company context, dan aktivitas utama" },
  REQUESTS: { name: "Requests", description: "Permintaan, review, dan approval card" },
  CRM: { name: "CRM", description: "Inquiry, opportunity, dan customer pipeline" },
  SALES: { name: "Sales", description: "Quotation, sales order, dan aktivitas komersial" },
  PROJECTS: { name: "Project Management", description: "WBS, task, timeline, dan delivery proyek" },
  FINANCE: { name: "Finance & Accounting", description: "Transaksi, jurnal, billing, pajak, dan reporting" },
  PROCUREMENT: { name: "Procurement", description: "Purchase request, vendor, dan purchasing" },
  INVENTORY: { name: "Inventory", description: "Stok, warehouse, dan pergerakan barang" },
  MANUFACTURING: { name: "Manufacturing", description: "Produksi dan kebutuhan material" },
  QUALITY: { name: "Quality", description: "Inspection dan quality control" },
  ASSETS: { name: "Assets", description: "Aset, pemeliharaan, dan lifecycle" },
  SERVICE: { name: "Service", description: "Service operation dan customer support" },
  LOGISTICS: { name: "Logistics", description: "Delivery dan distribusi" },
  ANALYTICS: { name: "Analytics", description: "Analisis lintas modul" },
  IMPLEMENTATION: { name: "Implementation", description: "Implementasi dan handover" },
  REPORTING: { name: "Reporting", description: "Laporan operasional dan eksekutif" },
};

/** Extracts the backend's stable error detail across validation/error shapes. */
function errorMessage(error: any, fallback: string): string {
  return error?.response?.data?.detail || error?.response?.data?.error?.message || error?.response?.data?.error || fallback;
}

/** Maps an explicit override to the four-state UI contract. */
function accessMode(access?: UserModuleAccess): AccessMode {
  if (!access) return "inherit";
  if (access.allow_write) return "write";
  if (access.allow_read) return "read";
  return "blocked";
}

/** Renders and orchestrates company entitlement and per-user delegation flows. */
export function AccessAdministration() {
  const { user, userRole, company, refreshProfile } = useAuth();
  const isSuper = userRole === "super_admin";
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState(company || "");
  const [modules, setModules] = useState<ModuleAccess[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [overrides, setOverrides] = useState<UserModuleAccess[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", password: "", role_code: "ROLE-STAFF" });

  /** Loads company and role catalogs used by both administration modes. */
  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [companyResponse, roleResponse] = await Promise.all([
        api.get("/api/v1/core/companies/?page_size=100"),
        api.get("/api/v1/accounts/roles/?page_size=100"),
      ]);
      const companyRows = normalizeList<Company>(companyResponse.data).rows;
      setCompanies(companyRows);
      setRoles(normalizeList<Role>(roleResponse.data).rows.filter((role) => role.role_code !== "ROLE-SUPER-ADMIN"));
      setSelectedCompany((current) => current || company || companyRows[0]?.id || "");
    } catch (error: any) {
      toast.error(errorMessage(error, "Gagal memuat konfigurasi akses."));
    } finally {
      setLoading(false);
    }
  }, [company]);

  /** Reloads the active company so saved access remains visible after refresh. */
  const loadCompanyContext = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      if (isSuper) {
        const response = await api.get(`/api/v1/core/companies/${selectedCompany}/modules`);
        setModules(response.data?.results || []);
        setUsers([]);
        setOverrides([]);
      } else {
        const [userResponse, moduleResponse, accessResponse] = await Promise.all([
          api.get("/api/v1/accounts/users/?page_size=100"),
          api.get("/api/v1/core/company-modules/my-modules"),
          api.get("/api/v1/accounts/user-module-access"),
        ]);
        const rows = normalizeList<UserRow>(userResponse.data).rows;
        setUsers(rows);
        setSelectedUserId((current) => rows.some((item) => item.id === current) ? current : (rows.find((item) => item.id !== user?.id)?.id || rows[0]?.id || ""));
        setModules(moduleResponse.data?.results || []);
        setOverrides(accessResponse.data?.results || []);
      }
    } catch (error: any) {
      toast.error(errorMessage(error, "Gagal memuat akses company."));
    } finally {
      setLoading(false);
    }
  }, [isSuper, selectedCompany, user?.id]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { void loadCompanyContext(); }, [loadCompanyContext]);

  const approvedModules = useMemo(() => modules.filter((item) => item.enabled), [modules]);
  const selectedUser = users.find((item) => item.id === selectedUserId);
  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((item) => !query || `${item.full_name || ""} ${item.email}`.toLowerCase().includes(query));
  }, [search, users]);

  /** Super Admin updates the commercial module ceiling for one company. */
  async function updateCompanyModule(module: ModuleAccess, enabled: boolean) {
    setSavingKey(`company:${module.module_code}`);
    try {
      await api.patch(`/api/v1/core/companies/${selectedCompany}/modules/${module.module_code}`, {
        enabled, allow_read: enabled, allow_write: enabled,
      });
      await loadCompanyContext();
      toast.success(`${module.module_code} ${enabled ? "diaktifkan" : "dinonaktifkan"}.`);
    } catch (error: any) {
      toast.error(errorMessage(error, "Perubahan entitlement gagal."));
    } finally {
      setSavingKey(null);
    }
  }

  /** Saves one explicit user override, or removes it for role-default behavior. */
  async function setUserAccess(moduleCode: string, mode: AccessMode) {
    if (!selectedUserId || selectedUserId === user?.id) return;
    const key = `${selectedUserId}:${moduleCode}`;
    setSavingKey(key);
    try {
      if (mode === "inherit") {
        await api.delete(`/api/v1/accounts/users/${selectedUserId}/module-access/${moduleCode}`);
      } else {
        await api.put(`/api/v1/accounts/users/${selectedUserId}/module-access/${moduleCode}`, {
          allow_read: mode === "read" || mode === "write",
          allow_write: mode === "write",
        });
      }
      await loadCompanyContext();
      toast.success(`${MODULE_LABELS[moduleCode]?.name || moduleCode}: akses ${mode === "inherit" ? "dikembalikan ke role" : "diperbarui"}.`);
    } catch (error: any) {
      toast.error(errorMessage(error, "Akses user gagal disimpan."));
    } finally {
      setSavingKey(null);
    }
  }

  /** Invites a non-administrative user into the current company. */
  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    try {
      await api.post("/api/v1/accounts/users/invite", { ...invite, role_codes: [invite.role_code] });
      setInvite({ name: "", email: "", password: "", role_code: "ROLE-STAFF" });
      setInviteOpen(false);
      await loadCompanyContext();
      await refreshProfile();
      toast.success("User berhasil ditambahkan ke company.");
    } catch (error: any) {
      toast.error(errorMessage(error, "Invitation user gagal."));
    }
  }

  return (
    <div className="space-y-5">
      <header className="rounded-[28px] border border-[#EAF6FF] bg-[#FDFDFD] px-6 py-6 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#2649B3] text-white"><ShieldCheck size={20} /></div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#090909]">{isSuper ? "Company entitlements" : "Team access control"}</h1>
            <p className="mt-2 text-sm leading-6 text-[#4F5050]">
              {isSuper ? "Tentukan produk yang tersedia untuk setiap company. Delegasi user tetap dikelola Company Admin." : "Pilih anggota, lalu tentukan akses operasional tanpa mengubah role utamanya. Hanya modul yang disetujui Super Admin yang tersedia."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isSuper && <button onClick={() => setInviteOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2649B3] px-4 text-sm font-semibold text-white hover:bg-[#090909]"><UserPlus size={16} /> Invite user</button>}
            <button onClick={() => { void loadBase(); void loadCompanyContext(); }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D9D9D9] bg-white px-4 text-sm font-medium text-[#2649B3] hover:bg-[#FDFDFD]"><RefreshCw size={15} /> Refresh</button>
          </div>
        </div>
      </header>

      {isSuper && (
        <section className="rounded-2xl border border-[#EFEFEF] bg-white p-5">
          <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#4F5050]"><Building2 size={14} /> Selected company</label>
          <select className="h-11 w-full max-w-xl rounded-xl border border-[#EFEFEF] bg-white px-3 text-sm text-[#2649B3] outline-none focus:border-[#42ACFB]" value={selectedCompany} disabled={loading} onChange={(event) => setSelectedCompany(event.target.value)}>
            {companies.map((item) => <option key={item.id} value={item.id}>{item.legal_name || item.name} · {item.company_code || "No code"}</option>)}
          </select>
        </section>
      )}

      {isSuper ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const meta = MODULE_LABELS[module.module_code] || { name: module.module_code, description: "System module" };
            return <article key={module.module_code} className="rounded-2xl border border-[#EFEFEF] bg-white p-5 transition hover:border-[#9FD6FF]">
              <div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-[#2649B3]">{meta.name}</p><p className="mt-1 text-xs leading-5 text-[#4F5050]">{meta.description}</p></div><button disabled={savingKey === `company:${module.module_code}`} onClick={() => updateCompanyModule(module, !module.enabled)} className={`relative h-6 w-11 rounded-full transition ${module.enabled ? "bg-[#2649B3]" : "bg-[#D9D9D9]"}`} aria-label={`${module.enabled ? "Disable" : "Enable"} ${meta.name}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${module.enabled ? "left-6" : "left-1"}`} /></button></div>
              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-[#4F5050]">{module.enabled ? "Available to company" : "Not provisioned"}</div>
            </article>;
          })}
        </section>
      ) : (
        <div className="grid min-h-[590px] grid-cols-1 overflow-hidden rounded-2xl border border-[#EFEFEF] bg-white lg:grid-cols-[310px_1fr]">
          <aside className="border-b border-[#EFEFEF] bg-[#EFEFEF] lg:border-b-0 lg:border-r">
            <div className="border-b border-[#EFEFEF] p-5">
              <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#4F5050]">Company members</p><p className="mt-1 text-sm text-[#2649B3]">{users.length} active identities</p></div><Users size={19} className="text-[#42ACFB]" /></div>
              <div className="relative mt-4"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4F5050]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team member" className="h-10 w-full rounded-xl border border-[#EFEFEF] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#42ACFB]" /></div>
            </div>
            <div className="max-h-[510px] overflow-y-auto p-2">
              {visibleUsers.map((member) => {
                const active = member.id === selectedUserId;
                const roleName = member.roles?.[0]?.role_name || member.roles?.[0]?.role_code || "Team member";
                return <button key={member.id} onClick={() => setSelectedUserId(member.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? "bg-[#EAF6FF]" : "hover:bg-[#EAF6FF]"}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-[#2649B3] text-white" : "bg-[#EFEFEF] text-[#2649B3]"}`}>{(member.full_name || member.email).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#2649B3]">{member.full_name || member.email}</span><span className="block truncate text-xs text-[#4F5050]">{member.id === user?.id ? "Your account · " : ""}{roleName}</span></span>
                  <ChevronRight size={15} className={active ? "text-[#2649B3]" : "text-[#D9D9D9]"} />
                </button>;
              })}
            </div>
          </aside>

          <main className="p-5 md:p-7">
            {selectedUser ? <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EFEFEF] pb-5">
                <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#4F5050]">Access profile</p><h2 className="mt-1 text-xl font-semibold text-[#2649B3]">{selectedUser.full_name || selectedUser.email}</h2><p className="mt-1 flex items-center gap-1.5 text-sm text-[#4F5050]"><Mail size={13} /> {selectedUser.email}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedUser.is_active === false ? "bg-red-50 text-red-700" : "bg-[#EAF6FF] text-[#2649B3]"}`}>{selectedUser.is_active === false ? "Inactive" : "Active"}</span>
              </div>

              {selectedUser.id === user?.id && <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><LockKeyhole size={18} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Your own access is protected</p><p className="mt-1 text-xs leading-5 text-amber-800">Company Admin tidak dapat menaikkan atau menurunkan akses akunnya sendiri. Gunakan Super Admin untuk perubahan administratif.</p></div></div>}

              <div className="mt-6"><div className="mb-4 flex items-end justify-between gap-4"><div><h3 className="font-semibold text-[#2649B3]">Module permissions</h3><p className="mt-1 text-xs text-[#4F5050]">Role default mempertahankan hak bawaan. Pilihan lain membuat override khusus user.</p></div><span className="text-xs text-[#4F5050]">{approvedModules.length} company-approved</span></div>
                <div className="space-y-2">
                  {approvedModules.map((module) => {
                    const meta = MODULE_LABELS[module.module_code] || { name: module.module_code, description: "System module" };
                    const explicit = overrides.find((item) => item.user_id === selectedUserId && item.module_code === module.module_code);
                    const current = accessMode(explicit);
                    const saving = savingKey === `${selectedUserId}:${module.module_code}`;
                    const choices: Array<{ mode: AccessMode; label: string; icon: typeof Check }> = [
                      { mode: "inherit", label: "Role default", icon: KeyRound },
                      { mode: "blocked", label: "No access", icon: LockKeyhole },
                      { mode: "read", label: "View only", icon: Eye },
                      { mode: "write", label: "View & manage", icon: Pencil },
                    ];
                    return <div key={module.module_code} className="grid gap-3 rounded-2xl border border-[#EFEFEF] p-4 xl:grid-cols-[minmax(210px,1fr)_auto] xl:items-center">
                      <div><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EAF6FF] text-[10px] font-bold text-[#2649B3]">{module.module_code.slice(0, 2)}</span><p className="text-sm font-semibold text-[#2649B3]">{meta.name}</p></div><p className="ml-9 mt-1 text-xs text-[#4F5050]">{meta.description}</p></div>
                      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#FDFDFD] p-1 sm:grid-cols-4">
                        {choices.map((choice) => { const Icon = choice.icon; const checked = current === choice.mode; return <button key={choice.mode} disabled={saving || selectedUser.id === user?.id} onClick={() => setUserAccess(module.module_code, choice.mode)} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition ${checked ? "bg-white text-[#2649B3] shadow-sm ring-1 ring-[#EAF6FF]" : "text-[#4F5050] hover:text-[#2649B3]"} disabled:cursor-not-allowed disabled:opacity-50`}><Icon size={13} /> {choice.label}</button>; })}
                      </div>
                    </div>;
                  })}
                  {!loading && approvedModules.length === 0 && <div className="rounded-2xl border border-dashed border-[#D9D9D9] p-10 text-center"><LockKeyhole className="mx-auto text-[#4F5050]" /><p className="mt-3 font-semibold text-[#2649B3]">No modules provisioned</p><p className="mt-1 text-xs text-[#4F5050]">Super Admin must enable a company module before it can be delegated.</p></div>}
                </div>
              </div>
            </> : <div className="flex min-h-[420px] items-center justify-center text-sm text-[#4F5050]">Select a company member to manage access.</div>}
          </main>
        </div>
      )}

      {!isSuper && inviteOpen && <form onSubmit={submitInvite} className="rounded-2xl border border-[#EFEFEF] bg-white p-5"><div className="mb-4 flex items-center gap-2"><UserPlus size={17} className="text-[#2649B3]" /><h2 className="font-semibold text-[#2649B3]">Invite company member</h2></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input required className="h-11 rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]" placeholder="Full name" value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} /><input required type="email" className="h-11 rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]" placeholder="Email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /><input required minLength={8} type="password" className="h-11 rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]" placeholder="Temporary password" value={invite.password} onChange={(event) => setInvite({ ...invite, password: event.target.value })} /><select className="h-11 rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]" value={invite.role_code} onChange={(event) => setInvite({ ...invite, role_code: event.target.value })}>{roles.filter((role) => role.role_code !== "ROLE-COMPANY-ADMIN").map((role) => <option key={role.id} value={role.role_code}>{role.role_name}</option>)}</select></div><div className="mt-4 flex justify-end"><button type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2649B3] px-5 text-sm font-semibold text-white"><Check size={15} /> Send invitation</button></div></form>}
    </div>
  );
}

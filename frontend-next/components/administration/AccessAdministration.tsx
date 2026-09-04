"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Building2, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { useAuth } from "@/contexts/AuthContext";

type Company = { id: string; legal_name?: string; company_code?: string; name?: string };
type ModuleAccess = { module_code: string; enabled: boolean; allow_read: boolean; allow_write: boolean };
type UserRow = { id: string; full_name?: string; email: string; status?: string; is_active?: boolean };
type Role = { id: string; role_code: string; role_name: string };

/**
 * AccessAdministration coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
export function AccessAdministration() {
  const { userRole, company, refreshProfile } = useAuth();
  const isSuper = userRole === "super_admin";
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState(company || "");
  const [modules, setModules] = useState<ModuleAccess[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingModule, setSavingModule] = useState<string | null>(null);
  const [invite, setInvite] = useState({ name: "", email: "", password: "", role_code: "ROLE-STAFF" });

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
      setSelectedCompany((current) => current || companyRows[0]?.id || "");
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || "Gagal memuat konfigurasi akses.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCompanyContext = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      if (isSuper) {
        const response = await api.get(`/api/v1/core/companies/${selectedCompany}/modules`);
        setModules(response.data?.results || []);
        setUsers([]);
      } else {
        const response = await api.get("/api/v1/accounts/users/?page_size=100");
        setUsers(normalizeList<UserRow>(response.data).rows);
        setModules([]);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || "Gagal memuat data company.");
    }
  }, [isSuper, selectedCompany]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { void loadCompanyContext(); }, [loadCompanyContext]);

/**
 * updateModule coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  async function updateModule(module: ModuleAccess, patch: Partial<ModuleAccess>) {
    setSavingModule(module.module_code);
    try {
      await api.patch(`/api/v1/core/companies/${selectedCompany}/modules/${module.module_code}`, {
        enabled: patch.enabled ?? module.enabled,
        allow_read: patch.allow_read ?? module.allow_read,
        allow_write: patch.allow_write ?? module.allow_write,
      });
      await loadCompanyContext();
      toast.success(`Akses ${module.module_code} diperbarui.`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || "Perubahan modul gagal disimpan.");
    } finally {
      setSavingModule(null);
    }
  }

/**
 * submitInvite coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: calls the referenced HTTP adapter and maps success/failure into component state.
 */
  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    try {
      await api.post("/api/v1/accounts/users/invite", { ...invite, role_codes: [invite.role_code] });
      setInvite({ name: "", email: "", password: "", role_code: "ROLE-STAFF" });
      await loadCompanyContext();
      await refreshProfile();
      toast.success("User berhasil ditambahkan ke company.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || "Invitation user gagal.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-brand-deep-green flex items-center gap-2">
            <ShieldCheck size={22} /> {isSuper ? "Company & Module Governance" : "User & Role Management"}
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            {isSuper ? "Aktifkan modul per company. Data operasional tetap read-only untuk Super Admin." : "Kelola user dan role hanya di dalam company Anda."}
          </p>
        </div>
        <button className="btn-ghost text-xs" onClick={() => { void loadBase(); void loadCompanyContext(); }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="card rounded-2xl p-4">
        <label className="text-xs font-bold text-text-primary flex items-center gap-2 mb-2"><Building2 size={14} /> Company</label>
        <select className="input max-w-xl" value={selectedCompany} disabled={!isSuper || loading} onChange={(event) => setSelectedCompany(event.target.value)}>
          {companies.map((item) => <option key={item.id} value={item.id}>{item.legal_name || item.name} ({item.company_code || "-"})</option>)}
        </select>
      </div>

      {isSuper ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {modules.map((item) => (
            <div key={item.module_code} className="card rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between"><span className="font-bold text-sm">{item.module_code}</span><span className={item.enabled ? "badge badge-success" : "badge"}>{item.enabled ? "Active" : "Inactive"}</span></div>
              <div className="flex gap-2 flex-wrap text-xs">
                <button disabled={savingModule === item.module_code} onClick={() => updateModule(item, { enabled: !item.enabled, allow_read: !item.enabled, allow_write: !item.enabled })} className={item.enabled ? "btn-outline" : "btn-primary"}>{item.enabled ? "Disable" : "Enable"}</button>
                <button disabled={!item.enabled || savingModule === item.module_code} onClick={() => updateModule(item, { allow_read: !item.allow_read })} className="btn-ghost">Read: {item.allow_read ? "On" : "Off"}</button>
                <button disabled={!item.enabled || savingModule === item.module_code} onClick={() => updateModule(item, { allow_write: !item.allow_write })} className="btn-ghost">Write: {item.allow_write ? "On" : "Off"}</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <form onSubmit={submitInvite} className="card rounded-2xl p-4 flex flex-col gap-3">
            <h2 className="font-bold text-sm flex items-center gap-2"><UserPlus size={16} /> Invite User</h2>
            <input required className="input" placeholder="Nama lengkap" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            <input required type="email" className="input" placeholder="Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <input required minLength={8} type="password" className="input" placeholder="Password sementara" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} />
            <select className="input" value={invite.role_code} onChange={(e) => setInvite({ ...invite, role_code: e.target.value })}>
              {roles.filter((role) => role.role_code !== "ROLE-COMPANY-ADMIN").map((role) => <option key={role.id} value={role.role_code}>{role.role_name}</option>)}
            </select>
            <button className="btn-primary justify-center" type="submit">Kirim Invitation</button>
          </form>
          <div className="card rounded-2xl p-4 xl:col-span-2">
            <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Users size={16} /> Company Users</h2>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="text-left p-2">Nama</th><th className="text-left p-2">Email</th><th className="text-left p-2">Status</th></tr></thead><tbody>{users.map((item) => <tr key={item.id} className="border-b border-gray-100"><td className="p-2 font-semibold">{item.full_name || "-"}</td><td className="p-2">{item.email}</td><td className="p-2">{item.is_active === false ? "Inactive" : item.status || "Active"}</td></tr>)}</tbody></table></div>
          </div>
        </div>
      )}
    </div>
  );
}

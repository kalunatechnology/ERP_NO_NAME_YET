/**
 * Company access administration workspace.
 *
 * Super Admin orchestrates multi-tenant governance:
 * - Tab 1: Tenant Management (multi-tenant hub, creation, updates)
 * - Tab 2: Company Entities (business entities, presets, initial admin)
 * - Tab 3: Module Entitlements (commercial licensing ceiling & batch presets)
 *
 * Company Admin works in a user-first matrix and delegates modules
 * already provisioned to their company.
 */
"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronRight,
  Eye,
  KeyRound,
  LockKeyhole,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  Building,
  Sliders,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { getUserFacingApiError } from "@/lib/api/error-message";
import { normalizeList } from "@/lib/api/auth.api";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { TenantManagement, TenantItem } from "./TenantManagement";
import { CompanyManagement, CompanyDetail } from "./CompanyManagement";
import { ModuleEntitlements, ModuleAccessItem } from "./ModuleEntitlements";

type Company = { id: string; legal_name?: string; company_code?: string; name?: string; tenant_id?: string; business_category?: string; tax_number?: string; status?: string };
type ModuleAccess = ModuleAccessItem;
type RoleRef = { role_code?: string; role_name?: string };
type UserRow = { id: string; full_name?: string; email: string; tenant_id?: string; department_id?: string | null; role_level?: "GM" | "SPV" | "STAFF" | string; status?: string; is_active?: boolean; roles?: RoleRef[] };
type Role = { id: string; role_code: string; role_name: string; tenant_id?: string };
type UserModuleAccess = { user_id: string; module_code: string; allow_read: boolean; allow_write: boolean };
type DepartmentItem = {
  id: string;
  code: string;
  name: string;
  unit_type?: "DEPARTMENT" | "DIVISION" | string;
  parent_id?: string | null;
  parent_name?: string | null;
  manager_user_id?: string | null;
  manager_name?: string | null;
  is_cost_center: boolean;
  is_active: boolean;
  member_count?: number;
  modules: string[];
};
type AccessMode = "inherit" | "blocked" | "read" | "write";
type SuperAdminTab = "tenants" | "companies" | "modules" | "departments" | "users";

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
  MARBOT: { name: "Marka Plus Assistant", description: "Asisten ERP dengan akses baca sesuai modul, role, dan scope data user" },
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

export function AccessAdministration() {
  const { user, userRole, company, setCompany, refreshProfile } = useAuth();
  const isSuper = userRole === "super_admin";

  // Super Admin active tab
  const [activeTab, setActiveTab] = useState<SuperAdminTab>("tenants");
  const [tenantFilterForCompany, setTenantFilterForCompany] = useState("ALL");

  // State data
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState(company && company !== "all" ? company : "");
  const [modules, setModules] = useState<ModuleAccess[]>([]);
  const [loadedContextCompany, setLoadedContextCompany] = useState("");
  const contextSequence = useRef(0);

  // Company Admin user-level state
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [overrides, setOverrides] = useState<UserModuleAccess[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [baseError, setBaseError] = useState("");
  const [contextError, setContextError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", password: "", role_code: "ROLE-STAFF", department_id: "", role_level: "STAFF" });
  const contextCompany = isSuper ? selectedCompany : (company || "");

  // Departments & Divisions (Cost Center) state
  const [companyViewTab, setCompanyViewTab] = useState<"members" | "departments">("members");
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [deptFormOpen, setDeptFormOpen] = useState(false);
  const [deptSubmitting, setDeptSubmitting] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [deptForm, setDeptForm] = useState<{
    code: string;
    name: string;
    unit_type: "DEPARTMENT" | "DIVISION";
    parent_id: string;
    manager_user_id: string;
    is_cost_center: boolean;
    is_active: boolean;
    module_keys: string[];
  }>({
    code: "",
    name: "",
    unit_type: "DEPARTMENT",
    parent_id: "",
    manager_user_id: "",
    is_cost_center: true,
    is_active: true,
    module_keys: ["CORE", "REQUESTS"],
  });
  const [savingDeptRole, setSavingDeptRole] = useState(false);

  // Super Admin invite user state
  const [superInviteOpen, setSuperInviteOpen] = useState(false);
  const [superInvite, setSuperInvite] = useState({ name: "", email: "", password: "", tenant_id: "", company_id: "", role_code: "ROLE-STAFF", department_id: "", role_level: "STAFF" });
  const [superInviteSubmitting, setSuperInviteSubmitting] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Companies filtered by selected tenant in super invite
  const superInviteCompanies = useMemo(() => {
    if (!superInvite.tenant_id) return companies;
    return companies.filter((c) => c.tenant_id === superInvite.tenant_id);
  }, [companies, superInvite.tenant_id]);

  // All users filtered by search
  const filteredAllUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.full_name ?? ""} ${u.email}`.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  /** Loads core data catalogs (tenants, companies, roles, users) */
  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      if (isSuper) {
        const [tenantRes, companyRes, userRes, roleRes] = await Promise.all([
          api.get("/api/v1/core/tenants/?page_size=100", { headers: { "X-Company-ID": "all" } }),
          api.get("/api/v1/core/companies/?page_size=100", { headers: { "X-Company-ID": "all" } }),
          api.get("/api/v1/accounts/users/?page_size=100"),
          api.get("/api/v1/accounts/roles/?page_size=100"),
        ]);

        const tenantRows = normalizeList<TenantItem>(tenantRes.data).rows;
        const companyRows = normalizeList<Company>(companyRes.data).rows;
        const userRows = normalizeList<UserRow>(userRes.data).rows;
        const roleRows = normalizeList<Role>(roleRes.data).rows;

        setTenants(tenantRows);
        setCompanies(companyRows);
        setUsers(userRows);
        setRoles(roleRows.filter((r) => r.role_code !== "ROLE-SUPER-ADMIN"));

        if (!selectedCompany && companyRows.length > 0) {
          setSelectedCompany(companyRows[0].id);
        } else if (companyRows.length > 0 && !companyRows.some((c) => c.id === selectedCompany)) {
          setSelectedCompany(companyRows[0].id);
        }
      } else {
        const [userRes, roleRes] = await Promise.all([
          api.get("/api/v1/accounts/users/?page_size=100"),
          api.get("/api/v1/accounts/roles/?page_size=100"),
        ]);
        setUsers(normalizeList<UserRow>(userRes.data).rows);
        setRoles(normalizeList<Role>(roleRes.data).rows.filter((r) => r.role_code !== "ROLE-SUPER-ADMIN"));
      }
      setBaseError("");
    } catch (error: any) {
      setBaseError(errorMessage(error, "Gagal memuat konfigurasi data platform."));
    } finally {
      setLoading(false);
    }
  }, [isSuper, selectedCompany]);

  /** Loads module entitlements for the selected company */
  const loadCompanyContext = useCallback(async () => {
    if (!contextCompany) return;
    const sequence = ++contextSequence.current;
    setLoading(true);
    try {
      if (isSuper) {
        const [response, deptRes] = await Promise.all([
          api.get(`/api/v1/core/companies/${contextCompany}/modules`, {
            headers: { "X-Company-ID": contextCompany },
          }),
          api.get(`/api/v1/master-data/departments?include_inactive=true`, {
            headers: { "X-Company-ID": contextCompany },
          }).catch(() => ({ data: { data: [] } })),
        ]);
        if (sequence !== contextSequence.current) return;
        setModules(response.data?.results || []);
        setDepartments(deptRes.data?.data || deptRes.data?.results || []);
      } else {
        const [moduleResponse, accessResponse, deptRes] = await Promise.all([
          api.get("/api/v1/core/company-modules/my-modules"),
          api.get("/api/v1/accounts/user-module-access"),
          api.get("/api/v1/master-data/departments?include_inactive=true").catch(() => ({ data: { data: [] } })),
        ]);
        if (sequence !== contextSequence.current) return;
        setModules(moduleResponse.data?.results || []);
        setOverrides(accessResponse.data?.results || []);
        setDepartments(deptRes.data?.data || deptRes.data?.results || []);
        if (users.length > 0 && !selectedUserId) {
          setSelectedUserId(users[0].id);
        }
      }
      setLoadedContextCompany(contextCompany);
      setContextError("");
    } catch (error: any) {
      if (sequence !== contextSequence.current) return;
      setModules([]);
      setLoadedContextCompany("");
      setContextError(errorMessage(error, "Gagal memuat hak akses modul company."));
    } finally {
      if (sequence === contextSequence.current) setLoading(false);
    }
  }, [isSuper, contextCompany, users, selectedUserId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadCompanyContext();
    return () => {
      contextSequence.current += 1;
    };
  }, [loadCompanyContext]);

  // Company Admin derived values
  const displayedModules = loadedContextCompany === contextCompany ? modules : [];
  const displayedUsers = loadedContextCompany === contextCompany ? users : [];
  const displayedOverrides = loadedContextCompany === contextCompany ? overrides : [];
  const loadError = baseError || contextError;
  const approvedModules = useMemo(() => displayedModules.filter((item) => item.enabled), [displayedModules]);
  const selectedUser = displayedUsers.find((item) => item.id === selectedUserId);
  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return displayedUsers.filter((item) => !query || `${item.full_name || ""} ${item.email}`.toLowerCase().includes(query));
  }, [search, displayedUsers]);

  const ASSIGNABLE_ROLES = [
    { code: "ROLE-STAFF", label: "Staff" },
    { code: "ROLE-FINANCE", label: "Finance" },
    { code: "ROLE-OM", label: "Operational Manager" },
    { code: "ROLE-PM", label: "Project Manager" },
    { code: "ROLE-SUPERVISOR", label: "Supervisor" },
    { code: "ROLE-CRM-LEAD", label: "CRM Lead" },
    { code: "ROLE-SALES", label: "Sales" },
    { code: "ROLE-DIRECTOR", label: "Director" },
  ];

  const [userRolesData, setUserRolesData] = useState<{
    active_role_id?: string | null;
    roles: Array<{
      user_role_id: string;
      role_id: string;
      role_code: string;
      raw_role_code: string;
      role_name: string;
      is_active: boolean;
    }>;
  }>({ roles: [] });
  const [loadingUserRoles, setLoadingUserRoles] = useState(false);
  const [userRolesError, setUserRolesError] = useState<string | null>(null);
  const [roleUpdatingKey, setRoleUpdatingKey] = useState<string | null>(null);

  const loadUserRoles = useCallback(async (userId: string) => {
    if (!userId || !contextCompany) return;
    setLoadingUserRoles(true);
    try {
      const res = await api.get(`/api/v1/accounts/users/${userId}/roles`, {
        headers: { "X-Company-ID": contextCompany },
      });
      setUserRolesData(res.data || { roles: [] });
      setUserRolesError(null);
    } catch (error) {
      setUserRolesError(getUserFacingApiError(error, "Daftar peran belum dapat dimuat. Periksa akses company, lalu coba lagi."));
    } finally {
      setLoadingUserRoles(false);
    }
  }, [contextCompany]);

  useEffect(() => {
    if (selectedUserId) {
      void loadUserRoles(selectedUserId);
    }
  }, [selectedUserId, loadUserRoles]);

  async function handleToggleUserRole(rawRoleCode: string, isAssigned: boolean) {
    if (!selectedUserId || selectedUserId === user?.id) return;
    setRoleUpdatingKey(rawRoleCode);
    try {
      if (isAssigned) {
        await api.delete(`/api/v1/accounts/users/${selectedUserId}/roles/${rawRoleCode}`, {
          headers: { "X-Company-ID": contextCompany },
        });
        toast.success(`Role ${rawRoleCode} dicabut.`);
      } else {
        await api.put(`/api/v1/accounts/users/${selectedUserId}/roles/${rawRoleCode}`, {}, {
          headers: { "X-Company-ID": contextCompany },
        });
        toast.success(`Role ${rawRoleCode} berhasil ditugaskan.`);
      }
      await loadUserRoles(selectedUserId);
      await loadBase();
    } catch (err: any) {
      toast.error(errorMessage(err, "Gagal memperbarui role pengguna."));
    } finally {
      setRoleUpdatingKey(null);
    }
  }

  /** Company Admin sets per-user access */
  async function setUserAccess(moduleCode: string, mode: AccessMode) {
    if (!selectedUserId || selectedUserId === user?.id) return;
    if (moduleCode === "MARBOT" && mode === "write") return;
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
      toast.success(
        `${MODULE_LABELS[moduleCode]?.name || moduleCode}: akses ${
          mode === "inherit" ? "dikembalikan ke role" : "diperbarui"
        }.`
      );
    } catch (error: any) {
      toast.error(errorMessage(error, "Akses user gagal disimpan."));
    } finally {
      setSavingKey(null);
    }
  }

  /** Company Admin invites a user */
  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    try {
      await api.post("/api/v1/accounts/users/invite", {
        ...invite,
        department_id: invite.department_id || null,
        role_level: invite.role_level || "STAFF",
        role_codes: [invite.role_code],
      });
      setInvite({ name: "", email: "", password: "", role_code: "ROLE-STAFF", department_id: "", role_level: "STAFF" });
      setInviteOpen(false);
      await loadBase();
      await loadCompanyContext();
      await refreshProfile();
      toast.success("User berhasil ditambahkan ke company beserta Departemen & Level Role.");
    } catch (error: any) {
      toast.error(errorMessage(error, "Invitation user gagal."));
    }
  }

  /** Save Department & 3-Role Hierarchy (GM / SPV / STAFF) for any user in the company */
  async function handleSaveUserDepartmentRole(
    departmentId: string | null,
    roleLevel?: string,
    targetUserId?: string,
  ) {
    const uid = targetUserId || selectedUserId;
    if (!uid) return;
    setSavingDeptRole(true);
    try {
      await api.put(
        `/api/v1/accounts/users/${uid}/department-role`,
        {
          department_id: departmentId || null,
          ...(roleLevel ? { role_level: roleLevel } : {}),
        },
        contextCompany ? { headers: { "X-Company-ID": contextCompany } } : undefined,
      );
      await loadBase();
      await loadCompanyContext();
      if (uid === user?.id) {
        await refreshProfile();
      }
      toast.success("Departemen & Level Hierarki Role user berhasil diperbarui.");
    } catch (error: any) {
      toast.error(errorMessage(error, "Gagal memperbarui departemen & level role user."));
    } finally {
      setSavingDeptRole(false);
    }
  }

  /** Open Create / Edit Department or Division modal */
  function openNewDepartmentModal(unitType: "DEPARTMENT" | "DIVISION" = "DEPARTMENT") {
    setEditingDeptId(null);
    setDeptForm({
      code: "",
      name: "",
      unit_type: unitType,
      parent_id: "",
      manager_user_id: "",
      is_cost_center: true,
      is_active: true,
      module_keys: ["CORE", "REQUESTS"],
    });
    setDeptFormOpen(true);
  }

  function openEditDepartmentModal(dept: DepartmentItem) {
    setEditingDeptId(dept.id);
    setDeptForm({
      code: dept.code,
      name: dept.name,
      unit_type: (String(dept.unit_type || "DEPARTMENT").toUpperCase() === "DIVISION" ? "DIVISION" : "DEPARTMENT"),
      parent_id: dept.parent_id || "",
      manager_user_id: dept.manager_user_id || "",
      is_cost_center: dept.is_cost_center !== false,
      is_active: dept.is_active !== false,
      module_keys: Array.isArray(dept.modules) ? dept.modules.map((m) => String(m).toUpperCase()) : ["CORE", "REQUESTS"],
    });
    setDeptFormOpen(true);
  }

  async function handleSaveDepartment(event: FormEvent) {
    event.preventDefault();
    if (!contextCompany) {
      toast.error("Pilih company terlebih dahulu.");
      return;
    }
    setDeptSubmitting(true);
    try {
      const payload = {
        code: deptForm.code.trim().toUpperCase(),
        name: deptForm.name.trim(),
        unit_type: deptForm.unit_type,
        parent_id: deptForm.unit_type === "DIVISION" && deptForm.parent_id ? deptForm.parent_id : null,
        manager_user_id: deptForm.manager_user_id || null,
        is_cost_center: deptForm.is_cost_center,
        is_active: deptForm.is_active,
        module_keys: deptForm.module_keys,
      };
      if (editingDeptId) {
        await api.put(`/api/v1/master-data/departments/${editingDeptId}`, payload, {
          headers: { "X-Company-ID": contextCompany },
        });
        toast.success(`${deptForm.unit_type === "DIVISION" ? "Divisi" : "Departemen"} berhasil diperbarui.`);
      } else {
        await api.post("/api/v1/master-data/departments", payload, {
          headers: { "X-Company-ID": contextCompany },
        });
        toast.success(`${deptForm.unit_type === "DIVISION" ? "Divisi" : "Departemen"} & Cost Center baru berhasil dibuat.`);
      }
      setDeptFormOpen(false);
      setEditingDeptId(null);
      await loadCompanyContext();
    } catch (error: any) {
      toast.error(errorMessage(error, "Gagal menyimpan Departemen / Divisi."));
    } finally {
      setDeptSubmitting(false);
    }
  }

  async function handleDeleteDepartment(dept: DepartmentItem) {
    if (!contextCompany) return;
    try {
      await api.delete(`/api/v1/master-data/departments/${dept.id}`, {
        headers: { "X-Company-ID": contextCompany },
      });
      toast.success(`${dept.name} berhasil dihapus / dinonaktifkan.`);
      await loadCompanyContext();
    } catch (error: any) {
      toast.error(errorMessage(error, "Gagal menghapus Departemen / Divisi."));
    }
  }

  /** Super Admin creates a user and assigns them to a specific company */
  async function submitSuperInvite(event: FormEvent) {
    event.preventDefault();
    if (!superInvite.tenant_id || !superInvite.company_id) {
      toast.error("Tenant dan Company wajib dipilih.");
      return;
    }
    setSuperInviteSubmitting(true);
    try {
      await api.post("/api/v1/accounts/users/invite", {
        name: superInvite.name,
        email: superInvite.email,
        password: superInvite.password,
        tenant_id: superInvite.tenant_id,
        company_id: superInvite.company_id,
        department_id: superInvite.department_id || null,
        role_level: superInvite.role_level || "STAFF",
        role_codes: [superInvite.role_code],
      }, { headers: { "X-Company-ID": superInvite.company_id } });
      setSuperInvite({ name: "", email: "", password: "", tenant_id: "", company_id: "", role_code: "ROLE-STAFF", department_id: "", role_level: "STAFF" });
      setSuperInviteOpen(false);
      await loadBase();
      toast.success("User berhasil dibuat dan di-assign ke company.");
    } catch (error: any) {
      toast.error(errorMessage(error, "Pembuatan user gagal."));
    } finally {
      setSuperInviteSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <header className="rounded-[28px] border border-[#EAF6FF] bg-[#FDFDFD] px-6 py-6 md:px-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#2649B3] text-white">
              <ShieldCheck size={20} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#090909]">
              {isSuper ? "Super Admin Governance & Access" : "Team access control"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#4F5050]">
              {isSuper
                ? "Pusat tata kelola multi-tenant platform: kelola organisasi tenant, buat entitas legal perusahaan, dan atur lisensi komersial 17 modul ERP."
                : "Pilih anggota tim, lalu tentukan akses operasional tanpa mengubah role utamanya. Hanya modul yang disetujui Super Admin yang tersedia."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href={isSuper && selectedCompany ? `/administration/crm-integrations?company_id=${encodeURIComponent(selectedCompany)}` : "/administration/crm-integrations"} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D9D9D9] bg-white px-4 text-sm font-medium text-[#2649B3] hover:bg-[#FDFDFD]">
              <Sliders size={15} /> Integrasi CRM
            </Link>
            {isSuper && (
              <button
                onClick={() => setSuperInviteOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2649B3] px-4 text-sm font-semibold text-white hover:bg-[#1D3A96]"
              >
                <UserPlus size={16} /> Tambah User
              </button>
            )}
            {!isSuper && (
              <button
                onClick={() => setInviteOpen((v) => !v)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2649B3] px-4 text-sm font-semibold text-white hover:bg-[#1D3A96]"
              >
                <UserPlus size={16} /> Invite user
              </button>
            )}
            <button
              onClick={() => {
                void loadBase();
                void loadCompanyContext();
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D9D9D9] bg-white px-4 text-sm font-medium text-[#2649B3] hover:bg-[#FDFDFD]"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>

        {/* Super Admin Navigation Tabs */}
        {isSuper && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-[#EFEFEF] pt-5">
            <button
              onClick={() => setActiveTab("tenants")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "tenants"
                  ? "bg-[#2649B3] text-white shadow-sm"
                  : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
              }`}
            >
              <Building size={16} /> Manajemen Tenant ({tenants.length})
            </button>

            <button
              onClick={() => setActiveTab("companies")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "companies"
                  ? "bg-[#2649B3] text-white shadow-sm"
                  : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
              }`}
            >
              <Building2 size={16} /> Entitas Company ({companies.length})
            </button>

            <button
              onClick={() => setActiveTab("modules")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "modules"
                  ? "bg-[#2649B3] text-white shadow-sm"
                  : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
              }`}
            >
              <Sliders size={16} /> Pemberian Modul (Commercial Entitlements)
            </button>

            <button
              onClick={() => setActiveTab("departments")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "departments"
                  ? "bg-[#2649B3] text-white shadow-sm"
                  : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
              }`}
            >
              <Building2 size={16} /> Departemen, Divisi & Cost Center ({departments.length})
            </button>

            <button
              onClick={() => setActiveTab("users")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === "users"
                  ? "bg-[#2649B3] text-white shadow-sm"
                  : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
              }`}
            >
              <Users size={16} /> Manajemen User ({users.length})
            </button>
          </div>
        )}

        {/* Company Admin Navigation Tabs */}
        {!isSuper && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEFEF] pt-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCompanyViewTab("members")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  companyViewTab === "members"
                    ? "bg-[#2649B3] text-white shadow-sm"
                    : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
                }`}
              >
                <Users size={16} /> Anggota Tim & Hierarki Role ({displayedUsers.length})
              </button>
              <button
                type="button"
                onClick={() => setCompanyViewTab("departments")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  companyViewTab === "departments"
                    ? "bg-[#2649B3] text-white shadow-sm"
                    : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F8FAFC]"
                }`}
              >
                <Building2 size={16} /> Departemen, Divisi & Cost Center ({departments.length})
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openNewDepartmentModal("DEPARTMENT")}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#2649B3] bg-[#EAF6FF] px-3.5 text-xs font-semibold text-[#2649B3] hover:bg-[#D9EEFF]"
              >
                + Buat Departemen / Cost Center
              </button>
              <button
                type="button"
                onClick={() => openNewDepartmentModal("DIVISION")}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D9D9D9] bg-white px-3.5 text-xs font-semibold text-[#090909] hover:bg-[#F8FAFC]"
              >
                + Buat Divisi
              </button>
            </div>
          </div>
        )}
      </header>

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {loadError}{" "}
          <button
            onClick={() => {
              void loadBase();
              void loadCompanyContext();
            }}
            className="ml-2 font-semibold underline"
          >
            Coba lagi
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {isSuper ? (
        <>
          {activeTab === "tenants" && (
            <TenantManagement
              tenants={tenants}
              companies={companies}
              loading={loading}
              onRefresh={async () => {
                await loadBase();
                await loadCompanyContext();
              }}
              onSelectTenantForCompany={(tenantId) => {
                setTenantFilterForCompany(tenantId);
                setActiveTab("companies");
              }}
              onSelectCompanyForModules={(companyId) => {
                setSelectedCompany(companyId);
                setActiveTab("modules");
              }}
            />
          )}

          {activeTab === "companies" && (
            <CompanyManagement
              tenants={tenants}
              companies={companies}
              users={users}
              loading={loading}
              selectedTenantFilter={tenantFilterForCompany}
              onFilterTenantChange={(id) => setTenantFilterForCompany(id)}
              onRefresh={async () => {
                await loadBase();
                await loadCompanyContext();
              }}
              onSelectCompanyForModules={(companyId) => {
                setSelectedCompany(companyId);
                setActiveTab("modules");
              }}
            />
          )}

          {activeTab === "modules" && (
            <ModuleEntitlements
              tenants={tenants}
              companies={companies}
              selectedCompanyId={selectedCompany}
              onSelectCompany={(id) => {
                setSelectedCompany(id);
                setCompany(id);
              }}
              modules={modules}
              loadingModules={loading}
              onRefreshModules={loadCompanyContext}
            />
          )}

          {activeTab === "departments" && (
            <div className="rounded-[24px] border border-[#EFEFEF] bg-white p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EFEFEF] pb-4">
                <div>
                  <h2 className="text-lg font-bold text-[#2649B3]">Departemen, Divisi & Cost Center</h2>
                  <p className="mt-0.5 text-xs text-[#4F5050]">
                    Kelola struktur Departemen dan Divisi beserta Cost Center Budgeting dan delegasi modul untuk Company terpilih.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedCompany}
                    onChange={(e) => {
                      setSelectedCompany(e.target.value);
                      setCompany(e.target.value);
                    }}
                    className="h-9 rounded-xl border border-[#D9D9D9] bg-white px-3 text-xs font-semibold text-[#090909]"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name || c.name || c.company_code}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => openNewDepartmentModal("DEPARTMENT")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#2649B3] px-3.5 text-xs font-semibold text-white hover:bg-[#1D3A96]"
                  >
                    + Buat Departemen
                  </button>
                  <button
                    type="button"
                    onClick={() => openNewDepartmentModal("DIVISION")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#2649B3] bg-[#EAF6FF] px-3.5 text-xs font-semibold text-[#2649B3] hover:bg-[#D9EEFF]"
                  >
                    + Buat Divisi
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#EFEFEF] text-left text-xs font-semibold uppercase tracking-wider text-[#4F5050]">
                      <th className="px-4 py-3">Tipe Unit</th>
                      <th className="px-4 py-3">Kode & Nama</th>
                      <th className="px-4 py-3">Induk Departemen</th>
                      <th className="px-4 py-3">Cost Center</th>
                      <th className="px-4 py-3">PIC / Manager</th>
                      <th className="px-4 py-3">Modul Delegasi</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEF]">
                    {departments.map((d) => (
                      <tr key={d.id} className="hover:bg-[#FDFDFD]">
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            d.unit_type === "DIVISION" ? "bg-purple-50 text-purple-700" : "bg-[#EAF6FF] text-[#2649B3]"
                          }`}>
                            {d.unit_type === "DIVISION" ? "DIVISI" : "DEPARTEMEN"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#090909]">{d.name}</div>
                          <div className="text-xs font-mono text-[#4F5050]">{d.code} · {d.member_count ?? 0} anggota</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#4F5050]">{d.parent_name || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            d.is_cost_center ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}>
                            {d.is_cost_center ? "Ya (Cost Center)" : "Non-Cost Center"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#4F5050]">{d.manager_name || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(d.modules || []).map((m) => (
                              <span key={m} className="rounded-md bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold text-[#334155]">
                                {m}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditDepartmentModal(d)}
                              className="rounded-lg border border-[#D9D9D9] px-2.5 py-1 text-xs font-semibold text-[#2649B3] hover:bg-[#EAF6FF]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteDepartment(d)}
                              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {departments.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-xs text-[#4F5050]">
                          Belum ada Departemen atau Divisi terdaftar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <div className="space-y-4">
              {/* Users table header */}
              <div className="rounded-[24px] border border-[#EFEFEF] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EFEFEF] px-6 py-4">
                  <div>
                    <h2 className="font-bold text-[#2649B3]">Semua Pengguna Platform</h2>
                    <p className="mt-0.5 text-xs text-[#4F5050]">{users.length} pengguna terdaftar di seluruh tenant</p>
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4F5050]" />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Cari nama atau email…"
                      className="h-9 w-64 rounded-xl border border-[#EFEFEF] bg-[#FDFDFD] pl-8 pr-3 text-sm outline-none focus:border-[#42ACFB]"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#EFEFEF] text-left text-xs font-semibold uppercase tracking-wider text-[#4F5050]">
                        <th className="px-6 py-3">Pengguna</th>
                        <th className="px-6 py-3">Tenant</th>
                        <th className="px-6 py-3">Company</th>
                        <th className="px-6 py-3">Role</th>
                        <th className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEFEF]">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-xs text-[#4F5050]">Memuat data pengguna…</td>
                        </tr>
                      ) : filteredAllUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-xs text-[#4F5050]">Tidak ada pengguna ditemukan.</td>
                        </tr>
                      ) : (
                        filteredAllUsers.map((u) => {
                          const tenant = tenants.find((t) => t.id === u.tenant_id);
                          const userCompany = companies.find((c) => c.tenant_id === u.tenant_id);
                          return (
                            <tr key={u.id} className="transition hover:bg-[#FDFDFD]">
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EAF6FF] text-xs font-bold text-[#2649B3]">
                                    {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                                  </span>
                                  <div>
                                    <p className="font-semibold text-[#090909]">{u.full_name || "-"}</p>
                                    <p className="text-xs text-[#4F5050]">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-xs text-[#4F5050]">{tenant?.name || u.tenant_id?.slice(0, 8) || "-"}</td>
                              <td className="px-6 py-3 text-xs text-[#4F5050]">{userCompany?.legal_name || "-"}</td>
                              <td className="px-6 py-3">
                                {u.roles && u.roles.length > 0 ? (
                                  <span className="rounded-full bg-[#EAF6FF] px-2.5 py-0.5 text-xs font-medium text-[#2649B3]">
                                    {u.roles[0].role_name || u.roles[0].role_code}
                                  </span>
                                ) : (
                                  <span className="text-xs text-[#4F5050]">-</span>
                                )}
                              </td>
                              <td className="px-6 py-3">
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  u.is_active !== false ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                                }`}>
                                  {u.is_active !== false ? "Aktif" : "Nonaktif"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : companyViewTab === "departments" ? (
        /* Company Admin: Departments, Divisions & Cost Centers Management */
        <div className="rounded-2xl border border-[#EFEFEF] bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EFEFEF] pb-4">
            <div>
              <h2 className="text-lg font-bold text-[#2649B3]">Kelola Departemen, Divisi & Cost Center</h2>
              <p className="mt-1 text-xs text-[#4F5050]">
                Setiap Departemen atau Divisi yang ditandai sebagai <b>Cost Center</b> otomatis muncul di dropdown <b>Buat Budget Plan</b> dan mewariskan modulnya ke seluruh <b>GM</b>, <b>SPV</b>, dan <b>STAFF</b> di dalamnya.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openNewDepartmentModal("DEPARTMENT")}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#2649B3] px-4 text-xs font-semibold text-white hover:bg-[#1D3A96]"
              >
                + Buat Departemen Baru
              </button>
              <button
                type="button"
                onClick={() => openNewDepartmentModal("DIVISION")}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#2649B3] bg-[#EAF6FF] px-4 text-xs font-semibold text-[#2649B3] hover:bg-[#D9EEFF]"
              >
                + Buat Divisi Baru
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {departments.map((d) => (
              <div key={d.id} className="rounded-2xl border border-[#EFEFEF] bg-[#FDFDFD] p-4 shadow-2xs flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                          d.unit_type === "DIVISION" ? "bg-purple-100 text-purple-800" : "bg-[#EAF6FF] text-[#2649B3]"
                        }`}>
                          {d.unit_type === "DIVISION" ? "DIVISI" : "DEPARTEMEN"}
                        </span>
                        <span className="font-mono text-xs font-bold text-[#4F5050]">{d.code}</span>
                        {d.is_cost_center && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            Cost Center Budgeting
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 text-base font-bold text-[#090909]">{d.name}</h3>
                      {d.parent_name && (
                        <p className="mt-0.5 text-xs text-[#4F5050]">Induk Departemen: <b>{d.parent_name}</b></p>
                      )}
                      <p className="mt-0.5 text-xs text-[#4F5050]">
                        Manager / SPV: <b>{d.manager_name || "Belum ditentukan"}</b> · <b>{d.member_count ?? 0}</b> anggota aktif
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditDepartmentModal(d)}
                        className="rounded-lg border border-[#D9D9D9] bg-white px-2.5 py-1 text-xs font-semibold text-[#2649B3] hover:bg-[#EAF6FF]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteDepartment(d)}
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-[#EFEFEF] pt-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#4F5050]">Hak Akses Modul Departemen/Divisi:</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(d.modules || []).length > 0 ? (
                        (d.modules || []).map((modKey) => (
                          <span key={modKey} className="rounded-lg bg-[#EAF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#2649B3]">
                            {MODULE_LABELS[String(modKey).toUpperCase()]?.name || modKey}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[#4F5050]">Belum ada modul didelegasikan</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 border-t border-[#EFEFEF] pt-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4F5050]">
                        Anggota Departemen ({displayedUsers.filter((u) => String(u.department_id || "") === String(d.id)).length} user):
                      </span>
                      <select
                        disabled={savingDeptRole}
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          void handleSaveUserDepartmentRole(d.id, undefined, e.target.value);
                        }}
                        className="h-7 rounded-lg border border-[#D9D9D9] bg-white px-2 text-[11px] font-semibold text-[#2649B3] outline-none focus:border-[#2649B3]"
                      >
                        <option value="">+ Assign User ke {d.code}…</option>
                        {displayedUsers
                          .filter((u) => String(u.department_id || "") !== String(d.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name || u.email} ({String(u.role_level || "STAFF").toUpperCase()})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {displayedUsers.filter((u) => String(u.department_id || "") === String(d.id)).length > 0 ? (
                        displayedUsers
                          .filter((u) => String(u.department_id || "") === String(d.id))
                          .map((u) => (
                            <span
                              key={u.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white px-2 py-0.5 text-[11px] font-medium text-[#090909]"
                            >
                              <span>{u.full_name || u.email}</span>
                              <span className="rounded bg-[#EAF6FF] px-1 text-[9px] font-bold text-[#2649B3]">
                                {String(u.role_level || "STAFF").toUpperCase()}
                              </span>
                            </span>
                          ))
                      ) : (
                        <span className="text-xs text-[#4F5050]">Belum ada user ditempatkan di unit ini</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Company Admin Team Access Control (Preserved) */
        <div className="grid min-h-[590px] grid-cols-1 overflow-hidden rounded-2xl border border-[#EFEFEF] bg-white lg:grid-cols-[310px_1fr]">
          <aside className="border-b border-[#EFEFEF] bg-[#EFEFEF] lg:border-b-0 lg:border-r">
            <div className="border-b border-[#EFEFEF] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#4F5050]">
                    Company members
                  </p>
                  <p className="mt-1 text-sm text-[#2649B3]">
                    {displayedUsers.length} active identities
                  </p>
                </div>
                <Users size={19} className="text-[#42ACFB]" />
              </div>
              <div className="relative mt-4">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4F5050]"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search team member"
                  className="h-10 w-full rounded-xl border border-[#EFEFEF] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#42ACFB]"
                />
              </div>
            </div>
            <div className="max-h-[510px] overflow-y-auto p-2">
              {visibleUsers.map((member) => {
                const active = member.id === selectedUserId;
                const roleName =
                  member.roles?.[0]?.role_name ||
                  member.roles?.[0]?.role_code ||
                  "Team member";
                return (
                  <button
                    key={member.id}
                    onClick={() => setSelectedUserId(member.id)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      active ? "bg-[#EAF6FF]" : "hover:bg-[#EAF6FF]"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        active ? "bg-[#2649B3] text-white" : "bg-[#EFEFEF] text-[#2649B3]"
                      }`}
                    >
                      {(member.full_name || member.email)
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#2649B3]">
                        {member.full_name || member.email}
                      </span>
                      <span className="block truncate text-xs text-[#4F5050]">
                        {member.id === user?.id ? "Your account · " : ""}
                        {roleName}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-[#2649B3]/80">
                        {(() => {
                          const dept = departments.find((d) => String(d.id) === String(member.department_id || ""));
                          const lvl = String(member.role_level || "STAFF").toUpperCase();
                          return dept ? `[${dept.code}] ${dept.name} · ${lvl}` : `Belum ada departemen · ${lvl}`;
                        })()}
                      </span>
                    </span>
                    <ChevronRight
                      size={15}
                      className={active ? "text-[#2649B3]" : "text-[#D9D9D9]"}
                    />
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="p-5 md:p-7">
            {selectedUser ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EFEFEF] pb-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#4F5050]">
                      Access profile
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-[#2649B3]">
                      {selectedUser.full_name || selectedUser.email}
                    </h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-[#4F5050]">
                      <Mail size={13} /> {selectedUser.email}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      selectedUser.is_active === false
                        ? "bg-red-50 text-red-700"
                        : "bg-[#EAF6FF] text-[#2649B3]"
                    }`}
                  >
                    {selectedUser.is_active === false ? "Inactive" : "Active"}
                  </span>
                </div>

                {selectedUser.id === user?.id && (
                  <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <LockKeyhole size={18} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Your own access is protected</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        Company Admin tidak dapat menaikkan atau menurunkan akses akunnya sendiri.
                        Gunakan Super Admin untuk perubahan administratif.
                      </p>
                    </div>
                  </div>
                )}

                {/* Assigned Roles Section */}
                <div className="mt-6 rounded-2xl border border-[#EFEFEF] p-5 bg-[#FDFDFD]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-[#2649B3]">Departemen, Divisi & Hierarki 3 Role (GM / SPV / STAFF)</h3>
                      <p className="mt-0.5 text-xs text-[#4F5050]">
                        Hubungkan anggota tim ke Departemen/Divisi (Cost Center) dan tetapkan wewenang 3 level hierarki untuk modul, CRM, dan approval anggaran.
                      </p>
                    </div>
                    <span className="rounded-full bg-[#EAF6FF] px-3 py-1 text-xs font-bold text-[#2649B3]">
                      Level: {String(selectedUser.role_level || "STAFF").toUpperCase()}
                    </span>
                  </div>
                  <div className="mb-5 grid gap-3 border-b border-[#EFEFEF] pb-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Departemen / Divisi (Cost Center)</label>
                      <select
                        disabled={savingDeptRole}
                        value={selectedUser.department_id || ""}
                        onChange={(e) => void handleSaveUserDepartmentRole(e.target.value || null, String(selectedUser.role_level || "STAFF"))}
                        className="h-10 w-full rounded-xl border border-[#D9D9D9] bg-white px-3 text-xs font-semibold text-[#090909] outline-none focus:border-[#2649B3] disabled:opacity-60"
                      >
                        <option value="">-- Belum Ditempatkan di Departemen / Divisi --</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            [{d.unit_type === "DIVISION" ? "DIVISI" : "DEPT"}] {d.code} — {d.name}{d.is_cost_center ? " (Cost Center)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Level Hierarki Role (3 Level)</label>
                      <select
                        disabled={savingDeptRole}
                        value={String(selectedUser.role_level || "STAFF").toUpperCase()}
                        onChange={(e) => void handleSaveUserDepartmentRole(selectedUser.department_id || null, e.target.value)}
                        className="h-10 w-full rounded-xl border border-[#D9D9D9] bg-white px-3 text-xs font-semibold text-[#090909] outline-none focus:border-[#2649B3] disabled:opacity-60"
                      >
                        <option value="GM">GM — General Manager (Visibilitas Lintas Divisi & Override Budget)</option>
                        <option value="SPV">SPV — Supervisor / Manager Divisi (Approval Divisi & Delegasi Tim)</option>
                        <option value="STAFF">STAFF — Staff / Sales Execution (Eksekusi Operasional & Pipeline Pribadi)</option>
                      </select>
                    </div>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-[#2649B3]">Assigned Roles</h3>
                      <p className="mt-0.5 text-xs text-[#4F5050]">
                        Peran yang ditugaskan kepada pengguna pada company ini. Pengguna dapat berganti peran aktif melalui menu atas.
                      </p>
                    </div>
                    {userRolesData.roles.find((r) => r.is_active) && (
                      <div className="flex items-center gap-1.5 rounded-full bg-[#EAF6FF] px-3 py-1 text-xs font-semibold text-[#2649B3]">
                        <span className="text-2xs text-[#4F5050]">Active Role:</span>
                        <span>{userRolesData.roles.find((r) => r.is_active)?.role_name || userRolesData.roles.find((r) => r.is_active)?.role_code}</span>
                      </div>
                    )}
                  </div>

                  {loadingUserRoles ? (
                    <div className="py-4 text-center text-xs text-[#4F5050]">Memuat daftar peran...</div>
                  ) : userRolesError ? (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{userRolesError}</div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                      {ASSIGNABLE_ROLES.map((item) => {
                        const assigned = userRolesData.roles.some(
                          (r) => r.raw_role_code === item.code || r.role_code === item.code
                        );
                        const isSelf = selectedUserId === user?.id;
                        const updating = roleUpdatingKey === item.code;
                        return (
                          <label
                            key={item.code}
                            className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-xs transition cursor-pointer ${
                              assigned
                                ? "border-[#2649B3]/40 bg-white shadow-xs font-semibold text-[#2649B3]"
                                : "border-[#EFEFEF] bg-white text-[#090909] hover:border-[#2649B3]/20"
                            } ${isSelf ? "cursor-not-allowed opacity-60" : ""}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={assigned}
                                disabled={isSelf || updating}
                                onChange={() => handleToggleUserRole(item.code, assigned)}
                                className="h-4 w-4 rounded border-[#D9D9D9] text-[#2649B3] focus:ring-[#2649B3]"
                              />
                              <span>{item.label}</span>
                            </div>
                            {updating && <RefreshCw size={12} className="animate-spin text-[#2649B3]" />}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-[#2649B3]">Module permissions</h3>
                      <p className="mt-1 text-xs text-[#4F5050]">
                        Role default mempertahankan hak bawaan. Pilihan lain membuat override khusus user.
                      </p>
                    </div>
                    <span className="text-xs text-[#4F5050]">
                      {approvedModules.length} company-approved
                    </span>
                  </div>

                  <div className="space-y-2">
                    {approvedModules.map((module) => {
                      const meta = MODULE_LABELS[module.module_code] || {
                        name: module.module_code,
                        description: "System module",
                      };
                      const explicit = displayedOverrides.find(
                        (item) =>
                          item.user_id === selectedUserId &&
                          item.module_code === module.module_code
                      );
                      const current = accessMode(explicit);
                      const saving = savingKey === `${selectedUserId}:${module.module_code}`;
                      const choices: Array<{ mode: AccessMode; label: string; icon: typeof Check }> = [
                        { mode: "inherit", label: "Role default", icon: KeyRound },
                        { mode: "blocked", label: "No access", icon: LockKeyhole },
                        { mode: "read", label: module.module_code === "MARBOT" ? "Use Marka Plus" : "View only", icon: Eye },
                        ...(module.module_code === "MARBOT"
                          ? []
                          : [{ mode: "write" as AccessMode, label: "View & manage", icon: Pencil }]),
                      ];

                      return (
                        <div
                          key={module.module_code}
                          className="grid gap-3 rounded-[14px] border border-[#EFEFEF] p-4 xl:grid-cols-[minmax(210px,1fr)_auto] xl:items-center"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EAF6FF] text-[10px] font-bold text-[#2649B3]">
                                {module.module_code.slice(0, 2)}
                              </span>
                              <p className="text-sm font-semibold text-[#2649B3]">{meta.name}</p>
                            </div>
                            <p className="ml-9 mt-1 text-xs text-[#4F5050]">{meta.description}</p>
                          </div>
                          <div className="segmented-control grid grid-cols-2 gap-1 p-1 sm:grid-cols-4">
                            {choices.map((choice) => {
                              const Icon = choice.icon;
                              const checked = current === choice.mode;
                              return (
                                <button
                                  key={choice.mode}
                                  disabled={saving || selectedUser.id === user?.id}
                                  onClick={() => setUserAccess(module.module_code, choice.mode)}
                                  className={`segmented-control-item min-h-9 px-2.5 ${
                                    checked
                                      ? "segmented-control-item-active ring-1 ring-[#9FD6FF]"
                                      : "text-[#4F5050] hover:text-[#2649B3]"
                                  } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                  <Icon size={13} /> {choice.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {!loading && approvedModules.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#D9D9D9] p-10 text-center">
                        <LockKeyhole className="mx-auto text-[#4F5050]" />
                        <p className="mt-3 font-semibold text-[#2649B3]">No modules provisioned</p>
                        <p className="mt-1 text-xs text-[#4F5050]">
                          Super Admin must enable a company module before it can be delegated.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center text-sm text-[#4F5050]">
                Select a company member to manage access.
              </div>
            )}
          </main>
        </div>
      )}

      {/* Company Admin: Invite panel (inline below main content) */}
      {!isSuper && inviteOpen && (
        <form onSubmit={submitInvite} className="rounded-2xl border border-[#EFEFEF] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus size={17} className="text-[#2649B3]" />
              <h2 className="font-semibold text-[#2649B3]">Invite company member</h2>
            </div>
            <button type="button" onClick={() => setInviteOpen(false)} className="text-xs text-[#4F5050] underline">Batal</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input
              required
              className="h-11 rounded-[11px] border border-[#EFEFEF] px-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#42ACFB]"
              placeholder="Nama lengkap *"
              value={invite.name}
              onChange={(e) => setInvite({ ...invite, name: e.target.value })}
            />
            <input
              required
              type="email"
              className="h-11 rounded-[11px] border border-[#EFEFEF] px-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#42ACFB]"
              placeholder="Email *"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
            />
            <input
              required
              minLength={8}
              type="password"
              className="h-11 rounded-[11px] border border-[#EFEFEF] px-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#42ACFB]"
              placeholder="Password sementara (min. 8 karakter) *"
              value={invite.password}
              onChange={(e) => setInvite({ ...invite, password: e.target.value })}
            />
            <select
              required
              className="h-11 rounded-[11px] border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]"
              value={invite.role_code}
              onChange={(e) => setInvite({ ...invite, role_code: e.target.value })}
            >
              <option value="">-- Pilih Role Sistem *</option>
              {roles
                .filter((role) => role.role_code !== "ROLE-COMPANY-ADMIN" && role.role_code !== "ROLE-SUPER-ADMIN")
                .map((role) => (
                  <option key={role.id} value={role.role_code}>
                    {role.role_name}
                  </option>
                ))}
            </select>
            <select
              className="h-11 rounded-[11px] border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]"
              value={invite.department_id}
              onChange={(e) => setInvite({ ...invite, department_id: e.target.value })}
            >
              <option value="">-- Pilih Departemen / Divisi (Opsional)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  [{d.unit_type === "DIVISION" ? "DIVISI" : "DEPT"}] {d.code} — {d.name}
                </option>
              ))}
            </select>
            <select
              required
              className="h-11 rounded-[11px] border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]"
              value={invite.role_level}
              onChange={(e) => setInvite({ ...invite, role_level: e.target.value })}
            >
              <option value="STAFF">Level Hierarki: STAFF / Sales Execution</option>
              <option value="SPV">Level Hierarki: SPV (Supervisor Divisi)</option>
              <option value="GM">Level Hierarki: GM (General Manager)</option>
            </select>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2649B3] px-5 text-sm font-semibold text-white hover:bg-[#1D3A96]"
            >
              <Check size={15} /> Kirim undangan
            </button>
          </div>
        </form>
      )}

      {/* Super Admin: Create User Modal */}
      {isSuper && superInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2649B3] text-white">
                  <UserPlus size={17} />
                </div>
                <div>
                  <h2 className="font-bold text-[#090909]">Tambah Pengguna Baru</h2>
                  <p className="text-xs text-[#4F5050]">Super Admin wajib memilih tenant, company, dan role</p>
                </div>
              </div>
              <button onClick={() => setSuperInviteOpen(false)} className="rounded-lg p-1.5 text-[#4F5050] hover:bg-[#EFEFEF]">
                ✕
              </button>
            </div>
            <form onSubmit={submitSuperInvite} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Nama Lengkap *</label>
                  <input
                    required
                    className="h-10 w-full rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]"
                    placeholder="Nama lengkap user"
                    value={superInvite.name}
                    onChange={(e) => setSuperInvite({ ...superInvite, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Email *</label>
                  <input
                    required
                    type="email"
                    className="h-10 w-full rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]"
                    placeholder="email@domain.com"
                    value={superInvite.email}
                    onChange={(e) => setSuperInvite({ ...superInvite, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Password Sementara * (min. 8 karakter)</label>
                <input
                  required
                  minLength={8}
                  type="password"
                  className="h-10 w-full rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]"
                  placeholder="Password sementara"
                  value={superInvite.password}
                  onChange={(e) => setSuperInvite({ ...superInvite, password: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Tenant *</label>
                <select
                  required
                  className="h-10 w-full rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]"
                  value={superInvite.tenant_id}
                  onChange={(e) => setSuperInvite({
                    ...superInvite,
                    tenant_id: e.target.value,
                    company_id: "",
                    role_code: "",
                  })}
                >
                  <option value="">-- Pilih Tenant *</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name || t.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Company *</label>
                <select
                  required
                  className="h-10 w-full rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB] disabled:opacity-50"
                  value={superInvite.company_id}
                  disabled={!superInvite.tenant_id}
                  onChange={(e) => setSuperInvite({ ...superInvite, company_id: e.target.value })}
                >
                  <option value="">{superInvite.tenant_id ? "-- Pilih Company *" : "-- Pilih tenant terlebih dahulu"}</option>
                  {superInviteCompanies.map((c) => (
                    <option key={c.id} value={c.id}>{c.legal_name || c.name || c.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Role *</label>
                <select
                  required
                  className="h-10 w-full rounded-xl border border-[#EFEFEF] px-3 text-sm outline-none focus:border-[#42ACFB]"
                  value={superInvite.role_code}
                  onChange={(e) => setSuperInvite({ ...superInvite, role_code: e.target.value })}
                >
                  <option value="">-- Pilih Role *</option>
                  {roles
                    .filter((r) =>
                      r.role_code !== "ROLE-SUPER-ADMIN" &&
                      r.tenant_id === superInvite.tenant_id
                    )
                    .map((role) => (
                      <option key={role.id} value={role.role_code}>{role.role_name}</option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 border-t border-[#EFEFEF] pt-4">
                <button
                  type="button"
                  onClick={() => setSuperInviteOpen(false)}
                  className="h-10 rounded-xl border border-[#D9D9D9] px-4 text-sm font-medium text-[#4F5050] hover:bg-[#FDFDFD]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={superInviteSubmitting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2649B3] px-5 text-sm font-semibold text-white hover:bg-[#1D3A96] disabled:opacity-60"
                >
                  <Check size={15} /> {superInviteSubmitting ? "Menyimpan…" : "Buat User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Buat / Edit Departemen, Divisi & Cost Center */}
      {deptFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-[#EFEFEF] pb-3">
              <div>
                <h2 className="text-base font-bold text-[#090909]">
                  {editingDeptId ? "Edit" : "Buat"} {deptForm.unit_type === "DIVISION" ? "Divisi" : "Departemen"} & Cost Center
                </h2>
                <p className="mt-0.5 text-xs text-[#4F5050]">
                  Atur kode Cost Center dan delegasikan modul yang otomatis diwarisi oleh GM, SPV, dan Staff pada unit ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeptFormOpen(false)}
                className="rounded-lg p-1.5 text-[#4F5050] hover:bg-[#EFEFEF]"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveDepartment} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Tipe Unit Organisasi *</label>
                  <select
                    value={deptForm.unit_type}
                    onChange={(e) => setDeptForm({ ...deptForm, unit_type: e.target.value as "DEPARTMENT" | "DIVISION" })}
                    className="h-10 w-full rounded-xl border border-[#D9D9D9] px-3 text-sm outline-none focus:border-[#2649B3]"
                  >
                    <option value="DEPARTMENT">Departemen Utama</option>
                    <option value="DIVISION">Divisi / Sub-Unit</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Kode Cost Center / Unit *</label>
                  <input
                    required
                    value={deptForm.code}
                    onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                    placeholder="Contoh: SALES, FIN, OPS, IT, DIV-B2B"
                    className="h-10 w-full rounded-xl border border-[#D9D9D9] px-3 text-sm font-mono uppercase outline-none focus:border-[#2649B3]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Nama {deptForm.unit_type === "DIVISION" ? "Divisi" : "Departemen"} *</label>
                  <input
                    required
                    value={deptForm.name}
                    onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                    placeholder="Contoh: Sales & Marketing / Divisi Enterprise B2B"
                    className="h-10 w-full rounded-xl border border-[#D9D9D9] px-3 text-sm outline-none focus:border-[#2649B3]"
                  />
                </div>
                {deptForm.unit_type === "DIVISION" && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Induk Departemen</label>
                    <select
                      value={deptForm.parent_id}
                      onChange={(e) => setDeptForm({ ...deptForm, parent_id: e.target.value })}
                      className="h-10 w-full rounded-xl border border-[#D9D9D9] px-3 text-sm outline-none focus:border-[#2649B3]"
                    >
                      <option value="">-- Tanpa Induk / Mandiri --</option>
                      {departments
                        .filter((d) => d.id !== editingDeptId && d.unit_type !== "DIVISION")
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} — {d.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#4F5050]">Manager / Supervisor (PIC Unit)</label>
                  <select
                    value={deptForm.manager_user_id}
                    onChange={(e) => setDeptForm({ ...deptForm, manager_user_id: e.target.value })}
                    className="h-10 w-full rounded-xl border border-[#D9D9D9] px-3 text-sm outline-none focus:border-[#2649B3]"
                  >
                    <option value="">-- Pilih Manager / SPV (Opsional) --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-4 pt-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#090909] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deptForm.is_cost_center}
                      onChange={(e) => setDeptForm({ ...deptForm, is_cost_center: e.target.checked })}
                      className="h-4 w-4 rounded border-[#D9D9D9] text-[#2649B3]"
                    />
                    Aktif sebagai Cost Center Budgeting
                  </label>
                </div>
              </div>

              <div className="border-t border-[#EFEFEF] pt-3">
                <label className="mb-2 block text-xs font-bold text-[#2649B3]">
                  Checklist Delegasi Modul (Diwariskan ke Anggota Departemen/Divisi)
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(approvedModules.length > 0
                    ? approvedModules.map((m) => m.module_code)
                    : Object.keys(MODULE_LABELS)
                  ).map((modCode) => {
                    const checked = deptForm.module_keys.includes(modCode);
                    return (
                      <label
                        key={modCode}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs cursor-pointer transition ${
                          checked
                            ? "border-[#2649B3] bg-[#EAF6FF]/60 font-semibold text-[#2649B3]"
                            : "border-[#EFEFEF] bg-white text-[#090909]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? Array.from(new Set([...deptForm.module_keys, modCode]))
                              : deptForm.module_keys.filter((k) => k !== modCode);
                            setDeptForm({ ...deptForm, module_keys: next });
                          }}
                          className="h-4 w-4 rounded border-[#D9D9D9] text-[#2649B3]"
                        />
                        <span className="truncate">{MODULE_LABELS[modCode]?.name || modCode}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-[#EFEFEF] pt-4">
                <button
                  type="button"
                  onClick={() => setDeptFormOpen(false)}
                  className="h-10 rounded-xl border border-[#D9D9D9] px-4 text-xs font-semibold text-[#4F5050]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={deptSubmitting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2649B3] px-5 text-xs font-semibold text-white hover:bg-[#1D3A96] disabled:opacity-50"
                >
                  <Check size={15} /> {deptSubmitting ? "Menyimpan…" : "Simpan Departemen / Divisi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Pencil, Plus, RefreshCw, ShieldCheck, ShieldOff, X } from "lucide-react";
import api from "@/lib/api/axios";
import { getApiErrorDetail } from "@/lib/api/project.api";
import { Modal } from "@/components/ui/Modal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { TablePagination, TableSearchBar, useTablePagination } from "@/components/ui/TablePagination";

type Row = Record<string, any>;
const empty = { account_code: "", account_name: "", account_type: "EXPENSE", normal_balance: "DEBIT", parent_account_id: "", allow_manual_posting: true, reconciliation_required: false };
const types = [
  { value: "ASSET", label: "Aset" },
  { value: "LIABILITY", label: "Kewajiban" },
  { value: "EQUITY", label: "Ekuitas" },
  { value: "REVENUE", label: "Pendapatan" },
  { value: "EXPENSE", label: "Beban" },
];
const typeLabel = (value: string) => types.find((t) => t.value === value)?.label ?? value;
const balanceLabel = (value: string) => (value === "DEBIT" ? "Debit" : value === "CREDIT" ? "Kredit" : value);

export function ChartOfAccountsWorkspace({ canOperate = false }: { canOperate?: boolean }) {
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await api.get("/api/v1/finance/accounts/?page_size=1000");
      const rows = response.data?.data?.results ?? response.data?.data?.rows ?? response.data?.data ?? response.data?.results ?? response.data ?? [];
      setAccounts(Array.isArray(rows) ? rows : []);
    } catch (cause) { setError(getApiErrorDetail(cause, "Daftar COA belum dapat dimuat.")); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (accounts.some((row) => row.account_code === String(form.account_code).trim() && row.id !== editing)) throw new Error("Kode akun sudah digunakan pada perusahaan ini.");
      const payload = { ...form, account_code: String(form.account_code).trim(), account_name: String(form.account_name).trim(), normal_balance: form.account_type === "ASSET" || form.account_type === "EXPENSE" ? "DEBIT" : "CREDIT", parent_account_id: form.parent_account_id || null, status: form.status || "ACTIVE" };
      if (editing) await api.put(`/api/v1/finance/accounts/${editing}`, payload);
      else await api.post("/api/v1/finance/accounts/", payload);
      setForm(empty); setEditing(null); setFormOpen(false); setNotice(editing ? "COA diperbarui." : "COA baru berhasil dibuat."); await load();
    } catch (cause: any) { setError(cause?.message || getApiErrorDetail(cause, "COA belum dapat disimpan.")); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const closeForm = () => { setEditing(null); setForm(empty); setFormOpen(false); };
  const startEdit = (row: Row) => { setFormOpen(true); setEditing(row.id); setForm({ ...row, parent_account_id: row.parent_account_id ?? "" }); setNotice(""); setError(""); };
  const seedStandard = async () => {
    if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try { const response = await api.post("/api/v1/finance/accounts/setup-standard"); setNotice(`COA standar siap: ${response.data?.data?.accounts_created_or_found ?? ""} akun ditemukan atau dibuat.`); await load(); }
    catch (cause) { setError(getApiErrorDetail(cause, "COA standar belum dapat disiapkan.")); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const toggleStatus = async (row: Row) => {
    if (actionLock.current) return; actionLock.current = true;
    const nextStatus = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setBusy(true); setError(""); setNotice("");
    try {
      await api.put(`/api/v1/finance/accounts/${row.id}`, { status: nextStatus });
      await load();
      setNotice(`Akun ${row.account_code} ${nextStatus === "ACTIVE" ? "diaktifkan" : "dinonaktifkan"}.`);
    }
    catch (cause) { setError(getApiErrorDetail(cause, "Status COA belum dapat diubah.")); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const coaTable = useTablePagination(
    accounts,
    useCallback((row, q) => `${row.account_code} ${row.account_name} ${row.account_type}`.toLowerCase().includes(q), [])
  );
  return <div className="flex flex-col gap-5">
    <section className="fin-card">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="text-[#163D64]" /> Daftar Akun COA</h2><p className="mt-1 text-xs text-[#6B7280]">Kelola akun buku besar. Akun yang sudah dipakai pada jurnal sebaiknya dinonaktifkan, bukan dihapus atau diganti kodenya.</p></div><div className="ml-auto flex flex-wrap items-center gap-2">{canOperate && <button type="button" onClick={() => { setEditing(null); setForm(empty); setFormOpen(true); }} disabled={busy} className="btn-final"><Plus size={14} /> Tambah Akun</button>}{canOperate && <button type="button" onClick={() => void seedStandard()} disabled={busy} className="btn-outline-soft">Siapkan COA standar</button>}<button type="button" onClick={() => void load()} disabled={busy} className="rounded-full border border-slate-200 p-2 hover:bg-slate-50" title="Muat ulang"><RefreshCw size={15} /></button></div></div>
      {error && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}{notice && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
      {canOperate && <Modal isOpen={formOpen} onClose={closeForm} title={editing ? "Edit Akun COA" : "Tambah Akun COA"} size="3xl"><form onSubmit={save} className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Kode akun<input required disabled={Boolean(editing)} maxLength={30} value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs disabled:bg-slate-100" placeholder="2150" /></label>
        <label className="text-xs font-medium text-slate-600">Nama akun<input required value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs" placeholder="Utang Gaji" /></label>
        <label className="text-xs font-medium text-slate-600">Tipe akun<select disabled={Boolean(editing)} value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value, normal_balance: ["ASSET", "EXPENSE"].includes(e.target.value) ? "DEBIT" : "CREDIT" })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs disabled:bg-slate-100">{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <div className="text-xs font-medium text-slate-600"><span className="mb-1 block">Akun induk (opsional)</span><SearchableSelect value={form.parent_account_id} onChange={(val) => setForm({ ...form, parent_account_id: val })} placeholder="Tanpa induk" emptyOptionLabel="Tanpa induk" searchPlaceholder="Cari kode atau nama akun..." options={accounts.filter((row) => row.id !== editing && row.status === "ACTIVE").map((row) => ({ value: String(row.id), label: `${row.account_code} — ${row.account_name}`, sublabel: typeLabel(row.account_type) }))} /></div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={Boolean(form.allow_manual_posting)} onChange={(e) => setForm({ ...form, allow_manual_posting: e.target.checked })} /> Izinkan posting langsung ke akun</label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={Boolean(form.reconciliation_required)} onChange={(e) => setForm({ ...form, reconciliation_required: e.target.checked })} /> Perlu rekonsiliasi</label>
        <div className="flex items-center gap-2 md:col-span-2 md:justify-end"><button type="button" onClick={closeForm} className="btn-outline-soft"><X size={13} /> Batal</button><button disabled={busy} className="btn-final"><Check size={14} /> {editing ? "Simpan perubahan" : "Buat akun COA"}</button></div>
      </form></Modal>}
    </section>
    <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <TableSearchBar query={coaTable.query} onQueryChange={coaTable.setQuery} onSearchSubmit={coaTable.applySearch} onReset={coaTable.resetSearch} placeholder="Cari kode, nama, atau tipe akun..." totalItems={accounts.length} filteredCount={coaTable.totalItems} showSubmitButton={false} />
        <span className="cell-muted text-xs">{coaTable.totalItems} akun</span>
      </div>
      <div className="overflow-auto"><table className="data-table w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Kode</th><th className="p-3">Nama akun</th><th className="p-3">Tipe</th><th className="p-3">Saldo normal</th><th className="p-3">Posting</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody>{coaTable.paginatedItems.map((row) => <tr key={row.id} className="border-t"><td className="p-3 font-medium">{row.account_code}</td><td className="p-3 font-medium">{row.account_name}</td><td className="p-3">{typeLabel(row.account_type)}</td><td className="p-3 cell-muted">{balanceLabel(row.normal_balance)}</td><td className="p-3 cell-muted">{row.allow_manual_posting ? "Manual diizinkan" : "Otomatis saja"}</td><td className="p-3"><span className={`status-label ${row.status === "ACTIVE" ? "is-ok" : "is-idle"}`}>{row.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</span></td><td className="p-3"><div className="flex justify-end gap-2">{canOperate && <><button type="button" title="Edit nama dan pengaturan" onClick={() => startEdit(row)} disabled={busy} className="rounded-full border border-slate-200 p-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Pencil size={13} /></button><button type="button" onClick={() => void toggleStatus(row)} disabled={busy} className={`inline-flex min-w-[116px] items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ${row.status === "ACTIVE" ? "border-amber-200 text-amber-800 hover:bg-amber-50" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"}`} title={row.status === "ACTIVE" ? "Nonaktifkan akun" : "Aktifkan akun"}>{row.status === "ACTIVE" ? <><ShieldOff size={12} /> Nonaktifkan</> : <><ShieldCheck size={12} /> Aktifkan</>}</button></>}</div></td></tr>)}{!coaTable.paginatedItems.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Belum ada akun COA.</td></tr>}</tbody></table></div>
      <div className="px-4 pb-3"><TablePagination page={coaTable.page} totalPages={coaTable.totalPages} pageSize={coaTable.pageSize} totalItems={coaTable.totalItems} onPageChange={coaTable.setPage} onPageSizeChange={coaTable.setPageSize} /></div>
    </section>
    {busy && <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[1px]"><span className="rounded-xl bg-white px-5 py-4 text-sm font-medium text-blue-900 shadow-xl">Memproses perubahan COA…</span></div>}
    <p className="cell-muted text-[11px]">Saldo buku besar dihitung dari jurnal yang dibukukan (POSTED). COA baru akan muncul pada Neraca Saldo setelah memiliki jurnal.</p>
  </div>;
}

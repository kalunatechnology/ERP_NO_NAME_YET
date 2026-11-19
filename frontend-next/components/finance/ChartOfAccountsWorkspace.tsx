"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Pencil, RefreshCw, ShieldCheck, ShieldOff, X } from "lucide-react";
import api from "@/lib/api/axios";
import { getApiErrorDetail } from "@/lib/api/project.api";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { TablePagination, TableSearchBar, useTablePagination } from "@/components/ui/TablePagination";

type Row = Record<string, any>;
const empty = { account_code: "", account_name: "", account_type: "EXPENSE", normal_balance: "DEBIT", parent_account_id: "", allow_manual_posting: true, reconciliation_required: false };
const types = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

export function ChartOfAccountsWorkspace({ canOperate = false }: { canOperate?: boolean }) {
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
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
      setForm(empty); setEditing(null); setNotice(editing ? "COA diperbarui." : "COA baru berhasil dibuat."); await load();
    } catch (cause: any) { setError(cause?.message || getApiErrorDetail(cause, "COA belum dapat disimpan.")); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const startEdit = (row: Row) => { setEditing(row.id); setForm({ ...row, parent_account_id: row.parent_account_id ?? "" }); setNotice(""); setError(""); };
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
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black"><BookOpen className="text-[#163D64]" /> Daftar Akun COA</h2><p className="mt-1 text-xs text-[#6B7280]">Kelola akun buku besar. Akun yang sudah dipakai pada jurnal sebaiknya dinonaktifkan, bukan dihapus atau diganti kodenya.</p></div><div className="flex gap-2">{canOperate && <button type="button" onClick={() => void seedStandard()} disabled={busy} className="rounded-xl border px-3 py-2 text-xs font-bold text-[#163D64]">Siapkan COA standar</button>}<button type="button" onClick={() => void load()} disabled={busy} className="rounded-xl border p-2"><RefreshCw size={15} /></button></div></div>
      {error && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}{notice && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
      {canOperate && <form onSubmit={save} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-4">
        <label className="text-[10px] font-bold text-slate-600">Kode akun<input required disabled={Boolean(editing)} maxLength={30} value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs disabled:bg-slate-100" placeholder="2150" /></label>
        <label className="text-[10px] font-bold text-slate-600">Nama akun<input required value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs" placeholder="Utang Gaji" /></label>
        <label className="text-[10px] font-bold text-slate-600">Tipe akun<select disabled={Boolean(editing)} value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value, normal_balance: ["ASSET", "EXPENSE"].includes(e.target.value) ? "DEBIT" : "CREDIT" })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs disabled:bg-slate-100">{types.map((type) => <option key={type}>{type}</option>)}</select></label>
        <div className="text-[10px] font-bold text-slate-600"><span className="mb-1 block">Akun induk (opsional)</span><SearchableSelect value={form.parent_account_id} onChange={(val) => setForm({ ...form, parent_account_id: val })} placeholder="Tanpa induk" emptyOptionLabel="Tanpa induk" searchPlaceholder="Cari kode atau nama akun..." options={accounts.filter((row) => row.id !== editing && row.status === "ACTIVE").map((row) => ({ value: String(row.id), label: `${row.account_code} — ${row.account_name}`, sublabel: row.account_type }))} /></div>
        <label className="flex items-center gap-2 text-[10px] font-semibold"><input type="checkbox" checked={Boolean(form.allow_manual_posting)} onChange={(e) => setForm({ ...form, allow_manual_posting: e.target.checked })} /> Izinkan posting langsung ke akun</label>
        <label className="flex items-center gap-2 text-[10px] font-semibold"><input type="checkbox" checked={Boolean(form.reconciliation_required)} onChange={(e) => setForm({ ...form, reconciliation_required: e.target.checked })} /> Perlu rekonsiliasi</label>
        <div className="flex items-center gap-2 md:col-span-2 md:justify-end">{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"><X size={13} /> Batal</button>}<button disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-[#163D64] px-4 py-2 text-xs font-bold text-white"><Check size={14} /> {editing ? "Simpan perubahan" : "Buat akun COA"}</button></div>
      </form>}
    </section>
    <section className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <TableSearchBar query={coaTable.query} onQueryChange={coaTable.setQuery} onSearchSubmit={coaTable.applySearch} onReset={coaTable.resetSearch} placeholder="Cari kode, nama, atau tipe akun..." totalItems={accounts.length} filteredCount={coaTable.totalItems} />
        <span className="text-xs text-slate-500">{coaTable.totalItems} akun</span>
      </div>
      <div className="overflow-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Kode</th><th className="p-3">Nama akun</th><th className="p-3">Tipe</th><th className="p-3">Saldo normal</th><th className="p-3">Posting</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody>{coaTable.paginatedItems.map((row) => <tr key={row.id} className="border-t"><td className="p-3 font-mono font-bold">{row.account_code}</td><td className="p-3 font-semibold">{row.account_name}</td><td className="p-3">{row.account_type}</td><td className="p-3">{row.normal_balance}</td><td className="p-3">{row.allow_manual_posting ? "Manual diizinkan" : "Otomatis saja"}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{row.status}</span></td><td className="p-3"><div className="flex justify-end gap-2">{canOperate && <><button type="button" title="Edit nama dan pengaturan" onClick={() => startEdit(row)} disabled={busy} className="rounded border p-1.5 text-blue-700 disabled:opacity-50"><Pencil size={13} /></button><button type="button" onClick={() => void toggleStatus(row)} disabled={busy} className={`inline-flex min-w-[120px] items-center justify-center gap-1 rounded border px-2 py-1.5 text-[10px] font-semibold disabled:opacity-50 ${row.status === "ACTIVE" ? "border-amber-200 text-amber-800 hover:bg-amber-50" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"}`} title={row.status === "ACTIVE" ? "Nonaktifkan akun" : "Aktifkan akun"}>{row.status === "ACTIVE" ? <><ShieldOff size={13} /> Nonaktifkan</> : <><ShieldCheck size={13} /> Aktifkan</>}</button></>}</div></td></tr>)}{!coaTable.paginatedItems.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Belum ada akun COA.</td></tr>}</tbody></table></div>
      <div className="px-4 pb-3"><TablePagination page={coaTable.page} totalPages={coaTable.totalPages} pageSize={coaTable.pageSize} totalItems={coaTable.totalItems} onPageChange={coaTable.setPage} onPageSizeChange={coaTable.setPageSize} /></div>
    </section>
    {busy && <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[1px]"><span className="rounded-xl bg-white px-5 py-4 text-sm font-semibold text-blue-900 shadow-xl">Memproses perubahan COA…</span></div>}
    <p className="text-[10px] text-slate-500">Saldo buku besar dihitung dari jurnal POSTED. COA baru akan muncul pada Trial Balance setelah memiliki jurnal.</p>
  </div>;
}

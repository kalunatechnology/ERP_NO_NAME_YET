"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import api from "@/lib/api/axios";
import { formatMoney } from "@/lib/utils";
import { getApiErrorDetail } from "@/lib/api/project.api";

type Row = Record<string, any>;
const empty = { tax_code: "", tax_name: "", tax_type: "PPN", tax_direction: "INPUT_VAT", tax_rate: "", effective_from: "", effective_to: "", input_account_id: "", output_account_id: "", payable_account_id: "", is_recoverable: true, status: "ACTIVE" };
const rowsOf = (value: any) => Array.isArray(value) ? value : value?.data?.results ?? value?.results ?? value?.data ?? [];
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs";

export function TaxCoaMappingWorkspace({ canOperate = false }: { canOperate?: boolean }) {
  const [taxes, setTaxes] = useState<Row[]>([]);
  const [transactions, setTransactions] = useState<Row[]>([]);
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
      const [taxResult, accountResult, transactionResult] = await Promise.allSettled([
        api.get("/api/v1/master-data/tax-codes/?page_size=500"),
        api.get("/api/v1/finance/accounts/?page_size=1000"),
        api.get("/api/v1/finance/tax-transactions/projection?page_size=200"),
      ]);
      if (taxResult.status === "rejected") throw taxResult.reason;
      if (accountResult.status === "rejected") throw accountResult.reason;
      setTaxes(rowsOf(taxResult.value.data));
      setAccounts(rowsOf(accountResult.value.data));
      if (transactionResult.status === "fulfilled") {
        setTransactions(rowsOf(transactionResult.value.data));
      } else {
        setTransactions([]);
        setNotice("Kode pajak dan COA berhasil dimuat, tetapi riwayat transaksi pajak belum dapat dimuat.");
      }
    } catch (cause) { setError(getApiErrorDetail(cause, "Kode pajak atau COA gagal dimuat.")); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const payload = { tax_code: form.tax_code.trim().toUpperCase(), tax_name: form.tax_name.trim(), tax_type: form.tax_type.trim(), tax_direction: form.tax_direction, tax_rate: Number(form.tax_rate), effective_from: form.effective_from || null, effective_to: form.effective_to || null, input_account_id: form.tax_direction === "INPUT_VAT" ? form.input_account_id || null : null, output_account_id: form.tax_direction === "OUTPUT_VAT" ? form.output_account_id || null : null, payable_account_id: form.tax_direction === "WITHHOLDING" ? form.payable_account_id || null : null, is_recoverable: Boolean(form.is_recoverable), status: form.status || "ACTIVE" };
      if (payload.tax_direction === "INPUT_VAT" && !payload.input_account_id) throw new Error("Pilih COA PPN Masukan.");
      if (payload.tax_direction === "OUTPUT_VAT" && !payload.output_account_id) throw new Error("Pilih COA PPN Keluaran.");
      if (payload.tax_direction === "WITHHOLDING" && !payload.payable_account_id) throw new Error("Pilih COA Utang Pajak.");
      if (editing) await api.put(`/api/v1/master-data/tax-codes/${editing}/`, payload);
      else await api.post("/api/v1/master-data/tax-codes/", payload);
      setForm(empty); setEditing(null); setNotice("Pemetaan kode pajak tersimpan."); await load();
    } catch (cause: any) { setError(cause?.message || getApiErrorDetail(cause, "Pemetaan pajak gagal disimpan.")); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const activeAssets = accounts.filter((account) => account.status === "ACTIVE" && account.account_type === "ASSET");
  const activeLiabilities = accounts.filter((account) => account.status === "ACTIVE" && account.account_type === "LIABILITY");
  const direction = form.tax_direction;
  return <div className="flex flex-col gap-4">
    <section className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black">Pemetaan Pajak ke COA</h2><p className="mt-1 text-xs text-slate-500">Atur kode, tarif, masa berlaku, dan akun buku besar. Perubahan tarif berlaku untuk transaksi baru.</p></div><button onClick={() => void load()} disabled={busy} className="rounded-lg border p-2"><RefreshCw size={14} /></button></div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}{notice && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
      {canOperate && <form onSubmit={save} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-4">
        <label className="text-[10px] font-bold">Kode<input required maxLength={40} value={form.tax_code} onChange={(e) => setForm({ ...form, tax_code: e.target.value })} className={inputClass} placeholder="PPN-MASUKAN" /></label>
        <label className="text-[10px] font-bold">Nama<input required value={form.tax_name} onChange={(e) => setForm({ ...form, tax_name: e.target.value })} className={inputClass} placeholder="PPN Masukan" /></label>
        <label className="text-[10px] font-bold">Jenis pajak<input required value={form.tax_type} onChange={(e) => setForm({ ...form, tax_type: e.target.value })} className={inputClass} placeholder="PPN / PPh 23" /></label>
        <label className="text-[10px] font-bold">Arah pajak<select value={form.tax_direction} onChange={(e) => setForm({ ...form, tax_direction: e.target.value })} className={inputClass}><option value="INPUT_VAT">PPN Masukan</option><option value="OUTPUT_VAT">PPN Keluaran</option><option value="WITHHOLDING">PPh Potong</option></select></label>
        <label className="text-[10px] font-bold">Tarif (%)<input required type="number" min="0" max="100" step="0.0001" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} className={inputClass} /></label>
        <label className="text-[10px] font-bold">Berlaku mulai<input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} className={inputClass} /></label>
        <label className="text-[10px] font-bold">Berlaku sampai<input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} className={inputClass} /></label>
        {direction === "INPUT_VAT" && <><label className="text-[10px] font-bold md:col-span-2">COA PPN Masukan<select required value={form.input_account_id} onChange={(e) => setForm({ ...form, input_account_id: e.target.value })} className={inputClass}><option value="">Pilih akun aset</option>{activeAssets.map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></label><label className="flex items-center gap-2 text-[10px] font-semibold md:col-span-2"><input type="checkbox" checked={Boolean(form.is_recoverable)} onChange={(e) => setForm({ ...form, is_recoverable: e.target.checked })} /> PPN dapat dikreditkan</label></>}
        {direction === "OUTPUT_VAT" && <label className="text-[10px] font-bold md:col-span-2">COA PPN Keluaran<select required value={form.output_account_id} onChange={(e) => setForm({ ...form, output_account_id: e.target.value })} className={inputClass}><option value="">Pilih akun kewajiban</option>{activeLiabilities.map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></label>}
        {direction === "WITHHOLDING" && <label className="text-[10px] font-bold md:col-span-2">COA Utang Pajak Potong<select required value={form.payable_account_id} onChange={(e) => setForm({ ...form, payable_account_id: e.target.value })} className={inputClass}><option value="">Pilih akun kewajiban</option>{activeLiabilities.map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></label>}
        <div className="flex justify-end gap-2 md:col-span-4">{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="rounded-lg border px-3 py-2 text-xs">Batal</button>}<button disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white"><Check size={13} />{editing ? "Simpan perubahan" : "Tambah kode pajak"}</button></div>
      </form>}
    </section>
    <section className="overflow-auto rounded-2xl border bg-white"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Kode / nama</th><th className="p-3">Arah</th><th className="p-3">Tarif</th><th className="p-3">COA pemetaan</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody>{taxes.map((tax) => { const rawAccountId = tax.input_account_id ?? tax.input_account ?? tax.output_account_id ?? tax.output_account ?? tax.payable_account_id ?? tax.payable_account; const accountId = rawAccountId && typeof rawAccountId === "object" ? rawAccountId.id : rawAccountId; const account = accounts.find((row) => row.id === accountId); const status = tax.status || "ACTIVE"; return <tr key={tax.id} className="border-t"><td className="p-3"><b>{tax.tax_code}</b><div>{tax.tax_name}</div></td><td className="p-3">{tax.tax_direction || tax.tax_type}</td><td className="p-3">{Number(tax.tax_rate ?? 0)}%</td><td className="p-3">{account ? `${account.account_code} — ${account.account_name}` : "Belum dipetakan"}{(tax.tax_direction || "").toUpperCase() === "INPUT_VAT" && <div className="text-[10px] text-slate-500">{tax.is_recoverable ? "Dapat dikreditkan" : "Masuk ke beban/aset"}</div>}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{status}</span></td><td className="p-3"><div className="flex justify-end gap-1">{canOperate && <><button type="button" onClick={() => { setEditing(tax.id); setForm({ ...empty, ...tax, input_account_id: tax.input_account_id ?? (typeof tax.input_account === "object" ? tax.input_account?.id : tax.input_account) ?? "", output_account_id: tax.output_account_id ?? (typeof tax.output_account === "object" ? tax.output_account?.id : tax.output_account) ?? "", payable_account_id: tax.payable_account_id ?? (typeof tax.payable_account === "object" ? tax.payable_account?.id : tax.payable_account) ?? "", tax_rate: String(tax.tax_rate ?? ""), effective_from: tax.effective_from ? String(tax.effective_from).slice(0, 10) : "", effective_to: tax.effective_to ? String(tax.effective_to).slice(0, 10) : "" }); }} disabled={busy} className="rounded border p-1.5 text-blue-700 disabled:opacity-50" title="Edit"><Pencil size={13} /></button><button type="button" onClick={async () => { const nextStatus = status === "INACTIVE" ? "ACTIVE" : "INACTIVE"; setBusy(true); setError(""); setNotice(""); try { await api.put(`/api/v1/master-data/tax-codes/${tax.id}/`, { status: nextStatus }); await load(); setNotice(`Kode pajak ${tax.tax_code} ${nextStatus === "ACTIVE" ? "diaktifkan" : "dinonaktifkan"}.`); } catch (cause) { setError(getApiErrorDetail(cause, "Status kode pajak gagal diperbarui.")); } finally { setBusy(false); } }} disabled={busy} className={`inline-flex min-w-[115px] items-center justify-center gap-1 rounded border px-2 py-1.5 text-[10px] font-semibold disabled:opacity-50 ${status === "ACTIVE" ? "border-amber-200 text-amber-800 hover:bg-amber-50" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"}`} title={status === "ACTIVE" ? "Nonaktifkan kode pajak" : "Aktifkan kode pajak"}>{status === "ACTIVE" ? <><ShieldOff size={13} /> Nonaktifkan</> : <><ShieldCheck size={13} /> Aktifkan</>}</button></>}</div></td></tr>; })}{!taxes.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Belum ada kode pajak.</td></tr>}</tbody></table></section>
    <section className="overflow-auto rounded-2xl border bg-white"><div className="border-b p-4"><h3 className="text-sm font-extrabold">Riwayat transaksi pajak</h3><p className="text-[10px] text-slate-500">PPN masukan dan PPh potong tercatat dari invoice vendor yang sudah diposting atau dibayar.</p></div><table className="w-full min-w-[750px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Tanggal / referensi</th><th className="p-3">Arah pajak</th><th className="p-3">Dasar pajak</th><th className="p-3">Nominal pajak</th><th className="p-3">Status</th><th className="p-3">Catatan</th></tr></thead><tbody>{transactions.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{String(row.tax_date ?? "").slice(0, 10)}<div className="font-mono text-[10px]">{row.invoice_number || row.billing_code || row.payment_reference || "—"}</div></td><td className="p-3">{row.tax_direction === "INPUT" ? "PPN Masukan" : row.tax_direction === "WITHHOLDING" ? "PPh Dipotong" : "PPN Keluaran"}</td><td className="p-3">{formatMoney(row.taxable_amount ?? 0)}</td><td className="p-3 font-bold">{formatMoney(row.tax_amount ?? 0)}</td><td className="p-3">{row.status}</td><td className="p-3">{row.validation_note || "—"}</td></tr>)}{!transactions.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Belum ada transaksi pajak.</td></tr>}</tbody></table></section>
  </div>;
}

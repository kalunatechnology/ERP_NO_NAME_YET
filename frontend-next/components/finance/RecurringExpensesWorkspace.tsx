"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Pencil, Plus, RefreshCw, Send } from "lucide-react";
import api from "@/lib/api/axios";
import { formatMoney } from "@/lib/utils";
import { getApiErrorDetail } from "@/lib/api/project.api";

type Row = Record<string, any>;
const rowsOf = (value: any) => Array.isArray(value) ? value : value?.data?.results ?? value?.results ?? value?.data ?? [];
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs";
const today = new Date();
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const empty = { rule_code: "", description: "", party_id: "", budget_scope: "OPERATIONAL", project_id: "", cost_center_id: "", expense_account_id: "", budget_allocation_id: "", input_tax_code_id: "", amount: "", recurrence_rule: "MONTHLY", next_run_date: dateValue(new Date(today.getFullYear(), today.getMonth() + 1, 1)), end_date: "", status: "ACTIVE" };

export function RecurringExpensesWorkspace({ canOperate = false }: { canOperate?: boolean }) {
  const [rules, setRules] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [vendors, setVendors] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [allocations, setAllocations] = useState<Row[]>([]);
  const [taxes, setTaxes] = useState<Row[]>([]);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [rulesRes, runsRes, vendorsRes, projectsRes, accountsRes, allocationsRes, taxesRes] = await Promise.all([
        api.get("/api/v1/finance/recurring-expenses/rules"), api.get("/api/v1/finance/recurring-expenses/runs"),
        api.get("/api/v1/finance/party-options?role=VENDOR"), api.get("/api/v1/finance/project-options"),
        api.get("/api/v1/finance/accounts/?page_size=1000"), api.get("/api/v1/finance/budget-lines/?page_size=500"),
        api.get("/api/v1/master-data/tax-codes/?page_size=500"),
      ]);
      setRules(rowsOf(rulesRes.data)); setRuns(rowsOf(runsRes.data)); setVendors(rowsOf(vendorsRes.data));
      setProjects(rowsOf(projectsRes.data)); setAccounts(rowsOf(accountsRes.data));
      setAllocations(rowsOf(allocationsRes.data).filter((row: Row) => String(row.budget?.status ?? "").toUpperCase() === "ACTIVE"));
      setTaxes(rowsOf(taxesRes.data).filter((row: Row) => row.status !== "INACTIVE"));
    } catch (cause) { setError(getApiErrorDetail(cause, "Data biaya berulang gagal dimuat.")); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const availableAllocations = useMemo(() => allocations.filter((row) => {
    const scopeMatches = form.budget_scope === "PROJECT"
      ? Boolean(form.project_id) && String(row.project_id ?? "") === String(form.project_id)
      : !row.project_id;
    return scopeMatches;
  }), [allocations, form.budget_scope, form.project_id]);
  const selectedInputTax = taxes.find((tax) => tax.id === form.input_tax_code_id);
  const base = Number(form.amount || 0);
  const tax = selectedInputTax ? base * Number(selectedInputTax.tax_rate ?? 0) / 100 : 0;

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault(); if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const { budget_scope, ...ruleData } = form;
      const payload = { ...ruleData, amount: Number(form.amount), cost_center_id: form.cost_center_id || null, project_id: budget_scope === "PROJECT" ? form.project_id || null : null, input_tax_code_id: form.input_tax_code_id || null, end_date: form.end_date || null };
      if (editing) await api.put(`/api/v1/finance/recurring-expenses/rules/${editing}`, payload);
      else await api.post("/api/v1/finance/recurring-expenses/rules", payload);
      setForm(empty); setEditing(null); setNotice("Aturan biaya berulang tersimpan. Tagihan belum dibuat sampai Anda menekan Generate."); await load();
    } catch (cause) { setError(getApiErrorDetail(cause, "Aturan biaya berulang gagal disimpan.")); }
    finally { actionLock.current = false; setBusy(false); }
  };
  const generate = async () => {
    if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try { const response = await api.post("/api/v1/finance/recurring-expenses/generate", { through_date: dateValue(new Date()) }); const generated = rowsOf(response.data); setNotice(generated.length ? `${generated.length} tagihan DRAFT dibuat. Periksa di menu Tagihan Vendor sebelum disetujui.` : "Tidak ada tagihan baru yang jatuh tempo untuk dibuat."); await load(); }
    catch (cause) { setError(getApiErrorDetail(cause, "Tagihan berulang gagal dibuat.")); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const activeProjects = projects.filter((project) => project.lifecycle_status !== "CANCELLED");
  const activeAccounts = accounts.filter((account) => account.status === "ACTIVE" && account.account_type === "EXPENSE");
  return <div className="flex flex-col gap-4">
    <section className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black"><CalendarClock className="text-blue-700" /> Biaya Tetap & Tagihan Berulang</h2><p className="mt-1 text-xs text-slate-500">Aturan bisa untuk proyek atau kantor internal. Sistem hanya membuat tagihan DRAFT; Finance memeriksa lalu melanjutkan approval dan posting di Tagihan Vendor.</p></div><div className="flex gap-2"><button onClick={() => void load()} disabled={busy} className="rounded-lg border p-2"><RefreshCw size={14} /></button>{canOperate && <button onClick={() => void generate()} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white"><Send size={13} /> Generate Tagihan Jatuh Tempo</button>}</div></div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}{notice && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
      {canOperate && <form onSubmit={saveRule} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-4">
        <label className="text-[10px] font-bold">Kode aturan<input required value={form.rule_code} onChange={(e) => setForm({ ...form, rule_code: e.target.value })} className={inputClass} placeholder="RENT-HEAD-OFFICE" /></label>
        <label className="text-[10px] font-bold">Nama biaya<input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Sewa kantor pusat" /></label>
        <label className="text-[10px] font-bold">Vendor<select required value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })} className={inputClass}><option value="">Pilih vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.display_name || vendor.legal_name || vendor.party_code}</option>)}</select></label>
        <label className="text-[10px] font-bold">Lingkup biaya<select value={form.budget_scope} onChange={(e) => setForm({ ...form, budget_scope: e.target.value, project_id: "", cost_center_id: "", budget_allocation_id: "" })} className={inputClass}><option value="PROJECT">Project Budget</option><option value="OPERATIONAL">Operational Budget</option></select></label>
        {form.budget_scope === "PROJECT" ? <label className="text-[10px] font-bold">Proyek<select required value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value, budget_allocation_id: "", cost_center_id: "" })} className={inputClass}><option value="">Pilih proyek</option>{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.project_code} — {project.project_name}</option>)}</select></label> : <div className="flex items-center rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">Biaya operasional perusahaan · tidak terkait proyek</div>}
        <label className="text-[10px] font-bold">COA beban<select required value={form.expense_account_id} onChange={(e) => setForm({ ...form, expense_account_id: e.target.value, budget_allocation_id: "", cost_center_id: "" })} className={inputClass}><option value="">Pilih akun beban</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></label>
        <label className="text-[10px] font-bold">Alokasi anggaran<select required value={form.budget_allocation_id} onChange={(e) => { const allocation = availableAllocations.find((row) => row.id === e.target.value); setForm({ ...form, budget_allocation_id: e.target.value, expense_account_id: allocation?.account_id ?? form.expense_account_id, cost_center_id: allocation?.cost_center_id ?? "" }); }} className={inputClass}><option value="">{form.budget_scope === "PROJECT" ? "Pilih pagu aktif proyek" : "Pilih pagu aktif operasional"}</option>{availableAllocations.map((row) => { const account = activeAccounts.find((item) => item.id === row.account_id); return <option key={row.id} value={row.id}>{account ? `${account.account_code} — ${account.account_name} · ` : "COA · "}{row.allocation_name || row.budget?.budget_name} · {formatMoney(row.budget_amount ?? 0)}</option>; })}</select>{availableAllocations.length === 0 && <span className="mt-1 block font-normal text-amber-700">Belum ada pagu aktif untuk {form.budget_scope === "PROJECT" ? "proyek" : "operasional"} ini. Buat dan aktifkan Budget Plan terlebih dahulu.</span>}{availableAllocations.length > 0 && !availableAllocations.some((row) => String(row.account_id ?? "") === String(form.expense_account_id ?? "")) && <span className="mt-1 block font-normal text-blue-700">Pilih pagu; COA beban dan cost center akan mengikuti alokasi tersebut.</span>}</label>
        <label className="text-[10px] font-bold">DPP per tagihan (Rp)<input required type="number" min="1" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} /></label>
        <label className="text-[10px] font-bold">Frekuensi<select value={form.recurrence_rule} onChange={(e) => setForm({ ...form, recurrence_rule: e.target.value })} className={inputClass}><option value="MONTHLY">Bulanan</option><option value="QUARTERLY">Triwulanan</option><option value="YEARLY">Tahunan</option></select></label>
        <label className="text-[10px] font-bold">Tagihan berikutnya<input required type="date" value={form.next_run_date} onChange={(e) => setForm({ ...form, next_run_date: e.target.value })} className={inputClass} /></label>
        <label className="text-[10px] font-bold">Tanggal akhir (opsional)<input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputClass} /></label>
        <label className="text-[10px] font-bold">PPN masukan<select value={form.input_tax_code_id} onChange={(e) => setForm({ ...form, input_tax_code_id: e.target.value })} className={inputClass}><option value="">Tanpa PPN</option>{taxes.filter((tax) => tax.tax_direction === "INPUT_VAT").map((tax) => <option key={tax.id} value={tax.id}>{tax.tax_code} · {tax.tax_rate}%</option>)}</select></label>
        <div className="flex items-center text-[10px] text-slate-600 md:col-span-2">Cost center: {form.cost_center_id ? "mengikuti alokasi anggaran" : "pilih alokasi untuk menentukan cost center"}. PPN {formatMoney(tax)} · Total tagihan {formatMoney(base + tax)}</div>
        <div className="flex justify-end gap-2 md:col-span-2">{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="rounded-lg border px-3 py-2 text-xs">Batal</button>}<button disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white"><Check size={13} />{editing ? "Simpan perubahan" : "Simpan aturan"}</button></div>
      </form>}
    </section>
    <section className="overflow-auto rounded-2xl border bg-white"><div className="border-b p-4"><h3 className="text-sm font-extrabold">Aturan biaya berulang</h3></div><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Kode / biaya</th><th className="p-3">Lingkup anggaran</th><th className="p-3">Vendor</th><th className="p-3">Nominal / jadwal</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody>{rules.map((rule) => { const vendor = vendors.find((row) => row.id === rule.party_id); const project = projects.find((row) => row.id === rule.project_id); return <tr key={rule.id} className="border-t"><td className="p-3"><b>{rule.rule_code}</b><div>{rule.description}</div></td><td className="p-3">{project ? <><span className="font-bold text-blue-700">Project Budget</span><div className="text-[10px] text-slate-500">{project.project_code} · {project.project_name}</div></> : <span className="font-bold text-emerald-700">Operational Budget · Kantor internal</span>}</td><td className="p-3">{vendor?.display_name || vendor?.legal_name || "—"}</td><td className="p-3">{formatMoney(rule.amount)}<div className="text-[10px] text-slate-500">{rule.recurrence_rule} · berikutnya {String(rule.next_run_date).slice(0, 10)}</div></td><td className="p-3">{rule.status}</td><td className="p-3 text-right">{canOperate && <button onClick={() => { setEditing(rule.id); setForm({ ...empty, ...rule, budget_scope: rule.project_id ? "PROJECT" : "OPERATIONAL", amount: String(rule.amount ?? ""), next_run_date: String(rule.next_run_date ?? "").slice(0, 10), end_date: rule.end_date ? String(rule.end_date).slice(0, 10) : "" }); }} className="rounded border p-1.5 text-blue-700"><Pencil size={13} /></button>}</td></tr>; })}{!rules.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Belum ada aturan biaya berulang.</td></tr>}</tbody></table></section>
    <section className="overflow-auto rounded-2xl border bg-white"><div className="border-b p-4"><h3 className="text-sm font-extrabold">Tagihan yang dihasilkan</h3><p className="text-[10px] text-slate-500">Semua tagihan baru berstatus DRAFT dan muncul di menu Tagihan Vendor.</p></div><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Jadwal</th><th className="p-3">Invoice vendor</th><th className="p-3">Nominal</th><th className="p-3">Status invoice</th><th className="p-3">Proses</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="border-t"><td className="p-3">{String(run.scheduled_date ?? "").slice(0, 10)}</td><td className="p-3 font-mono">{run.billing_document?.invoice_number || run.id}</td><td className="p-3">{formatMoney(run.billing_document?.total_amount ?? 0)}</td><td className="p-3">{run.billing_document?.status || run.run_status}</td><td className="p-3">Review di Tagihan Vendor</td></tr>)}{!runs.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Belum ada tagihan yang dihasilkan.</td></tr>}</tbody></table></section>
    <p className="text-[10px] text-slate-500">Generate idempoten per aturan dan periode; menekan tombol kembali tidak membuat invoice duplikat. Aturan tidak melakukan pembayaran otomatis.</p>
  </div>;
}

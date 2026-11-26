"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, Check, ClipboardList, Download, Pencil, Plus, RefreshCw, Send, Trash2, Users, X } from "lucide-react";
import api from "@/lib/api/axios";
import { formatMoney } from "@/lib/utils";
import { getApiErrorDetail } from "@/lib/api/project.api";
import { IDRInput } from "@/components/ui/IDRInput";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { TablePagination, TableSearchBar, useTablePagination } from "@/components/ui/TablePagination";
import { ExcelStatusBar, exportSheetsToXlsx } from "@/components/finance/ExcelGridShell";
import { useAuth } from "@/contexts/AuthContext";
import { isLevel1FinanceUser } from "@/lib/access/module-contract";

type Row = Record<string, any>;
type PayrollLine = { employee_id: string; cost_center_id: string; gross_salary: string; allowances: string; tax_pct: string; employee_tax: string; employee_bpjs: string; employer_bpjs: string };
const unwrapRows = (value: any) => Array.isArray(value) ? value : value?.data?.results ?? value?.data?.rows ?? value?.data ?? value?.results ?? value?.rows ?? [];
const today = new Date();
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const initialStart = dateValue(new Date(today.getFullYear(), today.getMonth(), 1));
const initialEnd = dateValue(new Date(today.getFullYear(), today.getMonth() + 1, 0));
const blankLine = (): PayrollLine => ({ employee_id: "", cost_center_id: "", gross_salary: "", allowances: "0", tax_pct: "", employee_tax: "0", employee_bpjs: "0", employer_bpjs: "0" });

// PPh 21 diinput sebagai persen; nominal dihitung dari (gaji pokok + tunjangan) x persen. Payload API tetap nominal.
const calcTax = (line: PayrollLine) => {
  const pct = Number(String(line.tax_pct || "0").replace(",", "."));
  if (!Number.isFinite(pct) || pct <= 0) return "0";
  return String(Math.round(((Number(line.gross_salary || 0) + Number(line.allowances || 0)) * pct) / 100));
};
const withTax = (line: PayrollLine): PayrollLine => (line.tax_pct === "" ? line : { ...line, employee_tax: calcTax(line) });

export function PayrollWorkspace({ canOperate = false }: { canOperate?: boolean }) {
  const { user } = useAuth();
  const canReviewAsFinance = isLevel1FinanceUser(user);
  const [tab, setTab] = useState<"runs" | "employees">("runs");
  const [employees, setEmployees] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [costCenters, setCostCenters] = useState<Row[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [employeeForm, setEmployeeForm] = useState<any>({ id: "", employee_number: "", employee_name: "", monthly_salary: "", cost_center_id: "" });
  const [periodStart, setPeriodStart] = useState(initialStart);
  const [periodEnd, setPeriodEnd] = useState(initialEnd);
  const [lines, setLines] = useState<PayrollLine[]>([blankLine()]);
  const [editingRun, setEditingRun] = useState<string | null>(null);
  const [payingRun, setPayingRun] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ bank_account_id: "", payment_date: dateValue(today), reference_number: "" });

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [employeeRes, runRes, optionsRes, bankRes] = await Promise.all([
        api.get("/api/v1/finance/payroll/employees"), api.get("/api/v1/finance/payroll/runs"),
        api.get("/api/v1/finance/budgeting/options"), api.get("/api/v1/finance/bank-accounts/?page_size=100"),
      ]);
      setEmployees(unwrapRows(employeeRes.data)); setRuns(unwrapRows(runRes.data));
      const options = optionsRes.data?.data ?? optionsRes.data;
      setCostCenters(unwrapRows(options?.cost_centers)); setBankAccounts(unwrapRows(bankRes.data).filter((bank: Row) => bank.status === "ACTIVE"));
    } catch (cause) { setError(getApiErrorDetail(cause, "Data payroll belum dapat dimuat.")); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveEmployee = async (event: React.FormEvent) => {
    event.preventDefault(); if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const payload = { employee_number: employeeForm.employee_number, employee_name: employeeForm.employee_name, monthly_salary: Number(employeeForm.monthly_salary), cost_center_id: employeeForm.cost_center_id || null };
      if (employeeForm.id) await api.put(`/api/v1/finance/payroll/employees/${employeeForm.id}`, payload);
      else await api.post("/api/v1/finance/payroll/employees", payload);
      setEmployeeForm({ id: "", employee_number: "", employee_name: "", monthly_salary: "", cost_center_id: "" }); setNotice("Data karyawan payroll tersimpan."); await load();
    } catch (cause) { setError(getApiErrorDetail(cause, "Data karyawan belum dapat disimpan.")); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const changeLine = (index: number, key: keyof PayrollLine, value: string) => setLines((current) => current.map((line, i) => i === index ? (key === "tax_pct" || key === "gross_salary" || key === "allowances" ? withTax({ ...line, [key]: value }) : { ...line, [key]: value }) : line));
  const selectEmployee = (index: number, employeeId: string) => {
    const employee = employees.find((row) => row.id === employeeId);
    setLines((current) => current.map((line, i) => i === index ? { ...line, employee_id: employeeId, gross_salary: String(employee?.monthly_salary ?? ""), cost_center_id: String(employee?.cost_center_id ?? "") } : line).map((line, i) => i === index ? withTax(line) : line));
  };

  const saveRun = async (event: React.FormEvent) => {
    event.preventDefault(); if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const payload = { period_start: periodStart, period_end: periodEnd, lines: lines.filter((line) => line.employee_id).map(({ tax_pct: _taxPct, ...line }) => ({ ...line, gross_salary: Number(line.gross_salary), allowances: Number(line.allowances), employee_tax: Number(line.employee_tax), employee_bpjs: Number(line.employee_bpjs), employer_bpjs: Number(line.employer_bpjs) })) };
      if (editingRun) await api.put(`/api/v1/finance/payroll/runs/${editingRun}`, payload);
      else await api.post("/api/v1/finance/payroll/runs", payload);
      setEditingRun(null); setLines([blankLine()]); setNotice("Payroll disimpan sebagai DRAFT. Periksa kembali sebelum diajukan."); await load();
    } catch (cause) { setError(getApiErrorDetail(cause, "Payroll belum dapat disimpan.")); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const editRun = (run: Row) => {
    setEditingRun(run.id); setPeriodStart(String(run.period_start).slice(0, 10)); setPeriodEnd(String(run.period_end).slice(0, 10));
    setLines((run.lines ?? []).map((line: Row) => ({ employee_id: line.employee_id, cost_center_id: line.cost_center_id ?? "", gross_salary: String(line.gross_salary), allowances: String(line.allowances), tax_pct: Number(line.gross_salary) + Number(line.allowances) > 0 && Number(line.employee_tax) > 0 ? String(Math.round((Number(line.employee_tax) / (Number(line.gross_salary) + Number(line.allowances))) * 10000) / 100) : "", employee_tax: String(line.employee_tax), employee_bpjs: String(line.employee_bpjs), employer_bpjs: String(line.employer_bpjs) })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const runAction = async (run: Row, action: string, payload: Row = {}) => {
    if (actionLock.current) return; actionLock.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "delete") await api.delete(`/api/v1/finance/payroll/runs/${run.id}`);
      else if (action === "finance-approve") await api.post(`/api/v1/hr/payroll/${run.id}/finance-review`, { decision: "APPROVE" });
      else if (action === "finance-reject") await api.post(`/api/v1/hr/payroll/${run.id}/finance-review`, { decision: "REJECT", note: "Dikembalikan Finance untuk peninjauan." });
      else if (action === "post-gl") await api.post(`/api/v1/hr/payroll/${run.id}/post-gl`);
      else if (action === "pay" && canReviewAsFinance) await api.post(`/api/v1/hr/payroll/${run.id}/pay`, payload);
      else await api.post(`/api/v1/finance/payroll/runs/${run.id}/${action}`, payload);
      setPayingRun(null); setNotice(`Payroll ${run.run_number} diperbarui.`); await load();
    }
    catch (cause) { setError(getApiErrorDetail(cause, `Aksi ${action} belum dapat diproses.`)); }
    finally { actionLock.current = false; setBusy(false); }
  };

  const activeEmployees = employees.filter((employee) => employee.employment_status === "ACTIVE");
  const runGross = lines.reduce((sum, line) => sum + Number(line.gross_salary || 0) + Number(line.allowances || 0), 0);
  const runDeductions = lines.reduce((sum, line) => sum + Number(line.employee_tax || 0) + Number(line.employee_bpjs || 0), 0);
  const runNet = runGross - runDeductions;
  const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs";
  const noCostCenter = costCenters.length === 0;
  const costCenterHint = noCostCenter ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Belum ada cost center. Buat cost center dulu di <span className="font-medium">Master Perusahaan</span> (menu Master Data → Perusahaan), lalu muat ulang halaman ini. Cost center bersifat opsional untuk menyimpan karyawan, tetapi dibutuhkan untuk kontrol pagu anggaran.</div> : null;

  const employeesTable = useTablePagination(
    employees,
    useCallback(
      (row, q) => {
        const cc = costCenters.find((c) => c.id === row.cost_center_id);
        return `${row.employee_number} ${row.employee_name} ${cc?.name || cc?.cost_center_name || ""} ${row.employment_status}`.toLowerCase().includes(q);
      },
      [costCenters]
    )
  );
  const runsTable = useTablePagination(
    runs,
    useCallback((row, q) => `${row.run_number} ${row.status} ${row.period_start || ""} ${row.period_end || ""}`.toLowerCase().includes(q), [])
  );

  const runStatusLabel = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      DRAFT: { label: "Draft", cls: "is-idle" },
      PENDING_APPROVAL: { label: "Menunggu Persetujuan", cls: "is-warn" },
      HR_APPROVED: { label: "Menunggu Review Finance", cls: "is-warn" },
      APPROVED: { label: "Disetujui", cls: "is-ok" },
      POSTED: { label: "Dibukukan", cls: "is-ok" },
      PAID: { label: "Dibayar", cls: "is-ok" },
    };
    return map[status] ?? { label: status, cls: "is-idle" };
  };

  return <div className="flex flex-col gap-5">
    {busy && actionLock.current && <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[1px]"><div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 text-sm font-medium text-blue-900 shadow-xl"><RefreshCw size={18} className="animate-spin" />Memproses payroll. Tunggu sampai server merespons…</div></div>}
    <section className="fin-card">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Banknote className="text-[#163D64]" /> Payroll &amp; Gaji Karyawan</h2><p className="mt-1 text-xs text-slate-600">Kelola master gaji, buat payroll bulanan, ajukan persetujuan, posting akrual ke buku besar, lalu bayar gaji bersih melalui rekening bank.</p></div><button type="button" onClick={() => void load()} disabled={busy} className="rounded-full border border-slate-200 p-2 hover:bg-slate-50" title="Muat ulang"><RefreshCw size={15} /></button></div>
      {error && <div role="alert" className={`mt-3 rounded-xl p-3 text-xs ${/cost.?center/i.test(error) ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-700"}`}>{error}{/cost.?center/i.test(error) && <span> — Buat cost center dulu di Master Perusahaan, lalu pilih pada baris karyawan.</span>}</div>}{notice && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
      <div className="fin-subtabs mt-4"><button type="button" data-active={tab === "runs"} onClick={() => setTab("runs")}><ClipboardList size={14} /> Penggajian Bulanan</button><button type="button" data-active={tab === "employees"} onClick={() => setTab("employees")}><Users size={14} /> Karyawan &amp; Gaji Pokok</button></div>
    </section>

    {tab === "employees" && <>
      {canOperate && <form onSubmit={saveEmployee} className="fin-card grid gap-3 md:grid-cols-4">
        {noCostCenter && <div className="md:col-span-4">{costCenterHint}</div>}
        <label className="text-xs font-medium text-slate-600">Nomor karyawan<input required value={employeeForm.employee_number} onChange={(e) => setEmployeeForm({ ...employeeForm, employee_number: e.target.value })} className={inputClass} placeholder="EMP-001" /></label>
        <label className="text-xs font-medium text-slate-600">Nama karyawan<input required value={employeeForm.employee_name} onChange={(e) => setEmployeeForm({ ...employeeForm, employee_name: e.target.value })} className={inputClass} placeholder="Nama lengkap" /></label>
        <div className="text-xs font-medium text-slate-600"><span className="block">Gaji pokok bulanan</span><div className="mt-1"><IDRInput required value={employeeForm.monthly_salary} onChange={(v) => setEmployeeForm({ ...employeeForm, monthly_salary: v })} className="rounded-xl text-xs" placeholder="8.500.000" /></div></div>
        <div className="text-xs font-medium text-slate-600"><span className="mb-1 block">Cost center default</span><SearchableSelect value={employeeForm.cost_center_id} onChange={(val) => setEmployeeForm({ ...employeeForm, cost_center_id: val })} placeholder="Pilih cost center" searchPlaceholder="Cari cost center..." options={costCenters.map((cc) => ({ value: String(cc.id), label: `${cc.code || cc.cost_center_code} — ${cc.name || cc.cost_center_name}` }))} /></div>
        <div className="ml-auto flex w-full justify-end gap-2 md:col-span-4">{employeeForm.id && <button type="button" onClick={() => setEmployeeForm({ id: "", employee_number: "", employee_name: "", monthly_salary: "", cost_center_id: "" })} className="btn-outline-soft">Batal</button>}<button disabled={busy} className="btn-final disabled:opacity-50"><Check size={14} />{busy ? "Menyimpan…" : employeeForm.id ? "Simpan karyawan" : "Tambah karyawan"}</button></div>
      </form>}
      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="text-sm font-semibold">Master karyawan payroll</h3>
            <p className="cell-muted text-[11px]">{activeEmployees.length} karyawan aktif · karyawan nonaktif tetap tersimpan dan terlihat</p>
          </div>
          <TableSearchBar query={employeesTable.query} onQueryChange={employeesTable.setQuery} onSearchSubmit={employeesTable.applySearch} onReset={employeesTable.resetSearch} placeholder="Cari nomor, nama, cost center..." totalItems={employees.length} filteredCount={employeesTable.totalItems} showSubmitButton={false} />
        </div>
        <div className="overflow-auto">
          <table className="data-table w-full min-w-[700px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr><th className="p-3">Nomor</th><th className="p-3">Nama</th><th className="p-3">Gaji pokok</th><th className="p-3">Cost center</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {employeesTable.paginatedItems.map((employee) => {
                const isActive = employee.employment_status === "ACTIVE";
                const canToggleStatus = ["ACTIVE", "INACTIVE"].includes(employee.employment_status);
                return <tr key={employee.id} className="border-t">
                  <td className="p-3 cell-muted">{employee.employee_number}</td>
                  <td className="p-3 font-medium">{employee.employee_name}</td>
                  <td className="p-3">{formatMoney(employee.monthly_salary ?? 0)}</td>
                  <td className="p-3 cell-muted">{costCenters.find((cc) => cc.id === employee.cost_center_id)?.name ?? costCenters.find((cc) => cc.id === employee.cost_center_id)?.cost_center_name ?? "—"}</td>
                  <td className="p-3"><span className={`status-label ${isActive ? "is-ok" : "is-idle"}`}>{isActive ? "Aktif" : "Nonaktif"}</span></td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1.5">
                      {canOperate && isActive && <button type="button" disabled={busy} onClick={() => setEmployeeForm({ id: employee.id, employee_number: employee.employee_number, employee_name: employee.employee_name, monthly_salary: String(employee.monthly_salary ?? ""), cost_center_id: employee.cost_center_id ?? "" })} className="rounded-full border border-slate-200 p-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50" title="Edit karyawan"><Pencil size={13} /></button>}
                      {canOperate && canToggleStatus && <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (actionLock.current) return;
                          actionLock.current = true;
                          const nextStatus = isActive ? "INACTIVE" : "ACTIVE";
                          setBusy(true); setError(""); setNotice("");
                          try {
                            await api.put(`/api/v1/finance/payroll/employees/${employee.id}`, { employment_status: nextStatus });
                            await load();
                            setNotice(`${employee.employee_name} ${nextStatus === "ACTIVE" ? "diaktifkan" : "dinonaktifkan"}.`);
                          } catch (cause) {
                            setError(getApiErrorDetail(cause, "Status karyawan belum dapat diubah."));
                          } finally { actionLock.current = false; setBusy(false); }
                        }}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ${isActive ? "border-amber-200 text-amber-800 hover:bg-amber-50" : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"}`}
                      >{isActive ? "Nonaktifkan" : "Aktifkan"}</button>}
                    </div>
                  </td>
                </tr>;
              })}
              {!employeesTable.paginatedItems.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Belum ada data karyawan. Tambahkan karyawan dan gaji pokok di atas.</td></tr>}
            </tbody>
          </table>
          {employeesTable.filteredItems.length > 0 && (
            <ExcelStatusBar
              label="Ringkasan Gaji Pokok"
              values={employeesTable.filteredItems.map((e: any) => Number(e.monthly_salary ?? 0))}
            />
          )}
        </div>
        <div className="px-4 pb-3"><TablePagination page={employeesTable.page} totalPages={employeesTable.totalPages} pageSize={employeesTable.pageSize} totalItems={employeesTable.totalItems} onPageChange={employeesTable.setPage} onPageSizeChange={employeesTable.setPageSize} /></div>
      </section>
    </>}

    {tab === "runs" && <>
      {canOperate && <form onSubmit={saveRun} className="fin-card flex flex-col gap-4">
        {costCenterHint}
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">{editingRun ? "Edit payroll DRAFT" : "Buat payroll bulanan"}</h3><p className="cell-muted text-[11px]">Posting payroll memakai COA 6100, 2150, 2160, dan 2170 serta memeriksa pagu aktif pada cost center tiap karyawan.</p></div><div className="grid grid-cols-2 gap-2"><label className="text-xs font-medium text-slate-600">Periode mulai<input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputClass} /></label><label className="text-xs font-medium text-slate-600">Periode akhir<input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputClass} /></label></div></div>
        {lines.map((line, index) => <div key={`${index}-${line.employee_id}`} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4 xl:grid-cols-8">
          <div className="text-xs font-medium text-slate-600 md:col-span-2"><span className="mb-1 block">Karyawan</span><SearchableSelect value={line.employee_id} onChange={(val) => selectEmployee(index, val)} placeholder="Pilih karyawan" searchPlaceholder="Cari nomor atau nama karyawan..." options={activeEmployees.map((employee) => ({ value: String(employee.id), label: `${employee.employee_number} — ${employee.employee_name}` }))} /></div>
          <div className="text-xs font-medium text-slate-600"><span className="block">Gaji pokok</span><div className="mt-1"><IDRInput required value={line.gross_salary} onChange={(v) => changeLine(index, "gross_salary", v)} className="rounded-xl text-xs" /></div></div>
          <div className="text-xs font-medium text-slate-600"><span className="block">Tunjangan</span><div className="mt-1"><IDRInput value={line.allowances} onChange={(v) => changeLine(index, "allowances", v)} className="rounded-xl text-xs" /></div></div>
          <div className="text-xs font-medium text-slate-600"><span className="block">PPh 21 (%)</span><div className="relative mt-1"><input inputMode="decimal" value={line.tax_pct} onChange={(e) => changeLine(index, "tax_pct", e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0" className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 pr-8 text-xs tabular-nums" /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-secondary">%</span></div><span className="cell-muted mt-0.5 block text-[10px]">= {formatMoney(Number(line.employee_tax || 0))}</span></div>
          <div className="text-xs font-medium text-slate-600"><span className="block">BPJS karyawan</span><div className="mt-1"><IDRInput value={line.employee_bpjs} onChange={(v) => changeLine(index, "employee_bpjs", v)} className="rounded-xl text-xs" /></div></div>
          <div className="text-xs font-medium text-slate-600"><span className="block">BPJS perusahaan</span><div className="mt-1"><IDRInput value={line.employer_bpjs} onChange={(v) => changeLine(index, "employer_bpjs", v)} className="rounded-xl text-xs" /></div></div>
          <div className="text-xs font-medium text-slate-600 md:col-span-2"><span className="mb-1 block">Cost center</span><SearchableSelect value={line.cost_center_id} onChange={(val) => changeLine(index, "cost_center_id", val)} placeholder="Pilih cost center" searchPlaceholder="Cari cost center..." options={costCenters.map((cc) => ({ value: String(cc.id), label: `${cc.code || cc.cost_center_code} — ${cc.name || cc.cost_center_name}` }))} /></div>
          <div className="flex items-end justify-between gap-2 md:col-span-2 xl:col-span-6"><span className="pb-2 text-[11px] text-slate-600">Gaji bersih: <span className="font-semibold text-slate-900">{formatMoney(Number(line.gross_salary || 0) + Number(line.allowances || 0) - Number(line.employee_tax || 0) - Number(line.employee_bpjs || 0))}</span> <span className="cell-muted">· BPJS perusahaan menjadi beban tambahan.</span></span><button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="mb-1 rounded-full border border-slate-200 p-1.5 text-red-700 hover:bg-red-50" title="Hapus baris"><Trash2 size={13} /></button></div>
        </div>)}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><button type="button" disabled={busy} onClick={() => setLines((current) => [...current, blankLine()])} className="btn-outline-soft disabled:opacity-50"><Plus size={14} /> Tambah karyawan</button><span className="text-xs text-slate-600">Total gaji &amp; tunjangan {formatMoney(runGross)} · Potongan {formatMoney(runDeductions)} · Bersih {formatMoney(runNet)}</span><div className="ml-auto flex justify-end gap-2">{editingRun && <button type="button" disabled={busy} onClick={() => { setEditingRun(null); setLines([blankLine()]); }} className="btn-outline-soft disabled:opacity-50">Batal edit</button>}<button disabled={busy || !activeEmployees.length} className="btn-final disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan sebagai DRAFT"}</button></div></div>
      </form>}

      {payingRun && <form onSubmit={(e) => { e.preventDefault(); const run = runs.find((row) => row.id === payingRun); if (run) void runAction(run, "pay", payForm); }} className="grid gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 md:grid-cols-4"><label className="text-xs font-medium text-slate-700">Rekening bank<select required value={payForm.bank_account_id} onChange={(e) => setPayForm({ ...payForm, bank_account_id: e.target.value })} className={inputClass}><option value="">Pilih rekening</option>{bankAccounts.map((bank) => <option key={bank.id} value={bank.id}>{bank.account_name || bank.bank_name} · {bank.account_number}</option>)}</select></label><label className="text-xs font-medium text-slate-700">Tanggal bayar<input required type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} className={inputClass} /></label><label className="text-xs font-medium text-slate-700">Referensi transfer<input required value={payForm.reference_number} onChange={(e) => setPayForm({ ...payForm, reference_number: e.target.value })} className={inputClass} placeholder="TRF-GAJI-2026-01" /></label><div className="flex items-end justify-end gap-2"><button disabled={busy} className="btn-final disabled:opacity-50">{busy ? "Memproses pembayaran…" : "Bayar gaji bersih"}</button><button type="button" disabled={busy} onClick={() => setPayingRun(null)} className="btn-outline-soft disabled:opacity-50">Batal</button></div><p className="cell-muted text-[11px] md:col-span-4">Pembayaran ini melunasi gaji bersih. Utang PPh 21 dan BPJS tetap tercatat sebagai kewajiban sampai dibayar terpisah.</p></form>}

      <section className="overflow-hidden rounded-2xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h3 className="text-sm font-semibold">Riwayat payroll</h3><p className="cell-muted text-[11px]">Persetujuan wajib dilakukan oleh pengguna berbeda dari pembuat.</p></div><TableSearchBar query={runsTable.query} onQueryChange={runsTable.setQuery} onSearchSubmit={runsTable.applySearch} onReset={runsTable.resetSearch} placeholder="Cari nomor payroll atau status..." totalItems={runs.length} filteredCount={runsTable.totalItems} showSubmitButton={false} /></div><div className="overflow-auto"><table className="data-table w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Nomor / periode</th><th className="p-3 col-center">Karyawan</th><th className="p-3">Bruto</th><th className="p-3">Potongan</th><th className="p-3">Gaji bersih</th><th className="p-3">Status</th><th className="sticky right-0 z-20 bg-slate-50 p-3 text-right">Aksi</th></tr></thead><tbody>{runsTable.paginatedItems.map((run) => { const st = runStatusLabel(run.status); const settled = run.status === "POSTED" || run.status === "PAID"; return <tr key={run.id} className={settled ? "row-settled border-t" : "border-t"}><td className="p-3"><span className="font-medium">{run.run_number}</span><div className="cell-muted text-[11px]">{String(run.period_start).slice(0, 10)} – {String(run.period_end).slice(0, 10)}</div></td><td className="p-3 col-center cell-muted">{run.lines?.length ?? 0}</td><td className="p-3">{formatMoney(run.gross_total)}</td><td className="p-3 amount-neg">{formatMoney(run.deduction_total)}</td><td className="p-3 font-medium">{formatMoney(run.net_total)}</td><td className="p-3"><span className={`status-label ${st.cls}`}>{st.label}</span></td><td className="sticky right-0 z-10 whitespace-nowrap bg-white p-3"><div className="flex justify-end gap-1.5">{canOperate && run.status === "DRAFT" && <><button type="button" title="Edit" onClick={() => editRun(run)} className="rounded-full border border-slate-200 p-1.5 text-blue-700 hover:bg-blue-50"><Pencil size={13} /></button><button type="button" title="Hapus draft" onClick={() => { if (window.confirm(`Hapus draft ${run.run_number}?`)) void runAction(run, "delete"); }} className="rounded-full border border-slate-200 p-1.5 text-red-700 hover:bg-red-50"><Trash2 size={13} /></button><button type="button" onClick={() => void runAction(run, "submit")} className="btn-outline-soft px-3 py-1 text-[11px]"><Send size={12} /> Ajukan</button></>}{canOperate && run.status === "PENDING_APPROVAL" && <button type="button" onClick={() => void runAction(run, "approve")} className="btn-outline-soft border-emerald-200 px-3 py-1 text-[11px] text-emerald-700"><Check size={12} /> Setujui</button>}{canReviewAsFinance && run.status === "HR_APPROVED" && <><button type="button" disabled={busy || run.created_by_id === user?.id} title={run.created_by_id === user?.id ? "Pembuat payroll tidak dapat menyetujui payroll ini." : "Setujui payroll untuk diposting ke GL"} onClick={() => void runAction(run, "finance-approve")} className="btn-outline-soft border-emerald-200 px-3 py-1 text-[11px] text-emerald-700 disabled:opacity-50"><Check size={12} /> ACC Finance</button><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Kembalikan ${run.run_number} ke DRAFT untuk revisi?`)) void runAction(run, "finance-reject"); }} className="btn-outline-soft border-rose-200 px-3 py-1 text-[11px] text-rose-700 disabled:opacity-50"><X size={12} /> Tolak</button></>}{canReviewAsFinance && run.status === "APPROVED" && <button type="button" disabled={busy || run.created_by_id === user?.id} onClick={() => void runAction(run, "post-gl")} className="btn-final px-3 py-1 text-[11px] disabled:opacity-50">Posting ke GL</button>}{(canOperate || canReviewAsFinance) && run.status === "POSTED" && <button type="button" onClick={() => { setPayingRun(run.id); setPayForm({ bank_account_id: String(bankAccounts[0]?.id ?? ""), payment_date: dateValue(new Date()), reference_number: `PAY-${run.run_number}` }); }} className="btn-final px-3 py-1 text-[11px]"><Banknote size={12} /> Bayar</button>}</div></td></tr>; })}{!runsTable.paginatedItems.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Belum ada payroll bulanan.</td></tr>}</tbody></table>{runsTable.filteredItems.length > 0 && <ExcelStatusBar label="Ringkasan Gaji Bersih" values={runsTable.filteredItems.map((r: any) => Number(r.net_total ?? 0))} extra={<span className="ml-auto flex justify-end"><button type="button" onClick={() => exportSheetsToXlsx("payroll-runs.xlsx", [{ name: "Payroll Runs", rows: runsTable.filteredItems.map((r: any) => ({ Nomor: r.run_number, Periode: `${String(r.period_start).slice(0, 10)} - ${String(r.period_end).slice(0, 10)}`, Karyawan: r.lines?.length ?? 0, Bruto: Number(r.gross_total ?? 0), Potongan: Number(r.deduction_total ?? 0), Netto: Number(r.net_total ?? 0), Status: r.status })) }])} className="btn-outline-soft px-3 py-1 text-[11px]"><Download size={12} /> Ekspor .xlsx</button></span>} />}</div><div className="px-4 pb-3"><TablePagination page={runsTable.page} totalPages={runsTable.totalPages} pageSize={runsTable.pageSize} totalItems={runsTable.totalItems} onPageChange={runsTable.setPage} onPageSizeChange={runsTable.setPageSize} /></div></section>
    </>}
    <p className="cell-muted text-[11px]">Payroll tidak menghitung tarif BPJS otomatis. PPh 21 dihitung dari persentase x (gaji pokok + tunjangan), lalu sistem membukukan jurnal dan kontrol anggarannya.</p>
  </div>;
}

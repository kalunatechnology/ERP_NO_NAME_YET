"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Check, ClipboardList, Pencil, Plus, RefreshCw, Send, Trash2, Users, X } from "lucide-react";
import api from "@/lib/api/axios";
import { formatMoney } from "@/lib/utils";
import { getApiErrorDetail } from "@/lib/api/project.api";

type Row = Record<string, any>;
type PayrollLine = { employee_id: string; cost_center_id: string; gross_salary: string; allowances: string; employee_tax: string; employee_bpjs: string; employer_bpjs: string };
const unwrapRows = (value: any) => Array.isArray(value) ? value : value?.data?.results ?? value?.data?.rows ?? value?.data ?? value?.results ?? value?.rows ?? [];
const today = new Date();
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const initialStart = dateValue(new Date(today.getFullYear(), today.getMonth(), 1));
const initialEnd = dateValue(new Date(today.getFullYear(), today.getMonth() + 1, 0));
const blankLine = (): PayrollLine => ({ employee_id: "", cost_center_id: "", gross_salary: "", allowances: "0", employee_tax: "0", employee_bpjs: "0", employer_bpjs: "0" });

export function PayrollWorkspace({ canOperate = false }: { canOperate?: boolean }) {
  const [tab, setTab] = useState<"runs" | "employees">("runs");
  const [employees, setEmployees] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [costCenters, setCostCenters] = useState<Row[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const payload = { employee_number: employeeForm.employee_number, employee_name: employeeForm.employee_name, monthly_salary: Number(employeeForm.monthly_salary), cost_center_id: employeeForm.cost_center_id || null };
      if (employeeForm.id) await api.put(`/api/v1/finance/payroll/employees/${employeeForm.id}`, payload);
      else await api.post("/api/v1/finance/payroll/employees", payload);
      setEmployeeForm({ id: "", employee_number: "", employee_name: "", monthly_salary: "", cost_center_id: "" }); setNotice("Data karyawan payroll tersimpan."); await load();
    } catch (cause) { setError(getApiErrorDetail(cause, "Data karyawan belum dapat disimpan.")); }
    finally { setBusy(false); }
  };

  const changeLine = (index: number, key: keyof PayrollLine, value: string) => setLines((current) => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  const selectEmployee = (index: number, employeeId: string) => {
    const employee = employees.find((row) => row.id === employeeId);
    setLines((current) => current.map((line, i) => i === index ? { ...line, employee_id: employeeId, gross_salary: String(employee?.monthly_salary ?? ""), cost_center_id: String(employee?.cost_center_id ?? "") } : line));
  };

  const saveRun = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const payload = { period_start: periodStart, period_end: periodEnd, lines: lines.filter((line) => line.employee_id).map((line) => ({ ...line, gross_salary: Number(line.gross_salary), allowances: Number(line.allowances), employee_tax: Number(line.employee_tax), employee_bpjs: Number(line.employee_bpjs), employer_bpjs: Number(line.employer_bpjs) })) };
      if (editingRun) await api.put(`/api/v1/finance/payroll/runs/${editingRun}`, payload);
      else await api.post("/api/v1/finance/payroll/runs", payload);
      setEditingRun(null); setLines([blankLine()]); setNotice("Payroll disimpan sebagai DRAFT. Periksa kembali sebelum diajukan."); await load();
    } catch (cause) { setError(getApiErrorDetail(cause, "Payroll belum dapat disimpan.")); }
    finally { setBusy(false); }
  };

  const editRun = (run: Row) => {
    setEditingRun(run.id); setPeriodStart(String(run.period_start).slice(0, 10)); setPeriodEnd(String(run.period_end).slice(0, 10));
    setLines((run.lines ?? []).map((line: Row) => ({ employee_id: line.employee_id, cost_center_id: line.cost_center_id ?? "", gross_salary: String(line.gross_salary), allowances: String(line.allowances), employee_tax: String(line.employee_tax), employee_bpjs: String(line.employee_bpjs), employer_bpjs: String(line.employer_bpjs) })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const runAction = async (run: Row, action: string, payload: Row = {}) => {
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "delete") await api.delete(`/api/v1/finance/payroll/runs/${run.id}`);
      else await api.post(`/api/v1/finance/payroll/runs/${run.id}/${action}`, payload);
      setPayingRun(null); setNotice(`Payroll ${run.run_number} diperbarui.`); await load();
    }
    catch (cause) { setError(getApiErrorDetail(cause, `Aksi ${action} belum dapat diproses.`)); }
    finally { setBusy(false); }
  };

  const activeEmployees = employees.filter((employee) => employee.employment_status === "ACTIVE");
  const runGross = lines.reduce((sum, line) => sum + Number(line.gross_salary || 0) + Number(line.allowances || 0), 0);
  const runDeductions = lines.reduce((sum, line) => sum + Number(line.employee_tax || 0) + Number(line.employee_bpjs || 0), 0);
  const runNet = runGross - runDeductions;
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs";

  return <div className="flex flex-col gap-5">
    <section className="rounded-2xl border border-[#D9D9D9] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black"><Banknote className="text-[#2649B3]" /> Payroll & Gaji Karyawan</h2><p className="mt-1 text-xs text-slate-600">Kelola master gaji, buat payroll bulanan, ajukan persetujuan, posting akrual ke GL, lalu bayar gaji bersih melalui rekening bank.</p></div><button type="button" onClick={() => void load()} disabled={busy} className="rounded-xl border p-2"><RefreshCw size={15} /></button></div>
      {error && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}{notice && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
      <div className="mt-4 flex gap-2 border-b"><button onClick={() => setTab("runs")} className={`px-3 py-2 text-xs font-bold ${tab === "runs" ? "border-b-2 border-blue-700 text-blue-700" : "text-slate-500"}`}><ClipboardList size={14} className="mr-1 inline" />Payroll run</button><button onClick={() => setTab("employees")} className={`px-3 py-2 text-xs font-bold ${tab === "employees" ? "border-b-2 border-blue-700 text-blue-700" : "text-slate-500"}`}><Users size={14} className="mr-1 inline" />Karyawan & gaji pokok</button></div>
    </section>

    {tab === "employees" && <>
      {canOperate && <form onSubmit={saveEmployee} className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-4">
        <label className="text-[10px] font-bold text-slate-600">Nomor karyawan<input required value={employeeForm.employee_number} onChange={(e) => setEmployeeForm({ ...employeeForm, employee_number: e.target.value })} className={inputClass} placeholder="EMP-001" /></label>
        <label className="text-[10px] font-bold text-slate-600">Nama karyawan<input required value={employeeForm.employee_name} onChange={(e) => setEmployeeForm({ ...employeeForm, employee_name: e.target.value })} className={inputClass} placeholder="Nama lengkap" /></label>
        <label className="text-[10px] font-bold text-slate-600">Gaji pokok bulanan<input required type="number" min="1" step="1" value={employeeForm.monthly_salary} onChange={(e) => setEmployeeForm({ ...employeeForm, monthly_salary: e.target.value })} className={inputClass} placeholder="8500000" /></label>
        <label className="text-[10px] font-bold text-slate-600">Cost center default<select required value={employeeForm.cost_center_id} onChange={(e) => setEmployeeForm({ ...employeeForm, cost_center_id: e.target.value })} className={inputClass}><option value="">Pilih cost center</option>{costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code || cc.cost_center_code} — {cc.name || cc.cost_center_name}</option>)}</select></label>
        <div className="flex gap-2 md:col-span-4 md:justify-end">{employeeForm.id && <button type="button" onClick={() => setEmployeeForm({ id: "", employee_number: "", employee_name: "", monthly_salary: "", cost_center_id: "" })} className="rounded-lg border px-3 py-2 text-xs">Batal</button>}<button disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-[#2649B3] px-4 py-2 text-xs font-bold text-white"><Check size={14} />{employeeForm.id ? "Simpan karyawan" : "Tambah karyawan"}</button></div>
      </form>}
      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b p-4">
          <h3 className="text-sm font-extrabold">Master karyawan payroll</h3>
          <p className="text-[10px] text-slate-500">{activeEmployees.length} karyawan aktif · karyawan nonaktif tetap tersimpan dan terlihat</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr><th className="p-3">Nomor</th><th className="p-3">Nama</th><th className="p-3">Gaji pokok</th><th className="p-3">Cost center</th><th className="p-3">Status</th><th className="p-3">Aksi</th></tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const isActive = employee.employment_status === "ACTIVE";
                const canToggleStatus = ["ACTIVE", "INACTIVE"].includes(employee.employment_status);
                return <tr key={employee.id} className="border-t">
                  <td className="p-3 font-mono">{employee.employee_number}</td>
                  <td className="p-3 font-bold">{employee.employee_name}</td>
                  <td className="p-3">{formatMoney(employee.monthly_salary ?? 0)}</td>
                  <td className="p-3">{costCenters.find((cc) => cc.id === employee.cost_center_id)?.name ?? costCenters.find((cc) => cc.id === employee.cost_center_id)?.cost_center_name ?? "—"}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{employee.employment_status}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {canOperate && isActive && <button type="button" disabled={busy} onClick={() => setEmployeeForm({ id: employee.id, employee_number: employee.employee_number, employee_name: employee.employee_name, monthly_salary: String(employee.monthly_salary ?? ""), cost_center_id: employee.cost_center_id ?? "" })} className="rounded border p-1.5 text-blue-700 disabled:opacity-50" title="Edit karyawan"><Pencil size={13} /></button>}
                      {canOperate && canToggleStatus && <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const nextStatus = isActive ? "INACTIVE" : "ACTIVE";
                          setBusy(true); setError(""); setNotice("");
                          try {
                            await api.put(`/api/v1/finance/payroll/employees/${employee.id}`, { employment_status: nextStatus });
                            await load();
                            setNotice(`${employee.employee_name} ${nextStatus === "ACTIVE" ? "diaktifkan" : "dinonaktifkan"}.`);
                          } catch (cause) {
                            setError(getApiErrorDetail(cause, "Status karyawan belum dapat diubah."));
                          } finally { setBusy(false); }
                        }}
                        className={`rounded border px-2 py-1 text-[10px] font-semibold disabled:opacity-50 ${isActive ? "text-amber-700" : "text-emerald-700"}`}
                      >{isActive ? "Nonaktifkan" : "Aktifkan"}</button>}
                    </div>
                  </td>
                </tr>;
              })}
              {!employees.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Belum ada data karyawan. Tambahkan karyawan dan gaji pokok di atas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>}

    {tab === "runs" && <>
      {canOperate && <form onSubmit={saveRun} className="flex flex-col gap-4 rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-extrabold">{editingRun ? "Edit payroll DRAFT" : "Buat payroll run"}</h3><p className="text-[10px] text-slate-500">Posting payroll memakai COA 6100, 2150, 2160, dan 2170 serta memeriksa pagu aktif pada cost center tiap karyawan.</p></div><div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold text-slate-600">Periode mulai<input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputClass} /></label><label className="text-[10px] font-bold text-slate-600">Periode akhir<input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputClass} /></label></div></div>
        {lines.map((line, index) => <div key={`${index}-${line.employee_id}`} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4 xl:grid-cols-8">
          <label className="text-[10px] font-bold text-slate-600 md:col-span-2">Karyawan<select required value={line.employee_id} onChange={(e) => selectEmployee(index, e.target.value)} className={inputClass}><option value="">Pilih karyawan</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_number} — {employee.employee_name}</option>)}</select></label>
          <label className="text-[10px] font-bold text-slate-600">Gaji pokok<input required type="number" min="1" value={line.gross_salary} onChange={(e) => changeLine(index, "gross_salary", e.target.value)} className={inputClass} /></label>
          <label className="text-[10px] font-bold text-slate-600">Tunjangan<input type="number" min="0" value={line.allowances} onChange={(e) => changeLine(index, "allowances", e.target.value)} className={inputClass} /></label>
          <label className="text-[10px] font-bold text-slate-600">PPh 21<input type="number" min="0" value={line.employee_tax} onChange={(e) => changeLine(index, "employee_tax", e.target.value)} className={inputClass} /></label>
          <label className="text-[10px] font-bold text-slate-600">BPJS karyawan<input type="number" min="0" value={line.employee_bpjs} onChange={(e) => changeLine(index, "employee_bpjs", e.target.value)} className={inputClass} /></label>
          <label className="text-[10px] font-bold text-slate-600">BPJS perusahaan<input type="number" min="0" value={line.employer_bpjs} onChange={(e) => changeLine(index, "employer_bpjs", e.target.value)} className={inputClass} /></label>
          <label className="text-[10px] font-bold text-slate-600 md:col-span-2">Cost center<select required value={line.cost_center_id} onChange={(e) => changeLine(index, "cost_center_id", e.target.value)} className={inputClass}><option value="">Pilih cost center</option>{costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code || cc.cost_center_code} — {cc.name || cc.cost_center_name}</option>)}</select></label>
          <div className="flex items-end justify-between gap-2 md:col-span-2 xl:col-span-6"><span className="pb-2 text-[10px] text-slate-600">Gaji bersih: <b>{formatMoney(Number(line.gross_salary || 0) + Number(line.allowances || 0) - Number(line.employee_tax || 0) - Number(line.employee_bpjs || 0))}</b> · BPJS perusahaan menjadi beban tambahan.</span><button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="mb-1 rounded border p-1.5 text-red-700" title="Hapus baris"><Trash2 size={13} /></button></div>
        </div>)}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><button type="button" onClick={() => setLines((current) => [...current, blankLine()])} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold text-blue-700"><Plus size={14} /> Tambah karyawan</button><span className="text-xs text-slate-600">Total gaji & tunjangan {formatMoney(runGross)} · Potongan {formatMoney(runDeductions)} · Bersih {formatMoney(runNet)}</span><div className="flex gap-2">{editingRun && <button type="button" onClick={() => { setEditingRun(null); setLines([blankLine()]); }} className="rounded-lg border px-3 py-2 text-xs">Batal edit</button>}<button disabled={busy || !activeEmployees.length} className="rounded-lg bg-[#2649B3] px-4 py-2 text-xs font-bold text-white">Simpan sebagai DRAFT</button></div></div>
      </form>}

      {payingRun && <form onSubmit={(e) => { e.preventDefault(); const run = runs.find((row) => row.id === payingRun); if (run) void runAction(run, "pay", payForm); }} className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 md:grid-cols-4"><label className="text-[10px] font-bold">Rekening bank<select required value={payForm.bank_account_id} onChange={(e) => setPayForm({ ...payForm, bank_account_id: e.target.value })} className={inputClass}><option value="">Pilih rekening</option>{bankAccounts.map((bank) => <option key={bank.id} value={bank.id}>{bank.account_name || bank.bank_name} · {bank.account_number}</option>)}</select></label><label className="text-[10px] font-bold">Tanggal bayar<input required type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} className={inputClass} /></label><label className="text-[10px] font-bold">Referensi transfer<input required value={payForm.reference_number} onChange={(e) => setPayForm({ ...payForm, reference_number: e.target.value })} className={inputClass} placeholder="TRF-GAJI-2026-01" /></label><div className="flex items-end gap-2"><button disabled={busy} className="rounded-lg bg-[#2649B3] px-4 py-2 text-xs font-bold text-white">Bayar gaji bersih</button><button type="button" onClick={() => setPayingRun(null)} className="rounded-lg border px-3 py-2 text-xs">Batal</button></div><p className="text-[10px] text-slate-600 md:col-span-4">Pembayaran ini melunasi gaji bersih. Utang PPh 21 dan BPJS tetap tercatat sebagai kewajiban sampai dibayar terpisah.</p></form>}

      <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-4"><h3 className="text-sm font-extrabold">Riwayat payroll</h3><p className="text-[10px] text-slate-500">Approval wajib dilakukan oleh user berbeda dari pembuat.</p></div><div className="overflow-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3">Nomor / periode</th><th className="p-3">Karyawan</th><th className="p-3">Bruto</th><th className="p-3">Potongan</th><th className="p-3">Gaji bersih</th><th className="p-3">Status</th><th className="p-3 text-right">Aksi</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="border-t"><td className="p-3"><b>{run.run_number}</b><div className="text-[10px] text-slate-500">{String(run.period_start).slice(0, 10)} – {String(run.period_end).slice(0, 10)}</div></td><td className="p-3">{run.lines?.length ?? 0}</td><td className="p-3">{formatMoney(run.gross_total)}</td><td className="p-3">{formatMoney(run.deduction_total)}</td><td className="p-3 font-bold">{formatMoney(run.net_total)}</td><td className="p-3">{run.status}</td><td className="p-3"><div className="flex justify-end gap-1">{canOperate && run.status === "DRAFT" && <><button type="button" title="Edit" onClick={() => editRun(run)} className="rounded border p-1.5 text-blue-700"><Pencil size={13} /></button><button type="button" title="Hapus draft" onClick={() => { if (window.confirm(`Hapus draft ${run.run_number}?`)) void runAction(run, "delete"); }} className="rounded border p-1.5 text-red-700"><Trash2 size={13} /></button><button type="button" onClick={() => void runAction(run, "submit")} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold text-blue-700"><Send size={12} /> Ajukan</button></>}{canOperate && run.status === "PENDING_APPROVAL" && <button type="button" onClick={() => void runAction(run, "approve")} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold text-emerald-700"><Check size={12} /> Setujui</button>}{canOperate && run.status === "APPROVED" && <button type="button" onClick={() => void runAction(run, "post")} className="inline-flex items-center gap-1 rounded bg-blue-700 px-2 py-1 text-[10px] font-bold text-white">Posting ke GL</button>}{canOperate && run.status === "POSTED" && <button type="button" onClick={() => { setPayingRun(run.id); setPayForm({ bank_account_id: String(bankAccounts[0]?.id ?? ""), payment_date: dateValue(new Date()), reference_number: `PAY-${run.run_number}` }); }} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold text-blue-700"><Banknote size={12} /> Bayar</button>}</div></td></tr>)}{!runs.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Belum ada payroll run.</td></tr>}</tbody></table></div></section>
    </>}
    <p className="text-[10px] text-slate-500">Payroll tidak menghitung tarif pajak atau BPJS otomatis. Finance memasukkan hasil perhitungan yang sudah diverifikasi, lalu sistem membukukan jurnal dan kontrol anggarannya.</p>
  </div>;
}

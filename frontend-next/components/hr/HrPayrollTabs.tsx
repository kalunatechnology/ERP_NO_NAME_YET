"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  Eye,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { localDateKey } from "@/lib/utils";
import { getApiErrorDetail } from "@/lib/api/project.api";
import { loadHrEvidence, uploadHrEvidence } from "@/lib/api/hr-evidence.api";

interface OvertimeItem {
  id: string;
  employee_id: string;
  employee_number?: string;
  employee_name?: string;
  project_id?: string | null;
  project_code?: string;
  project_name?: string;
  work_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number | string;
  overtime_rate: number | string;
  overtime_amount: number | string;
  evidence_url?: string | null;
  reason: string;
  status: string;
  rejection_reason?: string | null;
  payroll_run_id?: string | null;
}

interface PayrollRun {
  id: string;
  run_number: string;
  period_start: string;
  period_end: string;
  status: string;
  gross_total: number | string;
  deduction_total: number | string;
  net_total: number | string;
  finance_decision_note?: string | null;
}

interface EmployeeItem {
  id: string;
  employee_number: string;
  employee_name: string;
  employment_status: string;
  monthly_salary: number | string | null;
  standard_hourly_rate?: number | string | null;
  overtime_hourly_rate?: number | string | null;
  cost_center_id?: string | null;
  user_id?: string | null;
  linked_user?: { id: string; full_name: string; email: string } | null;
}

interface CostCenterItem {
  id: string;
  cost_center_code: string;
  cost_center_name: string;
}

interface MyOvertimePricing {
  configured: boolean;
  overtime_hourly_rate: number | null;
  source?: "EMPLOYEE_OVERRIDE" | "COMPANY_DEFAULT" | "PROFILE_FORMULA";
}

interface EmployeeUserOption {
  id: string;
  full_name: string;
  email: string;
}

const formatIdr = (val: unknown) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(val ?? 0),
  );

const formatRateInput = (value: unknown) => value == null ? "" : String(value);

function resolveOvertimePrice(overtime: OvertimeItem, employee?: EmployeeItem, defaultRate = 0) {
  const storedRate = Number(overtime.overtime_rate ?? 0);
  const storedAmount = Number(overtime.overtime_amount ?? 0);
  if (storedRate > 0 && storedAmount > 0) return { rate: storedRate, amount: storedAmount };

  const employeeRate = Number(employee?.overtime_hourly_rate ?? 0);
  const configuredRate = employeeRate > 0 ? employeeRate : defaultRate;
  const hours = Number(overtime.duration_hours);
  if (configuredRate > 0 && Number.isFinite(hours) && hours > 0) {
    return { rate: configuredRate, amount: Math.round(configuredRate * hours * 100) / 100 };
  }

  const hourlyRate = Number(employee?.standard_hourly_rate ?? 0);
  const monthlySalary = Number(employee?.monthly_salary ?? 0);
  const baseHourlyRate = hourlyRate > 0 ? hourlyRate : monthlySalary > 0 ? monthlySalary / 173 : 0;
  if (employee?.employment_status !== "ACTIVE" || baseHourlyRate <= 0 || !Number.isFinite(hours) || hours <= 0) return null;
  const rate = Math.round(baseHourlyRate * 1.5 * 100) / 100;
  return { rate, amount: Math.round(rate * hours * 100) / 100 };
}

const overtimePayLabel = (overtime: OvertimeItem, employee?: EmployeeItem) => {
  const price = resolveOvertimePrice(overtime, employee);
  return price ? formatIdr(price.amount) : "Belum dapat dihitung";
};

const overtimeEmployeeLabel = (overtime: Pick<OvertimeItem, "employee_name" | "employee_number">) => {
  const name = String(overtime.employee_name ?? "").trim();
  const number = String(overtime.employee_number ?? "").trim();
  const usableName = name && name !== number && name !== "Nama karyawan belum diisi" ? name : "";
  if (usableName) return number ? `${usableName} (${number})` : usableName;
  return number ? `Nama belum diisi (${number})` : "Nama karyawan belum diisi";
};

interface HrPayrollTabsProps {
  section: "overtime" | "ops" | "lead";
  hrTier: number;
  financeTier: number;
}

export function HrPayrollTabs({ section, hrTier, financeTier }: HrPayrollTabsProps) {
  const [loading, setLoading] = useState(true);
  const [myOvertimes, setMyOvertimes] = useState<OvertimeItem[]>([]);
  const [myOvertimePricing, setMyOvertimePricing] = useState<MyOvertimePricing>({ configured: false, overtime_hourly_rate: null });
  const [defaultOvertimeRate, setDefaultOvertimeRate] = useState("");
  const [savingDefaultOvertimeRate, setSavingDefaultOvertimeRate] = useState(false);
  const [defaultOvertimeRateSaveStatus, setDefaultOvertimeRateSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [overtimeRateEdits, setOvertimeRateEdits] = useState<Record<string, string>>({});
  const [savingEmployeeOvertimeRates, setSavingEmployeeOvertimeRates] = useState<Record<string, boolean>>({});
  const [savedEmployeeOvertimeRates, setSavedEmployeeOvertimeRates] = useState<Record<string, boolean>>({});
  const [myPayslips, setMyPayslips] = useState<any[]>([]);
  const [companyOvertimes, setCompanyOvertimes] = useState<OvertimeItem[]>([]);
  const [selectedOvertime, setSelectedOvertime] = useState<OvertimeItem | null>(null);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [employeeUserOptions, setEmployeeUserOptions] = useState<EmployeeUserOption[]>([]);
  const [employeeUserOptionsError, setEmployeeUserOptionsError] = useState(false);
  const [employeeCreateOpen, setEmployeeCreateOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ employee_name: "", employee_number: "", monthly_salary: "", standard_hourly_rate: "", overtime_hourly_rate: "", cost_center_id: "" });
  const [costCenters, setCostCenters] = useState<CostCenterItem[]>([]);

  const [otForm, setOtForm] = useState({
    work_date: localDateKey(),
    start_time: "17:00",
    end_time: "20:00",
    duration_hours: "3",
    reason: "",
  });
  const [submittingOt, setSubmittingOt] = useState(false);
  const [overtimeEvidenceUrl, setOvertimeEvidenceUrl] = useState("");
  const [overtimeEvidenceName, setOvertimeEvidenceName] = useState("");
  const [uploadingOvertimeEvidence, setUploadingOvertimeEvidence] = useState(false);

  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    return localDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date();
    return localDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  });
  const [generatingPayroll, setGeneratingPayroll] = useState(false);
  const [salaryEdits, setSalaryEdits] = useState<Record<string, string>>({});
  const [hourlyRateEdits, setHourlyRateEdits] = useState<Record<string, string>>({});
  const [employeeProfileEdits, setEmployeeProfileEdits] = useState<Record<string, { name: string; number: string; status: string }>>({});
  const [costCenterEdits, setCostCenterEdits] = useState<Record<string, string>>({});
  const [employeeUserEdits, setEmployeeUserEdits] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [myOtRes, mySlipRes, myRateRes, companyRateRes] = await Promise.all([
        api.get("/api/v1/hr/overtimes/my").catch(() => ({ data: { results: [] } })),
        api.get("/api/v1/hr/payslips/my").catch(() => ({ data: { results: [] } })),
        api.get("/api/v1/hr/overtimes/my/rate").catch(() => ({ data: { data: { configured: false, overtime_hourly_rate: null } } })),
        hrTier <= 2 ? api.get("/api/v1/hr/overtimes/rate-settings").catch(() => ({ data: { data: { default_overtime_hourly_rate: null } } })) : Promise.resolve({ data: { data: { default_overtime_hourly_rate: null } } }),
      ]);
      setMyOvertimes(myOtRes.data?.results ?? []);
      setMyPayslips(mySlipRes.data?.results ?? []);
      setMyOvertimePricing(myRateRes.data?.data ?? { configured: false, overtime_hourly_rate: null });
      setDefaultOvertimeRate(formatRateInput(companyRateRes.data?.data?.default_overtime_hourly_rate));

      if (hrTier <= 2 || financeTier <= 1) {
        const [compOtRes, runsRes, empRes, costCenterRes, userOptionsRes] = await Promise.all([
          api.get("/api/v1/hr/overtimes").catch(() => ({ data: { results: [] } })),
          api.get("/api/v1/hr/payroll/runs").catch(() => ({ data: { results: [] } })),
          api.get("/api/v1/hr/employees").catch(() => ({ data: { results: [] } })),
          api.get("/api/v1/hr/cost-centers").catch(() => ({ data: { results: [] } })),
          api.get("/api/v1/hr/employee-user-options").catch(() => ({ data: { results: [], error: true } })),
        ]);
        setPayrollRuns(runsRes.data?.results ?? []);
        const empList: EmployeeItem[] = empRes.data?.results ?? [];
        const employeeById = new Map(empList.map((employee) => [employee.id, employee]));
        const overtimeRows: OvertimeItem[] = (compOtRes.data?.results ?? []).map((overtime: OvertimeItem) => {
          const employee = employeeById.get(overtime.employee_id);
          const profileName = String(employee?.employee_name ?? "").trim();
          const accountName = String(employee?.linked_user?.full_name ?? "").trim();
          const requestName = String(overtime.employee_name ?? "").trim();
          return {
            ...overtime,
            employee_name: profileName || accountName || (requestName === "Nama karyawan belum diisi" ? "" : requestName),
            employee_number: overtime.employee_number || employee?.employee_number || "",
          };
        });
        setCompanyOvertimes(overtimeRows);
        setEmployees(empList);
        setEmployeeUserOptions(userOptionsRes.data?.results ?? []);
        setEmployeeUserOptionsError(Boolean(userOptionsRes.data?.error));
        setCostCenters(costCenterRes.data?.results ?? []);
        const edits: Record<string, string> = {};
        const rateEdits: Record<string, string> = {};
        const overtimeRatesByEmployee: Record<string, string> = {};
        const profileEdits: Record<string, { name: string; number: string; status: string }> = {};
        const costCenterEditsByEmployee: Record<string, string> = {};
        for (const e of empList) {
          edits[e.id] = e.monthly_salary == null ? "" : String(e.monthly_salary);
          rateEdits[e.id] = e.standard_hourly_rate == null ? "" : String(e.standard_hourly_rate);
          overtimeRatesByEmployee[e.id] = formatRateInput(e.overtime_hourly_rate);
          profileEdits[e.id] = { name: e.employee_name, number: e.employee_number, status: e.employment_status };
          costCenterEditsByEmployee[e.id] = String(e.cost_center_id ?? "");
        }
        setSalaryEdits(edits);
        setHourlyRateEdits(rateEdits);
        setOvertimeRateEdits(overtimeRatesByEmployee);
        setEmployeeProfileEdits(profileEdits);
        setCostCenterEdits(costCenterEditsByEmployee);
        setEmployeeUserEdits({});
      }
    } finally {
      setLoading(false);
    }
  }, [hrTier, financeTier]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const saveDefaultOvertimeRate = async () => {
    if (hrTier !== 1 || savingDefaultOvertimeRate) return;
    setSavingDefaultOvertimeRate(true);
    setDefaultOvertimeRateSaveStatus("idle");
    try {
      const response = await api.put("/api/v1/hr/overtimes/rate-settings", {
        default_overtime_hourly_rate: defaultOvertimeRate.trim() ? Number(defaultOvertimeRate) : null,
      });
      setDefaultOvertimeRate(formatRateInput(response.data?.data?.default_overtime_hourly_rate));
      setDefaultOvertimeRateSaveStatus("saved");
      try {
        const myRate = await api.get("/api/v1/hr/overtimes/my/rate");
        setMyOvertimePricing(myRate.data?.data ?? { configured: false, overtime_hourly_rate: null });
      } catch {
        // HR settings may be available even if this account has no linked employee profile.
      }
    } catch (err: unknown) {
      setDefaultOvertimeRateSaveStatus("error");
      toast.error(getApiErrorDetail(err, "Gagal menyimpan tarif lembur umum."));
    } finally {
      setSavingDefaultOvertimeRate(false);
    }
  };

  const saveEmployeeOvertimeRate = async (employee: EmployeeItem) => {
    if (hrTier > 2 || savingEmployeeOvertimeRates[employee.id]) return;
    const inputRate = overtimeRateEdits[employee.id] ?? "";
    const numericRate = inputRate.trim() ? Number(inputRate) : null;
    if (numericRate !== null && (!Number.isFinite(numericRate) || numericRate <= 0)) {
      toast.error("Tarif lembur khusus harus lebih dari nol atau dikosongkan untuk memakai tarif umum.");
      setOvertimeRateEdits((current) => ({ ...current, [employee.id]: formatRateInput(employee.overtime_hourly_rate) }));
      return;
    }
    setSavingEmployeeOvertimeRates((current) => ({ ...current, [employee.id]: true }));
    setSavedEmployeeOvertimeRates((current) => ({ ...current, [employee.id]: false }));
    try {
      const response = await api.put(`/api/v1/hr/employees/${employee.id}`, { overtime_hourly_rate: numericRate });
      const savedRate = response.data?.data?.overtime_hourly_rate ?? null;
      setEmployees((current) => current.map((row) => row.id === employee.id ? { ...row, overtime_hourly_rate: savedRate } : row));
      setOvertimeRateEdits((current) => ({ ...current, [employee.id]: formatRateInput(savedRate) }));
      setSavedEmployeeOvertimeRates((current) => ({ ...current, [employee.id]: true }));
      try {
        const myRate = await api.get("/api/v1/hr/overtimes/my/rate");
        setMyOvertimePricing(myRate.data?.data ?? { configured: false, overtime_hourly_rate: null });
      } catch {
        // The edited employee may not be linked to the current HR account.
      }
    } catch (err: unknown) {
      setOvertimeRateEdits((current) => ({ ...current, [employee.id]: formatRateInput(employee.overtime_hourly_rate) }));
      toast.error(getApiErrorDetail(err, `Gagal menyimpan tarif lembur ${employee.employee_name}.`));
    } finally {
      setSavingEmployeeOvertimeRates((current) => ({ ...current, [employee.id]: false }));
    }
  };

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingOt(true);
    try {
      await api.post("/api/v1/hr/overtimes/my", {
        ...otForm,
        duration_hours: Number(otForm.duration_hours),
        evidence_url: overtimeEvidenceUrl || undefined,
      });
      toast.success("Pengajuan lembur berhasil dikirim.");
      setOtForm((p) => ({ ...p, reason: "" }));
      setOvertimeEvidenceUrl("");
      setOvertimeEvidenceName("");
      await loadData();
    } catch (err: unknown) {
      toast.error(getApiErrorDetail(err, "Gagal mengajukan lembur."));
    } finally {
      setSubmittingOt(false);
    }
  };

  const overtimeHourlyRate = Number(myOvertimePricing.overtime_hourly_rate ?? 0);
  const overtimeHours = Number(otForm.duration_hours || 0);
  const overtimeTotalEstimate = myOvertimePricing.configured && Number.isFinite(overtimeHours)
    ? Math.round(overtimeHourlyRate * overtimeHours * 100) / 100
    : null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center text-xs text-slate-500">
        Memuat data HR &amp; Payroll...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">
          Otoritas HR Tier {hrTier} {financeTier <= 1 ? "• Akses Review Finance Aktif" : ""}
        </p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <RefreshCw size={13} />
          Muat Ulang
        </button>
      </div>

      {hrTier >= 3 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-950">
          Halaman ini adalah layanan HR pribadi. Profil karyawan dan pengaturan payroll hanya tersedia bagi HR Tier 1 atau Tier 2. Minta admin perusahaan memberi akses HR yang sesuai bila Anda bertugas mengelola data tersebut.
        </div>
      )}

      {section === "overtime" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form onSubmit={handleSubmitOvertime} className="lg:col-span-5 rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-3 text-xs">
              <h2 className="text-sm font-bold text-[#163D64]">Ajukan Lembur</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={otForm.work_date}
                    onChange={(e) => setOtForm((p) => ({ ...p, work_date: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Durasi (Jam)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="16"
                    required
                    value={otForm.duration_hours}
                    onChange={(e) => setOtForm((p) => ({ ...p, duration_hours: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    required
                    value={otForm.start_time}
                    onChange={(e) => setOtForm((p) => ({ ...p, start_time: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    required
                    value={otForm.end_time}
                    onChange={(e) => setOtForm((p) => ({ ...p, end_time: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tarif Lembur per Jam</label>
                  <input
                    type="text"
                    readOnly
                    value={myOvertimePricing.configured ? formatIdr(overtimeHourlyRate) : "Belum diatur"}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-700"
                    aria-label="Tarif lembur per jam"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estimasi Total Lembur</label>
                  <input
                    type="text"
                    readOnly
                    value={overtimeTotalEstimate === null ? "Belum dapat dihitung" : formatIdr(overtimeTotalEstimate)}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-700"
                    aria-label="Estimasi total upah lembur"
                  />
                </div>
              </div>
              <p className={`text-[11px] leading-4 ${myOvertimePricing.configured ? "text-slate-500" : "text-amber-700"}`}>
                {myOvertimePricing.configured
                  ? "Tarif mengikuti pengaturan HR: tarif khusus karyawan, lalu tarif umum perusahaan. Jika keduanya kosong, sistem memakai rumus dari profil upah."
                  : "Pengajuan tetap dapat dikirim. HR perlu menetapkan tarif umum atau tarif khusus sebelum nominal lembur dihitung."}
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alasan / Pekerjaan Lembur</label>
                <textarea
                  rows={3}
                  required
                  value={otForm.reason}
                  onChange={(e) => setOtForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Jelaskan tugas yang dikerjakan..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bukti lembur (opsional)</label>
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-[#163D64]">{uploadingOvertimeEvidence ? "Mengunggah foto…" : "Unggah foto bukti"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploadingOvertimeEvidence || submittingOt} onChange={async (event) => { const file=event.target.files?.[0]; event.target.value=""; if(!file)return; setUploadingOvertimeEvidence(true); try { setOvertimeEvidenceUrl(await uploadHrEvidence(file)); setOvertimeEvidenceName(file.name); toast.success("Foto bukti tersimpan."); } catch(error) { toast.error(error instanceof Error ? error.message : "Foto gagal diunggah."); } finally { setUploadingOvertimeEvidence(false); } }} /></label>
                {overtimeEvidenceName && <span className="ml-2 text-[11px] text-emerald-700">{overtimeEvidenceName}</span>}
              </div>
              <button
                type="submit"
                disabled={submittingOt || uploadingOvertimeEvidence}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0876CD] hover:bg-[#163D64] px-4 py-2.5 font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                <Send size={14} />
                {submittingOt ? "Mengirim..." : "Kirim Pengajuan Lembur"}
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200 font-bold text-sm text-[#163D64]">
                Riwayat Lembur Saya ({myOvertimes.length})
              </div>
              <OvertimeReviewTable rows={myOvertimes} employees={[]} mode="personal" onDetail={setSelectedOvertime} onReload={loadData} />
            </div>
          </div>

          <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-bold text-sm text-[#163D64] flex items-center gap-2">
              <Wallet size={15} /> Slip Gaji Pribadi ({myPayslips.length})
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {myPayslips.length === 0 ? (
                <div className="p-6 text-center text-slate-500">Belum ada slip gaji berstatus POSTED/PAID.</div>
              ) : (
                myPayslips.map((slip) => (
                  <div key={slip.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono font-bold text-slate-900">{slip.payroll_run?.run_number}</div>
                      <div className="text-slate-500">
                        Gaji Pokok: {formatIdr(slip.gross_salary)} • Lembur ({slip.overtime_hours ?? 0}j): {formatIdr(slip.overtime_pay)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-700">{formatIdr(slip.net_salary)}</div>
                      <div className="text-[10px] text-slate-500">{slip.payroll_run?.status}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {section === "ops" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-4 text-xs">
            <h2 className="text-sm font-bold text-[#163D64]">Generate Draft Payroll (Tarik Otomatis Lembur APPROVED)</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Periode Mulai</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Periode Selesai</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3"
                />
              </div>
              <button
                type="button"
                disabled={generatingPayroll}
                onClick={async () => {
                  setGeneratingPayroll(true);
                  try {
                    await api.post("/api/v1/hr/payroll/draft", { period_start: periodStart, period_end: periodEnd });
                    toast.success("Draft payroll berhasil dibuat beserta agregasi lembur APPROVED.");
                    await loadData();
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Gagal membuat draft payroll.");
                  } finally {
                    setGeneratingPayroll(false);
                  }
                }}
                className="h-9 rounded-xl bg-[#0876CD] hover:bg-[#163D64] px-4 font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {generatingPayroll ? "Memproses..." : "Generate Draft Payroll"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-bold text-sm text-[#163D64]">
              Antrean &amp; Persetujuan Lembur (Tier 1 &amp; Tier 2 HR)
            </div>
              <OvertimeReviewTable rows={companyOvertimes} employees={employees} defaultRate={Number(defaultOvertimeRate) || 0} mode="ops" onDetail={setSelectedOvertime} onReload={loadData} />
          </div>

          <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-bold text-sm text-[#163D64]">
              Monitoring Payroll Runs ({payrollRuns.length})
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {payrollRuns.length === 0 ? (
                <div className="p-5 text-center text-slate-500">Belum ada payroll run.</div>
              ) : (
                payrollRuns.map((run) => (
                  <div key={run.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-mono font-bold text-slate-900">
                        {run.run_number} <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-[10px] text-[#0876CD]">{run.status}</span>
                      </div>
                      <div className="text-slate-600 mt-0.5">
                        Periode {String(run.period_start).slice(0, 10)} s/d {String(run.period_end).slice(0, 10)} • Gross: {formatIdr(run.gross_total)} • Net: {formatIdr(run.net_total)}
                      </div>
                    </div>
                    {hrTier === 2 && run.status === "DRAFT" && (
                      <span className="text-[11px] font-medium text-amber-700">
                        Menunggu persetujuan &amp; pengiriman ke Finance oleh HR Tier 1
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {hrTier <= 2 && (
            <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sm text-[#163D64]">
                  Profil &amp; Data Upah Karyawan ({employees.length})
                </span>
                <button type="button" onClick={() => setEmployeeCreateOpen((value) => !value)} className="rounded-lg bg-[#0876CD] hover:bg-[#163D64] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer">
                  {employeeCreateOpen ? "Tutup Form" : "+ Tambah Karyawan"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-sky-50/60 px-4 py-3 text-xs">
                <label htmlFor="default-overtime-rate-ops" className="font-semibold text-slate-700">Tarif lembur umum per jam</label>
                <input id="default-overtime-rate-ops" type="number" min="0.01" step="100" value={defaultOvertimeRate} disabled={hrTier !== 1 || savingDefaultOvertimeRate} onChange={(event) => { setDefaultOvertimeRate(event.target.value); setDefaultOvertimeRateSaveStatus("idle"); }} onBlur={() => void saveDefaultOvertimeRate()} placeholder="Contoh: 50000" className="h-9 w-44 rounded-lg border border-slate-200 bg-white px-3 disabled:bg-slate-100" />
                <span className="text-slate-500">Berlaku sebagai default; tarif khusus karyawan akan menggantikannya. Kosong memakai rumus dari profil upah.</span>
                {savingDefaultOvertimeRate ? <span className="font-medium text-sky-700">Menyimpan…</span> : defaultOvertimeRateSaveStatus === "saved" ? <span className="font-medium text-emerald-700">Tersimpan</span> : null}
              </div>
              {employeeCreateOpen && (
                <form className="grid gap-2 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-6" onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await api.post("/api/v1/hr/employees", {
                      employee_name: newEmployee.employee_name,
                      employee_number: newEmployee.employee_number,
                      monthly_salary: newEmployee.monthly_salary.trim() ? Number(newEmployee.monthly_salary) : null,
                      standard_hourly_rate: newEmployee.standard_hourly_rate.trim() ? Number(newEmployee.standard_hourly_rate) : null,
                      overtime_hourly_rate: newEmployee.overtime_hourly_rate.trim() ? Number(newEmployee.overtime_hourly_rate) : null,
                      cost_center_id: newEmployee.cost_center_id || null,
                      employment_status: "ACTIVE",
                    });
                    setNewEmployee({ employee_name: "", employee_number: "", monthly_salary: "", standard_hourly_rate: "", overtime_hourly_rate: "", cost_center_id: "" });
                    setEmployeeCreateOpen(false);
                    toast.success("Profil karyawan dibuat. Admin dapat menautkan akun user saat membuat akun.");
                    await loadData();
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Gagal membuat profil karyawan.");
                  }
                }}>
                  <input required placeholder="Nama lengkap karyawan" value={newEmployee.employee_name} onChange={(e) => setNewEmployee((value) => ({ ...value, employee_name: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <input required placeholder="Nomor karyawan" value={newEmployee.employee_number} onChange={(e) => setNewEmployee((value) => ({ ...value, employee_number: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <input type="number" min="0.01" step="1000" placeholder="Gaji bulanan (opsional)" value={newEmployee.monthly_salary} onChange={(e) => setNewEmployee((value) => ({ ...value, monthly_salary: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <input type="number" min="0.01" step="100" placeholder="Tarif dasar per jam (opsional)" value={newEmployee.standard_hourly_rate} onChange={(e) => setNewEmployee((value) => ({ ...value, standard_hourly_rate: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <input type="number" min="0.01" step="100" placeholder="Tarif lembur khusus (opsional)" value={newEmployee.overtime_hourly_rate} onChange={(e) => setNewEmployee((value) => ({ ...value, overtime_hourly_rate: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <select value={newEmployee.cost_center_id} onChange={(e) => setNewEmployee((value) => ({ ...value, cost_center_id: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3">
                    <option value="">Cost center (opsional)</option>
                    {costCenters.map((center) => <option key={center.id} value={center.id}>{center.cost_center_code} — {center.cost_center_name}</option>)}
                  </select>
                  <button type="submit" className="h-9 rounded-lg bg-emerald-600 px-3 font-semibold text-white">Simpan Karyawan</button>
                  <p className="text-[11px] leading-4 text-slate-500 sm:col-span-2 xl:col-span-6">Profil dibuat tanpa akun user. Admin menautkannya pada saat membuat akun; tarif lembur khusus bersifat opsional dan akan menggantikan tarif umum.</p>
                </form>
              )}
              <div className="divide-y divide-slate-100 text-xs">
                {employees.length === 0 ? (
                  <div className="p-5 text-center text-slate-500">
                    Belum ada profil karyawan. HR dapat membuat profil terlebih dahulu; akun user ditautkan oleh Admin saat akun dibuat.
                  </div>
                ) : (
                  employees.map((emp) => (
                    <div key={emp.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {emp.user_id ? (
                          <div className="flex h-9 min-w-56 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-600">
                            Akun user: {emp.linked_user?.full_name || emp.linked_user?.email || "Tertaut"}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <select aria-label={`Tautkan akun user ke ${emp.employee_name || emp.employee_number}`} value={employeeUserEdits[emp.id] ?? ""} onChange={(e) => setEmployeeUserEdits((current) => ({ ...current, [emp.id]: e.target.value }))} className="h-9 w-64 rounded-lg border border-amber-200 bg-amber-50 px-3">
                              <option value="">{employeeUserOptionsError ? "Daftar akun gagal dimuat" : employeeUserOptions.length ? "Belum ditautkan — pilih akun user" : "Tidak ada akun aktif yang belum ditautkan"}</option>
                              {employeeUserOptions.map((account) => <option key={account.id} value={account.id}>{account.full_name} — {account.email}</option>)}
                            </select>
                            {employeeUserOptionsError ? <span className="max-w-64 text-[10px] leading-4 text-red-600">Gagal memuat akun. Muat ulang halaman atau periksa akses HR Anda.</span> : !employeeUserOptions.length && <span className="max-w-64 text-[10px] leading-4 text-slate-500">Minta Admin membuat akun aktif pada perusahaan ini; akun yang sudah tertaut ke karyawan lain tidak ditampilkan.</span>}
                          </div>
                        )}
                        <input
                          aria-label={`Nama karyawan ${emp.employee_name}`}
                          placeholder="Nama karyawan"
                          value={employeeProfileEdits[emp.id]?.name ?? emp.employee_name}
                          onChange={(e) => setEmployeeProfileEdits((p) => ({ ...p, [emp.id]: { name: e.target.value, number: p[emp.id]?.number ?? emp.employee_number, status: p[emp.id]?.status ?? emp.employment_status } }))}
                          className="h-9 w-48 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <input
                          aria-label={`Nomor karyawan ${emp.employee_name}`}
                          placeholder="Nomor karyawan"
                          value={employeeProfileEdits[emp.id]?.number ?? emp.employee_number}
                          onChange={(e) => setEmployeeProfileEdits((p) => ({ ...p, [emp.id]: { name: p[emp.id]?.name ?? emp.employee_name, number: e.target.value, status: p[emp.id]?.status ?? emp.employment_status } }))}
                          className="h-9 w-36 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <select
                          aria-label={`Status karyawan ${emp.employee_name}`}
                          value={employeeProfileEdits[emp.id]?.status ?? emp.employment_status}
                          onChange={(e) => setEmployeeProfileEdits((p) => ({ ...p, [emp.id]: { name: p[emp.id]?.name ?? emp.employee_name, number: p[emp.id]?.number ?? emp.employee_number, status: e.target.value } }))}
                          className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        >
                          <option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option><option value="TERMINATED">Berakhir</option>
                        </select>
                        <select
                          aria-label={`Cost center ${emp.employee_name}`}
                          value={costCenterEdits[emp.id] ?? ""}
                          onChange={(e) => setCostCenterEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                          className="h-9 w-52 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        >
                          <option value="">Pilih cost center aktif</option>
                          {costCenters.map((center) => <option key={center.id} value={center.id}>{center.cost_center_code} — {center.cost_center_name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min="0.01"
                          step="1000"
                          aria-label={`Gaji bulanan ${emp.employee_name}`}
                          placeholder="Gaji bulanan"
                          value={salaryEdits[emp.id] ?? ""}
                          onChange={(e) => setSalaryEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                          className="h-9 w-40 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <input
                          type="number"
                          min="0.01"
                          step="100"
                          aria-label={`Tarif per jam ${emp.employee_name}`}
                          placeholder="Tarif dasar per jam (opsional)"
                          value={hourlyRateEdits[emp.id] ?? ""}
                          onChange={(e) => setHourlyRateEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                          className="h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <div className="flex flex-col gap-1">
                          <input type="number" min="0.01" step="100" aria-label={`Tarif lembur khusus per jam ${emp.employee_name}`} placeholder="Lembur khusus (kosong = umum)" value={overtimeRateEdits[emp.id] ?? ""} onChange={(event) => { setOvertimeRateEdits((current) => ({ ...current, [emp.id]: event.target.value })); setSavedEmployeeOvertimeRates((current) => ({ ...current, [emp.id]: false })); }} onBlur={() => void saveEmployeeOvertimeRate(emp)} disabled={savingEmployeeOvertimeRates[emp.id]} className="h-9 w-52 rounded-lg border border-slate-200 bg-slate-50 px-3 disabled:opacity-60" />
                          {savingEmployeeOvertimeRates[emp.id] ? <span className="text-[10px] text-sky-700">Menyimpan…</span> : savedEmployeeOvertimeRates[emp.id] ? <span className="text-[10px] text-emerald-700">Tersimpan</span> : null}
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.put(`/api/v1/hr/employees/${emp.id}`, {
                                employee_name: employeeProfileEdits[emp.id]?.name ?? emp.employee_name,
                                employee_number: employeeProfileEdits[emp.id]?.number ?? emp.employee_number,
                                employment_status: employeeProfileEdits[emp.id]?.status ?? emp.employment_status,
                                ...(employeeUserEdits[emp.id] ? { user_id: employeeUserEdits[emp.id] } : {}),
                                cost_center_id: costCenterEdits[emp.id] || null,
                                monthly_salary: salaryEdits[emp.id]?.trim() ? Number(salaryEdits[emp.id]) : null,
                                standard_hourly_rate: hourlyRateEdits[emp.id]?.trim() ? Number(hourlyRateEdits[emp.id]) : null,
                              });
                              toast.success(employeeUserEdits[emp.id] ? "Akun user berhasil ditautkan ke profil karyawan." : "Profil upah karyawan diperbarui.");
                              await loadData();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : "Gagal memperbarui gaji.");
                            }
                          }}
                          className="h-9 rounded-lg bg-[#0876CD] px-3 font-semibold text-white cursor-pointer"
                        >
                          Simpan Profil
                        </button>
                        {emp.employment_status === "ACTIVE" && (
                          <button type="button" onClick={async () => {
                            if (!window.confirm(`Nonaktifkan profil ${emp.employee_name}? Riwayat payroll tetap disimpan.`)) return;
                            try {
                              await api.delete(`/api/v1/hr/employees/${emp.id}`);
                              toast.success("Profil karyawan dinonaktifkan. Riwayat payroll tetap tersimpan.");
                              await loadData();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : "Gagal menonaktifkan karyawan.");
                            }
                          }} className="h-9 rounded-lg border border-red-200 px-3 font-semibold text-red-700">Nonaktifkan</button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {section === "lead" && (
        <div className="space-y-6">
          {hrTier <= 2 && (
            <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200 font-bold text-sm text-[#163D64]">
                Final Approval Lembur (Kepala HR Tier 1)
              </div>
              <OvertimeReviewTable rows={companyOvertimes} employees={employees} defaultRate={Number(defaultOvertimeRate) || 0} mode="lead" onDetail={setSelectedOvertime} onReload={loadData} />
            </div>
          )}

          <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-bold text-sm text-[#163D64]">
              Payroll Runs — HR-ACC &amp; Gerbang Review Finance (COA 6100 &amp; GL)
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {payrollRuns.length === 0 ? (
                <div className="p-5 text-center text-slate-500">
                  Belum ada payroll run. Buat draft payroll terlebih dahulu di tab Operasional HR &amp; Draft Payroll.
                </div>
              ) : (
                payrollRuns.map((run) => (
                  <div key={run.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-mono font-bold text-slate-900">
                        {run.run_number} <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-[10px] text-[#0876CD]">{run.status}</span>
                      </div>
                      <div className="text-slate-600 mt-0.5">
                        Periode {String(run.period_start).slice(0, 10)} s/d {String(run.period_end).slice(0, 10)} • Gross: {formatIdr(run.gross_total)} • Net: {formatIdr(run.net_total)}
                      </div>
                      {run.finance_decision_note && (
                        <div className="text-[11px] text-amber-700 mt-0.5">Catatan Finance: {run.finance_decision_note}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {hrTier === 1 && run.status === "DRAFT" && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.post(`/api/v1/hr/payroll/${run.id}/hr-approve`);
                              toast.success("Payroll di-ACC Kepala HR (HR_APPROVED).");
                              await loadData();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : "Gagal HR-ACC.");
                            }
                          }}
                          className="rounded-lg bg-[#0876CD] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                        >
                          HR-ACC
                        </button>
                      )}
                      {financeTier <= 1 && run.status === "HR_APPROVED" && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.post(`/api/v1/hr/payroll/${run.id}/finance-review`, { decision: "APPROVE" });
                                toast.success("Finance menyetujui payroll (APPROVED). Siap Post ke GL.");
                                await loadData();
                              } catch (err: unknown) {
                                toast.error(err instanceof Error ? err.message : "Gagal ACC Finance.");
                              }
                            }}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            ACC Finance
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.post(`/api/v1/hr/payroll/${run.id}/finance-review`, {
                                  decision: "REJECT",
                                  note: "Dikembalikan Finance untuk peninjauan anggaran/lembur.",
                                });
                                toast.success("Payroll dikembalikan ke DRAFT.");
                                await loadData();
                              } catch (err: unknown) {
                                toast.error(err instanceof Error ? err.message : "Gagal menolak payroll.");
                              }
                            }}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            Tolak ke DRAFT
                          </button>
                        </>
                      )}
                      {financeTier <= 1 && run.status === "APPROVED" && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.post(`/api/v1/hr/payroll/${run.id}/post-gl`);
                              toast.success("Payroll berhasil diposting ke General Ledger (POSTED).");
                              await loadData();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : "Gagal post GL (cek periode & budget COA 6100).");
                            }
                          }}
                          className="rounded-lg bg-[#163D64] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                        >
                          Post ke GL Akuntansi
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {hrTier === 1 && (
            <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sm text-[#163D64]">
                  Profil &amp; Data Upah Karyawan ({employees.length})
                </span>
                <button type="button" onClick={() => setEmployeeCreateOpen((value) => !value)} className="rounded-lg bg-[#0876CD] hover:bg-[#163D64] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer">
                  {employeeCreateOpen ? "Tutup Form" : "+ Tambah Karyawan"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-sky-50/60 px-4 py-3 text-xs">
                <label htmlFor="default-overtime-rate-lead" className="font-semibold text-slate-700">Tarif lembur umum per jam</label>
                <input id="default-overtime-rate-lead" type="number" min="0.01" step="100" value={defaultOvertimeRate} disabled={savingDefaultOvertimeRate} onChange={(event) => { setDefaultOvertimeRate(event.target.value); setDefaultOvertimeRateSaveStatus("idle"); }} onBlur={() => void saveDefaultOvertimeRate()} placeholder="Contoh: 50000" className="h-9 w-44 rounded-lg border border-slate-200 bg-white px-3 disabled:bg-slate-100" />
                <span className="text-slate-500">Tarif khusus karyawan akan menggantikan default. Kosong memakai rumus profil upah.</span>
                {savingDefaultOvertimeRate ? <span className="font-medium text-sky-700">Menyimpan…</span> : defaultOvertimeRateSaveStatus === "saved" ? <span className="font-medium text-emerald-700">Tersimpan</span> : null}
              </div>
              {employeeCreateOpen && (
                <form className="grid gap-2 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-6" onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await api.post("/api/v1/hr/employees", {
                      employee_name: newEmployee.employee_name,
                      employee_number: newEmployee.employee_number,
                      monthly_salary: newEmployee.monthly_salary.trim() ? Number(newEmployee.monthly_salary) : null,
                      standard_hourly_rate: newEmployee.standard_hourly_rate.trim() ? Number(newEmployee.standard_hourly_rate) : null,
                      overtime_hourly_rate: newEmployee.overtime_hourly_rate.trim() ? Number(newEmployee.overtime_hourly_rate) : null,
                      cost_center_id: newEmployee.cost_center_id || null,
                      employment_status: "ACTIVE",
                    });
                    setNewEmployee({ employee_name: "", employee_number: "", monthly_salary: "", standard_hourly_rate: "", overtime_hourly_rate: "", cost_center_id: "" });
                    setEmployeeCreateOpen(false);
                    toast.success("Profil karyawan dibuat. Admin dapat menautkan akun user saat membuat akun.");
                    await loadData();
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Gagal membuat profil karyawan.");
                  }
                }}>
                  <input required placeholder="Nama lengkap karyawan" value={newEmployee.employee_name} onChange={(e) => setNewEmployee((value) => ({ ...value, employee_name: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <input required placeholder="Nomor karyawan" value={newEmployee.employee_number} onChange={(e) => setNewEmployee((value) => ({ ...value, employee_number: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <input type="number" min="0.01" step="1000" placeholder="Gaji bulanan (opsional)" value={newEmployee.monthly_salary} onChange={(e) => setNewEmployee((value) => ({ ...value, monthly_salary: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <input type="number" min="0.01" step="100" placeholder="Tarif dasar per jam (opsional)" value={newEmployee.standard_hourly_rate} onChange={(e) => setNewEmployee((value) => ({ ...value, standard_hourly_rate: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <input type="number" min="0.01" step="100" placeholder="Tarif lembur khusus (opsional)" value={newEmployee.overtime_hourly_rate} onChange={(e) => setNewEmployee((value) => ({ ...value, overtime_hourly_rate: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3" />
                  <select value={newEmployee.cost_center_id} onChange={(e) => setNewEmployee((value) => ({ ...value, cost_center_id: e.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-3">
                    <option value="">Cost center (opsional)</option>
                    {costCenters.map((center) => <option key={center.id} value={center.id}>{center.cost_center_code} — {center.cost_center_name}</option>)}
                  </select>
                  <button type="submit" className="h-9 rounded-lg bg-emerald-600 px-3 font-semibold text-white">Simpan Karyawan</button>
                  <p className="text-[11px] leading-4 text-slate-500 sm:col-span-2 xl:col-span-6">Profil dibuat tanpa akun user. Admin menautkannya pada saat membuat akun; tarif lembur khusus bersifat opsional dan menggantikan tarif umum.</p>
                </form>
              )}
              <div className="divide-y divide-slate-100 text-xs">
                {employees.length === 0 ? (
                  <div className="p-5 text-center text-slate-500">
                    Belum ada profil karyawan. HR dapat membuat profil terlebih dahulu; akun user ditautkan oleh Admin saat akun dibuat.
                  </div>
                ) : (
                  employees.map((emp) => (
                    <div key={emp.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {emp.user_id ? (
                          <div className="flex h-9 min-w-56 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-600">
                            Akun user: {emp.linked_user?.full_name || emp.linked_user?.email || "Tertaut"}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <select aria-label={`Tautkan akun user ke ${emp.employee_name || emp.employee_number}`} value={employeeUserEdits[emp.id] ?? ""} onChange={(e) => setEmployeeUserEdits((current) => ({ ...current, [emp.id]: e.target.value }))} className="h-9 w-64 rounded-lg border border-amber-200 bg-amber-50 px-3">
                              <option value="">{employeeUserOptionsError ? "Daftar akun gagal dimuat" : employeeUserOptions.length ? "Belum ditautkan — pilih akun user" : "Tidak ada akun aktif yang belum ditautkan"}</option>
                              {employeeUserOptions.map((account) => <option key={account.id} value={account.id}>{account.full_name} — {account.email}</option>)}
                            </select>
                            {employeeUserOptionsError ? <span className="max-w-64 text-[10px] leading-4 text-red-600">Gagal memuat akun. Muat ulang halaman atau periksa akses HR Anda.</span> : !employeeUserOptions.length && <span className="max-w-64 text-[10px] leading-4 text-slate-500">Minta Admin membuat akun aktif pada perusahaan ini; akun yang sudah tertaut ke karyawan lain tidak ditampilkan.</span>}
                          </div>
                        )}
                        <input
                          aria-label={`Nama karyawan ${emp.employee_name}`}
                          placeholder="Nama karyawan"
                          value={employeeProfileEdits[emp.id]?.name ?? emp.employee_name}
                          onChange={(e) => setEmployeeProfileEdits((p) => ({ ...p, [emp.id]: { name: e.target.value, number: p[emp.id]?.number ?? emp.employee_number, status: p[emp.id]?.status ?? emp.employment_status } }))}
                          className="h-9 w-48 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <input
                          aria-label={`Nomor karyawan ${emp.employee_name}`}
                          placeholder="Nomor karyawan"
                          value={employeeProfileEdits[emp.id]?.number ?? emp.employee_number}
                          onChange={(e) => setEmployeeProfileEdits((p) => ({ ...p, [emp.id]: { name: p[emp.id]?.name ?? emp.employee_name, number: e.target.value, status: p[emp.id]?.status ?? emp.employment_status } }))}
                          className="h-9 w-36 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <select
                          aria-label={`Status karyawan ${emp.employee_name}`}
                          value={employeeProfileEdits[emp.id]?.status ?? emp.employment_status}
                          onChange={(e) => setEmployeeProfileEdits((p) => ({ ...p, [emp.id]: { name: p[emp.id]?.name ?? emp.employee_name, number: p[emp.id]?.number ?? emp.employee_number, status: e.target.value } }))}
                          className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        >
                          <option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option><option value="TERMINATED">Berakhir</option>
                        </select>
                        <select
                          aria-label={`Cost center ${emp.employee_name}`}
                          value={costCenterEdits[emp.id] ?? ""}
                          onChange={(e) => setCostCenterEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                          className="h-9 w-52 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        >
                          <option value="">Pilih cost center aktif</option>
                          {costCenters.map((center) => <option key={center.id} value={center.id}>{center.cost_center_code} — {center.cost_center_name}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min="0.01"
                          step="1000"
                          aria-label={`Gaji bulanan ${emp.employee_name}`}
                          placeholder="Gaji bulanan"
                          value={salaryEdits[emp.id] ?? ""}
                          onChange={(e) => setSalaryEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                          className="h-9 w-40 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <input
                          type="number"
                          min="0.01"
                          step="100"
                          aria-label={`Tarif per jam ${emp.employee_name}`}
                          placeholder="Tarif dasar per jam (opsional)"
                          value={hourlyRateEdits[emp.id] ?? ""}
                          onChange={(e) => setHourlyRateEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                          className="h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <div className="flex flex-col gap-1">
                          <input type="number" min="0.01" step="100" aria-label={`Tarif lembur khusus per jam ${emp.employee_name}`} placeholder="Lembur khusus (kosong = umum)" value={overtimeRateEdits[emp.id] ?? ""} onChange={(event) => { setOvertimeRateEdits((current) => ({ ...current, [emp.id]: event.target.value })); setSavedEmployeeOvertimeRates((current) => ({ ...current, [emp.id]: false })); }} onBlur={() => void saveEmployeeOvertimeRate(emp)} disabled={savingEmployeeOvertimeRates[emp.id]} className="h-9 w-52 rounded-lg border border-slate-200 bg-slate-50 px-3 disabled:opacity-60" />
                          {savingEmployeeOvertimeRates[emp.id] ? <span className="text-[10px] text-sky-700">Menyimpan…</span> : savedEmployeeOvertimeRates[emp.id] ? <span className="text-[10px] text-emerald-700">Tersimpan</span> : null}
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.put(`/api/v1/hr/employees/${emp.id}`, {
                                employee_name: employeeProfileEdits[emp.id]?.name ?? emp.employee_name,
                                employee_number: employeeProfileEdits[emp.id]?.number ?? emp.employee_number,
                                employment_status: employeeProfileEdits[emp.id]?.status ?? emp.employment_status,
                                ...(employeeUserEdits[emp.id] ? { user_id: employeeUserEdits[emp.id] } : {}),
                                cost_center_id: costCenterEdits[emp.id] || null,
                                monthly_salary: salaryEdits[emp.id]?.trim() ? Number(salaryEdits[emp.id]) : null,
                                standard_hourly_rate: hourlyRateEdits[emp.id]?.trim() ? Number(hourlyRateEdits[emp.id]) : null,
                              });
                              toast.success(employeeUserEdits[emp.id] ? "Akun user berhasil ditautkan ke profil karyawan." : "Profil upah karyawan diperbarui.");
                              await loadData();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : "Gagal memperbarui gaji.");
                            }
                          }}
                          className="h-9 rounded-lg bg-[#0876CD] px-3 font-semibold text-white cursor-pointer"
                        >
                          Simpan Profil
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {selectedOvertime && <OvertimeDetailModal overtime={selectedOvertime} onClose={() => setSelectedOvertime(null)} />}
    </div>
  );
}

function OvertimeReviewTable({
  rows, employees, defaultRate = 0, mode, onDetail, onReload,
}: {
  rows: OvertimeItem[];
  employees: EmployeeItem[];
  defaultRate?: number;
  mode: "ops" | "lead" | "personal";
  onDetail: (row: OvertimeItem) => void;
  onReload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    const sourceRows = mode === "lead" ? rows.filter((row) => ["SUBMITTED", "VERIFIED_HR_STAFF"].includes(row.status)) : rows;
    const q = query.trim().toLowerCase();
    return sourceRows.filter((row) => {
      const workDate = String(row.work_date).slice(0, 10);
      const employee = employees.find((item) => item.id === row.employee_id);
      const searchText = [row.id, overtimeEmployeeLabel({ employee_name: employee?.employee_name ?? row.employee_name, employee_number: employee?.employee_number ?? row.employee_number }), row.reason, row.project_name, row.project_code].join(" ").toLowerCase();
      if (q && !searchText.includes(q)) return false;
      if (employeeId && row.employee_id !== employeeId) return false;
      if (month && !workDate.startsWith(month)) return false;
      if (fromDate && workDate < fromDate) return false;
      if (toDate && workDate > toDate) return false;
      if (status !== "ALL" && row.status !== status) return false;
      return true;
    }).sort((left, right) => String(right.work_date).localeCompare(String(left.work_date)));
  }, [rows, employees, mode, query, employeeId, month, fromDate, toDate, status]);

  const maxPage = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const safePage = Math.min(page, maxPage);
  const pageRows = visibleRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const changeFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };

  const runAction = async (row: OvertimeItem, action: "verify" | "approve" | "reject") => {
    setBusyId(row.id);
    try {
      if (action === "reject") await api.post(`/api/v1/hr/overtimes/${row.id}/reject`, { reason: "Ditolak oleh HR" });
      else await api.post(`/api/v1/hr/overtimes/${row.id}/${action}`);
      toast.success(action === "verify" ? "Lembur diverifikasi." : action === "approve" ? "Lembur disetujui." : "Lembur ditolak.");
      await onReload();
    } catch (error: unknown) {
      const responseData = (error as { response?: { data?: unknown } })?.response?.data;
      const serverMessage = typeof responseData === "string" ? responseData : JSON.stringify(responseData ?? "");
      if (/status lembur tidak valid|sudah diproses|status.{0,20}(APPROVED|REJECTED|VERIFIED)/i.test(serverMessage)) {
        await onReload();
        toast.error("Status lembur sudah berubah. Daftar telah dimuat ulang; periksa status terbaru.");
      } else {
        toast.error(getApiErrorDetail(error, "Aksi belum berhasil. Periksa status dan kelengkapan tarif karyawan, lalu muat ulang."));
      }
    } finally { setBusyId(null); }
  };

  const availableStatuses = Array.from(new Set(rows.map((row) => row.status))).sort();
  return (
    <div className="text-xs">
      <div className="grid gap-2 border-b border-slate-100 bg-[#F8FAFC] p-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="relative sm:col-span-2 xl:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => changeFilter(setQuery)(event.target.value)} placeholder="Cari karyawan, alasan, proyek…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3" />
        </label>
        {mode !== "personal" && <select value={employeeId} onChange={(event) => changeFilter(setEmployeeId)(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5"><option value="">Semua karyawan</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_name} ({employee.employee_number})</option>)}</select>}
        <label className="relative"><CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Filter bulan" type="month" value={month} onChange={(event) => changeFilter(setMonth)(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-2" /></label>
        <input aria-label="Tanggal mulai filter" type="date" value={fromDate} onChange={(event) => changeFilter(setFromDate)(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2" />
        <input aria-label="Tanggal akhir filter" type="date" value={toDate} onChange={(event) => changeFilter(setToDate)(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2" />
        <select value={status} onChange={(event) => changeFilter(setStatus)(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5"><option value="ALL">Semua status</option>{availableStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] border-collapse text-left">
          <thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-slate-500"><tr>
            {mode !== "personal" && <th className="px-4 py-3 font-bold">Karyawan</th>}
            <th className="px-4 py-3 font-bold">Tanggal &amp; Waktu</th><th className="px-4 py-3 font-bold">Durasi</th><th className="px-4 py-3 font-bold">Tarif / Estimasi</th><th className="px-4 py-3 font-bold">Alasan &amp; Proyek</th><th className="px-4 py-3 font-bold">Status</th><th className="px-4 py-3 text-right font-bold">Aksi</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((row) => {
              const employee = employees.find((item) => item.id === row.employee_id);
              const price = resolveOvertimePrice(row, employee, defaultRate);
              const canDecide = ["SUBMITTED", "VERIFIED_HR_STAFF"].includes(row.status);
              const duplicateTime = row.status !== "REJECTED" && rows.some((other) => other.id !== row.id && other.status !== "REJECTED" && other.employee_id === row.employee_id && String(other.work_date).slice(0, 10) === String(row.work_date).slice(0, 10) && other.start_time < row.end_time && other.end_time > row.start_time);
              return <tr key={row.id} className="align-top hover:bg-slate-50/70">
                {mode !== "personal" && <td className="px-4 py-3"><div className="font-semibold text-slate-900">{overtimeEmployeeLabel({ employee_name: employee?.employee_name ?? row.employee_name, employee_number: employee?.employee_number ?? row.employee_number })}</div><div className="mt-1 font-mono text-[10px] text-slate-400">{row.id.slice(0, 8)}</div></td>}
                <td className="whitespace-nowrap px-4 py-3"><div className="font-semibold text-slate-800">{String(row.work_date).slice(0, 10)}</div><div className="mt-1 text-slate-500">{row.start_time || "—"}–{row.end_time || "—"}</div>{duplicateTime&&<span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-800">Jam tumpang tindih</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{row.duration_hours} jam</td>
                <td className="whitespace-nowrap px-4 py-3"><div className="text-slate-500">{price ? `${formatIdr(price.rate)}/jam` : "Tarif belum tersedia"}</div><div className="mt-1 font-bold text-[#0876CD]">{price ? formatIdr(price.amount) : "Belum dihitung"}</div></td>
                <td className="max-w-[300px] px-4 py-3"><div className="line-clamp-2 font-medium text-slate-800">{row.reason || "—"}</div><div className="mt-1 line-clamp-1 text-[10px] text-slate-500">{row.project_id ? `${row.project_code || ""} ${row.project_name || ""}`.trim() : "Proyek tidak tertaut"}</div></td>
                <td className="px-4 py-3"><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">{row.status}</span></td>
                <td className="px-4 py-3"><div className="flex min-w-max justify-end gap-1.5">
                  <button type="button" onClick={() => onDetail(row)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 font-semibold text-[#163D64]"><Eye size={13}/>Detail</button>
                  {mode === "ops" && row.status === "SUBMITTED" && <button type="button" disabled={!price || busyId === row.id} onClick={() => void runAction(row, "verify")} className="h-8 rounded-lg bg-[#0876CD] px-2.5 font-semibold text-white disabled:opacity-50">Verifikasi</button>}
                  {mode !== "personal" && canDecide && <>
                    <button type="button" disabled={!price || busyId === row.id} onClick={() => void runAction(row, "approve")} className="h-8 rounded-lg bg-emerald-600 px-2.5 font-semibold text-white disabled:opacity-50">{busyId === row.id ? "Menyimpan…" : "ACC"}</button>
                    <button type="button" disabled={busyId === row.id} onClick={() => void runAction(row, "reject")} className="h-8 rounded-lg bg-red-600 px-2.5 font-semibold text-white disabled:opacity-50">Tolak</button>
                  </>}
                </div></td>
              </tr>;
            })}
            {pageRows.length === 0 && <tr><td colSpan={mode === "personal" ? 6 : 7} className="px-4 py-12 text-center text-slate-500">Tidak ada pengajuan lembur yang cocok dengan filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-[11px] text-slate-600">
        <div className="flex items-center gap-2"><span>Menampilkan {visibleRows.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, visibleRows.length)} dari {visibleRows.length}</span><label className="ml-2 flex items-center gap-1.5">Baris<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-lg border border-slate-200 bg-white px-2"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label></div>
        <div className="flex items-center gap-1"><button type="button" aria-label="Halaman sebelumnya" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-40"><ChevronLeft size={15}/></button><span className="min-w-16 text-center">Halaman {safePage} / {maxPage}</span><button type="button" aria-label="Halaman berikutnya" disabled={safePage >= maxPage} onClick={() => setPage((value) => Math.min(maxPage, value + 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-40"><ChevronRight size={15}/></button></div>
      </div>
    </div>
  );
}

function OvertimeDetailModal({ overtime, onClose }: { overtime: OvertimeItem; onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (overtime.evidence_url?.startsWith("hr-attachment:")) {
      void loadHrEvidence(overtime.evidence_url, true).then((url) => {
        objectUrl = url;
        if (active) setImageUrl(url); else URL.revokeObjectURL(url);
      }).catch(() => { if (active) setImageError("Foto bukti tidak dapat dimuat."); });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [overtime.evidence_url]);

  const price = resolveOvertimePrice(overtime);
  const evidence = overtime.evidence_url ?? "";
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="overtime-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
        <div><h2 id="overtime-detail-title" className="text-base font-bold text-[#163D64]">Detail Pengajuan Lembur</h2><p className="text-xs text-slate-500">Periksa waktu, tarif, alasan, dan bukti sebelum memberi keputusan.</p></div>
        <button type="button" onClick={onClose} aria-label="Tutup detail" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
      </header>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <DetailValue label="Karyawan" value={overtimeEmployeeLabel(overtime)}/>
        <DetailValue label="Tanggal kerja" value={String(overtime.work_date).slice(0,10)}/>
        <DetailValue label="Jam lembur" value={`${overtime.start_time || "—"} – ${overtime.end_time || "—"}`}/>
        <DetailValue label="Durasi" value={`${overtime.duration_hours} jam`}/>
        <DetailValue label="Tarif tambahan per jam" value={price ? formatIdr(price.rate) : "Belum dapat dihitung"}/>
        <DetailValue label="Perkiraan uang lembur" value={price ? formatIdr(price.amount) : "Belum dapat dihitung"}/>
        <DetailValue label="Status" value={overtime.status}/>
        <DetailValue label="Proyek" value={overtime.project_id ? `${overtime.project_code || ""} ${overtime.project_name || ""}`.trim() : "Proyek tidak tertaut"}/>
        <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Alasan lembur</div><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{overtime.reason || "—"}</p></div>
        <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Bukti lembur</div>
          {!evidence ? <p className="mt-2 text-xs text-amber-700">Belum ada bukti terlampir pada pengajuan ini.</p> : evidence.startsWith("hr-attachment:") ? imageUrl ? <img src={imageUrl} alt="Foto bukti penyelesaian lembur" className="mt-3 max-h-[55vh] w-full rounded-lg border border-slate-200 object-contain"/> : <p className="mt-2 text-xs text-slate-500">{imageError || "Memuat foto bukti…"}</p> : <a href={evidence} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-blue-700 underline">Buka tautan bukti lembur</a>}
        </div>
      </div>
      <footer className="border-t border-slate-200 px-5 py-3 text-right"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Tutup</button></footer>
    </section>
  </div>;
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold text-slate-900">{value}</div></div>;
}

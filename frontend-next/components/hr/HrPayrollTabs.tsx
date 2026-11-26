"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  Eye,
  X,
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
  leave_hourly_rate?: number | string | null;
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

function resolveOvertimePrice(overtime: OvertimeItem, employee?: EmployeeItem) {
  const storedRate = Number(overtime.overtime_rate ?? 0);
  const storedAmount = Number(overtime.overtime_amount ?? 0);
  if (storedRate > 0 && storedAmount > 0) return { rate: storedRate, amount: storedAmount };

  const hourlyRate = Number(employee?.standard_hourly_rate ?? 0);
  const monthlySalary = Number(employee?.monthly_salary ?? 0);
  const baseHourlyRate = hourlyRate > 0 ? hourlyRate : monthlySalary > 0 ? monthlySalary / 173 : 0;
  const hours = Number(overtime.duration_hours);
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
  const [defaultLeaveRate, setDefaultLeaveRate] = useState("");
  const [savingDefaultLeaveRate, setSavingDefaultLeaveRate] = useState(false);
  const [leaveRateEdits, setLeaveRateEdits] = useState<Record<string, string>>({});
  const [savingLeaveRates, setSavingLeaveRates] = useState<Record<string, boolean>>({});
  const [savedLeaveRates, setSavedLeaveRates] = useState<Record<string, boolean>>({});
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
      const [myOtRes, mySlipRes, myRateRes, companyRateRes, leaveRateRes] = await Promise.all([
        api.get("/api/v1/hr/overtimes/my").catch(() => ({ data: { results: [] } })),
        api.get("/api/v1/hr/payslips/my").catch(() => ({ data: { results: [] } })),
        api.get("/api/v1/hr/overtimes/my/rate").catch(() => ({ data: { data: { configured: false, overtime_hourly_rate: null } } })),
        hrTier <= 2 ? api.get("/api/v1/hr/overtimes/rate-settings").catch(() => ({ data: { data: { default_overtime_hourly_rate: null } } })) : Promise.resolve({ data: { data: { default_overtime_hourly_rate: null } } }),
        hrTier <= 2 ? api.get("/api/v1/hr/leave/rate-settings").catch(() => ({ data: { data: { default_leave_hourly_rate: null } } })) : Promise.resolve({ data: { data: { default_leave_hourly_rate: null } } }),
      ]);
      setMyOvertimes(myOtRes.data?.results ?? []);
      setMyPayslips(mySlipRes.data?.results ?? []);
      setMyOvertimePricing(myRateRes.data?.data ?? { configured: false, overtime_hourly_rate: null });
      setDefaultOvertimeRate(formatRateInput(companyRateRes.data?.data?.default_overtime_hourly_rate));
      setDefaultLeaveRate(formatRateInput(leaveRateRes.data?.data?.default_leave_hourly_rate));

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
        const leaveRatesByEmployee: Record<string, string> = {};
        const profileEdits: Record<string, { name: string; number: string; status: string }> = {};
        const costCenterEditsByEmployee: Record<string, string> = {};
        for (const e of empList) {
          edits[e.id] = e.monthly_salary == null ? "" : String(e.monthly_salary);
          rateEdits[e.id] = e.standard_hourly_rate == null ? "" : String(e.standard_hourly_rate);
          overtimeRatesByEmployee[e.id] = formatRateInput(e.overtime_hourly_rate);
          leaveRatesByEmployee[e.id] = formatRateInput(e.leave_hourly_rate);
          profileEdits[e.id] = { name: e.employee_name, number: e.employee_number, status: e.employment_status };
          costCenterEditsByEmployee[e.id] = String(e.cost_center_id ?? "");
        }
        setSalaryEdits(edits);
        setHourlyRateEdits(rateEdits);
        setOvertimeRateEdits(overtimeRatesByEmployee);
        setLeaveRateEdits(leaveRatesByEmployee);
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

  const saveDefaultLeaveRate = async () => {
    if (hrTier !== 1 || savingDefaultLeaveRate) return;
    setSavingDefaultLeaveRate(true);
    try {
      const response = await api.put("/api/v1/hr/leave/rate-settings", {
        default_leave_hourly_rate: defaultLeaveRate.trim() ? Number(defaultLeaveRate) : null,
      });
      setDefaultLeaveRate(formatRateInput(response.data?.data?.default_leave_hourly_rate));
      toast.success("Tarif cuti umum tersimpan.");
    } catch (err: unknown) { toast.error(getApiErrorDetail(err, "Gagal menyimpan tarif cuti umum.")); }
    finally { setSavingDefaultLeaveRate(false); }
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

  const saveEmployeeLeaveRate = async (employee: EmployeeItem) => {
    if (hrTier > 2 || savingLeaveRates[employee.id]) return;
    const inputRate = leaveRateEdits[employee.id] ?? "";
    const numericRate = inputRate.trim() ? Number(inputRate) : null;
    if (numericRate !== null && (!Number.isFinite(numericRate) || numericRate <= 0)) {
      toast.error("Tarif cuti karyawan harus lebih dari nol atau dikosongkan untuk memakai tarif umum.");
      setLeaveRateEdits((current) => ({ ...current, [employee.id]: formatRateInput(employee.leave_hourly_rate) }));
      return;
    }
    setSavingLeaveRates((current) => ({ ...current, [employee.id]: true }));
    setSavedLeaveRates((current) => ({ ...current, [employee.id]: false }));
    try {
      const response = await api.put(`/api/v1/hr/employees/${employee.id}`, { leave_hourly_rate: numericRate });
      const rate = response.data?.data?.leave_hourly_rate ?? null;
      setEmployees((current) => current.map((row) => row.id === employee.id ? { ...row, leave_hourly_rate: rate } : row));
      setLeaveRateEdits((current) => ({ ...current, [employee.id]: formatRateInput(rate) }));
      setSavedLeaveRates((current) => ({ ...current, [employee.id]: true }));
    } catch (err: unknown) {
      setLeaveRateEdits((current) => ({ ...current, [employee.id]: formatRateInput(employee.leave_hourly_rate) }));
      toast.error(getApiErrorDetail(err, `Gagal menyimpan tarif cuti ${employee.employee_name}.`));
    } finally { setSavingLeaveRates((current) => ({ ...current, [employee.id]: false })); }
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
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs">
                {myOvertimes.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">Belum ada pengajuan lembur.</div>
                ) : (
                  myOvertimes.map((ot) => (
                    <div key={ot.id} className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {String(ot.work_date).slice(0, 10)} ({ot.start_time}–{ot.end_time}, {ot.duration_hours} jam)
                        </div>
                        <div className="text-slate-600 mt-0.5">{ot.reason}</div>
                        <div className="text-[11px] text-[#0876CD] font-semibold mt-0.5">
                          Estimasi Upah: {overtimePayLabel(ot)}
                        </div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-700">
                        {ot.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
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
            <div className="divide-y divide-slate-100 text-xs">
              {companyOvertimes.length === 0 ? (
                <div className="p-6 text-center text-slate-500">Belum ada pengajuan lembur perusahaan.</div>
              ) : (
                companyOvertimes.map((ot) => {
                  const employee = employees.find((row) => row.id === ot.employee_id);
                  const price = resolveOvertimePrice(ot, employee);
                  return (
                  <div key={ot.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {overtimeEmployeeLabel(ot)} • {String(ot.work_date).slice(0, 10)} ({ot.duration_hours} jam)
                      </div>
                      <div className="text-slate-600">{ot.reason}</div>
                      <div className="text-[11px] text-slate-500">{ot.project_id ? `Proyek: ${ot.project_code || ""} ${ot.project_name || ""}` : "Proyek tidak tertaut"}</div>
                      <div className="text-[11px] font-semibold text-[#0876CD]">Upah Lembur: {price ? formatIdr(price.amount) : "Belum dapat dihitung"}</div>
                      {!price && <div className="mt-1 text-[11px] font-medium text-amber-700">Lengkapi gaji bulanan atau tarif per jam pada profil karyawan sebelum memproses lembur.</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-700">{ot.status}</span>
                      <button type="button" onClick={() => setSelectedOvertime(ot)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-[#163D64] hover:bg-slate-50"><Eye size={13}/> Detail</button>
                      {ot.status === "SUBMITTED" && (
                        <button
                          type="button"
                          disabled={!price}
                          title={!price ? "Profil upah karyawan belum cukup untuk menghitung lembur." : "Verifikasi pengajuan lembur"}
                          onClick={async () => {
                            try {
                              await api.post(`/api/v1/hr/overtimes/${ot.id}/verify`);
                              toast.success("Lembur diverifikasi.");
                              await loadData();
                            } catch (err: unknown) {
                              toast.error(getApiErrorDetail(err, "Profil upah belum tersedia. Lengkapi gaji bulanan atau tarif per jam."));
                            }
                          }}
                          className="rounded-lg bg-[#0876CD] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Verifikasi
                        </button>
                      )}
                      {["SUBMITTED", "VERIFIED_HR_STAFF"].includes(ot.status) && (
                        <>
                          <button
                            type="button"
                            disabled={!price}
                            title={!price ? "Profil upah karyawan belum cukup untuk menghitung lembur." : "Setujui pengajuan lembur"}
                            onClick={async () => {
                              try {
                                await api.post(`/api/v1/hr/overtimes/${ot.id}/approve`);
                                toast.success("Lembur disetujui (APPROVED).");
                                await loadData();
                              } catch (err: unknown) {
                                toast.error(getApiErrorDetail(err, "Profil upah belum tersedia. Lengkapi gaji bulanan atau tarif per jam."));
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 size={13} /> Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.post(`/api/v1/hr/overtimes/${ot.id}/reject`, { reason: "Ditolak oleh HR" });
                                toast.success("Lembur ditolak.");
                                await loadData();
                              } catch (err: unknown) {
                                toast.error(err instanceof Error ? err.message : "Gagal menolak lembur.");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            <XCircle size={13} /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
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
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-emerald-50/70 px-4 py-3 text-xs">
                <label htmlFor="default-leave-rate-ops" className="font-semibold text-slate-700">Tarif cuti umum tambahan per jam</label>
                <input id="default-leave-rate-ops" type="number" min="0.01" step="100" value={defaultLeaveRate} disabled={hrTier !== 1 || savingDefaultLeaveRate} onChange={(event) => setDefaultLeaveRate(event.target.value)} placeholder="Contoh: 25000" className="h-9 w-44 rounded-lg border border-slate-200 bg-white px-3 disabled:bg-slate-100" />
                <button type="button" onClick={() => void saveDefaultLeaveRate()} disabled={hrTier !== 1 || savingDefaultLeaveRate} className="h-9 rounded-lg bg-emerald-600 px-3 font-semibold text-white disabled:opacity-50">{savingDefaultLeaveRate?"Menyimpan…":"Simpan tarif cuti"}</button>
                <span className="text-slate-500">Nominal cuti = (gaji bulanan ÷ 173 + tarif ini) × jam cuti. Tarif khusus karyawan menggantikan tarif umum.</span>
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
                        <div className="flex flex-col gap-1">
                          <input type="number" min="0.01" step="100" aria-label={`Tarif cuti khusus per jam ${emp.employee_name}`} placeholder="Cuti khusus/jam (kosong = umum)" value={leaveRateEdits[emp.id] ?? ""} onChange={(event) => { setLeaveRateEdits((current) => ({ ...current, [emp.id]: event.target.value })); setSavedLeaveRates((current) => ({ ...current, [emp.id]: false })); }} onBlur={() => void saveEmployeeLeaveRate(emp)} disabled={savingLeaveRates[emp.id]} className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 disabled:opacity-60" />
                          {savingLeaveRates[emp.id] ? <span className="text-[10px] text-sky-700">Menyimpan…</span> : savedLeaveRates[emp.id] ? <span className="text-[10px] text-emerald-700">Tarif cuti tersimpan</span> : null}
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
              <div className="divide-y divide-slate-100 text-xs">
                {companyOvertimes.filter((o) => ["SUBMITTED", "VERIFIED_HR_STAFF"].includes(o.status)).length === 0 ? (
                  <div className="p-5 text-center text-slate-500">
                    Belum ada pengajuan lembur yang menunggu persetujuan Kepala HR.
                  </div>
                ) : (
                  companyOvertimes
                    .filter((o) => ["SUBMITTED", "VERIFIED_HR_STAFF"].includes(o.status))
                    .map((ot) => {
                      const employee = employees.find((row) => row.id === ot.employee_id);
                      const price = resolveOvertimePrice(ot, employee);
                      return (
                      <div key={ot.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {overtimeEmployeeLabel(ot)} • {String(ot.work_date).slice(0, 10)} ({ot.duration_hours} jam — {price ? formatIdr(price.amount) : "Belum dapat dihitung"})
                          </div>
                          <div className="text-[11px] text-slate-500">{ot.project_id ? `Proyek: ${ot.project_code || ""} ${ot.project_name || ""}` : "Proyek tidak tertaut"}</div>
                          <div className="text-slate-600">{ot.reason}</div>
                          {!price && <div className="mt-1 text-[11px] font-medium text-amber-700">Lengkapi gaji bulanan atau tarif per jam pada profil karyawan sebelum memproses lembur.</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setSelectedOvertime(ot)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-[#163D64] hover:bg-slate-50"><Eye size={13}/> Detail</button>
                          <button
                            type="button"
                            disabled={!price}
                            title={!price ? "Profil upah karyawan belum cukup untuk menghitung lembur." : "Setujui lembur sebagai Kepala HR"}
                            onClick={async () => {
                              try {
                                await api.post(`/api/v1/hr/overtimes/${ot.id}/approve`);
                                toast.success("Lembur disetujui (APPROVED).");
                                await loadData();
                              } catch (err: unknown) {
                                toast.error(getApiErrorDetail(err, "Profil upah belum tersedia. Lengkapi gaji bulanan atau tarif per jam."));
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 size={13} /> Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.post(`/api/v1/hr/overtimes/${ot.id}/reject`, { reason: "Ditolak oleh Kepala HR" });
                                toast.success("Lembur ditolak.");
                                await loadData();
                              } catch (err: unknown) {
                                toast.error(err instanceof Error ? err.message : "Gagal menolak lembur.");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            <XCircle size={13} /> Reject
                          </button>
                        </div>
                      </div>
                      );
                    })
                )}
              </div>
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
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-emerald-50/70 px-4 py-3 text-xs">
                <label htmlFor="default-leave-rate-lead" className="font-semibold text-slate-700">Tarif cuti umum tambahan per jam</label>
                <input id="default-leave-rate-lead" type="number" min="0.01" step="100" value={defaultLeaveRate} disabled={hrTier !== 1 || savingDefaultLeaveRate} onChange={(event) => setDefaultLeaveRate(event.target.value)} placeholder="Contoh: 25000" className="h-9 w-44 rounded-lg border border-slate-200 bg-white px-3 disabled:bg-slate-100" />
                <button type="button" onClick={() => void saveDefaultLeaveRate()} disabled={hrTier !== 1 || savingDefaultLeaveRate} className="h-9 rounded-lg bg-emerald-600 px-3 font-semibold text-white disabled:opacity-50">{savingDefaultLeaveRate?"Menyimpan…":"Simpan tarif cuti"}</button>
                <span className="text-slate-500">Nominal cuti = (gaji bulanan ÷ 173 + tarif ini) × jam cuti. Tarif khusus karyawan menggantikan tarif umum.</span>
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
                        <div className="flex flex-col gap-1">
                          <input type="number" min="0.01" step="100" aria-label={`Tarif cuti khusus per jam ${emp.employee_name}`} placeholder="Cuti khusus/jam (kosong = umum)" value={leaveRateEdits[emp.id] ?? ""} onChange={(event) => { setLeaveRateEdits((current) => ({ ...current, [emp.id]: event.target.value })); setSavedLeaveRates((current) => ({ ...current, [emp.id]: false })); }} onBlur={() => void saveEmployeeLeaveRate(emp)} disabled={savingLeaveRates[emp.id]} className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 disabled:opacity-60" />
                          {savingLeaveRates[emp.id] ? <span className="text-[10px] text-sky-700">Menyimpan…</span> : savedLeaveRates[emp.id] ? <span className="text-[10px] text-emerald-700">Tarif cuti tersimpan</span> : null}
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

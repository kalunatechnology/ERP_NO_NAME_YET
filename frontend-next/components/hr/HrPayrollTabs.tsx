"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api/axios";
import { localDateKey } from "@/lib/utils";

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
  cost_center_id?: string | null;
}

interface CostCenterItem {
  id: string;
  cost_center_code: string;
  cost_center_name: string;
}

const formatIdr = (val: unknown) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(val ?? 0),
  );

const overtimePayLabel = (overtime: Pick<OvertimeItem, "overtime_rate" | "overtime_amount">) =>
  Number(overtime.overtime_rate) > 0 && Number(overtime.overtime_amount) > 0
    ? formatIdr(overtime.overtime_amount)
    : "Belum dapat dihitung";

const overtimeEmployeeLabel = (overtime: Pick<OvertimeItem, "employee_name" | "employee_number">) => {
  const name = String(overtime.employee_name ?? "").trim();
  const number = String(overtime.employee_number ?? "").trim();
  if (name && name !== number) return number ? `${name} (${number})` : name;
  return number ? `Karyawan (${number})` : "Karyawan";
};

interface HrPayrollTabsProps {
  section: "overtime" | "ops" | "lead";
  hrTier: number;
  financeTier: number;
  isStaff?: boolean;
}

export function HrPayrollTabs({ section, hrTier, financeTier, isStaff = false }: HrPayrollTabsProps) {
  const [loading, setLoading] = useState(true);
  const [myOvertimes, setMyOvertimes] = useState<OvertimeItem[]>([]);
  const [myPayslips, setMyPayslips] = useState<any[]>([]);
  const [companyOvertimes, setCompanyOvertimes] = useState<OvertimeItem[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterItem[]>([]);

  const [otForm, setOtForm] = useState({
    work_date: localDateKey(),
    start_time: "17:00",
    end_time: "20:00",
    duration_hours: "3",
    reason: "",
  });
  const [submittingOt, setSubmittingOt] = useState(false);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [myOtRes, mySlipRes] = await Promise.all([
        api.get("/api/v1/hr/overtimes/my").catch(() => ({ data: { results: [] } })),
        api.get("/api/v1/hr/payslips/my").catch(() => ({ data: { results: [] } })),
      ]);
      setMyOvertimes(myOtRes.data?.results ?? []);
      setMyPayslips(mySlipRes.data?.results ?? []);

      if (hrTier <= 2 || financeTier <= 1) {
        const [compOtRes, runsRes, empRes, costCenterRes] = await Promise.all([
          api.get("/api/v1/hr/overtimes").catch(() => ({ data: { results: [] } })),
          api.get("/api/v1/hr/payroll/runs").catch(() => ({ data: { results: [] } })),
          api.get("/api/v1/hr/employees").catch(() => ({ data: { results: [] } })),
          api.get("/api/v1/hr/cost-centers").catch(() => ({ data: { results: [] } })),
        ]);
        setCompanyOvertimes(compOtRes.data?.results ?? []);
        setPayrollRuns(runsRes.data?.results ?? []);
        const empList: EmployeeItem[] = empRes.data?.results ?? [];
        setEmployees(empList);
        setCostCenters(costCenterRes.data?.results ?? []);
        const edits: Record<string, string> = {};
        const rateEdits: Record<string, string> = {};
        const profileEdits: Record<string, { name: string; number: string; status: string }> = {};
        const costCenterEditsByEmployee: Record<string, string> = {};
        for (const e of empList) {
          edits[e.id] = e.monthly_salary == null ? "" : String(e.monthly_salary);
          rateEdits[e.id] = e.standard_hourly_rate == null ? "" : String(e.standard_hourly_rate);
          profileEdits[e.id] = { name: e.employee_name, number: e.employee_number, status: e.employment_status };
          costCenterEditsByEmployee[e.id] = String(e.cost_center_id ?? "");
        }
        setSalaryEdits(edits);
        setHourlyRateEdits(rateEdits);
        setEmployeeProfileEdits(profileEdits);
        setCostCenterEdits(costCenterEditsByEmployee);
      }
    } finally {
      setLoading(false);
    }
  }, [hrTier, financeTier]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSubmitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingOt(true);
    try {
      await api.post("/api/v1/hr/overtimes/my", {
        ...otForm,
        duration_hours: Number(otForm.duration_hours),
      });
      toast.success("Pengajuan lembur berhasil dikirim.");
      setOtForm((p) => ({ ...p, reason: "" }));
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal mengajukan lembur.");
    } finally {
      setSubmittingOt(false);
    }
  };

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
          Halaman ini adalah layanan HR pribadi. Profil karyawan dan gaji bulanan dikelola oleh HR Tier 2 atau Tier 1 di tab <strong>Operasional HR &amp; Payroll</strong>; minta admin perusahaan memberi akses HR yang sesuai bila Anda bertugas mengelola data tersebut.
        </div>
      )}

      {section === "overtime" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {isStaff ? (
              <div className="lg:col-span-5 rounded-2xl border border-[#BAE6FD] bg-white p-5 text-xs">
                <h2 className="text-sm font-bold text-[#163D64]">Catat Lembur pada Proyek Ditugaskan</h2>
                <p className="mt-2 leading-5 text-slate-600">Untuk memastikan jam lembur terkait dengan proyek dan tugas yang benar, staf mencatatnya melalui Timesheet di Tugas Harian. Daftar proyek di sana mengikuti akses dan penugasan akun Anda.</p>
                <Link href="/tasks" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0876CD] px-4 py-2.5 font-semibold text-white hover:bg-[#163D64]">Buka Tugas Harian</Link>
              </div>
            ) : <form onSubmit={handleSubmitOvertime} className="lg:col-span-5 rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-3 text-xs">
              <h2 className="text-sm font-bold text-[#163D64]">Ajukan Lembur Pribadi</h2>
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
                    value={otForm.start_time}
                    onChange={(e) => setOtForm((p) => ({ ...p, start_time: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    value={otForm.end_time}
                    onChange={(e) => setOtForm((p) => ({ ...p, end_time: e.target.value }))}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                </div>
              </div>
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
              <button
                type="submit"
                disabled={submittingOt}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0876CD] hover:bg-[#163D64] px-4 py-2.5 font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                <Send size={14} />
                {submittingOt ? "Mengirim..." : "Kirim Pengajuan Lembur"}
              </button>
            </form>}

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
                companyOvertimes.map((ot) => (
                  <div key={ot.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {overtimeEmployeeLabel(ot)} • {String(ot.work_date).slice(0, 10)} ({ot.duration_hours} jam)
                      </div>
                      <div className="text-slate-600">{ot.reason}</div>
                      <div className="text-[11px] text-slate-500">{ot.project_id ? `Proyek: ${ot.project_code || ""} ${ot.project_name || ""}` : "Proyek tidak tertaut"}</div>
                      <div className="text-[11px] font-semibold text-[#0876CD]">Upah Lembur: {overtimePayLabel(ot)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-700">{ot.status}</span>
                      {ot.status === "SUBMITTED" && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.post(`/api/v1/hr/overtimes/${ot.id}/verify`);
                              toast.success("Lembur diverifikasi.");
                              await loadData();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : "Gagal verifikasi.");
                            }
                          }}
                          className="rounded-lg bg-[#0876CD] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                        >
                          Verifikasi
                        </button>
                      )}
                      {["SUBMITTED", "VERIFIED_HR_STAFF"].includes(ot.status) && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.post(`/api/v1/hr/overtimes/${ot.id}/approve`);
                                toast.success("Lembur disetujui (APPROVED).");
                                await loadData();
                              } catch (err: unknown) {
                                toast.error(err instanceof Error ? err.message : "Gagal approve lembur.");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
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
                ))
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
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.post("/api/v1/hr/employees/sync-users");
                      const created = res.data?.data?.created_count ?? 0;
                      toast.success(
                        created > 0
                          ? `${created} user perusahaan berhasil disinkronkan ke Master Karyawan.`
                          : "Semua user aktif perusahaan sudah terdaftar sebagai karyawan.",
                      );
                      await loadData();
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "Gagal menyinkronkan user ke karyawan.");
                    }
                  }}
                  className="rounded-lg bg-[#0876CD] hover:bg-[#163D64] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                >
                  + Sinkronkan User ke Karyawan
                </button>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {employees.length === 0 ? (
                  <div className="p-5 text-center text-slate-500">
                    Belum ada data karyawan. Sinkronisasi hanya membuat profil tanpa mengisi angka gaji; HR perlu melengkapi gaji bulanan atau tarif per jam secara akurat.
                  </div>
                ) : (
                  employees.map((emp) => (
                    <div key={emp.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
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
                          placeholder="Tarif per jam (opsional)"
                          value={hourlyRateEdits[emp.id] ?? ""}
                          onChange={(e) => setHourlyRateEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                          className="h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.put(`/api/v1/hr/employees/${emp.id}`, {
                                employee_name: employeeProfileEdits[emp.id]?.name ?? emp.employee_name,
                                employee_number: employeeProfileEdits[emp.id]?.number ?? emp.employee_number,
                                employment_status: employeeProfileEdits[emp.id]?.status ?? emp.employment_status,
                                cost_center_id: costCenterEdits[emp.id] || null,
                                monthly_salary: salaryEdits[emp.id]?.trim() ? Number(salaryEdits[emp.id]) : null,
                                standard_hourly_rate: hourlyRateEdits[emp.id]?.trim() ? Number(hourlyRateEdits[emp.id]) : null,
                              });
                              toast.success("Profil upah karyawan diperbarui.");
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

      {section === "lead" && (
        <div className="space-y-6">
          {hrTier === 1 && (
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
                    .map((ot) => (
                      <div key={ot.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {overtimeEmployeeLabel(ot)} • {String(ot.work_date).slice(0, 10)} ({ot.duration_hours} jam — {overtimePayLabel(ot)})
                          </div>
                          <div className="text-[11px] text-slate-500">{ot.project_id ? `Proyek: ${ot.project_code || ""} ${ot.project_name || ""}` : "Proyek tidak tertaut"}</div>
                          <div className="text-slate-600">{ot.reason}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.post(`/api/v1/hr/overtimes/${ot.id}/approve`);
                                toast.success("Lembur disetujui (APPROVED).");
                                await loadData();
                              } catch (err: unknown) {
                                toast.error(err instanceof Error ? err.message : "Gagal approve lembur.");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
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
                    ))
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
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.post("/api/v1/hr/employees/sync-users");
                      const created = res.data?.data?.created_count ?? 0;
                      toast.success(
                        created > 0
                          ? `${created} user perusahaan berhasil disinkronkan ke Master Karyawan.`
                          : "Semua user aktif perusahaan sudah terdaftar sebagai karyawan.",
                      );
                      await loadData();
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "Gagal menyinkronkan user ke karyawan.");
                    }
                  }}
                  className="rounded-lg bg-[#0876CD] hover:bg-[#163D64] px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
                >
                  + Sinkronkan User ke Karyawan
                </button>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {employees.length === 0 ? (
                  <div className="p-5 text-center text-slate-500">
                    Belum ada data karyawan. Sinkronisasi hanya membuat profil tanpa mengisi angka gaji; HR perlu melengkapi gaji bulanan atau tarif per jam secara akurat.
                  </div>
                ) : (
                  employees.map((emp) => (
                    <div key={emp.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
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
                          placeholder="Tarif per jam (opsional)"
                          value={hourlyRateEdits[emp.id] ?? ""}
                          onChange={(e) => setHourlyRateEdits((p) => ({ ...p, [emp.id]: e.target.value }))}
                          className="h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 px-3"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api.put(`/api/v1/hr/employees/${emp.id}`, {
                                employee_name: employeeProfileEdits[emp.id]?.name ?? emp.employee_name,
                                employee_number: employeeProfileEdits[emp.id]?.number ?? emp.employee_number,
                                employment_status: employeeProfileEdits[emp.id]?.status ?? emp.employment_status,
                                cost_center_id: costCenterEdits[emp.id] || null,
                                monthly_salary: salaryEdits[emp.id]?.trim() ? Number(salaryEdits[emp.id]) : null,
                                standard_hourly_rate: hourlyRateEdits[emp.id]?.trim() ? Number(hourlyRateEdits[emp.id]) : null,
                              });
                              toast.success("Profil upah karyawan diperbarui.");
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
    </div>
  );
}

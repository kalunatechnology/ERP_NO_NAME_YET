import crypto from 'crypto';
import prisma from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { PayrollService } from '../finance/payroll.service';

let hrTablesInitialized = false;

export async function ensureHrTables(): Promise<void> {
  if (hrTablesInitialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "hr_overtime_request" (
        "id" TEXT PRIMARY KEY,
        "tenant_id" TEXT,
        "company_id" TEXT NOT NULL,
        "employee_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "work_date" DATE NOT NULL,
        "start_time" TEXT NOT NULL,
        "end_time" TEXT NOT NULL,
        "duration_hours" DECIMAL(6, 2) NOT NULL,
        "overtime_rate" DECIMAL(14, 2) NOT NULL DEFAULT 0,
        "overtime_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
        "reason" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
        "verified_by_id" TEXT,
        "verified_at" TIMESTAMP(3),
        "approved_by_id" TEXT,
        "approved_at" TIMESTAMP(3),
        "rejection_reason" TEXT,
        "payroll_run_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "fin_payroll_run"
       ADD COLUMN IF NOT EXISTS "hr_approved_by_id" TEXT,
       ADD COLUMN IF NOT EXISTS "hr_approved_at" TIMESTAMP(3),
       ADD COLUMN IF NOT EXISTS "finance_decision_note" TEXT;`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "fin_payroll_line"
       ADD COLUMN IF NOT EXISTS "overtime_hours" DECIMAL(8, 2) NOT NULL DEFAULT 0,
       ADD COLUMN IF NOT EXISTS "overtime_pay" DECIMAL(14, 2) NOT NULL DEFAULT 0;`,
    );
    hrTablesInitialized = true;
  } catch {
    // Graceful fallback if DDL is restricted
  }
}

export class HrService {
  static async getMyEmployeeOrThrow(companyId: string, userId: string) {
    const emp = await prisma.master_employee.findFirst({
      where: { company_id: companyId, user_id: userId, employment_status: 'ACTIVE' },
    });
    if (!emp) throw new NotFoundError('Profil karyawan aktif untuk akun ini');
    return emp;
  }

  static computeOvertimeAmount(emp: { monthly_salary: any; standard_hourly_rate: any }, hours: number) {
    const hourly =
      Number(emp.standard_hourly_rate ?? 0) > 0
        ? Number(emp.standard_hourly_rate)
        : Number(emp.monthly_salary ?? 0) / 173;
    const rate = Math.round(hourly * 1.5 * 100) / 100;
    return { rate, amount: Math.round(rate * hours * 100) / 100 };
  }

  /** Tier 3: Pengajuan lembur oleh staff. */
  static async submitOvertime(companyId: string, tenantId: string | null, userId: string, input: any) {
    await ensureHrTables();
    const emp = await this.getMyEmployeeOrThrow(companyId, userId);
    const hours = Number(input.duration_hours ?? 0);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 16) {
      throw new ValidationError('Durasi lembur harus antara 0.5 hingga 16 jam.');
    }
    if (!String(input.reason || '').trim()) {
      throw new ValidationError('Alasan lembur wajib diisi.');
    }
    const workDate = new Date(input.work_date);
    if (!Number.isFinite(workDate.getTime())) {
      throw new ValidationError('Tanggal kerja lembur tidak valid.');
    }
    const { rate, amount } = this.computeOvertimeAmount(emp, hours);
    return prisma.hr_overtime_request.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_id: companyId,
        employee_id: emp.id,
        user_id: userId,
        work_date: workDate,
        start_time: String(input.start_time || ''),
        end_time: String(input.end_time || ''),
        duration_hours: hours,
        overtime_rate: rate,
        overtime_amount: amount,
        reason: String(input.reason).trim(),
        status: 'SUBMITTED',
      },
    });
  }

  /**
   * Sinkronisasi otomatis jam lembur dari Daily Task / Timesheet ke pengajuan lembur HR.
   * Aman dipanggil secara best-effort: skip jika modul HR belum aktif atau user belum terhubung ke master_employee.
   */
  static async syncOvertimeFromDailyTimesheet(
    companyId: string,
    tenantId: string | null,
    userId: string,
    input: {
      work_date: Date | string;
      overtime_hours: number;
      overtime_started_at?: Date | string | null;
      overtime_ended_at?: Date | string | null;
      reason?: string | null;
    },
  ) {
    const hours = Number(input.overtime_hours ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) return null;

    const hrEnabled = await prisma.iam_company_module_access.findFirst({
      where: {
        company_id: companyId,
        module_code: { in: ['HR', 'HRMS', 'REQUESTS'] },
        enabled: true,
      },
      select: { id: true },
    });
    if (!hrEnabled) return null;

    const emp = await prisma.master_employee.findFirst({
      where: { company_id: companyId, user_id: userId, employment_status: 'ACTIVE' },
    });
    if (!emp) return null;

    await ensureHrTables();
    const toHhMm = (val?: Date | string | null) => {
      if (!val) return '';
      const d = new Date(val);
      return Number.isFinite(d.getTime()) ? d.toISOString().slice(11, 16) : '';
    };
    const workDate = new Date(input.work_date);
    const { rate, amount } = this.computeOvertimeAmount(emp, hours);
    return prisma.hr_overtime_request.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_id: companyId,
        employee_id: emp.id,
        user_id: userId,
        work_date: Number.isFinite(workDate.getTime()) ? workDate : new Date(),
        start_time: toHhMm(input.overtime_started_at),
        end_time: toHhMm(input.overtime_ended_at),
        duration_hours: Math.min(hours, 16),
        overtime_rate: rate,
        overtime_amount: amount,
        reason: String(input.reason || 'Lembur Daily Task / Timesheet').trim(),
        status: 'SUBMITTED',
      },
    });
  }

  static async listMyOvertimes(companyId: string, userId: string) {
    await ensureHrTables();
    return prisma.hr_overtime_request.findMany({
      where: { company_id: companyId, user_id: userId },
      orderBy: { work_date: 'desc' },
    });
  }

  static async listCompanyOvertimes(companyId: string) {
    await ensureHrTables();
    const [rows, employees] = await Promise.all([
      prisma.hr_overtime_request.findMany({
        where: { company_id: companyId },
        orderBy: [{ status: 'asc' }, { work_date: 'desc' }],
        take: 200,
      }),
      prisma.master_employee.findMany({
        where: { company_id: companyId },
        select: { id: true, employee_number: true, employee_name: true },
      }),
    ]);
    const empMap = new Map(employees.map((e) => [e.id, e]));
    return rows.map((row) => ({
      ...row,
      employee_number: empMap.get(row.employee_id)?.employee_number ?? '',
      employee_name: empMap.get(row.employee_id)?.employee_name ?? row.employee_id,
    }));
  }

  /** Tier 2: Verifikasi operasional oleh Anak Buah HR. */
  static async verifyOvertime(companyId: string, overtimeId: string, verifierId: string) {
    await ensureHrTables();
    const row = await prisma.hr_overtime_request.findFirst({ where: { id: overtimeId, company_id: companyId } });
    if (!row) throw new NotFoundError('Pengajuan lembur');
    if (row.user_id === verifierId) throw new ForbiddenError('Tidak dapat memverifikasi lembur milik sendiri.');
    if (row.status !== 'SUBMITTED') throw new ConflictError('Hanya lembur SUBMITTED yang dapat diverifikasi.');
    return prisma.hr_overtime_request.update({
      where: { id: overtimeId },
      data: { status: 'VERIFIED_HR_STAFF', verified_by_id: verifierId, verified_at: new Date() },
    });
  }

  /** Tier 1: Final approval oleh Kepala HR agar masuk antrean payroll. */
  static async approveOvertime(companyId: string, overtimeId: string, approverId: string) {
    await ensureHrTables();
    const row = await prisma.hr_overtime_request.findFirst({ where: { id: overtimeId, company_id: companyId } });
    if (!row) throw new NotFoundError('Pengajuan lembur');
    if (row.user_id === approverId) throw new ForbiddenError('Tidak dapat menyetujui lembur milik sendiri.');
    if (!['SUBMITTED', 'VERIFIED_HR_STAFF'].includes(row.status)) {
      throw new ConflictError('Status lembur tidak valid untuk persetujuan final.');
    }
    return prisma.hr_overtime_request.update({
      where: { id: overtimeId },
      data: { status: 'APPROVED', approved_by_id: approverId, approved_at: new Date() },
    });
  }

  /** Tier 1: Penolakan lembur oleh Kepala HR. */
  static async rejectOvertime(companyId: string, overtimeId: string, approverId: string, reason?: string) {
    await ensureHrTables();
    const row = await prisma.hr_overtime_request.findFirst({ where: { id: overtimeId, company_id: companyId } });
    if (!row) throw new NotFoundError('Pengajuan lembur');
    if (!['SUBMITTED', 'VERIFIED_HR_STAFF'].includes(row.status)) {
      throw new ConflictError('Status lembur tidak valid untuk penolakan.');
    }
    return prisma.hr_overtime_request.update({
      where: { id: overtimeId },
      data: {
        status: 'REJECTED',
        approved_by_id: approverId,
        approved_at: new Date(),
        rejection_reason: String(reason || 'Ditolak oleh Kepala HR.').trim(),
      },
    });
  }

  /** Tier 3: Daftar meeting HR yang mengundang user. */
  static async listMyMeetings(companyId: string, userId: string) {
    const participations = await prisma.request_meeting_participant.findMany({
      where: { company_id: companyId, user_id: userId },
      select: { meeting_id: true, invitation_status: true, attendance_status: true, participant_role: true },
    });
    const meetingIds = [...new Set(participations.map((p) => p.meeting_id))];
    if (!meetingIds.length) return [];
    const [meetings, minutes] = await Promise.all([
      prisma.request_meeting.findMany({
        where: { company_id: companyId, id: { in: meetingIds } },
        orderBy: { start_at: 'desc' },
        take: 50,
      }),
      prisma.request_meeting_minutes.findMany({
        where: { company_id: companyId, meeting_id: { in: meetingIds } },
        select: { id: true, meeting_id: true, status: true, conclusion: true, occurrence_date: true },
      }),
    ]);
    const partMap = new Map(participations.map((p) => [p.meeting_id, p]));
    const minMap = new Map(minutes.map((m) => [m.meeting_id, m]));
    return meetings.map((m) => ({
      ...m,
      my_participation: partMap.get(m.id) ?? null,
      minutes: minMap.get(m.id) ?? null,
    }));
  }

  /** Tier 2: Daftar seluruh meeting company untuk operasional HR. */
  static async listCompanyMeetings(companyId: string) {
    return prisma.request_meeting.findMany({
      where: { company_id: companyId },
      orderBy: { start_at: 'desc' },
      take: 100,
    });
  }

  /** Tier 2: Susun DRAFT payroll run + tarik otomatis lembur APPROVED pada periode berjalan. */
  static async generatePayrollDraft(
    companyId: string,
    tenantId: string | null,
    userId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    await ensureHrTables();
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
      throw new ValidationError('Rentang periode payroll tidak valid.');
    }
    const [employees, approvedOvertimes] = await Promise.all([
      prisma.master_employee.findMany({ where: { company_id: companyId, employment_status: 'ACTIVE' } }),
      prisma.hr_overtime_request.findMany({
        where: { company_id: companyId, status: 'APPROVED', payroll_run_id: null, work_date: { gte: start, lte: end } },
      }),
    ]);
    if (!employees.length) {
      throw new ValidationError('Belum ada karyawan berstatus ACTIVE untuk dibuatkan draft payroll.');
    }

    const otByEmp = new Map<string, { hours: number; amount: number }>();
    for (const ot of approvedOvertimes) {
      const prev = otByEmp.get(ot.employee_id) ?? { hours: 0, amount: 0 };
      otByEmp.set(ot.employee_id, {
        hours: Math.round((prev.hours + Number(ot.duration_hours ?? 0)) * 100) / 100,
        amount: Math.round((prev.amount + Number(ot.overtime_amount ?? 0)) * 100) / 100,
      });
    }

    const lines = employees.map((emp) => {
      const ot = otByEmp.get(emp.id) ?? { hours: 0, amount: 0 };
      return {
        employee_id: emp.id,
        cost_center_id: emp.cost_center_id,
        gross_salary: Number(emp.monthly_salary ?? 0),
        allowances: ot.amount,
        overtime_hours: ot.hours,
        overtime_pay: ot.amount,
        employee_tax: 0,
        employee_bpjs: 0,
        employer_bpjs: 0,
      };
    });

    const run = await PayrollService.createRun(companyId, tenantId, userId, {
      period_start: start,
      period_end: end,
      lines,
    });
    if (run && approvedOvertimes.length) {
      await prisma.hr_overtime_request.updateMany({
        where: { id: { in: approvedOvertimes.map((o) => o.id) } },
        data: { payroll_run_id: run.id },
      });
    }
    return run;
  }

  static async listPayrollRuns(companyId: string) {
    await ensureHrTables();
    return PayrollService.listRuns(companyId);
  }

  /** Tier 1 HR: ACC Payroll Run sebelum diserahkan ke Finance untuk review & GL posting. */
  static async hrApprovePayrollRun(companyId: string, runId: string, hrLeadId: string) {
    await ensureHrTables();
    const run = await prisma.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId } });
    if (!run) throw new NotFoundError('Payroll run');
    if (run.status !== 'DRAFT') throw new ConflictError('Hanya payroll run DRAFT yang dapat di-ACC oleh Kepala HR.');
    if (run.created_by_id === hrLeadId) {
      throw new ForbiddenError('Pembuat draft payroll tidak boleh melakukan HR-ACC pada run yang sama.');
    }
    return prisma.fin_payroll_run.update({
      where: { id: runId },
      data: { status: 'HR_APPROVED', hr_approved_by_id: hrLeadId, hr_approved_at: new Date() },
    });
  }

  /** Finance: Menentukan apakah payroll dari HR di-ACC (siap posting GL) atau ditolak ke DRAFT. */
  static async financeReviewPayrollRun(
    companyId: string,
    runId: string,
    financeUserId: string,
    decision: 'APPROVE' | 'REJECT',
    note?: string,
  ) {
    await ensureHrTables();
    const run = await prisma.fin_payroll_run.findFirst({ where: { id: runId, company_id: companyId } });
    if (!run) throw new NotFoundError('Payroll run');
    if (run.status !== 'HR_APPROVED') {
      throw new ConflictError('Payroll run harus berstatus HR_APPROVED sebelum direview Finance.');
    }
    if (decision === 'APPROVE' && run.created_by_id === financeUserId) {
      throw new ForbiddenError('Pembuat draft payroll tidak boleh melakukan ACC Finance pada run yang sama.');
    }
    if (decision === 'REJECT') {
      return prisma.fin_payroll_run.update({
        where: { id: runId },
        data: { status: 'DRAFT', finance_decision_note: String(note || 'Dikembalikan oleh Finance untuk revisi.') },
      });
    }
    return prisma.fin_payroll_run.update({
      where: { id: runId },
      data: {
        status: 'APPROVED',
        approved_by_id: financeUserId,
        approved_at: new Date(),
        finance_decision_note: String(note || ''),
      },
    });
  }

  static async syncCompanyUsersToEmployees(companyId: string, tenantId: string | null, actorId: string) {
    const memberships = await prisma.iam_user_company_membership.findMany({
      where: { company_id: companyId, status: 'ACTIVE' },
      select: { user_id: true },
    });
    const memberUserIds = Array.from(new Set(memberships.map((m) => m.user_id).filter(Boolean)));
    const users = memberUserIds.length
      ? await prisma.iam_user.findMany({
        where: { id: { in: memberUserIds }, is_active: true },
        select: { id: true, email: true, full_name: true },
      })
      : [];
    const existing = await prisma.master_employee.findMany({
      where: { company_id: companyId },
      select: { user_id: true },
    });
    const existingUserIds = new Set(existing.map((e) => e.user_id).filter(Boolean));
    let seq = existing.length + 1;
    let createdCount = 0;

    for (const user of users) {
      if (existingUserIds.has(user.id)) continue;
      const empNum = `EMP-${String(seq).padStart(4, '0')}`;
      seq += 1;
      await prisma.master_employee.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          company_id: companyId,
          created_by_id: actorId,
          user_id: user.id,
          employee_number: empNum,
          employee_name: user.full_name || user.email,
          employment_status: 'ACTIVE',
          monthly_salary: 5000000,
        },
      });
      createdCount += 1;
    }

    const totalEmployees = await prisma.master_employee.count({ where: { company_id: companyId } });
    return { created_count: createdCount, total_employees: totalEmployees };
  }

  static async listMyPayslips(companyId: string, userId: string) {
    await ensureHrTables();
    const emp = await this.getMyEmployeeOrThrow(companyId, userId);
    return prisma.fin_payroll_line.findMany({
      where: { company_id: companyId, employee_id: emp.id, payroll_run: { status: { in: ['POSTED', 'PAID'] } } },
      include: {
        payroll_run: {
          select: { run_number: true, period_start: true, period_end: true, status: true, journal_entry_id: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }
}

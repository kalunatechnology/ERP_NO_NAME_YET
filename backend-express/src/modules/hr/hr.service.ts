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
        "project_id" TEXT,
        "evidence_url" TEXT,
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
    await prisma.$executeRawUnsafe(`ALTER TABLE "hr_overtime_request" ADD COLUMN IF NOT EXISTS "project_id" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "hr_overtime_request" ADD COLUMN IF NOT EXISTS "evidence_url" TEXT;`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "hr_evidence_attachment" (
        "id" TEXT PRIMARY KEY,
        "company_id" TEXT NOT NULL,
        "uploaded_by_id" TEXT NOT NULL,
        "file_name" TEXT NOT NULL,
        "mime_type" TEXT NOT NULL,
        "file_size" INTEGER NOT NULL,
        "content" BYTEA NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`ALTER TABLE "master_employee" ADD COLUMN IF NOT EXISTS "overtime_hourly_rate" DECIMAL(18, 2);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "master_employee" ADD COLUMN IF NOT EXISTS "leave_hourly_rate" DECIMAL(18, 2);`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "hr_company_overtime_setting" (
        "company_id" TEXT PRIMARY KEY,
        "tenant_id" TEXT,
        "default_overtime_hourly_rate" DECIMAL(18, 2),
        "default_leave_hourly_rate" DECIMAL(18, 2),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`ALTER TABLE "hr_company_overtime_setting" ADD COLUMN IF NOT EXISTS "default_leave_hourly_rate" DECIMAL(18, 2);`);
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
  static async getHrTier1Users(companyId: string) {
    const assignments = await (prisma as any).iam_user_module_assignment.findMany({
      where: { company_id: companyId, module_code: { in: ['HR', 'HRMS', 'REQUESTS'] }, tier_level: 1, status: 'ACTIVE' },
      select: { user_id: true },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
    }).catch(() => [] as Array<{ user_id: string }>);
    const userIds = [...new Set(assignments.map((assignment: { user_id: string }) => assignment.user_id).filter(Boolean))];
    if (!userIds.length) return [] as string[];
    const [memberships, users] = await Promise.all([
      prisma.iam_user_company_membership.findMany({ where: { company_id: companyId, user_id: { in: userIds }, status: 'ACTIVE' }, select: { user_id: true } }),
      prisma.iam_user.findMany({ where: { id: { in: userIds }, is_active: true, status: 'ACTIVE' }, select: { id: true } }),
    ]);
    const activeIds = new Set(users.map((user) => user.id));
    return [...new Set(memberships.map((membership) => membership.user_id).filter((id) => activeIds.has(id)))];
  }

  static async notifyHrTier1(companyId: string, actorId: string, params: { title: string; message: string; actionUrl: string; referenceId: string }) {
    const recipients = (await this.getHrTier1Users(companyId).catch(() => [])).filter((id) => id !== actorId);
    if (!recipients.length) return;
    const now = new Date();
    for (const recipientId of recipients) {
      const notificationId = crypto.randomUUID();
      try {
        await prisma.core_notification.create({ data: {
          id: notificationId, title: params.title, message: params.message, action_url: params.actionUrl,
          notification_type: 'APPROVAL_REQUEST', priority: 'HIGH', company_id: companyId, created_at: now,
        } });
        await prisma.core_notification_recipient.create({ data: {
          id: crypto.randomUUID(), notification_id: notificationId, recipient_user_id: recipientId,
          recipient_role_id: null, company_id: companyId, delivery_status: 'UNREAD',
        } });
        await prisma.core_app_notification.create({ data: {
          id: crypto.randomUUID(), company_id: companyId, recipient_id: recipientId, actor_id: actorId,
          category: 'APPROVAL_REQUEST', title: params.title, description: params.message, target_url: params.actionUrl,
          is_read: false, created_at: now, updated_at: now, reference_type: 'HR_APPROVAL', reference_id: params.referenceId,
        } });
      } catch (error) {
        console.warn(`[HR] Gagal mengirim notifikasi approval ke ${recipientId}:`, error);
      }
    }
  }

  static async getMyEmployeeOrThrow(companyId: string, userId: string) {
    const emp = await prisma.master_employee.findFirst({
      where: { company_id: companyId, user_id: userId, employment_status: 'ACTIVE' },
    });
    if (!emp) throw new NotFoundError('Profil karyawan aktif untuk akun ini');
    return emp;
  }

  static async getOvertimeRateSettings(companyId: string) {
    await ensureHrTables();
    const setting = await prisma.hr_company_overtime_setting.findUnique({ where: { company_id: companyId } });
    return { default_overtime_hourly_rate: setting?.default_overtime_hourly_rate == null ? null : Number(setting.default_overtime_hourly_rate) };
  }

  static async updateOvertimeRateSettings(companyId: string, tenantId: string | null, input: any) {
    await ensureHrTables();
    const rawRate = input.default_overtime_hourly_rate;
    const rate = rawRate === null || rawRate === undefined || String(rawRate).trim() === '' ? null : Number(rawRate);
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
      throw new ValidationError('Tarif lembur umum harus lebih dari nol atau dikosongkan untuk memakai rumus profil upah.');
    }
    const setting = await prisma.hr_company_overtime_setting.upsert({
      where: { company_id: companyId },
      create: { company_id: companyId, tenant_id: tenantId, default_overtime_hourly_rate: rate },
      update: { tenant_id: tenantId, default_overtime_hourly_rate: rate },
    });
    return { default_overtime_hourly_rate: setting.default_overtime_hourly_rate == null ? null : Number(setting.default_overtime_hourly_rate) };
  }

  static async getLeaveRateSettings(companyId: string) {
    await ensureHrTables();
    const setting = await prisma.hr_company_overtime_setting.findUnique({ where: { company_id: companyId } });
    return { default_leave_hourly_rate: setting?.default_leave_hourly_rate == null ? null : Number(setting.default_leave_hourly_rate) };
  }

  static async updateLeaveRateSettings(companyId: string, tenantId: string | null, input: any) {
    await ensureHrTables();
    const rawRate = input.default_leave_hourly_rate;
    const rate = rawRate === null || rawRate === undefined || String(rawRate).trim() === '' ? null : Number(rawRate);
    if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) throw new ValidationError('Tarif cuti umum harus lebih dari nol atau dikosongkan.');
    const setting = await prisma.hr_company_overtime_setting.upsert({
      where: { company_id: companyId },
      create: { company_id: companyId, tenant_id: tenantId, default_leave_hourly_rate: rate },
      update: { tenant_id: tenantId, default_leave_hourly_rate: rate },
    });
    return { default_leave_hourly_rate: setting.default_leave_hourly_rate == null ? null : Number(setting.default_leave_hourly_rate) };
  }

  static async quoteMyLeavePay(companyId: string, userId: string, hours: number) {
    await ensureHrTables();
    const duration = Number(hours);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 31) throw new ValidationError('Durasi cuti tidak valid.');
    const employee = await prisma.master_employee.findFirst({
      where: { company_id: companyId, user_id: userId, employment_status: 'ACTIVE' },
      select: { monthly_salary: true, standard_hourly_rate: true, leave_hourly_rate: true },
    });
    if (!employee) return { configured: false, hours: duration, leave_hourly_rate: null, base_hourly_rate: null, total_amount: null };
    const settings = await this.getLeaveRateSettings(companyId);
    const leaveRate = Number(employee.leave_hourly_rate ?? settings.default_leave_hourly_rate ?? 0);
    const salary = Number(employee.monthly_salary ?? 0);
    const baseRate = salary > 0 ? salary / 173 : 0;
    const configured = leaveRate > 0 && baseRate > 0;
    return {
      configured,
      hours: duration,
      leave_hourly_rate: leaveRate > 0 ? leaveRate : null,
      base_hourly_rate: baseRate > 0 ? baseRate : null,
      total_amount: configured ? Math.round((leaveRate + baseRate) * duration * 100) / 100 : null,
    };
  }

  static async quoteLeavePayForRequests(companyId: string, requests: Array<{ id: string; userId: string | null; hours: number }>) {
    await ensureHrTables();
    const userIds = [...new Set(requests.map((request) => request.userId).filter((id): id is string => Boolean(id)))];
    if (!userIds.length) return new Map<string, any>();
    const [employees, settings] = await Promise.all([
      prisma.master_employee.findMany({
        where: { company_id: companyId, user_id: { in: userIds }, employment_status: 'ACTIVE' },
        select: { user_id: true, monthly_salary: true, leave_hourly_rate: true },
      }),
      this.getLeaveRateSettings(companyId),
    ]);
    const employeeByUser = new Map(employees.map((employee) => [employee.user_id, employee]));
    return new Map(requests.map((request) => {
      const employee = request.userId ? employeeByUser.get(request.userId) : null;
      if (!employee) return [request.id, null];
      const leaveRate = Number(employee.leave_hourly_rate ?? settings.default_leave_hourly_rate ?? 0);
      const salary = Number(employee.monthly_salary ?? 0);
      const baseHourlyRate = salary > 0 ? salary / 173 : 0;
      const configured = leaveRate > 0 && baseHourlyRate > 0;
      return [request.id, {
        configured,
        hours: request.hours,
        leave_hourly_rate: leaveRate > 0 ? leaveRate : null,
        base_hourly_rate: baseHourlyRate > 0 ? baseHourlyRate : null,
        total_amount: configured ? Math.round((leaveRate + baseHourlyRate) * request.hours * 100) / 100 : null,
      }];
    }));
  }

  static async resolveOvertimeHourlyRate(companyId: string, employee: { monthly_salary: any; standard_hourly_rate: any; overtime_hourly_rate?: any }) {
    const employeeRate = Number(employee.overtime_hourly_rate ?? 0);
    if (Number.isFinite(employeeRate) && employeeRate > 0) return { rate: employeeRate, source: 'EMPLOYEE_OVERRIDE' as const };
    const { default_overtime_hourly_rate: companyRate } = await this.getOvertimeRateSettings(companyId);
    if (companyRate && companyRate > 0) return { rate: companyRate, source: 'COMPANY_DEFAULT' as const };
    const fallback = this.computeOvertimeAmount(employee, 1);
    return { rate: fallback.configured ? fallback.rate : 0, source: 'PROFILE_FORMULA' as const };
  }

  static async getMyOvertimePricing(companyId: string, userId: string) {
    await ensureHrTables();
    const employee = await prisma.master_employee.findFirst({
      where: { company_id: companyId, user_id: userId, employment_status: 'ACTIVE' },
      select: { monthly_salary: true, standard_hourly_rate: true, overtime_hourly_rate: true },
    });
    if (!employee) return { configured: false, overtime_hourly_rate: null };
    const estimate = await this.resolveOvertimeHourlyRate(companyId, employee);
    return {
      configured: estimate.rate > 0,
      overtime_hourly_rate: estimate.rate > 0 ? estimate.rate : null,
      source: estimate.source,
    };
  }

  static computeOvertimeAmount(emp: { monthly_salary: any; standard_hourly_rate: any }, hours: number) {
    const standardRate = Number(emp.standard_hourly_rate ?? 0);
    const monthlySalary = Number(emp.monthly_salary ?? 0);
    const configured = (Number.isFinite(standardRate) && standardRate > 0)
      || (Number.isFinite(monthlySalary) && monthlySalary > 0);
    const hourly = Number.isFinite(standardRate) && standardRate > 0
      ? standardRate
      : configured ? monthlySalary / 173 : 0;
    const rate = Math.round(hourly * 1.5 * 100) / 100;
    return { rate, amount: configured ? Math.round(rate * hours * 100) / 100 : 0, configured };
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
    const startTime = String(input.start_time || '').trim();
    const endTime = String(input.end_time || '').trim();
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(startTime) || !timePattern.test(endTime) || endTime <= startTime) {
      throw new ValidationError('Jam mulai dan selesai lembur wajib valid, dan jam selesai harus setelah jam mulai.');
    }
    const { rate } = await this.resolveOvertimeHourlyRate(companyId, emp);
    const amount = Math.round(rate * hours * 100) / 100;
    const created = await prisma.hr_overtime_request.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_id: companyId,
        employee_id: emp.id,
        user_id: userId,
        project_id: null,
        work_date: workDate,
        start_time: startTime,
        end_time: endTime,
        duration_hours: hours,
        overtime_rate: rate,
        overtime_amount: amount,
        reason: String(input.reason).trim(),
        evidence_url: input.evidence_url ?? null,
        status: 'SUBMITTED',
      },
    });
    await this.notifyHrTier1(companyId, userId, {
      title: 'Pengajuan lembur baru', message: `${emp.employee_name || emp.employee_number} mengajukan lembur ${hours} jam.`,
      actionUrl: '/requests?tab=hr_ops', referenceId: created.id,
    }).catch(() => null);
    return created;
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
      project_id?: string | null;
      reason?: string | null;
      evidence_url?: string | null;
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
    const startTime = toHhMm(input.overtime_started_at);
    const endTime = toHhMm(input.overtime_ended_at);
    const existing = await prisma.hr_overtime_request.findFirst({
      where: { company_id: companyId, employee_id: emp.id, work_date: Number.isFinite(workDate.getTime()) ? workDate : new Date(), start_time: startTime, project_id: input.project_id ?? null },
    });
    if (existing) {
      if (!existing.evidence_url && input.evidence_url) {
        return prisma.hr_overtime_request.update({ where: { id: existing.id }, data: { evidence_url: input.evidence_url } });
      }
      return existing;
    }
    const { rate } = await this.resolveOvertimeHourlyRate(companyId, emp);
    const amount = Math.round(rate * hours * 100) / 100;
    const created = await prisma.hr_overtime_request.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        company_id: companyId,
        employee_id: emp.id,
        user_id: userId,
        project_id: input.project_id ?? null,
        work_date: Number.isFinite(workDate.getTime()) ? workDate : new Date(),
        start_time: startTime,
        end_time: endTime,
        duration_hours: Math.min(hours, 16),
        overtime_rate: rate,
        overtime_amount: amount,
        reason: String(input.reason || 'Lembur Daily Task / Timesheet').trim(),
        evidence_url: input.evidence_url ?? null,
        status: 'SUBMITTED',
      },
    });
    await this.notifyHrTier1(companyId, userId, {
      title: 'Pengajuan lembur baru',
      message: `${emp.employee_name || emp.employee_number} mengirim timesheet lembur ${Math.min(hours, 16)} jam untuk ditinjau HR.`,
      actionUrl: '/requests?tab=hr_ops', referenceId: created.id,
    }).catch(() => null);
    return created;
  }

  static async saveEvidenceAttachment(companyId: string, userId: string, input: any) {
    await ensureHrTables();
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const mimeType = String(input.mime_type ?? '').toLowerCase();
    const fileName = String(input.file_name ?? '').trim().replace(/[\\/\r\n\u0000]/g, '_').slice(0, 255);
    const encoded = String(input.content_base64 ?? '');
    if (!allowedTypes.has(mimeType) || !fileName || encoded.length > 5_600_000) {
      throw new ValidationError('Lampiran harus berupa JPG, PNG, atau WebP maksimal 4 MB.');
    }
    const content = Buffer.from(encoded, 'base64');
    if (!content.length || content.length > 4 * 1024 * 1024 || content.toString('base64') !== encoded) {
      throw new ValidationError('Isi gambar tidak valid atau ukurannya melebihi 4 MB.');
    }
    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "hr_evidence_attachment" ("id", "company_id", "uploaded_by_id", "file_name", "mime_type", "file_size", "content") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      id, companyId, userId, fileName, mimeType, content.length, content,
    );
    return { attachment_url: `hr-attachment:${id}` };
  }

  static async getEvidenceAttachment(companyId: string, id: string, userId: string, allowCompanyAccess = false) {
    await ensureHrTables();
    const rows = await prisma.$queryRawUnsafe<Array<{ uploaded_by_id: string; file_name: string; mime_type: string; content: Buffer }>>(
      `SELECT "uploaded_by_id", "file_name", "mime_type", "content" FROM "hr_evidence_attachment" WHERE "company_id" = $1 AND "id" = $2 LIMIT 1`,
      companyId, id,
    );
    const attachment = rows[0];
    if (!attachment) throw new NotFoundError('Lampiran');
    if (!allowCompanyAccess && attachment.uploaded_by_id !== userId) throw new ForbiddenError('Lampiran ini bukan milik akun Anda.');
    return attachment;
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
    const [pendingTimesheets, activeEmployees] = await Promise.all([
      prisma.project_timesheet.findMany({
        where: { company_id: companyId, overtime_hours: { gt: 0 }, approval_status: { not: 'REJECTED' } },
        orderBy: { created_at: 'asc' }, take: 1000,
      }),
      prisma.master_employee.findMany({ where: { company_id: companyId, employment_status: 'ACTIVE', user_id: { not: null } }, select: { id: true, user_id: true } }),
    ]);
    const userByEmployeeId = new Map(activeEmployees.map((employee) => [employee.id, employee.user_id]));
    for (const timesheet of pendingTimesheets) {
      const userId = timesheet.employee_id ? userByEmployeeId.get(timesheet.employee_id) : null;
      if (!userId || !timesheet.work_date) continue;
      await this.syncOvertimeFromDailyTimesheet(companyId, null, userId, {
        work_date: timesheet.work_date,
        overtime_hours: Number(timesheet.overtime_hours ?? 0),
        overtime_started_at: timesheet.overtime_started_at,
        overtime_ended_at: timesheet.overtime_ended_at,
        project_id: timesheet.project_id,
        reason: timesheet.overtime_reason || 'Lembur Daily Task / Timesheet',
        evidence_url: timesheet.evidence_url,
      }).catch(() => null);
    }
    const [rows, employees] = await Promise.all([
      prisma.hr_overtime_request.findMany({
        where: { company_id: companyId },
        orderBy: [{ status: 'asc' }, { work_date: 'desc' }],
        take: 200,
      }),
      prisma.master_employee.findMany({
        where: { company_id: companyId },
        select: { id: true, employee_number: true, employee_name: true, party_id: true, user_id: true },
      }),
    ]);
    const partyIds = [...new Set(employees.map((employee) => employee.party_id).filter((id): id is string => Boolean(id)))];
    // The request stores its submitter user_id as a snapshot. Resolve that as well
    // as the employee's current link so older requests still show the submitter's name.
    const userIds = [...new Set([
      ...employees.map((employee) => employee.user_id),
      ...rows.map((row) => row.user_id),
    ].filter((id): id is string => Boolean(id)))];
    const [parties, users] = await Promise.all([
      partyIds.length ? prisma.master_party.findMany({ where: { company_id: companyId, id: { in: partyIds } }, select: { id: true, display_name: true, legal_name: true } }) : [],
      userIds.length ? prisma.iam_user.findMany({ where: { id: { in: userIds } }, select: { id: true, full_name: true, email: true } }) : [],
    ]);
    const partyById = new Map(parties.map((party) => [party.id, party]));
    const userById = new Map(users.map((user) => [user.id, user]));
    const projectIds = [...new Set(rows.map((row) => row.project_id).filter((id): id is string => Boolean(id)))];
    const projects = projectIds.length ? await prisma.project_project.findMany({
      where: { company_id: companyId, id: { in: projectIds } },
      select: { id: true, project_code: true, project_name: true },
    }) : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const employeeIds = [...new Set(rows.map((row) => row.employee_id))];
    const olderTimesheets = employeeIds.length ? await prisma.project_timesheet.findMany({
      where: { company_id: companyId, employee_id: { in: employeeIds }, overtime_hours: { gt: 0 }, evidence_url: { not: null } },
      select: { employee_id: true, project_id: true, work_date: true, overtime_started_at: true, evidence_url: true },
      orderBy: { created_at: 'desc' },
      take: 1000,
    }) : [];
    const timeKey = (employeeId: string, workDate: Date, projectId?: string | null, startedAt?: Date | null) =>
      `${employeeId}|${workDate.toISOString().slice(0, 10)}|${projectId ?? ''}|${startedAt?.toISOString().slice(11, 16) ?? ''}`;
    const oldEvidenceByKey = new Map<string, string>();
    for (const timesheet of olderTimesheets) {
      if (!timesheet.employee_id || !timesheet.work_date || !timesheet.evidence_url) continue;
      const key = timeKey(timesheet.employee_id, timesheet.work_date, timesheet.project_id, timesheet.overtime_started_at);
      if (!oldEvidenceByKey.has(key)) oldEvidenceByKey.set(key, timesheet.evidence_url);
    }
    return rows.map((row) => {
      const employee = empMap.get(row.employee_id);
      const project = row.project_id ? projectMap.get(row.project_id) : null;
      const storedName = String(employee?.employee_name ?? '').trim();
      const employeeName = storedName && storedName !== employee?.employee_number ? storedName : '';
      const evidenceKey = `${row.employee_id}|${row.work_date.toISOString().slice(0, 10)}|${row.project_id ?? ''}|${row.start_time}`;
      const evidenceFromTimesheet = row.evidence_url ?? oldEvidenceByKey.get(evidenceKey) ?? null;
      return {
        ...row,
        evidence_url: evidenceFromTimesheet,
        employee_number: employee?.employee_number ?? '',
        employee_name: employeeName
          || partyById.get(employee?.party_id ?? '')?.display_name
          || partyById.get(employee?.party_id ?? '')?.legal_name
          || userById.get(row.user_id)?.full_name
          || userById.get(employee?.user_id ?? '')?.full_name
          || userById.get(row.user_id)?.email
          || userById.get(employee?.user_id ?? '')?.email
          || 'Nama karyawan belum diisi',
        project_code: project?.project_code ?? '',
        project_name: project?.project_name ?? '',
      };
    });
  }

  private static async resolveOvertimePrice(companyId: string, row: any) {
    const storedRate = Number(row.overtime_rate ?? 0);
    const storedAmount = Number(row.overtime_amount ?? 0);
    if (storedRate > 0 && storedAmount > 0) return { rate: storedRate, amount: storedAmount };
    const employee = await prisma.master_employee.findFirst({
      where: { id: row.employee_id, company_id: companyId, employment_status: 'ACTIVE' },
    });
    if (!employee) throw new ValidationError('Profil karyawan aktif tidak ditemukan untuk menghitung upah lembur.');
    const { rate } = await this.resolveOvertimeHourlyRate(companyId, employee);
    const amount = Math.round(rate * Number(row.duration_hours ?? 0) * 100) / 100;
    if (rate <= 0 || amount <= 0) {
      throw new ValidationError('Tarif lembur belum tersedia. Lengkapi tarif umum atau tarif khusus pada profil karyawan sebelum memproses lembur ini.');
    }
    return { rate, amount };
  }

  /** Tier 2: Verifikasi operasional oleh Anak Buah HR. */
  static async verifyOvertime(companyId: string, overtimeId: string, verifierId: string) {
    await ensureHrTables();
    const row = await prisma.hr_overtime_request.findFirst({ where: { id: overtimeId, company_id: companyId } });
    if (!row) throw new NotFoundError('Pengajuan lembur');
    if (row.user_id === verifierId) throw new ForbiddenError('Tidak dapat memverifikasi lembur milik sendiri.');
    if (row.status !== 'SUBMITTED') throw new ConflictError('Hanya lembur SUBMITTED yang dapat diverifikasi.');
    const price = await this.resolveOvertimePrice(companyId, row);
    return prisma.hr_overtime_request.update({
      where: { id: overtimeId },
      data: { ...price, status: 'VERIFIED_HR_STAFF', verified_by_id: verifierId, verified_at: new Date() },
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
    const price = await this.resolveOvertimePrice(companyId, row);
    return prisma.hr_overtime_request.update({
      where: { id: overtimeId },
      data: { ...price, status: 'APPROVED', approved_by_id: approverId, approved_at: new Date() },
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
    const employeesWithoutSalary = employees.filter((emp) => Number(emp.monthly_salary ?? 0) <= 0);
    if (employeesWithoutSalary.length) {
      throw new ValidationError(`Gaji bulanan belum diatur untuk ${employeesWithoutSalary.length} karyawan ACTIVE. Lengkapi Profil & Data Upah sebelum membuat draft payroll.`);
    }
    const employeesWithoutCostCenter = employees.filter((emp) => !emp.cost_center_id);
    if (employeesWithoutCostCenter.length) {
      throw new ValidationError(`Cost center belum diatur untuk ${employeesWithoutCostCenter.length} karyawan ACTIVE. Lengkapi Profil Karyawan sebelum membuat draft payroll.`);
    }

    const unpricedOvertime = approvedOvertimes.find((ot) => Number(ot.overtime_rate ?? 0) <= 0 || Number(ot.overtime_amount ?? 0) <= 0);
    if (unpricedOvertime) {
      throw new ValidationError('Ada lembur APPROVED tanpa estimasi upah yang valid. Perbaiki profil upah dan pengajuan lembur sebelum membuat draft payroll.');
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

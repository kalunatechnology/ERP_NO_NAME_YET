import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { EmployeeProvisioningService } from '../master_data/employee-provisioning.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { RoleCode } from '../../types/roles';
import { ProjectsService } from './projects.service';

export const timesheetTimerRouter = Router();

function activeCompanyId(req: Request): string {
  if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses timer kerja.');
  return req.companyId;
}

function activeTenantId(req: Request): string {
  const tenantId = req.user?.tenant_id;
  if (!tenantId) throw new ForbiddenError('Tenant aktif tidak tersedia.');
  return tenantId;
}

function activeUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new ForbiddenError('User aktif tidak tersedia.');
  return userId;
}

function attendanceSource(req: Request): 'WEB' | 'MOBILE_WEB' {
  return /mobile|android|iphone|ipad/i.test(String(req.headers['user-agent'] || ''))
    ? 'MOBILE_WEB'
    : 'WEB';
}

function parseWorkDate(value: unknown): Date {
  const workDate = value ? new Date(String(value)) : new Date();
  if (!Number.isFinite(workDate.getTime())) {
    throw new ValidationError('Tanggal kerja tidak valid.');
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (workDate.getTime() >= tomorrow.getTime()) {
    throw new ValidationError('Tanggal kerja tidak boleh berada di masa depan.');
  }
  return workDate;
}

function roundedHours(startedAt: Date, endedAt: Date): number {
  const milliseconds = endedAt.getTime() - startedAt.getTime();
  if (milliseconds <= 0) throw new ValidationError('Timestamp timer tidak valid.');
  const hours = Math.max(0.01, Math.round((milliseconds / 3_600_000) * 100) / 100);
  if (hours > 24) throw new ValidationError('Durasi timer tidak boleh melebihi 24 jam.');
  return hours;
}

async function currentEmployee(req: Request) {
  const employee = await EmployeeProvisioningService.ensureForUser({
    userId: activeUserId(req),
    tenantId: activeTenantId(req),
    companyId: activeCompanyId(req),
    actorId: activeUserId(req),
  });

  if (!employee) {
    throw new ForbiddenError('Administrator platform tidak memiliki profil employee untuk timer kerja.');
  }
  return employee;
}

async function findDraftSession(req: Request) {
  const employee = await currentEmployee(req);
  const session = await prisma.project_timesheet.findFirst({
    where: {
      tenant_id: activeTenantId(req),
      company_id: activeCompanyId(req),
      employee_id: employee.id,
      approval_status: 'DRAFT',
    },
    orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
  });
  return { employee, session };
}

function respondSnapshot(res: Response, session: unknown) {
  return res.json({
    session,
    server_now: new Date().toISOString(),
  });
}

async function validateTaskForCurrentUser(
  req: Request,
  projectId: string,
  taskId?: string,
) {
  if (!taskId) return;

  const task = await prisma.project_task.findFirst({
    where: {
      id: taskId,
      tenant_id: activeTenantId(req),
      company_id: activeCompanyId(req),
      project_id: projectId,
    },
    select: { id: true, assigned_to_id: true },
  });

  if (!task) throw new ValidationError('Task timesheet tidak valid.');

  if (
    req.user?.active_role_code === RoleCode.STAFF &&
    task.assigned_to_id !== activeUserId(req)
  ) {
    throw new ForbiddenError('Anda hanya dapat menjalankan timer pada task yang ditugaskan kepada Anda.');
  }
}

/**
 * Returns the current employee's unfinished server-side timer session.
 * The backend timestamp is the source of truth; the browser only renders the elapsed value.
 */
timesheetTimerRouter.get(
  '/timesheets/timer/active',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session } = await findDraftSession(req);
      return respondSnapshot(res, session ?? null);
    } catch (error) {
      return next(error);
    }
  },
);

/** Start a regular-work timer using the server clock and persist it immediately. */
timesheetTimerRouter.post(
  '/timesheets/timer/start',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = activeCompanyId(req);
      const tenantId = activeTenantId(req);
      const userId = activeUserId(req);
      const employee = await currentEmployee(req);
      const projectId = String(req.body.project_id ?? '').trim();
      const taskId = req.body.task_id ? String(req.body.task_id).trim() : undefined;

      if (!projectId) throw new ValidationError('Project wajib dipilih sebelum memulai timer.');
      await ProjectsService.assertCanViewProject(req.user, projectId, companyId);
      await validateTaskForCurrentUser(req, projectId, taskId);

      const workDate = parseWorkDate(req.body.work_date);
      const startedAt = new Date();

      const session = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.project_timesheet.findFirst({
            where: {
              tenant_id: tenantId,
              company_id: companyId,
              employee_id: employee.id,
              approval_status: 'DRAFT',
            },
            orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
          });

          if (existing) {
            throw new ConflictError('Masih ada timer kerja yang belum dikirim. Selesaikan sesi tersebut terlebih dahulu.');
          }

          return tx.project_timesheet.create({
            data: {
              tenant_id: tenantId,
              company_id: companyId,
              created_by_id: userId,
              project_id: projectId,
              task_id: taskId,
              employee_id: employee.id,
              work_date: workDate,
              hours: 0,
              overtime_hours: 0,
              overtime_reason: '',
              work_started_at: startedAt,
              work_ended_at: null,
              last_activity_at: startedAt,
              attendance_source: attendanceSource(req),
              overtime_started_at: null,
              overtime_ended_at: null,
              evidence_url: null,
              approval_status: 'DRAFT',
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return res.status(201).json({ session, server_now: new Date().toISOString() });
    } catch (error) {
      return next(error);
    }
  },
);

/** Stop regular work using the server clock and persist verified regular hours. */
timesheetTimerRouter.post(
  '/timesheets/timer/stop',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session } = await findDraftSession(req);
      if (!session) throw new NotFoundError('Timer kerja aktif');
      if (!session.work_started_at) throw new ValidationError('Timestamp mulai kerja tidak tersedia.');
      if (session.work_ended_at) return respondSnapshot(res, session);

      const endedAt = new Date();
      const hours = roundedHours(session.work_started_at, endedAt);
      const updated = await prisma.project_timesheet.update({
        where: { id: session.id },
        data: {
          work_ended_at: endedAt,
          last_activity_at: endedAt,
          hours,
        },
      });
      return respondSnapshot(res, updated);
    } catch (error) {
      return next(error);
    }
  },
);

/** Start overtime after regular work has been stopped. */
timesheetTimerRouter.post(
  '/timesheets/timer/overtime/start',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session } = await findDraftSession(req);
      if (!session) throw new NotFoundError('Timesheet draft');
      if (!session.work_ended_at) {
        throw new ValidationError('Selesaikan timer kerja reguler sebelum memulai lembur.');
      }
      if (session.overtime_ended_at) {
        throw new ConflictError('Timer lembur pada sesi ini sudah selesai dan terkunci.');
      }
      if (session.overtime_started_at) return respondSnapshot(res, session);

      const startedAt = new Date();
      const updated = await prisma.project_timesheet.update({
        where: { id: session.id },
        data: {
          overtime_started_at: startedAt,
          last_activity_at: startedAt,
        },
      });
      return respondSnapshot(res, updated);
    } catch (error) {
      return next(error);
    }
  },
);

/** Stop overtime using the server clock and recalculate the authoritative total hours. */
timesheetTimerRouter.post(
  '/timesheets/timer/overtime/stop',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session } = await findDraftSession(req);
      if (!session) throw new NotFoundError('Timesheet draft');
      if (!session.work_started_at || !session.work_ended_at) {
        throw new ValidationError('Timer kerja reguler belum selesai.');
      }
      if (!session.overtime_started_at) throw new ValidationError('Timer lembur belum dimulai.');
      if (session.overtime_ended_at) return respondSnapshot(res, session);

      const endedAt = new Date();
      const regularHours = roundedHours(session.work_started_at, session.work_ended_at);
      const overtimeHours = roundedHours(session.overtime_started_at, endedAt);
      const totalHours = Math.round((regularHours + overtimeHours) * 100) / 100;
      if (totalHours > 24) {
        throw new ValidationError('Total durasi kerja dan lembur tidak boleh melebihi 24 jam.');
      }

      const updated = await prisma.project_timesheet.update({
        where: { id: session.id },
        data: {
          overtime_ended_at: endedAt,
          overtime_hours: overtimeHours,
          hours: totalHours,
          last_activity_at: endedAt,
        },
      });
      return respondSnapshot(res, updated);
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * Finalize the server-side timer session. Client-provided timestamps/hours are never trusted.
 */
timesheetTimerRouter.post(
  '/timesheets/timer/submit',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session } = await findDraftSession(req);
      if (!session) throw new NotFoundError('Timesheet draft');
      if (!session.work_started_at || !session.work_ended_at) {
        throw new ValidationError('Selesaikan timer kerja sebelum mengirim timesheet.');
      }
      if (session.overtime_started_at && !session.overtime_ended_at) {
        throw new ValidationError('Hentikan timer lembur sebelum mengirim timesheet.');
      }

      const overtimeHours = Number(session.overtime_hours ?? 0);
      const overtimeReason = String(req.body.overtime_reason ?? '').trim();
      const evidenceUrl = String(req.body.evidence_url ?? '').trim();
      if (overtimeHours > 0 && !evidenceUrl) {
        throw new ValidationError('Bukti penyelesaian berupa link atau dokumen wajib dilampirkan untuk lembur.');
      }

      const now = new Date();
      const updated = await prisma.project_timesheet.update({
        where: { id: session.id },
        data: {
          overtime_reason: overtimeReason,
          evidence_url: evidenceUrl || null,
          approval_status: 'PENDING',
          last_activity_at: now,
        },
      });

      return respondSnapshot(res, updated);
    } catch (error) {
      return next(error);
    }
  },
);

/** Cancel an unfinished draft timer owned by the current employee. */
timesheetTimerRouter.delete(
  '/timesheets/timer/active',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { session } = await findDraftSession(req);
      if (!session) return res.status(204).send();
      await prisma.project_timesheet.delete({ where: { id: session.id } });
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

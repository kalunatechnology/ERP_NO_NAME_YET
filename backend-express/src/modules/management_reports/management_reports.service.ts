import prisma from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { ReportingService } from '../reporting/reporting.service';

export interface CreateReportInput {
  companyId: string;
  tenantId: string;
  userId: string;
  title: string;
  reportType?: string;
  periodType?: string;
  periodStart: Date;
  periodEnd: Date;
  executiveSummary?: string;
  achievements?: string;
  blockers?: string;
  risks?: string;
  decisionsNeeded?: string;
  nextPlan?: string;
}

export interface UpdateReportInput {
  title?: string;
  periodStart?: Date;
  periodEnd?: Date;
  executiveSummary?: string;
  achievements?: string;
  blockers?: string;
  risks?: string;
  decisionsNeeded?: string;
  nextPlan?: string;
}

export class ManagementReportsService {
  private static async generateReportNumber(companyId: string): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `MR-${dateStr}`;

    const count = await prisma.management_report.count({
      where: {
        company_id: companyId,
        report_number: { startsWith: prefix },
      },
    });

    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}-${seq}`;
  }

  static async listReports(companyId: string, status?: string) {
    const where: any = { company_id: companyId };
    if (status) {
      where.status = status;
    }

    return prisma.management_report.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  static async getReport(companyId: string, id: string) {
    const report = await prisma.management_report.findFirst({
      where: { id, company_id: companyId },
    });

    if (!report) {
      throw new NotFoundError('Management report tidak ditemukan.');
    }

    const [preparedByUser, reviewedByUser] = await Promise.all([
      report.prepared_by_id
        ? prisma.iam_user.findUnique({
            where: { id: report.prepared_by_id },
            select: { id: true, full_name: true, email: true },
          })
        : null,
      report.reviewed_by_id
        ? prisma.iam_user.findUnique({
            where: { id: report.reviewed_by_id },
            select: { id: true, full_name: true, email: true },
          })
        : null,
    ]);

    return {
      ...report,
      prepared_by: preparedByUser,
      reviewed_by: reviewedByUser,
    };
  }

  static async createDraft(input: CreateReportInput) {
    const reportNumber = await this.generateReportNumber(input.companyId);

    return prisma.management_report.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: input.tenantId,
        company_id: input.companyId,
        report_number: reportNumber,
        title: input.title,
        report_type: input.reportType ?? 'OPERATIONAL',
        period_type: input.periodType ?? 'WEEKLY',
        period_start: input.periodStart,
        period_end: input.periodEnd,
        executive_summary: input.executiveSummary ?? '',
        achievements: input.achievements ?? '',
        blockers: input.blockers ?? '',
        risks: input.risks ?? '',
        decisions_needed: input.decisionsNeeded ?? '',
        next_plan: input.nextPlan ?? '',
        status: 'DRAFT',
        prepared_by_id: input.userId,
      },
    });
  }

  static async updateDraft(companyId: string, id: string, userId: string, input: UpdateReportInput) {
    const existing = await prisma.management_report.findFirst({
      where: { id, company_id: companyId },
    });

    if (!existing) {
      throw new NotFoundError('Management report tidak ditemukan.');
    }

    if (existing.prepared_by_id !== userId) {
      throw new ForbiddenError('Hanya OM pembuat laporan yang dapat mengubah draft laporan ini.');
    }

    if (!['DRAFT', 'REVISION_REQUESTED'].includes(existing.status)) {
      throw new ValidationError('Hanya laporan dengan status DRAFT atau REVISION_REQUESTED yang dapat diubah.');
    }

    return prisma.management_report.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.periodStart !== undefined ? { period_start: input.periodStart } : {}),
        ...(input.periodEnd !== undefined ? { period_end: input.periodEnd } : {}),
        ...(input.executiveSummary !== undefined ? { executive_summary: input.executiveSummary } : {}),
        ...(input.achievements !== undefined ? { achievements: input.achievements } : {}),
        ...(input.blockers !== undefined ? { blockers: input.blockers } : {}),
        ...(input.risks !== undefined ? { risks: input.risks } : {}),
        ...(input.decisionsNeeded !== undefined ? { decisions_needed: input.decisionsNeeded } : {}),
        ...(input.nextPlan !== undefined ? { next_plan: input.nextPlan } : {}),
      },
    });
  }

  static async submit(companyId: string, id: string, userId: string) {
    const existing = await prisma.management_report.findFirst({
      where: { id, company_id: companyId },
    });

    if (!existing) {
      throw new NotFoundError('Management report tidak ditemukan.');
    }

    if (existing.prepared_by_id !== userId) {
      throw new ForbiddenError('Hanya OM pembuat laporan yang dapat mengirim laporan ini.');
    }

    if (!['DRAFT', 'REVISION_REQUESTED'].includes(existing.status)) {
      throw new ValidationError('Hanya laporan dengan status DRAFT atau REVISION_REQUESTED yang dapat disubmit.');
    }

    // Selalu generate snapshot operasional terbaru saat submit
    const latestSnapshot = await ReportingService.buildOperationalSummary(companyId);

    return prisma.management_report.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submitted_at: new Date(),
        snapshot_json: latestSnapshot as any,
      },
    });
  }

  static async requestRevision(companyId: string, id: string, userId: string, reviewNote: string) {
    if (!reviewNote || !reviewNote.trim()) {
      throw new ValidationError('Catatan revisi wajib diisi.');
    }

    const existing = await prisma.management_report.findFirst({
      where: { id, company_id: companyId },
    });

    if (!existing) {
      throw new NotFoundError('Management report tidak ditemukan.');
    }

    if (existing.status !== 'SUBMITTED') {
      throw new ValidationError('Hanya laporan dengan status SUBMITTED yang dapat diminta revisi.');
    }

    return prisma.management_report.update({
      where: { id },
      data: {
        status: 'REVISION_REQUESTED',
        reviewed_by_id: userId,
        reviewed_at: new Date(),
        review_note: reviewNote.trim(),
      },
    });
  }

  static async markReviewed(companyId: string, id: string, userId: string, reviewNote?: string) {
    const existing = await prisma.management_report.findFirst({
      where: { id, company_id: companyId },
    });

    if (!existing) {
      throw new NotFoundError('Management report tidak ditemukan.');
    }

    if (existing.status !== 'SUBMITTED') {
      throw new ValidationError('Hanya laporan dengan status SUBMITTED yang dapat disetujui/ditandai telah direview.');
    }

    return prisma.management_report.update({
      where: { id },
      data: {
        status: 'REVIEWED',
        reviewed_by_id: userId,
        reviewed_at: new Date(),
        review_note: reviewNote?.trim() || null,
      },
    });
  }

  static async archive(companyId: string, id: string, userId: string) {
    const existing = await prisma.management_report.findFirst({
      where: { id, company_id: companyId },
    });

    if (!existing) {
      throw new NotFoundError('Management report tidak ditemukan.');
    }

    if (existing.status !== 'REVIEWED') {
      throw new ValidationError('Hanya laporan yang telah direview yang dapat diarsipkan.');
    }

    return prisma.management_report.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
      },
    });
  }
}

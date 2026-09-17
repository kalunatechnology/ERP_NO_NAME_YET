import { Router, Request, Response, NextFunction } from 'express';
import { requireActiveRole } from '../../middlewares/rbac.middleware';
import { RoleCode } from '../../types/roles';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { ManagementReportsService } from './management_reports.service';

export const managementReportsRouter = Router();

function activeCompanyId(req: Request): string {
  if (!req.companyId) {
    throw new ForbiddenError('Pilih company sebelum mengakses management reports.');
  }
  return req.companyId;
}

// List management reports
managementReportsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const status = req.query.status ? String(req.query.status) : undefined;
    const reports = await ManagementReportsService.listReports(companyId, status);
    res.json({ results: reports, count: reports.length });
  } catch (err) {
    next(err);
  }
});

// Get management report detail
managementReportsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const report = await ManagementReportsService.getReport(companyId, req.params.id);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// Create draft (OM only)
managementReportsRouter.post('/', requireActiveRole(RoleCode.OPERATIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const tenantId = req.user?.tenant_id;
    const userId = req.user?.id;

    if (!tenantId || !userId) {
      throw new ForbiddenError('Identitas tenant atau user tidak tersedia.');
    }

    const {
      title,
      report_type,
      period_type,
      period_start,
      period_end,
      executive_summary,
      achievements,
      blockers,
      risks,
      decisions_needed,
      next_plan,
    } = req.body;

    if (!title || !period_start || !period_end) {
      throw new ValidationError('Judul laporan, tanggal mulai, dan tanggal akhir wajib diisi.');
    }

    const report = await ManagementReportsService.createDraft({
      companyId,
      tenantId,
      userId,
      title,
      reportType: report_type,
      periodType: period_type,
      periodStart: new Date(period_start),
      periodEnd: new Date(period_end),
      executiveSummary: executive_summary,
      achievements,
      blockers,
      risks,
      decisionsNeeded: decisions_needed,
      nextPlan: next_plan,
    });

    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

// Update draft (OM only)
managementReportsRouter.patch('/:id', requireActiveRole(RoleCode.OPERATIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const userId = req.user!.id;
    const {
      title,
      period_start,
      period_end,
      executive_summary,
      achievements,
      blockers,
      risks,
      decisions_needed,
      next_plan,
    } = req.body;

    const report = await ManagementReportsService.updateDraft(companyId, req.params.id, userId, {
      title,
      periodStart: period_start ? new Date(period_start) : undefined,
      periodEnd: period_end ? new Date(period_end) : undefined,
      executiveSummary: executive_summary,
      achievements,
      blockers,
      risks,
      decisionsNeeded: decisions_needed,
      nextPlan: next_plan,
    });

    res.json(report);
  } catch (err) {
    next(err);
  }
});

// Submit report (OM only)
managementReportsRouter.post('/:id/submit', requireActiveRole(RoleCode.OPERATIONAL_MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const userId = req.user!.id;
    const report = await ManagementReportsService.submit(companyId, req.params.id, userId);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// Request revision (Director only)
managementReportsRouter.post('/:id/request-revision', requireActiveRole(RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const userId = req.user!.id;
    const { review_note } = req.body;
    const report = await ManagementReportsService.requestRevision(companyId, req.params.id, userId, review_note);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// Mark reviewed (Director only)
managementReportsRouter.post('/:id/mark-reviewed', requireActiveRole(RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const userId = req.user!.id;
    const { review_note } = req.body;
    const report = await ManagementReportsService.markReviewed(companyId, req.params.id, userId, review_note);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

// Archive report (Director only)
managementReportsRouter.post('/:id/archive', requireActiveRole(RoleCode.DIRECTOR), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = activeCompanyId(req);
    const userId = req.user!.id;
    const report = await ManagementReportsService.archive(companyId, req.params.id, userId);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

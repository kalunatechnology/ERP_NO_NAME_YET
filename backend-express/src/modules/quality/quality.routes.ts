/**
 * File: backend-express/src/modules/quality/quality.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the quality domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { completeInspection } from './inspection.service';

export const qualityRouter = Router();

// Custom action: complete inspection
/**
 * POST route handler: `/inspections/:id/complete`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `qa_inspection` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
qualityRouter.post('/inspections/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses quality.');
    const updated = await completeInspection(req.params.id, req.companyId, req.user!.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
qualityRouter.use('/quality-plans', createCrudRouter({ modelName: 'qa_quality_plan', searchFields: ['plan_name', 'plan_code'] }));
qualityRouter.use('/quality-plan-points', createCrudRouter({ modelName: 'qa_quality_plan_point' }));
qualityRouter.use('/inspections', createCrudRouter({ modelName: 'qa_inspection', searchFields: ['inspection_number'] }));
qualityRouter.use('/inspection-results', createCrudRouter({ modelName: 'qa_inspection_result',
  beforeCreate: async (req, data) => {
    const inspection = await prisma.qa_inspection.findFirst({ where: { id: data.inspection_id, company_id: req.companyId } });
    if (!inspection || inspection.status === 'COMPLETED') throw new ForbiddenError('Hasil hanya dapat dicatat pada inspection aktif di company ini.');
    return data;
  },
  beforeUpdate: async (req, data, existing) => {
    const inspection = await prisma.qa_inspection.findFirst({ where: { id: existing.inspection_id, company_id: req.companyId } });
    if (!inspection || inspection.status === 'COMPLETED') throw new ForbiddenError('Hasil inspection yang selesai bersifat immutable.');
    if (data.inspection_id && data.inspection_id !== existing.inspection_id) throw new ForbiddenError('Hasil tidak dapat dipindahkan ke inspection lain.');
    return data;
  },
  beforeDelete: async (req, existing) => {
    const inspection = await prisma.qa_inspection.findFirst({ where: { id: existing.inspection_id, company_id: req.companyId } });
    if (!inspection || inspection.status === 'COMPLETED') throw new ForbiddenError('Hasil inspection yang selesai tidak dapat dihapus.');
  },
}));
qualityRouter.use('/nonconformances', createCrudRouter({ modelName: 'qa_nonconformance', searchFields: ['ncr_number', 'description'] }));
qualityRouter.use('/corrective-actions', createCrudRouter({ modelName: 'qa_corrective_action', searchFields: ['capa_number', 'description'] }));

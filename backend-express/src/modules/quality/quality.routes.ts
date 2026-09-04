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
    const updated = await prisma.qa_inspection.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
qualityRouter.use('/quality-plans', createCrudRouter({ modelName: 'qa_quality_plan', searchFields: ['plan_name', 'plan_code'] }));
qualityRouter.use('/quality-plan-points', createCrudRouter({ modelName: 'qa_quality_plan_point' }));
qualityRouter.use('/inspections', createCrudRouter({ modelName: 'qa_inspection', searchFields: ['inspection_number'] }));
qualityRouter.use('/inspection-results', createCrudRouter({ modelName: 'qa_inspection_result' }));
qualityRouter.use('/nonconformances', createCrudRouter({ modelName: 'qa_nonconformance', searchFields: ['ncr_number', 'description'] }));
qualityRouter.use('/corrective-actions', createCrudRouter({ modelName: 'qa_corrective_action', searchFields: ['capa_number', 'description'] }));

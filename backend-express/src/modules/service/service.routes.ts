/**
 * File: backend-express/src/modules/service/service.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the service domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { queueWebhookEvent } from '../crm/crm-outbound-webhook.service';

export const serviceRouter = Router();

// Custom action: resolve case
/**
 * POST route handler: `/cases/:id/resolve`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `service_case` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
serviceRouter.post('/cases/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses service.');
    const record = await prisma.service_case.findFirst({ where: { id: req.params.id, company_id: req.companyId }, select: { id: true, tenant_id: true, company_id: true, subject: true, status: true } });
    if (!record) throw new NotFoundError('ServiceCase');
    const updated = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM service_case WHERE id = ${record.id} AND company_id = ${req.companyId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundError('ServiceCase');
      if (locked[0].status === 'RESOLVED') return tx.service_case.findUniqueOrThrow({ where: { id: record.id } });
      const resolvedAt = new Date();
      const row = await tx.service_case.update({
        where: { id: record.id },
        data: { status: 'RESOLVED', resolved_at: resolvedAt },
      });
      await queueWebhookEvent(tx, req.companyId!, 'ticket.resolved', {
        ticket_id: record.id, subject: record.subject, status: row.status,
        resolved_at: resolvedAt.toISOString(),
      });
      return row;
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
serviceRouter.use('/cases', createCrudRouter({ modelName: 'service_case', searchFields: ['case_number', 'subject', 'status'] }));
serviceRouter.use('/case-messages', createCrudRouter({ modelName: 'service_case_message', searchFields: ['message_text'] }));
serviceRouter.use('/case-approvals', createCrudRouter({ modelName: 'service_case_approval' }));
serviceRouter.use('/resolutions', createCrudRouter({ modelName: 'service_resolution', searchFields: ['resolution_summary'] }));

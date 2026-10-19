/**
 * File: backend-express/src/modules/service/service.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the service domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { queueWebhookEvent } from '../crm/crm-outbound-webhook.service';

export const serviceRouter = Router();

serviceRouter.post('/cases/:id/check-warranty', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum memeriksa garansi.');
    const record = await prisma.service_case.findFirst({
      where: { id: req.params.id, company_id: req.companyId },
      select: { id: true, tenant_id: true, customer_party_id: true, serial_number_id: true },
    });
    if (!record) throw new NotFoundError('ServiceCase');
    if (!record.serial_number_id) throw new ValidationError('Tiket belum memiliki nomor seri produk.');
    const deliveries = await prisma.$queryRaw<Array<{ delivery_id: string; delivery_date: Date | null; delivery_status: string; customer_party_id: string | null; product_id: string | null }>>`
      SELECT d.id AS delivery_id, d.delivery_date, d.delivery_status, so.customer_party_id, dl.product_id
      FROM sales_delivery_line dl
      JOIN sales_delivery d ON d.id = dl.delivery_id AND d.company_id = ${req.companyId}
      LEFT JOIN sales_order so ON so.id = d.sales_order_id AND so.company_id = d.company_id
      WHERE dl.serial_number_id = ${record.serial_number_id} AND dl.company_id = ${req.companyId}
        AND UPPER(d.delivery_status) IN ('DELIVERED', 'COMPLETED', 'POSTED')
      ORDER BY d.delivery_date DESC NULLS LAST, d.created_at DESC NULLS LAST
      LIMIT 1
    `;
    const delivery = deliveries[0];
    let warrantyStatus = 'WARRANTY_VOID';
    let warrantyExpiresAt: Date | null = null;
    let warrantyContractId: string | null = null;
    if (delivery && (!record.customer_party_id || record.customer_party_id === delivery.customer_party_id)) {
      const warranties = delivery.customer_party_id && delivery.product_id ? await prisma.$queryRaw<Array<{ id: string; end_date: Date | null }>>`
        SELECT c.id, c.end_date
        FROM sales_contract c
        JOIN sales_contract_line cl ON cl.contract_id = c.id AND cl.company_id = c.company_id
        WHERE c.company_id = ${req.companyId} AND c.customer_party_id = ${delivery.customer_party_id}
          AND cl.product_id = ${delivery.product_id} AND UPPER(c.contract_type) LIKE '%WARRANTY%'
          AND UPPER(c.status) = 'ACTIVE'
          AND (c.start_date IS NULL OR c.start_date <= NOW())
          AND (c.end_date IS NULL OR c.end_date >= NOW())
        ORDER BY c.end_date DESC NULLS LAST
        LIMIT 1
      ` : [];
      const warranty = warranties[0];
      if (warranty) {
        warrantyStatus = 'WARRANTY_ACTIVE';
        warrantyExpiresAt = warranty.end_date;
        warrantyContractId = warranty.id;
      } else warrantyStatus = 'WARRANTY_EXPIRED';
    }
    const checkedAt = new Date();
    const updated = await prisma.service_case.update({
      where: { id: record.id },
      data: { warranty_status: warrantyStatus, warranty_checked_at: checkedAt, warranty_expires_at: warrantyExpiresAt },
    });
    res.json({
      service_case_id: record.id, warranty_status: warrantyStatus,
      warranty_checked_at: checkedAt, warranty_expires_at: warrantyExpiresAt,
      delivery_id: delivery?.delivery_id ?? null, delivered_at: delivery?.delivery_date ?? null,
      warranty_contract_id: warrantyContractId, ticket_status: updated.status,
    });
  } catch (err) { next(err); }
});

serviceRouter.post('/cases/:id/work-orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId || !req.tenantId) throw new ForbiddenError('Pilih company sebelum membuat work order.');
    const serviceCase = await prisma.service_case.findFirst({
      where: { id: req.params.id, company_id: req.companyId },
      select: { id: true, warranty_status: true, warranty_expires_at: true, status: true },
    });
    if (!serviceCase) throw new NotFoundError('ServiceCase');
    if (serviceCase.warranty_status !== 'WARRANTY_ACTIVE' || (serviceCase.warranty_expires_at && serviceCase.warranty_expires_at < new Date())) {
      throw new ValidationError('Work order garansi hanya dapat dibuat setelah pemeriksaan menunjukkan WARRANTY_ACTIVE.');
    }
    if (serviceCase.status === 'RESOLVED' || serviceCase.status === 'CLOSED') throw new ValidationError('Tiket sudah selesai.');
    const assignedUserId = req.body.assigned_user_id ? String(req.body.assigned_user_id) : null;
    if (assignedUserId) {
      const assigned = await prisma.iam_user.findFirst({
        where: { id: assignedUserId, tenant_id: req.tenantId, status: 'ACTIVE', is_active: true }, select: { id: true },
      });
      const assignment = assigned ? await prisma.iam_user_role.findFirst({ where: { user_id: assigned.id, tenant_id: req.tenantId, company_id: req.companyId }, select: { id: true } }) : null;
      if (!assignment) throw new ValidationError('Teknisi harus user aktif pada company ini.');
    }
    const workOrder = await prisma.service_work_order.create({ data: {
      id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: req.companyId,
      service_case_id: serviceCase.id, assigned_user_id: assignedUserId,
      work_order_type: 'REPAIR', description: String(req.body.description ?? '').trim() || 'Pemeriksaan dan perbaikan unit garansi',
      status: assignedUserId ? 'ASSIGNED' : 'OPEN', created_by_id: req.user?.id,
    } });
    res.status(201).json(workOrder);
  } catch (err) { next(err); }
});

serviceRouter.post('/cases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId || !req.tenantId) throw new ForbiddenError('Pilih company sebelum membuat tiket.');
    const subject = String(req.body.subject ?? '').trim();
    if (!subject) throw new ValidationError('Subject tiket wajib diisi.');
    const serialValue = String(req.body.serial_number ?? '').trim();
    let serial = null;
    if (serialValue) {
      serial = await prisma.inv_serial_number.findFirst({ where: { serial_number: serialValue, company_id: req.companyId }, select: { id: true, product_id: true } });
      if (!serial) throw new ValidationError('Nomor seri tidak ditemukan pada company aktif.');
    }
    const caseRow = await prisma.service_case.create({ data: {
      id: crypto.randomUUID(), tenant_id: req.tenantId, company_id: req.companyId,
      created_by_id: req.user?.id, customer_party_id: req.body.customer_party ? String(req.body.customer_party) : null,
      product_id: serial?.product_id ?? null, serial_number_id: serial?.id ?? null,
      priority: String(req.body.priority ?? 'NORMAL').toUpperCase(), subject,
      description: String(req.body.description ?? ''), status: 'OPEN',
    } });
    res.status(201).json(caseRow);
  } catch (err) { next(err); }
});

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
      const previousStatus = locked[0].status;
      const resolvedAt = new Date();
      const row = await tx.service_case.update({
        where: { id: record.id },
        data: { status: 'RESOLVED', resolved_at: resolvedAt },
      });
      await queueWebhookEvent(tx, req.companyId!, 'ticket.status_updated', {
        ticket_id: record.id, subject: record.subject, previous_status: previousStatus,
        status: row.status, updated_at: resolvedAt.toISOString(),
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

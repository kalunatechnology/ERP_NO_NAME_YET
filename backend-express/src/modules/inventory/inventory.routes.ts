/**
 * File: backend-express/src/modules/inventory/inventory.routes.ts
 *
 * Purpose: Implements Express API routing responsibilities for the inventory domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../../config/database';
import { createCrudRouter } from '../../utils/crud-factory';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors';
import { postStockMove } from './stock-posting.service';

export const inventoryRouter = Router();

inventoryRouter.get('/internal-documents', async (req, res, next) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses dokumen internal.');
    const rows = await prisma.inv_internal_document.findMany({
      where: { company_id: req.companyId },
      orderBy: { created_at: 'desc' },
      take: 200,
      select: { id: true, title: true, category: true, description: true, file_name: true, mime_type: true, file_size: true, checksum: true, created_at: true, created_by_id: true },
    });
    res.json(rows);
  } catch (error) { next(error); }
});

inventoryRouter.post('/internal-documents', async (req, res, next) => {
  try {
    if (!req.companyId || !req.user?.id) throw new ForbiddenError('Pilih company dan user aktif sebelum mengunggah dokumen.');
    const { title, category, description, file_name, mime_type, content_base64 } = req.body ?? {};
    const safeName = typeof file_name === 'string' ? file_name.trim().replace(/[\\/\\r\\n\u0000]/g, '_') : '';
    const normalizedMime = typeof mime_type === 'string' ? mime_type.trim().toLowerCase() : '';
    const allowedMime = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/csv', 'text/plain', 'application/zip',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/wav', 'audio/ogg',
    ]);
    if (!safeName || safeName.length > 255 || !allowedMime.has(normalizedMime) || typeof content_base64 !== 'string' || !content_base64 || content_base64.length > 9_900_000) throw new ValidationError('File tidak valid. Format yang didukung: dokumen, spreadsheet, gambar, audio, video, dan ZIP; ukuran maksimum 7 MB.');
    const content = Buffer.from(content_base64, 'base64');
    if (!content.length || content.length > 7 * 1024 * 1024 || content.toString('base64') !== content_base64) throw new ValidationError('Konten file tidak valid atau ukuran melebihi 7 MB.');
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    if (!normalizedTitle || normalizedTitle.length > 200) throw new ValidationError('Judul dokumen wajib diisi dan maksimal 200 karakter.');
    const normalizedCategory = typeof category === 'string' ? category.trim().toUpperCase() : 'GENERAL';
    if (!normalizedCategory || normalizedCategory.length > 60) throw new ValidationError('Kategori dokumen tidak valid.');
    const saved = await prisma.inv_internal_document.create({ data: {
      id: crypto.randomUUID(), tenant_id: req.user.tenant_id, company_id: req.companyId, created_by_id: req.user.id,
      title: normalizedTitle, category: normalizedCategory,
      description: typeof description === 'string' ? description.trim().slice(0, 2000) : '',
      file_name: safeName, mime_type: normalizedMime, file_size: content.length,
      checksum: crypto.createHash('sha256').update(content).digest('hex'), content,
    }, select: { id: true, title: true, category: true, description: true, file_name: true, mime_type: true, file_size: true, checksum: true, created_at: true, created_by_id: true } });
    res.status(201).json(saved);
  } catch (error) { next(error); }
});

inventoryRouter.get('/internal-documents/:id/download', async (req, res, next) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses dokumen internal.');
    const document = await prisma.inv_internal_document.findFirst({ where: { id: req.params.id, company_id: req.companyId } });
    if (!document) throw new NotFoundError('Internal Document');
    const encodedName = encodeURIComponent(document.file_name).replace(/['()]/g, escape);
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Length', String(document.file_size));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(document.content));
  } catch (error) { next(error); }
});

async function assertDraftMove(req: Request, id: string) {
  const move = await prisma.inv_stock_move.findFirst({ where: { id, company_id: req.companyId } });
  if (!move || move.status === 'COMPLETED') throw new ValidationError('Movement tidak valid atau sudah diposting.');
}

// Custom action: complete stock-move
/**
 * POST route handler: `/stock-moves/:id/complete`.
 *
 * Contract: Receives the authenticated/scoped Express request according to the middleware mounted before this router, validates route-specific input, and writes the HTTP response.
 * Authorization: Inherits authentication, tenant, entitlement, RBAC, idempotency, and audit rules from `app.ts` plus any middleware passed to this registration.
 * Data/side effects: Uses Prisma model(s) `inv_stock_move` in the handler path.
 * Errors: Expected failures are forwarded to the global error middleware through `next` or the route's explicit error response.
 */
inventoryRouter.post('/stock-moves/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.companyId) throw new ForbiddenError('Pilih company sebelum mengakses inventory.');
    const updated = await postStockMove(req.params.id, req.companyId, req.user!.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// REST ViewSets
inventoryRouter.use('/stock-move-lines', createCrudRouter({ modelName: 'inv_stock_move_line',
  beforeCreate: async (req, data) => { await assertDraftMove(req, data.stock_move_id); return data; },
  beforeUpdate: async (req, data, existing) => { await assertDraftMove(req, existing.stock_move_id); if (data.stock_move_id) await assertDraftMove(req, data.stock_move_id); return data; },
  beforeDelete: async (req, existing) => { await assertDraftMove(req, existing.stock_move_id); },
}));
inventoryRouter.use('/stock-moves', createCrudRouter({ modelName: 'inv_stock_move', searchFields: ['movement_number', 'movement_type'] }));
inventoryRouter.use('/stock-movements', createCrudRouter({ modelName: 'inv_stock_move', searchFields: ['movement_number', 'movement_type'] }));
inventoryRouter.use('/stock-reservations', createCrudRouter({ modelName: 'inv_stock_reservation' }));
inventoryRouter.use('/reservations', createCrudRouter({ modelName: 'inv_stock_reservation' }));
inventoryRouter.use('/stock-ledgers', createCrudRouter({ modelName: 'inv_stock_ledger_entry', readOnly: true }));
inventoryRouter.use('/stock-balances', createCrudRouter({ modelName: 'inv_stock_balance', readOnly: true }));
inventoryRouter.use('/stock-counts', createCrudRouter({ modelName: 'inv_stock_count', searchFields: ['count_number'] }));
inventoryRouter.use('/stock-count-lines', createCrudRouter({ modelName: 'inv_stock_count_line' }));
inventoryRouter.use('/valuation-layers', createCrudRouter({ modelName: 'inv_valuation_layer', readOnly: true }));
inventoryRouter.use('/lots', createCrudRouter({ modelName: 'inv_lot', searchFields: ['lot_number'] }));
inventoryRouter.use('/serial-numbers', createCrudRouter({ modelName: 'inv_serial_number', searchFields: ['serial_number'] }));

/**
 * File: backend-express/src/middlewares/idempotency.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import prisma from '../config/database';
import { ConflictError, ValidationError } from '../utils/errors';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TRANSACTION_ROOTS = [
  '/crm', '/sales', '/projects', '/finance', '/procurement', '/inventory',
  '/manufacturing', '/quality', '/assets', '/service', '/logistics',
  '/implementation', '/requests', '/commands',
];

/**
 * wait implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * enforceTransactionIdempotency implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: Queries or records Prisma model(s) `core_idempotency_key`.
 */
export async function enforceTransactionIdempotency(req: Request, res: Response, next: NextFunction) {
  if (!MUTATIONS.has(req.method) || !TRANSACTION_ROOTS.some((root) => req.path === root || req.path.startsWith(`${root}/`))) {
    return next();
  }
  if (!req.user?.id) return next(new ValidationError('User transaksi tidak terdeteksi.'));

  const key = String(req.header('Idempotency-Key') ?? '').trim();
  if (!key || key.length < 16 || key.length > 128) {
    return next(new ValidationError('Idempotency-Key sepanjang 16-128 karakter wajib untuk setiap transaksi.'));
  }

  const requestPath = req.originalUrl.split('?')[0]!;
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');
  const identity = {
    user_id_method_request_path_idempotency_key: {
      user_id: req.user.id,
      method: req.method,
      request_path: requestPath,
      idempotency_key: key,
    },
  };

  let record: any;
  try {
    record = await prisma.core_idempotency_key.create({
      data: {
        user_id: req.user.id,
        tenant_id: req.user.tenant_id ?? null,
        company_id: req.companyId ?? null,
        idempotency_key: key,
        method: req.method,
        request_path: requestPath,
        request_hash: requestHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  } catch (error: any) {
    if (error?.code !== 'P2002') return next(error);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      record = await prisma.core_idempotency_key.findUnique({ where: identity });
      if (record?.state !== 'PROCESSING') break;
      await wait(100);
    }
    if (!record) return next(new ConflictError('Rekaman idempotency tidak dapat ditemukan.'));
    if (record.request_hash !== requestHash) {
      return next(new ConflictError('Idempotency-Key sudah digunakan untuk payload yang berbeda.'));
    }
    if (record.state === 'COMPLETED') {
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(record.response_status ?? 200).json(record.response_body);
    }
    return next(new ConflictError('Transaksi dengan Idempotency-Key ini masih diproses.'));
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    void prisma.core_idempotency_key.update({
      where: { id: record.id },
      data: {
        state: res.statusCode >= 500 ? 'FAILED' : 'COMPLETED',
        response_status: res.statusCode,
        response_body: body as any,
        completed_at: new Date(),
      },
    }).then(() => originalJson(body)).catch(next);
    return res;
  }) as Response['json'];
  return next();
}

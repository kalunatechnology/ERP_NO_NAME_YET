/**
 * File: backend-express/src/middlewares/audit.middleware.ts
 *
 * Purpose: Implements request middleware responsibilities for the platform domain.
 * Responsibility: Defines the executable contracts in this file and connects them to their callers without owning unrelated domain behavior.
 * Integration: Used through static imports, Express/Next framework discovery, or an explicit npm/script entry point as applicable.
 * Dependencies and side effects: See each documented function; database, browser storage, network, and response mutations are called out where present.
 */
import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { Prisma } from '@prisma/client';

const SKIP_PATHS = ['/api/v1/auth/token/', '/api/v1/auth/token/refresh/', '/api/v1/auth/signup/'];

/**
 * auditLog implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
export function auditLog(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (SKIP_PATHS.some((p) => req.path.startsWith(p))) return next();

  res.once('finish', () => {
    void writeAuditEvent(req, res.statusCode).catch((err) => {
      console.warn('[audit] Failed to write audit event:', err instanceof Error ? err.message : err);
    });
  });

  next();
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * toValidUuidOrNull implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
function toValidUuidOrNull(val: unknown): string | null {
  if (typeof val === 'string' && UUID_REGEX.test(val.trim())) {
    return val.trim();
  }
  return null;
}

/**
 * writeAuditEvent implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: May mutate request metadata or the response, as shown in the implementation.
 */
async function writeAuditEvent(req: Request, statusCode: number): Promise<void> {
  if (!req.user) return;

  const userId = toValidUuidOrNull(req.user.id);
  const companyId = toValidUuidOrNull(req.companyId);
  const tenantId = toValidUuidOrNull(req.tenantId ?? req.user.tenant_id);

  const paramId = req.params?.id;
  const entityId = toValidUuidOrNull(paramId);
  const sensitiveKeys = new Set(['password', 'password_hash', 'current_password', 'new_password', 'token', 'access', 'refresh', 'authorization', 'cookie']);
/**
 * sanitize implements a request-bound security or governance step.
 *
 * Input/output: Reads the Express request/response context, attaches only the identity/scope metadata declared in the implementation, then either calls `next` or rejects the request.
 * Security intent: The check runs before protected business handlers so unauthenticated, cross-company, unauthorized, or invalid requests cannot reach persistence mutations.
 * Data/side effects: Queries or records Prisma model(s) `core_audit_event`.
 */
  const sanitize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitiveKeys.has(key.toLowerCase()) ? '[REDACTED]' : sanitize(item),
      ]));
    }
    return value;
  };

  await prisma.core_audit_event.create({
    data: {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      company_id: companyId,
      event_type: `${req.method}_${statusCode}`,
      entity_name: req.originalUrl.slice(0, 100),
      entity_id: entityId,
      before_data: {},
      after_data: { request_id: req.requestId, request: sanitize(req.body ?? {}) } as Prisma.InputJsonValue,
      occurred_at: new Date(),
    },
  });
}

import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';

const SKIP_PATHS = ['/api/v1/auth/token/', '/api/v1/auth/token/refresh/', '/api/v1/auth/signup/'];

export function auditLog(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (SKIP_PATHS.some((p) => req.path.startsWith(p))) return next();

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const result = originalJson(body);

    void writeAuditEvent(req, res.statusCode).catch((err) => {
      console.warn('[audit] Failed to write audit event:', err);
    });

    return result;
  };

  next();
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toValidUuidOrNull(val: unknown): string | null {
  if (typeof val === 'string' && UUID_REGEX.test(val.trim())) {
    return val.trim();
  }
  return null;
}

async function writeAuditEvent(req: Request, statusCode: number): Promise<void> {
  if (!req.user) return;

  try {
    const userId = toValidUuidOrNull(req.user.id);
    const companyId = toValidUuidOrNull(req.companyId);
    const tenantId = toValidUuidOrNull(req.tenantId ?? (req.user as any)?.tenant_id);

    // Extract optional entity ID from route params if it's a valid UUID
    const paramId = req.params?.id;
    const entityId = toValidUuidOrNull(paramId);

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
        after_data: {},
        occurred_at: new Date(),
      },
    });
  } catch {
    // Ignore audit trail persistence errors silently
  }
}


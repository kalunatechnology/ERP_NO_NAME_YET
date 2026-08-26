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

async function writeAuditEvent(req: Request, statusCode: number): Promise<void> {
  if (!req.user) return;

  try {
    await prisma.core_audit_event.create({
      data: {
        id: crypto.randomUUID(),
        user_id: req.user.id,
        company_id: req.companyId ?? null,
        event_type: `${req.method}_${statusCode}`,
        entity_name: req.originalUrl.slice(0, 100),
        entity_id: 'SYSTEM',
        before_data: '{}',
        after_data: '{}',
        occurred_at: new Date(),
      },
    });
  } catch {
    // Ignore audit trail persistence errors
  }
}

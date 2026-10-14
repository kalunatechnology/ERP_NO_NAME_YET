import crypto from 'crypto';
import { Request, Response, Router, RequestHandler } from 'express';
import prisma from '../../config/database';

type PortalContext = { companyId: string; partyId: string; scopes: string[] };
type PortalRequest = Request & { portalContext?: PortalContext };

export const crmPortalRouter = Router();

function portalHandler(handler: (req: PortalRequest, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { void handler(req as PortalRequest, res).catch(next); };
}

crmPortalRouter.use(async (req: PortalRequest, res: Response, next) => {
  try {
    const auth = String(req.header('Authorization') ?? '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const apiKey = String(req.header('X-Api-Key') ?? '').trim();
    const token = bearer || apiKey;
    if (!token || token.length > 256) return res.status(401).json({ error: 'PORTAL_UNAUTHORIZED' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await prisma.core_portal_access_token.findUnique({ where: { token_hash: tokenHash } });
    if (!row || row.revoked_at || row.expires_at <= new Date()) return res.status(401).json({ error: 'PORTAL_UNAUTHORIZED' });
    req.portalContext = { companyId: row.company_id, partyId: row.party_id, scopes: row.scopes };
    void prisma.core_portal_access_token.updateMany({ where: { id: row.id, revoked_at: null }, data: { last_used_at: new Date() } }).catch(() => {});
    return next();
  } catch {
    return res.status(503).json({ error: 'PORTAL_UNAVAILABLE' });
  }
});

function requireScope(req: PortalRequest, res: Response, scope: string) {
  if (!req.portalContext?.scopes.includes(scope)) {
    res.status(403).json({ error: 'PORTAL_SCOPE_REQUIRED' });
    return false;
  }
  return true;
}

crmPortalRouter.get('/quotations/:id', portalHandler(async (req, res) => {
  if (!requireScope(req, res, 'quotation:read')) return;
  const context = req.portalContext!;
  const quotation = await prisma.sales_quotation.findFirst({
    where: { id: req.params.id, company_id: context.companyId, customer_party_id: context.partyId },
    select: { id: true, document_id: true, opportunity_id: true, valid_until: true, subtotal: true, tax_amount: true, total_amount: true, status: true, created_at: true },
  });
  if (!quotation) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json({ quotation });
}));

crmPortalRouter.get('/tickets/:id', portalHandler(async (req, res) => {
  if (!requireScope(req, res, 'ticket:read')) return;
  const context = req.portalContext!;
  const ticket = await prisma.service_case.findFirst({
    where: { id: req.params.id, company_id: context.companyId, customer_party_id: context.partyId },
    select: { id: true, subject: true, priority: true, status: true, warranty_status: true, warranty_expires_at: true, created_at: true, updated_at: true, resolved_at: true },
  });
  if (!ticket) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json({ ticket });
}));

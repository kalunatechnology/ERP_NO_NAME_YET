import crypto from 'crypto';
import { Router } from 'express';
import { env } from '../../config/env';
import { processCrmIntegrationBatch } from './crm-integration-worker.service';

export const crmIntegrationWorkerRouter = Router();

crmIntegrationWorkerRouter.post('/run', async (req, res) => {
  const configured = env.CRM_INTEGRATION_WORKER_SECRET;
  const authorization = String(req.header('Authorization') ?? '');
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!configured || configured.length < 32 || supplied.length !== configured.length || !crypto.timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))) {
    return res.status(401).json({ error: 'UNAUTHORIZED_WORKER' });
  }
  try {
    const requestedLimit = Number(req.body?.limit ?? 20);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50) : 20;
    return res.json(await processCrmIntegrationBatch(`external-worker-${process.pid}`, limit));
  } catch (error) {
    console.error('CRM integration worker invocation failed:', error instanceof Error ? error.name : 'unknown');
    return res.status(503).json({ error: 'WORKER_BATCH_FAILED' });
  }
});

import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../../../../config/env';
import { KnowledgeQueueService } from '../queue/queue.service';
import { WorkerRegistry } from '../queue/worker-registry';
import { SnapshotManager } from '../publishing/snapshot-manager';
import { ResourceManagerService } from '../manager/resource-manager.service';
import { WebhookTriggerService } from '../scheduler/webhook-trigger.service';

export const knowledgeEngineInternalRouter = Router();

// Middleware: Authenticate internal requests via MARBOT_KE_WORKER_SECRET
knowledgeEngineInternalRouter.use((req, res, next) => {
  const configured = env.MARBOT_KE_WORKER_SECRET;
  const authorization = String(req.header('Authorization') ?? '');
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : String(req.header('X-Knowledge-Engine-Secret') ?? '');

  if (
    !configured ||
    configured.length < 16 ||
    supplied.length !== configured.length ||
    !crypto.timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))
  ) {
    res.status(401).json({ error: 'UNAUTHORIZED_KNOWLEDGE_ENGINE_CLIENT' });
    return;
  }

  next();
});

// Trigger post-deployment sync
knowledgeEngineInternalRouter.post('/deploy-sync', async (req, res) => {
  try {
    const commitSha = req.body?.commitSha ? String(req.body.commitSha) : undefined;
    const runSynchronously = req.body?.sync === true;

    const result = await WebhookTriggerService.handleDeploySync({
      commitSha,
      runSynchronously,
    });

    return res.json({ success: true, result });
  } catch (error) {
    console.error('Deploy sync failed:', error);
    return res.status(500).json({
      error: 'DEPLOY_SYNC_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Execute a batch of queued jobs manually
knowledgeEngineInternalRouter.post('/run-batch', async (req, res) => {
  try {
    const requestedLimit = Number(req.body?.limit ?? 5);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 20)
      : 5;

    const workerId = `external-ke-worker-${process.pid}`;
    const result = await WorkerRegistry.processBatch(workerId, limit);

    return res.json({ success: true, result });
  } catch (error) {
    console.error('Batch run failed:', error);
    return res.status(503).json({ error: 'WORKER_BATCH_FAILED' });
  }
});

// Instant rollback to previous superseded snapshot
knowledgeEngineInternalRouter.post('/rollback', async (req, res) => {
  try {
    const targetSnapshotId = req.body?.snapshotId ? String(req.body.snapshotId) : undefined;
    const activeId = await SnapshotManager.rollback(targetSnapshotId);
    return res.json({ success: true, rolledBackToSnapshotId: activeId });
  } catch (error) {
    console.error('Snapshot rollback failed:', error);
    return res.status(500).json({
      error: 'ROLLBACK_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Health and monitoring status
knowledgeEngineInternalRouter.get('/status', async (_req, res) => {
  try {
    const [queueStats, activeSnapshot] = await Promise.all([
      KnowledgeQueueService.getQueueStats(),
      SnapshotManager.getActiveSnapshot(),
    ]);

    const resourceMetrics = ResourceManagerService.getMetrics();

    return res.json({
      enabled: env.MARBOT_KE_ENABLED,
      mode: env.MARBOT_KE_MODE,
      queueStats,
      resourceMetrics,
      activeSnapshot: activeSnapshot
        ? {
            id: activeSnapshot.id,
            versionNumber: activeSnapshot.version_number,
            commitSha: activeSnapshot.commit_sha,
            deploymentTarget: activeSnapshot.deployment_target,
            status: activeSnapshot.status,
            publishedAt: activeSnapshot.published_at,
            totalEntries: activeSnapshot.entries?.length ?? 0,
          }
        : null,
    });
  } catch (error) {
    console.error('Status query failed:', error);
    return res.status(500).json({ error: 'STATUS_QUERY_FAILED' });
  }
});

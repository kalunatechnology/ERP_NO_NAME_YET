import prisma from '../../../../config/database';
import type { KnowledgeEntry } from '../contracts/knowledge.schema';
import { RetrievalGatewayService } from '../gateway/retrieval-gateway.service';

export interface CreateSnapshotParams {
  versionNumber: string;
  commitSha: string;
  runtimeConfigHash: string;
  deploymentTarget?: string;
  entries: KnowledgeEntry[];
  metrics?: Record<string, unknown>;
}

export class SnapshotManager {
  /**
   * Creates a new STAGING snapshot and persists its entries.
   */
  static async createStagingSnapshot(params: CreateSnapshotParams): Promise<string> {
    const deploymentTarget = params.deploymentTarget || 'production';

    const snapshot = await prisma.marbot_knowledge_snapshot.create({
      data: {
        version_number: params.versionNumber,
        commit_sha: params.commitSha,
        deployment_target: deploymentTarget,
        runtime_config_hash: params.runtimeConfigHash,
        status: 'STAGING',
        metrics_json: params.metrics ? JSON.stringify(params.metrics) : null,
      },
    });

    const snapshotId = snapshot.id;

    // Batch insert unique entries
    const seenFeatureIds = new Set<string>();
    const uniqueEntries = params.entries.filter((entry) => {
      if (seenFeatureIds.has(entry.feature_id)) return false;
      seenFeatureIds.add(entry.feature_id);
      return true;
    });

    const batchSize = 100;
    for (let i = 0; i < uniqueEntries.length; i += batchSize) {
      const batch = uniqueEntries.slice(i, i + batchSize);
      await (prisma as any).marbot_knowledge_entry.createMany({
        data: batch.map((entry) => ({
          snapshot_id: snapshotId,
          feature_id: entry.feature_id,
          topic: entry.topic,
          operation: entry.operation ?? null,
          module_code: entry.module_code,
          title: entry.title,
          knowledge_category: entry.knowledge_category,
          lifecycle_status: entry.lifecycle_status,
          comparison_status: entry.comparison_status,
          source_priority: entry.source_priority,
          actor_policy_json: entry.actor_policy
            ? JSON.stringify(entry.actor_policy)
            : null,
          workflow_json: entry.workflow ? JSON.stringify(entry.workflow) : null,
          navigation_json: entry.navigation
            ? JSON.stringify(entry.navigation)
            : null,
          content_json: JSON.stringify(entry.content),
          confidence_score: entry.confidence_score,
          review_required: entry.review_required,
          provenance_json: entry.provenance
            ? JSON.stringify(entry.provenance)
            : null,
        })),
        skipDuplicates: true,
      });
    }

    return snapshotId;
  }

  /**
   * Promotes a STAGING snapshot to ACTIVE atomically using a transaction.
   */
  static async activateSnapshot(snapshotId: string): Promise<void> {
    await prisma.$transaction([
      // 1. Demote currently active snapshots to SUPERSEDED
      prisma.marbot_knowledge_snapshot.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
      }),
      // 2. Promote target snapshot to ACTIVE
      prisma.marbot_knowledge_snapshot.update({
        where: { id: snapshotId },
        data: {
          status: 'ACTIVE',
          published_at: new Date(),
        },
      }),
    ]);

    // Invalidate memory cache so queries immediately see the new active snapshot
    RetrievalGatewayService.invalidateCache();
  }

  /**
   * Rolls back the currently active snapshot to a previous superseded snapshot.
   */
  static async rollback(targetSnapshotId?: string): Promise<string> {
    let rollbackTargetId = targetSnapshotId;

    if (!rollbackTargetId) {
      const previous = await prisma.marbot_knowledge_snapshot.findFirst({
        where: { status: 'SUPERSEDED' },
        orderBy: { published_at: 'desc' },
      });
      if (!previous) {
        throw new Error('NO_PREVIOUS_SNAPSHOT_AVAILABLE_FOR_ROLLBACK');
      }
      rollbackTargetId = previous.id;
    }

    await prisma.$transaction([
      prisma.marbot_knowledge_snapshot.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'ROLLED_BACK' },
      }),
      prisma.marbot_knowledge_snapshot.update({
        where: { id: rollbackTargetId },
        data: {
          status: 'ACTIVE',
          published_at: new Date(),
        },
      }),
    ]);

    RetrievalGatewayService.invalidateCache();
    return rollbackTargetId;
  }

  /**
   * Retrieves the currently active snapshot with all its entries.
   */
  static async getActiveSnapshot() {
    return prisma.marbot_knowledge_snapshot.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        entries: true,
      },
    });
  }
}

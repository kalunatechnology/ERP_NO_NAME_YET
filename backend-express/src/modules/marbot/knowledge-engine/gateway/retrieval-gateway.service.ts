import prisma from '../../../../config/database';
import type { ProcedureTopic, ProcedureOperation } from '../../../marbot/brain/reasoning/intent';
import type { ProcedureRule, HelpContext } from '../../../marbot/knowledge/schemas/procedure.schema';
import type { ModuleKnowledge } from '../../../marbot/knowledge/schemas/module.schema';
import { findProcedureRule, allModules } from '../../../marbot/knowledge/knowledge.registry';
import { checkAbstention, type AbstentionResult } from './abstention-guard';

interface ActiveSnapshotCache {
  snapshot: {
    id: string;
    version_number: string;
    commit_sha: string;
    published_at: Date | null;
  } | null;
  cachedAt: number;
}

let snapshotCache: ActiveSnapshotCache | null = null;
const CACHE_TTL_MS = 30_000;

export class RetrievalGatewayService {
  /**
   * Retrieves the currently published active knowledge snapshot from DB or cache.
   */
  static async getActiveSnapshot() {
    const now = Date.now();
    if (snapshotCache && now - snapshotCache.cachedAt < CACHE_TTL_MS) {
      return snapshotCache.snapshot;
    }

    try {
      const active = await (prisma as any).marbot_knowledge_snapshot.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { published_at: 'desc' },
        select: {
          id: true,
          version_number: true,
          commit_sha: true,
          published_at: true,
        },
      });
      snapshotCache = { snapshot: active ?? null, cachedAt: now };
      return snapshotCache.snapshot;
    } catch {
      // Fallback if table does not exist or database is offline
      snapshotCache = { snapshot: null, cachedAt: now };
      return null;
    }
  }

  /**
   * Invalidate the in-memory active snapshot cache (e.g. after publishing a new snapshot).
   */
  static invalidateCache() {
    snapshotCache = null;
  }

  /**
   * Resolves the authoritative ProcedureRule for a given topic and operation.
   * Checks the dynamic DB snapshot first; if not found, falls back to the baseline verified catalogue.
   */
  static async resolveProcedureRule(
    topic: ProcedureTopic,
    operation?: ProcedureOperation
  ): Promise<ProcedureRule | undefined> {
    const activeSnapshot = await this.getActiveSnapshot();

    if (activeSnapshot) {
      try {
        const entry = await (prisma as any).marbot_knowledge_entry.findFirst({
          where: {
            snapshot_id: activeSnapshot.id,
            topic,
            ...(operation ? { operation } : {}),
            lifecycle_status: { in: ['ACTIVE', 'QUARANTINED', 'RETIRED'] },
          },
        });

        if (entry) {
          const content = JSON.parse(entry.content_json || '{}');
          const actorPolicy = entry.actor_policy_json ? JSON.parse(entry.actor_policy_json) : undefined;
          const provenance = entry.provenance_json ? JSON.parse(entry.provenance_json) : undefined;

          return {
            id: entry.feature_id,
            topic: entry.topic as ProcedureTopic,
            operation: entry.operation as ProcedureOperation | undefined,
            title: entry.title,
            targetPath: entry.navigation_json ? JSON.parse(entry.navigation_json)?.targetPath : undefined,
            version: activeSnapshot.version_number,
            lifecycleStatus: entry.lifecycle_status as any,
            comparisonStatus: entry.comparison_status as any,
            sourcePriority: entry.source_priority as any,
            authorization: actorPolicy,
            provenance: {
              snapshotId: activeSnapshot.id,
              commitSha: activeSnapshot.commit_sha,
              verifiedAt: activeSnapshot.published_at?.toISOString() ?? new Date().toISOString(),
              astNodeHashes: provenance?.astNodeHashes ?? [],
              sourceFiles: provenance?.sourceFiles ?? [],
              sourcePriority: entry.source_priority as any,
              sourceType: provenance?.sourceType ?? 'BACKEND_ROUTE',
            },
            content: {
              summary: content.summary,
              steps: content.steps,
              importantNotes: content.importantNotes,
              body: content.body,
            },
          };
        }
      } catch {
        // Fallback to static baseline on DB query error
      }
    }

    // Baseline fallback
    return findProcedureRule(topic, operation);
  }

  /**
   * Resolves active modules, applying active snapshot overrides if available.
   */
  static async resolveModules(enabledModules: string[]): Promise<readonly ModuleKnowledge[]> {
    return allModules.filter((item) => enabledModules.includes(item.module));
  }

  /**
   * Evaluates if a given rule triggers an abstention guard.
   */
  static evaluateAbstention(
    rule: ProcedureRule,
    topicName: string,
    operation?: ProcedureOperation
  ): AbstentionResult {
    return checkAbstention(rule, topicName, operation);
  }

  /**
   * Retrieves active provenance metadata string for orchestrator citations.
   */
  static async getActiveProvenanceString(
    topic: string,
    operation?: string
  ): Promise<string> {
    const active = await this.getActiveSnapshot();
    if (active) {
      return `ERP:procedure:${topic}:${operation ?? 'overview'}:v${active.version_number}:${active.commit_sha.slice(0, 7)}`;
    }
    return `ERP:procedure:${topic}:${operation ?? 'overview'}:2026-10-07`;
  }
}

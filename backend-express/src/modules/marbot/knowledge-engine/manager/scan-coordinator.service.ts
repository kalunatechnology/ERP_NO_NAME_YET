import type { KnowledgeEntry } from '../contracts/knowledge.schema';
import { RepositoryCrawler, type CrawlOptions } from '../crawler/repository-crawler';
import { FeatureAnalyzer } from '../minillm/feature-analyzer';
import { KnowledgeComparator } from '../minillm/knowledge-comparator';
import { SnapshotManager } from '../publishing/snapshot-manager';
import { IndexPublisher, type PublishPipelineResult } from '../publishing/index-publisher';
import { ResourceManagerService } from './resource-manager.service';

export interface ScanOptions extends CrawlOptions {
  versionNumber?: string;
  modeOverride?: 'observation' | 'auto_tier1' | 'auto_tier2';
}

export interface ScanCoordinatorResult {
  commitSha: string;
  totalEvidences: number;
  totalEntries: number;
  publishResult: PublishPipelineResult;
}

export class ScanCoordinatorService {
  /**
   * Coordinates the full MKIE scan lifecycle from crawl to verification and publishing.
   */
  static async runScan(options: ScanOptions = {}): Promise<ScanCoordinatorResult> {
    // 1. Check system resource health
    await ResourceManagerService.checkThrottle();

    // 2. Perform Crawl over codebase
    const crawlResult = await RepositoryCrawler.crawl({
      ...options,
      persistToDb: true,
    });

    // 3. Retrieve currently active snapshot to compare against
    const activeSnapshot = await SnapshotManager.getActiveSnapshot();
    const existingMap = new Map<string, KnowledgeEntry>();

    if (activeSnapshot && activeSnapshot.entries) {
      for (const entry of activeSnapshot.entries) {
        existingMap.set(entry.feature_id, {
          feature_id: entry.feature_id,
          topic: entry.topic,
          operation: entry.operation,
          module_code: entry.module_code,
          title: entry.title,
          knowledge_category: entry.knowledge_category as any,
          lifecycle_status: entry.lifecycle_status as any,
          comparison_status: entry.comparison_status as any,
          source_priority: entry.source_priority as any,
          actor_policy: entry.actor_policy_json
            ? JSON.parse(entry.actor_policy_json)
            : undefined,
          workflow: entry.workflow_json ? JSON.parse(entry.workflow_json) : undefined,
          navigation: entry.navigation_json
            ? JSON.parse(entry.navigation_json)
            : undefined,
          content: JSON.parse(entry.content_json),
          confidence_score: entry.confidence_score,
          review_required: entry.review_required,
          provenance: entry.provenance_json
            ? JSON.parse(entry.provenance_json)
            : undefined,
        });
      }
    }

    // 4. Generate candidate entries from route, tab, UI, and database model evidences
    const candidatesMap = new Map<string, KnowledgeEntry>();
    const targetEvidences = crawlResult.evidences.filter(
      (ev) =>
        ev.source_type === 'BACKEND_ROUTE' ||
        ev.source_type === 'PRISMA_MODEL' ||
        ev.feature_id.startsWith('frontend.tab.') ||
        ev.feature_id.startsWith('frontend.view.')
    );

    for (const ev of targetEvidences) {
      if (candidatesMap.has(ev.feature_id)) continue;
      const chain = crawlResult.graph.traceFullChain(ev.feature_id);
      const related = chain
        ? [...chain.apiRoutes, ...chain.prismaModels]
        : crawlResult.graph.findRoutesForPage(ev.feature_id);
      const candidate = await FeatureAnalyzer.analyze(ev, related);

      // Compare with previous active version
      const existing = existingMap.get(candidate.feature_id);
      const comparison = KnowledgeComparator.compare(candidate, existing);
      candidate.comparison_status = comparison.status;

      candidatesMap.set(candidate.feature_id, candidate);
    }

    const candidates = Array.from(candidatesMap.values());

    // 5. Run Verification & Publishing Engine
    const publishResult = await IndexPublisher.publishPipeline(
      candidates,
      crawlResult.evidences,
      {
        versionNumber: options.versionNumber,
        commitSha: crawlResult.commitSha,
        runtimeConfigHash: crawlResult.runtimeFacts.runtimeHash,
        modeOverride: options.modeOverride,
        previousActiveEntries: Array.from(existingMap.values()),
      }
    );

    return {
      commitSha: crawlResult.commitSha,
      totalEvidences: crawlResult.totalEvidences,
      totalEntries: candidates.length,
      publishResult,
    };
  }
}

import { env } from '../../../../config/env';
import type { Evidence } from '../contracts/evidence.schema';
import type { KnowledgeEntry } from '../contracts/knowledge.schema';
import { EvidenceValidator } from '../verification/evidence-validator';
import { PolicyVerifier } from '../verification/policy-verifier';
import {
  ConfidenceEvaluator,
  type ConfidenceEvaluation,
} from '../verification/confidence-evaluator';
import { RegressionChecker } from '../verification/regression-checker';
import { LifecycleManager } from './lifecycle-manager';
import { SnapshotManager } from './snapshot-manager';

export interface PublishPipelineOptions {
  versionNumber?: string;
  commitSha: string;
  runtimeConfigHash: string;
  deploymentTarget?: string;
  modeOverride?: 'observation' | 'auto_tier1' | 'auto_tier2';
  previousActiveEntries?: KnowledgeEntry[];
}

export interface PublishPipelineResult {
  snapshotId: string;
  status: 'STAGING' | 'ACTIVE';
  totalEntries: number;
  activeEntriesCount: number;
  quarantinedCount: number;
  staleCount: number;
  regressionPassed: boolean;
  regressionFailures: string[];
  regressionWarnings: string[];
  issuesCount: number;
}

export class IndexPublisher {
  /**
   * Runs the complete verification, lifecycle assignment, staging, and conditional publishing pipeline.
   */
  static async publishPipeline(
    rawEntries: KnowledgeEntry[],
    evidences: Evidence[],
    options: PublishPipelineOptions
  ): Promise<PublishPipelineResult> {
    const mode = options.modeOverride || env.MARBOT_KE_MODE;
    const versionNumber =
      options.versionNumber ||
      `v${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

    // 1. Evidence and Policy Verification per entry
    const evaluations = new Map<string, ConfidenceEvaluation>();
    let totalIssues = 0;

    for (const entry of rawEntries) {
      const validation = EvidenceValidator.validate(entry, evidences);
      const policyVerification = PolicyVerifier.verify(
        entry.actor_policy,
        evidences
      );
      const evaluation = ConfidenceEvaluator.evaluate(
        entry,
        validation,
        policyVerification
      );

      evaluations.set(entry.feature_id, evaluation);
      totalIssues += validation.issues.length + policyVerification.conflicts.length;
    }

    // 2. Assign Lifecycle statuses
    const finalizedEntries = LifecycleManager.applyDecisions(rawEntries, evaluations);

    // 3. Regression Check
    const regressionResult = RegressionChecker.check(finalizedEntries, options.previousActiveEntries ?? []);

    // 4. Create STAGING Snapshot
    const activeCount = finalizedEntries.filter(
      (e) => e.lifecycle_status === 'ACTIVE'
    ).length;
    const quarantinedCount = finalizedEntries.filter(
      (e) => e.lifecycle_status === 'QUARANTINED'
    ).length;
    const staleCount = finalizedEntries.filter(
      (e) => e.lifecycle_status === 'STALE'
    ).length;

    const metrics = {
      mode,
      totalEntries: finalizedEntries.length,
      activeCount,
      quarantinedCount,
      staleCount,
      issuesCount: totalIssues,
      regressionPassed: regressionResult.passed,
      regressionFailures: regressionResult.failures,
      regressionWarnings: regressionResult.warnings,
    };

    const snapshotId = await SnapshotManager.createStagingSnapshot({
      versionNumber,
      commitSha: options.commitSha,
      runtimeConfigHash: options.runtimeConfigHash,
      deploymentTarget: options.deploymentTarget || env.DEPLOYMENT_TARGET,
      entries: finalizedEntries,
      metrics,
    });

    let finalStatus: 'STAGING' | 'ACTIVE' = 'STAGING';

    // 5. Automated Promotion (if not in observation mode and regression passed)
    if (
      mode !== 'observation' &&
      regressionResult.passed &&
      activeCount > 0
    ) {
      await SnapshotManager.activateSnapshot(snapshotId);
      finalStatus = 'ACTIVE';
    }

    return {
      snapshotId,
      status: finalStatus,
      totalEntries: finalizedEntries.length,
      activeEntriesCount: activeCount,
      quarantinedCount,
      staleCount,
      regressionPassed: regressionResult.passed,
      regressionFailures: regressionResult.failures,
      regressionWarnings: regressionResult.warnings,
      issuesCount: totalIssues,
    };
  }
}

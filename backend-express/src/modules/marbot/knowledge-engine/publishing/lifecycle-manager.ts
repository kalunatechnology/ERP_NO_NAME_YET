import type {
  KnowledgeEntry,
  LifecycleStatus,
  ComparisonStatus,
} from '../contracts/knowledge.schema';
import type { ConfidenceEvaluation } from '../verification/confidence-evaluator';

export type PromotionTier = 'TIER_1_AUTO' | 'TIER_2_AUTO_TESTED' | 'TIER_3_MANUAL';

export interface LifecycleDecision {
  featureId: string;
  lifecycleStatus: LifecycleStatus;
  promotionTier: PromotionTier;
  reason: string;
}

export class LifecycleManager {
  /**
   * Determines the lifecycle status and promotion tier for a knowledge entry.
   */
  static evaluateLifecycle(
    entry: KnowledgeEntry,
    evaluation: ConfidenceEvaluation,
    comparisonStatus: ComparisonStatus
  ): LifecycleDecision {
    // 1. Conflict or Quarantine conditions
    if (comparisonStatus === 'CONFLICT' || evaluation.reviewRequired || evaluation.score < 0.6) {
      return {
        featureId: entry.feature_id,
        lifecycleStatus: 'QUARANTINED',
        promotionTier: 'TIER_3_MANUAL',
        reason:
          comparisonStatus === 'CONFLICT'
            ? 'Rule or authorization conflict detected.'
            : 'Confidence score is below threshold or review was flagged.',
      };
    }

    // 2. Unverified conditions
    if (comparisonStatus === 'UNVERIFIED') {
      return {
        featureId: entry.feature_id,
        lifecycleStatus: 'STALE',
        promotionTier: 'TIER_3_MANUAL',
        reason: 'Feature could not be verified against active source code.',
      };
    }

    // 3. Test-verified high confidence (Tier 2 auto)
    if (evaluation.recommendedPriority === 'TEST_VERIFIED') {
      return {
        featureId: entry.feature_id,
        lifecycleStatus: 'ACTIVE',
        promotionTier: 'TIER_2_AUTO_TESTED',
        reason: 'Automated test verified with high confidence.',
      };
    }

    // 4. Code fact verified (Tier 1 auto)
    if (evaluation.score >= 0.8) {
      return {
        featureId: entry.feature_id,
        lifecycleStatus: 'ACTIVE',
        promotionTier: 'TIER_1_AUTO',
        reason: 'Verified against code AST without drift.',
      };
    }

    // Fallback to STALE or Tier 3
    return {
      featureId: entry.feature_id,
      lifecycleStatus: 'STALE',
      promotionTier: 'TIER_3_MANUAL',
      reason: 'Moderate confidence score, staged for observation or manual approval.',
    };
  }

  /**
   * Applies lifecycle decisions to a list of knowledge entries.
   */
  static applyDecisions(
    entries: KnowledgeEntry[],
    evaluations: Map<string, ConfidenceEvaluation>
  ): KnowledgeEntry[] {
    return entries.map((entry) => {
      const evalResult = evaluations.get(entry.feature_id) || {
        score: entry.confidence_score,
        reviewRequired: entry.review_required,
        recommendedPriority: entry.source_priority,
        scoreBreakdown: {},
      };

      const decision = this.evaluateLifecycle(
        entry,
        evalResult,
        entry.comparison_status
      );

      return {
        ...entry,
        lifecycle_status: decision.lifecycleStatus,
        confidence_score: evalResult.score,
        review_required: decision.promotionTier === 'TIER_3_MANUAL',
        source_priority: evalResult.recommendedPriority,
      };
    });
  }
}

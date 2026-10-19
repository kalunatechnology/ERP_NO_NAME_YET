import type { KnowledgeEntry, SourcePriority } from '../contracts/knowledge.schema';
import type { ValidationResult } from './evidence-validator';
import type { PolicyVerificationResult } from './policy-verifier';

export interface ConfidenceEvaluation {
  score: number;
  reviewRequired: boolean;
  recommendedPriority: SourcePriority;
  scoreBreakdown: Record<string, number>;
}

export class ConfidenceEvaluator {
  /**
   * Computes multi-indicator confidence score and evaluates if human review is required.
   */
  static evaluate(
    entry: KnowledgeEntry,
    validation: ValidationResult,
    policyVerification: PolicyVerificationResult
  ): ConfidenceEvaluation {
    const breakdown: Record<string, number> = {};
    let score = 0.3; // Base score
    breakdown['base'] = 0.3;

    // 1. Evidence existence
    if (validation.isValid && validation.matchedEvidences.length > 0) {
      score += 0.3;
      breakdown['evidence_present'] = 0.3;
    } else {
      score -= 0.3;
      breakdown['missing_evidence'] = -0.3;
    }

    // 2. AST Drift penalty
    const hasDrift = validation.issues.some((i) => i.code === 'AST_DRIFT');
    if (hasDrift) {
      score -= 0.2;
      breakdown['ast_drift_penalty'] = -0.2;
    }

    // 3. Policy consistency
    if (policyVerification.isConsistent) {
      score += 0.2;
      breakdown['policy_consistent'] = 0.2;
    } else {
      score -= 0.3;
      breakdown['policy_conflict_penalty'] = -0.3;
    }

    // 4. Test Verification
    const hasTestEvidence = validation.matchedEvidences.some(
      (ev) => ev.source_type === 'TEST_RECORD'
    );
    if (hasTestEvidence) {
      score += 0.2;
      breakdown['test_verified_bonus'] = 0.2;
    }

    // Clamp score between 0.0 and 1.0, rounded to 2 decimal places
    const clampedScore = Math.max(0.0, Math.min(1.0, Math.round(score * 100) / 100));

    // Determine recommended priority
    let recommendedPriority: SourcePriority = 'CODE_FACT';
    if (hasTestEvidence) {
      recommendedPriority = 'TEST_VERIFIED';
    } else if (clampedScore < 0.6) {
      recommendedPriority = 'AI_INFERENCE';
    }

    const reviewRequired =
      clampedScore < 0.8 ||
      !validation.isValid ||
      policyVerification.conflicts.length > 0;

    return {
      score: clampedScore,
      reviewRequired,
      recommendedPriority,
      scoreBreakdown: breakdown,
    };
  }
}

import type { KnowledgeEntry } from '../contracts/knowledge.schema';

export interface RegressionCheckResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

export class RegressionChecker {
  /**
   * Evaluates proposed entries against regression criteria and historical baseline.
   */
  static check(
    proposedEntries: KnowledgeEntry[],
    previousActiveEntries: KnowledgeEntry[] = []
  ): RegressionCheckResult {
    const failures: string[] = [];
    const warnings: string[] = [];

    // 1. Sanity check: Non-empty proposed dataset
    if (proposedEntries.length === 0) {
      failures.push('Regression check failed: Proposed knowledge set is completely empty.');
      return { passed: false, failures, warnings };
    }

    // 2. Validate mandatory content integrity
    for (const entry of proposedEntries) {
      if (!entry.title || entry.title.trim().length === 0) {
        failures.push(`Entry "${entry.feature_id}" has an empty title.`);
      }
      if (
        entry.knowledge_category === 'USER_PROCEDURE' &&
        (!entry.content.steps || entry.content.steps.length === 0) &&
        !entry.content.body
      ) {
        warnings.push(
          `Procedure entry "${entry.feature_id}" does not declare any actionable steps or body text.`
        );
      }
    }

    // 3. Compare against previous active entries to prevent silent regression
    if (previousActiveEntries.length > 0) {
      const proposedMap = new Map(proposedEntries.map((e) => [e.feature_id, e]));

      for (const prev of previousActiveEntries) {
        const current = proposedMap.get(prev.feature_id);

        if (!current) {
          // Feature disappeared without being marked RETIRED
          warnings.push(
            `Previously active feature "${prev.feature_id}" (${prev.title}) is missing in the new snapshot without explicit retirement.`
          );
        } else if (
          prev.lifecycle_status === 'ACTIVE' &&
          current.lifecycle_status === 'QUARANTINED'
        ) {
          warnings.push(
            `Feature "${prev.feature_id}" was previously ACTIVE but has been demoted to QUARANTINED.`
          );
        }
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      warnings,
    };
  }
}

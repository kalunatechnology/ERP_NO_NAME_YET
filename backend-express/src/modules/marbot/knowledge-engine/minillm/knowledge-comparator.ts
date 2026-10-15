import type {
  KnowledgeEntry,
  ComparisonStatus,
} from '../contracts/knowledge.schema';

export interface ComparisonResult {
  status: ComparisonStatus;
  reason: string;
}

export class KnowledgeComparator {
  /**
   * Compares a candidate entry against an existing active entry.
   */
  static compare(
    candidate: KnowledgeEntry,
    existing?: KnowledgeEntry
  ): ComparisonResult {
    if (!existing) {
      return {
        status: 'NEW',
        reason: 'Feature was not present in the active knowledge baseline.',
      };
    }

    // 1. Check for policy conflict
    const candidateRoles = candidate.actor_policy?.allowedRoles || [];
    const existingRoles = existing.actor_policy?.allowedRoles || [];

    const hasNewRestrictions = existingRoles.some((r) => !candidateRoles.includes(r));
    const hasUncheckedExpansion = candidateRoles.some((r) => !existingRoles.includes(r));

    if (hasNewRestrictions && hasUncheckedExpansion) {
      return {
        status: 'CONFLICT',
        reason: 'Role authorization policy has divergent changes requiring verification.',
      };
    }

    // 2. Check AST Hash equality
    const candidateHashes = candidate.provenance?.astNodeHashes || [];
    const existingHashes = existing.provenance?.astNodeHashes || [];

    const hashesMatch =
      candidateHashes.length > 0 &&
      candidateHashes.every((h) => existingHashes.includes(h));

    if (hashesMatch) {
      return {
        status: 'UNCHANGED',
        reason: 'AST hashes and implementation details are identical.',
      };
    }

    return {
      status: 'UPDATED',
      reason: 'Implementation code or structure has changed since last snapshot.',
    };
  }
}

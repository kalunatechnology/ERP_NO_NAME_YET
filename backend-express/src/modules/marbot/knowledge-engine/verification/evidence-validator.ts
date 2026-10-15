import type { Evidence } from '../contracts/evidence.schema';
import type { KnowledgeEntry } from '../contracts/knowledge.schema';

export interface ValidationIssue {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  featureId: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  matchedEvidences: Evidence[];
}

export class EvidenceValidator {
  /**
   * Validates a KnowledgeEntry against the gathered evidence repository.
   */
  static validate(
    entry: KnowledgeEntry,
    evidences: Evidence[]
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    const matchedEvidences: Evidence[] = [];

    // 1. Check if the entry has matching evidence by feature_id or symbols
    const matching = evidences.filter(
      (ev) =>
        ev.feature_id === entry.feature_id ||
        (ev.symbol_name && ev.symbol_name === entry.title) ||
        (entry.navigation?.apiEndpoint &&
          ev.route_path &&
          entry.navigation.apiEndpoint.includes(ev.route_path))
    );

    if (matching.length === 0) {
      issues.push({
        severity: 'CRITICAL',
        code: 'MISSING_EVIDENCE',
        message: `No evidence found in source code matching feature "${entry.feature_id}".`,
        featureId: entry.feature_id,
      });
      return { isValid: false, issues, matchedEvidences };
    }

    matchedEvidences.push(...matching);

    // 2. Validate AST Node Hashes if provenance is provided
    if (entry.provenance?.astNodeHashes?.length) {
      for (const expectedHash of entry.provenance.astNodeHashes) {
        const hashFound = matching.some(
          (ev) => ev.ast_node_hash === expectedHash
        );
        if (!hashFound) {
          issues.push({
            severity: 'WARNING',
            code: 'AST_DRIFT',
            message: `AST node hash mismatch for feature "${entry.feature_id}". Code implementation has changed.`,
            featureId: entry.feature_id,
          });
        }
      }
    }

    // 3. Route & Method Validation if navigation.apiEndpoint is declared
    if (entry.navigation?.apiEndpoint) {
      const endpoint = entry.navigation.apiEndpoint;
      const routeEvidence = matching.find(
        (ev) => ev.source_type === 'BACKEND_ROUTE'
      );

      if (routeEvidence && routeEvidence.route_path) {
        if (!endpoint.includes(routeEvidence.route_path)) {
          issues.push({
            severity: 'CRITICAL',
            code: 'ROUTE_MISMATCH',
            message: `Declared endpoint "${endpoint}" does not match detected route "${routeEvidence.route_path}".`,
            featureId: entry.feature_id,
          });
        }
      }
    }

    const hasCritical = issues.some((i) => i.severity === 'CRITICAL');
    return {
      isValid: !hasCritical,
      issues,
      matchedEvidences,
    };
  }

  /**
   * Batch validates a collection of KnowledgeEntries.
   */
  static validateAll(
    entries: KnowledgeEntry[],
    evidences: Evidence[]
  ): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();
    for (const entry of entries) {
      const res = this.validate(entry, evidences);
      results.set(entry.feature_id, res);
    }
    return results;
  }
}

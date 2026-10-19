import type { ActorPolicy } from '../contracts/knowledge.schema';
import type { Evidence } from '../contracts/evidence.schema';

export interface PolicyVerificationResult {
  isConsistent: boolean;
  conflicts: string[];
  notes: string[];
}

export class PolicyVerifier {
  /**
   * Verifies consistency between UI visibility rules and Backend authorization guards.
   */
  static verify(
    policy: ActorPolicy | undefined,
    evidences: Evidence[]
  ): PolicyVerificationResult {
    const conflicts: string[] = [];
    const notes: string[] = [];

    if (!policy) {
      return { isConsistent: true, conflicts, notes };
    }

    const backendRoles = policy.backendPolicy?.allowedRoles || policy.allowedRoles;
    const uiRoles = policy.uiVisibility?.allowedRoles;

    // Check role discrepancies between UI and Backend
    if (backendRoles && uiRoles && uiRoles.length > 0 && backendRoles.length > 0) {
      const unauthorizedUiRoles = uiRoles.filter((r) => !backendRoles.includes(r));
      if (unauthorizedUiRoles.length > 0) {
        conflicts.push(
          `UI allows roles [${unauthorizedUiRoles.join(', ')}] which are not permitted by backend policy [${backendRoles.join(', ')}].`
        );
      }
    }

    // Cross-verify with Evidence backend authorization guard
    const routeEvidences = evidences.filter((ev) => ev.source_type === 'BACKEND_ROUTE');
    for (const ev of routeEvidences) {
      if (ev.backend_authorization_guard) {
        const guardText = ev.backend_authorization_guard.toUpperCase();
        for (const role of backendRoles) {
          if (!guardText.includes(role.toUpperCase())) {
            notes.push(
              `Role "${role}" declared in policy but not directly found in middleware guard: "${ev.backend_authorization_guard}".`
            );
          }
        }
      }
    }

    return {
      isConsistent: conflicts.length === 0,
      conflicts,
      notes,
    };
  }
}

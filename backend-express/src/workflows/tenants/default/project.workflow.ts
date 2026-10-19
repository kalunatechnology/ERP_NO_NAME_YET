/**
 * File: backend-express/src/workflows/tenants/default/project.workflow.ts
 *
 * Purpose: Defines workflow/state transition responsibilities for the backend application.
 * Responsibility: Owns the executable contracts declared here and their framework/import integration boundary.
 * Dependencies and side effects: Function comments identify HTTP, persistence, browser-state, and security effects where present.
 */
import {
  BaseWorkflow,
  TransitionContext,
  TransitionInfo,
  WorkflowDocument,
  WorkflowValidationError,
} from '../../engine';

export const CANONICAL_PROJECT_LIFECYCLE_STAGES = [
  'INCOMING',
  'DISCOVERY',
  'PITCHING',
  'NEGOTIATION',
  'VERIFIED',
  'RESERVED',
  'ACTIVE',
  'CLOSED',
  'LOST',
] as const;

export type CanonicalLifecycleStage = typeof CANONICAL_PROJECT_LIFECYCLE_STAGES[number];

type ProjectLifecycleRule = {
  allowedNext: readonly CanonicalLifecycleStage[];
  allowedRoles: readonly string[];
};

const SALES_LIFECYCLE_ROLES = [
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR', 'CRM_LEAD', 'SALES', 'PROJECT_MANAGER',
] as const;

const DELIVERY_LIFECYCLE_ROLES = [
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR', 'OPERATIONAL_MANAGER', 'PROJECT_MANAGER',
] as const;

export const PROJECT_LIFECYCLE_RULES: Record<CanonicalLifecycleStage, ProjectLifecycleRule> = {
  INCOMING: { allowedNext: ['DISCOVERY', 'LOST'], allowedRoles: SALES_LIFECYCLE_ROLES },
  DISCOVERY: { allowedNext: ['PITCHING', 'LOST'], allowedRoles: SALES_LIFECYCLE_ROLES },
  PITCHING: { allowedNext: ['NEGOTIATION', 'LOST'], allowedRoles: SALES_LIFECYCLE_ROLES },
  NEGOTIATION: { allowedNext: ['VERIFIED', 'LOST'], allowedRoles: SALES_LIFECYCLE_ROLES },
  VERIFIED: { allowedNext: ['RESERVED', 'LOST'], allowedRoles: DELIVERY_LIFECYCLE_ROLES },
  RESERVED: { allowedNext: ['ACTIVE', 'LOST'], allowedRoles: DELIVERY_LIFECYCLE_ROLES },
  ACTIVE: { allowedNext: ['CLOSED', 'LOST'], allowedRoles: DELIVERY_LIFECYCLE_ROLES },
  CLOSED: { allowedNext: [], allowedRoles: [] },
  LOST: { allowedNext: [], allowedRoles: [] },
};

export class DefaultProjectWorkflow extends BaseWorkflow {
  readonly TENANT_CODE = 'default';
  readonly MODULE_CODE = 'PROJECT';

  readonly VALID_STATUSES = [...CANONICAL_PROJECT_LIFECYCLE_STAGES];

  readonly TRANSITIONS = {
    INCOMING: [
      { action: 'discover', label: 'Start Discovery', to_status: 'DISCOVERY' },
      { action: 'mark-lost', label: 'Mark Lost', to_status: 'LOST' },
    ],
    DISCOVERY: [
      { action: 'start-pitching', label: 'Start Pitching', to_status: 'PITCHING' },
      { action: 'mark-lost', label: 'Mark Lost', to_status: 'LOST' },
    ],
    PITCHING: [
      { action: 'start-negotiation', label: 'Start Negotiation', to_status: 'NEGOTIATION' },
      { action: 'mark-lost', label: 'Mark Lost', to_status: 'LOST' },
    ],
    NEGOTIATION: [
      { action: 'verify-deal', label: 'Verify Deal', to_status: 'VERIFIED' },
      { action: 'mark-lost', label: 'Mark Lost', to_status: 'LOST' },
    ],
    VERIFIED: [
      { action: 'reserve-resources', label: 'Reserve Resources', to_status: 'RESERVED' },
      { action: 'mark-lost', label: 'Mark Lost', to_status: 'LOST' },
    ],
    RESERVED: [
      { action: 'start-project', label: 'Start Project', to_status: 'ACTIVE' },
      { action: 'mark-lost', label: 'Mark Lost', to_status: 'LOST' },
    ],
    ACTIVE: [
      { action: 'close-project', label: 'Close Project', to_status: 'CLOSED' },
      { action: 'mark-lost', label: 'Mark Lost', to_status: 'LOST' },
    ],
    CLOSED: [],
    LOST: [],
  };

  getInitialStatus(): string {
    return 'INCOMING';
  }

  getAvailableTransitions(
    currentStatus: string,
    _context: TransitionContext,
  ): TransitionInfo[] {
    return this.TRANSITIONS[currentStatus as keyof typeof this.TRANSITIONS] ?? [];
  }

  validateTransition(
    document: WorkflowDocument,
    _fromStatus: string,
    toStatus: string,
    _context: TransitionContext,
  ): void {
    if (toStatus === 'CLOSED') {
      const progress = Number(
        document['progress_percent'] ?? document['progress'] ?? document['progress_percentage'] ?? 0,
      );
      if (progress < 100) {
        throw new WorkflowValidationError(
          `Project progress must be 100% before completing. Current: ${progress.toFixed(0)}%`,
        );
      }
    }
  }

  onStatusChanged(
    _document: WorkflowDocument,
    _fromStatus: string,
    _toStatus: string,
    _context: TransitionContext,
  ): void {}
}

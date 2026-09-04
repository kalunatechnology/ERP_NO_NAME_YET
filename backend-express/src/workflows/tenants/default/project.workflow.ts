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

export class DefaultProjectWorkflow extends BaseWorkflow {
  readonly TENANT_CODE = 'default';
  readonly MODULE_CODE = 'PROJECT';

  readonly VALID_STATUSES = [
    'DRAFT',
    'VERIFIED',
    'RESOURCE_RESERVED',
    'IN_PROGRESS',
    'COMPLETED',
    'ON_HOLD',
    'CANCELLED',
  ];

  readonly TRANSITIONS = {
    DRAFT: [
      {
        action: 'verify',
        label: 'Verify Project',
        to_status: 'VERIFIED',
        description: 'All prerequisites validated: budget, scope, resources.',
      },
    ],
    VERIFIED: [
      {
        action: 'reserve-materials',
        label: 'Reserve Resources',
        to_status: 'RESOURCE_RESERVED',
        description: 'Lock materials and resources for project execution.',
      },
    ],
    RESOURCE_RESERVED: [
      {
        action: 'start',
        label: 'Start Project',
        to_status: 'IN_PROGRESS',
        description: 'Begin active project execution. Notifies all departments.',
      },
    ],
    IN_PROGRESS: [
      {
        action: 'complete',
        label: 'Complete Project',
        to_status: 'COMPLETED',
        description: 'Project delivery done. Triggers billing proposal and close-out.',
      },
      { action: 'hold', label: 'Put On Hold', to_status: 'ON_HOLD' },
    ],
    ON_HOLD: [
      { action: 'resume', label: 'Resume', to_status: 'IN_PROGRESS' },
    ],
  };

  getInitialStatus(): string {
    return 'DRAFT';
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
    if (toStatus === 'COMPLETED') {
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

import {
  BaseWorkflow,
  TransitionContext,
  TransitionInfo,
  WorkflowDocument,
  WorkflowValidationError,
} from '../../engine';

export class ArsalynkProjectWorkflow extends BaseWorkflow {
  readonly TENANT_CODE = 'arsalynk';
  readonly MODULE_CODE = 'PROJECT';

  readonly VALID_STATUSES = [
    'DRAFT',
    'VERIFIED',
    'RESOURCE_RESERVED',
    'IN_PROGRESS',
    'QC_REVIEW',
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
        description: 'Validate budget, resources, and client scope.',
      },
    ],
    VERIFIED: [
      {
        action: 'reserve-materials',
        label: 'Reserve Resources',
        to_status: 'RESOURCE_RESERVED',
        description: 'Lock materials, assign teams, and send dispatch.',
      },
    ],
    RESOURCE_RESERVED: [
      {
        action: 'start',
        label: 'Start Project',
        to_status: 'IN_PROGRESS',
        description: 'Begin active execution. All departments notified.',
      },
    ],
    IN_PROGRESS: [
      {
        action: 'request-qc',
        label: 'Submit for QC Review',
        to_status: 'QC_REVIEW',
        description: 'Project work complete. Submit to QC for inspection before closing.',
      },
      { action: 'hold', label: 'Put On Hold', to_status: 'ON_HOLD' },
    ],
    QC_REVIEW: [
      {
        action: 'qc-pass',
        label: 'QC Passed — Complete',
        to_status: 'COMPLETED',
        description: 'QC approved. Project officially completed and billing triggered.',
      },
      {
        action: 'qc-fail',
        label: 'QC Failed — Resume',
        to_status: 'IN_PROGRESS',
        description: 'QC found issues. Return project to active status for rework.',
      },
    ],
    ON_HOLD: [
      { action: 'resume', label: 'Resume Project', to_status: 'IN_PROGRESS' },
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
    fromStatus: string,
    toStatus: string,
    _context: TransitionContext,
  ): void {
    if (toStatus === 'QC_REVIEW') {
      const progress = Number(
        document['progress_percent'] ?? document['progress'] ?? document['progress_percentage'] ?? 0,
      );
      if (progress < 100) {
        throw new WorkflowValidationError(
          `Project progress must be 100% before submitting for QC. Current: ${progress.toFixed(0)}%`,
        );
      }
    }

    if (toStatus === 'COMPLETED') {
      if (fromStatus !== 'QC_REVIEW') {
        throw new WorkflowValidationError(
          'Arsalynk projects must pass QC Review before completion. Submit for QC Review first.',
        );
      }
    }
  }

  onStatusChanged(
    _document: WorkflowDocument,
    _fromStatus: string,
    _toStatus: string,
    _context: TransitionContext,
  ): void {
    // Side effects handled in service layer
  }
}

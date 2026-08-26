import {
  BaseWorkflow,
  TransitionContext,
  TransitionInfo,
  WorkflowDocument,
  WorkflowValidationError,
} from '../../engine';

export class ArsalynkSalesOrderWorkflow extends BaseWorkflow {
  readonly TENANT_CODE = 'arsalynk';
  readonly MODULE_CODE = 'SALES_ORDER';

  readonly VALID_STATUSES = [
    'DRAFT',
    'PENDING_SUPERVISOR_APPROVAL',
    'PENDING_DIRECTOR_APPROVAL',
    'QUALITY_CONTROL',
    'SPK_GENERATED',
    'CONFIRMED',
    'ALLOCATED',
    'FULFILLED',
    'REJECTED',
    'CANCELLED',
  ];

  readonly TRANSITIONS = {
    DRAFT: [
      {
        action: 'submit',
        label: 'Submit for Approval',
        to_status: 'PENDING_SUPERVISOR_APPROVAL',
        requires_approval: true,
        approval_level: 'SUPERVISOR',
        description: 'Send order to Supervisor for first-level approval.',
      },
      { action: 'cancel', label: 'Cancel Draft', to_status: 'CANCELLED' },
    ],
    PENDING_SUPERVISOR_APPROVAL: [
      {
        action: 'supervisor_approve',
        label: 'Supervisor Approve',
        to_status: 'PENDING_DIRECTOR_APPROVAL',
        requires_approval: true,
        approval_level: 'DIRECTOR',
        description: 'Supervisor approved. Escalate to Director.',
      },
      {
        action: 'reject',
        label: 'Reject & Return',
        to_status: 'REJECTED',
        description: 'Return to sales team with rejection note.',
      },
    ],
    PENDING_DIRECTOR_APPROVAL: [
      {
        action: 'director_approve',
        label: 'Director Approve',
        to_status: 'QUALITY_CONTROL',
        description: 'Director approved. Move to QC inspection.',
      },
      { action: 'reject', label: 'Reject', to_status: 'REJECTED' },
    ],
    QUALITY_CONTROL: [
      {
        action: 'qc_pass',
        label: 'QC Passed',
        to_status: 'SPK_GENERATED',
        description: 'QC validation passed. System will auto-generate SPK.',
      },
      {
        action: 'qc_fail',
        label: 'QC Failed — Return',
        to_status: 'PENDING_SUPERVISOR_APPROVAL',
        description: 'QC failed. Return to approval queue with findings.',
      },
    ],
    SPK_GENERATED: [
      {
        action: 'confirm',
        label: 'Confirm to Customer',
        to_status: 'CONFIRMED',
        description: 'Notify customer that order is confirmed with SPK reference.',
      },
    ],
    CONFIRMED: [
      { action: 'allocate', label: 'Allocate Stock', to_status: 'ALLOCATED' },
    ],
    ALLOCATED: [
      { action: 'fulfill', label: 'Mark Fulfilled', to_status: 'FULFILLED' },
    ],
    REJECTED: [
      {
        action: 'revise',
        label: 'Revise & Resubmit',
        to_status: 'DRAFT',
        description: 'Sales team revises the order and resubmits.',
      },
    ],
  };

  getInitialStatus(): string {
    return 'DRAFT';
  }

  requiresApproval(_document: WorkflowDocument, _context: TransitionContext): boolean {
    return true;
  }

  getApprovalLevels(_document: WorkflowDocument, _context: TransitionContext): string[] {
    return ['SUPERVISOR', 'DIRECTOR'];
  }

  getAvailableTransitions(
    currentStatus: string,
    context: TransitionContext,
  ): TransitionInfo[] {
    const transitions = this.TRANSITIONS[currentStatus as keyof typeof this.TRANSITIONS] ?? [];
    const roles = this.getUserRoles(context);
    const isSuper = this.isSuperuser(context);

    return transitions.filter((t) => {
      if (t.action === 'supervisor_approve' && !roles.includes('SUPERVISOR') && !isSuper) {
        return false;
      }
      if (
        t.action === 'director_approve' &&
        !roles.includes('DIRECTOR') &&
        !roles.includes('EXECUTIVE') &&
        !isSuper
      ) {
        return false;
      }
      return true;
    });
  }

  validateTransition(
    document: WorkflowDocument,
    _fromStatus: string,
    toStatus: string,
    context: TransitionContext,
  ): void {
    if (toStatus === 'PENDING_SUPERVISOR_APPROVAL') {
      if (!document['customer_party_id'] && !document['party_id']) {
        throw new WorkflowValidationError('Order must have a customer before submission.');
      }
    }

    if (toStatus === 'PENDING_DIRECTOR_APPROVAL') {
      const roles = this.getUserRoles(context);
      if (!roles.includes('SUPERVISOR') && !this.isSuperuser(context)) {
        throw new WorkflowValidationError('Only a Supervisor can approve at this stage.', {
          role_required: 'SUPERVISOR',
        });
      }
    }

    if (toStatus === 'QUALITY_CONTROL') {
      const roles = this.getUserRoles(context);
      if (
        !roles.includes('DIRECTOR') &&
        !roles.includes('EXECUTIVE') &&
        !this.isSuperuser(context)
      ) {
        throw new WorkflowValidationError('Only a Director or Executive can approve at this stage.', {
          role_required: 'DIRECTOR',
        });
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

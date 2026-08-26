import {
  BaseWorkflow,
  TransitionContext,
  TransitionInfo,
  WorkflowDocument,
  WorkflowValidationError,
} from '../../engine';

export class DefaultProcurementWorkflow extends BaseWorkflow {
  readonly TENANT_CODE = 'default';
  readonly MODULE_CODE = 'PURCHASE_ORDER';

  readonly VALID_STATUSES = [
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'RECEIVED',
    'CLOSED',
    'CANCELLED',
  ];

  readonly TRANSITIONS = {
    DRAFT: [
      {
        action: 'submit',
        label: 'Submit for Approval',
        to_status: 'SUBMITTED',
        requires_approval: true,
        approval_level: 'MANAGER',
      },
      { action: 'cancel', label: 'Cancel', to_status: 'CANCELLED' },
    ],
    SUBMITTED: [
      { action: 'approve', label: 'Approve PO', to_status: 'APPROVED' },
      { action: 'reject', label: 'Reject', to_status: 'REJECTED' },
    ],
    APPROVED: [
      { action: 'receive', label: 'Mark Received', to_status: 'RECEIVED' },
      { action: 'cancel', label: 'Cancel', to_status: 'CANCELLED' },
    ],
    RECEIVED: [
      { action: 'close', label: 'Close PO', to_status: 'CLOSED' },
    ],
    REJECTED: [
      { action: 'resubmit', label: 'Revise & Resubmit', to_status: 'DRAFT' },
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
    context: TransitionContext,
  ): void {
    if (toStatus === 'APPROVED') {
      const submitter = String(document['created_by_id'] ?? '');
      const approver = String(context.user.id);
      if (submitter && submitter === approver && !context.user.is_superuser) {
        throw new WorkflowValidationError(
          'Maker-checker violation: you cannot approve your own purchase order.',
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

  requiresApproval(_document: WorkflowDocument, _context: TransitionContext): boolean {
    return true;
  }
}

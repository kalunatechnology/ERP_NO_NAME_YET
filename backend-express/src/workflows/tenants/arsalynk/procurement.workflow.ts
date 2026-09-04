/**
 * File: backend-express/src/workflows/tenants/arsalynk/procurement.workflow.ts
 *
 * Purpose: Implements workflow and state transition responsibilities in the backend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import {
  BaseWorkflow,
  TransitionContext,
  TransitionInfo,
  WorkflowDocument,
  WorkflowValidationError,
} from '../../engine';
import { RoleCode } from '../../../types/roles';

export class ArsalynkProcurementWorkflow extends BaseWorkflow {
  readonly TENANT_CODE = 'arsalynk';
  readonly MODULE_CODE = 'PURCHASE_ORDER';
  readonly HIGH_VALUE_THRESHOLD = 10_000_000;

  readonly VALID_STATUSES = [
    'DRAFT',
    'SUBMITTED',
    'SUPERVISOR_APPROVED',
    'MANAGER_APPROVED',
    'DIRECTOR_APPROVED',
    'ISSUED',
    'RECEIVED',
    'CLOSED',
    'REJECTED',
    'CANCELLED',
  ];

  readonly TRANSITIONS = {
    DRAFT: [
      {
        action: 'submit',
        label: 'Submit for Approval',
        to_status: 'SUBMITTED',
        requires_approval: true,
        approval_level: 'SUPERVISOR',
      },
      { action: 'cancel', label: 'Cancel', to_status: 'CANCELLED' },
    ],
    SUBMITTED: [
      {
        action: 'supervisor-approve',
        label: 'Supervisor Approve',
        to_status: 'SUPERVISOR_APPROVED',
        requires_approval: true,
        approval_level: 'MANAGER',
      },
      { action: 'reject', label: 'Reject', to_status: 'REJECTED' },
    ],
    SUPERVISOR_APPROVED: [
      {
        action: 'manager-approve',
        label: 'Manager Approve',
        to_status: 'MANAGER_APPROVED',
        requires_approval: true,
        approval_level: 'DIRECTOR',
      },
      { action: 'reject', label: 'Reject', to_status: 'REJECTED' },
    ],
    MANAGER_APPROVED: [
      {
        action: 'director-approve',
        label: 'Director Approve',
        to_status: 'DIRECTOR_APPROVED',
      },
      { action: 'reject', label: 'Reject', to_status: 'REJECTED' },
    ],
    DIRECTOR_APPROVED: [
      { action: 'issue', label: 'Issue to Vendor', to_status: 'ISSUED' },
    ],
    ISSUED: [
      { action: 'receive', label: 'Confirm Receipt', to_status: 'RECEIVED' },
    ],
    RECEIVED: [
      { action: 'close', label: 'Close PO', to_status: 'CLOSED' },
    ],
    REJECTED: [
      { action: 'revise', label: 'Revise & Resubmit', to_status: 'DRAFT' },
    ],
  };

  getInitialStatus(): string {
    return 'DRAFT';
  }

  requiresApproval(_document: WorkflowDocument, _context: TransitionContext): boolean {
    return true;
  }

  getApprovalLevels(document: WorkflowDocument, _context: TransitionContext): string[] {
    const amount = Number(document['total_amount'] ?? 0);
    if (amount >= this.HIGH_VALUE_THRESHOLD) {
      return ['SUPERVISOR', 'MANAGER', 'DIRECTOR'];
    }
    return ['SUPERVISOR', 'MANAGER'];
  }

  getAvailableTransitions(
    currentStatus: string,
    context: TransitionContext,
  ): TransitionInfo[] {
    const transitions = this.TRANSITIONS[currentStatus as keyof typeof this.TRANSITIONS] ?? [];
    const roles = this.getUserRoles(context);

    return transitions.filter((t) => {
      if (t.action.includes('supervisor') && !roles.includes(RoleCode.SUPERVISOR)) {
        return false;
      }
      if (t.action.includes('manager') && !roles.includes(RoleCode.PROJECT_MANAGER)) {
        return false;
      }
      if (
        t.action.includes('director') &&
        !roles.includes(RoleCode.DIRECTOR)
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
    _context: TransitionContext,
  ): void {
    if (toStatus === 'SUBMITTED') {
      if (!document['supplier_party_id'] && !document['vendor_party_id'] && !document['party_id']) {
        throw new WorkflowValidationError('Purchase order must have a supplier before submission.');
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

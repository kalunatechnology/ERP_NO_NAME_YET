/**
 * File: backend-express/src/workflows/tenants/default/sales_order.workflow.ts
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

export class DefaultSalesOrderWorkflow extends BaseWorkflow {
  readonly TENANT_CODE = 'default';
  readonly MODULE_CODE = 'SALES_ORDER';

  readonly VALID_STATUSES = ['DRAFT', 'CONFIRMED', 'ALLOCATED', 'FULFILLED', 'CANCELLED'];

  readonly TRANSITIONS = {
    DRAFT: [
      {
        action: 'confirm',
        label: 'Confirm Order',
        to_status: 'CONFIRMED',
        description: 'Order confirmed and ready for fulfillment.',
      },
      { action: 'cancel', label: 'Cancel', to_status: 'CANCELLED' },
    ],
    CONFIRMED: [
      { action: 'allocate', label: 'Allocate Stock', to_status: 'ALLOCATED' },
      { action: 'cancel', label: 'Cancel', to_status: 'CANCELLED' },
    ],
    ALLOCATED: [
      { action: 'fulfill', label: 'Mark Fulfilled', to_status: 'FULFILLED' },
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
    if (toStatus === 'CONFIRMED') {
      if (!document['customer_party_id'] && !document['party_id']) {
        throw new WorkflowValidationError('Order must have a customer before confirming.');
      }
    }
  }

  onStatusChanged(
    _document: WorkflowDocument,
    _fromStatus: string,
    _toStatus: string,
    _context: TransitionContext,
  ): void {}

  requiresApproval(document: WorkflowDocument, _context: TransitionContext): boolean {
    const amount = Number(document['total_amount'] ?? 0);
    return amount > 50_000_000;
  }
}

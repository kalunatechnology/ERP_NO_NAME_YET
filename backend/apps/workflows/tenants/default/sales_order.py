"""
Default Sales Order Workflow.

Standard ERP flow: DRAFT → CONFIRMED → ALLOCATED → FULFILLED
No special approval gates — used as fallback for any unregistered tenant.
"""
from __future__ import annotations
from typing import Any
from apps.workflows.base import BaseWorkflow, TransitionContext, TransitionInfo
from apps.workflows.registry import register_workflow
from apps.workflows.exceptions import WorkflowValidationError


@register_workflow
class DefaultSalesOrderWorkflow(BaseWorkflow):
    TENANT_CODE = 'default'
    MODULE_CODE = 'SALES_ORDER'

    VALID_STATUSES = ['DRAFT', 'CONFIRMED', 'ALLOCATED', 'FULFILLED', 'CANCELLED']

    TRANSITIONS = {
        'DRAFT': [
            TransitionInfo(action='confirm', label='Confirm Order', to_status='CONFIRMED',
                           description='Order confirmed and ready for fulfillment.'),
            TransitionInfo(action='cancel', label='Cancel', to_status='CANCELLED'),
        ],
        'CONFIRMED': [
            TransitionInfo(action='allocate', label='Allocate Stock', to_status='ALLOCATED'),
            TransitionInfo(action='cancel', label='Cancel', to_status='CANCELLED'),
        ],
        'ALLOCATED': [
            TransitionInfo(action='fulfill', label='Mark Fulfilled', to_status='FULFILLED'),
        ],
    }

    def get_initial_status(self) -> str:
        return 'DRAFT'

    def get_available_transitions(self, current_status: str, context: TransitionContext) -> list[TransitionInfo]:
        return self.TRANSITIONS.get(current_status, [])

    def validate_transition(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        if to_status == 'CONFIRMED':
            if not getattr(document, 'customer_party_id', None):
                raise WorkflowValidationError('Order must have a customer before confirming.')

    def on_status_changed(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        pass

    def requires_approval(self, document: Any, context: TransitionContext) -> bool:
        amount = float(getattr(document, 'total_amount', 0) or 0)
        return amount > 50_000_000

"""
Default Procurement / Purchase Order Workflow.

Standard ERP flow: DRAFT → SUBMITTED → APPROVED → RECEIVED → CLOSED
"""
from __future__ import annotations
from typing import Any
from apps.workflows.base import BaseWorkflow, TransitionContext, TransitionInfo
from apps.workflows.registry import register_workflow
from apps.workflows.exceptions import WorkflowValidationError


@register_workflow
class DefaultProcurementWorkflow(BaseWorkflow):
    TENANT_CODE = 'default'
    MODULE_CODE = 'PURCHASE_ORDER'

    VALID_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'CLOSED', 'CANCELLED']

    TRANSITIONS = {
        'DRAFT': [
            TransitionInfo(action='submit', label='Submit for Approval', to_status='SUBMITTED',
                           requires_approval=True, approval_level='MANAGER'),
            TransitionInfo(action='cancel', label='Cancel', to_status='CANCELLED'),
        ],
        'SUBMITTED': [
            TransitionInfo(action='approve', label='Approve PO', to_status='APPROVED'),
            TransitionInfo(action='reject', label='Reject', to_status='REJECTED'),
        ],
        'APPROVED': [
            TransitionInfo(action='receive', label='Mark Received', to_status='RECEIVED'),
            TransitionInfo(action='cancel', label='Cancel', to_status='CANCELLED'),
        ],
        'RECEIVED': [
            TransitionInfo(action='close', label='Close PO', to_status='CLOSED'),
        ],
        'REJECTED': [
            TransitionInfo(action='resubmit', label='Revise & Resubmit', to_status='DRAFT'),
        ],
    }

    def get_initial_status(self) -> str:
        return 'DRAFT'

    def get_available_transitions(self, current_status: str, context: TransitionContext) -> list[TransitionInfo]:
        return self.TRANSITIONS.get(current_status, [])

    def validate_transition(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        if to_status == 'APPROVED':
            # Prevent self-approval: submitter cannot approve their own PO
            submitter = str(getattr(document, 'created_by_id', '') or '')
            approver = str(getattr(context.user, 'pk', ''))
            if submitter and submitter == approver:
                raise WorkflowValidationError('Maker-checker violation: you cannot approve your own purchase order.')

    def on_status_changed(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        pass

    def requires_approval(self, document: Any, context: TransitionContext) -> bool:
        return True  # All POs require approval by default

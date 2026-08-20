"""
Arsalynk Procurement Workflow — 3-Level Approval.

Procurement in Arsalynk requires 3 approval levels for PO > 10jt:
  DRAFT → SUBMITTED → SUPERVISOR_APPROVED → MANAGER_APPROVED → DIRECTOR_APPROVED
        → ISSUED (sent to vendor) → RECEIVED → CLOSED
"""
from __future__ import annotations
from typing import Any
from apps.workflows.base import BaseWorkflow, TransitionContext, TransitionInfo
from apps.workflows.registry import register_workflow
from apps.workflows.exceptions import WorkflowValidationError


@register_workflow
class ArsalynkProcurementWorkflow(BaseWorkflow):
    TENANT_CODE = 'arsalynk'
    MODULE_CODE = 'PURCHASE_ORDER'

    HIGH_VALUE_THRESHOLD = 10_000_000  # 10 juta IDR

    VALID_STATUSES = [
        'DRAFT', 'SUBMITTED',
        'SUPERVISOR_APPROVED', 'MANAGER_APPROVED', 'DIRECTOR_APPROVED',
        'ISSUED', 'RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED',
    ]

    TRANSITIONS = {
        'DRAFT': [
            TransitionInfo(action='submit', label='Submit for Approval', to_status='SUBMITTED',
                           requires_approval=True, approval_level='SUPERVISOR'),
            TransitionInfo(action='cancel', label='Cancel', to_status='CANCELLED'),
        ],
        'SUBMITTED': [
            TransitionInfo(action='supervisor-approve', label='Supervisor Approve',
                           to_status='SUPERVISOR_APPROVED', requires_approval=True, approval_level='MANAGER'),
            TransitionInfo(action='reject', label='Reject', to_status='REJECTED'),
        ],
        'SUPERVISOR_APPROVED': [
            TransitionInfo(action='manager-approve', label='Manager Approve',
                           to_status='MANAGER_APPROVED', requires_approval=True, approval_level='DIRECTOR'),
            TransitionInfo(action='reject', label='Reject', to_status='REJECTED'),
        ],
        'MANAGER_APPROVED': [
            TransitionInfo(action='director-approve', label='Director Approve',
                           to_status='DIRECTOR_APPROVED'),
            TransitionInfo(action='reject', label='Reject', to_status='REJECTED'),
        ],
        'DIRECTOR_APPROVED': [
            TransitionInfo(action='issue', label='Issue to Vendor', to_status='ISSUED'),
        ],
        'ISSUED': [
            TransitionInfo(action='receive', label='Confirm Receipt', to_status='RECEIVED'),
        ],
        'RECEIVED': [
            TransitionInfo(action='close', label='Close PO', to_status='CLOSED'),
        ],
        'REJECTED': [
            TransitionInfo(action='revise', label='Revise & Resubmit', to_status='DRAFT'),
        ],
    }

    def get_initial_status(self) -> str:
        return 'DRAFT'

    def requires_approval(self, document: Any, context: TransitionContext) -> bool:
        return True  # Arsalynk: all POs require approval

    def get_approval_levels(self, document: Any, context: TransitionContext) -> list[str]:
        amount = float(getattr(document, 'total_amount', 0) or 0)
        if amount >= self.HIGH_VALUE_THRESHOLD:
            return ['SUPERVISOR', 'MANAGER', 'DIRECTOR']
        return ['SUPERVISOR', 'MANAGER']

    def get_available_transitions(self, current_status: str, context: TransitionContext) -> list[TransitionInfo]:
        transitions = self.TRANSITIONS.get(current_status, [])
        user_roles = self._get_user_roles(context)
        is_super = bool(getattr(context.user, 'is_superuser', False))
        filtered = []
        for t in transitions:
            if 'supervisor' in t.action and 'SUPERVISOR' not in user_roles and not is_super:
                continue
            if 'manager' in t.action and 'MANAGER' not in user_roles and not is_super:
                continue
            if 'director' in t.action and 'DIRECTOR' not in user_roles and 'EXECUTIVE' not in user_roles and not is_super:
                continue
            filtered.append(t)
        return filtered

    def validate_transition(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        if to_status == 'SUBMITTED':
            if not getattr(document, 'supplier_party_id', None) and not getattr(document, 'vendor_party_id', None):
                raise WorkflowValidationError('Purchase order must have a supplier before submission.')

    def on_status_changed(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        pass

    def _get_user_roles(self, context: TransitionContext) -> list[str]:
        try:
            roles = context.user.accounts_userrole_user_set.values_list('role_code', flat=True)
            return [str(r).upper() for r in roles]
        except Exception:
            return []

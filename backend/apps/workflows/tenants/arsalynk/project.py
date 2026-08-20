"""
Arsalynk Project Lifecycle Workflow.

Extends the default project flow with a mandatory QC Gate
before a project can be marked as COMPLETED.

Flow:
  DRAFT → VERIFIED → RESOURCE_RESERVED → IN_PROGRESS → QC_REVIEW → COMPLETED
                                                       ↑ (fails QC)
"""
from __future__ import annotations
from typing import Any
from apps.workflows.base import BaseWorkflow, TransitionContext, TransitionInfo
from apps.workflows.registry import register_workflow
from apps.workflows.exceptions import WorkflowValidationError
import logging

logger = logging.getLogger(__name__)


@register_workflow
class ArsalynkProjectWorkflow(BaseWorkflow):
    TENANT_CODE = 'arsalynk'
    MODULE_CODE = 'PROJECT'

    VALID_STATUSES = [
        'DRAFT', 'VERIFIED', 'RESOURCE_RESERVED',
        'IN_PROGRESS', 'QC_REVIEW', 'COMPLETED', 'ON_HOLD', 'CANCELLED',
    ]

    TRANSITIONS = {
        'DRAFT': [
            TransitionInfo(action='verify', label='Verify Project', to_status='VERIFIED',
                           description='Validate budget, resources, and client scope.'),
        ],
        'VERIFIED': [
            TransitionInfo(action='reserve-materials', label='Reserve Resources', to_status='RESOURCE_RESERVED',
                           description='Lock materials, assign teams, and send dispatch.'),
        ],
        'RESOURCE_RESERVED': [
            TransitionInfo(action='start', label='Start Project', to_status='IN_PROGRESS',
                           description='Begin active execution. All departments notified.'),
        ],
        'IN_PROGRESS': [
            TransitionInfo(action='request-qc', label='Submit for QC Review', to_status='QC_REVIEW',
                           description='Project work complete. Submit to QC for inspection before closing.'),
            TransitionInfo(action='hold', label='Put On Hold', to_status='ON_HOLD'),
        ],
        'QC_REVIEW': [
            TransitionInfo(action='qc-pass', label='QC Passed — Complete', to_status='COMPLETED',
                           description='QC approved. Project officially completed and billing triggered.'),
            TransitionInfo(action='qc-fail', label='QC Failed — Resume', to_status='IN_PROGRESS',
                           description='QC found issues. Return project to active status for rework.'),
        ],
        'ON_HOLD': [
            TransitionInfo(action='resume', label='Resume Project', to_status='IN_PROGRESS'),
        ],
    }

    def get_initial_status(self) -> str:
        return 'DRAFT'

    def get_available_transitions(self, current_status: str, context: TransitionContext) -> list[TransitionInfo]:
        return self.TRANSITIONS.get(current_status, [])

    def validate_transition(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        if to_status == 'QC_REVIEW':
            progress = float(getattr(document, 'progress_percent', 0) or getattr(document, 'progress', 0) or 0)
            if progress < 100:
                raise WorkflowValidationError(
                    f'Project progress must be 100% before submitting for QC. Current: {progress:.0f}%'
                )
        if to_status == 'COMPLETED':
            if from_status != 'QC_REVIEW':
                raise WorkflowValidationError(
                    'Arsalynk projects must pass QC Review before completion. '
                    'Submit for QC Review first.'
                )

    def on_status_changed(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        from django.utils import timezone
        if to_status == 'IN_PROGRESS' and not getattr(document, 'started_at', None):
            document.started_at = timezone.now()
            document.save(update_fields=['started_at'])
        elif to_status == 'COMPLETED':
            document.lifecycle_status = 'COMPLETED'
            document.save(update_fields=['lifecycle_status'])
            self._trigger_billing_proposal(document, context)

    def _trigger_billing_proposal(self, document: Any, context: TransitionContext) -> None:
        """Auto-create a billing proposal when Arsalynk project is completed."""
        try:
            from apps.finance.models import BillingProposal
            BillingProposal.objects.get_or_create(
                project=document,
                defaults={
                    'trigger_type': 'PROJECT_COMPLETION',
                    'status': 'SUBMITTED',
                    'description': f'Auto-generated on project completion: {getattr(document, "project_name", document.pk)}',
                    'subtotal': getattr(document, 'budget_amount', 0) or 0,
                    'tax_amount': 0,
                    'total_amount': getattr(document, 'budget_amount', 0) or 0,
                }
            )
            logger.info("[Arsalynk] Billing proposal created for project %s", document.pk)
        except Exception as exc:
            logger.warning("[Arsalynk] Billing proposal creation failed for project %s: %s", document.pk, exc)

"""
Default Project Lifecycle Workflow.

Standard ERP flow: DRAFT → VERIFIED → RESOURCE_RESERVED → IN_PROGRESS → COMPLETED
Mirrors the existing lifecycle_status field on the Project model.
"""
from __future__ import annotations
from typing import Any
from apps.workflows.base import BaseWorkflow, TransitionContext, TransitionInfo
from apps.workflows.registry import register_workflow
from apps.workflows.exceptions import WorkflowValidationError


@register_workflow
class DefaultProjectWorkflow(BaseWorkflow):
    TENANT_CODE = 'default'
    MODULE_CODE = 'PROJECT'

    VALID_STATUSES = ['DRAFT', 'VERIFIED', 'RESOURCE_RESERVED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED']

    TRANSITIONS = {
        'DRAFT': [
            TransitionInfo(action='verify', label='Verify Project', to_status='VERIFIED',
                           description='All prerequisites validated: budget, scope, resources.'),
        ],
        'VERIFIED': [
            TransitionInfo(action='reserve-materials', label='Reserve Resources', to_status='RESOURCE_RESERVED',
                           description='Lock materials and resources for project execution.'),
        ],
        'RESOURCE_RESERVED': [
            TransitionInfo(action='start', label='Start Project', to_status='IN_PROGRESS',
                           description='Begin active project execution. Notifies all departments.'),
        ],
        'IN_PROGRESS': [
            TransitionInfo(action='complete', label='Complete Project', to_status='COMPLETED',
                           description='Project delivery done. Triggers billing proposal and close-out.'),
            TransitionInfo(action='hold', label='Put On Hold', to_status='ON_HOLD'),
        ],
        'ON_HOLD': [
            TransitionInfo(action='resume', label='Resume', to_status='IN_PROGRESS'),
        ],
    }

    def get_initial_status(self) -> str:
        return 'DRAFT'

    def get_available_transitions(self, current_status: str, context: TransitionContext) -> list[TransitionInfo]:
        return self.TRANSITIONS.get(current_status, [])

    def validate_transition(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        if to_status == 'COMPLETED':
            progress = float(getattr(document, 'progress_percent', 0) or getattr(document, 'progress', 0) or 0)
            if progress < 100:
                raise WorkflowValidationError(
                    f'Project progress must be 100% before completing. Current: {progress:.0f}%'
                )

    def on_status_changed(self, document: Any, from_status: str, to_status: str, context: TransitionContext) -> None:
        from django.utils import timezone
        if to_status == 'IN_PROGRESS' and not getattr(document, 'started_at', None):
            document.started_at = timezone.now()
            document.save(update_fields=['started_at'])
        elif to_status == 'COMPLETED':
            document.lifecycle_status = 'COMPLETED'
            document.save(update_fields=['lifecycle_status'])

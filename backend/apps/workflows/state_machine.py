"""
Workflow State Machine — Atomic transition executor.

The StateMachine is the single point of contact for executing any
status transition on any document. It:

  1. Resolves the correct workflow via WorkflowRegistry (tenant-aware).
  2. Validates the transition via the workflow's validate_transition().
  3. Atomically updates the document's status field.
  4. Writes a WorkflowTransitionLog entry for full audit trail.
  5. Calls on_status_changed() for post-transition side effects.

Usage:
    from apps.workflows.state_machine import StateMachine
    from apps.workflows.base import TransitionContext

    ctx = TransitionContext(user=request.user, company_id=company_id, tenant_code='arsalynk')
    result = StateMachine.transition(
        document=order,
        module_code='SALES_ORDER',
        to_status='PENDING_SUPERVISOR_APPROVAL',
        context=ctx,
    )
"""
from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils import timezone

from .base import TransitionContext
from .exceptions import WorkflowTransitionError, WorkflowValidationError
from .registry import WorkflowRegistry

logger = logging.getLogger(__name__)


class _StateMachine:
    """
    Core transition executor.
    Do NOT instantiate — use the module-level StateMachine instance.
    """

    def transition(
        self,
        *,
        document: Any,
        module_code: str,
        to_status: str,
        context: TransitionContext,
        status_field: str = "status",
    ) -> dict:
        """
        Execute a status transition on any Django model instance.

        Args:
            document:     The Django model instance to transition.
            module_code:  Module identifier (e.g. 'SALES_ORDER').
            to_status:    Target status string.
            context:      TransitionContext carrying user, company, tenant info.
            status_field: Name of the status field on the model (default: 'status').

        Returns:
            dict with keys: from_status, to_status, module, tenant, timestamp

        Raises:
            WorkflowNotFoundError: No workflow registered for this tenant/module.
            WorkflowTransitionError: Transition not in allowed transitions list.
            WorkflowValidationError: Business rule validation failed.
        """
        from_status = getattr(document, status_field, "") or ""
        tenant_code = context.tenant_code

        # 1. Resolve workflow
        workflow = WorkflowRegistry.get(tenant_code=tenant_code, module_code=module_code)

        # 2. Verify to_status is a defined valid transition
        available = workflow.get_available_transitions(from_status, context)
        allowed_targets = {t.to_status for t in available}
        if to_status not in allowed_targets:
            raise WorkflowTransitionError(
                from_status=from_status,
                to_status=to_status,
                reason=(
                    f"Allowed next statuses from '{from_status}' are: "
                    f"{sorted(allowed_targets) or ['none']}"
                ),
            )

        # 3. Business rule validation (raises on failure)
        workflow.validate_transition(
            document=document,
            from_status=from_status,
            to_status=to_status,
            context=context,
        )

        # 4. Atomic commit
        with transaction.atomic():
            setattr(document, status_field, to_status)
            document.save(update_fields=[status_field])

            # Write audit trail
            self._log_transition(
                document=document,
                module_code=module_code,
                from_status=from_status,
                to_status=to_status,
                context=context,
            )

            # 5. Post-transition hook (side effects inside same transaction)
            workflow.on_status_changed(
                document=document,
                from_status=from_status,
                to_status=to_status,
                context=context,
            )

        logger.info(
            "[Workflow] %s/%s [%s] %s → %s (by user %s)",
            tenant_code, module_code,
            getattr(document, "pk", "?"),
            from_status, to_status,
            getattr(context.user, "email", context.user),
        )

        return {
            "from_status": from_status,
            "to_status": to_status,
            "module": module_code,
            "tenant": tenant_code,
            "timestamp": timezone.now().isoformat(),
        }

    def get_available_transitions(
        self,
        *,
        document: Any,
        module_code: str,
        context: TransitionContext,
        status_field: str = "status",
    ) -> list[dict]:
        """
        Return available transitions for a document without executing any.
        Used by frontend to show/hide action buttons dynamically.
        """
        current_status = getattr(document, status_field, "") or ""
        workflow = WorkflowRegistry.get(
            tenant_code=context.tenant_code, module_code=module_code
        )
        transitions = workflow.get_available_transitions(current_status, context)
        return [
            {
                "action": t.action,
                "label": t.label,
                "to_status": t.to_status,
                "requires_approval": t.requires_approval,
                "approval_level": t.approval_level,
                "description": t.description,
            }
            for t in transitions
        ]

    def _log_transition(
        self,
        *,
        document: Any,
        module_code: str,
        from_status: str,
        to_status: str,
        context: TransitionContext,
    ) -> None:
        """Write a WorkflowTransitionLog entry for audit purposes."""
        try:
            from apps.workflows.models import WorkflowTransitionLog
            WorkflowTransitionLog.objects.create(
                tenant_code=context.tenant_code,
                module_code=module_code,
                document_id=str(getattr(document, "pk", "")),
                from_status=from_status,
                to_status=to_status,
                triggered_by=str(getattr(context.user, "pk", "")),
                note=context.note,
            )
        except Exception as exc:
            # Never let audit logging failure break the actual transition
            logger.warning("Failed to write WorkflowTransitionLog: %s", exc)


# Module-level singleton — import and use this directly
StateMachine = _StateMachine()

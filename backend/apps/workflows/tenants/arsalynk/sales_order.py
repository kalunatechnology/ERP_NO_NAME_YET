"""
Arsalynk Sales Order Workflow — Custom 8-Stage Flow.

Arsalynk's sales process is fundamentally different from standard ERP:
  DRAFT
    → PENDING_SUPERVISOR_APPROVAL  (Supervisor must approve every order, no threshold)
    → PENDING_DIRECTOR_APPROVAL    (Director approves orders > 10jt)
    → QUALITY_CONTROL              (QC team validates product specs)
    → SPK_GENERATED                (Surat Perintah Kerja auto-created, triggers Project Dispatch)
    → CONFIRMED                    (Customer-facing confirmation)
    → ALLOCATED                    (Stock locked)
    → FULFILLED                    (Delivered)

Key differences from default:
  - Approval is ALWAYS required (no amount threshold)
  - 2-level approval: Supervisor then Director
  - QC gate before order confirmation
  - SPK auto-generation as a side effect when entering SPK_GENERATED status
"""
from __future__ import annotations
from typing import Any
from apps.workflows.base import BaseWorkflow, TransitionContext, TransitionInfo
from apps.workflows.registry import register_workflow
from apps.workflows.exceptions import WorkflowValidationError
import logging

logger = logging.getLogger(__name__)


@register_workflow
class ArsalynkSalesOrderWorkflow(BaseWorkflow):
    TENANT_CODE = 'arsalynk'
    MODULE_CODE = 'SALES_ORDER'

    VALID_STATUSES = [
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
    ]

    TRANSITIONS = {
        'DRAFT': [
            TransitionInfo(
                action='submit',
                label='Submit for Approval',
                to_status='PENDING_SUPERVISOR_APPROVAL',
                requires_approval=True,
                approval_level='SUPERVISOR',
                description='Send order to Supervisor for first-level approval.',
            ),
            TransitionInfo(action='cancel', label='Cancel Draft', to_status='CANCELLED'),
        ],
        'PENDING_SUPERVISOR_APPROVAL': [
            TransitionInfo(
                action='supervisor_approve',
                label='Supervisor Approve',
                to_status='PENDING_DIRECTOR_APPROVAL',
                requires_approval=True,
                approval_level='DIRECTOR',
                description='Supervisor approved. Escalate to Director.',
            ),
            TransitionInfo(
                action='reject',
                label='Reject & Return',
                to_status='REJECTED',
                description='Return to sales team with rejection note.',
            ),
        ],
        'PENDING_DIRECTOR_APPROVAL': [
            TransitionInfo(
                action='director_approve',
                label='Director Approve',
                to_status='QUALITY_CONTROL',
                description='Director approved. Move to QC inspection.',
            ),
            TransitionInfo(action='reject', label='Reject', to_status='REJECTED'),
        ],
        'QUALITY_CONTROL': [
            TransitionInfo(
                action='qc_pass',
                label='QC Passed',
                to_status='SPK_GENERATED',
                description='QC validation passed. System will auto-generate SPK.',
            ),
            TransitionInfo(
                action='qc_fail',
                label='QC Failed — Return',
                to_status='PENDING_SUPERVISOR_APPROVAL',
                description='QC failed. Return to approval queue with findings.',
            ),
        ],
        'SPK_GENERATED': [
            TransitionInfo(
                action='confirm',
                label='Confirm to Customer',
                to_status='CONFIRMED',
                description='Notify customer that order is confirmed with SPK reference.',
            ),
        ],
        'CONFIRMED': [
            TransitionInfo(action='allocate', label='Allocate Stock', to_status='ALLOCATED'),
        ],
        'ALLOCATED': [
            TransitionInfo(action='fulfill', label='Mark Fulfilled', to_status='FULFILLED'),
        ],
        'REJECTED': [
            TransitionInfo(
                action='revise',
                label='Revise & Resubmit',
                to_status='DRAFT',
                description='Sales team revises the order and resubmits.',
            ),
        ],
    }

    def get_initial_status(self) -> str:
        return 'DRAFT'

    def requires_approval(self, document: Any, context: TransitionContext) -> bool:
        # Arsalynk requires approval for ALL sales orders — no amount threshold
        return True

    def get_approval_levels(self, document: Any, context: TransitionContext) -> list[str]:
        return ['SUPERVISOR', 'DIRECTOR']

    def get_available_transitions(
        self, current_status: str, context: TransitionContext
    ) -> list[TransitionInfo]:
        transitions = self.TRANSITIONS.get(current_status, [])
        # Filter approval transitions based on user role
        user_roles = self._get_user_roles(context)
        filtered = []
        for t in transitions:
            if t.action in ('supervisor_approve',) and 'SUPERVISOR' not in user_roles and not self._is_superuser(context):
                continue  # Non-supervisors cannot perform supervisor approvals
            if t.action in ('director_approve',) and 'DIRECTOR' not in user_roles and 'EXECUTIVE' not in user_roles and not self._is_superuser(context):
                continue
            filtered.append(t)
        return filtered

    def validate_transition(
        self, document: Any, from_status: str, to_status: str, context: TransitionContext
    ) -> None:
        if to_status == 'PENDING_SUPERVISOR_APPROVAL':
            # Ensure order has required fields filled
            if not getattr(document, 'customer_party_id', None):
                raise WorkflowValidationError('Order must have a customer before submission.')
            lines_count = getattr(document, 'order_lines', None)
            # Can't easily check related without extra query here; skip for now

        if to_status == 'PENDING_DIRECTOR_APPROVAL':
            user_roles = self._get_user_roles(context)
            if 'SUPERVISOR' not in user_roles and not self._is_superuser(context):
                raise WorkflowValidationError(
                    'Only a Supervisor can approve at this stage.',
                    errors={'role_required': 'SUPERVISOR'},
                )

        if to_status == 'QUALITY_CONTROL':
            user_roles = self._get_user_roles(context)
            if 'DIRECTOR' not in user_roles and 'EXECUTIVE' not in user_roles and not self._is_superuser(context):
                raise WorkflowValidationError(
                    'Only a Director or Executive can approve at this stage.',
                    errors={'role_required': 'DIRECTOR'},
                )

    def on_status_changed(
        self, document: Any, from_status: str, to_status: str, context: TransitionContext
    ) -> None:
        if to_status == 'SPK_GENERATED':
            self._generate_spk(document, context)
        elif to_status == 'CONFIRMED':
            self._notify_customer(document, context)

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    def _get_user_roles(self, context: TransitionContext) -> list[str]:
        try:
            roles = context.user.accounts_userrole_user_set.values_list('role_code', flat=True)
            return [str(r).upper() for r in roles]
        except Exception:
            return []

    def _is_superuser(self, context: TransitionContext) -> bool:
        return bool(getattr(context.user, 'is_superuser', False))

    def _generate_spk(self, document: Any, context: TransitionContext) -> None:
        """
        Generate Surat Perintah Kerja (Work Order Letter) automatically.
        In a full implementation, this creates a BusinessDocument of type SPK
        and links it to the sales order and relevant project/dispatch.
        """
        try:
            from apps.core.models import BusinessDocument
            from django.utils import timezone
            spk_number = f"SPK-{str(document.pk)[:8].upper()}-{timezone.now().strftime('%Y%m')}"
            # Find or resolve company
            company_id = None
            doc = getattr(document, 'document', None)
            if doc:
                company_id = getattr(doc, 'company_id', None)

            if company_id:
                spk_doc = BusinessDocument.objects.create(
                    company_id=company_id,
                    document_type='SPK',
                    document_number=spk_number,
                    status='ACTIVE',
                    document_date=timezone.now().date(),
                )
                logger.info(
                    "[Arsalynk] SPK %s generated for sales order %s",
                    spk_number, document.pk,
                )
        except Exception as exc:
            logger.warning("[Arsalynk] SPK generation failed for order %s: %s", document.pk, exc)

    def _notify_customer(self, document: Any, context: TransitionContext) -> None:
        """Placeholder for customer notification hook."""
        logger.info(
            "[Arsalynk] Sales order %s confirmed. Customer notification hook triggered.",
            document.pk,
        )

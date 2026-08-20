"""
Workflow Engine — Abstract Base Class.

Every tenant-specific workflow must subclass BaseWorkflow and implement
all abstract methods. This enforces a consistent contract across all
business flow variants.

Module codes (used for registry lookup):
    SALES_ORDER, PROJECT, PURCHASE_ORDER, SALES_QUOTATION, INVOICE
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class TransitionContext:
    """
    Carries all runtime context needed for a workflow transition.

    Attributes:
        user:           The Django user requesting the transition.
        company_id:     UUID string of the active company.
        tenant_code:    Short code identifying the tenant (e.g. 'arsalynk').
        note:           Optional free-text note attached to the transition.
        extra:          Any additional data specific to the transition action.
    """
    user: Any
    company_id: str
    tenant_code: str
    note: str = ""
    extra: dict = field(default_factory=dict)


@dataclass
class TransitionInfo:
    """Describes a single available transition from a given status."""
    action: str          # e.g. 'confirm', 'approve', 'reject'
    label: str           # Human-readable label, e.g. 'Confirm Order'
    to_status: str       # Target status after transition
    requires_approval: bool = False
    approval_level: str = ""   # e.g. 'SUPERVISOR', 'DIRECTOR'
    description: str = ""


class BaseWorkflow(ABC):
    """
    Abstract base class for all tenant-specific workflow implementations.

    Subclasses define the state machine transitions, approval rules,
    and side-effect hooks for a specific module within a specific tenant.

    Usage:
        class ArsalynkSalesWorkflow(BaseWorkflow):
            MODULE_CODE = "SALES_ORDER"
            TENANT_CODE = "arsalynk"
            ...
    """

    # Subclasses MUST define these class-level attributes
    MODULE_CODE: str = ""   # e.g. "SALES_ORDER"
    TENANT_CODE: str = ""   # e.g. "arsalynk" or "default"

    # Define the full set of valid statuses for this module
    VALID_STATUSES: list[str] = []

    # Define allowed transitions as: {from_status: [TransitionInfo, ...]}
    TRANSITIONS: dict[str, list[TransitionInfo]] = {}

    # ---------------------------------------------------------------------------
    # Abstract interface — MUST implement in every subclass
    # ---------------------------------------------------------------------------

    @abstractmethod
    def get_initial_status(self) -> str:
        """Return the starting status when a new document is created."""

    @abstractmethod
    def get_available_transitions(
        self, current_status: str, context: TransitionContext
    ) -> list[TransitionInfo]:
        """
        Return a list of valid transitions from the given status.
        May filter based on user roles from context.
        """

    @abstractmethod
    def validate_transition(
        self,
        document: Any,
        from_status: str,
        to_status: str,
        context: TransitionContext,
    ) -> None:
        """
        Validate business rules before the transition is committed.
        Raise WorkflowValidationError or WorkflowTransitionError on failure.
        """

    @abstractmethod
    def on_status_changed(
        self,
        document: Any,
        from_status: str,
        to_status: str,
        context: TransitionContext,
    ) -> None:
        """
        Hook called AFTER status is committed to DB.
        Use for side effects: send notifications, create related records, etc.
        This runs inside the same transaction.atomic() block as the status update.
        """

    # ---------------------------------------------------------------------------
    # Optional hooks — subclasses may override
    # ---------------------------------------------------------------------------

    def requires_approval(self, document: Any, context: TransitionContext) -> bool:
        """Return True if the current state requires an approval gate."""
        return False

    def get_approval_levels(self, document: Any, context: TransitionContext) -> list[str]:
        """Return ordered list of approval levels needed (e.g. ['SUPERVISOR', 'DIRECTOR'])."""
        return []

    def on_document_created(self, document: Any, context: TransitionContext) -> None:
        """Hook called when a new document is first created. Override for setup logic."""

    def get_flow_summary(self) -> dict:
        """Return a human-readable summary of this workflow's state machine."""
        return {
            "tenant": self.TENANT_CODE,
            "module": self.MODULE_CODE,
            "initial_status": self.get_initial_status(),
            "valid_statuses": self.VALID_STATUSES,
            "transitions": {
                from_status: [
                    {
                        "action": t.action,
                        "label": t.label,
                        "to_status": t.to_status,
                        "requires_approval": t.requires_approval,
                    }
                    for t in transitions
                ]
                for from_status, transitions in self.TRANSITIONS.items()
            },
        }

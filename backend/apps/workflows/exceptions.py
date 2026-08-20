"""
Workflow Engine Exceptions.

All workflow-related errors raised by the state machine and validators.
"""


class WorkflowError(Exception):
    """Base class for all workflow errors."""


class WorkflowNotFoundError(WorkflowError):
    """Raised when no workflow is registered for a given tenant + module."""

    def __init__(self, tenant_code: str, module_code: str):
        self.tenant_code = tenant_code
        self.module_code = module_code
        super().__init__(
            f"No workflow registered for tenant='{tenant_code}', module='{module_code}'."
        )


class WorkflowTransitionError(WorkflowError):
    """Raised when a requested status transition is not allowed."""

    def __init__(self, from_status: str, to_status: str, reason: str = ""):
        self.from_status = from_status
        self.to_status = to_status
        self.reason = reason
        msg = f"Transition '{from_status}' to '{to_status}' is not allowed."
        if reason:
            msg += f" Reason: {reason}"
        super().__init__(msg)


class WorkflowValidationError(WorkflowError):
    """Raised when business rules block a transition."""

    def __init__(self, message: str, errors: dict | None = None):
        self.errors = errors or {}
        super().__init__(message)


class InvalidWorkflowStateError(WorkflowError):
    """Raised when a document is in an unknown status."""

    def __init__(self, status: str, module_code: str):
        self.status = status
        self.module_code = module_code
        super().__init__(
            f"Status '{status}' is not recognized for module '{module_code}'."
        )


class WorkflowApprovalRequired(WorkflowError):
    """Raised when a transition requires approval not yet granted."""

    def __init__(self, approval_level: str, document_id: str):
        self.approval_level = approval_level
        self.document_id = document_id
        super().__init__(
            f"Document '{document_id}' requires approval at level '{approval_level}'."
        )

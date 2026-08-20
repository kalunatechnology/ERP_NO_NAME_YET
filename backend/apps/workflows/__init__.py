"""
Workflow Engine — package init and autodiscovery.
"""
from apps.workflows.registry import WorkflowRegistry, register_workflow
from apps.workflows.state_machine import StateMachine
from apps.workflows.base import BaseWorkflow, TransitionContext, TransitionInfo
from apps.workflows.exceptions import (
    WorkflowError,
    WorkflowNotFoundError,
    WorkflowTransitionError,
    WorkflowValidationError,
    WorkflowApprovalRequired,
)

__all__ = [
    'WorkflowRegistry',
    'register_workflow',
    'StateMachine',
    'BaseWorkflow',
    'TransitionContext',
    'TransitionInfo',
    'WorkflowError',
    'WorkflowNotFoundError',
    'WorkflowTransitionError',
    'WorkflowValidationError',
    'WorkflowApprovalRequired',
]


def _autodiscover():
    """Import all tenant workflow modules so @register_workflow decorators fire."""
    import importlib
    modules = [
        'apps.workflows.tenants.default.sales_order',
        'apps.workflows.tenants.default.project',
        'apps.workflows.tenants.default.procurement',
        'apps.workflows.tenants.arsalynk.sales_order',
        'apps.workflows.tenants.arsalynk.project',
        'apps.workflows.tenants.arsalynk.procurement',
    ]
    for m in modules:
        try:
            importlib.import_module(m)
        except ImportError:
            pass

"""
Workflow Registry — Singleton that maps (tenant_code, module_code) → WorkflowClass.

The registry is populated in two ways:
  1. Automatic: via @register_workflow decorator on BaseWorkflow subclasses.
  2. Dynamic: from TenantWorkflowConfig database entries (loaded at startup).

Usage:
    from apps.workflows.registry import WorkflowRegistry

    workflow = WorkflowRegistry.get(tenant_code='arsalynk', module_code='SALES_ORDER')
    transitions = workflow.get_available_transitions(current_status, context)
"""
from __future__ import annotations

import importlib
import logging
from typing import TYPE_CHECKING, Type

from .exceptions import WorkflowNotFoundError

if TYPE_CHECKING:
    from .base import BaseWorkflow

logger = logging.getLogger(__name__)


class _WorkflowRegistry:
    """
    Internal singleton registry.
    Do NOT instantiate directly — use the module-level WorkflowRegistry instance.
    """

    def __init__(self):
        # key: (tenant_code, module_code)  value: BaseWorkflow subclass
        self._registry: dict[tuple[str, str], Type[BaseWorkflow]] = {}
        self._loaded_from_db = False

    # -----------------------------------------------------------------------
    # Registration API
    # -----------------------------------------------------------------------

    def register(self, cls: Type[BaseWorkflow]) -> Type[BaseWorkflow]:
        """Register a workflow class. Called by @register_workflow decorator."""
        key = (cls.TENANT_CODE, cls.MODULE_CODE)
        if not cls.TENANT_CODE or not cls.MODULE_CODE:
            raise ValueError(
                f"Workflow class {cls.__name__} must define TENANT_CODE and MODULE_CODE."
            )
        if key in self._registry:
            existing = self._registry[key].__name__
            logger.warning(
                "Overriding workflow (%s, %s): %s → %s",
                *key, existing, cls.__name__,
            )
        self._registry[key] = cls
        logger.debug("Registered workflow: %s.%s → %s", *key, cls.__name__)
        return cls

    def register_from_path(self, tenant_code: str, module_code: str, class_path: str) -> None:
        """
        Dynamically register a workflow class from a dotted class path string.
        Used for database-driven configuration (TenantWorkflowConfig).

        Example:
            class_path = 'apps.workflows.tenants.arsalynk.sales_order.ArsalynkSalesWorkflow'
        """
        module_path, class_name = class_path.rsplit(".", 1)
        try:
            module = importlib.import_module(module_path)
            cls = getattr(module, class_name)
            # Override key with explicit tenant/module (allows reuse of same class)
            self._registry[(tenant_code, module_code)] = cls
            logger.info(
                "DB-configured workflow registered: (%s, %s) → %s",
                tenant_code, module_code, class_path,
            )
        except (ImportError, AttributeError) as exc:
            logger.error(
                "Failed to load workflow from path '%s': %s", class_path, exc
            )
            raise

    def load_from_db(self) -> None:
        """
        Load workflow configurations from TenantWorkflowConfig table.
        Call this once at Django startup (in AppConfig.ready()).
        DB-configured entries take priority over decorator-registered ones.
        """
        if self._loaded_from_db:
            return
        try:
            from apps.workflows.models import TenantWorkflowConfig
            configs = TenantWorkflowConfig.objects.filter(is_active=True).select_related("tenant")
            for cfg in configs:
                tenant_code = cfg.tenant.code if cfg.tenant else ""
                if tenant_code and cfg.module_code and cfg.workflow_class_path:
                    self.register_from_path(tenant_code, cfg.module_code, cfg.workflow_class_path)
            self._loaded_from_db = True
            logger.info("Loaded %d workflow configs from database.", configs.count())
        except Exception as exc:
            # Table may not exist yet during first migration
            logger.debug("Could not load workflow configs from DB: %s", exc)

    # -----------------------------------------------------------------------
    # Lookup API
    # -----------------------------------------------------------------------

    def get(self, tenant_code: str, module_code: str) -> "BaseWorkflow":
        """
        Return an instantiated workflow for the given tenant + module.
        Falls back to 'default' tenant if no tenant-specific workflow is found.
        Raises WorkflowNotFoundError if no workflow exists at all.
        """
        # Try exact match
        key = (tenant_code, module_code)
        cls = self._registry.get(key)

        # Fallback to default
        if cls is None:
            cls = self._registry.get(("default", module_code))

        if cls is None:
            raise WorkflowNotFoundError(tenant_code, module_code)

        return cls()

    def list_all(self) -> dict:
        """Return a summary of all registered workflows (for debugging/admin)."""
        return {
            f"{t}/{m}": cls.__name__
            for (t, m), cls in self._registry.items()
        }

    def reset(self) -> None:
        """Clear registry — useful in tests."""
        self._registry.clear()
        self._loaded_from_db = False


# Module-level singleton
WorkflowRegistry = _WorkflowRegistry()


def register_workflow(cls: Type[BaseWorkflow]) -> Type[BaseWorkflow]:
    """
    Class decorator to register a workflow with the global registry.

    Usage:
        @register_workflow
        class ArsalynkSalesWorkflow(BaseWorkflow):
            TENANT_CODE = 'arsalynk'
            MODULE_CODE = 'SALES_ORDER'
            ...
    """
    WorkflowRegistry.register(cls)
    return cls

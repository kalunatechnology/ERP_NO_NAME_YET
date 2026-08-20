"""
Workflow Engine Database Models.

TenantWorkflowConfig  — Maps a tenant + module → Python workflow class path.
                        Allows DB-driven workflow configuration (no deploy needed).

WorkflowTransitionLog — Immutable audit trail of every status transition executed
                        through the StateMachine.
"""
from __future__ import annotations

import uuid

from django.db import models


class TenantWorkflowConfig(models.Model):
    """
    Configures which workflow class handles a given module for a specific tenant.

    When the WorkflowRegistry loads from DB, it reads this table and maps
    each (tenant.code, module_code) pair to the given workflow_class_path.

    Example row:
        tenant:              <Tenant: arsalynk>
        module_code:         SALES_ORDER
        workflow_class_path: apps.workflows.tenants.arsalynk.sales_order.ArsalynkSalesWorkflow
        is_active:           True
        config_json:         {"approval_threshold": 10000000}
    """

    MODULE_CHOICES = [
        ("SALES_ORDER", "Sales Order"),
        ("SALES_QUOTATION", "Sales Quotation"),
        ("PROJECT", "Project Lifecycle"),
        ("PURCHASE_ORDER", "Purchase Order"),
        ("INVOICE", "Invoice / Billing"),
        ("PROCUREMENT_REQUEST", "Procurement Request"),
        ("INVENTORY_MOVEMENT", "Inventory Movement"),
        ("CRM_DEAL", "CRM Deal"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "core.Tenant",
        on_delete=models.CASCADE,
        related_name="workflow_configs",
        help_text="Tenant this configuration applies to.",
    )
    module_code = models.CharField(
        max_length=100,
        choices=MODULE_CHOICES,
        help_text="The ERP module this workflow governs.",
    )
    workflow_class_path = models.CharField(
        max_length=500,
        help_text=(
            "Dotted Python path to the workflow class. "
            "Example: apps.workflows.tenants.arsalynk.sales_order.ArsalynkSalesWorkflow"
        ),
    )
    is_active = models.BooleanField(default=True)
    config_json = models.JSONField(
        default=dict,
        blank=True,
        help_text="Optional config parameters passed to the workflow instance.",
    )
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "workflow_tenant_config"
        unique_together = [("tenant", "module_code")]
        verbose_name = "Tenant Workflow Configuration"
        verbose_name_plural = "Tenant Workflow Configurations"

    def __str__(self):
        return f"{self.tenant.code if self.tenant_id else '?'} / {self.module_code}"


class WorkflowTransitionLog(models.Model):
    """
    Immutable audit log of every workflow transition executed via StateMachine.

    Never delete or update rows in this table — it is the source of truth
    for workflow audit trails and compliance reporting.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_code = models.CharField(max_length=100, db_index=True)
    module_code = models.CharField(max_length=100, db_index=True)
    document_id = models.CharField(
        max_length=255,
        db_index=True,
        help_text="UUID or PK of the document that was transitioned.",
    )
    from_status = models.CharField(max_length=100)
    to_status = models.CharField(max_length=100)
    triggered_by = models.CharField(
        max_length=255,
        help_text="UUID of the user who triggered this transition.",
    )
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "workflow_transition_log"
        ordering = ["-created_at"]
        verbose_name = "Workflow Transition Log"
        verbose_name_plural = "Workflow Transition Logs"

    def __str__(self):
        return f"[{self.tenant_code}/{self.module_code}] {self.from_status} → {self.to_status}"

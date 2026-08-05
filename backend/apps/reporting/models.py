"""
Generated Django models for Database Views / Reporting.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class FinanceMainDashboard(models.Model):
    """ERD entity: VIEW_FINANCE_MAIN_DASHBOARD."""

    company_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    calculated_at = models.DateTimeField(null=True, blank=True)
    profit_loss_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    net_cashflow_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_unit_hpp = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    active_alert_count = models.IntegerField(null=True, blank=True)
    periodic_kpi_count = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "view_finance_main_dashboard"
        managed = False

    def __str__(self):
        return str(self.company_id)


class ProjectDashboard(models.Model):
    """ERD entity: VIEW_PROJECT_DASHBOARD."""

    project_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    calculated_at = models.DateTimeField(null=True, blank=True)
    overall_kpi_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    planned_progress_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    actual_progress_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    project_health_status = models.CharField(max_length=255, blank=True, default="")
    overdue_task_count = models.IntegerField(null=True, blank=True)
    unread_notification_count = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "view_project_dashboard"
        managed = False

    def __str__(self):
        return str(self.project_id)


class ProjectTimelineCost(models.Model):
    """ERD entity: VIEW_PROJECT_TIMELINE_COST."""

    project_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    calculated_at = models.DateTimeField(null=True, blank=True)
    labor_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    machine_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    labor_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    equipment_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    material_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    overhead_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_actual_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "view_project_timeline_cost"
        managed = False

    def __str__(self):
        return str(self.project_id)


class CRMSalesDashboard(models.Model):
    """ERD entity: VIEW_CRM_SALES_DASHBOARD."""

    company_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    calculated_at = models.DateTimeField(null=True, blank=True)
    weighted_project_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    win_rate_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    prospect_count = models.IntegerField(null=True, blank=True)
    pitch_count = models.IntegerField(null=True, blank=True)
    closing_count = models.IntegerField(null=True, blank=True)
    offering_margin_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "view_crm_sales_dashboard"
        managed = False

    def __str__(self):
        return str(self.company_id)

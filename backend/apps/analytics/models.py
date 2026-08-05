"""
Generated Django models for Analytics and Dashboard.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Dashboard(models.Model):
    """ERD entity: ANALYTICS_DASHBOARD."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="analytics_dashboard_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="analytics_dashboard_company_set", null=True, blank=True)
    dashboard_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    dashboard_name = models.CharField(max_length=255, blank=True, default="")
    module_code = models.CharField(max_length=255, blank=True, default="")
    dashboard_type = models.CharField(max_length=255, blank=True, default="")
    realtime_enabled = models.BooleanField(default=False)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "analytics_dashboard"

    def __str__(self):
        return str(self.status)


class DashboardRole(models.Model):
    """ERD entity: ANALYTICS_DASHBOARD_ROLE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dashboard = models.ForeignKey("analytics.Dashboard", on_delete=models.PROTECT, db_column="dashboard_id", related_name="analytics_dashboardrole_dashboard_set", null=True, blank=True)
    role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="role_id", related_name="analytics_dashboardrole_role_set", null=True, blank=True)
    is_default = models.BooleanField(default=False)
    can_customize = models.BooleanField(default=False)

    class Meta:
        db_table = "analytics_dashboard_role"

    def __str__(self):
        return str(self.id)


class Widget(models.Model):
    """ERD entity: ANALYTICS_WIDGET."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dashboard = models.ForeignKey("analytics.Dashboard", on_delete=models.PROTECT, db_column="dashboard_id", related_name="analytics_widget_dashboard_set", null=True, blank=True)
    widget_code = models.CharField(max_length=255, blank=True, default="")
    widget_name = models.CharField(max_length=255, blank=True, default="")
    widget_type = models.CharField(max_length=255, blank=True, default="")
    data_source_type = models.CharField(max_length=255, blank=True, default="")
    data_source_name = models.CharField(max_length=255, blank=True, default="")
    filter_json = models.JSONField(default=dict, blank=True)
    layout_json = models.JSONField(default=dict, blank=True)
    refresh_seconds = models.IntegerField(null=True, blank=True)
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "analytics_widget"

    def __str__(self):
        return str(self.id)


class KPIDefinition(models.Model):
    """ERD entity: ANALYTICS_KPI_DEFINITION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="analytics_kpidefinition_tenant_set", null=True, blank=True)
    kpi_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    kpi_name = models.CharField(max_length=255, blank=True, default="")
    module_code = models.CharField(max_length=255, blank=True, default="")
    measurement_unit = models.CharField(max_length=255, blank=True, default="")
    aggregation_method = models.CharField(max_length=255, blank=True, default="")
    source_entity = models.CharField(max_length=255, blank=True, default="")
    formula_expression = models.CharField(max_length=255, blank=True, default="")
    period_type = models.CharField(max_length=255, blank=True, default="")
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "analytics_kpi_definition"

    def __str__(self):
        return str(self.id)


class KPITarget(models.Model):
    """ERD entity: ANALYTICS_KPI_TARGET."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kpi_definition = models.ForeignKey("analytics.KPIDefinition", on_delete=models.PROTECT, db_column="kpi_definition_id", related_name="analytics_kpitarget_kpi_definition_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="analytics_kpitarget_company_set", null=True, blank=True)
    organization = models.ForeignKey("core.Organization", on_delete=models.PROTECT, db_column="organization_id", related_name="analytics_kpitarget_organization_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="analytics_kpitarget_project_set", null=True, blank=True)
    owner_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="owner_user_id", related_name="analytics_kpitarget_owner_user_set", null=True, blank=True)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    target_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    warning_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    critical_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "analytics_kpi_target"

    def __str__(self):
        return str(self.id)


class KPIResult(models.Model):
    """ERD entity: ANALYTICS_KPI_RESULT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kpi_definition = models.ForeignKey("analytics.KPIDefinition", on_delete=models.PROTECT, db_column="kpi_definition_id", related_name="analytics_kpiresult_kpi_definition_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="analytics_kpiresult_company_set", null=True, blank=True)
    organization = models.ForeignKey("core.Organization", on_delete=models.PROTECT, db_column="organization_id", related_name="analytics_kpiresult_organization_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="analytics_kpiresult_project_set", null=True, blank=True)
    owner_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="owner_user_id", related_name="analytics_kpiresult_owner_user_set", null=True, blank=True)
    measured_at = models.DateTimeField(null=True, blank=True)
    actual_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    target_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    health_status = models.CharField(max_length=255, blank=True, default="")
    dimension_json = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "analytics_kpi_result"

    def __str__(self):
        return str(self.id)


class AlertRule(models.Model):
    """ERD entity: ANALYTICS_ALERT_RULE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="analytics_alertrule_tenant_set", null=True, blank=True)
    kpi_definition = models.ForeignKey("analytics.KPIDefinition", on_delete=models.PROTECT, db_column="kpi_definition_id", related_name="analytics_alertrule_kpi_definition_set", null=True, blank=True)
    rule_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    module_code = models.CharField(max_length=255, blank=True, default="")
    entity_name = models.CharField(max_length=255, blank=True, default="")
    operator = models.CharField(max_length=255, blank=True, default="")
    threshold_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    severity = models.CharField(max_length=255, blank=True, default="")
    condition_json = models.JSONField(default=dict, blank=True)
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "analytics_alert_rule"

    def __str__(self):
        return str(self.id)


class AlertEvent(models.Model):
    """ERD entity: ANALYTICS_ALERT_EVENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    alert_rule = models.ForeignKey("analytics.AlertRule", on_delete=models.PROTECT, db_column="alert_rule_id", related_name="analytics_alertevent_alert_rule_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="analytics_alertevent_company_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="analytics_alertevent_project_set", null=True, blank=True)
    source_document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="source_document_id", related_name="analytics_alertevent_source_document_set", null=True, blank=True)
    source_entity_id = models.UUIDField(null=True, blank=True)
    measured_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    severity = models.CharField(max_length=255, blank=True, default="")
    message = models.CharField(max_length=255, blank=True, default="")
    triggered_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="acknowledged_by", related_name="analytics_alertevent_acknowledged_by_set", null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "analytics_alert_event"

    def __str__(self):
        return str(self.status)

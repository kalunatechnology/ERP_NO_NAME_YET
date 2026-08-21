"""
Generated Django models for Project Management.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Project(models.Model):
    """ERD entity: PROJECT_PROJECT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="projects_project_document_set", null=True, blank=True)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="projects_project_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="projects_project_company_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="projects_project_customer_party_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="projects_project_sales_order_set", null=True, blank=True)
    project_manager = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="project_manager_id", related_name="projects_project_project_manager_set", null=True, blank=True)
    cost_center = models.ForeignKey("master_data.CostCenter", on_delete=models.PROTECT, db_column="cost_center_id", related_name="projects_project_cost_center_set", null=True, blank=True)
    project_code = models.CharField(max_length=255, blank=True, default="")
    project_name = models.CharField(max_length=255, blank=True, default="")
    customer_name = models.CharField(max_length=255, blank=True, default="")
    manager_name = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    planned_start_date = models.DateField(null=True, blank=True)
    planned_end_date = models.DateField(null=True, blank=True)
    actual_start_date = models.DateField(null=True, blank=True)
    actual_end_date = models.DateField(null=True, blank=True)
    budget_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True, default=0)
    contract_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True, default=0)
    target_margin_percent = models.DecimalField(max_digits=9, decimal_places=4, null=True, blank=True, default=0)
    progress_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")
    lifecycle_status = models.CharField(max_length=32, blank=True, default="DRAFT")
    health_status = models.CharField(max_length=32, blank=True, default="UNKNOWN")
    source_type = models.CharField(max_length=32, blank=True, default="MANUAL")
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="verified_by", related_name="verified_projects", null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="closed_by", related_name="closed_projects", null=True, blank=True)

    class Meta:
        db_table = "project_project"

    def __str__(self):
        return str(self.project_name)


class ProjectControlItem(models.Model):
    """Editable project register used for resource, risk, quality, and document controls."""

    ITEM_TYPES = (("RESOURCE", "Resource"), ("RISK", "Risk"), ("QUALITY", "Quality"), ("DOCUMENT", "Document"))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="control_items")
    item_type = models.CharField(max_length=16, choices=ITEM_TYPES)
    title = models.CharField(max_length=255)
    owner_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=32, blank=True, default="PLANNED")
    target_date = models.DateField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    description = models.TextField(blank=True, default="")
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_project_control_items", null=True, blank=True)
    updated_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="updated_project_control_items", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_control_item"
        ordering = ["item_type", "target_date", "created_at"]
        indexes = [models.Index(fields=["project", "item_type", "status"], name="project_control_lookup")]


class ProjectExpense(models.Model):
    """Project expense register optionally linked to a live Finance billing document."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="expenses")
    billing_document = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, related_name="project_expenses", null=True, blank=True)
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=32, blank=True, default="OTHER")
    vendor_name = models.CharField(max_length=255, blank=True, default="")
    expense_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    description = models.TextField(blank=True, default="")
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_project_expenses", null=True, blank=True)
    updated_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="updated_project_expenses", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_expense"
        ordering = ["-expense_date", "-created_at"]
        indexes = [models.Index(fields=["project", "expense_date"], name="project_expense_lookup")]


class ProjectLifecycleEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="lifecycle_events")
    from_status = models.CharField(max_length=32, blank=True, default="")
    to_status = models.CharField(max_length=32, blank=True, default="")
    action = models.CharField(max_length=64, blank=True, default="")
    actor = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="project_lifecycle_events", null=True, blank=True)
    note = models.TextField(blank=True, default="")
    payload_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_lifecycle_event"
        ordering = ["-created_at"]


class ProjectReadinessCheck(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="readiness_checks")
    check_type = models.CharField(max_length=64)
    status = models.CharField(max_length=16, default="PENDING")
    message = models.CharField(max_length=255, blank=True, default="")
    blocking = models.BooleanField(default=True)
    checked_at = models.DateTimeField(null=True, blank=True)
    details_json = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "project_readiness_check"
        constraints = [models.UniqueConstraint(fields=["project", "check_type"], name="uniq_project_readiness_type")]


class Member(models.Model):
    """ERD entity: PROJECT_MEMBER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_member_project_set", null=True, blank=True)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="user_id", related_name="projects_member_user_set", null=True, blank=True)
    employee = models.ForeignKey("master_data.Employee", on_delete=models.PROTECT, db_column="employee_id", related_name="projects_member_employee_set", null=True, blank=True)
    project_role = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=32, blank=True, default="ACTIVE")
    permissions_json = models.JSONField(default=dict, blank=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateField(null=True, blank=True)
    left_at = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "project_member"
        constraints = [models.UniqueConstraint(fields=["project", "user"], name="uniq_project_member_user")]
        indexes = [models.Index(fields=["user", "status"], name="project_member_access")]

    def __str__(self):
        return str(self.id)


class Task(models.Model):
    """ERD entity: PROJECT_TASK."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_task_project_set", null=True, blank=True)
    parent_task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="parent_task_id", related_name="projects_task_parent_task_set", null=True, blank=True)
    work_center = models.ForeignKey("master_data.WorkCenter", on_delete=models.PROTECT, db_column="work_center_id", related_name="projects_task_work_center_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="projects_task_production_order_set", null=True, blank=True)
    assigned_to = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="assigned_project_tasks", null=True, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_project_tasks", null=True, blank=True)
    updated_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="updated_project_tasks", null=True, blank=True)
    task_code = models.CharField(max_length=255, blank=True, default="")
    task_name = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    priority = models.CharField(max_length=16, blank=True, default="MEDIUM")
    evidence_json = models.JSONField(default=list, blank=True)
    planned_start_at = models.DateTimeField(null=True, blank=True)
    planned_end_at = models.DateTimeField(null=True, blank=True)
    actual_start_at = models.DateTimeField(null=True, blank=True)
    actual_end_at = models.DateTimeField(null=True, blank=True)
    planned_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    actual_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    progress_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    weight_percent = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        db_table = "project_task"

    def __str__(self):
        return str(self.status)


class TaskDependency(models.Model):
    """ERD entity: PROJECT_TASK_DEPENDENCY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    predecessor_task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="predecessor_task_id", related_name="projects_taskdependency_predecessor_task_set", null=True, blank=True)
    successor_task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="successor_task_id", related_name="projects_taskdependency_successor_task_set", null=True, blank=True)
    dependency_type = models.CharField(max_length=255, blank=True, default="")
    lag_minutes = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "project_task_dependency"

    def __str__(self):
        return str(self.id)


class Milestone(models.Model):
    """ERD entity: PROJECT_MILESTONE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_milestone_project_set", null=True, blank=True)
    owner_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="owned_project_milestones", null=True, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_project_milestones", null=True, blank=True)
    updated_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="updated_project_milestones", null=True, blank=True)
    milestone_name = models.CharField(max_length=255, blank=True, default="")
    planned_date = models.DateField(null=True, blank=True)
    actual_date = models.DateField(null=True, blank=True)
    weight_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        db_table = "project_milestone"

    def __str__(self):
        return str(self.status)


class MaterialRequirement(models.Model):
    """ERD entity: PROJECT_MATERIAL_REQUIREMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_materialrequirement_project_set", null=True, blank=True)
    task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="task_id", related_name="projects_materialrequirement_task_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="projects_materialrequirement_product_set", null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, db_column="warehouse_id", related_name="projects_materialrequirement_warehouse_set", null=True, blank=True)
    required_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    reserved_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    issued_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    required_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_material_requirement"

    def __str__(self):
        return str(self.status)


class BudgetLine(models.Model):
    """ERD entity: PROJECT_BUDGET_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_budgetline_project_set", null=True, blank=True)
    cost_element = models.CharField(max_length=255, blank=True, default="")
    account = models.ForeignKey("finance.Account", on_delete=models.PROTECT, db_column="account_id", related_name="projects_budgetline_account_set", null=True, blank=True)
    cost_center = models.ForeignKey("master_data.CostCenter", on_delete=models.PROTECT, db_column="cost_center_id", related_name="projects_budgetline_cost_center_set", null=True, blank=True)
    budget_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    budget_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    budget_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "project_budget_line"

    def __str__(self):
        return str(self.id)


class Timesheet(models.Model):
    """ERD entity: PROJECT_TIMESHEET."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_timesheet_project_set", null=True, blank=True)
    task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="task_id", related_name="projects_timesheet_task_set", null=True, blank=True)
    employee = models.ForeignKey("master_data.Employee", on_delete=models.PROTECT, db_column="employee_id", related_name="projects_timesheet_employee_set", null=True, blank=True)
    work_date = models.DateField(null=True, blank=True)
    hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    hourly_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    approval_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_timesheet"

    def __str__(self):
        return str(self.id)


class ChangeRequest(models.Model):
    """ERD entity: PROJECT_CHANGE_REQUEST."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="projects_changerequest_document_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_changerequest_project_set", null=True, blank=True)
    change_type = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=255, blank=True, default="")
    schedule_impact_days = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    cost_impact = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    approval_status = models.CharField(max_length=255, blank=True, default="")
    requested_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="requested_project_changes", null=True, blank=True)
    analyzed_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="analyzed_project_changes", null=True, blank=True)
    analyzed_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    client_decided_at = models.DateTimeField(null=True, blank=True)
    client_decision_note = models.TextField(blank=True, default="")
    original_end_date = models.DateField(null=True, blank=True)
    revised_end_date = models.DateField(null=True, blank=True)
    billing_adjustment = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    applied_at = models.DateTimeField(null=True, blank=True)
    applied_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="applied_project_changes", null=True, blank=True)
    status = models.CharField(max_length=32, blank=True, default="DRAFT")

    class Meta:
        db_table = "project_change_request"

    def __str__(self):
        return str(self.id)


class Board(models.Model):
    """ERD entity: PROJECT_BOARD."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_board_project_set", null=True, blank=True)
    board_name = models.CharField(max_length=255, blank=True, default="")
    board_type = models.CharField(max_length=255, blank=True, default="")
    default_board = models.BooleanField(default=False)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_board"

    def __str__(self):
        return str(self.status)


class BoardColumn(models.Model):
    """ERD entity: PROJECT_BOARD_COLUMN."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey("projects.Board", on_delete=models.PROTECT, db_column="board_id", related_name="projects_boardcolumn_board_set", null=True, blank=True)
    column_name = models.CharField(max_length=255, blank=True, default="")
    mapped_task_status = models.CharField(max_length=255, blank=True, default="")
    position_order = models.IntegerField(null=True, blank=True)
    wip_limit = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "project_board_column"

    def __str__(self):
        return str(self.id)


class TaskBoardPosition(models.Model):
    """ERD entity: PROJECT_TASK_BOARD_POSITION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="task_id", related_name="projects_taskboardposition_task_set", null=True, blank=True)
    board_column = models.ForeignKey("projects.BoardColumn", on_delete=models.PROTECT, db_column="board_column_id", related_name="projects_taskboardposition_board_column_set", null=True, blank=True)
    position_order = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    moved_at = models.DateTimeField(null=True, blank=True)
    moved_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="moved_by", related_name="projects_taskboardposition_moved_by_set", null=True, blank=True)

    class Meta:
        db_table = "project_task_board_position"

    def __str__(self):
        return str(self.id)


class HealthRule(models.Model):
    """ERD entity: PROJECT_HEALTH_RULE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="projects_healthrule_company_set", null=True, blank=True)
    rule_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    health_dimension = models.CharField(max_length=255, blank=True, default="")
    operator = models.CharField(max_length=255, blank=True, default="")
    warning_threshold = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    critical_threshold = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    weight_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "project_health_rule"

    def __str__(self):
        return str(self.id)


class HealthSnapshot(models.Model):
    """ERD entity: PROJECT_HEALTH_SNAPSHOT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_healthsnapshot_project_set", null=True, blank=True)
    snapshot_at = models.DateTimeField(null=True, blank=True)
    schedule_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    cost_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    quality_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    resource_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    risk_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    overall_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    health_status = models.CharField(max_length=255, blank=True, default="")
    explanation_json = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "project_health_snapshot"

    def __str__(self):
        return str(self.id)


class Risk(models.Model):
    """ERD entity: PROJECT_RISK."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="projects_risk_document_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_risk_project_set", null=True, blank=True)
    owner_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="owner_user_id", related_name="projects_risk_owner_user_set", null=True, blank=True)
    risk_code = models.CharField(max_length=255, blank=True, default="")
    risk_category = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=255, blank=True, default="")
    probability_score = models.IntegerField(null=True, blank=True)
    impact_score = models.IntegerField(null=True, blank=True)
    risk_score = models.IntegerField(null=True, blank=True)
    mitigation_plan = models.CharField(max_length=255, blank=True, default="")
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_risk"

    def __str__(self):
        return str(self.status)


class Issue(models.Model):
    """ERD entity: PROJECT_ISSUE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="projects_issue_document_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_issue_project_set", null=True, blank=True)
    task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="task_id", related_name="projects_issue_task_set", null=True, blank=True)
    assigned_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="assigned_user_id", related_name="projects_issue_assigned_user_set", null=True, blank=True)
    issue_type = models.CharField(max_length=255, blank=True, default="")
    severity = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=255, blank=True, default="")
    due_date = models.DateField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")
    source_department = models.CharField(max_length=32, blank=True, default="FACTORY")
    root_cause = models.TextField(blank=True, default="")
    milestone_impact = models.TextField(blank=True, default="")
    alert_status = models.CharField(max_length=32, blank=True, default="NONE")
    reported_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="reported_project_issues", null=True, blank=True)
    reported_at = models.DateTimeField(null=True, blank=True)
    analyzed_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="analyzed_project_issues", null=True, blank=True)
    analyzed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "project_issue"

    def __str__(self):
        return str(self.status)


class ChangeRequestMaterial(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    change_request = models.ForeignKey("projects.ChangeRequest", on_delete=models.CASCADE, related_name="material_changes")
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, null=True, blank=True)
    warehouse = models.ForeignKey("master_data.Warehouse", on_delete=models.PROTECT, null=True, blank=True)
    quantity_delta = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    unit_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    reason = models.CharField(max_length=255, blank=True, default="")
    applied_requirement = models.ForeignKey("projects.MaterialRequirement", on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        db_table = "project_change_request_material"


class IssueAction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    issue = models.ForeignKey("projects.Issue", on_delete=models.CASCADE, related_name="actions")
    action_type = models.CharField(max_length=32)
    description = models.TextField(blank=True, default="")
    assigned_to = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="assigned_issue_actions", null=True, blank=True)
    equipment_reference = models.CharField(max_length=255, blank=True, default="")
    additional_labor_hours = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    status = models.CharField(max_length=32, blank=True, default="PLANNED")
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_issue_actions", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "project_issue_action"


class ProjectDispatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="dispatches")
    target_department = models.CharField(max_length=32)
    dispatch_type = models.CharField(max_length=32)
    subject = models.CharField(max_length=255)
    payload_json = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=32, blank=True, default="SENT")
    sent_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="sent_project_dispatches", null=True, blank=True)
    sent_at = models.DateTimeField(auto_now_add=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "project_dispatch"
        constraints = [models.UniqueConstraint(fields=["project", "target_department", "dispatch_type"], name="uniq_project_dispatch_target")]


class TechnicalBrief(models.Model):
    """ERD entity: PROJECT_TECHNICAL_BRIEF."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="projects_technicalbrief_document_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_technicalbrief_project_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="projects_technicalbrief_sales_order_set", null=True, blank=True)
    brief_number = models.CharField(max_length=255, blank=True, default="")
    brief_title = models.CharField(max_length=255, blank=True, default="")
    objective = models.TextField(blank=True, default="")
    scope_summary = models.TextField(blank=True, default="")
    owner_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="owner_user_id", related_name="projects_technicalbrief_owner_user_set", null=True, blank=True)
    approval_status = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_technical_brief"

    def __str__(self):
        return str(self.status)


class TechnicalBriefVersion(models.Model):
    """ERD entity: PROJECT_TECHNICAL_BRIEF_VERSION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    technical_brief = models.ForeignKey("projects.TechnicalBrief", on_delete=models.PROTECT, db_column="technical_brief_id", related_name="projects_technicalbriefversion_technical_brief_set", null=True, blank=True)
    version_number = models.IntegerField(null=True, blank=True)
    specification_text = models.TextField(blank=True, default="")
    specification_json = models.JSONField(default=dict, blank=True)
    file = models.ForeignKey("core.File", on_delete=models.PROTECT, db_column="file_id", related_name="projects_technicalbriefversion_file_set", null=True, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="created_by", related_name="projects_technicalbriefversion_created_by_set", null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_technical_brief_version"

    def __str__(self):
        return str(self.status)


class Requirement(models.Model):
    """ERD entity: PROJECT_REQUIREMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    technical_brief = models.ForeignKey("projects.TechnicalBrief", on_delete=models.PROTECT, db_column="technical_brief_id", related_name="projects_requirement_technical_brief_set", null=True, blank=True)
    parent_requirement = models.ForeignKey("projects.Requirement", on_delete=models.PROTECT, db_column="parent_requirement_id", related_name="projects_requirement_parent_requirement_set", null=True, blank=True)
    requirement_code = models.CharField(max_length=255, blank=True, default="")
    requirement_type = models.CharField(max_length=255, blank=True, default="")
    requirement_text = models.CharField(max_length=255, blank=True, default="")
    priority = models.CharField(max_length=255, blank=True, default="")
    verification_method = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_requirement"

    def __str__(self):
        return str(self.status)


class AcceptanceCriteria(models.Model):
    """ERD entity: PROJECT_ACCEPTANCE_CRITERIA."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey("projects.Requirement", on_delete=models.PROTECT, db_column="requirement_id", related_name="projects_acceptancecriteria_requirement_set", null=True, blank=True)
    criteria_text = models.CharField(max_length=255, blank=True, default="")
    expected_result = models.CharField(max_length=255, blank=True, default="")
    actual_result = models.CharField(max_length=255, blank=True, default="")
    passed = models.BooleanField(default=False)
    verified_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="verified_by", related_name="projects_acceptancecriteria_verified_by_set", null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "project_acceptance_criteria"

    def __str__(self):
        return str(self.id)


class ResourceRequest(models.Model):
    """ERD entity: PROJECT_RESOURCE_REQUEST."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="projects_resourcerequest_document_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_resourcerequest_project_set", null=True, blank=True)
    task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="task_id", related_name="projects_resourcerequest_task_set", null=True, blank=True)
    requested_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="requested_by", related_name="projects_resourcerequest_requested_by_set", null=True, blank=True)
    request_date = models.DateField(null=True, blank=True)
    required_date = models.DateField(null=True, blank=True)
    request_type = models.CharField(max_length=255, blank=True, default="")
    priority = models.CharField(max_length=255, blank=True, default="")
    approval_status = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_resource_request"

    def __str__(self):
        return str(self.status)


class ResourceRequestLine(models.Model):
    """ERD entity: PROJECT_RESOURCE_REQUEST_LINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    resource_request = models.ForeignKey("projects.ResourceRequest", on_delete=models.PROTECT, db_column="resource_request_id", related_name="projects_resourcerequestline_resource_request_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="projects_resourcerequestline_product_set", null=True, blank=True)
    employee = models.ForeignKey("master_data.Employee", on_delete=models.PROTECT, db_column="employee_id", related_name="projects_resourcerequestline_employee_set", null=True, blank=True)
    machine = models.ForeignKey("master_data.Machine", on_delete=models.PROTECT, db_column="machine_id", related_name="projects_resourcerequestline_machine_set", null=True, blank=True)
    work_center = models.ForeignKey("master_data.WorkCenter", on_delete=models.PROTECT, db_column="work_center_id", related_name="projects_resourcerequestline_work_center_set", null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="projects_resourcerequestline_uom_set", null=True, blank=True)
    resource_type = models.CharField(max_length=255, blank=True, default="")
    requested_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    requested_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    specification = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_resource_request_line"

    def __str__(self):
        return str(self.id)


class ResourceAllocation(models.Model):
    """ERD entity: PROJECT_RESOURCE_ALLOCATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    resource_request_line = models.ForeignKey("projects.ResourceRequestLine", on_delete=models.PROTECT, db_column="resource_request_line_id", related_name="projects_resourceallocation_resource_request_line_set", null=True, blank=True)
    stock_reservation = models.ForeignKey("inventory.StockReservation", on_delete=models.PROTECT, db_column="stock_reservation_id", related_name="projects_resourceallocation_stock_reservation_set", null=True, blank=True)
    employee = models.ForeignKey("master_data.Employee", on_delete=models.PROTECT, db_column="employee_id", related_name="projects_resourceallocation_employee_set", null=True, blank=True)
    machine = models.ForeignKey("master_data.Machine", on_delete=models.PROTECT, db_column="machine_id", related_name="projects_resourceallocation_machine_set", null=True, blank=True)
    allocation_start_at = models.DateTimeField(null=True, blank=True)
    allocation_end_at = models.DateTimeField(null=True, blank=True)
    allocated_quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    allocated_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    estimated_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_resource_allocation"

    def __str__(self):
        return str(self.status)


class ProgressSnapshot(models.Model):
    """ERD entity: PROJECT_PROGRESS_SNAPSHOT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_progresssnapshot_project_set", null=True, blank=True)
    work_order = models.ForeignKey("manufacturing.WorkOrder", on_delete=models.PROTECT, db_column="work_order_id", related_name="projects_progresssnapshot_work_order_set", null=True, blank=True)
    snapshot_at = models.DateTimeField(null=True, blank=True)
    planned_progress_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    actual_progress_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    earned_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    planned_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    progress_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_progress_snapshot"

    def __str__(self):
        return str(self.id)


class EquipmentUsage(models.Model):
    """ERD entity: PROJECT_EQUIPMENT_USAGE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_equipmentusage_project_set", null=True, blank=True)
    task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="task_id", related_name="projects_equipmentusage_task_set", null=True, blank=True)
    machine = models.ForeignKey("master_data.Machine", on_delete=models.PROTECT, db_column="machine_id", related_name="projects_equipmentusage_machine_set", null=True, blank=True)
    asset = models.ForeignKey("assets.Asset", on_delete=models.PROTECT, db_column="asset_id", related_name="projects_equipmentusage_asset_set", null=True, blank=True)
    employee = models.ForeignKey("master_data.Employee", on_delete=models.PROTECT, db_column="employee_id", related_name="projects_equipmentusage_employee_set", null=True, blank=True)
    start_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)
    usage_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    hourly_rate = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    total_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_equipment_usage"

    def __str__(self):
        return str(self.status)


class WeightIndicator(models.Model):
    """ERD entity: PROJECT_WEIGHT_INDICATOR."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_weightindicator_project_set", null=True, blank=True)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.PROTECT, db_column="opportunity_id", related_name="projects_weightindicator_opportunity_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="projects_weightindicator_sales_order_set", null=True, blank=True)
    currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="currency_id", related_name="projects_weightindicator_currency_set", null=True, blank=True)
    base_project_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    weight_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    weighted_project_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    calculated_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_weight_indicator"

    def __str__(self):
        return str(self.status)


class WeightComponent(models.Model):
    """ERD entity: PROJECT_WEIGHT_COMPONENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project_weight_indicator = models.ForeignKey("projects.WeightIndicator", on_delete=models.PROTECT, db_column="project_weight_indicator_id", related_name="projects_weightcomponent_project_weight_indicator_set", null=True, blank=True)
    component_code = models.CharField(max_length=255, blank=True, default="")
    component_name = models.CharField(max_length=255, blank=True, default="")
    raw_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    normalized_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    component_weight = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    weighted_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "project_weight_component"

    def __str__(self):
        return str(self.id)


class ProjectWeeklyProgress(models.Model):
    """
    Weekly Project Monitoring & Progress Tracking snapshot entity.
    Stores historical weekly progress, target vs actual gaps, and PM review notes.
    """

    STATUS_CHOICES = (
        ("ON_TRACK", "On Track"),
        ("AT_RISK", "At Risk"),
        ("BEHIND", "Behind"),
        ("COMPLETED", "Completed"),
        ("PLANNED", "Planned"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="weekly_progresses")
    week_number = models.IntegerField()
    start_date = models.DateField()
    end_date = models.DateField()
    target_progress = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    actual_progress = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    previous_progress = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    progress_difference = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    gap_to_target = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="ON_TRACK")
    notes = models.TextField(blank=True, default="")
    issues = models.TextField(blank=True, default="")
    achievements = models.TextField(blank=True, default="")
    next_week_plan = models.TextField(blank=True, default="")
    is_locked = models.BooleanField(default=False)
    recorded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="recorded_weekly_progresses", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_weekly_progress"
        ordering = ["week_number"]
        constraints = [
            models.UniqueConstraint(fields=["project", "week_number"], name="uniq_project_weekly_progress")
        ]

    def __str__(self):
        return f"{self.project.project_code or self.project.id} - Week {self.week_number} ({self.actual_progress}%)"


class ProjectFinancialSnapshot(models.Model):
    """
    Periodic or triggered persistent financial performance snapshot of a project.
    Stores computed Revenue, Cost, Gross Profit, Margins, and Variances.
    """
    STATUS_CHOICES = (
        ("PROFITABLE", "Profitable"),
        ("AT_RISK", "At Risk"),
        ("LOSS_MAKING", "Loss Making"),
        ("BUDGET_OVERRUN", "Budget Overrun"),
        ("BREAK_EVEN", "Break Even"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="financial_snapshots")
    snapshot_date = models.DateField()
    planned_budget = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    actual_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    expected_revenue = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    invoiced_revenue = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    realized_revenue = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    expected_gross_profit = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    actual_gross_profit = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    expected_margin_percent = models.DecimalField(max_digits=9, decimal_places=4, default=0)
    actual_margin_percent = models.DecimalField(max_digits=9, decimal_places=4, default=0)
    budget_variance = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    revenue_variance = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    cost_variance = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    budget_utilization_percent = models.DecimalField(max_digits=9, decimal_places=4, default=0)
    revenue_achievement_percent = models.DecimalField(max_digits=9, decimal_places=4, default=0)
    financial_health_status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PROFITABLE")
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_financial_snapshot"
        ordering = ["-snapshot_date", "-created_at"]
        indexes = [
            models.Index(fields=["project", "snapshot_date"], name="proj_fin_snapshot_lookup")
        ]

    def __str__(self):
        return f"{self.project.project_code or self.project.id} Financial Snapshot ({self.snapshot_date}): Profit {self.actual_gross_profit} ({self.actual_margin_percent}%)"


class ProjectMainTask(models.Model):
    """
    1st Level Hierarchy Task: Main Task defined by PM.
    Represents major milestones and work packages of a Project.
    """

    PRIORITY_CHOICES = (
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("URGENT", "Urgent"),
    )

    STATUS_CHOICES = (
        ("PLANNED", "Planned"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("BLOCKED", "Blocked"),
        ("ON_HOLD", "On Hold"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="main_tasks")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    priority = models.CharField(max_length=16, choices=PRIORITY_CHOICES, default="MEDIUM")
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    weight = models.DecimalField(max_digits=8, decimal_places=4, default=1.0000)
    progress = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PLANNED")
    is_progress_overridden = models.BooleanField(default=False)
    override_reason = models.TextField(blank=True, default="")
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_main_tasks", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_main_task"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["project", "status"], name="proj_main_task_status_idx")
        ]

    def __str__(self):
        return f"[{self.project.project_code}] {self.name} ({self.progress}%)"

    def recalculate_progress(self, save=True):
        from apps.projects.task_hierarchy_services import recalculate_task_tree
        return recalculate_task_tree(main_task=self)


class TaskAssignment(models.Model):
    """
    Assignees designated to a Main Task by the PM.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    main_task = models.ForeignKey("projects.ProjectMainTask", on_delete=models.CASCADE, related_name="assignments")
    assignee = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="main_task_assignments")
    assigned_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="assigned_by_pm", null=True, blank=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_task_assignment"
        constraints = [
            models.UniqueConstraint(fields=["main_task", "assignee"], name="uniq_main_task_assignee")
        ]

    def __str__(self):
        return f"{self.main_task.name} -> {self.assignee.username}"


class ProjectWeeklyTask(models.Model):
    """
    2nd Level Hierarchy Task: Weekly Target breakdown derived from Main Task.
    """

    STATUS_CHOICES = (
        ("PLANNED", "Planned"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("BLOCKED", "Blocked"),
        ("ON_HOLD", "On Hold"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    main_task = models.ForeignKey("projects.ProjectMainTask", on_delete=models.CASCADE, related_name="weekly_tasks")
    assignee = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="assigned_weekly_tasks", null=True, blank=True)
    week_number = models.IntegerField(default=1)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    target_description = models.TextField(blank=True, default="")
    progress = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PLANNED")
    is_progress_overridden = models.BooleanField(default=False)
    override_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_weekly_task"
        ordering = ["week_number", "start_date"]
        indexes = [
            models.Index(fields=["main_task", "week_number"], name="proj_wk_task_week_idx")
        ]

    def __str__(self):
        return f"Week {self.week_number}: {self.main_task.name} ({self.progress}%)"

    def recalculate_progress(self, save=True):
        from apps.projects.task_hierarchy_services import recalculate_task_tree
        return recalculate_task_tree(weekly_task=self)


class ProjectDailyTask(models.Model):
    """
    3rd Level Hierarchy Task: Daily execution task owned by Assignee.
    """

    STATUS_CHOICES = (
        ("NOT_STARTED", "Not Started"),
        ("IN_PROGRESS", "In Progress"),
        ("BLOCKED", "Blocked"),
        ("REVIEW", "In Review"),
        ("COMPLETED", "Completed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    weekly_task = models.ForeignKey("projects.ProjectWeeklyTask", on_delete=models.CASCADE, related_name="daily_tasks")
    owner = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="owned_daily_tasks")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    planned_date = models.DateField(null=True, blank=True)
    time_slot = models.CharField(max_length=64, blank=True, default="")
    output_result = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    progress = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="NOT_STARTED")
    is_blocked = models.BooleanField(default=False)
    block_reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_daily_task"
        ordering = ["planned_date", "created_at"]
        indexes = [
            models.Index(fields=["weekly_task", "planned_date"], name="proj_dl_task_date_idx"),
            models.Index(fields=["owner", "status"], name="proj_dl_task_owner_idx"),
        ]

    def __str__(self):
        return f"[{self.planned_date}] {self.title} ({self.status} - {self.progress}%)"

    def recalculate_progress(self, save=True):
        from apps.projects.task_hierarchy_services import recalculate_task_tree
        return recalculate_task_tree(daily_task=self)



class TaskTransferRequest(models.Model):
    """
    Task Transfer Governance: Request to transfer Daily Task ownership between project members.
    """

    STATUS_CHOICES = (
        ("PENDING", "Pending Review"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("CANCELLED", "Cancelled"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    daily_task = models.ForeignKey("projects.ProjectDailyTask", on_delete=models.CASCADE, related_name="transfer_requests")
    requested_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="sent_task_transfers")
    target_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="received_task_transfers")
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="PENDING")
    reason = models.TextField(blank=True, default="")
    reviewed_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, null=True, blank=True, related_name="reviewed_task_transfers")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_task_transfer_request"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"], name="task_transfer_status_idx")
        ]

    def __str__(self):
        return f"Transfer {self.daily_task.title}: {self.requested_by} -> {self.target_user} ({self.status})"


class TaskActivityLog(models.Model):
    """
    Audit trail for project and hierarchical task changes.
    """

    LEVEL_CHOICES = (
        ("PROJECT", "Project"),
        ("MAIN", "Main Task"),
        ("WEEKLY", "Weekly Task"),
        ("DAILY", "Daily Task"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="task_activity_logs")
    actor = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="task_activities", null=True, blank=True)
    task_level = models.CharField(max_length=16, choices=LEVEL_CHOICES, default="DAILY")
    task_id = models.UUIDField(null=True, blank=True)
    task_title = models.CharField(max_length=255, blank=True, default="")
    action = models.CharField(max_length=64)
    field_name = models.CharField(max_length=64, blank=True, default="")
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_task_activity_log"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["project", "-created_at"], name="task_act_log_proj_idx"),
            models.Index(fields=["task_id", "-created_at"], name="task_act_log_task_idx"),
        ]

    def __str__(self):
        return f"[{self.created_at}] {self.actor}: {self.action} on {self.task_level} ({self.task_title})"


class ProjectEVMRecord(models.Model):
    """
    Earned Value Management (EVM) Snapshot for S-Curve, Schedule Variance, and Cost Performance Tracking.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="evm_records")
    as_of_date = models.DateField()
    week_number = models.IntegerField(default=1)
    planned_value = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)  # PV (Budgeted Cost of Work Scheduled)
    earned_value = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)   # EV (Budgeted Cost of Work Performed)
    actual_cost = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)    # AC (Actual Cost of Work Performed)
    cost_variance = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)  # CV = EV - AC
    schedule_variance = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)  # SV = EV - PV
    cost_performance_index = models.DecimalField(max_digits=7, decimal_places=4, default=1.0000)  # CPI = EV / AC
    schedule_performance_index = models.DecimalField(max_digits=7, decimal_places=4, default=1.0000)  # SPI = EV / PV
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_evm_record"
        ordering = ["as_of_date"]
        indexes = [
            models.Index(fields=["project", "as_of_date"], name="proj_evm_date_idx"),
        ]

    def __str__(self):
        return f"EVM [{self.project.project_code}] W{self.week_number} ({self.as_of_date}) - CPI: {self.cost_performance_index}, SPI: {self.schedule_performance_index}"





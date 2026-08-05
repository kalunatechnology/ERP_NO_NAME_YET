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
    planned_start_date = models.DateField(null=True, blank=True)
    planned_end_date = models.DateField(null=True, blank=True)
    actual_start_date = models.DateField(null=True, blank=True)
    actual_end_date = models.DateField(null=True, blank=True)
    budget_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    progress_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "project_project"

    def __str__(self):
        return str(self.project_name)


class Member(models.Model):
    """ERD entity: PROJECT_MEMBER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_member_project_set", null=True, blank=True)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="user_id", related_name="projects_member_user_set", null=True, blank=True)
    employee = models.ForeignKey("master_data.Employee", on_delete=models.PROTECT, db_column="employee_id", related_name="projects_member_employee_set", null=True, blank=True)
    project_role = models.CharField(max_length=255, blank=True, default="")
    joined_at = models.DateField(null=True, blank=True)
    left_at = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "project_member"

    def __str__(self):
        return str(self.id)


class Task(models.Model):
    """ERD entity: PROJECT_TASK."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="projects_task_project_set", null=True, blank=True)
    parent_task = models.ForeignKey("projects.Task", on_delete=models.PROTECT, db_column="parent_task_id", related_name="projects_task_parent_task_set", null=True, blank=True)
    work_center = models.ForeignKey("master_data.WorkCenter", on_delete=models.PROTECT, db_column="work_center_id", related_name="projects_task_work_center_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="projects_task_production_order_set", null=True, blank=True)
    task_code = models.CharField(max_length=255, blank=True, default="")
    task_name = models.CharField(max_length=255, blank=True, default="")
    planned_start_at = models.DateTimeField(null=True, blank=True)
    planned_end_at = models.DateTimeField(null=True, blank=True)
    actual_start_at = models.DateTimeField(null=True, blank=True)
    actual_end_at = models.DateTimeField(null=True, blank=True)
    planned_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    actual_hours = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    progress_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

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
    milestone_name = models.CharField(max_length=255, blank=True, default="")
    planned_date = models.DateField(null=True, blank=True)
    actual_date = models.DateField(null=True, blank=True)
    weight_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

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

    class Meta:
        db_table = "project_issue"

    def __str__(self):
        return str(self.status)


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

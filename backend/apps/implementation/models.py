"""
Generated Django models for Implementation Roadmap.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Release(models.Model):
    """ERD entity: IMPLEMENTATION_RELEASE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="implementation_release_tenant_set", null=True, blank=True)
    release_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    release_name = models.CharField(max_length=255, blank=True, default="")
    planned_start_date = models.DateField(null=True, blank=True)
    planned_launch_date = models.DateField(null=True, blank=True)
    actual_launch_date = models.DateField(null=True, blank=True)
    release_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "implementation_release"

    def __str__(self):
        return str(self.id)


class Phase(models.Model):
    """ERD entity: IMPLEMENTATION_PHASE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    release = models.ForeignKey("implementation.Release", on_delete=models.PROTECT, db_column="release_id", related_name="implementation_phase_release_set", null=True, blank=True)
    phase_code = models.CharField(max_length=255, blank=True, default="")
    phase_name = models.CharField(max_length=255, blank=True, default="")
    phase_order = models.IntegerField(null=True, blank=True)
    planned_start_date = models.DateField(null=True, blank=True)
    planned_end_date = models.DateField(null=True, blank=True)
    actual_start_date = models.DateField(null=True, blank=True)
    actual_end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "implementation_phase"

    def __str__(self):
        return str(self.status)


class PhaseItem(models.Model):
    """ERD entity: IMPLEMENTATION_PHASE_ITEM."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phase = models.ForeignKey("implementation.Phase", on_delete=models.PROTECT, db_column="phase_id", related_name="implementation_phaseitem_phase_set", null=True, blank=True)
    module_code = models.CharField(max_length=255, blank=True, default="")
    item_type = models.CharField(max_length=255, blank=True, default="")
    item_name = models.CharField(max_length=255, blank=True, default="")
    sequence_order = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "implementation_phase_item"

    def __str__(self):
        return str(self.status)


class Workflow(models.Model):
    """ERD entity: IMPLEMENTATION_WORKFLOW."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    release = models.ForeignKey("implementation.Release", on_delete=models.PROTECT, db_column="release_id", related_name="implementation_workflow_release_set", null=True, blank=True)
    workflow_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    workflow_name = models.CharField(max_length=255, blank=True, default="")
    methodology = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "implementation_workflow"

    def __str__(self):
        return str(self.status)


class WorkflowStage(models.Model):
    """ERD entity: IMPLEMENTATION_WORKFLOW_STAGE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey("implementation.Workflow", on_delete=models.PROTECT, db_column="workflow_id", related_name="implementation_workflowstage_workflow_set", null=True, blank=True)
    stage_code = models.CharField(max_length=255, blank=True, default="")
    stage_name = models.CharField(max_length=255, blank=True, default="")
    stage_order = models.IntegerField(null=True, blank=True)
    stage_type = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "implementation_workflow_stage"

    def __str__(self):
        return str(self.status)


class WorkItem(models.Model):
    """ERD entity: IMPLEMENTATION_WORK_ITEM."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    release = models.ForeignKey("implementation.Release", on_delete=models.PROTECT, db_column="release_id", related_name="implementation_workitem_release_set", null=True, blank=True)
    phase = models.ForeignKey("implementation.Phase", on_delete=models.PROTECT, db_column="phase_id", related_name="implementation_workitem_phase_set", null=True, blank=True)
    workflow_stage = models.ForeignKey("implementation.WorkflowStage", on_delete=models.PROTECT, db_column="workflow_stage_id", related_name="implementation_workitem_workflow_stage_set", null=True, blank=True)
    assigned_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="assigned_user_id", related_name="implementation_workitem_assigned_user_set", null=True, blank=True)
    module_code = models.CharField(max_length=255, blank=True, default="")
    work_item_type = models.CharField(max_length=255, blank=True, default="")
    title = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    planned_start_date = models.DateField(null=True, blank=True)
    planned_end_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "implementation_work_item"

    def __str__(self):
        return str(self.title)


class TestCycle(models.Model):
    """ERD entity: IMPLEMENTATION_TEST_CYCLE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    release = models.ForeignKey("implementation.Release", on_delete=models.PROTECT, db_column="release_id", related_name="implementation_testcycle_release_set", null=True, blank=True)
    phase = models.ForeignKey("implementation.Phase", on_delete=models.PROTECT, db_column="phase_id", related_name="implementation_testcycle_phase_set", null=True, blank=True)
    test_scope = models.CharField(max_length=255, blank=True, default="")
    test_type = models.CharField(max_length=255, blank=True, default="")
    planned_date = models.DateField(null=True, blank=True)
    executed_date = models.DateField(null=True, blank=True)
    passed_count = models.IntegerField(null=True, blank=True)
    failed_count = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "implementation_test_cycle"

    def __str__(self):
        return str(self.status)


class GTMMilestone(models.Model):
    """ERD entity: IMPLEMENTATION_GTM_MILESTONE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    release = models.ForeignKey("implementation.Release", on_delete=models.PROTECT, db_column="release_id", related_name="implementation_gtmmilestone_release_set", null=True, blank=True)
    milestone_type = models.CharField(max_length=255, blank=True, default="")
    milestone_name = models.CharField(max_length=255, blank=True, default="")
    planned_date = models.DateField(null=True, blank=True)
    actual_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "implementation_gtm_milestone"

    def __str__(self):
        return str(self.status)

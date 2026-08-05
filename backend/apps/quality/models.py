"""
Generated Django models for Quality Assurance.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class QualityPlan(models.Model):
    """ERD entity: QA_QUALITY_PLAN."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="quality_qualityplan_tenant_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="quality_qualityplan_product_set", null=True, blank=True)
    plan_code = models.CharField(max_length=255, blank=True, default="")
    inspection_stage = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "qa_quality_plan"

    def __str__(self):
        return str(self.status)


class QualityPlanPoint(models.Model):
    """ERD entity: QA_QUALITY_PLAN_POINT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quality_plan = models.ForeignKey("quality.QualityPlan", on_delete=models.PROTECT, db_column="quality_plan_id", related_name="quality_qualityplanpoint_quality_plan_set", null=True, blank=True)
    sequence_number = models.IntegerField(null=True, blank=True)
    parameter_name = models.CharField(max_length=255, blank=True, default="")
    measurement_type = models.CharField(max_length=255, blank=True, default="")
    minimum_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    maximum_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    target_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    mandatory = models.BooleanField(default=False)

    class Meta:
        db_table = "qa_quality_plan_point"

    def __str__(self):
        return str(self.id)


class Inspection(models.Model):
    """ERD entity: QA_INSPECTION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="quality_inspection_document_set", null=True, blank=True)
    quality_plan = models.ForeignKey("quality.QualityPlan", on_delete=models.PROTECT, db_column="quality_plan_id", related_name="quality_inspection_quality_plan_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="quality_inspection_product_set", null=True, blank=True)
    lot = models.ForeignKey("inventory.Lot", on_delete=models.PROTECT, db_column="lot_id", related_name="quality_inspection_lot_set", null=True, blank=True)
    goods_receipt = models.ForeignKey("procurement.GoodsReceipt", on_delete=models.PROTECT, db_column="goods_receipt_id", related_name="quality_inspection_goods_receipt_set", null=True, blank=True)
    production_order = models.ForeignKey("manufacturing.ProductionOrder", on_delete=models.PROTECT, db_column="production_order_id", related_name="quality_inspection_production_order_set", null=True, blank=True)
    work_order = models.ForeignKey("manufacturing.WorkOrder", on_delete=models.PROTECT, db_column="work_order_id", related_name="quality_inspection_work_order_set", null=True, blank=True)
    inspector_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="inspector_user_id", related_name="quality_inspection_inspector_user_set", null=True, blank=True)
    inspection_type = models.CharField(max_length=255, blank=True, default="")
    quantity_inspected = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    quantity_accepted = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    quantity_rejected = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    inspection_at = models.DateTimeField(null=True, blank=True)
    result = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "qa_inspection"

    def __str__(self):
        return str(self.status)


class InspectionResult(models.Model):
    """ERD entity: QA_INSPECTION_RESULT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inspection = models.ForeignKey("quality.Inspection", on_delete=models.PROTECT, db_column="inspection_id", related_name="quality_inspectionresult_inspection_set", null=True, blank=True)
    plan_point = models.ForeignKey("quality.QualityPlanPoint", on_delete=models.PROTECT, db_column="plan_point_id", related_name="quality_inspectionresult_plan_point_set", null=True, blank=True)
    numeric_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    text_value = models.CharField(max_length=255, blank=True, default="")
    passed = models.BooleanField(default=False)
    remarks = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "qa_inspection_result"

    def __str__(self):
        return str(self.id)


class Nonconformance(models.Model):
    """ERD entity: QA_NONCONFORMANCE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="quality_nonconformance_document_set", null=True, blank=True)
    inspection = models.ForeignKey("quality.Inspection", on_delete=models.PROTECT, db_column="inspection_id", related_name="quality_nonconformance_inspection_set", null=True, blank=True)
    severity = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=255, blank=True, default="")
    disposition = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "qa_nonconformance"

    def __str__(self):
        return str(self.status)


class CorrectiveAction(models.Model):
    """ERD entity: QA_CORRECTIVE_ACTION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nonconformance = models.ForeignKey("quality.Nonconformance", on_delete=models.PROTECT, db_column="nonconformance_id", related_name="quality_correctiveaction_nonconformance_set", null=True, blank=True)
    assigned_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="assigned_user_id", related_name="quality_correctiveaction_assigned_user_set", null=True, blank=True)
    action_description = models.CharField(max_length=255, blank=True, default="")
    due_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    verification_result = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "qa_corrective_action"

    def __str__(self):
        return str(self.status)

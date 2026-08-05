"""
Generated Django models for Customer Service.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Case(models.Model):
    """ERD entity: SERVICE_CASE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="service_case_document_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="service_case_customer_party_set", null=True, blank=True)
    contact = models.ForeignKey("master_data.Contact", on_delete=models.PROTECT, db_column="contact_id", related_name="service_case_contact_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="service_case_sales_order_set", null=True, blank=True)
    billing_document = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, db_column="billing_document_id", related_name="service_case_billing_document_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="service_case_product_set", null=True, blank=True)
    serial_number = models.ForeignKey("inventory.SerialNumber", on_delete=models.PROTECT, db_column="serial_number_id", related_name="service_case_serial_number_set", null=True, blank=True)
    assigned_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="assigned_user_id", related_name="service_case_assigned_user_set", null=True, blank=True)
    priority = models.CharField(max_length=255, blank=True, default="")
    subject = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=255, blank=True, default="")
    sla_due_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "service_case"

    def __str__(self):
        return str(self.subject)


class CaseMessage(models.Model):
    """ERD entity: SERVICE_CASE_MESSAGE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_case = models.ForeignKey("service.Case", on_delete=models.PROTECT, db_column="service_case_id", related_name="service_casemessage_service_case_set", null=True, blank=True)
    sender_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="sender_user_id", related_name="service_casemessage_sender_user_set", null=True, blank=True)
    channel = models.CharField(max_length=255, blank=True, default="")
    message_text = models.CharField(max_length=255, blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "service_case_message"

    def __str__(self):
        return str(self.id)


class CaseApproval(models.Model):
    """ERD entity: SERVICE_CASE_APPROVAL."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_case = models.ForeignKey("service.Case", on_delete=models.PROTECT, db_column="service_case_id", related_name="service_caseapproval_service_case_set", null=True, blank=True)
    approver_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="approver_user_id", related_name="service_caseapproval_approver_user_set", null=True, blank=True)
    approval_type = models.CharField(max_length=255, blank=True, default="")
    approved_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    decision = models.CharField(max_length=255, blank=True, default="")
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "service_case_approval"

    def __str__(self):
        return str(self.id)


class Resolution(models.Model):
    """ERD entity: SERVICE_RESOLUTION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    service_case = models.ForeignKey("service.Case", on_delete=models.PROTECT, db_column="service_case_id", related_name="service_resolution_service_case_set", null=True, blank=True)
    resolution_type = models.CharField(max_length=255, blank=True, default="")
    resolution_notes = models.CharField(max_length=255, blank=True, default="")
    credit_note = models.ForeignKey("finance.BillingDocument", on_delete=models.PROTECT, db_column="credit_note_id", related_name="service_resolution_credit_note_set", null=True, blank=True)
    replacement_delivery = models.ForeignKey("sales.Delivery", on_delete=models.PROTECT, db_column="replacement_delivery_id", related_name="service_resolution_replacement_delivery_set", null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "service_resolution"

    def __str__(self):
        return str(self.id)

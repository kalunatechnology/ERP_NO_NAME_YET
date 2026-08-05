"""
Generated Django models for Core.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Tenant(models.Model):
    """ERD entity: CORE_TENANT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=255, unique=True, blank=True, default="")
    name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_tenant"

    def __str__(self):
        return str(self.name)


class Company(models.Model):
    """ERD entity: CORE_COMPANY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="core_company_tenant_set", null=True, blank=True)
    company_code = models.CharField(max_length=255, blank=True, default="")
    legal_name = models.CharField(max_length=255, blank=True, default="")
    tax_number = models.CharField(max_length=255, blank=True, default="")
    base_currency = models.ForeignKey("master_data.Currency", on_delete=models.PROTECT, db_column="base_currency_id", related_name="core_company_base_currency_set", null=True, blank=True)
    fiscal_year_start = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "core_company"

    def __str__(self):
        return str(self.legal_name)


class Organization(models.Model):
    """ERD entity: CORE_ORGANIZATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="core_organization_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="core_organization_company_set", null=True, blank=True)
    parent = models.ForeignKey("core.Organization", on_delete=models.PROTECT, db_column="parent_id", related_name="core_organization_parent_set", null=True, blank=True)
    organization_code = models.CharField(max_length=255, blank=True, default="")
    organization_name = models.CharField(max_length=255, blank=True, default="")
    organization_type = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "core_organization"

    def __str__(self):
        return str(self.organization_name)


class BusinessDocument(models.Model):
    """ERD entity: CORE_BUSINESS_DOCUMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="core_businessdocument_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="core_businessdocument_company_set", null=True, blank=True)
    document_type = models.CharField(max_length=255, blank=True, default="")
    document_number = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")
    document_date = models.DateField(null=True, blank=True)
    posting_date = models.DateField(null=True, blank=True)
    version = models.IntegerField(null=True, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="created_by", related_name="core_businessdocument_created_by_set", null=True, blank=True)
    approved_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="approved_by", related_name="core_businessdocument_approved_by_set", null=True, blank=True)
    posted_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="posted_by", related_name="core_businessdocument_posted_by_set", null=True, blank=True)
    reversal_of = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="reversal_of_id", related_name="core_businessdocument_reversal_of_set", null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_business_document"

    def __str__(self):
        return str(self.document_number)


class DocumentLink(models.Model):
    """ERD entity: CORE_DOCUMENT_LINK."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="source_document_id", related_name="core_documentlink_source_document_set", null=True, blank=True)
    target_document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="target_document_id", related_name="core_documentlink_target_document_set", null=True, blank=True)
    link_type = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_document_link"

    def __str__(self):
        return str(self.id)


class WorkflowInstance(models.Model):
    """ERD entity: CORE_WORKFLOW_INSTANCE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="core_workflowinstance_document_set", null=True, blank=True)
    workflow_code = models.CharField(max_length=255, blank=True, default="")
    current_state = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_workflow_instance"

    def __str__(self):
        return str(self.status)


class WorkflowApproval(models.Model):
    """ERD entity: CORE_WORKFLOW_APPROVAL."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow_instance = models.ForeignKey("core.WorkflowInstance", on_delete=models.PROTECT, db_column="workflow_instance_id", related_name="core_workflowapproval_workflow_instance_set", null=True, blank=True)
    approver_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="approver_user_id", related_name="core_workflowapproval_approver_user_set", null=True, blank=True)
    approval_level = models.CharField(max_length=255, blank=True, default="")
    decision = models.CharField(max_length=255, blank=True, default="")
    remarks = models.CharField(max_length=255, blank=True, default="")
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_workflow_approval"

    def __str__(self):
        return str(self.id)


class AuditEvent(models.Model):
    """ERD entity: CORE_AUDIT_EVENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="core_auditevent_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="core_auditevent_company_set", null=True, blank=True)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="core_auditevent_document_set", null=True, blank=True)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="user_id", related_name="core_auditevent_user_set", null=True, blank=True)
    entity_name = models.CharField(max_length=255, blank=True, default="")
    entity_id = models.UUIDField(null=True, blank=True)
    event_type = models.CharField(max_length=255, blank=True, default="")
    before_data = models.JSONField(default=dict, blank=True)
    after_data = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_audit_event"

    def __str__(self):
        return str(self.id)


class Notification(models.Model):
    """ERD entity: CORE_NOTIFICATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="core_notification_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="core_notification_company_set", null=True, blank=True)
    source_document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="source_document_id", related_name="core_notification_source_document_set", null=True, blank=True)
    alert_event = models.ForeignKey("analytics.AlertEvent", on_delete=models.PROTECT, db_column="alert_event_id", related_name="core_notification_alert_event_set", null=True, blank=True)
    notification_type = models.CharField(max_length=255, blank=True, default="")
    title = models.CharField(max_length=255, blank=True, default="")
    message = models.CharField(max_length=255, blank=True, default="")
    action_url = models.CharField(max_length=255, blank=True, default="")
    priority = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_notification"

    def __str__(self):
        return str(self.title)


class NotificationRecipient(models.Model):
    """ERD entity: CORE_NOTIFICATION_RECIPIENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = models.ForeignKey("core.Notification", on_delete=models.PROTECT, db_column="notification_id", related_name="core_notificationrecipient_notification_set", null=True, blank=True)
    recipient_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="recipient_user_id", related_name="core_notificationrecipient_recipient_user_set", null=True, blank=True)
    recipient_role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, db_column="recipient_role_id", related_name="core_notificationrecipient_recipient_role_set", null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)
    delivery_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "core_notification_recipient"

    def __str__(self):
        return str(self.id)


class QuickAction(models.Model):
    """ERD entity: CORE_QUICK_ACTION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="core_quickaction_tenant_set", null=True, blank=True)
    action_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    action_name = models.CharField(max_length=255, blank=True, default="")
    module_code = models.CharField(max_length=255, blank=True, default="")
    entity_name = models.CharField(max_length=255, blank=True, default="")
    route_path = models.CharField(max_length=255, blank=True, default="")
    required_permission = models.ForeignKey("accounts.Permission", on_delete=models.PROTECT, db_column="required_permission_id", related_name="core_quickaction_required_permission_set", null=True, blank=True)
    default_payload = models.JSONField(default=dict, blank=True)
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "core_quick_action"

    def __str__(self):
        return str(self.id)


class File(models.Model):
    """ERD entity: CORE_FILE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="core_file_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="core_file_company_set", null=True, blank=True)
    file_name = models.CharField(max_length=255, blank=True, default="")
    storage_key = models.CharField(max_length=255, blank=True, default="")
    mime_type = models.CharField(max_length=255, blank=True, default="")
    file_size = models.BigIntegerField(null=True, blank=True)
    checksum = models.CharField(max_length=255, blank=True, default="")
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="uploaded_by", related_name="core_file_uploaded_by_set", null=True, blank=True)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "core_file"

    def __str__(self):
        return str(self.status)


class DocumentAttachment(models.Model):
    """ERD entity: CORE_DOCUMENT_ATTACHMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="core_documentattachment_document_set", null=True, blank=True)
    file = models.ForeignKey("core.File", on_delete=models.PROTECT, db_column="file_id", related_name="core_documentattachment_file_set", null=True, blank=True)
    attachment_type = models.CharField(max_length=255, blank=True, default="")
    sort_order = models.IntegerField(null=True, blank=True)
    visible_to_customer = models.BooleanField(default=False)

    class Meta:
        db_table = "core_document_attachment"

    def __str__(self):
        return str(self.id)


class DocumentTemplate(models.Model):
    """ERD entity: CORE_DOCUMENT_TEMPLATE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="core_documenttemplate_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="core_documenttemplate_company_set", null=True, blank=True)
    template_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    template_name = models.CharField(max_length=255, blank=True, default="")
    document_type = models.CharField(max_length=255, blank=True, default="")
    output_format = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "core_document_template"

    def __str__(self):
        return str(self.status)


class DocumentTemplateVersion(models.Model):
    """ERD entity: CORE_DOCUMENT_TEMPLATE_VERSION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey("core.DocumentTemplate", on_delete=models.PROTECT, db_column="template_id", related_name="core_documenttemplateversion_template_set", null=True, blank=True)
    version_number = models.IntegerField(null=True, blank=True)
    header_markup = models.TextField(blank=True, default="")
    body_markup = models.TextField(blank=True, default="")
    footer_markup = models.TextField(blank=True, default="")
    style_json = models.JSONField(default=dict, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "core_document_template_version"

    def __str__(self):
        return str(self.status)


class DocumentTemplateField(models.Model):
    """ERD entity: CORE_DOCUMENT_TEMPLATE_FIELD."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template_version = models.ForeignKey("core.DocumentTemplateVersion", on_delete=models.PROTECT, db_column="template_version_id", related_name="core_documenttemplatefield_template_version_set", null=True, blank=True)
    field_code = models.CharField(max_length=255, blank=True, default="")
    source_path = models.CharField(max_length=255, blank=True, default="")
    field_type = models.CharField(max_length=255, blank=True, default="")
    format_pattern = models.CharField(max_length=255, blank=True, default="")
    required = models.BooleanField(default=False)
    sort_order = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "core_document_template_field"

    def __str__(self):
        return str(self.id)


class GeneratedDocument(models.Model):
    """ERD entity: CORE_GENERATED_DOCUMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business_document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="business_document_id", related_name="core_generateddocument_business_document_set", null=True, blank=True)
    template_version = models.ForeignKey("core.DocumentTemplateVersion", on_delete=models.PROTECT, db_column="template_version_id", related_name="core_generateddocument_template_version_set", null=True, blank=True)
    file = models.ForeignKey("core.File", on_delete=models.PROTECT, db_column="file_id", related_name="core_generateddocument_file_set", null=True, blank=True)
    generation_number = models.IntegerField(null=True, blank=True)
    generation_status = models.CharField(max_length=255, blank=True, default="")
    generated_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="generated_by", related_name="core_generateddocument_generated_by_set", null=True, blank=True)
    generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_generated_document"

    def __str__(self):
        return str(self.id)


class DocumentSignature(models.Model):
    """ERD entity: CORE_DOCUMENT_SIGNATURE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    generated_document = models.ForeignKey("core.GeneratedDocument", on_delete=models.PROTECT, db_column="generated_document_id", related_name="core_documentsignature_generated_document_set", null=True, blank=True)
    signer_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="signer_user_id", related_name="core_documentsignature_signer_user_set", null=True, blank=True)
    signer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="signer_party_id", related_name="core_documentsignature_signer_party_set", null=True, blank=True)
    signature_type = models.CharField(max_length=255, blank=True, default="")
    signature_status = models.CharField(max_length=255, blank=True, default="")
    requested_at = models.DateTimeField(null=True, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    verification_reference = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "core_document_signature"

    def __str__(self):
        return str(self.id)

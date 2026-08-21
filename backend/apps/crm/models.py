"""
Generated Django models for CRM.

Source: ERP Database ERD — 100% Information Architecture, 3 August 2026.
Review nullability, choices, indexes, and on_delete policies before production rollout.
"""

import uuid

from django.db import models


class Lead(models.Model):
    """ERD entity: CRM_LEAD."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="crm_lead_document_set", null=True, blank=True)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="crm_lead_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="crm_lead_company_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="crm_lead_party_set", null=True, blank=True)
    owner_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="owner_user_id", related_name="crm_lead_owner_user_set", null=True, blank=True)
    lead_source = models.CharField(max_length=255, blank=True, default="")
    lead_status = models.CharField(max_length=255, blank=True, default="")
    estimated_value = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    expected_close_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "crm_lead"

    def __str__(self):
        return str(self.id)


class Opportunity(models.Model):
    """ERD entity: CRM_OPPORTUNITY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, related_name="crm_opportunities", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="crm_opportunities", null=True, blank=True)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="crm_opportunity_document_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="crm_opportunity_customer_party_set", null=True, blank=True)
    lead = models.ForeignKey("crm.Lead", on_delete=models.PROTECT, db_column="lead_id", related_name="crm_opportunity_lead_set", null=True, blank=True)
    owner_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="owner_user_id", related_name="crm_opportunity_owner_user_set", null=True, blank=True)
    pipeline_stage = models.CharField(max_length=255, blank=True, default="")
    stage = models.ForeignKey("crm.PipelineStage", on_delete=models.PROTECT, related_name="opportunities", null=True, blank=True)
    opportunity_name = models.CharField(max_length=255, blank=True, default="")
    lost_reason = models.TextField(blank=True, default="")
    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    probability_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    expected_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    expected_margin = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    expected_close_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_opportunity"

    def __str__(self):
        return str(self.status)


class OpportunityProduct(models.Model):
    """ERD entity: CRM_OPPORTUNITY_PRODUCT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.PROTECT, db_column="opportunity_id", related_name="crm_opportunityproduct_opportunity_set", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, db_column="product_id", related_name="crm_opportunityproduct_product_set", null=True, blank=True)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, db_column="uom_id", related_name="crm_opportunityproduct_uom_set", null=True, blank=True)
    estimated_unit_price = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    estimated_cost = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "crm_opportunity_product"

    def __str__(self):
        return str(self.id)


class Activity(models.Model):
    """ERD entity: CRM_ACTIVITY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.PROTECT, db_column="opportunity_id", related_name="crm_activity_opportunity_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="crm_activity_party_set", null=True, blank=True)
    assigned_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="assigned_user_id", related_name="crm_activity_assigned_user_set", null=True, blank=True)
    activity_type = models.CharField(max_length=255, blank=True, default="")
    subject = models.CharField(max_length=255, blank=True, default="")
    scheduled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_activity"

    def __str__(self):
        return str(self.subject)


class Pipeline(models.Model):
    """ERD entity: CRM_PIPELINE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="crm_pipeline_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="crm_pipeline_company_set", null=True, blank=True)
    pipeline_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    pipeline_name = models.CharField(max_length=255, blank=True, default="")
    default_pipeline = models.BooleanField(default=False)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_pipeline"

    def __str__(self):
        return str(self.status)


class PipelineStage(models.Model):
    """ERD entity: CRM_PIPELINE_STAGE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pipeline = models.ForeignKey("crm.Pipeline", on_delete=models.PROTECT, db_column="pipeline_id", related_name="crm_pipelinestage_pipeline_set", null=True, blank=True)
    stage_code = models.CharField(max_length=255, blank=True, default="")
    stage_name = models.CharField(max_length=255, blank=True, default="")
    position_order = models.IntegerField(null=True, blank=True)
    default_probability_percent = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    closed_won = models.BooleanField(default=False)
    closed_lost = models.BooleanField(default=False)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_pipeline_stage"

    def __str__(self):
        return str(self.status)


class OpportunityStageHistory(models.Model):
    """ERD entity: CRM_OPPORTUNITY_STAGE_HISTORY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.PROTECT, db_column="opportunity_id", related_name="crm_opportunitystagehistory_opportunity_set", null=True, blank=True)
    from_stage = models.ForeignKey("crm.PipelineStage", on_delete=models.PROTECT, db_column="from_stage_id", related_name="crm_opportunitystagehistory_from_stage_set", null=True, blank=True)
    to_stage = models.ForeignKey("crm.PipelineStage", on_delete=models.PROTECT, db_column="to_stage_id", related_name="crm_opportunitystagehistory_to_stage_set", null=True, blank=True)
    changed_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="changed_by", related_name="crm_opportunitystagehistory_changed_by_set", null=True, blank=True)
    changed_at = models.DateTimeField(null=True, blank=True)
    change_reason = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_opportunity_stage_history"

    def __str__(self):
        return str(self.id)


class ExecutiveApproval(models.Model):
    """ERD entity: CRM_EXECUTIVE_APPROVAL."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="crm_executive_approvals", null=True, blank=True)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="crm_executiveapproval_document_set", null=True, blank=True)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.PROTECT, db_column="opportunity_id", related_name="crm_executiveapproval_opportunity_set", null=True, blank=True)
    quotation = models.ForeignKey("sales.Quotation", on_delete=models.PROTECT, db_column="quotation_id", related_name="crm_executiveapproval_quotation_set", null=True, blank=True)
    contract = models.ForeignKey("sales.Contract", on_delete=models.PROTECT, db_column="contract_id", related_name="crm_executiveapproval_contract_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="crm_executiveapproval_project_set", null=True, blank=True)
    requested_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="requested_by", related_name="crm_executiveapproval_requested_by_set", null=True, blank=True)
    approver_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="approver_user_id", related_name="crm_executiveapproval_approver_user_set", null=True, blank=True)
    approval_type = models.CharField(max_length=255, blank=True, default="")
    requested_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    decision = models.CharField(max_length=255, blank=True, default="")
    remarks = models.CharField(max_length=255, blank=True, default="")
    requested_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "crm_executive_approval"

    def __str__(self):
        return str(self.id)


class CreditStatusSnapshot(models.Model):
    """ERD entity: CRM_CREDIT_STATUS_SNAPSHOT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="crm_creditstatussnapshot_customer_party_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="crm_creditstatussnapshot_company_set", null=True, blank=True)
    snapshot_at = models.DateTimeField(null=True, blank=True)
    credit_limit = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    outstanding_receivable = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    overdue_amount = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    available_credit = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    risk_category = models.CharField(max_length=255, blank=True, default="")
    credit_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_credit_status_snapshot"

    def __str__(self):
        return str(self.id)


class ChannelAccount(models.Model):
    """ERD entity: CRM_CHANNEL_ACCOUNT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="crm_channelaccount_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="crm_channelaccount_company_set", null=True, blank=True)
    channel_type = models.CharField(max_length=255, blank=True, default="")
    account_name = models.CharField(max_length=255, blank=True, default="")
    external_account_id = models.CharField(max_length=255, blank=True, default="")
    credential_reference = models.CharField(max_length=255, blank=True, default="")
    active = models.BooleanField(default=False)

    class Meta:
        db_table = "crm_channel_account"

    def __str__(self):
        return str(self.id)


class Conversation(models.Model):
    """ERD entity: CRM_CONVERSATION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    channel_account = models.ForeignKey("crm.ChannelAccount", on_delete=models.PROTECT, db_column="channel_account_id", related_name="crm_conversation_channel_account_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="crm_conversation_customer_party_set", null=True, blank=True)
    contact = models.ForeignKey("master_data.Contact", on_delete=models.PROTECT, db_column="contact_id", related_name="crm_conversation_contact_set", null=True, blank=True)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.PROTECT, db_column="opportunity_id", related_name="crm_conversation_opportunity_set", null=True, blank=True)
    service_case = models.ForeignKey("service.Case", on_delete=models.PROTECT, db_column="service_case_id", related_name="crm_conversation_service_case_set", null=True, blank=True)
    assigned_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="assigned_user_id", related_name="crm_conversation_assigned_user_set", null=True, blank=True)
    external_conversation_id = models.CharField(max_length=255, blank=True, default="")
    subject = models.CharField(max_length=255, blank=True, default="")
    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    priority = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_conversation"

    def __str__(self):
        return str(self.subject)


class ConversationParticipant(models.Model):
    """ERD entity: CRM_CONVERSATION_PARTICIPANT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey("crm.Conversation", on_delete=models.PROTECT, db_column="conversation_id", related_name="crm_conversationparticipant_conversation_set", null=True, blank=True)
    party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="party_id", related_name="crm_conversationparticipant_party_set", null=True, blank=True)
    contact = models.ForeignKey("master_data.Contact", on_delete=models.PROTECT, db_column="contact_id", related_name="crm_conversationparticipant_contact_set", null=True, blank=True)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="user_id", related_name="crm_conversationparticipant_user_set", null=True, blank=True)
    participant_type = models.CharField(max_length=255, blank=True, default="")
    joined_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "crm_conversation_participant"

    def __str__(self):
        return str(self.id)


class Message(models.Model):
    """ERD entity: CRM_MESSAGE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey("crm.Conversation", on_delete=models.PROTECT, db_column="conversation_id", related_name="crm_message_conversation_set", null=True, blank=True)
    sender_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, db_column="sender_user_id", related_name="crm_message_sender_user_set", null=True, blank=True)
    sender_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="sender_party_id", related_name="crm_message_sender_party_set", null=True, blank=True)
    external_message_id = models.CharField(max_length=255, blank=True, default="")
    direction = models.CharField(max_length=255, blank=True, default="")
    message_type = models.CharField(max_length=255, blank=True, default="")
    message_text = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_message"

    def __str__(self):
        return str(self.status)


class MessageAttachment(models.Model):
    """ERD entity: CRM_MESSAGE_ATTACHMENT."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey("crm.Message", on_delete=models.PROTECT, db_column="message_id", related_name="crm_messageattachment_message_set", null=True, blank=True)
    file = models.ForeignKey("core.File", on_delete=models.PROTECT, db_column="file_id", related_name="crm_messageattachment_file_set", null=True, blank=True)
    attachment_type = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_message_attachment"

    def __str__(self):
        return str(self.id)


class MessageDeliveryStatus(models.Model):
    """ERD entity: CRM_MESSAGE_DELIVERY_STATUS."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey("crm.Message", on_delete=models.PROTECT, db_column="message_id", related_name="crm_messagedeliverystatus_message_set", null=True, blank=True)
    delivery_status = models.CharField(max_length=255, blank=True, default="")
    status_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=255, blank=True, default="")
    failure_message = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_message_delivery_status"

    def __str__(self):
        return str(self.id)


class Feedback(models.Model):
    """ERD entity: CRM_FEEDBACK."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, db_column="document_id", related_name="crm_feedback_document_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="crm_feedback_customer_party_set", null=True, blank=True)
    contact = models.ForeignKey("master_data.Contact", on_delete=models.PROTECT, db_column="contact_id", related_name="crm_feedback_contact_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="crm_feedback_project_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="crm_feedback_sales_order_set", null=True, blank=True)
    delivery = models.ForeignKey("sales.Delivery", on_delete=models.PROTECT, db_column="delivery_id", related_name="crm_feedback_delivery_set", null=True, blank=True)
    service_case = models.ForeignKey("service.Case", on_delete=models.PROTECT, db_column="service_case_id", related_name="crm_feedback_service_case_set", null=True, blank=True)
    feedback_type = models.CharField(max_length=255, blank=True, default="")
    rating_value = models.IntegerField(null=True, blank=True)
    nps_score = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    feedback_text = models.TextField(blank=True, default="")
    submitted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_feedback"

    def __str__(self):
        return str(self.status)


class Survey(models.Model):
    """ERD entity: CRM_SURVEY."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, db_column="tenant_id", related_name="crm_survey_tenant_set", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, db_column="company_id", related_name="crm_survey_company_set", null=True, blank=True)
    survey_code = models.CharField(max_length=255, unique=True, blank=True, default="")
    survey_name = models.CharField(max_length=255, blank=True, default="")
    survey_type = models.CharField(max_length=255, blank=True, default="")
    active_from = models.DateField(null=True, blank=True)
    active_to = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_survey"

    def __str__(self):
        return str(self.status)


class SurveyQuestion(models.Model):
    """ERD entity: CRM_SURVEY_QUESTION."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    survey = models.ForeignKey("crm.Survey", on_delete=models.PROTECT, db_column="survey_id", related_name="crm_surveyquestion_survey_set", null=True, blank=True)
    question_text = models.CharField(max_length=255, blank=True, default="")
    answer_type = models.CharField(max_length=255, blank=True, default="")
    required = models.BooleanField(default=False)
    position_order = models.IntegerField(null=True, blank=True)
    option_json = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "crm_survey_question"

    def __str__(self):
        return str(self.id)


class SurveyResponse(models.Model):
    """ERD entity: CRM_SURVEY_RESPONSE."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    survey = models.ForeignKey("crm.Survey", on_delete=models.PROTECT, db_column="survey_id", related_name="crm_surveyresponse_survey_set", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, db_column="customer_party_id", related_name="crm_surveyresponse_customer_party_set", null=True, blank=True)
    contact = models.ForeignKey("master_data.Contact", on_delete=models.PROTECT, db_column="contact_id", related_name="crm_surveyresponse_contact_set", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, db_column="project_id", related_name="crm_surveyresponse_project_set", null=True, blank=True)
    sales_order = models.ForeignKey("sales.Order", on_delete=models.PROTECT, db_column="sales_order_id", related_name="crm_surveyresponse_sales_order_set", null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    response_status = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "crm_survey_response"

    def __str__(self):
        return str(self.id)


class SurveyAnswer(models.Model):
    """ERD entity: CRM_SURVEY_ANSWER."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    response = models.ForeignKey("crm.SurveyResponse", on_delete=models.PROTECT, db_column="response_id", related_name="crm_surveyanswer_response_set", null=True, blank=True)
    question = models.ForeignKey("crm.SurveyQuestion", on_delete=models.PROTECT, db_column="question_id", related_name="crm_surveyanswer_question_set", null=True, blank=True)
    numeric_answer = models.DecimalField(max_digits=24, decimal_places=6, null=True, blank=True)
    text_answer = models.TextField(blank=True, default="")
    option_answer = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "crm_survey_answer"

    def __str__(self):
        return str(self.id)


class CustomerInquiry(models.Model):
    """Incoming customer question that starts the CRM commercial workflow."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, related_name="crm_inquiries", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="crm_inquiries", null=True, blank=True)
    document = models.ForeignKey("core.BusinessDocument", on_delete=models.PROTECT, related_name="crm_inquiries", null=True, blank=True)
    customer_party = models.ForeignKey("master_data.Party", on_delete=models.PROTECT, related_name="crm_inquiries", null=True, blank=True)
    contact = models.ForeignKey("master_data.Contact", on_delete=models.PROTECT, related_name="crm_inquiries", null=True, blank=True)
    owner_user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="owned_crm_inquiries", null=True, blank=True)
    opportunity = models.OneToOneField("crm.Opportunity", on_delete=models.PROTECT, related_name="source_inquiry", null=True, blank=True)
    inquiry_number = models.CharField(max_length=64, blank=True, default="")
    source_channel = models.CharField(max_length=32, blank=True, default="MANUAL")
    subject = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    customer_name = models.CharField(max_length=255, blank=True, default="")
    customer_email = models.EmailField(blank=True, default="")
    expected_delivery_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=32, blank=True, default="NEW")
    qualified_at = models.DateTimeField(null=True, blank=True)
    quoted_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "crm_customer_inquiry"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["company", "status"], name="crm_inquiry_queue")]


class InquiryRequirement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inquiry = models.ForeignKey("crm.CustomerInquiry", on_delete=models.CASCADE, related_name="requirements")
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, related_name="crm_inquiry_requirements", null=True, blank=True)
    uom = models.ForeignKey("master_data.UOM", on_delete=models.PROTECT, related_name="crm_inquiry_requirements", null=True, blank=True)
    requirement_type = models.CharField(max_length=32, blank=True, default="PRODUCT")
    description = models.CharField(max_length=255)
    specification_json = models.JSONField(default=dict, blank=True)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, default=1)
    target_unit_price = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    status = models.CharField(max_length=32, blank=True, default="DRAFT")

    class Meta:
        db_table = "crm_inquiry_requirement"


class CostEstimate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("core.Tenant", on_delete=models.PROTECT, related_name="crm_cost_estimates", null=True, blank=True)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="crm_cost_estimates", null=True, blank=True)
    inquiry = models.ForeignKey("crm.CustomerInquiry", on_delete=models.PROTECT, related_name="cost_estimates", null=True, blank=True)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.PROTECT, related_name="cost_estimates", null=True, blank=True)
    estimate_number = models.CharField(max_length=64, blank=True, default="")
    version_number = models.PositiveIntegerField(default=1)
    direct_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    overhead_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    contingency_amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    total_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    markup_percent = models.DecimalField(max_digits=9, decimal_places=6, default=0)
    offered_amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    margin_amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    margin_percent = models.DecimalField(max_digits=9, decimal_places=6, default=0)
    status = models.CharField(max_length=32, blank=True, default="DRAFT")
    calculated_at = models.DateTimeField(null=True, blank=True)
    calculated_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="calculated_crm_estimates", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "crm_cost_estimate"
        constraints = [models.UniqueConstraint(fields=["inquiry", "version_number"], name="crm_estimate_inquiry_version")]


class CostEstimateLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    estimate = models.ForeignKey("crm.CostEstimate", on_delete=models.CASCADE, related_name="lines")
    requirement = models.ForeignKey("crm.InquiryRequirement", on_delete=models.PROTECT, related_name="estimate_lines", null=True, blank=True)
    product = models.ForeignKey("master_data.Product", on_delete=models.PROTECT, related_name="crm_estimate_lines", null=True, blank=True)
    cost_element = models.CharField(max_length=32, blank=True, default="MATERIAL")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, default=1)
    unit_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    calculation_source = models.CharField(max_length=32, blank=True, default="MANUAL")

    class Meta:
        db_table = "crm_cost_estimate_line"


class QuotationVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quotation = models.ForeignKey("sales.Quotation", on_delete=models.CASCADE, related_name="versions")
    estimate = models.ForeignKey("crm.CostEstimate", on_delete=models.PROTECT, related_name="quotation_versions", null=True, blank=True)
    version_number = models.PositiveIntegerField(default=1)
    subtotal = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    tax_amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    total_amount = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    estimated_cost = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    margin_percent = models.DecimalField(max_digits=9, decimal_places=6, default=0)
    payload_json = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="created_quotation_versions", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "crm_quotation_version"
        constraints = [models.UniqueConstraint(fields=["quotation", "version_number"], name="crm_quotation_version_unique")]


class QuotationDelivery(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quotation = models.ForeignKey("sales.Quotation", on_delete=models.CASCADE, related_name="deliveries")
    version = models.ForeignKey("crm.QuotationVersion", on_delete=models.PROTECT, related_name="deliveries", null=True, blank=True)
    channel = models.CharField(max_length=32, blank=True, default="EMAIL")
    recipient = models.CharField(max_length=255, blank=True, default="")
    external_reference = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=32, blank=True, default="QUEUED")
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "crm_quotation_delivery"


class CRMWorkflowEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, related_name="crm_workflow_events", null=True, blank=True)
    inquiry = models.ForeignKey("crm.CustomerInquiry", on_delete=models.CASCADE, related_name="workflow_events", null=True, blank=True)
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.CASCADE, related_name="workflow_events", null=True, blank=True)
    event_type = models.CharField(max_length=64)
    from_status = models.CharField(max_length=32, blank=True, default="")
    to_status = models.CharField(max_length=32, blank=True, default="")
    actor = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="crm_workflow_events", null=True, blank=True)
    payload_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "crm_workflow_event"
        ordering = ["-created_at"]


class CustomerFeedback(models.Model):
    """
    Customer Satisfaction Survey, Deliverable Review & Post-Project Feedback.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("core.Company", on_delete=models.PROTECT, null=True, blank=True, related_name="customer_feedbacks")
    customer = models.ForeignKey("master_data.Party", on_delete=models.CASCADE, related_name="crm_feedbacks", null=True, blank=True)
    project = models.ForeignKey("projects.Project", on_delete=models.SET_NULL, null=True, blank=True, related_name="customer_feedbacks")
    lead = models.ForeignKey("crm.Lead", on_delete=models.SET_NULL, null=True, blank=True, related_name="customer_feedbacks")
    opportunity = models.ForeignKey("crm.Opportunity", on_delete=models.SET_NULL, null=True, blank=True, related_name="customer_feedbacks")
    rating = models.IntegerField(default=5)  # 1 to 5
    feedback_type = models.CharField(max_length=64, default="PROJECT_COMPLETION")  # ONBOARDING, SERVICE_TICKET, PROJECT_COMPLETION, GENERAL
    aspect_quality = models.IntegerField(default=5)
    aspect_timeline = models.IntegerField(default=5)
    aspect_communication = models.IntegerField(default=5)
    comments = models.TextField(blank=True, default="")
    submitted_by_name = models.CharField(max_length=255, blank=True, default="")
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "crm_customer_feedback"
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"Feedback ({self.rating}/5) by {self.submitted_by_name or 'Client'} - {self.feedback_type}"


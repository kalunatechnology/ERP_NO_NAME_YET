from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.core.models import Tenant, Company, Organization, BusinessDocument, DocumentLink, WorkflowInstance, WorkflowApproval, AuditEvent, Notification, NotificationRecipient, QuickAction, File, DocumentAttachment, DocumentTemplate, DocumentTemplateVersion, DocumentTemplateField, GeneratedDocument, DocumentSignature

class TenantSerializer(ERPModelSerializer):
    class Meta:
        model = Tenant
        fields = "__all__"


class CompanySerializer(ERPModelSerializer):
    class Meta:
        model = Company
        fields = "__all__"


class OrganizationSerializer(ERPModelSerializer):
    class Meta:
        model = Organization
        fields = "__all__"


class BusinessDocumentSerializer(ERPModelSerializer):
    class Meta:
        model = BusinessDocument
        fields = "__all__"


class DocumentLinkSerializer(ERPModelSerializer):
    class Meta:
        model = DocumentLink
        fields = "__all__"


class WorkflowInstanceSerializer(ERPModelSerializer):
    class Meta:
        model = WorkflowInstance
        fields = "__all__"


class WorkflowApprovalSerializer(ERPModelSerializer):
    class Meta:
        model = WorkflowApproval
        fields = "__all__"


class AuditEventSerializer(ERPModelSerializer):
    class Meta:
        model = AuditEvent
        fields = "__all__"


class NotificationSerializer(ERPModelSerializer):
    class Meta:
        model = Notification
        fields = "__all__"


class NotificationRecipientSerializer(ERPModelSerializer):
    class Meta:
        model = NotificationRecipient
        fields = "__all__"


class QuickActionSerializer(ERPModelSerializer):
    class Meta:
        model = QuickAction
        fields = "__all__"


class FileSerializer(ERPModelSerializer):
    class Meta:
        model = File
        fields = "__all__"


class DocumentAttachmentSerializer(ERPModelSerializer):
    class Meta:
        model = DocumentAttachment
        fields = "__all__"


class DocumentTemplateSerializer(ERPModelSerializer):
    class Meta:
        model = DocumentTemplate
        fields = "__all__"


class DocumentTemplateVersionSerializer(ERPModelSerializer):
    class Meta:
        model = DocumentTemplateVersion
        fields = "__all__"


class DocumentTemplateFieldSerializer(ERPModelSerializer):
    class Meta:
        model = DocumentTemplateField
        fields = "__all__"


class GeneratedDocumentSerializer(ERPModelSerializer):
    class Meta:
        model = GeneratedDocument
        fields = "__all__"


class DocumentSignatureSerializer(ERPModelSerializer):
    class Meta:
        model = DocumentSignature
        fields = "__all__"



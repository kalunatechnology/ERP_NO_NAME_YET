from django.contrib.auth import get_user_model
from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.core.models import (
    Tenant, Company, Organization, BusinessDocument, DocumentLink,
    WorkflowInstance, WorkflowApproval, AuditEvent, Notification,
    NotificationRecipient, QuickAction, File, DocumentAttachment,
    DocumentTemplate, DocumentTemplateVersion, DocumentTemplateField,
    GeneratedDocument, DocumentSignature, UserRecentItem, AppNotification,
    ActivityFeed, TeamContact
)

User = get_user_model()

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


class UserMiniSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'email', 'avatar_url', 'is_active']

    def get_full_name(self, obj):
        full = f"{obj.first_name} {obj.last_name}".strip()
        return full or obj.username

    def get_avatar_url(self, obj):
        return getattr(obj, 'avatar_url', '') or ''


class UserRecentItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserRecentItem
        fields = ['id', 'item_type', 'object_id', 'title', 'target_url', 'last_accessed_at']


class AppNotificationSerializer(serializers.ModelSerializer):
    actor = UserMiniSerializer(read_only=True)
    formatted_time = serializers.SerializerMethodField()

    class Meta:
        model = AppNotification
        fields = ['id', 'actor', 'category', 'title', 'description', 'target_url', 'is_read', 'created_at', 'formatted_time']

    def get_formatted_time(self, obj):
        if not obj.created_at:
            return ""
        return obj.created_at.strftime("%I:%M %p")


class ActivityFeedSerializer(serializers.ModelSerializer):
    actor = UserMiniSerializer(read_only=True)
    formatted_time = serializers.SerializerMethodField()

    class Meta:
        model = ActivityFeed
        fields = ['id', 'actor', 'verb', 'target_name', 'target_url', 'created_at', 'formatted_time']

    def get_formatted_time(self, obj):
        if not obj.created_at:
            return ""
        return obj.created_at.strftime("%b %d, %I:%M %p")


class TeamContactSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)

    class Meta:
        model = TeamContact
        fields = ['id', 'user', 'display_order', 'is_pinned', 'custom_status']




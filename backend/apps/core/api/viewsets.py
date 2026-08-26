from django.contrib.auth import get_user_model
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.core.models import (
    Tenant, Company, Organization, BusinessDocument, DocumentLink,
    WorkflowInstance, WorkflowApproval, AuditEvent, Notification,
    NotificationRecipient, QuickAction, File, DocumentAttachment,
    DocumentTemplate, DocumentTemplateVersion, DocumentTemplateField,
    GeneratedDocument, DocumentSignature, UserRecentItem, AppNotification,
    ActivityFeed, TeamContact
)
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import (
    TenantSerializer, CompanySerializer, OrganizationSerializer,
    BusinessDocumentSerializer, DocumentLinkSerializer, WorkflowInstanceSerializer,
    WorkflowApprovalSerializer, AuditEventSerializer, NotificationSerializer,
    NotificationRecipientSerializer, QuickActionSerializer, FileSerializer,
    DocumentAttachmentSerializer, DocumentTemplateSerializer,
    DocumentTemplateVersionSerializer, DocumentTemplateFieldSerializer,
    GeneratedDocumentSerializer, DocumentSignatureSerializer,
    UserRecentItemSerializer, AppNotificationSerializer,
    ActivityFeedSerializer, UserMiniSerializer, TeamContactSerializer
)

User = get_user_model()

class TenantViewSet(BaseERPModelViewSet):
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer


class CompanyViewSet(BaseERPModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer


class OrganizationViewSet(BaseERPModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer


class BusinessDocumentViewSet(BaseERPModelViewSet):
    queryset = BusinessDocument.objects.all()
    serializer_class = BusinessDocumentSerializer


class DocumentLinkViewSet(BaseERPModelViewSet):
    queryset = DocumentLink.objects.all()
    serializer_class = DocumentLinkSerializer


class WorkflowInstanceViewSet(BaseERPModelViewSet):
    queryset = WorkflowInstance.objects.all()
    serializer_class = WorkflowInstanceSerializer


class WorkflowApprovalViewSet(BaseERPModelViewSet):
    queryset = WorkflowApproval.objects.all()
    serializer_class = WorkflowApprovalSerializer


class AuditEventViewSet(BaseERPModelViewSet):
    queryset = AuditEvent.objects.all()
    serializer_class = AuditEventSerializer


class NotificationViewSet(BaseERPModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer


class NotificationRecipientViewSet(BaseERPModelViewSet):
    queryset = NotificationRecipient.objects.all()
    serializer_class = NotificationRecipientSerializer


class QuickActionViewSet(BaseERPModelViewSet):
    queryset = QuickAction.objects.all()
    serializer_class = QuickActionSerializer


class FileViewSet(BaseERPModelViewSet):
    queryset = File.objects.all()
    serializer_class = FileSerializer


class DocumentAttachmentViewSet(BaseERPModelViewSet):
    queryset = DocumentAttachment.objects.all()
    serializer_class = DocumentAttachmentSerializer


class DocumentTemplateViewSet(BaseERPModelViewSet):
    queryset = DocumentTemplate.objects.all()
    serializer_class = DocumentTemplateSerializer


class DocumentTemplateVersionViewSet(BaseERPModelViewSet):
    queryset = DocumentTemplateVersion.objects.all()
    serializer_class = DocumentTemplateVersionSerializer


class DocumentTemplateFieldViewSet(BaseERPModelViewSet):
    queryset = DocumentTemplateField.objects.all()
    serializer_class = DocumentTemplateFieldSerializer


class GeneratedDocumentViewSet(BaseERPModelViewSet):
    queryset = GeneratedDocument.objects.all()
    serializer_class = GeneratedDocumentSerializer


class DocumentSignatureViewSet(BaseERPModelViewSet):
    queryset = DocumentSignature.objects.all()
    serializer_class = DocumentSignatureSerializer


class RightSidebarFeedViewSet(viewsets.ViewSet):
    """Endpoint agregasi tunggal untuk me-load data Right Sidebar secara efisien"""
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        user = request.user
        
        # 1. Notifications (Limit 5)
        notifications = AppNotification.objects.filter(recipient=user).select_related('actor')[:5]
        
        # 2. Activities (Limit 8)
        activities = ActivityFeed.objects.select_related('actor')[:8]
        
        # 3. Contacts (Semua user aktif di tenant/company yang sama)
        contacts = User.objects.filter(is_active=True).exclude(id=user.id)[:10]

        return Response({
            "notifications": AppNotificationSerializer(notifications, many=True).data,
            "activities": ActivityFeedSerializer(activities, many=True).data,
            "contacts": UserMiniSerializer(contacts, many=True).data
        })

    @action(detail=False, methods=['post'], url_path='mark-read')
    def mark_notifications_read(self, request):
        AppNotification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"status": "all notifications marked as read"}, status=status.HTTP_200_OK)


class UserRecentItemViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserRecentItemSerializer

    def get_queryset(self):
        return UserRecentItem.objects.filter(user=self.request.user)[:8]

    @action(detail=False, methods=['post'], url_path='track')
    def track_access(self, request):
        """Mencatat item yang baru dibuka ke daftar Recently Opened"""
        item_type = request.data.get('item_type')
        object_id = str(request.data.get('object_id', ''))
        title = request.data.get('title')
        target_url = request.data.get('target_url')

        if not all([item_type, object_id, title, target_url]):
            return Response({"error": "Missing parameters"}, status=status.HTTP_400_BAD_REQUEST)

        recent, _ = UserRecentItem.objects.update_or_create(
            user=request.user,
            object_id=object_id,
            defaults={
                'item_type': item_type,
                'title': title,
                'target_url': target_url
            }
        )
        return Response(UserRecentItemSerializer(recent).data, status=status.HTTP_200_OK)


class TeamContactViewSet(BaseERPModelViewSet):
    queryset = TeamContact.objects.all()
    serializer_class = TeamContactSerializer




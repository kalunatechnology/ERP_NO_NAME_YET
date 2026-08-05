from apps.core.models import Tenant, Company, Organization, BusinessDocument, DocumentLink, WorkflowInstance, WorkflowApproval, AuditEvent, Notification, NotificationRecipient, QuickAction, File, DocumentAttachment, DocumentTemplate, DocumentTemplateVersion, DocumentTemplateField, GeneratedDocument, DocumentSignature
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import TenantSerializer, CompanySerializer, OrganizationSerializer, BusinessDocumentSerializer, DocumentLinkSerializer, WorkflowInstanceSerializer, WorkflowApprovalSerializer, AuditEventSerializer, NotificationSerializer, NotificationRecipientSerializer, QuickActionSerializer, FileSerializer, DocumentAttachmentSerializer, DocumentTemplateSerializer, DocumentTemplateVersionSerializer, DocumentTemplateFieldSerializer, GeneratedDocumentSerializer, DocumentSignatureSerializer

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



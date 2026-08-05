from rest_framework.routers import DefaultRouter
from .viewsets import TenantViewSet, CompanyViewSet, OrganizationViewSet, BusinessDocumentViewSet, DocumentLinkViewSet, WorkflowInstanceViewSet, WorkflowApprovalViewSet, AuditEventViewSet, NotificationViewSet, NotificationRecipientViewSet, QuickActionViewSet, FileViewSet, DocumentAttachmentViewSet, DocumentTemplateViewSet, DocumentTemplateVersionViewSet, DocumentTemplateFieldViewSet, GeneratedDocumentViewSet, DocumentSignatureViewSet

app_name = "core"
router = DefaultRouter()
router.register(r"tenants", TenantViewSet, basename="tenant")
router.register(r"companies", CompanyViewSet, basename="company")
router.register(r"organizations", OrganizationViewSet, basename="organization")
router.register(r"business-documents", BusinessDocumentViewSet, basename="business-document")
router.register(r"document-links", DocumentLinkViewSet, basename="document-link")
router.register(r"workflow-instances", WorkflowInstanceViewSet, basename="workflow-instance")
router.register(r"workflow-approvals", WorkflowApprovalViewSet, basename="workflow-approval")
router.register(r"audit-events", AuditEventViewSet, basename="audit-event")
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"notification-recipients", NotificationRecipientViewSet, basename="notification-recipient")
router.register(r"quick-actions", QuickActionViewSet, basename="quick-action")
router.register(r"files", FileViewSet, basename="file")
router.register(r"document-attachments", DocumentAttachmentViewSet, basename="document-attachment")
router.register(r"document-templates", DocumentTemplateViewSet, basename="document-template")
router.register(r"document-template-versions", DocumentTemplateVersionViewSet, basename="document-template-version")
router.register(r"document-template-fields", DocumentTemplateFieldViewSet, basename="document-template-field")
router.register(r"generated-documents", GeneratedDocumentViewSet, basename="generated-document")
router.register(r"document-signatures", DocumentSignatureViewSet, basename="document-signature")

urlpatterns = router.urls

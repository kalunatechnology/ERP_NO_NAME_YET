from rest_framework.routers import DefaultRouter
from .viewsets import CaseViewSet, CaseMessageViewSet, CaseApprovalViewSet, ResolutionViewSet

app_name = "service"
router = DefaultRouter()
router.register(r"cases", CaseViewSet, basename="case")
router.register(r"case-messages", CaseMessageViewSet, basename="case-message")
router.register(r"case-approvals", CaseApprovalViewSet, basename="case-approval")
router.register(r"resolutions", ResolutionViewSet, basename="resolution")

urlpatterns = router.urls

from rest_framework.routers import DefaultRouter
from .viewsets import QualityPlanViewSet, QualityPlanPointViewSet, InspectionViewSet, InspectionResultViewSet, NonconformanceViewSet, CorrectiveActionViewSet

app_name = "quality"
router = DefaultRouter()
router.register(r"quality-plans", QualityPlanViewSet, basename="quality-plan")
router.register(r"quality-plan-points", QualityPlanPointViewSet, basename="quality-plan-point")
router.register(r"inspections", InspectionViewSet, basename="inspection")
router.register(r"inspection-results", InspectionResultViewSet, basename="inspection-result")
router.register(r"nonconformances", NonconformanceViewSet, basename="nonconformance")
router.register(r"corrective-actions", CorrectiveActionViewSet, basename="corrective-action")

urlpatterns = router.urls

from rest_framework.routers import DefaultRouter
from .viewsets import FinanceMainDashboardViewSet, ProjectDashboardViewSet, ProjectTimelineCostViewSet, CRMSalesDashboardViewSet

app_name = "reporting"
router = DefaultRouter()
router.register(r"finance-main-dashboards", FinanceMainDashboardViewSet, basename="finance-main-dashboard")
router.register(r"project-dashboards", ProjectDashboardViewSet, basename="project-dashboard")
router.register(r"project-timeline-costs", ProjectTimelineCostViewSet, basename="project-timeline-cost")
router.register(r"crm-sales-dashboards", CRMSalesDashboardViewSet, basename="crm-sales-dashboard")

urlpatterns = router.urls

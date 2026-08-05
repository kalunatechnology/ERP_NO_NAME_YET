from rest_framework.routers import DefaultRouter
from .viewsets import DashboardViewSet, DashboardRoleViewSet, WidgetViewSet, KPIDefinitionViewSet, KPITargetViewSet, KPIResultViewSet, AlertRuleViewSet, AlertEventViewSet

app_name = "analytics"
router = DefaultRouter()
router.register(r"dashboards", DashboardViewSet, basename="dashboard")
router.register(r"dashboard-roles", DashboardRoleViewSet, basename="dashboard-role")
router.register(r"widgets", WidgetViewSet, basename="widget")
router.register(r"kpi-definitions", KPIDefinitionViewSet, basename="kpi-definition")
router.register(r"kpi-targets", KPITargetViewSet, basename="kpi-target")
router.register(r"kpi-results", KPIResultViewSet, basename="kpi-result")
router.register(r"alert-rules", AlertRuleViewSet, basename="alert-rule")
router.register(r"alert-events", AlertEventViewSet, basename="alert-event")

urlpatterns = router.urls

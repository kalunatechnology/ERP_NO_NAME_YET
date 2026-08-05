from apps.analytics.models import Dashboard, DashboardRole, Widget, KPIDefinition, KPITarget, KPIResult, AlertRule, AlertEvent
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import DashboardSerializer, DashboardRoleSerializer, WidgetSerializer, KPIDefinitionSerializer, KPITargetSerializer, KPIResultSerializer, AlertRuleSerializer, AlertEventSerializer

class DashboardViewSet(BaseERPModelViewSet):
    queryset = Dashboard.objects.all()
    serializer_class = DashboardSerializer


class DashboardRoleViewSet(BaseERPModelViewSet):
    queryset = DashboardRole.objects.all()
    serializer_class = DashboardRoleSerializer


class WidgetViewSet(BaseERPModelViewSet):
    queryset = Widget.objects.all()
    serializer_class = WidgetSerializer


class KPIDefinitionViewSet(BaseERPModelViewSet):
    queryset = KPIDefinition.objects.all()
    serializer_class = KPIDefinitionSerializer


class KPITargetViewSet(BaseERPModelViewSet):
    queryset = KPITarget.objects.all()
    serializer_class = KPITargetSerializer


class KPIResultViewSet(BaseERPModelViewSet):
    queryset = KPIResult.objects.all()
    serializer_class = KPIResultSerializer


class AlertRuleViewSet(BaseERPModelViewSet):
    queryset = AlertRule.objects.all()
    serializer_class = AlertRuleSerializer


class AlertEventViewSet(BaseERPModelViewSet):
    queryset = AlertEvent.objects.all()
    serializer_class = AlertEventSerializer



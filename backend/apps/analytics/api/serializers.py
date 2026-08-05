from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.analytics.models import Dashboard, DashboardRole, Widget, KPIDefinition, KPITarget, KPIResult, AlertRule, AlertEvent

class DashboardSerializer(ERPModelSerializer):
    class Meta:
        model = Dashboard
        fields = "__all__"


class DashboardRoleSerializer(ERPModelSerializer):
    class Meta:
        model = DashboardRole
        fields = "__all__"


class WidgetSerializer(ERPModelSerializer):
    class Meta:
        model = Widget
        fields = "__all__"


class KPIDefinitionSerializer(ERPModelSerializer):
    class Meta:
        model = KPIDefinition
        fields = "__all__"


class KPITargetSerializer(ERPModelSerializer):
    class Meta:
        model = KPITarget
        fields = "__all__"


class KPIResultSerializer(ERPModelSerializer):
    class Meta:
        model = KPIResult
        fields = "__all__"


class AlertRuleSerializer(ERPModelSerializer):
    class Meta:
        model = AlertRule
        fields = "__all__"


class AlertEventSerializer(ERPModelSerializer):
    class Meta:
        model = AlertEvent
        fields = "__all__"



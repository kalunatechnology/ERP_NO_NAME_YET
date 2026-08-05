from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.reporting.models import FinanceMainDashboard, ProjectDashboard, ProjectTimelineCost, CRMSalesDashboard

class FinanceMainDashboardSerializer(ERPModelSerializer):
    class Meta:
        model = FinanceMainDashboard
        fields = "__all__"


class ProjectDashboardSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectDashboard
        fields = "__all__"


class ProjectTimelineCostSerializer(ERPModelSerializer):
    class Meta:
        model = ProjectTimelineCost
        fields = "__all__"


class CRMSalesDashboardSerializer(ERPModelSerializer):
    class Meta:
        model = CRMSalesDashboard
        fields = "__all__"



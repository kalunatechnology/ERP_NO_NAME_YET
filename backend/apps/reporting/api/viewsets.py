from apps.reporting.models import FinanceMainDashboard, ProjectDashboard, ProjectTimelineCost, CRMSalesDashboard
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import FinanceMainDashboardSerializer, ProjectDashboardSerializer, ProjectTimelineCostSerializer, CRMSalesDashboardSerializer

class FinanceMainDashboardViewSet(ReadOnlyERPModelViewSet):
    queryset = FinanceMainDashboard.objects.all()
    serializer_class = FinanceMainDashboardSerializer


class ProjectDashboardViewSet(ReadOnlyERPModelViewSet):
    queryset = ProjectDashboard.objects.all()
    serializer_class = ProjectDashboardSerializer


class ProjectTimelineCostViewSet(ReadOnlyERPModelViewSet):
    queryset = ProjectTimelineCost.objects.all()
    serializer_class = ProjectTimelineCostSerializer


class CRMSalesDashboardViewSet(ReadOnlyERPModelViewSet):
    queryset = CRMSalesDashboard.objects.all()
    serializer_class = CRMSalesDashboardSerializer



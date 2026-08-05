from apps.quality.models import QualityPlan, QualityPlanPoint, Inspection, InspectionResult, Nonconformance, CorrectiveAction
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import QualityPlanSerializer, QualityPlanPointSerializer, InspectionSerializer, InspectionResultSerializer, NonconformanceSerializer, CorrectiveActionSerializer

class QualityPlanViewSet(BaseERPModelViewSet):
    queryset = QualityPlan.objects.all()
    serializer_class = QualityPlanSerializer


class QualityPlanPointViewSet(BaseERPModelViewSet):
    queryset = QualityPlanPoint.objects.all()
    serializer_class = QualityPlanPointSerializer


class InspectionViewSet(BaseERPModelViewSet):
    queryset = Inspection.objects.all()
    serializer_class = InspectionSerializer


class InspectionResultViewSet(BaseERPModelViewSet):
    queryset = InspectionResult.objects.all()
    serializer_class = InspectionResultSerializer


class NonconformanceViewSet(BaseERPModelViewSet):
    queryset = Nonconformance.objects.all()
    serializer_class = NonconformanceSerializer


class CorrectiveActionViewSet(BaseERPModelViewSet):
    queryset = CorrectiveAction.objects.all()
    serializer_class = CorrectiveActionSerializer



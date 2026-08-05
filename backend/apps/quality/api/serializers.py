from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.quality.models import QualityPlan, QualityPlanPoint, Inspection, InspectionResult, Nonconformance, CorrectiveAction

class QualityPlanSerializer(ERPModelSerializer):
    class Meta:
        model = QualityPlan
        fields = "__all__"


class QualityPlanPointSerializer(ERPModelSerializer):
    class Meta:
        model = QualityPlanPoint
        fields = "__all__"


class InspectionSerializer(ERPModelSerializer):
    class Meta:
        model = Inspection
        fields = "__all__"


class InspectionResultSerializer(ERPModelSerializer):
    class Meta:
        model = InspectionResult
        fields = "__all__"


class NonconformanceSerializer(ERPModelSerializer):
    class Meta:
        model = Nonconformance
        fields = "__all__"


class CorrectiveActionSerializer(ERPModelSerializer):
    class Meta:
        model = CorrectiveAction
        fields = "__all__"



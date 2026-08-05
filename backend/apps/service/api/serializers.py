from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.service.models import Case, CaseMessage, CaseApproval, Resolution

class CaseSerializer(ERPModelSerializer):
    class Meta:
        model = Case
        fields = "__all__"


class CaseMessageSerializer(ERPModelSerializer):
    class Meta:
        model = CaseMessage
        fields = "__all__"


class CaseApprovalSerializer(ERPModelSerializer):
    class Meta:
        model = CaseApproval
        fields = "__all__"


class ResolutionSerializer(ERPModelSerializer):
    class Meta:
        model = Resolution
        fields = "__all__"



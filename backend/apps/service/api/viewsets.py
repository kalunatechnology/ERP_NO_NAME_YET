from apps.service.models import Case, CaseMessage, CaseApproval, Resolution
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import CaseSerializer, CaseMessageSerializer, CaseApprovalSerializer, ResolutionSerializer

class CaseViewSet(BaseERPModelViewSet):
    queryset = Case.objects.all()
    serializer_class = CaseSerializer


class CaseMessageViewSet(BaseERPModelViewSet):
    queryset = CaseMessage.objects.all()
    serializer_class = CaseMessageSerializer


class CaseApprovalViewSet(BaseERPModelViewSet):
    queryset = CaseApproval.objects.all()
    serializer_class = CaseApprovalSerializer


class ResolutionViewSet(BaseERPModelViewSet):
    queryset = Resolution.objects.all()
    serializer_class = ResolutionSerializer



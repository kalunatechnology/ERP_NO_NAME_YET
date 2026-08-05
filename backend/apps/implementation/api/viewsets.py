from apps.implementation.models import Release, Phase, PhaseItem, Workflow, WorkflowStage, WorkItem, TestCycle, GTMMilestone
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import ReleaseSerializer, PhaseSerializer, PhaseItemSerializer, WorkflowSerializer, WorkflowStageSerializer, WorkItemSerializer, TestCycleSerializer, GTMMilestoneSerializer

class ReleaseViewSet(BaseERPModelViewSet):
    queryset = Release.objects.all()
    serializer_class = ReleaseSerializer


class PhaseViewSet(BaseERPModelViewSet):
    queryset = Phase.objects.all()
    serializer_class = PhaseSerializer


class PhaseItemViewSet(BaseERPModelViewSet):
    queryset = PhaseItem.objects.all()
    serializer_class = PhaseItemSerializer


class WorkflowViewSet(BaseERPModelViewSet):
    queryset = Workflow.objects.all()
    serializer_class = WorkflowSerializer


class WorkflowStageViewSet(BaseERPModelViewSet):
    queryset = WorkflowStage.objects.all()
    serializer_class = WorkflowStageSerializer


class WorkItemViewSet(BaseERPModelViewSet):
    queryset = WorkItem.objects.all()
    serializer_class = WorkItemSerializer


class TestCycleViewSet(BaseERPModelViewSet):
    queryset = TestCycle.objects.all()
    serializer_class = TestCycleSerializer


class GTMMilestoneViewSet(BaseERPModelViewSet):
    queryset = GTMMilestone.objects.all()
    serializer_class = GTMMilestoneSerializer



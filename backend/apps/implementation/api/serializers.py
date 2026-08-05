from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.implementation.models import Release, Phase, PhaseItem, Workflow, WorkflowStage, WorkItem, TestCycle, GTMMilestone

class ReleaseSerializer(ERPModelSerializer):
    class Meta:
        model = Release
        fields = "__all__"


class PhaseSerializer(ERPModelSerializer):
    class Meta:
        model = Phase
        fields = "__all__"


class PhaseItemSerializer(ERPModelSerializer):
    class Meta:
        model = PhaseItem
        fields = "__all__"


class WorkflowSerializer(ERPModelSerializer):
    class Meta:
        model = Workflow
        fields = "__all__"


class WorkflowStageSerializer(ERPModelSerializer):
    class Meta:
        model = WorkflowStage
        fields = "__all__"


class WorkItemSerializer(ERPModelSerializer):
    class Meta:
        model = WorkItem
        fields = "__all__"


class TestCycleSerializer(ERPModelSerializer):
    class Meta:
        model = TestCycle
        fields = "__all__"


class GTMMilestoneSerializer(ERPModelSerializer):
    class Meta:
        model = GTMMilestone
        fields = "__all__"



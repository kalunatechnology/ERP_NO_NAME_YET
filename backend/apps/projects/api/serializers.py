from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.projects.models import Project, Member, Task, TaskDependency, Milestone, MaterialRequirement, BudgetLine, Timesheet, ChangeRequest, Board, BoardColumn, TaskBoardPosition, HealthRule, HealthSnapshot, Risk, Issue, TechnicalBrief, TechnicalBriefVersion, Requirement, AcceptanceCriteria, ResourceRequest, ResourceRequestLine, ResourceAllocation, ProgressSnapshot, EquipmentUsage, WeightIndicator, WeightComponent

class ProjectSerializer(ERPModelSerializer):
    class Meta:
        model = Project
        fields = "__all__"


class MemberSerializer(ERPModelSerializer):
    class Meta:
        model = Member
        fields = "__all__"


class TaskSerializer(ERPModelSerializer):
    class Meta:
        model = Task
        fields = "__all__"


class TaskDependencySerializer(ERPModelSerializer):
    class Meta:
        model = TaskDependency
        fields = "__all__"


class MilestoneSerializer(ERPModelSerializer):
    class Meta:
        model = Milestone
        fields = "__all__"


class MaterialRequirementSerializer(ERPModelSerializer):
    class Meta:
        model = MaterialRequirement
        fields = "__all__"


class BudgetLineSerializer(ERPModelSerializer):
    class Meta:
        model = BudgetLine
        fields = "__all__"


class TimesheetSerializer(ERPModelSerializer):
    class Meta:
        model = Timesheet
        fields = "__all__"


class ChangeRequestSerializer(ERPModelSerializer):
    class Meta:
        model = ChangeRequest
        fields = "__all__"


class BoardSerializer(ERPModelSerializer):
    class Meta:
        model = Board
        fields = "__all__"


class BoardColumnSerializer(ERPModelSerializer):
    class Meta:
        model = BoardColumn
        fields = "__all__"


class TaskBoardPositionSerializer(ERPModelSerializer):
    class Meta:
        model = TaskBoardPosition
        fields = "__all__"


class HealthRuleSerializer(ERPModelSerializer):
    class Meta:
        model = HealthRule
        fields = "__all__"


class HealthSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = HealthSnapshot
        fields = "__all__"


class RiskSerializer(ERPModelSerializer):
    class Meta:
        model = Risk
        fields = "__all__"


class IssueSerializer(ERPModelSerializer):
    class Meta:
        model = Issue
        fields = "__all__"


class TechnicalBriefSerializer(ERPModelSerializer):
    class Meta:
        model = TechnicalBrief
        fields = "__all__"


class TechnicalBriefVersionSerializer(ERPModelSerializer):
    class Meta:
        model = TechnicalBriefVersion
        fields = "__all__"


class RequirementSerializer(ERPModelSerializer):
    class Meta:
        model = Requirement
        fields = "__all__"


class AcceptanceCriteriaSerializer(ERPModelSerializer):
    class Meta:
        model = AcceptanceCriteria
        fields = "__all__"


class ResourceRequestSerializer(ERPModelSerializer):
    class Meta:
        model = ResourceRequest
        fields = "__all__"


class ResourceRequestLineSerializer(ERPModelSerializer):
    class Meta:
        model = ResourceRequestLine
        fields = "__all__"


class ResourceAllocationSerializer(ERPModelSerializer):
    class Meta:
        model = ResourceAllocation
        fields = "__all__"


class ProgressSnapshotSerializer(ERPModelSerializer):
    class Meta:
        model = ProgressSnapshot
        fields = "__all__"


class EquipmentUsageSerializer(ERPModelSerializer):
    class Meta:
        model = EquipmentUsage
        fields = "__all__"


class WeightIndicatorSerializer(ERPModelSerializer):
    class Meta:
        model = WeightIndicator
        fields = "__all__"


class WeightComponentSerializer(ERPModelSerializer):
    class Meta:
        model = WeightComponent
        fields = "__all__"



from apps.projects.models import Project, Member, Task, TaskDependency, Milestone, MaterialRequirement, BudgetLine, Timesheet, ChangeRequest, Board, BoardColumn, TaskBoardPosition, HealthRule, HealthSnapshot, Risk, Issue, TechnicalBrief, TechnicalBriefVersion, Requirement, AcceptanceCriteria, ResourceRequest, ResourceRequestLine, ResourceAllocation, ProgressSnapshot, EquipmentUsage, WeightIndicator, WeightComponent
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import ProjectSerializer, MemberSerializer, TaskSerializer, TaskDependencySerializer, MilestoneSerializer, MaterialRequirementSerializer, BudgetLineSerializer, TimesheetSerializer, ChangeRequestSerializer, BoardSerializer, BoardColumnSerializer, TaskBoardPositionSerializer, HealthRuleSerializer, HealthSnapshotSerializer, RiskSerializer, IssueSerializer, TechnicalBriefSerializer, TechnicalBriefVersionSerializer, RequirementSerializer, AcceptanceCriteriaSerializer, ResourceRequestSerializer, ResourceRequestLineSerializer, ResourceAllocationSerializer, ProgressSnapshotSerializer, EquipmentUsageSerializer, WeightIndicatorSerializer, WeightComponentSerializer

class ProjectViewSet(BaseERPModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer


class MemberViewSet(BaseERPModelViewSet):
    queryset = Member.objects.all()
    serializer_class = MemberSerializer


class TaskViewSet(BaseERPModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer


class TaskDependencyViewSet(BaseERPModelViewSet):
    queryset = TaskDependency.objects.all()
    serializer_class = TaskDependencySerializer


class MilestoneViewSet(BaseERPModelViewSet):
    queryset = Milestone.objects.all()
    serializer_class = MilestoneSerializer


class MaterialRequirementViewSet(BaseERPModelViewSet):
    queryset = MaterialRequirement.objects.all()
    serializer_class = MaterialRequirementSerializer


class BudgetLineViewSet(BaseERPModelViewSet):
    queryset = BudgetLine.objects.all()
    serializer_class = BudgetLineSerializer


class TimesheetViewSet(BaseERPModelViewSet):
    queryset = Timesheet.objects.all()
    serializer_class = TimesheetSerializer


class ChangeRequestViewSet(BaseERPModelViewSet):
    queryset = ChangeRequest.objects.all()
    serializer_class = ChangeRequestSerializer


class BoardViewSet(BaseERPModelViewSet):
    queryset = Board.objects.all()
    serializer_class = BoardSerializer


class BoardColumnViewSet(BaseERPModelViewSet):
    queryset = BoardColumn.objects.all()
    serializer_class = BoardColumnSerializer


class TaskBoardPositionViewSet(BaseERPModelViewSet):
    queryset = TaskBoardPosition.objects.all()
    serializer_class = TaskBoardPositionSerializer


class HealthRuleViewSet(BaseERPModelViewSet):
    queryset = HealthRule.objects.all()
    serializer_class = HealthRuleSerializer


class HealthSnapshotViewSet(BaseERPModelViewSet):
    queryset = HealthSnapshot.objects.all()
    serializer_class = HealthSnapshotSerializer


class RiskViewSet(BaseERPModelViewSet):
    queryset = Risk.objects.all()
    serializer_class = RiskSerializer


class IssueViewSet(BaseERPModelViewSet):
    queryset = Issue.objects.all()
    serializer_class = IssueSerializer


class TechnicalBriefViewSet(BaseERPModelViewSet):
    queryset = TechnicalBrief.objects.all()
    serializer_class = TechnicalBriefSerializer


class TechnicalBriefVersionViewSet(BaseERPModelViewSet):
    queryset = TechnicalBriefVersion.objects.all()
    serializer_class = TechnicalBriefVersionSerializer


class RequirementViewSet(BaseERPModelViewSet):
    queryset = Requirement.objects.all()
    serializer_class = RequirementSerializer


class AcceptanceCriteriaViewSet(BaseERPModelViewSet):
    queryset = AcceptanceCriteria.objects.all()
    serializer_class = AcceptanceCriteriaSerializer


class ResourceRequestViewSet(BaseERPModelViewSet):
    queryset = ResourceRequest.objects.all()
    serializer_class = ResourceRequestSerializer


class ResourceRequestLineViewSet(BaseERPModelViewSet):
    queryset = ResourceRequestLine.objects.all()
    serializer_class = ResourceRequestLineSerializer


class ResourceAllocationViewSet(BaseERPModelViewSet):
    queryset = ResourceAllocation.objects.all()
    serializer_class = ResourceAllocationSerializer


class ProgressSnapshotViewSet(BaseERPModelViewSet):
    queryset = ProgressSnapshot.objects.all()
    serializer_class = ProgressSnapshotSerializer


class EquipmentUsageViewSet(BaseERPModelViewSet):
    queryset = EquipmentUsage.objects.all()
    serializer_class = EquipmentUsageSerializer


class WeightIndicatorViewSet(BaseERPModelViewSet):
    queryset = WeightIndicator.objects.all()
    serializer_class = WeightIndicatorSerializer


class WeightComponentViewSet(BaseERPModelViewSet):
    queryset = WeightComponent.objects.all()
    serializer_class = WeightComponentSerializer



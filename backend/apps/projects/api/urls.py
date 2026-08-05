from rest_framework.routers import DefaultRouter
from .viewsets import ProjectViewSet, MemberViewSet, TaskViewSet, TaskDependencyViewSet, MilestoneViewSet, MaterialRequirementViewSet, BudgetLineViewSet, TimesheetViewSet, ChangeRequestViewSet, BoardViewSet, BoardColumnViewSet, TaskBoardPositionViewSet, HealthRuleViewSet, HealthSnapshotViewSet, RiskViewSet, IssueViewSet, TechnicalBriefViewSet, TechnicalBriefVersionViewSet, RequirementViewSet, AcceptanceCriteriaViewSet, ResourceRequestViewSet, ResourceRequestLineViewSet, ResourceAllocationViewSet, ProgressSnapshotViewSet, EquipmentUsageViewSet, WeightIndicatorViewSet, WeightComponentViewSet

app_name = "projects"
router = DefaultRouter()
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"members", MemberViewSet, basename="member")
router.register(r"tasks", TaskViewSet, basename="task")
router.register(r"task-dependencies", TaskDependencyViewSet, basename="task-dependency")
router.register(r"milestones", MilestoneViewSet, basename="milestone")
router.register(r"material-requirements", MaterialRequirementViewSet, basename="material-requirement")
router.register(r"budget-lines", BudgetLineViewSet, basename="budget-line")
router.register(r"timesheets", TimesheetViewSet, basename="timesheet")
router.register(r"change-requests", ChangeRequestViewSet, basename="change-request")
router.register(r"boards", BoardViewSet, basename="board")
router.register(r"board-columns", BoardColumnViewSet, basename="board-column")
router.register(r"task-board-positions", TaskBoardPositionViewSet, basename="task-board-position")
router.register(r"health-rules", HealthRuleViewSet, basename="health-rule")
router.register(r"health-snapshots", HealthSnapshotViewSet, basename="health-snapshot")
router.register(r"risks", RiskViewSet, basename="risk")
router.register(r"issues", IssueViewSet, basename="issue")
router.register(r"technical-briefs", TechnicalBriefViewSet, basename="technical-brief")
router.register(r"technical-brief-versions", TechnicalBriefVersionViewSet, basename="technical-brief-version")
router.register(r"requirements", RequirementViewSet, basename="requirement")
router.register(r"acceptance-criterias", AcceptanceCriteriaViewSet, basename="acceptance-criteria")
router.register(r"resource-requests", ResourceRequestViewSet, basename="resource-request")
router.register(r"resource-request-lines", ResourceRequestLineViewSet, basename="resource-request-line")
router.register(r"resource-allocations", ResourceAllocationViewSet, basename="resource-allocation")
router.register(r"progress-snapshots", ProgressSnapshotViewSet, basename="progress-snapshot")
router.register(r"equipment-usages", EquipmentUsageViewSet, basename="equipment-usage")
router.register(r"weight-indicators", WeightIndicatorViewSet, basename="weight-indicator")
router.register(r"weight-components", WeightComponentViewSet, basename="weight-component")

urlpatterns = router.urls

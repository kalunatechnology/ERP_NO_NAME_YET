from rest_framework.routers import DefaultRouter
from .viewsets import (
    ProjectViewSet,
    ProjectControlItemViewSet,
    ProjectExpenseViewSet,
    ProjectLifecycleEventViewSet,
    ProjectReadinessCheckViewSet,
    MemberViewSet,
    TaskViewSet,
    TaskDependencyViewSet,
    MilestoneViewSet,
    MaterialRequirementViewSet,
    BudgetLineViewSet,
    TimesheetViewSet,
    ChangeRequestViewSet,
    ChangeRequestMaterialViewSet,
    BoardViewSet,
    BoardColumnViewSet,
    TaskBoardPositionViewSet,
    HealthRuleViewSet,
    HealthSnapshotViewSet,
    RiskViewSet,
    IssueViewSet,
    IssueActionViewSet,
    ProjectDispatchViewSet,
    TechnicalBriefViewSet,
    TechnicalBriefVersionViewSet,
    RequirementViewSet,
    AcceptanceCriteriaViewSet,
    ResourceRequestViewSet,
    ResourceRequestLineViewSet,
    ResourceAllocationViewSet,
    ProgressSnapshotViewSet,
    EquipmentUsageViewSet,
    WeightIndicatorViewSet,
    WeightComponentViewSet,
    ProjectWeeklyProgressViewSet,
    ProjectMainTaskViewSet,
    TaskAssignmentViewSet,
    ProjectWeeklyTaskViewSet,
    ProjectDailyTaskViewSet,
    TaskTransferRequestViewSet,
    TaskActivityLogViewSet,
)

app_name = "projects"
router = DefaultRouter()
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"control-items", ProjectControlItemViewSet, basename="project-control-item")
router.register(r"expenses", ProjectExpenseViewSet, basename="project-expense")
router.register(r"lifecycle-events", ProjectLifecycleEventViewSet, basename="project-lifecycle-event")
router.register(r"readiness-checks", ProjectReadinessCheckViewSet, basename="project-readiness-check")
router.register(r"members", MemberViewSet, basename="member")
router.register(r"tasks", TaskViewSet, basename="task")
router.register(r"task-dependencies", TaskDependencyViewSet, basename="task-dependency")
router.register(r"milestones", MilestoneViewSet, basename="milestone")
router.register(r"material-requirements", MaterialRequirementViewSet, basename="material-requirement")
router.register(r"budget-lines", BudgetLineViewSet, basename="budget-line")
router.register(r"timesheets", TimesheetViewSet, basename="timesheet")
router.register(r"change-requests", ChangeRequestViewSet, basename="change-request")
router.register(r"change-request-materials", ChangeRequestMaterialViewSet, basename="change-request-material")
router.register(r"boards", BoardViewSet, basename="board")
router.register(r"board-columns", BoardColumnViewSet, basename="board-column")
router.register(r"task-board-positions", TaskBoardPositionViewSet, basename="task-board-position")
router.register(r"health-rules", HealthRuleViewSet, basename="health-rule")
router.register(r"health-snapshots", HealthSnapshotViewSet, basename="health-snapshot")
router.register(r"risks", RiskViewSet, basename="risk")
router.register(r"issues", IssueViewSet, basename="issue")
router.register(r"issue-actions", IssueActionViewSet, basename="issue-action")
router.register(r"dispatches", ProjectDispatchViewSet, basename="project-dispatch")
router.register(r"technical-briefs", TechnicalBriefViewSet, basename="technical-brief")
router.register(r"technical-brief-versions", TechnicalBriefVersionViewSet, basename="technical-brief-version")
router.register(r"requirements", RequirementViewSet, basename="requirement")
router.register(r"acceptance-criterias", AcceptanceCriteriaViewSet, basename="acceptance-criteria")
router.register(r"resource-requests", ResourceRequestViewSet, basename="resource-request")
router.register(r"resource-request-lines", ResourceRequestLineViewSet, basename="resource-request-line")
router.register(r"resource-allocations", ResourceAllocationViewSet, basename="resource-allocation")
router.register(r"progress-snapshots", ProgressSnapshotViewSet, basename="progress-snapshot")
router.register(r"weekly-progress", ProjectWeeklyProgressViewSet, basename="weekly-progress")
router.register(r"equipment-usages", EquipmentUsageViewSet, basename="equipment-usage")
router.register(r"weight-indicators", WeightIndicatorViewSet, basename="weight-indicator")
router.register(r"weight-components", WeightComponentViewSet, basename="weight-component")
router.register(r"main-tasks", ProjectMainTaskViewSet, basename="main-task")
router.register(r"task-assignments", TaskAssignmentViewSet, basename="task-assignment")
router.register(r"weekly-tasks", ProjectWeeklyTaskViewSet, basename="weekly-task")
router.register(r"daily-tasks", ProjectDailyTaskViewSet, basename="daily-task")
router.register(r"task-transfers", TaskTransferRequestViewSet, basename="task-transfer")
router.register(r"task-activity-logs", TaskActivityLogViewSet, basename="task-activity-log")


urlpatterns = router.urls


from rest_framework.routers import DefaultRouter
from .viewsets import ReleaseViewSet, PhaseViewSet, PhaseItemViewSet, WorkflowViewSet, WorkflowStageViewSet, WorkItemViewSet, TestCycleViewSet, GTMMilestoneViewSet

app_name = "implementation"
router = DefaultRouter()
router.register(r"releases", ReleaseViewSet, basename="release")
router.register(r"phases", PhaseViewSet, basename="phase")
router.register(r"phase-items", PhaseItemViewSet, basename="phase-item")
router.register(r"workflows", WorkflowViewSet, basename="workflow")
router.register(r"workflow-stages", WorkflowStageViewSet, basename="workflow-stage")
router.register(r"work-items", WorkItemViewSet, basename="work-item")
router.register(r"test-cycles", TestCycleViewSet, basename="test-cycle")
router.register(r"gtm-milestones", GTMMilestoneViewSet, basename="gtm-milestone")

urlpatterns = router.urls

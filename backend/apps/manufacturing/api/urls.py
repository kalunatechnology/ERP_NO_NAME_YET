from rest_framework.routers import DefaultRouter
from .viewsets import BOMViewSet, BOMVersionViewSet, BOMLineViewSet, RoutingViewSet, RoutingOperationViewSet, ProductionOrderViewSet, ProductionMaterialViewSet, WorkOrderViewSet, LaborLogViewSet, MachineLogViewSet, ProductionOutputViewSet, ScrapViewSet, CostLedgerEntryViewSet

app_name = "manufacturing"
router = DefaultRouter()
router.register(r"boms", BOMViewSet, basename="bom")
router.register(r"bom-versions", BOMVersionViewSet, basename="bom-version")
router.register(r"bom-lines", BOMLineViewSet, basename="bom-line")
router.register(r"routings", RoutingViewSet, basename="routing")
router.register(r"routing-operations", RoutingOperationViewSet, basename="routing-operation")
router.register(r"production-orders", ProductionOrderViewSet, basename="production-order")
router.register(r"production-materials", ProductionMaterialViewSet, basename="production-material")
router.register(r"work-orders", WorkOrderViewSet, basename="work-order")
router.register(r"labor-logs", LaborLogViewSet, basename="labor-log")
router.register(r"machine-logs", MachineLogViewSet, basename="machine-log")
router.register(r"production-outputs", ProductionOutputViewSet, basename="production-output")
router.register(r"scraps", ScrapViewSet, basename="scrap")
router.register(r"cost-ledger-entries", CostLedgerEntryViewSet, basename="cost-ledger-entry")

urlpatterns = router.urls

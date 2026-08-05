from rest_framework.routers import DefaultRouter
from .viewsets import CategoryViewSet, AssetViewSet, BookViewSet, DepreciationLineViewSet, MaintenanceViewSet, DisposalViewSet

app_name = "assets"
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"assets", AssetViewSet, basename="asset")
router.register(r"books", BookViewSet, basename="book")
router.register(r"depreciation-lines", DepreciationLineViewSet, basename="depreciation-line")
router.register(r"maintenances", MaintenanceViewSet, basename="maintenance")
router.register(r"disposals", DisposalViewSet, basename="disposal")

urlpatterns = router.urls

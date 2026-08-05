from apps.assets.models import Category, Asset, Book, DepreciationLine, Maintenance, Disposal
from apps.api_common.viewsets import BaseERPModelViewSet, ReadOnlyERPModelViewSet
from .serializers import CategorySerializer, AssetSerializer, BookSerializer, DepreciationLineSerializer, MaintenanceSerializer, DisposalSerializer

class CategoryViewSet(BaseERPModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class AssetViewSet(BaseERPModelViewSet):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer


class BookViewSet(BaseERPModelViewSet):
    queryset = Book.objects.all()
    serializer_class = BookSerializer


class DepreciationLineViewSet(BaseERPModelViewSet):
    queryset = DepreciationLine.objects.all()
    serializer_class = DepreciationLineSerializer


class MaintenanceViewSet(BaseERPModelViewSet):
    queryset = Maintenance.objects.all()
    serializer_class = MaintenanceSerializer


class DisposalViewSet(BaseERPModelViewSet):
    queryset = Disposal.objects.all()
    serializer_class = DisposalSerializer



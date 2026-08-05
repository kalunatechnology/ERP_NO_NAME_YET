from rest_framework import serializers
from apps.api_common.serializers import ERPModelSerializer
from apps.assets.models import Category, Asset, Book, DepreciationLine, Maintenance, Disposal

class CategorySerializer(ERPModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"


class AssetSerializer(ERPModelSerializer):
    class Meta:
        model = Asset
        fields = "__all__"


class BookSerializer(ERPModelSerializer):
    class Meta:
        model = Book
        fields = "__all__"


class DepreciationLineSerializer(ERPModelSerializer):
    class Meta:
        model = DepreciationLine
        fields = "__all__"


class MaintenanceSerializer(ERPModelSerializer):
    class Meta:
        model = Maintenance
        fields = "__all__"


class DisposalSerializer(ERPModelSerializer):
    class Meta:
        model = Disposal
        fields = "__all__"



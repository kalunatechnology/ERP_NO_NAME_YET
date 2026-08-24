from __future__ import annotations

from django.db import models, transaction
from django.db.models import ProtectedError, RestrictedError
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .audit import create_audit_event, snapshot
from .filters import ERPQueryFilterBackend
from .pagination import ERPPageNumberPagination
from .permissions import ERPAccessPermission, IsReadOnlyOrERPAccess
from .scoping import find_scope_path, scope_queryset


class BaseERPModelViewSet(viewsets.ModelViewSet):
    permission_classes = [ERPAccessPermission]
    pagination_class = ERPPageNumberPagination
    filter_backends = [ERPQueryFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = self._optimize_queryset(queryset)
        return scope_queryset(
            queryset,
            self.request.user,
            self.request.headers.get("X-Company-ID"),
        )

    def get_search_fields(self):
        return [
            field.name
            for field in self.get_queryset().model._meta.concrete_fields
            if isinstance(field, (models.CharField, models.TextField, models.EmailField))
        ]

    @property
    def search_fields(self):
        return self.get_search_fields()

    @property
    def ordering_fields(self):
        return [field.name for field in self.queryset.model._meta.concrete_fields]

    @property
    def ordering(self):
        names = {field.name for field in self.queryset.model._meta.concrete_fields}
        if "created_at" in names:
            return ("-created_at",)
        if "updated_at" in names:
            return ("-updated_at",)
        return ("-id",) if "id" in names else None

    @staticmethod
    def _optimize_queryset(queryset):
        select_fields = []
        for field in queryset.model._meta.concrete_fields:
            if isinstance(field, (models.ForeignKey, models.OneToOneField)):
                select_fields.append(field.name)
        if select_fields:
            queryset = queryset.select_related(*select_fields)
        return queryset

    def perform_create(self, serializer):
        model = serializer.Meta.model
        field_names = {field.name for field in model._meta.concrete_fields}
        kwargs = {}
        tenant_id = getattr(self.request.user, "tenant_id", None)
        company_id = self.request.headers.get("X-Company-ID")

        if tenant_id and "tenant" in field_names and "tenant" not in serializer.validated_data:
            kwargs["tenant_id"] = tenant_id
        if company_id and "company" in field_names and "company" not in serializer.validated_data:
            kwargs["company_id"] = company_id
        if "created_by" in field_names and "created_by" not in serializer.validated_data:
            kwargs["created_by"] = self.request.user

        instance = serializer.save(**kwargs)
        create_audit_event(request=self.request, instance=instance, event_type="CREATE", after=snapshot(instance))

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        model = serializer.Meta.model
        field_names = {field.name for field in model._meta.concrete_fields}
        kwargs = {"updated_by": self.request.user} if "updated_by" in field_names else {}
        instance = serializer.save(**kwargs)
        create_audit_event(
            request=self.request,
            instance=instance,
            event_type="UPDATE",
            before=before,
            after=snapshot(instance),
        )

    def perform_destroy(self, instance):
        before = snapshot(instance)
        try:
            instance.delete()
            create_audit_event(request=self.request, instance=instance, event_type="DELETE", before=before)
        except (ProtectedError, RestrictedError) as exc:
            protected_objects = getattr(exc, "protected_objects", None) or getattr(exc, "restricted_objects", [])
            protected_classes = list({obj.__class__.__name__ for obj in protected_objects})
            raise ValidationError(
                f"Tidak dapat menghapus {instance.__class__.__name__} karena masih memiliki relasi aktif di: {', '.join(protected_classes)}."
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
            return Response(
                {"success": True, "message": "Data berhasil dihapus."},
                status=status.HTTP_200_OK,
            )
        except ValidationError as e:
            return Response(
                {
                    "success": False,
                    "error": "VALIDATION_ERROR",
                    "detail": str(e.detail[0]) if isinstance(e.detail, list) else str(e.detail),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        if not isinstance(request.data, list):
            return Response({"detail": "Payload harus berupa list."}, status=status.HTTP_400_BAD_REQUEST)
        instances = []
        with transaction.atomic():
            for item in request.data:
                serializer = self.get_serializer(data=item)
                serializer.is_valid(raise_exception=True)
                model = serializer.Meta.model
                field_names = {field.name for field in model._meta.concrete_fields}
                kwargs = {}
                tenant_id = getattr(request.user, "tenant_id", None)
                company_id = request.headers.get("X-Company-ID")
                if tenant_id and "tenant" in field_names and "tenant" not in serializer.validated_data:
                    kwargs["tenant_id"] = tenant_id
                if company_id and "company" in field_names and "company" not in serializer.validated_data:
                    kwargs["company_id"] = company_id
                if "created_by" in field_names and "created_by" not in serializer.validated_data:
                    kwargs["created_by"] = request.user
                instance = serializer.save(**kwargs)
                create_audit_event(request=request, instance=instance, event_type="CREATE", after=snapshot(instance))
                instances.append(instance)
        return Response(self.get_serializer(instances, many=True).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["patch"], url_path="bulk-update")
    def bulk_update(self, request):
        if not isinstance(request.data, list):
            return Response({"detail": "Payload harus berupa list."}, status=status.HTTP_400_BAD_REQUEST)
        results = []
        with transaction.atomic():
            for item in request.data:
                object_id = item.get("id")
                if not object_id:
                    return Response({"detail": "Setiap item wajib memiliki id."}, status=status.HTTP_400_BAD_REQUEST)
                instance = self.get_queryset().get(pk=object_id)
                serializer = self.get_serializer(instance, data=item, partial=True)
                serializer.is_valid(raise_exception=True)
                before = snapshot(instance)
                saved = serializer.save()
                create_audit_event(request=request, instance=saved, event_type="UPDATE", before=before, after=snapshot(saved))
                results.append(saved)
        return Response(self.get_serializer(results, many=True).data)

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        ids = request.data.get("ids", []) if isinstance(request.data, dict) else []
        if not ids:
            return Response({"detail": "ids wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        queryset = self.get_queryset().filter(pk__in=ids)
        deleted = 0
        with transaction.atomic():
            for instance in queryset:
                self.perform_destroy(instance)
                deleted += 1
        return Response({"deleted": deleted})

    @action(detail=False, methods=["get"], url_path="metadata")
    def metadata(self, request):
        model = self.get_queryset().model
        fields = []
        for field in model._meta.concrete_fields:
            fields.append(
                {
                    "name": field.name,
                    "type": field.get_internal_type(),
                    "required": not field.blank and not field.null and not field.primary_key,
                    "primary_key": field.primary_key,
                    "unique": field.unique,
                    "related_model": field.related_model._meta.label if field.is_relation and field.related_model else None,
                }
            )
        return Response(
            {
                "model": model._meta.label,
                "table": model._meta.db_table,
                "tenant_scope_path": find_scope_path(model, "tenant"),
                "company_scope_path": find_scope_path(model, "company"),
                "fields": fields,
            }
        )


class ReadOnlyERPModelViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsReadOnlyOrERPAccess]
    pagination_class = ERPPageNumberPagination
    filter_backends = [ERPQueryFilterBackend, filters.SearchFilter, filters.OrderingFilter]

    def get_queryset(self):
        return scope_queryset(
            super().get_queryset(),
            self.request.user,
            self.request.headers.get("X-Company-ID"),
        )

    @property
    def search_fields(self):
        return [
            field.name
            for field in self.queryset.model._meta.concrete_fields
            if isinstance(field, (models.CharField, models.TextField, models.EmailField))
        ]

    @property
    def ordering_fields(self):
        return [field.name for field in self.queryset.model._meta.concrete_fields]


BaseViewSet = BaseERPModelViewSet

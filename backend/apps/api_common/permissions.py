from __future__ import annotations

from django.conf import settings
from rest_framework.permissions import BasePermission, SAFE_METHODS


ACTION_MAP = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
}


class ERPAccessPermission(BasePermission):
    """IAM-backed permission with a bootstrap-friendly feature flag.

    Set ERP_ENFORCE_IAM=True after role-permission seeds are installed.
    Permission codes accepted:
      app_label.model_name.action
      app_label.resource.action
      module_code.resource_name.action_name
    """

    message = "Anda tidak memiliki izin untuk tindakan ini."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True
        if not getattr(settings, "ERP_ENFORCE_IAM", False):
            return True

        queryset = getattr(view, "queryset", None)
        model = getattr(queryset, "model", None)
        if model is None and hasattr(view, "get_queryset"):
            try:
                model = view.get_queryset().model
            except Exception:
                model = None
        if model is None:
            return True

        action = ACTION_MAP.get(getattr(view, "action", ""), request.method.lower())
        app_label = model._meta.app_label
        model_name = model._meta.model_name
        resource = model._meta.verbose_name_plural.replace(" ", "_").lower()
        candidates = {
            f"{app_label}.{model_name}.{action}",
            f"{app_label}.{resource}.{action}",
        }

        try:
            from apps.accounts.models import RolePermission, UserRole

            role_ids = UserRole.objects.filter(user=request.user).values_list("role_id", flat=True)
            return RolePermission.objects.filter(
                role_id__in=role_ids,
                allowed=True,
                permission__permission_code__in=candidates,
            ).exists()
        except Exception:
            return False

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


class IsReadOnlyOrERPAccess(ERPAccessPermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return super().has_permission(request, view)

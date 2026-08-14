from __future__ import annotations

from django.conf import settings
from django.db import models
from rest_framework import serializers

from .scoping import get_scope_value


SYSTEM_READ_ONLY_FIELDS = {
    "id",
    "created_at",
    "updated_at",
    "last_login",
    "date_joined",
    "posted_by",
    "approved_by",
    "created_by",
    "updated_by",
    "occurred_at",
}


class ERPModelSerializer(serializers.ModelSerializer):
    """Shared serializer with tenant/company relation validation."""

    def get_fields(self):
        fields = super().get_fields()
        for name in SYSTEM_READ_ONLY_FIELDS:
            if name in fields:
                fields[name].read_only = True

        if not getattr(settings, "ERP_ENFORCE_FIELD_PERMISSIONS", False):
            return fields

        request = self.context.get("request")
        if not request or not request.user.is_authenticated or request.user.is_superuser:
            return fields

        try:
            from apps.accounts.models import FieldPermission, UserRole

            role_ids = UserRole.objects.filter(user=request.user).values_list("role_id", flat=True)
            model = self.Meta.model
            rules = FieldPermission.objects.filter(
                role_id__in=role_ids,
                module_code=model._meta.app_label,
                entity_name__in={model._meta.model_name, model.__name__},
            )
            rule_map = {rule.field_name: rule for rule in rules}
            for name, rule in rule_map.items():
                if name not in fields:
                    continue
                if not rule.can_view:
                    fields.pop(name, None)
                elif not rule.can_edit:
                    fields[name].read_only = True
        except Exception:
            pass
        return fields

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or request.user.is_superuser:
            return attrs

        user_tenant_id = getattr(request.user, "tenant_id", None)
        selected_company_id = request.headers.get("X-Company-ID")
        errors = {}

        for field in self.Meta.model._meta.concrete_fields:
            if not isinstance(field, (models.ForeignKey, models.OneToOneField)):
                continue
            related = attrs.get(field.name)
            if related is None:
                continue
            related_tenant_id = get_scope_value(related, "tenant")
            related_company_id = get_scope_value(related, "company")
            if user_tenant_id and related_tenant_id and str(related_tenant_id) != str(user_tenant_id):
                errors[field.name] = "Relasi berasal dari tenant yang berbeda."
            if selected_company_id and related_company_id and str(related_company_id) != str(selected_company_id):
                errors[field.name] = "Relasi berasal dari company yang berbeda."

        if errors:
            raise serializers.ValidationError(errors)
        return attrs
